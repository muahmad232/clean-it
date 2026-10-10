"""
Repository for projects and datasets.

All DB operations target the 'data_agent' schema using the service-role
client. Queries use the PostgREST API via the Supabase Python SDK.

Schema: data_agent
Tables: projects, datasets
"""

from __future__ import annotations
import uuid
from typing import Optional
from datetime import datetime

from app.database.client import get_service_client
from app.models.dataset import ProjectCreate, DatasetCreate
from app.core.logging import get_logger

logger = get_logger(__name__)

# All tables live in the 'data_agent' schema.
# Supabase SDK targets tables by name; schema is set via search_path
# or by using the schema() method where supported.
# We use explicit schema-qualified table references via rpc or
# the schema() chained call available in supabase-py v2.
SCHEMA = "data_agent"


# ══════════════════════════════════════════════════════════════════
# PROJECTS
# ══════════════════════════════════════════════════════════════════

def create_project(user_id: str, payload: ProjectCreate) -> dict:
    """Insert a new project row. Returns the created record."""
    client = get_service_client()
    row = {
        "user_id": user_id,
        "name": payload.name,
        "description": payload.description,
    }
    result = (
        client.schema(SCHEMA)
        .table("projects")
        .insert(row)
        .execute()
    )
    record = result.data[0]
    logger.info(f"Created project id={record['id']} user={user_id}")
    return record


def get_project(project_id: str) -> Optional[dict]:
    """Fetch a single project by id. Returns None if not found."""
    client = get_service_client()
    result = (
        client.schema(SCHEMA)
        .table("projects")
        .select("*")
        .eq("id", project_id)
        .limit(1)
        .execute()
    )
    return result.data[0] if result.data else None


def list_projects(user_id: str) -> list[dict]:
    """Return all projects belonging to user_id, newest first."""
    client = get_service_client()
    result = (
        client.schema(SCHEMA)
        .table("projects")
        .select("id, name, description, created_at")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .execute()
    )
    return result.data


def claim_project(project_id: str, new_user_id: str) -> Optional[dict]:
    """Reassign project ownership to new_user_id."""
    client = get_service_client()
    result = (
        client.schema(SCHEMA)
        .table("projects")
        .update({"user_id": new_user_id})
        .eq("id", project_id)
        .execute()
    )
    if result.data:
        logger.info(f"Claimed project id={project_id} for user={new_user_id}")
        return result.data[0]
    return None



# ══════════════════════════════════════════════════════════════════
# DATASETS
# ══════════════════════════════════════════════════════════════════

def create_dataset(project_id: str, payload: DatasetCreate) -> dict:
    """Insert a new dataset metadata row. Returns the created record."""
    client = get_service_client()
    row = {
        "project_id": project_id,
        "original_filename": payload.original_filename,
        "file_type": payload.file_type,
        "file_size": payload.file_size,
        "task_type": payload.task_type,
        "target_column": payload.target_column,
        "status": "PENDING_UPLOAD",
    }
    result = (
        client.schema(SCHEMA)
        .table("datasets")
        .insert(row)
        .execute()
    )
    record = result.data[0]
    logger.info(f"Created dataset id={record['id']} project={project_id}")
    return record


def get_dataset(dataset_id: str) -> Optional[dict]:
    """Fetch a single dataset by id. Returns None if not found."""
    client = get_service_client()
    result = (
        client.schema(SCHEMA)
        .table("datasets")
        .select("*")
        .eq("id", dataset_id)
        .limit(1)
        .execute()
    )
    return result.data[0] if result.data else None


def list_datasets(project_id: str) -> list[dict]:
    """Return all datasets for a project, newest first."""
    client = get_service_client()
    result = (
        client.schema(SCHEMA)
        .table("datasets")
        .select("id, original_filename, file_type, file_size, status, created_at")
        .eq("project_id", project_id)
        .order("created_at", desc=True)
        .execute()
    )
    return result.data


def update_dataset_status(dataset_id: str, status: str, extra: Optional[dict] = None) -> dict:
    """
    Update a dataset's status field and optionally other fields.

    extra: dict of additional columns to update (e.g. storage_path, row_count).
    """
    client = get_service_client()
    payload = {"status": status}
    if extra:
        payload.update(extra)
    result = (
        client.schema(SCHEMA)
        .table("datasets")
        .update(payload)
        .eq("id", dataset_id)
        .execute()
    )
    record = result.data[0]
    logger.info(f"Updated dataset id={dataset_id} status={status}")
    return record


def update_dataset_profile(dataset_id: str, profile_dict: dict) -> dict:
    """
    Persist a completed profile to the datasets row.

    Sets:
      - profile_json  (JSONB)
      - profiled_at   (now)
      - status        → COMPLETED (if not already cleaned/approved)
    """
    from datetime import datetime, timezone
    import json as _json

    client = get_service_client()
    existing = get_dataset(dataset_id)
    existing_status = existing.get("status") if existing else None
    
    # Preserve version lineage & cleaned file path if not in incoming profile_dict
    if existing:
        old_pj = existing.get("profile_json") or {}
        for key in ["versions", "current_version", "version_number", "cleaned_storage_path", "self_healing_report", "latest_comparison"]:
            if key in old_pj and key not in profile_dict:
                profile_dict[key] = old_pj[key]

    new_status = "COMPLETED"
    if existing_status in ["CLEANED", "CONVERGED", "WAITING_APPROVAL", "ROLLED_BACK"]:
        new_status = existing_status

    payload: dict = {
        "profile_json": profile_dict,
        "profiled_at": datetime.now(timezone.utc).isoformat(),
        "status": new_status,
        # Update row/column counts from the profile if present
        "row_count": profile_dict.get("shape", {}).get("rows"),
        "column_count": profile_dict.get("shape", {}).get("columns"),
    }

    # If current_version has an id, attempt setting current_version_id safely
    curr_v = profile_dict.get("current_version")
    if curr_v and curr_v.get("id"):
        payload["current_version_id"] = curr_v.get("id")

    try:
        result = (
            client.schema(SCHEMA)
            .table("datasets")
            .update(payload)
            .eq("id", dataset_id)
            .execute()
        )
    except Exception:
        # Fallback if column does not exist
        payload.pop("current_version_id", None)
        result = (
            client.schema(SCHEMA)
            .table("datasets")
            .update(payload)
            .eq("id", dataset_id)
            .execute()
        )

    record = result.data[0] if result.data else {}
    logger.info(f"Profile saved for dataset id={dataset_id} rows={payload['row_count']}")
    return record


def delete_dataset(dataset_id: str) -> bool:
    """Delete a dataset, its files in Supabase Storage, and associated issue rows."""
    from app.storage.supabase import delete_file

    client = get_service_client()
    dataset = get_dataset(dataset_id)
    if not dataset:
        return False

    # 1. Clean up storage files
    storage_path = dataset.get("storage_path")
    if storage_path:
        delete_file(storage_path)

    profile_json = dataset.get("profile_json") or {}
    cleaned_path = profile_json.get("cleaned_storage_path")
    if cleaned_path:
        delete_file(cleaned_path)

    # 2. Delete issues
    try:
        client.schema(SCHEMA).table("issues").delete().eq("dataset_id", dataset_id).execute()
    except Exception as exc:
        logger.warning(f"Could not delete issues for dataset {dataset_id}: {exc}")

    # 3. Delete dataset record
    client.schema(SCHEMA).table("datasets").delete().eq("id", dataset_id).execute()
    logger.info(f"Deleted dataset id={dataset_id}")
    return True


def delete_project(project_id: str, user_id: Optional[str] = None) -> bool:
    """Delete a project and all its child datasets and files."""
    client = get_service_client()
    query = client.schema(SCHEMA).table("projects").select("id, user_id").eq("id", project_id)
    if user_id:
        query = query.eq("user_id", user_id)
    res = query.limit(1).execute()
    if not res.data:
        return False

    # Find and delete all datasets in project
    datasets_res = client.schema(SCHEMA).table("datasets").select("id").eq("project_id", project_id).execute()
    for row in (datasets_res.data or []):
        delete_dataset(row["id"])

    # Delete project
    client.schema(SCHEMA).table("projects").delete().eq("id", project_id).execute()
    logger.info(f"Deleted project id={project_id}")
    return True


def list_user_datasets(user_id: str) -> list[dict]:
    """Return all datasets across all projects belonging to user_id, with 10-day retention metadata."""
    from datetime import datetime, timezone, timedelta

    client = get_service_client()
    # 1. Fetch user's projects
    projects_res = client.schema(SCHEMA).table("projects").select("id, name").eq("user_id", user_id).execute()
    projects = {p["id"]: p["name"] for p in (projects_res.data or [])}

    if not projects:
        return []

    project_ids = list(projects.keys())
    # 2. Fetch datasets in those projects
    datasets_res = (
        client.schema(SCHEMA)
        .table("datasets")
        .select("id, project_id, original_filename, file_type, file_size, row_count, column_count, task_type, status, created_at, profile_json")
        .in_("project_id", project_ids)
        .order("created_at", desc=True)
        .execute()
    )

    now = datetime.now(timezone.utc)
    enriched = []
    for d in (datasets_res.data or []):
        d["project_name"] = projects.get(d["project_id"], "Project")

        # Expiry computation (10-day retention)
        created_at_str = d.get("created_at")
        expires_at_str = d.get("expires_at")

        expires_dt = None
        if expires_at_str:
            try:
                expires_dt = datetime.fromisoformat(expires_at_str.replace("Z", "+00:00"))
            except Exception:
                pass

        if not expires_dt and created_at_str:
            try:
                created_dt = datetime.fromisoformat(created_at_str.replace("Z", "+00:00"))
                expires_dt = created_dt + timedelta(days=10)
                d["expires_at"] = expires_dt.isoformat()
            except Exception:
                pass

        if expires_dt:
            is_expired = now > expires_dt
            diff = expires_dt - now
            d["is_expired"] = is_expired
            d["days_remaining"] = max(0, diff.days) if not is_expired else 0
            d["hours_remaining"] = max(0, int(diff.total_seconds() // 3600)) if not is_expired else 0
        else:
            d["is_expired"] = False
            d["days_remaining"] = 10
            d["hours_remaining"] = 240

        # Has cleaned download?
        profile_json = d.get("profile_json") or {}
        d["has_cleaned"] = bool(profile_json.get("cleaned_storage_path"))
        d["cleaning_report"] = profile_json.get("cleaning_report")
        enriched.append(d)

    return enriched


def cleanup_expired_datasets() -> int:
    """Find and delete datasets that have exceeded their 10-day retention period."""
    from datetime import datetime, timezone, timedelta

    client = get_service_client()
    now = datetime.now(timezone.utc)
    ten_days_ago = (now - timedelta(days=10)).isoformat()

    try:
        res = client.schema(SCHEMA).table("datasets").select("id").lt("expires_at", now.isoformat()).execute()
        expired_ids = [row["id"] for row in (res.data or [])]
    except Exception:
        # Fallback if expires_at column not present in DB
        res = client.schema(SCHEMA).table("datasets").select("id").lt("created_at", ten_days_ago).execute()
        expired_ids = [row["id"] for row in (res.data or [])]

    count = 0
    for d_id in expired_ids:
        try:
            if delete_dataset(d_id):
                count += 1
        except Exception as e:
            logger.error(f"Failed deleting expired dataset {d_id}: {e}")

    logger.info(f"Retention cleanup: deleted {count} expired datasets")
    return count
