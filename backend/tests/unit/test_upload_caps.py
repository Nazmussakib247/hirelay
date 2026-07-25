"""Upload size enforcement.

The cap used to be applied in the service layer *after* the router had already
done ``await file.read()``, so an oversized body was fully buffered in memory
before anything objected. These tests assert the cap now bites during reading.
"""

from __future__ import annotations

import io

import pytest
from app.config import get_settings
from app.core.exceptions import ValidationError
from app.core.uploads import read_capped_upload, reject_oversized_content_length
from fastapi import UploadFile


def _upload(size: int) -> UploadFile:
    return UploadFile(filename="cv.pdf", file=io.BytesIO(b"x" * size))


def _cap_bytes() -> int:
    return get_settings().max_upload_mb * 1024 * 1024


class _FakeRequest:
    def __init__(self, content_length: str | None) -> None:
        self.headers = {} if content_length is None else {"content-length": content_length}


async def test_small_upload_is_read_in_full():
    data = await read_capped_upload(_upload(1024))
    assert len(data) == 1024


async def test_upload_at_the_cap_is_accepted():
    data = await read_capped_upload(_upload(_cap_bytes()))
    assert len(data) == _cap_bytes()


async def test_upload_over_the_cap_is_rejected():
    with pytest.raises(ValidationError) as exc:
        await read_capped_upload(_upload(_cap_bytes() + 1))
    assert "too large" in str(exc.value).lower()


async def test_empty_upload_reads_as_empty():
    assert await read_capped_upload(_upload(0)) == b""


def test_oversized_content_length_is_rejected_before_reading():
    with pytest.raises(ValidationError):
        reject_oversized_content_length(_FakeRequest(str(_cap_bytes() + 1)))


def test_content_length_within_cap_passes():
    reject_oversized_content_length(_FakeRequest("1024"))


def test_missing_content_length_is_not_fatal():
    """Chunked transfers omit it — the streaming cap is the real guard."""
    reject_oversized_content_length(_FakeRequest(None))


def test_malformed_content_length_is_ignored():
    reject_oversized_content_length(_FakeRequest("not-a-number"))


async def test_lying_content_length_still_caught_while_streaming():
    """A client under-declaring the size must not slip past the cap."""
    request = _FakeRequest("10")  # claims 10 bytes
    with pytest.raises(ValidationError):
        await read_capped_upload(_upload(_cap_bytes() + 1), request)
