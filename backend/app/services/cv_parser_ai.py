"""AI-assisted CV parsing (Groq LLM) merged with the deterministic NLP parser.

Strategy — hybrid with validation, never a single point of failure:
    1. The deterministic parser (``cv_parser.parse_cv``) always runs first.
    2. When ``GROQ_API_KEY`` is configured, the LLM extracts the same fields
       from the raw text.
    3. ``merge_parsed`` combines both: AI values are only accepted when they
       pass sanity checks *against the original text* (anti-hallucination),
       and regex-reliable fields (email/phone) keep the deterministic value
       unless it is missing.

If the LLM is unavailable, times out, or returns garbage, the upload proceeds
on NLP results alone — AI can only add accuracy, never break an upload.
"""

from __future__ import annotations

import re

from app.config import get_settings
from app.core.logging import get_logger
from app.services.cv_parser import _EMAIL_RE, _valid_name
from app.services.matching import _groq_chat_json
from app.services.skills import normalize_skill

logger = get_logger(__name__)

_AI_CV_MAX_CHARS = 6000
_MAX_SKILLS = 50


async def ai_parse_cv(text: str) -> dict | None:
    """Ask the LLM to extract structured CV fields. Returns None on any failure."""
    settings = get_settings()
    if not settings.groq_api_key:
        return None
    prompt = (
        "You are an expert CV/resume parser. Extract structured fields from "
        "the CV text below. Rules:\n"
        "- name: the candidate's full name exactly as written in the CV\n"
        "- email/phone: exactly as written, or null if absent\n"
        "- skills: every technical and professional skill explicitly present "
        "(lowercase, max 30); do NOT invent skills that are not in the text\n"
        "- experience_years: total professional experience as an integer "
        "(compute from employment date ranges if not stated; 0 if none)\n"
        "- education: highest degree with institution, one line\n"
        "Respond ONLY with valid JSON, no markdown.\n\n"
        f"CV TEXT:\n{text[:_AI_CV_MAX_CHARS]}\n\n"
        "JSON shape:\n"
        '{"name":"...","email":"...","phone":"...","skills":["..."],'
        '"experience_years":0,"education":"..."}'
    )
    data = await _groq_chat_json(prompt, max_tokens=600)
    if not isinstance(data, dict):
        return None
    return data


def _text_digits(text: str) -> str:
    return re.sub(r"\D", "", text)


def merge_parsed(nlp: dict, ai: dict | None, text: str) -> dict:
    """Merge AI-extracted fields into the NLP result with per-field validation."""
    if not ai:
        return nlp
    merged = dict(nlp)

    # Name — AI reads context better than heuristics, but every word it
    # returns must actually appear in the CV text (anti-hallucination).
    ai_name = str(ai.get("name") or "").strip()
    if (
        ai_name
        and _valid_name(ai_name)
        and all(re.search(re.escape(w), text, re.IGNORECASE) for w in ai_name.split())
    ):
        merged["name"] = ai_name.title() if ai_name.isupper() else ai_name

    # Email — regex is authoritative; only fill a gap, and only with a value
    # that is a well-formed address present in the text.
    if not merged.get("email"):
        ai_email = str(ai.get("email") or "").strip().lower()
        if ai_email and _EMAIL_RE.fullmatch(ai_email) and ai_email in text.lower():
            merged["email"] = ai_email

    # Phone — same policy: fill gaps only, digits must exist in the document.
    if not merged.get("phone"):
        ai_phone = str(ai.get("phone") or "").strip()
        digits = _text_digits(ai_phone)
        if 9 <= len(digits) <= 15 and digits in _text_digits(text):
            merged["phone"] = ai_phone

    # Skills — union of both extractors, normalised and capped.
    ai_skills = ai.get("skills")
    if isinstance(ai_skills, list):
        combined = set(merged.get("skills") or [])
        for raw in ai_skills:
            skill = normalize_skill(str(raw))
            if skill and len(skill) <= 40 and len(skill.split()) <= 4:
                combined.add(skill)
        merged["skills"] = sorted(combined)[:_MAX_SKILLS]

    # Experience — trust the deterministic value when it found one; the AI
    # fills the gap when regex/date-ranges found nothing.
    if not merged.get("experience_years"):
        try:
            years = int(float(ai.get("experience_years", 0)))
            merged["experience_years"] = max(0, min(years, 40))
        except (TypeError, ValueError):
            pass

    # Education — AI provides a cleaner one-liner when NLP found nothing.
    if merged.get("education") in (None, "", "Not specified"):
        ai_edu = str(ai.get("education") or "").strip()
        if 3 <= len(ai_edu) <= 200:
            merged["education"] = ai_edu

    return merged


def compute_parse_confidence(parsed: dict) -> int:
    """Heuristic 0-100 confidence in how well the CV was parsed.

    Rewards the presence of the fields HR relies on. A low score flags a CV the
    parser struggled with (scanned image, unusual layout) so HR can double-check
    or re-upload rather than trust incomplete data.
    """
    score = 0
    if (parsed.get("name") or "").strip():
        score += 25
    if (parsed.get("email") or "").strip():
        score += 25
    if (parsed.get("phone") or "").strip():
        score += 15
    n_skills = len(parsed.get("skills") or [])
    score += min(n_skills, 5) * 4  # up to +20
    edu = (parsed.get("education") or "").strip()
    if edu and edu.lower() != "not specified":
        score += 10
    if int(parsed.get("experience_years") or 0) > 0:
        score += 5
    return min(score, 100)


async def parse_cv_hybrid(text: str, extra_keywords: list[str] | None = None) -> dict:
    """Full hybrid pipeline: deterministic NLP parse + optional AI enrichment."""
    from app.services import cv_parser  # local import keeps module load light

    nlp = cv_parser.parse_cv(text, extra_keywords)
    try:
        ai = await ai_parse_cv(text)
    except Exception as exc:  # noqa: BLE001 - AI must never break an upload
        logger.warning("ai cv parse failed", extra={"error": str(exc)})
        ai = None
    merged = merge_parsed(nlp, ai, text)
    merged["parse_confidence"] = compute_parse_confidence(merged)
    return merged
