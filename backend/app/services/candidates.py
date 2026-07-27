"""Candidate management business logic."""

from __future__ import annotations

import json
import uuid

import asyncpg

from app.config import get_settings
from app.core.exceptions import NotFoundError, ValidationError
from app.repositories.candidates import CandidateRepository, CVFileRepository
from app.repositories.jobs import JobRepository
from app.repositories.recruitment import EmailLogRepository
from app.schemas.candidate import (
    BulkRejectRequest,
    BulkRejectResponse,
    ExtractedFields,
    UploadResponse,
)
from app.repositories.notifications import notify
from app.services import cv_parser
from app.services.cv_parser_ai import parse_cv_hybrid
from app.services.email import build_rejection_email, send_email
from app.services.matching import score_candidate

_CONTENT_TYPES = {
    ".pdf": "application/pdf",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".doc": "application/msword",
}


def _content_type_for(filename: str) -> str:
    for ext, ctype in _CONTENT_TYPES.items():
        if filename.lower().endswith(ext):
            return ctype
    return "application/octet-stream"


class CandidateService:
    def __init__(self, conn: asyncpg.Connection) -> None:
        self._conn = conn
        self._candidates = CandidateRepository(conn)
        self._cv_files = CVFileRepository(conn)
        self._jobs = JobRepository(conn)
        self._email_logs = EmailLogRepository(conn)

    async def _job_keywords(self) -> list[str]:
        """Custom per-job skill keywords used as extra parser vocabulary."""
        try:
            return await self._jobs.all_skill_keywords()
        except Exception:  # noqa: BLE001 - vocabulary is an enhancement, not a dependency
            return []

    @staticmethod
    def _validate_upload(filename: str, data: bytes) -> None:
        """Reject oversized or mislabelled files before any parsing happens."""
        max_bytes = get_settings().max_upload_mb * 1024 * 1024
        if len(data) > max_bytes:
            raise ValidationError(
                f"File too large ({len(data) // (1024 * 1024)} MB). "
                f"Maximum allowed is {get_settings().max_upload_mb} MB."
            )
        if not data:
            raise ValidationError("Uploaded file is empty")
        cv_parser.verify_magic_bytes(filename, data)

    async def upload(self, filename: str, data: bytes, uploaded_by: str) -> UploadResponse:
        self._validate_upload(filename, data)
        text = cv_parser.extract_text(filename, data)
        parsed = await parse_cv_hybrid(text, extra_keywords=await self._job_keywords())
        parsed["cv_filename"] = filename

        # Dedupe: the same person (matched by email) uploaded again refreshes
        # the existing record instead of creating a second candidate who
        # would receive duplicate emails.
        if parsed.get("email"):
            existing_id = await self._candidates.find_id_by_email(parsed["email"])
            if existing_id:
                await self._candidates.clear_match_data(existing_id)
                await self._candidates.update_from_cv(existing_id, parsed)
                await self._cv_files.store(existing_id, filename, data, _content_type_for(filename))
                return UploadResponse(
                    candidate_id=existing_id,
                    duplicate_of=existing_id,
                    parse_confidence=parsed.get("parse_confidence"),
                    extracted=ExtractedFields(
                        **{k: parsed[k] for k in ExtractedFields.model_fields}
                    ),
                )

        candidate_id = await self._candidates.create(parsed, uploaded_by)
        await self._cv_files.store(candidate_id, filename, data, _content_type_for(filename))
        await notify(
            self._conn, "cv_uploaded", f"New CV uploaded: {parsed.get('name') or 'Unknown candidate'}"
        )
        return UploadResponse(
            candidate_id=candidate_id,
            parse_confidence=parsed.get("parse_confidence"),
            extracted=ExtractedFields(**{k: parsed[k] for k in ExtractedFields.model_fields}),
        )

    async def reupload(self, candidate_id: str, filename: str, data: bytes) -> UploadResponse:
        if not await self._candidates.exists(candidate_id):
            raise NotFoundError("Candidate not found")
        self._validate_upload(filename, data)
        text = cv_parser.extract_text(filename, data)
        parsed = await parse_cv_hybrid(text, extra_keywords=await self._job_keywords())
        parsed["cv_filename"] = filename
        await self._candidates.clear_match_data(candidate_id)
        await self._candidates.update_from_cv(candidate_id, parsed)
        await self._cv_files.store(candidate_id, filename, data, _content_type_for(filename))
        return UploadResponse(
            candidate_id=candidate_id,
            parse_confidence=parsed.get("parse_confidence"),
            extracted=ExtractedFields(**{k: parsed[k] for k in ExtractedFields.model_fields}),
        )

    async def apply_public(
        self,
        job_id: str,
        filename: str,
        data: bytes,
        name: str | None = None,
        email: str | None = None,
        phone: str | None = None,
    ) -> dict:
        """Handle a public self-application: a candidate picked an open job and
        submitted their CV through the public link.

        The CV is parsed and the candidate is created as ``pending`` (never
        auto-shortlisted or emailed). We score them against the chosen job
        immediately so HR sees a number, but the shortlist/reject decision and
        any interview email wait for HR's confirmation in the Candidates tab.
        Scoring is best-effort — if the AI/scoring step fails, the applicant is
        still recorded and HR can run the match later.
        """
        try:
            uuid.UUID(job_id)
        except ValueError as exc:
            raise ValidationError("Invalid job id") from exc

        job_row = await self._jobs.get(job_id)
        if job_row is None:
            raise NotFoundError("Job not found")
        if job_row["status"] != "active":
            raise ValidationError("This job is no longer accepting applications")

        self._validate_upload(filename, data)
        text = cv_parser.extract_text(filename, data)
        parsed = await parse_cv_hybrid(text, extra_keywords=await self._job_keywords())
        parsed["cv_filename"] = filename
        parsed.setdefault("raw_text", text)
        # Applicant-supplied contact details take precedence over parsed ones.
        if name and name.strip():
            parsed["name"] = name.strip()
        if email and email.strip():
            parsed["email"] = email.strip().lower()
        if phone and phone.strip():
            parsed["phone"] = phone.strip()

        # Dedupe by email: a repeat application refreshes the existing record
        # rather than creating a duplicate candidate.
        candidate_id: str
        existing_id = (
            await self._candidates.find_id_by_email(parsed["email"])
            if parsed.get("email")
            else None
        )
        if existing_id:
            await self._candidates.clear_match_data(existing_id)
            await self._candidates.update_from_cv(existing_id, parsed)
            await self._candidates.set_applied_job(existing_id, job_id)
            candidate_id = existing_id
        else:
            candidate_id = await self._candidates.create_public(parsed, job_id)
        await self._cv_files.store(candidate_id, filename, data, _content_type_for(filename))

        # Inline score against the applied job — best effort, status stays pending.
        await self._score_against_job(candidate_id, parsed, job_row, text)

        await notify(
            self._conn,
            "cv_uploaded",
            f"New application for {job_row['title']}: {parsed.get('name') or 'Unknown candidate'}",
        )
        return {
            "success": True,
            "message": "Application received — thank you! Our team will review your CV.",
            "candidate_id": candidate_id,
        }

    async def _score_against_job(
        self, candidate_id: str, parsed: dict, job_row: asyncpg.Record, text: str
    ) -> None:
        """Score a candidate against one job and store the result as pending.

        Wrapped so a scoring/network failure never blocks the application — the
        candidate remains a pending applicant HR can match manually later.
        """
        try:
            raw_weights = job_row["skill_weights"]
            if isinstance(raw_weights, str) and raw_weights:
                try:
                    raw_weights = json.loads(raw_weights)
                except json.JSONDecodeError:
                    raw_weights = {}
            weights = (
                {k: float(v) for k, v in raw_weights.items()}
                if isinstance(raw_weights, dict) and raw_weights
                else None
            )
            breakdown = await score_candidate(
                candidate_skills=parsed.get("skills") or [],
                candidate_experience=parsed.get("experience_years") or 0,
                candidate_text=parsed.get("raw_text") or text,
                required_skills=list(job_row["required_skills"] or []),
                min_experience=job_row["min_experience"] or 0,
                job_title=job_row["title"] or "",
                job_description=job_row["description"] or "",
                skill_weights=weights,
                threshold=job_row["match_threshold"],
            )
            # status stays 'pending' — HR confirms shortlist/reject afterwards.
            await self._candidates.set_match_result(
                candidate_id, "pending", breakdown.final_score, str(job_row["id"]), breakdown.ai_summary
            )
        except Exception:  # noqa: BLE001 - scoring is an enhancement, not a gate
            return

    async def get_cv_file(self, candidate_id: str) -> dict:
        """Return the original uploaded CV document for download."""
        if not await self._candidates.exists(candidate_id):
            raise NotFoundError("Candidate not found")
        row = await self._cv_files.fetch(candidate_id)
        if row is None:
            raise NotFoundError(
                "No stored CV file for this candidate (uploaded before file "
                "storage was added — re-upload the CV to attach it)"
            )
        return {
            "filename": row["filename"] or "cv",
            "content": bytes(row["content"]),
            "content_type": row["content_type"] or "application/octet-stream",
        }

    async def list(
        self,
        status: str | None,
        offset: int,
        limit: int,
        job: str | None = None,
        q: str | None = None,
    ) -> dict:
        # Validate the job filter here so a malformed value is a clean 422
        # rather than a UUID parse error surfacing as a 500.
        if job and job != "unmatched":
            try:
                uuid.UUID(job)
            except ValueError as exc:
                raise ValidationError("job must be a valid job id or 'unmatched'") from exc
        total, rows = await self._candidates.list_paginated(status, offset, limit, job, q)
        return {
            "total": total,
            "offset": offset,
            "limit": limit,
            "items": [dict(r) for r in rows],
        }

    async def get(self, candidate_id: str) -> dict:
        row = await self._candidates.get(candidate_id)
        if row is None:
            raise NotFoundError("Candidate not found")
        return dict(row)

    async def delete(self, candidate_id: str) -> dict:
        if not await self._candidates.exists(candidate_id):
            raise NotFoundError("Candidate not found")
        await self._candidates.delete(candidate_id)
        return {"success": True, "deleted_candidate_id": candidate_id}

    _VALID_STATUSES = ("pending", "shortlisted", "rejected")

    async def set_status(self, candidate_id: str, status: str) -> dict:
        """HR override of the automated shortlist/reject decision."""
        if status not in self._VALID_STATUSES:
            raise ValidationError(
                f"Invalid status '{status}'. Must be one of: {', '.join(self._VALID_STATUSES)}."
            )
        row = await self._candidates.get(candidate_id)
        if row is None:
            raise NotFoundError("Candidate not found")
        await self._candidates.set_status(candidate_id, status)
        if status == "shortlisted":
            await notify(
                self._conn, "shortlisted", f"{row['name'] or 'A candidate'} was shortlisted"
            )
        return {"success": True, "candidate_id": candidate_id, "status": status}

    async def set_notes(self, candidate_id: str, notes: str | None) -> dict:
        """Save (or clear) HR's private free-text notes on a candidate."""
        if not await self._candidates.exists(candidate_id):
            raise NotFoundError("Candidate not found")
        cleaned = (notes or "").strip() or None
        await self._candidates.set_notes(candidate_id, cleaned)
        return {"success": True, "candidate_id": candidate_id, "notes": cleaned}

    async def bulk_set_status(self, candidate_ids: list[str], status: str) -> dict:
        """Set the same status on many candidates at once."""
        if status not in self._VALID_STATUSES:
            raise ValidationError(
                f"Invalid status '{status}'. Must be one of: {', '.join(self._VALID_STATUSES)}."
            )
        try:
            cids = [uuid.UUID(str(i)) for i in candidate_ids]
        except ValueError as exc:
            raise ValidationError(f"Invalid UUID in candidate_ids: {exc}") from exc
        updated = await self._candidates.bulk_set_status(cids, status)
        return {"success": True, "requested": len(candidate_ids), "updated": updated, "status": status}

    async def bulk_reject(self, payload: BulkRejectRequest) -> BulkRejectResponse:
        try:
            cids = [uuid.UUID(str(i)) for i in payload.candidate_ids]
        except ValueError as exc:
            raise ValidationError(f"Invalid UUID in candidate_ids: {exc}") from exc

        rows = await self._candidates.fetch_for_bulk(cids)
        found_ids = {r["id"] for r in rows}
        not_found = [str(c) for c in cids if c not in found_ids]
        await self._candidates.bulk_set_rejected(list(found_ids))

        email_results: list[dict] = []
        if payload.send_emails:
            for r in rows:
                if r["status"] == "rejected":
                    email_results.append(
                        {"candidate_id": str(r["id"]), "email": "skipped_already_rejected"}
                    )
                    continue
                job_title = "the position"
                if r["matched_job_id"]:
                    job_row = await self._jobs.get(str(r["matched_job_id"]))
                    if job_row:
                        job_title = job_row["title"]
                if r["email"]:
                    content = build_rejection_email(r["name"] or "Candidate", job_title)
                    result = await send_email(r["email"], content)
                    await self._email_logs.log(
                        str(r["id"]),
                        "rejection",
                        r["email"],
                        content.subject,
                        "sent" if result.success else "failed",
                        result.error,
                    )
                    email_results.append(
                        {
                            "candidate_id": str(r["id"]),
                            "email_sent": result.success,
                            "error": result.error,
                        }
                    )
                else:
                    email_results.append(
                        {"candidate_id": str(r["id"]), "email": "no_email_on_record"}
                    )

        return BulkRejectResponse(
            requested=len(payload.candidate_ids),
            updated=len(found_ids),
            not_found=not_found,
            emails_attempted=len(email_results),
            email_results=email_results if payload.send_emails else [],
        )
