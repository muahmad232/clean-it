"""
Phase 17 — ML-Aware Evaluation Router.

Endpoints for evaluating machine-learning readiness and model performance deltas
(RandomForest, Linear Regression, Logistic Regression) before and after cleaning.
Enforces strict 80/20 train/test split isolation to prevent data leakage.
"""

from __future__ import annotations

from typing import Optional
from fastapi import APIRouter, HTTPException, Query, status

from app.agent.evaluator import evaluate_dataset_ml_benchmark
from app.core.logging import get_logger
from app.database.repositories.datasets import get_dataset, update_dataset_profile
from app.models.ml_eval import MLEvaluationReport, MLEvaluationRequest
from app.storage.supabase import download_file

logger = get_logger(__name__)

router = APIRouter(tags=["ML-Aware Evaluation (Phase 17)"])


@router.post(
    "/api/v1/projects/{project_id}/datasets/{dataset_id}/evaluate-ml",
    response_model=MLEvaluationReport,
    summary="Benchmark ML model performance before and after cleaning",
)
def evaluate_project_dataset_ml(
    project_id: str,
    dataset_id: str,
    payload: Optional[MLEvaluationRequest] = None,
):
    """
    Evaluate ML performance on held-out test split.
    Compares raw uncleaned dataset against cleaned dataset version.
    """
    dataset = get_dataset(dataset_id)
    if not dataset or dataset.get("project_id") != project_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "dataset_not_found", "message": f"Dataset '{dataset_id}' not found."},
        )

    profile_json = dataset.get("profile_json") or {}
    req_body = payload or MLEvaluationRequest()

    target_column = req_body.target_column or dataset.get("target_column") or profile_json.get("target_column")
    task_type = (
        req_body.task_type
        or profile_json.get("detailed_task_type")
        or profile_json.get("task_type")
        or dataset.get("task_type")
        or "REGRESSION"
    )

    if not target_column:
        return MLEvaluationReport(
            task_type=task_type,
            target_column="",
            model_name="N/A",
            status="SKIPPED",
            skip_reason="No target column specified. Specify a target column to run ML evaluation.",
        )

    raw_path = dataset.get("storage_path")
    cleaned_path = profile_json.get("cleaned_storage_path")

    if not raw_path:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "raw_file_missing", "message": "Original dataset file not found in storage."},
        )

    try:
        raw_bytes = download_file(raw_path)
    except Exception as exc:
        logger.error(f"Failed to download raw dataset {raw_path}: {exc}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"error": "download_failed", "message": f"Failed to download raw file: {exc}"},
        )

    # If cleaned path exists, download cleaned bytes; otherwise evaluate raw as baseline
    cleaned_bytes = None
    if cleaned_path:
        try:
            cleaned_bytes = download_file(cleaned_path)
        except Exception as exc:
            logger.warning(f"Could not download cleaned file {cleaned_path}: {exc}. Using raw file.")
            cleaned_bytes = raw_bytes
    else:
        cleaned_bytes = raw_bytes

    report = evaluate_dataset_ml_benchmark(
        raw_data=raw_bytes,
        cleaned_data=cleaned_bytes,
        target_column=target_column,
        task_type=task_type,
        test_size=req_body.test_size,
        random_state=req_body.random_state,
    )

    # Persist evaluation result into profile metadata
    if report.status == "SUCCESS":
        try:
            profile_json["ml_evaluation"] = report.model_dump()
            profile_json["target_column"] = target_column
            profile_json["detailed_task_type"] = task_type
            update_dataset_profile(dataset_id, profile_json)
        except Exception as exc:
            logger.debug(f"Could not persist ML evaluation to dataset profile: {exc}")

    return report


@router.post(
    "/api/v1/datasets/{dataset_id}/evaluate-ml",
    response_model=MLEvaluationReport,
    summary="Benchmark ML model performance (direct)",
)
def evaluate_direct_dataset_ml(
    dataset_id: str,
    payload: Optional[MLEvaluationRequest] = None,
):
    """Direct route for benchmarking dataset ML performance."""
    dataset = get_dataset(dataset_id)
    if not dataset:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "dataset_not_found", "message": f"Dataset '{dataset_id}' not found."},
        )
    return evaluate_project_dataset_ml(
        project_id=dataset["project_id"],
        dataset_id=dataset_id,
        payload=payload,
    )


@router.get(
    "/api/v1/projects/{project_id}/datasets/{dataset_id}/evaluation",
    summary="Retrieve latest ML evaluation report",
)
def get_project_dataset_evaluation(project_id: str, dataset_id: str):
    """Fetch cached ML evaluation report from dataset profile metadata."""
    dataset = get_dataset(dataset_id)
    if not dataset or dataset.get("project_id") != project_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "dataset_not_found", "message": f"Dataset '{dataset_id}' not found."},
        )
    profile_json = dataset.get("profile_json") or {}
    ml_eval = profile_json.get("ml_evaluation")
    if not ml_eval:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "evaluation_not_found", "message": "No ML evaluation has been run for this dataset yet."},
        )
    return ml_eval


@router.get(
    "/api/v1/datasets/{dataset_id}/evaluation",
    summary="Retrieve latest ML evaluation report (direct)",
)
def get_direct_dataset_evaluation(dataset_id: str):
    """Direct route to fetch cached ML evaluation report."""
    dataset = get_dataset(dataset_id)
    if not dataset:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "dataset_not_found", "message": f"Dataset '{dataset_id}' not found."},
        )
    return get_project_dataset_evaluation(project_id=dataset["project_id"], dataset_id=dataset_id)
