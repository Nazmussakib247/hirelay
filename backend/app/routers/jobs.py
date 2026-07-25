"""Job routes: create, list, status, post-to-platforms, postings, platforms."""

from __future__ import annotations

from typing import Annotated

import asyncpg
from fastapi import APIRouter, Depends

from app.core.dependencies import AdminUserDep, CurrentUserDep
from app.db.pool import get_connection
from app.schemas.job import (
    JobCreate,
    JobCreateResponse,
    JobSkillsUpdate,
    JobSkillsUpdateResponse,
    JobStatusUpdate,
    JobStatusUpdateResponse,
    SkillSuggestRequest,
    SkillSuggestResponse,
)
from app.services.jobs import JobService
from app.services.matching import suggest_job_skills

router = APIRouter(tags=["jobs"])
ConnDep = Annotated[asyncpg.Connection, Depends(get_connection)]


@router.post("/jobs", response_model=JobCreateResponse)
async def create_job(payload: JobCreate, conn: ConnDep, user: CurrentUserDep) -> JobCreateResponse:
    return await JobService(conn).create(payload, user.id)


@router.get("/jobs")
async def list_jobs(conn: ConnDep, _: CurrentUserDep) -> list[dict]:
    return await JobService(conn).list_all()


@router.post("/jobs/suggest-skills", response_model=SkillSuggestResponse)
async def suggest_skills(payload: SkillSuggestRequest, _: CurrentUserDep) -> SkillSuggestResponse:
    """AI-suggest skill keywords + importance weights from a job description."""
    result = await suggest_job_skills(payload.description, payload.title or "")
    return SkillSuggestResponse(**result)


@router.patch("/jobs/{job_id}/skills", response_model=JobSkillsUpdateResponse)
async def update_job_skills(
    job_id: str, payload: JobSkillsUpdate, conn: ConnDep, user: CurrentUserDep
) -> JobSkillsUpdateResponse:
    """Set or edit a job's skill keywords and per-skill weights."""
    return await JobService(conn).update_skills(job_id, payload, user)


@router.patch("/jobs/{job_id}/status", response_model=JobStatusUpdateResponse)
async def update_job_status(
    job_id: str, payload: JobStatusUpdate, conn: ConnDep, user: AdminUserDep
) -> JobStatusUpdateResponse:
    """Change a job's status, e.g. close it (admin only)."""
    return await JobService(conn).update_status(job_id, payload.status, user)


@router.post("/jobs/{job_id}/post")
async def post_job(job_id: str, conn: ConnDep, _: CurrentUserDep) -> dict:
    return await JobService(conn).post_to_platforms(job_id)


@router.get("/job-postings")
async def list_postings(conn: ConnDep, _: CurrentUserDep) -> list[dict]:
    return await JobService(conn).list_postings()


@router.get("/platforms")
async def platforms(conn: ConnDep, _: CurrentUserDep) -> dict:
    return JobService(conn).platforms()
