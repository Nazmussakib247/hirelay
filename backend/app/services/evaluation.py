"""Evaluation & ablation study business logic (academic benchmark).

Reporting protocol
------------------
``run()`` reports **held-out** performance. The dataset is split
deterministically (stratified, seed 42) into train and test; the decision
threshold is selected on train only; metrics are then measured once on the
untouched test split and reported with a 95% Wilson confidence interval.

The in-sample numbers are still computed and returned under ``in_sample``, but
they are labelled as such rather than presented as the headline. The gap
between the two is itself informative: on the bundled benchmark it is zero,
because the samples enumerate the required skill tokens verbatim and are
therefore separable almost regardless of the scoring configuration. That is a
property of the dataset, not evidence of a strong matcher — see
``Documentation/docs/ACCURACY.md``.
"""

from __future__ import annotations

from typing import NamedTuple

import asyncpg

from app.config import get_settings
from app.core.exceptions import ValidationError
from app.data.evaluation_samples import EVALUATION_SAMPLES
from app.repositories.evaluation import EvaluationRepository
from app.services.cv_parser import extract_experience_years, extract_skills
from app.services.evaluation_protocol import (
    DEFAULT_SEED,
    DEFAULT_TEST_FRACTION,
    ScoredSample,
    cohens_kappa,
    compute_metrics,
    stratified_split,
    tune_threshold,
)
from app.services.matching import (
    experience_score,
    score_candidate,
    skill_match_score,
    tf_cosine_similarity,
    tfidf_similarity,
)


class _AblationConfig(NamedTuple):
    """A weighting to evaluate. Typed so the arithmetic below is checkable —
    the previous ``list[dict]`` made every weight ``object`` to mypy."""

    name: str
    ws: float  # skill weight
    we: float  # experience weight
    wt: float  # lexical-similarity weight


_ABLATION_CONFIGS = [
    _AblationConfig("Skill Only (100/0/0)", 1.00, 0.00, 0.00),
    _AblationConfig("Skill+Exp (60/40/0)", 0.60, 0.40, 0.00),
    _AblationConfig("Equal Weights (33/33/34)", 0.33, 0.33, 0.34),
    _AblationConfig("Proposed (50/30/20)", 0.50, 0.30, 0.20),
    _AblationConfig("TF-IDF Heavy (20/20/60)", 0.20, 0.20, 0.60),
    _AblationConfig("Skill+TF-IDF (50/10/40)", 0.50, 0.10, 0.40),
]


def _metrics(tp: int, tn: int, fp: int, fn: int, total: int, correct: int) -> dict:
    precision = round(tp / (tp + fp) * 100, 1) if (tp + fp) else 0
    recall = round(tp / (tp + fn) * 100, 1) if (tp + fn) else 0
    f1 = round(2 * precision * recall / (precision + recall), 1) if (precision + recall) else 0
    accuracy = round(correct / total * 100, 1) if total else 0
    return {"precision": precision, "recall": recall, "f1": f1, "accuracy": accuracy}


class EvaluationService:
    def __init__(self, conn: asyncpg.Connection) -> None:
        self._conn = conn
        self._repo = EvaluationRepository(conn)

    async def seed(self) -> dict:
        existing = await self._repo.dataset_count()
        if existing > 0:
            return {"message": f"Dataset already has {existing} records"}
        count = 0
        for cv, jd, skills, exp, label, score in EVALUATION_SAMPLES:
            await self._repo.insert_sample(cv, jd, skills, exp, label, score)
            count += 1
        return {"success": True, "seeded": count}

    @staticmethod
    def _component_scores(sample) -> tuple[float, float, float]:
        """Skill / experience / lexical component scores for one sample."""
        cv_skills = extract_skills(sample["cv_text"])
        cv_exp = extract_experience_years(sample["cv_text"])
        required = list(sample["required_skills"] or [])
        ss = skill_match_score(cv_skills, required)
        se = experience_score(cv_exp, sample["min_experience"] or 0)
        st = tfidf_similarity(
            sample["cv_text"], sample["job_description"] + " " + " ".join(required)
        )
        return ss, se, st

    async def run(self) -> dict:
        """Held-out evaluation with the threshold tuned on training data only.

        Protocol (in order — the ordering is the point):
          1. Stratified split, fixed seed, so the test set is representative
             and the result is reproducible.
          2. Tune the decision threshold on TRAIN only.
          3. Measure once on TEST, with a 95% Wilson interval.

        In-sample numbers are still returned, under ``in_sample``, clearly
        separated from the headline so they cannot be mistaken for a
        generalisation estimate.
        """
        samples = await self._repo.all_samples()
        if not samples:
            raise ValidationError("No evaluation data. Seed the dataset first.")
        await self._repo.clear_results()

        # ── Score every sample once (scoring is threshold-independent) ──────
        scored: list[ScoredSample] = []
        per_sample: list[dict] = []
        for s in samples:
            ss, se, st = self._component_scores(s)
            score = round(ss * 0.50 + se * 0.30 + st * 0.20, 2)
            scored.append(ScoredSample(score=score, label=s["ground_truth_label"]))
            per_sample.append(
                {
                    "id": str(s["id"]),
                    "ground_truth": s["ground_truth_label"],
                    "score": score,
                    "components": {"skill": ss, "experience": se, "lexical": st},
                    "_row_id": s["id"],
                }
            )

        labels = [s.label for s in scored]
        train_idx, test_idx = stratified_split(scored, labels)
        train = [scored[i] for i in train_idx]
        test = [scored[i] for i in test_idx]

        # ── Threshold selected on TRAIN only ────────────────────────────────
        tuned_threshold = tune_threshold(train)
        configured_threshold = get_settings().match_threshold

        train_metrics = compute_metrics(train, tuned_threshold)
        test_metrics = compute_metrics(test, tuned_threshold)
        in_sample_metrics = compute_metrics(scored, configured_threshold)

        # ── Persist per-sample predictions at the tuned threshold ───────────
        test_positions = set(test_idx)
        for position, entry in enumerate(per_sample):
            predicted = "shortlisted" if entry["score"] >= tuned_threshold else "rejected"
            correct = predicted == entry["ground_truth"]
            entry["predicted"] = predicted
            entry["correct"] = correct
            entry["split"] = "test" if position in test_positions else "train"
            await self._repo.insert_result(
                entry.pop("_row_id"),
                entry["score"],
                predicted,
                entry["components"]["skill"],
                entry["components"]["experience"],
                entry["components"]["lexical"],
                50.0,
                correct,
            )

        return {
            "protocol": {
                "method": "stratified hold-out",
                "seed": DEFAULT_SEED,
                "test_fraction": DEFAULT_TEST_FRACTION,
                "train_size": len(train),
                "test_size": len(test),
                "threshold_tuned_on": "train split only",
                "tuned_threshold": tuned_threshold,
                "configured_threshold": configured_threshold,
            },
            # Headline: performance on data never used to pick the threshold.
            "held_out": test_metrics.to_dict(),
            "train": train_metrics.to_dict(),
            # Retained for continuity with earlier reports, explicitly labelled.
            "in_sample": {
                **in_sample_metrics.to_dict(),
                "caveat": (
                    "Threshold was selected using these same samples. This is a "
                    "training score, not an estimate of generalisation."
                ),
            },
            "caveats": [
                "Benchmark CVs are synthetic single-line texts that enumerate the "
                "required skill tokens verbatim, so the classes are close to "
                "linearly separable by keyword overlap alone.",
                "n=50 total. The 95% confidence interval on held-out accuracy is "
                "wide; treat the point estimate accordingly.",
                "Scores here exclude the LLM component. Run with GROQ_API_KEY set "
                "to benchmark the AI-enabled weight profile (35/25/10/30).",
            ],
            "total_samples": len(scored),
            "results": per_sample,
            # Back-compat: older clients/report tables read these top-level keys.
            # They now carry the HELD-OUT values, not the in-sample ones.
            "accuracy_pct": test_metrics.accuracy,
            "precision_pct": test_metrics.precision,
            "recall_pct": test_metrics.recall,
            "f1_score": test_metrics.f1,
            "confusion_matrix": {
                "TP": test_metrics.tp,
                "TN": test_metrics.tn,
                "FP": test_metrics.fp,
                "FN": test_metrics.fn,
            },
            "correct_predictions": test_metrics.correct,
        }

    async def annotator_agreement(self) -> dict:
        """Cohen's kappa between the first and a second annotator's labels.

        Reports agreement only over samples that a second human has labelled
        (``second_label``). Until such labels exist it returns a clear status
        rather than a fabricated number — inter-annotator agreement is only
        meaningful between genuinely independent labellers.
        """
        samples = await self._repo.all_samples()
        paired = [
            (s["ground_truth_label"], s["second_label"])
            for s in samples
            if s["second_label"] in ("shortlisted", "rejected")
        ]
        if not paired:
            return {
                "status": "no_second_annotator_labels",
                "message": (
                    "No second-annotator labels present. Add them (set "
                    "evaluation_dataset.second_label) to compute Cohen's kappa — "
                    "see Documentation/docs/ACCURACY.md."
                ),
                "labelled": 0,
                "total": len(samples),
            }
        a = [x for x, _ in paired]
        b = [y for _, y in paired]
        kappa = cohens_kappa(a, b)
        if kappa >= 0.81:
            strength = "almost perfect"
        elif kappa >= 0.61:
            strength = "substantial"
        elif kappa >= 0.41:
            strength = "moderate"
        elif kappa >= 0.21:
            strength = "fair"
        elif kappa > 0:
            strength = "slight"
        else:
            strength = "poor (≤ chance)"
        return {
            "status": "ok",
            "labelled": len(paired),
            "total": len(samples),
            "cohens_kappa": kappa,
            "agreement_strength": strength,
        }

    async def run_ai(self) -> dict:
        """Held-out evaluation using the AI-enabled weight profile (35/25/10/30).

        Scores every sample through the *exact production path*
        (``score_candidate``, which calls Groq when configured), then applies
        the same stratified hold-out + train-only threshold tuning as ``run()``.
        Requires GROQ_API_KEY and network access, so it is run on demand rather
        than in CI. When the key is absent it returns a clear status.
        """
        if not get_settings().ai_enabled:
            return {
                "status": "ai_disabled",
                "message": "GROQ_API_KEY is not set — cannot benchmark the AI profile.",
            }
        samples = await self._repo.all_samples()
        if not samples:
            raise ValidationError("No evaluation data. Seed the dataset first.")

        scored: list[ScoredSample] = []
        ai_used = 0
        for s in samples:
            required = list(s["required_skills"] or [])
            breakdown = await score_candidate(
                candidate_skills=extract_skills(s["cv_text"]),
                candidate_experience=extract_experience_years(s["cv_text"]),
                candidate_text=s["cv_text"],
                required_skills=required,
                min_experience=s["min_experience"] or 0,
                job_title="",
                job_description=s["job_description"],
            )
            ai_used += 1 if breakdown.has_ai else 0
            scored.append(ScoredSample(score=breakdown.final_score, label=s["ground_truth_label"]))

        labels = [x.label for x in scored]
        train_idx, test_idx = stratified_split(scored, labels)
        train = [scored[i] for i in train_idx]
        test = [scored[i] for i in test_idx]
        tuned = tune_threshold(train)
        test_metrics = compute_metrics(test, tuned)
        return {
            "status": "ok",
            "profile": "AI-enabled (skill .35 / exp .25 / tfidf .10 / ai .30)",
            "ai_component_used_on": f"{ai_used}/{len(scored)} samples",
            "protocol": {
                "method": "stratified hold-out",
                "seed": DEFAULT_SEED,
                "test_fraction": DEFAULT_TEST_FRACTION,
                "train_size": len(train),
                "test_size": len(test),
                "tuned_threshold": tuned,
            },
            "held_out": test_metrics.to_dict(),
        }

    async def ablation(self) -> dict:
        samples = await self._repo.all_samples()
        if not samples:
            raise ValidationError("No dataset. Seed first.")
        threshold = get_settings().match_threshold

        # Pre-compute components once; only the weighting varies per config.
        components = [self._component_scores(s) for s in samples]
        labels = [s["ground_truth_label"] for s in samples]

        ablation_results = []
        for cfg in _ABLATION_CONFIGS:
            scored = [
                ScoredSample(score=round(cfg.ws * ss + cfg.we * se + cfg.wt * st, 2), label=label)
                for (ss, se, st), label in zip(components, labels, strict=True)
            ]
            m = compute_metrics(scored, threshold)
            ablation_results.append(
                {
                    "config": cfg.name,
                    "weights": {"skill": cfg.ws, "experience": cfg.we, "tfidf": cfg.wt},
                    **m.to_dict(),
                }
            )

        # Lexical-representation ablation: does real IDF weighting beat plain
        # term frequency? Reported because the engine's docstring previously
        # claimed TF-IDF while computing TF, so the difference should be
        # measured rather than assumed.
        lexical_variants = []
        for variant_name, sim_fn in (
            ("TF only", tf_cosine_similarity),
            ("TF-IDF", tfidf_similarity),
        ):
            scored = []
            for s, label in zip(samples, labels, strict=True):
                required = list(s["required_skills"] or [])
                ss = skill_match_score(extract_skills(s["cv_text"]), required)
                se = experience_score(
                    extract_experience_years(s["cv_text"]), s["min_experience"] or 0
                )
                st = sim_fn(s["cv_text"], s["job_description"] + " " + " ".join(required))
                scored.append(
                    ScoredSample(score=round(ss * 0.50 + se * 0.30 + st * 0.20, 2), label=label)
                )
            m = compute_metrics(scored, threshold)
            shortlisted = [x.score for x in scored if x.label == "shortlisted"]
            rejected = [x.score for x in scored if x.label == "rejected"]
            lexical_variants.append(
                {
                    "representation": variant_name,
                    **m.to_dict(),
                    "separation_gap": round(min(shortlisted) - max(rejected), 2)
                    if shortlisted and rejected
                    else None,
                }
            )

        best = max(ablation_results, key=lambda x: x["f1_score"])
        proposed = next(r for r in ablation_results if r["config"].startswith("Proposed"))
        return {
            "dataset_size": len(samples),
            "threshold_used": threshold,
            "ablation": ablation_results,
            "lexical_representation": lexical_variants,
            "best_config": best["config"],
            "conclusion": (
                f"Proposed (50/30/20) achieves F1={proposed['f1_score']}%. "
                "Note: these are in-sample figures across all samples — the ablation "
                "compares weightings against each other, it is not a generalisation "
                "estimate. See run() for held-out performance."
            ),
        }

    async def results(self) -> list[dict]:
        return [dict(r) for r in await self._repo.results_with_dataset()]
