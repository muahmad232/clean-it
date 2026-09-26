"""
FastAPI application entry point.

Phase 1 — Minimal backend:
  - Application factory with lifespan context
  - CORS configuration
  - Global exception handlers
  - Health endpoint
  - No business logic yet
"""

from contextlib import asynccontextmanager
from datetime import datetime, timezone

import uvicorn
from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.core.config import get_settings
from app.core.logging import configure_logging, get_logger

# ── Logging must be configured before anything else ──────────────
configure_logging()
logger = get_logger(__name__)


# ── Lifespan ──────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup / shutdown lifecycle."""
    settings = get_settings()
    logger.info(
        "Starting Agentic Data Pipeline API | "
        f"version={settings.app_version} | "
        f"env={settings.environment}"
    )
    yield
    logger.info("Shutting down Agentic Data Pipeline API")


# ── App factory ───────────────────────────────────────────────────
def create_app() -> FastAPI:
    settings = get_settings()

    app = FastAPI(
        title="Agentic Self-Healing Data Pipeline",
        description=(
            "An AI-powered, resource-efficient data quality and cleaning platform. "
            "Profiles datasets, identifies issues, executes deterministic tools, "
            "validates effects, and recovers from harmful transformations."
        ),
        version=settings.app_version,
        docs_url="/docs" if settings.is_development else None,
        redoc_url="/redoc" if settings.is_development else None,
        lifespan=lifespan,
    )

    # ── CORS ──────────────────────────────────────────────────────
    # In development allow all origins; tighten in production.
    origins = (
        ["*"]
        if settings.is_development
        else [
            "https://your-frontend.vercel.app",
        ]
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # ── Global exception handlers ─────────────────────────────────
    @app.exception_handler(Exception)
    async def unhandled_exception_handler(request: Request, exc: Exception):
        logger.exception(f"Unhandled exception on {request.method} {request.url}: {exc}")
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={
                "error": "internal_server_error",
                "message": "An unexpected error occurred. Please try again.",
            },
        )

    # ── Routes ────────────────────────────────────────────────────
    _register_routes(app)

    return app


def _register_routes(app: FastAPI) -> None:
    """Register all routers. Add new routers here as phases progress."""

    @app.get(
        "/health",
        tags=["System"],
        summary="Health check",
        response_description="Returns service health status.",
    )
    async def health():
        """
        Lightweight health check endpoint.

        Returns HTTP 200 when the service is operational.
        Suitable for use as a Render/Kubernetes liveness probe.
        """
        settings = get_settings()
        return {
            "status": "healthy",
            "version": settings.app_version,
            "environment": settings.environment,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }


# ── Application instance (used by uvicorn) ────────────────────────
app = create_app()


# ── Local dev entry-point ─────────────────────────────────────────
if __name__ == "__main__":
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info",
    )
