"""
Phase 17 — ML-Aware Evaluation Pydantic Models.

Data structures for benchmarking model performance (RandomForest, Linear Regression,
Logistic Regression) before and after cleaning on held-out test splits.
"""

from __future__ import annotations
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class MLMetricComparison(BaseModel):
    """Before/after comparison for an individual ML evaluation metric."""
    metric_name: str = Field(description="Name of the metric (e.g. R² Score, RMSE, F1 Score, Accuracy)")
    raw_score: float = Field(description="Score on raw/uncleaned dataset")
    cleaned_score: float = Field(description="Score on cleaned dataset")
    delta: float = Field(description="cleaned_score - raw_score")
    percent_change: float = Field(description="Percentage change from raw to cleaned")
    is_improved: bool = Field(description="Whether cleaned model is better (lower RMSE or higher R²/F1)")


class FeatureImportanceItem(BaseModel):
    """Predictive importance of an individual feature after cleaning."""
    feature: str
    importance: float = Field(description="Relative importance score normalized 0.0 - 1.0")


class MLEvaluationReport(BaseModel):
    """Consolidated ML evaluation report comparing raw vs cleaned dataset performance."""
    task_type: str = Field(description="Supervised task type (e.g. REGRESSION, LINEAR_REGRESSION, CLASSIFICATION)")
    target_column: str = Field(description="Target column evaluated")
    model_name: str = Field(description="Algorithm used for benchmark (e.g. LinearRegression, RandomForestRegressor)")
    train_samples: int = Field(default=0, description="Number of training rows (80% split)")
    test_samples: int = Field(default=0, description="Number of held-out test rows (20% split)")
    feature_count: int = Field(default=0, description="Number of feature columns evaluated")
    features_used: List[str] = Field(default_factory=list, description="List of feature column names")
    metrics: List[MLMetricComparison] = Field(default_factory=list, description="Before vs After metric deltas")
    primary_metric_name: str = Field(default="R² Score", description="Main headline metric (e.g. R² or F1)")
    primary_raw_score: float = Field(default=0.0)
    primary_cleaned_score: float = Field(default=0.0)
    primary_improvement_pct: float = Field(default=0.0)
    primary_improved: bool = Field(default=False)
    top_features: List[FeatureImportanceItem] = Field(default_factory=list, description="Top predictive features")
    summary: str = Field(default="", description="Executive summary of ML performance impact")
    status: str = Field(default="SUCCESS", description="SUCCESS | SKIPPED | FAILED")
    skip_reason: Optional[str] = None
    leakage_guard_notice: str = Field(
        default="Evaluated on 20% held-out test set strictly isolated before cleaning to prevent target leakage."
    )


class MLEvaluationRequest(BaseModel):
    """Request payload to trigger ML evaluation on a dataset."""
    target_column: Optional[str] = Field(default=None, description="Optional target column override")
    task_type: Optional[str] = Field(default=None, description="Optional task type override")
    test_size: float = Field(default=0.20, ge=0.05, le=0.50, description="Test split fraction (default 0.20)")
    random_state: int = Field(default=42, description="Random seed for reproducibility")
