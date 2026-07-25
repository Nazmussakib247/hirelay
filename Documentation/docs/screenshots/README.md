# Screenshot Capture Guide

The main README references the images below. Capture them with the app
running (`start.bat` or `docker compose up -d`, then open http://localhost:3000),
save them into this folder with these exact filenames, and they will appear
in the README automatically.

Recommended: capture at 1920x1080 in a maximized browser window, PNG format.

| Filename | What to capture |
|----------|-----------------|
| `01-login.png` | The login page before signing in. |
| `02-cv-upload.png` | CV Upload tab right after uploading a CV — the extracted name, skills, experience, and education visible. |
| `03-ai-match.png` | AI Match tab after running a match — score breakdown and shortlisted/rejected statuses visible. |
| `04-candidates.png` | Candidates tab with several candidates listed (mix of shortlisted and rejected looks best). |
| `05-jobs.png` | Jobs tab showing at least one job with required skills. |
| `06-job-posting.png` | Job Posting tab with platform toggles visible. |
| `07-interviews.png` | Interviews tab with at least one scheduled interview and its meeting link. |
| `08-analytics.png` | Analytics tab with the funnel and charts populated. |
| `09-evaluation.png` | Evaluation tab after running the benchmark — accuracy metrics visible. |
| `10-n8n-workflow.png` | n8n (http://localhost:5678) with the master workflow open so all four branches are visible on the canvas. |
| `11-interview-email.png` | The interview invitation email received in an inbox (optional but impressive). |

Tips
- Seed data first: upload a few of the generated sample CVs (`scripts/generate_cvs.py`) and create one or two jobs so tables and charts are not empty.
- For `10-n8n-workflow.png`, zoom out (Ctrl+scroll) until all four branches fit in the canvas.
- Crop out personal browser bookmarks/tabs before committing.
