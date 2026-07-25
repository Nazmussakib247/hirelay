"""Tests for the higher-level matching orchestration helpers (no network)."""

from __future__ import annotations

from app.services import matching


async def test_groq_disabled_returns_default_assessment():
    # No GROQ_API_KEY in the test env → graceful default, no network call.
    result = await matching.groq_ai_score("cv text", "job desc", "Engineer")
    assert result.score == 50.0
    assert result.ok is False
    assert "unavailable" in result.summary.lower()


async def test_groq_failure_marks_assessment_not_ok(monkeypatch):
    from app.config import Settings

    monkeypatch.setattr(matching, "get_settings", lambda: Settings(groq_api_key="fake-key"))

    async def exhausted(prompt, *, max_tokens=400):
        return None  # what _groq_chat_json returns after all retries fail

    monkeypatch.setattr(matching, "_groq_chat_json", exhausted)
    result = await matching.groq_ai_score("cv text", "job desc", "Engineer")
    assert result.ok is False
    assert "failed" in result.summary.lower()


async def test_groq_failure_falls_back_to_non_ai_weights(monkeypatch):
    """AI configured but failing → score uses the 50/30/20 profile, not a fake 50."""
    from app.config import Settings

    monkeypatch.setattr(matching, "get_settings", lambda: Settings(groq_api_key="fake-key"))

    async def exhausted(prompt, *, max_tokens=400):
        return None

    monkeypatch.setattr(matching, "_groq_chat_json", exhausted)
    breakdown = await matching.score_candidate(
        candidate_skills=["python", "django"],
        candidate_experience=4,
        candidate_text="python django backend engineer",
        required_skills=["python", "django", "docker"],
        min_experience=3,
        job_title="Backend Engineer",
        job_description="python django docker required",
    )
    assert breakdown.has_ai is False
    expected = matching.final_score(
        breakdown.skill_match,
        breakdown.experience_match,
        breakdown.text_similarity,
        50.0,
        has_ai=False,
    )
    assert breakdown.final_score == expected


async def test_score_candidate_uses_skill_weights():
    breakdown = await matching.score_candidate(
        candidate_skills=["python"],
        candidate_experience=5,
        candidate_text="python engineer",
        required_skills=["python", "docker"],
        min_experience=3,
        job_title="Engineer",
        job_description="python docker",
        skill_weights={"python": 9, "docker": 1},
    )
    assert breakdown.skill_match == 90.0


async def test_suggest_skills_fallback_without_api_key():
    result = await matching.suggest_job_skills(
        "We need python and docker experience with postgresql databases",
        "Backend Engineer",
    )
    assert result["source"] == "keyword-fallback"
    names = {s["skill"] for s in result["skills"]}
    assert "python" in names
    assert all(1 <= s["weight"] <= 10 for s in result["skills"])


async def test_score_candidate_shortlists_strong_match():
    breakdown = await matching.score_candidate(
        candidate_skills=["python", "django", "postgresql", "docker"],
        candidate_experience=5,
        candidate_text="python django postgresql docker senior engineer",
        required_skills=["python", "django", "postgresql", "docker"],
        min_experience=3,
        job_title="Senior Python Developer",
        job_description="python django postgresql docker required",
    )
    assert breakdown.skill_match == 100.0
    assert breakdown.status == "shortlisted"
    assert breakdown.final_score >= 70


async def test_score_candidate_rejects_weak_match():
    breakdown = await matching.score_candidate(
        candidate_skills=["photoshop", "figma"],
        candidate_experience=0,
        candidate_text="graphic designer photoshop figma",
        required_skills=["python", "java", "kubernetes"],
        min_experience=5,
        job_title="Backend Engineer",
        job_description="python java kubernetes required",
    )
    assert breakdown.status == "rejected"


def test_breakdown_to_dict_shape():
    b = matching.MatchBreakdown(
        skill_match=100,
        experience_match=100,
        text_similarity=50,
        ai_score=50,
        has_ai=False,
        threshold=70,
        final_score=85,
        status="shortlisted",
    )
    d = b.to_dict()
    assert set(d) >= {"skill_match", "experience_match", "text_similarity", "ai_score", "threshold"}
