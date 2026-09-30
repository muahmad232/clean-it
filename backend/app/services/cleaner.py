"""
Deterministic Task-Aware Data Cleaning Service.

Transforms raw datasets into clean, task-ready datasets using Polars:
- Removes duplicate rows
- Fixes type mismatches (casts string numbers to numeric)
- Drops zero-variance (constant) columns
- Task-specific optimizations:
  - CLASSIFICATION / REGRESSION / ML: drops high-risk surrogate identifiers to prevent target leakage
  - Imputes numerical missing values with median
  - Imputes categorical missing values with "Unknown" or mode
  - Drops columns with catastrophic missingness (>70% nulls)
- Trims surrounding whitespace from text columns
- Produces a detailed transformation delta report
- Exports clean CSV bytes
"""

from __future__ import annotations

import io
import os
import re
import tempfile
from typing import Any, Optional

import polars as pl

from app.core.logging import get_logger

logger = get_logger(__name__)

_NUMERIC_PATTERN = re.compile(r"^[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?$")


def clean_dataset(
    file_bytes: bytes,
    file_type: str = "csv",
    task_type: str = "GENERAL",
    target_column: Optional[str] = None,
) -> tuple[bytes, dict[str, Any]]:
    """
    Clean dataset deterministically based on ML task type.

    Returns:
        tuple of (cleaned_bytes, cleaning_report_dict)
    """
    logger.info(f"Starting cleaning pipeline for task={task_type}, size={len(file_bytes)}B")

    # 1. Load DataFrame
    df = _load_dataframe(file_bytes, file_type)
    before_rows, before_cols = df.shape

    report: dict[str, Any] = {
      "task_type": task_type,
      "target_column": target_column,
      "before_shape": {"rows": before_rows, "columns": before_cols},
      "duplicates_removed": 0,
      "constant_columns_dropped": [],
      "identifiers_dropped": [],
      "high_null_columns_dropped": [],
      "type_casts": [],
      "imputed_nulls": {},
      "after_shape": {},
    }

    if before_rows == 0:
        cleaned_bytes = b""
        report["after_shape"] = {"rows": 0, "columns": before_cols}
        return cleaned_bytes, report

    # 2. Step 1: Remove Duplicates
    unique_df = df.unique()
    dups_removed = before_rows - unique_df.shape[0]
    df = unique_df
    report["duplicates_removed"] = dups_removed
    if dups_removed > 0:
        logger.info(f"Removed {dups_removed} duplicate rows")

    # 3. Step 2: Fix Type Mismatches (String -> Float/Int)
    current_cols = list(df.columns)
    for col in current_cols:
        series = df[col]
        if series.dtype == pl.String:
            # Check sample non-null values
            sample = [s.strip() for s in series.drop_nulls().head(100).to_list() if s is not None and s.strip() != ""]
            if len(sample) >= 5:
                num_matches = sum(1 for s in sample if _NUMERIC_PATTERN.match(s))
                if (num_matches / len(sample)) >= 0.85:
                    try:
                        # Strip whitespace and quotes then cast to Float64
                        casted = (
                            df[col]
                            .str.strip_chars()
                            .str.replace_all('"', "")
                            .cast(pl.Float64, strict=False)
                        )
                        df = df.with_columns(casted.alias(col))
                        report["type_casts"].append(f"Column '{col}': String -> Float64")
                        logger.info(f"Cast column '{col}' from String to Float64")
                    except Exception as e:
                        logger.debug(f"Failed casting {col} to Float64: {e}")

    # 4. Step 3: Drop Catastrophically High Null Columns (>70% nulls)
    current_rows = df.shape[0]
    if current_rows > 0:
        for col in list(df.columns):
            if col == target_column:
                continue
            null_count = df[col].null_count()
            null_pct = (null_count / current_rows) * 100.0
            if null_pct >= 70.0:
                df = df.drop(col)
                report["high_null_columns_dropped"].append(f"{col} ({null_pct:.1f}% null)")
                logger.info(f"Dropped high-null column '{col}' ({null_pct:.1f}% null)")

    # 5. Step 4: Handle Constant (Zero-Variance) Columns
    # Columns with only 1 unique value across all non-null rows
    for col in list(df.columns):
        if col == target_column:
            continue
        non_null_series = df[col].drop_nulls()
        if len(non_null_series) > 0 and non_null_series.n_unique() == 1:
            df = df.drop(col)
            report["constant_columns_dropped"].append(col)
            logger.info(f"Dropped constant column '{col}'")

    # 6. Step 5: Task-Specific Identifier Dropping (Prevent Target Leakage)
    if task_type in ("CLASSIFICATION", "REGRESSION", "LLM_FINETUNING", "CLUSTERING"):
        for col in list(df.columns):
            if col == target_column:
                continue
            series = df[col]
            non_null = series.drop_nulls()
            if len(non_null) == current_rows and non_null.n_unique() == current_rows and current_rows >= 5:
                # 100% unique string column is a surrogate key / identifier
                if series.dtype in (pl.String, pl.Categorical):
                    df = df.drop(col)
                    report["identifiers_dropped"].append(col)
                    logger.info(f"Dropped surrogate identifier '{col}' to prevent leakage in task={task_type}")
                # 100% unique integer/numeric column with ID-like name
                elif series.dtype in (
                    pl.Int8, pl.Int16, pl.Int32, pl.Int64,
                    pl.UInt8, pl.UInt16, pl.UInt32, pl.UInt64
                ):
                    col_lower = col.lower().strip()
                    if (
                        col_lower in ("id", "index", "row_id", "rowid", "idx", "uuid", "guid", "key", "x", "unnamed: 0")
                        or col_lower.endswith(("_id", "_uuid", "_key", "id", "number", "num"))
                    ):
                        df = df.drop(col)
                        report["identifiers_dropped"].append(col)
                        logger.info(f"Dropped numeric identifier '{col}' to prevent leakage in task={task_type}")

    # 7. Step 6: Missing Values Imputation
    for col in list(df.columns):
        if col == target_column:
            continue
        null_count = df[col].null_count()
        if null_count > 0:
            series = df[col]
            # Numeric column: impute with median
            if series.dtype in (
                pl.Float32, pl.Float64,
                pl.Int8, pl.Int16, pl.Int32, pl.Int64,
                pl.UInt8, pl.UInt16, pl.UInt32, pl.UInt64,
            ):
                series_clean = series.fill_nan(None) if series.dtype in (pl.Float32, pl.Float64) else series
                median_val = series_clean.drop_nulls().median()
                if median_val is not None:
                    filled = df[col]
                    if series.dtype in (pl.Float32, pl.Float64):
                        filled = filled.fill_nan(None)
                    df = df.with_columns(filled.fill_null(median_val).alias(col))
                    report["imputed_nulls"][col] = f"{null_count} nulls filled with median ({round(float(median_val), 2)})"
            # String / Categorical column: impute with "Unknown"
            elif series.dtype == pl.String:
                df = df.with_columns(df[col].fill_null("Unknown").alias(col))
                report["imputed_nulls"][col] = f"{null_count} nulls filled with 'Unknown'"

    # 8. Step 7: String Whitespace Trimming
    for col in list(df.columns):
        if df[col].dtype == pl.String:
            df = df.with_columns(df[col].str.strip_chars().alias(col))

    after_rows, after_cols = df.shape
    report["after_shape"] = {"rows": after_rows, "columns": after_cols}

    # 9. Serialize cleaned data to CSV bytes
    buf = io.BytesIO()
    df.write_csv(buf)
    cleaned_bytes = buf.getvalue()

    logger.info(
        f"Cleaning complete: {before_rows}x{before_cols} -> {after_rows}x{after_cols}. "
        f"Cleaned CSV size: {len(cleaned_bytes):,} bytes"
    )
    return cleaned_bytes, report


def _load_dataframe(file_bytes: bytes, file_type: str) -> pl.DataFrame:
    """Helper to read raw bytes into Polars."""
    if file_type == "csv":
        with tempfile.NamedTemporaryFile(suffix=".csv", delete=False) as tmp:
            tmp.write(file_bytes)
            tmp_path = tmp.name
        try:
            return pl.scan_csv(tmp_path, infer_schema_length=10_000, ignore_errors=True).collect()
        finally:
            os.unlink(tmp_path)
    elif file_type == "parquet":
        with tempfile.NamedTemporaryFile(suffix=".parquet", delete=False) as tmp:
            tmp.write(file_bytes)
            tmp_path = tmp.name
        try:
            return pl.scan_parquet(tmp_path).collect()
        finally:
            os.unlink(tmp_path)
    elif file_type == "json":
        import json
        data = json.loads(file_bytes.decode("utf-8-sig"))
        if isinstance(data, list):
            return pl.DataFrame(data)
        elif isinstance(data, dict):
            return pl.DataFrame([data])
        return pl.DataFrame()
    return pl.DataFrame()
