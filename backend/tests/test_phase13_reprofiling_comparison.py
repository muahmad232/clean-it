"""
Unit & Integration Tests for Phase 13 — Re-Profiling & Before/After Comparison.

Tests:
1. Quality score calculation & transparent metric breakdown (formula: 35% completeness, 25% type, 20% uniqueness, 20% validity).
2. Profile comparison: metric deltas, issues resolved, new issues introduced, per-metric table.
3. Target class distribution shift detection (> 20% relative shift threshold).
4. Quality score regression detection (drop > 5 points triggers regression flag).
5. Auto-rollback integration: A deliberately bad transformation that regresses quality triggers automatic rollback to parent snapshot.
6. Comparison API endpoints (project-scoped and direct routes).
"""

from __future__ import annotations
import io
from unittest.mock import MagicMock, patch
import polars as pl
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.models.comparison import ComparisonReport, QualityScoreBreakdown
from app.services.comparison import (
    calculate_quality_score,
    compare_profiles,
    detect_target_distribution_shift,
    evaluate_and_auto_rollback_if_regressed,
)
from app.services.profiler import profile_dataset

client = TestClient(app)

SAMPLE_CSV = b"""id,name,age,salary,churn
1,Alice,25,50000,0
2,Bob,30,60000,0
3,Charlie,35,70000,1
4,David,40,80000,0
5,Eve,45,90000,1
"""


def test_calculate_quality_score_formula():
    """Verify quality score calculation matches the 4-component weighted formula."""
    # Perfect dataset profile: 0 nulls, 0 duplicates, 0 issues
    perfect_profile = {
        "shape": {"rows": 100, "columns": 5},
        "total_null_pct": 0.0,
        "duplicate_row_pct": 0.0,
        "duplicate_row_count": 0,
        "columns": [{"name": f"col_{i}", "flags": []} for i in range(5)],
        "issues": [],
    }
    score = calculate_quality_score(perfect_profile)
    assert score.completeness_score == 100.0
    assert score.type_consistency_score == 100.0
    assert score.uniqueness_score == 100.0
    assert score.validity_score == 100.0
    assert score.overall_score == 100.0

    # Imperfect dataset profile: 20% nulls, 10% duplicates, 1 type mismatch column, 1 high issue
    imperfect_profile = {
        "shape": {"rows": 100, "columns": 5},
        "total_null_pct": 20.0,
        "duplicate_row_pct": 10.0,
        "columns": [
            {"name": "col_0", "flags": ["numeric_as_string"]},
            {"name": "col_1", "flags": []},
            {"name": "col_2", "flags": []},
            {"name": "col_3", "flags": []},
            {"name": "col_4", "flags": []},
        ],
        "issues": [
            {"issue_type": "TYPE_MISMATCH", "column_name": "col_0", "severity": "HIGH"}
        ],
    }
    score_imp = calculate_quality_score(imperfect_profile)
    # Completeness = 100 - 20 = 80.0
    assert score_imp.completeness_score == 80.0
    # Type consistency = 4/5 = 80.0
    assert score_imp.type_consistency_score == 80.0
    # Uniqueness = 100 - 10 = 90.0
    assert score_imp.uniqueness_score == 90.0
    # Validity = 100 - 6 (HIGH) = 94.0
    assert score_imp.validity_score == 94.0
    # Overall = (80 * 0.35) + (80 * 0.25) + (90 * 0.20) + (94 * 0.20) = 28 + 20 + 18 + 18.8 = 84.8
    assert score_imp.overall_score == 84.8


def test_compare_profiles_improvements_and_metric_deltas():
    """Verify compare_profiles correctly computes deltas, resolved issues, and metrics table."""
    old_prof = {
        "shape": {"rows": 100, "columns": 4},
        "total_null_pct": 15.0,
        "duplicate_row_count": 5,
        "duplicate_row_pct": 5.0,
        "columns": [{"name": f"col_{i}", "flags": []} for i in range(4)],
        "issues": [
            {"issue_type": "MISSING_VALUES", "column_name": "age", "severity": "MEDIUM", "description": "Nulls in age"},
            {"issue_type": "DUPLICATES", "column_name": None, "severity": "MEDIUM", "description": "Duplicate rows"},
        ],
    }

    # Cleaned post-transformation profile (nulls resolved, duplicates removed)
    new_prof = {
        "shape": {"rows": 95, "columns": 4},
        "total_null_pct": 0.0,
        "duplicate_row_count": 0,
        "duplicate_row_pct": 0.0,
        "columns": [{"name": f"col_{i}", "flags": []} for i in range(4)],
        "issues": [],
    }

    report = compare_profiles(
        old_profile=old_prof,
        new_profile=new_prof,
        dataset_id="test-ds-123",
        version_before=0,
        version_after=1,
    )

    assert report.dataset_id == "test-ds-123"
    assert report.quality_score_delta > 0.0  # Quality improved
    assert report.regression_detected is False
    assert len(report.issues_resolved) == 2
    assert len(report.new_issues_introduced) == 0
    assert len(report.metrics_table) >= 8

    # Verify per-metric table has row and null comparisons
    metric_names = [m.metric_name for m in report.metrics_table]
    assert "Overall Quality Score" in metric_names
    assert "Missing Values %" in metric_names
    assert "Duplicate Rows" in metric_names


def test_detect_target_distribution_shift():
    """Verify detection of protected target class shifts exceeding the 20% relative tolerance."""
    # Before dataframe: target 'churn' has 10 class 0, 10 class 1 (50% each)
    df_before = pl.DataFrame({
        "feature": list(range(20)),
        "churn": [0] * 10 + [1] * 10,
    })

    # Case A: Slight change (10 class 0, 9 class 1 -> 52.6% vs 47.4% -> relative change ~5.2% <= 20%)
    df_after_stable = pl.DataFrame({
        "feature": list(range(19)),
        "churn": [0] * 10 + [1] * 9,
    })
    res_stable = detect_target_distribution_shift(df_before, df_after_stable, target_column="churn")
    assert res_stable.shift_detected is False

    # Case B: Heavy distortion (10 class 0, only 2 class 1 remaining -> 16.7% vs 50% -> >60% shift)
    df_after_shifted = pl.DataFrame({
        "feature": list(range(12)),
        "churn": [0] * 10 + [1] * 2,
    })
    res_shifted = detect_target_distribution_shift(df_before, df_after_shifted, target_column="churn")
    assert res_shifted.shift_detected is True
    assert res_shifted.max_relative_shift_pct > 20.0
    assert "Significant target shift detected" in res_shifted.details


def test_quality_regression_detection_over_5_points():
    """Verify that a drop of >5 points in quality score triggers regression detection."""
    # High quality original state (score ~ 98)
    good_prof = {
        "shape": {"rows": 100, "columns": 5},
        "total_null_pct": 1.0,
        "duplicate_row_count": 0,
        "duplicate_row_pct": 0.0,
        "columns": [{"name": f"col_{i}", "flags": []} for i in range(5)],
        "issues": [],
    }

    # Regressed state with heavy nulls and critical issues (score drops by >15 points)
    bad_prof = {
        "shape": {"rows": 100, "columns": 5},
        "total_null_pct": 35.0,
        "duplicate_row_count": 10,
        "duplicate_row_pct": 10.0,
        "columns": [{"name": f"col_{i}", "flags": []} for i in range(5)],
        "issues": [
            {"issue_type": "MISSING_VALUES", "column_name": "col_1", "severity": "CRITICAL", "description": "High nulls"},
            {"issue_type": "CORRUPTED_DATA", "column_name": "col_2", "severity": "CRITICAL", "description": "Corrupted values"},
        ],
    }

    report = compare_profiles(
        old_profile=good_prof,
        new_profile=bad_prof,
        dataset_id="test-regression-ds",
        version_before=1,
        version_after=2,
    )

    assert report.regression_detected is True
    assert report.quality_score_delta < -5.0
    assert any("exceeding the 5-point tolerance" in r for r in report.regression_reasons)


def test_regression_detection_triggers_rollback_deliberately_bad_transformation():
    """
    Mandatory Phase 13 Criteria:
    Verify that a deliberately bad transformation that regresses quality triggers
    automatic rollback to the previous version snapshot.
    """
    mock_ds_id = "test-auto-rollback-ds"
    mock_parent_id = "v1-parent-uuid"

    # Create deliberately regressed comparison report
    qs_before = QualityScoreBreakdown(
        completeness_score=95.0,
        type_consistency_score=100.0,
        uniqueness_score=100.0,
        validity_score=95.0,
        overall_score=97.25,
    )
    qs_after = QualityScoreBreakdown(
        completeness_score=60.0,
        type_consistency_score=70.0,
        uniqueness_score=80.0,
        validity_score=60.0,
        overall_score=66.5,
    )

    bad_comparison = ComparisonReport(
        dataset_id=mock_ds_id,
        version_before=1,
        version_after=2,
        quality_score_before=qs_before,
        quality_score_after=qs_after,
        quality_score_delta=-30.75,
        regression_detected=True,
        regression_reasons=["Quality score dropped by 30.75 points (97.25 → 66.5), exceeding 5-point tolerance."],
        auto_rolled_back=False,
        summary="REGRESSION DETECTED",
    )

    with patch("app.services.comparison.rollback_dataset_version") as mock_rollback:
        mock_rollback.return_value = {
            "dataset_id": mock_ds_id,
            "target_version_id": mock_parent_id,
            "version_number": 1,
            "status": "COMPLETED",
        }

        rolled_back = evaluate_and_auto_rollback_if_regressed(
            dataset_id=mock_ds_id,
            comparison=bad_comparison,
            target_version_id=mock_parent_id,
        )

        assert rolled_back is True
        assert bad_comparison.auto_rolled_back is True
        mock_rollback.assert_called_once_with(
            dataset_id=mock_ds_id,
            target_version_id=mock_parent_id,
            reason="Automated Rollback: Quality regression detected. Quality score dropped by 30.75 points (97.25 → 66.5), exceeding 5-point tolerance.",
        )


def test_comparison_api_endpoints():
    """Test GET /projects/.../compare and GET /datasets/.../compare endpoints."""
    mock_ds_id = "test-compare-api-ds"
    mock_proj_id = "test-compare-api-proj"

    mock_ds = {
        "id": mock_ds_id,
        "project_id": mock_proj_id,
        "storage_path": "datasets/test.csv",
        "original_filename": "data.csv",
        "file_type": "csv",
        "target_column": "churn",
        "profile_json": {},
    }

    v0_row = {
        "id": "v0-uuid",
        "version_number": 0,
        "storage_path": "datasets/v0.csv",
    }
    v1_row = {
        "id": "v1-uuid",
        "version_number": 1,
        "parent_version_id": "v0-uuid",
        "storage_path": "datasets/v1.csv",
    }

    with patch("app.routers.comparison.get_dataset", return_value=mock_ds), \
         patch("app.routers.comparison.list_versions", return_value=[v0_row, v1_row]), \
         patch("app.routers.comparison.download_file", return_value=SAMPLE_CSV):

        # 1. Project-scoped GET compare
        res = client.get(f"/api/v1/projects/{mock_proj_id}/datasets/{mock_ds_id}/compare")
        assert res.status_code == 200
        data = res.json()
        assert data["dataset_id"] == mock_ds_id
        assert "quality_score_before" in data
        assert "quality_score_after" in data
        assert "metrics_table" in data
        assert isinstance(data["metrics_table"], list)

        # 2. Direct route GET compare
        res_direct = client.get(f"/api/v1/datasets/{mock_ds_id}/compare")
        assert res_direct.status_code == 200
        data_direct = res_direct.json()
        assert data_direct["dataset_id"] == mock_ds_id
