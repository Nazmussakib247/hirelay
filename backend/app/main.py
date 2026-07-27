"""Application factory and ASGI entrypoint.

Run with:  uvicorn app.main:app --host 0.0.0.0 --port 8000
"""

from __future__ import annotations

from contextlib import asynccontextmanager
from typing import cast

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from starlette.types import ExceptionHandler

from app import __version__
from app.config import get_settings
from app.core.exceptions import register_exception_handlers
from app.core.logging import configure_logging, get_logger
from app.core.middleware import RequestContextMiddleware
from app.core.rate_limit import limiter
from app.db import pool
from app.db.init import init_database

logger = get_logger(__name__)


@asynccontextmanager
async def lifespan(_: FastAPI):
    """Manage startup/shutdown: connect the pool and bootstrap the schema."""
    settings = get_settings()
    configure_logging(level=settings.log_level, json_output=settings.log_json)
    await pool.connect()
    await init_database()
    logger.info("application startup complete", extra={"version": __version__})
    try:
        yield
    finally:
        await pool.disconnect()
        logger.info("application shutdown complete")


def create_app() -> FastAPI:
    """Build and configure the FastAPI application."""
    settings = get_settings()
    app = FastAPI(
        title="HR Recruiting System API",
        version=__version__,
        description="AI-powered CV parsing, matching, and recruitment automation.",
        lifespan=lifespan,
    )

    # Rate limiting (slowapi).
    app.state.limiter = limiter
    # slowapi's handler is typed for its own concrete exception; Starlette's
    # registry is typed for the base Exception. The cast documents that the
    # narrowing is safe because the handler is only ever dispatched for the
    # exception type it is registered against.
    app.add_exception_handler(
        RateLimitExceeded,
        cast(ExceptionHandler, _rate_limit_exceeded_handler),
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["X-Request-ID"],
    )
    app.add_middleware(SlowAPIMiddleware)
    app.add_middleware(RequestContextMiddleware)

    register_exception_handlers(app)
    _register_routers(app)
    return app


def _register_routers(app: FastAPI) -> None:
    from app.routers import (
        analytics,
        auth,
        candidates,
        email_logs,
        evaluation,
        health,
        interviews,
        jobs,
        matching,
        notifications,
        public,
        settings,
    )

    for module in (
        health,
        auth,
        candidates,
        jobs,
        matching,
        interviews,
        email_logs,
        evaluation,
        analytics,
        notifications,
        public,
        settings,
    ):
        app.include_router(module.router)


app = create_app()
