"""
Pydantic models for Dataset Versions & Reversible Rollback — Phase 11.
"""

from __future__ import annotations
from datetime import datetime, timezone
from typing import Any, Dict, Optional, Literal
from uuid import UUID
import uuid

from pydantic import BaseModel, Field, ConfigDict


class _Base(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class DatasetVersionCreate(BaseModel):
    """Payload to record a new dataset version snapshot."""
    dataset_id: str
    version_number: int
    storage_path: str
    parent_version_id: Optional[str] = None
    file_type: Literal["parquet", "csv", "json"] = "parquet"
    quality_score: Optional[float] = None
    metrics_json: Dict[str, Any] = Field(default_factory=dict)
    created_by_action: Optional[str] = "transformation"
    action_details: Dict[str, Any] = Field(default_factory=dict)
    is_current: bool = True


class DatasetVersion(_Base):
    """Full dataset version model."""
    id: str
    dataset_id: str
    version_number: int
    parent_version_id: Optional[str] = None
    storage_path: str
    file_type: str = "parquet"
    quality_score: Optional[float] = None
    metrics_json: Dict[str, Any] = Field(default_factory=dict)
    created_by_action: Optional[str] = None
    action_details: Dict[str, Any] = Field(default_factory=dict)
    is_current: bool = False
    created_at: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "dataset_id": self.dataset_id,
            "version_number": self.version_number,
            "parent_version_id": self.parent_version_id,
            "storage_path": self.storage_path,
            "file_type": self.file_type,
            "quality_score": self.quality_score,
            "metrics_json": self.metrics_json,
            "created_by_action": self.created_by_action,
            "action_details": self.action_details,
            "is_current": self.is_current,
            "created_at": self.created_at,
        }


class RollbackRequest(BaseModel):
    """Request payload to rollback a dataset to a parent or specific version."""
    target_version_id: Optional[str] = Field(
        default=None,
        description="Specific version UUID to restore. If omitted, rolls back to current parent version.",
    )
    reason: Optional[str] = Field(
        default="User requested manual rollback",
        description="Reason for rolling back",
    )


class RollbackResponse(BaseModel):
    """Result of rollback operation."""
    dataset_id: str
    rolled_back_to_version: int
    version_id: str
    storage_path: str
    metrics: Dict[str, Any] = Field(default_factory=dict)
    previous_version: Optional[int] = None
    current_version: Optional[int] = None
    target_version: Optional[Dict[str, Any]] = None
    final_profile: Optional[Dict[str, Any]] = None
    message: str
