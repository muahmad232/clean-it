"""
Action Approvals Repository — Phase 12.

Persists and manages human approvals in the `data_agent.action_approvals` table.
Includes graceful fallback to reading/writing from `datasets.profile_json['pending_approvals']`
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
TABLE = "action_approvals"


def save_approval(approval_data: dict[str, Any]) -> dict[str, Any]:
    """Persist a new action approval record (defaults to PENDING)."""
    client = get_service_client()
    dataset_id = approval_data["dataset_id"]
    approval_id = approval_data.get("id") or str(uuid.uuid4())
    approval_data["id"] = approval_id
    if "created_at" not in approval_data:
        approval_data["created_at"] = datetime.now(timezone.utc).isoformat()

    row = {
        "id": approval_id,
        "dataset_id": dataset_id,
        "project_id": approval_data.get("project_id"),
        "action_type": approval_data["action_type"],
        "target_columns": approval_data.get("target_columns", []),
        "parameters": approval_data.get("parameters", {}),
        "reasoning": approval_data.get("reasoning", ""),
        "risk_level": approval_data.get("risk_level", "HIGH"),
        "confidence": approval_data.get("confidence", 0.95),
        "rows_affected_est": approval_data.get("rows_affected_est", 0),
        "status": approval_data.get("status", "PENDING"),
        "user_feedback": approval_data.get("user_feedback"),
        "created_at": approval_data["created_at"],
        "resolved_at": approval_data.get("resolved_at"),
    }

    try:
        res = client.schema(SCHEMA).table(TABLE).insert(row).execute()
        saved = res.data[0] if res.data else row
        logger.info(f"Persisted approval record {approval_id} for dataset {dataset_id}")
        return saved
    except Exception as exc:
        logger.warning(f"Could not persist approval to DB table ({exc}). Falling back to dataset profile_json.")
        return _save_approval_to_profile(dataset_id, row)


def list_approvals(dataset_id: str, status_filter: Optional[str] = "PENDING") -> list[dict[str, Any]]:
    """List approval records for a dataset, optionally filtered by status."""
    client = get_service_client()
    try:
        query = client.schema(SCHEMA).table(TABLE).select("*").eq("dataset_id", dataset_id)
        if status_filter:
            query = query.eq("status", status_filter)
        res = query.order("created_at", desc=True).execute()
        if res.data is not None:
            return res.data
    except Exception as exc:
        logger.debug(f"DB list_approvals failed: {exc}. Reading from profile_json.")

    # Fallback to profile_json
    try:
        ds = get_dataset(dataset_id)
        if ds:
            profile_json = ds.get("profile_json") or {}
            items = profile_json.get("pending_approvals", [])
            if status_filter:
                return [a for a in items if a.get("status") == status_filter]
            return items
    except Exception as exc:
        logger.debug(f"Could not load fallback approvals from dataset {dataset_id}: {exc}")
    return []


def get_approval(dataset_id: str, approval_id: str) -> Optional[dict[str, Any]]:
    """Fetch a single approval record by ID."""
    client = get_service_client()
    try:
        res = (
            client.schema(SCHEMA)
            .table(TABLE)
            .select("*")
            .eq("dataset_id", dataset_id)
            .eq("id", approval_id)
            .execute()
        )
        if res.data and len(res.data) > 0:
            return res.data[0]
    except Exception as exc:
        logger.debug(f"DB get_approval failed: {exc}")

    # Fallback
    all_apprs = list_approvals(dataset_id, status_filter=None)
    for a in all_apprs:
        if a.get("id") == approval_id:
            return a
    return None


def update_approval_status(
    dataset_id: str,
    approval_id: str,
    new_status: str,
    feedback: Optional[str] = None,
) -> Optional[dict[str, Any]]:
    """Update approval status (e.g. APPROVED or REJECTED) and resolved_at timestamp."""
    client = get_service_client()
    now_str = datetime.now(timezone.utc).isoformat()
    update_fields: dict[str, Any] = {
        "status": new_status,
        "resolved_at": now_str,
    }
    if feedback is not None:
        update_fields["user_feedback"] = feedback

    try:
        res = (
            client.schema(SCHEMA)
            .table(TABLE)
            .update(update_fields)
            .eq("dataset_id", dataset_id)
            .eq("id", approval_id)
            .execute()
        )
        if res.data and len(res.data) > 0:
            logger.info(f"Updated approval {approval_id} -> {new_status}")
            return res.data[0]
    except Exception as exc:
        logger.debug(f"DB update_approval_status failed: {exc}")

    # Fallback to profile_json
    try:
        ds = get_dataset(dataset_id)
        if ds:
            profile_json = ds.get("profile_json") or {}
            items = profile_json.get("pending_approvals", [])
            matched = None
            for a in items:
                if a.get("id") == approval_id:
                    a["status"] = new_status
                    a["resolved_at"] = now_str
                    if feedback is not None:
                        a["user_feedback"] = feedback
                    matched = a
            profile_json["pending_approvals"] = items
            update_dataset_profile(dataset_id, profile_json)
            if matched:
                return matched
    except Exception as exc:
        logger.debug(f"Fallback update_approval_status failed: {exc}")

    return {
        "id": approval_id,
        "dataset_id": dataset_id,
        "status": new_status,
        "resolved_at": now_str,
        "user_feedback": feedback,
    }


def clear_pending_approvals(dataset_id: str) -> None:
    """Clear or mark rejected all remaining pending approvals for a dataset."""
    client = get_service_client()
    now_str = datetime.now(timezone.utc).isoformat()
    try:
        client.schema(SCHEMA).table(TABLE).update({
            "status": "REJECTED",
            "resolved_at": now_str,
            "user_feedback": "Superseded or cancelled",
        }).eq("dataset_id", dataset_id).eq("status", "PENDING").execute()
    except Exception as exc:
        logger.debug(f"DB clear_pending_approvals failed: {exc}")

    try:
        ds = get_dataset(dataset_id)
        if ds:
            profile_json = ds.get("profile_json") or {}
            items = profile_json.get("pending_approvals", [])
            for a in items:
                if a.get("status") == "PENDING":
                    a["status"] = "REJECTED"
                    a["resolved_at"] = now_str
            profile_json["pending_approvals"] = items
            update_dataset_profile(dataset_id, profile_json)
    except Exception:
        pass


# ── Private Profile Fallback ────────────────────────────────────────

def _save_approval_to_profile(dataset_id: str, row: dict[str, Any]) -> dict[str, Any]:
    try:
        ds = get_dataset(dataset_id)
        if not ds:
            return row
        profile_json = ds.get("profile_json") or {}
        items = profile_json.get("pending_approvals", [])
        # Overwrite if exists, else append
        existing_idx = next((i for i, a in enumerate(items) if a.get("id") == row["id"]), None)
        if existing_idx is not None:
            items[existing_idx] = row
        else:
            items.append(row)
        profile_json["pending_approvals"] = items
        ds["profile_json"] = profile_json
        update_dataset_profile(dataset_id, profile_json)
    except Exception as exc:
        logger.debug(f"Direct profile_json update failed for approval: {exc}")
    return row
