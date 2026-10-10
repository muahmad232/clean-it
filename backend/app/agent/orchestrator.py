"""
Self-Healing Autonomous Orchestrator Engine — Phase 14.

Implements the multi-iteration self-healing agent loop:
1. Deterministic Polars profiling of current working dataset.
2. Defect detection and LLM planning via Groq with token-efficient prompt budget.
3. High-risk safety check and pause layer.
4. Deterministic Polars execution of approved/safe transformations.
5. Immediate Polars re-profiling.
6. Multi-metric before/after comparison with quality scoring.
7. Automated in-loop rollback when regression is detected (> 5 point drop or > 20% target shift).
8. Regression feedback injection into LLM prompt for autonomous re-planning.
9. Convergence and hard termination limits (MAX_ITERATIONS = 5, MAX_LLM_CALLS = 10, MAX_ACTIONS = 10).
"""

from __future__ import annotations

import io
from typing import Any, Dict, List, Optional
import polars as pl

from app.core.logging import get_logger
from app.llm import LLMError
from app.models.comparison import ComparisonReport
from app.models.orchestration import (
    IterationStepReport,
    OrchestratorConfig,
    RegressionEvent,
    SelfHealingOrchestrationReport,
)
from app.services import agent_cleaner
from app.services.agent_cleaner import (
    AgentIterationDecision,
    CleaningActionPlan,
    apply_cleaning_action,
    df_to_csv_bytes,
    _create_fallback_decision,
)
from app.services.approvals import classify_action_risk, register_pending_approval
from app.services.comparison import calculate_quality_score, compare_profiles
from app.services.profiler import profile_dataset, _load_dataframe

logger = get_logger(__name__)


class SelfHealingOrchestrator:
    """
    Autonomous multi-iteration orchestrator that detects quality regressions,
    rolls back intermediate states, feeds diagnosis back to the LLM, and re-plans.
    """

    def __init__(self, config: Optional[OrchestratorConfig] = None):
        self.config = config or OrchestratorConfig()

    def run(
        self,
        dataset_id: str,
        file_bytes: bytes,
        file_type: str = "csv",
        task_type: str = "GENERAL",
        target_column: Optional[str] = None,
        project_id: Optional[str] = None,
        require_approval: Optional[bool] = None,
    ) -> SelfHealingOrchestrationReport:
        effective_approval = (
            require_approval if require_approval is not None else self.config.require_approval
        )
        max_iters = min(self.config.max_iterations, 5)
        max_llm_calls = min(self.config.max_llm_calls_per_run, 10)
        max_actions_per_iter = min(self.config.max_actions_per_iteration, 10)

        logger.info(
            f"Initiating Phase 14 Self-Healing Loop for dataset={dataset_id}, "
            f"task={task_type}, target={target_column}, max_iters={max_iters}, max_llm_calls={max_llm_calls}"
        )

        provider = agent_cleaner.get_llm_provider()
        steps: List[IterationStepReport] = []
        regression_history: List[RegressionEvent] = []
        all_pending_approvals: List[Dict[str, Any]] = []
        all_pending_safe_actions: List[Dict[str, Any]] = []

        # 1. Baseline Profiling
        initial_profile_obj = profile_dataset(
            dataset_id=dataset_id, file_bytes=file_bytes, file_type=file_type
        )
        initial_profile = initial_profile_obj.to_dict()
        initial_qs_breakdown = calculate_quality_score(initial_profile)
        initial_score = initial_qs_breakdown.overall_score
        initial_issues_count = len(initial_profile.get("issues", []))

        working_bytes = file_bytes
        working_profile = initial_profile
        working_score = initial_score

        llm_calls_used = 0
        consecutive_stagnant = 0
        active_regression_notice: Optional[str] = None
        termination_reason = "Maximum iterations reached."
        effective_status = "CLEANED"

        # 2. Multi-Iteration Loop
        for iteration in range(1, max_iters + 1):
            if llm_calls_used >= max_llm_calls:
                termination_reason = f"Reached maximum LLM call limit ({max_llm_calls})."
                break

            current_shape = working_profile.get("shape", {"rows": 0, "columns": 0})
            current_issues = working_profile.get("issues", [])
            total_null_pct = float(working_profile.get("total_null_pct", 0.0) or 0.0)
            dup_count = int(working_profile.get("duplicate_row_count", 0) or 0)

            # Check if dataset is already clean with no detectable defects
            if not current_issues and total_null_pct == 0.0 and dup_count == 0 and iteration > 1:
                termination_reason = "Dataset verified clean: all defects resolved."
                effective_status = "CONVERGED"
                break

            # Format compact issue snippet for token efficiency (~800 token budget)
            issues_snippet = "\n".join([
                f"- [{i.get('severity', 'MEDIUM')}] {i.get('issue_type', 'DEFECT')}: {i.get('column_name', 'all')} — {i.get('description', '')}"
                for i in current_issues[:6]
            ]) or "No active defects detected by deterministic profiler."

            # Prior iteration context
            prev_steps_summary = ""
            if steps:
                summary_lines = []
                for s in steps:
                    status_str = f"Status: {s.status}"
                    if s.rolled_back:
                        status_str += " (ROLLED BACK due to regression)"
                    summary_lines.append(
                        f"Iter {s.iteration}: {len(s.selected_actions)} actions planned. "
                        f"Quality: {s.pre_quality_score} -> {s.post_quality_score} ({s.quality_delta:+.1f}). {status_str}"
                    )
                prev_steps_summary = "\n".join(summary_lines)

            # Build System Prompt with Self-Healing instructions
            system_prompt = (
                "You are an autonomous AI data-engineering agent running in an iterative self-healing cleaning loop "
                f"(Iteration {iteration}/{max_iters}).\n"
                "Your objective:\n"
                "1. Assess data quality grade (A+, A, B, C, D, F) and readiness score (0-100).\n"
                "2. Determine if the dataset is now sufficiently clean (is_dataset_clean = True).\n"
                "3. If NOT clean, select 1 to 3 precise cleaning functions from this deterministic catalog:\n"
                "   - 'remove_duplicates': Drop duplicate rows.\n"
                "   - 'fix_type_mismatches': Cast string numbers to numeric Float64/Int64.\n"
                "   - 'drop_high_null_columns': Drop columns with extreme nulls (params: {'threshold_pct': 70.0}).\n"
                "   - 'drop_constant_columns': Drop zero-variance columns.\n"
                "   - 'drop_surrogate_identifiers': Drop unique ID/key columns causing leakage.\n"
                "   - 'drop_columns': Drop specific named columns (target_columns: ['colA']).\n"
                "   - 'impute_missing': Impute nulls (target_columns: ['col'], params: {'strategy': 'median'|'mean'|'mode'}).\n"
                "   - 'handle_outliers': Clip extreme numeric anomalies using IQR bounds.\n"
                "   - 'trim_whitespace': Strip text whitespace across columns.\n\n"
                "CRITICAL RULES:\n"
                "- Only select transformations that directly address active detected defects.\n"
                "- Protect the target column if specified; NEVER drop or distort target label distribution.\n"
                "- If all major defects are solved, set is_dataset_clean=True with empty actions.\n"
            )

            # Inject Regression Alert if previous action failed
            if active_regression_notice:
                system_prompt += (
                    f"\n⚠️ PREVIOUS REGRESSION DETECTED & ROLLED BACK:\n"
                    f"{active_regression_notice}\n"
                    "You MUST re-plan with a different safe strategy and DO NOT repeat the failed actions.\n"
                )

            user_content = (
                f"Iteration: {iteration} of {max_iters}\n"
                f"Target Task: {task_type}\n"
                f"Protected Target Column: {target_column or 'None'}\n"
                f"Current Dimensions: {current_shape.get('rows')} rows × {current_shape.get('columns')} columns\n"
                f"Current Quality Score: {working_score:.1f}/100\n"
                f"Current Total Null Percentage: {total_null_pct}%\n\n"
                f"Active Defects Detected:\n{issues_snippet}\n"
            )
            if prev_steps_summary:
                user_content += f"\nPrevious Iterations Log:\n{prev_steps_summary}\n"

            messages = [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_content},
            ]

            # LLM Decision with Fallback
            decision: Optional[AgentIterationDecision] = None
            try:
                llm_calls_used += 1
                decision = provider.generate_structured(
                    messages=messages,
                    response_schema=AgentIterationDecision,
                    temperature=0.1,
                    max_tokens=700,
                )
            except LLMError as exc:
                logger.warning(
                    f"LLM call failed in iteration {iteration} ({exc}). Using deterministic fallback."
                )
                decision = _create_fallback_decision(current_issues, current_shape, total_null_pct)

            # Check if LLM considers dataset clean
            if decision.is_dataset_clean or not decision.selected_actions:
                logger.info(
                    f"Agent concluded dataset is clean at iteration {iteration}. Reason: {decision.stopping_reason}"
                )
                step_record = IterationStepReport(
                    iteration=iteration,
                    pre_shape=current_shape,
                    pre_quality_score=working_score,
                    issues_before_count=len(current_issues),
                    pre_issues_count=len(current_issues),
                    health_grade=decision.current_health_grade,
                    readiness_score=decision.readiness_score,
                    llm_assessment=decision.assessment,
                    is_dataset_clean=True,
                    stopping_reason=decision.stopping_reason or "Dataset verified clean by agent.",
                    selected_actions=[],
                    executed_actions=[],
                    execution_results=[],
                    post_shape=current_shape,
                    post_quality_score=working_score,
                    quality_delta=0.0,
                    regression_detected=False,
                    rolled_back=False,
                    waiting_approval=False,
                    status="CONVERGED_CLEAN",
                )
                steps.append(step_record)
                termination_reason = decision.stopping_reason or "Dataset verified clean by agent."
                effective_status = "CONVERGED"
                break

            # Limit actions to max_actions_per_iteration
            chosen_actions = decision.selected_actions[:max_actions_per_iter]

            # Approval Layer (Phase 12)
            has_pending_approval = False
            step_pending = []
            safe_actions: List[CleaningActionPlan] = []

            for act in chosen_actions:
                risk_level, needs_approval = classify_action_risk(
                    act.action_type, act.parameters, act.target_columns
                )
                if effective_approval and needs_approval:
                    appr_rec = register_pending_approval(
                        dataset_id=dataset_id,
                        project_id=project_id,
                        action=act,
                        confidence=0.95,
                        rows_affected_est=current_shape.get("rows", 0) if "outlier" in act.action_type else 0,
                    )
                    step_pending.append(appr_rec)
                    has_pending_approval = True
                else:
                    safe_actions.append(act)

            if has_pending_approval:
                logger.info(
                    f"Iteration {iteration} paused for human approval of {len(step_pending)} high-risk actions."
                )
                all_pending_approvals.extend(step_pending)
                all_pending_safe_actions.extend([a.model_dump() for a in safe_actions])

                step_record = IterationStepReport(
                    iteration=iteration,
                    pre_shape=current_shape,
                    pre_quality_score=working_score,
                    issues_before_count=len(current_issues),
                    pre_issues_count=len(current_issues),
                    health_grade=decision.current_health_grade,
                    readiness_score=decision.readiness_score,
                    llm_assessment=decision.assessment,
                    is_dataset_clean=False,
                    stopping_reason="Paused for human approval of high-risk transformations.",
                    selected_actions=[a.model_dump() for a in chosen_actions],
                    executed_actions=[],
                    execution_results=[],
                    post_shape=current_shape,
                    post_quality_score=working_score,
                    quality_delta=0.0,
                    regression_detected=False,
                    rolled_back=False,
                    waiting_approval=True,
                    pending_approvals=step_pending,
                    pending_safe_actions=[a.model_dump() for a in safe_actions],
                    status="WAITING_APPROVAL",
                )
                steps.append(step_record)
                termination_reason = "Paused: High-risk actions awaiting user approval."
                effective_status = "WAITING_APPROVAL"
                break

            # Deterministic Execution with Polars
            df = _load_dataframe(working_bytes, "csv")
            exec_results = []
            for safe_act in safe_actions:
                df, act_res = apply_cleaning_action(df, safe_act, target_column)
                exec_results.append(act_res)

            candidate_bytes = df_to_csv_bytes(df)
            candidate_shape = {"rows": df.shape[0], "columns": df.shape[1]}

            # If no changes produced, handle stagnation
            if candidate_bytes == working_bytes:
                consecutive_stagnant += 1
                logger.info(
                    f"Iteration {iteration}: Actions resulted in identical dataset (stagnant count={consecutive_stagnant})."
                )
                step_record = IterationStepReport(
                    iteration=iteration,
                    pre_shape=current_shape,
                    pre_quality_score=working_score,
                    issues_before_count=len(current_issues),
                    pre_issues_count=len(current_issues),
                    health_grade=decision.current_health_grade,
                    readiness_score=decision.readiness_score,
                    llm_assessment=decision.assessment,
                    is_dataset_clean=False,
                    stopping_reason="Actions produced no changes to dataset.",
                    selected_actions=[a.model_dump() for a in chosen_actions],
                    executed_actions=[a.model_dump() for a in safe_actions],
                    execution_results=exec_results,
                    post_shape=candidate_shape,
                    post_quality_score=working_score,
                    quality_delta=0.0,
                    regression_detected=False,
                    rolled_back=False,
                    waiting_approval=False,
                    status="SKIPPED",
                )
                steps.append(step_record)
                if consecutive_stagnant >= self.config.stagnation_limit:
                    termination_reason = "Transformations produced no further changes to data."
                    break
                continue

            # Deterministic Re-Profiling of Candidate Dataset
            candidate_prof_obj = profile_dataset(
                dataset_id=dataset_id, file_bytes=candidate_bytes, file_type="csv"
            )
            candidate_profile = candidate_prof_obj.to_dict()

            # Multi-Metric Comparison (Phase 13)
            comparison = compare_profiles(
                old_profile=working_profile,
                new_profile=candidate_profile,
                target_column=target_column,
                dataset_id=dataset_id,
                version_before=f"iter_{iteration - 1}",
                version_after=f"iter_{iteration}",
            )
            candidate_score = comparison.quality_score_after.overall_score
            quality_delta = comparison.quality_score_delta

            # ── Self-Healing Regression Check & Rollback ───────────────
            if comparison.regression_detected:
                logger.warning(
                    f"Iteration {iteration} caused quality regression! Drop: {working_score:.1f} -> {candidate_score:.1f} "
                    f"({quality_delta:+.1f}). Reasons: {comparison.regression_reasons}. Triggering in-loop rollback."
                )
                reg_event = RegressionEvent(
                    iteration=iteration,
                    quality_score_before=working_score,
                    quality_score_regressed=candidate_score,
                    score_drop=round(working_score - candidate_score, 2),
                    reasons=comparison.regression_reasons,
                    actions_rolled_back=[a.model_dump() for a in safe_actions],
                )
                regression_history.append(reg_event)

                # Rollback candidate: working_bytes & working_profile remain unchanged!
                # Store feedback to inject into the LLM in the next iteration
                active_regression_notice = (
                    f"Iteration {iteration} action(s) {[a.action_type for a in safe_actions]} caused quality regression: "
                    f"{'; '.join(comparison.regression_reasons)}. Score dropped from {working_score:.1f} to {candidate_score:.1f}. "
                    "The bad transformation was ROLLED BACK. You MUST choose an alternative safe remediation."
                )

                step_record = IterationStepReport(
                    iteration=iteration,
                    pre_shape=current_shape,
                    pre_quality_score=working_score,
                    issues_before_count=len(current_issues),
                    pre_issues_count=len(current_issues),
                    health_grade=decision.current_health_grade,
                    readiness_score=decision.readiness_score,
                    llm_assessment=decision.assessment,
                    is_dataset_clean=False,
                    stopping_reason=f"Rolled back: {'; '.join(comparison.regression_reasons)}",
                    selected_actions=[a.model_dump() for a in chosen_actions],
                    executed_actions=[a.model_dump() for a in safe_actions],
                    execution_results=exec_results,
                    post_shape=current_shape,
                    post_quality_score=working_score,
                    quality_delta=quality_delta,
                    regression_detected=True,
                    rolled_back=True,
                    waiting_approval=False,
                    regression_event=reg_event,
                    comparison=comparison,
                    status="ROLLED_BACK",
                )
                steps.append(step_record)
                continue  # Loop continues, agent re-plans in next iteration!

            # No regression: Accept candidate dataset
            active_regression_notice = None
            working_bytes = candidate_bytes
            working_profile = candidate_profile

            if quality_delta <= 0:
                consecutive_stagnant += 1
            else:
                consecutive_stagnant = 0

            step_record = IterationStepReport(
                iteration=iteration,
                pre_shape=current_shape,
                pre_quality_score=working_score,
                issues_before_count=len(current_issues),
                pre_issues_count=len(current_issues),
                health_grade=decision.current_health_grade,
                readiness_score=decision.readiness_score,
                llm_assessment=decision.assessment,
                is_dataset_clean=False,
                stopping_reason=None,
                selected_actions=[a.model_dump() for a in chosen_actions],
                executed_actions=[a.model_dump() for a in safe_actions],
                execution_results=exec_results,
                post_shape=candidate_shape,
                post_quality_score=candidate_score,
                quality_delta=quality_delta,
                regression_detected=False,
                rolled_back=False,
                waiting_approval=False,
                comparison=comparison,
                status="EXECUTED",
            )
            steps.append(step_record)
            working_score = candidate_score

            if consecutive_stagnant >= self.config.stagnation_limit:
                termination_reason = "Quality plateaued with no further improvement."
                break

        # 3. Final Verification Profile
        final_profile_obj = profile_dataset(
            dataset_id=dataset_id, file_bytes=working_bytes, file_type="csv"
        )
        final_profile = final_profile_obj.to_dict()
        final_qs = calculate_quality_score(final_profile).overall_score
        final_issues_count = len(final_profile.get("issues", []))
        issues_resolved = max(0, initial_issues_count - final_issues_count)

        last_step = steps[-1] if steps else None
        final_grade = last_step.health_grade if last_step else ("A" if final_issues_count == 0 else "B+")
        final_readiness = last_step.readiness_score if last_step else int(final_qs)

        report = SelfHealingOrchestrationReport(
            dataset_id=dataset_id,
            task_type=task_type,
            target_column=target_column,
            status=effective_status,
            total_iterations=len(steps),
            total_llm_calls=llm_calls_used,
            total_rollbacks=len(regression_history),
            initial_quality_score=initial_score,
            final_quality_score=final_qs,
            overall_quality_improvement=round(final_qs - initial_score, 2),
            initial_issues_count=initial_issues_count,
            final_issues_count=final_issues_count,
            issues_resolved=issues_resolved,
            steps=steps,
            regression_history=regression_history,
            pending_approvals=all_pending_approvals,
            pending_safe_actions=all_pending_safe_actions,
            termination_reason=termination_reason,
            initial_metrics={
                "rows": initial_profile.get("shape", {}).get("rows", 0),
                "columns": initial_profile.get("shape", {}).get("columns", 0),
                "total_null_pct": initial_profile.get("total_null_pct", 0.0),
                "quality_score": initial_score,
                "issues_count": initial_issues_count,
            },
            final_metrics={
                "rows": final_profile.get("shape", {}).get("rows", 0),
                "columns": final_profile.get("shape", {}).get("columns", 0),
                "total_null_pct": final_profile.get("total_null_pct", 0.0),
                "quality_score": final_qs,
                "issues_count": final_issues_count,
                "health_grade": final_grade,
                "readiness_score": final_readiness,
            },
            cleaned_bytes=working_bytes,
            final_profile=final_profile,
        )

        logger.info(
            f"Self-Healing Loop completed: status={effective_status}, iters={len(steps)}, "
            f"rollbacks={len(regression_history)}, quality={initial_score:.1f} -> {final_qs:.1f} "
            f"({report.overall_quality_improvement:+.1f})"
        )

        return report


def run_self_healing_agent_loop(
    dataset_id: str,
    file_bytes: bytes,
    file_type: str = "csv",
    task_type: str = "GENERAL",
    target_column: Optional[str] = None,
    max_iterations: int = 5,
    project_id: Optional[str] = None,
    require_approval: bool = True,
    config: Optional[OrchestratorConfig] = None,
) -> SelfHealingOrchestrationReport:
    """Convenience runner function for the self-healing autonomous loop."""
    cfg = config or OrchestratorConfig(
        max_iterations=max_iterations,
        require_approval=require_approval,
    )
    orchestrator = SelfHealingOrchestrator(config=cfg)
    return orchestrator.run(
        dataset_id=dataset_id,
        file_bytes=file_bytes,
        file_type=file_type,
        task_type=task_type,
        target_column=target_column,
        project_id=project_id,
        require_approval=require_approval,
    )
