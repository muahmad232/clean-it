"""
Structured logging setup for the application.

Outputs JSON in production, human-readable in development.
Import `get_logger` everywhere instead of using logging directly.
"""

import logging
import sys
from app.core.config import get_settings


def configure_logging() -> None:
    """Configure root logger. Call once at application startup."""
    settings = get_settings()

    level = getattr(logging, settings.log_level.upper(), logging.INFO)

    # Simple formatter: human-readable in dev, structured in prod
    if settings.is_development:
        fmt = "%(asctime)s | %(levelname)-8s | %(name)s | %(message)s"
        datefmt = "%H:%M:%S"
    else:
        # In production, emit one JSON line per record
        fmt = '{"time":"%(asctime)s","level":"%(levelname)s","logger":"%(name)s","msg":"%(message)s"}'
        datefmt = "%Y-%m-%dT%H:%M:%S"

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(logging.Formatter(fmt=fmt, datefmt=datefmt))

    root = logging.getLogger()
    root.setLevel(level)
    root.handlers.clear()
    root.addHandler(handler)

    # Silence noisy third-party loggers
    for noisy in ("uvicorn.access", "httpx", "httpcore"):
        logging.getLogger(noisy).setLevel(logging.WARNING)


def get_logger(name: str) -> logging.Logger:
    """Return a named logger. Usage: logger = get_logger(__name__)"""
    return logging.getLogger(name)
