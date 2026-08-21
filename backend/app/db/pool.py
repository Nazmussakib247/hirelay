"""Async PostgreSQL connection-pool lifecycle management.

The original code lazily created a module-global pool on first request. Here the
pool is created and disposed explicitly via the FastAPI lifespan, and a
FastAPI dependency (:func:`get_connection`) hands out pooled connections so
route handlers never manage the pool directly.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import asyncpg

from app.config import get_settings
from app.core.logging import get_logger

logger = get_logger(__name__)

_pool: asyncpg.Pool | None = None


async def connect() -> asyncpg.Pool:
    """Create the global connection pool (idempotent)."""
    global _pool
    if _pool is None:
        settings = get_settings()
        _pool = await asyncpg.create_pool(
            "postgresql://postgres.tnuqfmtzmxxrfdebzzxz:jM4RdgGr4tyXeVoW@aws-0-ap-south-1.pooler.supabase.com:6543/postgres?sslmode=require",
            min_size=settings.db_pool_min_size,
            max_size=settings.db_pool_max_size,
        )
        logger.info(
            "database pool created",
            extra={
                "min_size": settings.db_pool_min_size,
                "max_size": settings.db_pool_max_size,
            },
        )
    return _pool


async def disconnect() -> None:
    """Close the global connection pool."""
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None
        logger.info("database pool closed")


def get_pool() -> asyncpg.Pool:
    """Return the initialised pool or raise if the app is misconfigured."""
    if _pool is None:
        raise RuntimeError("Database pool is not initialised. Call connect().")
    return _pool


@asynccontextmanager
async def acquire() -> AsyncIterator[asyncpg.Connection]:
    """Acquire a pooled connection as an async context manager."""
    pool = get_pool()
    async with pool.acquire() as connection:
        yield connection


async def get_connection() -> AsyncIterator[asyncpg.Connection]:
    """FastAPI dependency that yields a pooled connection per request."""
    async with acquire() as connection:
        yield connection
