"""Database bootstrap: ensure schema exists and seed the default admin.

This mirrors the tables defined in ``database/schema.sql`` and is safe to run on
every startup (all statements are idempotent). In Part 3 this is superseded by
versioned Alembic migrations; it remains here so the app can cold-start against
an empty database in local/dev environments.
"""

from __future__ import annotations

from app.config import get_settings
from app.core.logging import get_logger
from app.core.security import hash_password
from app.db.pool import acquire

logger = get_logger(__name__)

_SCHEMA_DDL = """
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(100) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(50) DEFAULT 'recruiter' CHECK (role IN ('admin','recruiter')),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW(),
    last_login TIMESTAMP
);

-- Profile fields (idempotent — also upgrades pre-existing databases)
ALTER TABLE users ADD COLUMN IF NOT EXISTS full_name  VARCHAR(150);
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone      VARCHAR(30);
ALTER TABLE users ADD COLUMN IF NOT EXISTS job_title  VARCHAR(100);
ALTER TABLE users ADD COLUMN IF NOT EXISTS department VARCHAR(100);
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    required_skills TEXT[] DEFAULT '{}',
    min_experience INTEGER DEFAULT 0,
    status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active','closed','draft')),
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Per-skill importance weights (JSONB). This lived only in Alembic migration
-- 0003, but Docker startup bootstraps the schema from THIS file (not Alembic),
-- so a fresh DB had no skill_weights column and every job-create INSERT 500'd.
-- Idempotent: also upgrades pre-existing databases. Mirrors migration 0003.
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS skill_weights JSONB DEFAULT '{}'::jsonb;

-- Job location (shown in the announcement) and an optional custom post message
-- (when set, it replaces the default template for platform announcements).
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS location     TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS post_message TEXT;
-- Optional custom email templates (placeholders filled at send time). Blank →
-- the built-in default template is used.
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS interview_message TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS rejection_message TEXT;

CREATE TABLE IF NOT EXISTS candidates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255), email VARCHAR(255), phone VARCHAR(50),
    skills TEXT[] DEFAULT '{}',
    experience_years INTEGER DEFAULT 0,
    education TEXT,
    raw_text TEXT,
    cv_filename VARCHAR(255),
    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending','shortlisted','rejected')),
    match_score FLOAT DEFAULT 0,
    matched_job_id UUID REFERENCES jobs(id) ON DELETE SET NULL,
    ai_summary TEXT,
    uploaded_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

-- HR free-text notes on a candidate (private, not emailed).
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS notes TEXT;
-- Parser confidence 0-100 (how completely the CV was extracted).
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS parse_confidence INTEGER;
-- The job a candidate applied to via the public apply link (kept even after a
-- match run overwrites matched_job_id). NULLed automatically if the job is deleted.
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS applied_job_id UUID REFERENCES jobs(id) ON DELETE SET NULL;
-- Where the candidate entered the system: 'upload' (HR uploaded) or 'public'
-- (self-applied through the public link). Lets HR triage self-applications.
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS source VARCHAR(20) DEFAULT 'upload';

-- In-app notifications (team-wide feed of recruiting events).
CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type VARCHAR(40) NOT NULL,
    message TEXT NOT NULL,
    read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at DESC);

-- Password-reset tokens (only the SHA-256 hash is stored, never the token).
CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(64) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    used BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_prt_token_hash ON password_reset_tokens(token_hash);

CREATE TABLE IF NOT EXISTS match_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    candidate_id UUID REFERENCES candidates(id) ON DELETE CASCADE,
    job_id UUID REFERENCES jobs(id) ON DELETE CASCADE,
    score FLOAT NOT NULL,
    skill_score FLOAT, experience_score FLOAT, tfidf_score FLOAT, ai_score FLOAT,
    breakdown JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS interviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    candidate_id UUID REFERENCES candidates(id) ON DELETE CASCADE,
    job_id UUID REFERENCES jobs(id) ON DELETE SET NULL,
    candidate_name VARCHAR(255), candidate_email VARCHAR(255),
    job_title VARCHAR(255), match_score FLOAT,
    interview_time TIMESTAMPTZ, meet_link VARCHAR(500),
    email_sent BOOLEAN DEFAULT FALSE, email_sent_at TIMESTAMPTZ,
    status VARCHAR(50) DEFAULT 'scheduled' CHECK (status IN ('scheduled','completed','cancelled')),
    created_at TIMESTAMP DEFAULT NOW()
);

-- Post-interview evaluation captured by HR.
ALTER TABLE interviews ADD COLUMN IF NOT EXISTS rating   INTEGER;
ALTER TABLE interviews ADD COLUMN IF NOT EXISTS feedback TEXT;

-- Upgrade pre-existing dev databases where interview times were naive
-- TIMESTAMP (stored as Asia/Dhaka wall-clock). Idempotent via the type guard.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='interviews' AND column_name='interview_time'
          AND data_type='timestamp without time zone'
    ) THEN
        ALTER TABLE interviews
            ALTER COLUMN interview_time TYPE TIMESTAMPTZ
            USING interview_time AT TIME ZONE 'Asia/Dhaka';
        ALTER TABLE interviews
            ALTER COLUMN email_sent_at TYPE TIMESTAMPTZ
            USING email_sent_at AT TIME ZONE 'Asia/Dhaka';
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS match_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID REFERENCES jobs(id) ON DELETE CASCADE,
    status VARCHAR(20) DEFAULT 'running' CHECK (status IN ('running','completed','failed')),
    total INTEGER DEFAULT 0,
    processed INTEGER DEFAULT 0,
    shortlisted INTEGER DEFAULT 0,
    rejected INTEGER DEFAULT 0,
    emails_sent INTEGER DEFAULT 0,
    error TEXT,
    result JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    finished_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS cv_files (
    candidate_id UUID PRIMARY KEY REFERENCES candidates(id) ON DELETE CASCADE,
    filename VARCHAR(255),
    content BYTEA NOT NULL,
    content_type VARCHAR(100),
    uploaded_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS email_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    candidate_id UUID REFERENCES candidates(id) ON DELETE SET NULL,
    email_type VARCHAR(50),
    to_email VARCHAR(255), subject VARCHAR(500),
    status VARCHAR(50), error_msg TEXT,
    sent_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS job_postings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID REFERENCES jobs(id) ON DELETE CASCADE,
    platforms_attempted TEXT[], results JSONB,
    posted_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS evaluation_dataset (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cv_text TEXT NOT NULL,
    job_description TEXT NOT NULL,
    required_skills TEXT[] DEFAULT '{}',
    min_experience INTEGER DEFAULT 0,
    ground_truth_label VARCHAR(20) NOT NULL CHECK (ground_truth_label IN ('shortlisted','rejected')),
    ground_truth_score FLOAT,
    notes TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);
-- Optional independent second-annotator label, for Cohen's kappa. Left NULL
-- until a second human labels the samples (see Documentation/docs/ACCURACY.md).
ALTER TABLE evaluation_dataset ADD COLUMN IF NOT EXISTS second_label VARCHAR(20);

CREATE TABLE IF NOT EXISTS evaluation_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dataset_id UUID REFERENCES evaluation_dataset(id) ON DELETE CASCADE,
    predicted_score FLOAT, predicted_label VARCHAR(20),
    skill_score FLOAT, experience_score FLOAT, tfidf_score FLOAT, ai_score FLOAT,
    is_correct BOOLEAN,
    evaluated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_candidates_status ON candidates(status);
CREATE INDEX IF NOT EXISTS idx_candidates_match_score ON candidates(match_score DESC);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_match_results_candidate ON match_results(candidate_id);
CREATE INDEX IF NOT EXISTS idx_email_logs_sent_at ON email_logs(sent_at DESC);
"""


async def init_database() -> None:
    """Create tables/indexes if missing and seed the default admin user.

    Credential hygiene: when ``ADMIN_INITIAL_PASSWORD`` is set, the admin is
    seeded with it and may use it normally. When it is NOT set, the well-known
    dev fallback is seeded WITH ``must_change_password=TRUE`` — the frontend
    blocks all use of the app until the password is rotated, so the default
    credential never survives a first login.
    """
    settings = get_settings()
    async with acquire() as conn:
        await conn.execute(_SCHEMA_DDL)
        admin_count = await conn.fetchval("SELECT COUNT(*) FROM users WHERE role = 'admin'")
        if admin_count == 0:
            initial = settings.admin_initial_password
            password = initial or "admin123"
            must_change = not initial
            await conn.execute(
                "INSERT INTO users (username, email, password_hash, role, "
                "must_change_password) "
                "VALUES ('admin', 'admin@hrsystem.com', $1, 'admin', $2)",
                hash_password(password),
                must_change,
            )
            if must_change:
                logger.warning(
                    "seeded admin with the well-known dev password; a password "
                    "change is FORCED on first login (set ADMIN_INITIAL_PASSWORD "
                    "to seed a custom one)"
                )
            else:
                logger.info("seeded admin account from ADMIN_INITIAL_PASSWORD")
    logger.info("database schema ready")
