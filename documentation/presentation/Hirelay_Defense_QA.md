# Hirelay — Complete Defense Q&A (A to Z)

**Nazmus Sakib · ID 11220320888 · Section 8B · CSE 4100 — Field Work (Appstick, Khulna)**

> Honest, project-accurate answers. Numbers here match the real code. Keep answers
> short out loud; the extra detail is so you can go deeper if a teacher pushes.

---

## A. Project, Motivation & Scope

**1. What is Hirelay in one line?**
An automated recruitment system that takes a company from a flood of CVs to the right hire — parsing, AI matching, interview scheduling, multi-platform posting, and honest evaluation, in one containerised pipeline.

**2. Why this project? What real problem does it solve?**
In Bangladesh a single opening can draw tens of thousands of applications. The pain isn't only unemployment — it's the HR side: opening and re-typing thousands of CVs, weeks of manual screening, human bias, and endless emails to schedule one interview. Hirelay automates that repetitive pipeline while keeping the human in control of final decisions.

**3. Who are the users?**
HR/recruiters (authenticated dashboard) and job candidates (a public apply page — no login needed).

**4. What's the core contribution / what's novel?**
Not a single feature but an end-to-end, transparent pipeline: every AI decision shows its reasoning and score breakdown, and accuracy is reported from a held-out evaluation split — not claimed. It's also designed as the first agent of a larger multi-agent platform.

**5. Is it production-ready?**
It's a working, containerised prototype with real integrations, tests, and CI. It's honest about what's real (Telegram, SMTP, webhook, Jitsi) and what needs credentials or isn't possible (LinkedIn/X need API keys; Bdjobs has no public employer API).

---

## B. Architecture & Design

**6. Describe the overall architecture.**
A classic layered, service-oriented design. Frontend (React SPA) → nginx reverse proxy → FastAPI backend → PostgreSQL. The backend is split into **routers → services → repositories**: routers handle HTTP, services hold business logic, repositories own all SQL. n8n runs alongside for workflow automation; external APIs (Groq, Telegram, SMTP, Jitsi) are called from an integrations layer.

**7. Why the routers/services/repositories separation?**
Separation of concerns and testability. SQL is isolated in repositories, so business logic in services can be unit-tested with fake repositories, and routers stay thin. It also means I can change the database layer without touching business rules.

**8. Why a Single-Page Application instead of server-rendered pages?**
The dashboard is highly interactive — live filtering, bulk actions, modals, polling for background match runs. An SPA gives a smooth app-like experience, and the API is cleanly reusable (the same endpoints serve the public apply page).

**9. How do frontend and backend communicate?**
REST over JSON. In production the SPA calls `/api/...`, which nginx proxies to FastAPI (stripping the prefix), so the app works from any host, not just the machine running the API.

---

## C. Why Docker? (DevOps)

**10. Why did you use Docker?**
Three reasons. **Reproducibility** — the system has many moving parts (FastAPI, PostgreSQL, n8n, nginx); Docker Compose brings them all up with one command and identical versions on any machine, so "works on my machine" disappears. **Isolation** — each service runs in its own container with its own dependencies. **Easy evaluation** — my teacher can clone and run `docker compose up` without installing Python, Node, or Postgres manually.

**11. What does docker-compose orchestrate?**
The backend (FastAPI), the database (PostgreSQL), the frontend (built and served via nginx), and n8n for automation — plus named volumes so database and n8n data persist across restarts.

**12. Docker vs a virtual machine?**
Containers share the host kernel, so they're far lighter and faster to start than VMs, and images are smaller. For orchestrating several app services on one host, containers are the right granularity.

**13. How does n8n get its workflow automatically?**
On startup an import script (`n8n-workflows/scripts/import.sh`) loads the workflow JSON, and a render step injects credentials from environment variables — so automation is set up without manual clicking in the n8n UI.

**14. What happens to data when a container restarts?**
PostgreSQL and n8n use Docker named volumes, so their data survives restarts. Application containers are stateless.

---

## D. Tech-Stack Justifications ("Why X?")

**15. Why FastAPI (and not Flask/Django)?**
It's async-native, which matters because the app makes many I/O-bound external calls (Groq, SMTP, Telegram, DB). It gives automatic request validation and interactive OpenAPI docs via Pydantic, and it's lightweight and fast. Django would be heavier than needed; Flask lacks first-class async and validation.

**16. Why PostgreSQL?**
It's a mature relational database with strong constraints, JSONB (I use it for per-skill weights), array columns (required_skills), and reliable foreign-key cascade behaviour — which I rely on so deleting a job cleanly nulls/cascades related rows. It's free and production-grade.

**17. Why asyncpg?**
It's the fastest async PostgreSQL driver for Python and pairs naturally with FastAPI's event loop, so DB calls don't block other requests.

**18. Why React + Vite + TypeScript?**
React for a component-based interactive UI; Vite for fast builds and dev server; TypeScript (as a typed data-contract layer) to catch shape mismatches between frontend and backend at compile time.

**19. Why n8n for automation?**
It's an open-source workflow tool that visually chains steps (on upload → parse → score → notify) without hard-coding orchestration, and it's easy to extend or show visually — good for demonstrating the automated pipeline.

**20. Why Groq for the LLM?**
Groq offers very low-latency LLM inference with an OpenAI-compatible API, and a free tier — practical for a student project. Crucially, the LLM is *optional*: if it's unavailable, the system falls back to a validated non-AI formula.

**21. Why Jitsi for meeting links?**
Jitsi Meet needs no API key — the room is created the moment the first person opens the URL, and I add a random UUID so the room is unguessable. So every emailed interview link actually works, with zero credential setup.

**22. Why JWT for auth?**
Stateless authentication — the server doesn't store sessions; the signed token carries identity and role. It scales well and fits a REST API cleanly.

---

## E. The AI Matching Engine (core — expect deep questions)

**23. How does the matching actually score a candidate?**
It combines four signals into a 0–100 score. **Without the LLM:** skill 50%, experience 30%, text-similarity 20%. **With the LLM:** skill 35%, experience 25%, text-similarity 10%, LLM 30%. Above the job's threshold → shortlisted, below → rejected, with HR able to override.

**24. How is the skill score computed?**
Synonym-aware overlap between candidate skills and required skills, after normalising each token. It supports **per-skill weights (1–10)** set by HR — the score is the matched weight-mass over the total weight-mass, so "critical" skills count more than "nice-to-have" ones.

**25. How is the experience score computed?**
Ratio of candidate years to required years, capped at 100. Meeting the requirement scores full marks; I deliberately don't reward "years beyond requirement" because it's a weak signal and would penalise well-matched mid-level candidates.

**26. Is your "TF-IDF" really TF-IDF?**
Yes — and I fixed this honestly. An earlier version computed cosine over raw term-frequency vectors while calling it TF-IDF. It now weights terms by smoothed inverse document frequency over a bundled 100-document background corpus. I documented the measured impact in ACCURACY.md.

**27. What does the LLM (Groq) actually do?**
It reads the CV text and the job, and returns a JSON score plus strengths and gaps. I call it in JSON mode at low temperature (0.1) for consistency, with timeouts and retries. If it fails or is disabled, `has_ai` is false and the non-AI formula is used — the AI never crashes a request.

**28. Where does the threshold (55) come from? Isn't it arbitrary?**
It's data-driven: on the 50-sample benchmark, shortlisted scores fell in ~62–92 and rejected in ~0–47, a clean gap around 47–62, so 55 sits in the middle. And it's now **overridable per job**, so HR can set a stricter bar for senior roles.

**29. What stops the AI from making a wrong hire?**
Nothing auto-hires. The engine *shortlists*; HR reviews the reasoning, confidence, and breakdown, and can override any decision. It's decision-support, not decision-replacement.

---

## F. Evaluation & Metrics (your credibility)

**30. How do you know the matching is accurate?**
A dedicated evaluation suite runs the engine against a labelled dataset using a **held-out split** — tested on data it didn't "see" for tuning. It reports Accuracy, Precision, Recall, F1, and a confusion matrix.

**31. Why held-out / why not test on all data?**
Testing on the same data you tuned on inflates the score. A held-out split gives an honest estimate of how it generalises.

**32. What's the ablation study?**
I run several configurations (e.g., skill-only, +experience, +TF-IDF, +LLM) to show how much each component contributes to accuracy — so the design choices are evidence-based, not guessed.

**33. What is Cohen's kappa and why include it?**
It measures agreement between the model and the human labels *corrected for chance agreement*. Plain accuracy can look good by luck on imbalanced data; kappa is a more honest agreement measure.

**34. Precision vs Recall — which matters more here?**
Depends on cost. High recall means fewer good candidates missed; high precision means fewer weak candidates shortlisted. For hiring, missing a strong candidate is often costlier, so recall is important — but I report both plus F1.

---

## G. Database Design

**35. Walk through the main tables.**
`users`, `jobs`, `candidates`, `match_results`, `interviews`, `notifications`, `password_reset_tokens`, `email_logs`, `job_postings`, `evaluation_dataset`/`evaluation_results`, and `app_settings` (editable default templates). Jobs hold `required_skills` (array), `skill_weights` (JSONB), and an optional per-job `match_threshold`.

**36. How do you handle deleting a job with linked candidates?**
Every foreign key into `jobs` declares an ON DELETE action — candidate references SET NULL, postings/results CASCADE — so a single DELETE cleans up safely without orphan rows.

**37. Why JSONB for skill weights instead of a table?**
The weights are a small, per-job key-value map read together with the job. JSONB keeps it in one row without a join, which is simpler and fast enough here.

**38. Do you use migrations?**
Schema is bootstrapped idempotently on startup (`CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`), so it cold-starts on an empty DB and safely upgrades an existing one. Alembic migrations layer on top for versioned changes.

---

## H. Backend Code

**39. How is CV parsing done?**
PDFs/DOCX are read, text extracted, then fields (name, email, phone, skills, experience, education) are pulled with rule-based extraction plus the job's custom skill keywords as extra vocabulary. A **parse-confidence score** flags low-confidence extractions for human review.

**40. How do background match-all runs work?**
`match-all` starts a background task that scores every *pending* candidate against a job and writes progress to a `match_runs` row; the frontend polls `GET /match-runs/{id}` for status. This keeps the request fast and non-blocking.

**41. Which candidates does "Run AI Match" apply to?**
Only candidates with status `pending` (`WHERE status='pending'`). Already shortlisted/rejected candidates are skipped.

**42. How do emails get sent without blocking?**
SMTP is blocking, so the send runs in a thread-pool executor off the async event loop. Failures are logged and reported, never fatal.

**43. What's the settings/templates feature?**
Global default templates (interview email, rejection email, job announcement) live in `app_settings` and an in-process cache. Precedence at render time: per-job custom → saved global default → built-in canonical default. HR edits them from the Settings tab.

---

## I. Frontend Code

**44. How is the frontend structured?**
It was decomposed from a 3,000-line file into feature modules (`features/upload`, `matching`, `candidates`, `jobs`, `settings`, …), shared UI primitives, an auth context, and a generic typed `api<T>()` fetch wrapper. `App.jsx` is now a ~350-line shell (providers + sidebar + tab routing).

**45. Why TypeScript only as a "data-contract" layer, not full conversion?**
The high-value bug class is frontend/backend shape mismatch. Typing the domain models (`types.ts`) and the API layer catches that at compile time, without the cost of converting thousands of lines of JSX — a pragmatic middle path.

**46. How does the active tab survive a reload?**
It's synced to the URL hash (e.g. `#candidates`), so refreshing restores the same tab instead of resetting to CV Upload.

---

## J. Security

**47. How is authentication handled?**
JWT tokens; passwords are hashed with bcrypt (never stored in plaintext). There's role-based access control (admin vs regular), and a forced password change on the seeded default admin so a well-known credential never survives first login.

**48. What about brute-force / abuse?**
Rate limiting (slowapi) on sensitive endpoints, including the public apply route.

**49. How do you keep secrets out of GitHub?**
`.env` and all variants are git-ignored (only `.env.example` is committed); keys/certs are ignored too. No real credentials are in the repo, but anyone can clone, copy `.env.example`, and run.

**50. Is the public apply page a security risk?**
It's rate-limited and only exposes open jobs and an apply form. Submissions land as `pending` and are never auto-actioned without HR.

---

## K. Integrations (be honest here)

**51. Which integrations are actually real?**
Telegram posting, SMTP email, the custom webhook, and Jitsi meeting links are fully working. LinkedIn and X/Twitter post when their API credentials are configured. Bdjobs has **no public employer API**, so I report that honestly instead of faking a successful post — that honesty was a deliberate fix.

**52. What happens if an integration has no credentials?**
It's cleanly skipped and reported as "skipped — credentials not set," not failed. Nothing crashes.

---

## L. Testing & Quality

**53. Do you have tests?**
Yes — pytest unit tests (auth, CV parser, email, config, evaluation math, Cohen's kappa, candidate service) and integration tests against the API. CI runs them, plus type checking (mypy) and linting, as a blocking gate.

**54. How did you ensure code quality?**
Static typing (mypy clean), linting (ruff), a layered testable architecture, and honest documentation (ACCURACY.md records real measured numbers, including where a metric barely moved).

---

## M. Limitations & Honesty (they WILL ask)

**55. What are the weaknesses / limitations?**
The evaluation benchmark is small (50 samples) and its CVs list skill tokens verbatim, so it's fairly separable — I say so in ACCURACY.md. CV parsing is rule-based and can struggle with unusual layouts. LinkedIn/X need real API keys; Bdjobs isn't automatable. The multi-agent vision beyond HR is future work.

**56. If you had more time, what would you improve?**
A larger, more realistic labelled dataset; a stronger ML/embeddings-based parser and matcher; and building out the executive/finance/security agents plus Bangla-language enrichment.

**57. What was the hardest part?**
Making the AI honest and robust: the LLM fallback path, and rebuilding the evaluation with a real held-out split so the reported accuracy is trustworthy rather than inflated.

---

## N. Personal / Viva-style

**58. What did you personally build?**
The full stack — backend services, database design, the matching and evaluation engines, the React dashboard, the integrations, and the Docker deployment — during my field work at Appstick, Khulna.

**59. What did you learn?**
Async API design, containerised deployment, honest ML evaluation, and the discipline of separating layers so a large codebase stays testable and maintainable.

**60. Why is Hirelay different from an ordinary recruitment tool?**
It's transparent (every decision explainable), it's measured (held-out accuracy, not claims), and it's the first agent of a bigger Bangla-first platform where each department eventually runs on its own agent.

---

## O. Rapid-fire one-liners

- **Stateless or stateful auth?** Stateless (JWT).
- **Sync or async backend?** Async (FastAPI + asyncpg).
- **Where's the SQL?** Only in the repository layer.
- **Default match threshold?** 55, overridable per job.
- **AI down — what happens?** Falls back to the 50/30/20 non-AI formula.
- **How to run it?** `docker compose up` — one command.
- **Meeting links need an API key?** No — Jitsi rooms are keyless.
- **Passwords stored how?** bcrypt-hashed, never plaintext.
- **Which CVs does match-all touch?** Only `pending` ones.
- **Is accuracy claimed or tested?** Tested, on a held-out split.
