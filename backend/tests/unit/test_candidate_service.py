"""Service-layer tests for CandidateService using a fake DB connection."""

from __future__ import annotations

import uuid

import pytest
from app.core.exceptions import NotFoundError
from app.schemas.candidate import BulkRejectRequest
from app.services.candidates import CandidateService

from tests.fakes import FakeConnection


async def test_delete_missing_candidate_raises_not_found():
    conn = FakeConnection(fetchval=[None])  # exists() -> None
    with pytest.raises(NotFoundError):
        await CandidateService(conn).delete(str(uuid.uuid4()))


async def test_delete_existing_candidate_runs_cascade():
    conn = FakeConnection(fetchval=[1])  # exists() -> truthy
    result = await CandidateService(conn).delete(str(uuid.uuid4()))
    assert result["success"] is True
    # 5 deletes: email_logs, interviews, match_results, cv_files, candidates
    deletes = [q for q, _ in conn.executed if q.strip().upper().startswith("DELETE")]
    assert len(deletes) == 5


async def test_bulk_reject_without_emails():
    cid = uuid.uuid4()
    rows = [
        {"id": cid, "name": "A", "email": "a@x.com", "matched_job_id": None, "status": "pending"}
    ]
    conn = FakeConnection(fetch=[rows])
    payload = BulkRejectRequest(candidate_ids=[str(cid)], send_emails=False)
    result = await CandidateService(conn).bulk_reject(payload)
    assert result.updated == 1
    assert result.not_found == []
    assert result.email_results == []
