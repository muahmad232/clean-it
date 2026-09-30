"""
Projects router.

Endpoints
---------
POST /api/v1/projects      — Create a new project workspace
GET  /api/v1/projects      — List existing projects
GET  /api/v1/projects/{id} — Get details for a project
"""

from __future__ import annotations

from typing import Optional
from fastapi import APIRouter, HTTPException, Header, status
from pydantic import BaseModel, Field

from app.core.logging import get_logger
from app.database.repositories.datasets import (
    create_project as repo_create_project,
    get_project as repo_get_project,
    list_projects as repo_list_projects,
)
from app.models.dataset import ProjectCreate

logger = get_logger(__name__)

router = APIRouter(prefix="/api/v1/projects", tags=["Projects"])

DEFAULT_USER_ID = "00000000-0000-0000-0000-000000000001"


@router.post(
    "",
    summary="Create a new project workspace",
    status_code=status.HTTP_201_CREATED,
)
def create_project(
    payload: ProjectCreate,
    x_user_id: Optional[str] = Header(default=None, alias="X-User-Id"),
):
    """Create a new project container for datasets."""
    user_id = x_user_id or DEFAULT_USER_ID
    try:
        record = repo_create_project(user_id=user_id, payload=payload)
        return {"project": record}
    except Exception as exc:
        logger.error(f"Failed to create project: {exc}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"error": "create_project_failed", "message": str(exc)},
        )


@router.get(
    "",
    summary="List projects",
    status_code=status.HTTP_200_OK,
)
def list_projects(
    x_user_id: Optional[str] = Header(default=None, alias="X-User-Id"),
):
    """List projects for the user."""
    user_id = x_user_id or DEFAULT_USER_ID
    records = repo_list_projects(user_id=user_id)
    return {"projects": records}


@router.get(
    "/{project_id}",
    summary="Get project details",
    status_code=status.HTTP_200_OK,
)
def get_project(project_id: str):
    """Fetch project by ID."""
    record = repo_get_project(project_id)
    if not record:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "project_not_found", "message": f"Project '{project_id}' not found."},
        )
    return {"project": record}


@router.delete(
    "/{project_id}",
    summary="Delete a project workspace",
    status_code=status.HTTP_200_OK,
)
def delete_project_endpoint(
    project_id: str,
    x_user_id: Optional[str] = Header(default=None, alias="X-User-Id"),
):
    """Delete a project container and all associated datasets and files."""
    from app.database.repositories.datasets import delete_project as repo_delete_project

    success = repo_delete_project(project_id, user_id=x_user_id)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "project_not_found", "message": f"Project '{project_id}' not found or access denied."},
        )
    return {"status": "deleted", "project_id": project_id}


@router.delete(
    "/{project_id}/datasets/{dataset_id}",
    summary="Delete a dataset in project",
    status_code=status.HTTP_200_OK,
)
def delete_project_dataset(project_id: str, dataset_id: str):
    """Delete a dataset and its storage files."""
    from app.database.repositories.datasets import delete_dataset as repo_delete_dataset

    success = repo_delete_dataset(dataset_id)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "dataset_not_found", "message": f"Dataset '{dataset_id}' not found."},
        )
    return {"status": "deleted", "dataset_id": dataset_id}


# ── Standalone User & Maintenance Routes ──────────────────────────
user_datasets_router = APIRouter(tags=["User Datasets & Retention"])


@user_datasets_router.get(
    "/api/v1/user/datasets",
    summary="List all datasets for authenticated user",
    status_code=status.HTTP_200_OK,
)
def get_user_datasets(
    x_user_id: Optional[str] = Header(default=None, alias="X-User-Id"),
):
    """List all datasets across all projects belonging to user, with 10-day retention countdown."""
    from app.database.repositories.datasets import list_user_datasets as repo_list_user_datasets

    user_id = x_user_id or DEFAULT_USER_ID
    datasets = repo_list_user_datasets(user_id)
    return {"datasets": datasets}


@user_datasets_router.delete(
    "/api/v1/datasets/{dataset_id}",
    summary="Delete dataset (direct route)",
    status_code=status.HTTP_200_OK,
)
def delete_direct_dataset(dataset_id: str):
    """Delete dataset by ID."""
    from app.database.repositories.datasets import delete_dataset as repo_delete_dataset

    success = repo_delete_dataset(dataset_id)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "dataset_not_found", "message": f"Dataset '{dataset_id}' not found."},
        )
    return {"status": "deleted", "dataset_id": dataset_id}


@user_datasets_router.post(
    "/api/v1/maintenance/cleanup-expired",
    summary="Trigger 10-day retention cleanup",
    status_code=status.HTTP_200_OK,
)
def trigger_retention_cleanup():
    """Purge datasets older than the 10-day retention period from storage and database."""
    from app.database.repositories.datasets import cleanup_expired_datasets

    purged_count = cleanup_expired_datasets()
    return {"status": "completed", "purged_datasets_count": purged_count}
