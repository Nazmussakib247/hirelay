"""Matching orchestration: score, persist, schedule interviews, send emails.

Preserves the exact side-effect sequence of the original ``/match`` flow:
score -> record match_result -> update candidate -> (if shortlisted) create
interview + interview email, (if rejected) rejection email -> log email ->
fire n8n webhook.
"""

from __future__ import annotations

import asyncio
import json
from collections.abc import Callable
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import asyncpg
from fastapi import BackgroundTasks

from app.config import get_settings
from app.core.exceptions import AppError, NotFoundError, ValidationError
from app.repositories.notifications import notify
from app.core.logging import get_logger
from app.db import pool as db_pool
from app.integrations.n8n import trigger_n8n
from app.repositories.candidates import CandidateRepository
from app.repositories.jobs import JobRepository
from app.repositories.recruitment import (
    EmailLogRepository,
    InterviewRepository,
    MatchResultRepository,
    MatchRunRepository,
)
from app.services import matching
from app.services.email import (
    build_interview_email,
    build_rejection_email,
    generate_meet_link,
    send_email,
)
from app.services.jobs import parse_skill_weights

logger = get_logger(__name__)

# Bangladesh weekend: Friday (4) and Saturday (5).
_WEEKEND_DAYS = {4, 5}

# Strong references to in-flight match-all tasks so they are not GC'd
# mid-run (asyncio only keeps weak references to tasks).
_ACTIVE_MATCH_RUNS: set[asyncio.Task] = set()


def _next_interview_slot() -> datetime:
    """Compute the next interview slot: ``INTERVIEW_LEAD_DAYS`` from now at
    ``INTERVIEW_HOUR`` local time (``TIMEZONE``), skipping weekend days.

    Returns a timezone-aware datetime so the emailed time is unambiguous.
    """
    settings = get_settings()
    tz = ZoneInfo(settings.timezone)
    slot = datetime.now(tz) + timedelta(days=settings.interview_lead_days)
    while slot.weekday() in _WEEKEND_DAYS:
        slot += timedelta(days=1)
    return slot.replace(hour=settings.interview_hour, minute=0, second=0, microsecond=0)


def _format_interview_time(dt: datetime) -> str:
    """Human-readable interview time, e.g. 'Monday, July 20, 2026 at 10:00 AM (Asia/Dhaka)'."""
    tz_label = get_settings().timezone
    if dt.tzinfo is not None:
        dt = dt.astimezone(ZoneInfo(tz_label))
    return dt.strftime("%A, %B %d, %Y at %I:%M %p") + f" ({tz_label})"


class MatchingService:
    def __init__(self, conn: asyncpg.Connection) -> None:
        self._conn = conn
        self._candidates = CandidateRepository(conn)
        self._jobs = JobRepository(conn)
        self._matches = MatchResultRepository(conn)
        self._interviews = InterviewRepository(conn)
        self._email_logs = EmailLogRepository(conn)

    async def match(
        self,
        candidate_id: str,
        job_id: str,
        background_tasks: BackgroundTasks | None,
        auto_email: bool = True,
    ) -> dict:
        cand = await self._candidates.get(candidate_id)
        if cand is None:
            raise NotFoundError("Candidate not found")
        job = await self._jobs.get(job_id)
        if job is None:
            raise NotFoundError("Job not found")

        job_dict = dict(job)
        result = await matching.score_candidate(
            candidate_skills=cand["skills"] or [],
            candidate_experience=cand["experience_years"] or 0,
            candidate_text=cand["raw_text"] or "",
            required_skills=job["required_skills"] or [],
            min_experience=job["min_experience"] or 0,
            job_title=job["title"],
            job_description=job["description"] or "",
            skill_weights=parse_skill_weights(job_dict.get("skill_weights")),
        )

        await self._matches.create(
            candidate_id,
            job_id,
            result.final_score,
            result.skill_match,
            result.experience_match,
            result.text_similarity,
            result.ai_score,
            result.to_dict(),
        )
        await self._candidates.set_match_result(
            candidate_id, result.status, result.final_score, job_id, result.ai_summary
        )

        email_result = await self._handle_email(cand, job, result, auto_email)

        n8n_payload = {
            "candidate_id": candidate_id,
            "candidate_name": cand["name"],
            "candidate_email": cand["email"],
            "job_title": job["title"],
            "final_score": result.final_score,
            "status": result.status,
            "breakdown": result.to_dict(),
            "email_sent": email_result.get("sent", False),
        }
        if background_tasks is not None:
            background_tasks.add_task(trigger_n8n, n8n_payload)
        else:
            # Background match-run context: no request lifecycle to defer to.
            await trigger_n8n(n8n_payload)

        return {
            "candidate_id": candidate_id,
            "job_id": job_id,
            "candidate_name": cand["name"],
            "job_title": job["title"],
            "final_score": result.final_score,
            "status": result.status,
            "breakdown": result.to_dict(),
            "email_result": email_result,
        }

    async def _handle_email(
        self, cand, job, result: matching.MatchBreakdown, auto_email: bool
    ) -> dict:
        if not auto_email or not cand["email"]:
            return {"sent": False, "reason": "auto_email disabled or no email"}

        if result.status == "shortlisted":
            meet_link = generate_meet_link()
            interview_dt = _next_interview_slot()
            interview_time_str = _format_interview_time(interview_dt)
            interview_id = await self._interviews.create(
                str(cand["id"]),
                str(job["id"]),
                cand["name"],
                cand["email"],
                job["title"],
                result.final_score,
                # Column is TIMESTAMPTZ since migration 0004 — store the
                # timezone-aware datetime directly, no ambiguity.
                interview_dt,
                meet_link,
            )
            await notify(
                self._conn,
                "interview_scheduled",
                f"{cand['name'] or 'A candidate'} shortlisted for {job['title']} "
                f"— interview {interview_time_str}",
            )
            content = build_interview_email(
                cand["name"] or "Candidate",
                job["title"],
                result.final_score,
                meet_link,
                interview_time_str,
                result.strengths,
                custom_message=job.get("interview_message"),
            )
            send_result = await send_email(cand["email"], content)
            if send_result.success:
                await self._interviews.mark_email_sent(interview_id)
                await self._email_logs.log(
                    str(cand["id"]), "interview", cand["email"], content.subject, "sent"
                )
                return {"sent": True, "type": "interview", "meet_link": meet_link}
            await self._email_logs.log(
                str(cand["id"]),
                "interview",
                cand["email"],
                content.subject,
                "failed",
                send_result.error,
            )
            return {"sent": False, "error": send_result.error}

        content = build_rejection_email(
            cand["name"] or "Candidate", job["title"], custom_message=job.get("rejection_message")
        )
        send_result = await send_email(cand["email"], content)
        await self._email_logs.log(
            str(cand["id"]),
            "rejection",
            cand["email"],
            content.subject,
            "sent" if send_result.success else "failed",
            send_result.error,
        )
        return {"sent": send_result.success, "type": "rejection"}

    async def start_match_all(self, job_id: str, auto_email: bool = True) -> dict:
        """Kick off a background match-all run and return immediately (202).

        The previous implementation matched every pending candidate inside the
        HTTP request — with Groq retries plus SMTP sends, 20+ CVs exceeded any
        proxy/browser timeout while work half-completed. Progress is now
        persisted to ``match_runs`` and polled via ``GET /match-runs/{id}``.
        """
        job = await self._jobs.get(job_id)
        if job is None:
            raise NotFoundError("Job not found")
        pending_ids = [str(cid) for cid in await self._candidates.list_pending_ids()]
        run_id = await MatchRunRepository(self._conn).create(job_id, len(pending_ids))

        task = asyncio.create_task(
            execute_match_run(run_id, job_id, job["title"], pending_ids, auto_email)
        )
        _ACTIVE_MATCH_RUNS.add(task)
        task.add_done_callback(_ACTIVE_MATCH_RUNS.discard)

        return {
            "run_id": run_id,
            "status": "running",
            "total": len(pending_ids),
            "job_title": job["title"],
        }

    async def schedule_info(self) -> dict:
        """Proposed interview slot + upcoming busy slots, for the HR schedule dialog.

        Lets the frontend show the default time and flag clashes before HR
        commits, without exposing the (timezone/weekend-aware) slot logic to
        the client.
        """
        tz = ZoneInfo(get_settings().timezone)
        now = datetime.now(tz)
        busy = []
        for r in await self._interviews.list_all():
            t = r["interview_time"]
            if r["status"] != "cancelled" and t and t >= now:
                busy.append(
                    {
                        "time": t.isoformat(),
                        "candidate_name": r["candidate_name"],
                        "job_title": r["job_title"],
                    }
                )
        return {
            "proposed_time": _next_interview_slot().isoformat(),
            "timezone": str(tz),
            "busy": busy,
        }

    async def schedule_interview(
        self, candidate_id: str, interview_time: datetime | None = None
    ) -> dict:
        """Create an interview + send the invite for a (manually) shortlisted candidate.

        This is the HR-triggered counterpart to the automatic scheduling that
        happens during matching. It is deliberately explicit — manual shortlist
        never sends anything on its own — so HR stays in control of who gets
        invited. ``interview_time`` lets HR pick the slot (after checking
        availability in the UI); when omitted, the next auto slot is used.
        Reuses an existing interview rather than creating a duplicate.
        """
        cand = await self._candidates.get_with_job_title(candidate_id)
        if cand is None:
            raise NotFoundError("Candidate not found")
        if cand["status"] != "shortlisted":
            raise ValidationError("Only shortlisted candidates can be scheduled for an interview.")
        if not cand["email"]:
            raise ValidationError("Candidate has no email on record.")
        if not cand["matched_job_id"]:
            raise ValidationError(
                "Candidate is not linked to a job yet. Run a match against a job first, "
                "then schedule the interview."
            )

        # Resolve the interview time: HR's choice (normalised to the app tz and
        # validated as future) or the next auto slot.
        tz = ZoneInfo(get_settings().timezone)
        if interview_time is not None:
            if interview_time.tzinfo is None:
                interview_time = interview_time.replace(tzinfo=tz)
            if interview_time < datetime.now(tz):
                raise ValidationError("Interview time must be in the future.")
            interview_dt = interview_time
        else:
            interview_dt = _next_interview_slot()

        existing = await self._interviews.latest_for_candidate(candidate_id)
        if existing and existing["status"] != "cancelled":
            meet_link = existing["meet_link"] or generate_meet_link()
            interview_id = str(existing["id"])
            # Honour a newly chosen time on an existing interview.
            if interview_time is not None:
                await self._interviews.update_time(interview_id, interview_dt)
            elif existing["interview_time"]:
                interview_dt = existing["interview_time"]
            reused = True
        else:
            meet_link = generate_meet_link()
            interview_id = await self._interviews.create(
                candidate_id,
                str(cand["matched_job_id"]),
                cand["name"],
                cand["email"],
                cand["job_title"] or "Position",
                cand["match_score"] or 0,
                interview_dt,
                meet_link,
            )
            reused = False

        breakdown = await self._matches.latest_breakdown_for_candidate(candidate_id)
        strengths = list(breakdown.get("strengths", [])) if breakdown else []
        job = await self._jobs.get(str(cand["matched_job_id"]))
        content = build_interview_email(
            cand["name"] or "Candidate",
            cand["job_title"] or "Position",
            cand["match_score"] or 0,
            meet_link,
            _format_interview_time(interview_dt),
            strengths,
            custom_message=job.get("interview_message") if job else None,
        )
        result = await send_email(cand["email"], content)
        if result.success:
            await self._interviews.mark_email_sent(interview_id)
        await self._email_logs.log(
            candidate_id,
            "interview",
            cand["email"],
            content.subject,
            "sent" if result.success else "failed",
            result.error,
        )
        await notify(
            self._conn,
            "interview_scheduled",
            f"Interview scheduled for {cand['name'] or 'a candidate'} "
            f"({_format_interview_time(interview_dt)})",
        )
        return {
            "success": result.success,
            "interview_id": interview_id,
            "reused_existing": reused,
            "meet_link": meet_link,
            "email_sent": result.success,
            "error": result.error,
        }

    async def bulk_email(self, candidate_ids: list[str]) -> dict:
        """Send the appropriate email to each selected candidate, tolerantly.

        Reuses the single-candidate resend logic per id but never aborts the
        whole batch on one bad candidate — pending/uninvited/no-email cases are
        reported as ``skipped`` with a reason instead of raising.
        """
        results: list[dict] = []
        sent = 0
        for cid in candidate_ids:
            try:
                r = await self.resend_email(cid)
                ok = bool(r.get("success"))
                sent += 1 if ok else 0
                results.append({"candidate_id": cid, "sent": ok, "error": r.get("error")})
            except AppError as exc:
                results.append({"candidate_id": cid, "sent": False, "skipped": exc.message})
        return {
            "success": True,
            "requested": len(candidate_ids),
            "sent": sent,
            "results": results,
        }

    async def resend_email(self, candidate_id: str) -> dict:
        cand = await self._candidates.get_with_job_title(candidate_id)
        if cand is None:
            raise NotFoundError("Candidate not found")
        if not cand["email"]:
            raise ValidationError("Candidate has no email on record")
        interview = await self._interviews.latest_for_candidate(candidate_id)
        status = cand["status"]
        job = (
            await self._jobs.get(str(cand["matched_job_id"]))
            if cand["matched_job_id"]
            else None
        )

        if status == "shortlisted":
            # A shortlisted candidate without an interview must NOT fall through
            # to a rejection email (the old bug: manual shortlist has no
            # interview record, so Resend mistakenly rejected them). Require an
            # interview first — HR schedules one via POST /schedule-interview.
            if not interview:
                raise ValidationError(
                    "This candidate is shortlisted but has no interview scheduled yet. "
                    "Use 'Schedule Interview & Invite' first, then resend."
                )
            when = (
                _format_interview_time(interview["interview_time"])
                if interview["interview_time"]
                else "To be announced"
            )
            # Reload the personalised strengths from the stored match
            # breakdown so a resent email matches the original.
            breakdown = await self._matches.latest_breakdown_for_candidate(candidate_id)
            strengths = list(breakdown.get("strengths", [])) if breakdown else []
            content = build_interview_email(
                cand["name"] or "Candidate",
                cand["job_title"] or "Position",
                cand["match_score"] or 0,
                interview["meet_link"],
                when,
                strengths,
                custom_message=job.get("interview_message") if job else None,
            )
        elif status == "rejected":
            content = build_rejection_email(
                cand["name"] or "Candidate",
                cand["job_title"] or "Position",
                custom_message=job.get("rejection_message") if job else None,
            )
        else:  # pending — no decision made yet, so there is nothing to resend
            raise ValidationError(
                "Candidate is still pending — shortlist or reject them before sending an email."
            )
        result = await send_email(cand["email"], content)
        await self._email_logs.log(
            candidate_id,
            "resend",
            cand["email"],
            content.subject,
            "sent" if result.success else "failed",
            result.error,
        )
        return {"success": result.success, "error": result.error}


async def execute_match_run(
    run_id: str,
    job_id: str,
    job_title: str,
    candidate_ids: list[str],
    auto_email: bool,
    conn_factory: Callable | None = None,
) -> None:
    """Process a match-all run outside any HTTP request.

    Each candidate gets its own pooled connection so a long run never pins a
    connection, and progress is committed after every candidate so the poller
    always sees live numbers. A failure on one candidate is recorded and the
    run continues; only an infrastructural failure aborts the run.
    """
    factory = conn_factory or db_pool.acquire
    results: list[dict] = []
    failed = 0
    try:
        for cid in candidate_ids:
            try:
                async with factory() as conn:
                    results.append(await MatchingService(conn).match(cid, job_id, None, auto_email))
            except Exception as exc:  # noqa: BLE001 - one bad CV must not kill the run
                failed += 1
                logger.warning(
                    "match-run candidate failed",
                    extra={"run_id": run_id, "candidate_id": cid, "error": str(exc)},
                )
            shortlisted = [r for r in results if r["status"] == "shortlisted"]
            emails_sent = sum(1 for r in results if r.get("email_result", {}).get("sent"))
            async with factory() as conn:
                await MatchRunRepository(conn).update_progress(
                    run_id,
                    len(results) + failed,
                    len(shortlisted),
                    len(results) - len(shortlisted),
                    emails_sent,
                )

        shortlisted = [r for r in results if r["status"] == "shortlisted"]
        emails_sent = sum(1 for r in results if r.get("email_result", {}).get("sent"))
        summary = {
            "job_title": job_title,
            "total_processed": len(results),
            "failed": failed,
            "shortlisted_count": len(shortlisted),
            "rejected_count": len(results) - len(shortlisted),
            "emails_sent": emails_sent,
            "shortlisted": shortlisted,
            "threshold_used": get_settings().match_threshold,
        }
        async with factory() as conn:
            await MatchRunRepository(conn).complete(run_id, summary)
    except Exception as exc:  # noqa: BLE001 - persist the failure for the poller
        logger.error("match-run aborted", extra={"run_id": run_id, "error": str(exc)})
        try:
            async with factory() as conn:
                await MatchRunRepository(conn).fail(run_id, str(exc))
        except Exception:  # noqa: BLE001 - nothing left to report to
            logger.error("match-run failure could not be persisted", extra={"run_id": run_id})


async def get_match_run(conn: asyncpg.Connection, run_id: str) -> dict:
    """Poller payload: progress counters plus the final summary when done."""
    row = await MatchRunRepository(conn).get(run_id)
    if row is None:
        raise NotFoundError("Match run not found")
    data = dict(row)
    data["id"] = str(data["id"])
    data["job_id"] = str(data["job_id"]) if data.get("job_id") else None
    raw_result = data.get("result")
    if isinstance(raw_result, str):
        try:
            data["result"] = json.loads(raw_result)
        except ValueError:
            data["result"] = None
    return data


class InterviewService:
    """HR-facing interview management: reschedule, cancel, complete."""

    def __init__(self, conn: asyncpg.Connection) -> None:
        self._conn = conn
        self._interviews = InterviewRepository(conn)
        self._matches = MatchResultRepository(conn)
        self._email_logs = EmailLogRepository(conn)

    async def list(self, status: str | None, offset: int, limit: int) -> dict:
        total, rows = await self._interviews.list_paginated(status, offset, limit)
        return {
            "total": total,
            "offset": offset,
            "limit": limit,
            "items": [dict(r) for r in rows],
        }

    async def _get_or_404(self, interview_id: str) -> asyncpg.Record:
        row = await self._interviews.get(interview_id)
        if row is None:
            raise NotFoundError("Interview not found")
        return row

    async def set_feedback(
        self, interview_id: str, rating: int | None, feedback: str | None
    ) -> dict:
        """Record HR's post-interview rating (1-5) and notes."""
        await self._get_or_404(interview_id)
        if rating is not None and not (1 <= rating <= 5):
            raise ValidationError("rating must be between 1 and 5")
        await self._interviews.set_feedback(
            interview_id, rating, (feedback or "").strip() or None
        )
        return {"success": True, "interview_id": interview_id, "rating": rating}

    async def reschedule(self, interview_id: str, new_time: datetime) -> dict:
        """Move an interview and re-send the invitation with the new time."""
        interview = await self._get_or_404(interview_id)
        if interview["status"] == "cancelled":
            raise ValidationError("Cannot reschedule a cancelled interview")
        tz = ZoneInfo(get_settings().timezone)
        if new_time.tzinfo is None:
            new_time = new_time.replace(tzinfo=tz)
        if new_time < datetime.now(tz):
            raise ValidationError("Interview time must be in the future")

        await self._interviews.update_time(interview_id, new_time)

        email_result: dict = {"sent": False, "reason": "no email on record"}
        if interview["candidate_email"]:
            breakdown = None
            if interview["candidate_id"]:
                breakdown = await self._matches.latest_breakdown_for_candidate(
                    str(interview["candidate_id"])
                )
            strengths = list(breakdown.get("strengths", [])) if breakdown else []
            content = build_interview_email(
                interview["candidate_name"] or "Candidate",
                interview["job_title"] or "Position",
                interview["match_score"] or 0,
                interview["meet_link"],
                _format_interview_time(new_time),
                strengths,
            )
            send_result = await send_email(interview["candidate_email"], content)
            await self._email_logs.log(
                str(interview["candidate_id"]) if interview["candidate_id"] else None,
                "reschedule",
                interview["candidate_email"],
                content.subject,
                "sent" if send_result.success else "failed",
                send_result.error,
            )
            email_result = {"sent": send_result.success, "error": send_result.error}

        return {
            "id": interview_id,
            "status": "scheduled",
            "interview_time": new_time.isoformat(),
            "email_result": email_result,
        }

    async def cancel(self, interview_id: str) -> dict:
        interview = await self._get_or_404(interview_id)
        if interview["status"] == "completed":
            raise ValidationError("Cannot cancel a completed interview")
        await self._interviews.set_status(interview_id, "cancelled")
        return {"id": interview_id, "status": "cancelled"}

    async def complete(self, interview_id: str) -> dict:
        interview = await self._get_or_404(interview_id)
        if interview["status"] == "cancelled":
            raise ValidationError("Cannot complete a cancelled interview")
        await self._interviews.set_status(interview_id, "completed")
        return {"id": interview_id, "status": "completed"}
