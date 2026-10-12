"""
Pydantic Models for Audit & Comprehensive Reporting — Phase 18.
"""

from __future__ import annotations
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field, ConfigDict


class _Base(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class DatasetOverview(_Base):
    """Dataset structural metadata and dimensions."""
    dataset_id: str
    dataset_name: str
    project_id: Optional[str] = None
    file_type: str = "csv"
    file_size_bytes: int = 0
    task_type: str = "GENERAL"
    target_column: Optional[str] = None
    original_shape: Dict[str, int] = Field(default_factory=lambda: {"rows": 0, "columns": 0})
    current_shape: Dict[str, int] = Field(default_factory=lambda: {"rows": 0, "columns": 0})
    current_version: int = 0
    status: str = "UPLOADED"
    created_at: str = ""
    updated_at: Optional[str] = None


class IssueSummaryItem(_Base):
    """An issue detected in the dataset and its current status."""
    issue_type: str
    column_name: Optional[str] = None
    severity: str = "MEDIUM"  # LOW | MEDIUM | HIGH | CRITICAL
    confidence: float = 1.0
    description: str
    evidence_summary: Optional[str] = None
    status: str = "OPEN"  # OPEN | RESOLVED | REJECTED | IGNORED


class DecisionItem(_Base):
    """An agent or user decision regarding a transformation action."""
    action_type: str
    target_columns: List[str] = Field(default_factory=list)
    parameters: Dict[str, Any] = Field(default_factory=dict)
    reasoning: str = ""
    risk_level: str = "LOW"  # LOW | MEDIUM | HIGH
    confidence: float = 1.0
    status: str = "EXECUTED"  # PENDING | APPROVED | REJECTED | EXECUTED | ROLLED_BACK
    user_feedback: Optional[str] = None
    timestamp: Optional[str] = None


class TransformationItem(_Base):
    """An actual executed transformation record with audit telemetry."""
    tool_name: str
    parameters: Dict[str, Any] = Field(default_factory=dict)
    rows_affected: int = 0
    columns_affected: List[str] = Field(default_factory=list)
    description: str = ""
    custom_code: Optional[str] = None
    timestamp: Optional[str] = None


class QualityDeltaBreakdown(_Base):
    """Detailed 4-factor quality score delta before vs after cleaning."""
    before_score: float = 0.0
    after_score: float = 0.0
    score_delta: float = 0.0
    health_grade_before: str = "C"
    health_grade_after: str = "A"
    completeness_before: float = 0.0
    completeness_after: float = 0.0
    completeness_delta: float = 0.0
    type_consistency_before: float = 0.0
    type_consistency_after: float = 0.0
    type_consistency_delta: float = 0.0
    uniqueness_before: float = 0.0
    uniqueness_after: float = 0.0
    uniqueness_delta: float = 0.0
    validity_before: float = 0.0
    validity_after: float = 0.0
    validity_delta: float = 0.0
    regression_detected: bool = False
    regression_reasons: List[str] = Field(default_factory=list)


class VersionTimelineItem(_Base):
    """A milestone in the reversible version lineage."""
    version_number: int
    version_id: str
    created_at: str
    quality_score: Optional[float] = None
    parent_version_number: Optional[int] = None
    action_summary: Optional[str] = None
    download_csv_url: str = ""
    download_parquet_url: str = ""


class MlPerformanceSummary(_Base):
    """Holdout baseline ML evaluation delta before vs after cleaning."""
    status: str = "SUCCESS"  # SUCCESS | SKIPPED | FAILED
    task_type: Optional[str] = None
    model_name: Optional[str] = None
    target_column: Optional[str] = None
    primary_metric_name: Optional[str] = None
    primary_raw_score: Optional[float] = None
    primary_cleaned_score: Optional[float] = None
    primary_improvement_pct: Optional[float] = None
    primary_improved: Optional[bool] = None
    train_samples: int = 0
    test_samples: int = 0
    top_features: List[Dict[str, Any]] = Field(default_factory=list)
    metrics: List[Dict[str, Any]] = Field(default_factory=list)
    skip_reason: Optional[str] = None


class AuditReport(_Base):
    """Comprehensive post-cleaning audit report document."""
    report_id: str
    generated_at: str
    dataset_overview: DatasetOverview
    quality_metrics: QualityDeltaBreakdown
    detected_issues: List[IssueSummaryItem] = Field(default_factory=list)
    issues_resolved_count: int = 0
    issues_remaining_count: int = 0
    agent_decisions: List[DecisionItem] = Field(default_factory=list)
    applied_transformations: List[TransformationItem] = Field(default_factory=list)
    version_timeline: List[VersionTimelineItem] = Field(default_factory=list)
    ml_performance: Optional[MlPerformanceSummary] = None
    warnings_and_caveats: List[str] = Field(default_factory=list)
    final_quality_summary: str = ""
    download_links: Dict[str, str] = Field(default_factory=dict)
