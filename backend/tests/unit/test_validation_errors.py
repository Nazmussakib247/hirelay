"""Regression tests for the validation-error handler.

Guards the bug where ``RequestValidationError.errors()`` carrying a raw
exception in ``ctx`` made ``JSONResponse``'s ``json.dumps`` fail *inside the
error handler*, converting a 422 into a 500. Any ``field_validator`` that
raises ``ValueError`` reproduces it — the job skill-weight validators do.
"""

from __future__ import annotations

import json
import uuid

import pytest
import pytest_asyncio
from app.core.dependencies import CurrentUser, get_current_user
from app.db.pool import get_connection
from app.main import create_app
from httpx import ASGITransport, AsyncClient
from pydantic import ValidationError as PydanticValidationError

from tests.fakes import FakeConnection


@pytest_asyncio.fixture
async def client():
    app = create_app()
    app.dependency_overrides[get_connection] = lambda: FakeConnection()
    app.dependency_overrides[get_current_user] = lambda: CurrentUser(
        id=str(uuid.uuid4()), role="admin"
    )
    async with AsyncClient(
        transport=ASGITransport(app=app, raise_app_exceptions=False),
        base_url="http://test",
    ) as ac:
        yield ac


@pytest.mark.parametrize("weight", [0, 11, 15, -3, 999])
async def test_out_of_range_skill_weight_is_422_not_500(client, weight):
    resp = await client.post(
        "/jobs",
        json={
            "title": "Engineer",
            "description": "desc",
            "required_skills": ["python"],
            "skill_weights": {"python": weight},
        },
    )
    assert (
        resp.status_code == 422
    ), f"weight={weight} should be a client error, got {resp.status_code}"
    assert resp.json()["error"]["code"] == "validation_error"


async def test_out_of_range_weight_on_patch_is_422(client):
    resp = await client.patch(
        f"/jobs/{uuid.uuid4()}/skills",
        json={"required_skills": ["python"], "skill_weights": {"python": 0}},
    )
    assert resp.status_code == 422


async def test_validation_error_body_is_serialisable_and_useful(client):
    resp = await client.post(
        "/jobs",
        json={
            "title": "Engineer",
            "required_skills": ["python"],
            "skill_weights": {"python": 15},
        },
    )
    assert resp.status_code == 422
    # The response must be real JSON with the validator's message preserved,
    # not a generic "internal error".
    body = json.loads(resp.text)
    details = body["error"]["details"]
    assert isinstance(details, list) and details
    assert any("between 1 and 10" in json.dumps(d) for d in details)


async def test_valid_weight_still_accepted(client):
    resp = await client.post(
        "/jobs",
        json={
            "title": "Engineer",
            "description": "d",
            "required_skills": ["python"],
            "skill_weights": {"python": 8},
        },
    )
    assert resp.status_code == 200


async def test_pydantic_errors_can_contain_non_serialisable_ctx():
    """Documents the root cause, so the fix is not silently reverted."""
    from app.schemas.job import JobCreate

    with pytest.raises(PydanticValidationError) as exc_info:
        JobCreate(title="x", required_skills=["python"], skill_weights={"python": 42})
    raw = exc_info.value.errors()
    with pytest.raises(TypeError):
        json.dumps(raw)  # exactly what used to happen inside the handler


# ── Upload filename guard ──────────────────────────────────────────────────
async def test_upload_without_filename_is_422_not_500(client):
    resp = await client.post("/upload-cv", files={"file": (None, b"%PDF-1.4 data")})
    assert resp.status_code == 422


async def test_upload_with_blank_filename_is_422(client):
    resp = await client.post("/upload-cv", files={"file": ("   ", b"%PDF-1.4 data")})
    assert resp.status_code == 422


async def test_missing_file_field_is_422(client):
    resp = await client.post("/upload-cv", files={"nope": ("a.pdf", b"%PDF-1.4 data")})
    assert resp.status_code == 422
