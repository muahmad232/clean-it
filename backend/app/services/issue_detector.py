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
# COMPREHENSIVE DETECTOR ORCHESTRATOR
# ══════════════════════════════════════════════════════════════════

def detect_all_issues(
    df: pl.DataFrame,
    dataset_id: Optional[UUID | str] = None,
    missing_threshold_pct: float = 0.0,
    near_constant_threshold_pct: float = 95.0,
    high_cardinality_threshold_pct: float = 50.0,
) -> list[Issue]:
    """
    Run all Phase 5 deterministic detectors on the given DataFrame.

    Order of execution:
    1. Dataset-level: DUPLICATES
    2. Per-column:
       a. MISSING_VALUES
       b. CONSTANT_COLUMN
       c. NEAR_CONSTANT_COLUMN (if not constant)
       d. POSSIBLE_IDENTIFIER
       e. HIGH_CARDINALITY (if not identifier)
       f. TYPE_MISMATCH
    """
    parsed_dataset_id: Optional[UUID | str] = None
    if dataset_id:
        try:
            parsed_dataset_id = UUID(str(dataset_id))
        except (ValueError, AttributeError):
            parsed_dataset_id = str(dataset_id)
    total_rows = df.shape[0]
    issues: list[Issue] = []

    # 1. Dataset-level duplicates
    issues.extend(detect_duplicates(df, total_rows, dataset_id=parsed_dataset_id))

    # 2. Per-column checks
    for col_name in df.columns:
        # 2a. Missing values
        issues.extend(
            detect_missing_values(
                df, col_name, total_rows, threshold_pct=missing_threshold_pct, dataset_id=parsed_dataset_id
            )
        )

        # 2b. Constant column
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

        # 2d. Possible identifier
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

        # 2f. Type mismatch
        issues.extend(
            detect_type_mismatches(df, col_name, total_rows, dataset_id=parsed_dataset_id)
        )

    logger.info(f"Issue detection complete: {len(issues)} issue(s) detected across {len(df.columns)} columns")
    return issues
