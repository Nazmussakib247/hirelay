"""initial schema

Revision ID: 0001_initial
Revises:
Create Date: 2026-07-01
"""
from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "0001_initial"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_TABLES = [
    "evaluation_results",
    "evaluation_dataset",
    "job_postings",
    "email_logs",
    "interviews",
    "match_results",
    "candidates",
    "jobs",
    "users",
]

_DDL = """
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
    interview_time TIMESTAMP, meet_link VARCHAR(500),
    email_sent BOOLEAN DEFAULT FALSE, email_sent_at TIMESTAMP,
    status VARCHAR(50) DEFAULT 'scheduled' CHECK (status IN ('scheduled','completed','cancelled')),
    created_at TIMESTAMP DEFAULT NOW()
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
CREATE INDEX IF NOT EXISTS idx_candidates_matched_job ON candidates(matched_job_id);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_match_results_candidate ON match_results(candidate_id);
CREATE INDEX IF NOT EXISTS idx_match_results_job ON match_results(job_id);
CREATE INDEX IF NOT EXISTS idx_interviews_candidate ON interviews(candidate_id);
CREATE INDEX IF NOT EXISTS idx_email_logs_sent_at ON email_logs(sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_logs_type ON email_logs(email_type);
CREATE INDEX IF NOT EXISTS idx_eval_results_dataset ON evaluation_results(dataset_id);
"""


def upgrade() -> None:
    op.execute(_DDL)


def downgrade() -> None:
    for table in _TABLES:
        op.execute(f"DROP TABLE IF EXISTS {table} CASCADE")
