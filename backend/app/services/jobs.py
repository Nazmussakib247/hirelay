"""Job management business logic."""

from __future__ import annotations

import json

import asyncpg

from app.config import get_settings
from app.core.dependencies import CurrentUser
from app.core.exceptions import NotFoundError, PermissionError
from app.integrations.job_poster import get_configured_platforms, post_job_to_all_platforms
from app.repositories.jobs import JobRepository
from app.schemas.job import (
    JobCreate,
    JobCreateResponse,
    JobSkillsUpdate,
    JobSkillsUpdateResponse,
    JobStatusUpdateResponse,
)


def parse_skill_weights(raw: object) -> dict[str, float]:
    """JSONB comes back from asyncpg as a JSON string — normalise to a dict."""
    if isinstance(raw, dict):
        return raw
    if isinstance(raw, str) and raw:
        try:
            data = json.loads(raw)
            return data if isinstance(data, dict) else {}
        except json.JSONDecodeError:
            return {}
    return {}


class JobService:
    def __init__(self, conn: asyncpg.Connection) -> None:
        self._conn = conn
        self._jobs = JobRepository(conn)

    async def create(self, payload: JobCreate, created_by: str) -> JobCreateResponse:
        job_id = await self._jobs.create(payload.model_dump(), created_by)
        return JobCreateResponse(job_id=job_id)

    async def list_all(self) -> list[dict]:
        # Renamed from ``list``: a method named ``list`` shadows the builtin
        # inside the class body, so later annotations such as
        # ``-> list[dict]`` resolved to this method rather than the type.
        # It only survived at runtime because ``from __future__ import
        # annotations`` defers evaluation; ``typing.get_type_hints`` (and mypy)
        # both broke on it.
        rows = [dict(r) for r in await self._jobs.list_all()]
        for row in rows:
            row["skill_weights"] = parse_skill_weights(row.get("skill_weights"))
        return rows

    async def update_skills(
        self, job_id: str, payload: JobSkillsUpdate, user: CurrentUser
    ) -> JobSkillsUpdateResponse:
        row = await self._jobs.get(job_id)
        if row is None:
            raise NotFoundError("Job not found")
        if not user.is_admin and str(row["created_by"]) != user.id:
            raise PermissionError("You can only update jobs you created")
        await self._jobs.update_skill_weights(
            job_id, payload.required_skills, payload.skill_weights
        )
        return JobSkillsUpdateResponse(
            job_id=job_id,
            required_skills=payload.required_skills,
            skill_weights=payload.skill_weights,
        )

    async def update_status(
        self, job_id: str, new_status: str, user: CurrentUser
    ) -> JobStatusUpdateResponse:
        row = await self._jobs.get(job_id)
        if row is None:
            raise NotFoundError("Job not found")
        if not user.is_admin and str(row["created_by"]) != user.id:
            raise PermissionError("You can only update jobs you created")
        await self._jobs.update_status(job_id, new_status)
        return JobStatusUpdateResponse(
            job_id=job_id, previous_status=row["status"], new_status=new_status
        )

    async def delete(self, job_id: str, user: CurrentUser) -> dict:
        row = await self._jobs.get(job_id)
        if row is None:
            raise NotFoundError("Job not found")
        if not user.is_admin and str(row["created_by"]) != user.id:
            raise PermissionError("You can only delete jobs you created")
        await self._jobs.delete(job_id)
        return {"success": True, "deleted_job_id": job_id}

    async def post_to_platforms(self, job_id: str) -> dict:
        row = await self._jobs.get(job_id)
        if row is None:
            raise NotFoundError("Job not found")
        job = dict(row)
        job["id"] = str(job["id"])
        if job.get("created_by"):
            job["created_by"] = str(job["created_by"])
        settings = get_settings()
        # The apply link points candidates at the public apply page with this
        # job pre-selected; contact_email is the human fallback shown in the post.
        job["apply_url"] = f"{settings.public_base_url.rstrip('/')}/apply.html?job={job['id']}"
        job["contact_email"] = settings.contact_email
        result = await post_job_to_all_platforms(job)
        await self._jobs.record_posting(job_id, list(result["results"].keys()), result["results"])
        return {"job_id": job_id, "job_title": row["title"], "posting": result}

    async def list_postings(self) -> list[dict]:
        return [dict(r) for r in await self._jobs.list_postings()]

    def platforms(self) -> dict:
        return get_configured_platforms()
