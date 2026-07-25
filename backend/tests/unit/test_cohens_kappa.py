"""Tests for Cohen's kappa (inter-annotator agreement).

Asserts the defining properties and a textbook worked example, so the metric
reported to a defense panel is provably correct.
"""

from __future__ import annotations

import pytest
from app.services.evaluation_protocol import cohens_kappa


def test_perfect_agreement_is_one():
    a = ["shortlisted", "rejected", "shortlisted", "rejected"]
    assert cohens_kappa(a, list(a)) == 1.0


def test_total_disagreement_is_negative():
    a = ["shortlisted", "shortlisted", "rejected", "rejected"]
    b = ["rejected", "rejected", "shortlisted", "shortlisted"]
    assert cohens_kappa(a, b) < 0


def test_single_category_both_annotators_is_one():
    # Degenerate: both label everything the same class → agreement is trivial.
    a = ["shortlisted"] * 5
    assert cohens_kappa(a, list(a)) == 1.0


def test_known_worked_example():
    # Classic 2x2 example: n=50, both-yes=20, both-no=15, a-yes/b-no=10, a-no/b-yes=5.
    a = ["y"] * 20 + ["y"] * 10 + ["n"] * 5 + ["n"] * 15
    b = ["y"] * 20 + ["n"] * 10 + ["y"] * 5 + ["n"] * 15
    # p_o = 35/50 = 0.70; p_e = (30/50*25/50)+(20/50*25/50)=0.30+0.20=0.50
    # kappa = (0.70-0.50)/(1-0.50) = 0.40
    assert cohens_kappa(a, b) == 0.4


def test_empty_returns_zero():
    assert cohens_kappa([], []) == 0.0


def test_length_mismatch_raises():
    with pytest.raises(ValueError):
        cohens_kappa(["y"], ["y", "n"])


def test_kappa_is_symmetric():
    a = ["y", "n", "y", "y", "n"]
    b = ["y", "y", "y", "n", "n"]
    assert cohens_kappa(a, b) == cohens_kappa(b, a)
