"""
Phase 1 tests — Minimal backend health check.

Run with:
    pytest tests/test_phase1_health.py -v
"""

import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


class TestHealthEndpoint:
    def test_health_returns_200(self):
        response = client.get("/health")
        assert response.status_code == 200

    def test_health_status_is_healthy(self):
        data = response = client.get("/health").json()
        assert data["status"] == "healthy"

    def test_health_has_version(self):
        data = client.get("/health").json()
        assert "version" in data
        assert isinstance(data["version"], str)
        assert len(data["version"]) > 0

    def test_health_has_environment(self):
        data = client.get("/health").json()
        assert "environment" in data

    def test_health_has_timestamp(self):
        data = client.get("/health").json()
        assert "timestamp" in data
        # Basic ISO-8601 check
        assert "T" in data["timestamp"]

    def test_health_content_type_is_json(self):
        response = client.get("/health")
        assert "application/json" in response.headers["content-type"]

    def test_docs_available_in_development(self):
        """Swagger docs should be available when ENVIRONMENT=development."""
        response = client.get("/docs")
        # In test env, environment defaults to 'development'
        assert response.status_code == 200

    def test_unknown_route_returns_404(self):
        response = client.get("/this-route-does-not-exist")
        assert response.status_code == 404
