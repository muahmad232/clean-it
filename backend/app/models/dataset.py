"""
Pydantic models for projects and datasets.

These are used as:
  - API request/response schemas
  - Internal data transfer objects

The DB schema lives in migrations/001_initial_schema.sql.
All tables are in the 'data_agent' schema.
"""

from __future__ import annotations
from datetime import datetime
from typing import Optional, Literal
from uuid import UUID
import uuid

from pydantic import BaseModel, Field, ConfigDict


# ── Shared config ─────────────────────────────────────────────────
class _Base(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# ══════════════════════════════════════════════════════════════════
# PROJECT
# ══════════════════════════════════════════════════════════════════

class ProjectCreate(BaseModel):
    """Payload for creating a new project."""
    name: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = Field(default=None, max_length=1000)


class Project(_Base):
    """Full project record as returned from the database."""
    id: UUID
    user_id: UUID
    name: str
    description: Optional[str]
    created_at: datetime
    updated_at: datetime


class ProjectList(_Base):
    """Lightweight project summary for list views."""
    id: UUID
    name: str
    description: Optional[str]
    created_at: datetime


# ══════════════════════════════════════════════════════════════════
# DATASET
# ══════════════════════════════════════════════════════════════════

TaskType = Literal["GENERAL", "CLASSIFICATION", "REGRESSION", "CLUSTERING", "LLM_FINETUNING"]
DatasetStatus = Literal["PENDING_UPLOAD", "UPLOADED", "PROCESSING", "COMPLETED", "FAILED"]
FileType = Literal["csv", "json", "parquet"]


class DatasetCreate(BaseModel):
    """Payload for registering a new dataset (before file is uploaded)."""
    original_filename: str = Field(..., min_length=1, max_length=500)
    file_type: FileType = Field(default="csv")
    file_size: Optional[int] = Field(default=None, ge=0)
    task_type: TaskType = Field(default="GENERAL")
    target_column: Optional[str] = Field(default=None)


class Dataset(_Base):
    """Full dataset record as returned from the database."""
    id: UUID
    project_id: UUID
    original_filename: str
    storage_path: Optional[str]
    file_type: str
    file_size: Optional[int]
    row_count: Optional[int]
    column_count: Optional[int]
    task_type: str
    target_column: Optional[str]
    status: str
    created_at: datetime
    updated_at: datetime


class DatasetList(_Base):
    """Lightweight dataset summary for list views."""
    id: UUID
    original_filename: str
    file_type: str
    file_size: Optional[int]
    status: str
    created_at: datetime
