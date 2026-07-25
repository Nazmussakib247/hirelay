"""Tests for the held-out evaluation protocol.

These assert on *invariants* (the split is reproducible, class balance is
preserved, train and test are disjoint, the interval brackets the estimate)
rather than on magic numbers, so they keep their meaning if the benchmark data
changes.
"""

from __future__ import annotations

import pytest
from app.services.evaluation_protocol import (
    DEFAULT_SEED,
    ScoredSample,
    compute_metrics,
    stratified_split,
    tune_threshold,
    wilson_interval,
)


def _dataset(n_short: int = 26, n_rej: int = 24) -> tuple[list[ScoredSample], list[str]]:
    """Cleanly separable synthetic set mirroring the bundled benchmark's shape."""
    samples = [ScoredSample(score=70.0 + i % 20, label="shortlisted") for i in range(n_short)]
    samples += [ScoredSample(score=10.0 + i % 20, label="rejected") for i in range(n_rej)]
    return samples, [s.label for s in samples]


# ── Splitting ──────────────────────────────────────────────────────────────
def test_split_is_deterministic_across_calls():
    samples, labels = _dataset()
    first = stratified_split(samples, labels)
    second = stratified_split(samples, labels)
    assert first == second, "split must be reproducible or reported metrics are not"


def test_split_is_disjoint_and_total():
    samples, labels = _dataset()
    train, test = stratified_split(samples, labels)
    assert set(train) & set(test) == set(), "a sample must not be in both splits"
    assert sorted(train + test) == list(range(len(samples)))


def test_split_preserves_class_balance():
    samples, labels = _dataset(n_short=26, n_rej=24)
    train, test = stratified_split(samples, labels, test_fraction=0.30)
    test_labels = [labels[i] for i in test]
    # Both classes must be represented, or held-out precision/recall are undefined.
    assert test_labels.count("shortlisted") > 0
    assert test_labels.count("rejected") > 0
    full_ratio = labels.count("shortlisted") / len(labels)
    test_ratio = test_labels.count("shortlisted") / len(test_labels)
    assert abs(full_ratio - test_ratio) < 0.20


def test_split_changes_with_seed():
    samples, labels = _dataset()
    a = stratified_split(samples, labels, seed=DEFAULT_SEED)
    b = stratified_split(samples, labels, seed=DEFAULT_SEED + 1)
    assert a != b, "different seeds should yield different partitions"


def test_split_rejects_mismatched_lengths():
    with pytest.raises(ValueError):
        stratified_split([ScoredSample(1.0, "a")], ["a", "b"])


# ── Metrics ────────────────────────────────────────────────────────────────
def test_confusion_matrix_sums_to_sample_count():
    samples, _ = _dataset()
    m = compute_metrics(samples, threshold=55)
    assert m.tp + m.tn + m.fp + m.fn == len(samples)


def test_perfect_separation_scores_100():
    samples, _ = _dataset()
    m = compute_metrics(samples, threshold=55)
    assert m.accuracy == 100.0
    assert m.precision == 100.0 and m.recall == 100.0


def test_threshold_above_all_positives_destroys_recall():
    samples, _ = _dataset()
    m = compute_metrics(samples, threshold=95)
    assert m.recall == 0.0
    assert m.fn > 0


def test_metrics_on_empty_set_do_not_crash():
    m = compute_metrics([], threshold=55)
    assert m.total == 0 and m.accuracy == 0.0


# ── Confidence interval ────────────────────────────────────────────────────
def test_wilson_interval_brackets_the_estimate():
    low, high = wilson_interval(9, 10)
    assert low < 90.0 < high


def test_wilson_interval_stays_within_bounds_at_extremes():
    for successes, n in ((0, 10), (10, 10), (15, 15), (1, 3)):
        low, high = wilson_interval(successes, n)
        assert 0.0 <= low <= high <= 100.0


def test_wilson_interval_narrows_as_n_grows():
    _, high_small = wilson_interval(8, 10)
    low_small, _ = wilson_interval(8, 10)
    _, high_big = wilson_interval(800, 1000)
    low_big, _ = wilson_interval(800, 1000)
    assert (high_big - low_big) < (high_small - low_small)


def test_wilson_interval_handles_zero_samples():
    assert wilson_interval(0, 0) == (0.0, 0.0)


# ── Threshold tuning ───────────────────────────────────────────────────────
def test_tuned_threshold_separates_the_classes():
    samples, _ = _dataset()
    thr = tune_threshold(samples)
    max_rejected = max(s.score for s in samples if s.label == "rejected")
    min_shortlisted = min(s.score for s in samples if s.label == "shortlisted")
    assert max_rejected < thr <= min_shortlisted


def test_tuning_uses_only_the_data_it_is_given():
    """A threshold tuned on train must not depend on held-out samples."""
    samples, labels = _dataset()
    train_idx, _ = stratified_split(samples, labels)
    train = [samples[i] for i in train_idx]
    assert tune_threshold(train) == tune_threshold(list(train))


def test_tune_threshold_on_empty_input_falls_back():
    assert tune_threshold([]) == 55
