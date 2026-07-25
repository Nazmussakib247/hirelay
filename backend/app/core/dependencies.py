"""Reusable FastAPI dependencies (authentication & authorization).

``CurrentUser`` is a small typed value object so handlers get attribute access
(``user.id``, ``user.role``) instead of dictionary indexing into raw JWT claims.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Annotated

import jwt as pyjwt
from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.exceptions import AuthError, PermissionError
from app.core.security import decode_access_token

_bearer = HTTPBearer(auto_error=False)


@dataclass(frozen=True)
class CurrentUser:
    """Authenticated principal derived from a validated JWT."""

    id: str
    role: str
    must_change_password: bool = False

    @property
    def is_admin(self) -> bool:
        return self.role == "admin"


async def get_current_user(
    creds: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
) -> CurrentUser:
    """Resolve and validate the current user from the ``Authorization`` header.

    This is the *raw* principal: it authenticates the caller but does not
    enforce the forced-password-rotation gate. Only the endpoints a flagged
    user is allowed to reach (``/auth/me``, ``/auth/change-password``) should
    depend on this directly — everything else uses :data:`CurrentUserDep`.
    """
    if creds is None:
        raise AuthError("Authorization header missing")
    try:
        claims = decode_access_token(creds.credentials)
    except pyjwt.ExpiredSignatureError as exc:
        raise AuthError("Token has expired") from exc
    except pyjwt.PyJWTError as exc:
        raise AuthError("Invalid authentication token") from exc

    sub = claims.get("sub")
    role = claims.get("role", "recruiter")
    if not sub:
        raise AuthError("Malformed token: missing subject")
    return CurrentUser(
        id=sub,
        role=role,
        must_change_password=bool(claims.get("must_change_password", False)),
    )


async def require_password_changed(
    user: Annotated[CurrentUser, Depends(get_current_user)],
) -> CurrentUser:
    """Block principals that still owe a forced password rotation.

    Previously ``must_change_password`` was returned in the login body and
    enforced only by a React modal, so a token minted for the well-known
    bootstrap account (``admin``/``admin123``) was accepted on every endpoint —
    the rotation was advisory, not a control. The flag is now carried in the
    JWT and checked here, so the gate holds for any client.
    """
    if user.must_change_password:
        raise PermissionError(
            "Password change required before using the API. "
            "Call POST /auth/change-password to continue."
        )
    return user


async def require_admin(
    user: Annotated[CurrentUser, Depends(require_password_changed)],
) -> CurrentUser:
    """Dependency that enforces the admin role."""
    if not user.is_admin:
        raise PermissionError("Admin access required")
    return user


# Convenient type aliases for handler signatures.
#
# ``CurrentUserDep`` is the default for application endpoints: authenticated
# AND past the forced-rotation gate. ``AuthenticatedUserDep`` skips the gate and
# exists only for the two endpoints a flagged user must still be able to call.
CurrentUserDep = Annotated[CurrentUser, Depends(require_password_changed)]
AuthenticatedUserDep = Annotated[CurrentUser, Depends(get_current_user)]
AdminUserDep = Annotated[CurrentUser, Depends(require_admin)]
