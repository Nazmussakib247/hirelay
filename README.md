# Automated HR Recruiting System

An end-to-end, AI-powered recruiting platform built as a CSE Field Work /
Industrial Training project. It automates the full hiring pipeline: a CV is
uploaded, its contents are extracted with a hybrid NLP + LLM parser, the
candidate is scored against a job with a four-component matching engine,
shortlisted candidates automatically receive an interview invitation with a
real, working video-meeting link, rejected candidates receive a polite update,
jobs are announced to external platforms, and HR gets analytics dashboards and
a scheduled daily email report — all orchestrated through a single n8n
automation workflow.

![Python](https://img.shields.io/badge/Python-3.11-blue)
![FastAPI](https://img.shields.io/badge/FastAPI-0.111-009688)
![React](https://img.shields.io/badge/React-18-61DAFB)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-336791)
![n8n](https://img.shields.io/badge/n8n-automation-EA4B71)
![Docker](https://img.shields.io/badge/Docker-Compose-2496ED)
![Tests](https://img.shields.io/badge/backend_tests-197_passing-brightgreen)
![Coverage](https://img.shields.io/badge/backend_coverage-70%25-green)
![mypy](https://img.shields.io/badge/mypy-clean-blue)
![License](https://img.shields.io/badge/license-MIT-lightgrey)

---

## Table of Contents

1. [System Overview](#system-overview)
2. [Architecture](#architecture)
3. [Features](#features)
4. [How the AI Matching Works](#how-the-ai-matching-works)
5. [Screenshots](#screenshots)
6. [Quick Start (Docker — recommended)](#quick-start-docker--recommended)
7. [Manual Setup (without Docker)](#manual-setup-without-docker)
8. [Credentials Guide](#credentials-guide)
9. [n8n Automation](#n8n-automation)
10. [Evaluation and Accuracy](#evaluation-and-accuracy)
11. [Project Structure](#project-structure)
12. [API Overview](#api-overview)
13. [Running the Tests](#running-the-tests)
14. [Troubleshooting](#troubleshooting)
15. [Author](#author)

---

## System Overview

The system replaces the manual screening stage of recruitment. A recruiter
uploads a CV; everything after that is automatic:

```
Upload CV  ->  Extract fields (NLP + LLM)  ->  Score against job (4 components)
    ->  Shortlist / Reject decision (threshold)
    ->  Shortlisted: schedule interview + email a real video-meeting link
    ->  Rejected:    polite update email
    ->  Every step logged, visualized in Analytics, and reported daily by n8n
```

## Architecture

```
+---------------------------------------------------------------+
|                       BROWSER CLIENT                          |
|      React 18 + Vite  ·  8 tabs  ·  JWT auth (in memory)      |
+------------------------------+--------------------------------+
                               | HTTP/REST, Bearer JWT
+------------------------------v--------------------------------+
|                 FastAPI Backend  (port 8000)                  |
|                                                               |
|  CV Parser            Match Engine           Email Service    |
|  PDF: pdfplumber      Skill overlap 50%      Gmail SMTP       |
|   + pypdf (dual)      Experience   30%       HTML templates   |
|  DOCX: python-docx    TF-IDF*      20%       Jitsi Meet links |
|  + Groq LLM merge     + Groq AI rerank*                       |
|                                                               |
|  Job Poster           Evaluation             Analytics        |
|  LinkedIn/Telegram    50-sample benchmark    Funnel, charts,  |
|  Twitter/webhook      + ablation study       top skills       |
+------------------------------+--------------------------------+
                               | asyncpg pool
+------------------------------v--------------------------------+
|                  PostgreSQL 16  (port 5432)                   |
|   users · candidates · jobs · match_results · interviews      |
|   email_logs · job_postings · evaluation_(dataset|results)    |
+------------------------------+--------------------------------+
                               | webhooks (fire-and-forget)
+------------------------------v--------------------------------+
|                     n8n  (port 5678)                          |
|      ONE master workflow, four branches (see below)           |
+---------------------------------------------------------------+

* Groq (Llama 3.1) is used when GROQ_API_KEY is set; without it the system
  gracefully falls back to deterministic 3-component scoring.
```

## Features

**CV parsing (hybrid NLP + AI).** Text is extracted from PDFs with a dual
engine — layout-aware `pdfplumber` (handles multi-column CVs and skill
tables) and `pypdf` as a fallback, keeping whichever yields more content.
DOCX files are read including tables. A deterministic NLP pipeline then
extracts name, email, phone (Bangladeshi and international formats),
skills (vocabulary + aliases + per-job custom keywords + explicit skills
sections), experience years (stated or computed from employment date ranges
with overlap merging), and education (degree-ranked). When a Groq API key is
configured, an LLM pass extracts the same fields and the results are merged
with per-field anti-hallucination validation — the AI can only improve
accuracy, never break an upload.

**AI matching engine.** Each candidate-job pair is scored 0-100 from four
components: skill overlap (with optional per-skill weights set by HR),
experience ratio, TF-IDF cosine similarity between CV text and job description
(smoothed IDF over a bundled background corpus), and an optional Groq LLM
assessment that also produces per-candidate strengths and gaps. Scores above
the configurable threshold (default 55, tuned on a training split) shortlist
the candidate.

**Automatic interview scheduling.** Shortlisted candidates get an interview
slot computed in the configured timezone (default `Asia/Dhaka`), a
configurable number of days ahead at a configurable hour, skipping the
Bangladesh weekend (Friday/Saturday). The invitation email contains a real
Jitsi Meet room link that works the moment it is clicked — no meeting-API
credentials required.

**Automatic emails.** Interview invitations (with match score, personalized
strengths, schedule, and meeting link) and rejection updates are sent via
Gmail SMTP with clean HTML templates. Every send is logged to `email_logs`;
if the backend's SMTP fails, the n8n workflow sends a fallback email so no
candidate is left without a response.

**Duplicate protection.** Re-uploading a CV with the same email address
refreshes the existing candidate instead of creating a duplicate (and
duplicate emails).

**Upload hardening.** Uploads are capped (default 10 MB), and file content
is verified against its extension (magic bytes), so a renamed executable or
a corrupt file is rejected with a clear message.

**Job posting.** Jobs can be announced to Telegram (via the n8n workflow),
LinkedIn, Twitter/X, or any custom webhook. Every attempt is recorded in
`job_postings` with per-platform success/failure detail.

**Analytics.** Recruitment funnel (uploaded, matched, shortlisted,
interviewed, emailed), top skills across candidates, daily upload trend, and
per-job statistics.

**Evaluation benchmark.** A 50-sample labeled dataset measures matching
accuracy, precision, recall, and F1 on a **held-out split** (threshold tuned on
training data only, reported with a 95% confidence interval), plus a
6-configuration weighting ablation and a TF vs TF-IDF representation ablation —
run from the UI or CLI. Limitations are documented explicitly in
`Documentation/docs/ACCURACY.md`.

**Security.** JWT (HS256) auth with role-based access, bcrypt password
hashing, login rate limiting, uniform error envelope, request-ID structured
JSON logging, and production fail-fast checks (insecure JWT secret or
wildcard CORS refuse to boot in production mode).

## How the AI Matching Works

**Without an AI key** (deterministic baseline):

| Component | Weight | Method |
|-----------|--------|--------|
| Skill match | 50% | Overlap of extracted CV skills vs job's required skills, honoring per-skill weights (1-10) set by HR |
| Experience | 30% | Ratio of candidate years to required years, capped at 100 |
| Text similarity | 20% | TF-IDF cosine similarity (smoothed IDF over a bundled 100-document corpus), CV text vs job description |

**With `GROQ_API_KEY` set**, the weights change — the LLM does not re-rank an
existing score, it is a fourth weighted component:

| Component | Weight |
|-----------|--------|
| Skill match | 35% |
| Experience | 25% |
| Text similarity | 10% |
| Groq LLM assessment | 30% |

If the Groq call fails after retries, the engine falls back to the 50/30/20
profile rather than blending in a meaningless neutral score.

The final score is compared against `MATCH_THRESHOLD` (default 55), selected on
a training split — see `Documentation/docs/ACCURACY.md` for the full protocol
and its limitations.

## Screenshots

Screenshots live in `docs/screenshots/`. If a picture below is not
rendering, follow `docs/screenshots/README.md` to capture it.

| | |
|---|---|
| ![Login](docs/screenshots/01-login.png) Login | ![CV Upload](docs/screenshots/02-cv-upload.png) CV upload with live field extraction |
| ![AI Match](docs/screenshots/03-ai-match.png) AI match with score breakdown | ![Candidates](docs/screenshots/04-candidates.png) Candidate management |
| ![Jobs](docs/screenshots/05-jobs.png) Job management | ![Job Posting](docs/screenshots/06-job-posting.png) Multi-platform job posting |
| ![Interviews](docs/screenshots/07-interviews.png) Scheduled interviews | ![Analytics](docs/screenshots/08-analytics.png) Analytics dashboard |
| ![Evaluation](docs/screenshots/09-evaluation.png) Accuracy benchmark | ![n8n](docs/screenshots/10-n8n-workflow.png) n8n master workflow |

## Quick Start (Docker — recommended)

### Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) v24+ (includes Docker Compose)
- Git

### Steps

```bash
# 1. Clone
git clone https://github.com/Nazmussakib247/hr-recruiting-system.git
cd hr-recruiting-system

# 2. Configure
cp .env.example .env
#    Open .env and set at minimum:
#      SMTP_USER / SMTP_PASSWORD  (Gmail App Password — see Credentials Guide)
#    Optional but recommended:
#      GROQ_API_KEY               (free — enables the AI scoring layer)
#      TELEGRAM_BOT_TOKEN / TELEGRAM_CHANNEL_ID  (job announcements)

# 3. Start everything (backend, frontend, database, n8n + auto-import)
docker compose up -d --build
```

On Windows you can simply double-click `start.bat`, which performs the same
steps (and creates `.env` from the template on first run). `stop.bat` shuts
everything down.

### Open the apps

| Service | URL | Login |
|---------|-----|-------|
| Frontend | http://localhost:3000 | `admin` / `admin123` |
| Backend API docs | http://localhost:8000/docs | Bearer JWT from `/auth/login` |
| n8n | http://localhost:5678 | create the owner account on first visit |

On first login with the default credentials the app **forces a password
change** before anything else can be used (set `ADMIN_INITIAL_PASSWORD` in
`.env` to seed a custom admin password instead). Postgres is bound to
`127.0.0.1` only — it is not reachable from the network.

### First demo run

1. Log in at http://localhost:3000.
2. Jobs tab: create a job (e.g. "Python Developer", skills: python, django, postgresql; min experience 2).
3. CV Upload tab: upload a PDF/DOCX CV — extracted fields appear instantly.
4. The n8n workflow automatically matches the new candidate against the job;
   or press "Run AI Match" yourself in the AI Match tab.
5. Shortlisted candidates receive the interview email with a working meeting
   link; see Interviews and Analytics tabs for the results.

Need sample CVs? `python scripts/generate_cvs.py` creates realistic test PDFs.

## Manual Setup (without Docker)

Use this when Docker is unavailable. You will run four things yourself:
PostgreSQL, the backend, the frontend, and (optionally) n8n.

### Prerequisites

- Python 3.11+
- Node.js 20+
- PostgreSQL 16 (a local install or any reachable instance)

### 1. Database

```bash
# Create the role and database (adjust to your Postgres setup)
psql -U postgres -c "CREATE USER hruser WITH PASSWORD 'hrpassword';"
psql -U postgres -c "CREATE DATABASE hrdb OWNER hruser;"
```

The backend creates all tables and seeds the `admin` account automatically on
first boot, so no manual schema loading is required. (The full reference DDL
is in `database/schema.sql` if you want to inspect it.)

### 2. Backend (port 8000)

```bash
cd backend
python -m venv .venv
# Windows:
.venv\Scripts\activate
# macOS/Linux:
source .venv/bin/activate

pip install -r requirements.txt

# Point the backend at your local Postgres. Either edit .env in the project
# root (recommended) or export it in the shell:
#   DATABASE_URL=postgresql://hruser:hrpassword@localhost:5432/hrdb
# Also set N8N webhook URLs to localhost if you run n8n locally:
#   N8N_WEBHOOK_URL=http://localhost:5678/webhook/match-result
#   N8N_CV_WEBHOOK_URL=http://localhost:5678/webhook/cv-uploaded

uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

Verify: http://localhost:8000/docs shows the interactive API documentation.

### 3. Frontend (port 5173 in dev)

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173 and log in with `admin` / `admin123`. The dev
server points at `http://localhost:8000` automatically.

### 4. n8n (optional, port 5678)

```bash
npm install -g n8n

# Same encryption key the import uses (from your .env):
# Windows (PowerShell):
$env:N8N_ENCRYPTION_KEY="hr-local-dev-encryption-key-change-me"
# macOS/Linux:
export N8N_ENCRYPTION_KEY=hr-local-dev-encryption-key-change-me

n8n start
```

Then import the master workflow: open http://localhost:5678, create the owner
account, go to Workflows, select "Import from File", and choose
`n8n-workflows/hr-master-workflow.json`. Create three credentials manually
(SMTP, Telegram, Postgres — the names must match the ones referenced in the
nodes) or run the CLI import used by Docker:

```bash
node n8n-workflows/scripts/render-credentials.js > /tmp/creds.json
n8n import:credentials --input=/tmp/creds.json
n8n import:workflow --separate --input=n8n-workflows
```

Note: inside the workflow the backend is addressed as `http://backend:8000`
(the Docker hostname). For a fully local n8n, open the workflow and replace
`backend:8000` with `localhost:8000` in the HTTP nodes, or add a hosts-file
entry mapping `backend` to `127.0.0.1`.

The system is fully usable without n8n — matching, emails, and analytics all
run from the backend; n8n adds the automation layer (auto-match on upload,
fallback emails, Telegram posting, the daily report).

## Credentials Guide

Everything secret lives in `.env` (never committed — `.gitignore` covers it).
`.env.example` is the safe template that IS committed.

> **Step-by-step instructions (bilingual, বাংলা + English) for obtaining every
> credential — where to click, the expected format, and how to verify each one —
> are in [`Documentation/CREDENTIALS_SETUP.md`](Documentation/CREDENTIALS_SETUP.md).**
> The table below is the quick reference.

| Variable | Required | How to get it |
|----------|----------|---------------|
| `SMTP_USER`, `SMTP_PASSWORD` | For emails | Gmail: enable 2-Step Verification (Google Account, Security), then search "App passwords", create one for Mail, and use the 16-character code. Your normal Gmail password will not work. |
| `GROQ_API_KEY` | Optional (enables AI layer) | Free account at https://console.groq.com, then API Keys, Create API Key. Without it, deterministic 3-component scoring is used. |
| `TELEGRAM_BOT_TOKEN` | Optional (job posts) | Message @BotFather on Telegram, send `/newbot`, copy the token. Add the bot as an administrator of your channel. |
| `TELEGRAM_CHANNEL_ID` | Optional | Your public channel handle, e.g. `@mycompanyjobs`. |
| `LINKEDIN_ACCESS_TOKEN`, `LINKEDIN_ORG_ID` | Optional | LinkedIn Developer portal (https://developer.linkedin.com): create an app, request the Share on LinkedIn product, generate an OAuth token. |
| `TWITTER_API_*` | Optional | https://developer.x.com: create a project and app, generate the four keys/tokens. |
| `JWT_SECRET` | Change for production | `python -c "import secrets; print(secrets.token_urlsafe(48))"` |
| `N8N_ENCRYPTION_KEY` | Change for production | `python -c "import secrets; print(secrets.token_urlsafe(32))"` |

## n8n Automation

All automation is one workflow — `n8n-workflows/hr-master-workflow.json` —
with four independent branches:

| Branch | Trigger | Action |
|--------|---------|--------|
| A | Webhook `cv-uploaded` (fired by backend on every upload) | Auto-runs the AI match for the new candidate against the newest active job |
| B | Webhook `match-result` (fired by backend after every match) | Sends the interview/rejection email only if the backend's own SMTP failed; logs the outcome to `email_logs` |
| C | Webhook `job-posted` | Posts the job announcement to Telegram (HTML-escaped) and logs to `job_postings` |
| D | Schedule: weekdays 9 AM | Emails the full analytics report to `HR_ADMIN_EMAIL` |

With Docker, the workflow and its credentials are imported automatically at
startup — nothing to click. Details, payload examples, and troubleshooting:
[`n8n-workflows/README.md`](n8n-workflows/README.md).

## Evaluation and Accuracy

The `Evaluation` tab (or `python scripts/run_evaluation.py`) runs a 50-sample
labeled benchmark through the matching engine using a **stratified 70/30
hold-out**: the decision threshold is tuned on the training split only, then
metrics are measured once on the held-out split and reported with a 95% Wilson
confidence interval. Two ablation studies accompany it — one across 6 weighting
configurations, one comparing TF against TF-IDF lexical representations.

Full protocol, results, and an explicit limitations section:
[`Documentation/docs/ACCURACY.md`](Documentation/docs/ACCURACY.md).

## Limitations

Stated plainly, because knowing where a system stops working is part of
knowing the system.

**Evaluation.** The benchmark's 50 CV/job pairs are synthetic single-line texts
that enumerate the required skill tokens verbatim, so the two classes are close
to linearly separable by keyword overlap alone. High accuracy here shows the
pipeline is correctly wired; it does not demonstrate CV understanding on real
documents. n=50 (~15 held out) makes the confidence interval wide, ground-truth
labels are self-authored with no second annotator, and the AI-enabled weight
profile is not benchmarked by default.

**Job posting.** Bdjobs has no public employer API — that integration reports
`unsupported` rather than faking success. LinkedIn and Twitter/X posting
require app credentials with the relevant scopes approved; without them those
platforms report `skipped`.

**Auth.** JWTs are stateless with an 8-hour expiry and no refresh or revocation
list, so deactivating a user does not invalidate an already-issued token until
it expires. There is no per-record ownership model: any authenticated user can
act on any candidate or job. Roles distinguish `admin` from `recruiter` only for
user management.

**Scale.** Rate limiting is in-process, so limits reset on restart and are not
shared across workers. Match-all runs in a background task inside the API
process rather than a durable queue — an API restart mid-run loses the run's
progress. `/email-logs` is unpaginated.

**Frontend.** `App.jsx` is a single large component and most of the UI is
untyped `.jsx`; `npm run typecheck` covers the TypeScript API/auth layer, not
those files. `npm run typecheck:strict` reports the outstanding count.

## Project Structure

```
.
├── backend/
│   ├── app/
│   │   ├── core/            # security, logging, rate limit, errors
│   │   ├── db/              # pool, bootstrap/seed
│   │   ├── repositories/    # SQL data access
│   │   ├── routers/         # HTTP endpoints (auth, candidates, jobs, ...)
│   │   ├── schemas/         # Pydantic request/response models
│   │   ├── services/        # business logic (parser, matching, email, ...)
│   │   └── integrations/    # n8n webhooks, job-board posters
│   ├── tests/               # 100+ unit tests + integration suite
│   └── alembic/             # migrations
├── frontend/                # React 18 + Vite SPA (8 tabs)
├── database/schema.sql      # reference DDL with comments
├── n8n-workflows/           # ONE master workflow + auto-import scripts
├── scripts/                 # CV generator, evaluation runner
├── docs/screenshots/        # README images + capture guide
├── Documentation/           # report, slides, diagrams, deep-dive docs
├── docker-compose.yml       # full stack: db, backend, frontend, n8n
├── start.bat / stop.bat     # one-click Windows start/stop
└── .env.example             # configuration template (safe to commit)
```

## API Overview

Interactive documentation: http://localhost:8000/docs (Swagger UI).

| Area | Endpoints |
|------|-----------|
| Auth | `POST /auth/login`, `POST /auth/register` |
| Candidates | `POST /upload-cv`, `GET /candidates`, `GET/DELETE /candidates/{id}`, `POST /candidates/{id}/reupload`, `POST /candidates/bulk-reject` |
| Jobs | `GET/POST /jobs`, `GET/PUT/DELETE /jobs/{id}` |
| Matching | `POST /match/{candidate_id}/{job_id}`, `POST /match-all/{job_id}` (async — returns `202 {run_id}`), `GET /match-runs/{run_id}` (poll progress) |
| Interviews | `GET /interviews` (paginated), `PATCH /interviews/{id}` (reschedule + re-email), `POST /interviews/{id}/cancel`, `POST /interviews/{id}/complete` |
| CV files | `GET /candidates/{id}/cv` (download the original uploaded document) |
| Analytics | `GET /analytics/summary`, `GET /analytics/report` |
| Evaluation | `POST /evaluation/run`, `GET /evaluation/results` |
| Email logs | `GET /email-logs` |
| Health | `GET /health/live`, `GET /health/ready` |

## Running the Tests

```bash
# Backend: lint + unit tests
cd backend
pip install -r requirements-dev.txt
ruff check app tests
pytest tests/unit -q

# Integration tests (need a live Postgres; set TEST_DATABASE_URL)
pytest tests/integration -q

# Frontend: type-check + production build
cd frontend
npm run typecheck
npm run build
```

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Frontend loads but every request fails | Backend not running or wrong port — check http://localhost:8000/health/ready |
| Emails not arriving | `SMTP_PASSWORD` must be a Gmail App Password, not your account password; check the Email Logs tab for the exact SMTP error |
| Upload rejected: "does not look like a valid PDF" | The file is not a real PDF (renamed or corrupt) — re-export the CV |
| Upload rejected: "No text could be extracted" | The PDF is a scanned image; upload a text-based PDF or DOCX |
| n8n workflow inactive | `docker compose logs n8n-import`, then `docker compose restart n8n` |
| n8n "credentials could not be decrypted" | Old volume with a different key: `docker compose down && docker volume rm hr-recruiting_n8n_data && docker compose up -d` |
| Port already in use | Stop the conflicting service or change the published port in `docker-compose.yml` |

## Author

**Nazmus Sakib**

- Email: [nazmussss247@gmail.com](mailto:nazmussss247@gmail.com)
- GitHub: [github.com/Nazmussakib247](https://github.com/Nazmussakib247)
- LinkedIn: [linkedin.com/in/nazmussakib247](https://www.linkedin.com/in/nazmussakib247/)

Developed as a CSE Field Work / Industrial Training project. Contributions
and suggestions are welcome — feel free to open an issue or pull request.
#   H i r e l a y  
 