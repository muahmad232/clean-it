"""
Dataset cleaning & download router.

Endpoints
---------
POST /api/v1/projects/{project_id}/datasets/{dataset_id}/clean
POST /api/v1/datasets/{dataset_id}/clean
    Clean dataset deterministically according to the task type.
    Persists cleaned CSV and returns transformation delta report.

GET  /api/v1/projects/{project_id}/datasets/{dataset_id}/download
GET  /api/v1/datasets/{dataset_id}/download
    Download the cleaned dataset as a CSV file attachment.
"""

from __future__ import annotations

from typing import Optional
from fastapi import APIRouter, HTTPException, Query, Response, status

from app.core.logging import get_logger
from app.database.client import get_service_client
from app.database.repositories.datasets import get_dataset, get_project, update_dataset_profile
from app.services.cleaner import clean_dataset
from app.services.agent_cleaner import run_agentic_cleaning_cycle
from app.storage.supabase import download_file, upload_file

logger = get_logger(__name__)

router = APIRouter(tags=["Cleaning & Download"])


@router.post(
    "/api/v1/projects/{project_id}/datasets/{dataset_id}/clean",
    summary="Clean dataset deterministically",
    status_code=status.HTTP_200_OK,
)
def clean_project_dataset(
    project_id: str,
    dataset_id: str,
    task_type: Optional[str] = Query(default=None, description="Task type override (GENERAL, CLASSIFICATION, REGRESSION, etc.)"),
    target_column: Optional[str] = Query(default=None, description="Target column to protect from deletion/leakage"),
):
    """
    Download raw dataset, apply deterministic cleaning transformations
    tailored to the task type, store the cleaned version, and return a report.
    """
    project = get_project(project_id)
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "project_not_found", "message": f"Project '{project_id}' not found."},
        )

    dataset = get_dataset(dataset_id)
    if not dataset or dataset.get("project_id") != project_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "dataset_not_found", "message": f"Dataset '{dataset_id}' not found."},
        )

    storage_path = dataset.get("storage_path")
    if not storage_path:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "no_file", "message": "Dataset has not been uploaded yet."},
        )

    # 1. Download original file bytes
    try:
        raw_bytes = download_file(storage_path)
    except Exception as exc:
        logger.error(f"Failed downloading file from storage: {exc}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"error": "storage_error", "message": f"Could not retrieve dataset file: {exc}"},
        )

    # 2. Execute cleaning pipeline
    effective_task = task_type or dataset.get("task_type", "GENERAL")
    effective_target = target_column if target_column is not None else dataset.get("target_column")
    file_type = dataset.get("file_type", "csv")

    try:
        cleaned_bytes, report = clean_dataset(
            file_bytes=raw_bytes,
            file_type=file_type,
            task_type=effective_task,
            target_column=effective_target,
        )
    except Exception as exc:
        logger.exception(f"Cleaning error on dataset {dataset_id}: {exc}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"error": "cleaning_failed", "message": f"Dataset cleaning failed: {exc}"},
        )

    # 3. Upload cleaned CSV to storage
    cleaned_path = f"datasets/cleaned/{project_id}/{dataset_id}/cleaned_{dataset.get('original_filename', 'data.csv')}"
    try:
        upload_file(cleaned_path, cleaned_bytes, content_type="text/csv")
    except Exception as exc:
        logger.warning(f"Could not upload cleaned file to Supabase storage ({exc}); proceeding with report.")

    # 4. Update dataset profile with cleaning report and cleaned path
    profile_json = dataset.get("profile_json") or {}
    profile_json["cleaning_report"] = report
    profile_json["cleaned_storage_path"] = cleaned_path

    try:
        update_dataset_profile(dataset_id, profile_json)
        # Update status and task metadata
        update_data = {"status": "COMPLETED"}
        if target_column:
            update_data["target_column"] = target_column
        if task_type:
            update_data["task_type"] = task_type

        client = get_service_client()
        client.schema("data_agent").table("datasets").update(update_data).eq("id", dataset_id).execute()
    except Exception as exc:
        logger.warning(f"Could not persist cleaning report to DB: {exc}")

    # 4b. Snapshot new immutable dataset version (Phase 11)
    new_version = None
    try:
        from app.services.versioning import create_dataset_version
        clean_shape = report.get("cleaned_shape", {})
        new_version = create_dataset_version(
            dataset_id=dataset_id,
            project_id=project_id,
            file_bytes=cleaned_bytes,
            file_type="csv",
            action_name="Instant Deterministic Clean (Polars)",
            action_details={"transformations": report.get("transformations", [])},
            metrics={
                "rows": clean_shape.get("rows", 0),
                "columns": clean_shape.get("columns", 0),
                "null_cells_remaining": report.get("null_cells_remaining", 0),
                "duplicate_rows_removed": report.get("duplicate_rows_removed", 0),
                "transformations_applied": report.get("total_transformations_applied", 0),
            },
        )
    except Exception as exc:
        logger.warning(f"Could not snapshot version for cleaned dataset {dataset_id}: {exc}")

    return {
        "dataset_id": dataset_id,
        "status": "CLEANED",
        "task_type": effective_task,
        "target_column": effective_target,
        "report": report,
        "version": new_version,
        "download_url": f"/api/v1/projects/{project_id}/datasets/{dataset_id}/download",
    }


@router.post(
    "/api/v1/datasets/{dataset_id}/clean",
    summary="Clean dataset (direct)",
    status_code=status.HTTP_200_OK,
)
def clean_direct_dataset(
    dataset_id: str,
    task_type: Optional[str] = Query(default=None),
    target_column: Optional[str] = Query(default=None),
):
    """Direct route for cleaning without requiring project_id in URL."""
    dataset = get_dataset(dataset_id)
    if not dataset:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "dataset_not_found", "message": f"Dataset '{dataset_id}' not found."},
        )
    return clean_project_dataset(
        project_id=dataset["project_id"],
        dataset_id=dataset_id,
        task_type=task_type,
        target_column=target_column,
    )


@router.post(
    "/api/v1/projects/{project_id}/datasets/{dataset_id}/agent-clean",
    summary="Autonomous multi-step agentic cleaning loop",
    status_code=status.HTTP_200_OK,
)
def clean_project_dataset_agentic(
    project_id: str,
    dataset_id: str,
    task_type: Optional[str] = Query(default=None, description="Task type override (CLASSIFICATION, REGRESSION, etc.)"),
    target_column: Optional[str] = Query(default=None, description="Target column to protect"),
    max_iterations: int = Query(default=3, ge=1, le=5, description="Maximum agentic iteration cycles"),
    require_approval: bool = Query(default=True, description="Pause and require human sign-off for HIGH-risk actions"),
):
    """
    Execute an autonomous multi-step cleaning loop:
    1. Profile dataset state.
    2. LLM diagnoses defects and selects precise cleaning functions.
    3. Polars executes the functions deterministically (pauses if HIGH-risk requires human sign-off).
    4. Dataset is re-profiled and re-analyzed.
    5. Repeats until clean, waiting for approval, or max_iterations reached.
    """
    project = get_project(project_id)
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "project_not_found", "message": f"Project '{project_id}' not found."},
        )

    dataset = get_dataset(dataset_id)
    if not dataset or dataset.get("project_id") != project_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "dataset_not_found", "message": f"Dataset '{dataset_id}' not found."},
        )

    storage_path = dataset.get("storage_path")
    if not storage_path:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "no_file", "message": "Dataset has not been uploaded yet."},
        )

    # 1. Download file bytes
    try:
        raw_bytes = download_file(storage_path)
    except Exception as exc:
        logger.error(f"Failed downloading file from storage: {exc}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"error": "storage_error", "message": f"Could not retrieve dataset file: {exc}"},
        )

    effective_task = task_type or dataset.get("task_type", "GENERAL")
    effective_target = target_column if target_column is not None else dataset.get("target_column")
    file_type = dataset.get("file_type", "csv")

    # 2. Run Autonomous Agentic Cleaning Loop
    try:
        run_result = run_agentic_cleaning_cycle(
            dataset_id=dataset_id,
            file_bytes=raw_bytes,
            file_type=file_type,
            task_type=effective_task,
            target_column=effective_target,
            max_iterations=max_iterations,
            project_id=project_id,
            require_approval=require_approval,
        )
    except Exception as exc:
        logger.exception(f"Agent cleaning cycle failed on dataset {dataset_id}: {exc}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"error": "agent_cleaning_failed", "message": f"Agent cleaning loop failed: {exc}"},
        )

    cleaned_bytes = run_result.pop("cleaned_bytes")
    final_profile = run_result.pop("final_profile")

    effective_status = run_result.get("status", "CLEANED")
    pending_apprs = run_result.get("pending_approvals", [])

    # If the cycle paused for human approval, DO NOT create or upload a cleaned dataset or version!
    if effective_status == "WAITING_APPROVAL":
        profile_json = dataset.get("profile_json") or {}
        profile_json["agent_cleaning_report"] = run_result
        profile_json["pending_safe_actions"] = run_result.get("pending_safe_actions", [])
        try:
            update_dataset_profile(dataset_id, profile_json)
            client = get_service_client()
            client.schema("data_agent").table("datasets").update({"status": "WAITING_APPROVAL"}).eq("id", dataset_id).execute()
        except Exception as exc:
            logger.warning(f"Could not persist agent cleaning report to DB: {exc}")

        return {
            "dataset_id": dataset_id,
            "status": "WAITING_APPROVAL",
            "task_type": effective_task,
            "target_column": effective_target,
            "report": run_result,
            "final_profile": dataset.get("profile_json") or {},
            "version": None,
            "pending_approvals": pending_apprs,
            "pending_safe_actions": run_result.get("pending_safe_actions", []),
            "download_url": f"/api/v1/projects/{project_id}/datasets/{dataset_id}/download",
        }

    # 3. Upload final cleaned CSV to storage (only when fully cleaned and authorized)
    cleaned_path = f"datasets/cleaned/{project_id}/{dataset_id}/cleaned_{dataset.get('original_filename', 'data.csv')}"
    try:
        upload_file(cleaned_path, cleaned_bytes, content_type="text/csv")
    except Exception as exc:
        logger.warning(f"Could not upload cleaned file to Supabase storage ({exc}); proceeding with report.")

    # 4. Update dataset profile and status
    profile_json = dataset.get("profile_json") or {}
    profile_json["agent_cleaning_report"] = run_result
    profile_json["cleaned_storage_path"] = cleaned_path
    profile_json["shape"] = final_profile.get("shape", profile_json.get("shape"))
    profile_json["total_null_pct"] = final_profile.get("total_null_pct", 0.0)
    profile_json["duplicate_row_count"] = final_profile.get("duplicate_row_count", 0)
    profile_json["columns"] = final_profile.get("columns", profile_json.get("columns"))
    profile_json["issues"] = final_profile.get("issues", [])
    profile_json["llm_summary"] = final_profile.get("llm_summary", profile_json.get("llm_summary"))

    try:
        update_dataset_profile(dataset_id, profile_json)
        update_data = {"status": effective_status}
        if target_column:
            update_data["target_column"] = target_column
        if task_type:
            update_data["task_type"] = task_type

        client = get_service_client()
        client.schema("data_agent").table("datasets").update(update_data).eq("id", dataset_id).execute()
    except Exception as exc:
        logger.warning(f"Could not persist agent cleaning report to DB: {exc}")

    # 4b. Snapshot new immutable dataset version (Phase 11)
    new_version = None
    try:
        from app.services.versioning import create_dataset_version
        shape = final_profile.get("shape", {})
        total_iters = run_result.get("total_iterations", 1)
        all_actions = [
            a.get("action_type")
            for step in run_result.get("steps", [])
            for a in step.get("selected_actions", [])
        ]
        quality_score = run_result.get("final_metrics", {}).get("readiness_score")
        new_version = create_dataset_version(
            dataset_id=dataset_id,
            project_id=project_id,
            file_bytes=cleaned_bytes,
            file_type="csv",
            action_name=f"Autonomous AI Agent Loop ({total_iters} cycle{'s' if total_iters != 1 else ''})",
            action_details={
                "iterations": total_iters,
                "actions": all_actions,
                "health_grade": run_result.get("final_metrics", {}).get("health_grade"),
                "issues_resolved": run_result.get("issues_resolved", 0),
                "status": effective_status,
                "pending_approvals_count": 0,
            },
            metrics={
                "rows": shape.get("rows", 0),
                "columns": shape.get("columns", 0),
                "total_null_pct": final_profile.get("total_null_pct", 0.0),
                "duplicate_row_count": final_profile.get("duplicate_row_count", 0),
                "iterations_run": total_iters,
                "quality_score": quality_score,
            },
            quality_score=float(quality_score) if quality_score is not None else None,
        )
        logger.info(
            f"Successfully snapshotted version v{new_version.get('version_number')} "
            f"for autonomous agent cleaned dataset {dataset_id}"
        )
    except Exception as exc:
        logger.warning(f"Could not snapshot version for agent-cleaned dataset {dataset_id}: {exc}", exc_info=True)

    return {
        "dataset_id": dataset_id,
        "status": effective_status,
        "task_type": effective_task,
        "target_column": effective_target,
        "report": run_result,
        "final_profile": final_profile,
        "version": new_version,
        "pending_approvals": pending_apprs,
        "download_url": f"/api/v1/projects/{project_id}/datasets/{dataset_id}/download",
    }


@router.post(
    "/api/v1/datasets/{dataset_id}/agent-clean",
    summary="Autonomous multi-step agentic cleaning loop (direct)",
    status_code=status.HTTP_200_OK,
)
def clean_direct_dataset_agentic(
    dataset_id: str,
    task_type: Optional[str] = Query(default=None),
    target_column: Optional[str] = Query(default=None),
    max_iterations: int = Query(default=3, ge=1, le=5),
    require_approval: bool = Query(default=True),
):
    """Direct route for agentic cleaning without project_id in URL."""
    dataset = get_dataset(dataset_id)
    if not dataset:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "dataset_not_found", "message": f"Dataset '{dataset_id}' not found."},
        )
    return clean_project_dataset_agentic(
        project_id=dataset["project_id"],
        dataset_id=dataset_id,
        task_type=task_type,
        target_column=target_column,
        max_iterations=max_iterations,
        require_approval=require_approval,
    )



@router.get(
    "/api/v1/projects/{project_id}/datasets/{dataset_id}/download",
    summary="Download cleaned dataset",
    response_class=Response,
)
def download_project_dataset(project_id: str, dataset_id: str):
    """
    Download the cleaned CSV file.
    Falls back to the original file if cleaning has not been performed yet.
    """
    dataset = get_dataset(dataset_id)
    if not dataset or dataset.get("project_id") != project_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "dataset_not_found", "message": f"Dataset '{dataset_id}' not found."},
        )

    # Check 10-day retention expiration
    from datetime import datetime, timezone, timedelta
    created_at_str = dataset.get("created_at")
    expires_at_str = dataset.get("expires_at")
    now = datetime.now(timezone.utc)

    expires_dt = None
    if expires_at_str:
        try:
            expires_dt = datetime.fromisoformat(expires_at_str.replace("Z", "+00:00"))
        except Exception:
            pass
    if not expires_dt and created_at_str:
        try:
            created_dt = datetime.fromisoformat(created_at_str.replace("Z", "+00:00"))
            expires_dt = created_dt + timedelta(days=10)
        except Exception:
            pass

    if expires_dt and now > expires_dt:
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail={
                "error": "dataset_expired",
                "message": "This dataset has exceeded the 10-day retention window and is no longer available for download.",
            },
        )

    profile_json = dataset.get("profile_json") or {}
    cleaned_path = profile_json.get("cleaned_storage_path")
    original_path = dataset.get("storage_path")

    target_path = cleaned_path or original_path
    if not target_path:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "file_not_found", "message": "No downloadable file exists for this dataset."},
        )

    try:
        file_bytes = download_file(target_path)
    except Exception as exc:
        logger.error(f"Download failed: {exc}")
        # If cleaned path failed, try original
        if cleaned_path and original_path:
            file_bytes = download_file(original_path)
        else:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail={"error": "download_failed", "message": f"Failed to download file: {exc}"},
            )

    orig_name = dataset.get("original_filename", "dataset.csv")
    prefix = "cleaned_" if cleaned_path else ""
    filename = f"{prefix}{orig_name}"
    if not filename.endswith(".csv"):
        filename = f"{filename}.csv"

    return Response(
        content=file_bytes,
        media_type="text/csv",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Content-Type": "text/csv; charset=utf-8",
        },
    )


@router.get(
    "/api/v1/datasets/{dataset_id}/download",
    summary="Download cleaned dataset (direct)",
    response_class=Response,
)
def download_direct_dataset(dataset_id: str):
    """Direct route for downloading dataset."""
    dataset = get_dataset(dataset_id)
    if not dataset:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "dataset_not_found", "message": f"Dataset '{dataset_id}' not found."},
        )
    return download_project_dataset(project_id=dataset["project_id"], dataset_id=dataset_id)
