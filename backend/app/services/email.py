"""Email service: build HTML templates and dispatch via SMTP.

SMTP is a blocking library, so the actual send runs in a thread-pool executor to
avoid blocking the async event loop (a bug fixed in the original code and
preserved here).
"""

from __future__ import annotations

import asyncio
import smtplib
import uuid
from dataclasses import dataclass
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.utils import formataddr

from app.config import get_settings
from app.core.logging import get_logger

logger = get_logger(__name__)


@dataclass
class EmailContent:
    subject: str
    html: str
    text: str


@dataclass
class SendResult:
    success: bool
    error: str | None = None


def generate_meet_link() -> str:
    """Return a real, working video-meeting link.

    Default provider is Jitsi Meet (``MEET_BASE_URL=https://meet.jit.si``):
    the room is created the moment the first participant opens the URL, so no
    API credentials are required and the emailed link always works. The room
    name carries a random UUID segment so it is unguessable.
    """
    settings = get_settings()
    return f"{settings.meet_base_url}/hr-interview-{uuid.uuid4().hex[:12]}"


def _render_template(template: str, fields: dict) -> str:
    """Fill {placeholders} in a custom email body; post raw on stray braces."""
    try:
        return template.format(**fields)
    except (KeyError, IndexError, ValueError):
        return template


def build_interview_email(
    name: str,
    job_title: str,
    score: float,
    meet_link: str,
    interview_time: str,
    strengths: list[str] | None,
    custom_message: str | None = None,
) -> EmailContent:
    settings = get_settings()
    subject = f"Interview Invitation — {job_title}"
    # Custom body (from the job's interview_message) replaces the default intro
    # paragraph; the branded shell, details block and join button are kept.
    if custom_message and custom_message.strip():
        body_html = _render_template(
            custom_message.strip(),
            {
                "name": name,
                "job_title": job_title,
                "score": round(score),
                "interview_time": interview_time,
                "meet_link": meet_link,
            },
        ).replace("\n", "<br>")
        intro_html = f"<p style='color:#6b7280;font-size:14px;line-height:1.7'>{body_html}</p>"
    else:
        intro_html = (
            "<p style='color:#6b7280;font-size:14px;line-height:1.7'>You have been shortlisted for "
            f"<strong style='color:#1e40af'>{job_title}</strong> with a match score of "
            f"<strong style='color:#059669'>{round(score)}%</strong>.</p>"
        )
    strengths_html = "".join(f"<li style='margin:4px 0'>{s}</li>" for s in (strengths or [])[:3])
    strengths_block = (
        "<div style='background:#eff6ff;border-radius:8px;padding:14px;margin:16px 0'>"
        "<p style='margin:0 0 8px;font-weight:700;color:#1e40af;font-size:12px'>"
        "YOUR STRENGTHS</p><ul style='margin:0;padding-left:16px'>"
        f"{strengths_html}</ul></div>"
        if strengths_html
        else ""
    )
    html = f"""<!DOCTYPE html><html><body style="margin:0;background:#f3f4f6;font-family:'Segoe UI',Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px"><tr><td align="center">
<table width="600" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08)">
<tr><td style="background:linear-gradient(135deg,#1e40af,#3b82f6);padding:28px;text-align:center">
<h1 style="margin:0;color:#fff;font-size:22px">Interview Invitation</h1>
<p style="color:rgba(255,255,255,.85);margin:8px 0 0">Congratulations! You have been shortlisted</p></td></tr>
<tr><td style="padding:28px">
<p style="color:#374151">Dear <strong>{name}</strong>,</p>
{intro_html}
{strengths_block}
<div style="background:#f9fafb;border-radius:8px;padding:16px;margin:16px 0">
<p style="margin:0 0 8px;font-weight:700;font-size:12px;color:#111">INTERVIEW DETAILS</p>
<table width="100%"><tr><td style="color:#6b7280;font-size:13px;width:110px">Position</td><td style="font-size:13px;font-weight:600">{job_title}</td></tr>
<tr><td style="color:#6b7280;font-size:13px">Date &amp; Time</td><td style="font-size:13px;font-weight:600">{interview_time}</td></tr>
<tr><td style="color:#6b7280;font-size:13px">Platform</td><td style="font-size:13px;font-weight:600">Online video interview (link below)</td></tr></table></div>
<div style="text-align:center;margin:20px 0">
<a href="{meet_link}" style="background:#1e40af;color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:700">Join Interview</a>
<p style="margin:8px 0 0;color:#9ca3af;font-size:11px">{meet_link}</p></div>
</td></tr><tr><td style="background:#f9fafb;padding:16px;text-align:center;border-top:1px solid #e5e7eb">
<p style="margin:0;color:#9ca3af;font-size:11px">{settings.hr_from_name} · Automated HR System</p></td></tr>
</table></td></tr></table></body></html>"""
    text = (
        f"Dear {name},\nInterview for {job_title}\nScore: {round(score)}%\n"
        f"Time: {interview_time}\nLink: {meet_link}"
    )
    return EmailContent(subject, html, text)


def build_rejection_email(
    name: str, job_title: str, custom_message: str | None = None
) -> EmailContent:
    settings = get_settings()
    subject = f"Application Update — {job_title}"
    if custom_message and custom_message.strip():
        body = _render_template(
            custom_message.strip(), {"name": name, "job_title": job_title}
        ).replace("\n", "<br>")
    else:
        body = (
            f"Thank you for applying for <strong>{job_title}</strong>. After careful review, "
            "your profile does not match our current requirements. We will keep your CV on "
            "file for future opportunities."
        )
    html = f"""<!DOCTYPE html><html><body style="margin:0;background:#f3f4f6;font-family:'Segoe UI',Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px"><tr><td align="center">
<table width="600" style="background:#fff;border-radius:12px;overflow:hidden">
<tr><td style="background:#6b7280;padding:24px;text-align:center"><h1 style="margin:0;color:#fff;font-size:20px">Application Update</h1></td></tr>
<tr><td style="padding:28px"><p style="color:#374151">Dear <strong>{name}</strong>,</p>
<p style="color:#6b7280;font-size:14px;line-height:1.7">{body}</p>
<p style="color:#374151;font-size:14px">Best regards,<br><strong>{settings.hr_from_name}</strong></p></td></tr>
</table></td></tr></table></body></html>"""
    text = (
        f"Dear {name},\nThank you for applying to {job_title}.\n"
        "We regret your profile does not match our current requirements.\n"
        f"Best regards,\n{settings.hr_from_name}"
    )
    return EmailContent(subject, html, text)


def build_password_reset_email(name: str, token: str) -> EmailContent:
    settings = get_settings()
    subject = "Reset your password"
    html = f"""<!DOCTYPE html><html><body style="margin:0;background:#f3f4f6;font-family:'Segoe UI',Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px"><tr><td align="center">
<table width="600" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08)">
<tr><td style="background:linear-gradient(135deg,#1e40af,#3b82f6);padding:26px;text-align:center">
<h1 style="margin:0;color:#fff;font-size:20px">Password Reset</h1></td></tr>
<tr><td style="padding:28px">
<p style="color:#374151">Dear <strong>{name}</strong>,</p>
<p style="color:#6b7280;font-size:14px;line-height:1.7">We received a request to reset your password. Enter the code below in the app to set a new password. It expires in 1 hour.</p>
<div style="background:#f9fafb;border:1px dashed #cbd5e1;border-radius:8px;padding:16px;margin:16px 0;text-align:center">
<div style="font-family:ui-monospace,monospace;font-size:15px;font-weight:700;color:#1e40af;word-break:break-all">{token}</div></div>
<p style="color:#9ca3af;font-size:12px">If you did not request this, you can safely ignore this email — your password will not change.</p>
</td></tr>
<tr><td style="background:#f9fafb;padding:16px;text-align:center;border-top:1px solid #e5e7eb">
<p style="margin:0;color:#9ca3af;font-size:11px">{settings.hr_from_name} · Automated HR System</p></td></tr>
</table></td></tr></table></body></html>"""
    text = (
        f"Dear {name},\nUse this code to reset your password (valid for 1 hour):\n\n{token}\n\n"
        "If you did not request this, ignore this email."
    )
    return EmailContent(subject, html, text)


def _send_sync(to_email: str, content: EmailContent) -> None:
    settings = get_settings()
    message = MIMEMultipart("alternative")
    message["Subject"] = content.subject
    message["From"] = formataddr((settings.hr_from_name, settings.smtp_user))
    message["To"] = to_email
    message.attach(MIMEText(content.text, "plain"))
    message.attach(MIMEText(content.html, "html"))
    with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=15) as server:
        server.ehlo()
        server.starttls()
        server.ehlo()
        server.login(settings.smtp_user, settings.smtp_password)
        server.sendmail(settings.smtp_user, to_email, message.as_string())


async def send_email(to_email: str, content: EmailContent) -> SendResult:
    settings = get_settings()
    if not settings.email_enabled:
        return SendResult(success=False, error="SMTP not configured")
    try:
        loop = asyncio.get_running_loop()
        await loop.run_in_executor(None, _send_sync, to_email, content)
        return SendResult(success=True)
    except Exception as exc:  # noqa: BLE001 - report but never crash the request
        logger.warning("email send failed", extra={"to": to_email, "error": str(exc)})
        return SendResult(success=False, error=str(exc))
