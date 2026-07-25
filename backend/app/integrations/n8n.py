"""Fire-and-forget n8n webhook triggers."""

from __future__ import annotations

import httpx

from app.config import get_settings
from app.core.logging import get_logger

logger = get_logger(__name__)


async def _fire_webhook(url: str, payload: dict) -> None:
    """Best-effort webhook notification; never raises into the request path."""
    if not url:
        return
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            await client.post(url, json=payload)
    except Exception as exc:  # noqa: BLE001 - non-critical side channel
        logger.debug("n8n trigger failed", extra={"url": url, "error": str(exc)})


async def trigger_n8n(payload: dict) -> None:
    """Notify n8n of a match result (workflow 02: fallback email + audit log)."""
    await _fire_webhook(get_settings().n8n_webhook_url, payload)


async def trigger_cv_uploaded(payload: dict) -> None:
    """Notify n8n that a CV was uploaded (workflow 01: auto-run AI match)."""
    await _fire_webhook(get_settings().n8n_cv_webhook_url, payload)
