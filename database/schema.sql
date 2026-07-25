-- ============================================================
-- HR Recruiting System — Database Schema
-- PostgreSQL 16
-- Version: 2.0  |  Author: Nazmus Sakib
-- ============================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- TABLE: users
-- Stores HR system users (admin, recruiter roles)
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username        VARCHAR(100) UNIQUE NOT NULL,
    email           VARCHAR(255) UNIQUE NOT NULL,
    password_hash   VARCHAR(255) NOT NULL,           -- bcrypt hash (legacy SHA-256 auto-upgraded on login)
    role            VARCHAR(50)  DEFAULT 'recruiter' CHECK (role IN ('admin','recruiter')),
    -- Personal profile
    full_name       VARCHAR(150),
    phone           VARCHAR(30),
    job_title       VARCHAR(100),                    -- e.g. 'Senior Recruiter'
    department      VARCHAR(100),
    avatar_url      TEXT,
    is_active       BOOLEAN      DEFAULT TRUE,
    must_change_password BOOLEAN DEFAULT FALSE,      -- TRUE on seeded/bootstrap accounts: client forces rotation
    created_at      TIMESTAMP    DEFAULT NOW(),
    last_login      TIMESTAMP
);

COMMENT ON TABLE  users                IS 'HR system users — admins and recruiters';
COMMENT ON COLUMN users.password_hash  IS 'bcrypt hashed password (legacy SHA-256 verified and auto-upgraded on login)';
COMMENT ON COLUMN users.role           IS 'admin: full access | recruiter: read/write candidates & jobs';
COMMENT ON COLUMN users.full_name      IS 'Display name used in emails, interview invites, and audit trails';

-- ============================================================
-- TABLE: jobs
-- Job postings created by HR users
-- ============================================================
CREATE TABLE IF NOT EXISTS jobs (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title            VARCHAR(255) NOT NULL,
    description      TEXT,
    required_skills  TEXT[]       DEFAULT '{}',      -- e.g. {python, django, docker}
    skill_weights    JSONB        DEFAULT '{}',       -- per-skill weight 1-10, e.g. {"python": 9}
    min_experience   INTEGER      DEFAULT 0,          -- minimum years required
    status           VARCHAR(50)  DEFAULT 'active' CHECK (status IN ('active','closed','draft')),
    created_by       UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at       TIMESTAMP DEFAULT NOW()
);

COMMENT ON TABLE  jobs                  IS 'Job postings managed by HR team';
COMMENT ON COLUMN jobs.required_skills  IS 'Array of required skill keywords';
COMMENT ON COLUMN jobs.skill_weights    IS 'Per-skill importance weights (1-10) keyed by skill keyword. Empty = equal weights';
COMMENT ON COLUMN jobs.min_experience   IS 'Minimum years of experience required';

-- ============================================================
-- TABLE: candidates
-- CV data extracted by NLP engine
-- ============================================================
CREATE TABLE IF NOT EXISTS candidates (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name             VARCHAR(255),
    email            VARCHAR(255),
    phone            VARCHAR(50),
    skills           TEXT[]    DEFAULT '{}',          -- extracted skills array
    experience_years INTEGER   DEFAULT 0,
    education        TEXT,
    raw_text         TEXT,                             -- first 5000 chars of CV text
    cv_filename      VARCHAR(255),
    status           VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending','shortlisted','rejected')),
    match_score      FLOAT     DEFAULT 0,              -- 0-100 final score
    matched_job_id   UUID REFERENCES jobs(id) ON DELETE SET NULL,
    ai_summary       TEXT,                             -- Groq LLM generated summary
    uploaded_by      UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at       TIMESTAMP DEFAULT NOW()
);

COMMENT ON TABLE  candidates              IS 'Candidate profiles extracted from uploaded CVs';
COMMENT ON COLUMN candidates.skills       IS 'NLP-extracted skill list from CV text';
COMMENT ON COLUMN candidates.match_score  IS 'Weighted AI score (0-100). ≥70 = shortlisted';
COMMENT ON COLUMN candidates.ai_summary   IS 'Groq LLaMA3 generated 2-sentence assessment';

-- ============================================================
-- TABLE: match_results
-- Detailed breakdown of every matching run
-- ============================================================
CREATE TABLE IF NOT EXISTS match_results (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    candidate_id      UUID REFERENCES candidates(id) ON DELETE CASCADE,
    job_id            UUID REFERENCES jobs(id) ON DELETE CASCADE,
    score             FLOAT NOT NULL,                  -- final weighted score
    skill_score       FLOAT,                           -- Jaccard skill similarity (35%)
    experience_score  FLOAT,                           -- years ratio score (25%)
    tfidf_score       FLOAT,                           -- TF-IDF cosine similarity (10%)
    ai_score          FLOAT,                           -- Groq LLM score (30%)
    breakdown         JSONB,                           -- full scoring breakdown JSON
    created_at        TIMESTAMP DEFAULT NOW()
);

COMMENT ON TABLE  match_results             IS 'Detailed per-candidate scoring breakdown';
COMMENT ON COLUMN match_results.breakdown   IS 'JSON: {skill_match, experience_match, text_similarity, ai_score, strengths, gaps}';
COMMENT ON COLUMN match_results.skill_score IS 'Jaccard set similarity — CV skills vs required skills (weight: 35%)';
COMMENT ON COLUMN match_results.tfidf_score IS 'TF-IDF cosine similarity between CV text and job description (weight: 10%)';

-- ============================================================
-- TABLE: interviews
-- Scheduled interviews for shortlisted candidates
-- ============================================================
CREATE TABLE IF NOT EXISTS interviews (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    candidate_id     UUID REFERENCES candidates(id) ON DELETE CASCADE,
    job_id           UUID REFERENCES jobs(id) ON DELETE SET NULL,
    candidate_name   VARCHAR(255),
    candidate_email  VARCHAR(255),
    job_title        VARCHAR(255),
    match_score      FLOAT,
    interview_time   TIMESTAMPTZ,
    meet_link        VARCHAR(500),                     -- auto-generated video meeting URL (Jitsi Meet)
    email_sent       BOOLEAN   DEFAULT FALSE,
    email_sent_at    TIMESTAMPTZ,
    status           VARCHAR(50) DEFAULT 'scheduled' CHECK (status IN ('scheduled','completed','cancelled')),
    created_at       TIMESTAMP DEFAULT NOW()
);

COMMENT ON TABLE  interviews            IS 'Interview records for shortlisted candidates';
COMMENT ON COLUMN interviews.meet_link  IS 'Auto-generated Jitsi Meet room URL (e.g. meet.jit.si/hr-interview-xxxx)';

-- ============================================================
-- TABLE: match_runs
-- Background match-all runs: live progress + final summary
-- ============================================================
CREATE TABLE IF NOT EXISTS match_runs (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id       UUID REFERENCES jobs(id) ON DELETE CASCADE,
    status       VARCHAR(20) DEFAULT 'running' CHECK (status IN ('running','completed','failed')),
    total        INTEGER DEFAULT 0,
    processed    INTEGER DEFAULT 0,
    shortlisted  INTEGER DEFAULT 0,
    rejected     INTEGER DEFAULT 0,
    emails_sent  INTEGER DEFAULT 0,
    error        TEXT,
    result       JSONB,                             -- final summary (same shape as old sync response)
    created_at   TIMESTAMPTZ DEFAULT NOW(),
    finished_at  TIMESTAMPTZ
);

COMMENT ON TABLE match_runs IS 'Async match-all runs; poll GET /match-runs/{id} for progress';

-- ============================================================
-- TABLE: cv_files
-- Original uploaded CV documents (PDF/DOCX bytes)
-- ============================================================
CREATE TABLE IF NOT EXISTS cv_files (
    candidate_id  UUID PRIMARY KEY REFERENCES candidates(id) ON DELETE CASCADE,
    filename      VARCHAR(255),
    content       BYTEA NOT NULL,
    content_type  VARCHAR(100),
    uploaded_at   TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE cv_files IS 'Source documents for download via GET /candidates/{id}/cv';

-- ============================================================
-- TABLE: email_logs
-- Audit trail for every email sent/failed
-- ============================================================
CREATE TABLE IF NOT EXISTS email_logs (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    candidate_id  UUID REFERENCES candidates(id) ON DELETE SET NULL,
    email_type    VARCHAR(50) CHECK (email_type IN ('interview','rejection','resend','n8n_trigger','report')),
    to_email      VARCHAR(255),
    subject       VARCHAR(500),
    status        VARCHAR(50) CHECK (status IN ('sent','failed','pending')),
    error_msg     TEXT,                                -- SMTP error detail if failed
    sent_at       TIMESTAMP DEFAULT NOW()
);

COMMENT ON TABLE  email_logs            IS 'Complete audit log of all email dispatch attempts';
COMMENT ON COLUMN email_logs.error_msg  IS 'SMTP error message if status = failed';

-- ============================================================
-- TABLE: job_postings
-- History of job board postings per platform
-- ============================================================
CREATE TABLE IF NOT EXISTS job_postings (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id               UUID REFERENCES jobs(id) ON DELETE CASCADE,
    platforms_attempted  TEXT[],                       -- e.g. {linkedin, telegram, bdjobs}
    results              JSONB,                        -- per-platform result JSON
    posted_at            TIMESTAMP DEFAULT NOW()
);

COMMENT ON TABLE  job_postings          IS 'Job board posting history across all platforms';
COMMENT ON COLUMN job_postings.results  IS 'JSON: {platform: {status, post_id, url, error}}';

-- ============================================================
-- TABLE: evaluation_dataset
-- 50 labelled CV-job pairs for accuracy benchmarking
-- ============================================================
CREATE TABLE IF NOT EXISTS evaluation_dataset (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cv_text              TEXT NOT NULL,
    job_description      TEXT NOT NULL,
    required_skills      TEXT[] DEFAULT '{}',
    min_experience       INTEGER DEFAULT 0,
    ground_truth_label   VARCHAR(20) NOT NULL CHECK (ground_truth_label IN ('shortlisted','rejected')),
    ground_truth_score   FLOAT,
    notes                TEXT,
    created_at           TIMESTAMP DEFAULT NOW()
);

COMMENT ON TABLE  evaluation_dataset                    IS '50 hand-labelled CV-job pairs for matching engine evaluation';
COMMENT ON COLUMN evaluation_dataset.ground_truth_label IS 'Human-assigned correct classification label';

-- ============================================================
-- TABLE: evaluation_results
-- Results of each evaluation run (precision/recall/F1)
-- ============================================================
CREATE TABLE IF NOT EXISTS evaluation_results (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dataset_id       UUID REFERENCES evaluation_dataset(id) ON DELETE CASCADE,
    predicted_score  FLOAT,
    predicted_label  VARCHAR(20) CHECK (predicted_label IN ('shortlisted','rejected')),
    skill_score      FLOAT,
    experience_score FLOAT,
    tfidf_score      FLOAT,
    ai_score         FLOAT,
    is_correct       BOOLEAN,                          -- predicted_label == ground_truth_label
    evaluated_at     TIMESTAMP DEFAULT NOW()
);

COMMENT ON TABLE  evaluation_results            IS 'Per-sample results from evaluation runs';
COMMENT ON COLUMN evaluation_results.is_correct IS 'TRUE if predicted_label matches ground_truth_label';

-- ============================================================
-- INDEXES — for query performance
-- ============================================================

-- Candidates: common filter & sort patterns
CREATE INDEX IF NOT EXISTS idx_candidates_status       ON candidates(status);
CREATE INDEX IF NOT EXISTS idx_candidates_match_score  ON candidates(match_score DESC);
CREATE INDEX IF NOT EXISTS idx_candidates_matched_job  ON candidates(matched_job_id);
CREATE INDEX IF NOT EXISTS idx_candidates_created_at   ON candidates(created_at DESC);

-- Jobs: active job lookup
CREATE INDEX IF NOT EXISTS idx_jobs_status      ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_created_at  ON jobs(created_at DESC);

-- Match results: lookup by candidate or job
CREATE INDEX IF NOT EXISTS idx_match_results_candidate  ON match_results(candidate_id);
CREATE INDEX IF NOT EXISTS idx_match_results_job        ON match_results(job_id);

-- Interviews: lookup by candidate
CREATE INDEX IF NOT EXISTS idx_interviews_candidate  ON interviews(candidate_id);
CREATE INDEX IF NOT EXISTS idx_interviews_email_sent ON interviews(email_sent);

-- Email logs: recent logs first, filter by type
CREATE INDEX IF NOT EXISTS idx_email_logs_sent_at    ON email_logs(sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_logs_type       ON email_logs(email_type);
CREATE INDEX IF NOT EXISTS idx_email_logs_status     ON email_logs(status);

-- Evaluation: lookup by dataset
CREATE INDEX IF NOT EXISTS idx_eval_results_dataset  ON evaluation_results(dataset_id);

-- ============================================================
-- SEED DATA — Default admin user
-- Password: admin123  (SHA-256 hashed)
-- ============================================================
INSERT INTO users (username, email, password_hash, role)
VALUES (
    'admin',
    'admin@hrsystem.com',
    '240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9',  -- SHA-256('admin123')
    'admin'
)
ON CONFLICT (username) DO NOTHING;

-- Sample recruiter user
-- Password: recruiter123
INSERT INTO users (username, email, password_hash, role)
VALUES (
    'recruiter',
    'recruiter@hrsystem.com',
    'a7ffc6f8bf1ed76651c14756a061d662f580ff4de43b49fa82d80a4b80f8434a',  -- SHA-256('recruiter123')
    'recruiter'
)
ON CONFLICT (username) DO NOTHING;

-- Sample job postings
INSERT INTO jobs (title, description, required_skills, min_experience, status)
VALUES
(
    'Senior Python Developer',
    'We are looking for an experienced Python developer to join our backend team. You will design and build scalable APIs using FastAPI and Django, manage PostgreSQL databases, and deploy services via Docker and Kubernetes.',
    ARRAY['python', 'django', 'fastapi', 'postgresql', 'docker', 'rest api', 'git'],
    3,
    'active'
),
(
    'React Frontend Engineer',
    'We need a talented React developer to build modern, responsive web interfaces. Experience with TypeScript, Tailwind CSS, and state management libraries is required.',
    ARRAY['react', 'typescript', 'javascript', 'tailwind', 'git', 'rest api'],
    2,
    'active'
),
(
    'DevOps / Cloud Engineer',
    'Seeking a DevOps engineer to manage our cloud infrastructure on AWS. You will build CI/CD pipelines, maintain Kubernetes clusters, and implement infrastructure-as-code using Terraform.',
    ARRAY['aws', 'docker', 'kubernetes', 'terraform', 'ci/cd', 'linux', 'ansible'],
    4,
    'active'
)
ON CONFLICT DO NOTHING;

-- ============================================================
-- VIEWS — useful for reporting
-- ============================================================

-- Recruitment funnel summary
CREATE OR REPLACE VIEW vw_recruitment_funnel AS
SELECT
    COUNT(*)                                                      AS total_cvs,
    COUNT(CASE WHEN status = 'shortlisted' THEN 1 END)           AS shortlisted,
    COUNT(CASE WHEN status = 'rejected'    THEN 1 END)           AS rejected,
    COUNT(CASE WHEN status = 'pending'     THEN 1 END)           AS pending,
    ROUND(AVG(match_score)::NUMERIC, 1)                          AS avg_score,
    MAX(match_score)                                             AS top_score,
    ROUND(COUNT(CASE WHEN status='shortlisted' THEN 1 END) * 100.0
          / NULLIF(COUNT(*), 0), 1)                              AS shortlist_rate_pct
FROM candidates;

COMMENT ON VIEW vw_recruitment_funnel IS 'Real-time recruitment funnel metrics';

-- Job performance view
CREATE OR REPLACE VIEW vw_job_performance AS
SELECT
    j.id,
    j.title,
    j.status,
    COUNT(c.id)                                                   AS total_applied,
    COUNT(CASE WHEN c.status = 'shortlisted' THEN 1 END)         AS shortlisted,
    COUNT(CASE WHEN c.status = 'rejected'    THEN 1 END)         AS rejected,
    ROUND(AVG(c.match_score)::NUMERIC, 1)                        AS avg_match_score,
    MAX(c.match_score)                                           AS best_score,
    j.created_at
FROM jobs j
LEFT JOIN candidates c ON c.matched_job_id = j.id
GROUP BY j.id, j.title, j.status, j.created_at
ORDER BY total_applied DESC;

COMMENT ON VIEW vw_job_performance IS 'Per-job recruitment statistics';

-- Email performance view
CREATE OR REPLACE VIEW vw_email_performance AS
SELECT
    email_type,
    COUNT(*)                                                      AS total_sent,
    COUNT(CASE WHEN status = 'sent'   THEN 1 END)                AS successful,
    COUNT(CASE WHEN status = 'failed' THEN 1 END)                AS failed,
    ROUND(COUNT(CASE WHEN status='sent' THEN 1 END) * 100.0
          / NULLIF(COUNT(*), 0), 1)                              AS success_rate_pct
FROM email_logs
GROUP BY email_type;

COMMENT ON VIEW vw_email_performance IS 'Email dispatch success rates by type';
