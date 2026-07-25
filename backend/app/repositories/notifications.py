"""Data-access for the team-wide in-app notification feed."""

from __future__ import annotations

import asyncpg


class NotificationRepository:
    def __init__(self, conn: asyncpg.Connection) -> None:
        self._conn = conn

    async def create(self, type_: str, message: str) -> None:
        await self._conn.execute(
            "INSERT INTO notifications (type, message) VALUES ($1, $2)",
            type_,
            message,
        )

    async def list_recent(self, limit: int = 30) -> list[asyncpg.Record]:
        return list(
            await self._conn.fetch(
                "SELECT * FROM notifications ORDER BY created_at DESC LIMIT $1", limit
            )
        )

    async def unread_count(self) -> int:
        n = await self._conn.fetchval("SELECT COUNT(*) FROM notifications WHERE read = FALSE")
        return int(n or 0)

    async def mark_all_read(self) -> int:
        rows = await self._conn.fetch(
            "UPDATE notifications SET read = TRUE WHERE read = FALSE RETURNING id"
        )
        return len(rows)


async def notify(conn: asyncpg.Connection, type_: str, message: str) -> None:
    """Fire-and-forget helper to record a notification.

    Never raises — a notification failure must not break the action that
    triggered it (upload, match, schedule).
    """
    try:
        await NotificationRepository(conn).create(type_, message)
    except Exception:  # noqa: BLE001 - notifications are best-effort
        pass
