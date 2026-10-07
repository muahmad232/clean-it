"""
Human Approval System Service — Phase 12.

Enforces policy where HIGH-risk actions (e.g. dropping columns, surrogate identifiers,
or bulk row deletion) block execution and require explicit user sign-off.
"""

from __future__ import annotations
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

import polars as pl

from app.core.logging import get_logger
from app.database.client import get_service_client
from app.database.repositories.datasets import get_dataset, update_dataset_profile
from app.database.repositories.approvals import (
    get_approval,
    list_approvals,
    save_approval,
    update_approval_status,
)
from app.services.agent_cleaner import (
    CleaningActionPlan,
    apply_cleaning_action,
    _load_dataframe,
    df_to_csv_bytes,
)
from app.services.profiler import profile_dataset
from app.services.versioning import create_dataset_version
from app.storage.supabase import download_file, upload_file

logger = get_logger(__name__)

# ── Risk Matrix Mapping ──────────────────────────────────────────────
HIGH_RISK_ACTIONS = {
    "drop_columns",
    "drop_surrogate_identifiers",
    "drop_high_null_columns",
    "drop_constant_columns",
    "remove_outliers",
}

MEDIUM_RISK_ACTIONS = {
    "impute_missing",
    "handle_outliers",
}

LOW_RISK_ACTIONS = {
    "remove_duplicates",
    "fix_type_mismatches",
    "trim_whitespace",
}


def classify_action_risk(
    action_type: str,
    parameters: Optional[Dict[str, Any]] = None,
    target_columns: Optional[List[str]] = None,
) -> Tuple[str, bool]:
    """
    Classify transformation risk level:
    Returns (risk_level: "LOW"|"MEDIUM"|"HIGH", requires_approval: bool).
    """
    act = action_type.lower().strip()
    if act in HIGH_RISK_ACTIONS:
        return "HIGH", True
    if act in MEDIUM_RISK_ACTIONS:
        return "MEDIUM", False
    return "LOW", False


def register_pending_approval(
    dataset_id: str,
    project_id: Optional[str],
    action: CleaningActionPlan,
    confidence: float = 0.95,
    rows_affected_est: int = 0,
) -> dict[str, Any]:
    """
    Register an action requiring user sign-off and mark the dataset as WAITING_APPROVAL.
    """
    action_id = str(uuid.uuid4())
    risk_level, _ = classify_action_risk(
        action.action_type,
        action.parameters,
        action.target_columns,
    )

    approval_payload = {
        "id": action_id,
        "dataset_id": dataset_id,
        "project_id": project_id,
        "action_type": action.action_type,
        "target_columns": action.target_columns or [],
        "parameters": action.parameters or {},
        "reasoning": action.reasoning,
        "risk_level": risk_level,
        "confidence": confidence,
        "rows_affected_est": rows_affected_est,
        "status": "PENDING",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }

    saved = save_approval(approval_payload)

    # Transition dataset status to WAITING_APPROVAL
    try:
        client = get_service_client()
        client.schema("data_agent").table("datasets").update({
            "status": "WAITING_APPROVAL"
        }).eq("id", dataset_id).execute()
    except Exception as exc:
        logger.warning(f"Could not update dataset status to WAITING_APPROVAL: {exc}")

    return saved


def resolve_user_approval(
    dataset_id: str,
    project_id: str,
    action_id: str,
    decision: str,
    feedback: Optional[str] = None,
) -> dict[str, Any]:
    """
    Process user decision ("approve" or "reject") for a pending approval:
    1. If approved: executes Polars transformation on current dataset state,
       snapshots a new immutable version, re-profiles, and updates profile.
    2. If rejected: marks action as REJECTED, preserves current state.
    3. Re-evaluates remaining pending approvals to update dataset status.
    """
    approval = get_approval(dataset_id, action_id)
    if not approval:
        raise ValueError(f"Approval record '{action_id}' not found for dataset '{dataset_id}'.")

    if approval.get("status") != "PENDING":
        raise ValueError(f"Approval '{action_id}' has already been resolved with status '{approval.get('status')}'.")

    dataset = get_dataset(dataset_id)
    if not dataset:
        raise ValueError(f"Dataset '{dataset_id}' not found.")

    decision_norm = decision.lower().strip()
    new_version = None
    final_profile = None

    if decision_norm == "approve":
        updated_appr = update_approval_status(dataset_id, action_id, "APPROVED", feedback)
    elif decision_norm == "reject":
        updated_appr = update_approval_status(dataset_id, action_id, "REJECTED", feedback)
    else:
        raise ValueError(f"Invalid decision '{decision}'. Expected 'approve' or 'reject'.")

    # Check if there are still other pending approvals for this dataset
    remaining = list_approvals(dataset_id, status_filter="PENDING")

    if len(remaining) > 0:
        # Still awaiting other approvals before executing and creating dataset
        dataset_status = "WAITING_APPROVAL"
        try:
            client = get_service_client()
            client.schema("data_agent").table("datasets").update({
                "status": dataset_status
            }).eq("id", dataset_id).execute()
        except Exception as exc:
            logger.warning(f"Could not update dataset status: {exc}")

        return {
            "dataset_id": dataset_id,
            "action_id": action_id,
            "decision": decision_norm,
            "approval": updated_appr or approval,
            "version": None,
            "dataset_status": dataset_status,
            "final_profile": dataset.get("profile_json"),
            "message": f"Decision '{decision_norm}' saved for {approval['action_type']}. Awaiting {len(remaining)} pending approval(s) before creating dataset.",
        }

    # ALL pending approvals have now been decided!
    # Await completed -> now based on decisions, create the dataset!
    all_approvals = list_approvals(dataset_id, status_filter=None)
    approved_list = [a for a in all_approvals if a.get("status") == "APPROVED"]
    rejected_list = [a for a in all_approvals if a.get("status") == "REJECTED"]

    profile_json = dataset.get("profile_json") or {}
    pending_safe_actions = profile_json.get("pending_safe_actions") or []

    # Compile all actions that must be executed:
    # 1. All safe actions that were planned alongside or prior to the approval request
    # 2. All high-risk actions that the user explicitly approved
    # Note: Actions that the user rejected are strictly excluded from execution!
    actions_to_execute: list[CleaningActionPlan] = []
    executed_action_names: list[str] = []

    for safe_act in pending_safe_actions:
        actions_to_execute.append(
            CleaningActionPlan(
                action_type=safe_act["action_type"],
                target_columns=safe_act.get("target_columns") or [],
                parameters=safe_act.get("parameters") or {},
                reasoning=safe_act.get("reasoning", "Autonomous safe cleaning action"),
            )
        )
        executed_action_names.append(safe_act["action_type"].replace("_", " ").title())

    for appr in approved_list:
        actions_to_execute.append(
            CleaningActionPlan(
                action_type=appr["action_type"],
                target_columns=appr.get("target_columns") or [],
                parameters=appr.get("parameters") or {},
                reasoning=appr.get("reasoning", "User approved action"),
            )
        )
        executed_action_names.append(appr["action_type"].replace("_", " ").title())

    new_version = None
    final_profile = dataset.get("profile_json")

    if actions_to_execute:
        # Base source file: original file if this is first cleaning batch
        working_storage_path = dataset.get("storage_path") or profile_json.get("cleaned_storage_path")
        if not working_storage_path:
            raise ValueError(f"No source data file path found for dataset '{dataset_id}'.")

        raw_bytes = download_file(working_storage_path)
        file_type = dataset.get("file_type", "csv")
        df = _load_dataframe(raw_bytes, file_type)

        target_col = dataset.get("target_column")
        exec_results = []

        for action_plan in actions_to_execute:
            df, action_res = apply_cleaning_action(df, action_plan, target_col)
            exec_results.append(action_res)

        # Mark approval records as EXECUTED
        for appr in approved_list:
            update_approval_status(dataset_id, appr["id"], "EXECUTED", appr.get("user_feedback"))

        cleaned_bytes = df_to_csv_bytes(df)

        # Upload final transformed file to storage
        cleaned_path = f"datasets/cleaned/{project_id}/{dataset_id}/cleaned_{dataset.get('original_filename', 'data.csv')}"
        try:
            upload_file(cleaned_path, cleaned_bytes, content_type="text/csv")
        except Exception as exc:
            logger.warning(f"Could not upload transformation file to storage: {exc}")

        # Re-profile dataset with Polars
        profile_obj = profile_dataset(dataset_id=dataset_id, file_bytes=cleaned_bytes, file_type="csv")
        final_profile = profile_obj.to_dict()

        # Update profile_json with new state and clear pending_safe_actions
        profile_json["cleaned_storage_path"] = cleaned_path
        profile_json["shape"] = final_profile.get("shape", profile_json.get("shape"))
        profile_json["total_null_pct"] = final_profile.get("total_null_pct", 0.0)
        profile_json["duplicate_row_count"] = final_profile.get("duplicate_row_count", 0)
        profile_json["columns"] = final_profile.get("columns", profile_json.get("columns"))
        profile_json["issues"] = final_profile.get("issues", [])
        profile_json["llm_summary"] = final_profile.get("llm_summary", profile_json.get("llm_summary"))
        profile_json["pending_safe_actions"] = []
        update_dataset_profile(dataset_id, profile_json)

        # Snapshot new immutable dataset version
        shape = final_profile.get("shape", {})
        action_names_str = ", ".join(executed_action_names[:3])
        if len(executed_action_names) > 3:
            action_names_str += f" (+{len(executed_action_names) - 3} more)"

        if approved_list and not pending_safe_actions:
            action_title = f"Human Approved: {action_names_str}"
        elif approved_list and pending_safe_actions:
            action_title = f"Cleaned & Approved: {action_names_str}"
        else:
            action_title = f"Cleaned: {action_names_str}"

        try:
            new_version = create_dataset_version(
                dataset_id=dataset_id,
                project_id=project_id,
                file_bytes=cleaned_bytes,
                file_type="csv",
                action_name=action_title,
                action_details={
                    "executed_actions": [a.action_type for a in actions_to_execute],
                    "approved_actions": [a["action_type"] for a in approved_list],
                    "rejected_actions": [a["action_type"] for a in rejected_list],
                    "execution_results": exec_results,
                    "user_feedback": feedback,
                },
                metrics={
                    "rows": shape.get("rows", 0),
                    "columns": shape.get("columns", 0),
                    "total_null_pct": final_profile.get("total_null_pct", 0.0),
                    "duplicate_row_count": final_profile.get("duplicate_row_count", 0),
                },
            )
        except Exception as exc:
            logger.warning(f"Could not snapshot version for cleaned action: {exc}", exc_info=True)

        dataset_status = "CLEANED"
        if rejected_list:
            rejected_names = ", ".join([r["action_type"].replace("_", " ") for r in rejected_list])
            msg = f"All approvals resolved. Executed {len(actions_to_execute)} cleaning action(s). Denied action(s) ({rejected_names}) were skipped."
        else:
            msg = f"All approvals completed. Executed {len(actions_to_execute)} cleaning action(s) and created new version."
    else:
        # All proposed actions were rejected, and no safe actions were pending!
        dataset_status = "CLEANED"
        profile_json["pending_safe_actions"] = []
        try:
            update_dataset_profile(dataset_id, profile_json)
        except Exception as exc:
            logger.warning(f"Could not clear pending_safe_actions: {exc}")
        msg = "All proposed high-risk actions were rejected and no other transformations were pending. Dataset preserved in current state without modifications."

    try:
        client = get_service_client()
        client.schema("data_agent").table("datasets").update({
            "status": dataset_status
        }).eq("id", dataset_id).execute()
    except Exception as exc:
        logger.warning(f"Could not update dataset status after approval decision: {exc}")

    return {
        "dataset_id": dataset_id,
        "action_id": action_id,
        "decision": decision_norm,
        "approval": updated_appr or approval,
        "version": new_version,
        "dataset_status": dataset_status,
        "final_profile": final_profile,
        "message": msg,
    }
