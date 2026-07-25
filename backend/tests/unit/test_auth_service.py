"""Service-layer tests for AuthService using a fake DB connection."""

from __future__ import annotations

import hashlib
import uuid

import pytest
from app.core.exceptions import AuthError
from app.core.security import decode_access_token
from app.services.auth import AuthService

from tests.fakes import FakeConnection


def _legacy_admin_row():
    return {
        "id": uuid.uuid4(),
        "username": "admin",
        "email": "admin@hrsystem.com",
        "role": "admin",
        "password_hash": hashlib.sha256(b"admin123").hexdigest(),
        # Part-1 profile columns AuthService now reads from the users row
        "full_name": None,
        "phone": None,
        "job_title": None,
        "department": None,
        "avatar_url": None,
        "must_change_password": False,
    }


async def test_login_success_issues_valid_token():
    conn = FakeConnection(fetchrow=[_legacy_admin_row()])
    result = await AuthService(conn).login("admin", "admin123")
    claims = decode_access_token(result.access_token)
    assert result.user.role == "admin"
    assert claims["sub"]


async def test_login_upgrades_legacy_hash():
    conn = FakeConnection(fetchrow=[_legacy_admin_row()])
    await AuthService(conn).login("admin", "admin123")
    # one execute for the bcrypt upgrade, one for last_login
    updated = [q for q, _ in conn.executed if "password_hash" in q]
    touched = [q for q, _ in conn.executed if "last_login" in q]
    assert len(updated) == 1
    assert len(touched) == 1


async def test_login_wrong_password_rejected():
    conn = FakeConnection(fetchrow=[_legacy_admin_row()])
    with pytest.raises(AuthError):
        await AuthService(conn).login("admin", "wrong")


async def test_login_unknown_user_rejected():
    conn = FakeConnection(fetchrow=[None])
    with pytest.raises(AuthError):
        await AuthService(conn).login("ghost", "whatever")


async def test_login_surfaces_must_change_password_flag():
    row = _legacy_admin_row()
    row["must_change_password"] = True
    conn = FakeConnection(fetchrow=[row])
    result = await AuthService(conn).login("admin", "admin123")
    assert result.user.must_change_password is True


# ── change-password flow ────────────────────────────────────────────────────
_UID = "00000000-0000-0000-0000-000000000001"


async def test_change_password_wrong_current_rejected():
    from app.core.security import hash_password

    conn = FakeConnection(fetchval=[hash_password("actual-password")])
    with pytest.raises(AuthError):
        await AuthService(conn).change_password(_UID, "wrong-guess", "new-password-123")


async def test_change_password_same_password_rejected():
    from app.core.exceptions import ValidationError
    from app.core.security import hash_password

    conn = FakeConnection(fetchval=[hash_password("samepass123")])
    with pytest.raises(ValidationError):
        await AuthService(conn).change_password(_UID, "samepass123", "samepass123")


async def test_change_password_success_clears_forced_flag():
    from app.core.security import hash_password, verify_password

    conn = FakeConnection(fetchval=[hash_password("old-password-1")])
    result = await AuthService(conn).change_password(_UID, "old-password-1", "new-password-2")
    assert result.success is True

    sets = [(q, a) for q, a in conn.executed if "must_change_password = FALSE" in q]
    assert len(sets) == 1  # new hash written AND forced-change flag cleared
    new_hash = sets[0][1][0]
    assert verify_password("new-password-2", new_hash)
