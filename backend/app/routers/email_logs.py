"""Email-log listing routes."""

from __future__ import annotations

from typing import Annotated

import asyncpg
from fastapi import APIRouter, Depends, Query

from app.core.dependencies import CurrentUserDep
from app.db.pool import get_connection
from app.repositories.recruitment import EmailLogRepository

router = APIRouter(tags=["email-logs"])
ConnDep = Annotated[asyncpg.Connection, Depends(get_connection)]


@router.get("/email-logs")
async def list_email_logs(
    conn: ConnDep,
    _: CurrentUserDep,
    email_type: str | None = None,
    status: str | None = None,
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
) -> dict:
    total, rows = await EmailLogRepository(conn).list_paginated(email_type, status, offset, limit)
    return {"total": total, "offset": offset, "limit": limit, "items": [dict(r) for r in rows]}
