"""
Unit & Integration Tests for Phase 18 — Comprehensive Reporting & Audit Export.

Tests:
1. Full audit report generation for uncleaned dataset baseline.
2. Full audit report generation for cleaned dataset with issues, transformations, approvals, comparison, and ML eval.
3. Warnings and caveats generation (unresolved defects, target shifts, column drops, imputation notices).
4. HTML printable report rendering (valid HTML5 structure, metric tables, grade badges).
5. API endpoints:
   - GET /api/v1/projects/{p}/datasets/{d}/report (JSON)
   - GET /api/v1/projects/{p}/datasets/{d}/report?format=html (HTML)
   - GET /api/v1/datasets/{d}/report (direct route)
   - GET /api/v1/projects/{p}/datasets/{d}/report/download (JSON attachment)
   - GET /api/v1/projects/{p}/datasets/{d}/report/download?format=html (HTML attachment)
   - 404 Not Found error handling.
"""

from __future__ import annotations
import json
from unittest.mock import MagicMock, patch
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.models.report import AuditReport
from app.services.report_generator import generate_audit_report, generate_html_report

client = TestClient(app)


# ── Fixtures & Mock Helpers ───────────────────────────────────────────

def get_mock_raw_dataset():
    """Mock dataset before any cleaning."""
    return {
        "id": "ds-raw-101",
        "project_id": "proj-999",
        "original_filename": "customer_churn_raw.csv",
        "storage_path": "raw/customer_churn_raw.csv",
        "file_type": "csv",
        "file_size": 245000,
        "row_count": 1000,
        "column_count": 15,
        "task_type": "BINARY_CLASSIFICATION",
        "target_column": "churn",
        "status": "UPLOADED",
        "created_at": "2026-10-10T12:00:00Z",
        "profile_json": {
            "quality_score": 68.5,
            "shape": {"rows": 1000, "columns": 15},
            "issues": [
                {
                    "issue_type": "MISSING_VALUES",
                    "column_name": "tenure",
                    "severity": "HIGH",
                    "confidence": 0.98,
                    "description": "Column 'tenure' contains 12.5% missing entries.",
                    "status": "OPEN",
                },
                {
                    "issue_type": "DUPLICATES",
                    "column_name": None,
                    "severity": "MEDIUM",
                    "confidence": 1.0,
                    "description": "Found 15 duplicate rows.",
                    "status": "OPEN",
                },
            ],
        },
    }


def get_mock_cleaned_dataset():
    """Mock dataset after autonomous cleaning, human approvals, and ML benchmarking."""
    return {
        "id": "ds-clean-202",
        "project_id": "proj-999",
        "original_filename": "churn_data.csv",
        "storage_path": "raw/churn_data.csv",
        "file_type": "csv",
        "file_size": 230000,
        "row_count": 1000,
        "column_count": 15,
        "version_number": 2,
        "task_type": "BINARY_CLASSIFICATION",
        "target_column": "churn",
        "status": "CLEANED",
        "created_at": "2026-10-10T12:00:00Z",
        "profile_json": {
            "quality_score": 92.4,
            "shape": {"rows": 1000, "columns": 15},
            "cleaning_report": {
                "cleaned_shape": {"rows": 985, "columns": 14},
                "rows_removed": 15,
                "columns_removed": 1,
                "missing_values_imputed": 125,
                "duplicates_removed": 15,
                "actions_applied": [
                    {
                        "action": "remove_duplicates",
                        "parameters": {},
                        "rows_affected": 15,
                        "description": "Removed 15 exact duplicate rows.",
                    },
                    {
                        "action": "median_impute",
                        "column": "tenure",
                        "columns_affected": ["tenure"],
                        "parameters": {"strategy": "median"},
                        "rows_affected": 125,
                        "description": "Imputed 125 null values in 'tenure' using median.",
                    },
                    {
                        "action": "drop_columns",
                        "column": "customer_id",
                        "columns_affected": ["customer_id"],
                        "parameters": {"reason": "Surrogate identifier"},
                        "rows_affected": 0,
                        "description": "Dropped surrogate identifier column 'customer_id'.",
                    },
                ],
            },
            "latest_comparison": {
                "dataset_id": "ds-clean-202",
                "version_before": 0,
                "version_after": 2,
                "quality_score_delta": 23.9,
                "regression_detected": False,
                "quality_score_before": {
                    "completeness_score": 87.5,
                    "type_consistency_score": 80.0,
                    "uniqueness_score": 98.5,
                    "validity_score": 85.0,
                    "overall_score": 68.5,
                },
                "quality_score_after": {
                    "completeness_score": 100.0,
                    "type_consistency_score": 100.0,
                    "uniqueness_score": 100.0,
                    "validity_score": 98.0,
                    "overall_score": 92.4,
                },
                "target_distribution": {
                    "target_column": "churn",
                    "shift_detected": False,
                    "max_relative_shift_pct": 2.1,
                },
                "issues_resolved": [
                    {"description": "Column 'tenure' contains 12.5% missing entries."},
                    {"description": "Found 15 duplicate rows."},
                ],
            },
            "ml_evaluation": {
                "status": "SUCCESS",
                "task_type": "BINARY_CLASSIFICATION",
                "model_name": "RandomForestClassifier",
                "target_column": "churn",
                "primary_metric_name": "F1 Score",
                "primary_raw_score": 0.672,
                "primary_cleaned_score": 0.814,
                "primary_improvement_pct": 21.1,
                "primary_improved": True,
                "train_samples": 788,
                "test_samples": 197,
                "top_features": [
                    {"feature": "tenure", "importance": 0.42},
                    {"feature": "monthly_charges", "importance": 0.31},
                ],
                "metrics": [
                    {"metric_name": "F1 Score", "raw_score": 0.672, "cleaned_score": 0.814, "delta": 0.142, "improvement_pct": 21.1, "improved": True},
                    {"metric_name": "Accuracy", "raw_score": 0.741, "cleaned_score": 0.835, "delta": 0.094, "improvement_pct": 12.7, "improved": True},
                ],
            },
        },
    }


# ── Unit Tests: Core Report Generator ─────────────────────────────────

@patch("app.services.report_generator.get_dataset")
@patch("app.services.report_generator.get_issues_by_dataset")
@patch("app.services.report_generator.list_approvals")
@patch("app.services.report_generator.list_versions")
def test_generate_audit_report_raw_baseline(mock_versions, mock_approvals, mock_issues, mock_get_ds):
    """Test generating audit report for uncleaned raw baseline dataset."""
    mock_get_ds.return_value = get_mock_raw_dataset()
    mock_issues.return_value = [
        {"issue_type": "MISSING_VALUES", "column_name": "tenure", "severity": "HIGH", "confidence": 0.98, "description": "Column 'tenure' contains 12.5% missing entries.", "status": "OPEN"},
        {"issue_type": "DUPLICATES", "column_name": None, "severity": "MEDIUM", "confidence": 1.0, "description": "Found 15 duplicate rows.", "status": "OPEN"},
    ]
    mock_approvals.return_value = []
    mock_versions.return_value = []

    report = generate_audit_report("ds-raw-101", "proj-999")

    assert isinstance(report, AuditReport)
    assert report.dataset_overview.dataset_id == "ds-raw-101"
    assert report.dataset_overview.dataset_name == "customer_churn_raw.csv"
    assert report.dataset_overview.original_shape["rows"] == 1000
    assert report.dataset_overview.current_shape["rows"] == 1000
    assert report.quality_metrics.after_score == 68.5
    assert len(report.detected_issues) == 2
    assert report.issues_remaining_count == 2
    assert report.issues_resolved_count == 0
    assert len(report.warnings_and_caveats) > 0
    assert "open or unaddressed" in report.warnings_and_caveats[0]
    assert "report_json" in report.download_links
    assert "report_html" in report.download_links


@patch("app.services.report_generator.get_dataset")
@patch("app.services.report_generator.get_issues_by_dataset")
@patch("app.services.report_generator.list_approvals")
@patch("app.services.report_generator.list_versions")
def test_generate_audit_report_cleaned_complete(mock_versions, mock_approvals, mock_issues, mock_get_ds):
    """Test generating comprehensive audit report with all cleaning, ML, and version telemetry."""
    mock_get_ds.return_value = get_mock_cleaned_dataset()
    mock_issues.return_value = [
        {"issue_type": "MISSING_VALUES", "column_name": "tenure", "severity": "HIGH", "confidence": 0.98, "description": "Column 'tenure' contains 12.5% missing entries.", "status": "RESOLVED"},
        {"issue_type": "DUPLICATES", "column_name": None, "severity": "MEDIUM", "confidence": 1.0, "description": "Found 15 duplicate rows.", "status": "RESOLVED"},
    ]
    mock_approvals.return_value = [
        {
            "id": "app-1",
            "action_type": "drop_columns",
            "target_columns": ["customer_id"],
            "parameters": {"column": "customer_id"},
            "reasoning": "Unique identifier leakage",
            "risk_level": "HIGH",
            "confidence": 0.99,
            "status": "APPROVED",
            "user_feedback": "Approved by engineer",
            "created_at": "2026-10-10T12:05:00Z",
            "resolved_at": "2026-10-10T12:06:00Z",
        }
    ]
    mock_versions.return_value = [
        {"id": "v-0", "version_number": 0, "action_summary": "Original Ingest Snapshot", "quality_score": 68.5, "created_at": "2026-10-10T12:00:00Z"},
        {"id": "v-1", "version_number": 1, "action_summary": "Deduplication & Imputation", "quality_score": 85.0, "created_at": "2026-10-10T12:05:00Z"},
        {"id": "v-2", "version_number": 2, "action_summary": "Dropped customer_id", "quality_score": 92.4, "created_at": "2026-10-10T12:10:00Z"},
    ]

    report = generate_audit_report("ds-clean-202", "proj-999")

    # Overview
    assert report.dataset_overview.current_version == 2
    assert report.dataset_overview.original_shape["rows"] == 1000
    assert report.dataset_overview.current_shape["rows"] == 985
    assert report.dataset_overview.current_shape["columns"] == 14

    # Quality breakdown
    assert report.quality_metrics.before_score == 68.5
    assert report.quality_metrics.after_score == 92.4
    assert report.quality_metrics.score_delta == 23.9
    assert report.quality_metrics.health_grade_before == "B"
    assert report.quality_metrics.health_grade_after == "A"
    assert report.quality_metrics.completeness_delta == 12.5

    # Issues
    assert report.issues_resolved_count == 2
    assert report.issues_remaining_count == 0

    # Decisions & Transformations
    assert len(report.agent_decisions) == 1
    assert report.agent_decisions[0].status == "APPROVED"
    assert len(report.applied_transformations) == 3

    # Version timeline
    assert len(report.version_timeline) == 3
    assert report.version_timeline[-1].version_number == 2

    # ML Performance
    assert report.ml_performance is not None
    assert report.ml_performance.status == "SUCCESS"
    assert report.ml_performance.model_name == "RandomForestClassifier"
    assert report.ml_performance.primary_metric_name == "F1 Score"
    assert report.ml_performance.primary_improved is True
    assert report.ml_performance.primary_improvement_pct == 21.1

    # Warnings & Summary
    assert len(report.warnings_and_caveats) >= 2  # Column drop note + Imputation note
    assert any("removed to prevent" in w for w in report.warnings_and_caveats)
    assert any("populated via median/mode" in w for w in report.warnings_and_caveats)
    assert "Production Ready" in report.final_quality_summary


def test_html_report_rendering():
    """Test generating standalone HTML markup from AuditReport."""
    dataset_dict = get_mock_cleaned_dataset()
    with patch("app.services.report_generator.get_dataset", return_value=dataset_dict), \
         patch("app.services.report_generator.get_issues_by_dataset", return_value=[]), \
         patch("app.services.report_generator.list_approvals", return_value=[]), \
         patch("app.services.report_generator.list_versions", return_value=[]):

        report = generate_audit_report("ds-clean-202", "proj-999")
        html = generate_html_report(report)

        assert "<!DOCTYPE html>" in html
        assert "<html" in html
        assert "churn_data.csv" in html
        assert "Executive Summary" in html
        assert "4-Factor Quality Score Delta" in html
        assert "Completeness Score" in html
        assert "ML Holdout Generalization Benchmark" in html
        assert "RandomForestClassifier" in html
        assert "Print / Save as PDF" in html


def test_generate_audit_report_nonexistent_raises():
    """Test ValueError raised for nonexistent dataset."""
    with patch("app.services.report_generator.get_dataset", return_value=None):
        with pytest.raises(ValueError, match="not found"):
            generate_audit_report("non-existent-id")


# ── Integration Tests: API Endpoints ──────────────────────────────────

@patch("app.routers.report.get_dataset")
@patch("app.services.report_generator.get_dataset")
@patch("app.services.report_generator.get_issues_by_dataset")
@patch("app.services.report_generator.list_approvals")
@patch("app.services.report_generator.list_versions")
def test_api_get_audit_report_json(mock_versions, mock_approvals, mock_issues, mock_gen_ds, mock_router_ds):
    """Test GET /api/v1/projects/{p}/datasets/{d}/report returns JSON AuditReport."""
    mock_router_ds.return_value = get_mock_cleaned_dataset()
    mock_gen_ds.return_value = get_mock_cleaned_dataset()
    mock_issues.return_value = []
    mock_approvals.return_value = []
    mock_versions.return_value = []

    res = client.get("/api/v1/projects/proj-999/datasets/ds-clean-202/report")
    assert res.status_code == 200
    data = res.json()

    assert "report_id" in data
    assert data["dataset_overview"]["dataset_id"] == "ds-clean-202"
    assert data["quality_metrics"]["after_score"] == 92.4
    assert data["ml_performance"]["model_name"] == "RandomForestClassifier"


@patch("app.routers.report.get_dataset")
@patch("app.services.report_generator.get_dataset")
@patch("app.services.report_generator.get_issues_by_dataset")
@patch("app.services.report_generator.list_approvals")
@patch("app.services.report_generator.list_versions")
def test_api_get_audit_report_html(mock_versions, mock_approvals, mock_issues, mock_gen_ds, mock_router_ds):
    """Test GET /api/v1/projects/{p}/datasets/{d}/report?format=html returns HTMLResponse."""
    mock_router_ds.return_value = get_mock_cleaned_dataset()
    mock_gen_ds.return_value = get_mock_cleaned_dataset()
    mock_issues.return_value = []
    mock_approvals.return_value = []
    mock_versions.return_value = []

    res = client.get("/api/v1/projects/proj-999/datasets/ds-clean-202/report?format=html")
    assert res.status_code == 200
    assert "text/html" in res.headers["content-type"]
    assert "<!DOCTYPE html>" in res.text
    assert "churn_data.csv" in res.text


@patch("app.routers.report.get_dataset")
@patch("app.services.report_generator.get_dataset")
@patch("app.services.report_generator.get_issues_by_dataset")
@patch("app.services.report_generator.list_approvals")
@patch("app.services.report_generator.list_versions")
def test_api_get_audit_report_direct(mock_versions, mock_approvals, mock_issues, mock_gen_ds, mock_router_ds):
    """Test direct route GET /api/v1/datasets/{d}/report without project_id."""
    mock_router_ds.return_value = get_mock_cleaned_dataset()
    mock_gen_ds.return_value = get_mock_cleaned_dataset()
    mock_issues.return_value = []
    mock_approvals.return_value = []
    mock_versions.return_value = []

    res = client.get("/api/v1/datasets/ds-clean-202/report")
    assert res.status_code == 200
    data = res.json()
    assert data["dataset_overview"]["dataset_id"] == "ds-clean-202"


@patch("app.routers.report.get_dataset")
@patch("app.services.report_generator.get_dataset")
@patch("app.services.report_generator.get_issues_by_dataset")
@patch("app.services.report_generator.list_approvals")
@patch("app.services.report_generator.list_versions")
def test_api_download_audit_report_json(mock_versions, mock_approvals, mock_issues, mock_gen_ds, mock_router_ds):
    """Test GET /api/v1/projects/{p}/datasets/{d}/report/download returns JSON file attachment."""
    mock_router_ds.return_value = get_mock_cleaned_dataset()
    mock_gen_ds.return_value = get_mock_cleaned_dataset()
    mock_issues.return_value = []
    mock_approvals.return_value = []
    mock_versions.return_value = []

    res = client.get("/api/v1/projects/proj-999/datasets/ds-clean-202/report/download?format=json")
    assert res.status_code == 200
    assert "attachment;" in res.headers["content-disposition"]
    assert "audit_report.json" in res.headers["content-disposition"]

    # Verify payload parses as JSON
    content = json.loads(res.content)
    assert content["dataset_overview"]["dataset_id"] == "ds-clean-202"


@patch("app.routers.report.get_dataset")
@patch("app.services.report_generator.get_dataset")
@patch("app.services.report_generator.get_issues_by_dataset")
@patch("app.services.report_generator.list_approvals")
@patch("app.services.report_generator.list_versions")
def test_api_download_audit_report_html(mock_versions, mock_approvals, mock_issues, mock_gen_ds, mock_router_ds):
    """Test GET /api/v1/projects/{p}/datasets/{d}/report/download?format=html returns HTML file attachment."""
    mock_router_ds.return_value = get_mock_cleaned_dataset()
    mock_gen_ds.return_value = get_mock_cleaned_dataset()
    mock_issues.return_value = []
    mock_approvals.return_value = []
    mock_versions.return_value = []

    res = client.get("/api/v1/projects/proj-999/datasets/ds-clean-202/report/download?format=html")
    assert res.status_code == 200
    assert "attachment;" in res.headers["content-disposition"]
    assert "audit_report.html" in res.headers["content-disposition"]
    assert "<!DOCTYPE html>" in res.text


def test_api_report_not_found():
    """Test 404 for unknown dataset ID."""
    with patch("app.routers.report.get_dataset", return_value=None):
        res = client.get("/api/v1/projects/proj-999/datasets/unknown-999/report")
        assert res.status_code == 404
        assert res.json()["detail"]["error"] == "dataset_not_found"
