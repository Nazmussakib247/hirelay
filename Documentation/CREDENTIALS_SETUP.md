# Credentials Setup Guide / ক্রেডেনশিয়াল সেটআপ গাইড

This guide explains **exactly how to obtain every credential** the system uses,
what format it should be in, and how to verify it works. Fill the values into
your `.env` file (already gitignored — never commit it).

> **এই গাইডে প্রতিটা ক্রেডেনশিয়াল কীভাবে বের করবেন, কোন ফরম্যাটে বসাবেন, আর কাজ করছে
> কিনা কীভাবে যাচাই করবেন — সব ধাপে ধাপে দেওয়া আছে।** মান গুলো `.env` ফাইলে বসান
> (এটা আগেই gitignore করা, তাই কখনো git-এ push করবেন না)।

---

## What is already done for you / যেগুলো আগেই সেট করা হয়ে গেছে

These machine secrets were **generated and filled into `.env` already** — you do
not need to touch them:

| Variable | Status | কী |
|---|---|---|
| `JWT_SECRET` | ✅ Generated (64-char random) | টোকেন সাইন করার গোপন কী |
| `N8N_ENCRYPTION_KEY` | ✅ Generated | n8n ক্রেডেনশিয়াল এনক্রিপশন কী |
| `ADMIN_INITIAL_PASSWORD` | ✅ Generated strong password | অ্যাডমিন অ্যাকাউন্টের পাসওয়ার্ড |
| `N8N_BACKEND_PASSWORD` | ✅ Matches admin (required) | n8n যে পাসওয়ার্ডে backend-এ লগইন করে |

> ⚠️ **Login credentials / লগইন তথ্য:**
> Username: `admin` — Password: check the `ADMIN_INITIAL_PASSWORD` line in your
> `.env`. এই পাসওয়ার্ড দিয়েই প্রথমবার লগইন করবেন। শেয়ার করবেন না।

**Zero-credential features (already work, nothing to set):**
- CV parsing (PDF/DOCX), skill/experience extraction
- Matching engine (skills + experience + TF-IDF) — works without any AI key
- Interview scheduling + **Jitsi Meet** links (real rooms, no credentials)
- Analytics, evaluation benchmark, all dashboards

Everything below is **optional** — it enables the AI, email, and job-posting
features. The app runs end to end without any of them.

---

## Priority order / কোনটা আগে করবেন

| Priority | Credential | Effort | Why |
|---|---|---|---|
| 1 (do first) | **Groq API key** | 2 min, free | Turns on AI matching + strengths/gaps |
| 2 | **Gmail App Password** | 5 min, free | Sends interview/rejection emails |
| 3 | **Telegram bot** | 5 min, free | Job announcements — easiest working poster |
| 4 (optional) | LinkedIn | Hours–days (approval) | Only if you need LinkedIn posting |
| 5 (optional) | Twitter/X | 30 min | Only if you need X posting |
| — (skip) | Bdjobs | — | No public API; leave blank |

For a defense/demo, **§1 + §2 + §3 is enough** to show the full pipeline live.

---

## §1 — Groq API Key (AI matching) — FREE

**What it does:** adds an LLM assessment to each match (a 4th scoring component)
plus per-candidate strengths and gaps. Without it, scoring falls back to
skills + experience + TF-IDF and still works.

**Steps:**
1. Go to **https://console.groq.com** and sign up (Google login works, free).
2. Left menu → **API Keys** → **Create API Key**.
3. Give it a name (e.g. `hr-system`) → **Submit**.
4. **Copy the key immediately** (starts with `gsk_...`) — it is shown only once.

**Put it in `.env`:**
```
GROQ_API_KEY=gsk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

**Verify:** after restarting the backend, run a match. If `has_ai: true` appears
in the response breakdown and you see an `ai_summary`, it works. If the key is
wrong the engine silently falls back to non-AI scoring (never crashes).

> বাংলা: console.groq.com এ ফ্রি সাইন আপ → API Keys → Create → `gsk_...` কী কপি
> করে `.env` এর `GROQ_API_KEY=` এ বসান। কী একবারই দেখায়, সাথে সাথে কপি করুন।

---

## §2 — Gmail App Password (email sending) — FREE

**Important:** your normal Gmail password will **not** work. Google requires a
16-character "App Password", which needs 2-Step Verification enabled first.

**Steps:**
1. Go to **https://myaccount.google.com/security**.
2. Enable **2-Step Verification** (if not already on) — follow the prompts.
3. Back on the Security page, search for **"App passwords"**
   (or go directly to **https://myaccount.google.com/apppasswords**).
4. App name: type `HR System` → **Create**.
5. Google shows a **16-character code** like `abcd efgh ijkl mnop`.
6. Copy it (spaces optional — the system handles both).

**Put it in `.env`:**
```
SMTP_USER=youraddress@gmail.com
SMTP_PASSWORD=abcdefghijklmnop
HR_FROM_NAME=Your Company HR
```

**Verify:** shortlist a candidate who has an email address. Check the
`email_logs` (Email Logs tab). Status `sent` = working; `failed` shows the SMTP
error. Tip: test with your own email as the candidate first.

> বাংলা: সাধারণ Gmail পাসওয়ার্ড কাজ করবে না। myaccount.google.com/security →
> 2-Step Verification চালু করুন → "App passwords" → HR System → ১৬-অক্ষরের কোড
> কপি করে `SMTP_PASSWORD` এ বসান। `SMTP_USER` এ আপনার জিমেইল ঠিকানা দিন।

---

## §3 — Telegram Bot (job posting) — FREE, easiest

**What it does:** announces new jobs to a Telegram channel. This is the most
reliable poster — no approval process.

**Step A — create the bot:**
1. In Telegram, search for **@BotFather** and start a chat.
2. Send `/newbot`.
3. Give it a name (e.g. `My HR Jobs`) and a username ending in `bot`
   (e.g. `myhr_jobs_bot`).
4. BotFather replies with a **token** like `123456789:AAExxxxxxxxxxxxxxxxxxxx`.

**Step B — create the channel and add the bot:**
1. Create a **public channel** in Telegram (e.g. handle `@myhrjobs`).
2. Channel → **Administrators** → **Add Admin** → search your bot → grant it
   **Post Messages** permission.

**Put it in `.env`:**
```
TELEGRAM_BOT_TOKEN=123456789:AAExxxxxxxxxxxxxxxxxxxx
TELEGRAM_CHANNEL_ID=@myhrjobs
```
> `TELEGRAM_CHANNEL_ID` must start with `@` and be the **public** channel handle.
> For a private channel you'd use the numeric `-100...` ID instead.

**Verify:** create a job → **Post to platforms**. A message should appear in the
channel within seconds. The API returns `status: success` with a `t.me/...` URL.

> বাংলা: Telegram-এ @BotFather → `/newbot` → নাম দিন → টোকেন পাবেন। একটা পাবলিক
> চ্যানেল বানিয়ে বটটাকে **Admin** বানান (Post Messages অনুমতি সহ)। টোকেন আর
> `@channelhandle` `.env` এ বসান।

---

## §4 — LinkedIn (optional, needs app approval)

**Reality check:** LinkedIn posting requires a Developer app with the
**Community Management API** (formerly "Share on LinkedIn") product **approved**,
plus a Company Page you administer. Approval can take days and LinkedIn often
rejects student/personal projects. **Skip this unless you specifically need it.**

**Steps (if you proceed):**
1. Go to **https://developer.linkedin.com** → **Create app**. Attach it to a
   LinkedIn **Company Page** you are an admin of.
2. **Products** tab → request **Community Management API** → wait for approval.
3. **Auth** tab → note your Client ID/Secret → run the OAuth 2.0 flow to get an
   **access token** with the `w_organization_social` scope.
4. Find your **organization ID**: the number in your Company Page admin URL
   (`.../company/12345678/admin` → `12345678`).

**Put it in `.env`:**
```
LINKEDIN_ACCESS_TOKEN=AQV...your_oauth_token
LINKEDIN_ORG_ID=12345678
```
> The code uses the modern `/rest/posts` endpoint (`LinkedIn-Version: 202506`).
> An expired token or missing scope returns `status: failed` with LinkedIn's
> error — the app never crashes.

**Verify:** post a job. `status: success` includes the post URN and a
`linkedin.com/feed/update/...` URL. If not approved yet, you'll get `failed`.

> বাংলা: LinkedIn Developer app বানিয়ে **Community Management API** এর অনুমোদন
> লাগবে (দিন কয়েক সময় নিতে পারে, স্টুডেন্ট প্রজেক্টে প্রায়ই reject করে)। দরকার না
> হলে বাদ দিন — বাকি সব ফিচার এতে আটকায় না।

---

## §5 — Twitter / X (optional)

**What it does:** posts a "We're hiring" tweet. The free tier allows a limited
number of posts per month.

**Steps:**
1. Go to **https://developer.x.com** → sign up for a developer account →
   create a **Project** and an **App** inside it.
2. In the app's **Settings → User authentication settings**, set app
   permissions to **Read and Write** (required — Read-only cannot post).
3. **Keys and tokens** tab, generate all four:
   - **API Key** and **API Key Secret** (a.k.a. Consumer Key/Secret)
   - **Access Token** and **Access Token Secret**
4. If you change permissions to Write **after** generating the access token,
   **regenerate** the access token — otherwise it stays read-only.

**Put it in `.env`:**
```
TWITTER_API_KEY=your_api_key
TWITTER_API_SECRET=your_api_secret
TWITTER_ACCESS_TOKEN=your_access_token
TWITTER_ACCESS_SECRET=your_access_token_secret
```
> The code signs requests with OAuth 1.0a and posts to the X API v2
> `/2/tweets`. Success requires a real tweet ID in the response — a bare HTTP
> 200 is not treated as success.

**Verify:** post a job. `status: success` returns the tweet ID and URL. A common
failure is `403` — that means the access token is still read-only (regenerate
it after setting Write permission).

> বাংলা: developer.x.com এ app বানিয়ে permission **Read and Write** করুন, তারপর
> ৪টা কী (API key/secret + Access token/secret) নিন। Write permission সেট করার
> **পরে** access token আবার generate করতে ভুলবেন না, নইলে ৪০৩ error দেবে।

---

## §6 — Bdjobs — leave blank (no public API)

Bdjobs has **no public employer API**. The integration intentionally reports
`status: unsupported` and tells the user to post manually at
`employer.bdjobs.com`. **Setting `BDJOBS_USERNAME`/`PASSWORD` does not enable
real posting** — leave them blank. This honesty is by design (a previous version
faked success on any HTTP 200, which never actually posted a job).

> বাংলা: Bdjobs-এর কোনো পাবলিক API নেই, তাই এই দুইটা খালি রাখুন। সেট করলেও আসল
> পোস্ট হবে না — সিস্টেম সততার সাথে `unsupported` জানায়।

---

## §7 — n8n Automation (auto-configured)

n8n runs in Docker and **auto-imports** its workflow and credentials on
`docker compose up` using `N8N_ENCRYPTION_KEY` (already generated).

- First visit to **http://localhost:5678** asks you to create an owner account
  (this is n8n's own UI login — unrelated to the app's admin).
- The workflow uses `N8N_BACKEND_USER`/`N8N_BACKEND_PASSWORD` to call the app's
  API. These are already set to match the admin account, so `/match-all` and the
  daily report work out of the box.
- `HR_ADMIN_EMAIL` (optional): where the daily report is sent. Falls back to
  `SMTP_USER` if blank.

> বাংলা: n8n ডকারে অটো-কনফিগার হয়। প্রথমবার localhost:5678 এ গেলে n8n-এর নিজের
> owner অ্যাকাউন্ট বানাতে বলবে (এটা অ্যাপের admin থেকে আলাদা)। backend কল করার
> পাসওয়ার্ড আগেই admin-এর সাথে মিলিয়ে সেট করা আছে।

---

## Final checklist / চূড়ান্ত চেকলিস্ট

Minimum for a working demo:

- [ ] `GROQ_API_KEY` filled (AI matching) — §1
- [ ] `SMTP_USER` + `SMTP_PASSWORD` filled (emails) — §2
- [ ] `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHANNEL_ID` filled (posting) — §3
- [x] `JWT_SECRET`, `N8N_ENCRYPTION_KEY`, `ADMIN_INITIAL_PASSWORD` — already done
- [ ] Optional: LinkedIn (§4), Twitter/X (§5)
- [ ] Bdjobs — leave blank (§6)

**Start the stack:** `docker compose up -d` (or `start.bat` on Windows).
**Open:** frontend at http://localhost:3000, log in as `admin` with the password
from your `.env`.

**Security reminders:**
- `.env` is gitignored — confirm it never appears in `git status` before pushing.
- For a real/public deployment, set `ENVIRONMENT=production` and a fresh
  `JWT_SECRET` (the app refuses to boot in production with a weak secret).
- Rotate the admin password after first login (Profile → Change Password).
