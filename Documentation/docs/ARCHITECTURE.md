# Architecture

Automated HR Recruiting System — a full-stack, AI-assisted recruitment platform.
This document describes the **v7 production architecture** after the refactor
from a single-file prototype into a layered, tested, containerised system.

## High-level

```
┌────────────────────────────────────────────────────────────┐
│  Browser — React 18 + Vite (TypeScript-migrated)           │
│  typed API client · in-memory JWT · role-based UI          │
└───────────────────────────┬────────────────────────────────┘
                            │ HTTPS / REST · Bearer JWT
┌───────────────────────────▼────────────────────────────────┐
│  FastAPI backend (app.main:app)                            │
│                                                            │
│   routers/      thin HTTP controllers (validation only)    │
│      │                                                     │
│   services/     business logic & orchestration             │
│      │              cv_parser · matching · email ·         │
│      │              recruitment · evaluation · analytics   │
│   repositories/ all SQL, one class per table group         │
│      │                                                     │
│   db/pool       asyncpg pool (lifespan-managed)            │
│                                                            │
│   core/         config · security · logging · exceptions · │
│                 middleware · dependencies · rate_limit     │
│   integrations/ n8n webhook · multi-platform job poster    │
└───────────────────────────┬────────────────────────────────┘
                            │ asyncpg · Alembic migrations
┌───────────────────────────▼────────────────────────────────┐
│  PostgreSQL 16   ·   n8n (workflow automation)             │
└────────────────────────────────────────────────────────────┘
```

## Backend layering (dependency direction points downward)

| Layer          | Responsibility                                             | Depends on            |
|----------------|------------------------------------------------------------|-----------------------|
| `routers/`     | Parse/validate request (Pydantic), auth deps, shape reply  | services, schemas     |
| `services/`    | Business rules, orchestration, side-effects                | repositories, core    |
| `repositories/`| Raw SQL against one table group; returns records           | db pool               |
| `schemas/`     | Pydantic request/response contracts                        | —                     |
| `core/`        | Cross-cutting: settings, security, logging, errors, RBAC   | —                     |
| `integrations/`| Outbound third-party calls (n8n, job boards)               | core                  |

A request flows **router → service → repository → database** and back. No SQL
lives outside `repositories/`; no business logic lives in routers.

## Key cross-cutting concerns

- **Configuration** (`core/config.py`) — typed `pydantic-settings`; fails fast
  on insecure production config (weak JWT secret, wildcard CORS).
- **Security** (`core/security.py`) — bcrypt hashing with transparent upgrade
  from legacy SHA-256; centralised JWT issue/verify.
- **Logging** (`core/logging.py`) — structured JSON with a per-request
  `request_id` propagated via context var + middleware.
- **Errors** (`core/exceptions.py`) — domain error hierarchy → consistent JSON
  envelope; internal details are logged, never leaked.
- **Rate limiting** (`core/rate_limit.py`) — slowapi; strict limit on login.

## Matching engine

`services/matching.py` scores a candidate/job pair on four components:

```
skill overlap · experience ratio · TF-IDF cosine · (optional) Groq LLM
final = skill·0.35 + exp·0.25 + tfidf·0.10 + ai·0.30      (AI available)
      = skill·0.50 + exp·0.30 + tfidf·0.20                (AI disabled)
```

Candidates scoring ≥ `MATCH_THRESHOLD` (default 55, see `docs/ACCURACY.md`)
are shortlisted; the flow then schedules an interview + sends email (async, via
SMTP executor) and fires the n8n webhook.

## Data

Ten tables (`users`, `jobs`, `candidates`, `match_results`, `interviews`,
`email_logs`, `job_postings`, `evaluation_dataset`, `evaluation_results`) plus
reporting views. Schema is managed by **Alembic** (`alembic/versions/`); an
idempotent `db/init.py` bootstraps a cold dev database.

## Frontend

Vite + React 18, migrating to **TypeScript incrementally** (`allowJs`). Typed
layers already in place: `types/` (backend contract), `api/` (typed client +
per-endpoint functions), `auth/` (token store + context), `config.ts`
(env-based API URL). Legacy `.jsx` view components continue to work and adopt
the typed client as they are migrated.

## Runtime topology

`docker-compose.yml` runs four services: `db` (Postgres), `backend` (FastAPI,
non-root image), `frontend` (nginx serving the built bundle), and `n8n`.
Health checks gate startup ordering.
