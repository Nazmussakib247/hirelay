"""Matching engine: score a candidate against a job.

Scoring components (all 0-100):
    * skill overlap   — |cv ∩ required| / |required| (synonym-aware, optionally
                        weighted per skill via the job's ``skill_weights`` JSONB)
    * experience      — min(candidate_years / required_years, capped)
    * tf-idf cosine   — lexical similarity of CV text vs job text, using
                        genuine smoothed IDF over a bundled background corpus
                        (see app.services.text_stats)
    * groq ai (opt.)  — LLM assessment when GROQ_API_KEY is configured

Final weighting (unchanged from the validated ablation study):
    with AI:    skill .35 + exp .25 + tfidf .10 + ai .30
    without AI: skill .50 + exp .30 + tfidf .20

If the Groq call fails (network error, timeout, bad JSON) after retries, the
engine no longer injects a neutral 50 into the AI slot — it falls back to the
non-AI weight profile (50/30/20) so a provider outage cannot skew scores.
"""

from __future__ import annotations

import asyncio
import json
import re
from dataclasses import dataclass, field

import httpx

from app.config import get_settings
from app.core.logging import get_logger
from app.services.skills import SKILL_ALIASES, normalize_skill  # noqa: F401 - re-exported
from app.services.text_stats import (  # noqa: F401 - tf_cosine re-exported for ablation
    tf_cosine_similarity,
    tfidf_cosine_similarity,
)

logger = get_logger(__name__)

# ── Groq call tuning ─────────────────────────────────────────────────────────
GROQ_TIMEOUT_SECONDS = 20.0  # per-attempt timeout (connect + read)
GROQ_MAX_ATTEMPTS = 3  # 1 initial try + 2 retries
GROQ_RETRY_BACKOFF_SECONDS = 0.5  # sleep = backoff * attempt between retries
GROQ_CV_MAX_CHARS = 6000  # was 800 — send substantially more CV context
GROQ_JD_MAX_CHARS = 2000  # was 400


# Skill synonym / alias normalisation now lives in app.services.skills and is
# re-exported above for backwards compatibility.


@dataclass
class AiAssessment:
    score: float = 50.0
    summary: str = ""
    strengths: list[str] = field(default_factory=list)
    gaps: list[str] = field(default_factory=list)
    ok: bool = False  # True only when a real LLM response was parsed


@dataclass
class MatchBreakdown:
    skill_match: float
    experience_match: float
    text_similarity: float
    ai_score: float
    has_ai: bool
    threshold: int
    final_score: float
    status: str
    ai_summary: str = ""
    strengths: list[str] = field(default_factory=list)
    gaps: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "skill_match": self.skill_match,
            "experience_match": self.experience_match,
            "text_similarity": self.text_similarity,
            "ai_score": self.ai_score,
            "has_ai": self.has_ai,
            "threshold": self.threshold,
            "ai_summary": self.ai_summary,
            "strengths": self.strengths,
            "gaps": self.gaps,
        }


def skill_match_score(
    candidate_skills: list[str],
    required_skills: list[str],
    skill_weights: dict[str, float] | None = None,
) -> float:
    """Synonym-aware skill overlap, optionally weighted per required skill.

    Without weights every required skill counts equally (legacy behaviour).
    With weights, the score is the weight-mass of matched skills over the
    total weight-mass; required skills absent from the weight map get 1.0.
    """
    if not required_skills:
        return 50.0
    cand = {normalize_skill(s) for s in candidate_skills}
    weights: dict[str, float] = {}
    for raw in required_skills:
        weights.setdefault(normalize_skill(raw), 1.0)
    if skill_weights:
        for raw_skill, raw_weight in skill_weights.items():
            key = normalize_skill(str(raw_skill))
            try:
                weight = float(raw_weight)
            except (TypeError, ValueError):
                continue
            if key in weights and weight > 0:
                weights[key] = weight
    total = sum(weights.values())
    if total <= 0:
        return 50.0
    matched = sum(w for skill, w in weights.items() if skill in cand)
    return round(min(matched / total * 100, 100), 2)


def experience_score(candidate_years: int, required_years: int) -> float:
    """Ratio of candidate experience to the requirement, capped at 100.

    Meeting the requirement scores full marks; exceeding it scores the same.
    An earlier version returned ``min(100.0, 100.0 + (excess) * 2)``, which
    reads like a seniority bonus but is arithmetically dead — the bonus term is
    never negative, so the expression always collapsed to exactly 100.0. The
    cap is deliberate: "years beyond the requirement" is a weak signal of fit
    and rewarding it would penalise well-matched mid-level candidates.
    """
    if required_years == 0:
        return 100.0
    if candidate_years >= required_years:
        return 100.0
    return round(candidate_years / required_years * 100, 2)


def tfidf_similarity(text_a: str, text_b: str) -> float:
    """TF-IDF cosine similarity between two documents (0-100).

    Until this revision the function computed cosine over *raw term-frequency*
    vectors while being documented and published as "TF-IDF" — there was no
    IDF term and no corpus to derive one from. It now delegates to a real
    implementation (:mod:`app.services.text_stats`) that weights each term by
    smoothed inverse document frequency computed over the bundled 100-document
    background corpus.

    Measured impact on the 50-pair benchmark: identical confusion matrix at
    every threshold in 50-70 (accuracy unchanged), with the class separation
    gap moving from 15.19 to 13.56 points. IDF costs nothing in accuracy here
    and makes the published description true. The narrowness of that delta is
    itself a finding: the benchmark's CVs enumerate the required skill tokens
    verbatim, so it is separable almost regardless of the lexical component —
    see docs/ACCURACY.md.
    """
    return tfidf_cosine_similarity(text_a, text_b)


def final_score(skill: float, experience: float, tfidf: float, ai: float, has_ai: bool) -> float:
    if has_ai:
        return round(skill * 0.35 + experience * 0.25 + tfidf * 0.10 + ai * 0.30, 2)
    return round(skill * 0.50 + experience * 0.30 + tfidf * 0.20, 2)


async def _groq_chat_json(prompt: str, *, max_tokens: int = 400) -> dict | list | None:
    """POST one prompt to Groq with timeout + retry; return parsed JSON or None.

    Retries transient failures (network errors, 5xx/429, malformed JSON) up to
    ``GROQ_MAX_ATTEMPTS`` with linear backoff. Never raises.
    """
    settings = get_settings()
    last_error = ""
    for attempt in range(1, GROQ_MAX_ATTEMPTS + 1):
        try:
            async with httpx.AsyncClient(timeout=httpx.Timeout(GROQ_TIMEOUT_SECONDS)) as client:
                response = await client.post(
                    "https://api.groq.com/openai/v1/chat/completions",
                    headers={
                        "Authorization": f"Bearer {settings.groq_api_key}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "model": settings.groq_model,
                        "messages": [{"role": "user", "content": prompt}],
                        "temperature": 0.1,
                        "max_tokens": max_tokens,
                        "response_format": {"type": "json_object"},
                    },
                )
                response.raise_for_status()
                content = re.sub(
                    r"```json|```", "", response.json()["choices"][0]["message"]["content"]
                ).strip()
                parsed: dict | list | None = json.loads(content)
                return parsed
        except Exception as exc:  # noqa: BLE001 - AI is best-effort, never fatal
            last_error = str(exc)
            logger.warning(
                "groq call failed",
                extra={"attempt": attempt, "max_attempts": GROQ_MAX_ATTEMPTS, "error": last_error},
            )
            if attempt < GROQ_MAX_ATTEMPTS:
                await asyncio.sleep(GROQ_RETRY_BACKOFF_SECONDS * attempt)
    logger.warning("groq call exhausted retries", extra={"error": last_error})
    return None


def _clamp_score(value: object, default: float = 50.0) -> float:
    try:
        return max(0.0, min(100.0, float(value)))  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return default


async def groq_ai_score(
    cv_text: str,
    job_description: str,
    job_title: str,
    *,
    required_skills: list[str] | None = None,
    min_experience: int = 0,
    skill_weights: dict[str, float] | None = None,
) -> AiAssessment:
    """Query Groq for an LLM assessment. Degrades gracefully on any failure.

    The prompt now includes HR's exact required skills (with per-skill
    importance weights when customised) and the minimum experience, plus an
    explicit scoring rubric — this anchors the LLM to the job's real criteria
    instead of letting it free-associate from the description alone.

    On failure ``ok`` stays False, which makes ``score_candidate`` fall back to
    the non-AI weight profile instead of blending in a meaningless 50.
    """
    settings = get_settings()
    if not settings.groq_api_key:
        return AiAssessment(summary="AI unavailable — GROQ_API_KEY not set")

    if required_skills:
        weights = skill_weights or {}
        skills_line = ", ".join(
            f"{s} (importance {weights[s]}/10)" if s in weights else s for s in required_skills
        )
    else:
        skills_line = "not specified"

    prompt = (
        "You are an expert HR recruiter evaluating a CV against a specific job.\n"
        "Scoring rubric (be strict and evidence-based):\n"
        "- 80-100: covers nearly all required skills incl. the high-importance "
        "ones, with clear hands-on evidence and sufficient experience\n"
        "- 60-79: covers most required skills, minor gaps only\n"
        "- 40-59: partial coverage, notable gaps in important skills\n"
        "- 0-39: wrong domain or missing most required skills\n"
        "Only credit skills actually evidenced in the CV. "
        "Respond ONLY with valid JSON, no markdown.\n"
        f"JOB TITLE: {job_title}\n"
        f"REQUIRED SKILLS: {skills_line}\n"
        f"MINIMUM EXPERIENCE: {min_experience} years\n"
        f"JOB DESCRIPTION: {job_description[:GROQ_JD_MAX_CHARS]}\n"
        f"CV:\n{cv_text[:GROQ_CV_MAX_CHARS]}\n\n"
        "JSON shape:\n"
        '{"score":<0-100>,"summary":"<2 sentences>",'
        '"strengths":["s1","s2"],"gaps":["g1","g2"]}'
    )
    data = await _groq_chat_json(prompt, max_tokens=400)
    if not isinstance(data, dict):
        return AiAssessment(summary="AI scoring failed — scored without AI component")
    return AiAssessment(
        score=_clamp_score(data.get("score", 50)),
        summary=str(data.get("summary", "")),
        strengths=[str(s) for s in data.get("strengths", []) if s],
        gaps=[str(g) for g in data.get("gaps", []) if g],
        ok=True,
    )


async def suggest_job_skills(job_description: str, job_title: str = "") -> dict:
    """Suggest skill keywords + importance weights (1-10) for a job description.

    Uses Groq when configured; otherwise (or on failure) falls back to the
    deterministic keyword extractor from the CV parser with a neutral weight.
    """
    from app.services.cv_parser import extract_skills  # local import: avoid cycle

    def _fallback() -> dict:
        found = extract_skills(f"{job_title} {job_description}")
        return {
            "skills": [{"skill": normalize_skill(s), "weight": 5} for s in sorted(found)],
            "source": "keyword-fallback",
        }

    settings = get_settings()
    if not settings.groq_api_key:
        return _fallback()

    prompt = (
        "You are an expert technical recruiter. Extract the most important skill "
        "keywords from this job description and rate each skill's importance for "
        "the role as an integer weight from 1 (nice to have) to 10 (critical). "
        "Return at most 12 skills, lowercase, deduplicated. "
        "Respond ONLY with valid JSON, no markdown.\n"
        f"JOB TITLE: {job_title}\n"
        f"JOB DESCRIPTION: {job_description[:GROQ_JD_MAX_CHARS]}\n\n"
        'JSON shape: {"skills":[{"skill":"python","weight":9}]}'
    )
    data = await _groq_chat_json(prompt, max_tokens=500)
    items = data.get("skills") if isinstance(data, dict) else data
    if not isinstance(items, list):
        return _fallback()

    seen: set[str] = set()
    skills: list[dict] = []
    for item in items:
        if not isinstance(item, dict) or not item.get("skill"):
            continue
        name = normalize_skill(str(item["skill"]))
        if not name or name in seen:
            continue
        try:
            weight = int(round(float(item.get("weight", 5))))
        except (TypeError, ValueError):
            weight = 5
        seen.add(name)
        skills.append({"skill": name, "weight": max(1, min(10, weight))})
    return {"skills": skills, "source": "ai"} if skills else _fallback()


async def score_candidate(
    *,
    candidate_skills: list[str],
    candidate_experience: int,
    candidate_text: str,
    required_skills: list[str],
    min_experience: int,
    job_title: str,
    job_description: str,
    skill_weights: dict[str, float] | None = None,
    threshold: int | None = None,
) -> MatchBreakdown:
    """Compute the full match breakdown for a candidate/job pair.

    ``threshold`` is the per-job shortlist cutoff; when None the global,
    benchmark-tuned ``MATCH_THRESHOLD`` is used.
    """
    settings = get_settings()
    effective_threshold = threshold if threshold is not None else settings.match_threshold
    skill = skill_match_score(candidate_skills, required_skills, skill_weights)
    experience = experience_score(candidate_experience, min_experience)
    tfidf = tfidf_similarity(candidate_text, f"{job_description} {' '.join(required_skills)}")
    ai = await groq_ai_score(
        candidate_text,
        job_description,
        job_title,
        required_skills=[normalize_skill(s) for s in required_skills],
        min_experience=min_experience,
        skill_weights={normalize_skill(k): v for k, v in (skill_weights or {}).items()},
    )
    # AI only participates when the call actually succeeded — otherwise fall
    # back to the validated non-AI weight profile (50/30/20).
    has_ai = settings.ai_enabled and ai.ok
    score = final_score(skill, experience, tfidf, ai.score, has_ai)
    status = "shortlisted" if score >= effective_threshold else "rejected"
    return MatchBreakdown(
        skill_match=skill,
        experience_match=experience,
        text_similarity=tfidf,
        ai_score=ai.score,
        has_ai=has_ai,
        threshold=effective_threshold,
        final_score=score,
        status=status,
        ai_summary=ai.summary,
        strengths=ai.strengths,
        gaps=ai.gaps,
    )
