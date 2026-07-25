# Security Review

Findings from the hardening pass, and what changed. Severity reflects impact in
a production deployment.

## Fixed

| # | Severity | Issue (before)                                             | Resolution |
|---|----------|------------------------------------------------------------|------------|
| 1 | High     | Passwords hashed with **unsalted SHA-256**                 | bcrypt via passlib; legacy hashes verified once then transparently upgraded on login (`core/security.py`). |
| 2 | High     | **Hardcoded JWT secret** default used if env unset         | Typed settings; production boot **fails** unless `JWT_SECRET` is ≥32 chars and non-default (`core/config.py`). |
| 3 | High     | **CORS `allow_origins=["*"]` with credentials**            | Origins come from `CORS_ORIGINS`; wildcard rejected in production. |
| 4 | Medium   | No **rate limiting** — login brute-forceable               | slowapi; `/auth/login` limited to 10/min per IP (`core/rate_limit.py`). |
| 5 | Medium   | Raw **DB/SMTP error strings leaked** to clients            | Central exception handlers return a generic envelope; real detail logged server-side (`core/exceptions.py`). |
| 6 | Medium   | Endpoints accepted untyped `dict` bodies (no validation)   | Pydantic request models validate every mutating endpoint. |
| 7 | Low      | Containers ran as **root**                                 | Backend image runs as a non-root user; multi-stage build. |
| 8 | Low      | Secrets at risk of being committed                            | `.gitignore` covers `.env`; `.dockerignore` excludes it; pre-commit `detect-private-key` + optional gitleaks. |

## Retained by design

- **In-memory JWT** (no localStorage): a page refresh logs out. Matches the
  original security posture; documented, not a regression.
- **Idempotent dev seed** creates `admin/admin123`. Fine for local/demo — see
  "Before production" below.

## Before production — operator checklist

- [ ] Set `ENVIRONMENT=production` and a strong `JWT_SECRET`
      (`python -c "import secrets; print(secrets.token_urlsafe(48))"`).
- [ ] **Change the default admin password** and remove the demo recruiter seed.
- [ ] Set `CORS_ORIGINS` to your real frontend origin(s) only.
- [ ] Put the API behind TLS (terminate at the gateway/ingress).
- [ ] Rotate any credentials that were ever committed to `.env`.
- [ ] Configure real SMTP / platform tokens via secrets, not the repo.

## Reporting

For a real deployment, add a `SECURITY.md` contact and a disclosure policy.
This document is an internal audit summary for the coursework refactor.
