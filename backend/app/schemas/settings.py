"""Schemas for the editable default templates (Settings screen)."""

from __future__ import annotations

from pydantic import BaseModel, Field


class TemplateSettingsUpdate(BaseModel):
    """Save global default templates. A field left ``None`` is unchanged; a
    blank string resets that template back to the built-in default."""

    interview_message: str | None = Field(default=None, max_length=4000)
    rejection_message: str | None = Field(default=None, max_length=4000)
    post_message: str | None = Field(default=None, max_length=4000)


class TemplateSettingsResponse(BaseModel):
    # The currently-effective templates (saved override, or built-in default).
    interview_message: str
    rejection_message: str
    post_message: str
    # The public apply page (all open jobs) candidates can self-apply from.
    apply_url: str
    # The original built-in defaults, so the UI can offer a "reset" preview.
    defaults: dict[str, str]
