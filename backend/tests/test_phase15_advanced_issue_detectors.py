"""
Phase 15 — Advanced Issue Detection Test Suite.

Tests each detector independently:
1. OUTLIER — IQR & Z-score based detection
2. INVALID_RANGE — Domain bounds (age, percentage, non-negative quantities, coords)
3. DISTRIBUTION_SHIFT — Statistical drift vs baseline (KS test & TVD)
4. CLASS_IMBALANCE — Target / classification distribution skew
5. TARGET_LEAKAGE — High correlation with target in unexpected columns
6. DATE_PARSE_ERROR — Inconsistent format strings & corrupt dates
7. Full pipeline integration with detect_all_issues and API filtering
"""

import io
import csv
import pytest
import polars as pl
from fastapi.testclient import TestClient

from app.main import app
from app.models.issue import IssueType, Severity
from app.services.issue_detector import (
    detect_outliers,
    detect_invalid_range,
    detect_distribution_shift,
    detect_class_imbalance,
    detect_target_leakage,
    detect_date_parse_errors,
    detect_all_issues,
)
from app.database.client import get_service_client
from app.database.repositories.datasets import create_project
from app.models.dataset import ProjectCreate

TEST_USER_ID = "00000000-0000-0000-0000-000000000001"
client = TestClient(app)


@pytest.fixture(scope="module")
def test_project():
    record = create_project(TEST_USER_ID, ProjectCreate(name="Phase15AdvancedIssuesTest"))
    yield record
    try:
        get_service_client().schema("data_agent").table("projects").delete().eq("id", record["id"]).execute()
    except Exception:
        pass


# ══════════════════════════════════════════════════════════════════
# 1. OUTLIER DETECTOR TESTS
# ══════════════════════════════════════════════════════════════════

def test_detect_outliers_iqr():
    # 20 regular values clustered around 10-12, plus 2 extreme outliers (100.0, 150.0)
    data = [10.0, 10.5, 11.0, 11.2, 10.8, 11.5, 12.0, 10.2, 11.8, 11.1,
            10.4, 11.3, 10.9, 11.7, 12.1, 10.6, 11.4, 10.7, 11.9, 11.0,
            100.0, 150.0]
    df = pl.DataFrame({"income": data})
    issues = detect_outliers(df, "income", len(data))

    assert len(issues) == 1
    issue = issues[0]
    assert issue.issue_type == IssueType.OUTLIER
    assert issue.column_name == "income"
    assert issue.severity in (Severity.MEDIUM, Severity.HIGH)
    assert issue.evidence_json["outlier_count"] == 2
    assert issue.evidence_json["method"] == "IQR"
    assert 100.0 in issue.evidence_json["sample_outliers"] or 150.0 in issue.evidence_json["sample_outliers"]


def test_detect_outliers_clean_numeric():
    # Uniformly spaced clean numeric data with no outliers
    data = [float(i) for i in range(10, 30)]
    df = pl.DataFrame({"val": data})
    issues = detect_outliers(df, "val", len(data))
    assert len(issues) == 0


def test_detect_outliers_ignores_non_numeric():
    df = pl.DataFrame({"city": ["London", "Paris", "Tokyo", "Berlin", "New York"] * 5})
    issues = detect_outliers(df, "city", df.shape[0])
    assert len(issues) == 0


# ══════════════════════════════════════════════════════════════════
# 2. INVALID RANGE DETECTOR TESTS
# ══════════════════════════════════════════════════════════════════

def test_detect_invalid_range_age():
    # Age cannot be negative or > 125
    ages = [25.0, 30.0, 45.0, -5.0, 150.0, 28.0, 35.0, 40.0]
    df = pl.DataFrame({"user_age": ages})
    issues = detect_invalid_range(df, "user_age", len(ages))

    assert len(issues) == 1
    issue = issues[0]
    assert issue.issue_type == IssueType.INVALID_RANGE
    assert issue.column_name == "user_age"
    assert issue.severity == Severity.HIGH
    assert issue.evidence_json["domain_rule"] == "human_age"
    assert issue.evidence_json["violation_count"] == 2
    assert issue.evidence_json["expected_min"] == 0.0
    assert issue.evidence_json["expected_max"] == 125.0


def test_detect_invalid_range_percentage_and_non_negative():
    # Percentage must be <= 100
    df = pl.DataFrame({
        "tax_rate_pct": [5.0, 10.0, 15.0, 25.0, 150.0, 200.0],
        "item_price": [10.0, 20.0, -15.0, 40.0, -50.0, 60.0],
    })
    pct_issues = detect_invalid_range(df, "tax_rate_pct", df.shape[0])
    assert len(pct_issues) == 1
    assert pct_issues[0].evidence_json["violation_count"] == 2

    price_issues = detect_invalid_range(df, "item_price", df.shape[0])
    assert len(price_issues) == 1
    assert price_issues[0].evidence_json["violation_count"] == 2
    assert price_issues[0].evidence_json["expected_min"] == 0.0


def test_detect_invalid_range_clean():
    df = pl.DataFrame({
        "age": [20.0, 35.0, 50.0, 65.0, 80.0],
        "discount_pct": [0.0, 10.0, 15.0, 25.0, 50.0],
        "salary": [45000.0, 60000.0, 80000.0, 120000.0, 150000.0],
    })
    for col in df.columns:
        issues = detect_invalid_range(df, col, df.shape[0])
        assert len(issues) == 0


# ══════════════════════════════════════════════════════════════════
# 3. DISTRIBUTION SHIFT DETECTOR TESTS
# ══════════════════════════════════════════════════════════════════

def test_detect_distribution_shift_ks():
    baseline_df = pl.DataFrame({"metric": [10.0, 11.0, 10.5, 12.0, 11.5, 10.8, 12.2, 11.1] * 5})
    # Shifted dataframe has mean around 80.0
    shifted_df = pl.DataFrame({"metric": [75.0, 80.0, 82.0, 78.0, 85.0, 79.0, 81.0, 83.0] * 5})

    issues = detect_distribution_shift(shifted_df, "metric", shifted_df.shape[0], baseline_df=baseline_df)
    assert len(issues) == 1
    issue = issues[0]
    assert issue.issue_type == IssueType.DISTRIBUTION_SHIFT
    assert issue.column_name == "metric"
    assert issue.evidence_json["ks_statistic"] >= 0.25
    assert issue.evidence_json["mean_shift_pct"] > 50.0


def test_detect_distribution_shift_identical():
    data = [10.0, 11.0, 12.0, 13.0, 14.0] * 5
    df1 = pl.DataFrame({"metric": data})
    df2 = pl.DataFrame({"metric": data})

    issues = detect_distribution_shift(df2, "metric", df2.shape[0], baseline_df=df1)
    assert len(issues) == 0


# ══════════════════════════════════════════════════════════════════
# 4. CLASS IMBALANCE DETECTOR TESTS
# ══════════════════════════════════════════════════════════════════

def test_detect_class_imbalance_severe_and_moderate():
    # 95 'Normal', 5 'Fraud' -> ratio 19:1 (Severe)
    df_severe = pl.DataFrame({
        "fraud_label": ["Normal"] * 95 + ["Fraud"] * 5,
    })
    issues = detect_class_imbalance(df_severe, col_name="fraud_label", total_rows=100)
    assert len(issues) == 1
    assert issues[0].issue_type == IssueType.CLASS_IMBALANCE
    assert issues[0].severity == Severity.HIGH
    assert issues[0].evidence_json["imbalance_ratio"] == 19.0
    assert issues[0].evidence_json["minority_class"] == "Fraud"

    # 82 'No', 18 'Yes' -> ratio 4.55:1 (Moderate)
    df_mod = pl.DataFrame({
        "churn": ["No"] * 82 + ["Yes"] * 18,
    })
    mod_issues = detect_class_imbalance(df_mod, col_name="churn", total_rows=100)
    assert len(mod_issues) == 1
    assert mod_issues[0].severity == Severity.MEDIUM


def test_detect_class_imbalance_balanced():
    df_balanced = pl.DataFrame({
        "target": ["Cat"] * 50 + ["Dog"] * 50,
    })
    issues = detect_class_imbalance(df_balanced, target_column="target", total_rows=100)
    assert len(issues) == 0


# ══════════════════════════════════════════════════════════════════
# 5. TARGET LEAKAGE DETECTOR TESTS
# ══════════════════════════════════════════════════════════════════

def test_detect_target_leakage_high_correlation():
    # Feature perfectly tracking target (correlation = 1.0)
    y = [10.0, 20.0, 30.0, 40.0, 50.0, 60.0, 70.0, 80.0, 90.0, 100.0]
    leaking_feature = [v * 1.05 + 0.1 for v in y]
    clean_feature = [5.0, 2.0, 9.0, 1.0, 8.0, 3.0, 7.0, 4.0, 6.0, 5.0]

    df = pl.DataFrame({
        "target": y,
        "future_payout_leak": leaking_feature,
        "clean_feature": clean_feature,
    })

    issues = detect_target_leakage(df, df.shape[0], target_column="target")
    assert len(issues) == 1
    assert issues[0].issue_type == IssueType.TARGET_LEAKAGE
    assert issues[0].column_name == "future_payout_leak"
    assert issues[0].evidence_json["correlation"] >= 0.95
    assert issues[0].severity == Severity.CRITICAL


def test_detect_target_leakage_low_correlation():
    df = pl.DataFrame({
        "target": [1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0, 10.0],
        "feature_a": [10.0, 3.0, 8.0, 2.0, 9.0, 1.0, 7.0, 4.0, 6.0, 5.0],
    })
    issues = detect_target_leakage(df, df.shape[0], target_column="target")
    assert len(issues) == 0


# ══════════════════════════════════════════════════════════════════
# 6. DATE PARSE ERROR DETECTOR TESTS
# ══════════════════════════════════════════════════════════════════

def test_detect_date_parse_errors_mixed_and_corrupt():
    # Mixed formats and impossible dates
    mixed_dates = (
        ["2024-01-01", "2024-01-02", "2024-01-03"] * 3
        + ["01/04/2024", "01/05/2024", "01/06/2024"] * 3
        + ["2024-02-31", "invalid_date", "null"]
    )
    df = pl.DataFrame({"signup_date": mixed_dates})
    issues = detect_date_parse_errors(df, "signup_date", len(mixed_dates))

    assert len(issues) == 1
    issue = issues[0]
    assert issue.issue_type == IssueType.DATE_PARSE_ERROR
    assert issue.column_name == "signup_date"
    assert issue.evidence_json["has_mixed_formats"] is True
    assert issue.evidence_json["invalid_date_count"] > 0


def test_detect_date_parse_errors_clean():
    clean_dates = [f"2024-01-{i:02d}" for i in range(1, 25)]
    df = pl.DataFrame({"event_time": clean_dates})
    issues = detect_date_parse_errors(df, "event_time", len(clean_dates))
    assert len(issues) == 0


# ══════════════════════════════════════════════════════════════════
# 7. INTEGRATED PIPELINE TESTS
# ══════════════════════════════════════════════════════════════════

def test_detect_all_issues_comprehensive_phase15():
    n = 60
    y = [float(i) for i in range(n)]
    df = pl.DataFrame({
        "id": [f"ID_{i}" for i in range(n)],                           # POSSIBLE_IDENTIFIER
        "income": [10.0] * 58 + [1000.0, 2000.0],                     # OUTLIER
        "user_age": [25.0] * 55 + [-5.0, -10.0, 200.0, 150.0, 180.0], # INVALID_RANGE
        "event_date": ["2024-01-01"] * 30 + ["01/02/2024"] * 25 + ["2024-02-31"] * 5, # DATE_PARSE_ERROR
        "target": ["A"] * 55 + ["B"] * 5,                              # CLASS_IMBALANCE
        "leak_col": [v * 1.01 for v in y],                             # TARGET_LEAKAGE (if y is target)
    })

    # Run without target_column
    issues = detect_all_issues(df, dataset_id="00000000-0000-0000-0000-000000000015")
    types = {i.issue_type for i in issues}

    assert IssueType.POSSIBLE_IDENTIFIER in types
    assert IssueType.OUTLIER in types
    assert IssueType.INVALID_RANGE in types
    assert IssueType.DATE_PARSE_ERROR in types
    assert IssueType.CLASS_IMBALANCE in types

    # Run with target_column specified for target leakage
    df_with_numeric_target = df.with_columns(pl.Series("target_metric", y))
    issues_with_target = detect_all_issues(
        df_with_numeric_target,
        dataset_id="00000000-0000-0000-0000-000000000015",
        target_column="target_metric",
    )
    target_types = {i.issue_type for i in issues_with_target}
    assert IssueType.TARGET_LEAKAGE in target_types


# ══════════════════════════════════════════════════════════════════
# 8. API ENDPOINT FILTERING FOR ADVANCED ISSUE TYPES
# ══════════════════════════════════════════════════════════════════

def test_issues_api_filtering_advanced_types(test_project):
    """Verify that the issues router supports filtering by the new Phase 15 issue types."""
    # Create dataset with intentional outlier and invalid range
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["user_uuid", "age", "income"])
    for i in range(25):
        age = 25 + i
        inc = 1000.0 + i * 10
        writer.writerow([f"uuid-{i:04d}", age, inc])
    # Add an extreme outlier and an invalid age
    writer.writerow(["uuid-0025", -99, 1000000.0])
    data = buf.getvalue().encode()

    upload_res = client.post(
        f"/api/v1/projects/{test_project['id']}/datasets/upload",
        files={"file": ("advanced_issues.csv", data, "text/csv")},
    )
    assert upload_res.status_code == 201
    dataset_id = upload_res.json()["dataset"]["id"]

    # Trigger profile to detect and persist issues
    prof_res = client.post(f"/api/v1/projects/{test_project['id']}/datasets/{dataset_id}/profile")
    assert prof_res.status_code == 200

    # Test filtering by OUTLIER
    outlier_res = client.get(
        f"/api/v1/projects/{test_project['id']}/datasets/{dataset_id}/issues?issue_type=OUTLIER"
    )
    assert outlier_res.status_code == 200
    outlier_data = outlier_res.json()
    assert outlier_data["total_issues"] >= 1
    for iss in outlier_data["issues"]:
        assert iss["issue_type"] == "OUTLIER"

    # Test filtering by INVALID_RANGE
    range_res = client.get(
        f"/api/v1/projects/{test_project['id']}/datasets/{dataset_id}/issues?issue_type=INVALID_RANGE"
    )
    assert range_res.status_code == 200
    range_data = range_res.json()
    assert range_data["total_issues"] >= 1
    for iss in range_data["issues"]:
        assert iss["issue_type"] == "INVALID_RANGE"
