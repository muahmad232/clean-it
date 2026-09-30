"""
Phase 7 Tests — Groq LLM Integration.

Verifies:
1. LLMProvider interface & GroqProvider implementation:
   - Abstract method adherence
   - Token statistics tracking
   - Message normalization
2. Rolling Conversation Window:
   - Preserves system prompt while truncating long conversation history
3. Structured Output & Pydantic Validation:
   - Validates JSON output directly into Pydantic models
   - Self-correction repair loop when initial output fails validation
   - LLMValidationError raised on persistent failure
4. Resilience & Error Handling:
   - RateLimitError retry with exponential backoff
   - APITimeoutError conversion to LLMTimeoutError
   - Missing API key detection
5. Live Groq Integration (when GROQ_API_KEY is available):
   - Structured reasoning over compact dataset profile
   - Endpoints: GET /api/v1/llm/health and POST /api/v1/llm/test

Run with:
    pytest tests/test_phase7_groq_llm.py -v
"""

from unittest.mock import MagicMock, patch
import pytest
from pydantic import BaseModel, Field
from fastapi.testclient import TestClient
from groq import RateLimitError, APITimeoutError

from app.main import app
from app.core.config import get_settings
from app.llm import (
    LLMProvider,
    GroqProvider,
    LLMError,
    LLMTimeoutError,
    LLMRateLimitError,
    LLMValidationError,
    get_llm_provider,
)
from app.routers.llm import SampleDatasetAnalysis

client = TestClient(app)


# ── Test Schema ───────────────────────────────────────────────────

class PlanOutputSchema(BaseModel):
    plan_name: str
    primary_action: str
    risk_level: str = Field(..., pattern="^(LOW|MEDIUM|HIGH)$")
    confidence: float = Field(..., ge=0.0, le=1.0)


# ── Unit Tests with Mocks ─────────────────────────────────────────

def test_provider_subclass_and_token_stats():
    """Verify GroqProvider implements LLMProvider and tracks token telemetry."""
    provider = GroqProvider(api_key="test_key", model="qwen/qwen3.8-27b")
    assert isinstance(provider, LLMProvider)

    stats = provider.get_token_stats()
    assert stats["total_calls"] == 0
    assert stats["total_tokens"] == 0

    # Simulate recording usage
    mock_usage = MagicMock(prompt_tokens=45, completion_tokens=15, total_tokens=60)
    provider._record_usage(mock_usage, latency_ms=120.0)

    updated_stats = provider.get_token_stats()
    assert updated_stats["total_calls"] == 1
    assert updated_stats["total_prompt_tokens"] == 45
    assert updated_stats["total_completion_tokens"] == 15
    assert updated_stats["total_tokens"] == 60


def test_missing_api_key_raises_llm_error():
    """Verify error raised when API key is explicitly missing."""
    provider = GroqProvider(api_key="")
    with pytest.raises(LLMError) as exc_info:
        _ = provider.client
    assert "GROQ_API_KEY is not configured" in str(exc_info.value)


def test_rolling_conversation_window():
    """Verify oldest conversation turns are dropped while preserving system prompt."""
    provider = GroqProvider(api_key="test_key", max_context_tokens=100)

    # Create long messages
    long_content = "x" * 200  # ~50 tokens
    messages = [
        {"role": "system", "content": "You are a data assistant."},
        {"role": "user", "content": f"Message 1: {long_content}"},
        {"role": "assistant", "content": f"Reply 1: {long_content}"},
        {"role": "user", "content": f"Message 2: {long_content}"},
    ]

    truncated = provider._apply_rolling_window(messages)
    # Must preserve system prompt
    assert truncated[0]["role"] == "system"
    assert truncated[0]["content"] == "You are a data assistant."
    # Total count must be reduced to fit budget
    assert len(truncated) < len(messages)


def test_generate_structured_success_mock():
    """Verify generate_structured parses and returns validated Pydantic model."""
    provider = GroqProvider(api_key="test_key")

    mock_client = MagicMock()
    mock_response = MagicMock()
    mock_response.choices = [
        MagicMock(
            message=MagicMock(
                content='{"plan_name": "Clean Telecom", "primary_action": "remove_duplicates", "risk_level": "LOW", "confidence": 0.95}'
            )
        )
    ]
    mock_response.usage = MagicMock(prompt_tokens=50, completion_tokens=25, total_tokens=75)
    mock_client.chat.completions.create.return_value = mock_response

    provider._client = mock_client

    result = provider.generate_structured(
        messages=[{"role": "user", "content": "Give me a plan"}],
        response_schema=PlanOutputSchema,
    )

    assert isinstance(result, PlanOutputSchema)
    assert result.plan_name == "Clean Telecom"
    assert result.primary_action == "remove_duplicates"
    assert result.risk_level == "LOW"
    assert result.confidence == 0.95


def test_generate_structured_markdown_fence_stripping():
    """Verify that JSON wrapped in markdown code fences is cleanly extracted."""
    provider = GroqProvider(api_key="test_key")

    mock_client = MagicMock()
    mock_response = MagicMock()
    mock_response.choices = [
        MagicMock(
            message=MagicMock(
                content='```json\n{"plan_name": "Fenced Plan", "primary_action": "impute_median", "risk_level": "MEDIUM", "confidence": 0.88}\n```'
            )
        )
    ]
    mock_response.usage = MagicMock(prompt_tokens=40, completion_tokens=20, total_tokens=60)
    mock_client.chat.completions.create.return_value = mock_response

    provider._client = mock_client

    result = provider.generate_structured(
        messages=[{"role": "user", "content": "Give me a plan"}],
        response_schema=PlanOutputSchema,
    )

    assert result.plan_name == "Fenced Plan"
    assert result.risk_level == "MEDIUM"


def test_generate_structured_self_correction_loop():
    """Verify self-correction repair turn triggers when first output is invalid."""
    provider = GroqProvider(api_key="test_key")

    mock_client = MagicMock()
    # 1st response: invalid (missing required field 'risk_level')
    bad_response = MagicMock()
    bad_response.choices = [
        MagicMock(message=MagicMock(content='{"plan_name": "Incomplete"}'))
    ]
    bad_response.usage = MagicMock(prompt_tokens=30, completion_tokens=10, total_tokens=40)

    # 2nd response: corrected
    good_response = MagicMock()
    good_response.choices = [
        MagicMock(
            message=MagicMock(
                content='{"plan_name": "Corrected Plan", "primary_action": "drop_column", "risk_level": "HIGH", "confidence": 0.92}'
            )
        )
    ]
    good_response.usage = MagicMock(prompt_tokens=60, completion_tokens=25, total_tokens=85)

    mock_client.chat.completions.create.side_effect = [bad_response, good_response]
    provider._client = mock_client

    result = provider.generate_structured(
        messages=[{"role": "user", "content": "Analyze and plan"}],
        response_schema=PlanOutputSchema,
    )

    assert mock_client.chat.completions.create.call_count == 2
    assert result.plan_name == "Corrected Plan"
    assert result.risk_level == "HIGH"


def test_rate_limit_retry_exhaustion():
    """Verify LLMRateLimitError is raised when retries are exhausted."""
    provider = GroqProvider(api_key="test_key", max_retries=1)

    mock_client = MagicMock()
    mock_client.chat.completions.create.side_effect = RateLimitError(
        message="Rate limit reached", response=MagicMock(status_code=429), body={}
    )
    provider._client = mock_client

    with patch("time.sleep", return_value=None):
        with pytest.raises(LLMRateLimitError):
            provider.generate_text([{"role": "user", "content": "test"}])


def test_timeout_handling():
    """Verify APITimeoutError is caught and raised as LLMTimeoutError."""
    provider = GroqProvider(api_key="test_key", max_retries=0)

    mock_client = MagicMock()
    mock_client.chat.completions.create.side_effect = APITimeoutError(request=MagicMock())
    provider._client = mock_client

    with pytest.raises(LLMTimeoutError):
        provider.generate_text([{"role": "user", "content": "test"}])


# ── Live Integration Tests (with Real API Key) ────────────────────

def test_llm_health_endpoint():
    """Verify GET /api/v1/llm/health returns provider telemetry and config."""
    res = client.get("/api/v1/llm/health")
    assert res.status_code == 200
    data = res.json()
    assert data["provider"] == "GroqProvider"
    assert "model" in data
    assert "api_key_configured" in data
    assert "token_stats" in data
    assert "total_calls" in data["token_stats"]


@pytest.mark.skipif(
    not get_settings().groq_api_key,
    reason="GROQ_API_KEY not configured in settings",
)
def test_live_groq_structured_generation():
    """
    Live test against Groq using the configured API key.
    Sends compact dataset profile and verifies structured Pydantic response.
    """
    provider = get_llm_provider()

    compact_profile = {
        "dataset": "credit_risk",
        "rows": 5000,
        "columns": 6,
        "duplicate_rows": 120,
        "columns_summary": {
            "age": {"type": "int", "missing_pct": 8.5, "min": -1, "max": 120},
            "income": {"type": "float", "missing_pct": 2.1, "outliers": 45},
            "loan_status": {"type": "int", "distribution": {"0": 0.85, "1": 0.15}},
        },
    }

    result = provider.generate_structured(
        messages=[
            {
                "role": "system",
                "content": "You are a professional automated data quality planner. Analyze dataset defects and respond in JSON.",
            },
            {
                "role": "user",
                "content": f"Dataset profile:\n{compact_profile}",
            },
        ],
        response_schema=SampleDatasetAnalysis,
        temperature=0.1,
        max_tokens=600,
    )

    assert isinstance(result, SampleDatasetAnalysis)
    assert len(result.dataset_summary) > 5
    assert len(result.primary_defect) > 3
    assert len(result.suggested_strategy) > 3
    assert 0.0 <= result.confidence_score <= 1.0


@pytest.mark.skipif(
    not get_settings().groq_api_key,
    reason="GROQ_API_KEY not configured in settings",
)
def test_live_llm_test_endpoint():
    """Verify POST /api/v1/llm/test returns structured response via FastAPI."""
    res = client.post("/api/v1/llm/test")
    assert res.status_code == 200
    data = res.json()
    assert "dataset_summary" in data
    assert "primary_defect" in data
    assert "suggested_strategy" in data
    assert "confidence_score" in data
    assert 0.0 <= data["confidence_score"] <= 1.0


@pytest.mark.skipif(
    not get_settings().groq_api_key,
    reason="GROQ_API_KEY not configured in settings",
)
def test_live_llm_analyze_endpoint():
    """Verify POST /api/v1/llm/analyze returns structured dataset diagnosis."""
    payload = {
        "dataset_name": "customer_churn.csv",
        "task_type": "CLASSIFICATION",
        "row_count": 2500,
        "column_count": 8,
        "duplicate_rows": 15,
        "llm_summary": (
            "Dataset: 2500 rows, 8 columns. Column 'TotalCharges' has 11 missing values. "
            "Column 'tenure' has 3 negative outlier values. Target 'Churn' is 73% No, 27% Yes."
        ),
        "issues": [
            {
                "issue_type": "MISSING_VALUES",
                "severity": "HIGH",
                "column_name": "TotalCharges",
                "description": "11 missing string-formatted floats",
            },
            {
                "issue_type": "OUTLIERS",
                "severity": "MEDIUM",
                "column_name": "tenure",
                "description": "Negative values detected in positive domain",
            },
        ],
    }
    res = client.post("/api/v1/llm/analyze", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert "insights" in data
    insights = data["insights"]
    assert "health_grade" in insights
    assert "readiness_score" in insights
    assert 0 <= insights["readiness_score"] <= 100
    assert "executive_summary" in insights
    assert "cleaning_strategy" in insights
    assert data["provider"] == "Groq LPU"

