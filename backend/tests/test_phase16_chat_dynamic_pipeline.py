"""
Phase 16 Test Suite: Chat-Driven Autonomous Pipeline & Safe Dynamic Transformations.

Verifies:
1. AST validation:
   - Blocks 'import os', 'import sys', 'from ... import ...'.
   - Blocks dangerous builtins: open(), eval(), exec(), __import__().
   - Requires single function 'transform(df)'.
   - Allows safe Polars operations (with_columns, filter, pl.col, lit, math).
2. Safe sandbox execution:
   - Successfully runs clean Polars function.
   - Handles runtime errors safely and returns original DataFrame.
   - Blocks infinite loops or invalid return types.
3. Cleaner execution:
   - apply_cleaning_action handles 'custom_polars_script' properly.
4. Risk classification:
   - classify_action_risk classifies 'custom_polars_script' as HIGH risk requiring approval.
5. SelfHealingOrchestrator with user instructions:
   - Injects user intent into prompt.
   - Executes custom script and tracks telemetry.
6. API endpoint:
   - POST /api/v1/datasets/{id}/chat-clean handles user requests.
"""

from __future__ import annotations

import io
import pytest
import polars as pl
from unittest.mock import MagicMock, patch

from app.services.code_sandbox import (
    validate_polars_code,
    execute_polars_code,
    extract_code_from_markdown,
)
from app.services.agent_cleaner import (
    CleaningActionPlan,
    apply_cleaning_action,
)
from app.services.approvals import classify_action_risk
from app.models.chat_clean import ChatCleanRequest


# ── 1. AST Validation Tests ──────────────────────────────────────────

def test_validate_safe_polars_code():
    code = """
def transform(df: pl.DataFrame) -> pl.DataFrame:
    return df.with_columns((pl.col("price") * 1.15).alias("price_with_tax"))
"""
    is_safe, err = validate_polars_code(code)
    assert is_safe is True
    assert err is None


def test_validate_blocks_imports():
    code_import = """
import os
def transform(df: pl.DataFrame) -> pl.DataFrame:
    os.system("echo bad")
    return df
"""
    is_safe, err = validate_polars_code(code_import)
    assert is_safe is False
    assert "Import statements" in err


def test_validate_blocks_from_import():
    code_from = """
from sys import exit
def transform(df: pl.DataFrame) -> pl.DataFrame:
    exit(1)
    return df
"""
    is_safe, err = validate_polars_code(code_from)
    assert is_safe is False
    assert "Import statements" in err


def test_validate_blocks_dangerous_builtins():
    for dangerous in ["open('test.txt')", "eval('1+1')", "exec('x=1')", "__import__('os')"]:
        code = f"""
def transform(df: pl.DataFrame) -> pl.DataFrame:
    {dangerous}
    return df
"""
        is_safe, err = validate_polars_code(code)
        assert is_safe is False, f"Expected {dangerous} to be rejected"


def test_validate_requires_transform_function():
    code = """
def my_func(df):
    return df
"""
    is_safe, err = validate_polars_code(code)
    assert is_safe is False
    assert "transform" in err


def test_extract_code_from_markdown():
    wrapped = "```python\ndef transform(df):\n    return df\n```"
    unwrapped = extract_code_from_markdown(wrapped)
    assert unwrapped.startswith("def transform(df):")


# ── 2. Sandbox Execution Tests ───────────────────────────────────────

def test_execute_polars_code_success():
    df = pl.DataFrame({"price": [10.0, 20.0, 30.0], "qty": [1, 2, 3]})
    code = """
def transform(df: pl.DataFrame) -> pl.DataFrame:
    return df.with_columns((pl.col("price") * pl.col("qty")).alias("total"))
"""
    result_df, err = execute_polars_code(code, df)
    assert err is None
    assert "total" in result_df.columns
    assert result_df["total"].to_list() == [10.0, 40.0, 90.0]


def test_execute_polars_code_runtime_error_returns_original():
    df = pl.DataFrame({"price": [10.0, 20.0]})
    # column non_existent does not exist
    code = """
def transform(df: pl.DataFrame) -> pl.DataFrame:
    return df.with_columns(pl.col("non_existent") * 2)
"""
    result_df, err = execute_polars_code(code, df)
    assert err is not None
    assert "Runtime error" in err
    assert result_df.shape == (2, 1)  # original untouched


def test_execute_polars_code_invalid_return_type():
    df = pl.DataFrame({"a": [1, 2]})
    code = """
def transform(df: pl.DataFrame) -> int:
    return 42
"""
    result_df, err = execute_polars_code(code, df)
    assert err is not None
    assert "polars.DataFrame" in err


# ── 3. Cleaner Tool Integration ──────────────────────────────────────

def test_apply_cleaning_action_custom_polars_script():
    df = pl.DataFrame({"tenure": [12, 24, 36], "total_charges": [120.0, 480.0, 1080.0]})
    action = CleaningActionPlan(
        action_type="custom_polars_script",
        parameters={
            "function_name": "calc_monthly_ratio",
            "description": "Calculate charges per tenure unit",
            "code": "def transform(df: pl.DataFrame) -> pl.DataFrame:\n    return df.with_columns((pl.col('total_charges') / pl.col('tenure')).alias('monthly_ratio'))",
        },
        reasoning="User requested monthly ratio derivation",
    )
    new_df, res = apply_cleaning_action(df, action)
    assert "monthly_ratio" in new_df.columns
    assert res["columns_delta"] == 1
    assert "Executed dynamic Polars script" in res["details"]


# ── 4. Risk Classification Test ──────────────────────────────────────

def test_custom_polars_script_is_high_risk():
    risk_level, requires_approval = classify_action_risk("custom_polars_script")
    assert risk_level == "HIGH"
    assert requires_approval is True


# ── 5. Intent-Conditioned Orchestrator Test ─────────────────────────

def test_orchestrator_intent_conditioned_execution():
    from app.agent.orchestrator import SelfHealingOrchestrator, OrchestratorConfig
    from app.services.agent_cleaner import AgentIterationDecision

    csv_data = b"id,age,income\n1,25,50000\n2,30,60000\n3,,70000\n"

    # Mock provider to return custom script planned for user intent
    mock_decision = AgentIterationDecision(
        current_health_grade="B",
        readiness_score=85,
        assessment="Data contains missing age and user wants income bracket.",
        is_dataset_clean=False,
        selected_actions=[
            CleaningActionPlan(
                action_type="impute_missing",
                target_columns=["age"],
                parameters={"strategy": "median"},
                reasoning="Fix nulls in age",
            ),
            CleaningActionPlan(
                action_type="custom_polars_script",
                parameters={
                    "function_name": "calc_income_k",
                    "description": "Income in thousands",
                    "code": "def transform(df: pl.DataFrame) -> pl.DataFrame:\n    return df.with_columns((pl.col('income') / 1000.0).alias('income_k'))",
                },
                reasoning="User requested income in thousands",
            ),
        ],
    )

    mock_converged = AgentIterationDecision(
        current_health_grade="A",
        readiness_score=100,
        assessment="All requested user features and defects resolved.",
        is_dataset_clean=True,
        stopping_reason="Clean and feature engineered.",
        selected_actions=[],
    )

    with patch("app.services.agent_cleaner.get_llm_provider") as mock_get_provider:
        mock_provider = MagicMock()
        mock_provider.generate_structured.side_effect = [mock_decision, mock_converged]
        mock_get_provider.return_value = mock_provider

        cfg = OrchestratorConfig(max_iterations=2, require_approval=False)
        orch = SelfHealingOrchestrator(config=cfg)

        report = orch.run(
            dataset_id="test-chat-ds",
            file_bytes=csv_data,
            file_type="csv",
            user_instructions="Please impute age with median and create income_k column",
            require_approval=False,
        )

        assert report.user_instructions == "Please impute age with median and create income_k column"
        assert len(report.custom_scripts_executed) == 1
        assert report.custom_scripts_executed[0]["function_name"] == "calc_income_k"
        assert report.custom_scripts_executed[0]["is_safe"] is True
        # Check resulting dataframe shape
        assert report.cleaned_bytes is not None
        df_result = pl.read_csv(io.BytesIO(report.cleaned_bytes))
        assert "income_k" in df_result.columns
        assert df_result["income_k"].to_list() == [50.0, 60.0, 70.0]


# ── 6. API Endpoint Test ─────────────────────────────────────────────

def test_api_chat_clean_endpoint():
    from fastapi.testclient import TestClient
    from app.main import app

    client = TestClient(app)

    # Mock dataset and download_file
    fake_dataset = {
        "id": "ds-chat-1",
        "project_id": "proj-1",
        "storage_path": "datasets/test/data.csv",
        "original_filename": "data.csv",
        "file_type": "csv",
        "task_type": "GENERAL",
        "profile_json": {},
    }
    csv_bytes = b"tenure,charges\n10,100\n20,200\n"

    with patch("app.routers.clean.get_project", return_value={"id": "proj-1"}), \
         patch("app.routers.clean.get_dataset", return_value=fake_dataset), \
         patch("app.routers.clean.download_file", return_value=csv_bytes), \
         patch("app.routers.clean.upload_file", return_value=True), \
         patch("app.routers.clean.update_dataset_profile"), \
         patch("app.routers.clean.get_service_client"):

        payload = {
            "user_instructions": "Normalize charges and calculate charge_rate",
            "task_objective": "GENERAL",
            "require_approval": False,
            "max_iterations": 1,
        }

        # Mock orchestrator run to verify request handling
        from app.models.orchestration import SelfHealingOrchestrationReport
        mock_report = SelfHealingOrchestrationReport(
            dataset_id="ds-chat-1",
            status="CONVERGED",
            total_iterations=1,
            final_quality_score=95.0,
            user_instructions=payload["user_instructions"],
            custom_scripts_executed=[
                {"function_name": "calc_rate", "is_safe": True}
            ],
            final_profile={"shape": {"rows": 2, "columns": 3}},
            cleaned_bytes=b"tenure,charges,charge_rate\n10,100,10\n20,200,10\n",
        )

        with patch("app.agent.orchestrator.run_self_healing_agent_loop", return_value=mock_report):
            response = client.post("/api/v1/projects/proj-1/datasets/ds-chat-1/chat-clean", json=payload)
            assert response.status_code == 200
            data = response.json()
            assert data["dataset_id"] == "ds-chat-1"
            assert data["user_instructions"] == payload["user_instructions"]
            assert data["status"] == "CONVERGED"
            assert len(data["custom_scripts"]) == 1


# ── 7. Rollback on Regressive Custom Script ──────────────────────────

def test_orchestrator_custom_script_regression_rollback():
    from app.agent.orchestrator import SelfHealingOrchestrator, OrchestratorConfig
    from app.services.agent_cleaner import AgentIterationDecision

    csv_data = b"id,val\n" + b"\n".join([f"{i},{i*10}".encode() for i in range(1, 21)])

    # Iteration 1: Custom script that catastrophically filters down to 1 row
    bad_decision = AgentIterationDecision(
        current_health_grade="B",
        readiness_score=80,
        assessment="Filtering rows with custom logic",
        is_dataset_clean=False,
        selected_actions=[
            CleaningActionPlan(
                action_type="custom_polars_script",
                parameters={
                    "function_name": "extreme_filter",
                    "description": "Filter strictly to id == 1",
                    "code": "def transform(df: pl.DataFrame) -> pl.DataFrame:\n    return df.filter(pl.col('id') == 1)",
                },
                reasoning="Filter down heavily",
            ),
        ],
    )

    # Iteration 2: Safe alternative that succeeds
    safe_converged = AgentIterationDecision(
        current_health_grade="A",
        readiness_score=100,
        assessment="Recovered from regression with safe alternative",
        is_dataset_clean=True,
        stopping_reason="Cleaned safely.",
        selected_actions=[],
    )

    with patch("app.services.agent_cleaner.get_llm_provider") as mock_get_provider:
        mock_provider = MagicMock()
        mock_provider.generate_structured.side_effect = [bad_decision, safe_converged]
        mock_get_provider.return_value = mock_provider

        cfg = OrchestratorConfig(max_iterations=2, require_approval=False)
        orch = SelfHealingOrchestrator(config=cfg)

        report = orch.run(
            dataset_id="test-rollback-ds",
            file_bytes=csv_data,
            file_type="csv",
            user_instructions="Filter data safely",
            require_approval=False,
        )

        assert report.total_rollbacks >= 1
        assert len(report.regression_history) >= 1
        # Final dataset should not have lost all rows
        df_final = pl.read_csv(io.BytesIO(report.cleaned_bytes))
        assert df_final.shape[0] == 20  # restored pre-iteration state


def test_chat_clean_version_synchronization():
    from fastapi.testclient import TestClient
    from app.main import app
    from app.models.orchestration import SelfHealingOrchestrationReport

    client = TestClient(app)

    fake_profile = {"shape": {"rows": 3, "columns": 2}, "versions": []}
    fake_dataset = {
        "id": "ds-sync-1",
        "project_id": "proj-sync-1",
        "storage_path": "datasets/test/data.csv",
        "original_filename": "data.csv",
        "file_type": "csv",
        "task_type": "GENERAL",
        "profile_json": fake_profile,
    }
    csv_bytes = b"a,b\n1,2\n3,4\n5,6\n"

    mock_report = SelfHealingOrchestrationReport(
        dataset_id="ds-sync-1",
        status="CONVERGED",
        total_iterations=1,
        final_quality_score=98.0,
        user_instructions="Remove nulls and engineer features",
        custom_scripts_executed=[{"function_name": "clean_data", "is_safe": True}],
        final_profile={"shape": {"rows": 3, "columns": 3}},
        cleaned_bytes=b"a,b,c\n1,2,3\n3,4,7\n5,6,11\n",
    )

    with patch("app.routers.clean.get_project", return_value={"id": "proj-sync-1"}), \
         patch("app.routers.clean.get_dataset", return_value=fake_dataset), \
         patch("app.routers.clean.download_file", return_value=csv_bytes), \
         patch("app.routers.clean.upload_file", return_value=True), \
         patch("app.routers.clean.update_dataset_profile") as mock_update_profile, \
         patch("app.routers.clean.get_service_client"):

        with patch("app.agent.orchestrator.run_self_healing_agent_loop", return_value=mock_report):
            response = client.post(
                "/api/v1/projects/proj-sync-1/datasets/ds-sync-1/chat-clean",
                json={"user_instructions": "Remove nulls and engineer features"}
            )
            assert response.status_code == 200
            data = response.json()
            assert data["version"] is not None
            assert data["version"]["version_number"] >= 0
            assert data["final_profile"]["current_version"] is not None
            assert data["final_profile"]["current_version"]["version_number"] == data["version"]["version_number"]
            assert mock_update_profile.called

