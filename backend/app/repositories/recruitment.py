"""Data-access for matching side-effects: match_results, interviews, email_logs."""

from __future__ import annotations

import json
import uuid
from datetime import datetime
from typing import Any

import asyncpg


class MatchResultRepository:
    def __init__(self, conn: asyncpg.Connection) -> None:
        self._conn = conn

    async def create(
        self,
        candidate_id: str,
        job_id: str,
        score: float,
        skill: float,
        experience: float,
        tfidf: float,
        ai: float,
        breakdown: dict,
    ) -> None:
        await self._conn.execute(
            "INSERT INTO match_results (candidate_id, job_id, score, skill_score, "
            "experience_score, tfidf_score, ai_score, breakdown) "
            "VALUES ($1,$2,$3,$4,$5,$6,$7,$8)",
            uuid.UUID(candidate_id),
            uuid.UUID(job_id),
            score,
            skill,
            experience,
            tfidf,
            ai,
            json.dumps(breakdown),
        )

    async def latest_breakdown_for_candidate(self, candidate_id: str) -> dict | None:
        """Return the most recent match breakdown (parsed JSON) for a candidate."""
        raw = await self._conn.fetchval(
            "SELECT breakdown FROM match_results WHERE candidate_id=$1 "
            "ORDER BY created_at DESC LIMIT 1",
            uuid.UUID(candidate_id),
        )
        if raw is None:
            return None
        if isinstance(raw, dict):
            return raw
        try:
            decoded = json.loads(raw)
        except (TypeError, ValueError):
            return None
        return decoded if isinstance(decoded, dict) else None


class InterviewRepository:
    def __init__(self, conn: asyncpg.Connection) -> None:
        self._conn = conn

    async def create(
        self,
        candidate_id: str,
        job_id: str,
        candidate_name: str | None,
        candidate_email: str | None,
        job_title: str,
        score: float,
        interview_time: datetime,
        meet_link: str,
    ) -> str:
        new_id = await self._conn.fetchval(
            "INSERT INTO interviews (candidate_id, job_id, candidate_name, "
            "candidate_email, job_title, match_score, interview_time, meet_link) "
            "VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id",
            uuid.UUID(candidate_id),
            uuid.UUID(job_id),
            candidate_name,
            candidate_email,
            job_title,
            score,
            interview_time,
            meet_link,
        )
        return str(new_id)

    async def mark_email_sent(self, interview_id: str) -> None:
        await self._conn.execute(
            "UPDATE interviews SET email_sent=TRUE, email_sent_at=NOW() WHERE id=$1",
            uuid.UUID(interview_id),
        )

    async def set_feedback(
        self, interview_id: str, rating: int | None, feedback: str | None
    ) -> None:
        await self._conn.execute(
            "UPDATE interviews SET rating=$1, feedback=$2 WHERE id=$3",
            rating,
            feedback,
            uuid.UUID(interview_id),
        )

    async def latest_for_candidate(self, candidate_id: str) -> asyncpg.Record | None:
        return await self._conn.fetchrow(
            "SELECT * FROM interviews WHERE candidate_id=$1 ORDER BY created_at DESC LIMIT 1",
            uuid.UUID(candidate_id),
        )

    async def list_all(self) -> list[asyncpg.Record]:
        return list(await self._conn.fetch("SELECT * FROM interviews ORDER BY created_at DESC"))

    async def get(self, interview_id: str) -> asyncpg.Record | None:
        return await self._conn.fetchrow(
            "SELECT * FROM interviews WHERE id=$1", uuid.UUID(interview_id)
        )

    async def list_paginated(
        self, status: str | None, offset: int, limit: int
    ) -> tuple[int, list[asyncpg.Record]]:
        total = await self._conn.fetchval(
            "SELECT COUNT(*) FROM interviews WHERE ($1::text IS NULL OR status=$1)",
            status,
        )
        rows = await self._conn.fetch(
            "SELECT * FROM interviews WHERE ($1::text IS NULL OR status=$1) "
            "ORDER BY created_at DESC LIMIT $2 OFFSET $3",
            status,
            limit,
            offset,
        )
        return total, rows

    async def update_time(self, interview_id: str, interview_time: datetime) -> None:
        await self._conn.execute(
            "UPDATE interviews SET interview_time=$1, status='scheduled' WHERE id=$2",
            interview_time,
            uuid.UUID(interview_id),
        )

    async def set_status(self, interview_id: str, status: str) -> None:
        await self._conn.execute(
            "UPDATE interviews SET status=$1 WHERE id=$2",
            status,
            uuid.UUID(interview_id),
        )


class MatchRunRepository:
    """Persistence for background match-all runs (progress + final result)."""

    def __init__(self, conn: asyncpg.Connection) -> None:
        self._conn = conn

    async def create(self, job_id: str, total: int) -> str:
        run_id = await self._conn.fetchval(
            "INSERT INTO match_runs (job_id, total) VALUES ($1,$2) RETURNING id",
            uuid.UUID(job_id),
            total,
        )
        return str(run_id)

    async def update_progress(
        self, run_id: str, processed: int, shortlisted: int, rejected: int, emails_sent: int
    ) -> None:
        await self._conn.execute(
            "UPDATE match_runs SET processed=$1, shortlisted=$2, rejected=$3, "
            "emails_sent=$4 WHERE id=$5",
            processed,
            shortlisted,
            rejected,
            emails_sent,
            uuid.UUID(run_id),
        )

    async def complete(self, run_id: str, result: dict) -> None:
        await self._conn.execute(
            "UPDATE match_runs SET status='completed', result=$1, finished_at=NOW() " "WHERE id=$2",
            json.dumps(result),
            uuid.UUID(run_id),
        )

    async def fail(self, run_id: str, error: str) -> None:
        await self._conn.execute(
            "UPDATE match_runs SET status='failed', error=$1, finished_at=NOW() WHERE id=$2",
            error[:2000],
            uuid.UUID(run_id),
        )

    async def get(self, run_id: str) -> asyncpg.Record | None:
        return await self._conn.fetchrow("SELECT * FROM match_runs WHERE id=$1", uuid.UUID(run_id))


class EmailLogRepository:
    def __init__(self, conn: asyncpg.Connection) -> None:
        self._conn = conn

    async def log(
        self,
        candidate_id: Any,
        email_type: str,
        to_email: str | None,
        subject: str,
        status: str,
        error: str | None = None,
    ) -> None:
        cid = uuid.UUID(str(candidate_id)) if candidate_id else None
        await self._conn.execute(
            "INSERT INTO email_logs (candidate_id, email_type, to_email, subject, "
            "status, error_msg) VALUES ($1,$2,$3,$4,$5,$6)",
            cid,
            email_type,
            to_email,
            subject,
            status,
            error,
        )

    async def list_paginated(
        self, email_type: str | None, status: str | None, offset: int, limit: int
    ) -> tuple[int, list[asyncpg.Record]]:
        total = await self._conn.fetchval(
            "SELECT COUNT(*) FROM email_logs "
            "WHERE ($1::text IS NULL OR email_type=$1) "
            "AND ($2::text IS NULL OR status=$2)",
            email_type,
            status,
        )
        rows = await self._conn.fetch(
            "SELECT * FROM email_logs "
            "WHERE ($1::text IS NULL OR email_type=$1) "
            "AND ($2::text IS NULL OR status=$2) "
            "ORDER BY sent_at DESC LIMIT $3 OFFSET $4",
            email_type,
            status,
            limit,
            offset,
        )
        return total, rows
