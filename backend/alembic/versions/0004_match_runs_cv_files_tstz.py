"""match_runs + cv_files tables; interview timestamps to TIMESTAMPTZ

Revision ID: 0004_runs_files_tstz
Revises: 0003_job_skill_weights
Create Date: 2026-07-20
"""
from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "0004_runs_files_tstz"
down_revision: str | None = "0003_job_skill_weights"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Existing interview_time values were written as Asia/Dhaka wall-clock time
# (the app's configured TIMEZONE), so the conversion pins that zone.
_LEGACY_TZ = "Asia/Dhaka"


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS match_runs (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            job_id UUID REFERENCES jobs(id) ON DELETE CASCADE,
            status VARCHAR(20) DEFAULT 'running'
                CHECK (status IN ('running','completed','failed')),
            total INTEGER DEFAULT 0,
            processed INTEGER DEFAULT 0,
            shortlisted INTEGER DEFAULT 0,
            rejected INTEGER DEFAULT 0,
            emails_sent INTEGER DEFAULT 0,
            error TEXT,
            result JSONB,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            finished_at TIMESTAMPTZ
        )
        """
    )
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS cv_files (
            candidate_id UUID PRIMARY KEY REFERENCES candidates(id) ON DELETE CASCADE,
            filename VARCHAR(255),
            content BYTEA NOT NULL,
            content_type VARCHAR(100),
            uploaded_at TIMESTAMPTZ DEFAULT NOW()
        )
        """
    )
    op.execute(
        f"""
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name='interviews' AND column_name='interview_time'
                  AND data_type='timestamp without time zone'
            ) THEN
                ALTER TABLE interviews
                    ALTER COLUMN interview_time TYPE TIMESTAMPTZ
                    USING interview_time AT TIME ZONE '{_LEGACY_TZ}';
                ALTER TABLE interviews
                    ALTER COLUMN email_sent_at TYPE TIMESTAMPTZ
                    USING email_sent_at AT TIME ZONE '{_LEGACY_TZ}';
            END IF;
        END $$;
        """
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS cv_files")
    op.execute("DROP TABLE IF EXISTS match_runs")
    op.execute(
        f"""
        ALTER TABLE interviews
            ALTER COLUMN interview_time TYPE TIMESTAMP
            USING interview_time AT TIME ZONE '{_LEGACY_TZ}'
        """
    )
    op.execute(
        f"""
        ALTER TABLE interviews
            ALTER COLUMN email_sent_at TYPE TIMESTAMP
            USING email_sent_at AT TIME ZONE '{_LEGACY_TZ}'
        """
    )
