"""Editable default message templates (interview / rejection / job post).

The built-in *canonical* defaults live here as plain strings with
``{placeholder}`` slots. HR can override any of them from the Settings screen;
overrides are persisted in the ``app_settings`` table and mirrored into the
in-process ``_overrides`` cache below so the (synchronous) email builder and
job-post renderer can read the effective template without a DB round-trip.

Resolution order used everywhere:
    per-job custom text  →  saved global default  →  canonical default here.

The cache is hydrated once at startup (:func:`app.db.init.init_database`) and
updated whenever HR saves or resets a template. The app runs a single uvicorn
worker, so a process-local cache stays consistent.
"""

from __future__ import annotations

# ── Canonical built-in defaults ───────────────────────────────────────────
DEFAULT_INTERVIEW_MESSAGE = (
    "You have been shortlisted for {job_title} with a match score of {score}%. "
    "We would like to invite you to an interview."
)

DEFAULT_REJECTION_MESSAGE = (
    "Thank you for applying for {job_title}. After careful review, your profile "
    "does not match our current requirements. We will keep your CV on file for "
    "future opportunities."
)

DEFAULT_POST_MESSAGE = (
    "\U0001F4E2 We're Hiring: {title}\n\n"
    "\U0001F4CD Location: {location}\n"
    "\U0001F4BC Experience: {experience}+ years\n"
    "\U0001F6E0️ Skills: {skills}\n\n"
    "{description}\n\n"
    "\U0001F449 Apply Now: {apply_url}\n"
    "\U0001F4E7 Contact: {contact_email}\n\n"
    "#hiring #jobs #career #bangladesh"
)

# Setting-key → canonical default. The keys match the ``app_settings`` rows.
CANONICAL: dict[str, str] = {
    "default_interview_message": DEFAULT_INTERVIEW_MESSAGE,
    "default_rejection_message": DEFAULT_REJECTION_MESSAGE,
    "default_post_message": DEFAULT_POST_MESSAGE,
}
TEMPLATE_KEYS = tuple(CANONICAL.keys())

# ── In-process override cache ─────────────────────────────────────────────
_overrides: dict[str, str] = {}


def canonical(key: str) -> str:
    """The built-in default for ``key`` (ignores any saved override)."""
    return CANONICAL[key]


def get_template(key: str) -> str:
    """Effective template: saved override if present, else canonical default."""
    return _overrides.get(key) or CANONICAL[key]


def all_templates() -> dict[str, str]:
    """Effective template for every key."""
    return {k: get_template(k) for k in TEMPLATE_KEYS}


def set_override(key: str, value: str | None) -> None:
    """Cache an override; a blank value clears it (falls back to canonical)."""
    if key not in CANONICAL:
        return
    if value and value.strip():
        _overrides[key] = value.strip()
    else:
        _overrides.pop(key, None)


def clear_override(key: str) -> None:
    _overrides.pop(key, None)


def load_overrides(rows: object) -> None:
    """Hydrate the cache from ``app_settings`` rows (list of {key, value})."""
    _overrides.clear()
    for row in rows or []:
        key = row["key"]
        if key in CANONICAL and row["value"]:
            _overrides[key] = row["value"]
