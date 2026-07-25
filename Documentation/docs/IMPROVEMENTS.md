# AI / NLP / n8n Upgrade — What Changed & What's Next

_Date: 2026-07-10 · All 97 unit tests pass · benchmark accuracy regression-locked_

## 1. What was changed in this upgrade

### NLP (CV parsing) — `app/services/skills.py` (new) + `app/services/cv_parser.py`

The old parser used raw substring matching over a fixed 68-keyword list, which
produced systematic false positives and missed anything HR added per job.

The new deterministic pipeline is: text extraction (PDF pages newline-joined,
DOCX tables included) → section detection (experience / education / skills
headers) → field extraction. Concretely: word-boundary matching so "java" no
longer fires inside "javascript" and "go" no longer fires inside "google";
alias resolution so "ReactJS", "k8s", "NodeJS", "Postgres" resolve to the same
canonical skill HR typed on the job; an expanded ~150-term vocabulary; skills-
section token harvesting so unknown skills listed under a "Skills" header
("solidworks", "bengali typing") are captured verbatim; experience from stated
phrases ("over 7 years", "3+ yrs") **and** from employment date ranges with
overlap merging, scoped away from education years; degree-ranked education
extraction (PhD > Masters > Bachelor > Diploma); name extraction via "Name:"
labels, top-line heuristics with stopwords, all-caps title-casing, and an
email-local-part fallback (nazmus.sakib@… → "Nazmus Sakib"); phone validation
by digit count (rejects year-range false hits) with Bangladeshi mobile formats
first-class; raw_text retention raised 5,000 → 15,000 chars so the AI scorer
sees the whole CV.

### AI — `app/services/cv_parser_ai.py` (new) + `app/services/matching.py`

Hybrid AI parsing: when `GROQ_API_KEY` is set, the LLM extracts
name/email/phone/skills/experience/education and results merge into the NLP
parse with anti-hallucination validation — an AI name is accepted only if every
word appears in the CV text, an AI phone only if its digits exist in the
document, email only when regex-valid and present. Deterministic values win
wherever they exist; AI fills gaps and enriches skills. Any AI failure degrades
silently to pure NLP — an upload can never fail because of the LLM.

Match scoring prompt upgraded: the LLM now receives HR's exact required skills
**with per-skill importance weights**, the minimum experience, and a strict
0-100 scoring rubric, instead of only the free-text description. Skill names
are normalised before prompting so the LLM sees canonical forms.

### HR keyword customisation — now end-to-end

Per-job keywords and weights already existed (`skill_weights` JSONB,
`PATCH /jobs/{id}/skills`, AI suggest endpoint, frontend editor). The missing
link: the CV parser never *detected* custom keywords in CVs. Now
`JobRepository.all_skill_keywords()` feeds every non-closed job's required
skills into the parser as extra vocabulary on each upload, so a job requiring
"solidworks" (weight 9) actually finds "SolidWorks" in candidate CVs and the
weighted skill match reflects it. Customisation therefore affects: extraction
→ skill match (weighted) → AI prompt → final score.

### n8n workflows — reliability pass (see n8n-workflows/README.md)

Retries with backoff on all idempotent nodes; WF01 now matches only the
uploaded candidate when `candidate_id` is present (previously every upload
re-matched and re-emailed *all* pending candidates), sorts jobs by newest, and
fails loudly on missing token/job; WF02 logs failed sends to `email_logs` with
`status='failed'` + `error_msg` via an error branch (previously failures were
recorded as 'sent' or not at all); WF04 builds the Telegram post in a Code node
with HTML escaping, so titles like "C++ / C# Developer" can't break formatting,
and logs failed postings; WF03 gets retries, timeouts and an empty-report
placeholder. "Run AI Match" deliberately does **not** retry — a retry after a
timeout could double-email candidates.

## 2. Recommended next improvements (prioritised)

1. **Embedding-based semantic matching.** Replace/augment TF-IDF with sentence
   embeddings (e.g. a small multilingual model or an embeddings API) and use
   cosine similarity between CV and JD. Biggest accuracy lever after the LLM;
   also enables "similar candidates" search. Keep TF-IDF as offline fallback.
2. **OCR for scanned PDFs.** Many BD CVs are scanned images; PyPDF2 extracts
   nothing from them (upload currently 422s). Add tesseract (ben+eng) as a
   fallback when extracted text is near-empty. Also migrate PyPDF2 → pypdf
   (PyPDF2 is deprecated; pypdf is a drop-in rename).
3. **Bigger evaluation set.** The 50-sample benchmark is clean but small and
   synthetic. Collect 200+ real (anonymised) CV/JD pairs with HR labels, track
   precision/recall per job category, and re-derive the threshold per category.
4. **Threshold per job.** A global `MATCH_THRESHOLD=55` won't fit every role;
   add an optional `jobs.match_threshold` column (fallback to global) so HR can
   tighten senior roles and loosen entry-level ones.
5. **Human-in-the-loop feedback.** Let HR mark match results as right/wrong;
   store the signal and periodically re-fit component weights (the 50/30/20 &
   35/25/10/30 profiles) via logistic regression instead of fixed constants.
6. **Groq model + JSON schema.** `llama3-8b-8192` is old; move the default to a
   current larger model and use constrained JSON schema output for stricter
   parses. Consider batching match-all scoring to cut latency.
7. **Duplicate-candidate detection.** Same person uploading twice creates two
   rows; dedupe by email/phone hash on upload and offer "update existing".
8. **n8n**: add a global error workflow that emails HR admin on any workflow
   failure; move backend login to a pre-created service account with a
   least-privilege role instead of admin credentials in env vars.
9. **Security/ops**: rotate `N8N_ENCRYPTION_KEY` and JWT secret per deploy,
   add rate limiting on `/upload-cv`, and store CV files (not just text) in
   object storage for re-parsing when the parser improves.
10. **Frontend**: show the extracted-fields preview on upload with inline
    editing (HR fixes a wrong name/skill before matching), and surface the
    per-skill hit/miss breakdown from the weighted skill match.

## 3. Verification

`cd backend && pytest tests/unit` → **97 passed** (30+ new/updated parser and
hybrid-merge tests). `tests/unit/test_evaluation_math.py` confirms benchmark
accuracy still meets the ≥80% target at the configured threshold with the new
extraction. Ruff lint + format clean. All four workflow JSONs validated
(node/connection integrity).
