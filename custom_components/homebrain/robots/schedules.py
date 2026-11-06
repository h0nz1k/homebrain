"""Roboti: cleaning schedules executed by the HomeBrain integration itself.

Storage: one versioned ``Store`` (``.storage/homebrain.robot_schedules``)::

    {"schedules": [Schedule], "settings": {quiet_start, quiet_end, paused_until},
     "handled": {"<schedule id>": "YYYY-MM-DD"}, "pending": [Job], "runs": [Run (≤ 20)]}

Schedule = ``{id, name, slot, preset_id | (settings + rooms), days (0 = Monday), time,
enabled, paused_until}``. A preset is referenced by its stable id, so renaming or editing
the preset changes what the schedule does; deleting it makes the run fail (and notify).

Timing (all in HA's configured time zone, ``dt_util`` local time):

* A minute tick (``async_track_time_change(second=0)``) looks at TODAY's occurrence of
  every enabled schedule. An occurrence that is due and not yet handled (``handled``
  remembers the date per schedule, persisted) is handled exactly once.
* Restart: the tick also runs right after HA has started, so next runs are simply
  recomputed from the stored schedules. An occurrence missed while HA was down (more than
  ``MISSED_GRACE`` late) runs once if it is still the same day and outside quiet hours,
  otherwise it is skipped (logged). Older days are never caught up.
* Quiet hours (default 22:00–07:00, editable): a schedule cannot be saved inside them and
  no scheduled start or retry ever happens inside them.
* Readiness: the robot must be ``docked``/``idle``, not cleaning/returning/paused, and the
  bound battery sensor (or the vacuum's ``battery_level``) must be ≥ ``MIN_BATTERY`` %.
  Not ready → retry every ``RETRY_INTERVAL`` until quiet hours (or midnight) would be hit,
  then give up and notify.
* Conflicts (same robot, overlapping time): runs are queued per robot. While a scheduled
  run of the same robot is still in progress the next job waits (checked every minute,
  not counted as a retry) and starts once the robot is back and ready; it is still bound
  by quiet hours and gives up there. Two jobs never start in the same tick.
* Global pause (vacation, until a date inclusive) and per-schedule ``enabled`` /
  ``paused_until``: paused occurrences are consumed silently (no log, no notification).
* Notifications ONLY on errors: failed start, robot error during a scheduled run, gave up.
  Always ``persistent_notification``; additionally ``notify.<robots_notify_service>`` when
  that config entry option names an existing notify service.

Starting reuses :func:`presets.async_start_cleaning` (same path as ``robots/start``).
"""

from __future__ import annotations

import asyncio
import logging
import re
import uuid
from collections.abc import Awaitable, Callable, Mapping
from datetime import date, datetime, time, timedelta
from typing import Any, Final

from homeassistant.components import persistent_notification
from homeassistant.core import HomeAssistant
from homeassistant.helpers.event import async_track_time_change
from homeassistant.helpers.storage import Store
from homeassistant.util import dt as dt_util

from ..const import DOMAIN
from .config import ROBOT_SLOTS, clean_text
from .presets import PresetError, PresetStore, async_start_cleaning, clean_rooms, clean_settings

_LOGGER = logging.getLogger(__name__)

STORAGE_KEY: Final = f"{DOMAIN}.robot_schedules"
STORAGE_VERSION: Final = 1
STORAGE_MINOR_VERSION: Final = 1
MAX_SCHEDULES: Final = 24
MAX_RUNS: Final = 20
MAX_PAUSE_DAYS: Final = 366
RETRY_INTERVAL: Final = timedelta(minutes=30)
QUEUE_INTERVAL: Final = timedelta(minutes=1)
MISSED_GRACE: Final = timedelta(minutes=5)
RUN_WATCH_LIMIT: Final = timedelta(hours=4)
MIN_BATTERY: Final = 30
DEFAULT_QUIET: Final = ("22:00", "07:00")
READY_STATES: Final = ("docked", "idle")
BUSY_STATES: Final = ("cleaning", "returning", "paused")
NOTIFY_OPTION: Final = "robots_notify_service"
NOTIFY_RE: Final = re.compile(r"^[a-z0-9_]{1,80}$")
NOTIFY_EXCLUDED: Final = ("send_message", "persistent_notification")
_TIME_RE: Final = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")
_ID_RE: Final = re.compile(r"^[a-f0-9]{8,32}$")
RESULTS: Final = ("started", "ok", "failed", "error", "gave_up", "skipped")


class ScheduleError(Exception):
    """Validation failure with a WS error code."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


# --- pure helpers -----------------------------------------------------------------------


def parse_hm(value: str) -> time:
    hours, minutes = value.split(":")
    return time(int(hours), int(minutes))


def valid_hm(value: Any) -> str | None:
    return value if isinstance(value, str) and _TIME_RE.match(value) else None


def valid_date(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    try:
        return date.fromisoformat(value).isoformat()
    except ValueError:
        return None


def in_quiet(moment: time, start: str, end: str) -> bool:
    """Quiet hours ``[start, end)``; may wrap midnight; ``start == end`` = no quiet hours."""
    begin, finish = parse_hm(start), parse_hm(end)
    moment = moment.replace(second=0, microsecond=0)
    if begin == finish:
        return False
    if begin < finish:
        return begin <= moment < finish
    return moment >= begin or moment < finish


def clean_schedule(raw: Any) -> dict[str, Any] | None:
    """A stored schedule or ``None`` when id/name/slot/days/time are unusable."""
    if not isinstance(raw, Mapping):
        return None
    schedule_id = raw.get("id")
    name = clean_text(raw.get("name"))
    slot = raw.get("slot")
    days_raw = raw.get("days")
    days = sorted(
        {d for d in days_raw if isinstance(d, int) and not isinstance(d, bool) and 0 <= d <= 6}
        if isinstance(days_raw, list)
        else set()
    )
    at = valid_hm(raw.get("time"))
    if (
        not isinstance(schedule_id, str)
        or not _ID_RE.match(schedule_id)
        or not name
        or slot not in ROBOT_SLOTS
        or isinstance(slot, bool)
        or not days
        or at is None
    ):
        return None
    preset_id = raw.get("preset_id")
    preset_id = preset_id if isinstance(preset_id, str) and _ID_RE.match(preset_id) else None
    return {
        "id": schedule_id,
        "name": name,
        "slot": slot,
        "preset_id": preset_id,
        # Inline „vlastní“ setup only when no preset is referenced.
        "settings": None if preset_id else clean_settings(raw.get("settings")),
        "rooms": [] if preset_id else clean_rooms(raw.get("rooms")),
        "days": days,
        "time": at,
        "enabled": raw.get("enabled", True) is not False,
        "paused_until": valid_date(raw.get("paused_until")),
    }


def clean_global(raw: Any) -> dict[str, Any]:
    raw = raw if isinstance(raw, Mapping) else {}
    return {
        "quiet_start": valid_hm(raw.get("quiet_start")) or DEFAULT_QUIET[0],
        "quiet_end": valid_hm(raw.get("quiet_end")) or DEFAULT_QUIET[1],
        "paused_until": valid_date(raw.get("paused_until")),
    }


def _clean_run(raw: Any) -> dict[str, Any] | None:
    if not isinstance(raw, Mapping) or raw.get("result") not in RESULTS:
        return None
    return {
        "id": str(raw.get("id", ""))[:32],
        "schedule_id": str(raw.get("schedule_id", ""))[:32],
        "name": clean_text(raw.get("name")) or "",
        "slot": raw.get("slot") if raw.get("slot") in ROBOT_SLOTS else None,
        "at": str(raw.get("at", ""))[:40],
        "result": raw["result"],
        "reason": str(raw["reason"])[:80] if raw.get("reason") else None,
        "attempts": int(raw.get("attempts") or 0),
        "manual": bool(raw.get("manual", False)),
    }


def _clean_job(raw: Any) -> dict[str, Any] | None:
    if not isinstance(raw, Mapping):
        return None
    try:
        occurrence = datetime.fromisoformat(str(raw["occurrence"]))
        next_try = datetime.fromisoformat(str(raw["next_try"]))
    except (KeyError, ValueError):
        return None
    return {
        "id": str(raw.get("id", uuid.uuid4().hex[:12]))[:32],
        "schedule_id": str(raw.get("schedule_id", ""))[:32],
        "occurrence": occurrence.isoformat(),
        "next_try": next_try.isoformat(),
        "attempts": int(raw.get("attempts") or 0),
        "reason": str(raw["reason"])[:40] if raw.get("reason") else None,
    }


def normalize_data(data: Any) -> dict[str, Any]:
    data = data if isinstance(data, Mapping) else {}
    schedules: list[dict[str, Any]] = []
    for item in data.get("schedules") if isinstance(data.get("schedules"), list) else []:
        schedule = clean_schedule(item)
        if schedule and all(s["id"] != schedule["id"] for s in schedules):
            schedules.append(schedule)
    handled_raw = data.get("handled")
    handled = {
        str(k): v
        for k, v in (handled_raw.items() if isinstance(handled_raw, Mapping) else [])
        if valid_date(v)
    }
    runs_raw = data.get("runs") if isinstance(data.get("runs"), list) else []
    pending_raw = data.get("pending") if isinstance(data.get("pending"), list) else []
    return {
        "schedules": schedules[:MAX_SCHEDULES],
        "settings": clean_global(data.get("settings")),
        "handled": handled,
        "pending": [j for j in map(_clean_job, pending_raw) if j],
        "runs": [r for r in map(_clean_run, runs_raw) if r][-MAX_RUNS:],
    }


def migrate_data(old_major: int, old_minor: int, data: Any) -> dict[str, Any]:
    if old_major > STORAGE_VERSION:
        raise NotImplementedError(f"robot schedules storage v{old_major} is newer than supported")
    return normalize_data(data)


def occurrence_on(schedule: Mapping[str, Any], day: date) -> datetime | None:
    """The schedule's local start time on ``day`` (None when the weekday is not selected)."""
    if day.weekday() not in schedule["days"]:
        return None
    return datetime.combine(day, parse_hm(schedule["time"]), tzinfo=dt_util.get_default_time_zone())


def is_paused(settings: Mapping[str, Any], schedule: Mapping[str, Any], day: date) -> bool:
    iso = day.isoformat()
    return any(
        until and iso <= until for until in (settings["paused_until"], schedule["paused_until"])
    )


def next_run(
    schedule: Mapping[str, Any], settings: Mapping[str, Any], now: datetime, handled: str | None
) -> datetime | None:
    """Next occurrence that will really be attempted (enabled, not paused, not in quiet hours)."""
    if not schedule["enabled"] or in_quiet(
        parse_hm(schedule["time"]), settings["quiet_start"], settings["quiet_end"]
    ):
        return None
    today = now.date()
    for offset in range(MAX_PAUSE_DAYS + 8):
        day = today + timedelta(days=offset)
        occurrence = occurrence_on(schedule, day)
        if occurrence is None or is_paused(settings, schedule, day):
            continue
        if offset == 0 and (occurrence <= now or handled == day.isoformat()):
            continue
        return occurrence
    return None


def battery_level(hass: HomeAssistant, bindings: Mapping[str, str], slot: int) -> float | None:
    """Bound battery sensor first, then the vacuum's ``battery_level`` attribute."""
    if sensor := bindings.get(f"robot{slot}_battery"):
        state = hass.states.get(sensor)
        try:
            return float(state.state) if state else None
        except ValueError:
            pass
    vacuum = bindings.get(f"robot{slot}_vacuum")
    state = hass.states.get(vacuum) if vacuum else None
    value = state.attributes.get("battery_level") if state else None
    return float(value) if isinstance(value, (int, float)) and not isinstance(value, bool) else None


def readiness(hass: HomeAssistant, bindings: Mapping[str, str], slot: int) -> str | None:
    """``None`` when the robot may start now, else the reason (unavailable/busy/…)."""
    vacuum = bindings.get(f"robot{slot}_vacuum")
    state = hass.states.get(vacuum) if vacuum else None
    if state is None or state.state in ("unavailable", "unknown"):
        return "unavailable"
    if state.state in BUSY_STATES:
        return "busy"
    if state.state == "error":
        return "robot_error"
    if state.state not in READY_STATES:
        return "not_docked"
    level = battery_level(hass, bindings, slot)
    if level is not None and level < MIN_BATTERY:
        return "battery"
    return None


REASON_TEXT: Final = {
    "unavailable": "robot je nedostupný",
    "busy": "robot právě uklízí",
    "robot_error": "robot hlásí chybu",
    "not_docked": "robot není v doku",
    "battery": f"baterie pod {MIN_BATTERY} %",
    "quiet_hours": "spadá do nočního klidu",
    "missed": "Home Assistant neběžel",
}


# --- scheduler --------------------------------------------------------------------------


class _VersionedStore(Store[dict[str, Any]]):
    async def _async_migrate_func(
        self, old_major_version: int, old_minor_version: int, old_data: Any
    ) -> dict[str, Any]:
        return migrate_data(old_major_version, old_minor_version, old_data)


class RobotScheduler:
    """Owns the schedules store, the minute tick, retries, the run log and notifications."""

    def __init__(
        self,
        hass: HomeAssistant,
        bindings: Callable[[], Mapping[str, str]],
        options: Callable[[], Mapping[str, Any]],
        presets: PresetStore,
        known_rooms: Callable[[str], Awaitable[set[int]]] | None = None,
    ) -> None:
        self.hass = hass
        self._bindings = bindings
        self._options = options
        self._presets = presets
        self._known_rooms = known_rooms
        self._store = _VersionedStore(
            hass, STORAGE_VERSION, STORAGE_KEY, minor_version=STORAGE_MINOR_VERSION
        )
        self._data: dict[str, Any] | None = None
        self._lock = asyncio.Lock()
        self._unsub: Callable[[], None] | None = None
        # slot -> scheduled run in progress (not persisted: a restart ends the watch).
        self._active: dict[int, dict[str, Any]] = {}

    # lifecycle ----------------------------------------------------------------------------
    async def async_data(self) -> dict[str, Any]:
        if self._data is None:
            self._data = normalize_data(await self._store.async_load() or {})
        return self._data

    async def async_start(self) -> None:
        await self.async_data()
        if self._unsub is None:
            self._unsub = async_track_time_change(self.hass, self._async_on_tick, second=0)
        await self.async_tick()  # restart: recompute + catch up today's missed runs

    async def async_stop(self) -> None:
        if self._unsub is not None:
            self._unsub()
            self._unsub = None
        if self._data is not None:
            await self._store.async_save(self._data)

    async def _async_on_tick(self, now: datetime) -> None:
        await self.async_tick(now)

    async def _save(self) -> None:
        await self._store.async_save(await self.async_data())

    # tick ---------------------------------------------------------------------------------
    async def async_tick(self, now: datetime | None = None) -> None:
        async with self._lock:
            now = dt_util.as_local(now or dt_util.now()).replace(second=0, microsecond=0)
            data = await self.async_data()
            changed = await self._watch_active(now)
            changed |= self._enqueue_due(data, now)
            changed |= await self._process_pending(data, now)
            if changed:
                await self._save()

    def _quiet(self, data: Mapping[str, Any], moment: time) -> bool:
        return in_quiet(moment, data["settings"]["quiet_start"], data["settings"]["quiet_end"])

    def _enqueue_due(self, data: dict[str, Any], now: datetime) -> bool:
        changed = False
        today = now.date()
        for schedule in data["schedules"]:
            occurrence = occurrence_on(schedule, today)
            if (
                not schedule["enabled"]
                or occurrence is None
                or occurrence > now
                or data["handled"].get(schedule["id"]) == today.isoformat()
            ):
                continue
            data["handled"][schedule["id"]] = today.isoformat()
            changed = True
            if is_paused(data["settings"], schedule, today):
                continue  # vacation / paused schedule: consumed silently
            if self._quiet(data, occurrence.time()):
                self._log(data, schedule, "skipped", "quiet_hours", now)
                continue
            if now - occurrence > MISSED_GRACE and self._quiet(data, now.time()):
                self._log(data, schedule, "skipped", "missed", now)
                continue
            data["pending"].append(
                {
                    "id": uuid.uuid4().hex[:12],
                    "schedule_id": schedule["id"],
                    "occurrence": occurrence.isoformat(),
                    "next_try": now.isoformat(),
                    "attempts": 0,
                    "reason": None,
                }
            )
        return changed

    async def _process_pending(self, data: dict[str, Any], now: datetime) -> bool:
        changed = False
        started_slots: set[int] = set()
        bindings = self._bindings()
        for job in sorted(data["pending"], key=lambda j: (j["next_try"], j["occurrence"])):
            if datetime.fromisoformat(job["next_try"]) > now:
                continue
            schedule = self._schedule(data, job["schedule_id"])
            occurrence = datetime.fromisoformat(job["occurrence"])
            if (
                schedule is None
                or not schedule["enabled"]
                or is_paused(data["settings"], schedule, now.date())
                or now.date() != dt_util.as_local(occurrence).date()
            ):
                data["pending"].remove(job)  # deleted / disabled / paused / stale (old day)
                changed = True
                continue
            if self._quiet(data, now.time()):
                await self._give_up(data, schedule, job, now)
                changed = True
                continue
            slot = schedule["slot"]
            if slot in self._active or slot in started_slots:
                # Conflict: wait for this robot's scheduled run to finish (queue, no retry).
                job["next_try"] = (now + QUEUE_INTERVAL).isoformat()
                job["reason"] = "queued"
                changed = True
                continue
            if reason := readiness(self.hass, bindings, slot):
                job["attempts"] += 1
                job["reason"] = reason
                retry = now + RETRY_INTERVAL
                if retry.date() != now.date() or self._quiet(data, retry.time()):
                    await self._give_up(data, schedule, job, now)
                else:
                    job["next_try"] = retry.isoformat()
                changed = True
                continue
            data["pending"].remove(job)
            changed = True
            if await self._start(data, schedule, now, attempts=job["attempts"] + 1):
                started_slots.add(slot)
        return changed

    async def _start(
        self,
        data: dict[str, Any],
        schedule: Mapping[str, Any],
        now: datetime,
        *,
        attempts: int,
        manual: bool = False,
    ) -> bool:
        try:
            await async_start_cleaning(
                self.hass,
                self._bindings(),
                schedule["slot"],
                self._presets,
                preset_id=schedule["preset_id"],
                rooms=schedule["rooms"],
                settings=schedule["settings"],
                known_rooms=self._known_rooms,
            )
        except Exception as err:  # noqa: BLE001 - any failure is logged + notified
            code = err.code if isinstance(err, PresetError) else "failed"
            _LOGGER.warning("Roboti: scheduled start of %s failed: %s", schedule["name"], err)
            self._log(data, schedule, "failed", code, now, attempts=attempts, manual=manual)
            await self._notify(
                schedule,
                f"Plán „{schedule['name']}“ se nepodařilo spustit ({code}).",
            )
            return False
        run = self._log(data, schedule, "started", None, now, attempts=attempts, manual=manual)
        self._active[schedule["slot"]] = {
            "run_id": run["id"],
            "schedule": dict(schedule),
            "started": now,
            "seen_cleaning": False,
        }
        return True

    async def _give_up(
        self, data: dict[str, Any], schedule: Mapping[str, Any], job: dict[str, Any], now: datetime
    ) -> None:
        data["pending"].remove(job)
        reason = job.get("reason") or "quiet_hours"
        self._log(data, schedule, "gave_up", reason, now, attempts=job["attempts"])
        text = REASON_TEXT.get(reason, reason)
        await self._notify(
            schedule,
            f"Plán „{schedule['name']}“ dnes neproběhl: {text} "
            f"(pokusů: {job['attempts']}). Další pokus až v příštím termínu.",
        )

    async def _watch_active(self, now: datetime) -> bool:
        """Close finished runs; robot error during a scheduled run → notify."""
        changed = False
        bindings = self._bindings()
        for slot, run in list(self._active.items()):
            vacuum = bindings.get(f"robot{slot}_vacuum")
            state = self.hass.states.get(vacuum) if vacuum else None
            current = state.state if state else "unavailable"
            data = await self.async_data()
            if current == "error":
                error_entity = bindings.get(f"robot{slot}_error")
                error_state = self.hass.states.get(error_entity) if error_entity else None
                detail = error_state.state if error_state else None
                self._update_run(data, run["run_id"], "error", detail)
                await self._notify(
                    run["schedule"],
                    f"Robot při plánu „{run['schedule']['name']}“ hlásí chybu"
                    + (f": {detail}." if detail else "."),
                )
            elif current in ("cleaning", "returning"):
                run["seen_cleaning"] = True
                if now - run["started"] <= RUN_WATCH_LIMIT:
                    continue
                self._update_run(data, run["run_id"], "ok", "watch_timeout")
            elif current in READY_STATES and (
                run["seen_cleaning"] or now - run["started"] >= timedelta(minutes=10)
            ):
                self._update_run(data, run["run_id"], "ok", None)
            elif now - run["started"] > RUN_WATCH_LIMIT:
                self._update_run(data, run["run_id"], "ok", "watch_timeout")
            else:
                continue
            del self._active[slot]
            changed = True
        return changed

    # log + notify -------------------------------------------------------------------------
    def _log(
        self,
        data: dict[str, Any],
        schedule: Mapping[str, Any],
        result: str,
        reason: str | None,
        now: datetime,
        *,
        attempts: int = 0,
        manual: bool = False,
    ) -> dict[str, Any]:
        run = {
            "id": uuid.uuid4().hex[:12],
            "schedule_id": schedule["id"],
            "name": schedule["name"],
            "slot": schedule["slot"],
            "at": now.isoformat(),
            "result": result,
            "reason": reason,
            "attempts": attempts,
            "manual": manual,
        }
        data["runs"] = [*data["runs"], run][-MAX_RUNS:]
        return run

    def _update_run(
        self, data: dict[str, Any], run_id: str, result: str, reason: str | None
    ) -> None:
        for run in data["runs"]:
            if run["id"] == run_id:
                run["result"] = result
                run["reason"] = reason

    def notify_service(self) -> str | None:
        value = self._options().get(NOTIFY_OPTION)
        return (
            value
            if isinstance(value, str) and NOTIFY_RE.match(value) and value not in NOTIFY_EXCLUDED
            else None
        )

    async def _notify(self, schedule: Mapping[str, Any], message: str) -> None:
        title = "Roboti: plán úklidu"
        if "persistent_notification" in self.hass.config.components:
            persistent_notification.async_create(
                self.hass,
                message,
                title=title,
                notification_id=f"homebrain_robots_{schedule['id']}",
            )
        service = self.notify_service()
        if service and self.hass.services.has_service("notify", service):
            try:
                await self.hass.services.async_call(
                    "notify", service, {"title": title, "message": message}, blocking=False
                )
            except Exception:  # noqa: BLE001 - a broken phone must not break the scheduler
                _LOGGER.exception("Roboti: notify.%s failed", service)
        elif service:
            _LOGGER.warning("Roboti: notify.%s does not exist", service)

    # API used by the WS commands ----------------------------------------------------------
    def _schedule(self, data: Mapping[str, Any], schedule_id: str) -> dict[str, Any] | None:
        return next((s for s in data["schedules"] if s["id"] == schedule_id), None)

    async def async_overview(self, now: datetime | None = None) -> dict[str, Any]:
        now = dt_util.as_local(now or dt_util.now())
        data = await self.async_data()
        last: dict[str, dict[str, Any]] = {}
        for run in data["runs"]:
            last[run["schedule_id"]] = run
        schedules = []
        for schedule in data["schedules"]:
            upcoming = next_run(
                schedule, data["settings"], now, data["handled"].get(schedule["id"])
            )
            schedules.append(
                {
                    **schedule,
                    "next_run": upcoming.isoformat() if upcoming else None,
                    "last_run": last.get(schedule["id"]),
                    "pending": next(
                        (
                            {k: j[k] for k in ("next_try", "attempts", "reason")}
                            for j in data["pending"]
                            if j["schedule_id"] == schedule["id"]
                        ),
                        None,
                    ),
                }
            )
        return {
            "schedules": schedules,
            "settings": dict(data["settings"]),
            "runs": list(reversed(data["runs"])),
            "notify_service": self.notify_service(),
            "available_notify_services": sorted(
                name
                for name in self.hass.services.async_services_for_domain("notify")
                if NOTIFY_RE.match(name) and name not in NOTIFY_EXCLUDED
            ),
            "min_battery": MIN_BATTERY,
            "retry_minutes": int(RETRY_INTERVAL.total_seconds() // 60),
        }

    async def async_save(
        self, raw: Mapping[str, Any], now: datetime | None = None
    ) -> dict[str, Any]:
        now = dt_util.as_local(now or dt_util.now())
        async with self._lock:
            data = await self.async_data()
            schedule_id = raw.get("id") or uuid.uuid4().hex[:12]
            existing = self._schedule(data, schedule_id)
            if raw.get("id") and existing is None:
                raise ScheduleError("not_found", "Schedule not found")
            schedule = clean_schedule({**raw, "id": schedule_id})
            if schedule is None:
                raise ScheduleError("invalid_format", "Schedule needs a name, days and time")
            if existing is None and len(data["schedules"]) >= MAX_SCHEDULES:
                raise ScheduleError("too_many", f"At most {MAX_SCHEDULES} schedules")
            if self._quiet(data, parse_hm(schedule["time"])):
                raise ScheduleError("quiet_hours", "The time falls into quiet hours")
            if schedule["preset_id"] and not await self._presets.async_get_preset(
                schedule["slot"], schedule["preset_id"]
            ):
                raise ScheduleError("not_found", "Preset not found")
            if existing is None:
                data["schedules"].append(schedule)
            else:
                data["schedules"][data["schedules"].index(existing)] = schedule
            # Never fire immediately for a time that already passed today.
            today_occurrence = occurrence_on(schedule, now.date())
            if today_occurrence is not None and today_occurrence <= now:
                data["handled"][schedule_id] = now.date().isoformat()
            elif existing is not None and existing["time"] != schedule["time"]:
                data["handled"].pop(schedule_id, None)
            data["pending"] = [j for j in data["pending"] if j["schedule_id"] != schedule_id]
            await self._save()
            return schedule

    async def async_delete(self, schedule_id: str) -> bool:
        async with self._lock:
            data = await self.async_data()
            if (schedule := self._schedule(data, schedule_id)) is None:
                return False
            data["schedules"].remove(schedule)
            data["handled"].pop(schedule_id, None)
            data["pending"] = [j for j in data["pending"] if j["schedule_id"] != schedule_id]
            await self._save()
            return True

    async def async_pause(self, until: str | None, now: datetime | None = None) -> dict[str, Any]:
        now = dt_util.as_local(now or dt_util.now())
        async with self._lock:
            data = await self.async_data()
            if until is not None:
                day = date.fromisoformat(until)
                if not now.date() <= day <= now.date() + timedelta(days=MAX_PAUSE_DAYS):
                    raise ScheduleError("invalid_format", "Pause must end within a year")
                data["pending"] = []  # vacation: drop today's retries too
            data["settings"]["paused_until"] = until
            await self._save()
            return dict(data["settings"])

    async def async_set_quiet(self, start: str, end: str) -> dict[str, Any]:
        async with self._lock:
            data = await self.async_data()
            data["settings"]["quiet_start"] = start
            data["settings"]["quiet_end"] = end
            await self._save()
            return dict(data["settings"])

    async def async_run_now(self, schedule_id: str, now: datetime | None = None) -> dict[str, Any]:
        """Manual „Spustit teď“: readiness check, then the same start path (no retries)."""
        now = dt_util.as_local(now or dt_util.now())
        async with self._lock:
            data = await self.async_data()
            if (schedule := self._schedule(data, schedule_id)) is None:
                raise ScheduleError("not_found", "Schedule not found")
            if reason := readiness(self.hass, self._bindings(), schedule["slot"]):
                raise ScheduleError("not_ready", reason)
            started = await self._start(data, schedule, now, attempts=1, manual=True)
            await self._save()
            return {"started": started, "run": data["runs"][-1]}

    def active_slots(self) -> set[int]:
        return set(self._active)
