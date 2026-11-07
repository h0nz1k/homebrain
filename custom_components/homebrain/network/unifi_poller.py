"""Background poller for the optional UniFi connection (60 s, backoff, repair issue).

Runs only while the Síť module is enabled and a URL is configured. A failed login raises the
``network_unifi_auth`` repair issue (public ``issue_registry`` API); the next good poll clears
it. Link-down counters are kept in a small Store (hashed port keys, no MAC on disk) so the
24 h ``port_flapping`` delta survives restarts.
"""

from __future__ import annotations

import asyncio
import hashlib
import logging
import time
from typing import Any, Final

import aiohttp
from homeassistant.core import HomeAssistant
from homeassistant.helpers import issue_registry as ir
from homeassistant.helpers.aiohttp_client import async_create_clientsession
from homeassistant.helpers.storage import Store

from ..const import DOMAIN
from .unifi_client import UnifiAuthError, UnifiClient, UnifiConfig, UnifiError
from .unifi_data import parse_unifi

_LOGGER = logging.getLogger(__name__)

ISSUE_AUTH: Final = "network_unifi_auth"
POLL_S: Final = 60
MAX_BACKOFF_S: Final = 900
STALE_S: Final = 600
WINDOW_S: Final = 24 * 3600
SAVE_EVERY: Final = 15
STORE_KEY: Final = f"{DOMAIN}.network_unifi"


def port_key(mac: str, port: int) -> str:
    digest = hashlib.sha256(f"homebrain-port:{mac}".encode()).hexdigest()[:12]
    return f"{digest}:{port}"


class PortHistory:
    """``link_down_count`` samples per port; ``delta`` = link drops within the last 24 h."""

    def __init__(self, samples: dict[str, list[list[float]]] | None = None) -> None:
        self._samples: dict[str, list[list[float]]] = samples or {}

    def update(self, key: str, count: int, now: float) -> None:
        seq = self._samples.setdefault(key, [])
        seq.append([now, float(count)])
        # keep the window plus one older sample as the baseline
        while len(seq) > 2 and seq[1][0] < now - WINDOW_S:
            seq.pop(0)

    def delta(self, key: str, now: float) -> int:
        seq = self._samples.get(key) or []
        total = 0.0
        for (_t0, c0), (t1, c1) in zip(seq, seq[1:], strict=False):
            if t1 < now - WINDOW_S:
                continue
            total += c1 - c0 if c1 >= c0 else c1  # counter restarted with the device
        return int(total)

    def as_dict(self) -> dict[str, list[list[float]]]:
        return self._samples

    @classmethod
    def from_dict(cls, raw: Any) -> PortHistory:
        if not isinstance(raw, dict):
            return cls()
        return cls({str(k): [list(map(float, s)) for s in v] for k, v in raw.items()})


class UnifiPoller:
    def __init__(self, hass: HomeAssistant, cfg: UnifiConfig, client: Any | None = None) -> None:
        self.hass = hass
        self.cfg = cfg
        self._client = client
        self._session: aiohttp.ClientSession | None = None
        self._task: asyncio.Task | None = None
        self._store: Store = Store(hass, 1, STORE_KEY)
        self._history = PortHistory()
        self._failures = 0
        self._polls = 0
        self._status = "pending"
        self._data: dict[str, Any] | None = None
        self._updated: float | None = None
        self.downs: dict[str, int] = {}

    async def async_start(self) -> None:
        self._history = PortHistory.from_dict(await self._store.async_load())
        if self._client is None:
            self._session = async_create_clientsession(
                self.hass,
                verify_ssl=self.cfg.verify_ssl,
                cookie_jar=aiohttp.CookieJar(unsafe=True),
                auto_cleanup=False,
            )
            self._client = UnifiClient(self._session, self.cfg)
        self._task = self.hass.async_create_background_task(
            self._run(), "homebrain network unifi poller"
        )

    async def _run(self) -> None:
        while True:
            await self.async_poll_once()
            await asyncio.sleep(self.next_delay())

    async def async_poll_once(self) -> None:
        try:
            raw = await self._client.fetch()
        except UnifiAuthError as err:
            self._fail("auth_failed")
            _LOGGER.warning("HomeBrain Síť: UniFi login refused (%s)", err)
            ir.async_create_issue(
                self.hass,
                DOMAIN,
                ISSUE_AUTH,
                is_fixable=False,
                severity=ir.IssueSeverity.WARNING,
                translation_key=ISSUE_AUTH,
            )
            return
        except UnifiError as err:
            self._fail("unreachable")
            _LOGGER.debug("HomeBrain Síť: UniFi controller unreachable (%s)", err)
            return
        except Exception:  # noqa: BLE001 – keep polling; never crash the module
            self._fail("unreachable")
            _LOGGER.debug("HomeBrain Síť: unexpected UniFi answer", exc_info=True)
            return
        self._apply(raw, time.time())
        ir.async_delete_issue(self.hass, DOMAIN, ISSUE_AUTH)
        self._polls += 1
        if self._polls % SAVE_EVERY == 1:
            await self._store.async_save(self._history.as_dict())

    def _fail(self, status: str) -> None:
        self._failures += 1
        self._status = status

    def _apply(self, raw: dict[str, Any], now: float) -> None:
        data = parse_unifi(raw)
        downs: dict[str, int] = {}
        for mac, dev in data["devices"].items():
            for port in dev["ports"]:
                if port["link_down_count"] is None:
                    continue
                key = port_key(mac, port["n"])
                self._history.update(key, port["link_down_count"], now)
                downs[f"{mac}:{port['n']}"] = self._history.delta(key, now)
        self.downs = downs
        self._data = data
        self._updated = now
        self._failures = 0
        self._status = "ok"

    def next_delay(self) -> int:
        if not self._failures:
            return POLL_S
        return min(MAX_BACKOFF_S, POLL_S * 2**self._failures)

    def current(self, now: float) -> dict[str, Any] | None:
        if self._data is None or self._updated is None or now - self._updated > STALE_S:
            return None
        return self._data

    def status(self) -> dict[str, Any]:
        return {
            "configured": True,
            "status": self._status,
            "updated_at": self._updated,
            "readonly": self._data["readonly"] if self._data else None,
        }

    async def async_stop(self) -> None:
        if self._task is not None:
            self._task.cancel()
            self._task = None
        if self._session is not None:
            await self._session.close()
            self._session = None
        if self._polls:
            await self._store.async_save(self._history.as_dict())


async def async_validate_unifi(hass: HomeAssistant, cfg: UnifiConfig) -> dict[str, Any]:
    """Options-flow check: log in with the given account and read ``self`` + devices once."""
    session = async_create_clientsession(
        hass,
        verify_ssl=cfg.verify_ssl,
        cookie_jar=aiohttp.CookieJar(unsafe=True),
        auto_cleanup=False,
    )
    try:
        data = parse_unifi(await UnifiClient(session, cfg).fetch())
    finally:
        await session.close()
    return {"readonly": data["readonly"], "devices": len(data["devices"])}
