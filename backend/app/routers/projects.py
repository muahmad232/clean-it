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
