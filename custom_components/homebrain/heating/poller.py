"""Background Topení poller: one PLC session, pages one at a time, backoff, repair issues.

* every ``poll_interval`` (default 30 s) the pages that are due are read sequentially with
  ``SPACING`` (≥ 1 s) between requests; pages with a longer interval in the map
  (``pages: {26: 900}``) are read less often;
* login rejected → source ``auth`` + repair issue ``heating_auth`` (cleared by the next good
  poll); network trouble → ``unreachable``; both back off 2× up to 10 min;
* page compile id (UCID) ≠ the map's expected one → the page is ignored and repair issue
  ``heating_project_changed`` is raised (the installer re-uploaded the PLC project);
* day counters (compressor runtime/starts, outdoor min/max, energy) live in a Store, so an
  HA restart neither resets the day nor invents a compressor start.

Credentials never reach logs, WS payloads or repair issues.
"""

from __future__ import annotations

import asyncio
import contextlib
import logging
import time
from collections.abc import Callable
from dataclasses import dataclass
from datetime import timedelta
from typing import Any, Final

import aiohttp
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers import issue_registry as ir
from homeassistant.helpers.aiohttp_client import async_create_clientsession
from homeassistant.helpers.storage import Store
from homeassistant.util import dt as dt_util

from ..const import DOMAIN
from .alerts import (
    ActiveAlert,
    AlertState,
    EvalContext,
    dispatch_notify,
    evaluate_alerts,
    format_change_notify,
    plan_notifications,
)
from .changes import IMMEDIATE_NOTIFY_KEYS, ChangeLog
from .client import TecomatAuthError, TecomatClient, TecomatConfig, TecomatError
from .keys import DERIVED, KEYS
from .mapfile import HeatingMap, MapError, load_map_file
from .model import (
    DayCounters,
    Resolved,
    SolarSample,
    build_payload,
    derive_activity,
    empty_payload,
    resolve,
    trim_solar_samples,
)

_LOGGER = logging.getLogger(__name__)

AUTOSTART = True  # tests drive async_poll_once() themselves
SPACING = 1.0  # seconds between two PLC requests (old embedded web server)
CONF_HEATING: Final = "heating"
DATA_KEY: Final = "heating"
ISSUE_AUTH: Final = "heating_auth"
ISSUE_PROJECT: Final = "heating_project_changed"
STORE_KEY: Final = "homebrain.heating_state"
STORE_VERSION: Final = 2
DEFAULT_MAP_PATH: Final = "homebrain/heating_map.yaml"
DEFAULT_INTERVAL: Final = 30
MIN_INTERVAL: Final = 15
MAX_INTERVAL: Final = 300
BACKOFF_MAX: Final = 600
BINDING_ENERGY: Final = "heating_energy"
BINDING_POWER: Final = "heating_power"


@dataclass(frozen=True)
class HeatingOptions:
    cfg: TecomatConfig
    map_path: str
    interval: int
    alert_recipient: str | None

    @classmethod
    def from_options(cls, raw: Any, hass: HomeAssistant) -> HeatingOptions | None:
        if not isinstance(raw, dict) or not str(raw.get("url") or "").strip():
            return None
        try:
            interval = int(raw.get("poll_interval") or DEFAULT_INTERVAL)
        except (TypeError, ValueError):
            interval = DEFAULT_INTERVAL
        recipient = str(raw.get("alert_recipient") or "").strip() or None
        return cls(
            TecomatConfig(
                str(raw["url"]).strip().rstrip("/"),
                str(raw.get("username") or ""),
                str(raw.get("password") or ""),
            ),
            str(raw.get("map_path") or hass.config.path(DEFAULT_MAP_PATH)),
            max(MIN_INTERVAL, min(MAX_INTERVAL, interval)),
            recipient,
        )


def _state_number(
    hass: HomeAssistant, entity_id: str | None, scale: dict[str, float]
) -> float | None:
    if not entity_id or (state := hass.states.get(entity_id)) is None:
        return None
    try:
        value = float(state.state)
    except (TypeError, ValueError):
        return None
    unit = state.attributes.get("unit_of_measurement")
    return value * scale.get(unit, 1.0)


class HeatingPoller:
    """Owns the PLC session, the latest values and the persisted day counters."""

    def __init__(
        self,
        hass: HomeAssistant,
        opts: HeatingOptions,
        bindings: Callable[[], dict[str, str]],
    ) -> None:
        self.hass = hass
        self.opts = opts
        self._bindings = bindings
        self.map: HeatingMap | None = None
        self._pages: dict[int, dict[str, str]] = {}
        self._due: dict[int, float] = {}
        self._res = Resolved()
        self._counters = DayCounters()
        self._changes = ChangeLog()
        self._alerts = AlertState()
        self._active_alerts: list[ActiveAlert] = []
        self._prev_alerts: dict[str, ActiveAlert] = {}
        self._project_changed = False
        self._late_poll = False
        self._store: Store = Store(hass, STORE_VERSION, STORE_KEY)
        self._source = "unconfigured"
        self._updated_at = None
        self._failures = 0
        self._listeners: list[Callable[[], None]] = []
        self._session: aiohttp.ClientSession | None = None
        self._client: TecomatClient | None = None
        self._task: asyncio.Task | None = None
        self._solar_samples: list[SolarSample] = []

    # --- lifecycle -------------------------------------------------------------------
    async def async_start(self) -> None:
        saved = await self._store.async_load()
        if isinstance(saved, dict):
            self._counters = DayCounters.from_dict(saved.get("counters"))
            self._changes = ChangeLog.from_dict(saved.get("changes"))
            self._alerts = AlertState.from_dict(saved.get("alerts"))
        else:
            # legacy store held counters only
            self._counters = DayCounters.from_dict(saved)
        self._late_poll = True
        try:
            self.map = await self.hass.async_add_executor_job(load_map_file, self.opts.map_path)
        except (MapError, OSError, UnicodeDecodeError) as err:
            _LOGGER.warning("Topení map is not usable: %s", err)
            self.map = None
        if self.map is None:
            _LOGGER.warning("Topení: no variable map found, nothing is read from the PLC")
            return
        self._source = "ok"
        self._res = Resolved(mapped=set(self.map.keys))
        self._session = async_create_clientsession(
            self.hass, cookie_jar=aiohttp.CookieJar(unsafe=True), auto_cleanup=False
        )
        self._client = TecomatClient(self._session, self.opts.cfg)
        if AUTOSTART:
            self._task = self.hass.async_create_background_task(
                self._run(), "homebrain_heating_poller"
            )

    async def _run(self) -> None:
        while True:
            try:
                await self.async_poll_once()
            except Exception:  # noqa: BLE001 - keep polling; never crash HA
                _LOGGER.exception("Topení poll failed unexpectedly")
            await asyncio.sleep(self.next_delay())

    async def async_stop(self) -> None:
        if self._task is not None:
            self._task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self._task
            self._task = None
        if self._client is not None:
            with contextlib.suppress(Exception):
                async with asyncio.timeout(10):
                    await self._client.logout()
        if self._session is not None and not self._session.closed:
            # HA owns the connector; release only our cookie session.
            self._session.detach()
        self._session = None
        self._client = None
        await self._persist_store(immediate=True)
        self._listeners.clear()

    # --- polling ---------------------------------------------------------------------
    def next_delay(self) -> int:
        if self._failures == 0:
            return self.opts.interval
        return min(BACKOFF_MAX, self.opts.interval * 2**self._failures)

    def _is_due(self, page: int, now: float) -> bool:
        interval = (self.map.pages if self.map else {}).get(page, self.opts.interval)
        return interval <= self.opts.interval or self._due.get(page, 0.0) <= now

    async def async_poll_once(self) -> None:
        if self.map is None or self._client is None:
            return
        now = time.monotonic()
        due = [p for p in sorted(self.map.needed_pages()) if self._is_due(p, now)]
        failed: str | None = None
        changed_project: list[int] = []
        for i, page in enumerate(due):
            if i:
                await asyncio.sleep(SPACING)
            try:
                ucid, values = await self._client.read_page(page)
            except TecomatAuthError:
                failed = "auth"
                break
            except TecomatError as err:
                _LOGGER.debug("Topení PAGE%s not readable: %s", page, err)
                failed = "unreachable"
                break
            expected = self.map.ucid.get(page)
            if expected is not None and ucid != expected:
                changed_project.append(page)
                self._pages.pop(page, None)
            else:
                self._pages[page] = values
            self._due[page] = now + self.map.pages.get(page, self.opts.interval)
        self._apply(failed, changed_project)

    def _apply(self, failed: str | None, changed_project: list[int]) -> None:
        issues = ir.async_get(self.hass)
        if failed:
            self._failures += 1
            self._source = failed
            if failed == "auth" and issues.async_get_issue(DOMAIN, ISSUE_AUTH) is None:
                _LOGGER.warning("Topení: the PLC rejected the login")
                ir.async_create_issue(
                    self.hass,
                    DOMAIN,
                    ISSUE_AUTH,
                    is_fixable=False,
                    severity=ir.IssueSeverity.WARNING,
                    translation_key=ISSUE_AUTH,
                )
        else:
            self._failures = 0
            self._source = "ok"
            self._updated_at = dt_util.utcnow()
            ir.async_delete_issue(self.hass, DOMAIN, ISSUE_AUTH)
            self._recompute()
        self._project_changed = bool(changed_project)
        if changed_project:
            ir.async_create_issue(
                self.hass,
                DOMAIN,
                ISSUE_PROJECT,
                is_fixable=False,
                severity=ir.IssueSeverity.WARNING,
                translation_key=ISSUE_PROJECT,
                translation_placeholders={"pages": ", ".join(f"PAGE{p}" for p in changed_project)},
            )
        elif not failed:
            ir.async_delete_issue(self.hass, DOMAIN, ISSUE_PROJECT)
        elif self.map is not None:
            self._recompute_alerts(dt_util.now())
        self._notify()

    def _recompute(self) -> None:
        assert self.map is not None
        now = dt_util.now()
        self._res = resolve(self.map, self._pages, weekday=now.isoweekday())
        values = self._res.values
        energy = _state_number(
            self.hass, self._bindings().get(BINDING_ENERGY), {"Wh": 0.001, "MWh": 1000.0}
        )
        on = values.get("heat_pump.compressor_on")
        self._counters.update(
            now,
            on if isinstance(on, bool) else None,
            outdoor=values.get("outdoor.temp"),
            energy_total=energy,
            faults=self._res.active_faults(),
        )
        self._recompute_alerts(now)
        self._detect_changes(now)
        self._store.async_delay_save(self._store_blob, 30)
        self._record_solar_sample(now, self._res)
        self._late_poll = False

    def _store_blob(self) -> dict[str, Any]:
        return {
            "counters": self._counters.as_dict(),
            "changes": self._changes.as_dict(),
            "alerts": self._alerts.as_dict(),
        }

    async def _persist_store(self, *, immediate: bool = False) -> None:
        blob = self._store_blob()
        if immediate:
            await self._store.async_save(blob)
        else:
            self._store.async_delay_save(lambda: blob, 30)

    def _recompute_alerts(self, now) -> None:
        stale = (
            self._source != "ok"
            or self._updated_at is None
            or now - self._updated_at > timedelta(seconds=max(120, 3 * self.opts.interval))
        )
        winter = self._res.values.get("mode.winter")
        ctx = EvalContext(
            now=now,
            values=self._res.values,
            mapped=self._res.mapped,
            activity=derive_activity(self._res.values, any_fault=bool(self._res.active_faults())),
            source=self._source,
            stale=stale,
            updated_at=self._updated_at,
            faults_active=[(k, lbl) for k, lbl, on in self._res.faults if on],
            project_changed=self._project_changed,
            winter=winter if isinstance(winter, bool) else None,
        )
        prev = {a.id: a for a in self._active_alerts}
        self._active_alerts = evaluate_alerts(ctx, self._alerts)
        startup_skip = self._alerts.poll_count <= 2
        notify_plan = plan_notifications(
            state=self._alerts,
            prev_active=prev,
            now_active=self._active_alerts,
            now=now,
            startup_skip=startup_skip,
        )
        if notify_plan.calls:

            def has_notify() -> bool:
                return self.hass.services.has_service(DOMAIN, "notify")

            self.hass.async_create_task(
                dispatch_notify(
                    self.hass, self.opts.alert_recipient, notify_plan.calls, has_service=has_notify
                )
            )
        self._prev_alerts = {a.id: a for a in self._active_alerts}

    def _detect_changes(self, now) -> None:
        new_entries = self._changes.detect(
            now,
            self._res.values,
            self._res.mapped,
            self._res.schedules,
            late=self._late_poll,
        )
        if not new_entries or not self.opts.alert_recipient:
            return

        def has_notify() -> bool:
            return self.hass.services.has_service(DOMAIN, "notify")

        for entry in new_entries:
            if entry.key not in IMMEDIATE_NOTIFY_KEYS:
                continue
            msg = format_change_notify(entry.label, entry.old, entry.new, entry.key)
            self.hass.async_create_task(
                dispatch_notify(
                    self.hass,
                    self.opts.alert_recipient,
                    [
                        {
                            "title": "Změna na regulaci topení",
                            "message": msg,
                            "priority": "high",
                            "tag": f"heating.change.{entry.key}",
                        }
                    ],
                    has_service=has_notify,
                )
            )

    def changes(self) -> list[dict[str, Any]]:
        return [e.as_dict() for e in self._changes.entries]

    def _record_solar_sample(self, now, res: Resolved) -> None:
        if not any(k in res.mapped for k in ("extras.solar_temp", "extras.solar_pump")):
            return
        values = res.values
        collector = values.get("extras.solar_temp")
        tank = values.get("tank.bottom")
        pump = values.get("extras.solar_pump")
        self._solar_samples.append(
            SolarSample(
                now,
                float(collector) if isinstance(collector, int | float) else None,
                float(tank) if isinstance(tank, int | float) else None,
                pump if isinstance(pump, bool) else None,
            )
        )
        self._solar_samples = trim_solar_samples(self._solar_samples, now)

    # --- read side -------------------------------------------------------------------
    @property
    def source(self) -> str:
        return self._source

    def entity_keys(self) -> list[str]:
        """Contract keys that get an entity (mapped ones) + derived counters."""
        mapped = [k for k in KEYS if self.map and k in self.map.keys]
        return [*mapped, *DERIVED]

    def value(self, key: str) -> Any:
        if key == "compressor_runtime_h":
            return round(self._counters.runtime_h, 3) if self._counters.day else None
        if key == "compressor_starts":
            return self._counters.starts if self._counters.day else None
        if key == "energy_kwh":
            today = self._counters.energy_today
            return round(today, 3) if today is not None else None
        if key == "activity":
            return self.payload()["activity"] if self._updated_at else None
        return self._res.values.get(key)

    def payload(self) -> dict[str, Any]:
        now = dt_util.utcnow()
        if self.map is None:
            return empty_payload("unconfigured", now)
        stale = (
            self._source != "ok"
            or self._updated_at is None
            or now - self._updated_at > timedelta(seconds=max(120, 3 * self.opts.interval))
        )
        power = _state_number(self.hass, self._bindings().get(BINDING_POWER), {"kW": 1000.0})
        return build_payload(
            self._res,
            self._counters,
            source=self._source,
            updated_at=self._updated_at,
            now=now,
            stale=stale,
            power_w=power,
            monitored=len(self.map.faults),
            solar_samples=tuple(self._solar_samples),
            alerts=[a.as_dict() for a in self._active_alerts],
        )

    def alert_summary(self) -> tuple[int, list[dict[str, str]]]:
        """Count of active alerts ≥ warning and compact id list for entities."""
        warn = [a for a in self._active_alerts if a.severity in ("warning", "critical")]
        return len(warn), [{"id": a.id, "severity": a.severity} for a in self._active_alerts]

    @callback
    def add_listener(self, listener: Callable[[], None]) -> Callable[[], None]:
        self._listeners.append(listener)

        @callback
        def remove() -> None:
            if listener in self._listeners:
                self._listeners.remove(listener)

        return remove

    @callback
    def _notify(self) -> None:
        for listener in list(self._listeners):
            listener()
