# I Built Hirelay — an Automated Recruitment System that turns a CV flood into the right hire

### How I automated the entire hiring pipeline — AI CV parsing, transparent matching, one-click interviews, and honestly-measured accuracy — during my industrial training.

*By Nazmus Sakib*

---

> 📸 **COVER IMAGE:** use `03_ai_match.png` (the AI Match dashboard) as the header image — it's the most "product-looking" screen.

In Bangladesh, a single government job opening can attract **twenty thousand applications**. For fifty posts, it crosses a hundred thousand. We usually read those headlines as a story about unemployment.

But during my field work at **Appstick, Khulna**, I got curious about the *other* side of that number — the one HR officer who has to actually process that flood. Thousands of CVs to open and re-type by hand. Weeks of manual screening. Bias and fatigue quietly letting good candidates slip through. And a dozen back-and-forth emails just to schedule one interview.

So I built **Hirelay** — an automated recruitment system that takes a company from the application flood all the way to the right hire, in one pipeline. This is the story of how it works, what I learned, and the engineering decisions behind it.

---

## The problem, stated as an engineer

Recruitment isn't one problem — it's six bottlenecks stacked on top of each other:

1. **Intake** — reading and digitising every CV
2. **Matching** — deciding who's actually a fit
3. **Candidate management** — keeping everyone in one searchable place
4. **Interviews** — scheduling without email ping-pong
5. **Reach** — posting the job everywhere and collecting applicants
6. **Automation & trust** — tying it together, and *proving* the AI is any good

Hirelay tackles all six. Let me walk through each with the real screens.

---

## 1. Smart intake: drop a CV, get structured data

The first win is the most boring one — and the most valuable. Instead of a recruiter re-typing name, email, skills and experience from every file, HR just drops a PDF or DOCX. A hybrid parser extracts everything in seconds and, importantly, reports a **parse-confidence score** — so a messy CV is flagged for a human instead of being silently trusted.

> 📸 **Screenshot:** `02_cv_upload.png`
> *Caption: Drop a PDF or DOCX — Hirelay extracts name, email, skills and experience automatically, with a confidence score.*

---

## 2. AI matching — but transparent, not a black box

This is the heart of the system. Screening hundreds of CVs by hand is slow and subjective, so Hirelay scores every candidate against a job using a **transparent, weighted engine** that combines four signals:

- **Skill match** (synonym-aware, with per-skill weights from 1–10)
- **Experience** (ratio to the requirement)
- **Text similarity** (real TF-IDF over a background corpus)
- **An optional LLM score** from Groq

When the LLM is available the weights are 35 / 25 / 10 / 30; when it isn't, the system *falls back* to a validated 50 / 30 / 20 formula. The AI never crashes a request — it's an enhancement, not a dependency.

Every decision shows its **reasoning and score breakdown**, and the shortlist cut-off is **configurable per job** — a senior role can demand a stricter bar than a high-volume entry role. Above the threshold, candidates are auto-shortlisted; below it, rejected — but HR always keeps the final say.

> 📸 **Screenshot:** `03_ai_match.png`
> *Caption: One click scores every pending candidate against a job; shortlisted candidates can be auto-emailed an invite.*

---

## 3. A command center for candidates

Applicants shouldn't live in scattered spreadsheets. Every candidate is searchable and filterable by status. HR can act in **bulk** — shortlist, reject, or email several people at once — and override any automated decision. Each candidate carries an AI summary and a parse-confidence score for instant context.

> 📸 **Screenshot:** `04_candidates_list.png`
> *Caption: Search, filter, and bulk-act on the whole pipeline from one screen.*

> 📸 **Screenshot:** `05_candidate_detail.png`
> *Caption: Each candidate carries an AI summary, detected skills, parse confidence, and private HR notes.*

---

## 4. Interviews on autopilot

Setting up a single interview usually means a dozen emails and a manual meeting link. Hirelay checks for scheduling clashes, generates a **real Jitsi video link** (no API key needed — the room is created when the first person opens it), emails a templated invite, and tracks interviewer feedback afterwards — all from one click.

> 📸 **Screenshot:** `08_interview_detail.png`
> *Caption: Auto-generated meeting link, templated invite, and post-interview feedback in one place.*

> 📸 **Screenshot:** `09_interview_calendar.png`
> *Caption: A calendar view of scheduled interviews to spot clashes at a glance.*

---

## 5. Reach and self-service

A vacancy has to reach people. With one click, Hirelay posts a job to **LinkedIn, Telegram, X, and a custom webhook**. And there's a **public apply page** — a single shareable link where candidates browse open jobs and apply with their CV. Their application lands in the pipeline, gets auto-scored, and waits as *pending* until HR confirms.

> 📸 **Screenshot:** `07_job_posting.png`
> *Caption: Broadcast a job to multiple platforms in one click, with a per-platform posting history.*

> 📸 **Screenshot:** `12_telegram_post.png`
> *Caption: A real job announcement auto-posted to Telegram.*

> 📸 **Screenshot:** `10_public_apply.png`
> *Caption: The public apply page — candidates self-apply straight into the pipeline, no login required.*

---

## 6. Automation, and the part I'm proudest of: honest evaluation

All of this is stitched together by an **n8n workflow** that runs on every upload, so the pipeline moves without manual hand-offs.

> 📸 **Screenshot:** `11_n8n_workflow.png`
> *Caption: The n8n automation workflow that ties the pipeline together.*

But here's the thing that matters most to me as an engineer: a recruiting tool can always *claim* its matching is accurate. So I built a **dedicated evaluation suite** with a labelled dataset and a **held-out split** — the model is tested on data it wasn't tuned on. It reports real Accuracy, Precision, Recall and F1, a confusion matrix, Cohen's kappa (agreement corrected for chance), and an **ablation study** showing how much each component contributes.

I even documented where a metric *barely moved* — because honest numbers beat impressive-looking ones.

> 📸 **Screenshot:** `06_evaluation_ablation.png`
> *Caption: Measured, not claimed — held-out accuracy, confusion matrix, and a 6-config ablation study.*

---

## The tech stack, and why

- **Backend — FastAPI (Python):** async-native, which matters for all the I/O-bound calls (LLM, SMTP, Telegram, DB), with automatic validation and OpenAPI docs.
- **Database — PostgreSQL + asyncpg:** relational integrity, JSONB for per-skill weights, array columns for skills, and reliable cascade deletes.
- **Frontend — React + Vite + TypeScript:** a fast, component-based dashboard with a typed data-contract layer to catch API shape mismatches at compile time.
- **AI — Groq LLM + custom TF-IDF:** low-latency, optional LLM with a safe non-AI fallback.
- **Automation — n8n.** **Meetings — Jitsi** (keyless). **Security — JWT + bcrypt + rate limiting.**
- **Everything runs in Docker Compose** — one command brings up the backend, database, n8n and frontend, so it's fully reproducible on any machine.

Why Docker specifically? With this many moving parts, "works on my machine" is a real risk. Compose pins versions and orchestrates every service, so anyone can clone the repo and run `docker compose up` — no manual setup.

---

## What I learned

- **Async API design** and clean layering (routers → services → repositories) so a large codebase stays testable — SQL lives only in the repository layer, so business logic can be unit-tested with fakes.
- **Containerised deployment** and workflow automation.
- Most of all: **how to evaluate an AI system honestly.** Rebuilding the evaluation with a proper held-out split — so the accuracy I report is trustworthy, not inflated — taught me more than any single feature.

I'm also honest about the limits: the benchmark is small, CV parsing is rule-based and can struggle with unusual layouts, LinkedIn/X need API keys, and Bdjobs has no public employer API (so I report that instead of faking success).

---

## What's next

Hirelay is really the **first agent** in a larger platform I've started building — a single system where every department runs on its own agent. The **HR agent is live today**; next come executive, finance, and security agents, all sharing one platform. And it's being built **Bangla-first**, so it speaks the local team's language.

From an application flood to the right hire — one transparent, automated, honestly-measured pipeline.

---

*Built during my industrial training at Appstick, Khulna (CSE 4100 — Field Work).*

**Code:** github.com/Nazmussakib247/hirelay
**Connect:** linkedin.com/in/nazmussakib247

*If you found this useful, a clap or a comment means a lot. I'd love to hear how your team handles recruitment at scale.*
