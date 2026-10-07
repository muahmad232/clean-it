"""
Unit & Integration Tests for Phase 12 — Human Approval System.
"""

from unittest.mock import MagicMock, patch
import io
import pytest
import polars as pl
from fastapi.testclient import TestClient

from app.main import app
from app.services.approvals import (
    classify_action_risk,
    register_pending_approval,
    resolve_user_approval,
)
from app.database.repositories.approvals import (
    save_approval,
    list_approvals,
    get_approval,
    update_approval_status,
)
from app.services.agent_cleaner import CleaningActionPlan, AgentIterationDecision

client = TestClient(app)

SAMPLE_CSV = b"id,val,name\n1,10.0,Alice\n2,20.0,Bob\n3,30.0,Charlie\n"


def test_classify_action_risk():
    """Verify that high-risk destructive actions are flagged for human sign-off."""
    # High risk
    for act in ["drop_columns", "drop_surrogate_identifiers", "drop_high_null_columns", "drop_constant_columns"]:
        level, needs_approval = classify_action_risk(act)
        assert level == "HIGH"
        assert needs_approval is True

    # Medium risk
    for act in ["impute_missing", "handle_outliers"]:
        level, needs_approval = classify_action_risk(act)
        assert level == "MEDIUM"
        assert needs_approval is False

    # Low risk
    for act in ["remove_duplicates", "fix_type_mismatches", "trim_whitespace"]:
        level, needs_approval = classify_action_risk(act)
        assert level == "LOW"
        assert needs_approval is False


def test_approvals_repository_fallback():
    """Test approval saving, listing, and updating using profile fallback."""
    mock_ds_id = "test-approval-ds-001"
    mock_dataset = {
        "id": mock_ds_id,
        "profile_json": {},
    }

    with patch("app.database.repositories.approvals.get_service_client") as mock_client, \
         patch("app.database.repositories.approvals.get_dataset", return_value=mock_dataset), \
         patch("app.database.repositories.approvals.update_dataset_profile") as mock_update_profile:

        # Force DB table to raise to exercise fallback
        mock_client.return_value.schema.return_value.table.return_value.insert.side_effect = Exception("No table")
        mock_client.return_value.schema.return_value.table.return_value.select.side_effect = Exception("No table")
        mock_client.return_value.schema.return_value.table.return_value.update.side_effect = Exception("No table")

        # 1. Save approval
        saved = save_approval({
            "dataset_id": mock_ds_id,
            "action_type": "drop_columns",
            "target_columns": ["col_x"],
            "reasoning": "Leakage",
            "risk_level": "HIGH",
        })
        assert saved["id"] is not None
        assert saved["status"] == "PENDING"
        assert mock_dataset["profile_json"]["pending_approvals"][0]["id"] == saved["id"]

        # 2. List approvals
        listed = list_approvals(mock_ds_id, status_filter="PENDING")
        assert len(listed) == 1
        assert listed[0]["id"] == saved["id"]

        # 3. Get single approval
        single = get_approval(mock_ds_id, saved["id"])
        assert single is not None
        assert single["action_type"] == "drop_columns"

        # 4. Update approval status
        updated = update_approval_status(mock_ds_id, saved["id"], "APPROVED", "Approved by user")
        assert updated["status"] == "APPROVED"
        assert updated["user_feedback"] == "Approved by user"


def test_register_and_resolve_user_approval_approve():
    """Verify approval resolution when approved: executes transformation and creates snapshot."""
    mock_ds_id = "test-resolve-ds-001"
    mock_proj_id = "test-resolve-proj-001"

    appr_row = {
        "id": "appr-123",
        "dataset_id": mock_ds_id,
        "project_id": mock_proj_id,
        "action_type": "drop_columns",
        "target_columns": ["id"],
        "parameters": {},
        "reasoning": "Drop unique id column",
        "risk_level": "HIGH",
        "status": "PENDING",
    }

    mock_dataset = {
        "id": mock_ds_id,
        "project_id": mock_proj_id,
        "original_filename": "data.csv",
        "storage_path": "datasets/test.csv",
        "file_type": "csv",
        "status": "WAITING_APPROVAL",
        "profile_json": {
            "pending_approvals": [appr_row],
        },
    }

    def mock_list_approvals(ds_id, status_filter=None):
        if status_filter == "PENDING":
            return []
        return [{**appr_row, "status": "APPROVED"}]

    with patch("app.services.approvals.get_approval", return_value=appr_row), \
         patch("app.services.approvals.get_dataset", return_value=mock_dataset), \
         patch("app.services.approvals.download_file", return_value=SAMPLE_CSV), \
         patch("app.services.approvals.upload_file"), \
         patch("app.services.approvals.update_dataset_profile"), \
         patch("app.services.approvals.update_approval_status", return_value={**appr_row, "status": "APPROVED"}), \
         patch("app.services.approvals.list_approvals", side_effect=mock_list_approvals), \
         patch("app.services.approvals.get_service_client"), \
         patch("app.services.approvals.create_dataset_version") as mock_create_v:

        mock_create_v.return_value = {
            "id": "v2-uuid",
            "version_number": 2,
            "created_by_action": "Human Approved: Drop Columns (id)",
        }

        res = resolve_user_approval(
            dataset_id=mock_ds_id,
            project_id=mock_proj_id,
            action_id="appr-123",
            decision="approve",
            feedback="Confirmed safe to drop id",
        )

        assert res["decision"] == "approve"
        assert res["dataset_status"] == "CLEANED"
        assert res["version"] is not None
        assert "Human Approved" in res["version"]["created_by_action"]
        assert "final_profile" in res


def test_resolve_user_approval_reject():
    """Verify approval resolution when rejected: status marked REJECTED without modifying data."""
    mock_ds_id = "test-reject-ds-001"
    mock_proj_id = "test-reject-proj-001"

    appr_row = {
        "id": "appr-456",
        "dataset_id": mock_ds_id,
        "project_id": mock_proj_id,
        "action_type": "drop_columns",
        "target_columns": ["name"],
        "reasoning": "Drop name column",
        "risk_level": "HIGH",
        "status": "PENDING",
    }

    mock_dataset = {
        "id": mock_ds_id,
        "project_id": mock_proj_id,
        "original_filename": "data.csv",
        "storage_path": "datasets/test.csv",
        "status": "WAITING_APPROVAL",
        "profile_json": {
            "pending_approvals": [appr_row],
        },
    }

    with patch("app.services.approvals.get_approval", return_value=appr_row), \
         patch("app.services.approvals.get_dataset", return_value=mock_dataset), \
         patch("app.services.approvals.update_approval_status", return_value={**appr_row, "status": "REJECTED"}), \
         patch("app.services.approvals.list_approvals", return_value=[]), \
         patch("app.services.approvals.get_service_client"):

        res = resolve_user_approval(
            dataset_id=mock_ds_id,
            project_id=mock_proj_id,
            action_id="appr-456",
            decision="reject",
            feedback="Keep name column for reports",
        )

        assert res["decision"] == "reject"
        assert res["dataset_status"] == "CLEANED"
        assert res["version"] is None


def test_approvals_api_endpoints():
    """Integration test for GET /approvals and POST /approvals/{action_id}/decision endpoints."""
    mock_ds_id = "test-api-appr-ds"
    mock_proj_id = "test-api-appr-proj"

    fake_approval = {
        "id": "appr-uuid-1",
        "dataset_id": mock_ds_id,
        "project_id": mock_proj_id,
        "action_type": "drop_surrogate_identifiers",
        "target_columns": ["customer_id"],
        "parameters": {},
        "reasoning": "Unique identifier leaks target",
        "risk_level": "HIGH",
        "confidence": 0.98,
        "rows_affected_est": 0,
        "status": "PENDING",
        "created_at": "2026-10-07T12:00:00Z",
    }

    mock_dataset = {
        "id": mock_ds_id,
        "project_id": mock_proj_id,
        "original_filename": "data.csv",
        "status": "WAITING_APPROVAL",
        "profile_json": {"pending_approvals": [fake_approval]},
    }

    with patch("app.routers.approvals.get_dataset", return_value=mock_dataset), \
         patch("app.routers.approvals.list_approvals", return_value=[fake_approval]), \
         patch("app.routers.approvals.resolve_user_approval") as mock_resolve:

        # 1. GET approvals (project route)
        res_get = client.get(f"/api/v1/projects/{mock_proj_id}/datasets/{mock_ds_id}/approvals")
        assert res_get.status_code == 200
        get_data = res_get.json()
        assert get_data["count"] == 1
        assert get_data["dataset_status"] == "WAITING_APPROVAL"
        assert get_data["approvals"][0]["action_type"] == "drop_surrogate_identifiers"

        # 2. GET approvals (direct route)
        res_direct = client.get(f"/api/v1/datasets/{mock_ds_id}/approvals")
        assert res_direct.status_code == 200

        # 3. POST decision
        mock_resolve.return_value = {
            "dataset_id": mock_ds_id,
            "action_id": "appr-uuid-1",
            "decision": "approve",
            "approval": {**fake_approval, "status": "EXECUTED"},
            "version": {"version_number": 2, "created_by_action": "Human Approved"},
            "dataset_status": "COMPLETED",
            "final_profile": {},
            "message": "Approved and executed drop_surrogate_identifiers.",
        }

        res_dec = client.post(
            f"/api/v1/projects/{mock_proj_id}/datasets/{mock_ds_id}/approvals/appr-uuid-1/decision",
            json={"decision": "approve", "feedback": "Approved"},
        )
        assert res_dec.status_code == 200
        dec_data = res_dec.json()
        assert dec_data["decision"] == "approve"
        assert dec_data["dataset_status"] == "COMPLETED"


def test_agent_clean_pauses_on_high_risk_when_require_approval_true():
    """Verify that agent clean pauses with WAITING_APPROVAL when high-risk action proposed with require_approval=True."""
    mock_ds_id = "test-agent-pause-ds"
    mock_proj_id = "test-agent-pause-proj"

    mock_ds_val = {
        "id": mock_ds_id,
        "project_id": mock_proj_id,
        "storage_path": "datasets/test.csv",
        "original_filename": "test.csv",
        "file_type": "csv",
        "task_type": "CLASSIFICATION",
        "profile_json": {
            "versions": [{"id": "v0-id", "version_number": 0, "is_current": True}],
            "pending_approvals": [],
        },
    }

    # LLM proposes HIGH-risk action: drop_surrogate_identifiers
    decision_step = AgentIterationDecision(
        current_health_grade="C",
        readiness_score=60,
        assessment="Surrogate ID present, must drop.",
        is_dataset_clean=False,
        selected_actions=[
            CleaningActionPlan(
                action_type="drop_surrogate_identifiers",
                target_columns=["id"],
                reasoning="ID causes leakage",
            ),
        ],
    )

    with patch("app.routers.clean.get_project", return_value={"id": mock_proj_id}), \
         patch("app.routers.clean.get_dataset", return_value=mock_ds_val), \
         patch("app.database.repositories.versions.get_dataset", return_value=mock_ds_val), \
         patch("app.routers.clean.download_file", return_value=SAMPLE_CSV), \
         patch("app.routers.clean.upload_file"), \
         patch("app.routers.clean.update_dataset_profile"), \
         patch("app.routers.clean.get_service_client"), \
         patch("app.services.agent_cleaner.get_llm_provider") as mock_get_provider, \
         patch("app.services.versioning.upload_file"), \
         patch("app.services.approvals.save_approval") as mock_save_appr:

        mock_save_appr.return_value = {
            "id": "appr-paused-123",
            "dataset_id": mock_ds_id,
            "action_type": "drop_surrogate_identifiers",
            "risk_level": "HIGH",
            "status": "PENDING",
            "reasoning": "ID causes leakage",
        }

        mock_provider = MagicMock()
        mock_provider.generate_structured.return_value = decision_step
        mock_get_provider.return_value = mock_provider

        # Call with require_approval=True
        res = client.post(f"/api/v1/projects/{mock_proj_id}/datasets/{mock_ds_id}/agent-clean?require_approval=true")
        assert res.status_code == 200
        data = res.json()
        assert data["status"] == "WAITING_APPROVAL"
        assert data["version"] is None
        assert len(data["pending_approvals"]) == 1
        assert data["pending_approvals"][0]["action_type"] == "drop_surrogate_identifiers"
        assert data["pending_approvals"][0]["risk_level"] == "HIGH"


def test_batch_approval_awaits_all_decisions_before_creating_dataset():
    """Verify that when multiple actions need approval, dataset and version are NOT created until all are resolved."""
    mock_ds_id = "test-batch-ds"
    mock_proj_id = "test-batch-proj"

    appr1 = {
        "id": "appr-1",
        "dataset_id": mock_ds_id,
        "project_id": mock_proj_id,
        "action_type": "drop_columns",
        "target_columns": ["id"],
        "parameters": {},
        "risk_level": "HIGH",
        "status": "PENDING",
    }
    appr2 = {
        "id": "appr-2",
        "dataset_id": mock_ds_id,
        "project_id": mock_proj_id,
        "action_type": "drop_columns",
        "target_columns": ["name"],
        "parameters": {},
        "risk_level": "HIGH",
        "status": "PENDING",
    }

    mock_dataset = {
        "id": mock_ds_id,
        "project_id": mock_proj_id,
        "original_filename": "data.csv",
        "storage_path": "datasets/test.csv",
        "file_type": "csv",
        "status": "WAITING_APPROVAL",
        "profile_json": {"pending_approvals": [appr1, appr2]},
    }

    # Step 1: User decides appr1 (Approve), but appr2 is still pending
    with patch("app.services.approvals.get_approval", return_value=appr1), \
         patch("app.services.approvals.get_dataset", return_value=mock_dataset), \
         patch("app.services.approvals.update_approval_status", return_value={**appr1, "status": "APPROVED"}), \
         patch("app.services.approvals.list_approvals", return_value=[appr2]), \
         patch("app.services.approvals.get_service_client"):

        res1 = resolve_user_approval(mock_ds_id, mock_proj_id, "appr-1", "approve")
        # Must still be WAITING_APPROVAL, and no dataset/version created yet!
        assert res1["dataset_status"] == "WAITING_APPROVAL"
        assert res1["version"] is None
        assert "Awaiting 1 pending approval(s)" in res1["message"]

    # Step 2: User decides appr2 (Reject), now 0 pending remain!
    with patch("app.services.approvals.get_approval", return_value=appr2), \
         patch("app.services.approvals.get_dataset", return_value=mock_dataset), \
         patch("app.services.approvals.download_file", return_value=SAMPLE_CSV), \
         patch("app.services.approvals.upload_file"), \
         patch("app.services.approvals.update_dataset_profile"), \
         patch("app.services.approvals.update_approval_status", return_value={**appr2, "status": "REJECTED"}), \
         patch("app.services.approvals.list_approvals") as mock_list, \
         patch("app.services.approvals.get_service_client"), \
         patch("app.services.approvals.create_dataset_version") as mock_create_v:

        mock_list.side_effect = lambda ds_id, status_filter=None: (
            [] if status_filter == "PENDING" else [{**appr1, "status": "APPROVED"}, {**appr2, "status": "REJECTED"}]
        )
        mock_create_v.return_value = {
            "id": "v2-uuid",
            "version_number": 2,
            "created_by_action": "Human Approved: Drop Columns",
        }

        res2 = resolve_user_approval(mock_ds_id, mock_proj_id, "appr-2", "reject")
        # All approvals decided -> executes ONLY approved actions and creates version
        assert res2["dataset_status"] == "CLEANED"
        assert res2["version"] is not None
        assert "Executed 1 cleaning action(s)" in res2["message"]
        assert "Denied action(s) (drop columns) were skipped" in res2["message"]


def test_resolve_user_approval_reject_still_executes_pending_safe_actions():
    """Verify that if high-risk approval is denied, only the denied action is skipped while other safe cleaning functions execute."""
    mock_ds_id = "test-denied-safe-ds"
    mock_proj_id = "test-denied-safe-proj"

    high_risk_appr = {
        "id": "appr-drop-id",
        "dataset_id": mock_ds_id,
        "project_id": mock_proj_id,
        "action_type": "drop_columns",
        "target_columns": ["id"],
        "parameters": {},
        "reasoning": "Drop unique id",
        "risk_level": "HIGH",
        "status": "PENDING",
    }

    pending_safe = [
        {
            "action_type": "remove_duplicates",
            "target_columns": [],
            "parameters": {},
            "reasoning": "Deduplicate identical rows",
        },
        {
            "action_type": "trim_whitespace",
            "target_columns": [],
            "parameters": {},
            "reasoning": "Strip whitespace",
        },
    ]

    mock_dataset = {
        "id": mock_ds_id,
        "project_id": mock_proj_id,
        "original_filename": "data.csv",
        "storage_path": "datasets/test.csv",
        "file_type": "csv",
        "status": "WAITING_APPROVAL",
        "profile_json": {
            "pending_approvals": [high_risk_appr],
            "pending_safe_actions": pending_safe,
        },
    }

    with patch("app.services.approvals.get_approval", return_value=high_risk_appr), \
         patch("app.services.approvals.get_dataset", return_value=mock_dataset), \
         patch("app.services.approvals.download_file", return_value=SAMPLE_CSV), \
         patch("app.services.approvals.upload_file"), \
         patch("app.services.approvals.update_dataset_profile"), \
         patch("app.services.approvals.update_approval_status", return_value={**high_risk_appr, "status": "REJECTED"}), \
         patch("app.services.approvals.list_approvals") as mock_list, \
         patch("app.services.approvals.get_service_client"), \
         patch("app.services.approvals.create_dataset_version") as mock_create_v:

        mock_list.side_effect = lambda ds_id, status_filter=None: (
            [] if status_filter == "PENDING" else [{**high_risk_appr, "status": "REJECTED"}]
        )
        mock_create_v.return_value = {
            "id": "v-safe-only",
            "version_number": 1,
            "created_by_action": "Cleaned: Remove Duplicates, Trim Whitespace",
            "action_details": {
                "executed_actions": ["remove_duplicates", "trim_whitespace"],
                "rejected_actions": ["drop_columns"],
            },
        }

        # User denies the high-risk action
        res = resolve_user_approval(
            dataset_id=mock_ds_id,
            project_id=mock_proj_id,
            action_id="appr-drop-id",
            decision="reject",
            feedback="Keep ID column for customer lookups",
        )

        # 1. Denied action was NOT executed, but other safe cleaning functions WERE executed!
        assert res["decision"] == "reject"
        assert res["dataset_status"] == "CLEANED"
        assert res["version"] is not None
        assert "drop_columns" in res["version"]["action_details"]["rejected_actions"]
        assert "remove_duplicates" in res["version"]["action_details"]["executed_actions"]
        assert "trim_whitespace" in res["version"]["action_details"]["executed_actions"]
        assert "drop_columns" not in res["version"]["action_details"]["executed_actions"]
        assert "Denied action(s) (drop columns) were skipped" in res["message"]


def test_agent_clean_pauses_and_records_safe_actions_when_approval_requested():
    """Verify that agent-clean saves pending_safe_actions when pausing on high-risk action."""
    mock_ds_id = "test-agent-pause-safe-ds"
    mock_proj_id = "test-agent-pause-safe-proj"

    mock_ds_val = {
        "id": mock_ds_id,
        "project_id": mock_proj_id,
        "storage_path": "datasets/test.csv",
        "original_filename": "test.csv",
        "file_type": "csv",
        "task_type": "GENERAL",
        "profile_json": {
            "versions": [{"id": "v0-id", "version_number": 0, "is_current": True}],
            "pending_approvals": [],
        },
    }

    decision_step = AgentIterationDecision(
        current_health_grade="C",
        readiness_score=60,
        assessment="Duplicates and surrogate ID present.",
        is_dataset_clean=False,
        selected_actions=[
            CleaningActionPlan(
                action_type="remove_duplicates",
                target_columns=[],
                reasoning="Safe deduplication",
            ),
            CleaningActionPlan(
                action_type="drop_surrogate_identifiers",
                target_columns=["id"],
                reasoning="High-risk ID drop",
            ),
        ],
    )

    with patch("app.routers.clean.get_project", return_value={"id": mock_proj_id}), \
         patch("app.routers.clean.get_dataset", return_value=mock_ds_val), \
         patch("app.database.repositories.versions.get_dataset", return_value=mock_ds_val), \
         patch("app.routers.clean.download_file", return_value=SAMPLE_CSV), \
         patch("app.routers.clean.upload_file"), \
         patch("app.routers.clean.update_dataset_profile"), \
         patch("app.routers.clean.get_service_client"), \
         patch("app.services.agent_cleaner.get_llm_provider") as mock_get_provider, \
         patch("app.services.versioning.upload_file"), \
         patch("app.services.approvals.save_approval") as mock_save_appr:

        mock_save_appr.return_value = {
            "id": "appr-paused-999",
            "dataset_id": mock_ds_id,
            "action_type": "drop_surrogate_identifiers",
            "risk_level": "HIGH",
            "status": "PENDING",
            "reasoning": "High-risk ID drop",
        }

        mock_provider = MagicMock()
        mock_provider.generate_structured.return_value = decision_step
        mock_get_provider.return_value = mock_provider

        res = client.post(f"/api/v1/projects/{mock_proj_id}/datasets/{mock_ds_id}/agent-clean?require_approval=true")
        assert res.status_code == 200
        data = res.json()
        assert data["status"] == "WAITING_APPROVAL"
        assert data["version"] is None
        # Verify safe action was preserved in pending_safe_actions!
        assert len(data["pending_safe_actions"]) == 1
        assert data["pending_safe_actions"][0]["action_type"] == "remove_duplicates"
        # Verify high-risk action was queued for approval
        assert len(data["pending_approvals"]) == 1
        assert data["pending_approvals"][0]["action_type"] == "drop_surrogate_identifiers"


