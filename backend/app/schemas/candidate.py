"""Candidate schemas."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class CandidateStatusUpdate(BaseModel):
    """Manual HR override of a candidate's shortlist/reject status."""

    status: Literal["pending", "shortlisted", "rejected"]


class CandidateNotesUpdate(BaseModel):
    """HR private notes on a candidate (blank clears them)."""

    notes: str | None = Field(default=None, max_length=5000)


class BulkStatusRequest(BaseModel):
    candidate_ids: list[str] = Field(..., min_length=1, max_length=500)
    status: Literal["pending", "shortlisted", "rejected"]


class BulkStatusResponse(BaseModel):
    success: bool = True
    requested: int
    updated: int
    status: str


class ExtractedFields(BaseModel):
    name: str | None = None
    email: str | None = None
    phone: str | None = None
    skills: list[str] = Field(default_factory=list)
    experience_years: int = 0
    education: str | None = None


class UploadResponse(BaseModel):
    success: bool = True
    candidate_id: str
    extracted: ExtractedFields
    # 0-100 parser confidence; low values warrant an HR double-check.
    parse_confidence: int | None = None
    # Set when the uploaded CV matched an existing candidate by email: the
    # existing record was refreshed instead of creating a duplicate.
    duplicate_of: str | None = None


class BulkRejectRequest(BaseModel):
    candidate_ids: list[str] = Field(..., min_length=1, max_length=200)
    send_emails: bool = False


class BulkRejectResponse(BaseModel):
    success: bool = True
    requested: int
    updated: int
    not_found: list[str]
    emails_attempted: int
    email_results: list[dict]
