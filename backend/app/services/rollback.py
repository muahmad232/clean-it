"""
Dataset Rollback Service — Phase 11.

Allows reversible recovery of datasets by rolling back to a parent snapshot
or specific version.
Rule: Original dataset (v0) can NEVER be rolled back past — it is immutable.
"""

from __future__ import annotations

from typing import Any, Dict, Optional

from app.core.logging import get_logger
from app.database.client import get_service_client
from app.database.repositories.datasets import get_dataset, update_dataset_profile
from app.database.repositories.versions import (
    get_current_version,
    get_version,
    get_version_by_number,
    set_current_version,
    list_versions,
)

logger = get_logger(__name__)


def rollback_dataset_version(
    dataset_id: str,
    target_version_id: Optional[str] = None,
    reason: Optional[str] = "User requested rollback",
) -> dict[str, Any]:
    """
    Rolls back dataset to parent or specific target version:
    1. Validates immutability constraint: cannot rollback past v0.
    2. Identifies target version snapshot.
    3. Updates database pointer and active working storage path.
    4. Sets target version as current.
    """
    dataset = get_dataset(dataset_id)
    if not dataset:
        raise ValueError(f"Dataset '{dataset_id}' not found.")

    current_version = get_current_version(dataset_id)
    all_versions = list_versions(dataset_id)

    if not all_versions:
        raise ValueError(f"No version history found for dataset '{dataset_id}'.")

    # If target is not explicitly specified, find parent of current version
    target_version = None
    if target_version_id:
        target_version = get_version(dataset_id, target_version_id)
        if not target_version:
            # Try by integer version_number
            try:
                v_num = int(target_version_id)
                target_version = get_version_by_number(dataset_id, v_num)
            except ValueError:
                pass
        if not target_version:
            raise ValueError(f"Target version '{target_version_id}' not found.")
    else:
        # Default: rollback to parent of current
        if not current_version or current_version.get("version_number", 0) == 0:
            raise ValueError("Original dataset (v0) cannot be rolled back past — it is immutable.")

        parent_id = current_version.get("parent_version_id")
        if parent_id:
            target_version = get_version(dataset_id, parent_id)
        if not target_version:
            # Fallback to v(N-1)
            target_num = current_version.get("version_number", 1) - 1
            target_version = get_version_by_number(dataset_id, target_num)

    if not target_version:
        raise ValueError("Could not determine valid rollback parent version.")

    target_num = target_version.get("version_number", 0)
    current_num = current_version.get("version_number", 0) if current_version else None

    logger.info(f"Rolling back dataset {dataset_id} from v{current_num} -> v{target_num} (reason: {reason})")

    # 1. Update version current flag in DB/repository
    set_current_version(dataset_id, target_version["id"])

    # 2. Update dataset row in PostgreSQL
    client = get_service_client()
    metrics = target_version.get("metrics_json") or {}

    profile_json = dataset.get("profile_json") or {}
    if target_num == 0:
        # Reverted to immutable original!
        cleaned_path = None
        status = "UPLOADED"
        profile_json["cleaned_storage_path"] = None
    else:
        cleaned_path = target_version.get("storage_path")
        status = "COMPLETED"
        profile_json["cleaned_storage_path"] = cleaned_path

    # Synchronize shape & nulls if recorded in version metrics
    if "rows" in metrics:
        profile_json["shape"] = {"rows": metrics["rows"], "columns": metrics.get("columns", 0)}
    if "total_null_pct" in metrics:
        profile_json["total_null_pct"] = metrics["total_null_pct"]

    update_dataset_profile(dataset_id, profile_json)

    try:
        update_data = {
            "status": status,
        }
        if "rows" in metrics:
            update_data["row_count"] = metrics["rows"]
        if "columns" in metrics:
            update_data["column_count"] = metrics["columns"]

        client.schema("data_agent").table("datasets").update(update_data).eq("id", dataset_id).execute()
    except Exception as exc:
        logger.warning(f"Could not update dataset record after rollback: {exc}")

    return {
        "dataset_id": dataset_id,
        "rolled_back_to_version": target_num,
        "version_id": target_version.get("id", ""),
        "storage_path": target_version.get("storage_path", "") or "",
        "metrics": metrics,
        "previous_version": current_num,
        "current_version": target_num,
        "target_version": target_version,
        "final_profile": profile_json,
        "message": f"Successfully rolled back to version v{target_num} ({target_version.get('created_by_action')}).",
    }
