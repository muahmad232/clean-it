"""
Pydantic models for Re-Profiling & Before/After Comparison — Phase 13.
"""

from __future__ import annotations
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field, ConfigDict


class _Base(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class QualityScoreBreakdown(_Base):
    """Transparent breakdown of dataset health and quality (0 to 100 scale)."""
    completeness_score: float = Field(..., description="100 - total_null_pct (weight 0.35)")
    type_consistency_score: float = Field(..., description="% of columns without type anomalies (weight 0.25)")
    uniqueness_score: float = Field(..., description="100 - duplicate_rate_pct (weight 0.20)")
    validity_score: float = Field(..., description="Format and value range validity (weight 0.20)")
    overall_score: float = Field(..., description="Weighted composite quality score (0-100)")

    def to_dict(self) -> dict[str, float]:
        return {
            "completeness_score": round(self.completeness_score, 2),
            "type_consistency_score": round(self.type_consistency_score, 2),
            "uniqueness_score": round(self.uniqueness_score, 2),
            "validity_score": round(self.validity_score, 2),
            "overall_score": round(self.overall_score, 2),
        }


class TargetDistributionComparison(_Base):
    """Analysis of protected target column class distribution shift."""
    target_column: Optional[str] = None
    distribution_before: Dict[str, float] = Field(default_factory=dict)
    distribution_after: Dict[str, float] = Field(default_factory=dict)
    max_relative_shift_pct: float = 0.0
    shift_detected: bool = False
    details: str = "No target column shift detected."


class MetricDeltaItem(_Base):
    """A single row item in the per-metric comparison table."""
    metric_name: str
    category: str
    before: Any
    after: Any
    delta: Optional[Any] = None
    status: str = "neutral"  # improved | degraded | neutral | unchanged


class ComparisonReport(_Base):
    """Full Before/After evaluation and regression report."""
    dataset_id: str
    version_before: Optional[str | int] = None
    version_after: Optional[str | int] = None
    quality_score_before: QualityScoreBreakdown
    quality_score_after: QualityScoreBreakdown
    quality_score_delta: float
    regression_detected: bool = False
    regression_reasons: List[str] = Field(default_factory=list)
    auto_rolled_back: bool = False
    target_distribution: Optional[TargetDistributionComparison] = None
    metrics_table: List[MetricDeltaItem] = Field(default_factory=list)
    issues_resolved: List[Dict[str, Any]] = Field(default_factory=list)
    new_issues_introduced: List[Dict[str, Any]] = Field(default_factory=list)
    summary: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {
            "dataset_id": self.dataset_id,
            "version_before": self.version_before,
            "version_after": self.version_after,
            "quality_score_before": self.quality_score_before.to_dict(),
            "quality_score_after": self.quality_score_after.to_dict(),
            "quality_score_delta": round(self.quality_score_delta, 2),
            "regression_detected": self.regression_detected,
            "regression_reasons": self.regression_reasons,
            "auto_rolled_back": self.auto_rolled_back,
            "target_distribution": self.target_distribution.model_dump() if self.target_distribution else None,
            "metrics_table": [m.model_dump() for m in self.metrics_table],
            "issues_resolved": self.issues_resolved,
            "new_issues_introduced": self.new_issues_introduced,
            "summary": self.summary,
        }
