"""
Dataset upload router — Phase 3.

Endpoints
---------
POST /api/v1/projects/{project_id}/datasets/upload
    Accept a multipart file upload. Validate → upload to Supabase Storage
    → create dataset record → return metadata.

GET  /api/v1/projects/{project_id}/datasets
    List datasets for a project.

GET  /api/v1/projects/{project_id}/datasets/{dataset_id}
    Retrieve a single dataset record.

Design rules
------------
- Read entire file into memory once (stream from FastAPI → bytes).
  At 50 MB max this stays well within the 312 MB budget.
- Write to /tmp/ only for operations that need a filesystem path.
  Always clean up in a finally block.
- All DB operations go through the repository layer.
- No LLM calls in this phase.
"""

from __future__ import annotations
import uuid
import tempfile
import os
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, File, Form, HTTPException, UploadFile, status
from fastapi.responses import JSONResponse

from app.core.config import get_settings
from app.core.logging import get_logger
from app.services.file_validator import validate_upload, ALLOWED_EXTENSIONS
from app.storage.supabase import upload_file, build_storage_path, delete_file
from app.database.repositories.datasets import (
    create_dataset,
    get_dataset,
    list_datasets,
    update_dataset_status,
    get_project,
)
from app.models.dataset import DatasetCreate

logger = get_logger(__name__)

router = APIRouter(prefix="/api/v1/projects", tags=["Datasets"])

# ── Placeholder user ID until auth (Phase 6) is implemented ────────
# Will be replaced by extracting the real user from the JWT token.
_ANON_USER_ID = "00000000-0000-0000-0000-000000000000"


# ══════════════════════════════════════════════════════════════════
# POST  /api/v1/projects/{project_id}/datasets/upload
# ══════════════════════════════════════════════════════════════════

@router.post(
    "/{project_id}/datasets/upload",
    summary="Upload a dataset file",
    status_code=status.HTTP_201_CREATED,
)
async def upload_dataset(
    project_id: str,
    file: Annotated[UploadFile, File(description="CSV, JSON, or Parquet file to upload")],
    task_type: Annotated[
        str,
        Form(description="ML task type: GENERAL | CLASSIFICATION | REGRESSION | CLUSTERING | LLM_FINETUNING"),
    ] = "GENERAL",
    target_column: Annotated[
        str | None,
        Form(description="Target column name for supervised learning tasks"),
    ] = None,
):
    """
    Upload a dataset file (CSV, JSON, or Parquet).

    **Limits (Render free tier)**
    - Max file size: 50 MB
    - Max rows: 500,000
    - Max columns: 150

    **Flow**
    1. Validate: extension → size → structure → row/column counts
    2. Upload to Supabase Storage (permanent)
    3. Create `datasets` record (status = UPLOADED)
    4. Return dataset metadata

    The `/tmp/` filesystem is NOT used — bytes go directly to Supabase Storage.
    """
    settings = get_settings()

    # ── 1. Guard: project must exist ──────────────────────────────
    project = get_project(project_id)
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "project_not_found", "message": f"Project '{project_id}' not found."},
        )

    # ── 2. Read file bytes (streaming with size guard) ────────────
    # We stream in 1 MB chunks and abort early if over the limit.
    # This avoids buffering a 500 MB file before we check its size.
    max_bytes = settings.max_upload_size_bytes
    chunks: list[bytes] = []
    total_read = 0

    while True:
        chunk = await file.read(1_048_576)  # 1 MB chunks
        if not chunk:
            break
        total_read += len(chunk)
        if total_read > max_bytes:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail={
                    "error": "file_too_large",
                    "message": (
                        f"File exceeds the {settings.max_upload_size_mb} MB limit. "
                        "This limit ensures stable processing on our free-tier infrastructure."
                    ),
                    "max_mb": settings.max_upload_size_mb,
                },
            )
        chunks.append(chunk)

    file_bytes = b"".join(chunks)
    filename = file.filename or "upload"
    content_type = file.content_type or "application/octet-stream"

    # ── 3. Validate ───────────────────────────────────────────────
    meta = validate_upload(filename, content_type, file_bytes)

    # ── 4. Create DB record (status = PENDING_UPLOAD) ─────────────
    dataset_id = str(uuid.uuid4())
    payload = DatasetCreate(
        original_filename=meta.original_filename,
        file_type=meta.extension,
        file_size=meta.file_size,
        task_type=task_type,
        target_column=target_column or None,
    )

    # Insert with a predetermined ID by overriding the dict
    # (Supabase auto-generates UUID if not provided, so we let it)
    record = create_dataset(project_id, payload)
    dataset_id = record["id"]

    # ── 5. Build storage path and upload ─────────────────────────
    storage_path = build_storage_path(
        user_id=_ANON_USER_ID,
        project_id=project_id,
        dataset_id=dataset_id,
        subfolder="original",
        filename=f"dataset.{meta.extension}",
    )

    try:
        upload_file(
            storage_path=storage_path,
            file_bytes=file_bytes,
            content_type=content_type,
        )
    except RuntimeError as exc:
        # Storage upload failed — mark dataset as FAILED and surface error
        update_dataset_status(dataset_id, "FAILED")
        logger.error(f"Storage upload failed for dataset {dataset_id}: {exc}")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail={
                "error": "storage_upload_failed",
                "message": "Failed to upload file to storage. Please try again.",
            },
        )

    # ── 6. Update DB: status = UPLOADED, set storage_path ─────────
    updated = update_dataset_status(
        dataset_id=dataset_id,
        status="UPLOADED",
        extra={
            "storage_path": storage_path,
            "row_count": meta.estimated_row_count,
            "column_count": meta.column_count,
        },
    )

    logger.info(
        f"Dataset uploaded successfully: id={dataset_id} "
        f"file={meta.original_filename!r} size={meta.file_size:,}B"
    )

    return JSONResponse(
        status_code=status.HTTP_201_CREATED,
        content={
            "dataset": updated,
            "limits": {
                "max_upload_mb": settings.max_upload_size_mb,
                "max_rows": settings.max_rows,
                "max_columns": settings.max_columns,
            },
            "message": (
                f"Dataset '{meta.original_filename}' uploaded successfully. "
                f"Detected {meta.column_count} columns, ~{meta.estimated_row_count:,} rows."
                if meta.column_count and meta.estimated_row_count
                else f"Dataset '{meta.original_filename}' uploaded successfully."
            ),
        },
    )


# ══════════════════════════════════════════════════════════════════
# GET  /api/v1/projects/{project_id}/datasets
# ══════════════════════════════════════════════════════════════════

@router.get(
    "/{project_id}/datasets",
    summary="List datasets for a project",
)
def list_project_datasets(project_id: str):
    """Return all datasets for the given project, newest first."""
    project = get_project(project_id)
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "project_not_found", "message": f"Project '{project_id}' not found."},
        )
    datasets = list_datasets(project_id)
    return {"datasets": datasets, "count": len(datasets)}


# ══════════════════════════════════════════════════════════════════
# GET  /api/v1/projects/{project_id}/datasets/{dataset_id}
# ══════════════════════════════════════════════════════════════════

@router.get(
    "/{project_id}/datasets/{dataset_id}",
    summary="Get a single dataset",
)
def get_single_dataset(project_id: str, dataset_id: str):
    """Fetch a dataset record by ID."""
    dataset = get_dataset(dataset_id)
    if not dataset or dataset["project_id"] != project_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "error": "dataset_not_found",
                "message": f"Dataset '{dataset_id}' not found in project '{project_id}'.",
            },
        )
    return {"dataset": dataset}


# ══════════════════════════════════════════════════════════════════
# GET  /api/v1/limits
# ══════════════════════════════════════════════════════════════════

limits_router = APIRouter(prefix="/api/v1", tags=["System"])


@limits_router.get("/limits", summary="Upload limits for this deployment")
def get_limits():
    """
    Return the current upload constraints so the frontend can show
    meaningful validation messages before the user even selects a file.
    """
    settings = get_settings()
    return {
        "max_upload_mb": settings.max_upload_size_mb,
        "max_rows": settings.max_rows,
        "max_columns": settings.max_columns,
        "allowed_extensions": sorted(ALLOWED_EXTENSIONS),
        "infrastructure": "render-free-tier",
        "notes": (
            "Limits are set for stable processing on a 512 MB RAM instance. "
            "Peak memory during CSV processing is ~6× the file size."
        ),
    }
