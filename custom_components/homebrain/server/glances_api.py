"""Optional read-only Glances REST API v4 (process list → VMs, sensor thresholds, cores)."""

from __future__ import annotations

import asyncio
import time
from collections.abc import Awaitable, Callable, Mapping
from typing import Any, Final

from .procs import vms_from_processes

TIMEOUT_S: Final = 5
CACHE_S: Final = 30
Fetch = Callable[[str], Awaitable[Any]]


def base_url(data: Mapping[str, Any]) -> str | None:
    """``http(s)://host:port/api/<version>`` from the Glances config entry data."""
    host, port = data.get("host"), data.get("port")
    if not host or not port:
        return None
    scheme = "https" if data.get("ssl") else "http"
    return f"{scheme}://{host}:{port}/api/{data.get('version') or 4}"


def _first_list(payload: Any) -> list:
    if isinstance(payload, list):
        return payload
    if isinstance(payload, Mapping):
        for value in payload.values():
            if isinstance(value, list):
                return value
    return []


class GlancesApi:
    """Lazy fetch with a 30 s cache (also after a failure: no 5 s timeout on every poll)."""

    def __init__(self, url: str, fetch: Fetch, clock: Callable[[], float] = time.monotonic):
        self.url = url
        self._fetch = fetch
        self._clock = clock
        self._at: float | None = None
        self._raw: dict[str, Any] | None = None
        self._lock = asyncio.Lock()

    async def _load(self) -> dict[str, Any] | None:
        try:
            async with asyncio.timeout(TIMEOUT_S):
                try:
                    procs = _first_list(await self._fetch("/processlist/name/kvm"))
                except LookupError:
                    procs = _first_list(await self._fetch("/processlist"))
                sensors = await self._fetch("/sensors")
                core = await self._fetch("/core")
        except Exception:  # noqa: BLE001 - any network/JSON error = calm "down" state
            return None
        thresholds = {
            s["label"]: {"warning": s.get("warning"), "critical": s.get("critical")}
            for s in _first_list(sensors)
            if isinstance(s, Mapping) and s.get("label") and (s.get("warning") or s.get("critical"))
        }
        cores = core.get("log") or core.get("phys") if isinstance(core, Mapping) else None
        return {"procs": procs, "thresholds": thresholds, "cores": cores}

    async def async_get(self, total_bytes: float | None = None) -> dict[str, Any]:
        async with self._lock:
            now = self._clock()
            if self._at is None or now - self._at >= CACHE_S:
                self._raw = await self._load()
                self._at = now
        raw = self._raw
        if raw is None:
            return {"status": "down", "vms": [], "thresholds": {}, "cores": None}
        return {
            "status": "ok",
            "vms": vms_from_processes(raw["procs"], total_bytes),
            "thresholds": raw["thresholds"],
            "cores": raw["cores"],
        }


def session_fetch(session: Any, url: str) -> Fetch:
    """aiohttp GET JSON; 404 raises LookupError (older Glances without field filters)."""

    async def fetch(path: str) -> Any:
        async with session.get(url + path, timeout=TIMEOUT_S) as resp:
            if resp.status == 404:
                raise LookupError(path)
            resp.raise_for_status()
            return await resp.json(content_type=None)

    return fetch
