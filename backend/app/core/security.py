"""Authentication & password security primitives.

Two hardening changes over the original implementation:

1. Passwords are hashed with **bcrypt** (via passlib) instead of a bare,
   unsalted SHA-256 digest. A backward-compatibility path still verifies
   legacy SHA-256 hashes so existing seeded accounts keep working; callers can
   detect a legacy hash via :func:`needs_rehash` and transparently upgrade it
   on next successful login.
2. JWT creation/decoding is centralised here and driven by validated settings
   rather than a module-level constant with an insecure default.
"""

from __future__ import annotations

import hashlib
import hmac
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any

import jwt as pyjwt
from passlib.context import CryptContext

from app.config import get_settings

_pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


# ── Password hashing ───────────────────────────────────────────────────────
def hash_password(password: str) -> str:
    """Return a bcrypt hash for ``password``."""
    # passlib ships no type stubs, so every call returns Any. Coercing at the
    # boundary keeps Any from leaking into the rest of the codebase and lets
    # mypy run without --ignore-errors on this module.
    return str(_pwd_context.hash(password))


def _looks_like_legacy_sha256(stored_hash: str) -> bool:
    """Heuristic: legacy hashes are 64 lowercase hex chars (SHA-256)."""
    return len(stored_hash) == 64 and all(c in "0123456789abcdef" for c in stored_hash)


def verify_password(plain_password: str, stored_hash: str) -> bool:
    """Verify ``plain_password`` against ``stored_hash``.

    Supports both bcrypt hashes and legacy unsalted SHA-256 hashes so a
    database seeded before the bcrypt migration continues to authenticate.
    """
    if _looks_like_legacy_sha256(stored_hash):
        legacy = hashlib.sha256(plain_password.encode()).hexdigest()
        # Constant-time comparison — a plain == leaks a timing side-channel
        # that lets an attacker recover the hash prefix byte by byte.
        return hmac.compare_digest(legacy, stored_hash)
    try:
        return bool(_pwd_context.verify(plain_password, stored_hash))
    except ValueError:
        return False


def generate_reset_token() -> str:
    """A high-entropy, URL-safe password-reset token (sent to the user)."""
    return secrets.token_urlsafe(32)


def hash_reset_token(token: str) -> str:
    """SHA-256 hex of a reset token — only this is stored server-side.

    The token itself has ~256 bits of entropy, so a fast hash is safe here
    (unlike passwords, it is not guessable and needs no slow KDF).
    """
    return hashlib.sha256(token.encode()).hexdigest()


def needs_rehash(stored_hash: str) -> bool:
    """Return True if ``stored_hash`` should be upgraded to current scheme."""
    if _looks_like_legacy_sha256(stored_hash):
        return True
    return bool(_pwd_context.needs_update(stored_hash))


# ── JWT ────────────────────────────────────────────────────────────────────
def create_access_token(user_id: str, role: str, must_change_password: bool = False) -> str:
    """Create a signed JWT for the given user id and role.

    ``must_change_password`` is carried as a claim so the forced-rotation gate
    can be enforced server-side on every request without an extra query. A
    token minted before rotation therefore cannot be used for anything except
    changing the password.
    """
    settings = get_settings()
    now = datetime.now(tz=timezone.utc)
    payload = {
        "sub": user_id,
        "role": role,
        "must_change_password": must_change_password,
        "iat": now,
        "exp": now + timedelta(hours=settings.jwt_expire_hours),
    }
    return pyjwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_access_token(token: str) -> dict[str, Any]:
    """Decode and validate a JWT, returning its claims.

    Raises :class:`jwt.PyJWTError` subclasses on invalid/expired tokens; the
    caller (auth dependency) translates these into HTTP 401 responses.
    """
    settings = get_settings()
    claims: dict[str, Any] = pyjwt.decode(
        token, settings.jwt_secret, algorithms=[settings.jwt_algorithm]
    )
    return claims
