"""Tests for the async match-all run lifecycle and interview management."""

from __future__ import annotations

import json
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone

import pytest
from app.core.exceptions import NotFoundError, ValidationError
from app.services import recruitment
from app.services.recruitment import InterviewService, execute_match_run, get_match_run

from tests.fakes import FakeConnection


def _factory_for(conn: FakeConnection):
    @asynccontextmanager
    async def factory():
        yield conn

    return factory


# Repositories call uuid.UUID(run_id), so tests must use real UUID strings.
_RUN = "00000000-0000-0000-0000-00000000aaaa"
_JOB = "00000000-0000-0000-0000-00000000bbbb"


async def test_execute_match_run_completes_and_persists_summary(monkeypatch):
    conn = FakeConnection()

    async def fake_match(self, cid, job_id, background_tasks, auto_email):
        return {
            "candidate_id": cid,
            "status": "shortlisted" if cid == "c1" else "rejected",
            "email_result": {"sent": cid == "c1"},
        }

    monkeypatch.setattr(recruitment.MatchingService, "match", fake_match)

    await execute_match_run(_RUN, _JOB, "Dev", ["c1", "c2"], True, _factory_for(conn))

    updates = [q for q, _ in conn.executed if "UPDATE match_runs SET processed" in q]
    completes = [(q, a) for q, a in conn.executed if "status='completed'" in q]
    assert len(updates) == 2  # progress written after every candidate
    assert len(completes) == 1
    summary = json.loads(completes[0][1][0])
    assert summary["total_processed"] == 2
    assert summary["shortlisted_count"] == 1
    assert summary["rejected_count"] == 1
    assert summary["emails_sent"] == 1
    assert summary["failed"] == 0


async def test_execute_match_run_survives_one_bad_candidate(monkeypatch):
    conn = FakeConnection()

    async def fake_match(self, cid, job_id, background_tasks, auto_email):
        if cid == "bad":
            raise RuntimeError("boom")
        return {"candidate_id": cid, "status": "rejected", "email_result": {"sent": False}}

    monkeypatch.setattr(recruitment.MatchingService, "match", fake_match)

    await execute_match_run(_RUN, _JOB, "Dev", ["bad", "ok"], False, _factory_for(conn))

    completes = [(q, a) for q, a in conn.executed if "status='completed'" in q]
    assert len(completes) == 1  # one failure does NOT abort the run
    summary = json.loads(completes[0][1][0])
    assert summary["failed"] == 1
    assert summary["total_processed"] == 1


async def test_execute_match_run_marks_failed_on_infrastructure_error(monkeypatch):
    """If even progress persistence fails, the run is marked failed."""
    calls = {"n": 0}

    class ExplodingConn(FakeConnection):
        async def execute(self, query, *args):
            if "UPDATE match_runs SET processed" in query:
                raise RuntimeError("db down")
            return await super().execute(query, *args)

    conn = ExplodingConn()

    async def fake_match(self, cid, job_id, background_tasks, auto_email):
        calls["n"] += 1
        return {"candidate_id": cid, "status": "rejected", "email_result": {"sent": False}}

    monkeypatch.setattr(recruitment.MatchingService, "match", fake_match)

    await execute_match_run(_RUN, _JOB, "Dev", ["c1"], False, _factory_for(conn))

    fails = [q for q, _ in conn.executed if "status='failed'" in q]
    assert len(fails) == 1


async def test_get_match_run_not_found():
    conn = FakeConnection(fetchrow=[None])
    with pytest.raises(NotFoundError):
        await get_match_run(conn, "00000000-0000-0000-0000-000000000000")


async def test_get_match_run_parses_result_json():
    import uuid as _uuid

    row = {
        "id": _uuid.uuid4(),
        "job_id": _uuid.uuid4(),
        "status": "completed",
        "total": 2,
        "processed": 2,
        "result": json.dumps({"shortlisted_count": 1}),
    }
    conn = FakeConnection(fetchrow=[row])
    data = await get_match_run(conn, str(row["id"]))
    assert data["status"] == "completed"
    assert data["result"] == {"shortlisted_count": 1}
    assert isinstance(data["id"], str)


# ── Interview management ────────────────────────────────────────────────────
def _interview(status: str = "scheduled") -> dict:
    import uuid as _uuid

    return {
        "id": _uuid.uuid4(),
        "candidate_id": _uuid.uuid4(),
        "candidate_name": "Test Person",
        "candidate_email": "test@example.com",
        "job_title": "Dev",
        "match_score": 80.0,
        "meet_link": "https://meet.jit.si/hr-interview-abc",
        "status": status,
        "interview_time": datetime.now(timezone.utc),
    }


_IID = "00000000-0000-0000-0000-000000000001"


async def test_reschedule_rejects_cancelled_interview():
    conn = FakeConnection(fetchrow=[_interview("cancelled")])
    with pytest.raises(ValidationError):
        await InterviewService(conn).reschedule(_IID, datetime.now(timezone.utc))


async def test_reschedule_rejects_past_time():
    conn = FakeConnection(fetchrow=[_interview()])
    past = datetime.now(timezone.utc) - timedelta(days=1)
    with pytest.raises(ValidationError):
        await InterviewService(conn).reschedule(_IID, past)


async def test_reschedule_updates_time_and_logs_email():
    conn = FakeConnection(fetchrow=[_interview()], fetchval=[None])
    future = datetime.now(timezone.utc) + timedelta(days=7)
    result = await InterviewService(conn).reschedule(_IID, future)

    assert result["status"] == "scheduled"
    updates = [q for q, _ in conn.executed if "SET interview_time=" in q]
    logs = [q for q, _ in conn.executed if "INSERT INTO email_logs" in q]
    assert len(updates) == 1
    assert len(logs) == 1  # reschedule notification attempt is always logged


async def test_cancel_and_complete_transitions():
    conn = FakeConnection(fetchrow=[_interview(), _interview()])
    svc = InterviewService(conn)
    assert (await svc.cancel(_IID))["status"] == "cancelled"
    assert (await svc.complete(_IID))["status"] == "completed"
    status_updates = [a for q, a in conn.executed if "SET status=" in q]
    assert [a[0] for a in status_updates] == ["cancelled", "completed"]


async def test_cancel_rejects_completed_interview():
    conn = FakeConnection(fetchrow=[_interview("completed")])
    with pytest.raises(ValidationError):
        await InterviewService(conn).cancel(_IID)


async def test_complete_rejects_cancelled_interview():
    conn = FakeConnection(fetchrow=[_interview("cancelled")])
    with pytest.raises(ValidationError):
        await InterviewService(conn).complete(_IID)
