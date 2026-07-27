"""Data-access for the ``app_settings`` key/value table."""

from __future__ import annotations

import asyncpg


class SettingsRepository:
    def __init__(self, conn: asyncpg.Connection) -> None:
        self._conn = conn

    async def all(self) -> list[asyncpg.Record]:
        return list(await self._conn.fetch("SELECT key, value FROM app_settings"))

    async def upsert(self, key: str, value: str) -> None:
        await self._conn.execute(
            "INSERT INTO app_settings (key, value, updated_at) VALUES ($1, $2, NOW()) "
            "ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()",
            key,
            value,
        )

    async def delete(self, key: str) -> None:
        await self._conn.execute("DELETE FROM app_settings WHERE key = $1", key)
