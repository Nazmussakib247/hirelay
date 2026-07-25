# Senior Engineering Audit + 3-Part Perfection Plan

**Project:** Automated HR Recruiting System (FastAPI + React + PostgreSQL + n8n)
**Audit date:** 2026-07-13
**Verified during audit:** 97/97 backend unit tests pass · frontend `tsc --noEmit` passes (exit 0) · integration tests require `TEST_DATABASE_URL` (CI-only)

---

## Part A — Audit Verdict

The architecture is genuinely good: layered backend (routers → services → repositories), typed Pydantic settings with production fail-fast validation, bcrypt with legacy-hash migration, rate limiting, structured JSON logging, request-ID middleware, uniform error envelope, Alembic migrations, CI with lint/typecheck/tests, and a full docker-compose stack with n8n auto-import. This is ~85% of the way there.

What blocks "100% perfect and every function functional" falls into three buckets:

### 🔴 Functions that LOOK functional but are NOT (critical)

| # | Finding | Location | Why it's broken |
|---|---------|----------|-----------------|
| 1 | **Google Meet links are fake.** `generate_meet_link()` produces random `meet.google.com/xxx-xxx-xxx` strings. No meeting exists behind them — every shortlisted candidate receives a **dead link**. | `backend/app/services/email.py:37` | Meet codes must be created via Google Calendar API. This is the single worst defect: the system's headline feature (auto-scheduled interviews) silently fails at the candidate's side. |
| 2 | **Bdjobs integration is guesswork.** Form-posts to `employer.bdjobs.com/login.asp` / `PostJob.asp` with invented field names; success is inferred from HTTP 200. Will never post a real job. | `backend/app/integrations/job_poster.py:183` | No such public form API exists; field names are fabricated. |
| 3 | **LinkedIn poster uses the deprecated UGC API** (`/v2/ugcPosts`). LinkedIn retired this for new apps; requires `/rest/posts` + `LinkedIn-Version` header. | `job_poster.py:42` | Will 4xx on any modern app token. |
| 4 | **Twitter poster hand-rolls OAuth 1.0a** against API v1.1 `statuses/update`, which is shut off for standard tiers. Needs v2 `POST /2/tweets`. | `job_poster.py:120` | Fails with 403 on current API access levels. |
| 5 | **`/match-all/{job_id}` is synchronous.** Loops every pending candidate; each match can spend up to 60s in Groq retries (3×20s) plus a blocking SMTP send. 20 CVs ⇒ multi-minute request; nginx proxy cuts at 120s; browser gets an error while work half-completes. | `backend/app/services/recruitment.py:169` | Needs background execution + progress polling. |
| 6 | **Interview scheduling is a hardcoded fiction:** always "now + 3 days, 10:00 AM", naive `datetime.now()` (no timezone), no conflict check, no HR control, no ICS calendar attachment, no reschedule/cancel endpoint (the Interviews tab is read-only). | `recruitment.py:117`, `routers/interviews.py` | "Schedules interviews" is only ~30% implemented. |
| 7 | **Original CV files are discarded.** Only extracted text is stored (`raw_text`, `cv_filename`). HR can never view/download the actual PDF a candidate submitted. | `services/candidates.py`, schema `candidates` | Recruiters always need the source document. |
| 8 | **No candidate dedupe.** Uploading the same CV twice creates two candidates; both get emailed independently. | `CandidateRepository.create` | Needs (email, or content-hash) uniqueness with an update-or-create path. |
| 9 | **Upload endpoint reads the entire file into RAM with no size cap and no MIME sniff** — a 2 GB "cv.pdf" is accepted into memory. Image-only (scanned) PDFs extract zero text → hard 422 with no OCR fallback. | `routers/candidates.py:31`, `cv_parser.extract_text` | DoS-able; also rejects a common real-world CV type. |
| 10 | **Dockerized frontend can't reach the API from any other machine.** `VITE_API_URL` is never passed as a build ARG, so the SPA hardcodes `http://localhost:8000`; the nginx `/api/` proxy block is dead config. Works only when browser and server are the same machine. | `frontend/Dockerfile`, `src/config.ts`, `nginx.conf` | Fix: build with relative `/api` base and use the proxy. |

### 🟠 Half-finished / dead code

| # | Finding | Location |
|---|---------|----------|
| 11 | **The TypeScript migration is abandoned mid-way.** `App.jsx` (2,933 lines) + `Analytics.jsx` (643 lines) are untyped monoliths containing ALL UI, while the typed layer built for them — `api/endpoints.ts`, `auth/AuthContext.tsx`, `types/api.ts` — is **imported nowhere** (dead code, only `api/client.ts` + `auth/token.ts` are used). Duplicate `decodeJWT` and `AuthContext` exist in both worlds. | `frontend/src/` |
| 12 | **Zero frontend tests** (no vitest/RTL, no `test` script) and **ESLint is advisory** (`npm run lint \|\| true` in CI). mypy also advisory (`mypy app \|\| true`). | `package.json`, `.github/workflows/ci.yml` |
| 13 | **Three competing schema sources** that must be kept in sync by hand: `database/schema.sql`, `app/db/init.py` (`_SCHEMA_DDL`), and `alembic/versions/*`. They already drift risk on every change. | — |
| 14 | `resend_email` sends interview emails with `strengths=[]` — loses the personalized strengths block the original email had. | `recruitment.py:191` |
| 15 | `.env` is missing `HR_ADMIN_EMAIL` and `TZ` (present in `.env.example`) — n8n workflow 03 (daily report) has no recipient. | `.env` |

### 🟡 Security & production hardening

| # | Finding | Location |
|---|---------|----------|
| 16 | **Default credentials everywhere:** seeded `admin/admin123` with no forced rotation; n8n backend service account defaults `admin/admin123`; `N8N_ENCRYPTION_KEY` defaults to a known string; Postgres `hruser/hrpassword` published on host port **5432**. | `db/init.py:141`, `docker-compose.yml` |
| 17 | Legacy SHA-256 verify uses `==` (not `hmac.compare_digest`) — timing side-channel; the legacy path is also a permanent downgrade surface. | `core/security.py:46` |
| 18 | No refresh tokens / revocation — a stolen 8-hour JWT can't be invalidated. | auth stack |
| 19 | Rate limiter keys on `get_remote_address`; behind the nginx proxy every request appears to come from the proxy IP — the 10/min login limit throttles ALL users collectively and can't distinguish attackers. | `core/rate_limit.py` |
| 20 | All timestamps are `TIMESTAMP` (naive) + `datetime.now()` — interview times are ambiguous across timezones (system targets Asia/Dhaka but says nothing). | schema + services |
| 21 | `PyPDF2` is deprecated/unmaintained (its own import warns) → migrate to `pypdf`. | `requirements.txt`, `cv_parser.py` |
| 22 | SMTP send has no timeout (smtplib default = block forever) and uses deprecated `asyncio.get_event_loop()`. | `services/email.py:125` |
| 23 | No `/metrics`, no error-tracking hook, interviews/email-logs endpoints unpaginated. | — |

---

## Part B — The 3-Part Plan (for Claude Opus 4.8, high effort)

Rules for the executor, each part: run `cd backend && ruff check app tests && pytest -q` and `cd frontend && npm run typecheck && npm run build` before declaring done; add/extend tests for every behavior change; keep the existing layering (router → service → repository); one Alembic migration per schema change (and mirror it in `database/schema.sql` + `db/init.py` until Part 3 removes the duplication).

---

### PART 1 — Make every advertised feature actually work (backend functionality)

**1.1 Real interview meetings (replaces fake Meet links)**
- Add `MEETING_PROVIDER` setting: `google` | `jitsi` | `none` (default `jitsi` so it works with zero credentials — Jitsi rooms exist on first visit: `https://meet.jit.si/hr-{uuid}`).
- `google` provider: new `app/integrations/google_meet.py` using a service-account (`GOOGLE_SERVICE_ACCOUNT_JSON`, `GOOGLE_CALENDAR_ID` settings) → Calendar `events.insert` with `conferenceDataVersion=1`; store returned real Meet link + event ID.
- Generate and attach an **ICS file** to every interview email (pure-stdlib or `icalendar`).
- Acceptance: with provider=jitsi and no credentials, the emailed link opens a live room; unit tests mock the Google client.

**1.2 Real interview scheduling**
- Settings: `INTERVIEW_LEAD_DAYS=3`, `INTERVIEW_HOUR=10`, `TIMEZONE=Asia/Dhaka`; compute times with `zoneinfo` — no naive datetimes anywhere (`datetime.now(tz=...)`).
- Alembic migration: convert `interviews.interview_time` (and all timestamp columns) to `TIMESTAMPTZ`.
- New endpoints + service methods: `PATCH /interviews/{id}` (reschedule → re-send updated email + ICS), `POST /interviews/{id}/cancel`, `POST /interviews/{id}/complete`; paginate `GET /interviews`.
- Fix `resend_email` to reload strengths from the stored `match_results.breakdown` instead of `[]`.

**1.3 Async match-all with progress**
- `POST /match-all/{job_id}` returns `202 {run_id}` immediately; work runs in an `asyncio.Task` (in-process job registry keyed by `run_id`, persisted to a new `match_runs` table: total/processed/shortlisted/failed/status).
- `GET /match-runs/{run_id}` for polling. Emails dispatched inside the run, never blocking the HTTP request. Frontend polls and renders a progress bar.
- Bound Groq concurrency with an `asyncio.Semaphore(3)`.

**1.4 Upload hardening + CV storage + dedupe**
- Enforce `MAX_UPLOAD_MB=10` (stream-read with cap → 413), verify magic bytes (`%PDF`, `PK\x03\x04`) not just extension.
- Store the original file: new `cv_files` table (bytes or disk path under `CV_STORAGE_DIR`) + `GET /candidates/{id}/cv` download endpoint; wire a "Download CV" button into the candidate detail drawer.
- Dedupe: unique index on `lower(email)` where not null; on collision, update the existing candidate (re-parse) instead of inserting; response flags `"duplicate_of"`.
- Optional OCR fallback behind `OCR_ENABLED` (pytesseract) for image-only PDFs; when disabled return a clear "scanned PDF — enable OCR" error.
- Migrate `PyPDF2` → `pypdf`.

**1.5 Honest job-board integrations**
- LinkedIn → `/rest/posts` with `LinkedIn-Version: 202506` header; Twitter → API v2 `POST /2/tweets` (keep hand-rolled OAuth1 signing or add `oauthlib`); **delete the Bdjobs scraper** and replace with either their official employer API (if credentials/docs provided) or an explicit `"status": "unsupported"`.
- Add `POST /platforms/{name}/test` that performs a credential-validating dry call (e.g. Telegram `getMe`, LinkedIn `/rest/me`), surfaced as a "Test connection" button in the Job Posting tab.
- Never report `success` from an inferred HTTP 200 — require a parseable success body/ID.

**Definition of done (Part 1):** every green status the UI shows corresponds to a real external effect; `pytest` green including new tests for meeting provider, match-run lifecycle, upload caps, dedupe, and each poster.

---

### PART 2 — Finish the frontend (complete the abandoned TS migration)

**2.1 Decompose the monolith**
- Break `App.jsx` (2,933 lines) into typed modules — target structure:
  `src/components/ui/` (Btn, Card, Badge, Spinner, Toggle, ScoreRing, EmptyState…), `src/features/{upload,matching,candidates,jobs,posting,interviews,evaluation,analytics,auth}/`, `src/layout/`.
- Convert everything to `.tsx` using the **already-written but unused** `types/api.ts`, `api/endpoints.ts`, `auth/AuthContext.tsx`; delete the duplicate in-file `AuthContext`/`decodeJWT`. No `any` except quarantined third-party edges.
- Add `react-router-dom` routes (`/login`, `/dashboard`, `/candidates`, `/jobs`, `/interviews`, `/evaluation`, `/analytics`) replacing the tab-state switch; deep links must work (nginx SPA fallback already handles it).
- Replace every `alert()`/silent `console.error` with a toast system + top-level `ErrorBoundary`.

**2.2 Fix Docker/API routing**
- `config.ts`: default `API_BASE_URL` to `"/api"` when `import.meta.env.PROD`, keep `http://localhost:8000` for dev; alternatively accept `VITE_API_URL` build ARG in `frontend/Dockerfile`. The nginx `/api/` proxy becomes the one production path; remove the need for CORS in Docker.
- Match-all UI: poll `GET /match-runs/{id}` (from 1.3) with progress bar and cancel-safe UX.

**2.3 Frontend quality gates**
- Add `vitest` + `@testing-library/react`: tests for auth flow (login/expiry/401 redirect), upload validation, match progress polling, candidate table filters — minimum 25 meaningful tests.
- Make CI blocking: remove `|| true` from `npm run lint`; add `npm test` job; fail build on TS or lint errors.
- Accessibility pass: labels on inputs, keyboard focus states, color-contrast on badges.

**Definition of done (Part 2):** `App.jsx`/`Analytics.jsx` deleted; 100% `.tsx`; router-based navigation; vitest suite green in CI; Docker stack usable from a non-localhost browser.

---

### PART 3 — Security, single source of truth, production ops

**3.1 Credential hygiene**
- Admin bootstrap: read `ADMIN_INITIAL_PASSWORD` from env (generate random + log once if unset); add `must_change_password` column — force password change on first login (backend flag + frontend modal); add `POST /auth/change-password`.
- Constant-time legacy hash compare (`hmac.compare_digest`) AND auto-upgrade legacy hashes on successful login (verify `needs_rehash` path is actually wired in `AuthService.login`; add a test).
- Refresh tokens: short-lived access (15 min) + rotating refresh token endpoint `POST /auth/refresh` with a `revoked_tokens`/session table; frontend silent-refresh in `client.ts`.
- docker-compose: remove host publish of `5432` (or bind `127.0.0.1:5432`); require `N8N_ENCRYPTION_KEY` and `N8N_BACKEND_PASSWORD` non-default when `ENVIRONMENT=production` (extend `Settings._enforce_production_safety`); document rotation in README.

**3.2 One schema source**
- Alembic becomes the single source: `db/init.py` runs `alembic upgrade head` programmatically instead of its own `_SCHEMA_DDL`; regenerate `database/schema.sql` from migrations (`alembic upgrade --sql`) via a Make target; delete the duplicated DDL.
- Migrations for everything added in Parts 1-2 (`match_runs`, `cv_files`, `must_change_password`, TIMESTAMPTZ conversion, email unique index).

**3.3 Correct middleware behavior behind the proxy**
- Trust `X-Forwarded-For` (uvicorn `--proxy-headers` + `ProxyHeadersMiddleware`) so rate limiting keys on the real client IP; add secure headers middleware (HSTS, X-Content-Type-Options, X-Frame-Options) to nginx.

**3.4 Ops & polish**
- SMTP: add 15s socket timeout, `asyncio.get_running_loop()`, and retry-once on transient failure; make `From` header RFC-compliant via `email.utils.formataddr`.
- Pagination for `/email-logs` and `/interviews`; `/metrics` (prometheus-fastapi-instrumentator) + optional `SENTRY_DSN` hook.
- Make mypy blocking in CI (annotate remaining gaps, remove `|| true`); add a `docker compose up` smoke-test job in CI (build images, hit `/health/ready`).
- Load-test `match-all` with 100 seeded CVs (script in `scripts/`), assert run completes and progress endpoint reflects it.
- Docs: update README to remove any claim the audit found untrue (e.g., "posts to Bdjobs", "schedules Google Meet") until it is true; add `SECURITY.md` with the rotation checklist.

**Definition of done (Part 3):** fresh `docker compose up` on a clean machine with only `.env` secrets → login forces password change, real meeting link emailed, match-all of 100 CVs completes with visible progress, CI fully blocking (ruff, mypy, pytest+integration, eslint, vitest, build, smoke test), zero default credentials in a production boot.

---

## Suggested execution order & sizing

| Part | Focus | Est. effort (Opus 4.8 high) | Risk |
|------|-------|------------------------------|------|
| 1 | Backend functionality — fake features made real | 1 long session | Medium (external APIs) |
| 2 | Frontend TS migration + routing + tests | 1–2 long sessions (largest diff) | Low (mechanical, typecheck-guarded) |
| 3 | Security + schema unification + ops | 1 session | Medium (auth changes touch everything) |

Each part is independently shippable; do them in order — Part 2's progress UI depends on Part 1's `match_runs`, and Part 3's migrations consolidate Parts 1–2's schema changes.
