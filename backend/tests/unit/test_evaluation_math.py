"""Regression test: reproduce the benchmark math over the seed dataset.

Runs the same scoring the evaluation service applies and asserts the aggregate
metrics at the *configured* match threshold. This locks in the threshold fix
(default 55) that lifts benchmark accuracy from 50% to 100% — see
docs/ACCURACY.md for the full analysis.
"""

from __future__ import annotations

from app.config import get_settings
from app.data.evaluation_samples import EVALUATION_SAMPLES
from app.services.cv_parser import extract_experience_years, extract_skills
from app.services.matching import (
    experience_score,
    skill_match_score,
    tfidf_similarity,
)

THRESHOLD = get_settings().match_threshold


def _run_benchmark(threshold: int = THRESHOLD):
    correct = tp = tn = fp = fn = 0
    for cv, jd, skills, exp, label, _ in EVALUATION_SAMPLES:
        ss = skill_match_score(extract_skills(cv), skills)
        se = experience_score(extract_experience_years(cv), exp)
        st = tfidf_similarity(cv, jd + " " + " ".join(skills))
        score = round(ss * 0.50 + se * 0.30 + st * 0.20, 2)
        pred = "shortlisted" if score >= threshold else "rejected"
        correct += pred == label
        tp += label == "shortlisted" and pred == "shortlisted"
        tn += label == "rejected" and pred == "rejected"
        fp += label == "rejected" and pred == "shortlisted"
        fn += label == "shortlisted" and pred == "rejected"
    return correct, tp, tn, fp, fn


def test_dataset_has_50_samples():
    assert len(EVALUATION_SAMPLES) == 50


def test_benchmark_is_deterministic():
    assert _run_benchmark() == _run_benchmark()


def test_accuracy_meets_target_at_configured_threshold():
    correct, _tp, _tn, _fp, _fn = _run_benchmark()
    accuracy = correct / len(EVALUATION_SAMPLES) * 100
    assert accuracy >= 80.0, f"accuracy {accuracy:.1f}% below 80% target"


def test_scores_cleanly_separate_classes():
    # Shortlisted candidates score well above rejected ones — the reason a
    # correctly-placed threshold achieves near-perfect accuracy.
    shortlisted, rejected = [], []
    for cv, jd, skills, exp, label, _ in EVALUATION_SAMPLES:
        ss = skill_match_score(extract_skills(cv), skills)
        se = experience_score(extract_experience_years(cv), exp)
        st = tfidf_similarity(cv, jd + " " + " ".join(skills))
        score = round(ss * 0.50 + se * 0.30 + st * 0.20, 2)
        (shortlisted if label == "shortlisted" else rejected).append(score)
    assert min(shortlisted) > max(rejected)
