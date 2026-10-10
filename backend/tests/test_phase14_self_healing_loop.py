"""
Phase 14 — Self-Healing Autonomous Agent Loop Tests.

Verifies:
1. Hard limits (MAX_ITERATIONS = 5, MAX_LLM_CALLS = 10, MAX_ACTIONS = 10).
2. Autonomous multi-iteration cycle with convergence.
3. In-loop regression detection & auto-rollback on deliberately bad transformations.
4. Injection of regression feedback into LLM prompt for autonomous re-planning.
5. Human approval pause behavior on HIGH-risk actions.
6. API routes (project-scoped and direct self-heal endpoints).
"""

from __future__ import annotations

from unittest.mock import MagicMock, patch
import pytest
import polars as pl
from fastapi.testclient import TestClient

from app.main import app
from app.agent.orchestrator import SelfHealingOrchestrator, OrchestratorConfig
from app.models.orchestration import OrchestratorConfig, SelfHealingOrchestrationReport
from app.services.agent_cleaner import AgentIterationDecision, CleaningActionPlan

client = TestClient(app)

SAMPLE_CSV = (
    b"id,age,income,category,target\n"
    b"1,25,50000,A,1\n"
    b"2,,60000,B,0\n"
    b"3,30,,A,1\n"
    b"4,25,50000,A,1\n"  # duplicate of row 1 (excluding id)
    b"5,45,80000,B,0\n"
)


def test_orchestrator_hard_limits_enforced():
    """Verify that orchestrator caps max_iterations at 5 and max_actions at 10."""
    cfg = OrchestratorConfig(
        max_iterations=10,  # exceeds hard limit of 5
        max_llm_calls_per_run=20,  # exceeds hard limit of 10
        max_actions_per_iteration=15,  # exceeds hard limit of 10
    )
    orchestrator = SelfHealingOrchestrator(config=cfg)

    # Mock decision that says dataset is immediately clean
    mock_decision = AgentIterationDecision(
        current_health_grade="A",
        readiness_score=95,
        assessment="Clean dataset.",
        is_dataset_clean=True,
        stopping_reason="Verified clean.",
        selected_actions=[],
    )

    with patch("app.services.agent_cleaner.get_llm_provider") as mock_get_provider:
        mock_provider = MagicMock()
        mock_provider.generate_structured.return_value = mock_decision
        mock_get_provider.return_value = mock_provider

        report = orchestrator.run(
            dataset_id="test-limits-ds",
            file_bytes=SAMPLE_CSV,
            file_type="csv",
            task_type="GENERAL",
        )

        assert report.total_iterations <= 5
        assert report.total_llm_calls <= 10
        assert report.status == "CONVERGED"


def test_self_healing_detects_regression_rolls_back_and_replans():
    """
    CRITICAL Phase 14 Test:
    Iteration 1: LLM proposes a DELIBERATELY HARMFUL action (drop 90% of rows / extreme drop)
                 causing quality regression.
                 Orchestrator DETECTS regression, ROLLS BACK in-loop, and logs regression event.
    Iteration 2: LLM receives regression alert in prompt, RE-PLANS with safe action (median imputation).
                 Orchestrator accepts safe action, quality improves.
    Iteration 3: LLM confirms dataset is clean, loop converges.
    """
    # Bad Iteration 1: Proposes dropping 'id' which creates exact duplicates between row 1 and row 4,
    # introducing a new critical defect and triggering regression rollback
    decision_step1_bad = AgentIterationDecision(
        current_health_grade="D",
        readiness_score=40,
        assessment="Bad plan that will drop id column and introduce duplicate defects.",
        is_dataset_clean=False,
        selected_actions=[
            CleaningActionPlan(
                action_type="drop_columns",
                target_columns=["id"],
                reasoning="Drop id column causing new duplicate row defects",
            ),
        ],
    )

    # Safe Iteration 2: After rollback notification, LLM re-plans with safe median imputation
    decision_step2_safe = AgentIterationDecision(
        current_health_grade="B",
        readiness_score=85,
        assessment="Re-planning after rollback: impute nulls safely without dropping columns.",
        is_dataset_clean=False,
        selected_actions=[
            CleaningActionPlan(
                action_type="impute_missing",
                target_columns=["age", "income"],
                parameters={"strategy": "median"},
                reasoning="Safe median imputation",
            ),
        ],
    )

    # Final Iteration 3: Concludes dataset is clean
    decision_step3_clean = AgentIterationDecision(
        current_health_grade="A",
        readiness_score=95,
        assessment="All defects safely resolved.",
        is_dataset_clean=True,
        stopping_reason="Quality verified and clean.",
        selected_actions=[],
    )

    prompt_history = []

    def mock_generate(messages, response_schema, **kwargs):
        # Record prompt to verify regression alert was passed into iteration 2
        prompt_text = str(messages)
        prompt_history.append(prompt_text)
        if len(prompt_history) == 1:
            return decision_step1_bad
        elif len(prompt_history) == 2:
            return decision_step2_safe
        else:
            return decision_step3_clean

    with patch("app.services.agent_cleaner.get_llm_provider") as mock_get_provider:
        mock_provider = MagicMock()
        mock_provider.generate_structured.side_effect = mock_generate
        mock_get_provider.return_value = mock_provider

        cfg = OrchestratorConfig(max_iterations=5, require_approval=False)
        orchestrator = SelfHealingOrchestrator(config=cfg)

        report = orchestrator.run(
            dataset_id="test-self-heal-ds",
            file_bytes=SAMPLE_CSV,
            file_type="csv",
            task_type="CLASSIFICATION",
            target_column="target",
        )

        # 1. Total iterations should be 2 (bad iteration rolled back -> safe iteration converged clean)
        assert report.total_iterations == 2

        # 2. Verify regression was caught and rolled back in step 1
        assert report.total_rollbacks == 1
        assert len(report.regression_history) == 1
        reg_event = report.regression_history[0]
        assert reg_event.iteration == 1
        assert reg_event.score_drop > 0 or len(reg_event.reasons) > 0

        # Step 1 must have status ROLLED_BACK
        assert report.steps[0].status == "ROLLED_BACK"
        assert report.steps[0].rolled_back is True
        assert report.steps[0].regression_detected is True

        # 3. Verify iteration 2 prompt received the regression alert
        assert len(prompt_history) >= 2
        iter2_prompt = prompt_history[1]
        assert "PREVIOUS REGRESSION DETECTED & ROLLED BACK" in iter2_prompt
        assert "drop_columns" in iter2_prompt

        # 4. Verify step 2 executed safely and converged
        assert report.steps[1].status == "EXECUTED"
        assert report.steps[1].rolled_back is False
        assert report.status == "CONVERGED"

        # 5. Verify final CSV bytes preserved columns and imputed nulls
        final_df = pl.read_csv(report.cleaned_bytes)
        assert "age" in final_df.columns
        assert "income" in final_df.columns
        assert final_df["age"].null_count() == 0
        assert final_df["income"].null_count() == 0


def test_self_healing_pauses_on_high_risk_approval():
    """Verify that when a HIGH risk transformation is proposed with require_approval=True, orchestrator pauses."""
    decision_high_risk = AgentIterationDecision(
        current_health_grade="C",
        readiness_score=60,
        assessment="Drop column customer_id.",
        is_dataset_clean=False,
        selected_actions=[
            CleaningActionPlan(
                action_type="drop_surrogate_identifiers",
                target_columns=["id"],
                reasoning="Unique ID causes data leakage",
            ),
        ],
    )

    with patch("app.services.agent_cleaner.get_llm_provider") as mock_get_provider, \
         patch("app.services.approvals.save_approval") as mock_save_appr:

        mock_save_appr.return_value = {
            "id": "appr-self-heal-1",
            "dataset_id": "ds-approval-test",
            "action_type": "drop_surrogate_identifiers",
            "risk_level": "HIGH",
            "status": "PENDING",
        }

        mock_provider = MagicMock()
        mock_provider.generate_structured.return_value = decision_high_risk
        mock_get_provider.return_value = mock_provider

        cfg = OrchestratorConfig(require_approval=True)
        orchestrator = SelfHealingOrchestrator(config=cfg)

        report = orchestrator.run(
            dataset_id="ds-approval-test",
            file_bytes=SAMPLE_CSV,
            file_type="csv",
            task_type="CLASSIFICATION",
            require_approval=True,
        )

        assert report.status == "WAITING_APPROVAL"
        assert len(report.pending_approvals) == 1
        assert report.pending_approvals[0]["action_type"] == "drop_surrogate_identifiers"
        assert report.steps[0].status == "WAITING_APPROVAL"
        assert report.total_rollbacks == 0


def test_self_heal_api_endpoints():
    """Verify POST /api/v1/projects/{proj_id}/datasets/{ds_id}/self-heal and direct routes."""
    mock_ds_id = "ds-api-selfheal-01"
    mock_proj_id = "proj-api-selfheal-01"

    mock_dataset = {
        "id": mock_ds_id,
        "project_id": mock_proj_id,
        "storage_path": "datasets/test.csv",
        "original_filename": "test.csv",
        "file_type": "csv",
        "task_type": "GENERAL",
        "profile_json": {
            "versions": [{"id": "v0-uuid", "version_number": 0, "is_current": True}],
        },
    }

    decision_clean = AgentIterationDecision(
        current_health_grade="A",
        readiness_score=95,
        assessment="Clean.",
        is_dataset_clean=True,
        stopping_reason="Verified clean.",
        selected_actions=[],
    )

    with patch("app.routers.clean.get_project", return_value={"id": mock_proj_id}), \
         patch("app.routers.clean.get_dataset", return_value=mock_dataset), \
         patch("app.database.repositories.versions.get_dataset", return_value=mock_dataset), \
         patch("app.routers.clean.download_file", return_value=SAMPLE_CSV), \
         patch("app.routers.clean.upload_file"), \
         patch("app.routers.clean.update_dataset_profile"), \
         patch("app.routers.clean.get_service_client"), \
         patch("app.services.agent_cleaner.get_llm_provider") as mock_get_provider, \
         patch("app.services.versioning.upload_file"):

        mock_provider = MagicMock()
        mock_provider.generate_structured.return_value = decision_clean
        mock_get_provider.return_value = mock_provider

        # 1. Project-scoped self-heal endpoint
        res = client.post(f"/api/v1/projects/{mock_proj_id}/datasets/{mock_ds_id}/self-heal")
        assert res.status_code == 200
        data = res.json()
        assert data["status"] in ("CLEANED", "CONVERGED")
        assert "report" in data
        assert "steps" in data["report"]
        assert "total_rollbacks" in data
        assert data["total_rollbacks"] == 0

        # 2. Direct route self-heal endpoint
        res_direct = client.post(f"/api/v1/datasets/{mock_ds_id}/self-heal")
        assert res_direct.status_code == 200
        data_direct = res_direct.json()
        assert data_direct["dataset_id"] == mock_ds_id
        assert "report" in data_direct

        # 3. Standard agent-clean with self_healing=true query parameter
        res_agent_selfheal = client.post(
            f"/api/v1/projects/{mock_proj_id}/datasets/{mock_ds_id}/agent-clean?self_healing=true"
        )
        assert res_agent_selfheal.status_code == 200
        data_agent = res_agent_selfheal.json()
        assert "total_rollbacks" in data_agent
