"""
Dataset Profile Comparison & Evaluation Router — Phase 13.

Endpoints:
- GET /api/v1/projects/{project_id}/datasets/{dataset_id}/compare
- GET /api/v1/datasets/{dataset_id}/compare
"""

from __future__ import annotations
import io
from typing import Optional
import polars as pl
from fastapi import APIRouter, HTTPException, Query, status

from app.core.logging import get_logger
from app.database.repositories.datasets import get_dataset, get_project
from app.database.repositories.versions import (
    get_current_version,
    get_version,
    get_version_by_number,
    list_versions,
)
from app.models.comparison import ComparisonReport
from app.services.comparison import compare_profiles, calculate_quality_score
from app.services.profiler import profile_dataset
from app.storage.supabase import download_file

logger = get_logger(__name__)

router = APIRouter(tags=["Dataset Comparison & Regression"])


@router.get(
    "/api/v1/projects/{project_id}/datasets/{dataset_id}/compare",
    summary="Compare dataset states or versions (Before vs After)",
    response_model=ComparisonReport,
)
def compare_dataset_versions_endpoint(
    project_id: str,
    dataset_id: str,
    v_old: Optional[str] = Query(default=None, description="Older version identifier (e.g. '0', 'v0', or UUID)"),
    v_new: Optional[str] = Query(default=None, description="Newer version identifier (e.g. '1', 'v1', or UUID)"),
):
    """
    Produce a Before/After comparison report between two dataset states or versions:
    - Calculates transparent Quality Score delta (0-100)
    - Detects regressions (quality drop > 5 pts, target distribution shift > 20%)
    - Provides a per-metric table with status indicators
    - Categorizes resolved vs newly introduced issues
    """
    dataset = get_dataset(dataset_id)
    if not dataset or dataset.get("project_id") != project_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "dataset_not_found", "message": f"Dataset '{dataset_id}' not found."},
        )

    all_versions = list_versions(dataset_id)
    target_col = dataset.get("target_column")

    # If no specific versions requested and a recent cached comparison is stored, check it
    profile_json = dataset.get("profile_json") or {}
    if not v_old and not v_new and "latest_comparison" in profile_json:
        try:
            return ComparisonReport(**profile_json["latest_comparison"])
        except Exception:
            pass

    # Resolve target versions
    old_version_row = None
    new_version_row = None

    if v_old:
        old_version_row = _resolve_version(dataset_id, v_old)
    if v_new:
        new_version_row = _resolve_version(dataset_id, v_new)

    # Defaults if not supplied
    if not old_version_row or not new_version_row:
        if len(all_versions) >= 2:
            # Compare latest two versions
            new_version_row = new_version_row or all_versions[-1]
            parent_id = new_version_row.get("parent_version_id")
            if parent_id:
                old_version_row = _resolve_version(dataset_id, parent_id)
            if not old_version_row:
                old_version_row = all_versions[-2]
        elif len(all_versions) == 1:
            # Only v0 exists
            old_version_row = all_versions[0]
            new_version_row = all_versions[0]
        else:
            # No version snapshots exist yet, build baseline comparison from original file
            raw_path = dataset.get("storage_path")
            if not raw_path:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail={"error": "no_data", "message": "Dataset has no versions or data files."},
                )
            raw_bytes = download_file(raw_path)
            prof = profile_dataset(dataset_id, raw_bytes, file_type=dataset.get("file_type", "csv")).to_dict()
            report = compare_profiles(
                old_profile=prof,
                new_profile=prof,
                target_column=target_col,
                dataset_id=dataset_id,
                version_before=0,
                version_after=0,
            )
            return report

    # Download bytes for both versions
    old_path = old_version_row.get("storage_path") or dataset.get("storage_path")
    new_path = new_version_row.get("storage_path") or dataset.get("storage_path")

    try:
        old_bytes = download_file(old_path)
        new_bytes = download_file(new_path)
    except Exception as exc:
        logger.error(f"Error fetching version files from storage: {exc}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"error": "storage_error", "message": f"Could not retrieve version files: {exc}"},
        )

    # Profile both version states
    old_prof = profile_dataset(dataset_id, old_bytes, file_type="csv")
    new_prof = profile_dataset(dataset_id, new_bytes, file_type="csv")

    # Load DataFrames for distribution shift check
    try:
        df_old = pl.read_csv(io.BytesIO(old_bytes), ignore_errors=True)
        df_new = pl.read_csv(io.BytesIO(new_bytes), ignore_errors=True)
    except Exception:
        df_old = None
        df_new = None

    report = compare_profiles(
        old_profile=old_prof,
        new_profile=new_prof,
        target_column=target_col,
        old_df=df_old,
        new_df=df_new,
        dataset_id=dataset_id,
        version_before=old_version_row.get("version_number", 0),
        version_after=new_version_row.get("version_number", 0),
    )

    return report


@router.get(
    "/api/v1/datasets/{dataset_id}/compare",
    summary="Compare dataset states or versions (direct)",
    response_model=ComparisonReport,
)
def compare_dataset_versions_direct(
    dataset_id: str,
    v_old: Optional[str] = Query(default=None),
    v_new: Optional[str] = Query(default=None),
):
    """Direct route for dataset comparison without project_id in URL."""
    dataset = get_dataset(dataset_id)
    if not dataset:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "dataset_not_found", "message": f"Dataset '{dataset_id}' not found."},
        )
    return compare_dataset_versions_endpoint(
        project_id=dataset["project_id"],
        dataset_id=dataset_id,
        v_old=v_old,
        v_new=v_new,
    )


def _resolve_version(dataset_id: str, ver_id: str) -> Optional[dict]:
    """Helper to resolve version by UUID or version number string ('0', 'v1', etc.)."""
    v = get_version(dataset_id, ver_id)
    if v:
        return v
    clean_num = ver_id.lower().replace("v", "").strip()
    try:
        num = int(clean_num)
        return get_version_by_number(dataset_id, num)
    except ValueError:
        return None
