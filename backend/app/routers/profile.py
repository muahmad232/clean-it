"""
Dataset profile router — Phase 4.

Endpoints
---------
POST /api/v1/projects/{project_id}/datasets/{dataset_id}/profile
    Download file from Supabase Storage → profile with Polars
    → store result in DB → return profile JSON.

GET  /api/v1/projects/{project_id}/datasets/{dataset_id}/profile
    Return cached profile_json from DB without re-running Polars.

Design
------
- Profiling runs synchronously (Polars is fast enough for ≤50 MB on free tier).
- Full profile is stored in dataset.profile_json (JSONB) for future retrieval.
- LLM summary included in the response so the agent can start immediately.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, status

from app.core.logging import get_logger
from app.storage.supabase import download_file
from app.database.repositories.datasets import (
    get_dataset,
    get_project,
    update_dataset_status,
    update_dataset_profile,
)
from app.services.profiler import profile_dataset

logger = get_logger(__name__)

router = APIRouter(prefix="/api/v1/projects", tags=["Profiling"])


# ══════════════════════════════════════════════════════════════════
# POST — trigger profiling
# ══════════════════════════════════════════════════════════════════

@router.post(
    "/{project_id}/datasets/{dataset_id}/profile",
    summary="Profile a dataset",
    status_code=status.HTTP_200_OK,
)
def trigger_profile(project_id: str, dataset_id: str):
    """
    Download the uploaded file from Supabase Storage, profile it with Polars,
    persist the result, and return the full profile.

    **Profile includes**
    - Shape (rows × columns)
    - Per-column: dtype, null %, approx unique count, sample values, numeric stats
    - Dataset-level: duplicate row count, total null %, estimated memory
    - Issue flags: high-null columns, constant columns, likely-ID columns
    - `llm_summary`: compact ≤500-token plain-English description for the AI agent

    Idempotent — can be called multiple times; each call re-profiles from the
    stored file and overwrites the cached profile.
    """
    # ── 1. Guard checks ───────────────────────────────────────────
    project = get_project(project_id)
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "project_not_found", "message": f"Project '{project_id}' not found."},
        )

    dataset = get_dataset(dataset_id)
    if not dataset or dataset["project_id"] != project_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "dataset_not_found", "message": f"Dataset '{dataset_id}' not found."},
        )

    if dataset["status"] == "PENDING_UPLOAD":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "error": "file_not_uploaded",
                "message": "Dataset file has not been uploaded yet. Call the upload endpoint first.",
            },
        )

    storage_path = dataset.get("storage_path")
    if not storage_path:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "error": "no_storage_path",
                "message": "Dataset has no storage path — was it uploaded correctly?",
            },
        )

    # ── 2. Mark as PROCESSING ─────────────────────────────────────
    update_dataset_status(dataset_id, "PROCESSING")

    try:
        # ── 3. Download from Supabase Storage ─────────────────────
        logger.info(f"Downloading dataset {dataset_id} from storage: {storage_path}")
        file_bytes = download_file(storage_path)

        # ── 4. Profile ────────────────────────────────────────────
        file_type = dataset.get("file_type", "csv")
        profile = profile_dataset(
            dataset_id=dataset_id,
            file_bytes=file_bytes,
            file_type=file_type,
        )
        profile_dict = profile.to_dict()

        # ── 5. Persist profile → status = COMPLETED ───────────────
        updated_record = update_dataset_profile(dataset_id, profile_dict)

        # ── 6. Persist issues to issues table ─────────────────────
        try:
            from app.database.repositories.issues import save_issues
            from app.models.issue import Issue
            raw_issues = profile_dict.get("issues", [])
            issue_objs = [Issue(**iss) for iss in raw_issues if isinstance(iss, dict)]
            save_issues(dataset_id, issue_objs)
        except Exception as exc:
            logger.warning(f"Could not persist issues to table for dataset {dataset_id}: {exc}")

    except RuntimeError as exc:
        update_dataset_status(dataset_id, "FAILED")
        logger.error(f"Profiling failed for dataset {dataset_id}: {exc}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "error": "profiling_failed",
                "message": f"Failed to profile dataset: {exc}",
            },
        )
    except Exception as exc:
        update_dataset_status(dataset_id, "FAILED")
        logger.exception(f"Unexpected error profiling dataset {dataset_id}: {exc}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"error": "profiling_failed", "message": "An unexpected error occurred during profiling."},
        )

    return {
        "dataset_id": dataset_id,
        "status": "COMPLETED",
        "profile": profile_dict,
        "summary": profile_dict.get("llm_summary", ""),
        "issues_count": len(profile_dict.get("issues", [])),
        "issues": profile_dict.get("issues", []),
    }


# ══════════════════════════════════════════════════════════════════
# GET — retrieve cached profile
# ══════════════════════════════════════════════════════════════════

@router.get(
    "/{project_id}/datasets/{dataset_id}/profile",
    summary="Get cached profile",
)
def get_profile(project_id: str, dataset_id: str):
    """
    Return the previously computed profile from the database.

    Returns 404 if not yet profiled. Call POST first to trigger profiling.
    """
    dataset = get_dataset(dataset_id)
    if not dataset or dataset["project_id"] != project_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "dataset_not_found", "message": f"Dataset '{dataset_id}' not found."},
        )

    profile_json = dataset.get("profile_json")
    if not profile_json:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "error": "profile_not_found",
                "message": (
                    "This dataset has not been profiled yet. "
                    f"POST to /api/v1/projects/{project_id}/datasets/{dataset_id}/profile to run profiling."
                ),
            },
        )

    return {
        "dataset_id": dataset_id,
        "profiled_at": dataset.get("profiled_at"),
        "profile": profile_json,
        "summary": profile_json.get("llm_summary", ""),
        "issues_count": len(profile_json.get("issues", [])),
        "issues": profile_json.get("issues", []),
    }
