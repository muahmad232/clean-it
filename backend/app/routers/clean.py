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

    return {
        "dataset_id": dataset_id,
        "status": "CLEANED",
        "task_type": effective_task,
        "target_column": effective_target,
        "report": report,
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
