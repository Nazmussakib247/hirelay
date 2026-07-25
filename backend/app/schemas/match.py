"""Matching schemas.

These models were previously defined but never wired into the routers, so the
matching endpoints — the system's flagship feature — were annotated ``-> dict``
and published an empty response body in the OpenAPI schema at ``/docs``. The
``MatchAllResponse`` model was also stale: it still described the synchronous
match-all that was replaced by the 202-plus-polling design.

They are now accurate and attached via ``response_model=``.
"""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class MatchResponse(BaseModel):
    """Result of matching one candidate against one job."""

    candidate_id: str
    job_id: str
    candidate_name: str | None = None
    job_title: str
    final_score: float = Field(..., ge=0, le=100)
    status: str = Field(..., description="'shortlisted' or 'rejected'")
    breakdown: dict = Field(..., description="Per-component scores and AI commentary")
    email_result: dict = Field(..., description="Outcome of the automated email, if any")


class MatchRunStarted(BaseModel):
    """202 payload from ``POST /match-all/{job_id}``.

    The run executes in the background; poll ``GET /match-runs/{run_id}``.
    """

    run_id: str
    status: str = "running"
    total: int = Field(..., ge=0, description="Candidates queued for this run")
    job_title: str


class MatchRunStatus(BaseModel):
    """Poller payload from ``GET /match-runs/{run_id}``."""

    id: str
    job_id: str | None = None
    status: str = Field(..., description="running | completed | failed")
    total: int = 0
    processed: int = 0
    shortlisted: int = 0
    rejected: int = 0
    emails_sent: int = 0
    error: str | None = None
    result: dict | None = None
    created_at: datetime | None = None
    finished_at: datetime | None = None
