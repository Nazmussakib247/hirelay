"""Data-access for the ``candidates`` table."""

from __future__ import annotations

import uuid
from typing import Any

import asyncpg


class CandidateRepository:
    def __init__(self, conn: asyncpg.Connection) -> None:
        self._conn = conn

    async def create(self, data: dict, uploaded_by: str) -> str:
        new_id = await self._conn.fetchval(
            "INSERT INTO candidates "
            "(name, email, phone, skills, experience_years, education, raw_text, "
            "cv_filename, parse_confidence, uploaded_by) "
            "VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id",
            data["name"],
            data["email"],
            data["phone"],
            data["skills"],
            data["experience_years"],
            data["education"],
            data["raw_text"],
            data["cv_filename"],
            data.get("parse_confidence"),
            uuid.UUID(uploaded_by),
        )
        return str(new_id)

    async def create_public(self, data: dict, applied_job_id: str) -> str:
        """Create a candidate who self-applied via the public link.

        There is no authenticated uploader, so ``uploaded_by`` is left NULL; the
        job they chose is recorded in ``applied_job_id`` and ``source='public'``.
        """
        new_id = await self._conn.fetchval(
            "INSERT INTO candidates "
            "(name, email, phone, skills, experience_years, education, raw_text, "
            "cv_filename, parse_confidence, applied_job_id, source) "
            "VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'public') RETURNING id",
            data["name"],
            data["email"],
            data["phone"],
            data["skills"],
            data["experience_years"],
            data["education"],
            data["raw_text"],
            data["cv_filename"],
            data.get("parse_confidence"),
            uuid.UUID(applied_job_id),
        )
        return str(new_id)

    async def set_applied_job(self, candidate_id: str, job_id: str) -> None:
        """Tag an existing candidate as having applied to ``job_id`` publicly."""
        await self._conn.execute(
            "UPDATE candidates SET applied_job_id=$1, source='public' WHERE id=$2",
            uuid.UUID(job_id),
            uuid.UUID(candidate_id),
        )

    async def get(self, candidate_id: str) -> asyncpg.Record | None:
        return await self._conn.fetchrow(
            "SELECT * FROM candidates WHERE id = $1", uuid.UUID(candidate_id)
        )

    async def find_id_by_email(self, email: str) -> str | None:
        """Case-insensitive lookup used for duplicate-CV detection."""
        found = await self._conn.fetchval(
            "SELECT id FROM candidates WHERE lower(email) = lower($1) "
            "ORDER BY created_at DESC LIMIT 1",
            email,
        )
        return str(found) if found else None

    async def get_with_job_title(self, candidate_id: str) -> asyncpg.Record | None:
        return await self._conn.fetchrow(
            "SELECT c.*, j.title AS job_title FROM candidates c "
            "LEFT JOIN jobs j ON c.matched_job_id = j.id WHERE c.id = $1",
            uuid.UUID(candidate_id),
        )

    async def exists(self, candidate_id: str) -> bool:
        return bool(
            await self._conn.fetchval(
                "SELECT 1 FROM candidates WHERE id = $1", uuid.UUID(candidate_id)
            )
        )

    async def list_paginated(
        self,
        status: str | None,
        offset: int,
        limit: int,
        job: str | None = None,
        q: str | None = None,
    ) -> tuple[int, list[asyncpg.Record]]:
        """List candidates, optionally filtered by status, matched job and/or a
        free-text query over name / email / skills.

        ``job`` may be:
          * ``None``          — no job filter
          * ``"unmatched"``   — candidates not yet matched to any job
          * a job UUID string — candidates matched to that specific job
        """
        conditions = ["($1::text IS NULL OR status = $1)"]
        params: list[Any] = [status]
        if job == "unmatched":
            conditions.append("matched_job_id IS NULL")
        elif job:
            params.append(uuid.UUID(job))
            conditions.append(f"matched_job_id = ${len(params)}")
        if q and q.strip():
            params.append(f"%{q.strip()}%")
            i = len(params)
            # Case-insensitive match across name, email, and the skills array.
            conditions.append(
                f"(name ILIKE ${i} OR email ILIKE ${i} "
                f"OR array_to_string(skills, ' ') ILIKE ${i})"
            )
        where = " AND ".join(conditions)

        total = await self._conn.fetchval(
            f"SELECT COUNT(*) FROM candidates WHERE {where}", *params
        )
        rows = await self._conn.fetch(
            f"SELECT * FROM candidates WHERE {where} "
            f"ORDER BY match_score DESC, created_at DESC "
            f"LIMIT ${len(params) + 1} OFFSET ${len(params) + 2}",
            *params,
            limit,
            offset,
        )
        # ``fetchval`` is typed Any and can hand back None; coercing here keeps
        # the Page[...] response contract (total: int) satisfiable in every case.
        return int(total or 0), rows

    async def list_pending_ids(self) -> list[uuid.UUID]:
        rows = await self._conn.fetch("SELECT id FROM candidates WHERE status = 'pending'")
        return [r["id"] for r in rows]

    async def update_from_cv(self, candidate_id: str, data: dict) -> None:
        await self._conn.execute(
            "UPDATE candidates SET name=$1, email=$2, phone=$3, skills=$4, "
            "experience_years=$5, education=$6, raw_text=$7, cv_filename=$8, "
            "parse_confidence=$9, "
            "status='pending', match_score=0, matched_job_id=NULL, ai_summary=NULL "
            "WHERE id=$10",
            data["name"],
            data["email"],
            data["phone"],
            data["skills"],
            data["experience_years"],
            data["education"],
            data["raw_text"],
            data["cv_filename"],
            data.get("parse_confidence"),
            uuid.UUID(candidate_id),
        )

    async def set_match_result(
        self, candidate_id: str, status: str, score: float, job_id: str, summary: str
    ) -> None:
        await self._conn.execute(
            "UPDATE candidates SET status=$1, match_score=$2, matched_job_id=$3, "
            "ai_summary=$4 WHERE id=$5",
            status,
            score,
            uuid.UUID(job_id),
            summary,
            uuid.UUID(candidate_id),
        )

    async def set_notes(self, candidate_id: str, notes: str | None) -> None:
        await self._conn.execute(
            "UPDATE candidates SET notes=$1 WHERE id=$2",
            notes,
            uuid.UUID(candidate_id),
        )

    async def bulk_set_status(self, ids: list[Any], status: str) -> int:
        """Set the same status on many candidates; returns the number updated."""
        rows = await self._conn.fetch(
            "UPDATE candidates SET status=$1 WHERE id = ANY($2::uuid[]) RETURNING id",
            status,
            ids,
        )
        return len(rows)

    async def set_status(self, candidate_id: str, status: str) -> None:
        """Manually override a candidate's status (HR decision).

        Unlike ``set_match_result`` this touches only the status column, so a
        manual shortlist/reject does not disturb the stored match score or the
        AI breakdown — HR is overriding the automated decision, not re-running
        it.
        """
        await self._conn.execute(
            "UPDATE candidates SET status=$1 WHERE id=$2",
            status,
            uuid.UUID(candidate_id),
        )

    async def delete(self, candidate_id: str) -> None:
        cid = uuid.UUID(candidate_id)
        # match_results / interviews / email_logs cascade or null via FK, but we
        # clear them explicitly to keep behaviour identical to the original.
        await self._conn.execute("DELETE FROM email_logs WHERE candidate_id=$1", cid)
        await self._conn.execute("DELETE FROM interviews WHERE candidate_id=$1", cid)
        await self._conn.execute("DELETE FROM match_results WHERE candidate_id=$1", cid)
        await self._conn.execute("DELETE FROM cv_files WHERE candidate_id=$1", cid)
        await self._conn.execute("DELETE FROM candidates WHERE id=$1", cid)

    async def clear_match_data(self, candidate_id: str) -> None:
        cid = uuid.UUID(candidate_id)
        await self._conn.execute("DELETE FROM match_results WHERE candidate_id=$1", cid)
        await self._conn.execute("DELETE FROM interviews WHERE candidate_id=$1", cid)

    async def fetch_for_bulk(self, ids: list[uuid.UUID]) -> list[asyncpg.Record]:
        rows = await self._conn.fetch(
            "SELECT id, name, email, matched_job_id, status FROM candidates "
            "WHERE id = ANY($1::uuid[])",
            ids,
        )
        return list(rows)

    async def bulk_set_rejected(self, ids: list[Any]) -> None:
        await self._conn.execute(
            "UPDATE candidates SET status='rejected' WHERE id = ANY($1::uuid[])", ids
        )


class CVFileRepository:
    """Original uploaded CV documents (one per candidate, replaced on re-upload)."""

    def __init__(self, conn: asyncpg.Connection) -> None:
        self._conn = conn

    async def store(
        self, candidate_id: str, filename: str, content: bytes, content_type: str
    ) -> None:
        await self._conn.execute(
            "INSERT INTO cv_files (candidate_id, filename, content, content_type) "
            "VALUES ($1,$2,$3,$4) "
            "ON CONFLICT (candidate_id) DO UPDATE SET "
            "filename=EXCLUDED.filename, content=EXCLUDED.content, "
            "content_type=EXCLUDED.content_type, uploaded_at=NOW()",
            uuid.UUID(candidate_id),
            filename,
            content,
            content_type,
        )

    async def fetch(self, candidate_id: str) -> asyncpg.Record | None:
        return await self._conn.fetchrow(
            "SELECT filename, content, content_type FROM cv_files WHERE candidate_id=$1",
            uuid.UUID(candidate_id),
        )
