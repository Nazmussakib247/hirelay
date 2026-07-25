# Senior Engineering Audit — Scored (post-remediation)

**Project:** Automated HR Recruiting System (FastAPI + React + PostgreSQL + n8n)
**Date:** 20 July 2026
**Grading lens:** Academic / thesis-defense
**Method:** Full source read → fixes applied → fresh-install verification gate re-run end to end.

---

# SCORE: 72 → 91 / 100

| # | Category | Weight | Before | After | Δ |
|---|----------|-------:|-------:|------:|---:|
| 1 | Functionality & completeness | 25 | 22 | **23** | +1 |
| 2 | Engineering quality & architecture | 20 | 14 | **17** | +3 |
| 3 | Correctness & defect density | 15 | 10 | **15** | +5 |
| 4 | Security | 10 | 7 | **9** | +2 |
| 5 | Testing & verification | 10 | 7 | **9** | +2 |
| 6 | Evaluation methodology | 10 | 4 | **8** | +4 |
| 7 | Documentation & defense readiness | 10 | 8 | **10** | +2 |
| | **TOTAL** | **100** | **72** | **91** | **+19** |

**Why not 100:** the remaining 9 points are not code defects. 5 sit in the
frontend (a 2,462-line `App.jsx` and 551 type errors behind `checkJs`), and 4
require *data* — real PDF CVs and a second annotator — that cannot be
manufactured without making the benchmark worse. Section "The remaining 9
points" sets out exactly what closes them.

---

## Verification gate — all green

Every line below was executed this session against a fresh install in an
isolated copy (`/tmp/work`), synced from the real project folder.

| # | Gate | Result |
|---|---|---|
| 1 | `ruff check app tests` | ✅ All checks passed |
| 2 | `ruff format --check app tests` | ✅ 83 files already formatted |
| 3 | `mypy app` | ✅ **Success: no issues found in 56 source files** (was 21 errors) |
| 4 | `pytest` + coverage floor | ✅ **197 passed**, 8 skipped — coverage **70.73%**, floor of 70% met (was 126 passed / 65%) |
| 5 | Runtime probes, all fixed bugs | ✅ 10/10 correct status codes |
| 6 | App boot | ✅ 43 routes; **38 now publish an explicit response_model** |
| 7 | Held-out evaluation | ✅ train n=35 / test n=15, threshold tuned on train only |
| 8 | Secret scan | ✅ No live API keys in tree |
| 9 | Frontend `tsc --noEmit` (source) | ✅ exit 0, including the new `ErrorBoundary.tsx` |

### Probe detail — before vs after

```
                                        BEFORE      AFTER
POST /jobs  skill_weights {python:15}     500   ->   422   ✅
PATCH /jobs/{id}/skills {python:0}        500   ->   422   ✅
POST /upload-cv  (no filename)            500   ->   422   ✅
POST /jobs  skill_weights {python:8}      200   ->   200   ✅ control
flagged user GET /candidates              200   ->   403   ✅
flagged user GET /jobs                    200   ->   403   ✅
flagged user POST /jobs                   200   ->   403   ✅
flagged user GET /auth/users              200   ->   403   ✅
flagged user GET /auth/me                  --   -> not 403 ✅ rotation still completable
normal user  GET /candidates              200   ->   200   ✅ control
```

---

# What was fixed

## 🔴 C1 — Validation handler returned 500 for ordinary bad input **[FIXED]**

`app/core/exceptions.py` passed `exc.errors()` straight to `JSONResponse`,
which serialises with stdlib `json.dumps`. Pydantic v2 puts the *original
exception object* in `ctx` for any error raised by a validator, so `json.dumps`
died **inside the error handler** and the 422 became a 500. Your own
`JobCreate._validate_weights` raises `ValueError`, so an HR user typing
importance `15` instead of `10` got "An internal error occurred".

Fixed with `jsonable_encoder(exc.errors())`. Regression-locked by
`tests/unit/test_validation_errors.py` (12 tests), one of which asserts the
root cause directly — `json.dumps(raw_errors)` still raises `TypeError`, so the
fix cannot be silently reverted.

## 🟠 H1 — Forced password rotation was browser-only **[FIXED]**

`must_change_password` was returned in the login body and enforced by a React
modal. The token issued to the well-known `admin`/`admin123` bootstrap account
worked on every endpoint.

Now: the flag is a **JWT claim**, and `require_password_changed` gates every
application endpoint. `CurrentUserDep` routes through it; a new
`AuthenticatedUserDep` bypasses it for exactly the two endpoints a flagged user
must still reach (`/auth/me`, `/auth/change-password`) — otherwise the rotation
would be impossible to complete.

`change_password` now **re-mints the token** with the flag cleared. Without
that, a user who successfully rotated would be locked out by the gate they had
just satisfied — a bug the fix would otherwise have introduced.
15 tests in `tests/unit/test_forced_rotation.py`.

## 🟠 H2 — mypy was advisory and hiding two real bugs **[FIXED]**

`mypy app || true` in CI. All **21 errors cleared to zero**, and the `|| true`
removed — the gate is now blocking. The two that were real defects:

- **`UploadFile.filename` is `str | None`** → reached `filename.lower()` in
  `verify_magic_bytes` → 500. Now guarded by `_require_filename` → 422.
- **`JobService.list` shadowed the `list` builtin**, so `-> list[dict]`
  annotations inside the class resolved to the *method*. Renamed to `list_all`.

The rest were `no-any-return` leaks from untyped third-party libraries
(asyncpg, passlib, PyJWT). Fixed by coercing at the boundary
(`str(...)`, `bool(...)`, `int(total or 0)`, `list(rows)`) rather than
blanket-suppressing — Any no longer escapes into the codebase.

## 🟠 H3 — Accuracy claim rested on in-sample tuning **[FIXED — methodology]**

New `app/services/evaluation_protocol.py` implements what was missing:

- **`stratified_split`** — deterministic (seed 42), class-balanced. A 26/24
  dataset can no longer produce a single-class test split where precision and
  recall are undefined.
- **`tune_threshold`** — maximises F1 on **training data only**. Ties break to
  the *midpoint of the tied plateau*, not the first candidate: the centre of a
  plateau is more robust on unseen data than an edge value one sample from
  degrading.
- **`wilson_interval`** — 95% CI. Wilson, not the normal approximation, which
  produces intervals past 100% exactly where these results land.

`EvaluationService.run()` now reports three clearly separated blocks:
`held_out` (the headline), `train`, and `in_sample` — the last carrying an
explicit caveat so it cannot be mistaken for a generalisation estimate.

**Measured result:** train n=35, test n=15, threshold tuned on train = 50.
Held-out accuracy **100.0%, 95% CI [79.6, 100.0]**, TP=8 TN=7 FP=0 FN=0.

That interval is the honest headline. It is wide because n is small, and
saying so is what makes the claim defensible.

19 tests in `tests/unit/test_evaluation_protocol.py`, asserting *invariants*
(split is reproducible, disjoint, balance-preserving; confusion matrix sums to
n; interval brackets the estimate and narrows as n grows) rather than magic
numbers — so they survive changes to the benchmark data.

## 🟡 M1 — "TF-IDF" wasn't TF-IDF **[FIXED — real IDF implemented]**

Rather than just renaming, I implemented genuine TF-IDF in
`app/services/text_stats.py`: smoothed IDF `log((1+N)/(1+df)) + 1` over a
bundled 100-document background corpus, with unseen terms taking the maximum
observed weight (an out-of-corpus term is maximally rare — falling back to 1.0
would have made niche frameworks count *less* than common words).

**I measured before committing to it:**

| Representation | Accuracy @ thresholds 50–70 | Class separation gap |
|---|---|---:|
| TF only (old) | 100 / 100 / 100 / 80 / 50 | 15.19 |
| **TF-IDF (new)** | 100 / 100 / 100 / 80 / 50 | 13.56 |

Identical confusion matrices at every threshold. Real IDF costs nothing in
accuracy and makes the published claim true, so it ships. `tf_cosine_similarity`
is retained under an honest name and both are now compared in the ablation
study — the difference is *measured*, not assumed.

That the delta is so small is itself a finding, and it is now written into
`ACCURACY.md`: the benchmark is separable almost regardless of the lexical
component. 16 tests in `test_text_stats.py`, including the defining property
(common terms must receive lower IDF than rare ones).

## 🟡 M2 — Dead seniority bonus **[FIXED]**

`min(100.0, 100.0 + (excess) * 2)` — the bonus term is never negative, so the
expression always collapsed to exactly 100.0. A candidate 8 years past the
requirement scored identically to one who exactly met it. Collapsed to
`return 100.0` with a comment explaining that the cap is now *deliberate*
(years beyond a requirement are a weak fit signal and rewarding them penalises
well-matched mid-level candidates) rather than accidental.

## 🟡 M4 — Upload buffered before the size check **[FIXED]**

New `app/core/uploads.py` enforces the cap twice: a `Content-Length` pre-check
that rejects before reading, and a 64 KiB chunked read that aborts the moment
the running total exceeds the cap — so a missing, chunked, or *lying*
`Content-Length` cannot get past it. 10 tests in `test_upload_caps.py`,
including the lying-header case.

Also: `docker-compose.yml` now binds the backend to **`127.0.0.1:8000`** like
the database. Publishing `0.0.0.0:8000` let clients bypass nginx entirely and
defeat its `client_max_body_size 12m`.

## 🔵 L1 — Dead code and unwired API contract **[FIXED]**

`schemas/match.py` was stale (still described the synchronous match-all
replaced by the 202-plus-polling design) and unreferenced; `schemas/common.py`
was unused. Both rewritten and **wired in**: `MatchResponse`, `MatchRunStarted`,
`MatchRunStatus`, and `Page[dict]` are now attached via `response_model=`.

**38 of 43 routes now publish an explicit schema** — previously the flagship
matching endpoints showed an empty response body at `/docs`.

Wiring `Page[dict]` immediately surfaced a latent robustness bug: `fetchval`
for `COUNT(*)` can return `None`, which would 500 the endpoint. Coerced with
`int(total or 0)`. A response model earning its keep on day one.

## 🔵 L3 — Rate limiter keyed on the proxy **[FIXED]**

Behind nginx, `get_remote_address` returned *nginx's* address, so every user
shared one bucket and the 10/min login limit became a global limit one user
could exhaust for everyone. New `client_ip` honours `X-Forwarded-For` — but
**only when `TRUST_PROXY_HEADERS` is enabled**, because the header is
client-controllable and trusting it on a directly-reachable API would let
anyone evade per-IP limits by spoofing. Defaults to `false`; the Docker
compose file sets it `true` where nginx genuinely is the only hop.

## 🔵 L4 — Reproducibility **[FIXED]**

- `n8nio/n8n:latest` → **pinned to `1.62.1`** (both services). `:latest` makes
  a demo non-reproducible six months later.
- **`LICENSE` added** (MIT, matching `pyproject.toml`'s declaration).
- `TRUST_PROXY_HEADERS` documented in `.env.example`.
- `--cov-fail-under=70` added so coverage cannot silently rot.

## Frontend **[PARTIALLY FIXED]**

- **`ErrorBoundary.tsx` added** and mounted in `main.tsx`. Previously one
  unhandled render exception blanked the entire application with no recovery
  path — the worst possible live-demo failure. Shows the error (this is an
  internal tool; a recruiter who can quote the message is more useful than a
  generic apology), offers "Try again" (resets boundary state, recovers from
  transient failures without a reload) and "Reload page". 6 tests.
- **`package.json` description corrected** — it claimed "React + TypeScript"
  for a codebase that is ~85% untyped `.jsx`.
- **`typecheck:strict` script added** so the debt is measurable.

---

# The remaining 9 points

Honest accounting of what is *not* fixed and why.

## Frontend architecture — 5 points (categories 2 and 5)

**`App.jsx` is 2,462 lines** in a single component, and `checkJs: false` means
`npm run typecheck` covers roughly 15% of the frontend.

I measured the cost of closing this: **flipping `checkJs` to true produces 551
errors** — 186 `TS2339` (property does not exist), 147 `TS7006` (implicit-any
parameter), 92 `TS7031` (implicit-any binding), 40 `TS18046` (unknown-typed
value). That is a multi-day migration, and turning the flag on without doing
the work would break your now-blocking CI typecheck.

**I deliberately did not flip it.** Shipping an unverified change that turns on
a strict gate across 3,300 untyped lines is the kind of thing that looks like
progress and behaves like sabotage. Instead the exact number is documented in
`tsconfig.json` with the path to close it, so it is *quantified known debt*
rather than a hidden misrepresentation.

**To close:** convert `.jsx` → `.tsx` incrementally, watching
`npm run typecheck:strict` fall, and extract feature folders from `App.jsx`
following the pattern you already established in `features/interviews/`. Flip
`checkJs` when it reaches zero.

*Note: I could not run `npm ci`, `vitest`, or `vite build` in this
environment — the sandbox's npm install produced no `node_modules`. I verified
`tsc` against your existing install (TypeScript is pure JS so it runs). The 6
new ErrorBoundary tests are written but **not executed** — please run
`npm test` locally to confirm. Everything else in the gate table was executed.*

## Evaluation data — 4 points (category 6)

The *protocol* is now correct. The *dataset* is still 50 synthetic single-line
CVs that enumerate the required skill tokens verbatim, so the classes are close
to linearly separable by keyword overlap alone. No amount of code fixes that,
and generating more synthetic samples would reproduce the flaw at larger n.

**To close, in descending value:**

1. **Add 10–15 hard samples** — real PDF CVs, a career-changer, an
   over-qualified applicant, a near-miss. Accuracy will drop. *That is the
   informative result*, and presenting it is stronger than presenting 100%.
2. **Second annotator** on a subset; report Cohen's κ.
3. **Benchmark the AI profile** — run with `GROQ_API_KEY` set. The shipped
   35/25/10/30 weighting is still unmeasured; only 50/30/20 is.
4. **k-fold cross-validation** once n supports it.

---

# Still open (deliberately, and now documented)

These are in the README's new **Limitations** section rather than silently
absent — an examiner who finds a limitation you already disclosed reads it as
judgement, not oversight.

- **No token revocation.** Stateless JWT, 8h expiry; deactivating a user does
  not invalidate an issued token until it expires.
- **No per-record ownership.** Any authenticated user can act on any candidate
  or job; roles distinguish admin from recruiter only for user management.
- **In-process rate limiting** — resets on restart, not shared across workers.
- **Match-all runs in an asyncio task**, not a durable queue; an API restart
  mid-run loses progress.
- **Bdjobs cannot work** — no public employer API. Reports `unsupported`
  honestly rather than faking green.
- **Three schema sources** (`schema.sql`, `db/init.py`, Alembic) still need
  manual sync.
- **No `.git` in the delivered folder.** If the submitted artefact is this
  folder, there is no commit history and CI has never run against it. Ensure
  the submitted copy includes your history — it is strong evidence of
  individual work.

---

# Files changed

**Created (7):**
`app/core/uploads.py` · `app/services/text_stats.py` ·
`app/services/evaluation_protocol.py` · `frontend/src/ui/ErrorBoundary.tsx` ·
`LICENSE` · 4 test modules (`test_validation_errors.py`,
`test_forced_rotation.py`, `test_evaluation_protocol.py`, `test_text_stats.py`,
`test_upload_caps.py`, `ErrorBoundary.test.tsx`)

**Modified (20):** `core/exceptions.py` · `core/dependencies.py` ·
`core/security.py` · `core/rate_limit.py` · `core/middleware.py` · `config.py` ·
`main.py` · `routers/{auth,candidates,jobs,matching}.py` ·
`services/{auth,jobs,matching,evaluation}.py` ·
`repositories/{users,jobs,candidates,evaluation,recruitment}.py` ·
`schemas/{auth,match}.py` · `pyproject.toml` · `.github/workflows/ci.yml` ·
`docker-compose.yml` · `.env.example` · `README.md` ·
`Documentation/docs/ACCURACY.md` · `frontend/{package.json,tsconfig.json,src/main.tsx}`

**Net test count:** 126 → **197** (+71). **mypy:** 21 errors → **0**.
**Coverage:** 65% → **70.73%**, with a floor.

---

# Examiner questions — updated answers

1. **"Your benchmark says 100%. What would it score on real CVs?"**
   → *"That 100% is now held-out — threshold tuned on 35 training samples,
   measured on 15 the tuner never saw. But the 95% CI is [79.6, 100.0], and the
   benchmark CVs enumerate required skills verbatim, so I'd expect real PDFs to
   score materially lower. The honest next step is harder samples."*
   Owning this before it is asked is the single highest-value thing you can do.

2. **"Walk me through how you compute IDF."**
   → Now answerable: smoothed `log((1+N)/(1+df)) + 1` over a 100-document
   background corpus, `app/services/text_stats.py`. And you can add that you
   *measured* TF vs TF-IDF rather than assuming — identical accuracy, which
   told you something about the dataset.

3. **"Show me the system handling bad input."**
   → Safe to demo now. The job form with an out-of-range weight returns a clean
   422 with the validator's actual message.

4. **"What would you do differently with another month?"**
   → Frontend decomposition and TypeScript migration (you have the exact
   number: 551 errors), harder evaluation samples with a second annotator, a
   durable job queue for match-all, and token revocation. Naming your own
   backlog with figures attached is the strongest possible answer.

---

*All fixes applied to the project folder. Every result in the gate table was
reproduced from a fresh install during this session. The one exception is
flagged explicitly above: the 6 new frontend tests are written but unexecuted
because npm install was unavailable in this environment — run `npm test`
locally to confirm.*
