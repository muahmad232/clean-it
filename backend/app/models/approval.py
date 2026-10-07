"""
Pydantic models for Human Approval System — Phase 12.
"""

from __future__ import annotations
from typing import Any, Dict, List, Literal, Optional
from pydantic import BaseModel, Field, ConfigDict


class _Base(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class ActionApprovalItem(_Base):
    """A single pending or resolved action approval record."""
    id: str
    dataset_id: str
    project_id: Optional[str] = None
    action_type: str
    target_columns: List[str] = Field(default_factory=list)
    parameters: Dict[str, Any] = Field(default_factory=dict)
    reasoning: str
    risk_level: Literal["LOW", "MEDIUM", "HIGH"] = "HIGH"
    confidence: float = 0.95
    rows_affected_est: int = 0
    status: Literal["PENDING", "APPROVED", "REJECTED", "EXECUTED"] = "PENDING"
    user_feedback: Optional[str] = None
    created_at: str
    resolved_at: Optional[str] = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "dataset_id": self.dataset_id,
            "project_id": self.project_id,
            "action_type": self.action_type,
            "target_columns": self.target_columns,
            "parameters": self.parameters,
            "reasoning": self.reasoning,
            "risk_level": self.risk_level,
            "confidence": self.confidence,
            "rows_affected_est": self.rows_affected_est,
            "status": self.status,
            "user_feedback": self.user_feedback,
            "created_at": self.created_at,
            "resolved_at": self.resolved_at,
        }


class ApprovalDecisionRequest(BaseModel):
    """Payload sent by the user to approve or reject a high-risk action."""
    decision: Literal["approve", "reject"]
    feedback: Optional[str] = Field(
        default=None,
        description="Optional reasoning or instruction provided by the user.",
    )


class ApprovalDecisionResponse(BaseModel):
    """Response returned after resolving a pending approval."""
    dataset_id: str
    action_id: str
    decision: str
    approval: ActionApprovalItem
    version: Optional[Dict[str, Any]] = None
    dataset_status: str
    final_profile: Optional[Dict[str, Any]] = None
    message: str


class PendingApprovalsListResponse(BaseModel):
    """Response listing pending approvals for a dataset."""
    dataset_id: str
    project_id: Optional[str] = None
    dataset_status: str
    count: int
    approvals: List[ActionApprovalItem]
