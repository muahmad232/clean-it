"""
FastAPI application entry point.

Phase 1 — Minimal backend:
  - Application factory with lifespan context
  - CORS configuration
  - Global exception handlers
  - Health endpoint

Phase 2 additions:
  - Supabase DB connectivity check on startup
  - Supabase Storage bucket verification on startup
  - DB status reflected in /health response

Phase 3 additions:
  - POST /api/v1/projects/{project_id}/datasets/upload
  - GET  /api/v1/projects/{project_id}/datasets
  - GET  /api/v1/projects/{project_id}/datasets/{dataset_id}
  - GET  /api/v1/limits

Phase 4 additions:
  - POST /api/v1/projects/{project_id}/datasets/{dataset_id}/profile
  - GET  /api/v1/projects/{project_id}/datasets/{dataset_id}/profile
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

    # ── Phase 2: verify Supabase connectivity ─────────────────────
    if settings.supabase_url and settings.supabase_service_role_key:
        try:
            from app.storage.supabase import ensure_bucket_exists
            from app.database.client import get_service_client

            # DB ping: list tables in data_agent schema
            client = get_service_client()
            client.schema("data_agent").table("projects").select("id").limit(1).execute()
            logger.info("Supabase DB connection [OK]")

            # Storage: ensure datasets bucket exists
            ensure_bucket_exists()
        except Exception as exc:
            logger.error(f"Supabase connectivity check failed: {exc}")
            # Don't crash the server — ops can fix credentials at runtime
    else:
        logger.warning("Supabase credentials not set — skipping connectivity check")

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

    # Phase 2: Projects & User Datasets
    from app.routers.projects import router as projects_router, user_datasets_router
    app.include_router(projects_router)
    app.include_router(user_datasets_router)

    # Auth & Config
    from app.routers.auth import router as auth_router
    app.include_router(auth_router)

    # Phase 3: Dataset upload
    from app.routers.upload import router as upload_router, limits_router
    app.include_router(upload_router)
    app.include_router(limits_router)

    # Phase 4: Dataset profiling
    from app.routers.profile import router as profile_router
    app.include_router(profile_router)

    # Phase 5: Basic Issue Detection
    from app.routers.issues import router as issues_router
    app.include_router(issues_router)

    # Dataset Cleaning & Download
    from app.routers.clean import router as clean_router
    app.include_router(clean_router)

    # Phase 7: Groq LLM Engine
    from app.routers.llm import router as llm_router
    app.include_router(llm_router)

    # Phase 11: Dataset Versioning & Rollback
    from app.routers.versions import router as versions_router
    app.include_router(versions_router)

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
        Includes a live Supabase DB ping so infra issues surface immediately.
        """
        settings = get_settings()

        db_status = "unconfigured"
        if settings.supabase_url and settings.supabase_service_role_key:
            try:
                from app.database.client import get_service_client
                client = get_service_client()
                client.schema("data_agent").table("projects").select("id").limit(1).execute()
                db_status = "ok"
            except Exception as exc:
                db_status = f"error: {exc}"

        return {
            "status": "healthy",
            "version": settings.app_version,
            "environment": settings.environment,
            "db_status": db_status,
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
