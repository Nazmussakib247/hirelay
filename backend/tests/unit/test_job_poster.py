"""Tests for the job-board poster (credential-less paths, no network)."""

from __future__ import annotations

from app.config import get_settings
from app.integrations import job_poster


def test_job_to_text_includes_title_and_skills():
    text = job_poster.job_to_text(
        {"title": "Python Dev", "required_skills": ["python", "django"], "min_experience": 3}
    )
    assert "Python Dev" in text
    assert "python" in text
    assert "3+ years" in text


def test_configured_platforms_all_false_without_creds():
    configured = job_poster.get_configured_platforms()
    assert configured == {
        "linkedin": False,
        "telegram": False,
        "twitter": False,
        "bdjobs": False,
        "webhook": False,
    }


async def test_each_handler_skips_without_credentials():
    job = {"title": "X", "required_skills": [], "min_experience": 1}
    for handler in job_poster.PLATFORM_HANDLERS.values():
        result = await handler(job)
        assert result["status"] == "skipped"


async def test_post_to_all_platforms_aggregates_skips():
    result = await job_poster.post_job_to_all_platforms(
        {"title": "X", "required_skills": [], "min_experience": 1}
    )
    assert result["summary"]["total_posted"] == 0
    assert len(result["summary"]["skipped"]) == 5


async def test_bdjobs_is_honestly_unsupported_with_credentials(monkeypatch):
    """With credentials set, Bdjobs must report 'unsupported' — never a fake
    success inferred from an HTTP 200 (the old scraper's behaviour)."""
    settings = get_settings()
    monkeypatch.setattr(settings, "bdjobs_username", "employer")
    monkeypatch.setattr(settings, "bdjobs_password", "secret")
    result = await job_poster.post_to_bdjobs({"title": "X"})
    assert result["status"] == "unsupported"
    assert "employer.bdjobs.com" in result["reason"]


class _FakeResponse:
    def __init__(self, status_code: int, headers: dict | None = None, text: str = ""):
        self.status_code = status_code
        self.headers = headers or {}
        self.text = text


class _RecordingClient:
    """Stands in for httpx.AsyncClient; records the request it receives."""

    last_call: dict = {}

    def __init__(self, response: _FakeResponse):
        self._response = response

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False

    async def post(self, url, headers=None, json=None, **kw):
        _RecordingClient.last_call = {"url": url, "headers": headers or {}, "json": json}
        return self._response


async def test_linkedin_uses_versioned_rest_posts_api(monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "linkedin_access_token", "tok")
    monkeypatch.setattr(settings, "linkedin_org_id", "12345")
    response = _FakeResponse(201, headers={"x-restli-id": "urn:li:share:6789"})
    monkeypatch.setattr(job_poster.httpx, "AsyncClient", lambda **kw: _RecordingClient(response))

    result = await job_poster.post_to_linkedin(
        {"title": "Dev", "required_skills": ["python"], "min_experience": 1}
    )

    call = _RecordingClient.last_call
    assert call["url"] == "https://api.linkedin.com/rest/posts"
    assert call["headers"]["LinkedIn-Version"] == job_poster._LINKEDIN_VERSION
    assert call["json"]["author"] == "urn:li:organization:12345"
    assert result["status"] == "success"
    assert result["post_id"] == "urn:li:share:6789"


async def test_linkedin_200_without_post_urn_is_not_success(monkeypatch):
    """A bare 2xx with no x-restli-id must be reported as failure."""
    settings = get_settings()
    monkeypatch.setattr(settings, "linkedin_access_token", "tok")
    monkeypatch.setattr(settings, "linkedin_org_id", "12345")
    response = _FakeResponse(200, headers={})
    monkeypatch.setattr(job_poster.httpx, "AsyncClient", lambda **kw: _RecordingClient(response))
    result = await job_poster.post_to_linkedin({"title": "Dev"})
    assert result["status"] == "failed"


def test_linkedin_text_escaping():
    escaped = job_poster._escape_linkedin_text("Hire (Python) [3+ yrs] {remote}")
    assert "\\(" in escaped and "\\[" in escaped and "\\{" in escaped
