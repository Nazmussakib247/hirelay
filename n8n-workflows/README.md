# n8n Automation — Single Master Workflow

All automation lives in **one workflow**: `hr-master-workflow.json`.
It contains four independent entry points (triggers), so every automated
task in the system runs from a single importable file.

## Zero-setup import

Running `docker compose up` imports everything automatically — no manual
steps inside the n8n UI:

1. The one-shot `n8n-import` container renders SMTP / Telegram / Postgres
   credentials from your `.env` (`scripts/render-credentials.js`) and imports
   them with `n8n import:credentials`.
2. It then imports `hr-master-workflow.json` with `n8n import:workflow`.
3. The workflow has a fixed ID (`HrMasterWf000001`) and `"active": true`, so
   re-running `docker compose up` overwrites instead of duplicating, and all
   webhooks are live as soon as the n8n container starts.

If an older n8n volume exists (different encryption key), reset it once:

```bash
docker compose down
docker volume rm hr-recruiting_n8n_data
docker compose up -d
```

## The four branches inside the master workflow

| Branch | Trigger | What it does |
|--------|---------|--------------|
| A — CV Uploaded to Auto Match | `POST /webhook/cv-uploaded` (fired by the backend on every CV upload) | Logs in to the backend, picks the newest active job (or the `job_id` in the payload), and runs the AI match for the uploaded candidate. |
| B — Match Result to Fallback Email | `POST /webhook/match-result` (fired by the backend after every match) | If the backend's own SMTP send failed (`email_sent: false`), sends the interview or rejection email from n8n instead, and writes an audit row to `email_logs` (`sent` or `failed` with the error). No double emails: when the backend email succeeds, this branch does nothing. |
| C — Job Posted to Telegram | `POST /webhook/job-posted` (fired when a job is posted with the "webhook" platform enabled) | Builds an HTML-escaped announcement (safe for titles like "C++ / C# Developer"), posts it to the Telegram channel, and logs success or failure to `job_postings`. |
| D — Daily Report | Schedule, cron `0 9 * * 1-5` (weekdays 9 AM) | Logs in to the backend, fetches `/analytics/report`, and emails it to `HR_ADMIN_EMAIL` (falls back to `SMTP_USER`). |

## End-to-end flow

```
CV Upload (/upload-cv)
      |  backend fires POST /webhook/cv-uploaded        (fire-and-forget)
      v
Branch A: login -> GET /jobs -> pick active job -> POST /match/{candidate}/{job}
      |  backend scores the candidate, sends its own email, then fires
      |  POST /webhook/match-result (payload includes email_sent flag)
      v
Branch B: only if email_sent == false -> interview/rejection email + audit log

Job "Post Now" (webhook platform on)
      |  backend fires POST /webhook/job-posted
      v
Branch C: Telegram post -> log to job_postings

Weekdays 9 AM
      v
Branch D: login -> GET /analytics/report -> email to HR admin
```

## Required `.env` variables

```ini
# Credentials auto-imported into n8n
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your@gmail.com          # use a Gmail App Password, not your real password
SMTP_PASSWORD=xxxx-xxxx-xxxx-xxxx
TELEGRAM_BOT_TOKEN=               # bot for Branch C (from @BotFather)
TELEGRAM_CHANNEL_ID=              # e.g. @yourchannel

# Read by the workflow via $env
HR_ADMIN_EMAIL=                   # Branch D recipient (falls back to SMTP_USER)
N8N_BACKEND_USER=admin            # account Branches A/D use to get a JWT
N8N_BACKEND_PASSWORD=admin123

# Key used to decrypt the auto-imported credentials (same in both containers)
N8N_ENCRYPTION_KEY=hr-local-dev-encryption-key-change-me

# Where the backend sends its webhooks
N8N_WEBHOOK_URL=http://n8n:5678/webhook/match-result
N8N_CV_WEBHOOK_URL=http://n8n:5678/webhook/cv-uploaded
JOB_WEBHOOK_URL=http://n8n:5678/webhook/job-posted
```

## Webhook URLs

From inside Docker the hostname is `n8n`; from your machine use `localhost`:

```
http://localhost:5678/webhook/cv-uploaded
http://localhost:5678/webhook/match-result
http://localhost:5678/webhook/job-posted
```

## Reliability features built into every branch

- Retries on all HTTP, Postgres, and login nodes (3 tries) and on email and
  Telegram sends (2 tries, so retries cannot cause duplicate messages).
- The `Run AI Match` node intentionally does NOT retry — a retry could email
  candidates twice; instead its timeout is 120 s.
- Failed email or Telegram sends are recorded with the error message
  (`email_logs.status='failed'`, `job_postings` failure entry) instead of
  being silently lost.
- All Telegram output is HTML-escaped so special characters in job titles
  cannot break the message.

## Manual testing

```bash
# Branch A (requires at least one active job and a pending candidate)
curl -X POST http://localhost:5678/webhook/cv-uploaded \
  -H "Content-Type: application/json" -d '{"candidate_id":"<uuid>"}'

# Branch B
curl -X POST http://localhost:5678/webhook/match-result \
  -H "Content-Type: application/json" \
  -d '{"candidate_id":"<uuid>","candidate_name":"Test","candidate_email":"you@example.com","job_title":"Dev","final_score":88,"status":"shortlisted","email_sent":false}'

# Branch C
curl -X POST http://localhost:5678/webhook/job-posted \
  -H "Content-Type: application/json" \
  -d '{"job_id":"<uuid>","job_title":"Backend Dev","min_experience":3,"required_skills":["python"],"description":"...","apply_url":"careers@example.com"}'
```

## Files

```
n8n-workflows/
├── hr-master-workflow.json      # the single master workflow (fixed id: HrMasterWf000001)
├── scripts/
│   ├── import.sh                # entrypoint of the n8n-import container
│   └── render-credentials.js    # .env -> credentials JSON (fixed ids)
└── README.md
```

Credential IDs (workflow-to-credential linking is automatic):
`HrSmtpFromEnv001` (SMTP), `HrTelegramEnv01` (Telegram), `HrPostgresEnv001` (Postgres).

## Troubleshooting

- Workflow shows as inactive: check `docker compose logs n8n-import`, then `docker compose restart n8n`.
- Emails not sending: set `SMTP_USER` / `SMTP_PASSWORD` in `.env`, then `docker compose up -d --force-recreate n8n-import n8n`.
- "Credentials could not be decrypted": old volume with a different key — run the volume reset commands above.
- Branch A says "No active job available": create at least one active job in the Jobs tab.
- To watch a run live: open http://localhost:5678, create the owner account on first visit, open the workflow, and check the Executions panel.
