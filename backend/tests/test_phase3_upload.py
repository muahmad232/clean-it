"""
Phase 3 tests — Dataset upload API.

Tests are ordered by concern:
  1. File validator (pure unit tests — no network)
  2. /api/v1/limits endpoint
  3. Upload endpoint (integration — hits real Supabase Storage + DB)

Run with:
    pytest tests/test_phase3_upload.py -v
"""

import io
import csv
import json
import uuid
import pytest
from fastapi.testclient import TestClient
from fastapi import HTTPException

from app.main import app
from app.services.file_validator import validate_upload, FileMetadata
from app.database.client import get_service_client
from app.database.repositories.datasets import create_project
from app.models.dataset import ProjectCreate

client = TestClient(app)

# ── Shared test project ───────────────────────────────────────────
TEST_USER_ID = "00000000-0000-0000-0000-000000000001"


@pytest.fixture(scope="module")
def test_project():
    """Create a real project for upload integration tests."""
    record = create_project(TEST_USER_ID, ProjectCreate(name="Phase3UploadTest"))
    yield record
    # Cascade deletes datasets too
    get_service_client().schema("data_agent").table("projects").delete().eq("id", record["id"]).execute()


# ── CSV builder helpers ───────────────────────────────────────────

def make_csv(rows: int = 10, cols: int = 3, header: list[str] | None = None) -> bytes:
    buf = io.StringIO()
    writer = csv.writer(buf)
    h = header or [f"col_{i}" for i in range(cols)]
    writer.writerow(h)
    for r in range(rows):
        writer.writerow([f"val_{r}_{c}" for c in range(len(h))])
    return buf.getvalue().encode()


# ══════════════════════════════════════════════════════════════════
# FILE VALIDATOR — unit tests (no network)
# ══════════════════════════════════════════════════════════════════

class TestFileValidator:
    def test_valid_csv_returns_metadata(self):
        data = make_csv(rows=5, cols=3)
        meta = validate_upload("test.csv", "text/csv", data)
        assert isinstance(meta, FileMetadata)
        assert meta.extension == "csv"
        assert meta.column_count == 3
        assert meta.estimated_row_count == 5
        assert meta.file_size == len(data)

    def test_empty_file_raises_400(self):
        with pytest.raises(HTTPException) as exc:
            validate_upload("test.csv", "text/csv", b"")
        assert exc.value.status_code == 400
        assert "empty" in str(exc.value.detail).lower()

    def test_unsupported_extension_raises_415(self):
        with pytest.raises(HTTPException) as exc:
            validate_upload("data.xlsx", "application/vnd.ms-excel", b"some bytes")
        assert exc.value.status_code == 415

    def test_file_too_large_raises_413(self):
        # 51 MB of bytes (just over the 50 MB limit)
        big = b"a" * (51 * 1024 * 1024)
        with pytest.raises(HTTPException) as exc:
            validate_upload("big.csv", "text/csv", big)
        assert exc.value.status_code == 413

    def test_csv_no_header_raises_400(self):
        with pytest.raises(HTTPException) as exc:
            validate_upload("empty.csv", "text/csv", b"")
        assert exc.value.status_code == 400

    def test_csv_column_count_captured(self):
        data = make_csv(rows=100, cols=10)
        meta = validate_upload("wide.csv", "text/csv", data)
        assert meta.column_count == 10

    def test_valid_json_array_passes(self):
        data = json.dumps([{"a": 1}, {"a": 2}]).encode()
        meta = validate_upload("data.json", "application/json", data)
        assert meta.extension == "json"

    def test_invalid_json_raises_400(self):
        with pytest.raises(HTTPException) as exc:
            validate_upload("bad.json", "application/json", b"not json {{{")
        assert exc.value.status_code == 400
        assert "json" in str(exc.value.detail).lower()

    def test_parquet_wrong_magic_raises_400(self):
        with pytest.raises(HTTPException) as exc:
            validate_upload("data.parquet", "application/octet-stream", b"not parquet content here!!")
        assert exc.value.status_code == 400
        assert "parquet" in str(exc.value.detail).lower()

    def test_csv_with_bom_parses_correctly(self):
        """UTF-8 BOM (common from Excel exports) must be handled."""
        data = b"\xef\xbb\xbf" + make_csv(rows=3, cols=2)  # BOM prefix
        meta = validate_upload("excel_export.csv", "text/csv", data)
        assert meta.column_count == 2

    def test_extension_case_insensitive(self):
        data = make_csv(rows=5, cols=3)
        meta = validate_upload("DATA.CSV", "text/csv", data)
        assert meta.extension == "csv"


# ══════════════════════════════════════════════════════════════════
# /api/v1/limits  — endpoint test
# ══════════════════════════════════════════════════════════════════

class TestLimitsEndpoint:
    def test_returns_200(self):
        r = client.get("/api/v1/limits")
        assert r.status_code == 200

    def test_has_required_fields(self):
        data = r = client.get("/api/v1/limits").json()
        assert "max_upload_mb" in data
        assert "max_rows" in data
        assert "max_columns" in data
        assert "allowed_extensions" in data

    def test_max_upload_mb_is_50(self):
        data = client.get("/api/v1/limits").json()
        assert data["max_upload_mb"] == 50

    def test_allowed_extensions_correct(self):
        data = client.get("/api/v1/limits").json()
        assert set(data["allowed_extensions"]) == {"csv", "json", "parquet"}


# ══════════════════════════════════════════════════════════════════
# UPLOAD ENDPOINT — integration tests
# ══════════════════════════════════════════════════════════════════

class TestUploadEndpoint:
    def test_upload_csv_returns_201(self, test_project):
        data = make_csv(rows=20, cols=4)
        r = client.post(
            f"/api/v1/projects/{test_project['id']}/datasets/upload",
            files={"file": ("sample.csv", data, "text/csv")},
        )
        assert r.status_code == 201, r.text

    def test_upload_response_has_dataset(self, test_project):
        data = make_csv(rows=10, cols=3)
        r = client.post(
            f"/api/v1/projects/{test_project['id']}/datasets/upload",
            files={"file": ("test.csv", data, "text/csv")},
        )
        body = r.json()
        assert "dataset" in body
        assert body["dataset"]["status"] == "UPLOADED"
        assert body["dataset"]["original_filename"] == "test.csv"

    def test_upload_sets_storage_path(self, test_project):
        data = make_csv(rows=5, cols=2)
        r = client.post(
            f"/api/v1/projects/{test_project['id']}/datasets/upload",
            files={"file": ("storage_test.csv", data, "text/csv")},
        )
        body = r.json()
        assert body["dataset"]["storage_path"] is not None
        assert "original" in body["dataset"]["storage_path"]

    def test_upload_records_column_and_row_count(self, test_project):
        data = make_csv(rows=50, cols=5)
        r = client.post(
            f"/api/v1/projects/{test_project['id']}/datasets/upload",
            files={"file": ("counted.csv", data, "text/csv")},
        )
        body = r.json()
        ds = body["dataset"]
        assert ds["column_count"] == 5
        assert ds["row_count"] is not None and ds["row_count"] > 0

    def test_upload_json_succeeds(self, test_project):
        data = json.dumps([{"name": "Alice", "age": 30}, {"name": "Bob", "age": 25}]).encode()
        r = client.post(
            f"/api/v1/projects/{test_project['id']}/datasets/upload",
            files={"file": ("people.json", data, "application/json")},
        )
        assert r.status_code == 201
        assert r.json()["dataset"]["file_type"] == "json"

    def test_upload_with_task_type(self, test_project):
        data = make_csv(rows=10, cols=3, header=["feature1", "feature2", "target"])
        r = client.post(
            f"/api/v1/projects/{test_project['id']}/datasets/upload",
            data={"task_type": "CLASSIFICATION", "target_column": "target"},
            files={"file": ("ml.csv", data, "text/csv")},
        )
        assert r.status_code == 201
        ds = r.json()["dataset"]
        assert ds["task_type"] == "CLASSIFICATION"
        assert ds["target_column"] == "target"

    def test_upload_to_nonexistent_project_returns_404(self):
        data = make_csv(rows=5, cols=2)
        r = client.post(
            f"/api/v1/projects/{uuid.uuid4()}/datasets/upload",
            files={"file": ("test.csv", data, "text/csv")},
        )
        assert r.status_code == 404

    def test_upload_unsupported_type_returns_415(self, test_project):
        r = client.post(
            f"/api/v1/projects/{test_project['id']}/datasets/upload",
            files={"file": ("data.xlsx", b"fake excel content", "application/vnd.ms-excel")},
        )
        assert r.status_code == 415

    def test_upload_empty_file_returns_400(self, test_project):
        r = client.post(
            f"/api/v1/projects/{test_project['id']}/datasets/upload",
            files={"file": ("empty.csv", b"", "text/csv")},
        )
        assert r.status_code == 400

    def test_list_datasets_returns_uploaded(self, test_project):
        # Upload one
        data = make_csv(rows=5, cols=2)
        client.post(
            f"/api/v1/projects/{test_project['id']}/datasets/upload",
            files={"file": ("list_test.csv", data, "text/csv")},
        )
        # List
        r = client.get(f"/api/v1/projects/{test_project['id']}/datasets")
        assert r.status_code == 200
        body = r.json()
        assert "datasets" in body
        assert body["count"] >= 1

    def test_get_single_dataset(self, test_project):
        # Upload
        data = make_csv(rows=5, cols=2)
        upload_r = client.post(
            f"/api/v1/projects/{test_project['id']}/datasets/upload",
            files={"file": ("single.csv", data, "text/csv")},
        )
        dataset_id = upload_r.json()["dataset"]["id"]
        # Get
        r = client.get(f"/api/v1/projects/{test_project['id']}/datasets/{dataset_id}")
        assert r.status_code == 200
        assert r.json()["dataset"]["id"] == dataset_id

    def test_get_nonexistent_dataset_returns_404(self, test_project):
        r = client.get(f"/api/v1/projects/{test_project['id']}/datasets/{uuid.uuid4()}")
        assert r.status_code == 404
