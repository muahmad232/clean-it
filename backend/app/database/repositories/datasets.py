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
