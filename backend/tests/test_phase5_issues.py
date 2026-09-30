"""
Phase 5 tests — Basic Deterministic Issue Detection.

Structure
---------
1. Unit tests for each of the 7 individual detectors (pure Polars — no network):
   - MISSING_VALUES
   - DUPLICATES
   - CONSTANT_COLUMN
   - NEAR_CONSTANT_COLUMN
   - POSSIBLE_IDENTIFIER
   - HIGH_CARDINALITY
   - TYPE_MISMATCH
2. Orchestrator tests (detect_all_issues & Pydantic validation)
3. Endpoint integration tests (GET /projects/{p_id}/datasets/{d_id}/issues & direct route)

Run with:
    pytest tests/test_phase5_issues.py -v
"""

import io
import csv
import json
import uuid
import pytest
import polars as pl
from fastapi.testclient import TestClient

from app.main import app
from app.models.issue import Issue, IssueType, Severity, IssueStatus
from app.services.issue_detector import (
    detect_missing_values,
    detect_duplicates,
    detect_constant_columns,
    detect_near_constant_columns,
    detect_possible_identifiers,
    detect_high_cardinality,
    detect_type_mismatches,
    detect_all_issues,
)
from app.database.client import get_service_client
from app.database.repositories.datasets import create_project, create_dataset
from app.models.dataset import ProjectCreate

client = TestClient(app)

TEST_USER_ID = "00000000-0000-0000-0000-000000000001"


# ══════════════════════════════════════════════════════════════════
# FIXTURES & HELPERS
# ══════════════════════════════════════════════════════════════════

@pytest.fixture(scope="module")
def test_project():
    record = create_project(TEST_USER_ID, ProjectCreate(name="Phase5IssuesTest"))
    yield record
    try:
        get_service_client().schema("data_agent").table("projects").delete().eq("id", record["id"]).execute()
    except Exception:
        pass


def _make_csv_bytes(rows: int = 50, cols: int = 5) -> bytes:
    buf = io.StringIO()
    writer = csv.writer(buf)
    header = ["id", "name", "age", "score", "category"][:cols]
    writer.writerow(header)
    for i in range(rows):
        writer.writerow([
            i + 1,
            f"Person_{i}",
            20 + (i % 50),
            round(0.5 + (i % 100) / 100, 2),
            ["A", "B", "C"][i % 3],
        ][:cols])
    return buf.getvalue().encode()


# ══════════════════════════════════════════════════════════════════
# 1. UNIT TESTS — 7 DETECTORS
# ══════════════════════════════════════════════════════════════════

class TestMissingValuesDetector:
    def test_no_missing_returns_empty(self):
        df = pl.DataFrame({"a": [1, 2, 3, 4, 5]})
        issues = detect_missing_values(df, "a", total_rows=5)
        assert issues == []

    def test_missing_below_threshold_returns_empty(self):
        df = pl.DataFrame({"a": [1, 2, 3, None, 5]})
        # 1 out of 5 = 20%, threshold = 25%
        issues = detect_missing_values(df, "a", total_rows=5, threshold_pct=25.0)
        assert issues == []

    def test_missing_detected_with_evidence(self):
        df = pl.DataFrame({"a": [1, None, 3, None, None, 6, 7, 8, 9, 10]})
        issues = detect_missing_values(df, "a", total_rows=10)
        assert len(issues) == 1
        iss = issues[0]
        assert iss.issue_type == IssueType.MISSING_VALUES
        assert iss.column_name == "a"
        assert iss.evidence_json["null_count"] == 3
        assert iss.evidence_json["null_pct"] == 30.0
        assert iss.severity == Severity.HIGH  # 30% is >= 25%

    def test_severity_levels(self):
        # Critical >= 60%
        df_crit = pl.DataFrame({"a": [None, None, None, 4]})
        iss_crit = detect_missing_values(df_crit, "a", total_rows=4)[0]
        assert iss_crit.severity == Severity.CRITICAL

        # Low < 5%
        df_low = pl.DataFrame({"a": [1] * 99 + [None]})
        iss_low = detect_missing_values(df_low, "a", total_rows=100)[0]
        assert iss_low.severity == Severity.LOW

    def test_missing_on_nonexistent_column(self):
        df = pl.DataFrame({"a": [1, 2]})
        issues = detect_missing_values(df, "nonexistent", total_rows=2)
        assert issues == []


class TestDuplicatesDetector:
    def test_no_duplicates_returns_empty(self):
        df = pl.DataFrame({"x": [1, 2, 3], "y": ["a", "b", "c"]})
        issues = detect_duplicates(df, total_rows=3)
        assert issues == []

    def test_duplicates_detected_with_evidence(self):
        df = pl.DataFrame({
            "x": [1, 2, 1, 1, 5],
            "y": ["a", "b", "a", "a", "e"],
        })
        # 3 identical rows [1, "a"] -> 2 duplicates
        issues = detect_duplicates(df, total_rows=5)
        assert len(issues) == 1
        iss = issues[0]
        assert iss.issue_type == IssueType.DUPLICATES
        assert iss.column_name is None
        assert iss.evidence_json["duplicate_count"] == 2
        assert iss.evidence_json["duplicate_pct"] == 40.0
        assert iss.severity == Severity.CRITICAL  # >= 25%

    def test_single_row_dataset(self):
        df = pl.DataFrame({"x": [1]})
        issues = detect_duplicates(df, total_rows=1)
        assert issues == []


class TestConstantColumnDetector:
    def test_constant_column_detected(self):
        df = pl.DataFrame({"status": ["ACTIVE"] * 20})
        issues = detect_constant_columns(df, "status", total_rows=20)
        assert len(issues) == 1
        iss = issues[0]
        assert iss.issue_type == IssueType.CONSTANT_COLUMN
        assert iss.column_name == "status"
        assert iss.severity == Severity.HIGH
        assert iss.evidence_json["constant_value"] == "ACTIVE"

    def test_variable_column_returns_empty(self):
        df = pl.DataFrame({"status": ["ACTIVE"] * 10 + ["INACTIVE"] * 10})
        issues = detect_constant_columns(df, "status", total_rows=20)
        assert issues == []

    def test_all_nulls_ignored_by_constant_detector(self):
        df = pl.DataFrame({"empty": [None] * 10})
        issues = detect_constant_columns(df, "empty", total_rows=10)
        assert issues == []  # Covered by missing values


class TestNearConstantColumnDetector:
    def test_near_constant_detected(self):
        # 96 rows 'USA', 4 rows 'UK' -> 96% frequency (>95%)
        df = pl.DataFrame({"country": ["USA"] * 96 + ["UK"] * 4})
        issues = detect_near_constant_columns(df, "country", total_rows=100)
        assert len(issues) == 1
        iss = issues[0]
        assert iss.issue_type == IssueType.NEAR_CONSTANT_COLUMN
        assert iss.column_name == "country"
        assert iss.severity == Severity.MEDIUM
        assert iss.evidence_json["top_value"] == "USA"
        assert iss.evidence_json["frequency_pct"] == 96.0

    def test_strictly_constant_ignored_by_near_constant(self):
        df = pl.DataFrame({"country": ["USA"] * 50})
        # Handled by CONSTANT_COLUMN, not near-constant
        issues = detect_near_constant_columns(df, "country", total_rows=50)
        assert issues == []

    def test_balanced_column_returns_empty(self):
        df = pl.DataFrame({"country": ["USA"] * 60 + ["UK"] * 40})
        issues = detect_near_constant_columns(df, "country", total_rows=100)
        assert issues == []


class TestPossibleIdentifierDetector:
    def test_100_pct_unique_string_detected(self):
        uuids = [str(uuid.uuid4()) for _ in range(20)]
        df = pl.DataFrame({"user_uuid": uuids})
        issues = detect_possible_identifiers(df, "user_uuid", total_rows=20)
        assert len(issues) == 1
        iss = issues[0]
        assert iss.issue_type == IssueType.POSSIBLE_IDENTIFIER
        assert iss.column_name == "user_uuid"
        assert iss.severity == Severity.LOW
        assert iss.evidence_json["unique_pct"] == 100.0

    def test_non_unique_string_returns_empty(self):
        df = pl.DataFrame({"category": ["A", "B", "A", "C", "B"]})
        issues = detect_possible_identifiers(df, "category", total_rows=5)
        assert issues == []

    def test_numeric_unique_not_flagged_as_string_identifier(self):
        df = pl.DataFrame({"id": list(range(20))})
        issues = detect_possible_identifiers(df, "id", total_rows=20)
        assert issues == []


class TestHighCardinalityDetector:
    def test_high_cardinality_detected(self):
        # 15 unique values in 20 rows = 75% unique (>50% threshold, <100%)
        vals = [f"tag_{i % 15}" for i in range(20)]
        df = pl.DataFrame({"tags": vals})
        issues = detect_high_cardinality(df, "tags", total_rows=20)
        assert len(issues) == 1
        iss = issues[0]
        assert iss.issue_type == IssueType.HIGH_CARDINALITY
        assert iss.column_name == "tags"
        assert iss.severity == Severity.MEDIUM
        assert iss.evidence_json["unique_pct"] == 75.0

    def test_low_cardinality_returns_empty(self):
        vals = [f"tag_{i % 3}" for i in range(20)]  # 3 unique in 20 = 15%
        df = pl.DataFrame({"tags": vals})
        issues = detect_high_cardinality(df, "tags", total_rows=20)
        assert issues == []

    def test_100_pct_unique_ignored_by_high_cardinality(self):
        vals = [f"tag_{i}" for i in range(20)]
        df = pl.DataFrame({"tags": vals})
        # 100% unique is covered by POSSIBLE_IDENTIFIER
        issues = detect_high_cardinality(df, "tags", total_rows=20)
        assert issues == []


class TestTypeMismatchDetector:
    def test_numeric_stored_as_string(self):
        df = pl.DataFrame({"price": ["12.50", "99.99", "3.14", "100.0", "42"] * 4})
        issues = detect_type_mismatches(df, "price", total_rows=20)
        assert len(issues) == 1
        iss = issues[0]
        assert iss.issue_type == IssueType.TYPE_MISMATCH
        assert iss.column_name == "price"
        assert iss.evidence_json["inferred_dtype"] == "Float64"
        assert iss.evidence_json["convertible_pct"] == 100.0

    def test_datetime_stored_as_string(self):
        dates = ["2023-01-15", "2023-02-20", "2023-03-25", "2023-04-10"] * 5
        df = pl.DataFrame({"created_date": dates})
        issues = detect_type_mismatches(df, "created_date", total_rows=20)
        assert len(issues) == 1
        iss = issues[0]
        assert iss.issue_type == IssueType.TYPE_MISMATCH
        assert iss.column_name == "created_date"
        assert iss.evidence_json["inferred_dtype"] == "Datetime"

    def test_boolean_stored_as_string(self):
        bools = ["true", "false", "true", "false"] * 5
        df = pl.DataFrame({"is_active": bools})
        issues = detect_type_mismatches(df, "is_active", total_rows=20)
        assert len(issues) == 1
        iss = issues[0]
        assert iss.issue_type == IssueType.TYPE_MISMATCH
        assert iss.column_name == "is_active"
        assert iss.evidence_json["inferred_dtype"] == "Boolean"

    def test_regular_text_no_mismatch(self):
        df = pl.DataFrame({"bio": ["Data scientist", "Software engineer", "Designer", "Product manager"] * 5})
        issues = detect_type_mismatches(df, "bio", total_rows=20)
        assert issues == []


# ══════════════════════════════════════════════════════════════════
# 2. ORCHESTRATOR TESTS
# ══════════════════════════════════════════════════════════════════

class TestDetectAllIssues:
    def test_multi_issue_dataset(self):
        n = 30
        df = pl.DataFrame({
            "id": [f"ID_{i}" for i in range(n)],                  # POSSIBLE_IDENTIFIER
            "const_col": ["FIXED"] * n,                          # CONSTANT_COLUMN
            "near_const": ["COMMON"] * 29 + ["RARE"],            # NEAR_CONSTANT_COLUMN
            "num_as_str": ["123.45"] * n,                        # TYPE_MISMATCH + CONSTANT
            "missing_col": [i if i % 3 != 0 else None for i in range(n)],  # MISSING_VALUES
            "category": ["A", "B", "C"] * 10,
        })
        issues = detect_all_issues(df, dataset_id="00000000-0000-0000-0000-000000000002")
        assert len(issues) >= 4

        issue_types = {iss.issue_type for iss in issues}
        assert IssueType.POSSIBLE_IDENTIFIER in issue_types
        assert IssueType.CONSTANT_COLUMN in issue_types
        assert IssueType.MISSING_VALUES in issue_types

        # Verify all issues are valid Issue instances
        for iss in issues:
            assert isinstance(iss, Issue)
            d = iss.to_dict()
            assert "issue_type" in d
            assert "severity" in d
            assert "confidence" in d
            assert "description" in d
            assert "evidence_json" in d


# ══════════════════════════════════════════════════════════════════
# 3. ENDPOINT INTEGRATION TESTS
# ══════════════════════════════════════════════════════════════════

class TestIssuesEndpoint:

    @pytest.fixture(autouse=True)
    def setup_dataset(self, test_project):
        """Upload and profile a dataset with known issues."""
        # 30 rows with intentional missing values and a constant column
        buf = io.StringIO()
        writer = csv.writer(buf)
        writer.writerow(["user_uuid", "status", "age", "city"])
        for i in range(30):
            writer.writerow([
                f"uuid-{i:04d}",                       # 100% unique string
                "ACTIVE",                              # Constant
                25 + i if i % 3 != 0 else "",          # ~33% missing
                ["New York", "Chicago"][i % 2],
            ])
        data = buf.getvalue().encode()

        upload = client.post(
            f"/api/v1/projects/{test_project['id']}/datasets/upload",
            files={"file": ("issues_test.csv", data, "text/csv")},
        )
        assert upload.status_code == 201
        self.project_id = test_project["id"]
        self.dataset_id = upload.json()["dataset"]["id"]

        # Run profiling to trigger deterministic issue detection
        prof = client.post(
            f"/api/v1/projects/{self.project_id}/datasets/{self.dataset_id}/profile"
        )
        assert prof.status_code == 200

    def test_get_issues_returns_200(self):
        r = client.get(
            f"/api/v1/projects/{self.project_id}/datasets/{self.dataset_id}/issues"
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert "issues" in body
        assert "total_issues" in body
        assert body["total_issues"] > 0
        assert len(body["issues"]) == body["total_issues"]

    def test_get_issues_has_expected_types(self):
        r = client.get(
            f"/api/v1/projects/{self.project_id}/datasets/{self.dataset_id}/issues"
        )
        assert r.status_code == 200
        body = r.json()
        types = [iss["issue_type"] for iss in body["issues"]]
        assert "MISSING_VALUES" in types
        assert "CONSTANT_COLUMN" in types
        assert "POSSIBLE_IDENTIFIER" in types

    def test_filter_by_severity(self):
        r = client.get(
            f"/api/v1/projects/{self.project_id}/datasets/{self.dataset_id}/issues?severity=HIGH"
        )
        assert r.status_code == 200
        body = r.json()
        for iss in body["issues"]:
            assert iss["severity"] == "HIGH"

    def test_filter_by_issue_type(self):
        r = client.get(
            f"/api/v1/projects/{self.project_id}/datasets/{self.dataset_id}/issues?issue_type=MISSING_VALUES"
        )
        assert r.status_code == 200
        body = r.json()
        for iss in body["issues"]:
            assert iss["issue_type"] == "MISSING_VALUES"

    def test_direct_route_get_issues(self):
        r = client.get(f"/api/v1/datasets/{self.dataset_id}/issues")
        assert r.status_code == 200
        body = r.json()
        assert body["dataset_id"] == self.dataset_id
        assert body["total_issues"] > 0

    def test_get_issues_nonexistent_dataset_returns_404(self):
        random_id = str(uuid.uuid4())
        r = client.get(
            f"/api/v1/projects/{self.project_id}/datasets/{random_id}/issues"
        )
        assert r.status_code == 404

    def test_get_issues_unprofiled_dataset_returns_404(self):
        # Create unprofiled dataset
        data = _make_csv_bytes(rows=10, cols=2)
        upload = client.post(
            f"/api/v1/projects/{self.project_id}/datasets/upload",
            files={"file": ("unprofiled.csv", data, "text/csv")},
        )
        unprofiled_id = upload.json()["dataset"]["id"]
        r = client.get(
            f"/api/v1/projects/{self.project_id}/datasets/{unprofiled_id}/issues"
        )
        assert r.status_code == 404
        assert r.json()["detail"]["error"] == "issues_not_found"
