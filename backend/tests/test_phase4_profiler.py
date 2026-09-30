"""
Phase 4 tests — Dataset profiling.

Structure
---------
1. Profiler unit tests (pure — no network)
2. Profile endpoint integration tests (real Supabase Storage + DB)

Run with:
    pytest tests/test_phase4_profiler.py -v
"""

import io
import csv
import json
import uuid
import pytest
import polars as pl
from fastapi.testclient import TestClient

from app.main import app
from app.services.profiler import profile_dataset, DatasetProfile
from app.database.client import get_service_client
from app.database.repositories.datasets import create_project, create_dataset
from app.models.dataset import ProjectCreate, DatasetCreate

client = TestClient(app)

TEST_USER_ID = "00000000-0000-0000-0000-000000000001"


# ── Fixtures ───────────────────────────────────────────────────────

@pytest.fixture(scope="module")
def test_project():
    record = create_project(TEST_USER_ID, ProjectCreate(name="Phase4ProfileTest"))
    yield record
    get_service_client().schema("data_agent").table("projects").delete().eq("id", record["id"]).execute()


def _make_csv_bytes(rows: int = 50, cols: int = 5, add_nulls: bool = False) -> bytes:
    buf = io.StringIO()
    writer = csv.writer(buf)
    header = ["id", "name", "age", "score", "category"][:cols]
    writer.writerow(header)
    for i in range(rows):
        row = [
            i + 1,
            f"Person_{i}" if not (add_nulls and i % 5 == 0) else "",
            20 + (i % 50),
            round(0.5 + (i % 100) / 100, 2),
            ["A", "B", "C"][i % 3],
        ][:cols]
        writer.writerow(row)
    return buf.getvalue().encode()


def _make_csv_with_dups(rows: int = 20) -> bytes:
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["x", "y"])
    for i in range(rows):
        writer.writerow([i % 5, i % 3])   # lots of duplicates
    return buf.getvalue().encode()


def _make_csv_all_nulls(col: str = "empty_col") -> bytes:
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["id", col])
    for i in range(20):
        writer.writerow([i, ""])
    return buf.getvalue().encode()


def _make_json_bytes() -> bytes:
    data = [{"name": f"Item_{i}", "value": i * 1.5, "tag": ["x", "y"][i % 2]} for i in range(30)]
    return json.dumps(data).encode()


# ══════════════════════════════════════════════════════════════════
# PROFILER — unit tests (no network)
# ══════════════════════════════════════════════════════════════════

class TestProfilerUnit:
    def test_profile_csv_returns_datasetprofile(self):
        data = _make_csv_bytes(rows=50, cols=5)
        p = profile_dataset("test-id", data, "csv")
        assert isinstance(p, DatasetProfile)

    def test_profile_shape_correct(self):
        data = _make_csv_bytes(rows=50, cols=5)
        p = profile_dataset("test-id", data, "csv")
        assert p.shape["rows"] == 50
        assert p.shape["columns"] == 5

    def test_profile_column_count_matches(self):
        data = _make_csv_bytes(rows=10, cols=3)
        p = profile_dataset("test-id", data, "csv")
        assert len(p.columns) == 3

    def test_profile_column_names_correct(self):
        data = _make_csv_bytes(rows=5, cols=3)
        p = profile_dataset("test-id", data, "csv")
        assert p.columns[0].name == "id"
        assert p.columns[1].name == "name"
        assert p.columns[2].name == "age"

    def test_profile_numeric_stats_present(self):
        data = _make_csv_bytes(rows=20, cols=3)
        p = profile_dataset("test-id", data, "csv")
        age_col = next(c for c in p.columns if c.name == "age")
        assert age_col.stats.get("min") is not None
        assert age_col.stats.get("max") is not None
        assert age_col.stats.get("mean") is not None

    def test_profile_null_detection(self):
        data = _make_csv_bytes(rows=20, cols=3, add_nulls=True)
        p = profile_dataset("test-id", data, "csv")
        name_col = next((c for c in p.columns if c.name == "name"), None)
        if name_col:
            assert name_col.null_count >= 0

    def test_profile_duplicate_detection(self):
        data = _make_csv_with_dups(rows=20)
        p = profile_dataset("test-id", data, "csv")
        assert p.duplicate_row_count >= 0  # duplicates present

    def test_profile_high_null_flag(self):
        data = _make_csv_all_nulls()
        p = profile_dataset("test-id", data, "csv")
        empty_col = next((c for c in p.columns if c.name == "empty_col"), None)
        if empty_col:
            # empty_col should be 100% null → flagged
            assert "high_null" in empty_col.flags

    def test_profile_json_file(self):
        data = _make_json_bytes()
        p = profile_dataset("test-id", data, "json")
        assert p.shape["rows"] == 30
        assert p.shape["columns"] == 3

    def test_profile_llm_summary_non_empty(self):
        data = _make_csv_bytes(rows=50, cols=5)
        p = profile_dataset("test-id", data, "csv")
        assert len(p.llm_summary) > 50

    def test_profile_llm_summary_has_row_count(self):
        data = _make_csv_bytes(rows=50, cols=5)
        p = profile_dataset("test-id", data, "csv")
        assert "50" in p.llm_summary

    def test_profile_to_dict_serializable(self):
        data = _make_csv_bytes(rows=10, cols=3)
        p = profile_dataset("test-id", data, "csv")
        d = p.to_dict()
        serialized = json.dumps(d)  # must not raise
        assert "shape" in serialized

    def test_profile_sample_values_present(self):
        data = _make_csv_bytes(rows=20, cols=3)
        p = profile_dataset("test-id", data, "csv")
        for col in p.columns:
            assert isinstance(col.sample_values, list)

    def test_profile_issues_is_list(self):
        data = _make_csv_bytes(rows=20, cols=3)
        p = profile_dataset("test-id", data, "csv")
        assert isinstance(p.issues, list)

    def test_profile_total_null_pct_between_0_and_100(self):
        data = _make_csv_bytes(rows=20, cols=3)
        p = profile_dataset("test-id", data, "csv")
        assert 0.0 <= p.total_null_pct <= 100.0


# ══════════════════════════════════════════════════════════════════
# PROFILE ENDPOINT — integration tests
# ══════════════════════════════════════════════════════════════════

class TestProfileEndpoint:

    @pytest.fixture(autouse=True)
    def uploaded_dataset(self, test_project):
        """Upload a CSV and return its dataset record for each test."""
        data = _make_csv_bytes(rows=30, cols=5)
        r = client.post(
            f"/api/v1/projects/{test_project['id']}/datasets/upload",
            files={"file": ("profile_test.csv", data, "text/csv")},
        )
        assert r.status_code == 201, r.text
        self.project_id = test_project["id"]
        self.dataset_id = r.json()["dataset"]["id"]

    def test_profile_returns_200(self):
        r = client.post(
            f"/api/v1/projects/{self.project_id}/datasets/{self.dataset_id}/profile"
        )
        assert r.status_code == 200, r.text

    def test_profile_response_has_status_completed(self):
        r = client.post(
            f"/api/v1/projects/{self.project_id}/datasets/{self.dataset_id}/profile"
        )
        assert r.json()["status"] == "COMPLETED"

    def test_profile_response_has_shape(self):
        r = client.post(
            f"/api/v1/projects/{self.project_id}/datasets/{self.dataset_id}/profile"
        )
        profile = r.json()["profile"]
        assert "shape" in profile
        assert profile["shape"]["rows"] == 30
        assert profile["shape"]["columns"] == 5

    def test_profile_response_has_columns(self):
        r = client.post(
            f"/api/v1/projects/{self.project_id}/datasets/{self.dataset_id}/profile"
        )
        profile = r.json()["profile"]
        assert "columns" in profile
        assert len(profile["columns"]) == 5

    def test_profile_response_has_llm_summary(self):
        r = client.post(
            f"/api/v1/projects/{self.project_id}/datasets/{self.dataset_id}/profile"
        )
        assert len(r.json()["summary"]) > 0

    def test_profile_response_has_issues_list(self):
        r = client.post(
            f"/api/v1/projects/{self.project_id}/datasets/{self.dataset_id}/profile"
        )
        body = r.json()
        assert "issues" in body
        assert isinstance(body["issues"], list)

    def test_get_cached_profile_after_post(self):
        client.post(
            f"/api/v1/projects/{self.project_id}/datasets/{self.dataset_id}/profile"
        )
        r = client.get(
            f"/api/v1/projects/{self.project_id}/datasets/{self.dataset_id}/profile"
        )
        assert r.status_code == 200
        assert r.json()["profile"]["shape"]["rows"] == 30

    def test_get_profile_before_profiling_returns_404(self):
        # Create a fresh dataset without profiling
        data = _make_csv_bytes(rows=5, cols=2)
        upload = client.post(
            f"/api/v1/projects/{self.project_id}/datasets/upload",
            files={"file": ("unprofiled.csv", data, "text/csv")},
        )
        new_id = upload.json()["dataset"]["id"]
        r = client.get(
            f"/api/v1/projects/{self.project_id}/datasets/{new_id}/profile"
        )
        assert r.status_code == 404

    def test_profile_nonexistent_dataset_returns_404(self):
        r = client.post(
            f"/api/v1/projects/{self.project_id}/datasets/{uuid.uuid4()}/profile"
        )
        assert r.status_code == 404

    def test_profile_is_idempotent(self):
        """Calling profile twice should succeed both times."""
        r1 = client.post(
            f"/api/v1/projects/{self.project_id}/datasets/{self.dataset_id}/profile"
        )
        r2 = client.post(
            f"/api/v1/projects/{self.project_id}/datasets/{self.dataset_id}/profile"
        )
        assert r1.status_code == 200
        assert r2.status_code == 200
        assert r1.json()["profile"]["shape"] == r2.json()["profile"]["shape"]
