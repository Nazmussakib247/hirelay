"""HTTP-level tests using FastAPI dependency overrides + fake DB connection.

Exercises the real router -> service -> repository wiring (routing, auth,
validation, response models, status codes) without a live database.
"""

from __future__ import annotations

import hashlib
import uuid

import pytest_asyncio
from app.core.dependencies import CurrentUser, get_current_user
from app.db.pool import get_connection
from app.main import create_app
from httpx import ASGITransport, AsyncClient

from tests.fakes import FakeConnection


def _build(conn: FakeConnection, *, role: str = "admin"):
    app = create_app()
    app.dependency_overrides[get_connection] = lambda: conn
    app.dependency_overrides[get_current_user] = lambda: CurrentUser(
        id=str(uuid.uuid4()), role=role
    )
    return app


@pytest_asyncio.fixture
async def make_client():
    clients = []

    async def _factory(conn: FakeConnection, *, role: str = "admin") -> AsyncClient:
        app = _build(conn, role=role)
        ac = AsyncClient(transport=ASGITransport(app=app), base_url="http://test")
        clients.append(ac)
        return ac

    yield _factory
    for ac in clients:
        await ac.aclose()


async def test_health_no_auth(make_client):
    client = await make_client(FakeConnection())
    resp = await client.get("/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"


async def test_login_via_http(make_client):
    from app.core.security import hash_password

    row = {
        "id": uuid.uuid4(),
        "username": "admin",
        "email": "a@x.com",
        "role": "admin",
        "password_hash": hash_password("admin123"),
        # Part-1 profile columns AuthService now reads from the users row
        "full_name": None,
        "phone": None,
        "job_title": None,
        "department": None,
        "avatar_url": None,
        "must_change_password": False,
    }
    client = await make_client(FakeConnection(fetchrow=[row]))
    resp = await client.post("/auth/login", json={"username": "admin", "password": "admin123"})
    assert resp.status_code == 200
    assert resp.json()["user"]["role"] == "admin"


async def test_login_bad_password_via_http(make_client):
    row = {
        "id": uuid.uuid4(),
        "username": "admin",
        "email": "a@x.com",
        "role": "admin",
        "password_hash": hashlib.sha256(b"admin123").hexdigest(),
    }
    client = await make_client(FakeConnection(fetchrow=[row]))
    resp = await client.post("/auth/login", json={"username": "admin", "password": "nope"})
    assert resp.status_code == 401
    assert resp.json()["error"]["code"] == "unauthorized"


async def test_list_jobs_empty(make_client):
    client = await make_client(FakeConnection(fetch=[[]]))
    resp = await client.get("/jobs")
    assert resp.status_code == 200
    assert resp.json() == []


async def test_create_job_returns_id(make_client):
    new_id = uuid.uuid4()
    client = await make_client(FakeConnection(fetchval=[new_id]))
    resp = await client.post(
        "/jobs", json={"title": "Backend Dev", "required_skills": ["python"], "min_experience": 2}
    )
    assert resp.status_code == 200
    assert resp.json()["job_id"] == str(new_id)


async def test_create_job_rejects_empty_title(make_client):
    client = await make_client(FakeConnection())
    resp = await client.post("/jobs", json={"title": ""})
    assert resp.status_code == 422


async def test_stats_endpoint(make_client):
    # analytics.stats issues 9 fetchval calls, in order.
    values = [10, 3, 4, 3, 2, 82.5, 4, 6, 84.0]
    client = await make_client(FakeConnection(fetchval=values))
    resp = await client.get("/stats")
    assert resp.status_code == 200
    body = resp.json()
    assert body["total_candidates"] == 10
    assert body["avg_match_score"] == 82.5


async def test_seed_evaluation_dataset(make_client):
    client = await make_client(FakeConnection(fetchval=[0]))
    resp = await client.post("/evaluation/seed-dataset")
    assert resp.status_code == 200
    assert resp.json()["seeded"] == 50


async def test_platforms_endpoint(make_client):
    client = await make_client(FakeConnection())
    resp = await client.get("/platforms")
    assert resp.status_code == 200
    assert resp.json()["linkedin"] is False
