"""
Self-Healing Autonomous Orchestrator Models — Phase 14.

Defines Pydantic schemas for the multi-iteration self-healing loop:
configuration, step reports, regression events, and the final orchestration report.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field, field_validator

from app.models.comparison import ComparisonReport


class OrchestratorConfig(BaseModel):
    """Configuration and guardrail limits for the autonomous self-healing loop."""
    max_iterations: int = Field(
        default=5,
        ge=1,
        description="Maximum iterations allowed per autonomous run (hard limit = 5)",
    )
    max_llm_calls_per_run: int = Field(
        default=10,
        ge=1,
        description="Maximum LLM API calls permitted per run (hard limit = 10)",
    )
    max_actions_per_iteration: int = Field(
        default=10,
        ge=1,
        description="Maximum actions executable in a single iteration batch (hard limit = 10)",
    )
    regression_score_threshold: float = Field(
        default=5.0,
        description="Quality score drop threshold (> 5 points) that triggers auto-rollback",
    )
    target_shift_threshold_pct: float = Field(
        default=20.0,
        description="Relative target class distribution shift threshold (> 20%) that triggers auto-rollback",
    )
    stagnation_limit: int = Field(
        default=2,
        description="Consecutive iterations without quality improvement before terminating loop",
    )
    require_approval: bool = Field(
        default=True,
        description="Whether HIGH risk transformations require explicit human approval",
    )

    @field_validator("max_iterations", mode="before")
    @classmethod
    def clamp_max_iterations(cls, v: Any) -> int:
        return max(1, min(int(v), 5))

    @field_validator("max_llm_calls_per_run", mode="before")
    @classmethod
    def clamp_max_llm_calls(cls, v: Any) -> int:
        return max(1, min(int(v), 10))

    @field_validator("max_actions_per_iteration", mode="before")
    @classmethod
    def clamp_max_actions(cls, v: Any) -> int:
        return max(1, min(int(v), 10))


class RegressionEvent(BaseModel):
    """Details of an in-loop regression event that triggered automatic rollback."""
    iteration: int
    quality_score_before: float
    quality_score_regressed: float
    score_drop: float
    reasons: List[str] = Field(default_factory=list)
    actions_rolled_back: List[Dict[str, Any]] = Field(default_factory=list)
    timestamp: str = Field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )


class IterationStepReport(BaseModel):
    """Detailed record of a single iteration within the self-healing orchestrator."""
    iteration: int
    pre_shape: Dict[str, int]
    pre_quality_score: float
    issues_before_count: int
    pre_issues_count: int = 0
    health_grade: str = "B"
    readiness_score: int = 80
    llm_assessment: str = ""
    is_dataset_clean: bool = False
    stopping_reason: Optional[str] = None
    selected_actions: List[Dict[str, Any]] = Field(default_factory=list)
    executed_actions: List[Dict[str, Any]] = Field(default_factory=list)
    execution_results: List[Dict[str, Any]] = Field(default_factory=list)
    post_shape: Dict[str, int]
    post_quality_score: float
    quality_delta: float = 0.0
    regression_detected: bool = False
    rolled_back: bool = False
    waiting_approval: bool = False
    pending_approvals: List[Dict[str, Any]] = Field(default_factory=list)
    pending_safe_actions: List[Dict[str, Any]] = Field(default_factory=list)
    regression_event: Optional[RegressionEvent] = None
    comparison: Optional[ComparisonReport] = None
    status: str = Field(
        default="EXECUTED",
        description="Step status: 'EXECUTED', 'ROLLED_BACK', 'WAITING_APPROVAL', 'CONVERGED_CLEAN', 'SKIPPED'",
    )


class SelfHealingOrchestrationReport(BaseModel):
    """Overall outcome of the autonomous self-healing agent loop."""
    dataset_id: str
    task_type: str = "GENERAL"
    target_column: Optional[str] = None
    status: str = Field(
        default="CLEANED",
        description="'CLEANED', 'WAITING_APPROVAL', 'ROLLED_BACK', 'CONVERGED', 'MAX_ITERATIONS_REACHED'",
    )
    total_iterations: int = 0
    total_llm_calls: int = 0
    total_rollbacks: int = 0
    initial_quality_score: float = 0.0
    final_quality_score: float = 0.0
    overall_quality_improvement: float = 0.0
    initial_issues_count: int = 0
    final_issues_count: int = 0
    issues_resolved: int = 0
    steps: List[IterationStepReport] = Field(default_factory=list)
    regression_history: List[RegressionEvent] = Field(default_factory=list)
    pending_approvals: List[Dict[str, Any]] = Field(default_factory=list)
    pending_safe_actions: List[Dict[str, Any]] = Field(default_factory=list)
    termination_reason: str = "Completed successfully."
    initial_metrics: Dict[str, Any] = Field(default_factory=dict)
    final_metrics: Dict[str, Any] = Field(default_factory=dict)
    cleaned_bytes: Optional[bytes] = None
    final_profile: Dict[str, Any] = Field(default_factory=dict)
