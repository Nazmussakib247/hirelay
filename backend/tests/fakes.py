"""In-memory fakes for unit-testing services without a real database.

``FakeConnection`` implements the subset of the asyncpg ``Connection`` API our
repositories use (fetchrow / fetch / fetchval / execute), backed by simple
programmable queues. It lets us exercise service-layer logic and control flow
deterministically and fast.
"""

from __future__ import annotations

from collections import deque
from typing import Any


class FakeConnection:
    def __init__(
        self,
        *,
        fetchrow: list[Any] | None = None,
        fetch: list[Any] | None = None,
        fetchval: list[Any] | None = None,
    ) -> None:
        self._fetchrow = deque(fetchrow or [])
        self._fetch = deque(fetch or [])
        self._fetchval = deque(fetchval or [])
        self.executed: list[tuple] = []

    async def fetchrow(self, query: str, *args: Any):
        return self._fetchrow.popleft() if self._fetchrow else None

    async def fetch(self, query: str, *args: Any):
        return self._fetch.popleft() if self._fetch else []

    async def fetchval(self, query: str, *args: Any):
        return self._fetchval.popleft() if self._fetchval else None

    async def execute(self, query: str, *args: Any):
        self.executed.append((query, args))
        return "OK"
