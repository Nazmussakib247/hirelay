"""Matching routes: match one, match all pending, resend email."""

from __future__ import annotations

from datetime import datetime
from typing import Annotated

import asyncpg
from fastapi import APIRouter, BackgroundTasks, Depends
from pydantic import BaseModel

from app.core.dependencies import CurrentUserDep
from app.db.pool import get_connection
from app.schemas.match import MatchResponse, MatchRunStarted, MatchRunStatus
from app.services.recruitment import MatchingService, get_match_run

router = APIRouter(tags=["matching"])
ConnDep = Annotated[asyncpg.Connection, Depends(get_connection)]


@router.post("/match/{candidate_id}/{job_id}", response_model=MatchResponse)
async def match_candidate(
    candidate_id: str,
    job_id: str,
    background_tasks: BackgroundTasks,
    conn: ConnDep,
    _: CurrentUserDep,
    auto_email: bool = True,
) -> dict:
    return await MatchingService(conn).match(candidate_id, job_id, background_tasks, auto_email)


@router.post("/match-all/{job_id}", status_code=202, response_model=MatchRunStarted)
async def match_all(
    job_id: str,
    conn: ConnDep,
    _: CurrentUserDep,
    auto_email: bool = True,
) -> dict:
    """Start a background match-all run; poll ``GET /match-runs/{run_id}``."""
    return await MatchingService(conn).start_match_all(job_id, auto_email)


@router.get("/match-runs/{run_id}", response_model=MatchRunStatus)
async def match_run_status(run_id: str, conn: ConnDep, _: CurrentUserDep) -> dict:
    return await get_match_run(conn, run_id)


@router.get("/interviews/schedule-info")
async def interview_schedule_info(conn: ConnDep, _: CurrentUserDep) -> dict:
    """Proposed slot + upcoming busy slots, for the schedule dialog."""
    return await MatchingService(conn).schedule_info()


class ScheduleInterviewRequest(BaseModel):
    # Optional: HR's chosen slot. Omitted → the next auto slot is used.
    interview_time: datetime | None = None


@router.post("/schedule-interview/{candidate_id}")
async def schedule_interview(
    candidate_id: str, conn: ConnDep, _: CurrentUserDep, payload: ScheduleInterviewRequest | None = None
) -> dict:
    """Schedule an interview and send the invite for a shortlisted candidate."""
    when = payload.interview_time if payload else None
    return await MatchingService(conn).schedule_interview(candidate_id, when)


class BulkEmailRequest(BaseModel):
    candidate_ids: list[str]


@router.post("/candidates/bulk-email")
async def bulk_email(payload: BulkEmailRequest, conn: ConnDep, _: CurrentUserDep) -> dict:
    """Email many candidates at once (the right template per candidate)."""
    return await MatchingService(conn).bulk_email(payload.candidate_ids)


@router.post("/send-email/{candidate_id}")
async def resend_email(candidate_id: str, conn: ConnDep, _: CurrentUserDep) -> dict:
    return await MatchingService(conn).resend_email(candidate_id)
