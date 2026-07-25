# HR Recruiting System — developer task runner.
# Usage: make <target>

.DEFAULT_GOAL := help
.PHONY: help install-backend install-frontend lint format typecheck test \
        test-unit cov up down logs migrate revision build

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
	  awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}'

install-backend: ## Install backend dev dependencies
	cd backend && pip install -r requirements-dev.txt

install-frontend: ## Install frontend dependencies
	cd frontend && npm ci

lint: ## Lint backend (ruff) and frontend (eslint)
	cd backend && ruff check app tests
	cd frontend && npm run lint

format: ## Auto-format backend (ruff) and frontend (prettier)
	cd backend && ruff format app tests && ruff check --fix app tests
	cd frontend && npm run format

typecheck: ## Type-check backend (mypy) and frontend (tsc)
	cd backend && mypy app
	cd frontend && npm run typecheck

test: ## Run the full backend test suite with coverage
	cd backend && pytest --cov=app --cov-report=term-missing

test-unit: ## Run only backend unit tests (no database needed)
	cd backend && pytest tests/unit

cov: ## Generate an HTML coverage report
	cd backend && pytest --cov=app --cov-report=html && echo "open backend/htmlcov/index.html"

up: ## Start the full stack via Docker Compose
	docker compose up --build

down: ## Stop and remove containers
	docker compose down

logs: ## Tail service logs
	docker compose logs -f

migrate: ## Apply database migrations (Alembic)
	cd backend && alembic upgrade head

revision: ## Create a new migration:  make revision m="add table"
	cd backend && alembic revision -m "$(m)"

build: ## Build frontend production bundle
	cd frontend && npm run build
