"""Time programs and the PLC clock (pure, no Home Assistant imports).

The Foxtrot clock runs on a fixed offset from UTC (``plc_utc_offset_minutes`` in the map,
usually winter time UTC+1 all year) and drifts by a few minutes. Program times on the
pages are PLC wall-clock times; the panel shows them in real local time (incl. DST), so
every day of the week is converted with that day's own UTC offset.

Two program formats exist on the pages:

* ``start_end`` – ``[on, off]`` pairs (setback / comfort windows); equal times = slot off,
  ``off`` before ``on`` = the slot runs past midnight;
* ``start_duration`` – ``[start, run time]`` pairs (pool filtration); run time ``00:00`` =
  slot off.
"""

from __future__ import annotations

import re
from datetime import date, datetime, timedelta, timezone, tzinfo
from typing import Any

DAY_MIN = 24 * 60
DRIFT_HINT_MIN = 2  # the panel explains the drift only above this
_HHMM = re.compile(r"^(\d{1,2}):(\d{2})$")


def minutes_of(value: Any) -> int | None:
    """``"05:30"`` → 330; ``"24:00"`` → 1440; anything else → ``None``."""
    if not isinstance(value, str) or not (m := _HHMM.match(value.strip())):
        return None
    hours, mins = int(m.group(1)), int(m.group(2))
    if mins > 59 or hours > 24 or (hours == 24 and mins):
        return None
    return hours * 60 + mins


def hhmm(total: int) -> str:
    """Minutes of the day → ``hh:mm`` (wraps past midnight)."""
    total %= DAY_MIN
    return f"{total // 60:02d}:{total % 60:02d}"


def plc_tz(offset_minutes: int) -> timezone:
    return timezone(timedelta(minutes=offset_minutes))


def parse_slot(first: Any, second: Any, fmt: str) -> tuple[int, int] | None:
    """One program row → ``(start_min, duration_min)`` in PLC time; ``None`` = slot off."""
    start = minutes_of(first)
    other = minutes_of(second)
    if start is None or other is None or start >= DAY_MIN:
        return None
    if fmt == "start_duration":
        return (start, other) if other > 0 else None
    if other == start:
        return None
    duration = (other - start) % DAY_MIN or DAY_MIN
    return start, duration


def today_slots(slots: list[tuple[int, int]]) -> list[list[str]]:
    """Legacy ``slots`` field: ``[[on, off], …]`` in PLC time (end ``24:00`` kept)."""
    out = []
    for start, duration in slots:
        end = start + duration
        out.append([hhmm(start), "24:00" if end == DAY_MIN else hhmm(end)])
    return out


def local_week(
    days: dict[int, list[tuple[int, int]]],
    *,
    today: date,
    tz: tzinfo,
    offset_minutes: int,
) -> list[dict[str, Any]]:
    """PLC program per weekday (1 = Monday) → 7 local days of the current week.

    Each slot lands on the local day it starts on (a PLC Monday 23:30 slot in summer time is
    a local Tuesday 00:30 slot); a Sunday slot moved past midnight wraps to Monday, as the
    program repeats weekly. ``plc_start``/``plc_end`` keep what the regulation displays.
    """
    zone = plc_tz(offset_minutes)
    monday = today - timedelta(days=today.isoweekday() - 1)
    week: list[list[dict[str, Any]]] = [[] for _ in range(7)]
    for day, slots in sorted(days.items()):
        if not 1 <= day <= 7:
            continue
        plc_day = monday + timedelta(days=day - 1)
        for start, duration in slots:
            begin = datetime(plc_day.year, plc_day.month, plc_day.day, tzinfo=zone) + timedelta(
                minutes=start
            )
            local = begin.astimezone(tz)
            end_local = (begin + timedelta(minutes=duration)).astimezone(tz)
            local_day = ((local.date() - monday).days % 7) + 1
            local_start = local.hour * 60 + local.minute
            end_min = end_local.hour * 60 + end_local.minute
            week[local_day - 1].append(
                {
                    "start": hhmm(local_start),
                    "end": "24:00" if end_min == 0 and duration > 0 else hhmm(end_min),
                    "minutes": duration,
                    "plc_start": hhmm(start),
                    "plc_end": "24:00" if start + duration == DAY_MIN else hhmm(start + duration),
                }
            )
    return [
        {"day": i + 1, "slots": sorted(slots, key=lambda s: s["start"])}
        for i, slots in enumerate(week)
    ]


def clock_info(
    *,
    offset_minutes: int,
    tz: tzinfo,
    now: datetime,
    hour: Any = None,
    minute: Any = None,
    read_at: datetime | None = None,
) -> dict[str, Any]:
    """Contract ``clock``: PLC offset, today's local shift and the clock drift (if readable).

    ``local_shift_min`` = local UTC offset − PLC offset (60 in summer time with a UTC+1 PLC),
    i.e. how much later the local clock shows a program time than the regulation.
    ``drift_min`` compares the PLC hour/minute with the time the page was read (minute
    resolution, so ±1 min is noise); positive = the PLC clock is fast.
    """
    local_offset = now.astimezone(tz).utcoffset() or timedelta(0)
    shift = int(local_offset.total_seconds() // 60) - offset_minutes
    plc_time = None
    drift = None
    if (
        isinstance(hour, int | float)
        and isinstance(minute, int | float)
        and not isinstance(hour, bool)
        and not isinstance(minute, bool)
        and 0 <= hour < 24
        and 0 <= minute < 60
    ):
        plc_min = int(hour) * 60 + int(minute)
        plc_time = hhmm(plc_min)
        if read_at is not None:
            expected = read_at.astimezone(plc_tz(offset_minutes))
            exp_min = expected.hour * 60 + expected.minute
            drift = (plc_min - exp_min + DAY_MIN // 2) % DAY_MIN - DAY_MIN // 2
    return {
        "plc_utc_offset_minutes": offset_minutes,
        "local_shift_min": shift,
        "plc_time": plc_time,
        "drift_min": drift,
    }
