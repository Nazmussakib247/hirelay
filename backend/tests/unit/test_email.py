"""Tests for email template building and the disabled-SMTP path (no network)."""

from __future__ import annotations

from app.services import email


def test_generate_meet_link_is_real_jitsi_room():
    link = email.generate_meet_link()
    # Jitsi rooms exist as soon as the first participant opens the URL, so
    # the emailed link always works without any API credentials.
    assert link.startswith("https://meet.jit.si/hr-interview-")
    slug = link.rsplit("/", 1)[1]
    assert len(slug) > len("hr-interview-")


def test_generate_meet_link_is_unique():
    assert email.generate_meet_link() != email.generate_meet_link()


def test_build_interview_email_contains_details():
    content = email.build_interview_email(
        "Arman",
        "Python Dev",
        88.0,
        "https://meet.jit.si/hr-interview-abc123",
        "Monday, July 06 2026 at 10:00 AM (Asia/Dhaka)",
        ["Strong Python", "Docker"],
    )
    assert "Interview Invitation" in content.subject
    assert "Arman" in content.html
    assert "88%" in content.html
    assert "hr-interview-abc123" in content.html


def test_build_rejection_email_is_polite():
    content = email.build_rejection_email("Farida", "UX Designer")
    assert "Application Update" in content.subject
    assert "Farida" in content.html
    assert "does not match" in content.html


async def test_send_email_reports_disabled_smtp():
    content = email.EmailContent("s", "<b>h</b>", "t")
    result = await email.send_email("x@example.com", content)
    assert result.success is False
    assert "not configured" in (result.error or "")
