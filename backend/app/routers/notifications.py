"""In-app notification routes."""

from __future__ import annotations

from typing import Annotated

import asyncpg
from fastapi import APIRouter, Depends, Query

from app.core.dependencies import CurrentUserDep
from app.db.pool import get_connection
from app.repositories.notifications import NotificationRepository

router = APIRouter(tags=["notifications"])
ConnDep = Annotated[asyncpg.Connection, Depends(get_connection)]


@router.get("/notifications")
async def list_notifications(
    conn: ConnDep, _: CurrentUserDep, limit: int = Query(30, ge=1, le=100)
) -> dict:
    repo = NotificationRepository(conn)
    rows = await repo.list_recent(limit)
    return {
        "unread": await repo.unread_count(),
        "items": [dict(r) for r in rows],
    }


@router.get("/notifications/unread-count")
async def unread_count(conn: ConnDep, _: CurrentUserDep) -> dict:
    return {"unread": await NotificationRepository(conn).unread_count()}


@router.post("/notifications/mark-read")
async def mark_read(conn: ConnDep, _: CurrentUserDep) -> dict:
    marked = await NotificationRepository(conn).mark_all_read()
    return {"success": True, "marked": marked}
