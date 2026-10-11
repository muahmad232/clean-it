"""
LLM Diagnostics and Integration Endpoints — Phase 7.
"""

from __future__ import annotations
import logging
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field, model_validator

from app.core.config import get_settings
from app.llm import get_llm_provider, LLMError
from app.llm.base import LLMValidationError

logger = logging.getLogger(__name__)

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
    defect_title: str = Field(default="Data Quality Defect", description="Short title of the defect, e.g. Missing Values in Age")
    severity: str = Field(default="MEDIUM", description="LOW, MEDIUM, HIGH, or CRITICAL")
    impact_explanation: str = Field(
        default="Potential degradation of downstream model accuracy or data consistency.",
        description="Why this defect harms downstream models or analysis",
    )
    recommended_action: str = Field(
        default="Apply standard cleaning transformation to resolve anomaly.",
        description="Concrete data engineering action to resolve the defect",
    )

    @model_validator(mode="before")
    @classmethod
    def normalize_fields(cls, data: Any) -> Any:
        if isinstance(data, dict):
            if not data.get("defect_title"):
                data["defect_title"] = data.get("title") or data.get("defect") or data.get("issue") or data.get("name") or "Quality Defect"
            if not data.get("severity"):
                data["severity"] = data.get("level") or data.get("priority") or "MEDIUM"
            if not data.get("impact_explanation"):
                data["impact_explanation"] = data.get("impact") or data.get("explanation") or data.get("reason") or "Potential impact on model quality."
            if not data.get("recommended_action"):
                data["recommended_action"] = data.get("recommendation") or data.get("action") or data.get("suggested_action") or "Review and clean column."
        return data


class DatasetAiInsights(BaseModel):
    health_grade: str = Field(default="B", description="Letter grade: A+, A, B, C, D, or F")
    readiness_score: int = Field(default=80, ge=0, le=100, description="Readiness percentage 0 to 100")
    executive_summary: str = Field(
        default="Dataset assessment completed with identified quality defects.",
        description="2-3 sentence executive assessment of dataset quality",
    )
    primary_risks: List[str] = Field(default_factory=list, description="Top 2-3 risks to downstream models or analysis")
    defect_evaluations: List[DefectEvaluation] = Field(default_factory=list, description="Evaluations of key defects")
    cleaning_strategy: str = Field(
        default="Prioritize missing value imputation, duplicate removal, and outlier handling.",
        description="Step-by-step cleaning recommendations",
    )

    @model_validator(mode="before")
    @classmethod
    def normalize_insights(cls, data: Any) -> Any:
        if isinstance(data, dict):
            # 1. Normalize health_grade
            if not data.get("health_grade"):
                data["health_grade"] = data.get("grade") or "B"
            elif isinstance(data["health_grade"], str):
                data["health_grade"] = data["health_grade"].strip().upper()[:2]

            # 2. Normalize readiness_score
            score = data.get("readiness_score")
            if score is None:
                score = data.get("score") or data.get("readiness") or 80
            if isinstance(score, str):
                score = score.replace("%", "").strip()
                try:
                    score = int(float(score))
                except (ValueError, TypeError):
                    score = 80
            elif isinstance(score, float):
                score = int(score)
            data["readiness_score"] = max(0, min(100, score if isinstance(score, int) else 80))

            # 3. Normalize executive_summary
            if not data.get("executive_summary"):
                data["executive_summary"] = (
                    data.get("summary")
                    or data.get("assessment")
                    or data.get("overview")
                    or "Dataset assessment completed with identified quality defects."
                )

            # 4. Normalize primary_risks
            if "primary_risks" not in data or data.get("primary_risks") is None:
                risks = data.get("risks") or data.get("key_risks")
                if isinstance(risks, list):
                    data["primary_risks"] = [str(r) for r in risks]
                elif isinstance(risks, str):
                    data["primary_risks"] = [risks]
                else:
                    data["primary_risks"] = []

            # 5. Normalize defect_evaluations
            if "defect_evaluations" not in data or data.get("defect_evaluations") is None:
                defects = data.get("defects") or data.get("evaluations") or data.get("issues")
                if isinstance(defects, list):
                    data["defect_evaluations"] = defects
                else:
                    data["defect_evaluations"] = []

            # 6. Normalize cleaning_strategy
            if not data.get("cleaning_strategy"):
                strategy = (
                    data.get("cleaning_plan")
                    or data.get("strategy")
                    or data.get("recommended_strategy")
                    or data.get("plan")
                    or data.get("recommended_actions")
                    or data.get("action_plan")
                    or data.get("recommendations")
                )
                if strategy:
                    if isinstance(strategy, list):
                        data["cleaning_strategy"] = "\n".join(f"- {s}" for s in strategy)
                    else:
                        data["cleaning_strategy"] = str(strategy)
                elif data.get("defect_evaluations"):
                    actions = []
                    for d in data["defect_evaluations"]:
                        if isinstance(d, dict):
                            act = d.get("recommended_action") or d.get("action")
                            if act:
                                actions.append(act)
                        elif isinstance(d, DefectEvaluation) and d.recommended_action:
                            actions.append(d.recommended_action)
                    if actions:
                        data["cleaning_strategy"] = "Prioritized cleaning plan: " + "; ".join(actions[:5])
                    else:
                        data["cleaning_strategy"] = "Apply targeted transformations to resolve identified defects and improve downstream readiness."
                else:
                    data["cleaning_strategy"] = "Apply targeted transformations to resolve identified defects and improve downstream readiness."
            elif isinstance(data["cleaning_strategy"], list):
                data["cleaning_strategy"] = "\n".join(f"- {s}" for s in data["cleaning_strategy"])
        return data


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
                "Return only valid JSON strictly matching the schema with fields: "
                "health_grade, readiness_score, executive_summary, primary_risks, defect_evaluations, and cleaning_strategy."
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
                "Evaluate dataset health, score readiness (0-100), identify top risks, and recommend a concrete step-by-step cleaning_strategy."
            ),
        },
    ]

    try:
        insights = provider.generate_structured(
            messages=messages,
            response_schema=DatasetAiInsights,
            temperature=0.1,
            max_tokens=1500,
        )
        return ProfileAnalysisResponse(
            insights=insights,
            model=settings.groq_model,
            provider="Groq LPU",
        )
    except LLMValidationError as val_exc:
        logger.warning(
            f"LLM validation error in analyze_dataset_profile: {val_exc}. Generating heuristic fallback insights."
        )
        fallback_insights = DatasetAiInsights(
            health_grade="B",
            readiness_score=75,
            executive_summary=(
                f"Dataset contains {payload.row_count} rows and {payload.column_count} columns with "
                f"{len(payload.issues) if payload.issues else 0} detected anomalies."
            ),
            primary_risks=[str(i.get("description", "Quality defect")) for i in (payload.issues or [])[:3]],
            defect_evaluations=[
                DefectEvaluation(
                    defect_title=str(i.get("issue_type", "Quality Defect")),
                    severity=str(i.get("severity", "MEDIUM")),
                    impact_explanation=str(i.get("description", "Potential impact on analysis.")),
                    recommended_action=f"Remediate {i.get('column_name', 'column')} defect.",
                )
                for i in (payload.issues or [])[:5]
            ],
            cleaning_strategy="Run deterministic instant clean or autonomous loop to address detected defects.",
        )
        return ProfileAnalysisResponse(
            insights=fallback_insights,
            model=settings.groq_model,
            provider="Groq LPU (Fallback)",
        )
    except LLMError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail={"error": "llm_error", "message": str(exc)},
        )

