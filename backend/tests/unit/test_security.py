"""Unit tests for password hashing and JWT handling."""

from __future__ import annotations

import hashlib

import jwt as pyjwt
import pytest
from app.core.security import (
    create_access_token,
    decode_access_token,
    hash_password,
    needs_rehash,
    verify_password,
)


def test_bcrypt_roundtrip():
    hashed = hash_password("s3cret-pw")
    assert hashed != "s3cret-pw"
    assert verify_password("s3cret-pw", hashed)
    assert not verify_password("wrong", hashed)


def test_bcrypt_hash_does_not_need_rehash():
    assert needs_rehash(hash_password("abc12345")) is False


def test_legacy_sha256_still_verifies():
    legacy = hashlib.sha256(b"admin123").hexdigest()
    assert verify_password("admin123", legacy)
    assert not verify_password("nope", legacy)


def test_legacy_sha256_flagged_for_rehash():
    legacy = hashlib.sha256(b"admin123").hexdigest()
    assert needs_rehash(legacy) is True


def test_jwt_roundtrip():
    token = create_access_token("user-123", "admin")
    claims = decode_access_token(token)
    assert claims["sub"] == "user-123"
    assert claims["role"] == "admin"


def test_jwt_rejects_tampered_token():
    token = create_access_token("user-123", "admin")
    with pytest.raises(pyjwt.PyJWTError):
        decode_access_token(token + "tampered")
