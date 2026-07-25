"""Rate limiting via slowapi.

A single shared :class:`Limiter` keyed by client IP. Sensitive endpoints (e.g.
login) apply a strict per-minute limit to blunt brute-force attempts; the rest
of the API uses a generous default.
"""

from __future__ import annotations

from slowapi import Limiter
from starlette.requests import Request

from app.config import get_settings


def client_ip(request: Request) -> str:
    """Resolve the real client IP, honouring ``X-Forwarded-For`` when proxied.

    ``slowapi.util.get_remote_address`` reads ``request.client.host``, which
    behind the bundled nginx reverse proxy is *nginx's* address — so every user
    in the deployment shared a single bucket and the 10/min login limit became
    a global limit that one user could exhaust for everybody.

    ``X-Forwarded-For`` is client-controllable, so it is only trusted when
    ``TRUST_PROXY_HEADERS`` is enabled (the Docker/nginx deployment). With it
    disabled the direct peer address is used, which cannot be spoofed. The
    left-most entry is the original client; nginx appends, so that is the one
    we want.
    """
    if get_settings().trust_proxy_headers:
        forwarded = request.headers.get("x-forwarded-for")
        if forwarded:
            first = forwarded.split(",")[0].strip()
            if first:
                return first
    return request.client.host if request.client else "unknown"


limiter = Limiter(key_func=client_ip, default_limits=["200/minute"])

# Named limits reused across routes.
LOGIN_LIMIT = "10/minute"
