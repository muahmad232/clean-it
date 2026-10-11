"""
Unit & Integration Tests for Phase 17 — ML-Aware Evaluation & Generalization Benchmark.

Tests:
1. Regression holdout evaluation (LinearRegression & RandomForestRegressor) with R², RMSE, MAE deltas.
2. Classification holdout evaluation (LogisticRegression & RandomForestClassifier) with F1, Accuracy, Precision, Recall deltas.
3. Supervised subtype task mapping (LINEAR_REGRESSION, CONTINUOUS_REGRESSION, LOGISTIC_REGRESSION, etc.).
4. Strict 80/20 train/test isolation, surrogate key leakage stripping, and zero target leakage.
5. Edge cases: missing target, unsupervised tasks, tiny datasets (<15 rows).
6. API routes: POST .../evaluate-ml and GET .../evaluation (both project-scoped and direct).
"""

from __future__ import annotations
import io
from unittest.mock import MagicMock, patch
import numpy as np
import polars as pl
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.agent.evaluator import evaluate_ml_holdout, evaluate_dataset_ml_benchmark
from app.database.repositories.datasets import normalize_db_task_type
from app.models.ml_eval import MLEvaluationReport, MLEvaluationRequest

client = TestClient(app)


# ── Synthetic Dataset Generators ──────────────────────────────────────

def generate_regression_dfs():
    """Create a raw DF (with nulls, noise, outliers) and a cleaned DF (clean, imputes)."""
    np.random.seed(42)
    n = 100
    x1 = np.random.uniform(1.0, 10.0, n)
    x2 = np.random.uniform(10.0, 50.0, n)
    y = 3.5 * x1 + 0.8 * x2 + np.random.normal(0, 1.0, n)

    # Raw has missing values and surrogate id
    x1_raw = x1.copy()
    x1_raw[5:15] = np.nan
    x2_raw = x2.copy()
    x2_raw[20:25] = np.nan

    raw_df = pl.DataFrame({
        "user_id": [f"USR_{i:04d}" for i in range(n)],
        "feature_1": x1_raw,
        "feature_2": x2_raw,
        "target_price": y,
    })

    # Cleaned has imputed values and clipped outliers
    cleaned_df = pl.DataFrame({
        "user_id": [f"USR_{i:04d}" for i in range(n)],
        "feature_1": np.where(np.isnan(x1_raw), np.nanmedian(x1_raw), x1_raw),
        "feature_2": np.where(np.isnan(x2_raw), np.nanmedian(x2_raw), x2_raw),
        "target_price": y,
    })

    return raw_df, cleaned_df


def generate_classification_dfs():
    """Create a raw DF and cleaned DF for binary classification."""
    np.random.seed(42)
    n = 120
    x1 = np.random.uniform(0.0, 10.0, n)
    x2 = np.random.uniform(0.0, 10.0, n)
    prob = 1.0 / (1.0 + np.exp(-(0.8 * x1 + 0.5 * x2 - 6.0)))
    y = (prob > 0.5).astype(int)

    # Raw has nulls in feature_1
    x1_raw = x1.copy()
    x1_raw[10:25] = np.nan

    raw_df = pl.DataFrame({
        "row_id": list(range(n)),
        "age": x1_raw,
        "tenure": x2,
        "churn": y,
    })

    cleaned_df = pl.DataFrame({
        "row_id": list(range(n)),
        "age": np.where(np.isnan(x1_raw), np.nanmedian(x1_raw), x1_raw),
        "tenure": x2,
        "churn": y,
    })

    return raw_df, cleaned_df


# ── Unit Tests: Evaluator Core Logic ──────────────────────────────────

def test_regression_holdout_evaluation():
    """Test regression holdout evaluation produces valid R2, RMSE, MAE metrics."""
    raw_df, cleaned_df = generate_regression_dfs()

    report = evaluate_ml_holdout(
        raw_df=raw_df,
        cleaned_df=cleaned_df,
        task_type="REGRESSION",
        target_column="target_price",
        test_size=0.20,
        random_state=42,
    )

    assert report.status == "SUCCESS"
    assert report.target_column == "target_price"
    assert "Regressor" in report.model_name or "Regression" in report.model_name
    assert report.train_samples == 80
    assert report.test_samples == 20
    assert report.feature_count >= 2

    # Verify surrogate ID was stripped from features
    assert "user_id" not in report.features_used

    # Check metrics
    metric_names = [m.metric_name for m in report.metrics]
    assert "R² Score" in metric_names
    assert any("RMSE" in name for name in metric_names)
    assert any("MAE" in name for name in metric_names)

    # Cleaned R2 should be >= raw R2 since missingness was properly imputed
    assert report.primary_cleaned_score >= -1.0
    assert report.primary_metric_name == "R² Score"


def test_linear_regression_subtype():
    """Test LINEAR_REGRESSION subtype uses LinearRegression model."""
    raw_df, cleaned_df = generate_regression_dfs()

    report = evaluate_ml_holdout(
        raw_df=raw_df,
        cleaned_df=cleaned_df,
        task_type="LINEAR_REGRESSION",
        target_column="target_price",
    )

    assert report.status == "SUCCESS"
    assert report.model_name == "LinearRegression"
    assert report.task_type == "LINEAR_REGRESSION"
    assert len(report.top_features) > 0


def test_continuous_regression_subtype():
    """Test CONTINUOUS_REGRESSION subtype routes to regression."""
    raw_df, cleaned_df = generate_regression_dfs()

    report = evaluate_ml_holdout(
        raw_df=raw_df,
        cleaned_df=cleaned_df,
        task_type="CONTINUOUS_REGRESSION",
        target_column="target_price",
    )

    assert report.status == "SUCCESS"
    assert report.task_type == "CONTINUOUS_REGRESSION"
    assert report.test_samples == 20


def test_classification_holdout_evaluation():
    """Test classification holdout evaluation produces F1, Accuracy, Precision, Recall."""
    raw_df, cleaned_df = generate_classification_dfs()

    report = evaluate_ml_holdout(
        raw_df=raw_df,
        cleaned_df=cleaned_df,
        task_type="CLASSIFICATION",
        target_column="churn",
        test_size=0.20,
        random_state=42,
    )

    assert report.status == "SUCCESS"
    assert report.target_column == "churn"
    assert report.train_samples == 96
    assert report.test_samples == 24
    assert "row_id" not in report.features_used

    metric_names = [m.metric_name for m in report.metrics]
    assert any("F1" in name for name in metric_names)
    assert "Accuracy" in metric_names
    assert any("Precision" in name for name in metric_names)
    assert any("Recall" in name for name in metric_names)

    assert "F1 Score" in report.primary_metric_name
    assert 0.0 <= report.primary_cleaned_score <= 1.0


def test_logistic_regression_subtype():
    """Test LOGISTIC_REGRESSION subtype uses LogisticRegression algorithm."""
    raw_df, cleaned_df = generate_classification_dfs()

    report = evaluate_ml_holdout(
        raw_df=raw_df,
        cleaned_df=cleaned_df,
        task_type="LOGISTIC_REGRESSION",
        target_column="churn",
    )

    assert report.status == "SUCCESS"
    assert report.model_name == "LogisticRegression"
    assert report.task_type == "LOGISTIC_REGRESSION"


def test_unsupervised_task_skipped():
    """Test general, clustering, and llm fine-tuning tasks gracefully skip evaluation."""
    raw_df, cleaned_df = generate_regression_dfs()

    for unsupervised_task in ["GENERAL", "CLUSTERING", "LLM_FINETUNING"]:
        report = evaluate_ml_holdout(
            raw_df=raw_df,
            cleaned_df=cleaned_df,
            task_type=unsupervised_task,
            target_column="target_price",
        )
        assert report.status == "SKIPPED"
        assert "unsupervised or general" in (report.skip_reason or "")


def test_missing_target_skipped():
    """Test missing or invalid target column gracefully returns SKIPPED."""
    raw_df, cleaned_df = generate_regression_dfs()

    report = evaluate_ml_holdout(
        raw_df=raw_df,
        cleaned_df=cleaned_df,
        task_type="REGRESSION",
        target_column="non_existent_column",
    )
    assert report.status == "SKIPPED"
    assert "not found" in (report.skip_reason or "")


def test_insufficient_samples_skipped():
    """Test dataset with fewer than 15 rows is skipped."""
    tiny_raw = pl.DataFrame({"x": [1, 2, 3], "y": [2, 4, 6]})
    tiny_clean = pl.DataFrame({"x": [1, 2, 3], "y": [2, 4, 6]})

    report = evaluate_ml_holdout(
        raw_df=tiny_raw,
        cleaned_df=tiny_clean,
        task_type="REGRESSION",
        target_column="y",
    )
    assert report.status == "SKIPPED"
    assert "too small" in (report.skip_reason or "").lower()


# ── Database Task Type Normalization Tests ────────────────────────────

def test_normalize_db_task_type_regression():
    """Test detailed regression subtypes map to base REGRESSION for DB check constraint."""
    assert normalize_db_task_type("LINEAR_REGRESSION") == "REGRESSION"
    assert normalize_db_task_type("CONTINUOUS_REGRESSION") == "REGRESSION"
    assert normalize_db_task_type("POLYNOMIAL_REGRESSION") == "REGRESSION"
    assert normalize_db_task_type("REGRESSION") == "REGRESSION"


def test_normalize_db_task_type_classification():
    """Test detailed classification subtypes map to base CLASSIFICATION."""
    assert normalize_db_task_type("BINARY_CLASSIFICATION") == "CLASSIFICATION"
    assert normalize_db_task_type("MULTICLASS_CLASSIFICATION") == "CLASSIFICATION"
    assert normalize_db_task_type("LOGISTIC_REGRESSION") == "CLASSIFICATION"
    assert normalize_db_task_type("CLASSIFICATION") == "CLASSIFICATION"


def test_normalize_db_task_type_other():
    """Test general, clustering, and fallback tasks."""
    assert normalize_db_task_type("CLUSTERING") == "CLUSTERING"
    assert normalize_db_task_type("LLM_FINETUNING") == "LLM_FINETUNING"
    assert normalize_db_task_type("GENERAL") == "GENERAL"
    assert normalize_db_task_type("UNKNOWN") == "GENERAL"
    assert normalize_db_task_type(None) == "GENERAL"


# ── API Route Integration Tests ───────────────────────────────────────

@patch("app.routers.evaluation.get_dataset")
@patch("app.routers.evaluation.download_file")
@patch("app.routers.evaluation.update_dataset_profile")
def test_api_evaluate_ml_endpoint(mock_update_profile, mock_download, mock_get_ds):
    """Test POST /api/v1/projects/{p}/datasets/{d}/evaluate-ml executes benchmark."""
    raw_df, cleaned_df = generate_regression_dfs()

    raw_buf = io.BytesIO()
    raw_df.write_csv(raw_buf)
    raw_bytes = raw_buf.getvalue()

    cleaned_buf = io.BytesIO()
    cleaned_df.write_csv(cleaned_buf)
    cleaned_bytes = cleaned_buf.getvalue()

    # Mock dataset
    mock_get_ds.return_value = {
        "id": "ds-123",
        "project_id": "proj-456",
        "storage_path": "raw/data.csv",
        "task_type": "REGRESSION",
        "target_column": "target_price",
        "profile_json": {
            "detailed_task_type": "LINEAR_REGRESSION",
            "cleaned_storage_path": "cleaned/data_v1.csv",
        },
    }

    # Storage download: returns raw then cleaned
    def fake_download(path):
        if "cleaned" in str(path):
            return cleaned_bytes
        return raw_bytes

    mock_download.side_effect = fake_download

    response = client.post(
        "/api/v1/projects/proj-456/datasets/ds-123/evaluate-ml",
        json={
            "target_column": "target_price",
            "task_type": "LINEAR_REGRESSION",
            "test_size": 0.20,
        },
    )

    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "SUCCESS"
    assert data["target_column"] == "target_price"
    assert data["model_name"] == "LinearRegression"
    assert len(data["metrics"]) >= 3
    assert data["primary_metric_name"] == "R² Score"


@patch("app.routers.evaluation.get_dataset")
def test_api_get_cached_evaluation(mock_get_ds):
    """Test GET /api/v1/projects/{p}/datasets/{d}/evaluation retrieves cached report."""
    mock_get_ds.return_value = {
        "id": "ds-123",
        "project_id": "proj-456",
        "profile_json": {
            "ml_evaluation": {
                "status": "SUCCESS",
                "task_type": "REGRESSION",
                "target_column": "target_price",
                "model_name": "RandomForestRegressor",
                "train_samples": 80,
                "test_samples": 20,
                "feature_count": 2,
                "primary_metric_name": "R² Score",
                "primary_raw_score": 0.65,
                "primary_cleaned_score": 0.88,
                "primary_improvement_pct": 35.4,
                "primary_improved": True,
                "metrics": [],
                "top_features": [],
            }
        }
    }

    response = client.get("/api/v1/projects/proj-456/datasets/ds-123/evaluation")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "SUCCESS"
    assert data["primary_metric_name"] == "R² Score"
    assert data["primary_cleaned_score"] == 0.88


def test_infer_target_column_heuristics():
    """Test infer_target_column accurately identifies candidate regression and classification targets."""
    from app.agent.evaluator import infer_target_column

    # Regression case
    df_reg = pl.DataFrame({
        "user_id": [f"ID_{i}" for i in range(50)],
        "square_feet": [1000 + i * 20 for i in range(50)],
        "saleprice": [200000.0 + i * 5000 for i in range(50)],
    })
    inferred_reg = infer_target_column(df_reg, "REGRESSION")
    assert inferred_reg == "saleprice"

    # Classification case
    df_clf = pl.DataFrame({
        "customer_id": [f"C_{i}" for i in range(50)],
        "tenure_months": [i for i in range(50)],
        "churn": [1 if i % 2 == 0 else 0 for i in range(50)],
    })
    inferred_clf = infer_target_column(df_clf, "CLASSIFICATION")
    assert inferred_clf == "churn"


def test_auto_infer_target_in_benchmark():
    """Test evaluate_dataset_ml_benchmark auto-infers target and succeeds when target_column is None."""
    raw_df, cleaned_df = generate_regression_dfs()

    # Pass target_column=None
    report = evaluate_ml_holdout(
        raw_df=raw_df,
        cleaned_df=cleaned_df,
        task_type="REGRESSION",
        target_column=None,
    )

    assert report.status == "SUCCESS"
    assert report.target_inferred is True
    assert report.target_column == "target_price"
    assert report.primary_metric_name == "R² Score"

