"""Dashboard stats & analytics routes."""

from __future__ import annotations

from typing import Annotated

import asyncpg
from fastapi import APIRouter, Depends

from app.core.dependencies import CurrentUserDep
from app.db.pool import get_connection
from app.services.analytics import AnalyticsService

router = APIRouter(tags=["analytics"])
ConnDep = Annotated[asyncpg.Connection, Depends(get_connection)]


@router.get("/stats")
async def stats(conn: ConnDep, _: CurrentUserDep) -> dict:
    return await AnalyticsService(conn).stats()


@router.get("/analytics/overview")
async def overview(conn: ConnDep, _: CurrentUserDep) -> dict:
    return await AnalyticsService(conn).overview()


@router.get("/analytics/report")
async def report(conn: ConnDep, _: CurrentUserDep) -> dict:
    return await AnalyticsService(conn).report()
