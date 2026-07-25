"""Health & readiness endpoints."""

from __future__ import annotations

from typing import Annotated

import asyncpg
from fastapi import APIRouter, Depends

from app import __version__
from app.config import get_settings
from app.db.pool import get_connection

router = APIRouter(tags=["system"])


@router.get("/health")
async def health() -> dict:
    """Liveness probe + feature flags (no dependencies, always fast)."""
    settings = get_settings()
    return {
        "status": "ok",
        "version": __version__,
        "environment": settings.environment,
        "features": {
            "ai_matching": settings.ai_enabled,
            "email": settings.email_enabled,
        },
    }


@router.get("/health/ready")
async def readiness(
    conn: Annotated[asyncpg.Connection, Depends(get_connection)],
) -> dict:
    """Readiness probe — verifies the database is reachable."""
    await conn.fetchval("SELECT 1")
    return {"status": "ready", "database": "ok"}
