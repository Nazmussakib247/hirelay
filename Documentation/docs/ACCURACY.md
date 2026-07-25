# Matching Accuracy — Methodology & Results

> **Read this section first.** The headline number reported by the Evaluation
> tab is **held-out accuracy**: the decision threshold is tuned on a training
> split and measured once on samples that took no part in that tuning. An
> earlier version of this document reported 100% accuracy while selecting the
> threshold from a sweep over the *same* 50 samples. That is in-sample tuning,
> and the number it produced was a training score, not an estimate of
> performance on unseen CVs. The protocol below replaces it.

## 1. Protocol

Implemented in `app/services/evaluation_protocol.py`, exercised by
`tests/unit/test_evaluation_protocol.py`, and executed by `EvaluationService.run()`.

| Step | Detail |
|---|---|
| 1. Split | Stratified hold-out, 70% train / 30% test, `seed=42` (deterministic and reproducible) |
| 2. Tune | Decision threshold chosen to maximise **F1 on the training split only** |
| 3. Measure | Metrics computed **once** on the untouched test split |
| 4. Report | Accuracy given with a 95% **Wilson** confidence interval |

Stratification keeps the shortlisted/rejected ratio of the test split equal to
the full set's, so a 26/24 dataset cannot produce a single-class test split
where precision and recall are undefined. The seed is fixed because a benchmark
whose numbers change per run cannot be quoted in a report.

The Wilson interval is used in preference to the normal approximation, which
misbehaves near 0% and 100% — precisely where these results fall.

## 2. Results

Run `python scripts/run_evaluation.py` or open the **Evaluation** tab. The
response reports three blocks, deliberately separated:

- **`held_out`** — the headline. Performance on samples not used for tuning.
- **`train`** — training-split performance, for comparison.
- **`in_sample`** — all 50 samples at the configured threshold, carried over
  from the previous methodology and explicitly labelled with a caveat so it
  cannot be mistaken for a generalisation estimate.

### Threshold selection

The engine's scores separate the classes cleanly:

| Class | Min | Max |
|---|---:|---:|
| Shortlisted | 62 | 92 |
| Rejected | 0 | 47 |

There is an empty band between 47 and 62. The shipped default
`MATCH_THRESHOLD=55` sits in the middle of it. The original default of 70 sat
*above* most qualified candidates and rejected them (recall 3.8%) — that was a
genuine configuration bug, and correcting it was a real fix.

Where the tuner finds several thresholds tied on training F1, it selects the
**midpoint of the tied plateau** rather than the first candidate: the centre of
a plateau is more robust to unseen data than an edge value one sample away from
degrading.

## 3. Ablation studies

### 3.1 Component weighting

Six configurations, in-sample across all samples (this study compares weightings
against each other; it is not a generalisation estimate):

| Configuration | Skill | Experience | Lexical |
|---|---:|---:|---:|
| Skill Only | 1.00 | 0.00 | 0.00 |
| Skill + Experience | 0.60 | 0.40 | 0.00 |
| Equal Weights | 0.33 | 0.33 | 0.34 |
| **Proposed** | **0.50** | **0.30** | **0.20** |
| Lexical Heavy | 0.20 | 0.20 | 0.60 |
| Skill + Lexical | 0.50 | 0.10 | 0.40 |

### 3.2 Lexical representation — TF vs TF-IDF

Added because the engine previously *described* its lexical component as
"TF-IDF cosine similarity" while computing cosine over raw term-frequency
vectors — there was no IDF term and no corpus to derive one from. Rather than
assume IDF helps, it is now measured:

| Representation | Held-out accuracy | Class separation gap |
|---|---:|---:|
| TF only | unchanged | 15.19 points |
| **TF-IDF (shipped)** | unchanged | 13.56 points |

**Result: identical confusion matrices at every threshold from 50 to 70.** Real
IDF costs nothing in accuracy here and makes the published description true, so
it ships (`app/services/text_stats.py`).

That the difference is so small is itself a finding, and it points directly at
the limitation below.

## 4. Limitations — read before quoting any number here

These are stated plainly because they bound what the results support.

1. **The benchmark is close to trivially separable.** The 50 samples are
   synthetic single-line texts whose "CV" enumerates the required skill tokens
   verbatim:

   ```
   "Python developer 5 years experience. Skills: python, django, postgresql, docker..."
   job requires: ["python", "django", "postgresql", "docker"]
   ```

   Skill extraction is keyword matching over a fixed vocabulary, so high
   accuracy is close to guaranteed by construction. This measures that the
   pipeline is wired correctly end to end — it does **not** demonstrate CV
   understanding. It is why swapping TF for TF-IDF changes nothing: the classes
   are separable almost regardless of the lexical component.

2. **Small n.** 50 samples total, ~15 held out. The confidence interval on
   held-out accuracy is correspondingly wide. Treat the point estimate with
   that in mind.

3. **No real documents.** No PDF layout noise, no multi-column CVs, no
   spelling variants outside the alias table, no career-changers, no
   over-qualified applicants, no near-miss candidates — the cases where an
   automated matcher actually earns its keep.

4. **Ground truth is self-authored.** Labels were assigned by the same author
   who designed the scorer. A second-annotator Cohen's κ can now be computed
   once independent labels are added — see §4a; the number is not fabricated.

5. **The AI path can now be benchmarked on demand** (§4b) via
   `POST /evaluation/run-ai`. The default `run()` figures still cover the
   deterministic 50/30/20 profile, because the AI path needs network + a key
   and would make CI non-deterministic.

## 4a. Inter-annotator agreement (Cohen's κ)

The ground-truth labels were assigned by a single author, so on their own they
reflect one person's judgement. `GET /evaluation/agreement` computes **Cohen's
κ** between the original labels and an independent second annotator's labels —
the standard measure of whether the labels are reliable rather than subjective.

The machinery is implemented and unit-tested
(`app/services/evaluation_protocol.py::cohens_kappa`,
`tests/unit/test_cohens_kappa.py`), but **no second-annotator labels ship with
the project** — inventing them would defeat the purpose. To produce a real κ:

1. Have a second person independently label some samples shortlisted/rejected.
2. Store each as `evaluation_dataset.second_label` (e.g. via SQL `UPDATE`, or a
   small import script).
3. Call `GET /evaluation/agreement` — it returns κ and its strength
   (Landis & Koch bands: >0.8 almost perfect, 0.6–0.8 substantial, …) over the
   samples that have both labels.

Until then the endpoint honestly returns `no_second_annotator_labels`.

## 4b. AI-enabled profile benchmark

Sections 2–3 measure the **deterministic** profile (50/30/20). The shipped
system, with `GROQ_API_KEY` set, uses **35/25/10/30** (skill/exp/tfidf/AI).
`POST /evaluation/run-ai` benchmarks that profile through the *exact production
scoring path* (`score_candidate`, which calls Groq), then applies the same
stratified hold-out + train-only threshold tuning as `run()`. It reports how
many samples the AI component actually scored, and the held-out metrics.

It is **run on demand** (not in CI) because it needs network access and a
configured key, and makes paid LLM calls (hence admin-only). Without a key it
returns `ai_disabled`. Run it locally with the key set and quote the resulting
`held_out` figures alongside the deterministic ones — that closes the gap where
the AI profile was previously unmeasured.

## 5. What would strengthen this

In descending order of value:

1. **Add 10-15 hard samples** — real PDF CVs, a career-changer, an
   over-qualified applicant, a near-miss. Accuracy will drop, and *that is the
   informative result*.
2. **Second annotator** on a subset, and report Cohen's κ.
3. **k-fold cross-validation** instead of a single hold-out, once n is large
   enough to support it.
4. **Benchmark the AI-enabled profile** and compare it against the
   deterministic baseline — currently the LLM's contribution is unquantified.

## 6. Statement for the defense

> "On a 50-pair benchmark with a stratified 70/30 hold-out and the threshold
> tuned on the training split only, the matcher classifies the held-out samples
> correctly, and the ablation supports the 50/30/20 weighting. I would not
> present this as a generalisation estimate: the benchmark CVs enumerate the
> required skills verbatim, so the classes are nearly linearly separable by
> keyword overlap, and n is small. What it establishes is that the pipeline is
> correctly wired and that the original threshold default of 70 was a real bug
> costing 96% of recall. The honest next step is harder samples drawn from real
> CVs, where I would expect accuracy to fall."

Saying this before an examiner does converts the weakest part of the evaluation
into evidence of judgement.
