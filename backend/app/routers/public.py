"""Public (unauthenticated) routes: open-job listing + candidate self-apply.

These are the only endpoints reachable without a token. They power the public
apply page (``frontend/public/apply.html``) that job announcements link to.
The apply endpoint is rate-limited and reuses the same upload size/type guards
as the authenticated upload path.

NOTE: this module deliberately does NOT use ``from __future__ import
annotations``. The ``@limiter.limit`` decorator wraps ``public_apply``; with
stringised annotations FastAPI resolves the parameter hints against slowapi's
module globals (where the local ``ConnDep`` alias does not exist), raising
``PydanticUndefinedAnnotation: name 'ConnDep' is not defined`` at startup.
Keeping annotations as real objects here avoids that string-resolution step.
"""

from typing import Annotated

import asyncpg
from fastapi import APIRouter, Depends, File, Form, Request, UploadFile

from app.core.exceptions import ValidationError
from app.core.rate_limit import limiter
from app.core.uploads import read_capped_upload
from app.db.pool import get_connection
from app.services.candidates import CandidateService
from app.services.jobs import JobService

router = APIRouter(prefix="/public", tags=["public"])
ConnDep = Annotated[asyncpg.Connection, Depends(get_connection)]


@router.get("/jobs")
async def public_jobs(conn: ConnDep) -> list[dict]:
    """Active jobs a candidate can apply to (public — no auth).

    Only the fields needed to render the apply form are exposed; internal
    columns (weights, custom templates, created_by, …) are deliberately omitted.
    A job that HR pauses (status != 'active') or deletes disappears from here.
    """
    jobs = await JobService(conn).list_all()
    return [
        {
            "id": str(j["id"]),
            "title": j["title"],
            "location": j.get("location"),
            "description": j.get("description"),
            "required_skills": j.get("required_skills") or [],
            "min_experience": j.get("min_experience") or 0,
        }
        for j in jobs
        if j.get("status") == "active"
    ]


@router.post("/apply")
@limiter.limit("10/minute")
async def public_apply(
    request: Request,
    conn: ConnDep,
    job_id: str = Form(...),
    file: UploadFile = File(...),
    name: str | None = Form(None),
    email: str | None = Form(None),
    phone: str | None = Form(None),
) -> dict:
    """Submit a CV for an open job (public, rate-limited).

    Creates a *pending* applicant scored against the chosen job; HR reviews and
    confirms shortlist/reject in the Candidates tab. No email is sent from here.
    """
    if not file.filename or not file.filename.strip():
        raise ValidationError("A CV file is required (.pdf, .docx, or .doc)")
    data = await read_capped_upload(file, request)
    return await CandidateService(conn).apply_public(
        job_id, file.filename, data, name, email, phone
    )
