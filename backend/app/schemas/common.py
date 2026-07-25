"""Shared/generic schemas used across multiple domains."""

from __future__ import annotations

from typing import Generic, TypeVar

from pydantic import BaseModel, Field

T = TypeVar("T")


class MessageResponse(BaseModel):
    """Simple success envelope for mutations that return no entity."""

    success: bool = True
    message: str | None = None


class Page(BaseModel, Generic[T]):
    """Standard pagination envelope: ``{total, offset, limit, items}``."""

    total: int = Field(..., description="Total rows matching the query")
    offset: int = Field(..., ge=0)
    limit: int = Field(..., ge=1, le=200)
    items: list[T]


class PaginationParams(BaseModel):
    """Reusable, clamped pagination query parameters."""

    offset: int = Field(default=0, ge=0)
    limit: int = Field(default=50, ge=1, le=200)
