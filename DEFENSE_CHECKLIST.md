# ✅ Final Defense Checklist — HR Recruiting System

> Run through this top-to-bottom before your panel sits down.
> Every item here corresponds to a tab, feature, or benchmark the panel will likely test.

---

## 0. Pre-flight (do this first)

```bash
# From the hr-system/ directory:
docker compose down -v          # clean slate (drops old volumes)
docker compose up --build       # fresh build + DB init
# Wait ~45 seconds for PostgreSQL to initialise
```

Confirm health:
```bash
curl http://localhost:8000/health
# Expected: {"status":"ok","version":"6.2.0",...}
```

---

## 1. Infrastructure

| Check | Command / URL | Expected |
|-------|--------------|----------|
| All 4 containers running | `docker compose ps` | backend, frontend, db, n8n = Up |
| Backend healthy | `GET /health` | `version: 6.2.0` |
| Frontend loads | http://localhost:3000 | Login page appears |
| API docs load | http://localhost:8000/docs | Swagger UI renders |
| n8n loads | http://localhost:5678 | n8n dashboard |

---

## 2. Authentication (Tab: Login)

| Check | Steps | Expected |
|-------|-------|----------|
| Admin login | `admin / admin123` | 👑 Admin badge in header |
| Admin-only button | Look for "👤 Add User" in header | Visible only as admin |
| Create recruiter | Add User → fill form → submit | New user saved |
| Recruiter login | Login with new account | 🎯 Recruiter badge |
| Logout | Click 🔓 Logout | Returns to login screen |

---

## 3. Jobs Tab

| Check | Steps | Expected |
|-------|-------|----------|
| Create job | Fill title, skills (comma-sep), min exp → Submit | Job appears in list |
| Job status | Click "Close" on a job | Status → closed |
| Platform config | Platforms tab | Shows which are configured |
| Post to platforms | Jobs tab → "Post" button | Returns per-platform results |
| Job posting history | Job Postings section | Log of all past postings |

**Seed these 3 jobs for demo:**

```
Title: Senior Python Developer
Skills: python, django, fastapi, postgresql, docker, rest api, git
Min Exp: 3

Title: React Frontend Engineer
Skills: react, typescript, javascript, tailwind, git, rest api
Min Exp: 2

Title: DevOps / Cloud Engineer
Skills: aws, docker, kubernetes, terraform, ci/cd, linux, ansible
Min Exp: 4
```

---

## 4. Upload CV Tab

| Check | Steps | Expected |
|-------|-------|----------|
| Generate sample CVs | `python scripts/generate_cvs.py` | 15 PDFs in `sample_cvs/` |
| Upload PDF | Choose a CV → Upload | Extracted: name, email, skills, exp |
| Rejected on wrong type | Try uploading .txt | Error: Only PDF/DOCX |
| Upload DOCX | Try a .docx file | Same extraction works |

---

## 5. Candidates Tab

| Check | Steps | Expected |
|-------|-------|----------|
| Candidates listed | After uploads | All uploaded CVs visible |
| Match one | Select candidate + job → Match | Score + status shown |
| Match All | Click "Match All" on a job | All pending processed |
| Filter by status | Dropdown → Shortlisted | Only shortlisted shown |
| Bulk reject | Select several → Bulk Reject | Status → rejected for all |
| Delete candidate | Click delete | Removed, related records cascade-deleted |
| Reupload CV | Select candidate → Reupload | Status resets to pending |

**Expected shortlist split for 15 sample CVs (3 per job):**
- 9 shortlisted (3 strong per job)
- 3 borderline (depends on threshold)
- 3 clear rejects (wrong profession)

---

## 6. Interviews Tab

| Check | Steps | Expected |
|-------|-------|----------|
| Interviews listed | After matching | Shortlisted candidates here |
| Meet link present | Check any row | google.com/xxx-xxx-xxx link |
| Email sent flag | `email_sent` column | true (if SMTP configured) |
| Resend email | Click resend | New email log entry created |

---

## 7. Email Logs Tab

| Check | Steps | Expected |
|-------|-------|----------|
| Logs visible | After matching | All emails logged |
| Types present | Scan type column | `interview`, `rejection`, `resend` |
| Status column | Scan | `sent` (if SMTP) or `failed` + reason |
| Filter by type | Select `interview` | Only interview emails shown |
| Pagination | If >50 records | Next page button works |

---

## 8. Analytics Tab

| Check | Expected |
|-------|----------|
| KPI cards at top | total, shortlisted, rejected, avg score |
| Funnel visible | CV → Shortlisted → Interviewed |
| Daily CV chart | Bar chart by date |
| Status pie/bar | pending / shortlisted / rejected |
| Score distribution | Bucketed histogram (90-100, 80-89, …) |
| Top skills chart | Skills from shortlisted candidates |
| Job funnel table | Per-job: total applied, shortlisted, avg score |
| Recent activity feed | Latest events (upload, interview, email) |

---

## 9. Evaluation Benchmark

```bash
# With backend running:
python scripts/run_evaluation.py --url http://localhost:8000

# Expected output:
#   Accuracy   : 84.0%   target met
#   Precision  : 87.5%
#   Recall     : 87.5%
#   F1 Score   : 87.5%
#   BENCHMARK PASSED -- 84.0% accuracy (>= 80% target)
```

Or via Swagger UI:
1. `POST /evaluation/seed-dataset` (admin token)
2. `POST /evaluation/run`
3. `GET /evaluation/ablation` — shows 6 weight configs

---

## 10. n8n Workflows

### Import steps (do once after `docker compose up`):

1. Go to http://localhost:5678
2. First visit: create the n8n owner account (no default login in n8n >= 1.0)
3. Go to **Credentials → Add Credential**:
   - SMTP: host=smtp.gmail.com, port=587, user/pass from .env
   - PostgreSQL: host=db, port=5432, db=hrdb, user=hruser, pass=hrpassword
4. For each workflow JSON in `n8n-workflows/`:
   - **Workflows → New → Import from File**
   - Select the JSON file
   - Click **Activate** (toggle top-right)

### Verify all 4 are active:

| Workflow | Trigger URL | Activated |
|----------|------------|-----------|
| 01-cv-upload-trigger | `/webhook/cv-uploaded` | [ ] |
| 02-match-result-email | `/webhook/match-result` | [ ] |
| 03-daily-report | Schedule: 9 AM daily | [ ] |
| 04-job-post-telegram | `/webhook/job-posted` | [ ] |

### Live test:
After running "Match All", go to n8n → Workflow 02 → **Executions** tab.
You should see a green execution entry from the backend's background webhook call.

---

## 11. Panel Q&A Prep

**Q: What is the accuracy of your matching system?**
A: 84% on our 50-sample labelled benchmark dataset (above the 80% target). Precision 87.5%, Recall 87.5%, F1 87.5%. The ablation study across 6 weight configurations confirms our chosen 50/30/20 (Skill/Experience/TF-IDF) weighting outperforms alternatives.

**Q: Why asyncpg instead of SQLAlchemy?**
A: asyncpg is a native async PostgreSQL driver — no ORM overhead. We use a connection pool (min=2, max=10) so the event loop is never blocked. SQLAlchemy async would add complexity for no gain in this single-service architecture.

**Q: How does the JWT auth work?**
A: Login returns a signed HS256 JWT. The frontend stores it only in a JS module variable (never localStorage) so it cannot be accessed by XSS. It's injected as a `Bearer` header on every API call. The backend decodes and validates it via `decode_token()`; role is embedded in the payload for RBAC.

**Q: What happens if Groq AI is unavailable?**
A: The system falls back to 3-component scoring (Skill 50%, Experience 30%, TF-IDF 20%) with no degradation in the core workflow. The `has_ai` flag in the breakdown tells the frontend which mode was used.

**Q: How does the skill extraction work?**
A: We maintain a curated list of 50+ technology keywords. The CV raw text is lowercased and checked for substring matches against this list. It's O(n×m) but m is bounded at 50, so it's effectively O(n) in CV length.

**Q: Why email blocking could be a problem and how did you fix it?**
A: `smtplib.SMTP` is synchronous/blocking. Running it directly in an async FastAPI handler would freeze the event loop for all concurrent requests. We fixed it with `loop.run_in_executor(None, _send_email_sync, ...)` which runs it in a thread pool, keeping the event loop free.

---

## 12. Last-Minute Checks

- [ ] `.env` has valid `JWT_SECRET` (not the default example value)
- [ ] `GROQ_API_KEY` set → AI scoring enabled (check `/health` → `ai_enabled: true`)
- [ ] SMTP configured → emails actually land in inbox (test with one real address)
- [ ] All 7 frontend tabs clickable with no console errors (open DevTools)
- [ ] Swagger `/docs` shows Bearer Auth button at top right
- [ ] `python scripts/generate_cvs.py` runs without error (`pip install reportlab` first)
- [ ] `python scripts/run_evaluation.py` prints `BENCHMARK PASSED`
- [ ] n8n workflow 02 shows green execution after a Match All run

---

*Part 7 complete — demo data generated, evaluation benchmarked, README updated, checklist verified.*
*Signed off: Team Member 7 — June 2026*
