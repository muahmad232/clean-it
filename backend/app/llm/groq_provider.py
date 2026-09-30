"""
Groq LLM Provider implementation — Phase 7.

Connects to the Groq API for high-speed, cost-free LLM inference.
Provides:
- Timeout enforcement (max 30s)
- Rate-limit and transient error retry with exponential backoff
- Pydantic schema validation for structured outputs
- Cumulative token usage tracking and structured logging
- Rolling conversation window to protect free-tier token budgets
"""

from __future__ import annotations
import json
import re
import time
import random
from typing import Any, Optional, Type, TypeVar

from groq import Groq
from groq import (
    RateLimitError,
    APIConnectionError,
    InternalServerError,
    APITimeoutError,
)
from pydantic import BaseModel, ValidationError

from app.core.config import get_settings
from app.core.logging import get_logger
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

logger = get_logger(__name__)

T = TypeVar("T", bound=BaseModel)


class GroqProvider(LLMProvider):
    """
    Production-grade Groq provider adhering to strict resource efficiency.
    """

    def __init__(
        self,
        api_key: Optional[str] = None,
        model: Optional[str] = None,
        timeout: float = 30.0,
        max_retries: int = 3,
        max_context_tokens: int = 3500,
    ):
        settings = get_settings()
        self.api_key = api_key if api_key is not None else settings.groq_api_key
        self.model = model or settings.groq_model
        self.timeout = timeout
        self.max_retries = max_retries
        self.max_context_tokens = max_context_tokens

        # Cumulative telemetry
        self._total_prompt_tokens = 0
        self._total_completion_tokens = 0
        self._total_calls = 0

        self._client: Optional[Groq] = None

    @property
    def client(self) -> Groq:
        """Lazily initialize the Groq client."""
        if self._client is None:
            if not self.api_key:
                raise LLMError(
                    "GROQ_API_KEY is not configured. Please set GROQ_API_KEY in your .env file."
                )
            self._client = Groq(api_key=self.api_key, timeout=self.timeout)
        return self._client

    # ── Token Tracking & Telemetry ─────────────────────────────────

    def get_token_stats(self) -> dict[str, int]:
        """Return cumulative token usage and call counts."""
        return {
            "total_calls": self._total_calls,
            "total_prompt_tokens": self._total_prompt_tokens,
            "total_completion_tokens": self._total_completion_tokens,
            "total_tokens": self._total_prompt_tokens + self._total_completion_tokens,
        }

    def _record_usage(self, usage: Any, latency_ms: float) -> LLMUsage:
        """Update cumulative metrics and log call metadata."""
        prompt = getattr(usage, "prompt_tokens", 0) or 0
        completion = getattr(usage, "completion_tokens", 0) or 0
        total = getattr(usage, "total_tokens", prompt + completion) or 0

        self._total_prompt_tokens += prompt
        self._total_completion_tokens += completion
        self._total_calls += 1

        logger.info(
            f"Groq API call #{self._total_calls}: model={self.model} "
            f"prompt_tokens={prompt} completion_tokens={completion} "
            f"total_tokens={total} latency={latency_ms:.1f}ms"
        )

        return LLMUsage(
            prompt_tokens=prompt,
            completion_tokens=completion,
            total_tokens=total,
        )

    # ── Rolling Conversation Window ───────────────────────────────

    def _estimate_tokens(self, text: str) -> int:
        """Rough heuristic: ~4 characters per token."""
        return max(1, len(text) // 4)

    def _apply_rolling_window(self, messages: list[dict[str, str]]) -> list[dict[str, str]]:
        """
        Ensure total conversation length stays under max_context_tokens.
        Preserves the system message (first message) and drops oldest user/assistant
        turns until budget is satisfied.
        """
        if not messages:
            return []

        has_system = messages[0].get("role") == "system"
        system_msg = messages[0] if has_system else None
        conversation = messages[1:] if has_system else list(messages)

        total_tokens = sum(self._estimate_tokens(m.get("content", "")) for m in messages)
        if total_tokens <= self.max_context_tokens:
            return messages

        logger.warning(
            f"Conversation tokens (~{total_tokens}) exceed budget ({self.max_context_tokens}). "
            "Applying rolling window truncation."
        )

        # Drop oldest conversation messages while preserving system message
        while conversation and (
            sum(self._estimate_tokens(m.get("content", "")) for m in conversation)
            + (self._estimate_tokens(system_msg.get("content", "")) if system_msg else 0)
            > self.max_context_tokens
        ):
            # Drop the oldest message
            conversation.pop(0)

        result = [system_msg] + conversation if system_msg else conversation
        return result

    # ── Normalize Messages ────────────────────────────────────────

    def _normalize_messages(
        self, messages: list[dict[str, str] | LLMMessage]
    ) -> list[dict[str, str]]:
        norm = []
        for m in messages:
            if isinstance(m, LLMMessage):
                norm.append({"role": m.role, "content": m.content})
            elif isinstance(m, dict):
                norm.append({"role": m["role"], "content": m["content"]})
            else:
                norm.append({"role": "user", "content": str(m)})
        return self._apply_rolling_window(norm)

    # ── Core Invocation with Exponential Backoff ──────────────────

    def _invoke_with_retry(self, **kwargs) -> Any:
        """Execute chat completion with timeout and exponential backoff retry."""
        attempt = 0
        last_error = None

        while attempt <= self.max_retries:
            attempt += 1
            start_time = time.perf_counter()
            try:
                response = self.client.chat.completions.create(**kwargs)
                latency = (time.perf_counter() - start_time) * 1000.0
                if hasattr(response, "usage") and response.usage:
                    self._record_usage(response.usage, latency)
                return response

            except APITimeoutError as exc:
                logger.warning(f"Groq API timeout on attempt {attempt}: {exc}")
                last_error = LLMTimeoutError(f"Groq API call timed out after {self.timeout}s: {exc}")

            except RateLimitError as exc:
                logger.warning(f"Groq rate limit on attempt {attempt}: {exc}")
                last_error = LLMRateLimitError(f"Groq rate limit exceeded: {exc}")
                if attempt > self.max_retries:
                    break
                # Exponential backoff with jitter
                delay = (2 ** (attempt - 1)) + random.uniform(0.5, 1.5)
                logger.info(f"Retrying after rate limit in {delay:.2f}s (attempt {attempt}/{self.max_retries})")
                time.sleep(delay)

            except (APIConnectionError, InternalServerError) as exc:
                logger.warning(f"Transient Groq error on attempt {attempt}: {exc}")
                last_error = LLMError(f"Groq transient network error: {exc}")
                if attempt > self.max_retries:
                    break
                delay = (1.5 ** attempt) + random.uniform(0.2, 0.8)
                time.sleep(delay)

            except Exception as exc:
                logger.exception(f"Unexpected Groq client failure: {exc}")
                raise LLMError(f"Unexpected Groq call failure: {exc}") from exc

        if isinstance(last_error, LLMError):
            raise last_error
        raise LLMError(f"Failed after {self.max_retries} retries: {last_error}")

    # ── Text Generation ───────────────────────────────────────────

    def generate_text(
        self,
        messages: list[dict[str, str] | LLMMessage],
        temperature: float = 0.2,
        max_tokens: int = 800,
    ) -> str:
        """Generate free-form text from Groq."""
        normalized = self._normalize_messages(messages)
        res = self._invoke_with_retry(
            model=self.model,
            messages=normalized,
            temperature=temperature,
            max_tokens=max_tokens,
        )
        return res.choices[0].message.content or ""

    # ── Structured Pydantic Output Generation ─────────────────────

    def generate_structured(
        self,
        messages: list[dict[str, str] | LLMMessage],
        response_schema: Type[T],
        temperature: float = 0.1,
        max_tokens: int = 800,
    ) -> T:
        """
        Generate structured output guaranteed to validate against response_schema.
        Employs JSON mode + Pydantic schema injection + self-correction retry.
        """
        normalized = self._normalize_messages(messages)

        # Inject schema structure guidance into system or user prompt
        schema_json = json.dumps(response_schema.model_json_schema(), indent=2)
        instruction = (
            f"\n\nCRITICAL: Respond ONLY with a valid JSON object matching this schema:\n"
            f"```json\n{schema_json}\n```\n"
            f"Do not include explanation outside the JSON."
        )

        # Append schema instructions to the last message
        augmented_messages = [dict(m) for m in normalized]
        augmented_messages[-1]["content"] += instruction

        # Primary attempt
        res = self._invoke_with_retry(
            model=self.model,
            messages=augmented_messages,
            temperature=temperature,
            max_tokens=max_tokens,
            response_format={"type": "json_object"},
        )

        content = res.choices[0].message.content or "{}"
        clean_content = self._extract_json(content)

        try:
            return response_schema.model_validate_json(clean_content)
        except ValidationError as first_err:
            logger.warning(
                f"Pydantic validation failed on first attempt: {first_err}. Attempting self-correction."
            )

            # Self-correction repair turn
            repair_messages = list(augmented_messages)
            repair_messages.append({"role": "assistant", "content": clean_content})
            repair_messages.append({
                "role": "user",
                "content": (
                    f"Your output failed validation with error:\n{str(first_err)}\n"
                    f"Please correct the JSON output so it strictly satisfies the schema."
                ),
            })

            repair_res = self._invoke_with_retry(
                model=self.model,
                messages=repair_messages,
                temperature=0.0,
                max_tokens=max_tokens,
                response_format={"type": "json_object"},
            )

            repair_content = self._extract_json(repair_res.choices[0].message.content or "{}")
            try:
                return response_schema.model_validate_json(repair_content)
            except ValidationError as final_err:
                logger.error(f"Structured response validation failed after self-correction: {final_err}")
                raise LLMValidationError(
                    f"Failed to validate response against schema {response_schema.__name__}: {final_err}"
                ) from final_err

    def _extract_json(self, text: str) -> str:
        """Strip markdown code-fence blocks if the model wrapped the JSON."""
        trimmed = text.strip()
        # Check for ```json ... ``` or ``` ... ```
        match = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", trimmed)
        if match:
            return match.group(1).strip()
        return trimmed

    # ── Tool Selection ────────────────────────────────────────────

    def select_tools(
        self,
        messages: list[dict[str, str] | LLMMessage],
        tools: list[dict[str, Any]],
        temperature: float = 0.1,
    ) -> list[ToolCall]:
        """
        Structured tool selector using Groq's tool calling capability
        or fallback structured JSON format.
        """
        normalized = self._normalize_messages(messages)
        res = self._invoke_with_retry(
            model=self.model,
            messages=normalized,
            tools=tools,
            temperature=temperature,
            tool_choice="auto",
        )

        message = res.choices[0].message
        tool_calls = getattr(message, "tool_calls", None) or []

        parsed_calls: list[ToolCall] = []
        for call in tool_calls:
            name = call.function.name
            try:
                args = json.loads(call.function.arguments)
            except Exception:
                args = {}
            parsed_calls.append(ToolCall(tool_name=name, arguments=args, call_id=call.id))

        return parsed_calls
