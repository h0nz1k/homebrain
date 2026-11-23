"""Roboti: cleaning history and „naposledy uklizeno“ per room – from HA states only.

No Roborock call is ever made here (the cloud rate-limits accounts): the recorder listens
to state changes the HA Roborock integration already publishes for each configured robot:

* ``binary_sensor.*_in_cleaning`` (a run is in progress, also while paused / washing the
  mop) – without it the vacuum state decides (``cleaning``/``paused`` = run);
* ``sensor.*_current_room`` – the HA integration resolves ``map_data.vacuum_room``
  (segment id from the map it already downloads every 30 s while cleaning) to the room
  name of the *current* map (``home.current_map_data.rooms``); ``None`` when the robot is
  outside a room or the map is not loaded yet;
* the vacuum state – dwell time counts only while it is ``cleaning`` (not paused/docked);
* ``sensor.*_last_clean_start`` / ``_last_clean_end`` – the robot's own record, used to
  correct a run's times and to add runs HA did not see live; ``cleaning_area`` /
  ``cleaning_time`` give area and duration at the end of a run.

A room counts as cleaned when the robot spent ``MIN_DWELL`` in it during one run, so driving
through the hallway does not count. Room names are matched to segment ids of the maps
HomeBrain already cached (``RoomCache.peek``, never a fetch); a name that is not on any
cached map keeps ``id: None`` (another floor, renamed room) and is matched by name.

Source: ``homebrain`` when HomeBrain's own start command (panel, schedule) was sent at most
``SOURCE_WINDOW`` before the run began (``mark``), else ``aplikace`` (Roborock app, its
schedules, voice). Backfilled runs have ``source: None`` (unknown).

Storage (``.storage/homebrain.robot_history``, versioned)::

    {"runs": {"1": [Run]}, "active": {"1": Active}, "backfilled": true}

Run = ``{id, slot, start, end, duration_s, area_m2, rooms: [{id, name, dwell_s}],
source, partial}``; at most ``MAX_RUNS`` per robot and ``RETENTION`` old. ``active`` keeps
the run in progress across an HA restart: when HA comes back and the robot still cleans,
the run continues (downtime is not counted as dwell); when it has finished meanwhile, the
run is closed at the robot's ``last_clean_end`` (or the last moment HA saw it).

On first start (empty store) the history is backfilled from the recorder (bounded query in
the recorder executor, at most ``BACKFILL_DAYS``).
"""

from __future__ import annotations

import logging
import uuid
from collections.abc import Callable, Iterable, Mapping
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Any, Final

from homeassistant.core import (
    CALLBACK_TYPE,
    Event,
    EventStateChangedData,
    HomeAssistant,
    State,
    callback,
)
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers.event import async_track_state_change_event
from homeassistant.helpers.storage import Store
from homeassistant.util import dt as dt_util

from ..const import DOMAIN
from .config import ROBOT_SLOTS
from .discovery import _companion_devices, _vacuum_device

_LOGGER = logging.getLogger(__name__)

STORAGE_KEY: Final = f"{DOMAIN}.robot_history"
STORAGE_VERSION: Final = 1
SAVE_DELAY_S: Final = 15
MIN_DWELL: Final = 60.0
SOURCE_WINDOW: Final = timedelta(minutes=2)
MIN_RUN: Final = timedelta(seconds=60)
RETENTION: Final = timedelta(days=90)
MAX_RUNS: Final = 200
BACKFILL_DAYS: Final = 30
# A robot record (last_clean_start/end) belongs to a run when the starts are this close.
RECORD_MATCH: Final = timedelta(minutes=10)
RECENT_LIMIT: Final = 50
MAX_NAME: Final = 60

SOURCE_HOMEBRAIN: Final = "homebrain"
SOURCE_APP: Final = "aplikace"
RUN_STATES: Final = ("cleaning", "paused")
IDLE_STATES: Final = ("docked", "idle")
UNAVAILABLE: Final = ("unavailable", "unknown")

# (domain, translation_key) on the robot device -> role. Found in the entity registry at
# runtime (HA Roborock), so existing installs need no new bindings.
HISTORY_KEYS: Final[dict[tuple[str, str], str]] = {
    ("binary_sensor", "in_cleaning"): "in_cleaning",
    ("sensor", "current_room"): "current_room",
    ("sensor", "last_clean_start"): "last_clean_start",
    ("sensor", "last_clean_end"): "last_clean_end",
    ("sensor", "cleaning_area"): "cleaning_area",
    ("sensor", "cleaning_time"): "cleaning_time",
}
ROLES: Final = (
    "vacuum",
    "in_cleaning",
    "current_room",
    "last_clean_start",
    "last_clean_end",
    "cleaning_area",
    "cleaning_time",
    "selected_map",
)


# --- pure helpers -----------------------------------------------------------------------


def _iso(value: datetime) -> str:
    return dt_util.as_utc(value).isoformat()


def parse_time(value: Any) -> datetime | None:
    if isinstance(value, datetime):
        return dt_util.as_utc(value)
    if not isinstance(value, str) or not value:
        return None
    parsed = dt_util.parse_datetime(value)
    if parsed is None:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=dt_util.UTC)
    return dt_util.as_utc(parsed)


def room_name(state: str | None) -> str | None:
    """``current_room`` state → room name (``None`` outside rooms / unknown)."""
    if not state or state in UNAVAILABLE or state == "none":
        return None
    name = " ".join(state.split())[:MAX_NAME]
    return name or None


def run_flag(vacuum: str | None, in_cleaning: str | None, previous: bool) -> bool | None:
    """Is a cleaning run in progress? ``None`` = unknown (robot unavailable)."""
    if in_cleaning in ("on", "off"):
        return in_cleaning == "on"
    if in_cleaning is not None and in_cleaning in UNAVAILABLE:
        return None
    if vacuum is None or vacuum in UNAVAILABLE:
        return None
    if vacuum in RUN_STATES:
        return True
    if vacuum in IDLE_STATES:
        return False
    return previous  # returning / error: the run neither starts nor ends here


def duration_seconds(state: str | None, unit: Any) -> float | None:
    """``cleaning_time`` state in its display unit (HA suggests minutes) → seconds."""
    try:
        value = float(state) if state is not None else None
    except ValueError:
        return None
    if value is None or value < 0:
        return None
    factor = {"s": 1, "min": 60, "h": 3600, "d": 86400}.get(str(unit or "s"), 1)
    return value * factor


def area_value(state: str | None) -> float | None:
    try:
        value = float(state) if state is not None else None
    except ValueError:
        return None
    return round(value, 1) if value is not None and 0 <= value < 10_000 else None


@dataclass
class Observation:
    """What the HA states say about one robot at one moment."""

    at: datetime
    running: bool | None
    moving: bool
    room: str | None
    area: float | None = None
    duration: float | None = None
    map: str | None = None


@dataclass
class ActiveRun:
    start: datetime
    last_seen: datetime
    source: str | None
    map: str | None = None
    room: str | None = None
    since: datetime | None = None
    dwell: dict[str, float] = field(default_factory=dict)
    area: float | None = None
    duration: float | None = None

    def close_segment(self, at: datetime) -> None:
        if self.room and self.since and at > self.since:
            self.dwell[self.room] = (
                self.dwell.get(self.room, 0.0) + (at - self.since).total_seconds()
            )
        self.since = None

    def to_dict(self) -> dict[str, Any]:
        """Stored form; the open room segment is counted up to ``last_seen``."""
        dwell = dict(self.dwell)
        if self.room and self.since and self.last_seen > self.since:
            dwell[self.room] = (
                dwell.get(self.room, 0.0) + (self.last_seen - self.since).total_seconds()
            )
        return {
            "start": _iso(self.start),
            "last_seen": _iso(self.last_seen),
            "source": self.source,
            "map": self.map,
            "room": self.room,
            "dwell": {k: round(v, 1) for k, v in dwell.items()},
            "area": self.area,
            "duration": self.duration,
        }

    @classmethod
    def from_dict(cls, raw: Any) -> ActiveRun | None:
        if not isinstance(raw, Mapping):
            return None
        start, seen = parse_time(raw.get("start")), parse_time(raw.get("last_seen"))
        if start is None or seen is None:
            return None
        dwell_raw = raw.get("dwell")
        dwell = (
            {
                str(k)[:MAX_NAME]: float(v)
                for k, v in dwell_raw.items()
                if isinstance(v, int | float) and v >= 0
            }
            if isinstance(dwell_raw, Mapping)
            else {}
        )
        source = raw.get("source")
        return cls(
            start=start,
            last_seen=seen,
            source=source if source in (SOURCE_HOMEBRAIN, SOURCE_APP) else None,
            map=raw.get("map") if isinstance(raw.get("map"), str) else None,
            room=None,
            since=None,
            dwell=dwell,
            area=area_value(str(raw.get("area"))) if raw.get("area") is not None else None,
            duration=raw.get("duration") if isinstance(raw.get("duration"), int | float) else None,
        )


class RunTracker:
    """State machine of one robot: observations in, finished runs out (pure, no HA)."""

    def __init__(self, slot: int) -> None:
        self.slot = slot
        self.active: ActiveRun | None = None
        self.mark: datetime | None = None
        self.unknown_source = False  # backfill: HomeBrain commands are not in the recorder

    @property
    def running(self) -> bool:
        return self.active is not None

    def note_command(self, at: datetime) -> None:
        self.mark = at

    def _source(self, start: datetime) -> str | None:
        if self.unknown_source:
            return None
        if self.mark and timedelta(seconds=-5) <= start - self.mark <= SOURCE_WINDOW:
            return SOURCE_HOMEBRAIN
        return SOURCE_APP

    def resume(self, obs: Observation, last_end: datetime | None) -> dict[str, Any] | None:
        """After an HA restart: continue the stored run or close it (returns the record)."""
        run = self.active
        if run is None or obs.running is None:
            return None
        if obs.running:
            run.room, run.since = obs.room, (obs.at if obs.moving and obs.room else None)
            run.last_seen = obs.at
            return None
        end = last_end if last_end and run.start < last_end <= obs.at else run.last_seen
        return self._finish(end, obs)

    def observe(self, obs: Observation) -> dict[str, Any] | None:
        """Feed one observation; returns the finished run record when a run ends."""
        run = self.active
        if obs.running is None:
            # Robot unavailable: keep the run, stop counting dwell until it is back.
            if run is not None:
                run.close_segment(obs.at)
            return None
        if obs.running and run is None:
            run = self.active = ActiveRun(
                start=obs.at, last_seen=obs.at, source=self._source(obs.at), map=obs.map
            )
        if run is None:
            return None
        if obs.area is not None:
            run.area = obs.area
        if obs.duration is not None:
            run.duration = obs.duration
        if not obs.running:
            return self._finish(obs.at, obs)
        counting = obs.moving and obs.room is not None
        if not counting or obs.room != run.room or run.since is None:
            run.close_segment(obs.at)
            run.room = obs.room
            run.since = obs.at if counting else None
        run.last_seen = obs.at
        return None

    def _finish(self, end: datetime, obs: Observation) -> dict[str, Any] | None:
        run = self.active
        self.active = None
        if run is None:
            return None
        run.close_segment(end)
        area = obs.area if obs.area is not None else run.area
        duration = obs.duration if obs.duration is not None else run.duration
        rooms = [
            {"id": None, "name": name, "dwell_s": round(seconds)}
            for name, seconds in sorted(run.dwell.items(), key=lambda item: -item[1])
            if seconds >= MIN_DWELL
        ]
        if end - run.start < MIN_RUN and not rooms:
            return None  # accidental start/stop
        return {
            "id": uuid.uuid4().hex[:12],
            "slot": self.slot,
            "start": _iso(run.start),
            "end": _iso(end),
            "duration_s": round(duration) if duration else round((end - run.start).total_seconds()),
            "area_m2": area,
            "rooms": rooms,
            "source": run.source,
            "map": run.map,
            "partial": False,
        }


def merge_record(
    runs: list[dict[str, Any]], start: datetime, end: datetime, slot: int, now: datetime
) -> bool:
    """Apply the robot's own clean record (``last_clean_start/end``); True if changed.

    A matching run (start within ``RECORD_MATCH``) gets the official times; a record HA
    never saw live (HA down, entity not tracked) becomes a ``partial`` run without rooms.
    """
    if end <= start or now - end > RETENTION or end - start > timedelta(hours=12):
        return False
    for run in runs:
        run_start, run_end = parse_time(run["start"]), parse_time(run["end"])
        if run_start is None or run_end is None:
            continue
        if abs(run_start - start) <= RECORD_MATCH or (run_start <= start < run_end):
            if run.get("official"):
                return False
            run["start"], run["end"], run["official"] = _iso(start), _iso(end), True
            if run.get("partial"):
                run["duration_s"] = round((end - start).total_seconds())
            return True
    runs.append(
        {
            "id": uuid.uuid4().hex[:12],
            "slot": slot,
            "start": _iso(start),
            "end": _iso(end),
            "duration_s": round((end - start).total_seconds()),
            "area_m2": None,
            "rooms": [],
            "source": None,
            "map": None,
            "partial": True,
            "official": True,
        }
    )
    runs.sort(key=lambda run: run["start"])
    return True


def prune(runs: list[dict[str, Any]], now: datetime) -> list[dict[str, Any]]:
    cutoff = _iso(now - RETENTION)
    kept = sorted((run for run in runs if run.get("end", "") >= cutoff), key=lambda r: r["start"])
    return kept[-MAX_RUNS:]


def last_cleaned(runs: Iterable[Mapping[str, Any]]) -> list[dict[str, Any]]:
    """Latest end per room (segment id when known, else name) over the stored runs."""
    latest: dict[tuple[Any, str], dict[str, Any]] = {}
    for run in runs:
        for room in run.get("rooms", []):
            key = (room.get("id"), room["name"]) if room.get("id") is None else (room["id"], "")
            seen = latest.get(key)
            if seen is None or run["end"] > seen["at"]:
                latest[key] = {"id": room.get("id"), "name": room["name"], "at": run["end"]}
    return sorted(latest.values(), key=lambda item: item["at"], reverse=True)


def resolve_rooms(run: dict[str, Any], maps: list[Mapping[str, Any]], selected: str | None) -> None:
    """Room names → segment ids of the run's map (or of the only map with that name)."""
    if not maps:
        return
    wanted = run.get("map") or selected
    ordered = sorted(
        maps,
        key=lambda item: 0 if wanted in (item.get("name"), f"Map {item.get('flag')}") else 1,
    )
    for room in run.get("rooms", []):
        if room.get("id") is not None:
            continue
        for item in ordered:
            hit = next((r for r in item.get("rooms", []) if r.get("name") == room["name"]), None)
            if hit is not None:
                room["id"] = hit["id"]
                break


def replay(
    slot: int, history: Mapping[str, list[State]], roles: Mapping[str, str], now: datetime
) -> list[dict[str, Any]]:
    """Runs reconstructed from recorder state lists (backfill; source unknown)."""
    events: list[tuple[datetime, str, str]] = []
    by_entity = {entity: role for role, entity in roles.items()}
    for entity, states in history.items():
        role = by_entity.get(entity)
        if role is None:
            continue
        for state in states:
            events.append((state.last_changed, role, state.state))
    events.sort(key=lambda item: item[0])
    tracker = RunTracker(slot)
    tracker.unknown_source = True
    current: dict[str, str | None] = {}
    runs: list[dict[str, Any]] = []
    records: list[tuple[datetime, datetime]] = []
    for at, role, value in events:
        current[role] = value
        if role in ("last_clean_start", "last_clean_end"):
            start = parse_time(current.get("last_clean_start"))
            end = parse_time(current.get("last_clean_end"))
            if start and end:
                records.append((start, end))
            continue
        obs = observation(current, at, tracker.running)
        if (record := tracker.observe(obs)) is not None:
            runs.append(record)
    for start, end in records:
        merge_record(runs, start, end, slot, now)
    return prune(runs, now)


def observation(
    current: Mapping[str, str | None],
    at: datetime,
    previous: bool,
    attributes: Mapping[str, Any] | None = None,
) -> Observation:
    """Observation from the latest raw state per role."""
    vacuum = current.get("vacuum")
    running = run_flag(vacuum, current.get("in_cleaning"), previous)
    selected = current.get("selected_map")
    return Observation(
        at=at,
        running=running,
        moving=vacuum == "cleaning",
        room=room_name(current.get("current_room")),
        area=area_value(current.get("cleaning_area")),
        duration=duration_seconds(
            current.get("cleaning_time"),
            (attributes or {}).get("cleaning_time_unit", "min"),
        ),
        map=selected if selected and selected not in UNAVAILABLE else None,
    )


# --- HA wrapper -------------------------------------------------------------------------


def history_entities(hass: HomeAssistant, bindings: Mapping[str, str], slot: int) -> dict[str, str]:
    """Role → entity id: bound entities first, the rest found on the robot device."""
    vacuum = bindings.get(f"robot{slot}_vacuum")
    if not vacuum:
        return {}
    roles: dict[str, str] = {"vacuum": vacuum}
    for role in ("current_room", "selected_map"):
        if entity := bindings.get(f"robot{slot}_{role}"):
            roles[role] = entity
    if (found := _vacuum_device(hass, vacuum)) is not None:
        registry = er.async_get(hass)
        for device in _companion_devices(hass, found[1]):
            for entry in er.async_entries_for_device(registry, device.id):
                key = (entry.domain, entry.translation_key or "")
                if (role := HISTORY_KEYS.get(key)) and role not in roles:
                    roles[role] = entry.entity_id
    return roles


class RobotHistory:
    """Live recorder + store of cleaning runs for every configured robot."""

    def __init__(
        self,
        hass: HomeAssistant,
        bindings: Callable[[], Mapping[str, str]],
        rooms: Callable[[str], dict[str, Any] | None] | None = None,
    ) -> None:
        self.hass = hass
        self._bindings = bindings
        self._rooms = rooms or (lambda _vacuum: None)
        self._store: Store[dict[str, Any]] = Store(hass, STORAGE_VERSION, STORAGE_KEY)
        self._data: dict[str, Any] = {"runs": {}, "active": {}, "backfilled": False}
        self._trackers: dict[int, RunTracker] = {}
        self._roles: dict[int, dict[str, str]] = {}
        self._unsub: CALLBACK_TYPE | None = None
        self._listeners: set[Callable[[dict[str, Any]], None]] = set()
        self._loaded = False

    # -- lifecycle -----------------------------------------------------------------------

    async def async_load(self) -> None:
        if self._loaded:
            return
        raw = await self._store.async_load()
        if isinstance(raw, Mapping):
            runs = raw.get("runs")
            self._data["runs"] = {
                str(slot): [r for r in value if isinstance(r, dict) and "start" in r]
                for slot, value in (runs.items() if isinstance(runs, Mapping) else [])
                if isinstance(value, list)
            }
            active = raw.get("active")
            self._data["active"] = dict(active) if isinstance(active, Mapping) else {}
            self._data["backfilled"] = bool(raw.get("backfilled"))
        self._loaded = True

    async def async_start(self) -> None:
        await self.async_load()
        empty = not any(self._data["runs"].values()) and not self._data["backfilled"]
        self._listen()
        now = dt_util.utcnow()
        for slot, tracker in self._trackers.items():
            stored = ActiveRun.from_dict(self._data["active"].get(str(slot)))
            if stored is None:
                self._observe_now(slot, now)
                continue
            tracker.active = stored
            obs = self._snapshot(slot, now, tracker.running)
            record = tracker.resume(obs, self._state_time(slot, "last_clean_end"))
            if record is not None:
                self._add_run(slot, record)
        if empty:
            await self._async_backfill(now)
        self._merge_records(now)
        self._save(delay=False)

    async def async_refresh(self) -> None:
        """Bindings changed: follow the new entities (runs in progress are kept)."""
        self._listen()

    async def async_stop(self) -> None:
        if self._unsub is not None:
            self._unsub()
            self._unsub = None
        self._persist_active()
        await self._store.async_save(self._data)

    def _listen(self) -> None:
        if self._unsub is not None:
            self._unsub()
            self._unsub = None
        bindings = self._bindings()
        self._roles = {
            slot: roles
            for slot in ROBOT_SLOTS
            if (roles := history_entities(self.hass, bindings, slot))
        }
        for slot in self._roles:
            self._trackers.setdefault(slot, RunTracker(slot))
        entity_to_slot = {
            entity: slot for slot, roles in self._roles.items() for entity in roles.values()
        }
        if not entity_to_slot:
            return

        @callback
        def _changed(event: Event[EventStateChangedData]) -> None:
            entity = event.data["entity_id"]
            slot = entity_to_slot.get(entity)
            if slot is None:
                return
            new = event.data["new_state"]
            at = new.last_updated if new is not None else dt_util.utcnow()
            role = next((r for r, e in self._roles[slot].items() if e == entity), None)
            if role in ("last_clean_start", "last_clean_end"):
                if self._merge_records(at, slot):
                    self._save()
                    self._notify(slot)
                return
            self._observe_now(slot, at)

        self._unsub = async_track_state_change_event(self.hass, list(entity_to_slot), _changed)

    # -- observations --------------------------------------------------------------------

    def _state(self, slot: int, role: str) -> State | None:
        entity = self._roles.get(slot, {}).get(role)
        return self.hass.states.get(entity) if entity else None

    def _state_time(self, slot: int, role: str) -> datetime | None:
        state = self._state(slot, role)
        return parse_time(state.state) if state else None

    def _snapshot(self, slot: int, at: datetime, previous: bool) -> Observation:
        current = {
            role: state.state for role in ROLES if (state := self._state(slot, role)) is not None
        }
        if "in_cleaning" in self._roles.get(slot, {}) and "in_cleaning" not in current:
            current["in_cleaning"] = "unavailable"  # bound but gone: treat as unknown
        time_state = self._state(slot, "cleaning_time")
        unit = time_state.attributes.get("unit_of_measurement") if time_state else None
        return observation(current, at, previous, {"cleaning_time_unit": unit})

    def _observe_now(self, slot: int, at: datetime) -> None:
        tracker = self._trackers[slot]
        # HA started mid-run without a stored run: the run counts from now (the robot's
        # own record corrects the times when it arrives).
        obs = self._snapshot(slot, at, tracker.running)
        was_running = tracker.running
        record = tracker.observe(obs)
        if record is not None:
            self._add_run(slot, record)
            self._save(delay=False)
            self._notify(slot)
        elif tracker.running or was_running:
            self._persist_active()
            self._save()

    def _add_run(self, slot: int, record: dict[str, Any]) -> None:
        vacuum = self._roles.get(slot, {}).get("vacuum")
        cached = self._rooms(vacuum) if vacuum else None
        selected = self._state(slot, "selected_map")
        resolve_rooms(record, (cached or {}).get("maps", []), selected.state if selected else None)
        runs = self._data["runs"].setdefault(str(slot), [])
        runs.append(record)
        self._data["runs"][str(slot)] = prune(runs, dt_util.utcnow())
        self._data["active"].pop(str(slot), None)

    def _merge_records(self, now: datetime, only: int | None = None) -> bool:
        changed = False
        for slot in self._roles if only is None else (only,):
            start = self._state_time(slot, "last_clean_start")
            end = self._state_time(slot, "last_clean_end")
            if start is None or end is None:
                continue
            tracker = self._trackers.get(slot)
            if tracker and tracker.active and end > tracker.active.start:
                continue  # the run is still being recorded live
            runs = self._data["runs"].setdefault(str(slot), [])
            changed |= merge_record(runs, start, end, slot, dt_util.utcnow())
        return changed

    def _persist_active(self) -> None:
        self._data["active"] = {
            str(slot): tracker.active.to_dict()
            for slot, tracker in self._trackers.items()
            if tracker.active is not None
        }

    def _save(self, delay: bool = True) -> None:
        if delay:
            self._store.async_delay_save(lambda: self._data, SAVE_DELAY_S)
        else:
            self.hass.async_create_task(self._store.async_save(self._data))

    async def _async_backfill(self, now: datetime) -> None:
        self._data["backfilled"] = True
        if "recorder" not in self.hass.config.components or not self._roles:
            return
        from homeassistant.components.recorder import get_instance  # noqa: PLC0415
        from homeassistant.components.recorder.history import (  # noqa: PLC0415
            get_significant_states,
        )

        start = now - timedelta(days=BACKFILL_DAYS)
        for slot, roles in self._roles.items():
            entities = [roles[r] for r in ROLES if r in roles and r != "cleaning_time"]
            try:
                history = await get_instance(self.hass).async_add_executor_job(
                    lambda ids=entities: get_significant_states(
                        self.hass,
                        start,
                        now,
                        ids,
                        significant_changes_only=False,
                        no_attributes=True,
                    )
                )
            except Exception as err:  # noqa: BLE001 - backfill is best effort
                _LOGGER.debug("Robot history backfill failed for slot %s: %s", slot, err)
                continue
            states = {
                entity: [s for s in values if isinstance(s, State)]
                for entity, values in history.items()
            }
            runs = replay(slot, states, roles, now)
            for run in runs:
                vacuum = roles.get("vacuum")
                cached = self._rooms(vacuum) if vacuum else None
                resolve_rooms(run, (cached or {}).get("maps", []), None)
            self._data["runs"][str(slot)] = prune(
                [*runs, *self._data["runs"].get(str(slot), [])], now
            )

    # -- API -----------------------------------------------------------------------------

    def mark(self, slot: int, at: datetime | None = None) -> None:
        """HomeBrain sent a cleaning start for ``slot`` (panel or schedule)."""
        if (tracker := self._trackers.get(slot)) is None:
            tracker = self._trackers[slot] = RunTracker(slot)
        tracker.note_command(at or dt_util.utcnow())

    def payload(self, limit: int = RECENT_LIMIT) -> dict[str, Any]:
        robots: dict[str, Any] = {}
        for slot in ROBOT_SLOTS:
            runs = self._data["runs"].get(str(slot), [])
            tracker = self._trackers.get(slot)
            if not runs and slot not in self._roles:
                continue
            active = tracker.active if tracker else None
            robots[str(slot)] = {
                "last_cleaned": last_cleaned(runs),
                "runs": [_public(run) for run in reversed(runs[-limit:])],
                "active": {"start": _iso(active.start), "source": active.source}
                if active
                else None,
            }
        return {"robots": robots}

    def subscribe(self, listener: Callable[[dict[str, Any]], None]) -> CALLBACK_TYPE:
        self._listeners.add(listener)

        @callback
        def _remove() -> None:
            self._listeners.discard(listener)

        return _remove

    def _notify(self, slot: int) -> None:
        for listener in list(self._listeners):
            listener({"slot": slot})


def _public(run: Mapping[str, Any]) -> dict[str, Any]:
    return {
        key: run.get(key)
        for key in (
            "id",
            "slot",
            "start",
            "end",
            "duration_s",
            "area_m2",
            "rooms",
            "source",
            "partial",
        )
    }
