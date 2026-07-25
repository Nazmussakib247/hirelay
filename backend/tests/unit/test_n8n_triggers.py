"""Tests for the fire-and-forget n8n webhook triggers (real local HTTP server)."""

from __future__ import annotations

import asyncio
import json

import pytest
from app.config import Settings
from app.integrations import n8n


@pytest.fixture
def no_proxy_env(monkeypatch):
    """httpx honours proxy env vars; neutralise them so localhost is direct."""
    for var in (
        "HTTP_PROXY",
        "http_proxy",
        "HTTPS_PROXY",
        "https_proxy",
        "ALL_PROXY",
        "all_proxy",
        "FTP_PROXY",
        "ftp_proxy",
    ):
        monkeypatch.delenv(var, raising=False)


async def _fake_n8n(received: list):
    async def handle(reader: asyncio.StreamReader, writer: asyncio.StreamWriter):
        try:
            request_line = await reader.readline()
            _, path, _ = request_line.decode().split(" ", 2)
            headers = {}
            while True:
                line = await reader.readline()
                if line in (b"\r\n", b"\n", b""):
                    break
                k, _, v = line.decode().partition(":")
                headers[k.strip().lower()] = v.strip()
            length = int(headers.get("content-length", 0))
            body = await reader.readexactly(length) if length else b""
            received.append((path, json.loads(body) if body else {}))
            writer.write(b"HTTP/1.1 200 OK\r\nContent-Length: 2\r\n\r\nOK")
            await writer.drain()
        finally:
            writer.close()

    server = await asyncio.start_server(handle, "127.0.0.1", 0)
    port = server.sockets[0].getsockname()[1]
    return server, port


async def test_triggers_post_to_configured_urls(monkeypatch, no_proxy_env):
    received: list = []
    server, port = await _fake_n8n(received)
    settings = Settings(
        n8n_webhook_url=f"http://127.0.0.1:{port}/webhook/match-result",
        n8n_cv_webhook_url=f"http://127.0.0.1:{port}/webhook/cv-uploaded",
    )
    monkeypatch.setattr(n8n, "get_settings", lambda: settings)

    await n8n.trigger_n8n({"status": "shortlisted", "final_score": 91.2})
    await n8n.trigger_cv_uploaded({"event": "cv_uploaded", "candidate_id": "abc"})

    server.close()
    await server.wait_closed()

    assert ("/webhook/match-result", {"status": "shortlisted", "final_score": 91.2}) in received
    assert ("/webhook/cv-uploaded", {"event": "cv_uploaded", "candidate_id": "abc"}) in received


async def test_triggers_never_raise_when_n8n_down(monkeypatch, no_proxy_env):
    settings = Settings(
        n8n_webhook_url="http://127.0.0.1:1/webhook/match-result",  # nothing listens
        n8n_cv_webhook_url="http://127.0.0.1:1/webhook/cv-uploaded",
    )
    monkeypatch.setattr(n8n, "get_settings", lambda: settings)
    await n8n.trigger_n8n({"probe": 1})  # must not raise
    await n8n.trigger_cv_uploaded({"probe": 2})


async def test_cv_trigger_disabled_when_url_empty(monkeypatch):
    received: list = []
    server, _ = await _fake_n8n(received)
    settings = Settings(n8n_cv_webhook_url="")
    monkeypatch.setattr(n8n, "get_settings", lambda: settings)
    await n8n.trigger_cv_uploaded({"probe": 3})
    server.close()
    await server.wait_closed()
    assert received == []  # no request made when the URL is unset
