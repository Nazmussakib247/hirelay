"""add user profile fields

Revision ID: 0002_user_profile
Revises: 0001_initial
Create Date: 2026-07-02
"""
from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "0002_user_profile"
down_revision: str | None = "0001_initial"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_COLUMNS = [
    ("full_name", "VARCHAR(150)"),
    ("phone", "VARCHAR(30)"),
    ("job_title", "VARCHAR(100)"),
    ("department", "VARCHAR(100)"),
    ("avatar_url", "TEXT"),
]


def upgrade() -> None:
    for name, ddl_type in _COLUMNS:
        op.execute(f"ALTER TABLE users ADD COLUMN IF NOT EXISTS {name} {ddl_type}")
    op.execute(
        "COMMENT ON COLUMN users.full_name IS "
        "'Display name used in emails, interview invites, and audit trails'"
    )


def downgrade() -> None:
    for name, _ in _COLUMNS:
        op.execute(f"ALTER TABLE users DROP COLUMN IF EXISTS {name}")
