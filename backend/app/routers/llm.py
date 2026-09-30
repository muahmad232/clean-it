"""
LLM Diagnostics and Integration Endpoints — Phase 7.
"""

from __future__ import annotations
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

from app.core.config import get_settings
from app.llm import get_llm_provider, LLMError

router = APIRouter(prefix="/api/v1/llm", tags=["LLM Engine"])


class SampleDatasetAnalysis(BaseModel):
    """Structured response model for testing LLM integration."""
    dataset_summary: str = Field(..., description="High-level evaluation of dataset cleanliness")
    primary_defect: str = Field(..., description="The most pressing defect discovered")
    suggested_strategy: str = Field(..., description="Recommended data engineering action")
    confidence_score: float = Field(..., ge=0.0, le=1.0)


class ProfileAnalysisRequest(BaseModel):
    """Payload for requesting LLM insights on a profiled dataset."""
    dataset_name: Optional[str] = "Dataset"
    task_type: Optional[str] = "GENERAL"
    row_count: Optional[int] = 0
    column_count: Optional[int] = 0
    duplicate_rows: Optional[int] = 0
    llm_summary: Optional[str] = None
    issues: Optional[List[Dict[str, Any]]] = None


class DefectEvaluation(BaseModel):
    defect_title: str = Field(..., description="Short title of the defect, e.g. Missing Values in Age")
    severity: str = Field(..., description="LOW, MEDIUM, HIGH, or CRITICAL")
    impact_explanation: str = Field(..., description="Why this defect harms downstream models or analysis")
    recommended_action: str = Field(..., description="Concrete data engineering action to resolve the defect")


class DatasetAiInsights(BaseModel):
    health_grade: str = Field(..., description="Letter grade: A+, A, B, C, D, or F")
    readiness_score: int = Field(..., ge=0, le=100, description="Readiness percentage 0 to 100")
    executive_summary: str = Field(..., description="2-3 sentence executive assessment of dataset quality")
    primary_risks: List[str] = Field(default_factory=list, description="Top 2-3 risks to downstream models or analysis")
    defect_evaluations: List[DefectEvaluation] = Field(default_factory=list, description="Evaluations of key defects")
    cleaning_strategy: str = Field(..., description="Step-by-step cleaning recommendations")


class ProfileAnalysisResponse(BaseModel):
    insights: DatasetAiInsights
    model: str
    provider: str


SampleDatasetAnalysis.model_rebuild()
ProfileAnalysisRequest.model_rebuild()
DefectEvaluation.model_rebuild()
DatasetAiInsights.model_rebuild()
ProfileAnalysisResponse.model_rebuild()



@router.get("/health", summary="Check LLM Provider configuration and token stats")
def get_llm_health():
    """Return current LLM configuration and cumulative token stats."""
    settings = get_settings()
    provider = get_llm_provider()
    configured = bool(settings.groq_api_key)
    stats = provider.get_token_stats()

    return {
        "provider": "GroqProvider",
        "model": settings.groq_model,
        "api_key_configured": configured,
        "token_stats": stats,
    }


@router.post(
    "/test",
    summary="Test Groq structured response with fixed compact profile",
    response_model=SampleDatasetAnalysis,
)
def test_llm_structured():
    """
    Test Groq structured reasoning on a fixed compact dataset profile
    as mandated by Phase 7 of the Master Plan.
    """
    provider = get_llm_provider()

    sample_compact_profile = {
        "rows": 1000,
        "columns": 5,
        "duplicate_rows": 24,
        "columns_summary": {
            "customer_id": {"type": "string", "missing_pct": 0.0, "unique_ratio": 0.97},
            "age": {"type": "integer", "missing_pct": 12.5, "min": -5, "max": 180},
            "monthly_spend": {"type": "float", "missing_pct": 0.0, "outliers_detected": 8},
        },
        "target": {"column": "churn", "distribution": {"0": 0.92, "1": 0.08}},
    }

    messages = [
        {
            "role": "system",
            "content": "You are an expert autonomous data-engineering agent. Analyze the provided dataset profile and return structured recommendations.",
        },
        {
            "role": "user",
            "content": f"Compact Profile:\n{sample_compact_profile}",
        },
    ]

    try:
        result = provider.generate_structured(
            messages=messages,
            response_schema=SampleDatasetAnalysis,
            temperature=0.1,
            max_tokens=600,
        )
        return result
    except LLMError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail={"error": "llm_error", "message": str(exc)},
        )


@router.post(
    "/analyze",
    summary="Analyze dataset statistical fingerprint and issues with Groq LLM",
    response_model=ProfileAnalysisResponse,
)
def analyze_dataset_profile(payload: ProfileAnalysisRequest):
    """
    Generate structured AI diagnostics, defect impact reasoning,
    and a prioritized cleaning strategy using Groq LLM.
    """
    settings = get_settings()
    provider = get_llm_provider()

    # Format top quality issues concisely to preserve prompt tokens
    issues_snippet = ""
    if payload.issues:
        top_issues = payload.issues[:8]
        formatted = [
            f"- [{i.get('severity', 'MEDIUM')}] {i.get('issue_type', 'DEFECT')}: {i.get('column_name', 'all')} - {i.get('description', '')}"
            for i in top_issues
        ]
        issues_snippet = "\n".join(formatted)

    messages = [
        {
            "role": "system",
            "content": (
                "You are an expert autonomous data-engineering agent. "
                "Analyze the provided compact statistical fingerprint and quality defect list for the dataset. "
                "Provide a rigorous, structured assessment: evaluate dataset health, explain the impact of defects "
                "on downstream ML/analytics, and outline prioritized, actionable cleaning strategies. "
                "Return only valid JSON strictly matching the schema."
            ),
        },
        {
            "role": "user",
            "content": (
                f"Dataset Name: {payload.dataset_name}\n"
                f"Target Task: {payload.task_type}\n"
                f"Dimensions: {payload.row_count} rows, {payload.column_count} columns, {payload.duplicate_rows} duplicate rows\n\n"
                f"Statistical Fingerprint:\n{payload.llm_summary or 'No statistical summary available.'}\n\n"
                f"Quality Issues Detected:\n{issues_snippet or 'No quality issues detected.'}\n\n"
                "Evaluate dataset health, score readiness (0-100), identify top risks, and recommend a cleaning plan."
            ),
        },
    ]

    try:
        insights = provider.generate_structured(
            messages=messages,
            response_schema=DatasetAiInsights,
            temperature=0.1,
            max_tokens=800,
        )
        return ProfileAnalysisResponse(
            insights=insights,
            model=settings.groq_model,
            provider="Groq LPU",
        )
    except LLMError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail={"error": "llm_error", "message": str(exc)},
        )

