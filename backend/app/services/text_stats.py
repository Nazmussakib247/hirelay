"""Lexical similarity: tokenisation, IDF, and TF-IDF cosine.

Why this module exists
----------------------
The matching engine previously advertised "TF-IDF cosine similarity" but
computed cosine over raw **term-frequency** vectors — there was no
inverse-document-frequency term anywhere in the codebase, and no corpus to
derive one from. Without IDF, ubiquitous CV filler ("experience", "team",
"developer", "responsible") carries exactly as much weight as a discriminative
term ("kubernetes", "pytorch"), which is precisely the problem IDF exists to
solve.

This module implements the real thing:

* :func:`build_idf` computes smoothed IDF over a background corpus using the
  standard ``log((1 + N) / (1 + df)) + 1`` formulation (the same smoothing
  scikit-learn's ``TfidfVectorizer`` uses with ``smooth_idf=True``). Smoothing
  prevents a divide-by-zero for unseen terms and stops any single term from
  reaching zero weight.
* :func:`tfidf_cosine_similarity` weights each term's frequency by its IDF
  before taking the cosine.
* :func:`tf_cosine_similarity` preserves the old TF-only behaviour under an
  honest name, so the ablation study can quantify what IDF actually buys.

The background corpus is the 50-pair benchmark (CV text + job description =
100 documents), which ships with the application. This keeps scoring
deterministic and reproducible — the same CV/job pair always yields the same
similarity, regardless of how many jobs happen to be in the database — which
matters for a benchmark whose numbers are quoted in the report.
"""

from __future__ import annotations

import math
import re
from collections import Counter
from collections.abc import Iterable, Sequence
from functools import lru_cache

_TOKEN_RE = re.compile(r"\b[a-z]{3,}\b")


def tokenize(text: str) -> list[str]:
    """Lowercase word tokens of 3+ ASCII letters."""
    return _TOKEN_RE.findall(text.lower())


def term_frequencies(tokens: Sequence[str]) -> dict[str, float]:
    """Length-normalised term frequencies."""
    if not tokens:
        return {}
    counts = Counter(tokens)
    total = len(tokens)
    return {term: count / total for term, count in counts.items()}


def build_idf(documents: Iterable[str]) -> dict[str, float]:
    """Smoothed IDF: ``log((1 + N) / (1 + df)) + 1`` per term."""
    docs = list(documents)
    n_docs = len(docs)
    if n_docs == 0:
        return {}
    doc_freq: Counter[str] = Counter()
    for doc in docs:
        for term in set(tokenize(doc)):
            doc_freq[term] += 1
    return {term: math.log((1 + n_docs) / (1 + df)) + 1.0 for term, df in doc_freq.items()}


def default_idf_weight(idf: dict[str, float]) -> float:
    """IDF assigned to a term absent from the corpus.

    An unseen term is maximally rare, so it gets the largest weight observed.
    Falling back to 1.0 instead would make rare, highly informative terms
    (a niche framework) count *less* than common ones — backwards.
    """
    return max(idf.values(), default=1.0)


def _cosine(vec_a: dict[str, float], vec_b: dict[str, float]) -> float:
    if not vec_a or not vec_b:
        return 0.0
    shared = vec_a.keys() & vec_b.keys()
    dot = sum(vec_a[t] * vec_b[t] for t in shared)
    mag_a = math.sqrt(sum(v * v for v in vec_a.values()))
    mag_b = math.sqrt(sum(v * v for v in vec_b.values()))
    if mag_a == 0.0 or mag_b == 0.0:
        return 0.0
    return round(dot / (mag_a * mag_b) * 100, 2)


def tf_cosine_similarity(text_a: str, text_b: str) -> float:
    """Cosine over raw term-frequency vectors (no IDF).

    Retained under an accurate name so the ablation study can measure the
    contribution of IDF rather than assuming it.
    """
    return _cosine(
        term_frequencies(tokenize(text_a)),
        term_frequencies(tokenize(text_b)),
    )


def tfidf_cosine_similarity(text_a: str, text_b: str, idf: dict[str, float] | None = None) -> float:
    """Cosine over IDF-weighted term-frequency vectors.

    Uses the bundled background corpus when ``idf`` is not supplied.
    """
    weights = idf if idf is not None else get_default_idf()
    fallback = default_idf_weight(weights)

    def weighted(text: str) -> dict[str, float]:
        return {
            term: freq * weights.get(term, fallback)
            for term, freq in term_frequencies(tokenize(text)).items()
        }

    return _cosine(weighted(text_a), weighted(text_b))


@lru_cache(maxsize=1)
def get_default_idf() -> dict[str, float]:
    """IDF table built once from the bundled benchmark corpus."""
    from app.data.evaluation_samples import EVALUATION_SAMPLES

    corpus: list[str] = []
    for cv_text, job_description, *_ in EVALUATION_SAMPLES:
        corpus.append(cv_text)
        corpus.append(job_description)
    return build_idf(corpus)
