"""
LLM module initialization — Phase 7.
"""

from functools import lru_cache
from app.llm.base import (
    LLMProvider,
    LLMMessage,
    LLMUsage,
    ToolCall,
    LLMError,
    LLMTimeoutError,
    LLMRateLimitError,
    LLMValidationError,
)
from app.llm.groq_provider import GroqProvider


@lru_cache(maxsize=1)
def get_llm_provider() -> LLMProvider:
    """Return cached singleton LLM provider instance."""
    return GroqProvider()


__all__ = [
    "LLMProvider",
    "GroqProvider",
    "LLMMessage",
    "LLMUsage",
    "ToolCall",
    "LLMError",
    "LLMTimeoutError",
    "LLMRateLimitError",
    "LLMValidationError",
    "get_llm_provider",
]
