"""
Phase 2 tests — Supabase foundation.

Tests the database client, repository CRUD operations, and
storage helpers against the real Supabase project.

Run with:
    pytest tests/test_phase2_supabase.py -v

Requirements:
    .env must contain valid SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
    Migration 001_initial_schema.sql must have been applied
"""

import uuid
import pytest

from app.core.config import get_settings
from app.database.client import get_service_client
from app.models.dataset import ProjectCreate, DatasetCreate
from app.database.repositories.datasets import (
    create_project,
    get_project,
    list_projects,
    create_dataset,
    get_dataset,
    list_datasets,
    update_dataset_status,
)
from app.storage.supabase import (
    ensure_bucket_exists,
    upload_file,
    download_file,
    delete_file,
    build_storage_path,
)

# ── Shared test user ID (not real auth — just for isolation) ──────
TEST_USER_ID = str(uuid.UUID("00000000-0000-0000-0000-000000000001"))


# ════════════════════════════════════════════════════════════════
# DB CLIENT
# ════════════════════════════════════════════════════════════════

class TestDatabaseClient:
    def test_client_initialises(self):
        """Service client must be created without exception."""
        client = get_service_client()
        assert client is not None

    def test_client_is_singleton(self):
        """Same instance returned on repeated calls (lru_cache)."""
        c1 = get_service_client()
        c2 = get_service_client()
        assert c1 is c2

    def test_can_query_projects_table(self):
        """A simple SELECT on the projects table must succeed."""
        client = get_service_client()
        result = (
            client.schema("data_agent")
            .table("projects")
            .select("id")
            .limit(1)
            .execute()
        )
        # data is a list (may be empty); the important thing is no exception
        assert isinstance(result.data, list)

    def test_can_query_datasets_table(self):
        """A simple SELECT on the datasets table must succeed."""
        client = get_service_client()
        result = (
            client.schema("data_agent")
            .table("datasets")
            .select("id")
            .limit(1)
            .execute()
        )
        assert isinstance(result.data, list)


# ════════════════════════════════════════════════════════════════
# PROJECTS REPOSITORY
# ════════════════════════════════════════════════════════════════

class TestProjectsRepository:
    def test_create_project(self):
        payload = ProjectCreate(name="Test Project", description="Phase 2 test")
        record = create_project(TEST_USER_ID, payload)
        assert record["id"] is not None
        assert record["name"] == "Test Project"
        assert record["user_id"] == TEST_USER_ID
        # cleanup
        get_service_client().schema("data_agent").table("projects").delete().eq("id", record["id"]).execute()

    def test_get_project_returns_record(self):
        payload = ProjectCreate(name="GetTest")
        created = create_project(TEST_USER_ID, payload)
        fetched = get_project(created["id"])
        assert fetched is not None
        assert fetched["id"] == created["id"]
        # cleanup
        get_service_client().schema("data_agent").table("projects").delete().eq("id", created["id"]).execute()

    def test_get_project_returns_none_for_missing(self):
        result = get_project(str(uuid.uuid4()))
        assert result is None

    def test_list_projects_returns_list(self):
        payload = ProjectCreate(name="ListTest")
        created = create_project(TEST_USER_ID, payload)
        projects = list_projects(TEST_USER_ID)
        assert isinstance(projects, list)
        ids = [p["id"] for p in projects]
        assert created["id"] in ids
        # cleanup
        get_service_client().schema("data_agent").table("projects").delete().eq("id", created["id"]).execute()


# ════════════════════════════════════════════════════════════════
# DATASETS REPOSITORY
# ════════════════════════════════════════════════════════════════

class TestDatasetsRepository:
    @pytest.fixture(autouse=True)
    def project(self):
        """Create a temporary project for dataset tests."""
        record = create_project(TEST_USER_ID, ProjectCreate(name="DatasetTestProject"))
        yield record
        # Cascade delete will remove datasets too
        get_service_client().schema("data_agent").table("projects").delete().eq("id", record["id"]).execute()

    def test_create_dataset(self, project):
        payload = DatasetCreate(original_filename="test.csv", file_size=1024)
        record = create_dataset(project["id"], payload)
        assert record["id"] is not None
        assert record["project_id"] == project["id"]
        assert record["original_filename"] == "test.csv"
        assert record["status"] == "PENDING_UPLOAD"

    def test_get_dataset_returns_record(self, project):
        payload = DatasetCreate(original_filename="get_test.csv")
        created = create_dataset(project["id"], payload)
        fetched = get_dataset(created["id"])
        assert fetched is not None
        assert fetched["id"] == created["id"]

    def test_get_dataset_returns_none_for_missing(self, project):
        result = get_dataset(str(uuid.uuid4()))
        assert result is None

    def test_list_datasets(self, project):
        create_dataset(project["id"], DatasetCreate(original_filename="a.csv"))
        create_dataset(project["id"], DatasetCreate(original_filename="b.csv"))
        datasets = list_datasets(project["id"])
        assert len(datasets) >= 2

    def test_update_dataset_status(self, project):
        created = create_dataset(project["id"], DatasetCreate(original_filename="update.csv"))
        updated = update_dataset_status(created["id"], "UPLOADED", {"storage_path": "some/path"})
        assert updated["status"] == "UPLOADED"
        assert updated["storage_path"] == "some/path"


# ════════════════════════════════════════════════════════════════
# STORAGE
# ════════════════════════════════════════════════════════════════

class TestStorage:
    def test_ensure_bucket_exists(self):
        """Must not raise — idempotent."""
        ensure_bucket_exists()

    def test_upload_and_download_roundtrip(self):
        """Upload a small file then download and verify content."""
        content = b"phase2 storage test content"
        path = build_storage_path(
            TEST_USER_ID,
            "test-project",
            str(uuid.uuid4()),
            "original",
            "test.txt",
        )
        try:
            upload_file(path, content, content_type="text/plain")
            downloaded = download_file(path)
            assert downloaded == content
        finally:
            delete_file(path)

    def test_build_storage_path(self):
        path = build_storage_path("user1", "proj1", "ds1", "original", "data.csv")
        assert path == "user1/proj1/ds1/original/data.csv"


# ════════════════════════════════════════════════════════════════
# HEALTH ENDPOINT (with DB)
# ════════════════════════════════════════════════════════════════

class TestHealthWithDB:
    def test_health_includes_db_status(self):
        from fastapi.testclient import TestClient
        from app.main import app
        client = TestClient(app)
        response = client.get("/health")
        assert response.status_code == 200
        data = response.json()
        assert "db_status" in data
        assert data["db_status"] == "ok", (
            f"Expected db_status='ok', got: {data['db_status']!r}\n"
            "Have you run the migration 001_initial_schema.sql in Supabase?"
        )
