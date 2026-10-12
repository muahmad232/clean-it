"""
Audit & Reporting Router — Phase 18.

Endpoints:
- GET /api/v1/projects/{project_id}/datasets/{dataset_id}/report
- GET /api/v1/datasets/{dataset_id}/report
- GET /api/v1/projects/{project_id}/datasets/{dataset_id}/report/download
- GET /api/v1/datasets/{dataset_id}/report/download
"""

from __future__ import annotations
import json
from typing import Optional
from fastapi import APIRouter, HTTPException, Query, Response, status
from fastapi.responses import HTMLResponse

from app.core.logging import get_logger
from app.database.repositories.datasets import get_dataset, get_project
from app.models.report import AuditReport
from app.services.report_generator import generate_audit_report, generate_html_report

logger = get_logger(__name__)

router = APIRouter(tags=["Reporting & Audit"])


@router.get(
    "/api/v1/projects/{project_id}/datasets/{dataset_id}/report",
    summary="Get full dataset audit and quality report (JSON or HTML)",
    response_model=AuditReport,
)
def get_dataset_audit_report_endpoint(
    project_id: str,
    dataset_id: str,
    format: Optional[str] = Query(
        default="json",
        description="Response format: 'json' (structured AuditReport) or 'html' (standalone printable document)",
    ),
):
    """
    Generate or retrieve a comprehensive post-cleaning audit report:
    - Original vs Cleaned dataset shapes and metadata
    - 4-Factor quality score breakdown before vs after
    - All detected issues with resolution status
    - Executed transformations and custom Polars scripts
    - Machine learning holdout generalization deltas (F1/R²)
    - Reversible version lineage timeline
    """
    dataset = get_dataset(dataset_id)
    if not dataset or dataset.get("project_id") != project_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "dataset_not_found", "message": f"Dataset '{dataset_id}' not found."},
        )

    try:
        report = generate_audit_report(dataset_id=dataset_id, project_id=project_id)
    except Exception as exc:
        logger.exception(f"Failed to generate audit report for dataset {dataset_id}: {exc}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"error": "report_generation_failed", "message": str(exc)},
        )

    if (format or "").lower() == "html":
        html_content = generate_html_report(report)
        return HTMLResponse(content=html_content, status_code=200)

    return report


@router.get(
    "/api/v1/datasets/{dataset_id}/report",
    summary="Get full dataset audit report (direct route)",
    response_model=AuditReport,
)
def get_dataset_audit_report_direct(
    dataset_id: str,
    format: Optional[str] = Query(default="json"),
):
    """Direct route for audit report without project_id in URL."""
    dataset = get_dataset(dataset_id)
    if not dataset:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "dataset_not_found", "message": f"Dataset '{dataset_id}' not found."},
        )

    return get_dataset_audit_report_endpoint(
        project_id=dataset["project_id"],
        dataset_id=dataset_id,
        format=format,
    )


@router.get(
    "/api/v1/projects/{project_id}/datasets/{dataset_id}/report/download",
    summary="Download audit report as file attachment (.json or .html)",
)
def download_dataset_audit_report(
    project_id: str,
    dataset_id: str,
    format: Optional[str] = Query(
        default="json",
        description="Download format: 'json' or 'html'",
    ),
):
    """Download the full audit report as an attached file (.json or .html)."""
    dataset = get_dataset(dataset_id)
    if not dataset or dataset.get("project_id") != project_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "dataset_not_found", "message": f"Dataset '{dataset_id}' not found."},
        )

    try:
        report = generate_audit_report(dataset_id=dataset_id, project_id=project_id)
    except Exception as exc:
        logger.exception(f"Failed to generate audit report for download: {exc}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"error": "report_generation_failed", "message": str(exc)},
        )

    base_name = (dataset.get("original_filename") or "dataset").rsplit(".", 1)[0]
    ver_num = report.dataset_overview.current_version
    fmt = (format or "json").lower()

    if fmt == "html":
        html_bytes = generate_html_report(report).encode("utf-8")
        filename = f"{base_name}_v{ver_num}_audit_report.html"
        return Response(
            content=html_bytes,
            media_type="text/html",
            headers={
                "Content-Disposition": f'attachment; filename="{filename}"',
            },
        )
    else:
        json_str = report.model_dump_json(indent=2)
        filename = f"{base_name}_v{ver_num}_audit_report.json"
        return Response(
            content=json_str.encode("utf-8"),
            media_type="application/json",
            headers={
                "Content-Disposition": f'attachment; filename="{filename}"',
            },
        )


@router.get(
    "/api/v1/datasets/{dataset_id}/report/download",
    summary="Download audit report as file attachment (direct route)",
)
def download_dataset_audit_report_direct(
    dataset_id: str,
    format: Optional[str] = Query(default="json"),
):
    """Direct route for downloading audit report."""
    dataset = get_dataset(dataset_id)
    if not dataset:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "dataset_not_found", "message": f"Dataset '{dataset_id}' not found."},
        )
    return download_dataset_audit_report(
        project_id=dataset["project_id"],
        dataset_id=dataset_id,
        format=format,
    )
