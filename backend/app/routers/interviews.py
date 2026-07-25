"""Interview management routes: list (paginated), reschedule, cancel, complete."""

from __future__ import annotations

from datetime import datetime
from typing import Annotated

import asyncpg
from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel

from app.core.dependencies import CurrentUserDep
from app.core.exceptions import ValidationError
from app.db.pool import get_connection
from app.services.recruitment import InterviewService

router = APIRouter(tags=["interviews"])
ConnDep = Annotated[asyncpg.Connection, Depends(get_connection)]


class RescheduleRequest(BaseModel):
    interview_time: datetime


class FeedbackRequest(BaseModel):
    rating: int | None = None
    feedback: str | None = None


@router.get("/interviews")
async def list_interviews(
    conn: ConnDep,
    _: CurrentUserDep,
    status: str | None = None,
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
) -> dict:
    if status is not None and status not in ("scheduled", "completed", "cancelled"):
        raise ValidationError("status must be scheduled, completed, or cancelled")
    return await InterviewService(conn).list(status, offset, limit)


@router.patch("/interviews/{interview_id}")
async def reschedule_interview(
    interview_id: str, payload: RescheduleRequest, conn: ConnDep, _: CurrentUserDep
) -> dict:
    return await InterviewService(conn).reschedule(interview_id, payload.interview_time)


@router.post("/interviews/{interview_id}/cancel")
async def cancel_interview(interview_id: str, conn: ConnDep, _: CurrentUserDep) -> dict:
    return await InterviewService(conn).cancel(interview_id)


@router.post("/interviews/{interview_id}/complete")
async def complete_interview(interview_id: str, conn: ConnDep, _: CurrentUserDep) -> dict:
    return await InterviewService(conn).complete(interview_id)


@router.patch("/interviews/{interview_id}/feedback")
async def interview_feedback(
    interview_id: str, payload: FeedbackRequest, conn: ConnDep, _: CurrentUserDep
) -> dict:
    """Record HR's post-interview rating (1-5) and notes."""
    return await InterviewService(conn).set_feedback(interview_id, payload.rating, payload.feedback)
