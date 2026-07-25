# Contributing

## Prerequisites

- Python 3.11+, Node 20+, Docker (optional, for the full stack)
- `make` (optional but recommended — see `make help`)

## Backend setup

```bash
cd backend
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements-dev.txt
cp ../.env.example ../.env          # then edit values

# run the API (needs a Postgres; or use `docker compose up db`)
uvicorn app.main:app --reload --port 8000
```

### Quality gates (must pass before pushing)

```bash
ruff check app tests          # lint
ruff format --check app tests # formatting
mypy app                      # types (advisory)
pytest                        # unit + integration (integration needs a DB)
```

Unit tests need no database. Integration tests run only when
`TEST_DATABASE_URL` is set:

```bash
export TEST_DATABASE_URL=postgresql://hruser:hrpassword@localhost:5432/hrdb_test
pytest                        # now includes integration tests
```

## Frontend setup

```bash
cd frontend
npm ci
npm run dev        # http://localhost:5173
npm run typecheck  # tsc --noEmit (strict)
npm run lint
npm run build
```

## Database migrations (Alembic)

```bash
cd backend
alembic upgrade head                 # apply
alembic revision -m "add x table"    # create a new migration, then edit it
```

## Conventions

- **Layering**: routers call services call repositories. Never put SQL in a
  router or business logic in a repository.
- **New endpoint** = schema (in `schemas/`) → repository method → service method
  → thin router → test (unit with a fake connection, and/or integration).
- Keep functions typed; run `ruff` + `mypy` locally.
- Pre-commit: `pre-commit install` (runs ruff, mypy, secret scan on commit).

## Pull requests

CI (`.github/workflows/ci.yml`) runs lint, typecheck, and the full test suite
against a Postgres service, plus the frontend typecheck/build. Green CI is
required.
