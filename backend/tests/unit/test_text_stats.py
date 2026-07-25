"""Tests for TF-IDF lexical similarity.

The engine previously advertised TF-IDF while computing plain term frequency.
These tests assert the properties that actually distinguish the two, so the
claim cannot silently become false again.
"""

from __future__ import annotations

import math

from app.services.text_stats import (
    build_idf,
    default_idf_weight,
    get_default_idf,
    term_frequencies,
    tf_cosine_similarity,
    tfidf_cosine_similarity,
    tokenize,
)


# ── Tokenisation ───────────────────────────────────────────────────────────
def test_tokenize_lowercases_and_drops_short_tokens():
    assert tokenize("Python is A Great language") == ["python", "great", "language"]


def test_tokenize_ignores_punctuation_and_digits():
    assert tokenize("C++ 2024 django-rest!") == ["django", "rest"]


def test_term_frequencies_sum_to_one():
    tf = term_frequencies(tokenize("alpha beta alpha gamma"))
    assert math.isclose(sum(tf.values()), 1.0)
    assert math.isclose(tf["alpha"], 0.5)


def test_term_frequencies_of_empty_input():
    assert term_frequencies([]) == {}


# ── IDF ────────────────────────────────────────────────────────────────────
def test_idf_is_lower_for_common_terms_than_rare_ones():
    """The defining property of IDF — and exactly what the old code lacked."""
    corpus = [
        "python developer experience",
        "java developer experience",
        "ruby developer experience",
        "kubernetes",
    ]
    idf = build_idf(corpus)
    assert idf["developer"] < idf["kubernetes"], "ubiquitous terms must be down-weighted"
    assert idf["experience"] < idf["python"]


def test_idf_is_positive_for_every_term():
    """Smoothing must keep weights positive, or terms vanish from the vector."""
    idf = build_idf(["a term here", "another term there"])
    assert all(v > 0 for v in idf.values())


def test_idf_of_empty_corpus_is_empty():
    assert build_idf([]) == {}


def test_unseen_terms_get_the_maximum_weight():
    """An out-of-corpus term is maximally rare; it must not be down-weighted."""
    idf = build_idf(["common common", "common word"])
    assert default_idf_weight(idf) == max(idf.values())


def test_default_idf_weight_of_empty_table():
    assert default_idf_weight({}) == 1.0


# ── Similarity ─────────────────────────────────────────────────────────────
def test_identical_documents_are_maximally_similar():
    text = "python django postgresql docker"
    assert tfidf_cosine_similarity(text, text) == 100.0
    assert tf_cosine_similarity(text, text) == 100.0


def test_disjoint_documents_score_zero():
    assert tfidf_cosine_similarity("python django", "welding carpentry masonry") == 0.0


def test_empty_input_scores_zero_rather_than_crashing():
    assert tfidf_cosine_similarity("", "python") == 0.0
    assert tfidf_cosine_similarity("python", "") == 0.0
    assert tf_cosine_similarity("", "") == 0.0


def test_similarity_is_symmetric():
    a, b = "python django backend", "backend engineer python"
    assert tfidf_cosine_similarity(a, b) == tfidf_cosine_similarity(b, a)


def test_similarity_is_bounded():
    for a, b in [("python", "python java"), ("a b c", "c d e"), ("x", "y")]:
        assert 0.0 <= tfidf_cosine_similarity(a, b) <= 100.0


def test_idf_downweights_shared_boilerplate():
    """Two CVs sharing only filler must score lower under IDF than under TF."""
    corpus = ["experience team work responsible"] * 8 + ["kubernetes rust"]
    idf = build_idf(corpus)
    a = "experience team work responsible python"
    b = "experience team work responsible java"
    assert tfidf_cosine_similarity(a, b, idf) < tf_cosine_similarity(a, b)


def test_default_idf_table_is_built_from_the_bundled_corpus():
    idf = get_default_idf()
    assert idf, "background corpus should not be empty"
    assert all(v > 0 for v in idf.values())


def test_default_idf_table_is_cached():
    assert get_default_idf() is get_default_idf()
