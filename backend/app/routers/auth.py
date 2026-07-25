"""Authentication & user-management routes.

Thin controllers: validate input via Pydantic, delegate to :class:`AuthService`,
return typed responses. No SQL or business rules live here.
"""

from typing import Annotated

import asyncpg
from fastapi import APIRouter, Depends, Request

from app.core.dependencies import AdminUserDep, AuthenticatedUserDep, CurrentUserDep
from app.core.rate_limit import LOGIN_LIMIT, limiter
from app.db.pool import get_connection
from app.schemas.auth import (
    ChangePasswordRequest,
    ChangePasswordResponse,
    ForgotPasswordRequest,
    LoginRequest,
    LoginResponse,
    MessageResponse,
    ProfileUpdateRequest,
    RegisterRequest,
    RegisterResponse,
    ResetPasswordRequest,
    UserPublic,
)
from app.services.auth import AuthService

router = APIRouter(prefix="/auth", tags=["auth"])

ConnDep = Annotated[asyncpg.Connection, Depends(get_connection)]


@router.post("/login", response_model=LoginResponse)
@limiter.limit(LOGIN_LIMIT)
async def login(request: Request, payload: LoginRequest, conn: ConnDep) -> LoginResponse:
    return await AuthService(conn).login(payload.username, payload.password)


@router.post("/register", response_model=RegisterResponse, status_code=201)
async def register(payload: RegisterRequest, conn: ConnDep, _: AdminUserDep) -> RegisterResponse:
    return await AuthService(conn).register(payload)


@router.post("/forgot-password", response_model=MessageResponse)
@limiter.limit(LOGIN_LIMIT)
async def forgot_password(
    request: Request, payload: ForgotPasswordRequest, conn: ConnDep
) -> MessageResponse:
    """Email a one-time reset code. Always returns a generic message so it
    cannot be used to discover which emails have accounts."""
    result = await AuthService(conn).request_password_reset(payload.email)
    return MessageResponse(**result)


@router.post("/reset-password", response_model=MessageResponse)
@limiter.limit(LOGIN_LIMIT)
async def reset_password(
    request: Request, payload: ResetPasswordRequest, conn: ConnDep
) -> MessageResponse:
    """Set a new password using a valid reset code."""
    result = await AuthService(conn).reset_password(payload.token, payload.new_password)
    return MessageResponse(**result)


# NOTE: change-password and /me deliberately use AuthenticatedUserDep, not
# CurrentUserDep. They are the only two endpoints a user who still owes a
# forced password rotation is allowed to reach — gating them behind the
# rotation check would make the rotation impossible to complete.
@router.post("/change-password", response_model=ChangePasswordResponse)
async def change_password(
    payload: ChangePasswordRequest, user: AuthenticatedUserDep, conn: ConnDep
) -> ChangePasswordResponse:
    return await AuthService(conn).change_password(
        user.id, payload.current_password, payload.new_password
    )


@router.get("/me", response_model=UserPublic)
async def me(user: AuthenticatedUserDep, conn: ConnDep) -> UserPublic:
    return await AuthService(conn).get_profile(user.id)


@router.patch("/me", response_model=UserPublic)
async def update_me(
    payload: ProfileUpdateRequest, user: CurrentUserDep, conn: ConnDep
) -> UserPublic:
    return await AuthService(conn).update_profile(user.id, payload)


@router.get("/users", response_model=list[UserPublic])
async def list_users(_: AdminUserDep, conn: ConnDep) -> list[UserPublic]:
    return await AuthService(conn).list_users()
