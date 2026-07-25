"""Evaluation protocol: splitting, threshold selection, and interval estimation.

Why this module exists
----------------------
The previous protocol reported 100% accuracy on all 50 labelled samples while
selecting ``MATCH_THRESHOLD`` from a sweep over *those same 50 samples*
(``docs/ACCURACY.md`` shows the sweep). That is in-sample tuning: the reported
number is a training score, not an estimate of how the matcher behaves on a CV
it has not seen. An examiner is entitled to discount it entirely.

This module supplies the missing machinery:

* :func:`stratified_split` — deterministic, class-balanced train/test split, so
  the held-out set has the same shortlisted/rejected ratio as the whole set and
  the split is identical on every run (reproducible results).
* :func:`tune_threshold` — picks the decision threshold using **training data
  only**, so the test set stays untouched until the final measurement.
* :func:`wilson_interval` — a 95% confidence interval on the accuracy. With
  n≈15 held-out samples the point estimate alone is close to meaningless; the
  interval is what makes the claim honest. Wilson is used rather than the
  normal approximation because the latter is badly behaved near 0% and 100%,
  which is exactly where these results land.

Nothing here touches the database or the network, so it is cheap to unit-test
and the numbers in the report are reproducible from a single pytest run.
"""

from __future__ import annotations

import math
from collections.abc import Sequence
from dataclasses import dataclass

# Fixed seed: the split must be identical across runs and machines, otherwise
# the reported held-out metrics are not reproducible from the report.
DEFAULT_SEED = 42
DEFAULT_TEST_FRACTION = 0.30


@dataclass(frozen=True)
class ScoredSample:
    """A sample reduced to what the protocol needs: a score and a true label."""

    score: float
    label: str  # "shortlisted" | "rejected"


@dataclass(frozen=True)
class Metrics:
    total: int
    correct: int
    accuracy: float
    precision: float
    recall: float
    f1: float
    tp: int
    tn: int
    fp: int
    fn: int
    accuracy_ci_low: float
    accuracy_ci_high: float

    def to_dict(self) -> dict:
        return {
            "total": self.total,
            "correct": self.correct,
            "accuracy_pct": self.accuracy,
            "precision_pct": self.precision,
            "recall_pct": self.recall,
            "f1_score": self.f1,
            "confusion_matrix": {"TP": self.tp, "TN": self.tn, "FP": self.fp, "FN": self.fn},
            "accuracy_95ci_pct": [self.accuracy_ci_low, self.accuracy_ci_high],
        }


def cohens_kappa(labels_a: Sequence[str], labels_b: Sequence[str]) -> float:
    """Cohen's kappa: inter-annotator agreement corrected for chance.

    κ = (p_o − p_e) / (1 − p_e), where p_o is observed agreement and p_e is the
    agreement expected by chance from each annotator's marginal rates. κ=1 is
    perfect agreement, 0 is chance-level, negative is worse than chance. This is
    the standard measure for whether a second human labeller agrees with the
    first — i.e. whether the ground-truth labels are reliable rather than one
    person's opinion.
    """
    if len(labels_a) != len(labels_b):
        raise ValueError("annotator label lists must be the same length")
    n = len(labels_a)
    if n == 0:
        return 0.0
    p_o = sum(1 for a, b in zip(labels_a, labels_b) if a == b) / n
    categories = set(labels_a) | set(labels_b)
    p_e = 0.0
    for c in categories:
        p_e += (sum(1 for x in labels_a if x == c) / n) * (sum(1 for x in labels_b if x == c) / n)
    if p_e >= 1.0:  # both annotators used a single category → agreement is trivial
        return 1.0
    return round((p_o - p_e) / (1 - p_e), 3)


def wilson_interval(successes: int, n: int, z: float = 1.96) -> tuple[float, float]:
    """95% Wilson score interval for a binomial proportion, as percentages.

    Chosen over the normal approximation because that one produces intervals
    extending past 100% (or below 0%) when the observed proportion is extreme —
    which is precisely the regime these benchmark results sit in.
    """
    if n == 0:
        return (0.0, 0.0)
    p = successes / n
    denom = 1 + z**2 / n
    centre = (p + z**2 / (2 * n)) / denom
    margin = (z * math.sqrt(p * (1 - p) / n + z**2 / (4 * n**2))) / denom
    low = max(0.0, centre - margin) * 100
    high = min(1.0, centre + margin) * 100
    return (round(low, 1), round(high, 1))


def stratified_split(
    samples: Sequence[object],
    labels: Sequence[str],
    *,
    test_fraction: float = DEFAULT_TEST_FRACTION,
    seed: int = DEFAULT_SEED,
) -> tuple[list[int], list[int]]:
    """Return ``(train_indices, test_indices)``, stratified by label.

    Deterministic for a given ``seed``: indices are grouped by class, each group
    is shuffled with a seeded PRNG, and the same fraction is taken from every
    class. This keeps the held-out set's class balance equal to the full set's,
    so a 26/24 dataset does not produce an all-one-class test split.
    """
    import random

    if len(samples) != len(labels):
        raise ValueError("samples and labels must be the same length")

    by_label: dict[str, list[int]] = {}
    for idx, label in enumerate(labels):
        by_label.setdefault(label, []).append(idx)

    rng = random.Random(seed)
    train: list[int] = []
    test: list[int] = []
    for label in sorted(by_label):  # sorted → order independent of dict insertion
        group = by_label[label][:]
        rng.shuffle(group)
        n_test = max(1, round(len(group) * test_fraction)) if len(group) > 1 else 0
        test.extend(group[:n_test])
        train.extend(group[n_test:])
    return sorted(train), sorted(test)


def compute_metrics(scored: Sequence[ScoredSample], threshold: float) -> Metrics:
    """Confusion matrix and derived metrics at a given decision threshold."""
    tp = tn = fp = fn = 0
    for s in scored:
        predicted = "shortlisted" if s.score >= threshold else "rejected"
        if s.label == "shortlisted" and predicted == "shortlisted":
            tp += 1
        elif s.label == "rejected" and predicted == "rejected":
            tn += 1
        elif s.label == "rejected" and predicted == "shortlisted":
            fp += 1
        else:
            fn += 1

    total = len(scored)
    correct = tp + tn
    precision = tp / (tp + fp) * 100 if (tp + fp) else 0.0
    recall = tp / (tp + fn) * 100 if (tp + fn) else 0.0
    f1 = 2 * precision * recall / (precision + recall) if (precision + recall) else 0.0
    accuracy = correct / total * 100 if total else 0.0
    ci_low, ci_high = wilson_interval(correct, total)
    return Metrics(
        total=total,
        correct=correct,
        accuracy=round(accuracy, 1),
        precision=round(precision, 1),
        recall=round(recall, 1),
        f1=round(f1, 1),
        tp=tp,
        tn=tn,
        fp=fp,
        fn=fn,
        accuracy_ci_low=ci_low,
        accuracy_ci_high=ci_high,
    )


def tune_threshold(
    train: Sequence[ScoredSample],
    candidates: Sequence[int] = tuple(range(30, 91, 5)),
) -> int:
    """Select the decision threshold that maximises F1 **on the training set**.

    Ties are broken toward the midpoint of the tied run rather than the first
    candidate: when several thresholds are perfect on training data, the centre
    of that plateau is the most robust choice for unseen data, whereas an edge
    value sits one sample away from degrading.
    """
    if not train:
        return 55
    scored = [(compute_metrics(train, t).f1, t) for t in candidates]
    best_f1 = max(f1 for f1, _ in scored)
    plateau = [t for f1, t in scored if f1 == best_f1]
    return plateau[len(plateau) // 2]
