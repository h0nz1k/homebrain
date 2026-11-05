"""HTTP fetching with polite caching, conditional requests and backoff."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Any

import aiohttp

from .const import BACKOFF_S

USER_AGENT = "homebrain/{version} github.com/h0nz1k/homebrain"


class FetchError(Exception):
    """Raised when a provider request fails."""

    def __init__(self, message: str, status: int | None = None) -> None:
        super().__init__(message)
        self.status = status


@dataclass
class SourceState:
    """Per-source cache and retry schedule."""

    name: str
    interval_s: int
    data: Any = None
    fetched_at: datetime | None = None
    next_attempt: datetime | None = None
    failures: int = 0
    last_error: str | None = None
    last_modified: str | None = None
    extra: dict[str, Any] = field(default_factory=dict)

    def due(self, now: datetime) -> bool:
        return self.next_attempt is None or now >= self.next_attempt

    def succeed(self, now: datetime, data: Any) -> None:
        self.data = data
        self.fetched_at = now
        self.failures = 0
        self.last_error = None
        self.next_attempt = now + timedelta(seconds=self.interval_s)

    def fail(self, now: datetime, error: Exception) -> None:
        self.failures += 1
        self.last_error = str(error) or type(error).__name__
        if isinstance(error, FetchError) and error.status == 429:
            # Rate limited: pause until the next full hour (Open-Meteo hourly budget).
            nxt = (now + timedelta(hours=1)).replace(minute=1, second=0, microsecond=0)
            self.next_attempt = nxt
            return
        delay = BACKOFF_S[min(self.failures, len(BACKOFF_S)) - 1]
        self.next_attempt = now + timedelta(seconds=delay)

    def status(self, now: datetime) -> str:
        if self.data is None or self.fetched_at is None:
            return "unavailable"
        if (now - self.fetched_at).total_seconds() > max(3 * self.interval_s, 2 * 3600):
            return "stale"
        return "fresh"

    def age_s(self, now: datetime) -> int | None:
        return None if self.fetched_at is None else int((now - self.fetched_at).total_seconds())


async def fetch_json(
    session: aiohttp.ClientSession,
    url: str,
    *,
    user_agent: str,
    state: SourceState | None = None,
    timeout_s: float = 20,
) -> Any:
    """GET JSON; with a state, reuse cached data on HTTP 304."""
    headers = {"User-Agent": user_agent, "Accept": "application/json"}
    if state is not None and state.last_modified and state.data is not None:
        headers["If-Modified-Since"] = state.last_modified
    try:
        async with session.get(
            url, headers=headers, timeout=aiohttp.ClientTimeout(total=timeout_s)
        ) as resp:
            if resp.status == 304 and state is not None:
                return state.data
            if resp.status != 200:
                raise FetchError(f"HTTP {resp.status}", resp.status)
            if state is not None:
                state.last_modified = resp.headers.get("Last-Modified")
            return await resp.json(content_type=None)
    except (TimeoutError, aiohttp.ClientError, ValueError) as err:
        raise FetchError(f"{type(err).__name__}: {err}") from err


async def fetch_bytes(
    session: aiohttp.ClientSession,
    url: str,
    *,
    user_agent: str,
    validators: dict[str, str] | None = None,
    timeout_s: float = 30,
    max_bytes: int = 8 * 1024 * 1024,
) -> bytes | None:
    """GET raw bytes. With ``validators`` (ETag / Last-Modified of the previous response) the
    request is conditional and returns None on HTTP 304; validators are updated in place."""
    headers = {"User-Agent": user_agent}
    if validators is not None:
        if validators.get("etag"):
            headers["If-None-Match"] = validators["etag"]
        if validators.get("last_modified"):
            headers["If-Modified-Since"] = validators["last_modified"]
    try:
        async with session.get(
            url, headers=headers, timeout=aiohttp.ClientTimeout(total=timeout_s)
        ) as resp:
            if resp.status == 304 and validators is not None:
                return None
            if resp.status != 200:
                raise FetchError(f"HTTP {resp.status}", resp.status)
            body = await resp.read()
            if len(body) > max_bytes:
                raise FetchError(f"response too large ({len(body)} B)")
            if validators is not None:
                validators["etag"] = resp.headers.get("ETag") or ""
                validators["last_modified"] = resp.headers.get("Last-Modified") or ""
            return body
    except (TimeoutError, aiohttp.ClientError) as err:
        raise FetchError(f"{type(err).__name__}: {err}") from err
