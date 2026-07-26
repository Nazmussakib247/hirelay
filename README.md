# Hirelay — Automated HR Recruiting System

An end-to-end recruitment platform that automates the pipeline from CV intake to
interview scheduling. Candidates apply through a public link or are uploaded by
HR; an AI-assisted engine parses each CV and scores it against open positions;
shortlisting, interview invitations, and multi-platform job advertising are all
handled from a single dashboard, with an n8n layer for hands-off automation.

Built as a CSE4100 Field Work project with a deliberate emphasis on honest
engineering — the matching accuracy is reported with a proper held-out
evaluation protocol rather than an inflated in-sample number (see
`Documentation/accuracy/ACCURACY.md`).

---

## Overview

Hirelay replaces the manual, spreadsheet-driven parts of early-stage recruiting
with a coherent system:

- **Intake** — HR uploads CVs, or candidates self-apply through a public page
  that lists only the currently open jobs.
- **Understanding** — a hybrid parser (deterministic extraction plus an optional
  LLM pass) pulls out name, contact details, skills, experience, and education,
  and reports a confidence score so low-quality parses are flagged.
- **Matching** — a transparent, weighted engine scores each candidate against a
  job using skill overlap, experience fit, and TF-IDF text similarity, with an
  optional LLM judgment blended in when configured.
- **Action** — shortlisted candidates can be scheduled for interviews (with a
  clash check and an auto-generated meeting link) and emailed from templates;
  jobs can be advertised to several platforms at once.
- **Insight** — an analytics dashboard and a dedicated evaluation suite make the
  system's behaviour measurable and defensible.

---

## Screenshots

<table>
  <tr>
    <td width="50%"><img src="Documentation/screenshots/01_login.png" alt="Login"/><br/><sub><b>Secure login</b></sub></td>
    <td width="50%"><img src="Documentation/screenshots/02_cv_upload.png" alt="CV upload"/><br/><sub><b>CV upload with automatic parsing</b></sub></td>
  </tr>
  <tr>
    <td><img src="Documentation/screenshots/03_ai_match.png" alt="AI match"/><br/><sub><b>AI matching run</b></sub></td>
    <td><img src="Documentation/screenshots/04_candidates_list.png" alt="Candidates"/><br/><sub><b>Candidate management</b></sub></td>
  </tr>
  <tr>
    <td><img src="Documentation/screenshots/05_candidate_detail.png" alt="Candidate detail"/><br/><sub><b>Candidate detail — parse confidence &amp; AI summary</b></sub></td>
    <td><img src="Documentation/screenshots/06_evaluation_ablation.png" alt="Evaluation"/><br/><sub><b>Evaluation suite — ablation study</b></sub></td>
  </tr>
  <tr>
    <td><img src="Documentation/screenshots/07_job_posting.png" alt="Job posting"/><br/><sub><b>Multi-platform job posting</b></sub></td>
    <td><img src="Documentation/screenshots/08_interview_detail.png" alt="Interview"/><br/><sub><b>Interview scheduling &amp; feedback</b></sub></td>
  </tr>
  <tr>
    <td><img src="Documentation/screenshots/09_interview_calendar.png" alt="Calendar"/><br/><sub><b>Interview calendar</b></sub></td>
    <td><img src="Documentation/screenshots/10_public_apply.png" alt="Public apply"/><br/><sub><b>Public application page</b></sub></td>
  </tr>
  <tr>
    <td colspan="2" align="center"><img src="Documentation/screenshots/11_n8n_workflow.png" alt="n8n workflow" width="88%"/><br/><sub><b>n8n workflow automating the recruitment pipeline</b></sub></td>
  </tr>
  <tr>
    <td align="center"><img src="Documentation/screenshots/12_telegram_post.png" alt="Telegram post" width="260"/><br/><sub><b>Automated Telegram job post</b></sub></td>
    <td align="center"><img src="Documentation/screenshots/13_interview_email.png" alt="Interview email" width="230"/><br/><sub><b>Interview invitation email</b></sub></td>
  </tr>
</table>

---

## Features

### Candidate intake and parsing
- Drag-and-drop CV upload (PDF, DOCX, DOC) with size and content-type validation.
- Dual-engine PDF text extraction (pdfplumber + pypdf, best result kept).
- Hybrid CV parser: LLM extraction with a deterministic keyword/regex fallback.
- Parse-confidence score (0–100) surfaced to HR for low-quality uploads.
- Duplicate detection by email — a re-upload refreshes the existing candidate.

### Public apply page
- Standalone public page that lists only active jobs.
- Candidates select a position and submit their CV plus name, email, and phone.
- Applicants are created as pending and scored against the chosen job, but no
  email is sent until HR confirms — HR reviews the batch and approves.
- Closing or deleting a job removes it from the apply page automatically.

### AI matching engine
- Weighted scoring across skills, experience, and TF-IDF text similarity.
- Real inverse-document-frequency weighting (not term frequency masquerading as
  TF-IDF), derived from a bundled corpus.
- Optional LLM (Groq) scoring blended into the final result when a key is set.
- Per-skill importance weights (1–10) configurable per job, with AI-assisted
  keyword suggestion from the job description.
- Configurable decision threshold; background "match all" with live progress.

### Job management and advertising
- Create, edit, pause (close), reopen, and delete jobs (role-gated).
- One-click posting to LinkedIn, Telegram, X/Twitter, and a custom webhook.
- Per-job custom announcement text and candidate email templates, or built-in
  defaults; every post carries an apply link and a contact address.

### Candidate management
- Search by name, email, or skill; filter by status and by job.
- Bulk shortlist / reject / email; manual per-candidate status override.
- Private HR notes, CV re-upload, original CV download, and delete.

### Interviews and email
- Interview scheduling with an availability check and a generated Jitsi link.
- Calendar view and interview feedback / rating.
- SMTP email with templated interview invitations and rejections, plus a
  delivery log.

### Platform, security, and insight
- JWT authentication (bcrypt-hashed passwords), role-based access control
  (admin / recruiter), forced first-login password change, and password reset.
- In-app notification feed for recruiting events.
- Per-IP rate limiting and hardened upload handling.
- Analytics dashboard: pipeline funnel, score distribution, top skills, job
  performance.
- Evaluation suite: held-out benchmark with a 95% confidence interval, a
  six-configuration ablation study, a TF vs TF-IDF comparison, a confusion
  matrix, per-sample results, Cohen's kappa machinery, and an on-demand
  AI-profile benchmark.
- n8n automation: auto-run matching on CV upload; credentials and workflows
  auto-imported on first start.

---

## Tech stack

| Layer | Technologies |
|---|---|
| Backend | Python 3.11, FastAPI, Uvicorn, Pydantic v2, pydantic-settings |
| Database | PostgreSQL 16, asyncpg (schema bootstrapped on startup) |
| Auth | JWT (HS256), bcrypt, slowapi rate limiting |
| AI / NLP | Groq LLM (llama-3.1-8b-instant), custom TF-IDF, deterministic parsers |
| Documents | pdfplumber, pypdf (CV text extraction) |
| Integrations | Gmail SMTP, Telegram Bot API, LinkedIn API, Jitsi Meet |
| Frontend | React 18, Vite, TypeScript (typed data + API layer), nginx |
| Automation | n8n |
| Infrastructure | Docker, Docker Compose |
| Tooling | pytest, vitest, ruff, mypy, ESLint, Prettier |

---

## Repository structure

```
.
├── backend/
│   └── app/
│       ├── routers/        HTTP endpoints (auth, candidates, jobs, matching,
│       │                   interviews, evaluation, analytics, public, ...)
│       ├── services/       Business logic (matching, candidates, jobs, email,
│       │                   evaluation, cv_parser, text_stats, ...)
│       ├── repositories/   Data access (asyncpg queries)
│       ├── integrations/   External systems (job_poster, n8n)
│       ├── schemas/        Pydantic request/response models
│       ├── core/           Config, security, middleware, exceptions, uploads
│       └── db/             Pool + schema bootstrap (init.py)
│   └── tests/              Unit and integration tests
├── frontend/
│   ├── public/apply.html   Standalone public apply page
│   └── src/
│       ├── features/       Feature modules (upload, matching, jobs, candidates,
│       │                   posting, evaluation, interviews, auth)
│       ├── layout/         Sidebar, nav, user menu, stats bar
│       ├── ui/             Shared design tokens and primitives
│       ├── api/            Typed fetch client and endpoint helpers
│       ├── auth/           Auth context, token store, login/profile screens
│       ├── types.ts        Shared domain data contracts
│       └── App.jsx         Application shell (providers + routing)
├── n8n-workflows/          Importable automation workflow + import scripts
├── Documentation/
│   ├── project report/     Field-work report (.docx)
│   ├── proposal/           Project proposal (.pdf)
│   ├── accuracy/           ACCURACY.md — evaluation methodology & limitations
│   ├── er diagram/         Entity-relationship diagram
│   ├── use case diagram/   Use-case diagram
│   └── screenshots/        Application screenshots
├── docker-compose.yml
├── start.bat / stop.bat    Windows convenience scripts
└── Makefile                Common developer commands
```

---

## Setup guide (Docker — recommended)

Prerequisites: Docker Desktop.

1. Clone the repository and create the environment file:

   ```bash
   cp .env.example .env
   ```

2. Edit `.env` and set at least a strong `JWT_SECRET` and `ADMIN_INITIAL_PASSWORD`.
   Optional integrations (`GROQ_API_KEY`, `SMTP_USER` / `SMTP_PASSWORD`,
   `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHANNEL_ID`, `PUBLIC_BASE_URL`,
   `CONTACT_EMAIL`) enable AI scoring, email, and job posting respectively.

3. Build and start the stack:

   ```bash
   docker compose up -d --build
   ```

   On Windows you can instead run `start.bat`, which does the same and opens the
   app in your browser.

4. Open the application:

   | Service | URL |
   |---|---|
   | Frontend (app) | http://localhost:3000 |
   | Public apply page | http://localhost:3000/apply.html |
   | Backend API docs | http://localhost:8000/docs |
   | n8n automation | http://localhost:5678 |
   | PostgreSQL (host) | localhost:5433 |

5. Sign in with username `admin` and the `ADMIN_INITIAL_PASSWORD` you set. On a
   fresh/seeded database the first login may require setting a new password.

To stop the stack: `docker compose down` (or `stop.bat`). The database and n8n
data persist in named volumes.

---

## Setup guide (without Docker)

Prerequisites: Python 3.11, Node.js 18+, and a running PostgreSQL 16 instance.

### 1. Database

Create a database and note the connection string, for example:

```
postgresql://hruser:hrpassword@localhost:5432/hrdb
```

The schema is created automatically the first time the backend starts, so no
manual migration step is required.

### 2. Backend

```bash
cd backend
python -m venv venv
# Windows: venv\Scripts\activate     macOS/Linux: source venv/bin/activate
pip install -r requirements.txt
```

Provide configuration through environment variables or a `.env` file in the
directory you launch the server from. At minimum:

```
DATABASE_URL=postgresql://hruser:hrpassword@localhost:5432/hrdb
JWT_SECRET=<a long random string>
ADMIN_INITIAL_PASSWORD=<your admin password>
ENVIRONMENT=development
# Optional:
GROQ_API_KEY=...
SMTP_USER=...            SMTP_PASSWORD=...
TELEGRAM_BOT_TOKEN=...   TELEGRAM_CHANNEL_ID=@yourchannel
```

Run the API:

```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Interactive API documentation is available at http://localhost:8000/docs.

### 3. Frontend

```bash
cd frontend
npm install
npm run dev
```

The dev server runs at http://localhost:5173 and talks to the backend at
`http://localhost:8000` (this origin is already allowed by the backend's CORS
configuration). For a production bundle, run `npm run build` and serve `dist/`.

### 4. n8n (optional)

The automation layer is optional for local development. To use it, run an n8n
instance and import the workflow from `n8n-workflows/`.

---

## Testing

```bash
# Backend (from backend/)
pip install -r requirements-dev.txt
pytest -q

# Frontend (from frontend/)
npm run test          # vitest
npm run typecheck     # tsc
npm run build         # tsc + production build
```

The `Makefile` wraps the common tasks: `make up`, `make down`, `make logs`,
`make test`, `make lint`, `make typecheck`, `make build`.

---

## Accuracy and evaluation

The matching engine ships with a reproducible evaluation protocol. Reported
accuracy is **held-out**: the decision threshold is tuned on a training split
and measured once on untouched test samples, with a 95% Wilson confidence
interval. The bundled benchmark is intentionally documented as a
near-linearly-separable synthetic set, so its high accuracy demonstrates a
correctly wired pipeline rather than a generalisation guarantee. The honest
limitations, the ablation study, and the recommended next steps are written up
in `Documentation/accuracy/ACCURACY.md`.

---

## Future work

- Replace the synthetic benchmark with a labelled set of real, hard CVs
  (career-changers, near-miss and over-qualified applicants) and report the
  resulting accuracy and a second-annotator Cohen's kappa.
- Complete the migration of remaining `.jsx` components to TypeScript so the
  typed data contracts are enforced end to end.
- Token revocation / refresh so logout and de-activation take effect immediately.
- A durable job queue (e.g. Redis + a worker) for match runs so they survive a
  restart, replacing the in-process background task.
- k-fold cross-validation once the labelled dataset is large enough.
- A public deployment with a real domain so the apply link works for external
  candidates.

---

## Author

**Nazmus Sakib**
CSE Field Work (CSE4100)

- GitHub: https://github.com/Nazmussakib247
- LinkedIn: https://www.linkedin.com/in/nazmussakib247/
- Contact: nazmussakib.cse.nubt@gmail.com

---

## License

This project is released under a **proprietary, all-rights-reserved** license.
Copying, use, modification, and redistribution are prohibited without the prior
written permission of the author. See the [`LICENSE`](LICENSE) file for the full
terms, and contact the author to request permission.
#   h i r e l a y  
 