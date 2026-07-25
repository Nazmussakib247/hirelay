# Senior Engineering Audit — 2026-07-20

**Project:** Automated HR Recruiting System (FastAPI + React + PostgreSQL + n8n)
**Method:** Full source read + fresh install and verification in an isolated environment.

## Verification evidence (all run today, fresh install)

| Gate | Result |
|---|---|
| `ruff check app tests` | ✅ All checks passed |
| `pytest tests/unit` | ✅ **107/107 passed** |
| `tsc --noEmit` | ✅ exit 0 |
| `eslint .` | ✅ 0 errors |
| `vite build` (production) | ✅ built, 256 KB bundle |
| App boot + route registration | ✅ 35 routes register cleanly |
| Secret scan | ✅ No live API keys in tree; `.env` gitignored; JWT secret is a generated random value |

## Verdict

The core pipeline — **CV upload → parse → AI match → email → interview → analytics — is real, functional, and well tested.** Since the July 13 audit, 10 of the 23 findings were fixed. The system is ~90% functional; what remains broken is concentrated in job-board posting, scale behavior, and frontend architecture.

## Confirmed FIXED since the last audit

1. **Meeting links are now real** — Jitsi rooms (`meet.jit.si/hr-interview-{uuid}`), work with zero credentials. README claims updated honestly.
2. **Interview scheduling** — timezone-aware (`Asia/Dhaka` via `zoneinfo`), configurable lead days/hour, skips Fri/Sat (BD weekend).
3. **Twitter poster** — migrated to API v2 `POST /2/tweets`; requires success body with tweet ID, not HTTP 200.
4. **Upload hardening** — 10 MB cap, magic-byte verification (`%PDF`, `PK\x03\x04`, OLE), empty-file rejection.
5. **Candidate dedupe** — same email re-upload updates the existing record and returns `duplicate_of` instead of creating a double who gets emailed twice.
6. **PyPDF2 → pypdf** plus a dual-engine extractor (pdfplumber + pypdf, best result wins) — genuinely better than what was asked.
7. **`resend_email`** now reloads real strengths from the stored match breakdown.
8. **SMTP** — 15s timeout, `get_running_loop()`, RFC-compliant `From` via `formataddr`.
9. **Dead typed frontend layer deleted** (unused `endpoints.ts`, `AuthContext.tsx`, `types/api.ts` are gone).
10. **`needs_rehash` legacy-password upgrade is wired** into login (verified in `services/auth.py`).

## Still BROKEN (functions that look functional but aren't)

| # | Issue | Location | Impact |
|---|---|---|---|
| 1 | **Bdjobs poster is fiction.** Form-posts to `login.asp`/`PostJob.asp` with invented field names; "success" inferred from HTTP 200. Will never post a real job. | `integrations/job_poster.py:183` | UI shows green for a post that never happened |
| 2 | **LinkedIn uses the retired `/v2/ugcPosts` API.** Modern app tokens get 4xx. Needs `/rest/posts` + `LinkedIn-Version` header. | `job_poster.py:42` | Feature dead for any new LinkedIn app |
| 3 | **`/match-all/{job_id}` is synchronous.** 20+ CVs with Groq retries + SMTP sends = multi-minute request; proxy/browser times out while work half-completes. | `services/recruitment.py:195` | Breaks at exactly the batch sizes the feature exists for |
| 4 | **Interviews are create-only.** No reschedule/cancel/complete endpoints; unpaginated list; DB column still naive `TIMESTAMP`. | `routers/interviews.py` | HR can't manage what the system schedules |
| 5 | **Original CV files discarded** — only extracted text kept. HR can never download the actual PDF. | `services/candidates.py` | Recruiters always need the source doc |
| 6 | **Dockerized frontend only works on localhost.** No `VITE_API_URL` build ARG; SPA hardcodes `http://localhost:8000`; the nginx `/api/` proxy is dead config. | `frontend/Dockerfile`, `src/config.ts` | Deployment to any real host silently broken |

## Should improve (working, but not senior-grade)

- **Frontend is a 2,933-line untyped `App.jsx` monolith** (+643-line `Analytics.jsx`); zero frontend tests; `eslint` and `mypy` are advisory (`|| true`) in CI.
- **Default credentials:** seeded `admin/admin123` with no forced change; n8n backend account defaults `admin/admin123`; Postgres published on host port 5432 with `hrpassword` default.
- **Timing-unsafe legacy hash compare** (`==` instead of `hmac.compare_digest`) in `core/security.py:47`.
- **No refresh tokens/revocation** — a stolen 8-hour JWT can't be invalidated.
- **Rate limiter keys on `get_remote_address`** — behind the nginx proxy all users share one bucket.
- **Upload size checked after `file.read()`** — enforce via streaming/Content-Length before buffering.
- **Three schema sources** (schema.sql, `db/init.py` DDL, Alembic) still drift-prone.
- `HR_ADMIN_EMAIL` is present but **empty** in `.env` — the n8n daily-report branch has no recipient.
- No `/metrics`, no pagination on `/email-logs`.

## Recommended priority order

1. Async match-all with progress polling (biggest real-usage breakage)
2. Fix Docker/API routing (`/api` relative base + nginx proxy)
3. Delete or honestly disable Bdjobs; migrate LinkedIn to `/rest/posts`
4. Interview reschedule/cancel + store original CV files
5. Credential hygiene (forced admin password change, constant-time compare, unpublish 5432)
6. Frontend decomposition + tests, make CI gates blocking

*Verified claims only — every result above was reproduced from a fresh install during this audit session.*
