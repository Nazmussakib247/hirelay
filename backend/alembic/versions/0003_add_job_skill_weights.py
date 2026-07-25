"""add per-skill weights to jobs

Revision ID: 0003_job_skill_weights
Revises: 0002_user_profile
Create Date: 2026-07-07
"""
from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "0003_job_skill_weights"
down_revision: str | None = "0002_user_profile"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE jobs ADD COLUMN IF NOT EXISTS skill_weights JSONB DEFAULT '{}'::jsonb"
    )
    op.execute(
        "COMMENT ON COLUMN jobs.skill_weights IS "
        "'Per-skill importance weights (1-10) keyed by skill keyword, "
        "e.g. {\"python\": 9, \"docker\": 4}. Empty = all skills weighted equally.'"
    )


def downgrade() -> None:
    op.execute("ALTER TABLE jobs DROP COLUMN IF EXISTS skill_weights")
