"""Settings routes: view / edit / reset the global default templates."""

from __future__ import annotations

from typing import Annotated

import asyncpg
from fastapi import APIRouter, Depends

from app.core.dependencies import AdminUserDep, CurrentUserDep
from app.db.pool import get_connection
from app.schemas.settings import TemplateSettingsResponse, TemplateSettingsUpdate
from app.services.settings_service import SettingsService

router = APIRouter(tags=["settings"])
ConnDep = Annotated[asyncpg.Connection, Depends(get_connection)]


@router.get("/settings/templates", response_model=TemplateSettingsResponse)
async def get_templates(conn: ConnDep, _: CurrentUserDep) -> TemplateSettingsResponse:
    return await SettingsService(conn).get_templates()


@router.put("/settings/templates", response_model=TemplateSettingsResponse)
async def update_templates(
    payload: TemplateSettingsUpdate, conn: ConnDep, _: AdminUserDep
) -> TemplateSettingsResponse:
    return await SettingsService(conn).update(payload)


@router.post("/settings/templates/reset", response_model=TemplateSettingsResponse)
async def reset_templates(conn: ConnDep, _: AdminUserDep) -> TemplateSettingsResponse:
    return await SettingsService(conn).reset()
