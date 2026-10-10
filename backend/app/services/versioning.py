"""
Dataset Versioning Service — Phase 11.

Creates and manages immutable Parquet and CSV snapshots of dataset states.
- v0: Immutable Original dataset on upload.
- v1, v2, ...: Result of each transformation or cleaning cycle.
"""

from __future__ import annotations

import io
import os
import tempfile
from typing import Any, Dict, Optional
import polars as pl

from app.core.logging import get_logger
from app.database.repositories.versions import (
    save_version,
    list_versions,
    get_current_version,
    get_version,
    get_version_by_number,
)
from app.storage.supabase import upload_file

logger = get_logger(__name__)


def convert_to_parquet(file_bytes: bytes, file_type: str = "csv") -> bytes:
    """Convert input bytes (CSV, Parquet, JSON) to Parquet bytes using Polars."""
    if file_type == "parquet":
        return file_bytes

    if file_type == "csv":
        with tempfile.NamedTemporaryFile(suffix=".csv", delete=False) as tmp:
            tmp.write(file_bytes)
            tmp_path = tmp.name
        try:
            df = pl.scan_csv(tmp_path, infer_schema_length=10_000, ignore_errors=True).collect()
            buf = io.BytesIO()
            df.write_parquet(buf, compression="snappy")
            return buf.getvalue()
        finally:
            if os.path.exists(tmp_path):
                os.unlink(tmp_path)

    elif file_type == "json":
        import json
        data = json.loads(file_bytes.decode("utf-8-sig"))
        df = pl.DataFrame(data if isinstance(data, list) else [data])
        buf = io.BytesIO()
        df.write_parquet(buf, compression="snappy")
        return buf.getvalue()

    # Fallback: treat as CSV
    df = pl.read_csv(io.BytesIO(file_bytes), ignore_errors=True)
    buf = io.BytesIO()
    df.write_parquet(buf, compression="snappy")
    return buf.getvalue()


def create_dataset_version(
    dataset_id: str,
    project_id: str,
    file_bytes: bytes,
    file_type: str = "csv",
    action_name: str = "transformation",
    action_details: Optional[Dict[str, Any]] = None,
    metrics: Optional[Dict[str, Any]] = None,
    parent_version_id: Optional[str] = None,
    quality_score: Optional[float] = None,
) -> dict[str, Any]:
    """
    Snapshot the dataset state into an immutable version:
    1. Determines version number (v0 for original, vN for transformations).
    2. Converts to columnar Parquet format and saves to storage.
    3. Saves CSV copy for instant download.
    4. Records version in repository.
    """
    existing_versions = list_versions(dataset_id)
    if not existing_versions:
        if "Initial" in action_name or action_name == "transformation":
            version_number = 0
            parent_id = None
            action_title = action_name if action_name != "transformation" else "Initial Dataset Ingest (v0 Original)"
        else:
            # First cleaning action on a dataset that didn't have v0 recorded
            try:
                from app.database.repositories.datasets import get_dataset
                ds = get_dataset(dataset_id)
                if ds and ds.get("storage_path"):
                    v0_row = {
                        "dataset_id": dataset_id,
                        "version_number": 0,
                        "parent_version_id": None,
                        "storage_path": ds["storage_path"],
                        "file_type": "csv",
                        "metrics_json": ds.get("profile_json", {}).get("shape", {}),
                        "created_by_action": "Initial Dataset Ingest (v0 Original)",
                        "action_details": {},
                        "is_current": False,
                    }
                    saved_v0 = save_version(v0_row)
                    parent_id = saved_v0.get("id")
                else:
                    parent_id = None
            except Exception as exc:
                logger.debug(f"Could not synthesize v0 on first clean: {exc}")
                parent_id = None
            version_number = 1
            action_title = action_name
    else:
        max_v = max(v.get("version_number", 0) for v in existing_versions)
        version_number = max_v + 1
        current_v = get_current_version(dataset_id)
        parent_id = parent_version_id or (current_v.get("id") if current_v else existing_versions[-1].get("id"))
        action_title = action_name

    logger.info(f"Creating version v{version_number} for dataset {dataset_id} (parent={parent_id})")

    # 1. Convert to Parquet
    try:
        parquet_bytes = convert_to_parquet(file_bytes, file_type)
    except Exception as exc:
        logger.warning(f"Parquet conversion failed ({exc}); falling back to raw bytes.")
        parquet_bytes = file_bytes

    # 2. Upload Parquet version to Storage
    parquet_storage_path = f"datasets/versions/{project_id}/{dataset_id}/v{version_number}.parquet"
    try:
        upload_file(parquet_storage_path, parquet_bytes, content_type="application/octet-stream")
    except Exception as exc:
        logger.warning(f"Could not upload Parquet version to Storage ({exc})")

    # 3. Upload CSV copy for direct download compatibility
    csv_storage_path = f"datasets/versions/{project_id}/{dataset_id}/v{version_number}.csv"
    try:
        csv_bytes = file_bytes if file_type == "csv" else pl.read_parquet(io.BytesIO(parquet_bytes)).write_csv().encode()
        upload_file(csv_storage_path, csv_bytes, content_type="text/csv")
    except Exception as exc:
        logger.warning(f"Could not upload CSV version to Storage ({exc})")

    # 4. Measure metrics if not passed
    computed_metrics = metrics or {}
    if not computed_metrics:
        try:
            with tempfile.NamedTemporaryFile(suffix=".parquet", delete=False) as tmp:
                tmp.write(parquet_bytes)
                tmp_path = tmp.name
            try:
                df = pl.scan_parquet(tmp_path).collect()
                computed_metrics = {
                    "rows": df.shape[0],
                    "columns": df.shape[1],
                    "total_null_pct": round((df.null_count().sum(axis=1)[0, 0] / (df.shape[0] * df.shape[1])) * 100.0, 2) if df.shape[0] > 0 else 0.0,
                }
            finally:
                if os.path.exists(tmp_path):
                    os.unlink(tmp_path)
        except Exception:
            computed_metrics = {"rows": 0, "columns": 0, "total_null_pct": 0.0}

    # 5. Persist Version Record
    version_row = {
        "dataset_id": dataset_id,
        "version_number": version_number,
        "parent_version_id": parent_id,
        "storage_path": csv_storage_path,
        "file_type": "parquet",
        "quality_score": quality_score,
        "metrics_json": computed_metrics,
        "created_by_action": action_title,
        "action_details": action_details or {},
    }

    created = save_version(version_row)
    return created
