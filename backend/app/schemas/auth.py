"""Authentication & user schemas."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, EmailStr, Field

Role = Literal["admin", "recruiter"]


class LoginRequest(BaseModel):
    username: str = Field(..., min_length=1, description="Username or email")
    password: str = Field(..., min_length=1)


class UserPublic(BaseModel):
    id: str
    username: str
    email: str
    role: Role
    full_name: str | None = None
    phone: str | None = None
    job_title: str | None = None
    department: str | None = None
    avatar_url: str | None = None
    is_active: bool | None = None
    created_at: datetime | None = None
    last_login: datetime | None = None
    # True forces the client to route the user through a password change
    # before using the app (set on seeded/bootstrap accounts).
    must_change_password: bool | None = None


class LoginResponse(BaseModel):
    access_token: str
    token_type: Literal["bearer"] = "bearer"
    user: UserPublic


class RegisterRequest(BaseModel):
    username: str = Field(..., min_length=3, max_length=100)
    email: EmailStr
    password: str = Field(..., min_length=8, max_length=128)
    role: Role = "recruiter"
    full_name: str | None = Field(None, max_length=150)


class ProfileUpdateRequest(BaseModel):
    """Partial update of the caller's own profile — all fields optional."""

    full_name: str | None = Field(None, max_length=150)
    phone: str | None = Field(None, max_length=30)
    job_title: str | None = Field(None, max_length=100)
    department: str | None = Field(None, max_length=100)
    avatar_url: str | None = None


class RegisterResponse(BaseModel):
    success: bool = True
    user_id: str


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(..., min_length=1)
    new_password: str = Field(..., min_length=8, max_length=128)


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str = Field(..., min_length=8, max_length=200)
    new_password: str = Field(..., min_length=8, max_length=128)


class MessageResponse(BaseModel):
    success: bool = True
    message: str


class ChangePasswordResponse(BaseModel):
    success: bool = True
    # Freshly minted token with the forced-rotation claim cleared. Clients must
    # replace their stored token with this one; the previous token still
    # carries ``must_change_password: true`` and is refused by the gate.
    access_token: str | None = None
    token_type: Literal["bearer"] = "bearer"
