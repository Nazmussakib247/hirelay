# ── Stage 1: build dependencies into an isolated prefix ────────────────────
FROM python:3.11-slim AS builder

WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc libpq-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt

# ── Stage 2: minimal runtime image, runs as a non-root user ────────────────
FROM python:3.11-slim AS runtime

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    ENVIRONMENT=production

# Create an unprivileged user to run the app.
RUN groupadd --system app && useradd --system --gid app --home /app app

WORKDIR /app
COPY --from=builder /install /usr/local
COPY app ./app
COPY alembic ./alembic
COPY alembic.ini ./

USER app
EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')" || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
