"""Business logic for HR-editable global default templates."""

from __future__ import annotations

import asyncpg

from app.config import get_settings
from app.repositories.settings import SettingsRepository
from app.schemas.settings import TemplateSettingsResponse, TemplateSettingsUpdate
from app.services import templates as tpl

# Response field  →  app_settings key / template-cache key.
_FIELD_TO_KEY = {
    "interview_message": "default_interview_message",
    "rejection_message": "default_rejection_message",
    "post_message": "default_post_message",
}


class SettingsService:
    def __init__(self, conn: asyncpg.Connection) -> None:
        self._repo = SettingsRepository(conn)

    def _snapshot(self) -> TemplateSettingsResponse:
        s = get_settings()
        eff = tpl.all_templates()
        return TemplateSettingsResponse(
            interview_message=eff["default_interview_message"],
            rejection_message=eff["default_rejection_message"],
            post_message=eff["default_post_message"],
            apply_url=f"{s.public_base_url.rstrip('/')}/apply.html",
            defaults={
                "interview_message": tpl.canonical("default_interview_message"),
                "rejection_message": tpl.canonical("default_rejection_message"),
                "post_message": tpl.canonical("default_post_message"),
            },
        )

    async def get_templates(self) -> TemplateSettingsResponse:
        return self._snapshot()

    async def update(self, payload: TemplateSettingsUpdate) -> TemplateSettingsResponse:
        for field, key in _FIELD_TO_KEY.items():
            value = getattr(payload, field)
            if value is None:
                continue  # field omitted → leave unchanged
            if value.strip():
                await self._repo.upsert(key, value.strip())
                tpl.set_override(key, value)
            else:
                # Blank string → drop the override, revert to built-in default.
                await self._repo.delete(key)
                tpl.clear_override(key)
        return self._snapshot()

    async def reset(self) -> TemplateSettingsResponse:
        """Delete every saved override → all templates return to built-in."""
        for key in tpl.TEMPLATE_KEYS:
            await self._repo.delete(key)
            tpl.clear_override(key)
        return self._snapshot()
