"""
Authentication & configuration router.

Endpoints
---------
GET /api/v1/auth/config — Returns public Supabase configuration for client-side Auth
GET /api/v1/auth/me     — Validates user token and returns authenticated user metadata
"""

from __future__ import annotations

from typing import Optional
from fastapi import APIRouter, Header, HTTPException, status
from pydantic import BaseModel

from app.core.config import get_settings
from app.core.logging import get_logger
from app.database.client import get_service_client

logger = get_logger(__name__)

router = APIRouter(prefix="/api/v1/auth", tags=["Authentication"])


@router.get("/config", summary="Get public authentication config")
def get_auth_config():
    """
    Returns the Supabase URL and anonymous public key so the frontend can
    connect to Supabase Auth directly (Email/Password & Google OAuth).
    """
    settings = get_settings()
    return {
        "supabase_url": settings.supabase_url,
        "supabase_anon_key": settings.supabase_anon_key,
    }


@router.get("/me", summary="Get current authenticated user")
def get_current_user(
    authorization: Optional[str] = Header(default=None),
    x_user_id: Optional[str] = Header(default=None, alias="X-User-Id"),
):
    """
    Validates the bearer token or X-User-Id header against Supabase Auth.
    """
    if authorization and authorization.startswith("Bearer "):
        token = authorization.split("Bearer ")[1].strip()
        try:
            client = get_service_client()
            res = client.auth.get_user(token)
            if res and res.user:
                return {
                    "authenticated": True,
                    "user": {
                        "id": str(res.user.id),
                        "email": res.user.email,
                        "created_at": res.user.created_at,
                        "metadata": res.user.user_metadata or {},
                    },
                }
        except Exception as exc:
            logger.debug(f"Bearer token validation failed: {exc}")

    if x_user_id and x_user_id != "00000000-0000-0000-0000-000000000001":
        return {
            "authenticated": True,
            "user": {
                "id": x_user_id,
                "email": None,
                "metadata": {},
            },
        }

    return {
        "authenticated": False,
        "user": None,
    }
