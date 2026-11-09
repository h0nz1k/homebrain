"""Generic Tecomat Foxtrot WebMaker XML client (read-only).

Protocol: ``GET /syswww/login.xml`` sets the ``SoftPLC`` session cookie, the form is posted
to ``/syswww/LOGIN.XML`` with ``PASS = sha1(cookie + password)`` (never the clear-text
password over plain HTTP). Data pages: ``GET /PAGE<n>.XML`` with ``x-tecomat: data``
(windows-1250) answer ``<INPUT NAME="__<area><addr>[.<bit>]_<TYPE>_<fmt>" VALUE=".."/>``;
a redirect to the login form means the session expired. Logout follows both hops.

There is deliberately no method that POSTs to a data page: phase 0 never writes.
"""

from __future__ import annotations

import asyncio
import hashlib
import re
import urllib.parse
from dataclasses import dataclass, field
from typing import Any

import aiohttp

TIMEOUT = aiohttp.ClientTimeout(total=15)
_NAME_RE = re.compile(r"^__([A-Z])(\d+)(?:\.(\d+))?_([A-Z]+)_(.*)$")
_INPUT_RE = re.compile(r'<INPUT\s+NAME="([^"]+)"\s+VALUE="([^"]*)"', re.IGNORECASE)
_UCID_RE = re.compile(r'<ACCESS\b[^>]*\bUCID="([^"]*)"', re.IGNORECASE)


class TecomatError(Exception):
    """PLC unreachable or answered something unexpected."""


class TecomatAuthError(TecomatError):
    """Login rejected (wrong user/password or access level)."""


class _SessionExpired(TecomatError):
    pass


@dataclass(frozen=True)
class VarRef:
    area: str
    addr: int
    bit: int | None
    type: str
    fmt: str

    @property
    def address(self) -> str:
        return f"{self.area}{self.addr}" + (f".{self.bit}" if self.bit is not None else "")


def parse_name(name: str) -> VarRef | None:
    """``__R7031.3_BOOL_i`` → VarRef(R, 7031, 3, BOOL, i); ``None`` for other names."""
    match = _NAME_RE.match(name)
    if not match:
        return None
    area, addr, bit, typ, fmt = match.groups()
    return VarRef(area, int(addr), int(bit) if bit is not None else None, typ, fmt)


def parse_value(typ: str, raw: str) -> Any:
    """Formatted VALUE → python value (bool/float/int/``hh:mm``); ``None`` when unparsable."""
    raw = (raw or "").strip()
    if not raw:
        return None
    if typ == "BOOL":
        return raw not in ("0", "false", "FALSE")
    if typ == "TIME":
        return raw if re.fullmatch(r"\d{1,2}:\d{2}", raw) else None
    try:
        number = float(raw)
    except ValueError:
        return None
    if typ in ("REAL", "LREAL"):
        return number
    return int(number)


def parse_page(text: str) -> tuple[str | None, dict[str, str]]:
    """Page compile id (UCID) + ``name -> raw VALUE`` (parsed by name, never by position)."""
    ucid = _UCID_RE.search(text)
    return (ucid.group(1) if ucid else None), dict(_INPUT_RE.findall(text))


@dataclass(frozen=True)
class TecomatConfig:
    url: str
    username: str
    password: str = field(repr=False)

    def __repr__(self) -> str:  # never leak the password into logs/tracebacks
        return "TecomatConfig(url=<hidden>, username=<hidden>, password=<hidden>)"


def _is_login(location: str) -> bool:
    return "login" in location.lower()


class TecomatClient:
    """One session, one request at a time (callers space requests ≥ 1 s apart)."""

    def __init__(self, session: aiohttp.ClientSession, cfg: TecomatConfig) -> None:
        self._session = session
        self._cfg = cfg
        self._base = cfg.url.rstrip("/")
        self._logged_in = False
        self._lock = asyncio.Lock()

    def _cookie(self) -> str | None:
        for cookie in self._session.cookie_jar:
            if cookie.key == "SoftPLC":
                return cookie.value
        return None

    async def _get(self, path: str, **headers: str) -> aiohttp.ClientResponse:
        try:
            resp = await self._session.get(
                self._base + path, headers=headers, allow_redirects=False, timeout=TIMEOUT
            )
            await resp.read()
        except (aiohttp.ClientError, TimeoutError) as err:
            raise TecomatError(type(err).__name__) from None
        return resp

    async def login(self) -> None:
        resp = await self._get("/syswww/login.xml")
        if resp.status in (301, 302, 303):
            resp = await self._get("/syswww/login.xml")
        cookie = self._cookie()
        password = self._cfg.password
        if cookie:
            password = hashlib.sha1(
                (urllib.parse.unquote(cookie) + password).encode("cp1250", "replace")
            ).hexdigest()
        try:
            post = await self._session.post(
                self._base + "/syswww/LOGIN.XML",
                data={"USER": self._cfg.username, "PASS": password},
                allow_redirects=False,
                timeout=TIMEOUT,
            )
            body = (await post.read()).decode("cp1250", "replace")
        except (aiohttp.ClientError, TimeoutError) as err:
            raise TecomatError(type(err).__name__) from None
        location = post.headers.get("Location", "")
        if post.status in (301, 302, 303) and location and not _is_login(location):
            self._logged_in = True
            return
        if post.status == 200 and "<LOGIN" not in body[:400].upper():
            self._logged_in = True
            return
        self._logged_in = False
        if post.status >= 500:
            raise TecomatError(f"login HTTP {post.status}")
        raise TecomatAuthError("login rejected")

    async def _fetch(self, page: int) -> tuple[str | None, dict[str, str]]:
        resp = await self._get(f"/PAGE{int(page)}.XML", **{"x-tecomat": "data"})
        if resp.status in (301, 302, 303):
            if _is_login(resp.headers.get("Location", "")):
                raise _SessionExpired
            raise TecomatError(f"PAGE{page} redirect")
        if resp.status in (401, 403):
            raise TecomatAuthError(f"PAGE{page} HTTP {resp.status}")
        if resp.status != 200:
            raise TecomatError(f"PAGE{page} HTTP {resp.status}")
        text = (await resp.read()).decode("cp1250", "replace")
        if "<LOGIN" in text[:400].upper():
            raise _SessionExpired
        return parse_page(text)

    async def read_page(self, page: int) -> tuple[str | None, dict[str, str]]:
        """Read one page; logs in first / again after session expiry (once)."""
        async with self._lock:
            if not self._logged_in:
                await self.login()
            try:
                return await self._fetch(page)
            except _SessionExpired:
                self._logged_in = False
            await self.login()
            try:
                return await self._fetch(page)
            except _SessionExpired:
                self._logged_in = False
                raise TecomatAuthError("session rejected right after login") from None

    async def logout(self) -> None:
        """Both hops with the same cookie; best effort."""
        if not self._logged_in:
            return
        self._logged_in = False
        try:
            resp = await self._get("/logout.xml")
            if resp.status in (301, 302, 303):
                await self._get("/syswww/logout.xml")
        except TecomatError:
            pass
