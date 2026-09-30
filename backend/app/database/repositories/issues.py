"""
Issues repository — Phase 5.

Persists and retrieves detected issues in the `data_agent.issues` table.
Includes graceful fallback to reading/writing from `datasets.profile_json`
if the database table has not yet been migrated in Supabase.
"""

from __future__ import annotations

from typing import Any, Optional
from uuid import UUID

from app.core.logging import get_logger
from app.database.client import get_service_client
from app.database.repositories.datasets import get_dataset
from app.models.issue import Issue, IssueType, Severity, IssueStatus

logger = get_logger(__name__)
SCHEMA = "data_agent"
TABLE = "issues"


def save_issues(dataset_id: str, issues: list[Issue]) -> list[dict[str, Any]]:
    """
    Persist detected issues for a dataset.

    Attempts to insert rows into `data_agent.issues`.
    If the table does not exist or fails, logs and returns the dict representations.
    """
    if not issues:
        return []

    client = get_service_client()
    issue_dicts = [iss.to_dict() for iss in issues]

    # Prepare rows for DB insertion
    rows = []
    for d in issue_dicts:
        rows.append({
            "id": d["id"],
            "dataset_id": dataset_id,
            "agent_run_id": d.get("agent_run_id"),
            "issue_type": d["issue_type"],
            "column_name": d["column_name"],
            "severity": d["severity"],
            "confidence": d["confidence"],
            "description": d["description"],
            "evidence_json": d["evidence_json"],
            "status": d["status"],
            "created_at": d["created_at"],
        })

    try:
        # Delete existing issues for this dataset before inserting fresh ones (idempotent profiling)
        client.schema(SCHEMA).table(TABLE).delete().eq("dataset_id", dataset_id).execute()
        response = client.schema(SCHEMA).table(TABLE).insert(rows).execute()
        logger.info(f"Persisted {len(rows)} issues to {SCHEMA}.{TABLE} for dataset {dataset_id}")
        return response.data if response.data else issue_dicts
    except Exception as exc:
        logger.warning(
            f"Could not persist issues to {SCHEMA}.{TABLE} ({exc}). "
            "Falling back to embedded profile_json storage."
        )
        return issue_dicts


def get_issues_by_dataset(
    dataset_id: str,
    severity: Optional[str] = None,
    issue_type: Optional[str] = None,
    status_filter: Optional[str] = None,
) -> list[dict[str, Any]]:
    """
    Retrieve issues for a dataset, optionally filtered by severity, issue_type, or status.
    First queries the `issues` table; if unavailable, falls back to `profile_json['issues']`.
    """
    client = get_service_client()

    try:
        query = client.schema(SCHEMA).table(TABLE).select("*").eq("dataset_id", dataset_id)
        if severity:
            query = query.eq("severity", severity.upper())
        if issue_type:
            query = query.eq("issue_type", issue_type.upper())
        if status_filter:
            query = query.eq("status", status_filter.upper())

        res = query.order("created_at", desc=False).execute()
        if res.data:
            return res.data
    except Exception as exc:
        logger.debug(f"Direct query on {SCHEMA}.{TABLE} failed ({exc}); trying dataset profile_json fallback.")

    # Fallback: load issues from dataset.profile_json
    dataset = get_dataset(dataset_id)
    if not dataset:
        return []

    profile_json = dataset.get("profile_json") or {}
    raw_issues = profile_json.get("issues", [])

    results = []
    for item in raw_issues:
        # If stored as dict
        if isinstance(item, dict):
            if severity and item.get("severity", "").upper() != severity.upper():
                continue
            if issue_type and item.get("issue_type", "").upper() != issue_type.upper():
                continue
            if status_filter and item.get("status", "").upper() != status_filter.upper():
                continue
            results.append(item)
        elif isinstance(item, str):
            # Backward compatibility with string issues from Phase 4
            results.append({
                "description": item,
                "issue_type": "UNKNOWN",
                "severity": "MEDIUM",
                "status": "OPEN",
            })

    return results
