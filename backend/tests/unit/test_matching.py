"""Unit tests for the matching engine scoring functions.

These lock in the exact numeric behaviour of the original monolith so any
future change that alters scores is caught by CI.
"""

from __future__ import annotations

from app.services.matching import (
    experience_score,
    final_score,
    normalize_skill,
    skill_match_score,
    tfidf_similarity,
)


def test_skill_match_partial():
    assert skill_match_score(["python", "django"], ["python", "django", "docker", "git"]) == 50.0


def test_skill_match_full():
    assert skill_match_score(["python", "django"], ["python", "django"]) == 100.0


def test_skill_match_empty_requirements_defaults_to_50():
    assert skill_match_score(["python"], []) == 50.0


def test_experience_meets_requirement_caps_at_100():
    assert experience_score(5, 3) == 100.0


def test_experience_below_requirement_is_ratio():
    assert experience_score(2, 4) == 50.0


def test_experience_zero_requirement_is_100():
    assert experience_score(0, 0) == 100.0


def test_tfidf_identical_text_is_high():
    assert tfidf_similarity("python django docker", "python django docker") > 90


def test_tfidf_disjoint_text_is_zero():
    assert tfidf_similarity("python django", "marketing sales") == 0.0


def test_normalize_skill_resolves_aliases():
    assert normalize_skill(" JS ") == "javascript"
    assert normalize_skill("Py") == "python"
    assert normalize_skill("K8s") == "kubernetes"
    assert normalize_skill("unknown skill") == "unknown skill"


def test_skill_match_synonyms_count_as_matches():
    # CV says "JS" and "py" — job requires "javascript" and "python".
    assert skill_match_score(["JS", "py"], ["javascript", "python"]) == 100.0


def test_skill_match_aliases_in_requirements_side():
    assert skill_match_score(["postgresql", "kubernetes"], ["postgres", "k8s"]) == 100.0


def test_skill_match_weighted_scores_by_weight_mass():
    # python (weight 9) matched, docker (weight 1) missed → 9/10 = 90%
    assert skill_match_score(["python"], ["python", "docker"], {"python": 9, "docker": 1}) == 90.0


def test_skill_match_weighted_defaults_missing_weight_to_one():
    # python weighted 4, go unweighted (defaults 1) → 4/5 = 80%
    assert skill_match_score(["python"], ["python", "go"], {"python": 4}) == 80.0


def test_skill_match_weights_ignore_unknown_skills_and_bad_values():
    # "rust" isn't required (ignored); docker's weight is invalid (kept at 1).
    assert skill_match_score(["python"], ["python", "docker"], {"rust": 10, "docker": "x"}) == 50.0


def test_skill_match_unweighted_behaviour_unchanged():
    assert (
        skill_match_score(["python", "django"], ["python", "django", "docker", "git"], {}) == 50.0
    )


def test_final_score_without_ai_weights():
    # 88*.5 + 100*.3 + 20*.2 = 44 + 30 + 4 = 78.0
    assert final_score(88, 100, 20, 50, has_ai=False) == 78.0


def test_final_score_with_ai_weights():
    # 88*.35 + 100*.25 + 20*.10 + 90*.30 = 30.8 + 25 + 2 + 27 = 84.8
    assert final_score(88, 100, 20, 90, has_ai=True) == 84.8
