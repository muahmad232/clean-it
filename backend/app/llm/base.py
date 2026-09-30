"""
Abstract Base Classes and Data Transfer Objects for LLM Providers.
Phase 7: Groq LLM Integration.
"""

from __future__ import annotations
from abc import ABC, abstractmethod
from typing import Any, Optional, Type, TypeVar
from pydantic import BaseModel, Field

T = TypeVar("T", bound=BaseModel)


class LLMMessage(BaseModel):
    """Normalized chat message."""
    role: str = Field(..., description="system | user | assistant")
    content: str = Field(..., description="Message text content")


class LLMUsage(BaseModel):
    """Token usage tracking."""
    prompt_tokens: int = Field(default=0)
    completion_tokens: int = Field(default=0)
    total_tokens: int = Field(default=0)


class ToolCall(BaseModel):
    """Normalized tool selection call from LLM."""
    tool_name: str
    arguments: dict[str, Any] = Field(default_factory=dict)
    call_id: Optional[str] = None


class LLMError(Exception):
    """Base exception for LLM provider errors."""
    pass


class LLMTimeoutError(LLMError):
    """Raised when an LLM request exceeds the timeout threshold."""
    pass


class LLMRateLimitError(LLMError):
    """Raised when rate limits are exceeded and retries have been exhausted."""
    pass


class LLMValidationError(LLMError):
    """Raised when LLM response cannot be validated against the requested Pydantic schema."""
    pass


class LLMProvider(ABC):
    """
    Abstract interface for LLM backends (Groq, etc.).
    Follows the Golden Rule of Division of Labour:
    LLM = reason + plan + select tools (never compute stats).
    """

    @abstractmethod
    def generate_structured(
        self,
        messages: list[dict[str, str] | LLMMessage],
        response_schema: Type[T],
        temperature: float = 0.1,
        max_tokens: int = 800,
    ) -> T:
        """
        Send messages to the LLM and return a response guaranteed to conform
        to response_schema (Pydantic model).
        """
        ...

    @abstractmethod
    def generate_text(
        self,
        messages: list[dict[str, str] | LLMMessage],
        temperature: float = 0.2,
        max_tokens: int = 800,
    ) -> str:
        """Return free-form text response from the LLM."""
        ...

    @abstractmethod
    def select_tools(
        self,
        messages: list[dict[str, str] | LLMMessage],
        tools: list[dict[str, Any]],
        temperature: float = 0.1,
    ) -> list[ToolCall]:
        """Request the LLM to select one or more tools from the available tool specifications."""
        ...

    @abstractmethod
    def get_token_stats(self) -> dict[str, int]:
        """Return cumulative token usage and call statistics."""
        ...
