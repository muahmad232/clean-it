"""
Deterministic Issue Detection Service — Phase 5.

Implements rule-based, deterministic checks on Polars DataFrames:
1. MISSING_VALUES — column missing % > threshold
2. DUPLICATES — duplicate row count > 0
3. CONSTANT_COLUMN — only 1 unique non-null value (zero variance)
4. NEAR_CONSTANT_COLUMN — 1 value exceeds 95% frequency
5. POSSIBLE_IDENTIFIER — string column with 100% unique values
6. HIGH_CARDINALITY — string column with >50% unique values
7. TYPE_MISMATCH — column stored as String but represents numbers, dates, or booleans

Every detector returns validated `Issue` Pydantic models.
No LLM calls are made here — all checks are 100% deterministic, reproducible, and fast.
"""

from __future__ import annotations

import re
import uuid
from typing import Any, Optional
from uuid import UUID

import polars as pl

from app.core.logging import get_logger
from app.models.issue import Issue, IssueType, Severity, IssueStatus

logger = get_logger(__name__)

# Patterns for type mismatch detection
_NUMERIC_PATTERN = re.compile(r"^[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?$")
_DATE_PATTERNS = [
    re.compile(r"^\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2}:\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?$"),  # ISO 8601
    re.compile(r"^\d{2}/\d{2}/\d{4}$"),  # MM/DD/YYYY or DD/MM/YYYY
    re.compile(r"^\d{4}/\d{2}/\d{2}$"),  # YYYY/MM/DD
]
_BOOLEAN_VALUES = {"true", "false", "yes", "no", "t", "f", "1", "0", "y", "n"}


# ══════════════════════════════════════════════════════════════════
# INDIVIDUAL DETECTORS
# ══════════════════════════════════════════════════════════════════

def detect_missing_values(
    df: pl.DataFrame,
    col_name: str,
    total_rows: int,
    threshold_pct: float = 0.0,
    dataset_id: Optional[UUID | str] = None,
) -> list[Issue]:
    """Detect if missing value percentage exceeds threshold."""
    if total_rows == 0 or col_name not in df.columns:
        return []

    series = df[col_name]
    null_count = series.null_count()
    null_pct = round(100.0 * null_count / total_rows, 2)

    if null_pct <= threshold_pct or null_count == 0:
        return []

    if null_pct >= 60.0:
        severity = Severity.CRITICAL
    elif null_pct >= 25.0:
        severity = Severity.HIGH
    elif null_pct >= 5.0:
        severity = Severity.MEDIUM
    else:
        severity = Severity.LOW

    description = (
        f"Column '{col_name}' has {null_pct:.1f}% missing values "
        f"({null_count:,} out of {total_rows:,} rows)."
    )

    return [
        Issue(
            dataset_id=dataset_id,
            issue_type=IssueType.MISSING_VALUES,
            column_name=col_name,
            severity=severity,
            confidence=1.0,
            description=description,
            evidence_json={
                "null_count": null_count,
                "null_pct": null_pct,
                "threshold_pct": threshold_pct,
                "total_rows": total_rows,
            },
        )
    ]


def detect_duplicates(
    df: pl.DataFrame,
    total_rows: int,
    dataset_id: Optional[UUID | str] = None,
) -> list[Issue]:
    """Detect if dataset contains identical duplicate rows."""
    if total_rows <= 1:
        return []

    unique_rows = df.unique().shape[0]
    dup_count = total_rows - unique_rows

    if dup_count <= 0:
        return []

    dup_pct = round(100.0 * dup_count / total_rows, 2)

    if dup_pct >= 25.0:
        severity = Severity.CRITICAL
    elif dup_pct >= 10.0:
        severity = Severity.HIGH
    elif dup_pct >= 2.0:
        severity = Severity.MEDIUM
    else:
        severity = Severity.LOW

    description = (
        f"Dataset contains {dup_count:,} duplicate rows "
        f"({dup_pct:.1f}% of {total_rows:,} total rows)."
    )

    return [
        Issue(
            dataset_id=dataset_id,
            issue_type=IssueType.DUPLICATES,
            column_name=None,
            severity=severity,
            confidence=1.0,
            description=description,
            evidence_json={
                "duplicate_count": dup_count,
                "duplicate_pct": dup_pct,
                "total_rows": total_rows,
            },
        )
    ]


def detect_constant_columns(
    df: pl.DataFrame,
    col_name: str,
    total_rows: int,
    dataset_id: Optional[UUID | str] = None,
) -> list[Issue]:
    """Detect if column has only 1 distinct non-null value (zero variance)."""
    if total_rows == 0 or col_name not in df.columns:
        return []

    series = df[col_name].drop_nulls()
    non_null_count = len(series)
    if non_null_count == 0:
        return []  # Fully null columns handled by MISSING_VALUES

    try:
        n_unique = series.n_unique()
    except Exception:
        n_unique = series.unique().shape[0]

    if n_unique != 1:
        return []

    val = series[0]
    description = (
        f"Column '{col_name}' is constant with single value '{val}' "
        f"across all {non_null_count:,} non-null rows."
    )

    return [
        Issue(
            dataset_id=dataset_id,
            issue_type=IssueType.CONSTANT_COLUMN,
            column_name=col_name,
            severity=Severity.HIGH,
            confidence=1.0,
            description=description,
            evidence_json={
                "unique_count": 1,
                "constant_value": str(val),
                "non_null_count": non_null_count,
                "total_rows": total_rows,
            },
        )
    ]


def detect_near_constant_columns(
    df: pl.DataFrame,
    col_name: str,
    total_rows: int,
    threshold_pct: float = 95.0,
    dataset_id: Optional[UUID | str] = None,
) -> list[Issue]:
    """Detect if a single value dominates >95% of non-null rows (near-zero variance)."""
    if total_rows < 10 or col_name not in df.columns:
        return []

    series = df[col_name].drop_nulls()
    non_null_count = len(series)
    if non_null_count < 10:
        return []

    try:
        n_unique = series.n_unique()
    except Exception:
        n_unique = series.unique().shape[0]

    # If it is strictly constant (1 unique), CONSTANT_COLUMN handles it
    if n_unique <= 1:
        return []

    vc = series.value_counts(sort=True)
    if len(vc) == 0:
        return []

    # Polars value_counts returns a DataFrame with columns [col_name, "count"]
    count_col = [c for c in vc.columns if c != col_name][0]
    top_row = vc[0]
    top_val = top_row[col_name][0]
    top_count = top_row[count_col][0]

    freq_pct = round(100.0 * top_count / non_null_count, 2)
    if freq_pct < threshold_pct:
        return []

    description = (
        f"Column '{col_name}' is near-constant: value '{top_val}' occurs in "
        f"{freq_pct:.1f}% ({top_count:,} of {non_null_count:,}) non-null rows."
    )

    return [
        Issue(
            dataset_id=dataset_id,
            issue_type=IssueType.NEAR_CONSTANT_COLUMN,
            column_name=col_name,
            severity=Severity.MEDIUM,
            confidence=0.95,
            description=description,
            evidence_json={
                "top_value": str(top_val),
                "frequency_count": int(top_count),
                "frequency_pct": freq_pct,
                "threshold_pct": threshold_pct,
                "unique_count": n_unique,
                "non_null_count": non_null_count,
            },
        )
    ]


def detect_possible_identifiers(
    df: pl.DataFrame,
    col_name: str,
    total_rows: int,
    dataset_id: Optional[UUID | str] = None,
) -> list[Issue]:
    """Detect if string column has 100% unique values (surrogate key / identifier)."""
    if total_rows < 5 or col_name not in df.columns:
        return []

    series = df[col_name]
    # Check if string/object/categorical type
    if series.dtype not in (pl.String, pl.Categorical):
        return []

    non_null_series = series.drop_nulls()
    if len(non_null_series) < total_rows:
        return []  # Has nulls, less likely to be a clean surrogate key

    try:
        n_unique = non_null_series.n_unique()
    except Exception:
        n_unique = non_null_series.unique().shape[0]

    if n_unique != total_rows:
        return []

    description = (
        f"Column '{col_name}' is 100% unique strings ({n_unique:,} values in {total_rows:,} rows) "
        "— likely an identifier or primary key."
    )

    return [
        Issue(
            dataset_id=dataset_id,
            issue_type=IssueType.POSSIBLE_IDENTIFIER,
            column_name=col_name,
            severity=Severity.LOW,
            confidence=0.95,
            description=description,
            evidence_json={
                "unique_count": n_unique,
                "unique_pct": 100.0,
                "total_rows": total_rows,
                "dtype": str(series.dtype),
            },
        )
    ]


def detect_high_cardinality(
    df: pl.DataFrame,
    col_name: str,
    total_rows: int,
    threshold_pct: float = 50.0,
    dataset_id: Optional[UUID | str] = None,
) -> list[Issue]:
    """Detect if string column has >50% unique values (high cardinality categorical)."""
    if total_rows < 10 or col_name not in df.columns:
        return []

    series = df[col_name]
    if series.dtype not in (pl.String, pl.Categorical):
        return []

    non_null_series = series.drop_nulls()
    non_null_count = len(non_null_series)
    if non_null_count < 10:
        return []

    try:
        n_unique = non_null_series.n_unique()
    except Exception:
        n_unique = non_null_series.unique().shape[0]

    # If 100% unique, it's covered by POSSIBLE_IDENTIFIER
    if n_unique >= non_null_count:
        return []

    unique_pct = round(100.0 * n_unique / non_null_count, 2)
    if unique_pct <= threshold_pct:
        return []

    description = (
        f"Column '{col_name}' has high cardinality: {n_unique:,} unique values across "
        f"{non_null_count:,} non-null rows ({unique_pct:.1f}% unique)."
    )

    return [
        Issue(
            dataset_id=dataset_id,
            issue_type=IssueType.HIGH_CARDINALITY,
            column_name=col_name,
            severity=Severity.MEDIUM,
            confidence=0.90,
            description=description,
            evidence_json={
                "unique_count": n_unique,
                "unique_pct": unique_pct,
                "threshold_pct": threshold_pct,
                "non_null_count": non_null_count,
                "total_rows": total_rows,
            },
        )
    ]


def detect_type_mismatches(
    df: pl.DataFrame,
    col_name: str,
    total_rows: int,
    dataset_id: Optional[UUID | str] = None,
) -> list[Issue]:
    """
    Detect if a string column is stored with the wrong datatype:
    - Numeric values stored as String (>=80% numeric)
    - Date/Datetime values stored as String (>=80% dates)
    - Boolean values stored as String (100% boolean-like)
    """
    if total_rows < 5 or col_name not in df.columns:
        return []

    series = df[col_name]
    if series.dtype not in (pl.String, pl.Categorical):
        return []

    # Sample up to 100 non-null values for fast type checking
    sample = (
        series.drop_nulls()
        .head(100)
        .cast(pl.String)
        .to_list()
    )
    if not sample:
        return []

    sample_size = len(sample)
    cleaned_sample = [s.strip() for s in sample if s is not None and s.strip() != ""]
    if not cleaned_sample:
        return []

    # 1. Check Boolean
    lower_vals = [s.lower() for s in cleaned_sample]
    bool_matches = sum(1 for s in lower_vals if s in _BOOLEAN_VALUES)
    if bool_matches == len(cleaned_sample) and len(set(lower_vals)) <= 4:
        description = (
            f"Column '{col_name}' appears to be Boolean but is stored as String."
        )
        return [
            Issue(
                dataset_id=dataset_id,
                issue_type=IssueType.TYPE_MISMATCH,
                column_name=col_name,
                severity=Severity.MEDIUM,
                confidence=0.95,
                description=description,
                evidence_json={
                    "current_dtype": str(series.dtype),
                    "inferred_dtype": "Boolean",
                    "convertible_pct": 100.0,
                    "sample_values": sample[:5],
                },
            )
        ]

    # 2. Check Numeric
    numeric_matches = sum(1 for s in cleaned_sample if _NUMERIC_PATTERN.match(s))
    num_pct = round(100.0 * numeric_matches / len(cleaned_sample), 2)
    if num_pct >= 80.0:
        severity = Severity.HIGH if num_pct >= 95.0 else Severity.MEDIUM
        description = (
            f"Column '{col_name}' is stored as String, but {num_pct:.1f}% of sample values "
            "are valid numbers."
        )
        return [
            Issue(
                dataset_id=dataset_id,
                issue_type=IssueType.TYPE_MISMATCH,
                column_name=col_name,
                severity=severity,
                confidence=round(num_pct / 100.0, 2),
                description=description,
                evidence_json={
                    "current_dtype": str(series.dtype),
                    "inferred_dtype": "Float64",
                    "convertible_pct": num_pct,
                    "sample_values": sample[:5],
                },
            )
        ]

    # 3. Check Datetime
    date_matches = 0
    for s in cleaned_sample:
        if any(pat.match(s) for pat in _DATE_PATTERNS):
            date_matches += 1

    date_pct = round(100.0 * date_matches / len(cleaned_sample), 2)
    if date_pct >= 80.0:
        description = (
            f"Column '{col_name}' is stored as String, but {date_pct:.1f}% of sample values "
            "match date/datetime formats."
        )
        return [
            Issue(
                dataset_id=dataset_id,
                issue_type=IssueType.TYPE_MISMATCH,
                column_name=col_name,
                severity=Severity.MEDIUM,
                confidence=round(date_pct / 100.0, 2),
                description=description,
                evidence_json={
                    "current_dtype": str(series.dtype),
                    "inferred_dtype": "Datetime",
                    "convertible_pct": date_pct,
                    "sample_values": sample[:5],
                },
            )
        ]

    return []


# ══════════════════════════════════════════════════════════════════
# PHASE 15: ADVANCED DETECTORS
# ══════════════════════════════════════════════════════════════════

def detect_outliers(
    df: pl.DataFrame,
    col_name: str,
    total_rows: int,
    method: str = "iqr",
    iqr_multiplier: float = 1.5,
    z_threshold: float = 3.0,
    dataset_id: Optional[UUID | str] = None,
) -> list[Issue]:
    """
    Detect numerical outliers using Interquartile Range (IQR) or Z-score.
    Ignores non-numeric columns, constant columns, or columns with < 4 non-null rows.
    """
    if total_rows < 10 or col_name not in df.columns:
        return []

    series = df[col_name].drop_nulls()
    if len(series) < 10:
        return []

    if not series.dtype.is_numeric():
        return []

    try:
        q1_raw = series.quantile(0.25)
        q3_raw = series.quantile(0.75)
    except Exception:
        return []

    if q1_raw is None or q3_raw is None:
        return []

    try:
        q1 = float(q1_raw)
        q3 = float(q3_raw)
    except (TypeError, ValueError):
        return []

    iqr = q3 - q1

    # If IQR is 0 (heavy discrete/mode clustering), fallback to Z-score if variance > 0
    if iqr <= 1e-9 or method.lower() == "zscore":
        try:
            mean_val = float(series.mean())
            std_val = float(series.std())
        except Exception:
            return []

        if std_val <= 1e-9:
            return []  # Zero variance / constant column

        lower_bound = mean_val - z_threshold * std_val
        upper_bound = mean_val + z_threshold * std_val
        outlier_filter = (pl.col(col_name) < lower_bound) | (pl.col(col_name) > upper_bound)
        outlier_df = df.filter(outlier_filter.fill_null(False))
        outlier_count = outlier_df.shape[0]

        if outlier_count == 0:
            return []

        non_null_count = len(series)
        outlier_pct = round(100.0 * outlier_count / non_null_count, 2)
        severity = Severity.HIGH if outlier_pct >= 10.0 else (Severity.MEDIUM if outlier_pct >= 3.0 else Severity.LOW)
        sample_vals = [round(float(v), 4) for v in outlier_df[col_name].drop_nulls().head(5).to_list()]

        description = (
            f"Column '{col_name}' has {outlier_count:,} statistical outlier(s) ({outlier_pct:.1f}% of non-null values) "
            f"detected via Z-score (|z| > {z_threshold}) outside [{lower_bound:.2f}, {upper_bound:.2f}]."
        )
        return [
            Issue(
                dataset_id=dataset_id,
                issue_type=IssueType.OUTLIER,
                column_name=col_name,
                severity=severity,
                confidence=0.90,
                description=description,
                evidence_json={
                    "method": "Z-score",
                    "mean": round(mean_val, 4),
                    "std": round(std_val, 4),
                    "z_threshold": z_threshold,
                    "lower_bound": round(lower_bound, 4),
                    "upper_bound": round(upper_bound, 4),
                    "outlier_count": outlier_count,
                    "outlier_pct": outlier_pct,
                    "sample_outliers": sample_vals,
                },
            )
        ]

    # Standard IQR method
    lower_bound = q1 - iqr_multiplier * iqr
    upper_bound = q3 + iqr_multiplier * iqr
    extreme_lower = q1 - 3.0 * iqr
    extreme_upper = q3 + 3.0 * iqr

    outlier_filter = (pl.col(col_name) < lower_bound) | (pl.col(col_name) > upper_bound)
    outlier_df = df.filter(outlier_filter.fill_null(False))
    outlier_count = outlier_df.shape[0]

    if outlier_count == 0:
        return []

    extreme_filter = (pl.col(col_name) < extreme_lower) | (pl.col(col_name) > extreme_upper)
    extreme_count = df.filter(extreme_filter.fill_null(False)).shape[0]

    non_null_count = len(series)
    outlier_pct = round(100.0 * outlier_count / non_null_count, 2)
    extreme_pct = round(100.0 * extreme_count / non_null_count, 2)

    if outlier_pct >= 10.0 or extreme_pct >= 5.0:
        severity = Severity.HIGH
    elif extreme_count > 0 or outlier_pct >= 3.0:
        severity = Severity.MEDIUM
    else:
        severity = Severity.LOW

    sample_vals = [round(float(v), 4) for v in outlier_df[col_name].drop_nulls().head(5).to_list()]

    description = (
        f"Column '{col_name}' has {outlier_count:,} outlier(s) ({outlier_pct:.1f}% of non-null rows) "
        f"outside IQR bounds [{lower_bound:.2f}, {upper_bound:.2f}]."
        + (f" ({extreme_count} extreme outlier(s))" if extreme_count > 0 else "")
    )

    return [
        Issue(
            dataset_id=dataset_id,
            issue_type=IssueType.OUTLIER,
            column_name=col_name,
            severity=severity,
            confidence=0.95,
            description=description,
            evidence_json={
                "method": "IQR",
                "q1": round(q1, 4),
                "q3": round(q3, 4),
                "iqr": round(iqr, 4),
                "iqr_multiplier": iqr_multiplier,
                "lower_bound": round(lower_bound, 4),
                "upper_bound": round(upper_bound, 4),
                "outlier_count": outlier_count,
                "outlier_pct": outlier_pct,
                "extreme_outlier_count": extreme_count,
                "sample_outliers": sample_vals,
            },
        )
    ]


def detect_invalid_range(
    df: pl.DataFrame,
    col_name: str,
    total_rows: int,
    dataset_id: Optional[UUID | str] = None,
) -> list[Issue]:
    """
    Detect values violating known real-world domain bounds and physical constraints.
    Supports age, probability/percentage, non-negative quantities, geographical coords, and calendar units.
    """
    if total_rows == 0 or col_name not in df.columns:
        return []

    series = df[col_name].drop_nulls()
    if len(series) == 0 or not series.dtype.is_numeric():
        return []

    c_norm = col_name.lower().strip()
    rule_name: Optional[str] = None
    min_allowed: Optional[float] = None
    max_allowed: Optional[float] = None

    # 1. Human Age
    if re.search(r"(^|_)(age|user_age|customer_age|patient_age|employee_age)($|_)", c_norm):
        rule_name = "human_age"
        min_allowed = 0.0
        max_allowed = 125.0
    # 2. Percentage / Probability / Ratio
    elif any(k in c_norm for k in ["pct", "percent", "percentage", "probability", "ratio"]):
        try:
            max_val = float(series.max())
        except Exception:
            max_val = 100.0
        if max_val <= 1.05 and not any(k in c_norm for k in ["pct", "percent"]):
            rule_name = "probability_ratio_0_to_1"
            min_allowed = 0.0
            max_allowed = 1.0
        else:
            rule_name = "percentage_0_to_100"
            min_allowed = 0.0
            max_allowed = 100.0
    # 3. Geographic Coordinates
    elif c_norm in ["latitude", "lat"]:
        rule_name = "geographic_latitude"
        min_allowed = -90.0
        max_allowed = 90.0
    elif c_norm in ["longitude", "lon", "lng"]:
        rule_name = "geographic_longitude"
        min_allowed = -180.0
        max_allowed = 180.0
    # 4. Calendar fields
    elif c_norm in ["month", "birth_month"]:
        rule_name = "calendar_month"
        min_allowed = 1.0
        max_allowed = 12.0
    elif c_norm in ["day", "day_of_month"]:
        rule_name = "calendar_day"
        min_allowed = 1.0
        max_allowed = 31.0
    elif c_norm in ["hour"]:
        rule_name = "clock_hour"
        min_allowed = 0.0
        max_allowed = 23.0
    elif c_norm in ["minute", "second"]:
        rule_name = "clock_minute_second"
        min_allowed = 0.0
        max_allowed = 59.0
    # 5. Non-negative quantities
    elif re.search(r"(^|_)(price|salary|income|revenue|cost|fee|wage|fare|distance|weight|height|depth|count|quantity|qty|duration|total_amount|num_items)($|_)", c_norm):
        rule_name = "non_negative_quantity"
        min_allowed = 0.0
        max_allowed = None

    if rule_name is None:
        return []

    conditions = []
    if min_allowed is not None:
        conditions.append(pl.col(col_name) < min_allowed)
    if max_allowed is not None:
        conditions.append(pl.col(col_name) > max_allowed)

    if not conditions:
        return []

    combined_cond = conditions[0] if len(conditions) == 1 else (conditions[0] | conditions[1])
    violating_df = df.filter(combined_cond.fill_null(False))
    violation_count = violating_df.shape[0]

    if violation_count == 0:
        return []

    non_null_count = len(series)
    violation_pct = round(100.0 * violation_count / non_null_count, 2)
    min_found = float(series.min())
    max_found = float(series.max())

    if violation_pct >= 10.0 or (rule_name == "human_age" and min_found < 0):
        severity = Severity.HIGH
    elif violation_pct >= 1.0:
        severity = Severity.MEDIUM
    else:
        severity = Severity.LOW

    bound_str = f"[{min_allowed if min_allowed is not None else '-inf'}, {max_allowed if max_allowed is not None else '+inf'}]"
    description = (
        f"Column '{col_name}' has {violation_count:,} value(s) ({violation_pct:.1f}% of non-null rows) "
        f"violating domain constraint {bound_str} for '{rule_name}' (range found: [{min_found:.2f}, {max_found:.2f}])."
    )

    sample_vals = [round(float(v), 4) for v in violating_df[col_name].drop_nulls().head(5).to_list()]

    return [
        Issue(
            dataset_id=dataset_id,
            issue_type=IssueType.INVALID_RANGE,
            column_name=col_name,
            severity=severity,
            confidence=0.98,
            description=description,
            evidence_json={
                "domain_rule": rule_name,
                "expected_min": min_allowed,
                "expected_max": max_allowed,
                "violation_count": violation_count,
                "violation_pct": violation_pct,
                "min_found": round(min_found, 4),
                "max_found": round(max_found, 4),
                "sample_violations": sample_vals,
            },
        )
    ]


def detect_distribution_shift(
    df: pl.DataFrame,
    col_name: str,
    total_rows: int,
    baseline_df: Optional[pl.DataFrame] = None,
    dataset_id: Optional[UUID | str] = None,
) -> list[Issue]:
    """
    Detect statistical distribution shift / drift in a column.
    If baseline_df is provided, compares baseline_df vs df.
    If baseline_df is None and total_rows >= 50, compares first half vs second half (internal drift).
    """
    if col_name not in df.columns or total_rows < 10:
        return []

    if baseline_df is not None:
        if col_name not in baseline_df.columns or baseline_df.shape[0] < 5:
            return []
        s1 = baseline_df[col_name].drop_nulls()
        s2 = df[col_name].drop_nulls()
        comparison_context = "baseline_comparison"
    else:
        if total_rows < 50:
            return []
        s_all = df[col_name].drop_nulls()
        if len(s_all) < 50:
            return []
        mid = len(s_all) // 2
        s1 = s_all[:mid]
        s2 = s_all[mid:]
        comparison_context = "internal_split_drift"

    if len(s1) < 5 or len(s2) < 5:
        return []

    # Numeric columns: empirical 2-sample KS distance + relative mean shift
    if s1.dtype.is_numeric() and s2.dtype.is_numeric():
        d1 = [float(x) for x in s1.to_list() if x is not None]
        d2 = [float(x) for x in s2.to_list() if x is not None]
        if len(d1) < 5 or len(d2) < 5:
            return []

        n1, n2 = len(d1), len(d2)
        sorted_1, sorted_2 = sorted(d1), sorted(d2)
        all_eval = sorted(set(sorted_1 + sorted_2))
        i, j, ks_stat = 0, 0, 0.0
        for val in all_eval:
            while i < n1 and sorted_1[i] <= val:
                i += 1
            while j < n2 and sorted_2[j] <= val:
                j += 1
            diff = abs(i / n1 - j / n2)
            if diff > ks_stat:
                ks_stat = diff

        m1 = float(sum(d1) / n1)
        m2 = float(sum(d2) / n2)
        denom = max(abs(m1), 1e-4)
        mean_shift_pct = round(abs(m2 - m1) / denom * 100.0, 2)

        # Trigger threshold: KS distance >= 0.25 or relative mean shift >= 30%
        if ks_stat < 0.25 and mean_shift_pct < 30.0:
            return []

        severity = Severity.HIGH if (ks_stat >= 0.40 or mean_shift_pct >= 50.0) else Severity.MEDIUM
        description = (
            f"Column '{col_name}' displays significant distribution shift ({comparison_context}): "
            f"KS distance = {ks_stat:.3f}, mean shifted by {mean_shift_pct:.1f}% ({m1:.2f} -> {m2:.2f})."
        )
        return [
            Issue(
                dataset_id=dataset_id,
                issue_type=IssueType.DISTRIBUTION_SHIFT,
                column_name=col_name,
                severity=severity,
                confidence=0.92,
                description=description,
                evidence_json={
                    "context": comparison_context,
                    "metric": "ks_statistic",
                    "ks_statistic": round(ks_stat, 4),
                    "mean_before": round(m1, 4),
                    "mean_after": round(m2, 4),
                    "mean_shift_pct": mean_shift_pct,
                    "sample_size_1": n1,
                    "sample_size_2": n2,
                },
            )
        ]

    # Categorical columns: Total Variation Distance (TVD)
    try:
        vc1 = s1.value_counts()
        vc2 = s2.value_counts()
        n1 = len(s1)
        n2 = len(s2)
        p1 = {str(row[0]): row[1] / n1 for row in vc1.iter_rows()}
        p2 = {str(row[0]): row[1] / n2 for row in vc2.iter_rows()}
        all_keys = set(p1.keys()) | set(p2.keys())
        tvd = 0.5 * sum(abs(p1.get(k, 0.0) - p2.get(k, 0.0)) for k in all_keys)

        if tvd >= 0.25:
            severity = Severity.HIGH if tvd >= 0.40 else Severity.MEDIUM
            description = (
                f"Categorical column '{col_name}' exhibits distribution shift ({comparison_context}): "
                f"Total Variation Distance = {tvd:.3f}."
            )
            return [
                Issue(
                    dataset_id=dataset_id,
                    issue_type=IssueType.DISTRIBUTION_SHIFT,
                    column_name=col_name,
                    severity=severity,
                    confidence=0.90,
                    description=description,
                    evidence_json={
                        "context": comparison_context,
                        "metric": "total_variation_distance",
                        "tvd": round(tvd, 4),
                        "categories_evaluated": len(all_keys),
                    },
                )
            ]
    except Exception:
        pass

    return []


def detect_class_imbalance(
    df: pl.DataFrame,
    col_name: Optional[str] = None,
    total_rows: int = 0,
    target_column: Optional[str] = None,
    dataset_id: Optional[UUID | str] = None,
) -> list[Issue]:
    """
    Detect class imbalance on target or classification columns.
    Flags when majority-to-minority class ratio >= 4.0:1 (minority <= 20%).
    """
    if total_rows < 10:
        return []

    col_to_check = col_name or target_column
    if not col_to_check:
        candidates = [c for c in df.columns if c.lower().strip() in ["target", "label", "class", "churn", "survived", "fraud", "status", "y", "outcome"]]
        if candidates:
            col_to_check = candidates[0]
        else:
            return []

    if col_to_check not in df.columns:
        return []

    series = df[col_to_check].drop_nulls()
    non_null_count = len(series)
    if non_null_count < 10:
        return []

    try:
        vc = series.value_counts()
    except Exception:
        return []

    n_classes = vc.shape[0]
    if n_classes < 2 or n_classes > 20:
        return []

    rows = vc.iter_rows()
    counts = {str(r[0]): int(r[1]) for r in rows}
    pcts = {str(k): round(100.0 * v / non_null_count, 2) for k, v in counts.items()}

    sorted_classes = sorted(counts.items(), key=lambda x: x[1])
    min_class, min_count = sorted_classes[0]
    max_class, max_count = sorted_classes[-1]

    if min_count <= 0:
        return []

    ratio = round(max_count / min_count, 2)
    min_pct = pcts[min_class]
    max_pct = pcts[max_class]

    if ratio < 4.0 and min_pct > 20.0:
        return []

    severity = Severity.HIGH if (ratio >= 10.0 or min_pct <= 9.1) else Severity.MEDIUM
    description = (
        f"Classification target '{col_to_check}' exhibits significant class imbalance (ratio {ratio:.1f}:1). "
        f"Majority class '{max_class}' accounts for {max_pct:.1f}% ({max_count:,} rows) while "
        f"minority class '{min_class}' is only {min_pct:.1f}% ({min_count:,} rows)."
    )

    return [
        Issue(
            dataset_id=dataset_id,
            issue_type=IssueType.CLASS_IMBALANCE,
            column_name=col_to_check,
            severity=severity,
            confidence=1.0,
            description=description,
            evidence_json={
                "target_column": col_to_check,
                "imbalance_ratio": ratio,
                "minority_class": min_class,
                "minority_count": min_count,
                "minority_pct": min_pct,
                "majority_class": max_class,
                "majority_count": max_count,
                "majority_pct": max_pct,
                "class_counts": counts,
                "class_percentages": pcts,
                "total_classes": n_classes,
            },
        )
    ]


def detect_target_leakage(
    df: pl.DataFrame,
    total_rows: int,
    target_column: Optional[str] = None,
    dataset_id: Optional[UUID | str] = None,
    correlation_threshold: float = 0.90,
) -> list[Issue]:
    """
    Detect columns that have suspiciously high correlation (|r| >= 0.90) with the target column,
    which usually indicates future data leakage, direct proxy duplication, or data collection bugs.
    """
    if total_rows < 10:
        return []

    target = target_column
    if not target:
        candidates = [c for c in df.columns if c.lower().strip() in ["target", "label", "class", "churn", "survived", "fraud", "status", "y", "outcome"]]
        if candidates:
            target = candidates[0]
        else:
            return []

    if target not in df.columns:
        return []

    target_s = df[target].drop_nulls()
    if len(target_s) < 10:
        return []

    issues: list[Issue] = []

    is_target_numeric = target_s.dtype.is_numeric()
    if not is_target_numeric:
        try:
            target_encoded = df[target].cast(pl.Categorical).to_physical()
        except Exception:
            return []
    else:
        target_encoded = df[target]

    for col in df.columns:
        if col == target:
            continue

        s = df[col].drop_nulls()
        if len(s) < 10:
            continue

        if s.n_unique() <= 1:
            continue

        corr_val: Optional[float] = None
        corr_type = "pearson"

        if s.dtype.is_numeric() and is_target_numeric:
            try:
                corr_res = df.select(pl.corr(col, target)).item()
                if corr_res is not None and not (corr_res != corr_res):
                    corr_val = abs(float(corr_res))
            except Exception:
                pass
        else:
            try:
                col_enc = df[col].cast(pl.Categorical).to_physical()
                corr_res = pl.DataFrame({"x": col_enc, "y": target_encoded}).select(pl.corr("x", "y")).item()
                if corr_res is not None and not (corr_res != corr_res):
                    corr_val = abs(float(corr_res))
                    corr_type = "encoded_rank_correlation"
            except Exception:
                pass

        if corr_val is not None and corr_val >= correlation_threshold:
            severity = Severity.CRITICAL if corr_val >= 0.98 else Severity.HIGH
            description = (
                f"Column '{col}' has suspiciously high correlation ({corr_val:.3f}) with target '{target}', "
                f"indicating potential target leakage (proxy / forward-looking variable)."
            )
            issues.append(
                Issue(
                    dataset_id=dataset_id,
                    issue_type=IssueType.TARGET_LEAKAGE,
                    column_name=col,
                    severity=severity,
                    confidence=round(corr_val, 2),
                    description=description,
                    evidence_json={
                        "target_column": target,
                        "leaking_column": col,
                        "correlation": round(corr_val, 4),
                        "correlation_type": corr_type,
                        "threshold": correlation_threshold,
                    },
                )
            )

    return issues


def detect_date_parse_errors(
    df: pl.DataFrame,
    col_name: str,
    total_rows: int,
    dataset_id: Optional[UUID | str] = None,
) -> list[Issue]:
    """
    Detect inconsistent date format strings or corrupt/unparseable dates in date-like columns.
    E.g. mixed 'YYYY-MM-DD' and 'MM/DD/YYYY' or invalid dates like '2023-02-30', 'invalid_date'.
    """
    if total_rows < 5 or col_name not in df.columns:
        return []

    series = df[col_name].drop_nulls()
    if len(series) < 5:
        return []

    if series.dtype in (pl.Date, pl.Datetime):
        return []

    if not (series.dtype == pl.String or series.dtype == pl.Utf8):
        return []

    sample = series.head(200).to_list()
    cleaned_sample = [str(v).strip() for v in sample if str(v).strip() != ""]
    if not cleaned_sample:
        return []

    iso_pat = re.compile(r"^\d{4}-\d{2}-\d{2}")
    slash_mdy_pat = re.compile(r"^\d{1,2}/\d{1,2}/\d{4}")
    dot_dmy_pat = re.compile(r"^\d{1,2}\.\d{1,2}\.\d{4}")
    slash_ymd_pat = re.compile(r"^\d{4}/\d{1,2}/\d{1,2}")

    counts = {
        "YYYY-MM-DD": sum(1 for v in cleaned_sample if iso_pat.match(v)),
        "MM/DD/YYYY": sum(1 for v in cleaned_sample if slash_mdy_pat.match(v)),
        "DD.MM.YYYY": sum(1 for v in cleaned_sample if dot_dmy_pat.match(v)),
        "YYYY/MM/DD": sum(1 for v in cleaned_sample if slash_ymd_pat.match(v)),
    }
    date_matches = sum(counts.values())
    date_match_pct = round(100.0 * date_matches / len(cleaned_sample), 2)

    if date_match_pct < 25.0:
        return []

    formats_present = [fmt for fmt, c in counts.items() if (100.0 * c / len(cleaned_sample)) >= 10.0]
    has_mixed_formats = len(formats_present) >= 2

    corrupt_samples = []
    garbage_tokens = {"null", "none", "nan", "n/a", "invalid", "unknown", "error", "tbd", "0000-00-00"}
    for v in cleaned_sample:
        v_lower = v.lower()
        if v_lower in garbage_tokens:
            corrupt_samples.append(v)
            continue
        m_iso = re.match(r"^(\d{4})-(\d{2})-(\d{2})", v)
        if m_iso:
            try:
                y, m, d = int(m_iso.group(1)), int(m_iso.group(2)), int(m_iso.group(3))
                if m < 1 or m > 12 or d < 1 or d > 31:
                    corrupt_samples.append(v)
                elif m == 2 and d > 29:
                    corrupt_samples.append(v)
            except Exception:
                corrupt_samples.append(v)

    if not has_mixed_formats and len(corrupt_samples) == 0:
        return []

    corrupt_pct = round(100.0 * len(corrupt_samples) / len(cleaned_sample), 2)
    severity = Severity.HIGH if corrupt_pct >= 10.0 else Severity.MEDIUM

    desc_parts = []
    if has_mixed_formats:
        desc_parts.append(f"conflicting date formats ({', '.join(formats_present)})")
    if corrupt_samples:
        desc_parts.append(f"{len(corrupt_samples)} corrupt/unparseable values ({corrupt_pct:.1f}%)")

    description = f"Column '{col_name}' contains date parse errors: " + " and ".join(desc_parts) + "."

    return [
        Issue(
            dataset_id=dataset_id,
            issue_type=IssueType.DATE_PARSE_ERROR,
            column_name=col_name,
            severity=severity,
            confidence=0.95,
            description=description,
            evidence_json={
                "detected_formats": formats_present,
                "has_mixed_formats": has_mixed_formats,
                "invalid_date_count": len(corrupt_samples),
                "invalid_date_pct": corrupt_pct,
                "sample_invalid_values": corrupt_samples[:5],
                "format_frequencies": counts,
            },
        )
    ]


# ══════════════════════════════════════════════════════════════════
# COMPREHENSIVE DETECTOR ORCHESTRATOR
# ══════════════════════════════════════════════════════════════════

def detect_all_issues(
    df: pl.DataFrame,
    dataset_id: Optional[UUID | str] = None,
    target_column: Optional[str] = None,
    task_type: Optional[str] = None,
    baseline_df: Optional[pl.DataFrame] = None,
    missing_threshold_pct: float = 0.0,
    near_constant_threshold_pct: float = 95.0,
    high_cardinality_threshold_pct: float = 50.0,
    outlier_method: str = "iqr",
    include_advanced: bool = True,
) -> list[Issue]:
    """
    Run deterministic detectors across Phase 5 and Phase 15.

    Phase 5 Core Detectors:
    - DUPLICATES (dataset-level)
    - MISSING_VALUES
    - CONSTANT_COLUMN
    - NEAR_CONSTANT_COLUMN
    - POSSIBLE_IDENTIFIER
    - HIGH_CARDINALITY
    - TYPE_MISMATCH

    Phase 15 Advanced Detectors:
    - OUTLIER (IQR / Z-score)
    - INVALID_RANGE (Domain heuristics: age, %, coords, non-negative)
    - DISTRIBUTION_SHIFT (baseline comparison or internal drift)
    - CLASS_IMBALANCE (target / classification distribution)
    - TARGET_LEAKAGE (high correlation >= 0.90 with target)
    - DATE_PARSE_ERROR (conflicting format strings & corrupt dates)
    """
    parsed_dataset_id: Optional[UUID | str] = None
    if dataset_id:
        try:
            parsed_dataset_id = UUID(str(dataset_id))
        except (ValueError, AttributeError):
            parsed_dataset_id = str(dataset_id)
    total_rows = df.shape[0]
    issues: list[Issue] = []

    # 1. Dataset-level duplicates (Phase 5)
    issues.extend(detect_duplicates(df, total_rows, dataset_id=parsed_dataset_id))

    # Phase 15 Target & Dataset-level checks
    if include_advanced:
        issues.extend(
            detect_class_imbalance(
                df,
                total_rows=total_rows,
                target_column=target_column,
                dataset_id=parsed_dataset_id,
            )
        )
        issues.extend(
            detect_target_leakage(
                df,
                total_rows=total_rows,
                target_column=target_column,
                dataset_id=parsed_dataset_id,
            )
        )

    # 2. Per-column checks
    for col_name in df.columns:
        # 2a. Missing values (Phase 5)
        issues.extend(
            detect_missing_values(
                df, col_name, total_rows, threshold_pct=missing_threshold_pct, dataset_id=parsed_dataset_id
            )
        )

        # 2b. Constant column (Phase 5)
        const_issues = detect_constant_columns(df, col_name, total_rows, dataset_id=parsed_dataset_id)
        if const_issues:
            issues.extend(const_issues)
        else:
            # 2c. Near constant column (only if not constant)
            issues.extend(
                detect_near_constant_columns(
                    df,
                    col_name,
                    total_rows,
                    threshold_pct=near_constant_threshold_pct,
                    dataset_id=parsed_dataset_id,
                )
            )

        # 2d. Possible identifier (Phase 5)
        id_issues = detect_possible_identifiers(df, col_name, total_rows, dataset_id=parsed_dataset_id)
        if id_issues:
            issues.extend(id_issues)
        else:
            # 2e. High cardinality (only if not an identifier)
            issues.extend(
                detect_high_cardinality(
                    df,
                    col_name,
                    total_rows,
                    threshold_pct=high_cardinality_threshold_pct,
                    dataset_id=parsed_dataset_id,
                )
            )

        # 2f. Type mismatch (Phase 5)
        issues.extend(
            detect_type_mismatches(df, col_name, total_rows, dataset_id=parsed_dataset_id)
        )

        # Phase 15 Advanced per-column checks
        if include_advanced:
            # Only run outlier and range detection on non-constant columns
            if not const_issues:
                issues.extend(
                    detect_outliers(
                        df,
                        col_name,
                        total_rows,
                        method=outlier_method,
                        dataset_id=parsed_dataset_id,
                    )
                )
                issues.extend(
                    detect_invalid_range(
                        df,
                        col_name,
                        total_rows,
                        dataset_id=parsed_dataset_id,
                    )
                )

            # Date parse errors on string columns
            issues.extend(
                detect_date_parse_errors(
                    df,
                    col_name,
                    total_rows,
                    dataset_id=parsed_dataset_id,
                )
            )

            # Distribution shift (if baseline provided)
            if baseline_df is not None:
                issues.extend(
                    detect_distribution_shift(
                        df,
                        col_name,
                        total_rows,
                        baseline_df=baseline_df,
                        dataset_id=parsed_dataset_id,
                    )
                )

    logger.info(f"Issue detection complete: {len(issues)} issue(s) detected across {len(df.columns)} columns")
    return issues
