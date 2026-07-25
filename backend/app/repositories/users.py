"""Data-access for the ``users`` table.

All SQL touching ``users`` is centralised here so services depend on a small,
testable interface rather than embedding query strings inline.
"""

from __future__ import annotations

import uuid
from typing import Any

import asyncpg


class UserRepository:
    def __init__(self, conn: asyncpg.Connection) -> None:
        self._conn = conn

    async def get_by_username_or_email(self, identifier: str) -> asyncpg.Record | None:
        return await self._conn.fetchrow(
            "SELECT * FROM users WHERE (username = $1 OR email = $1) AND is_active = TRUE",
            identifier,
        )

    _PUBLIC_COLUMNS = (
        "id, username, email, role, full_name, phone, job_title, department, "
        "avatar_url, is_active, created_at, last_login, must_change_password"
    )

    async def get_by_id(self, user_id: str) -> asyncpg.Record | None:
        return await self._conn.fetchrow(
            f"SELECT {self._PUBLIC_COLUMNS} FROM users WHERE id = $1",
            uuid.UUID(user_id),
        )

    async def list_all(self) -> list[asyncpg.Record]:
        rows = await self._conn.fetch(
            f"SELECT {self._PUBLIC_COLUMNS} FROM users ORDER BY created_at"
        )
        return list(rows)

    async def touch_last_login(self, user_id: Any) -> None:
        await self._conn.execute("UPDATE users SET last_login = NOW() WHERE id = $1", user_id)

    async def update_password_hash(self, user_id: Any, password_hash: str) -> None:
        await self._conn.execute(
            "UPDATE users SET password_hash = $1 WHERE id = $2",
            password_hash,
            user_id,
        )

    async def get_password_hash(self, user_id: str) -> str | None:
        stored = await self._conn.fetchval(
            "SELECT password_hash FROM users WHERE id = $1 AND is_active = TRUE",
            uuid.UUID(user_id),
        )
        return str(stored) if stored is not None else None

    async def set_password(self, user_id: str, password_hash: str) -> None:
        """User-initiated password change: also clears the force-change flag."""
        await self._conn.execute(
            "UPDATE users SET password_hash = $1, must_change_password = FALSE WHERE id = $2",
            password_hash,
            uuid.UUID(user_id),
        )

    async def create(
        self,
        username: str,
        email: str,
        password_hash: str,
        role: str,
        full_name: str | None = None,
    ) -> str:
        new_id = await self._conn.fetchval(
            "INSERT INTO users (username, email, password_hash, role, full_name) "
            "VALUES ($1, $2, $3, $4, $5) RETURNING id",
            username,
            email,
            password_hash,
            role,
            full_name,
        )
        return str(new_id)

    _PROFILE_FIELDS = ("full_name", "phone", "job_title", "department", "avatar_url")

    async def update_profile(self, user_id: Any, fields: dict[str, Any]) -> asyncpg.Record | None:
        """Update the given profile fields; unknown keys are ignored."""
        updates = {k: v for k, v in fields.items() if k in self._PROFILE_FIELDS}
        if not updates:
            return await self.get_by_id(str(user_id))
        set_clause = ", ".join(f"{col} = ${i + 2}" for i, col in enumerate(updates))
        return await self._conn.fetchrow(
            f"UPDATE users SET {set_clause} WHERE id = $1 RETURNING {self._PUBLIC_COLUMNS}",
            user_id,
            *updates.values(),
        )

    async def exists_username_or_email(self, username: str, email: str) -> bool:
        found = await self._conn.fetchval(
            "SELECT 1 FROM users WHERE username = $1 OR email = $2",
            username,
            email,
        )
        return bool(found)

    async def get_by_email(self, email: str) -> asyncpg.Record | None:
        return await self._conn.fetchrow(
            "SELECT * FROM users WHERE lower(email) = lower($1) AND is_active = TRUE",
            email,
        )

    async def set_password_by_id(self, user_id: Any, password_hash: str) -> None:
        """Set a new password and clear the forced-rotation flag (reset flow)."""
        await self._conn.execute(
            "UPDATE users SET password_hash = $1, must_change_password = FALSE WHERE id = $2",
            password_hash,
            user_id,
        )


class PasswordResetRepository:
    """Data-access for one-time password-reset tokens (hashes only)."""

    def __init__(self, conn: asyncpg.Connection) -> None:
        self._conn = conn

    async def create(self, user_id: Any, token_hash: str, expires_at: Any) -> None:
        await self._conn.execute(
            "INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) "
            "VALUES ($1, $2, $3)",
            user_id,
            token_hash,
            expires_at,
        )

    async def get_valid(self, token_hash: str) -> asyncpg.Record | None:
        """Return an unused, unexpired token row for this hash, or None."""
        return await self._conn.fetchrow(
            "SELECT * FROM password_reset_tokens "
            "WHERE token_hash = $1 AND used = FALSE AND expires_at > NOW()",
            token_hash,
        )

    async def mark_used(self, token_id: Any) -> None:
        await self._conn.execute(
            "UPDATE password_reset_tokens SET used = TRUE WHERE id = $1", token_id
        )

    async def invalidate_for_user(self, user_id: Any) -> None:
        """Burn any outstanding tokens for a user (e.g. after a successful reset)."""
        await self._conn.execute(
            "UPDATE password_reset_tokens SET used = TRUE WHERE user_id = $1 AND used = FALSE",
            user_id,
        )
