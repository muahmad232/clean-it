"""
Unit & Integration Tests for Phase 11 — Dataset Versioning & Rollback.
"""

from unittest.mock import MagicMock, patch
import io
import pytest
import polars as pl
from fastapi.testclient import TestClient

from app.main import app
from app.services.versioning import convert_to_parquet, create_dataset_version
from app.services.rollback import rollback_dataset_version
from app.database.repositories.versions import (
    save_version,
    list_versions,
    get_version,
    get_current_version,
    get_version_by_number,
    set_current_version,
)

client = TestClient(app)

SAMPLE_CSV = b"id,name,age\n1,Alice,30\n2,Bob,25\n3,Charlie,35\n"
SAMPLE_V1_CSV = b"id,name,age\n1,Alice,30\n2,Bob,25\n3,Charlie,35\n4,David,40\n"


def test_convert_to_parquet():
    """Verify CSV bytes are properly converted to columnar Parquet bytes."""
    parquet_bytes = convert_to_parquet(SAMPLE_CSV, file_type="csv")
    assert parquet_bytes is not None
    assert len(parquet_bytes) > 0

    # Polars can read the Parquet bytes back
    df = pl.read_parquet(io.BytesIO(parquet_bytes))
    assert df.shape == (3, 3)
    assert set(df.columns) == {"id", "name", "age"}

    # Parquet idempotency
    p2 = convert_to_parquet(parquet_bytes, file_type="parquet")
    assert p2 == parquet_bytes


def test_version_lineage_and_immutability():
    """
    Test version creation sequence:
    v0 (Original) -> v1 (Instant Clean) -> v2 (Agent Clean)
    and verify lineage pointers.
    """
    mock_dataset_id = "test-dataset-phase11-001"
    mock_project_id = "test-project-phase11-001"

    # In-memory storage mock
    stored_versions = []

    def mock_save_version(version_row):
        from uuid import uuid4
        row = dict(version_row)
        if "id" not in row:
            row["id"] = str(uuid4())
        # reset previous current flags
        for v in stored_versions:
            v["is_current"] = False
        row["is_current"] = True
        stored_versions.append(row)
        return row

    def mock_list_versions(d_id):
        return [v for v in stored_versions if v.get("dataset_id") == d_id]

    def mock_get_current_version(d_id):
        matching = [v for v in stored_versions if v.get("dataset_id") == d_id and v.get("is_current")]
        return matching[0] if matching else (mock_list_versions(d_id)[-1] if mock_list_versions(d_id) else None)

    def mock_get_version(d_id, v_id):
        for v in stored_versions:
            if v.get("dataset_id") == d_id and v.get("id") == v_id:
                return v
        return None

    def mock_get_version_by_number(d_id, num):
        for v in stored_versions:
            if v.get("dataset_id") == d_id and v.get("version_number") == num:
                return v
        return None

    def mock_set_current_version(d_id, v_id):
        for v in stored_versions:
            if v.get("dataset_id") == d_id:
                v["is_current"] = (v.get("id") == v_id)
        return True

    with patch("app.services.versioning.save_version", side_effect=mock_save_version), \
         patch("app.services.versioning.list_versions", side_effect=mock_list_versions), \
         patch("app.services.versioning.get_current_version", side_effect=mock_get_current_version), \
         patch("app.services.versioning.upload_file", return_value=True), \
         patch("app.services.rollback.get_dataset", return_value={
             "id": mock_dataset_id,
             "project_id": mock_project_id,
             "original_filename": "sample.csv",
             "status": "COMPLETED",
             "profile_json": {},
         }), \
         patch("app.services.rollback.list_versions", side_effect=mock_list_versions), \
         patch("app.services.rollback.get_current_version", side_effect=mock_get_current_version), \
         patch("app.services.rollback.get_version", side_effect=mock_get_version), \
         patch("app.services.rollback.get_version_by_number", side_effect=mock_get_version_by_number), \
         patch("app.services.rollback.set_current_version", side_effect=mock_set_current_version), \
         patch("app.services.rollback.update_dataset_profile", return_value=True), \
         patch("app.services.rollback.get_service_client"):

        # 1. Snapshot v0 Original
        v0 = create_dataset_version(
            dataset_id=mock_dataset_id,
            project_id=mock_project_id,
            file_bytes=SAMPLE_CSV,
            file_type="csv",
            action_name="Initial Ingest (v0 Original)",
        )
        assert v0["version_number"] == 0
        assert v0["parent_version_id"] is None
        assert v0["is_current"] is True

        # 2. Snapshot v1
        v1 = create_dataset_version(
            dataset_id=mock_dataset_id,
            project_id=mock_project_id,
            file_bytes=SAMPLE_V1_CSV,
            file_type="csv",
            action_name="Instant Clean (Polars)",
        )
        assert v1["version_number"] == 1
        assert v1["parent_version_id"] == v0["id"]
        assert v1["is_current"] is True

        # 3. Snapshot v2
        v2 = create_dataset_version(
            dataset_id=mock_dataset_id,
            project_id=mock_project_id,
            file_bytes=SAMPLE_V1_CSV,
            file_type="csv",
            action_name="Autonomous AI Agent Loop",
        )
        assert v2["version_number"] == 2
        assert v2["parent_version_id"] == v1["id"]
        assert v2["is_current"] is True

        # Verify lineage list
        vers = mock_list_versions(mock_dataset_id)
        assert len(vers) == 3
        assert [v["version_number"] for v in vers] == [0, 1, 2]

        # 4. Rollback v2 -> parent (v1)
        res_rb1 = rollback_dataset_version(mock_dataset_id)
        assert res_rb1["previous_version"] == 2
        assert res_rb1["current_version"] == 1
        assert mock_get_current_version(mock_dataset_id)["version_number"] == 1

        # 5. Rollback v1 -> parent (v0)
        res_rb2 = rollback_dataset_version(mock_dataset_id)
        assert res_rb2["previous_version"] == 1
        assert res_rb2["current_version"] == 0
        assert mock_get_current_version(mock_dataset_id)["version_number"] == 0

        # 6. Immutability: cannot rollback past v0!
        with pytest.raises(ValueError, match="immutable"):
            rollback_dataset_version(mock_dataset_id)


def test_versioning_endpoints():
    """Integration test for /api/v1/projects/{p_id}/datasets/{d_id}/versions and rollback."""
    mock_dataset_id = "test-api-dataset-001"
    mock_project_id = "test-api-project-001"

    fake_versions = [
        {
            "id": "v0-uuid",
            "dataset_id": mock_dataset_id,
            "version_number": 0,
            "parent_version_id": None,
            "storage_path": f"datasets/versions/{mock_project_id}/{mock_dataset_id}/v0.csv",
            "file_type": "parquet",
            "quality_score": 50.0,
            "metrics_json": {"rows": 100, "columns": 5, "total_null_pct": 12.0},
            "created_by_action": "Initial Ingest (v0 Original)",
            "is_current": False,
            "created_at": "2026-10-05T12:00:00Z",
        },
        {
            "id": "v1-uuid",
            "dataset_id": mock_dataset_id,
            "version_number": 1,
            "parent_version_id": "v0-uuid",
            "storage_path": f"datasets/versions/{mock_project_id}/{mock_dataset_id}/v1.csv",
            "file_type": "parquet",
            "quality_score": 85.0,
            "metrics_json": {"rows": 98, "columns": 5, "total_null_pct": 0.0},
            "created_by_action": "Instant Clean (Polars)",
            "is_current": True,
            "created_at": "2026-10-05T12:05:00Z",
        },
    ]

    mock_dataset = {
        "id": mock_dataset_id,
        "project_id": mock_project_id,
        "original_filename": "data.csv",
        "status": "COMPLETED",
        "profile_json": {"versions": fake_versions},
    }

    with patch("app.routers.versions.get_dataset", return_value=mock_dataset), \
         patch("app.routers.versions.list_versions", return_value=fake_versions), \
         patch("app.routers.versions.get_current_version", return_value=fake_versions[1]), \
         patch("app.routers.versions.get_version", return_value=fake_versions[0]), \
         patch("app.routers.versions.get_version_by_number", return_value=fake_versions[0]), \
         patch("app.routers.versions.download_file", return_value=SAMPLE_CSV):

        # 1. GET versions list
        res = client.get(f"/api/v1/projects/{mock_project_id}/datasets/{mock_dataset_id}/versions")
        assert res.status_code == 200
        data = res.json()
        assert data["count"] == 2
        assert data["current_version"]["version_number"] == 1
        assert len(data["versions"]) == 2

        # Direct route
        res_dir = client.get(f"/api/v1/datasets/{mock_dataset_id}/versions")
        assert res_dir.status_code == 200

        # 2. GET specific version
        res_v0 = client.get(f"/api/v1/projects/{mock_project_id}/datasets/{mock_dataset_id}/versions/0")
        assert res_v0.status_code == 200
        assert res_v0.json()["version"]["version_number"] == 0

        # 3. Download version CSV
        res_dl = client.get(f"/api/v1/projects/{mock_project_id}/datasets/{mock_dataset_id}/versions/0/download?format=csv")
        assert res_dl.status_code == 200
        assert res_dl.content == SAMPLE_CSV
        assert "text/csv" in res_dl.headers["content-type"]

        # 4. Rollback
        with patch("app.routers.versions.rollback_dataset_version", return_value={
            "dataset_id": mock_dataset_id,
            "rolled_back_to_version": 0,
            "version_id": fake_versions[0]["id"],
            "storage_path": fake_versions[0]["storage_path"],
            "metrics": fake_versions[0]["metrics_json"],
            "previous_version": 1,
            "current_version": 0,
            "target_version": fake_versions[0],
            "message": "Successfully rolled back to version v0.",
        }):
            res_rb = client.post(
                f"/api/v1/projects/{mock_project_id}/datasets/{mock_dataset_id}/rollback",
                json={"reason": "Testing rollback to original"},
            )
            assert res_rb.status_code == 200
            rb_data = res_rb.json()
            assert rb_data["current_version"] == 0
            assert rb_data["previous_version"] == 1


def test_rollback_rejection_at_v0_and_direct_routes():
    """Verify HTTP 400 when trying to rollback past v0 and direct route operations."""
    mock_dataset_id = "test-api-dataset-002"
    mock_project_id = "test-api-project-002"

    mock_dataset = {
        "id": mock_dataset_id,
        "project_id": mock_project_id,
        "original_filename": "data.csv",
        "status": "UPLOADED",
    }

    with patch("app.routers.versions.get_dataset", return_value=mock_dataset), \
         patch("app.routers.versions.rollback_dataset_version", side_effect=ValueError("Original dataset (v0) cannot be rolled back past — it is immutable.")):

        # Rollback at v0 should yield 400 Bad Request
        res = client.post(
            f"/api/v1/projects/{mock_project_id}/datasets/{mock_dataset_id}/rollback",
            json={},
        )
        assert res.status_code == 400
        data = res.json()
        assert "immutable" in data["detail"]["message"].lower()

        # Direct route also returns 400
        res_dir = client.post(
            f"/api/v1/datasets/{mock_dataset_id}/rollback",
            json={},
        )
        assert res_dir.status_code == 400


def test_autonomous_agent_pipeline_version_and_rollback_integration():
    """Verify that Autonomous AI Agent Loop cleaning creates a version snapshot that is listable and rollback-eligible."""
    from app.services.agent_cleaner import AgentIterationDecision
    mock_dataset_id = "test-agent-version-ds"
    mock_project_id = "test-agent-version-proj"

    initial_version = {
        "id": "v0-initial-id",
        "dataset_id": mock_dataset_id,
        "version_number": 0,
        "storage_path": f"datasets/versions/{mock_project_id}/{mock_dataset_id}/v0.csv",
        "file_type": "parquet",
        "quality_score": 60.0,
        "metrics_json": {"rows": 3, "columns": 2, "total_null_pct": 0.0},
        "created_by_action": "Initial Ingest (v0 Original)",
        "is_current": True,
        "created_at": "2026-10-06T12:00:00Z",
    }

    mock_dataset = {
        "id": mock_dataset_id,
        "project_id": mock_project_id,
        "storage_path": "datasets/raw/data.csv",
        "original_filename": "data.csv",
        "file_type": "csv",
        "task_type": "GENERAL",
        "profile_json": {
            "versions": [initial_version],
        },
    }

    mock_provider = MagicMock()
    mock_provider.generate_structured.return_value = AgentIterationDecision(
        current_health_grade="A",
        readiness_score=96,
        assessment="Autonomous cleaning finished with clean dataset.",
        is_dataset_clean=True,
        stopping_reason="Verified clean.",
        selected_actions=[],
    )

    with patch("app.routers.clean.get_project", return_value={"id": mock_project_id}), \
         patch("app.routers.clean.get_dataset", return_value=mock_dataset), \
         patch("app.database.repositories.versions.get_dataset", return_value=mock_dataset), \
         patch("app.routers.clean.download_file", return_value=SAMPLE_CSV), \
         patch("app.routers.clean.upload_file"), \
         patch("app.routers.clean.update_dataset_profile"), \
         patch("app.routers.clean.get_service_client"), \
         patch("app.services.agent_cleaner.get_llm_provider", return_value=mock_provider), \
         patch("app.services.versioning.upload_file"):

        # 1. Trigger Autonomous Agent Clean
        res_clean = client.post(f"/api/v1/projects/{mock_project_id}/datasets/{mock_dataset_id}/agent-clean")
        assert res_clean.status_code == 200
        clean_data = res_clean.json()
        assert clean_data["status"] == "CLEANED"
        assert clean_data["version"] is not None
        v1 = clean_data["version"]
        assert v1["version_number"] == 1
        assert "Autonomous AI Agent Loop" in v1["created_by_action"]

        # 2. Add v1 to our mock dataset profile_json to simulate persisted version list
        mock_dataset["profile_json"]["versions"].append(v1)

        # 3. Verify GET versions returns both v0 and v1
        with patch("app.routers.versions.get_dataset", return_value=mock_dataset), \
             patch("app.routers.versions.list_versions", return_value=[initial_version, v1]), \
             patch("app.routers.versions.get_current_version", return_value=v1):
            res_vers = client.get(f"/api/v1/projects/{mock_project_id}/datasets/{mock_dataset_id}/versions")
            assert res_vers.status_code == 200
            vers_data = res_vers.json()
            assert vers_data["count"] == 2
            assert vers_data["current_version"]["version_number"] == 1
            assert vers_data["versions"][1]["created_by_action"] == v1["created_by_action"]


