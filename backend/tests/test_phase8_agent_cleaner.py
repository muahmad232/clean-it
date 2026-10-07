"""
Tests for Autonomous Multi-Step Agentic Data Cleaning Engine.
"""

from unittest.mock import MagicMock, patch
import pytest
import polars as pl
from fastapi.testclient import TestClient

from app.main import app
from app.services.agent_cleaner import (
    CleaningActionPlan,
    AgentIterationDecision,
    apply_cleaning_action,
    run_agentic_cleaning_cycle,
)

client = TestClient(app)


def test_apply_remove_duplicates():
    df = pl.DataFrame({
        "a": [1, 1, 2, 3],
        "b": ["x", "x", "y", "z"],
    })
    action = CleaningActionPlan(
        action_type="remove_duplicates",
        reasoning="Drop duplicate records",
    )
    new_df, res = apply_cleaning_action(df, action)
    assert new_df.shape[0] == 3
    assert res["rows_delta"] == -1


def test_apply_fix_type_mismatches():
    df = pl.DataFrame({
        "num_str": ["12.5", "45.1", "100.2", "8.0", "99.9"],
        "text": ["apple", "banana", "cherry", "date", "fig"],
    })
    action = CleaningActionPlan(
        action_type="fix_type_mismatches",
        reasoning="Cast string numbers to Float64",
    )
    new_df, res = apply_cleaning_action(df, action)
    assert new_df["num_str"].dtype == pl.Float64
    assert new_df["text"].dtype == pl.String


def test_apply_drop_high_null_columns():
    df = pl.DataFrame({
        "valid": [1, 2, 3, 4, 5],
        "bad": [None, None, None, None, 1],  # 80% null
    })
    action = CleaningActionPlan(
        action_type="drop_high_null_columns",
        parameters={"threshold_pct": 70.0},
        reasoning="Drop column with >70% nulls",
    )
    new_df, res = apply_cleaning_action(df, action)
    assert "bad" not in new_df.columns
    assert "valid" in new_df.columns
    assert res["columns_delta"] == -1


def test_apply_impute_missing_median():
    df = pl.DataFrame({
        "age": [10.0, 20.0, 30.0, None, 50.0],
    })
    action = CleaningActionPlan(
        action_type="impute_missing",
        target_columns=["age"],
        parameters={"strategy": "median"},
        reasoning="Fill missing ages with median",
    )
    new_df, res = apply_cleaning_action(df, action)
    assert new_df["age"].null_count() == 0
    # Median of 10, 20, 30, 50 is 25.0
    assert 25.0 in new_df["age"].to_list()


def test_apply_drop_surrogate_identifiers():
    df = pl.DataFrame({
        "passenger_id": [101, 102, 103, 104, 105],
        "survived": [1, 0, 1, 1, 0],
    })
    action = CleaningActionPlan(
        action_type="drop_surrogate_identifiers",
        reasoning="Drop ID column to prevent target leakage",
    )
    new_df, res = apply_cleaning_action(df, action, target_column="survived")
    assert "passenger_id" not in new_df.columns
    assert "survived" in new_df.columns


def test_run_agentic_cleaning_cycle_with_mock_llm():
    csv_content = (
        "id,age,fare,survived\n"
        "1,20.0,10.5,0\n"
        "2,,20.0,1\n"
        "3,40.0,30.0,1\n"
        "4,20.0,10.5,0\n"  # duplicate of row 1 (ignoring id)
    ).encode("utf-8")

    # Mock 2 iterations:
    # Iter 1: LLM decides to drop id and impute age
    decision_step1 = AgentIterationDecision(
        current_health_grade="C",
        readiness_score=55,
        assessment="Dataset contains surrogate id and missing age.",
        is_dataset_clean=False,
        selected_actions=[
            CleaningActionPlan(
                action_type="drop_surrogate_identifiers",
                reasoning="Drop id column",
            ),
            CleaningActionPlan(
                action_type="impute_missing",
                target_columns=["age"],
                parameters={"strategy": "median"},
                reasoning="Impute missing age",
            ),
        ],
    )
    # Iter 2: LLM observes dataset is clean
    decision_step2 = AgentIterationDecision(
        current_health_grade="A",
        readiness_score=95,
        assessment="All defects resolved; age is imputed and id removed.",
        is_dataset_clean=True,
        stopping_reason="All critical defects resolved.",
        selected_actions=[],
    )

    with patch("app.services.agent_cleaner.get_llm_provider") as mock_get_provider:
        mock_provider = MagicMock()
        mock_provider.generate_structured.side_effect = [decision_step1, decision_step2]
        mock_get_provider.return_value = mock_provider

        result = run_agentic_cleaning_cycle(
            dataset_id="test-dataset-1",
            file_bytes=csv_content,
            file_type="csv",
            task_type="CLASSIFICATION",
            target_column="survived",
            max_iterations=3,
            require_approval=False,
        )

        assert result["total_iterations"] == 2
        assert len(result["steps"]) == 2
        assert result["steps"][0]["health_grade"] == "C"
        assert result["steps"][1]["health_grade"] == "A"
        assert result["steps"][1]["is_dataset_clean"] is True
        assert "id" not in result["final_profile"]["shape"]
        # Verify final CSV bytes
        final_df = pl.read_csv(result["cleaned_bytes"])
        assert "id" not in final_df.columns
        assert final_df["age"].null_count() == 0


def test_agent_clean_endpoint_mocked():
    mock_ds_val = {
        "id": "ds-456",
        "project_id": "proj-123",
        "storage_path": "datasets/test.csv",
        "original_filename": "test.csv",
        "file_type": "csv",
        "task_type": "CLASSIFICATION",
        "profile_json": {
            "versions": [
                {
                    "id": "v0-uuid",
                    "dataset_id": "ds-456",
                    "version_number": 0,
                    "created_by_action": "Initial Ingest (v0 Original)",
                    "is_current": True,
                }
            ]
        },
    }

    with patch("app.routers.clean.get_project") as mock_get_proj, \
         patch("app.routers.clean.get_dataset", return_value=mock_ds_val), \
         patch("app.database.repositories.versions.get_dataset", return_value=mock_ds_val), \
         patch("app.routers.clean.download_file") as mock_dl, \
         patch("app.routers.clean.upload_file"), \
         patch("app.routers.clean.update_dataset_profile"), \
         patch("app.routers.clean.get_service_client"), \
         patch("app.services.agent_cleaner.get_llm_provider") as mock_get_provider, \
         patch("app.services.versioning.upload_file"):

        mock_get_proj.return_value = {"id": "proj-123", "name": "Test Proj"}
        mock_dl.return_value = b"id,val\n1,10.0\n2,20.0\n"

        mock_provider = MagicMock()
        mock_provider.generate_structured.return_value = AgentIterationDecision(
            current_health_grade="A",
            readiness_score=98,
            assessment="Dataset is already clean and optimal.",
            is_dataset_clean=True,
            stopping_reason="No remaining issues.",
            selected_actions=[],
        )
        mock_get_provider.return_value = mock_provider

        res = client.post("/api/v1/projects/proj-123/datasets/ds-456/agent-clean")
        assert res.status_code == 200
        data = res.json()
        assert data["status"] == "CLEANED"
        assert "report" in data
        assert data["report"]["total_iterations"] == 1
        assert "download_url" in data
        assert data["version"] is not None
        assert "Autonomous AI Agent Loop" in data["version"]["created_by_action"]
        assert data["version"]["version_number"] == 1


def test_agent_clean_direct_endpoint_creates_version():
    """Verify that direct route /api/v1/datasets/{d_id}/agent-clean also creates immutable version snapshot."""
    mock_ds_direct = {
        "id": "ds-888",
        "project_id": "proj-999",
        "storage_path": "datasets/test.csv",
        "original_filename": "test.csv",
        "file_type": "csv",
        "task_type": "GENERAL",
        "profile_json": {
            "versions": [
                {
                    "id": "v0-uuid-888",
                    "dataset_id": "ds-888",
                    "version_number": 0,
                    "created_by_action": "Initial Ingest (v0 Original)",
                    "is_current": True,
                }
            ]
        },
    }

    with patch("app.routers.clean.get_project") as mock_get_proj, \
         patch("app.routers.clean.get_dataset", return_value=mock_ds_direct), \
         patch("app.database.repositories.versions.get_dataset", return_value=mock_ds_direct), \
         patch("app.routers.clean.download_file") as mock_dl, \
         patch("app.routers.clean.upload_file"), \
         patch("app.routers.clean.update_dataset_profile"), \
         patch("app.routers.clean.get_service_client"), \
         patch("app.services.agent_cleaner.get_llm_provider") as mock_get_provider, \
         patch("app.services.versioning.upload_file"):

        mock_get_proj.return_value = {"id": "proj-999", "name": "Direct Proj"}
        mock_dl.return_value = b"col1,col2\n1,10.0\n2,20.0\n"

        mock_provider = MagicMock()
        mock_provider.generate_structured.return_value = AgentIterationDecision(
            current_health_grade="A",
            readiness_score=95,
            assessment="Cleaned by agent.",
            is_dataset_clean=True,
            stopping_reason="Verified clean.",
            selected_actions=[],
        )
        mock_get_provider.return_value = mock_provider

        res = client.post("/api/v1/datasets/ds-888/agent-clean")
        assert res.status_code == 200
        data = res.json()
        assert data["status"] == "CLEANED"
        assert data["version"] is not None
        assert "Autonomous AI Agent Loop" in data["version"]["created_by_action"]
        assert data["version"]["version_number"] == 1


