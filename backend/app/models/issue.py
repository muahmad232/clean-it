"""
Pydantic models for data quality issues — Phase 5.

Implements the 7 core deterministic issue types:
- MISSING_VALUES
- DUPLICATES
- CONSTANT_COLUMN
- NEAR_CONSTANT_COLUMN
- POSSIBLE_IDENTIFIER
- HIGH_CARDINALITY
- TYPE_MISMATCH
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class IssueType(str, Enum):
    MISSING_VALUES = "MISSING_VALUES"
    DUPLICATES = "DUPLICATES"
    CONSTANT_COLUMN = "CONSTANT_COLUMN"
    NEAR_CONSTANT_COLUMN = "NEAR_CONSTANT_COLUMN"
    POSSIBLE_IDENTIFIER = "POSSIBLE_IDENTIFIER"
    HIGH_CARDINALITY = "HIGH_CARDINALITY"
    TYPE_MISMATCH = "TYPE_MISMATCH"
    # Extensible for future phases:
    INVALID_RANGE = "INVALID_RANGE"
    OUTLIER = "OUTLIER"
    CLASS_IMBALANCE = "CLASS_IMBALANCE"
    TARGET_LEAKAGE = "TARGET_LEAKAGE"
    SCHEMA_VIOLATION = "SCHEMA_VIOLATION"
    DISTRIBUTION_SHIFT = "DISTRIBUTION_SHIFT"
    INVALID_CATEGORY = "INVALID_CATEGORY"
    DATE_PARSE_ERROR = "DATE_PARSE_ERROR"


class Severity(str, Enum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"


class IssueStatus(str, Enum):
    OPEN = "OPEN"
    RESOLVED = "RESOLVED"
    REJECTED = "REJECTED"
    IGNORED = "IGNORED"


class IssueBase(BaseModel):
    issue_type: IssueType
    column_name: Optional[str] = None
    severity: Severity
    confidence: float = Field(default=1.0, ge=0.0, le=1.0)
    description: str
    evidence_json: dict[str, Any] = Field(default_factory=dict)
    status: IssueStatus = IssueStatus.OPEN


class IssueCreate(IssueBase):
    """Payload to create an issue record."""
    dataset_id: UUID | str
    agent_run_id: Optional[UUID | str] = None


class Issue(IssueBase):
    """Full issue representation."""
    model_config = ConfigDict(from_attributes=True)

    id: UUID | str = Field(default_factory=uuid.uuid4)
    dataset_id: Optional[UUID | str] = None
    agent_run_id: Optional[UUID | str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    def to_dict(self) -> dict[str, Any]:
        """Convert to JSON-serializable dictionary."""
        return {
            "id": str(self.id),
            "dataset_id": str(self.dataset_id) if self.dataset_id else None,
            "agent_run_id": str(self.agent_run_id) if self.agent_run_id else None,
            "issue_type": self.issue_type.value,
            "column_name": self.column_name,
            "severity": self.severity.value,
            "confidence": round(self.confidence, 2),
            "description": self.description,
            "evidence_json": self.evidence_json,
            "status": self.status.value,
            "created_at": self.created_at.isoformat() if isinstance(self.created_at, datetime) else str(self.created_at),
        }


class IssueListResponse(BaseModel):
    dataset_id: str
    total_issues: int
    issues: list[dict[str, Any]]
