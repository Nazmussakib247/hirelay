"""Multi-platform job-board poster (LinkedIn, Telegram, Twitter/X, Bdjobs, webhook).

All platforms are optional; only those with configured credentials attempt a
post. Credentials are read from validated settings at call time (not at import),
so tests and runtime config changes behave predictably.
"""

from __future__ import annotations

import asyncio
import base64
import hashlib
import hmac
import random
import re
import string
import time
import urllib.parse
from datetime import datetime

import httpx

from app.config import get_settings
from app.core.logging import get_logger

logger = get_logger(__name__)


def job_to_text(job: dict, max_skills: int = 6) -> str:
    """Render the announcement text for a job.

    Two modes:
    * **Default** — a ready-made template with emojis, location, experience,
      skills, description and an apply link.
    * **Custom** — when the job has a non-empty ``post_message``, HR's own text
      is used instead. It may contain placeholders — ``{title}``, ``{location}``,
      ``{experience}``, ``{skills}``, ``{description}``, ``{apply_url}`` — which
      are filled in; if the text contains stray braces that aren't valid
      placeholders, it is posted verbatim rather than failing.

    Location is taken from the job's ``location`` field and falls back to a
    sensible default only when HR left it blank.
    """
    skills = ", ".join((job.get("required_skills") or [])[:max_skills])
    exp = job.get("min_experience", 0)
    location = (job.get("location") or "").strip() or "Remote / Dhaka, Bangladesh"
    apply_url = job.get("apply_url", "contact@yourcompany.com")

    custom = (job.get("post_message") or "").strip()
    if custom:
        fields = {
            "title": job.get("title", ""),
            "location": location,
            "experience": exp,
            "skills": skills or "See description",
            "description": job.get("description") or "",
            "apply_url": apply_url,
        }
        try:
            return custom.format(**fields)
        except (KeyError, IndexError, ValueError):
            # Stray/unknown braces in the custom text — post it as written.
            return custom

    return (
        f"📢 We're Hiring: {job['title']}\n\n"
        f"📍 Location: {location}\n"
        f"💼 Experience: {exp}+ years\n"
        f"🛠️ Skills: {skills or 'See description'}\n\n"
        f"{(job.get('description') or '')[:300]}\n\n"
        f"👉 Apply Now: {apply_url}\n\n"
        f"#hiring #{job['title'].replace(' ', '').lower()} #jobs #career #bangladesh"
    )


# LinkedIn versioned-API month pin. The old /v2/ugcPosts endpoint is retired
# for new apps; the replacement is /rest/posts + a LinkedIn-Version header.
_LINKEDIN_VERSION = "202506"


def _escape_linkedin_text(text: str) -> str:
    """Escape characters reserved by LinkedIn's little-text format.

    The /rest/posts ``commentary`` field treats these as formatting control
    characters; unescaped job descriptions containing ``(){}[]<>|`` etc. are
    rejected or rendered corrupted.
    """
    return re.sub(r"([\\|{}@\[\]()<>#*_~])", r"\\\1", text)


async def post_to_linkedin(job: dict) -> dict:
    s = get_settings()
    if not s.linkedin_access_token or not s.linkedin_org_id:
        return {"platform": "linkedin", "status": "skipped", "reason": "credentials not set"}
    payload = {
        "author": f"urn:li:organization:{s.linkedin_org_id}",
        "commentary": _escape_linkedin_text(job_to_text(job)),
        "visibility": "PUBLIC",
        "distribution": {
            "feedDistribution": "MAIN_FEED",
            "targetEntities": [],
            "thirdPartyDistributionChannels": [],
        },
        "lifecycleState": "PUBLISHED",
        "isReshareDisabledByAuthor": False,
    }
    try:
        async with httpx.AsyncClient(timeout=15.0) as c:
            r = await c.post(
                "https://api.linkedin.com/rest/posts",
                headers={
                    "Authorization": f"Bearer {s.linkedin_access_token}",
                    "Content-Type": "application/json",
                    "X-Restli-Protocol-Version": "2.0.0",
                    "LinkedIn-Version": _LINKEDIN_VERSION,
                },
                json=payload,
            )
            # Success is a 201 whose x-restli-id header carries the post URN —
            # a bare 200/201 without the URN is NOT reported as success.
            post_urn = r.headers.get("x-restli-id", "")
            if r.status_code == 201 and post_urn:
                return {
                    "platform": "linkedin",
                    "status": "success",
                    "post_id": post_urn,
                    "url": f"https://www.linkedin.com/feed/update/{post_urn}",
                }
            return {
                "platform": "linkedin",
                "status": "failed",
                "reason": r.text[:200] or f"no post URN returned (HTTP {r.status_code})",
                "http_code": r.status_code,
            }
    except Exception as e:  # noqa: BLE001
        return {"platform": "linkedin", "status": "error", "reason": str(e)}


async def post_to_telegram(job: dict) -> dict:
    s = get_settings()
    if not s.telegram_bot_token or not s.telegram_channel_id:
        return {"platform": "telegram", "status": "skipped", "reason": "credentials not set"}
    try:
        async with httpx.AsyncClient(timeout=10.0) as c:
            r = await c.post(
                f"https://api.telegram.org/bot{s.telegram_bot_token}/sendMessage",
                json={
                    "chat_id": s.telegram_channel_id,
                    "text": job_to_text(job),
                    "parse_mode": "HTML",
                    "disable_web_page_preview": True,
                },
            )
            data = r.json()
            if data.get("ok"):
                msg_id = data["result"]["message_id"]
                channel = s.telegram_channel_id.lstrip("@")
                return {
                    "platform": "telegram",
                    "status": "success",
                    "message_id": msg_id,
                    "url": f"https://t.me/{channel}/{msg_id}",
                }
            return {
                "platform": "telegram",
                "status": "failed",
                "reason": data.get("description", "Unknown error"),
            }
    except Exception as e:  # noqa: BLE001
        return {"platform": "telegram", "status": "error", "reason": str(e)}


async def post_to_twitter(job: dict) -> dict:
    s = get_settings()
    if not s.twitter_api_key or not s.twitter_access_token:
        return {"platform": "twitter", "status": "skipped", "reason": "credentials not set"}
    tweet_text = (
        f"🚀 We're Hiring: {job['title']}\n"
        f"💼 {job.get('min_experience', 0)}+ yrs exp\n"
        f"🛠️ {', '.join((job.get('required_skills') or [])[:4])}\n"
        f"Apply: {job.get('apply_url', 'contact@yourcompany.com')}\n"
        f"#hiring #jobs #tech"
    )[:280]
    url = "https://api.twitter.com/2/tweets"
    nonce = "".join(random.choices(string.ascii_letters + string.digits, k=32))
    timestamp = str(int(time.time()))
    oauth_params = {
        "oauth_consumer_key": s.twitter_api_key,
        "oauth_nonce": nonce,
        "oauth_signature_method": "HMAC-SHA1",
        "oauth_timestamp": timestamp,
        "oauth_token": s.twitter_access_token,
        "oauth_version": "1.0",
    }
    param_string = "&".join(
        f"{urllib.parse.quote(k, safe='')}={urllib.parse.quote(v, safe='')}"
        for k, v in sorted(oauth_params.items())
    )
    base_string = "&".join(
        ["POST", urllib.parse.quote(url, safe=""), urllib.parse.quote(param_string, safe="")]
    )
    signing_key = (
        urllib.parse.quote(s.twitter_api_secret, safe="")
        + "&"
        + urllib.parse.quote(s.twitter_access_secret, safe="")
    )
    signature = base64.b64encode(
        hmac.HMAC(signing_key.encode(), base_string.encode(), hashlib.sha1).digest()
    ).decode()
    oauth_params["oauth_signature"] = signature
    auth_header = "OAuth " + ", ".join(
        f'{urllib.parse.quote(k, safe="")}="{urllib.parse.quote(v, safe="")}"'
        for k, v in sorted(oauth_params.items())
    )
    try:
        async with httpx.AsyncClient(timeout=10.0) as c:
            r = await c.post(
                url,
                headers={"Authorization": auth_header, "Content-Type": "application/json"},
                json={"text": tweet_text},
            )
            data = r.json()
            if "data" in data:
                tid = data["data"]["id"]
                return {
                    "platform": "twitter",
                    "status": "success",
                    "tweet_id": tid,
                    "url": f"https://twitter.com/i/web/status/{tid}",
                }
            return {"platform": "twitter", "status": "failed", "reason": str(data)[:200]}
    except Exception as e:  # noqa: BLE001
        return {"platform": "twitter", "status": "error", "reason": str(e)}


async def post_to_bdjobs(job: dict) -> dict:  # noqa: ARG001 - kept for handler signature parity
    """Bdjobs has no official public employer API.

    The previous implementation form-posted invented field names to
    ``employer.bdjobs.com`` and reported success on any HTTP 200 — a post that
    never actually happened. We now say so honestly instead of lying green.
    """
    s = get_settings()
    if not s.bdjobs_username or not s.bdjobs_password:
        return {"platform": "bdjobs", "status": "skipped", "reason": "credentials not set"}
    return {
        "platform": "bdjobs",
        "status": "unsupported",
        "reason": (
            "Bdjobs does not expose a public employer API; automated posting "
            "is not possible. Post manually at https://employer.bdjobs.com, "
            "or contact Bdjobs for corporate API access."
        ),
    }


async def post_to_custom_webhook(job: dict) -> dict:
    s = get_settings()
    if not s.job_webhook_url:
        return {"platform": "webhook", "status": "skipped", "reason": "JOB_WEBHOOK_URL not set"}
    try:
        async with httpx.AsyncClient(timeout=10.0) as c:
            r = await c.post(
                s.job_webhook_url,
                json={
                    "event": "new_job_posted",
                    "job_title": job["title"],
                    "job_id": str(job.get("id", "")),
                    "description": job.get("description", ""),
                    "required_skills": job.get("required_skills", []),
                    "min_experience": job.get("min_experience", 0),
                    "apply_url": job.get("apply_url", ""),
                    "posted_at": datetime.now().isoformat(),
                },
            )
            return {
                "platform": "webhook",
                "status": "success" if r.status_code < 400 else "failed",
                "http_code": r.status_code,
            }
    except Exception as e:  # noqa: BLE001
        return {"platform": "webhook", "status": "error", "reason": str(e)}


PLATFORM_HANDLERS = {
    "linkedin": post_to_linkedin,
    "telegram": post_to_telegram,
    "twitter": post_to_twitter,
    "bdjobs": post_to_bdjobs,
    "webhook": post_to_custom_webhook,
}


async def post_job_to_all_platforms(job: dict, platforms: list[str] | None = None) -> dict:
    if platforms:
        tasks = {p: PLATFORM_HANDLERS[p](job) for p in platforms if p in PLATFORM_HANDLERS}
    else:
        tasks = {p: fn(job) for p, fn in PLATFORM_HANDLERS.items()}
    raw_results = await asyncio.gather(*tasks.values(), return_exceptions=True)
    output: dict = {}
    for platform, result in zip(tasks.keys(), raw_results, strict=False):
        output[platform] = (
            {"status": "error", "reason": str(result)} if isinstance(result, Exception) else result
        )
    success = [p for p, r in output.items() if r.get("status") == "success"]
    skipped = [p for p, r in output.items() if r.get("status") == "skipped"]
    failed = [p for p, r in output.items() if r.get("status") in ("failed", "error")]
    unsupported = [p for p, r in output.items() if r.get("status") == "unsupported"]
    return {
        "results": output,
        "summary": {
            "success": success,
            "skipped": skipped,
            "failed": failed,
            "unsupported": unsupported,
            "total_posted": len(success),
        },
    }


def get_configured_platforms() -> dict:
    s = get_settings()
    return {
        "linkedin": bool(s.linkedin_access_token and s.linkedin_org_id),
        "telegram": bool(s.telegram_bot_token and s.telegram_channel_id),
        "twitter": bool(s.twitter_api_key and s.twitter_access_token),
        "bdjobs": bool(s.bdjobs_username and s.bdjobs_password),
        "webhook": bool(s.job_webhook_url),
    }
