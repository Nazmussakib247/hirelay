"""Shared pytest fixtures.

A deterministic JWT secret is set before the application package is imported so
``get_settings()`` validates cleanly in tests. Integration fixtures are gated
behind ``TEST_DATABASE_URL`` and skipped when no database is available.
"""

from __future__ import annotations

import os

os.environ.setdefault("JWT_SECRET", "test-secret-key-at-least-32-characters-long!!")
os.environ.setdefault("ENVIRONMENT", "development")
os.environ.setdefault("LOG_JSON", "false")

import pytest  # noqa: E402


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"
