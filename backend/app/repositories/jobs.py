"""Data-access for the ``jobs`` and ``job_postings`` tables."""

from __future__ import annotations

import json
import uuid

import asyncpg


class JobRepository:
    def __init__(self, conn: asyncpg.Connection) -> None:
        self._conn = conn

    async def create(self, data: dict, created_by: str) -> str:
        new_id = await self._conn.fetchval(
            "INSERT INTO jobs (title, description, required_skills, skill_weights, "
            "min_experience, location, post_message, interview_message, "
            "rejection_message, created_by) "
            "VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id",
            data["title"],
            data.get("description"),
            data.get("required_skills", []),
            json.dumps(data.get("skill_weights") or {}),
            data.get("min_experience", 0),
            (data.get("location") or None),
            (data.get("post_message") or None),
            (data.get("interview_message") or None),
            (data.get("rejection_message") or None),
            uuid.UUID(created_by),
        )
        return str(new_id)

    async def update_skill_weights(
        self, job_id: str, required_skills: list[str], skill_weights: dict
    ) -> None:
        await self._conn.execute(
            "UPDATE jobs SET required_skills=$1, skill_weights=$2 WHERE id=$3",
            required_skills,
            json.dumps(skill_weights or {}),
            uuid.UUID(job_id),
        )

    async def all_skill_keywords(self) -> list[str]:
        """Distinct skill keywords across all non-closed jobs.

        Fed into the CV parser as extra vocabulary so HR's custom per-job
        keywords are detected in uploaded CVs even when they are not in the
        built-in skill list.
        """
        rows = await self._conn.fetch(
            "SELECT DISTINCT lower(s) AS skill "
            "FROM jobs j, LATERAL unnest(j.required_skills) AS s "
            "WHERE j.status <> 'closed'"
        )
        return [r["skill"] for r in rows]

    async def get(self, job_id: str) -> asyncpg.Record | None:
        return await self._conn.fetchrow("SELECT * FROM jobs WHERE id = $1", uuid.UUID(job_id))

    async def list_all(self) -> list[asyncpg.Record]:
        return list(await self._conn.fetch("SELECT * FROM jobs ORDER BY created_at DESC"))

    async def update_status(self, job_id: str, status: str) -> None:
        await self._conn.execute("UPDATE jobs SET status=$1 WHERE id=$2", status, uuid.UUID(job_id))

    async def record_posting(self, job_id: str, platforms: list[str], results: dict) -> None:
        await self._conn.execute(
            "INSERT INTO job_postings (job_id, platforms_attempted, results) VALUES ($1,$2,$3)",
            uuid.UUID(job_id),
            platforms,
            json.dumps(results),
        )

    async def list_postings(self) -> list[asyncpg.Record]:
        rows = await self._conn.fetch(
            "SELECT jp.*, j.title AS job_title FROM job_postings jp "
            "LEFT JOIN jobs j ON jp.job_id = j.id ORDER BY jp.posted_at DESC LIMIT 50"
        )
        return list(rows)
