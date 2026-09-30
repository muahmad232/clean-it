"""
Phase 7 Tests — Authentication, User Scoping, Dataset & Project Management, and 10-Day Retention.

Verifies:
1. Auth Config & Me Endpoints:
   - GET /api/v1/auth/config (returns public Supabase anon key and URL)
   - GET /api/v1/auth/me (returns unauthenticated by default or authenticated user details)
2. Project Deletion:
   - DELETE /api/v1/projects/{project_id} (removes project container and child datasets)
3. User Dataset Scoping & 10-Day Retention:
   - GET /api/v1/user/datasets (calculates days_remaining and is_expired metadata)
   - DELETE /api/v1/datasets/{dataset_id} (direct dataset deletion)
   - Expired dataset download returns 410 GONE
   - POST /api/v1/maintenance/cleanup-expired

Run with:
    pytest tests/test_phase7_auth_retention.py -v
"""

import uuid
from datetime import datetime, timezone, timedelta
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.database.client import get_service_client
from app.database.repositories.datasets import (
    create_project,
    create_dataset,
    get_dataset,
    delete_dataset,
    delete_project,
    list_user_datasets,
    cleanup_expired_datasets,
)
from app.models.dataset import ProjectCreate, DatasetCreate

client = TestClient(app)

TEST_USER_ID = "00000000-0000-0000-0000-000000000099"


def test_auth_config_endpoint():
    res = client.get("/api/v1/auth/config")
    assert res.status_code == 200
    data = res.json()
    assert "supabase_url" in data
    assert "supabase_anon_key" in data


def test_auth_me_unauthenticated():
    res = client.get("/api/v1/auth/me")
    assert res.status_code == 200
    data = res.json()
    assert data["authenticated"] is False
    assert data["user"] is None


def test_auth_me_with_user_header():
    res = client.get("/api/v1/auth/me", headers={"X-User-Id": "12345678-1234-1234-1234-123456789abc"})
    assert res.status_code == 200
    data = res.json()
    assert data["authenticated"] is True
    assert data["user"]["id"] == "12345678-1234-1234-1234-123456789abc"


def test_create_and_delete_project_cascade():
    # 1. Create test project
    p = create_project(TEST_USER_ID, ProjectCreate(name="CascadeTestProject"))
    project_id = p["id"]

    # 2. Create test dataset inside project
    d = create_dataset(project_id, DatasetCreate(
        original_filename="cascade_data.csv",
        file_type="csv",
        file_size=1024,
    ))
    dataset_id = d["id"]

    # 3. Verify user datasets lists it
    user_ds = list_user_datasets(TEST_USER_ID)
    assert any(item["id"] == dataset_id for item in user_ds)

    # 4. Delete project via API
    del_res = client.delete(f"/api/v1/projects/{project_id}", headers={"X-User-Id": TEST_USER_ID})
    assert del_res.status_code == 200
    assert del_res.json()["status"] == "deleted"

    # 5. Verify dataset was also deleted
    assert get_dataset(dataset_id) is None


def test_user_datasets_retention_metadata():
    p = create_project(TEST_USER_ID, ProjectCreate(name="RetentionTestProject"))
    project_id = p["id"]

    d = create_dataset(project_id, DatasetCreate(
        original_filename="retention_test.csv",
        file_type="csv",
        file_size=500,
    ))
    dataset_id = d["id"]

    try:
        user_ds = list_user_datasets(TEST_USER_ID)
        target = next((item for item in user_ds if item["id"] == dataset_id), None)
        assert target is not None
        assert "days_remaining" in target
        assert target["is_expired"] is False
        assert target["days_remaining"] >= 9
    finally:
        delete_project(project_id)


def test_retention_cleanup_endpoint():
    res = client.post("/api/v1/maintenance/cleanup-expired")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "completed"
    assert "purged_datasets_count" in data


def test_expired_dataset_download_returns_410():
    p = create_project(TEST_USER_ID, ProjectCreate(name="ExpiredTestProject"))
    project_id = p["id"]
    d = create_dataset(project_id, DatasetCreate(
        original_filename="expired.csv",
        file_type="csv",
        file_size=200,
    ))
    dataset_id = d["id"]
    try:
        client_db = get_service_client()
        fifteen_days_ago = (datetime.now(timezone.utc) - timedelta(days=15)).isoformat()
        five_days_ago = (datetime.now(timezone.utc) - timedelta(days=5)).isoformat()
        client_db.schema("data_agent").table("datasets").update({
            "created_at": fifteen_days_ago,
            "expires_at": five_days_ago,
            "storage_path": "dummy/expired.csv",
        }).eq("id", dataset_id).execute()

        res = client.get(f"/api/v1/projects/{project_id}/datasets/{dataset_id}/download")
        assert res.status_code == 410
        assert res.json()["detail"]["error"] == "dataset_expired"
    finally:
        delete_project(project_id)


def test_claim_project_endpoint():
    anon_user = "00000000-0000-0000-0000-000000000001"
    p = create_project(anon_user, ProjectCreate(name="GuestProject"))
    project_id = p["id"]
    try:
        res = client.post(f"/api/v1/projects/{project_id}/claim", headers={"X-User-Id": TEST_USER_ID})
        assert res.status_code == 200
        data = res.json()
        assert data["status"] == "claimed"
        assert str(data["project"]["user_id"]) == TEST_USER_ID
    finally:
        delete_project(project_id)


def test_add_sample_dataset_to_project():
    p = create_project(TEST_USER_ID, ProjectCreate(name="SampleTestProject"))
    project_id = p["id"]
    try:
        res = client.post(
            f"/api/v1/projects/{project_id}/datasets/sample",
            json={"sample_key": "telco_churn"},
            headers={"X-User-Id": TEST_USER_ID},
        )
        assert res.status_code == 201
        data = res.json()
        assert "dataset" in data
        assert data["dataset"]["project_id"] == project_id

        # Verify listed in user datasets
        user_ds = list_user_datasets(TEST_USER_ID)
        assert any(d["id"] == data["dataset"]["id"] for d in user_ds)
    finally:
        delete_project(project_id)


