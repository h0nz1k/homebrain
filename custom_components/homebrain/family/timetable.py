"""School timetable per child: bells, free days, „co s sebou“ and derived presence. Refs #175."""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta, tzinfo

import voluptuous as vol
from homeassistant.components import websocket_api
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import EVENT_HOMEASSISTANT_STARTED
from homeassistant.core import CoreState, HomeAssistant, callback
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers.event import async_track_time_change
from homeassistant.util import dt as dt_util

from ..const import DOMAIN
from .ws_common import _role, _visible_kids, family_options

_LOGGER = logging.getLogger(__name__)

DAYS = 5
PERIODS = 9
AUTO = "auto"
# Defaults for the editable subject → „co s sebou“ map; an empty value means nothing extra.
DEFAULT_ITEMS = {
    "Tv": "cvičky a úbor",
    "Vv": "výtvarné potřeby",
    "Pč": "pracovní oděv a potřeby",
    "Hv": "",
}
# Upcoming days in the snapshot: today, tomorrow and the rest of the week grid.
HORIZON = 8
# Summer holidays are the longest gap before the next school day.
SEARCH_DAYS = 120

TIME = vol.All(str, vol.Match(r"^([01]\d|2[0-3]):[0-5]\d$"))
DAY = vol.All(str, vol.Match(r"^\d{4}-\d{2}-\d{2}$"), vol.Date())


def _ordered(value: dict) -> dict:
    if value["start"] >= value["end"]:
        raise vol.Invalid("Začátek musí být před koncem.")
    return value


BELL = vol.All(vol.Schema({vol.Required("start"): TIME, vol.Required("end"): TIME}), _ordered)
SUBJECT = vol.All(str, vol.Strip, vol.Length(max=8))
CHILD = vol.Schema(
    {
        vol.Optional("days", default=lambda: [[] for _ in range(DAYS)]): vol.All(
            [vol.All([SUBJECT], vol.Length(max=PERIODS))], vol.Length(min=DAYS, max=DAYS)
        ),
        # None = follow the imported afternoon variant (weekday + grades from the school web).
        vol.Optional("afternoon_days", default=None): vol.Any(
            None, vol.All([vol.All(int, vol.Range(min=0, max=DAYS - 1))], vol.Length(max=DAYS))
        ),
    }
)
TIMETABLE_SETTINGS = vol.Schema(
    {
        vol.Optional("bells", default=list): vol.All(
            [vol.Any(None, BELL)], vol.Length(max=PERIODS)
        ),
        vol.Optional("afternoon", default=None): vol.Any(
            None,
            vol.Schema(
                {
                    # Imported variants name their weekday and grades (children follow them
                    # unless their own afternoon days are set).
                    vol.Optional("weekday", default=None): vol.Any(
                        None, vol.All(int, vol.Range(min=0, max=DAYS - 1))
                    ),
                    vol.Optional("grades", default=None): vol.Any(
                        None, vol.All([vol.All(int, vol.Range(min=1, max=9))], vol.Length(max=9))
                    ),
                    vol.Optional("lunch", default=None): vol.Any(None, BELL),
                    vol.Required("periods"): vol.All(
                        [
                            vol.All(
                                vol.Schema(
                                    {
                                        vol.Required("period"): vol.All(
                                            int, vol.Range(min=1, max=PERIODS)
                                        ),
                                        vol.Required("start"): TIME,
                                        vol.Required("end"): TIME,
                                    }
                                ),
                                _ordered,
                            )
                        ],
                        vol.Length(max=PERIODS),
                    ),
                }
            ),
        ),
        vol.Optional("holiday_calendar", default=AUTO): vol.Any(
            AUTO, "", vol.All(str, vol.Match(r"^calendar\.[a-z0-9_]+$"))
        ),
        vol.Optional("free", default=list): vol.All(
            [
                vol.All(
                    vol.Schema(
                        {
                            vol.Required("start"): DAY,
                            vol.Required("end"): DAY,
                            vol.Required("label"): vol.All(
                                str, vol.Strip, vol.Length(min=1, max=60)
                            ),
                        }
                    ),
                    lambda v: v if v["start"] <= v["end"] else _invalid_range(),
                )
            ],
            vol.Length(max=40),
        ),
        vol.Optional("items", default=lambda: dict(DEFAULT_ITEMS)): vol.All(
            {vol.All(str, vol.Strip, vol.Length(min=1, max=8)): vol.All(str, vol.Length(max=80))},
            vol.Length(max=40),
        ),
        vol.Optional("children", default=dict): vol.All(
            {vol.All(str, vol.Length(min=1, max=128)): CHILD}, vol.Length(max=12)
        ),
    }
)


def _invalid_range():
    raise vol.Invalid("Začátek volna musí být před koncem.")


def timetable_options(options: dict) -> dict:
    return TIMETABLE_SETTINGS(options.get("timetable") or {})


@dataclass(frozen=True)
class Context:
    """Effective school-wide settings shared by every child."""

    bells: list[dict | None]
    afternoon: dict | None
    holidays: dict[str, str] = field(default_factory=dict)
    free: list[dict] = field(default_factory=list)
    items: dict[str, str] = field(default_factory=dict)
    tz: tzinfo | None = None


def build_context(
    options: dict, imported: dict | None, holidays: dict[str, str], tz: tzinfo | None = None
) -> Context:
    """Manual bells win over the imported school page, field by field."""
    imported = imported or {}
    afternoon = options.get("afternoon") or imported.get("afternoon")
    return Context(
        bells=list(options.get("bells") or imported.get("bells") or []),
        afternoon=afternoon,
        holidays=holidays,
        free=options.get("free") or [],
        items=options.get("items") or {},
        tz=tz,
    )


def afternoon_days(child: dict, grade: int | None, ctx: Context) -> list[int]:
    if child.get("afternoon_days") is not None:
        return sorted(set(child["afternoon_days"]))
    variant = ctx.afternoon or {}
    weekday = variant.get("weekday")
    grades = variant.get("grades")
    if weekday is None or not variant.get("periods"):
        return []
    return [weekday] if grades is None or grade in grades else []


def free_label(day: date, ctx: Context) -> str | None:
    """Label of a holiday or a configured free range; school-web dates never count."""
    iso = day.isoformat()
    for item in ctx.free:
        if str(item["start"]) <= iso <= str(item["end"]):
            return item["label"]
    return ctx.holidays.get(iso)


def is_school_day(day: date, ctx: Context) -> bool:
    return day.weekday() < DAYS and free_label(day, ctx) is None


def _bell_times(day: date, child: dict, grade: int | None, ctx: Context) -> dict[int, dict]:
    times = {i + 1: bell for i, bell in enumerate(ctx.bells) if bell}
    if day.weekday() in afternoon_days(child, grade, ctx):
        for row in (ctx.afternoon or {}).get("periods", []):
            times[row["period"]] = {"start": row["start"], "end": row["end"]}
    return times


def day_schedule(child: dict, grade: int | None, day: date, ctx: Context) -> dict:
    """Lessons with times for one date (empty on weekends and free days)."""
    weekday = day.weekday()
    label = free_label(day, ctx) if weekday < DAYS else None
    school = weekday < DAYS and label is None
    lessons: list[dict] = []
    lunch = None
    if school:
        subjects = (child.get("days") or [[]] * DAYS)[weekday]
        times = _bell_times(day, child, grade, ctx)
        for index, subject in enumerate(subjects):
            if subject and (bell := times.get(index + 1)):
                lessons.append({"period": index + 1, "subject": subject, **bell})
        if weekday in afternoon_days(child, grade, ctx) and lessons:
            lunch = (ctx.afternoon or {}).get("lunch")
            if lunch and not lessons[0]["start"] < lunch["start"] < lessons[-1]["end"]:
                lunch = None
    bring = []
    for subject in dict.fromkeys(lesson["subject"] for lesson in lessons):
        if item := ctx.items.get(subject):
            bring.append({"subject": subject, "item": item})
    return {
        "date": day.isoformat(),
        "school": bool(lessons),
        "free": label,
        "lessons": lessons,
        "start": lessons[0]["start"] if lessons else None,
        "end": lessons[-1]["end"] if lessons else None,
        "lunch": lunch,
        "bring": bring,
    }


def _at(day: date, clock: str, tz: tzinfo | None) -> datetime:
    hour, minute = (int(part) for part in clock.split(":"))
    return datetime.combine(day, time(hour, minute), tzinfo=tz or dt_util.get_default_time_zone())


def _local(now: datetime, ctx: Context) -> datetime:
    return dt_util.as_local(now) if ctx.tz is None else now.astimezone(ctx.tz)


def next_school_day(child: dict, grade: int | None, now: datetime, ctx: Context) -> dict | None:
    """Today until its last lesson ends, otherwise the next day with lessons."""
    local = _local(now, ctx)
    for offset in range(SEARCH_DAYS):
        day = local.date() + timedelta(days=offset)
        schedule = day_schedule(child, grade, day, ctx)
        if schedule["school"] and _at(day, schedule["end"], ctx.tz) > local:
            return schedule
    return None


def at_school(child: dict, grade: int | None, now: datetime, ctx: Context) -> bool:
    local = _local(now, ctx)
    schedule = day_schedule(child, grade, local.date(), ctx)
    return schedule["school"] and (
        _at(local.date(), schedule["start"], ctx.tz)
        <= local
        < _at(local.date(), schedule["end"], ctx.tz)
    )


def has_lessons(child: dict | None) -> bool:
    return bool(child) and any(subject for day in child.get("days") or [] for subject in day)


def timetable_snapshot(
    options: dict,
    imported: dict | None,
    holidays: dict[str, str],
    kids: list[dict],
    now: datetime,
    role: str,
) -> dict:
    ctx = build_context(options, imported, holidays)
    today = _local(now, ctx).date()
    children = []
    if role in ("owner", "adult", "child"):
        for kid in kids:
            child = (options.get("children") or {}).get(kid.get("choreops_user_id") or kid["id"])
            if not has_lessons(child):
                continue
            grade = kid.get("grade")
            children.append(
                {
                    "id": kid["id"],
                    "name": kid["name"],
                    "grid": child["days"],
                    "afternoon_days": afternoon_days(child, grade, ctx),
                    "days": [
                        day_schedule(child, grade, today + timedelta(days=offset), ctx)
                        for offset in range(HORIZON)
                    ],
                    "next": next_school_day(child, grade, now, ctx),
                }
            )
    return {
        "enabled": bool(children),
        "today": today.isoformat(),
        "bells": ctx.bells if children else [],
        "afternoon": ctx.afternoon if children else None,
        "children": children,
    }


def holiday_dates(events: list[dict]) -> dict[str, str]:
    """All-day (end exclusive) or timed events from the holiday calendar → date: name."""
    days: dict[str, str] = {}
    for event in events:
        try:
            start = date.fromisoformat(str(event["start"])[:10])
            raw_end = str(event.get("end") or event["start"])
            end = date.fromisoformat(raw_end[:10])
        except (KeyError, ValueError):
            continue
        if len(raw_end) == 10 and end > start:
            end -= timedelta(days=1)
        summary = str(event.get("summary") or "Svátek")
        for offset in range((end - start).days + 1):
            days.setdefault((start + timedelta(days=offset)).isoformat(), summary)
    return days


def auto_holiday_calendar(hass: HomeAssistant) -> str | None:
    return min(
        (
            entry.entity_id
            for entry in er.async_get(hass).entities.values()
            if entry.domain == "calendar" and entry.platform == "holiday" and not entry.disabled
        ),
        default=None,
    )


class TimetableHolidays:
    """Public holidays read from the configured (or auto-detected) HA holiday calendar."""

    def __init__(self, hass: HomeAssistant, entry: ConfigEntry) -> None:
        self.hass = hass
        self.entry = entry
        self.days: dict[str, str] = {}
        self.entity_id: str | None = None

    def options(self) -> dict:
        return timetable_options(family_options(self.hass))

    def calendar(self) -> str | None:
        configured = self.options()["holiday_calendar"]
        if configured == AUTO:
            return auto_holiday_calendar(self.hass)
        return configured or None

    async def async_setup(self) -> None:
        self.entry.async_on_unload(self.entry.add_update_listener(self._options_updated))
        self.entry.async_on_unload(
            async_track_time_change(self.hass, self._daily, hour=4, minute=40, second=0)
        )
        if self.hass.state is CoreState.running:
            self.start()
        else:
            self.entry.async_on_unload(
                self.hass.bus.async_listen_once(EVENT_HOMEASSISTANT_STARTED, self._started)
            )

    @callback
    def _started(self, _event) -> None:
        # Must be a @callback: a plain lambda runs in the executor, where creating
        # the background task fails ("not the running loop") and holidays never load.
        self.start()

    @callback
    def _daily(self, _now) -> None:
        self.start()

    async def _options_updated(self, _hass, _entry) -> None:
        if self.calendar() != self.entity_id:
            self.start()

    @callback
    def start(self) -> None:
        self.entry.async_create_background_task(
            self.hass, self.refresh(), "homebrain_family_holidays"
        )

    async def refresh(self) -> None:
        entity_id = self.calendar()
        if entity_id is None:
            self.entity_id, self.days = None, {}
            return
        today = dt_util.start_of_local_day()
        try:
            response = await self.hass.services.async_call(
                "calendar",
                "get_events",
                {
                    "start_date_time": today - timedelta(days=7),
                    "end_date_time": today + timedelta(days=400),
                },
                target={"entity_id": entity_id},
                blocking=True,
                return_response=True,
            )
        except (HomeAssistantError, vol.Invalid):
            _LOGGER.debug("Holiday calendar %s is not readable", entity_id)
            return
        events = ((response or {}).get(entity_id) or {}).get("events") or []
        self.entity_id, self.days = entity_id, holiday_dates(events)


def _imported(hass: HomeAssistant) -> dict | None:
    school = hass.data.get(DOMAIN, {}).get("family_school")
    if not school:
        return None
    url = school.options().get("bells_url")
    cached = school.data.get("bells") or {}
    return cached.get("rows") if url and cached.get("url") == url else None


def _holidays(hass: HomeAssistant) -> dict[str, str]:
    source = hass.data.get(DOMAIN, {}).get("family_timetable")
    return source.days if source else {}


def derive_presence(hass: HomeAssistant, profiles: list[dict], now: datetime) -> None:
    """Away/unknown children are „ve škole“ during their lessons; „doma“ always wins."""
    options = timetable_options(family_options(hass))
    children = options.get("children") or {}
    if not children:
        return
    ctx = build_context(options, _imported(hass), _holidays(hass))
    for profile in profiles:
        child = children.get(profile.get("choreops_user_id"))
        if (
            profile.get("role") == "child"
            and (profile.get("presence") or {}).get("kind") != "home"
            and has_lessons(child)
            and at_school(child, profile.get("grade"), now, ctx)
        ):
            profile["presence"] = {"kind": "derived", "source": "school_timetable"}


def timetable_settings(hass: HomeAssistant) -> dict:
    return {
        **timetable_options(family_options(hass)),
        "imported": _imported(hass),
        "auto_holiday_calendar": auto_holiday_calendar(hass),
    }


@websocket_api.websocket_command({vol.Required("type"): "homebrain/family/timetable"})
@callback
def websocket_timetable(hass, connection, msg) -> None:
    role = _role(hass, connection)
    kids = _visible_kids(hass, connection, role) if role != "kiosk" else []
    connection.send_result(
        msg["id"],
        timetable_snapshot(
            timetable_options(family_options(hass)),
            _imported(hass),
            _holidays(hass),
            kids,
            dt_util.now(),
            role,
        ),
    )
