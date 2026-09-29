"""
Application configuration loaded from environment variables.

Uses pydantic-settings so all settings are type-validated on startup.
Unknown/missing required vars raise a clear error immediately.
"""

from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field
from functools import lru_cache


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ── Application ──────────────────────────────────────────────
    environment: str = Field(default="development")
    log_level: str = Field(default="INFO")
    app_version: str = Field(default="0.1.0")

    # ── Groq ─────────────────────────────────────────────────────
    groq_api_key: str = Field(default="")
    groq_model: str = Field(default="qwen/qwen3-32b")

    # ── Supabase ─────────────────────────────────────────────────
    supabase_url: str = Field(default="")
    supabase_anon_key: str = Field(default="")
    supabase_service_role_key: str = Field(default="")
    supabase_db_url: str = Field(default="")  # postgresql://postgres:[pw]@db.[ref].supabase.co:5432/postgres

    # ── Resource Limits ───────────────────────────────────────────
    max_upload_size_mb: int = Field(default=100)
    max_rows: int = Field(default=1_000_000)
    max_columns: int = Field(default=150)
    max_concurrent_jobs: int = Field(default=1)

    # ── Agent Limits ──────────────────────────────────────────────
    max_agent_iterations: int = Field(default=5)
    max_llm_calls_per_run: int = Field(default=10)
    max_actions_per_iteration: int = Field(default=10)

    @property
    def is_development(self) -> bool:
        return self.environment.lower() == "development"

    @property
    def max_upload_size_bytes(self) -> int:
        return self.max_upload_size_mb * 1024 * 1024


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return cached Settings instance. Import and call this everywhere."""
    return Settings()
