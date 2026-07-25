"""End-to-end API tests (require a live database via TEST_DATABASE_URL)."""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.integration


async def test_health_ok(client):
    resp = await client.get("/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"


async def test_readiness_ok(client):
    resp = await client.get("/health/ready")
    assert resp.status_code == 200
    assert resp.json()["database"] == "ok"


async def test_login_success(client):
    resp = await client.post("/auth/login", json={"username": "admin", "password": "admin123"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["token_type"] == "bearer"
    assert body["user"]["role"] == "admin"


async def test_login_bad_credentials(client):
    resp = await client.post("/auth/login", json={"username": "admin", "password": "wrong"})
    assert resp.status_code == 401


async def test_protected_route_requires_auth(client):
    assert (await client.get("/candidates")).status_code == 401


async def test_me_returns_profile(client, admin_token):
    resp = await client.get("/auth/me", headers={"Authorization": f"Bearer {admin_token}"})
    assert resp.status_code == 200
    assert resp.json()["username"] == "admin"


async def test_create_and_list_job(client, admin_token):
    headers = {"Authorization": f"Bearer {admin_token}"}
    create = await client.post(
        "/jobs",
        headers=headers,
        json={
            "title": "Test Python Role",
            "description": "Backend role",
            "required_skills": ["python", "fastapi"],
            "min_experience": 2,
        },
    )
    assert create.status_code == 200
    job_id = create.json()["job_id"]
    jobs = await client.get("/jobs", headers=headers)
    assert any(j["id"] == job_id for j in jobs.json())


async def test_job_create_validation_rejects_empty_title(client, admin_token):
    resp = await client.post(
        "/jobs", headers={"Authorization": f"Bearer {admin_token}"}, json={"title": ""}
    )
    assert resp.status_code == 422
