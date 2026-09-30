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
from typing import Annotated, Optional

from fastapi import APIRouter, File, Form, Header, HTTPException, UploadFile, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

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
    claim_project,
    update_dataset_profile,
)
from app.models.dataset import DatasetCreate

logger = get_logger(__name__)

router = APIRouter(prefix="/api/v1/projects", tags=["Datasets"])

DEFAULT_USER_ID = "00000000-0000-0000-0000-000000000001"
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
    x_user_id: Optional[str] = Header(default=None, alias="X-User-Id"),
):
    """
    Upload a dataset file (CSV, JSON, or Parquet).

    **Limits (Render free tier)**
    - Max file size: 50 MB
    - Max rows: 500,000
    - Max columns: 150

    **Flow**
    1. Validate: extension -> size -> structure -> row/column counts
    2. Upload to Supabase Storage (permanent)
    3. Create `datasets` record (status = UPLOADED)
    4. Return dataset metadata
    """
    settings = get_settings()

    # ── 1. Guard: project must exist ──────────────────────────────
    project = get_project(project_id)
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "project_not_found", "message": f"Project '{project_id}' not found."},
        )

    # Auto-claim project if uploaded by authenticated user and project was default anonymous
    if x_user_id and str(project.get("user_id", "")) == DEFAULT_USER_ID:
        try:
            claim_project(project_id, x_user_id)
            project["user_id"] = x_user_id
        except Exception as exc:
            logger.warning(f"Could not auto-claim project {project_id}: {exc}")

    # ── 2. Read file bytes (streaming with size guard) ────────────
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

    record = create_dataset(project_id, payload)
    dataset_id = record["id"]

    # ── 5. Build storage path and upload ─────────────────────────
    effective_user_id = x_user_id or str(project.get("user_id") or _ANON_USER_ID)
    storage_path = build_storage_path(
        user_id=effective_user_id,
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


class SampleDatasetRequest(BaseModel):
    sample_key: str = Field(default="telco_churn", description="telco_churn | titanic | housing")
    task_type: Optional[str] = Field(default=None)


SAMPLE_DATASETS_META = {
    "telco_churn": {
        "filename": "telco_customer_churn_dirty.csv",
        "task_type": "CLASSIFICATION",
        "target_column": "churn",
        "csv": """customer_id,gender,tenure,monthly_charges,total_charges,contract,churn,is_active
CUST-001,Male,12,65.5,786.0,Month-to-month,No,True
CUST-002,Female,24,89.2,,Two year,No,True
CUST-003,Male,1,19.5,19.5,Month-to-month,Yes,True
CUST-004,Female,60,110.0,6600.0,Two year,No,True
CUST-005,Male,1,20.0,20.0,Month-to-month,Yes,True
CUST-006,Female,,75.4,904.8,One year,No,True
CUST-007,Male,36,9999.0,35964.0,Month-to-month,Yes,True
CUST-008,Female,4,45.0,180.0,Month-to-month,No,True
CUST-008,Female,4,45.0,180.0,Month-to-month,No,True
CUST-009,Male,15,55.0,825.0,One year,No,True
CUST-010,Female,48,85.0,4080.0,Two year,No,True
CUST-011,Male,2,70.0,140.0,Month-to-month,Yes,True
CUST-012,Female,10,30.0,300.0,Month-to-month,No,True
CUST-013,Male,72,115.0,8280.0,Two year,No,True
CUST-014,Female,8,,320.0,Month-to-month,No,True
CUST-015,Male,18,60.0,1080.0,One year,No,True
CUST-016,Female,3,80.0,240.0,Month-to-month,Yes,True
CUST-017,Male,30,90.0,2700.0,Two year,No,True
CUST-018,Female,1,25.0,25.0,Month-to-month,Yes,True
CUST-019,Male,40,75.0,3000.0,One year,No,True
CUST-020,Female,5,50.0,250.0,Month-to-month,No,True""",
    },
    "titanic": {
        "filename": "titanic_passengers_dirty.csv",
        "task_type": "CLASSIFICATION",
        "target_column": "survived",
        "csv": """passenger_id,survived,pclass,name,sex,age,sibsp,parch,fare,embarked,is_human
1,0,3,"Braund, Mr. Owen Harris",male,22,1,0,7.25,S,True
2,1,1,"Cumings, Mrs. John Bradley",female,38,1,0,71.2833,C,True
3,1,3,"Heikkinen, Miss. Laina",female,26,0,0,7.925,S,True
4,1,1,"Futrelle, Mrs. Jacques Heath",female,35,1,0,53.1,S,True
5,0,3,"Allen, Mr. William Henry",male,35,0,0,8.05,S,True
6,0,3,"Moran, Mr. James",male,,0,0,8.4583,Q,True
7,0,1,"McCarthy, Mr. Timothy J",male,54,0,0,51.8625,S,True
8,0,3,"Palsson, Master. Gosta Leonard",male,2,3,1,21.075,S,True
9,1,3,"Johnson, Mrs. Oscar W",female,27,0,2,11.1333,S,True
10,1,2,"Nasser, Mrs. Nicholas",female,14,1,0,30.0708,C,True
10,1,2,"Nasser, Mrs. Nicholas",female,14,1,0,30.0708,C,True
11,1,3,"Sandstrom, Miss. Marguerite Rut",female,4,1,1,16.7,S,True
12,1,1,"Bonnell, Miss. Elizabeth",female,58,0,0,26.55,S,True
13,0,3,"Saundercock, Mr. William Henry",male,20,0,0,8.05,S,True
14,0,3,"Andersson, Mr. Anders Johan",male,39,1,5,31.275,S,True
15,0,3,"Vestrom, Miss. Hulda Amanda Adolfina",female,14,0,0,7.8542,S,True
16,1,2,"Hewlett, Mrs.",female,55,0,0,16.0,S,True
17,0,3,"Rice, Master. Eugene",male,2,4,1,29.125,Q,True
18,1,2,"Williams, Mr. Charles Eugene",male,,0,0,13.0,S,True
19,0,3,"Vander Planke, Mrs. Julius",female,31,1,0,18.0,S,True
20,1,3,"Masselmani, Mrs. Fatima",female,,0,0,7.225,C,True""",
    },
    "housing": {
        "filename": "housing_prices_dirty.csv",
        "task_type": "REGRESSION",
        "target_column": "price",
        "csv": """house_id,square_feet,bedrooms,bathrooms,neighborhood,price,country
H-101,1500,3,2,Suburbs,250000,USA
H-102,2200,4,3,Downtown,420000,USA
H-103,,2,1,Suburbs,180000,USA
H-104,3100,5,4,Downtown,650000,USA
H-105,1200,2,1,Rural,140000,USA
H-106,1800,3,2,Suburbs,290000,USA
H-107,2500,4,3,Downtown,-50000,USA
H-108,1600,3,2,Suburbs,260000,USA
H-108,1600,3,2,Suburbs,260000,USA
H-109,,4,3,Rural,210000,USA
H-110,2800,4,4,Downtown,590000,USA
H-111,1350,2,1.5,Suburbs,195000,USA
H-112,1950,3,2.5,Suburbs,310000,USA
H-113,3400,5,4.5,Downtown,750000,USA
H-114,1100,2,1,Rural,125000,USA
H-115,2300,4,3,Suburbs,380000,USA
H-116,1700,3,2,Suburbs,275000,USA
H-117,2100,3,2.5,Downtown,440000,USA
H-118,,2,1,Rural,135000,USA
H-119,2600,4,3,Downtown,510000,USA
H-120,1450,3,1.5,Suburbs,220000,USA""",
    },
}


@router.post(
    "/{project_id}/datasets/sample",
    summary="Add a built-in benchmark dataset to a specific project",
    status_code=status.HTTP_201_CREATED,
)
def add_sample_dataset(
    project_id: str,
    payload: SampleDatasetRequest,
    x_user_id: Optional[str] = Header(default=None, alias="X-User-Id"),
):
    """
    Ingest a pre-built dirty benchmark dataset into a specific project without requiring manual file upload.
    Automatically profiles and detects issues.
    """
    project = get_project(project_id)
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "project_not_found", "message": f"Project '{project_id}' not found."},
        )

    # Auto-claim project if anonymous
    if x_user_id and str(project.get("user_id", "")) == DEFAULT_USER_ID:
        try:
            claim_project(project_id, x_user_id)
            project["user_id"] = x_user_id
        except Exception as exc:
            logger.warning(f"Could not claim project {project_id}: {exc}")

    sample_info = SAMPLE_DATASETS_META.get(payload.sample_key, SAMPLE_DATASETS_META["telco_churn"])
    filename = sample_info["filename"]
    task_type = payload.task_type or sample_info["task_type"]
    target_column = sample_info.get("target_column")
    file_bytes = sample_info["csv"].encode("utf-8")

    meta = validate_upload(filename, "text/csv", file_bytes)

    # Create dataset record
    ds_payload = DatasetCreate(
        original_filename=meta.original_filename,
        file_type="csv",
        file_size=meta.file_size,
        task_type=task_type,
        target_column=target_column,
    )
    record = create_dataset(project_id, ds_payload)
    dataset_id = record["id"]

    effective_user_id = x_user_id or str(project.get("user_id") or _ANON_USER_ID)
    storage_path = build_storage_path(
        user_id=effective_user_id,
        project_id=project_id,
        dataset_id=dataset_id,
        subfolder="original",
        filename="dataset.csv",
    )

    upload_file(
        storage_path=storage_path,
        file_bytes=file_bytes,
        content_type="text/csv",
    )

    update_dataset_status(
        dataset_id=dataset_id,
        status="UPLOADED",
        extra={
            "storage_path": storage_path,
            "row_count": meta.estimated_row_count,
            "column_count": meta.column_count,
        },
    )

    # Run profiling immediately
    try:
        from app.services.profiler import profile_dataset
        profile = profile_dataset(
            dataset_id=dataset_id,
            file_bytes=file_bytes,
            file_type="csv",
        )
        profile_dict = profile.to_dict()
        record = update_dataset_profile(dataset_id, profile_dict)

        # Save issues
        from app.database.repositories.issues import save_issues
        from app.models.issue import Issue
        raw_issues = profile_dict.get("issues", [])
        issue_objs = [Issue(**iss) for iss in raw_issues if isinstance(iss, dict)]
        save_issues(dataset_id, issue_objs)
    except Exception as exc:
        logger.warning(f"Could not auto-profile sample dataset {dataset_id}: {exc}")

    return {
        "dataset": record,
        "message": f"Sample dataset '{filename}' added to project '{project.get('name')}' successfully.",
    }


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
