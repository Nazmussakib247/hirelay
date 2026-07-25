"""Authentication business logic."""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

import asyncpg

from app.core.exceptions import AuthError, ConflictError, ValidationError
from app.core.logging import get_logger
from app.core.security import (
    create_access_token,
    generate_reset_token,
    hash_password,
    hash_reset_token,
    needs_rehash,
    verify_password,
)
from app.repositories.users import PasswordResetRepository, UserRepository
from app.schemas.auth import (
    ChangePasswordResponse,
    LoginResponse,
    ProfileUpdateRequest,
    RegisterRequest,
    RegisterResponse,
    UserPublic,
)
from app.services.email import build_password_reset_email, send_email

logger = get_logger(__name__)

# How long a password-reset token stays valid.
_RESET_TOKEN_TTL = timedelta(hours=1)


class AuthService:
    def __init__(self, conn: asyncpg.Connection) -> None:
        self._conn = conn
        self._users = UserRepository(conn)
        self._resets = PasswordResetRepository(conn)

    async def login(self, username: str, password: str) -> LoginResponse:
        user = await self._users.get_by_username_or_email(username)
        if user is None or not verify_password(password, user["password_hash"]):
            # Uniform error — do not reveal whether the username exists.
            raise AuthError("Invalid credentials")

        # Transparent hash upgrade: legacy SHA-256 → bcrypt on successful login.
        if needs_rehash(user["password_hash"]):
            try:
                await self._users.update_password_hash(user["id"], hash_password(password))
                logger.info("password hash upgraded", extra={"user_id": str(user["id"])})
            except Exception:  # pragma: no cover - non-critical best effort
                logger.warning("password rehash failed", extra={"user_id": str(user["id"])})

        await self._users.touch_last_login(user["id"])
        must_change = bool(user["must_change_password"])
        token = create_access_token(str(user["id"]), user["role"], must_change)
        return LoginResponse(
            access_token=token,
            user=UserPublic(
                id=str(user["id"]),
                username=user["username"],
                email=user["email"],
                role=user["role"],
                full_name=user["full_name"],
                phone=user["phone"],
                job_title=user["job_title"],
                department=user["department"],
                avatar_url=user["avatar_url"],
                must_change_password=must_change,
            ),
        )

    async def change_password(
        self, user_id: str, current_password: str, new_password: str
    ) -> ChangePasswordResponse:
        """Verify the current password and set a new bcrypt hash.

        Also clears ``must_change_password``, completing the forced-rotation
        flow for seeded/bootstrap accounts.
        """
        stored = await self._users.get_password_hash(user_id)
        if stored is None or not verify_password(current_password, stored):
            raise AuthError("Current password is incorrect")
        if current_password == new_password:
            raise ValidationError("New password must differ from the current password")
        await self._users.set_password(user_id, hash_password(new_password))
        logger.info("password changed", extra={"user_id": user_id})

        # Re-mint the token. The caller's existing JWT still carries
        # ``must_change_password: true``, so without a fresh one they would be
        # locked out of every endpoint by the rotation gate they just cleared.
        row = await self._users.get_by_id(user_id)
        role = row["role"] if row else "recruiter"
        return ChangePasswordResponse(
            access_token=create_access_token(user_id, role, must_change_password=False)
        )

    async def register(self, data: RegisterRequest) -> RegisterResponse:
        if await self._users.exists_username_or_email(data.username, data.email):
            raise ConflictError("Username or email already exists")
        try:
            user_id = await self._users.create(
                data.username,
                data.email,
                hash_password(data.password),
                data.role,
                full_name=data.full_name,
            )
        except asyncpg.UniqueViolationError as exc:  # race-condition safety net
            raise ConflictError("Username or email already exists") from exc
        return RegisterResponse(user_id=user_id)

    async def get_profile(self, user_id: str) -> UserPublic:
        row = await self._users.get_by_id(user_id)
        if row is None:
            raise AuthError("User no longer exists")
        return UserPublic(**{**dict(row), "id": str(row["id"])})

    async def update_profile(self, user_id: str, data: ProfileUpdateRequest) -> UserPublic:
        row = await self._users.update_profile(
            uuid.UUID(user_id), data.model_dump(exclude_unset=True)
        )
        if row is None:
            raise AuthError("User no longer exists")
        return UserPublic(**{**dict(row), "id": str(row["id"])})

    async def list_users(self) -> list[UserPublic]:
        rows = await self._users.list_all()
        return [UserPublic(**{**dict(r), "id": str(r["id"])}) for r in rows]

    # ── Password reset ──────────────────────────────────────────────────────
    async def request_password_reset(self, email: str) -> dict:
        """Start a reset: email a one-time token to the account (if it exists).

        Always returns the same generic response so the endpoint cannot be used
        to discover which emails have accounts (no user enumeration).
        """
        generic = {
            "success": True,
            "message": "If an account exists for that email, a reset code has been sent.",
        }
        user = await self._users.get_by_email(email)
        if user is None:
            return generic

        token = generate_reset_token()
        expires = datetime.now(tz=timezone.utc) + _RESET_TOKEN_TTL
        await self._resets.create(user["id"], hash_reset_token(token), expires)

        content = build_password_reset_email(user["full_name"] or user["username"], token)
        result = await send_email(user["email"], content)
        if not result.success:
            logger.warning(
                "password reset email failed to send", extra={"user_id": str(user["id"])}
            )
        return generic

    async def reset_password(self, token: str, new_password: str) -> dict:
        """Complete a reset using a valid one-time token."""
        row = await self._resets.get_valid(hash_reset_token(token))
        if row is None:
            raise AuthError("Invalid or expired reset code")
        await self._users.set_password_by_id(row["user_id"], hash_password(new_password))
        await self._resets.mark_used(row["id"])
        await self._resets.invalidate_for_user(row["user_id"])
        logger.info("password reset completed", extra={"user_id": str(row["user_id"])})
        return {"success": True, "message": "Password has been reset. You can now log in."}
