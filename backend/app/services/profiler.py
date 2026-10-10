"""
Dataset profiling service — Phase 4.

Produces a compact, LLM-readable profile of a dataset using Polars.

Design rules
------------
- Use scan_csv (lazy) via a temp file — never load into Polars without streaming.
- Collect only aggregated statistics, NOT raw rows.
- Profile JSON must stay < 1 200 tokens so it fits in the Groq context window
  alongside the cleaning plan.
- Per-column: dtype, null%, approx unique count, sample values (≤5), numeric
  stats (min, max, mean, std).
- Dataset-level: shape, duplicate count, total null %, obvious issue flags.
- `llm_summary` field: ≤ 500 token plain-English description for the LLM prompt.

Memory budget (Render free tier)
---------------------------------
Polars peak RAM ≈ 2–3× file size during scan + groupby.
At 50 MB max → ~150 MB peak. Safe within 312 MB available budget.
"""

from __future__ import annotations
import io
import json
import math
import tempfile
import os
from datetime import datetime, timezone
from dataclasses import dataclass, field, asdict
from typing import Any

import polars as pl

from app.core.logging import get_logger
from app.services.issue_detector import detect_all_issues

logger = get_logger(__name__)

# Max sample values to include per column (keeps tokens low)
_MAX_SAMPLE_VALUES = 5
# Max columns to profile verbosely (wide datasets get a trimmed profile)
_MAX_VERBOSE_COLS = 60
# Null percentage threshold to flag as "high null"
_HIGH_NULL_THRESHOLD = 20.0
# Unique count threshold to classify as "likely ID/key column"
_HIGH_CARDINALITY_RATIO = 0.95


# ── Output dataclasses ─────────────────────────────────────────────

@dataclass
class ColumnProfile:
    name: str
    dtype: str
    null_count: int
    null_pct: float
    unique_count_approx: int
    sample_values: list[Any]
    stats: dict[str, float | None]   # min, max, mean, std for numeric; {} for str
    flags: list[str]                  # ["high_null", "likely_id", "constant", ...]


@dataclass
class DatasetProfile:
    dataset_id: str
    profiled_at: str
    file_type: str
    shape: dict[str, int]
    estimated_memory_mb: float
    duplicate_row_count: int
    duplicate_row_pct: float
    total_null_pct: float
    columns: list[ColumnProfile]
    issues: list[dict[str, Any]]
    llm_summary: str

    def to_dict(self) -> dict:
        d = asdict(self)
        return d


# ── Entry point ────────────────────────────────────────────────────

def profile_dataset(
    dataset_id: str,
    file_bytes: bytes,
    file_type: str,
    target_column: Optional[str] = None,
    baseline_df: Optional[pl.DataFrame] = None,
) -> DatasetProfile:
    """
    Profile a dataset from raw bytes.

    Args:
        dataset_id: UUID string for the dataset record.
        file_bytes: Raw file content.
        file_type: 'csv' | 'json' | 'parquet'
        target_column: Optional supervised learning target column.
        baseline_df: Optional baseline DataFrame for distribution shift comparison.

    Returns:
        DatasetProfile dataclass (call .to_dict() for serialization).
    """
    logger.info(f"Profiling dataset {dataset_id}: type={file_type} size={len(file_bytes):,}B")

    df = _load_dataframe(file_bytes, file_type)
    profile = _compute_profile(
        dataset_id,
        df,
        file_type,
        target_column=target_column,
        baseline_df=baseline_df,
    )

    logger.info(
        f"Profile complete: {profile.shape['rows']} rows × {profile.shape['columns']} cols | "
        f"{len(profile.issues)} issue(s) detected"
    )
    return profile


# ── Loading ────────────────────────────────────────────────────────

def _load_dataframe(file_bytes: bytes, file_type: str) -> pl.DataFrame:
    """
    Load file bytes into a Polars DataFrame.
    CSV/Parquet: use scan (lazy) via a temp file, then collect.
    JSON: use read (eager — Polars JSON scanner has limitations).
    """
    if file_type == "csv":
        # Write to /tmp/ for scan_csv (lazy) path
        with tempfile.NamedTemporaryFile(suffix=".csv", delete=False) as tmp:
            tmp.write(file_bytes)
            tmp_path = tmp.name
        try:
            df = (
                pl.scan_csv(tmp_path, infer_schema_length=10_000, ignore_errors=True)
                .collect()
            )
        finally:
            os.unlink(tmp_path)

    elif file_type == "parquet":
        with tempfile.NamedTemporaryFile(suffix=".parquet", delete=False) as tmp:
            tmp.write(file_bytes)
            tmp_path = tmp.name
        try:
            df = pl.scan_parquet(tmp_path).collect()
        finally:
            os.unlink(tmp_path)

    elif file_type == "json":
        # Polars JSON: try records array first, then newline-delimited
        try:
            data = json.loads(file_bytes.decode("utf-8-sig"))
            if isinstance(data, list):
                df = pl.DataFrame(data)
            elif isinstance(data, dict):
                df = pl.DataFrame([data])
            else:
                raise ValueError("Unsupported JSON root type")
        except Exception as exc:
            raise RuntimeError(f"Could not load JSON into DataFrame: {exc}") from exc
    else:
        raise ValueError(f"Unsupported file_type: {file_type!r}")

    return df


# ── Core profiling ─────────────────────────────────────────────────

def _compute_profile(
    dataset_id: str,
    df: pl.DataFrame,
    file_type: str,
    target_column: Optional[str] = None,
    baseline_df: Optional[pl.DataFrame] = None,
) -> DatasetProfile:
    rows, cols = df.shape
    now = datetime.now(timezone.utc).isoformat()

    # ── Estimated memory ──────────────────────────────────────────
    estimated_mb = round(df.estimated_size("mb"), 2)

    # ── Duplicates ────────────────────────────────────────────────
    dup_count = rows - df.unique().shape[0] if rows > 0 else 0
    dup_pct = round(100 * dup_count / rows, 2) if rows > 0 else 0.0

    # ── Total null % ─────────────────────────────────────────────
    total_cells = rows * cols
    total_nulls = sum(df[c].null_count() for c in df.columns)
    total_null_pct = round(100 * total_nulls / total_cells, 2) if total_cells > 0 else 0.0

    # ── Per-column profiles ───────────────────────────────────────
    verbose_cols = df.columns[:_MAX_VERBOSE_COLS]
    col_profiles: list[ColumnProfile] = []
    for col_name in verbose_cols:
        col_profiles.append(_profile_column(df, col_name, rows))

    # ── Issue detection ───────────────────────────────────────────
    issues = _detect_issues(
        df,
        dataset_id,
        target_column=target_column,
        baseline_df=baseline_df,
    )

    # ── LLM summary ──────────────────────────────────────────────
    llm_summary = _build_llm_summary(
        rows=rows,
        cols=cols,
        file_type=file_type,
        col_profiles=col_profiles,
        dup_count=dup_count,
        total_null_pct=total_null_pct,
        issues=issues,
    )

    return DatasetProfile(
        dataset_id=dataset_id,
        profiled_at=now,
        file_type=file_type,
        shape={"rows": rows, "columns": cols},
        estimated_memory_mb=estimated_mb,
        duplicate_row_count=dup_count,
        duplicate_row_pct=dup_pct,
        total_null_pct=total_null_pct,
        columns=col_profiles,
        issues=issues,
        llm_summary=llm_summary,
    )


def _profile_column(df: pl.DataFrame, col_name: str, total_rows: int) -> ColumnProfile:
    series = df[col_name]
    dtype = str(series.dtype)
    null_count = series.null_count()
    null_pct = round(100 * null_count / total_rows, 2) if total_rows > 0 else 0.0

    # Approx unique (much cheaper than exact n_unique for large datasets)
    try:
        unique_approx = series.approx_n_unique()
    except Exception:
        unique_approx = series.drop_nulls().n_unique()

    # Sample values: first 5 distinct non-null values as strings
    try:
        sample_vals = (
            series.drop_nulls()
            .unique(maintain_order=True)
            .head(_MAX_SAMPLE_VALUES)
            .cast(pl.String)
            .to_list()
        )
    except Exception:
        sample_vals = []

    # Numeric stats
    stats: dict[str, float | None] = {}
    is_numeric = series.dtype in (
        pl.Float32, pl.Float64,
        pl.Int8, pl.Int16, pl.Int32, pl.Int64,
        pl.UInt8, pl.UInt16, pl.UInt32, pl.UInt64,
    )
    if is_numeric:
        non_null = series.drop_nulls()
        if len(non_null) > 0:
            stats = {
                "min": _safe_float(non_null.min()),
                "max": _safe_float(non_null.max()),
                "mean": _safe_float(non_null.mean()),
                "std": _safe_float(non_null.std()),
                "median": _safe_float(non_null.median()),
            }

    # Flags
    flags: list[str] = []
    if null_pct >= _HIGH_NULL_THRESHOLD:
        flags.append("high_null")
    if total_rows > 0 and unique_approx / total_rows >= _HIGH_CARDINALITY_RATIO:
        flags.append("likely_id")
    if unique_approx == 1:
        flags.append("constant")
    if unique_approx == 2 and not is_numeric:
        flags.append("binary_flag")
    if series.dtype == pl.String and is_numeric:
        flags.append("numeric_as_string")

    return ColumnProfile(
        name=col_name,
        dtype=dtype,
        null_count=null_count,
        null_pct=null_pct,
        unique_count_approx=unique_approx,
        sample_values=sample_vals,
        stats=stats,
        flags=flags,
    )


def _detect_issues(
    df: pl.DataFrame,
    dataset_id: str,
    target_column: Optional[str] = None,
    baseline_df: Optional[pl.DataFrame] = None,
) -> list[dict[str, Any]]:
    detected = detect_all_issues(
        df,
        dataset_id=dataset_id,
        target_column=target_column,
        baseline_df=baseline_df,
    )
    return [issue.to_dict() for issue in detected]


def _build_llm_summary(
    rows: int,
    cols: int,
    file_type: str,
    col_profiles: list[ColumnProfile],
    dup_count: int,
    total_null_pct: float,
    issues: list[dict[str, Any]],
) -> str:
    """
    Build a compact, plain-English summary for the LLM.
    Targets ~300–500 tokens.
    """
    numeric_cols = [cp for cp in col_profiles if cp.stats]
    string_cols  = [cp for cp in col_profiles if not cp.stats]
    high_null    = [cp for cp in col_profiles if "high_null" in cp.flags]
    likely_ids   = [cp for cp in col_profiles if "likely_id" in cp.flags]
    constants    = [cp for cp in col_profiles if "constant" in cp.flags]

    lines = [
        f"Dataset: {rows:,} rows × {cols} columns ({file_type.upper()}).",
        f"Numeric columns ({len(numeric_cols)}): "
        + (", ".join(c.name for c in numeric_cols[:10]) or "none")
        + ("..." if len(numeric_cols) > 10 else ""),
        f"String/categorical columns ({len(string_cols)}): "
        + (", ".join(c.name for c in string_cols[:10]) or "none")
        + ("..." if len(string_cols) > 10 else ""),
        f"Overall missing values: {total_null_pct}% of all cells.",
        f"Duplicate rows: {dup_count:,}.",
    ]

    if high_null:
        lines.append(
            "High-null columns (>20%): "
            + ", ".join(f"{c.name} ({c.null_pct}%)" for c in high_null)
        )
    if likely_ids:
        lines.append("Likely ID/key columns: " + ", ".join(c.name for c in likely_ids))
    if constants:
        lines.append("Constant (zero-variance) columns: " + ", ".join(c.name for c in constants))
    if not issues:
        lines.append("No major data quality issues detected.")
    else:
        descs = [
            iss["description"] if isinstance(iss, dict) else str(iss)
            for iss in issues[:3]
        ]
        lines.append(f"{len(issues)} issue(s) detected: " + "; ".join(descs))

    # Add numeric summary stats for up to 5 numeric columns
    for cp in numeric_cols[:5]:
        s = cp.stats
        if s:
            lines.append(
                f"  {cp.name}: min={s.get('min')}, max={s.get('max')}, "
                f"mean={_fmt(s.get('mean'))}, std={_fmt(s.get('std'))}"
            )

    return " ".join(lines)


# ── Utility ────────────────────────────────────────────────────────

def _safe_float(val) -> float | None:
    if val is None:
        return None
    try:
        f = float(val)
        return None if math.isnan(f) or math.isinf(f) else round(f, 4)
    except (TypeError, ValueError):
        return None


def _fmt(val: float | None) -> str:
    if val is None:
        return "N/A"
    return f"{val:.3g}"
