"""Candidate routes: upload, list, detail, delete, re-upload, bulk-reject."""

from __future__ import annotations

from typing import Annotated

import asyncpg
from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    File,
    Query,
    Request,
    Response,
    UploadFile,
)

from app.core.dependencies import AdminUserDep, CurrentUserDep
from app.core.exceptions import ValidationError
from app.core.uploads import read_capped_upload
from app.db.pool import get_connection
from app.integrations.n8n import trigger_cv_uploaded
from app.schemas.candidate import (
    BulkRejectRequest,
    BulkRejectResponse,
    BulkStatusRequest,
    BulkStatusResponse,
    CandidateNotesUpdate,
    CandidateStatusUpdate,
    UploadResponse,
)
from app.schemas.common import Page
from app.services.candidates import CandidateService

router = APIRouter(tags=["candidates"])
ConnDep = Annotated[asyncpg.Connection, Depends(get_connection)]


def _require_filename(file: UploadFile) -> str:
    """Return the upload's filename, rejecting parts that carry none.

    ``UploadFile.filename`` is ``str | None``: a multipart part sent without a
    ``filename`` parameter yields ``None``, which used to reach
    ``verify_magic_bytes`` and raise ``AttributeError`` -> HTTP 500. The
    extension drives both magic-byte verification and content-type selection,
    so a nameless upload is genuinely unprocessable, not a server fault.
    """
    if not file.filename or not file.filename.strip():
        raise ValidationError("A filename is required (expected .pdf, .docx, or .doc)")
    return file.filename


@router.post("/upload-cv", response_model=UploadResponse)
async def upload_cv(
    request: Request,
    background_tasks: BackgroundTasks,
    conn: ConnDep,
    user: CurrentUserDep,
    file: UploadFile = File(...),
) -> UploadResponse:
    filename = _require_filename(file)
    data = await read_capped_upload(file, request)
    result = await CandidateService(conn).upload(filename, data, user.id)
    # Fire-and-forget: n8n workflow 01 picks this up and auto-runs the match.
    background_tasks.add_task(
        trigger_cv_uploaded,
        {
            "event": "cv_uploaded",
            "candidate_id": result.candidate_id,
            "candidate_name": result.extracted.name,
            "candidate_email": result.extracted.email,
            "skills": result.extracted.skills,
            "uploaded_by": user.id,
        },
    )
    return result


@router.get("/candidates", response_model=Page[dict])
async def list_candidates(
    conn: ConnDep,
    _: CurrentUserDep,
    status: str | None = None,
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    job: str | None = Query(
        None, description="Filter by matched job id, or 'unmatched' for not-yet-matched"
    ),
    q: str | None = Query(None, description="Search name, email, or skills"),
) -> dict:
    return await CandidateService(conn).list(status, offset, limit, job, q)


@router.get("/candidates/{candidate_id}")
async def get_candidate(candidate_id: str, conn: ConnDep, _: CurrentUserDep) -> dict:
    return await CandidateService(conn).get(candidate_id)


@router.get("/candidates/{candidate_id}/cv")
async def download_cv(candidate_id: str, conn: ConnDep, _: CurrentUserDep) -> Response:
    """Download the original CV document the candidate submitted."""
    cv = await CandidateService(conn).get_cv_file(candidate_id)
    safe_name = cv["filename"].replace('"', "")
    return Response(
        content=cv["content"],
        media_type=cv["content_type"],
        headers={"Content-Disposition": f'attachment; filename="{safe_name}"'},
    )


@router.patch("/candidates/{candidate_id}/status")
async def update_candidate_status(
    candidate_id: str, payload: CandidateStatusUpdate, conn: ConnDep, _: CurrentUserDep
) -> dict:
    """Manually override the automated shortlist/reject decision (HR action)."""
    return await CandidateService(conn).set_status(candidate_id, payload.status)


@router.patch("/candidates/{candidate_id}/notes")
async def update_candidate_notes(
    candidate_id: str, payload: CandidateNotesUpdate, conn: ConnDep, _: CurrentUserDep
) -> dict:
    """Save HR's private notes on a candidate."""
    return await CandidateService(conn).set_notes(candidate_id, payload.notes)


@router.post("/candidates/bulk-status", response_model=BulkStatusResponse)
async def bulk_set_status(
    payload: BulkStatusRequest, conn: ConnDep, _: AdminUserDep
) -> BulkStatusResponse:
    """Set the same status on many candidates at once (admin only)."""
    result = await CandidateService(conn).bulk_set_status(payload.candidate_ids, payload.status)
    return BulkStatusResponse(**result)


@router.delete("/candidates/{candidate_id}")
async def delete_candidate(candidate_id: str, conn: ConnDep, _: AdminUserDep) -> dict:
    """Delete a candidate and all their data (admin only)."""
    return await CandidateService(conn).delete(candidate_id)


@router.post("/candidates/{candidate_id}/reupload", response_model=UploadResponse)
async def reupload_cv(
    request: Request,
    candidate_id: str,
    conn: ConnDep,
    _: CurrentUserDep,
    file: UploadFile = File(...),
) -> UploadResponse:
    filename = _require_filename(file)
    data = await read_capped_upload(file, request)
    return await CandidateService(conn).reupload(candidate_id, filename, data)


@router.post("/candidates/bulk-reject", response_model=BulkRejectResponse)
async def bulk_reject(
    payload: BulkRejectRequest, conn: ConnDep, _: AdminUserDep
) -> BulkRejectResponse:
    """Reject many candidates at once, optionally emailing them (admin only)."""
    return await CandidateService(conn).bulk_reject(payload)
