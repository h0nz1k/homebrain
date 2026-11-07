"""Minimal read-only UniFi Network API client (HomeBrain's own account, GET only after login).

Supports both controller flavours:

* classic Network Application (``:8443``): ``POST /api/login``, ``/api/s/<site>/…``;
* UniFi OS / UniFi OS Server: ``POST /api/auth/login`` (+ ``x-csrf-token``),
  ``/proxy/network/api/s/<site>/…``.

The flavour is detected like aiounifi does: ``GET /`` answers 200 on UniFi OS and redirects
on the classic application. Credentials never appear in exceptions, ``repr`` or logs.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Final

import aiohttp

TIMEOUT: Final = aiohttp.ClientTimeout(total=20)
ENDPOINTS: Final = {"self": "self", "devices": "stat/device", "clients": "stat/sta"}


class UnifiError(Exception):
    """Base error; the message never contains credentials."""


class UnifiAuthError(UnifiError):
    """Login refused (wrong user/password, locked or missing account)."""


class UnifiConnectionError(UnifiError):
    """Controller unreachable, TLS problem, timeout or unexpected answer."""


@dataclass(frozen=True)
class UnifiConfig:
    url: str
    site: str = "default"
    username: str = field(default="", repr=False)
    password: str = field(default="", repr=False)
    verify_ssl: bool = False

    @classmethod
    def from_options(cls, raw: Any) -> UnifiConfig | None:
        if not isinstance(raw, dict) or not raw.get("url"):
            return None
        return cls(
            url=str(raw["url"]).rstrip("/"),
            site=str(raw.get("site") or "default"),
            username=str(raw.get("username") or ""),
            password=str(raw.get("password") or ""),
            verify_ssl=bool(raw.get("verify_ssl", False)),
        )


class UnifiClient:
    """One controller session; ``fetch`` logs in lazily and re-logs once on 401."""

    def __init__(self, session: aiohttp.ClientSession, cfg: UnifiConfig) -> None:
        self._session = session
        self._cfg = cfg
        self.unifi_os: bool | None = None
        self._csrf: str | None = None
        self._logged_in = False

    @property
    def _ssl(self) -> Any:
        return None if self._cfg.verify_ssl else False

    async def _request(self, method: str, url: str, **kwargs: Any) -> tuple[int, Any, Any]:
        headers = {"x-csrf-token": self._csrf} if self._csrf else {}
        try:
            async with self._session.request(
                method, url, ssl=self._ssl, timeout=TIMEOUT, headers=headers, **kwargs
            ) as resp:
                token = resp.headers.get("x-updated-csrf-token") or resp.headers.get("x-csrf-token")
                if token:
                    self._csrf = token
                body = None
                if resp.content_type == "application/json":
                    body = await resp.json()
                return resp.status, resp.headers, body
        except (TimeoutError, aiohttp.ClientError) as err:
            raise UnifiConnectionError(type(err).__name__) from None

    async def _detect(self) -> None:
        status, _headers, _body = await self._request(
            "GET", f"{self._cfg.url}/", allow_redirects=False
        )
        self.unifi_os = status == 200

    async def login(self) -> None:
        if self.unifi_os is None:
            await self._detect()
        path = "/api/auth/login" if self.unifi_os else "/api/login"
        status, headers, _body = await self._request(
            "POST",
            f"{self._cfg.url}{path}",
            json={
                "username": self._cfg.username,
                "password": self._cfg.password,
                "remember": True,
            },
            allow_redirects=False,
        )
        if status in (400, 401, 403):
            raise UnifiAuthError(f"login refused (HTTP {status})")
        if status >= 300:
            raise UnifiConnectionError(f"login failed (HTTP {status})")
        self._logged_in = True

    def _api(self, path: str) -> str:
        prefix = "/proxy/network" if self.unifi_os else ""
        return f"{self._cfg.url}{prefix}/api/s/{self._cfg.site}/{path}"

    async def _get(self, path: str) -> list[Any]:
        for attempt in (0, 1):
            if not self._logged_in:
                await self.login()
            status, _headers, body = await self._request("GET", self._api(path))
            if status == 401 and attempt == 0:
                self._logged_in = False
                continue
            if status in (401, 403):
                raise UnifiAuthError(f"access refused (HTTP {status})")
            if status != 200 or not isinstance(body, dict):
                raise UnifiConnectionError(f"unexpected answer (HTTP {status})")
            data = body.get("data")
            return data if isinstance(data, list) else []
        raise UnifiAuthError("access refused")

    async def fetch(self) -> dict[str, list[Any]]:
        """``self`` + ``stat/device`` + ``stat/sta`` (all read-only GETs)."""
        return {key: await self._get(path) for key, path in ENDPOINTS.items()}
