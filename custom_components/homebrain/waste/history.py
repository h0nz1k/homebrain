"""Persistent waste collection history (Odpady).

Most waste sources only publish the future: the ``waste_collection_schedule`` sensor and calendar
drop a pickup at midnight of its day or right after it, so "when was it collected last" is lost.
HomeBrain therefore remembers every collection it has observed on the bound waste entities in an
HA ``Store`` (``.storage/homebrain.waste_history``):

* ``waste_next*`` sensors – date attributes (WCS ``type-state``) or a date state + ``waste_type``;
* ``waste_dataset`` – ``waste_dashboard.events`` (cancelled/unavailable events are skipped);
* ``waste_history`` – a sensor whose ``history`` attribute maps past dates to labels (seed, e.g.
  the municipal-web parser's status file), or plain date attributes;
* ``waste_calendar`` – ``calendar.get_events`` for a window around today (read only).

Future observations are kept too, so a pickup survives the midnight its source drops it. A future
record is forgotten again when the same source no longer lists it before its day (rescheduled
or cancelled). Labels are stored as published; the frontend maps them to waste types.
"""

from __future__ import annotations

import json
import logging
import re
import unicodedata
from collections.abc import Callable, Iterable, Mapping
from datetime import date, datetime, timedelta
from typing import Any

from homeassistant.core import Event, EventStateChangedData, HomeAssistant, State, callback
from homeassistant.helpers.event import (
    async_track_state_change_event,
    async_track_time_interval,
)
from homeassistant.helpers.storage import Store
from homeassistant.util import dt as dt_util

_LOGGER = logging.getLogger(__name__)

STORAGE_KEY = "homebrain.waste_history"
STORAGE_VERSION = 1
SAVE_DELAY_S = 10
RETENTION_DAYS = 400
CALENDAR_PAST_DAYS = 45
CALENDAR_FUTURE_DAYS = 120
REFRESH_INTERVAL = timedelta(hours=3)
MAX_LABEL = 80
_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
_ISO_DATETIME_RE = re.compile(r"^\d{4}-\d{2}-\d{2}T")

Observation = tuple[str, str]  # (YYYY-MM-DD, label)


def _valid_date(value: Any) -> str | None:
    if not isinstance(value, str) or not _DATE_RE.match(value):
        return None
    try:
        date.fromisoformat(value)
    except ValueError:
        return None
    return value


def _label(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    text = re.sub(r"\s+", " ", value).strip()
    return text[:MAX_LABEL] if text else None


def label_key(label: str) -> str:
    """Diacritics/case-insensitive key, so 'Papír' and 'Papir' are one record."""
    text = unicodedata.normalize("NFD", label)
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    return re.sub(r"[^a-z0-9]+", " ", text.lower()).strip()


def _local_date(value: Any) -> str | None:
    if isinstance(value, datetime):
        return dt_util.as_local(value).date().isoformat()
    if isinstance(value, date):
        return value.isoformat()
    if not isinstance(value, str):
        return None
    if day := _valid_date(value):
        return day
    if _ISO_DATETIME_RE.match(value) and (parsed := dt_util.parse_datetime(value)) is not None:
        return dt_util.as_local(parsed).date().isoformat() if parsed.tzinfo else value[:10]
    return None


def _date_pairs(mapping: Mapping[str, Any]) -> list[Observation]:
    out: list[Observation] = []
    for key, value in mapping.items():
        if (day := _valid_date(key)) and (label := _label(value)):
            out.append((day, label))
    return out


def observations_from_state(key: str, state: State | None) -> list[Observation] | None:
    """Collections listed by a bound sensor; ``None`` = nothing usable (do not prune)."""
    if state is None or state.state in ("unavailable", "unknown", ""):
        return None
    attrs = state.attributes
    if key == "waste_dataset":
        raw = attrs.get("waste_dashboard")
        if isinstance(raw, str):
            try:
                raw = json.loads(raw)
            except ValueError:
                return None
        if not isinstance(raw, Mapping) or not isinstance(raw.get("events"), list):
            return None
        out: list[Observation] = []
        for event in raw["events"]:
            if not isinstance(event, Mapping):
                continue
            if event.get("availability") in ("cancelled", "unavailable"):
                continue
            day = _valid_date(event.get("collection_date"))
            label = _label(event.get("display_name")) or _label(event.get("waste_type"))
            if day and label:
                out.append((day, label))
        return out
    out = _date_pairs(attrs)
    history = attrs.get("history")
    if isinstance(history, Mapping):
        out += _date_pairs(history)
    elif isinstance(history, list):
        for item in history:
            if isinstance(item, Mapping):
                day = _valid_date(item.get("date"))
                label = _label(item.get("label") or item.get("type"))
                if day and label:
                    out.append((day, label))
    if not out and (day := _local_date(state.state)):
        label = _label(attrs.get("waste_type")) or _label(attrs.get("friendly_name"))
        if label:
            out.append((day, label))
    return out


def observations_from_calendar(events: Iterable[Any]) -> list[Observation]:
    """``calendar.get_events`` response items -> observations."""
    out: list[Observation] = []
    for event in events:
        if not isinstance(event, Mapping):
            continue
        start = event.get("start")
        if isinstance(start, Mapping):
            start = start.get("date") or start.get("dateTime")
        day = _local_date(start)
        label = _label(event.get("summary"))
        if day and label:
            out.append((day, label))
    return out


class WasteHistory:
    """In-memory records + HA Store persistence."""

    def __init__(self, hass: HomeAssistant) -> None:
        self.hass = hass
        self._store: Store[dict[str, Any]] = Store(hass, STORAGE_VERSION, STORAGE_KEY)
        # "date|label_key" -> {"date", "label", "sources": [entity_id, ...]}
        self._records: dict[str, dict[str, Any]] = {}

    async def async_load(self) -> None:
        data = await self._store.async_load() or {}
        for item in data.get("records", []):
            if not isinstance(item, Mapping):
                continue
            day, label = _valid_date(item.get("date")), _label(item.get("label"))
            if not day or not label:
                continue
            sources = [s for s in item.get("sources", []) if isinstance(s, str)]
            self._records[f"{day}|{label_key(label)}"] = {
                "date": day,
                "label": label,
                "sources": sources,
            }

    def _data(self) -> dict[str, Any]:
        return {"records": sorted(self._records.values(), key=lambda r: (r["date"], r["label"]))}

    def _save(self) -> None:
        self._store.async_delay_save(self._data, SAVE_DELAY_S)

    async def async_flush(self) -> None:
        await self._store.async_save(self._data())

    def observe(self, source: str, observations: list[Observation] | None, today: date) -> bool:
        """Merge one complete listing of ``source``; returns whether anything changed."""
        if observations is None:
            return False
        today_key = today.isoformat()
        oldest = (today - timedelta(days=RETENTION_DAYS)).isoformat()
        changed = False
        seen: set[str] = set()
        for day, label in observations:
            if day < oldest:
                continue
            key = f"{day}|{label_key(label)}"
            if not label_key(label):
                continue
            seen.add(key)
            record = self._records.get(key)
            if record is None:
                self._records[key] = {"date": day, "label": label, "sources": [source]}
                changed = True
            elif source not in record["sources"]:
                record["sources"].append(source)
                changed = True
        if seen:
            horizon = max(key.split("|", 1)[0] for key in seen)
            # A future pickup the source no longer lists (within what it lists) was moved or
            # cancelled. Today and the past are never forgotten: sources drop them at midnight.
            for key, record in list(self._records.items()):
                if (
                    key not in seen
                    and today_key < record["date"] <= horizon
                    and source in record["sources"]
                ):
                    record["sources"].remove(source)
                    if not record["sources"]:
                        del self._records[key]
                    changed = True
        for key in [k for k, r in self._records.items() if r["date"] < oldest]:
            del self._records[key]
            changed = True
        if changed:
            self._save()
        return changed

    def records(self) -> list[dict[str, str]]:
        """Every remembered pickup (past and future), oldest first."""
        return [
            {"date": r["date"], "label": r["label"]}
            for r in sorted(self._records.values(), key=lambda r: (r["date"], r["label"]))
        ]

    def history(self, today: date) -> list[dict[str, str]]:
        """Collections up to and including today, oldest first."""
        today_key = today.isoformat()
        return [
            {"date": r["date"], "label": r["label"]}
            for r in sorted(self._records.values(), key=lambda r: (r["date"], r["label"]))
            if r["date"] <= today_key
        ]


class WasteHistoryManager:
    """Watches the bound waste entities and feeds :class:`WasteHistory`."""

    def __init__(self, hass: HomeAssistant, bindings: Callable[[], Mapping[str, str]]) -> None:
        self.hass = hass
        self.store = WasteHistory(hass)
        self._bindings = bindings
        self._unsubs: list[Callable[[], None]] = []
        self._unsub_states: Callable[[], None] | None = None
        self._bound: dict[str, str] = {}  # entity_id -> logical key
        self.last_refresh: datetime | None = None

    def _today(self) -> date:
        return dt_util.now().date()

    @callback
    def update_bindings(self) -> None:
        """Re-read the waste bindings and (re)subscribe to their sensors."""
        bound = {entity: key for key, entity in self._bindings().items() if entity}
        if bound == self._bound and (self._unsub_states or not bound):
            return
        self._bound = bound
        if self._unsub_states:
            self._unsub_states()
            self._unsub_states = None
        sensors = [entity for entity, key in bound.items() if key != "waste_calendar"]
        if sensors:
            self._unsub_states = async_track_state_change_event(
                self.hass, sensors, self._state_changed
            )

    async def async_start(self) -> None:
        await self.store.async_load()
        self._unsubs.append(async_track_time_interval(self.hass, self._interval, REFRESH_INTERVAL))
        await self.async_refresh()

    async def async_stop(self) -> None:
        while self._unsubs:
            self._unsubs.pop()()
        if self._unsub_states:
            self._unsub_states()
            self._unsub_states = None
        await self.store.async_flush()

    @callback
    def _state_changed(self, event: Event[EventStateChangedData]) -> None:
        entity_id = event.data["entity_id"]
        key = self._bound.get(entity_id)
        if key:
            self.store.observe(
                entity_id, observations_from_state(key, event.data.get("new_state")), self._today()
            )

    async def _interval(self, _now: datetime) -> None:
        await self.async_refresh()

    async def async_refresh(self) -> None:
        """Read every bound entity once (sensors from the state machine, calendars via service)."""
        self.update_bindings()
        today = self._today()
        for entity_id, key in self._bound.items():
            if key == "waste_calendar":
                await self._refresh_calendar(entity_id, today)
            else:
                self.store.observe(
                    entity_id, observations_from_state(key, self.hass.states.get(entity_id)), today
                )
        self.last_refresh = dt_util.utcnow()
        self._update_horizon_issue()

    def _update_horizon_issue(self) -> None:
        # Imported here: horizon.py reuses this module's label helpers.
        from .horizon import async_update_horizon_issue, compute_horizon

        records = self.store.records() if self._bound else []
        async_update_horizon_issue(self.hass, compute_horizon(records, dt_util.now()))

    async def _refresh_calendar(self, entity_id: str, today: date) -> None:
        if not self.hass.services.has_service("calendar", "get_events"):
            return
        if self.hass.states.get(entity_id) is None:
            return
        start = dt_util.start_of_local_day(today - timedelta(days=CALENDAR_PAST_DAYS))
        end = dt_util.start_of_local_day(today + timedelta(days=CALENDAR_FUTURE_DAYS))
        try:
            response = await self.hass.services.async_call(
                "calendar",
                "get_events",
                {"start_date_time": start, "end_date_time": end},
                target={"entity_id": entity_id},
                blocking=True,
                return_response=True,
            )
        except Exception as err:  # noqa: BLE001 - a broken calendar must not break HomeBrain
            _LOGGER.debug("Waste calendar %s not readable: %s", entity_id, err)
            return
        result = (response or {}).get(entity_id)
        events = result.get("events") if isinstance(result, Mapping) else None
        if isinstance(events, list):
            self.store.observe(entity_id, observations_from_calendar(events), today)
