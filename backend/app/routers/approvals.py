"""
Human Approval System Router — Phase 12.

Endpoints:
- GET  /api/v1/projects/{project_id}/datasets/{dataset_id}/approvals
- GET  /api/v1/datasets/{dataset_id}/approvals
- POST /api/v1/projects/{project_id}/datasets/{dataset_id}/approvals/{action_id}/decision
- POST /api/v1/datasets/{dataset_id}/approvals/{action_id}/decision
"""

from __future__ import annotations
from typing import Optional
from fastapi import APIRouter, HTTPException, Query, status

from app.core.logging import get_logger
from app.database.repositories.datasets import get_dataset, get_project
from app.database.repositories.approvals import list_approvals
from app.models.approval import (
    ApprovalDecisionRequest,
    ApprovalDecisionResponse,
    PendingApprovalsListResponse,
)
from app.services.approvals import resolve_user_approval

logger = get_logger(__name__)

router = APIRouter(tags=["Human Approvals"])


@router.get(
    "/api/v1/projects/{project_id}/datasets/{dataset_id}/approvals",
    summary="List approvals for a dataset",
    response_model=PendingApprovalsListResponse,
)
def get_dataset_approvals_endpoint(
    project_id: str,
    dataset_id: str,
    status_filter: Optional[str] = Query(default=None, description="Filter by status: PENDING, APPROVED, REJECTED, EXECUTED"),
):
    """Retrieve approvals for a dataset."""
    dataset = get_dataset(dataset_id)
    if not dataset or dataset.get("project_id") != project_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "dataset_not_found", "message": f"Dataset '{dataset_id}' not found."},
        )

    approvals = list_approvals(dataset_id, status_filter=status_filter)
    return {
        "dataset_id": dataset_id,
        "project_id": project_id,
        "dataset_status": dataset.get("status", "UPLOADED"),
        "count": len(approvals),
        "approvals": approvals,
    }


@router.get(
    "/api/v1/datasets/{dataset_id}/approvals",
    summary="List approvals for a dataset (direct)",
    response_model=PendingApprovalsListResponse,
)
def get_dataset_approvals_direct(
    dataset_id: str,
    status_filter: Optional[str] = Query(default=None),
):
    """Direct route for listing approvals without project_id."""
    dataset = get_dataset(dataset_id)
    if not dataset:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "dataset_not_found", "message": f"Dataset '{dataset_id}' not found."},
        )
    return get_dataset_approvals_endpoint(
        project_id=dataset["project_id"],
        dataset_id=dataset_id,
        status_filter=status_filter,
    )


@router.post(
    "/api/v1/projects/{project_id}/datasets/{dataset_id}/approvals/{action_id}/decision",
    summary="Approve or reject a high-risk action",
    response_model=ApprovalDecisionResponse,
)
def submit_approval_decision_endpoint(
    project_id: str,
    dataset_id: str,
    action_id: str,
    body: ApprovalDecisionRequest,
):
    """
    Submits user decision ("approve" or "reject") for a high-risk action.
    If approved, executes the transformation, snapshots a new version, and updates the profile.
    If rejected, marks action as rejected and skips execution.
    """
    dataset = get_dataset(dataset_id)
    if not dataset or dataset.get("project_id") != project_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "dataset_not_found", "message": f"Dataset '{dataset_id}' not found."},
        )

    try:
        result = resolve_user_approval(
            dataset_id=dataset_id,
            project_id=project_id,
            action_id=action_id,
            decision=body.decision,
            feedback=body.feedback,
        )
        return result
    except ValueError as val_err:
        logger.warning(f"Approval decision rejected for dataset {dataset_id}: {val_err}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "approval_rejected", "message": str(val_err)},
        )
    except Exception as exc:
        logger.error(f"Approval resolution failed unexpectedly: {exc}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"error": "approval_failed", "message": f"Internal error during approval processing: {exc}"},
        )


@router.post(
    "/api/v1/datasets/{dataset_id}/approvals/{action_id}/decision",
    summary="Approve or reject a high-risk action (direct)",
    response_model=ApprovalDecisionResponse,
)
def submit_approval_decision_direct(
    dataset_id: str,
    action_id: str,
    body: ApprovalDecisionRequest,
):
    """Direct route for approving or rejecting an action."""
    dataset = get_dataset(dataset_id)
    if not dataset:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "dataset_not_found", "message": f"Dataset '{dataset_id}' not found."},
        )
    return submit_approval_decision_endpoint(
        project_id=dataset["project_id"],
        dataset_id=dataset_id,
        action_id=action_id,
        body=body,
    )
