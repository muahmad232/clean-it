"""
Re-Profiling & Before/After Comparison Service — Phase 13.

Provides deterministic quality scoring, metric delta comparison,
target distribution shift detection, and automated regression rollback.
"""

from __future__ import annotations
import math
from typing import Any, Dict, List, Optional
import polars as pl

from app.core.logging import get_logger
from app.models.comparison import (
    ComparisonReport,
    MetricDeltaItem,
    QualityScoreBreakdown,
    TargetDistributionComparison,
)
from app.services.profiler import profile_dataset, DatasetProfile
from app.services.rollback import rollback_dataset_version

logger = get_logger(__name__)


# ── Quality Scoring Engine (Master Reference Formula) ──────────────

def calculate_quality_score(profile: dict | DatasetProfile) -> QualityScoreBreakdown:
    """
    Calculate transparent quality score based on Master Plan formula:
    quality_score = (
        completeness_score  * 0.35   # (1 - missing_pct)
      + type_consistency    * 0.25   # % correctly typed cols
      + uniqueness_score    * 0.20   # (1 - duplicate_rate)
      + validity_score      * 0.20   # format + range validity
    )
    All components normalized to 0 - 100.
    """
    prof_dict = profile.to_dict() if hasattr(profile, "to_dict") else dict(profile)

    shape = prof_dict.get("shape", {})
    total_rows = shape.get("rows", 0)
    total_cols = shape.get("columns", 0)

    # 1. Completeness Score (weight 0.35)
    total_null_pct = float(prof_dict.get("total_null_pct", 0.0) or 0.0)
    completeness_score = max(0.0, min(100.0, 100.0 - total_null_pct))

    # 2. Type Consistency Score (weight 0.25)
    cols = prof_dict.get("columns", [])
    issues = prof_dict.get("issues", [])

    mismatch_col_names = set()
    for col in cols:
        if isinstance(col, dict) and "numeric_as_string" in col.get("flags", []):
            mismatch_col_names.add(col.get("name"))
        elif hasattr(col, "flags") and "numeric_as_string" in getattr(col, "flags", []):
            mismatch_col_names.add(getattr(col, "name"))

    for iss in issues:
        itype = iss.get("issue_type") if isinstance(iss, dict) else getattr(iss, "issue_type", None)
        cname = iss.get("column_name") if isinstance(iss, dict) else getattr(iss, "column_name", None)
        if itype in ("TYPE_MISMATCH", "NUMERIC_AS_STRING") and cname:
            mismatch_col_names.add(cname)

    if total_cols > 0:
        consistent_cols = max(0, total_cols - len(mismatch_col_names))
        type_consistency_score = (consistent_cols / total_cols) * 100.0
    else:
        type_consistency_score = 100.0

    # 3. Uniqueness Score (weight 0.20)
    dup_pct = prof_dict.get("duplicate_row_pct")
    if dup_pct is None:
        dup_count = prof_dict.get("duplicate_row_count", 0)
        dup_pct = (dup_count / total_rows * 100.0) if total_rows > 0 else 0.0
    uniqueness_score = max(0.0, min(100.0, 100.0 - float(dup_pct)))

    # 4. Validity Score (weight 0.20)
    # Deduct points for active detected issues based on severity
    validity_penalty = 0.0
    for iss in issues:
        sev = iss.get("severity", "LOW") if isinstance(iss, dict) else getattr(iss, "severity", "LOW")
        sev_str = str(sev).upper()
        if "CRITICAL" in sev_str:
            validity_penalty += 12.0
        elif "HIGH" in sev_str:
            validity_penalty += 6.0
        elif "MEDIUM" in sev_str:
            validity_penalty += 3.0
        else:
            validity_penalty += 1.0

    validity_score = max(0.0, min(100.0, 100.0 - validity_penalty))

    # Overall weighted score
    overall = (
        (completeness_score * 0.35)
        + (type_consistency_score * 0.25)
        + (uniqueness_score * 0.20)
        + (validity_score * 0.20)
    )

    return QualityScoreBreakdown(
        completeness_score=round(completeness_score, 2),
        type_consistency_score=round(type_consistency_score, 2),
        uniqueness_score=round(uniqueness_score, 2),
        validity_score=round(validity_score, 2),
        overall_score=round(overall, 2),
    )


# ── Target Distribution Shift Detector ─────────────────────────────

def detect_target_distribution_shift(
    df_before: pl.DataFrame,
    df_after: pl.DataFrame,
    target_column: Optional[str] = None,
) -> TargetDistributionComparison:
    """
    Detect if transformations cause an unexpected target class distribution shift (>20% relative).
    Protects supervised models from class distortion or target leakage during cleaning.
    """
    if not target_column or target_column not in df_before.columns or target_column not in df_after.columns:
        return TargetDistributionComparison(
            target_column=target_column,
            shift_detected=False,
            details="Target column not present in both dataset states.",
        )

    # Compute percentage distribution for target column
    s_before = df_before[target_column].drop_nulls()
    s_after = df_after[target_column].drop_nulls()

    if len(s_before) == 0 or len(s_after) == 0:
        return TargetDistributionComparison(
            target_column=target_column,
            shift_detected=True,
            max_relative_shift_pct=100.0,
            details=f"Target column '{target_column}' was completely emptied by transformation.",
        )

    counts_before = s_before.value_counts()
    counts_after = s_after.value_counts()

    dist_before: dict[str, float] = {}
    for row in counts_before.iter_rows():
        val_str = str(row[0])
        pct = (row[1] / len(s_before)) * 100.0
        dist_before[val_str] = round(pct, 2)

    dist_after: dict[str, float] = {}
    for row in counts_after.iter_rows():
        val_str = str(row[0])
        pct = (row[1] / len(s_after)) * 100.0
        dist_after[val_str] = round(pct, 2)

    max_rel_shift = 0.0
    shift_details = []

    for k, p_b in dist_before.items():
        p_a = dist_after.get(k, 0.0)
        if p_b > 0.0:
            rel_change = abs(p_a - p_b) / p_b * 100.0
            if rel_change > max_rel_shift:
                max_rel_shift = rel_change
            if rel_change > 20.0:
                shift_details.append(
                    f"Class '{k}' shifted from {p_b:.1f}% to {p_a:.1f}% (relative change: {rel_change:.1f}%)"
                )

    shift_detected = max_rel_shift > 20.0
    detail_str = (
        f"Significant target shift detected: {'; '.join(shift_details)}"
        if shift_detected
        else f"Target distribution stable (max relative shift: {round(max_rel_shift, 1)}% <= 20% threshold)."
    )

    return TargetDistributionComparison(
        target_column=target_column,
        distribution_before=dist_before,
        distribution_after=dist_after,
        max_relative_shift_pct=round(max_rel_shift, 2),
        shift_detected=shift_detected,
        details=detail_str,
    )


# ── Profile Comparison & Regression Analysis ───────────────────────

def compare_profiles(
    old_profile: dict | DatasetProfile,
    new_profile: dict | DatasetProfile,
    target_column: Optional[str] = None,
    old_df: Optional[pl.DataFrame] = None,
    new_df: Optional[pl.DataFrame] = None,
    dataset_id: str = "dataset",
    version_before: Optional[str | int] = None,
    version_after: Optional[str | int] = None,
) -> ComparisonReport:
    """
    Compare pre-transformation profile with post-transformation profile.
    Produces metric deltas, checks for regressions (> 5 point drop or > 20% target shift),
    and categorizes resolved vs. new issues.
    """
    p_old = old_profile.to_dict() if hasattr(old_profile, "to_dict") else dict(old_profile)
    p_new = new_profile.to_dict() if hasattr(new_profile, "to_dict") else dict(new_profile)

    # 1. Quality scores
    qs_before = calculate_quality_score(p_old)
    qs_after = calculate_quality_score(p_new)
    score_delta = round(qs_after.overall_score - qs_before.overall_score, 2)

    # 2. Issues delta
    old_issues = p_old.get("issues", [])
    new_issues = p_new.get("issues", [])

    def issue_key(i: dict) -> tuple:
        itype = i.get("issue_type") if isinstance(i, dict) else getattr(i, "issue_type", None)
        cname = i.get("column_name") if isinstance(i, dict) else getattr(i, "column_name", None)
        return (str(itype), str(cname))

    old_keys = {issue_key(i) for i in old_issues}
    new_keys = {issue_key(i) for i in new_issues}

    resolved = [i for i in old_issues if issue_key(i) not in new_keys]
    introduced = [i for i in new_issues if issue_key(i) not in old_keys]

    # 3. Target distribution shift
    target_dist_res = None
    if old_df is not None and new_df is not None and target_column:
        target_dist_res = detect_target_distribution_shift(old_df, new_df, target_column)

    # 4. Regression Detection
    regression_detected = False
    regression_reasons: list[str] = []

    # Rule A: Quality score drops by more than 5 points
    if score_delta < -5.0:
        regression_detected = True
        regression_reasons.append(
            f"Quality score dropped by {abs(score_delta)} points "
            f"({qs_before.overall_score} → {qs_after.overall_score}), exceeding the 5-point tolerance."
        )

    # Rule B: Target distribution shift > 20%
    if target_dist_res and target_dist_res.shift_detected:
        regression_detected = True
        regression_reasons.append(target_dist_res.details)

    # Rule C: Extreme catastrophic row loss (>90% reduction without intention)
    rows_before = p_old.get("shape", {}).get("rows", 0)
    rows_after = p_new.get("shape", {}).get("rows", 0)
    if rows_before > 0:
        if rows_after == 0:
            regression_detected = True
            regression_reasons.append("Catastrophic regression: Transformation wiped all dataset rows.")
        elif (rows_after / rows_before) < 0.10:
            regression_detected = True
            regression_reasons.append(
                f"Severe data loss: Over 90% of rows were dropped ({rows_before} → {rows_after})."
            )

    # Rule D: New CRITICAL issues introduced
    critical_new = [
        i for i in introduced
        if "CRITICAL" in str(i.get("severity") if isinstance(i, dict) else getattr(i, "severity", "")).upper()
    ]
    if critical_new:
        regression_detected = True
        crit_descs = [c.get("description", "Critical defect") if isinstance(c, dict) else str(c) for c in critical_new]
        regression_reasons.append(f"Transformation introduced new critical defects: {'; '.join(crit_descs[:2])}")

    # 5. Build structured per-metric table
    cols_before = p_old.get("shape", {}).get("columns", 0)
    cols_after = p_new.get("shape", {}).get("columns", 0)
    null_before = float(p_old.get("total_null_pct", 0.0) or 0.0)
    null_after = float(p_new.get("total_null_pct", 0.0) or 0.0)
    dup_before = int(p_old.get("duplicate_row_count", 0) or 0)
    dup_after = int(p_new.get("duplicate_row_count", 0) or 0)

    def status_for_metric(delta: float, higher_is_better: bool = True) -> str:
        if abs(delta) < 0.01:
            return "unchanged"
        if (delta > 0 and higher_is_better) or (delta < 0 and not higher_is_better):
            return "improved"
        return "degraded"

    metrics_table = [
        MetricDeltaItem(
            metric_name="Overall Quality Score",
            category="quality",
            before=qs_before.overall_score,
            after=qs_after.overall_score,
            delta=f"{'+' if score_delta > 0 else ''}{score_delta}",
            status=status_for_metric(score_delta, higher_is_better=True),
        ),
        MetricDeltaItem(
            metric_name="Completeness Score",
            category="quality",
            before=qs_before.completeness_score,
            after=qs_after.completeness_score,
            delta=f"{'+' if (qs_after.completeness_score - qs_before.completeness_score) > 0 else ''}{round(qs_after.completeness_score - qs_before.completeness_score, 2)}",
            status=status_for_metric(qs_after.completeness_score - qs_before.completeness_score, higher_is_better=True),
        ),
        MetricDeltaItem(
            metric_name="Type Consistency",
            category="quality",
            before=qs_before.type_consistency_score,
            after=qs_after.type_consistency_score,
            delta=f"{'+' if (qs_after.type_consistency_score - qs_before.type_consistency_score) > 0 else ''}{round(qs_after.type_consistency_score - qs_before.type_consistency_score, 2)}",
            status=status_for_metric(qs_after.type_consistency_score - qs_before.type_consistency_score, higher_is_better=True),
        ),
        MetricDeltaItem(
            metric_name="Uniqueness Score",
            category="quality",
            before=qs_before.uniqueness_score,
            after=qs_after.uniqueness_score,
            delta=f"{'+' if (qs_after.uniqueness_score - qs_before.uniqueness_score) > 0 else ''}{round(qs_after.uniqueness_score - qs_before.uniqueness_score, 2)}",
            status=status_for_metric(qs_after.uniqueness_score - qs_before.uniqueness_score, higher_is_better=True),
        ),
        MetricDeltaItem(
            metric_name="Validity Score",
            category="quality",
            before=qs_before.validity_score,
            after=qs_after.validity_score,
            delta=f"{'+' if (qs_after.validity_score - qs_before.validity_score) > 0 else ''}{round(qs_after.validity_score - qs_before.validity_score, 2)}",
            status=status_for_metric(qs_after.validity_score - qs_before.validity_score, higher_is_better=True),
        ),
        MetricDeltaItem(
            metric_name="Total Rows",
            category="dimensions",
            before=rows_before,
            after=rows_after,
            delta=rows_after - rows_before,
            status="neutral",
        ),
        MetricDeltaItem(
            metric_name="Total Columns",
            category="dimensions",
            before=cols_before,
            after=cols_after,
            delta=cols_after - cols_before,
            status="neutral",
        ),
        MetricDeltaItem(
            metric_name="Missing Values %",
            category="nulls",
            before=f"{null_before}%",
            after=f"{null_after}%",
            delta=f"{round(null_after - null_before, 2)}%",
            status=status_for_metric(null_after - null_before, higher_is_better=False),
        ),
        MetricDeltaItem(
            metric_name="Duplicate Rows",
            category="duplicates",
            before=dup_before,
            after=dup_after,
            delta=dup_after - dup_before,
            status=status_for_metric(dup_after - dup_before, higher_is_better=False),
        ),
        MetricDeltaItem(
            metric_name="Active Issues",
            category="issues",
            before=len(old_issues),
            after=len(new_issues),
            delta=len(new_issues) - len(old_issues),
            status=status_for_metric(len(new_issues) - len(old_issues), higher_is_better=False),
        ),
    ]

    # 6. Plain-English summary
    if regression_detected:
        summary_text = (
            f"REGRESSION DETECTED: Quality degradation observed ({score_delta:+.1f} points). "
            f"Reasons: {'; '.join(regression_reasons)}. Rollback recommended."
        )
    else:
        summary_text = (
            f"Quality improved by {score_delta:+.1f} points ({qs_before.overall_score} → {qs_after.overall_score}). "
            f"Resolved {len(resolved)} issue(s), introduced {len(introduced)} new issue(s). No regression detected."
        )

    return ComparisonReport(
        dataset_id=dataset_id,
        version_before=version_before,
        version_after=version_after,
        quality_score_before=qs_before,
        quality_score_after=qs_after,
        quality_score_delta=score_delta,
        regression_detected=regression_detected,
        regression_reasons=regression_reasons,
        auto_rolled_back=False,
        target_distribution=target_dist_res,
        metrics_table=metrics_table,
        issues_resolved=[i if isinstance(i, dict) else i.to_dict() for i in resolved],
        new_issues_introduced=[i if isinstance(i, dict) else i.to_dict() for i in introduced],
        summary=summary_text,
    )


# ── Automatic Rollback on Regression ───────────────────────────────

def evaluate_and_auto_rollback_if_regressed(
    dataset_id: str,
    comparison: ComparisonReport,
    target_version_id: Optional[str] = None,
) -> bool:
    """
    If quality regression was detected, automatically trigger rollback to the parent version.
    Returns True if rollback executed, False otherwise.
    """
    if not comparison.regression_detected:
        return False

    rollback_reason = (
        f"Automated Rollback: Quality regression detected. {'; '.join(comparison.regression_reasons)}"
    )
    logger.warning(f"Auto-rollback triggered for dataset {dataset_id}: {rollback_reason}")

    try:
        rollback_dataset_version(
            dataset_id=dataset_id,
            target_version_id=target_version_id,
            reason=rollback_reason,
        )
        comparison.auto_rolled_back = True
        return True
    except Exception as exc:
        logger.error(f"Failed to auto-rollback dataset {dataset_id} after regression: {exc}")
        return False
