"""Hlídání domu – Home Assistant glue around the pure engine (read-only towards HA).

* **Monitored entities** come from the entity and device registry: allowlisted domains, enabled,
  visible, primary (no ``entity_category``) entities that belong to a device, never HomeBrain's
  own. Grouping is per device, so entities without a device are not watched.
* **Learning** runs once a night (03:30 local) and after the first start: recorder state rows
  and hourly statistics in batches of ``LEARN_BATCH`` entities, each batch one recorder
  executor job (learning itself runs in the same job, off the event loop).
* **Live**: a state-change listener limited to monitored entities, ``last_reported`` polled in
  the 60 s evaluation (repeated identical values do not fire ``state_changed``).
* **Restart safety**: the last evaluation time is stored; on start-up the gap until now is a
  downtime for the engine (clocks pause, 15 min grace).
* **Owner actions** (including permanent device exclusion) only change HomeBrain's own ``Store``.
  Phase 1 never calls a service, never notifies and never writes to HA.
"""

from __future__ import annotations

import logging
from collections.abc import Callable, Collection
from dataclasses import dataclass
from datetime import datetime, timedelta, tzinfo
from typing import Any, Final, TypedDict
from zoneinfo import ZoneInfo

from homeassistant.core import Event, EventStateChangedData, HomeAssistant, callback
from homeassistant.helpers import area_registry as ar
from homeassistant.helpers import device_registry as dr
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers.event import (
    async_call_later,
    async_track_state_change_event,
    async_track_time_change,
    async_track_time_interval,
)
from homeassistant.helpers.storage import Store
from homeassistant.util import dt as dt_util
from homeassistant.util import slugify

from ..const import DOMAIN
from .engine import Engine
from .learn import EntityBaseline, learn_entity
from .model import (
    SILENT_KINDS,
    TIER_KEYS,
    Config,
    Downtime,
    EntityMeta,
    Report,
    Sample,
    Tier,
)

_LOGGER = logging.getLogger(__name__)

STORAGE_KEY: Final = "homebrain.anomaly_watch"
STORAGE_VERSION: Final = 1
SAVE_DELAY_S: Final = 120
EVALUATE_EVERY: Final = timedelta(seconds=60)
FIRST_LEARN_DELAY_S: Final = 120
LEARN_BATCH: Final = 50
LEARN_ROW_LIMIT: Final = 5000  # newest rows per entity; chatty sensors are learnt from these
RELEARN_AFTER: Final = timedelta(hours=26)
REGISTRY_DEBOUNCE_S: Final = 30
MAX_ENTITIES: Final = 1500
MUTE_DAYS: Final = 7
RESOLVED_RECHECK: Final = timedelta(hours=2)  # "Vyřešeno" but still broken → shown again
HEALTH_HOURS: Final = 24
DOMAINS: Final = frozenset(
    {"sensor", "binary_sensor", "light", "switch", "climate", "lock", "cover", "fan"}
)
ACK_RESOLVED: Final = "resolved"
ACK_OK: Final = "ok"


class ExcludedDevice(TypedDict):
    id: str
    name: str
    area: str | None
    excluded_at: str


def build_metas(hass: HomeAssistant, excluded: Collection[str] = ()) -> list[EntityMeta]:
    """Watched entities from the registries (see module docstring), at most ``MAX_ENTITIES``."""
    ent_reg = er.async_get(hass)
    dev_reg = dr.async_get(hass)
    area_reg = ar.async_get(hass)
    metas: list[EntityMeta] = []
    for entry in sorted(ent_reg.entities.values(), key=lambda e: e.entity_id):
        if (
            entry.domain not in DOMAINS
            or entry.platform == DOMAIN
            or entry.disabled_by is not None
            or entry.hidden_by is not None
            or entry.entity_category is not None
            or entry.device_id is None
            or entry.device_id in excluded
        ):
            continue
        device = dev_reg.async_get(entry.device_id)
        if device is None or device.disabled_by is not None:
            continue
        state = hass.states.get(entry.entity_id)
        attrs = state.attributes if state else {}
        device_name = device.name_by_user or device.name or entry.entity_id
        name = (state.name if state else None) or entry.name or entry.original_name or device_name
        area_id = entry.area_id or device.area_id
        area = area_reg.async_get_area(area_id) if area_id else None
        numeric = entry.domain == "sensor" and bool(
            attrs.get("state_class")
            or (entry.capabilities or {}).get("state_class")
            or attrs.get("unit_of_measurement")
        )
        metas.append(
            EntityMeta(
                entity_id=entry.entity_id,
                name=str(name),
                device_id=entry.device_id,
                device_name=str(device_name),
                kind="numeric" if numeric else "discrete",
                device_class=entry.device_class
                or entry.original_device_class
                or attrs.get("device_class"),
                integration=entry.platform,
                unit=attrs.get("unit_of_measurement") or entry.unit_of_measurement,
                area=area.name if area else None,
            )
        )
        if len(metas) >= MAX_ENTITIES:
            break
    return metas


def _tariff_start(
    hass: HomeAssistant, registry: er.EntityRegistry, eid: str
) -> tuple[bool, datetime | None]:
    """Whether this is a tariff meter and when its current active period started."""
    entry = registry.async_get(eid)
    state = hass.states.get(eid)
    tariff = state.attributes.get("tariff") if state else None
    meter_id = None
    if entry and entry.config_entry_id and entry.unique_id.startswith(f"{entry.config_entry_id}_"):
        meter_id = entry.config_entry_id
        tariff = tariff or entry.unique_id[len(meter_id) + 1 :]
    object_id = eid.split(".", 1)[1]
    if not tariff and object_id.endswith(("_nt", "_vt")):
        tariff = object_id.rsplit("_", 1)[1]
    if not isinstance(tariff, str) or not tariff:
        return False, None
    suffix = f"_{tariff}"
    if meter_id is None and entry and entry.unique_id.endswith(suffix):
        meter_id = entry.unique_id[: -len(suffix)]
    select_id = (
        registry.async_get_entity_id("select", "utility_meter", meter_id) if meter_id else None
    )
    suffix = f"_{slugify(tariff)}"
    if select_id is None and object_id.endswith(suffix):
        select_id = f"select.{object_id[: -len(suffix)]}"
    select = hass.states.get(select_id) if select_id else None
    return True, select.last_changed if select and select.state == tariff else None


def _fetch_and_learn(
    hass: HomeAssistant,
    metas: list[EntityMeta],
    downtimes: list[Downtime],
    first_seen: dict[str, datetime],
    until: datetime,
    tz: tzinfo,
    cfg: Config,
) -> dict[str, EntityBaseline]:
    """Recorder executor job: read one batch of history and learn it (never on the loop)."""
    from homeassistant.components.recorder.history import (  # noqa: PLC0415
        state_changes_during_period,
    )
    from homeassistant.components.recorder.statistics import (  # noqa: PLC0415
        statistics_during_period,
    )

    start = until - timedelta(days=cfg.learn_days)
    numeric = {m.entity_id for m in metas if m.kind == "numeric"}
    stats = (
        statistics_during_period(hass, start, until, numeric, "hour", None, {"mean"})
        if numeric
        else {}
    )
    out: dict[str, EntityBaseline] = {}
    for meta in metas:
        states = state_changes_during_period(
            hass,
            start,
            until,
            meta.entity_id,
            no_attributes=True,
            descending=True,
            limit=LEARN_ROW_LIMIT,
            include_start_time_state=False,
        ).get(meta.entity_id, [])
        rows = [Sample(meta.entity_id, s.last_updated, s.state) for s in reversed(states)]
        hourly = [
            (_as_datetime(row["start"]), float(row["mean"]))
            for row in stats.get(meta.entity_id) or []
            if row.get("mean") is not None
        ]
        b = learn_entity(
            meta, rows, hourly, downtimes, until, tz, cfg, first_seen.get(meta.entity_id)
        )
        if b is not None:
            out[meta.entity_id] = b
    return out


def _as_datetime(value: Any) -> datetime:
    if isinstance(value, datetime):
        return value
    return dt_util.utc_from_timestamp(float(value))


def _ts(value: Any) -> datetime | None:
    return dt_util.parse_datetime(value) if isinstance(value, str) else None


@dataclass
class Snapshot:
    """Last evaluation, what the WebSocket API serves."""

    now: datetime
    reports: list[Report]


class AnomalyWatch:
    """One per HA instance (``hass.data[DOMAIN]["anomaly"]``)."""

    def __init__(self, hass: HomeAssistant, config: Config | None = None) -> None:
        self.hass = hass
        self.cfg = config or Config()
        self.tz: tzinfo = ZoneInfo(hass.config.time_zone)
        self.store: Store[dict[str, Any]] = Store(hass, STORAGE_VERSION, STORAGE_KEY)
        self.engine = Engine([], {}, self.tz, self.cfg)
        self.first_seen: dict[str, datetime] = {}
        self.learned_at: datetime | None = None
        self.learning = False
        self._excluded_during_learning: set[str] = set()
        self.exclusions: dict[str, ExcludedDevice] = {}
        self.acks: dict[str, dict[str, Any]] = {}
        self.mutes: dict[str, datetime] = {}
        self.health: dict[str, int] = {}  # local hour start (iso) → highest tier
        self.snapshot = Snapshot(dt_util.now(), [])
        self._unsubs: list[Callable[[], None]] = []
        self._unsub_states: Callable[[], None] | None = None
        self._unsub_rebuild: Callable[[], None] | None = None
        self._started = False

    # ------------------------------------------------------------ lifecycle
    async def async_start(self) -> None:
        raw = await self.store.async_load() or {}
        now = dt_util.now()
        # Older v1 stores lack this optional field.
        self.exclusions = raw.get("excluded_devices") or {}
        self.engine.set_metas(build_metas(self.hass, self.exclusions))
        self.first_seen = {
            k: d for k, v in (raw.get("first_seen") or {}).items() if (d := _ts(v)) is not None
        }
        self.engine.set_baselines(
            {
                str(eid): EntityBaseline.from_dict(b)
                for eid, b in (raw.get("baselines") or {}).items()
                if isinstance(b, dict) and "e" in b
            }
        )
        self.engine.restore(raw.get("engine") or {})
        # Since the last evaluation HA was not watching: the engine's clocks pause meanwhile.
        if (alive := _ts(raw.get("alive_at"))) is not None and alive < now:
            self.engine.downtime(alive, now)
        self.learned_at = _ts(raw.get("learned_at"))
        self.acks = {str(k): v for k, v in (raw.get("acks") or {}).items() if isinstance(v, dict)}
        self.mutes = {
            str(k): d
            for k, v in (raw.get("mutes") or {}).items()
            if (d := _ts(v)) is not None and d > now
        }
        self.health = {
            str(k): int(v) for k, v in (raw.get("health") or {}).items() if isinstance(v, int)
        }
        self._seed()
        self._listen_states()
        self._unsubs += [
            async_track_time_interval(self.hass, self._tick, EVALUATE_EVERY),
            async_track_time_change(self.hass, self._nightly, hour=3, minute=30, second=0),
            self.hass.bus.async_listen(er.EVENT_ENTITY_REGISTRY_UPDATED, self._registry_changed),
            self.hass.bus.async_listen(dr.EVENT_DEVICE_REGISTRY_UPDATED, self._registry_changed),
        ]
        if self.learned_at is None or now - self.learned_at >= RELEARN_AFTER:
            self._unsubs.append(async_call_later(self.hass, FIRST_LEARN_DELAY_S, self._first_learn))
        self._started = True
        self.evaluate(now)

    async def async_stop(self) -> None:
        for unsub in self._unsubs:
            unsub()
        self._unsubs.clear()
        if self._unsub_states:
            self._unsub_states()
            self._unsub_states = None
        if self._unsub_rebuild:
            self._unsub_rebuild()
            self._unsub_rebuild = None
        if self._started:
            await self.store.async_save(self._data())
        self._started = False

    # ------------------------------------------------------------ live input
    def _seed(self) -> None:
        for eid in self.engine.metas:
            if (state := self.hass.states.get(eid)) is not None:
                self.engine.seed(Sample(eid, state.last_reported, state.state))

    def _listen_states(self) -> None:
        if self._unsub_states:
            self._unsub_states()
        self._unsub_states = async_track_state_change_event(
            self.hass, list(self.engine.metas), self._state_changed
        )

    @callback
    def _state_changed(self, event: Event[EventStateChangedData]) -> None:
        new = event.data["new_state"]
        if new is not None:
            self.engine.feed(Sample(new.entity_id, new.last_reported, new.state))

    @callback
    def _registry_changed(self, _event: Event) -> None:
        if self._unsub_rebuild:
            self._unsub_rebuild()
        self._unsub_rebuild = async_call_later(self.hass, REGISTRY_DEBOUNCE_S, self._rebuild)

    @callback
    def _rebuild(self, _now: datetime | None = None) -> None:
        self._unsub_rebuild = None
        known = set(self.engine.metas)
        self.engine.set_metas(build_metas(self.hass, self.exclusions))
        for eid in set(self.engine.metas) - known:
            if (state := self.hass.states.get(eid)) is not None:
                self.engine.feed(Sample(eid, state.last_reported, state.state))
        self._listen_states()

    # ------------------------------------------------------------ evaluation
    @callback
    def _tick(self, _now: datetime) -> None:
        self.evaluate(dt_util.now())

    @callback
    def evaluate(self, now: datetime) -> Snapshot:
        registry = er.async_get(self.hass)
        tariff_starts = {}
        for eid, meta in self.engine.metas.items():
            if (state := self.hass.states.get(eid)) is not None:
                self.engine.touch(eid, state.last_reported)
            if meta.integration == "utility_meter":
                is_tariff, active_since = _tariff_start(self.hass, registry, eid)
                if is_tariff:
                    tariff_starts[eid] = active_since
        self.engine.tariff_starts = tariff_starts
        reports = self.engine.evaluate(now)
        open_keys = {r.key for r in reports}
        # An acknowledgement belongs to one occurrence: once the report closes, it is gone.
        self.acks = {k: v for k, v in self.acks.items() if k in open_keys}
        self.mutes = {k: until for k, until in self.mutes.items() if until > now}
        hour = now.astimezone(self.tz).replace(minute=0, second=0, microsecond=0)
        worst = max((int(r.tier) for r in reports if r.scope != "system"), default=0)
        key = hour.isoformat()
        self.health[key] = max(self.health.get(key, 0), worst)
        oldest = hour - timedelta(hours=HEALTH_HOURS)
        self.health = {
            k: v for k, v in self.health.items() if (d := _ts(k)) is not None and d > oldest
        }
        self.snapshot = Snapshot(now, reports)
        self.store.async_delay_save(self._data, SAVE_DELAY_S)
        return self.snapshot

    # ------------------------------------------------------------ learning
    @callback
    def _first_learn(self, _now: datetime) -> None:
        self.hass.async_create_background_task(self.async_learn(), "homebrain_anomaly_learn")

    @callback
    def _nightly(self, _now: datetime) -> None:
        self.hass.async_create_background_task(self.async_learn(), "homebrain_anomaly_learn")

    async def async_learn(self) -> int:
        """Re-learn every watched entity from the recorder; returns the number learnt."""
        if self.learning or "recorder" not in self.hass.config.components:
            return 0
        from homeassistant.components.recorder import get_instance  # noqa: PLC0415

        self.learning = True
        self._excluded_during_learning.clear()
        try:
            until = dt_util.utcnow()
            metas = [m for m in self.engine.metas.values() if not m.removed]
            downtimes = list(self.engine.downtimes)
            learnt: dict[str, EntityBaseline] = {}
            for i in range(0, len(metas), LEARN_BATCH):
                batch = [
                    m
                    for m in metas[i : i + LEARN_BATCH]
                    if m.device_id not in self._excluded_during_learning
                ]
                if not batch:
                    continue
                learnt |= await get_instance(self.hass).async_add_executor_job(
                    _fetch_and_learn,
                    self.hass,
                    batch,
                    downtimes,
                    dict(self.first_seen),
                    until,
                    self.tz,
                    self.cfg,
                )
            # An executor job may finish after an exclude or even an exclude/include pair.
            learnt = {
                eid: b
                for eid, b in learnt.items()
                if b.device_id not in self._excluded_during_learning
                and (meta := self.engine.metas.get(eid)) is not None
                and meta.device_id == b.device_id
            }
            for eid, b in learnt.items():
                start = until - timedelta(days=b.days)
                self.first_seen[eid] = min(self.first_seen.get(eid, start), start)
            self.first_seen = {k: v for k, v in self.first_seen.items() if k in self.engine.metas}
            self.engine.set_baselines(learnt)
            self.learned_at = dt_util.now()
            self.store.async_delay_save(self._data, 1)
            return len(learnt)
        finally:
            self.learning = False

    # ------------------------------------------------------------ owner actions
    def exclude(self, device_id: str) -> bool:
        if device_id in self.exclusions:
            return True
        metas = [m for m in self.engine.metas.values() if m.device_id == device_id]
        if not metas:
            return False
        now = dt_util.now()
        self.exclusions[device_id] = {
            "id": device_id,
            "name": metas[0].device_name,
            "area": metas[0].area,
            "excluded_at": now.isoformat(),
        }
        if self.learning:
            self._excluded_during_learning.add(device_id)
        for meta in metas:
            self.first_seen.pop(meta.entity_id, None)
        for report in self.snapshot.reports:
            if device_id in report.device_ids:
                self.engine.reset_report_history(report.key)
                self.acks.pop(report.key, None)
        self.mutes.pop(f"device:{device_id}", None)
        self._apply_exclusions(now)
        return True

    def include(self, device_id: str) -> bool:
        if self.exclusions.pop(device_id, None) is None:
            return False
        self._apply_exclusions(dt_util.now())
        return True

    def _apply_exclusions(self, now: datetime) -> None:
        if self._unsub_rebuild:
            self._unsub_rebuild()
        self._rebuild()
        self.evaluate(now)
        self.store.async_delay_save(self._data, 1)

    def find(self, key: str) -> Report | None:
        return next((r for r in self.snapshot.reports if r.key == key), None)

    def acknowledge(self, key: str, kind: str) -> bool:
        """``resolved`` (Vyřešeno) or ``ok`` (To je v pořádku, widens the entities' limits)."""
        report = self.find(key)
        if report is None:
            return False
        if kind == ACK_OK:
            self.engine.tolerate(report.entities)
        self.acks[key] = {
            "kind": kind,
            "tier": int(report.tier),
            "at": self.snapshot.now.isoformat(),
        }
        self.store.async_delay_save(self._data, 1)
        return True

    def mute(self, key: str, days: int = MUTE_DAYS) -> datetime:
        until = dt_util.now() + timedelta(days=days)
        self.mutes[key] = until
        self.store.async_delay_save(self._data, 1)
        return until

    def unmute(self, key: str) -> bool:
        found = self.mutes.pop(key, None) is not None
        if found:
            self.store.async_delay_save(self._data, 1)
        return found

    def hidden(self, report: Report, now: datetime) -> str | None:
        """Why the report is not shown as open: ``muted`` / ``acked`` / ``None``."""
        if (until := self.mutes.get(report.key)) is not None and until > now:
            return "muted"
        ack = self.acks.get(report.key)
        if ack is None or int(report.tier) > int(ack.get("tier", 0)):
            return None  # escalation beyond what was acknowledged always shows again
        at = _ts(ack.get("at"))
        if ack.get("kind") == ACK_RESOLVED and (at is None or now - at >= RESOLVED_RECHECK):
            return None
        return "acked"

    # ------------------------------------------------------------ persistence
    def _data(self) -> dict[str, Any]:
        return {
            "alive_at": self.snapshot.now.isoformat(),
            "learned_at": self.learned_at.isoformat() if self.learned_at else None,
            "baselines": {eid: b.as_dict() for eid, b in self.engine.baselines.items()},
            "first_seen": {k: v.isoformat() for k, v in self.first_seen.items()},
            "engine": self.engine.dump(),
            "acks": self.acks,
            "mutes": {k: v.isoformat() for k, v in self.mutes.items()},
            "health": self.health,
            "excluded_devices": self.exclusions,
        }

    # ------------------------------------------------------------ read model
    def excluded_devices(self) -> list[ExcludedDevice]:
        return sorted(self.exclusions.values(), key=lambda d: d["name"].casefold())

    def health_strip(self, now: datetime) -> list[str]:
        """Highest tier per hour for the last 24 h, oldest first (``ok`` when quiet)."""
        hour = now.astimezone(self.tz).replace(minute=0, second=0, microsecond=0)
        out: list[str] = []
        for k in range(HEALTH_HOURS - 1, -1, -1):
            # Wall-clock arithmetic in UTC keeps 24 distinct hours across DST changes.
            start = (hour.astimezone(dt_util.UTC) - timedelta(hours=k)).astimezone(self.tz)
            tier = self.health.get(start.isoformat(), 0)
            out.append(TIER_KEYS[Tier(tier)] if tier else "ok")
        return out

    def watched(self) -> dict[str, int]:
        monitored = [m for m in self.engine.metas.values() if m.entity_id in self.engine.baselines]
        return {
            "devices": len({m.device_id for m in monitored}),
            "entities": len(monitored),
            "learning": len(self.engine.warming_up()),
            "known": len(self.engine.metas),
        }

    def devices(self) -> list[dict[str, Any]]:
        """Watched devices with their entity counts (Hlídaná zařízení)."""
        out: dict[str, dict[str, Any]] = {}
        for m in self.engine.metas.values():
            if m.entity_id not in self.engine.baselines:
                continue
            d = out.setdefault(
                m.device_id,
                {"id": m.device_id, "name": m.device_name, "count": 0, "classes": []},
            )
            d["count"] += 1
            cls = m.device_class or m.domain
            if cls not in d["classes"]:
                d["classes"].append(cls)
        return sorted(out.values(), key=lambda d: d["name"].casefold())

    def reporting_siblings(self, report: Report, now: datetime) -> list[dict[str, Any]]:
        """Entities of the device that still report (for „nehlásí jen vlhkost“ copy)."""
        if report.scope != "device" or not report.device_ids:
            return []
        silent = {f.entity_id for f in report.findings if f.detector in SILENT_KINDS}
        out = []
        for eid in self.engine.device_entities(report.device_ids[0]):
            if eid in silent or eid in report.entities or self.engine.quiet(eid, now):
                continue
            m = self.engine.metas[eid]
            out.append({"name": m.name, "device_class": m.device_class, "domain": m.domain})
        return out


def get_watch(hass: HomeAssistant) -> AnomalyWatch | None:
    return hass.data.get(DOMAIN, {}).get("anomaly")
