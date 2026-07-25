"""The forced-password-rotation gate must be enforced server-side.

Before this was added, ``must_change_password`` was returned in the login body
and honoured only by a React modal — so a token minted for the well-known
bootstrap account (``admin``/``admin123``) was accepted on every endpoint.
"""

from __future__ import annotations

import uuid

import pytest
import pytest_asyncio
from app.core.dependencies import CurrentUser, get_current_user
from app.core.security import create_access_token, decode_access_token
from app.db.pool import get_connection
from app.main import create_app
from httpx import ASGITransport, AsyncClient

from tests.fakes import FakeConnection


def _client_for(must_change: bool, role: str = "admin") -> AsyncClient:
    app = create_app()
    app.dependency_overrides[get_connection] = lambda: FakeConnection()
    app.dependency_overrides[get_current_user] = lambda: CurrentUser(
        id=str(uuid.uuid4()), role=role, must_change_password=must_change
    )
    return AsyncClient(
        transport=ASGITransport(app=app, raise_app_exceptions=False), base_url="http://test"
    )


@pytest_asyncio.fixture
async def flagged():
    async with _client_for(True) as ac:
        yield ac


@pytest_asyncio.fixture
async def normal():
    async with _client_for(False) as ac:
        yield ac


GATED_ENDPOINTS = [
    ("get", "/candidates"),
    ("get", "/jobs"),
    ("get", "/auth/users"),
    ("get", "/job-postings"),
    ("get", "/platforms"),
    ("get", "/interviews"),
]


@pytest.mark.parametrize("method,path", GATED_ENDPOINTS)
async def test_flagged_user_is_blocked_from_application_endpoints(flagged, method, path):
    resp = await getattr(flagged, method)(path)
    assert resp.status_code == 403, f"{method.upper()} {path} must reject un-rotated users"
    assert resp.json()["error"]["code"] == "forbidden"


async def test_flagged_user_blocked_from_mutations(flagged):
    resp = await flagged.post("/jobs", json={"title": "Engineer", "description": "d"})
    assert resp.status_code == 403


@pytest.mark.parametrize("method,path", GATED_ENDPOINTS)
async def test_normal_user_is_not_blocked(normal, method, path):
    resp = await getattr(normal, method)(path)
    assert resp.status_code != 403, f"{method.upper()} {path} must stay open to rotated users"


async def test_change_password_endpoint_remains_reachable_when_flagged(flagged):
    """The one thing a flagged user must be able to do is clear the flag."""
    resp = await flagged.post(
        "/auth/change-password",
        json={"current_password": "admin123", "new_password": "a-much-better-password"},
    )
    assert resp.status_code != 403


# ── Token claims ───────────────────────────────────────────────────────────
def test_token_carries_the_rotation_flag():
    token = create_access_token(str(uuid.uuid4()), "admin", must_change_password=True)
    assert decode_access_token(token)["must_change_password"] is True


def test_token_defaults_to_not_requiring_rotation():
    token = create_access_token(str(uuid.uuid4()), "admin")
    assert decode_access_token(token)["must_change_password"] is False


def test_current_user_defaults_to_unflagged():
    assert CurrentUser(id="x", role="admin").must_change_password is False
