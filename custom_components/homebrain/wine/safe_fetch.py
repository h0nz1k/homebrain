"""Bounded, SSRF-safe HTTPS fetcher for the wine lookup providers (#81).

Any *public* host may be fetched (producer/distributor pages, Open Food Facts), so the
guard is not a host allow-list like the Znovín fetcher but a set of hard rules:

- ``https`` only, default port, no userinfo, no IP literals outside the public internet;
- every DNS answer is filtered at connect time (:class:`PublicResolver`) – private,
  loopback, link-local, CGNAT, multicast and reserved addresses are never connected to,
  which also defeats DNS rebinding between the check and the connect;
- redirects are followed manually (≤ ``MAX_REDIRECTS``) and every hop is re-validated;
- total timeout, streamed size cap and a content-type allow-list per kind of resource.
"""

from __future__ import annotations

import ipaddress
import re
import socket
from typing import Any
from urllib.parse import urljoin, urlsplit

from aiohttp.abc import AbstractResolver, ResolveResult

from .domain import WineError

USER_AGENT = "HomeBrain/0.1 (+https://github.com/h0nz1k/homebrain; owner-initiated lookup)"
TIMEOUT_S = 15
MAX_REDIRECTS = 3
MAX_URL_LEN = 500
LIMITS = {"page": 1_500_000, "json": 1_000_000, "image": 4_000_000}
CONTENT_TYPES = {
    "page": ("text/html", "application/xhtml+xml"),
    "json": ("application/json",),
    "image": ("image/jpeg", "image/png", "image/webp"),
}
_BLOCKED_SUFFIXES = (".local", ".localhost", ".internal", ".lan", ".home.arpa", ".home", ".corp")


def is_public_ip(value: str) -> bool:
    try:
        addr = ipaddress.ip_address(value.split("%", 1)[0])
    except ValueError:
        return False
    if isinstance(addr, ipaddress.IPv6Address) and addr.ipv4_mapped is not None:
        addr = addr.ipv4_mapped
    return bool(addr.is_global) and not addr.is_multicast


def check_public_url(url: str) -> str:
    """Validate an owner-supplied/redirect URL; returns it normalised (no fragment)."""
    if not isinstance(url, str) or len(url) > MAX_URL_LEN:
        raise WineError("LOOKUP_URL_NOT_ALLOWED")
    parts = urlsplit(url.strip())
    host = (parts.hostname or "").rstrip(".").lower()
    if parts.scheme != "https" or not host or parts.username or parts.password:
        raise WineError("LOOKUP_URL_NOT_ALLOWED")
    try:
        port = parts.port
    except ValueError as err:
        raise WineError("LOOKUP_URL_NOT_ALLOWED") from err
    if port not in (None, 443):
        raise WineError("LOOKUP_URL_NOT_ALLOWED")
    if host == "localhost" or host.endswith(_BLOCKED_SUFFIXES) or "." not in host:
        raise WineError("LOOKUP_URL_NOT_ALLOWED")
    if re.fullmatch(r"[\d.]+|\[?[0-9a-f:]+\]?", host) and not is_public_ip(host.strip("[]")):
        raise WineError("LOOKUP_URL_NOT_ALLOWED")
    path = parts.path or "/"
    query = f"?{parts.query}" if parts.query else ""
    return f"https://{host}{path}{query}"


class PublicResolver(AbstractResolver):
    """Drops non-public DNS answers; raises when nothing public is left."""

    def __init__(self, inner: Any | None = None) -> None:
        from aiohttp.resolver import ThreadedResolver  # noqa: PLC0415

        self._inner = inner or ThreadedResolver()

    async def resolve(
        self, host: str, port: int = 0, family: socket.AddressFamily = socket.AF_INET
    ) -> list[ResolveResult]:
        infos = await self._inner.resolve(host, port, family)
        public = [i for i in infos if is_public_ip(str(i.get("host", "")))]
        if not public:
            raise OSError(f"{host} does not resolve to a public address")
        return public

    async def close(self) -> None:
        await self._inner.close()


def create_session():
    """Dedicated aiohttp session whose connector only ever connects to public IPs."""
    import aiohttp  # noqa: PLC0415
    from homeassistant.util.ssl import client_context  # noqa: PLC0415

    connector = aiohttp.TCPConnector(resolver=PublicResolver(), ssl=client_context(), limit=4)
    return aiohttp.ClientSession(connector=connector)


class SafeFetcher:
    """GET with manual, re-validated redirects, streamed size cap and type allow-list."""

    def __init__(self, session: Any) -> None:
        self._session = session

    async def get(self, url: str, kind: str = "page") -> tuple[bytes, str, str]:
        import aiohttp  # noqa: PLC0415

        limit = LIMITS[kind]
        current = check_public_url(url)
        for _hop in range(MAX_REDIRECTS + 1):
            try:
                async with self._session.get(
                    current,
                    headers={
                        "User-Agent": USER_AGENT,
                        "Accept-Language": "cs,en;q=0.7",
                        "Accept": ", ".join(CONTENT_TYPES[kind]),
                    },
                    timeout=aiohttp.ClientTimeout(total=TIMEOUT_S),
                    allow_redirects=False,
                ) as resp:
                    if resp.status in (301, 302, 303, 307, 308):
                        location = resp.headers.get("Location")
                        if not location:
                            raise WineError("LOOKUP_FETCH_FAILED")
                        current = check_public_url(urljoin(current, location))
                        continue
                    if resp.status == 404:
                        raise WineError("LOOKUP_NOT_FOUND")
                    if resp.status != 200:
                        raise WineError("LOOKUP_FETCH_FAILED")
                    ctype = (resp.headers.get("Content-Type") or "").split(";")[0].strip().lower()
                    if ctype not in CONTENT_TYPES[kind]:
                        raise WineError("LOOKUP_CONTENT_TYPE")
                    declared = resp.headers.get("Content-Length")
                    if declared and declared.isdigit() and int(declared) > limit:
                        raise WineError("LOOKUP_RESPONSE_TOO_LARGE")
                    body = bytearray()
                    async for chunk in resp.content.iter_chunked(65536):
                        body.extend(chunk)
                        if len(body) > limit:
                            raise WineError("LOOKUP_RESPONSE_TOO_LARGE")
                    return bytes(body), current, ctype
            except (aiohttp.ClientError, TimeoutError, OSError) as err:
                raise WineError("LOOKUP_FETCH_FAILED") from err
        raise WineError("LOOKUP_FETCH_FAILED")
