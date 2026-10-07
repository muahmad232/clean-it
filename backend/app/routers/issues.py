"""
Issues router — Phase 5.

Endpoints
---------
GET /api/v1/projects/{project_id}/datasets/{dataset_id}/issues
GET /api/v1/datasets/{dataset_id}/issues
    Retrieve detected data quality issues for a dataset.
    Supports filtering by severity, issue_type, and status.
"""

from __future__ import annotations

from typing import Optional
from fastapi import APIRouter, HTTPException, Query, status

from app.core.logging import get_logger
from app.database.repositories.datasets import get_dataset, get_project
from app.database.repositories.issues import get_issues_by_dataset

logger = get_logger(__name__)

router = APIRouter(tags=["Issues"])


@router.get(
    "/api/v1/projects/{project_id}/datasets/{dataset_id}/issues",
    summary="Get issues for dataset (project-scoped)",
    status_code=status.HTTP_200_OK,
)
def get_project_dataset_issues(
    project_id: str,
    dataset_id: str,
    severity: Optional[str] = Query(default=None, description="Filter by severity: LOW, MEDIUM, HIGH, CRITICAL"),
    issue_type: Optional[str] = Query(default=None, description="Filter by issue type: e.g. MISSING_VALUES, DUPLICATES"),
    status_filter: Optional[str] = Query(default=None, alias="status", description="Filter by status: OPEN, RESOLVED, etc."),
):
    """Retrieve all detected issues for a dataset within a project."""
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

    profile_json = dataset.get("profile_json") or {}
    if ("shape" not in profile_json) and dataset.get("status") != "COMPLETED":
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "error": "issues_not_found",
                "message": "Dataset has not been profiled yet. Trigger profiling first.",
            },
        )

    issues = get_issues_by_dataset(
        dataset_id=dataset_id,
        severity=severity,
        issue_type=issue_type,
        status_filter=status_filter,
    )

    return {
        "dataset_id": dataset_id,
        "total_issues": len(issues),
        "issues": issues,
    }


@router.get(
    "/api/v1/datasets/{dataset_id}/issues",
    summary="Get issues for dataset (direct)",
    status_code=status.HTTP_200_OK,
)
def get_direct_dataset_issues(
    dataset_id: str,
    severity: Optional[str] = Query(default=None, description="Filter by severity"),
    issue_type: Optional[str] = Query(default=None, description="Filter by issue type"),
    status_filter: Optional[str] = Query(default=None, alias="status", description="Filter by status"),
):
    """Direct route matching /datasets/{id}/issues from master architecture plan."""
    dataset = get_dataset(dataset_id)
    if not dataset:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "dataset_not_found", "message": f"Dataset '{dataset_id}' not found."},
        )

    if not dataset.get("profile_json") and dataset.get("status") != "COMPLETED":
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "error": "issues_not_found",
                "message": "Dataset has not been profiled yet. Trigger profiling first.",
            },
        )

    issues = get_issues_by_dataset(
        dataset_id=dataset_id,
        severity=severity,
        issue_type=issue_type,
        status_filter=status_filter,
    )

    return {
        "dataset_id": dataset_id,
        "total_issues": len(issues),
        "issues": issues,
    }
