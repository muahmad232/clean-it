"""
Phase 6 Tests — Task-Aware Data Cleaning Engine & Download Router.

Verifies:
1. Deterministic Polars Cleaning Engine:
   - Duplicates removal
   - Type mismatch casting (String numbers -> Float64)
   - Zero-variance constant column elimination
   - Catastrophic high-null column dropping (>70%)
   - Task-specific surrogate identifier dropping (preventing target leakage)
   - Numeric median imputation & Categorical imputation
   - Whitespace trimming
   - Protection of the target feature column
2. FastAPI Endpoint Integration:
   - POST /api/v1/projects/{project_id}/datasets/{dataset_id}/clean
   - GET  /api/v1/projects/{project_id}/datasets/{dataset_id}/download

Run with:
    pytest tests/test_phase6_cleaner.py -v
"""

import io
import csv
import json
import pytest
import polars as pl
from fastapi.testclient import TestClient

from app.main import app
from app.services.cleaner import clean_dataset

client = TestClient(app)


# ══════════════════════════════════════════════════════════════════
# UNIT TESTS (PURE POLARS — NO NETWORK)
# ══════════════════════════════════════════════════════════════════

def test_cleaner_removes_duplicates():
    csv_data = (
        "id,feature,val\n"
        "1,A,10\n"
        "1,A,10\n"  # duplicate
        "2,B,20\n"
        "2,B,20\n"  # duplicate
        "3,C,30\n"
    ).encode("utf-8")

    cleaned_bytes, report = clean_dataset(csv_data, file_type="csv", task_type="GENERAL")
    assert report["before_shape"]["rows"] == 5
    assert report["after_shape"]["rows"] == 3
    assert report["duplicates_removed"] == 2


def test_cleaner_casts_string_numbers_and_imputes():
    csv_data = (
        "id,amount_str\n"
        "1,\"10.50\"\n"
        "2,\"20.00\"\n"
        "3,\"30.50\"\n"
        "4,\"40.00\"\n"
        "5,\"50.00\"\n"
        "6,\"\"\n"  # blank string
    ).encode("utf-8")

    cleaned_bytes, report = clean_dataset(csv_data, file_type="csv", task_type="GENERAL")
    assert any("amount_str" in tc for tc in report["type_casts"])
    assert "amount_str" in report["imputed_nulls"]

    # Verify output can be scanned and amount_str is float
    df_clean = pl.read_csv(cleaned_bytes)
    assert df_clean["amount_str"].dtype in (pl.Float32, pl.Float64)
    assert df_clean["amount_str"].null_count() == 0


def test_cleaner_drops_constant_columns():
    csv_data = (
        "id,constant_col,varying_col\n"
        "1,STATIC,100\n"
        "2,STATIC,200\n"
        "3,STATIC,300\n"
    ).encode("utf-8")

    cleaned_bytes, report = clean_dataset(csv_data, file_type="csv", task_type="GENERAL")
    assert "constant_col" in report["constant_columns_dropped"]
    df_clean = pl.read_csv(cleaned_bytes)
    assert "constant_col" not in df_clean.columns
    assert "varying_col" in df_clean.columns


def test_cleaner_drops_catastrophic_null_columns():
    csv_data = (
        "id,mostly_null,good_col\n"
        "1,,10\n"
        "2,,20\n"
        "3,,30\n"
        "4,VALUE,40\n"  # 3/4 = 75% null -> >70%
    ).encode("utf-8")

    cleaned_bytes, report = clean_dataset(csv_data, file_type="csv", task_type="GENERAL")
    assert any("mostly_null" in col for col in report["high_null_columns_dropped"])
    df_clean = pl.read_csv(cleaned_bytes)
    assert "mostly_null" not in df_clean.columns
    assert "good_col" in df_clean.columns


def test_cleaner_classification_drops_surrogate_identifiers():
    # 100% unique string identifier should be dropped in CLASSIFICATION to prevent leakage
    csv_data = (
        "user_uuid,PassengerId,age,target\n"
        "u-101,1,25,0\n"
        "u-102,2,30,1\n"
        "u-103,3,35,0\n"
        "u-104,4,40,1\n"
        "u-105,5,45,0\n"
    ).encode("utf-8")

    cleaned_bytes, report = clean_dataset(
        csv_data,
        file_type="csv",
        task_type="CLASSIFICATION",
        target_column="target",
    )
    assert "user_uuid" in report["identifiers_dropped"]
    assert "PassengerId" in report["identifiers_dropped"]

    df_clean = pl.read_csv(cleaned_bytes)
    assert "user_uuid" not in df_clean.columns
    assert "PassengerId" not in df_clean.columns
    assert "age" in df_clean.columns
    assert "target" in df_clean.columns  # protected target column


def test_cleaner_protects_target_column_even_if_constant():
    csv_data = (
        "id,target\n"
        "1,1\n"
        "2,1\n"
        "3,1\n"
    ).encode("utf-8")

    cleaned_bytes, report = clean_dataset(
        csv_data,
        file_type="csv",
        task_type="CLASSIFICATION",
        target_column="target",
    )
    df_clean = pl.read_csv(cleaned_bytes)
    assert "target" in df_clean.columns
