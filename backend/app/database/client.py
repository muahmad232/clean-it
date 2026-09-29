"""
Supabase client singleton.

Provides two clients:
  - anon_client   → uses SUPABASE_ANON_KEY  (safe for frontend-equivalent ops)
  - service_client → uses SUPABASE_SERVICE_ROLE_KEY (full access, backend only)

The service client bypasses Row Level Security — never expose it to the frontend.
"""

from functools import lru_cache
from supabase import create_client, Client
from app.core.config import get_settings
from app.core.logging import get_logger

logger = get_logger(__name__)


@lru_cache(maxsize=1)
def get_service_client() -> Client:
    """
    Return a cached Supabase client using the service-role key.

    This client bypasses Row Level Security.
    Use ONLY on the backend — never send this key to the frontend.
    """
    settings = get_settings()
    if not settings.supabase_url or not settings.supabase_service_role_key:
        raise RuntimeError(
            "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env"
        )
    client = create_client(settings.supabase_url, settings.supabase_service_role_key)
    logger.info(f"Supabase service client initialised → {settings.supabase_url}")
    return client


@lru_cache(maxsize=1)
def get_anon_client() -> Client:
    """
    Return a cached Supabase client using the anon key.

    Respects Row Level Security. Suitable for operations that mirror
    what the frontend would do (e.g. signed URL generation).
    """
    settings = get_settings()
    if not settings.supabase_url or not settings.supabase_anon_key:
        raise RuntimeError(
            "SUPABASE_URL and SUPABASE_ANON_KEY must be set in .env"
        )
    client = create_client(settings.supabase_url, settings.supabase_anon_key)
    return client
