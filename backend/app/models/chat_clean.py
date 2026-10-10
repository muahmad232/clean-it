"""
Chat-Driven Autonomous Cleaning Models — Phase 16.

Defines schemas for conversational, intent-guided autonomous cleaning runs
with custom dynamic script execution and human approvals.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class ChatCleanRequest(BaseModel):
    """User intent and instructions for conversational autonomous data cleaning."""
    user_instructions: str = Field(
        ...,
        min_length=3,
        description="Natural language instructions of what task to perform and requirements",
        examples=[
            "Clean this churn dataset: drop customer IDs, cap tenure outliers, impute missing charges with median, and engineer monthly-to-tenure charge ratio"
        ],
    )
    task_objective: Optional[str] = Field(
        default="GENERAL",
        description="Machine learning or analytical objective: GENERAL, CLASSIFICATION, REGRESSION, EDA",
    )
    target_column: Optional[str] = Field(
        default=None,
        description="Optional protected target label column",
    )
    require_approval: bool = Field(
        default=True,
        description="Whether high-risk actions and dynamic code require explicit user approval",
    )
    max_iterations: int = Field(
        default=3,
        ge=1,
        le=5,
        description="Maximum autonomous iterations in the loop",
    )


class ChatCleanResponse(BaseModel):
    """Response containing execution telemetry, custom scripts, approvals, and quality deltas."""
    dataset_id: str
    user_instructions: str
    status: str = Field(
        description="Execution status: 'CLEANED', 'WAITING_APPROVAL', 'ROLLED_BACK', 'CONVERGED'",
    )
    total_iterations: int = 0
    total_llm_calls: int = 0
    total_rollbacks: int = 0
    initial_quality_score: float = 0.0
    final_quality_score: float = 0.0
    quality_delta: float = 0.0
    initial_issues_count: int = 0
    final_issues_count: int = 0
    issues_resolved: int = 0
    custom_scripts: List[Dict[str, Any]] = Field(
        default_factory=list,
        description="Details of any dynamic Polars scripts generated and executed or queued for approval",
    )
    pending_approvals: List[Dict[str, Any]] = Field(
        default_factory=list,
        description="Pending HIGH-risk actions or scripts awaiting user sign-off",
    )
    steps: List[Dict[str, Any]] = Field(
        default_factory=list,
        description="Telemetry per iteration step",
    )
    version: Optional[Dict[str, Any]] = Field(
        default=None,
        description="New immutable version metadata if created",
    )
    comparison: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Before/after comparison metrics report",
    )
    termination_reason: str = "Completed successfully."
