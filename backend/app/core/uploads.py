"""Bounded upload reading.

The previous implementation did ``data = await file.read()`` in the router and
only checked ``MAX_UPLOAD_MB`` afterwards, in the service layer — so a client
could force the whole body into memory before the cap was consulted. The nginx
``client_max_body_size 12m`` covers the proxied path, but the backend is also
reachable directly, so the limit has to be enforced in the application too.

:func:`read_capped_upload` enforces the cap twice:

1. **Before reading** — a declared ``Content-Length`` above the cap is rejected
   immediately, so an oversized upload costs one header parse rather than a
   full body transfer.
2. **While reading** — the body is consumed in fixed-size chunks and aborted
   the moment the running total exceeds the cap, so a missing, lying, or
   chunked-transfer ``Content-Length`` cannot get past it either.
"""

from __future__ import annotations

from fastapi import Request, UploadFile

from app.config import get_settings
from app.core.exceptions import ValidationError

# 64 KiB: large enough that chunking overhead is negligible for a 10 MB cap,
# small enough that the overshoot before we notice the cap is bounded.
_CHUNK_SIZE = 64 * 1024


def _max_bytes() -> int:
    return get_settings().max_upload_mb * 1024 * 1024


def _too_large(max_bytes: int) -> ValidationError:
    return ValidationError(f"File too large. Maximum allowed is {max_bytes // (1024 * 1024)} MB.")


def reject_oversized_content_length(request: Request) -> None:
    """Reject a request whose declared ``Content-Length`` exceeds the cap.

    Cheap pre-check only; :func:`read_capped_upload` still enforces the real
    limit while streaming, because ``Content-Length`` is client-supplied and
    absent entirely for chunked transfers.
    """
    raw = request.headers.get("content-length")
    if not raw:
        return
    try:
        declared = int(raw)
    except ValueError:
        return
    max_bytes = _max_bytes()
    if declared > max_bytes:
        raise _too_large(max_bytes)


async def read_capped_upload(file: UploadFile, request: Request | None = None) -> bytes:
    """Read ``file`` fully, aborting as soon as the size cap is exceeded.

    Raises :class:`ValidationError` (HTTP 422) rather than letting an oversized
    body be buffered in full.
    """
    if request is not None:
        reject_oversized_content_length(request)

    max_bytes = _max_bytes()
    chunks: list[bytes] = []
    total = 0
    while True:
        chunk = await file.read(_CHUNK_SIZE)
        if not chunk:
            break
        total += len(chunk)
        if total > max_bytes:
            # Stop consuming immediately — do not accumulate the rest.
            raise _too_large(max_bytes)
        chunks.append(chunk)
    return b"".join(chunks)
