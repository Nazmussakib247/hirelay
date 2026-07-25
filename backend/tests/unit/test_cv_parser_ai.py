"""Tests for the AI + NLP hybrid CV parser (no network)."""

from __future__ import annotations

from app.services import cv_parser_ai
from app.services.cv_parser import parse_cv

CV_TEXT = (
    "MD RAKIB HASAN\n"
    "Software Engineer\n"
    "rakib.hasan@example.com | +8801812345678\n"
    "Skills: python, fastapi\n"
    "2020 - Present: Backend Engineer at Acme\n"
)


async def test_ai_parse_returns_none_without_api_key():
    # No GROQ_API_KEY in the test env → hybrid must degrade to pure NLP.
    assert await cv_parser_ai.ai_parse_cv(CV_TEXT) is None


async def test_hybrid_equals_nlp_when_ai_unavailable():
    nlp = parse_cv(CV_TEXT)
    hybrid = await cv_parser_ai.parse_cv_hybrid(CV_TEXT)
    assert hybrid == nlp


def test_merge_accepts_valid_ai_name_present_in_text():
    nlp = parse_cv(CV_TEXT)
    merged = cv_parser_ai.merge_parsed(nlp, {"name": "Md Rakib Hasan"}, CV_TEXT)
    assert merged["name"] == "Md Rakib Hasan"


def test_merge_rejects_hallucinated_name():
    nlp = parse_cv(CV_TEXT)
    merged = cv_parser_ai.merge_parsed(nlp, {"name": "John Fabricated"}, CV_TEXT)
    assert merged["name"] == nlp["name"]  # AI value discarded


def test_merge_keeps_regex_email_over_ai():
    nlp = parse_cv(CV_TEXT)
    merged = cv_parser_ai.merge_parsed(nlp, {"email": "other@example.com"}, CV_TEXT)
    assert merged["email"] == "rakib.hasan@example.com"


def test_merge_unions_and_normalises_skills():
    nlp = parse_cv(CV_TEXT)
    merged = cv_parser_ai.merge_parsed(nlp, {"skills": ["ReactJS", "k8s", "python"]}, CV_TEXT)
    assert {"react", "kubernetes", "python", "fastapi"} <= set(merged["skills"])


def test_merge_fills_experience_only_when_nlp_found_none():
    nlp = dict(parse_cv(CV_TEXT), experience_years=0)
    merged = cv_parser_ai.merge_parsed(nlp, {"experience_years": 4}, CV_TEXT)
    assert merged["experience_years"] == 4

    nlp_with_years = dict(parse_cv(CV_TEXT), experience_years=6)
    merged = cv_parser_ai.merge_parsed(nlp_with_years, {"experience_years": 2}, CV_TEXT)
    assert merged["experience_years"] == 6  # deterministic value wins


def test_merge_clamps_bogus_ai_experience():
    nlp = dict(parse_cv(CV_TEXT), experience_years=0)
    merged = cv_parser_ai.merge_parsed(nlp, {"experience_years": 999}, CV_TEXT)
    assert merged["experience_years"] == 40


def test_merge_none_ai_is_identity():
    nlp = parse_cv(CV_TEXT)
    assert cv_parser_ai.merge_parsed(nlp, None, CV_TEXT) == nlp
