"""
Dataset Versioning & Rollback Router — Phase 11.

Endpoints:
- GET  /api/v1/projects/{project_id}/datasets/{dataset_id}/versions
- GET  /api/v1/datasets/{dataset_id}/versions
- GET  /api/v1/projects/{project_id}/datasets/{dataset_id}/versions/{version_identifier}
- POST /api/v1/projects/{project_id}/datasets/{dataset_id}/rollback
- POST /api/v1/datasets/{dataset_id}/rollback
- GET  /api/v1/projects/{project_id}/datasets/{dataset_id}/versions/{version_number}/download
- GET  /api/v1/datasets/{dataset_id}/versions/{version_number}/download
"""

from __future__ import annotations

import io
from typing import Optional
import polars as pl
from fastapi import APIRouter, HTTPException, Query, Response, status
from fastapi.responses import JSONResponse

from app.core.logging import get_logger
from app.database.repositories.datasets import get_dataset, get_project
from app.database.repositories.versions import (
    get_current_version,
    get_version,
    get_version_by_number,
    list_versions,
)
from app.models.version import RollbackRequest, RollbackResponse
from app.services.rollback import rollback_dataset_version
from app.storage.supabase import download_file

logger = get_logger(__name__)

router = APIRouter(tags=["Dataset Versions & Rollback"])


@router.get(
    "/api/v1/projects/{project_id}/datasets/{dataset_id}/versions",
    summary="List all versions for a dataset",
)
def list_dataset_versions_endpoint(project_id: str, dataset_id: str):
    """Retrieve full version lineage for a dataset (v0, v1, v2, ...)."""
    dataset = get_dataset(dataset_id)
    if not dataset or dataset.get("project_id") != project_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "dataset_not_found", "message": f"Dataset '{dataset_id}' not found."},
        )

    versions = list_versions(dataset_id)
    current = get_current_version(dataset_id)

    return {
        "dataset_id": dataset_id,
        "project_id": project_id,
        "count": len(versions),
        "current_version": current,
        "versions": versions,
    }


@router.get(
    "/api/v1/datasets/{dataset_id}/versions",
    summary="List all versions for a dataset (direct)",
)
def list_dataset_versions_direct(dataset_id: str):
    """Direct route for listing dataset versions without project_id."""
    dataset = get_dataset(dataset_id)
    if not dataset:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "dataset_not_found", "message": f"Dataset '{dataset_id}' not found."},
        )
    return list_dataset_versions_endpoint(project_id=dataset["project_id"], dataset_id=dataset_id)


@router.get(
    "/api/v1/projects/{project_id}/datasets/{dataset_id}/versions/{version_identifier}",
    summary="Get single dataset version",
)
def get_dataset_version_endpoint(project_id: str, dataset_id: str, version_identifier: str):
    """Fetch details of a specific version by UUID or integer version_number."""
    dataset = get_dataset(dataset_id)
    if not dataset or dataset.get("project_id") != project_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "dataset_not_found", "message": f"Dataset '{dataset_id}' not found."},
        )

    ver = get_version(dataset_id, version_identifier)
    if not ver:
        try:
            num = int(version_identifier.replace("v", ""))
            ver = get_version_by_number(dataset_id, num)
        except ValueError:
            pass

    if not ver:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "version_not_found", "message": f"Version '{version_identifier}' not found."},
        )

    return {"version": ver}


@router.post(
    "/api/v1/projects/{project_id}/datasets/{dataset_id}/rollback",
    summary="Rollback dataset version",
    response_model=RollbackResponse,
)
def rollback_version_endpoint(
    project_id: str,
    dataset_id: str,
    body: Optional[RollbackRequest] = None,
):
    """
    Rolls back dataset working state to parent version or specified target version.
    Rule: Original dataset (v0) is immutable and cannot be rolled back past.
    """
    dataset = get_dataset(dataset_id)
    if not dataset or dataset.get("project_id") != project_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "dataset_not_found", "message": f"Dataset '{dataset_id}' not found."},
        )

    target_id = body.target_version_id if body else None
    reason = (body.reason if body else None) or "User requested rollback"

    try:
        result = rollback_dataset_version(
            dataset_id=dataset_id,
            target_version_id=target_id,
            reason=reason,
        )
        return result
    except ValueError as val_err:
        logger.warning(f"Rollback rejected for dataset {dataset_id}: {val_err}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "rollback_rejected", "message": str(val_err)},
        )
    except Exception as exc:
        logger.error(f"Rollback failed unexpectedly: {exc}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"error": "rollback_failed", "message": f"Internal error during rollback: {exc}"},
        )


@router.post(
    "/api/v1/datasets/{dataset_id}/rollback",
    summary="Rollback dataset version (direct)",
    response_model=RollbackResponse,
)
def rollback_version_direct(
    dataset_id: str,
    body: Optional[RollbackRequest] = None,
):
    """Direct route for rollback without project_id in URL."""
    dataset = get_dataset(dataset_id)
    if not dataset:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "dataset_not_found", "message": f"Dataset '{dataset_id}' not found."},
        )
    return rollback_version_endpoint(project_id=dataset["project_id"], dataset_id=dataset_id, body=body)


@router.get(
    "/api/v1/projects/{project_id}/datasets/{dataset_id}/versions/{version_number}/download",
    summary="Download specific version of dataset",
    response_class=Response,
)
def download_dataset_version(
    project_id: str,
    dataset_id: str,
    version_number: int,
    format: str = Query(default="csv", pattern="^(csv|parquet)$"),
):
    """Download a specific dataset version snapshot as CSV or Parquet."""
    dataset = get_dataset(dataset_id)
    if not dataset or dataset.get("project_id") != project_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "dataset_not_found", "message": f"Dataset '{dataset_id}' not found."},
        )

    ver = get_version_by_number(dataset_id, version_number)
    if not ver:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "version_not_found", "message": f"Version v{version_number} not found."},
        )

    orig_base = dataset.get("original_filename", "dataset.csv")
    if orig_base.endswith(".csv"):
        base_name = orig_base[:-4]
    else:
        base_name = orig_base

    filename = f"{base_name}_v{version_number}.{format}"
    media_type = "text/csv" if format == "csv" else "application/octet-stream"

    # Preferred storage paths
    parquet_path = f"datasets/versions/{project_id}/{dataset_id}/v{version_number}.parquet"
    csv_path = f"datasets/versions/{project_id}/{dataset_id}/v{version_number}.csv"
    active_path = ver.get("storage_path")

    file_bytes = None
    target_path = parquet_path if format == "parquet" else csv_path

    # Try exact format storage path first
    try:
        file_bytes = download_file(target_path)
    except Exception:
        pass

    # If not found, try active path recorded in version row
    if not file_bytes and active_path:
        try:
            file_bytes = download_file(active_path)
        except Exception:
            pass

    # Fallback to dataset storage_path if v0
    if not file_bytes and version_number == 0 and dataset.get("storage_path"):
        try:
            file_bytes = download_file(dataset["storage_path"])
        except Exception:
            pass

    if not file_bytes:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "version_file_not_found", "message": f"Snapshot file for version v{version_number} not found."},
        )

    # Format transcoding if needed
    if format == "csv" and target_path == parquet_path:
        try:
            df = pl.read_parquet(io.BytesIO(file_bytes))
            file_bytes = df.write_csv().encode("utf-8")
        except Exception as exc:
            logger.warning(f"Could not convert Parquet to CSV: {exc}")
    elif format == "parquet" and target_path == csv_path:
        try:
            df = pl.read_csv(io.BytesIO(file_bytes), ignore_errors=True)
            buf = io.BytesIO()
            df.write_parquet(buf, compression="snappy")
            file_bytes = buf.getvalue()
        except Exception as exc:
            logger.warning(f"Could not convert CSV to Parquet: {exc}")

    return Response(
        content=file_bytes,
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get(
    "/api/v1/datasets/{dataset_id}/versions/{version_number}/download",
    summary="Download specific version of dataset (direct)",
    response_class=Response,
)
def download_dataset_version_direct(
    dataset_id: str,
    version_number: int,
    format: str = Query(default="csv", pattern="^(csv|parquet)$"),
):
    """Direct route for downloading dataset version without project_id in URL."""
    dataset = get_dataset(dataset_id)
    if not dataset:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "dataset_not_found", "message": f"Dataset '{dataset_id}' not found."},
        )
    return download_dataset_version(
        project_id=dataset["project_id"],
        dataset_id=dataset_id,
        version_number=version_number,
        format=format,
    )
