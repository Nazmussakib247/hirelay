"""add users.must_change_password (forced rotation for bootstrap accounts)

Revision ID: 0005_must_change_pw
Revises: 0004_runs_files_tstz
Create Date: 2026-07-20
"""
from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "0005_must_change_pw"
down_revision: str | None = "0004_runs_files_tstz"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS "
        "must_change_password BOOLEAN DEFAULT FALSE"
    )
    # Any account still carrying the well-known seeded credential is forced
    # to rotate: flag every admin whose hash matches bcrypt-of-'admin123'?
    # We cannot compare bcrypt server-side; instead flag the seeded username
    # so existing default-credential deployments get the forced change too.
    op.execute(
        "UPDATE users SET must_change_password = TRUE "
        "WHERE username = 'admin' AND email = 'admin@hrsystem.com'"
    )


def downgrade() -> None:
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS must_change_password")
