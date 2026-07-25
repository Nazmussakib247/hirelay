"""Integration-test fixtures.

Skipped entirely unless ``TEST_DATABASE_URL`` points at a disposable Postgres.
CI provides one via a service container (see the GitHub Actions workflow).
"""

from __future__ import annotations

import os

import pytest
import pytest_asyncio

TEST_DB = os.getenv("TEST_DATABASE_URL")

pytestmark = pytest.mark.integration


@pytest_asyncio.fixture
async def client():
    if not TEST_DB:
        pytest.skip("TEST_DATABASE_URL not set — skipping integration tests")

    os.environ["DATABASE_URL"] = TEST_DB
    from app.main import create_app
    from asgi_lifespan import LifespanManager
    from httpx import ASGITransport, AsyncClient

    app = create_app()
    async with LifespanManager(app):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            yield ac


@pytest_asyncio.fixture
async def admin_token(client):
    resp = await client.post("/auth/login", json={"username": "admin", "password": "admin123"})
    assert resp.status_code == 200, resp.text
    return resp.json()["access_token"]
