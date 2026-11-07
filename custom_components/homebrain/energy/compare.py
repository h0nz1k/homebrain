"""Energie period comparison: this month / year-to-date vs last year and the previous month.

Pure aggregation of hourly recorder statistics (``change`` per hour, kWh). Windows are built from
local wall-clock time (Europe/Prague by default), so DST days count 23/25 hours and a running
month is compared over the same day-and-hour range (``1. – 7. 11. do 14:00`` vs the same range a
year ago / a month ago). Only complete hours are used. A window whose start lies before the first
recorded hour of a series (beyond one day of slack) has no value (``None``), never 0.

Cost (Kč) is optional: grid import × the CURRENT VT/NT price (NT share of each hour from the HDO
schedule) + the fixed monthly fee prorated by elapsed time. It is an estimate by today's tariff,
which the UI says.
"""

from __future__ import annotations

from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta, tzinfo
from typing import Any, Final

# series key -> energy binding key (cumulative kWh counters with long-term statistics)
SERIES_BINDINGS: Final = {
    "house": "energy_house_energy_today",
    "import": "energy_grid_import_energy_today",
    "export": "energy_grid_export_energy_today",
    "pv": "energy_pv_energy_today",
}
COVERAGE_SLACK: Final = timedelta(hours=24)
HOUR: Final = timedelta(hours=1)

Rows = list[tuple[float, float]]  # (hour start as UNIX timestamp, kWh in that hour)
Schedule = list[tuple[int, int]]  # NT intervals [from, to) in minutes of the local day


@dataclass(frozen=True)
class Tariff:
    """Current tariff (Kč/kWh and Kč/month incl. VAT); ``vt`` None = no cost."""

    vt: float | None
    nt: float | None
    fixed_monthly: float | None
    schedule: Schedule | None
    correction: float = 1.0


def statistic_ids(bindings: Mapping[str, Any]) -> dict[str, str]:
    """Bound statistic ids per series key (blank bindings skipped)."""
    out: dict[str, str] = {}
    for key, binding in SERIES_BINDINGS.items():
        value = bindings.get(binding)
        if isinstance(value, str) and value.strip():
            out[key] = value.strip()
    return out


def _minutes(value: Any) -> int | None:
    if not isinstance(value, str) or len(value) < 4 or ":" not in value:
        return None
    hh, _, mm = value.partition(":")
    try:
        total = int(hh) * 60 + int(mm[:2])
    except ValueError:
        return None
    return 1440 if total >= 1439 else total  # HDO integrations write the end of day as 23:59


def parse_hdo_schedule(attrs: Mapping[str, Any] | None) -> Schedule | None:
    """NT intervals from HDO attributes (same rules as the frontend ``parseHdoSchedule``)."""
    if not attrs:
        return None
    od, do = attrs.get("hdo_cas_od"), attrs.get("hdo_cas_do")
    pairs: list[tuple[Any, Any]] = []
    if isinstance(od, list) and isinstance(do, list) and len(od) == len(do):
        pairs = list(zip(od, do, strict=True))
    elif isinstance(attrs.get("hdo_times_today_raw"), list):
        pairs = [
            (r.get("od"), r.get("do")) for r in attrs["hdo_times_today_raw"] if isinstance(r, dict)
        ]
    out: Schedule = []
    for a, b in pairs:
        start, end = _minutes(a), _minutes(b)
        if start is None or end is None or start == end:
            continue
        if end > start:
            out.append((start, end))
        else:
            out.extend([(start, 1440), (0, end)])
    return out or None


def _wall(tz: tzinfo, year: int, month: int, day: int = 1, hour: int = 0) -> datetime:
    """Local wall-clock time; days past the month end clamp to the next month's start."""
    last = _days_in_month(year, month)
    if day > last:
        year, month = (year + 1, 1) if month == 12 else (year, month + 1)
        day, hour = 1, 0
    return datetime(year, month, day, hour, tzinfo=tz)


def _days_in_month(year: int, month: int) -> int:
    nxt = datetime(year + (month == 12), month % 12 + 1, 1)
    return (nxt - timedelta(days=1)).day


def _month_start(tz: tzinfo, year: int, month: int) -> datetime:
    while month < 1:
        year, month = year - 1, month + 12
    while month > 12:
        year, month = year + 1, month - 12
    return datetime(year, month, 1, tzinfo=tz)


def _ts(value: datetime) -> float:
    return value.astimezone(UTC).timestamp()


def _nt_share(start: float, tz: tzinfo, schedule: Schedule | None) -> float:
    if not schedule:
        return 0.0
    wall = datetime.fromtimestamp(start, tz)
    m0 = wall.hour * 60 + wall.minute
    total = 0
    for a, b in schedule:
        total += max(0, min(m0 + 60, b) - max(m0, a))
        if m0 + 60 > 1440:  # an hour crossing midnight (non-whole-hour offsets only)
            total += max(0, min(m0 + 60 - 1440, b) - max(0, a))
    return total / 60


def _fee_share(tz: tzinfo, start: datetime, end: datetime) -> float:
    """Elapsed share of calendar months in [start, end) (time-proportional, DST-aware)."""
    share = 0.0
    t = start
    while t < end:
        ms = _month_start(tz, t.year, t.month)
        me = _month_start(tz, t.year, t.month + 1)
        stop = min(end, me)
        share += (_ts(stop) - _ts(t)) / (_ts(me) - _ts(ms))
        t = stop
    return share


class _Series:
    def __init__(self, rows: Iterable[tuple[float, float | None]]) -> None:
        clean = sorted((t, v) for t, v in rows if v is not None)
        self.rows = [(t, max(0.0, v)) for t, v in clean]
        self.first = self.rows[0][0] if self.rows else None

    def covers(self, start: datetime) -> bool:
        return self.first is not None and self.first <= _ts(start + COVERAGE_SLACK)

    def sum(self, start: datetime, end: datetime, weight=None) -> float | None:
        if not self.covers(start) or _ts(end) <= _ts(start):
            return None
        a, b = _ts(start), _ts(end)
        if weight is None:
            return sum(v for t, v in self.rows if a <= t < b)
        return sum(v * weight(t) for t, v in self.rows if a <= t < b)


def _round(value: float | None, digits: int) -> float | None:
    return None if value is None else round(value, digits)


def compare_periods(
    rows: Mapping[str, Iterable[tuple[float, float | None]]],
    now: datetime,
    tz: tzinfo,
    tariff: Tariff | None = None,
) -> dict[str, Any]:
    """Comparison payload for ``homebrain/energy/compare`` (see module docstring)."""
    wall = now.astimezone(tz)
    cut = wall.replace(minute=0, second=0, microsecond=0)  # complete hours only
    y, m, d, h = cut.year, cut.month, cut.day, cut.hour
    py, pm = (y - 1, 12) if m == 1 else (y, m - 1)
    windows = {
        "month": {
            "current": (_month_start(tz, y, m), cut),
            "last_year": (_month_start(tz, y - 1, m), _wall(tz, y - 1, m, d, h)),
            "previous": (_month_start(tz, py, pm), _wall(tz, py, pm, d, h)),
        },
        "ytd": {
            "current": (_month_start(tz, y, 1), cut),
            "last_year": (_month_start(tz, y - 1, 1), _wall(tz, y - 1, m, d, h)),
        },
    }
    months = {
        "this_year": [(_month_start(tz, y, i), _month_start(tz, y, i + 1)) for i in range(1, 13)],
        "last_year": [
            (_month_start(tz, y - 1, i), _month_start(tz, y - 1, i + 1)) for i in range(1, 13)
        ],
    }

    def clip(span: tuple[datetime, datetime]) -> tuple[datetime, datetime] | None:
        start, end = span
        return None if start >= cut else (start, min(end, cut))

    def block(series: _Series, digits: int, weight=None, fee: float = 0.0) -> dict[str, Any]:
        def value(span: tuple[datetime, datetime] | None) -> float | None:
            if span is None:
                return None
            total = series.sum(span[0], span[1], weight)
            if total is None:
                return None
            return round(total + fee * _fee_share(tz, span[0], span[1]), digits)

        return {
            "month": {k: value(span) for k, span in windows["month"].items()},
            "ytd": {k: value(span) for k, span in windows["ytd"].items()},
            "monthly": {k: [value(clip(span)) for span in v] for k, v in months.items()},
            "first": None
            if series.first is None
            else datetime.fromtimestamp(series.first, tz).isoformat(),
        }

    parsed = {key: _Series(values) for key, values in rows.items()}
    out_series = {key: block(series, 1) for key, series in parsed.items() if series.first}
    cost_basis = None
    imp = parsed.get("import")
    if tariff is not None and tariff.vt is not None and imp is not None and imp.first:
        vt, nt = tariff.vt, tariff.nt if tariff.nt is not None else tariff.vt
        sched = tariff.schedule if tariff.nt is not None else None

        def price(t: float) -> float:
            share = _nt_share(t, tz, sched)
            return tariff.correction * (vt * (1 - share) + nt * share)

        out_series["cost"] = block(imp, 0, price, tariff.fixed_monthly or 0.0)
        cost_basis = {
            "vt": tariff.vt,
            "nt": tariff.nt,
            "fixed_monthly": tariff.fixed_monthly,
            "hdo": bool(sched),
        }

    return {
        "status": "ok",
        "time_zone": str(tz),
        "now": wall.isoformat(),
        "year": y,
        "month": m,
        "partial": {"day": d, "hour": h, "days_in_month": _days_in_month(y, m)},
        "windows": {
            group: {k: [a.isoformat(), b.isoformat()] for k, (a, b) in spans.items()}
            for group, spans in windows.items()
        },
        "series": out_series,
        "cost_basis": cost_basis,
    }
