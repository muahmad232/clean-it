"""
Autonomous Multi-Step Agentic Data Cleaning Engine — Phase 7+.

An iterative agentic cleaning cycle:
1. Profile current dataset state (deterministic Polars metrics & defect detector).
2. LLM Reasoner (Groq Qwen 3.8 27B) analyzes the profile, diagnoses defects,
   and selects specific deterministic cleaning functions to run.
3. Deterministic Polars execution engine executes ONLY the selected functions.
4. Dataset is immediately re-profiled with Polars.
5. The LLM re-evaluates the resulting dataset to verify quality improvement.
6. The cycle repeats until the LLM confirms the dataset is clean or max iterations reached.
7. Produces an audit trail of each iteration step and the final ready-to-download CSV.
"""

from __future__ import annotations

import io
import os
import re
import tempfile
from typing import Any, Dict, List, Optional
import polars as pl
from pydantic import BaseModel, Field

from app.core.logging import get_logger
from app.llm import get_llm_provider, LLMError
from app.services.profiler import profile_dataset, _load_dataframe

logger = get_logger(__name__)

_NUMERIC_PATTERN = re.compile(r"^[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?$")


# ── Pydantic Schemas for LLM Reasoning ─────────────────────────────

class CleaningActionPlan(BaseModel):
    """An atomic cleaning action selected by the LLM."""
    action_type: str = Field(
        ...,
        description=(
            "Action to run: 'remove_duplicates', 'fix_type_mismatches', "
            "'drop_high_null_columns', 'drop_constant_columns', "
            "'drop_surrogate_identifiers', 'drop_columns', "
            "'impute_missing', 'handle_outliers', 'trim_whitespace', 'custom_polars_script'"
        ),
    )
    target_columns: Optional[List[str]] = Field(
        default=None,
        description="Target columns for this action (e.g. ['Age', 'Cabin'])",
    )
    parameters: Optional[Dict[str, Any]] = Field(
        default_factory=dict,
        description="Parameters for action (e.g. {'strategy': 'median', 'threshold_pct': 70.0})",
    )
    reasoning: str = Field(
        ...,
        description="Why this transformation is chosen based on dataset defects",
    )


class AgentIterationDecision(BaseModel):
    """LLM decision for a single step in the cleaning loop."""
    current_health_grade: str = Field(..., description="Grade: A+, A, B, C, D, or F")
    readiness_score: int = Field(..., ge=0, le=100, description="Readiness score 0 to 100")
    assessment: str = Field(..., description="Short evaluation of current dataset state and defects")
    is_dataset_clean: bool = Field(
        ...,
        description="True if dataset is now clean and ready for downstream ML/analytics, False if defects remain",
    )
    stopping_reason: Optional[str] = Field(
        default=None,
        description="Explanation if stopping (e.g. 'All nulls imputed, types resolved, identifiers removed')",
    )
    selected_actions: List[CleaningActionPlan] = Field(
        default_factory=list,
        description="Ordered list of cleaning actions to execute in this iteration",
    )


CleaningActionPlan.model_rebuild()
AgentIterationDecision.model_rebuild()


# ── Deterministic Action Execution via Polars ──────────────────────

def apply_cleaning_action(
    df: pl.DataFrame,
    action: CleaningActionPlan,
    target_column: Optional[str] = None,
) -> tuple[pl.DataFrame, dict[str, Any]]:
    """
    Execute a single LLM-selected cleaning action deterministically with Polars.
    Returns (transformed_df, execution_result_dict).
    """
    action_type = action.action_type.lower().strip()
    params = action.parameters or {}
    cols = action.target_columns or []
    before_rows, before_cols = df.shape

    result: dict[str, Any] = {
        "action_type": action_type,
        "reasoning": action.reasoning,
        "target_columns": cols,
        "details": "",
        "rows_delta": 0,
        "columns_delta": 0,
    }

    try:
        if action_type == "remove_duplicates":
            unique_df = df.unique()
            dups = before_rows - unique_df.shape[0]
            df = unique_df
            result["rows_delta"] = -dups
            result["details"] = f"Removed {dups} duplicate rows." if dups > 0 else "No duplicate rows found."

        elif action_type == "fix_type_mismatches":
            casted_cols = []
            target_set = set(cols) if cols else set(df.columns)
            for col in list(df.columns):
                if target_set and col not in target_set:
                    continue
                series = df[col]
                if series.dtype == pl.String:
                    sample = [s.strip() for s in series.drop_nulls().head(100).to_list() if s is not None and s.strip() != ""]
                    if len(sample) >= 3:
                        num_matches = sum(1 for s in sample if _NUMERIC_PATTERN.match(s))
                        if (num_matches / len(sample)) >= 0.8:
                            casted = (
                                df[col]
                                .str.strip_chars()
                                .str.replace_all('"', "")
                                .cast(pl.Float64, strict=False)
                            )
                            df = df.with_columns(casted.alias(col))
                            casted_cols.append(col)
            result["details"] = f"Cast string columns to Float64: {casted_cols}" if casted_cols else "No string-numeric type mismatches found."

        elif action_type == "drop_high_null_columns":
            threshold = float(params.get("threshold_pct", 70.0))
            dropped = []
            current_rows = df.shape[0]
            if current_rows > 0:
                for col in list(df.columns):
                    if col == target_column:
                        continue
                    null_pct = (df[col].null_count() / current_rows) * 100.0
                    if null_pct >= threshold:
                        df = df.drop(col)
                        dropped.append(f"{col} ({null_pct:.1f}% null)")
            result["columns_delta"] = -len(dropped)
            result["details"] = f"Dropped catastrophic null columns (>= {threshold}%): {dropped}" if dropped else "No high-null columns exceeded threshold."

        elif action_type == "drop_constant_columns":
            dropped = []
            for col in list(df.columns):
                if col == target_column:
                    continue
                non_null = df[col].drop_nulls()
                if len(non_null) > 0 and non_null.n_unique() == 1:
                    df = df.drop(col)
                    dropped.append(col)
            result["columns_delta"] = -len(dropped)
            result["details"] = f"Dropped zero-variance constant columns: {dropped}" if dropped else "No constant columns found."

        elif action_type == "drop_surrogate_identifiers":
            dropped = []
            current_rows = df.shape[0]
            # 1. If explicit columns were provided by the agent
            if cols:
                for col in cols:
                    if col in df.columns and col != target_column:
                        df = df.drop(col)
                        dropped.append(col)
            # 2. Auto-detect surrogate keys
            elif current_rows >= 2:
                for col in list(df.columns):
                    if col == target_column:
                        continue
                    series = df[col]
                    non_null = series.drop_nulls()
                    if len(non_null) == current_rows and non_null.n_unique() == current_rows:
                        col_lower = col.lower().strip()
                        if series.dtype in (pl.String, pl.Categorical) or (
                            col_lower in ("id", "index", "row_id", "rowid", "idx", "uuid", "guid", "key", "x", "unnamed: 0")
                            or col_lower.endswith(("_id", "_uuid", "_key", "id", "number", "num"))
                        ):
                            df = df.drop(col)
                            dropped.append(col)
            result["columns_delta"] = -len(dropped)
            result["details"] = f"Dropped surrogate identifier columns: {dropped}" if dropped else "No surrogate key identifiers found."


        elif action_type == "drop_columns":
            dropped = []
            for col in cols:
                if col in df.columns and col != target_column:
                    df = df.drop(col)
                    dropped.append(col)
            result["columns_delta"] = -len(dropped)
            result["details"] = f"Explicitly dropped columns: {dropped}" if dropped else "No specified columns dropped."

        elif action_type == "impute_missing":
            strategy = params.get("strategy", "auto")
            target_set = set(cols) if cols else set(df.columns)
            imputed_counts = {}

            for col in list(df.columns):
                if target_set and col not in target_set:
                    continue
                if col == target_column:
                    continue
                null_count = df[col].null_count()
                if null_count == 0:
                    continue

                series = df[col]
                # Numeric column imputation
                if series.dtype in (
                    pl.Float32, pl.Float64, pl.Int8, pl.Int16, pl.Int32, pl.Int64,
                    pl.UInt8, pl.UInt16, pl.UInt32, pl.UInt64
                ):
                    series_clean = series.fill_nan(None) if series.dtype in (pl.Float32, pl.Float64) else series
                    if strategy == "mean":
                        fill_val = series_clean.drop_nulls().mean()
                    elif strategy == "zero":
                        fill_val = 0
                    else:  # median (default / auto)
                        fill_val = series_clean.drop_nulls().median()

                    if fill_val is not None:
                        filled = df[col]
                        if series.dtype in (pl.Float32, pl.Float64):
                            filled = filled.fill_nan(None)
                        df = df.with_columns(filled.fill_null(fill_val).alias(col))
                        imputed_counts[col] = f"{null_count} nulls imputed with {strategy} ({round(float(fill_val), 2)})"

                # String column imputation
                elif series.dtype == pl.String:
                    if strategy == "mode":
                        mode_s = series.drop_nulls().mode()
                        fill_str = mode_s[0] if len(mode_s) > 0 else "Unknown"
                    else:
                        fill_str = params.get("fill_value", "Unknown")
                    df = df.with_columns(df[col].fill_null(fill_str).alias(col))
                    imputed_counts[col] = f"{null_count} nulls imputed with '{fill_str}'"

            result["details"] = f"Imputed missing values: {imputed_counts}" if imputed_counts else "No missing values to impute."

        elif action_type == "handle_outliers":
            # Outlier treatment: clip numeric features to 1.5 * IQR bounds
            treated = []
            target_set = set(cols) if cols else set(df.columns)
            for col in list(df.columns):
                if target_set and col not in target_set:
                    continue
                if col == target_column:
                    continue
                series = df[col]
                if series.dtype in (pl.Float32, pl.Float64, pl.Int32, pl.Int64):
                    s_clean = series.drop_nulls()
                    if len(s_clean) >= 20:
                        q25 = float(s_clean.quantile(0.25))
                        q75 = float(s_clean.quantile(0.75))
                        iqr = q75 - q25
                        if iqr > 0:
                            lower = q25 - 1.5 * iqr
                            upper = q75 + 1.5 * iqr
                            clipped = df[col].clip(lower, upper)
                            df = df.with_columns(clipped.alias(col))
                            treated.append(f"{col} (clipped to [{round(lower, 2)}, {round(upper, 2)}])")
            result["details"] = f"Handled outliers via IQR clipping: {treated}" if treated else "No numeric columns required outlier clipping."

        elif action_type == "trim_whitespace":
            trimmed = []
            for col in list(df.columns):
                if df[col].dtype == pl.String:
                    df = df.with_columns(df[col].str.strip_chars().alias(col))
                    trimmed.append(col)
            result["details"] = f"Trimmed whitespace on text columns: {trimmed}" if trimmed else "No string columns to trim."

        elif action_type == "custom_polars_script":
            from app.services.code_sandbox import execute_polars_code
            code = params.get("code", "")
            if not code:
                result["details"] = "Failed: No code provided in custom_polars_script parameters."
            else:
                new_df, err = execute_polars_code(code, df)
                if err:
                    result["details"] = f"Dynamic script execution failed: {err}"
                else:
                    after_r, after_c = new_df.shape
                    result["rows_delta"] = after_r - before_rows
                    result["columns_delta"] = after_c - before_cols
                    result["details"] = f"Executed dynamic Polars script successfully ({before_rows}x{before_cols} -> {after_r}x{after_c})."
                    df = new_df

        else:
            result["details"] = f"Unrecognized action '{action_type}'; skipped safely."

    except Exception as exc:
        logger.warning(f"Error applying action '{action_type}': {exc}")
        result["details"] = f"Error during execution: {exc}"

    return df, result


def df_to_csv_bytes(df: pl.DataFrame) -> bytes:
    """Serialize a Polars DataFrame to CSV bytes."""
    buf = io.BytesIO()
    df.write_csv(buf)
    return buf.getvalue()


# ── Autonomous Multi-Step Agentic Cleaning Loop ────────────────────

def run_agentic_cleaning_cycle(
    dataset_id: str,
    file_bytes: bytes,
    file_type: str = "csv",
    task_type: str = "GENERAL",
    target_column: Optional[str] = None,
    max_iterations: int = 3,
    project_id: Optional[str] = None,
    require_approval: bool = True,
) -> dict[str, Any]:
    """
    Execute an autonomous, multi-step agentic cleaning loop:
    1. Profile dataset with Polars.
    2. Prompt Groq LLM to diagnose defects and select precise cleaning functions.
    3. Execute selected functions with Polars.
    4. Re-profile the dataset and verify quality improvement.
    5. Repeat until LLM confirms the dataset is clean or max_iterations reached.
    """
    logger.info(
        f"Starting autonomous agent cleaning loop for dataset={dataset_id}, "
        f"task={task_type}, size={len(file_bytes):,}B, max_iters={max_iterations}"
    )

    provider = get_llm_provider()
    current_bytes = file_bytes
    steps_history: list[dict[str, Any]] = []

    # Initial profile
    initial_profile_obj = profile_dataset(dataset_id=dataset_id, file_bytes=current_bytes, file_type=file_type)
    initial_profile = initial_profile_obj.to_dict()

    for iteration in range(1, max_iterations + 1):
        # 1. Profile current iteration bytes
        current_profile_obj = profile_dataset(dataset_id=dataset_id, file_bytes=current_bytes, file_type="csv")
        current_profile = current_profile_obj.to_dict()
        current_issues = current_profile.get("issues", [])
        current_shape = current_profile.get("shape", {"rows": 0, "columns": 0})
        total_null_pct = current_profile.get("total_null_pct", 0.0)

        # Build compact issue snippet for LLM (max 6 issues to preserve tokens)
        issues_snippet = "\n".join([
            f"- [{i.get('severity', 'MEDIUM')}] {i.get('issue_type', 'DEFECT')}: {i.get('column_name', 'all')} — {i.get('description', '')}"
            for i in current_issues[:6]
        ]) or "No quality issues detected by deterministic profiler."

        # Prior iteration context
        prev_actions_summary = ""
        if steps_history:
            prev_actions_summary = "\n".join([
                f"Step {s['iteration']}: Planned {len(s['selected_actions'])} actions. Result: {s['post_shape']['rows']}x{s['post_shape']['columns']}."
                for s in steps_history
            ])

        # 2. Query Groq LLM for Diagnosis & Function Selection
        system_prompt = (
            "You are an autonomous AI data-engineering agent. You operate in an iterative cleaning loop "
            f"(Iteration {iteration}/{max_iterations}).\n"
            "Your tasks:\n"
            "1. Evaluate the dataset's current health grade (A+, A, B, C, D, or F) and readiness score (0-100).\n"
            "2. Determine if the dataset is now sufficiently clean (is_dataset_clean = True).\n"
            "3. If NOT clean, select 1 to 3 precise cleaning functions to run from this available tool catalog:\n"
            "   - 'remove_duplicates': Drop duplicate rows.\n"
            "   - 'fix_type_mismatches': Cast string numbers to numeric Float64/Int64.\n"
            "   - 'drop_high_null_columns': Drop columns with high null percentage (params: {'threshold_pct': 70.0}).\n"
            "   - 'drop_constant_columns': Drop zero-variance columns.\n"
            "   - 'drop_surrogate_identifiers': Drop unique ID/key columns that cause overfitting or data leakage.\n"
            "   - 'drop_columns': Drop specific named columns (target_columns: ['colA']).\n"
            "   - 'impute_missing': Impute nulls (target_columns: ['col'], params: {'strategy': 'median'|'mean'|'mode'|'constant'}).\n"
            "   - 'handle_outliers': Clip extreme numeric anomalies using IQR bounds.\n"
            "   - 'trim_whitespace': Strip text whitespace across columns.\n\n"
            "Rules:\n"
            "- Only select actions that address actual detected defects.\n"
            "- If all significant defects are already resolved or nulls are zero, set is_dataset_clean=True with empty actions.\n"
            "- Protect target column if specified.\n"
            "- Return strictly valid JSON matching the schema."
        )

        user_content = (
            f"Iteration: {iteration} of {max_iterations}\n"
            f"Target Task: {task_type}\n"
            f"Protected Target Column: {target_column or 'None'}\n"
            f"Current Dimensions: {current_shape.get('rows')} rows × {current_shape.get('columns')} columns\n"
            f"Current Total Null Percentage: {total_null_pct}%\n\n"
            f"Statistical Summary:\n{current_profile.get('llm_summary', '')}\n\n"
            f"Active Defects Detected:\n{issues_snippet}\n"
        )
        if prev_actions_summary:
            user_content += f"\nPrevious Iterations Performed:\n{prev_actions_summary}\n"

        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_content},
        ]

        # Call Groq with fallback
        decision: Optional[AgentIterationDecision] = None
        try:
            decision = provider.generate_structured(
                messages=messages,
                response_schema=AgentIterationDecision,
                temperature=0.1,
                max_tokens=700,
            )
        except LLMError as exc:
            logger.warning(f"Groq LLM call failed in iteration {iteration}: {exc}. Triggering deterministic fallback.")
            # Fallback heuristic decision so the pipeline never breaks
            decision = _create_fallback_decision(current_issues, current_shape, total_null_pct)

        # 3. Check for Termination
        if decision.is_dataset_clean or not decision.selected_actions:
            logger.info(f"Agent determined dataset is clean at iteration {iteration}. Stopping reason: {decision.stopping_reason}")
            step_record = {
                "iteration": iteration,
                "pre_shape": current_shape,
                "pre_issues_count": len(current_issues),
                "health_grade": decision.current_health_grade,
                "readiness_score": decision.readiness_score,
                "llm_assessment": decision.assessment,
                "is_dataset_clean": True,
                "stopping_reason": decision.stopping_reason or "Dataset verified clean by agent.",
                "selected_actions": [],
                "execution_results": [],
                "post_shape": current_shape,
            }
            steps_history.append(step_record)
            break

        # 4. Check Risk Level and Approval Policy (Phase 12)
        has_pending_approval = False
        pending_approvals = []
        executed_actions = []

        for action_plan in decision.selected_actions:
            from app.services.approvals import classify_action_risk, register_pending_approval
            risk_level, needs_approval = classify_action_risk(
                action_plan.action_type,
                action_plan.parameters,
                action_plan.target_columns,
            )
            if require_approval and needs_approval:
                logger.info(
                    f"Action '{action_plan.action_type}' requires human sign-off ({risk_level} risk). "
                    f"Registering pending approval for dataset {dataset_id}."
                )
                appr_rec = register_pending_approval(
                    dataset_id=dataset_id,
                    project_id=project_id,
                    action=action_plan,
                    confidence=0.95,
                    rows_affected_est=current_shape.get("rows", 0) if "outlier" in action_plan.action_type else 0,
                )
                pending_approvals.append(appr_rec)
                has_pending_approval = True
            else:
                executed_actions.append(action_plan)

        if has_pending_approval:
            logger.info("Halting autonomous loop: pending human approval for high-risk action(s). No transformations applied yet.")
            step_record = {
                "iteration": iteration,
                "pre_shape": current_shape,
                "pre_issues_count": len(current_issues),
                "health_grade": decision.current_health_grade,
                "readiness_score": decision.readiness_score,
                "llm_assessment": decision.assessment,
                "is_dataset_clean": False,
                "stopping_reason": "Paused: High-risk action requires human approval.",
                "selected_actions": [a.model_dump() for a in decision.selected_actions],
                "execution_results": [],
                "post_shape": current_shape,
                "waiting_approval": True,
                "pending_approvals": pending_approvals,
                "pending_safe_actions": [a.model_dump() for a in executed_actions],
            }
            steps_history.append(step_record)
            break

        # Execute safe or approved actions via Polars
        df = _load_dataframe(current_bytes, "csv")
        execution_results = []
        for action_plan in executed_actions:
            df, action_res = apply_cleaning_action(df, action_plan, target_column)
            execution_results.append(action_res)

        # Serialize transformed dataframe to CSV bytes
        new_bytes = df_to_csv_bytes(df)
        post_shape = {"rows": df.shape[0], "columns": df.shape[1]}

        step_record = {
            "iteration": iteration,
            "pre_shape": current_shape,
            "pre_issues_count": len(current_issues),
            "health_grade": decision.current_health_grade,
            "readiness_score": decision.readiness_score,
            "llm_assessment": decision.assessment,
            "is_dataset_clean": False,
            "stopping_reason": None,
            "selected_actions": [a.model_dump() for a in decision.selected_actions],
            "execution_results": execution_results,
            "post_shape": post_shape,
            "waiting_approval": False,
            "pending_approvals": [],
            "pending_safe_actions": [],
        }
        steps_history.append(step_record)

        # If data did not change at all, terminate to avoid infinite identical loops
        if new_bytes == current_bytes:
            logger.info("Dataset bytes unchanged after actions. Breaking iteration loop.")
            break

        current_bytes = new_bytes

    # 5. Final Profile Verification
    final_profile_obj = profile_dataset(dataset_id=dataset_id, file_bytes=current_bytes, file_type="csv")
    final_profile = final_profile_obj.to_dict()

    # Compute improvement metrics
    initial_issues_count = len(initial_profile.get("issues", []))
    final_issues_count = len(final_profile.get("issues", []))
    issues_resolved = max(0, initial_issues_count - final_issues_count)

    last_step = steps_history[-1] if steps_history else {}
    final_health_grade = last_step.get("health_grade", "A" if final_issues_count == 0 else "B+")
    final_readiness = last_step.get("readiness_score", 95 if final_issues_count == 0 else 85)

    all_pending = [a for s in steps_history for a in s.get("pending_approvals", [])]
    is_waiting_approval = any(s.get("waiting_approval", False) for s in steps_history)

    # Collect all pending safe actions across all steps in the loop
    all_pending_safe = []
    for s in steps_history:
        if s.get("waiting_approval"):
            all_pending_safe.extend(s.get("pending_safe_actions", []))
        else:
            # Safe actions in prior iterations before the pause
            for act in s.get("selected_actions", []):
                if not act.get("requires_approval") and act.get("action_type") not in [p.get("action_type") for p in all_pending]:
                    all_pending_safe.append(act)

    return {
        "dataset_id": dataset_id,
        "task_type": task_type,
        "target_column": target_column,
        "total_iterations": len(steps_history),
        "status": "WAITING_APPROVAL" if is_waiting_approval else "CLEANED",
        "pending_approvals": all_pending,
        "pending_safe_actions": all_pending_safe,
        "initial_metrics": {
            "rows": initial_profile.get("shape", {}).get("rows", 0),
            "columns": initial_profile.get("shape", {}).get("columns", 0),
            "total_null_pct": initial_profile.get("total_null_pct", 0.0),
            "issues_count": initial_issues_count,
        },
        "final_metrics": {
            "rows": final_profile.get("shape", {}).get("rows", 0),
            "columns": final_profile.get("shape", {}).get("columns", 0),
            "total_null_pct": final_profile.get("total_null_pct", 0.0),
            "issues_count": final_issues_count,
            "health_grade": final_health_grade,
            "readiness_score": final_readiness,
        },
        "issues_resolved": issues_resolved,
        "steps": steps_history,
        "cleaned_bytes": current_bytes,
        "final_profile": final_profile,
    }


def _create_fallback_decision(
    issues: list[dict],
    shape: dict[str, int],
    null_pct: float,
) -> AgentIterationDecision:
    """Deterministic fallback decision if Groq API is temporarily unreachable."""
    actions = []
    # If duplicates exist, remove them
    has_dups = any(i.get("issue_type") == "DUPLICATE_ROWS" for i in issues)
    if has_dups:
        actions.append(CleaningActionPlan(
            action_type="remove_duplicates",
            reasoning="Deduplication improves sample independence.",
        ))

    # If missing values exist, impute them
    has_nulls = null_pct > 0 or any(i.get("issue_type") == "MISSING_VALUES" for i in issues)
    if has_nulls:
        actions.append(CleaningActionPlan(
            action_type="impute_missing",
            parameters={"strategy": "median"},
            reasoning="Impute numeric and categorical null values.",
        ))

    # Trim whitespace
    actions.append(CleaningActionPlan(
        action_type="trim_whitespace",
        reasoning="Sanitize textual whitespace across string columns.",
    ))

    return AgentIterationDecision(
        current_health_grade="C+",
        readiness_score=68,
        assessment="Rule-based heuristic plan applied to resolve standard tabular defects.",
        is_dataset_clean=False,
        selected_actions=actions,
    )
