# Hirelay — Pre-Defense Speech Script

**Presenter:** Nazmus Sakib · ID 11220320888 · Section 8B
**Course:** CSE 4100 — Field Work / Industrial Training
**Organisation:** Appstick, Khulna
**Target time:** ~8 minutes · 13 slides

> Delivery notes are in *(italic parentheses)*. "**[CLICK]**" = advance the slide.
> You can deliver this in English, or naturally mix in Bangla — the wording below
> is written to be spoken, not read word-for-word.

---

## Slide 1 — The Job Reality *(≈45s)*

Assalamu Alaikum. Good morning, respected teachers.

*(pause, let the number on screen sit for a second)*

Look at this number. **Twenty thousand applications — for just forty government posts.** For fifty posts, it crosses a hundred thousand. And this is not once a year; it happens almost every week.

We usually read these headlines as a story about unemployment — too many candidates, too few jobs. That is true. But today I want to flip the picture and look at it from the *other* side of the table.

**[CLICK]**

## Slide 2 — Now Sit in the Recruiter's Chair *(≈40s)*

Because for every one of those openings, there is one HR officer who has to deal with that flood.

That means **thousands of CVs to open, read, and re-type — one by one.** It means **weeks of manual screening** under deadline pressure. Along the way, human bias and simple fatigue creep in, and good candidates quietly slip through. And once a shortlist is finally ready, scheduling even a single interview takes a dozen back-and-forth emails.

So the real problem I set out to solve is not unemployment itself — it is the **manual, repetitive, error-prone recruitment process** that sits behind it.

**[CLICK]**

## Slide 3 — Hirelay *(≈25s)*

That is what I built during my field work at Appstick, Khulna.

**Hirelay — an Automated Recruitment System.** One intelligent pipeline that takes a company from the application flood all the way to the right hire.

I am Nazmus Sakib, and over the next few minutes I will walk you through how it works and what makes it different.

**[CLICK]**

## Slide 4 — One Platform, The Entire Pipeline *(≈30s)*

Instead of a single feature, Hirelay covers the whole hiring journey. Around this hub are the six real bottlenecks a recruiter faces — intake, matching, candidate management, interviews, reach, and automation.

Let me take them one at a time, and for each one show you the actual working screen.

**[CLICK]**

## Slide 5 — Smart Intake & AI Parsing *(≈45s)*

The first bottleneck is **intake.** Normally a recruiter opens every CV and re-types the same fields — name, email, skills, years of experience.

In Hirelay, HR simply drops a PDF or a DOCX. A hybrid parser then extracts all of that automatically in a few seconds — and, importantly, it reports a **parse-confidence score**, so if a CV is messy and the extraction is uncertain, it is flagged for a human to review instead of silently trusting it.

*(gesture to the screenshot)* This is the live upload screen — you can see the candidate's details and detected skills pulled straight out of the file.

**[CLICK]**

## Slide 6 — AI Matching & Decisions *(≈60s — this is the core, slow down)*

The second bottleneck is the heart of the system: **matching.** Screening hundreds of CVs by hand is slow and subjective.

Hirelay scores every candidate against a job using a **transparent, weighted engine.** It combines four signals: skill match, experience, text similarity using TF-IDF, and an optional large-language-model score from Groq when it is available. If the AI call fails, it safely falls back to the validated non-AI formula — so the system never breaks.

Two things I want to stress here, honestly. First, **it is transparent** — every decision shows the reasoning and the score breakdown, so HR can see *why* a candidate was shortlisted, not just a black-box number. Second, the shortlist cut-off is **configurable per job** — a senior role can demand a stricter bar than a high-volume entry role.

Above the threshold, candidates are auto-shortlisted; below it, rejected — but HR always keeps the final say and can override any decision.

**[CLICK]**

## Slide 7 — Candidate Command Center *(≈40s)*

Once candidates are in the system, they should not scatter across spreadsheets. This is the **command center.**

Every applicant is searchable and filterable by status. HR can act in bulk — shortlist, reject, or email several candidates at once — and override any automated decision. Each candidate carries an AI summary and that parse-confidence score, so a recruiter gets instant insight without re-reading the whole CV.

**[CLICK]**

## Slide 8 — Interviews on Autopilot *(≈40s)*

Next: **interviews.** Setting one up normally means a dozen emails and a manual meeting link.

Hirelay checks for scheduling clashes, generates a real video-meeting link automatically, emails a templated invitation to the candidate, and then tracks interviewer feedback afterwards — all from a single click. What used to take half a day of coordination now takes seconds.

**[CLICK]**

## Slide 9 — Reach & Self-Service *(≈40s)*

A vacancy also has to *reach* people, and applications have to be collected from everywhere.

With one click, Hirelay posts a job to **LinkedIn, Telegram, X, and a custom webhook.** And there is a **public apply page** — a single shareable link where candidates browse every open position and apply with their CV. Their application drops straight into the pipeline and is auto-scored, but stays pending until HR confirms. Close or delete a job, and it disappears from that page automatically.

**[CLICK]**

## Slide 10 — Automation & Honest Insight *(≈50s — your credibility slide)*

Finally, the glue. All of these steps are tied together by an **n8n automation workflow** that runs on every upload, so the pipeline moves without manual hand-offs.

And this is the part I am most proud of, as an engineer. A recruiting tool can always *claim* its matching is accurate. So I built a **dedicated evaluation suite** with a labelled dataset and a **held-out split** — the model is tested on data it did not see. It reports real Accuracy, Precision, Recall, and F1, a confusion matrix, and an ablation study across configurations.

In other words, the accuracy you see is **measured honestly, not a marketing number.** If the engine were weak, this screen would show it — and that transparency is deliberate.

**[CLICK]**

## Slide 11 — Built on a Modern, Reproducible Stack *(≈35s)*

Very briefly, the stack. The backend is **FastAPI on Python**; the frontend is **React with Vite and TypeScript**; data lives in **PostgreSQL.** The AI layer uses a **Groq LLM plus a custom TF-IDF** engine. Automation runs on **n8n**, security is **JWT, bcrypt, and rate-limiting**, and integrations include **Telegram, SMTP email, and Jitsi** for meetings.

Everything is **containerised with Docker** — the whole system comes up with a single command, so it is fully reproducible.

**[CLICK]**

## Slide 12 — Not Just Recruitment: One Agent in a Bigger Vision *(≈45s)*

I will end with where this is going, because it answers the obvious question — *"isn't this just another recruitment tool?"*

Hirelay is really the **first working agent** in a larger platform I have started building: a single system where **every department runs on its own agent.** The **HR agent is live today.** Next come an **executive agent, a finance agent, and a security agent** — sharing one platform instead of scattered point tools.

Three things make it different: it is being built **Bangla-first**, so it speaks the local team's language; it is **one platform, not point tools**; and its AI is **transparent and measured**, not a black box.

**[CLICK]**

## Slide 13 — Thank You *(≈15s)*

That is Hirelay — from an application flood to the right hire, in one honest, automated pipeline.

Thank you for your time. I would be happy to take your questions.

---

## Anticipated Q&A — quick honest answers

- **"How accurate is the matching?"** — It is reported from a held-out evaluation split, not the training data; I can open the Evaluation tab and show the live Accuracy / Precision / Recall / F1 and the confusion matrix.
- **"What if the AI (Groq) is down?"** — The engine falls back to a validated non-AI weighted formula (skill + experience + TF-IDF), so scoring still works.
- **"Is the LinkedIn / Bdjobs posting real?"** — Telegram, SMTP email, and webhook are fully working; LinkedIn and X post when API credentials are configured; Bdjobs has no public employer API, so I report that honestly rather than faking success.
- **"Where does the threshold come from?"** — A data-driven default tuned on the benchmark, now overridable per job by HR.
- **"Is it secure?"** — JWT auth, bcrypt-hashed passwords, role-based access, and rate limiting; no credentials are committed to the repository.
