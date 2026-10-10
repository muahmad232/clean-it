"""
Dataset Versions repository — Phase 11.

Persists and retrieves dataset versions in the `data_agent.dataset_versions` table.
Includes graceful fallback to reading/writing from `datasets.profile_json['versions']`
if the database table has not yet been migrated in Supabase.
"""

from __future__ import annotations
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from app.core.logging import get_logger
from app.database.client import get_service_client
from app.database.repositories.datasets import get_dataset, update_dataset_profile

logger = get_logger(__name__)
SCHEMA = "data_agent"
TABLE = "dataset_versions"


def save_version(version_data: dict[str, Any]) -> dict[str, Any]:
    """
    Persist a new version snapshot.
    Unsets previous current version and marks the new version as current.
    """
    client = get_service_client()
    dataset_id = version_data["dataset_id"]
    version_id = version_data.get("id") or str(uuid.uuid4())
    version_data["id"] = version_id
    if "created_at" not in version_data:
        version_data["created_at"] = datetime.now(timezone.utc).isoformat()

    row = {
        "id": version_id,
        "dataset_id": dataset_id,
        "version_number": version_data["version_number"],
        "parent_version_id": version_data.get("parent_version_id"),
        "storage_path": version_data["storage_path"],
        "file_type": version_data.get("file_type", "parquet"),
        "quality_score": version_data.get("quality_score"),
        "metrics_json": version_data.get("metrics_json", {}),
        "created_by_action": version_data.get("created_by_action", "transformation"),
        "action_details": version_data.get("action_details", {}),
        "is_current": True,
        "created_at": version_data["created_at"],
    }

    try:
        # 1. Unset is_current on existing versions for this dataset
        client.schema(SCHEMA).table(TABLE).update({"is_current": False}).eq("dataset_id", dataset_id).execute()
        # 2. Insert new current version
        res = client.schema(SCHEMA).table(TABLE).insert(row).execute()
        saved = res.data[0] if res.data else row
        logger.info(f"Persisted version v{row['version_number']} for dataset {dataset_id}")
        _sync_version_to_profile(dataset_id, saved)
        return saved
    except Exception as exc:
        logger.warning(f"Could not persist version to DB table ({exc}). Falling back to dataset profile_json.")
        return _save_version_to_profile(dataset_id, row)


def list_versions(dataset_id: str) -> list[dict[str, Any]]:
    """List all versions for a dataset sorted by version_number ASC."""
    client = get_service_client()
    db_versions: list[dict[str, Any]] = []
    try:
        res = (
            client.schema(SCHEMA)
            .table(TABLE)
            .select("*")
            .eq("dataset_id", dataset_id)
            .order("version_number", desc=False)
            .execute()
        )
        if res.data and len(res.data) > 0:
            db_versions = res.data
    except Exception as exc:
        logger.debug(f"DB list_versions failed: {exc}. Reading from profile_json.")

    # Also check profile_json fallback
    profile_versions: list[dict[str, Any]] = []
    try:
        ds = get_dataset(dataset_id)
        if ds:
            profile_json = ds.get("profile_json") or {}
            profile_versions = profile_json.get("versions", [])
    except Exception as exc:
        logger.debug(f"Could not load fallback versions from dataset {dataset_id}: {exc}")

    if db_versions and not profile_versions:
        return db_versions
    if profile_versions and not db_versions:
        return profile_versions
    if db_versions and profile_versions:
        # Merge by id or version_number so no snapshots are lost
        combined: dict[str, dict[str, Any]] = {
            str(v.get("id") or v.get("version_number")): v for v in profile_versions
        }
        for v in db_versions:
            combined[str(v.get("id") or v.get("version_number"))] = v
        return sorted(combined.values(), key=lambda x: x.get("version_number", 0))

    return []


def get_version(dataset_id: str, version_id: str) -> Optional[dict[str, Any]]:
    """Fetch a single version by UUID."""
    client = get_service_client()
    try:
        res = (
            client.schema(SCHEMA)
            .table(TABLE)
            .select("*")
            .eq("dataset_id", dataset_id)
            .eq("id", version_id)
            .execute()
        )
        if res.data and len(res.data) > 0:
            return res.data[0]
    except Exception as exc:
        logger.debug(f"DB get_version failed: {exc}")

    # Fallback
    versions = list_versions(dataset_id)
    for v in versions:
        if v.get("id") == version_id or str(v.get("version_number")) == str(version_id):
            return v
    return None


def get_version_by_number(dataset_id: str, version_number: int) -> Optional[dict[str, Any]]:
    """Fetch a version by its integer version_number."""
    client = get_service_client()
    try:
        res = (
            client.schema(SCHEMA)
            .table(TABLE)
            .select("*")
            .eq("dataset_id", dataset_id)
            .eq("version_number", version_number)
            .execute()
        )
        if res.data and len(res.data) > 0:
            return res.data[0]
    except Exception as exc:
        logger.debug(f"DB get_version_by_number failed: {exc}")

    versions = list_versions(dataset_id)
    for v in versions:
        if v.get("version_number") == version_number:
            return v
    return None


def get_current_version(dataset_id: str) -> Optional[dict[str, Any]]:
    """Fetch the currently active version for a dataset."""
    client = get_service_client()
    try:
        res = (
            client.schema(SCHEMA)
            .table(TABLE)
            .select("*")
            .eq("dataset_id", dataset_id)
            .eq("is_current", True)
            .execute()
        )
        if res.data and len(res.data) > 0:
            return res.data[0]
    except Exception as exc:
        logger.debug(f"DB get_current_version failed: {exc}")

    # Fallback to direct profile_json
    try:
        ds = get_dataset(dataset_id)
        if ds:
            p_json = ds.get("profile_json") or {}
            if p_json.get("current_version"):
                return p_json["current_version"]
    except Exception:
        pass

    versions = list_versions(dataset_id)
    for v in reversed(versions):
        if v.get("is_current", False):
            return v
    return versions[-1] if versions else None


def set_current_version(dataset_id: str, version_id: str) -> dict[str, Any]:
    """Set the specified version as is_current=True, and all others as False."""
    client = get_service_client()
    matched = None
    try:
        client.schema(SCHEMA).table(TABLE).update({"is_current": False}).eq("dataset_id", dataset_id).execute()
        res = (
            client.schema(SCHEMA)
            .table(TABLE)
            .update({"is_current": True})
            .eq("dataset_id", dataset_id)
            .eq("id", version_id)
            .execute()
        )
        if res.data:
            matched = res.data[0]
    except Exception as exc:
        logger.debug(f"DB set_current_version failed: {exc}")

    # Keep profile_json and datasets table in sync
    ds = get_dataset(dataset_id)
    if ds:
        profile_json = ds.get("profile_json") or {}
        versions = profile_json.get("versions", [])
        for v in versions:
            if v.get("id") == version_id or str(v.get("version_number")) == str(version_id):
                v["is_current"] = True
                if not matched:
                    matched = v
            else:
                v["is_current"] = False
        profile_json["versions"] = versions
        if matched:
            profile_json["current_version"] = matched
            profile_json["version_number"] = matched.get("version_number")
        try:
            up: dict[str, Any] = {"profile_json": profile_json}
            if matched and matched.get("id"):
                up["current_version_id"] = matched.get("id")
            client.schema(SCHEMA).table("datasets").update(up).eq("id", dataset_id).execute()
        except Exception as exc:
            logger.debug(f"Direct profile_json update failed: {exc}")
        if matched:
            return matched

    return matched or {"dataset_id": dataset_id, "id": version_id, "is_current": True}


# ── Private Profile JSON Fallback & Sync ────────────────────────────

def _sync_version_to_profile(dataset_id: str, row: dict[str, Any]) -> None:
    try:
        ds = get_dataset(dataset_id)
        if not ds:
            return
        profile_json = ds.get("profile_json") or {}
        versions = profile_json.get("versions", [])
        updated = False
        for v in versions:
            if v.get("id") == row.get("id") or str(v.get("version_number")) == str(row.get("version_number")):
                v.update(row)
                v["is_current"] = True
                updated = True
            else:
                v["is_current"] = False
        if not updated:
            row_copy = dict(row)
            row_copy["is_current"] = True
            versions.append(row_copy)
        profile_json["versions"] = versions
        profile_json["current_version"] = row
        profile_json["version_number"] = row.get("version_number")

        client = get_service_client()
        up: dict[str, Any] = {"profile_json": profile_json}
        if row.get("id"):
            up["current_version_id"] = row.get("id")
        client.schema(SCHEMA).table("datasets").update(up).eq("id", dataset_id).execute()
    except Exception as exc:
        logger.debug(f"Direct profile_json sync failed: {exc}")


def _save_version_to_profile(dataset_id: str, row: dict[str, Any]) -> dict[str, Any]:
    try:
        ds = get_dataset(dataset_id)
        if not ds:
            return row
        profile_json = ds.get("profile_json") or {}
        versions = profile_json.get("versions", [])
        # Unset is_current on existing
        updated = False
        for v in versions:
            if v.get("id") == row.get("id") or str(v.get("version_number")) == str(row.get("version_number")):
                v.update(row)
                v["is_current"] = True
                updated = True
            else:
                v["is_current"] = False
        if not updated:
            row["is_current"] = True
            versions.append(row)
        profile_json["versions"] = versions
        profile_json["current_version"] = row
        profile_json["version_number"] = row.get("version_number")

        client = get_service_client()
        up: dict[str, Any] = {"profile_json": profile_json}
        if row.get("id"):
            up["current_version_id"] = row.get("id")
        client.schema(SCHEMA).table("datasets").update(up).eq("id", dataset_id).execute()
    except Exception as exc:
        logger.debug(f"Direct profile_json update failed: {exc}")
    return row
