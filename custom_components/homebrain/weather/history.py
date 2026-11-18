"""Measured station history from HA long-term statistics (read-only, issue #131 A).

Only the recorder's public API is used (``statistics_during_period`` in the recorder
executor, as energy/heating do). Nothing is stored by HomeBrain. Missing hours stay missing:
every day carries per-variable hour coverage and ``gaps``, values are never interpolated.

Time convention: a statistics row with ``start`` S covers [S, S+1 h). Hourly output keeps
that (``t`` = hour start). For verification against forecasts (Open-Meteo precipitation is
the sum of the *preceding* hour) ``rain_by_valid_hour`` re-keys rain to the hour end.
"""

from __future__ import annotations

from collections.abc import Iterable, Mapping
from datetime import UTC, date, datetime, timedelta, tzinfo
from typing import Any

from homeassistant.core import HomeAssistant

from .const import MSL_PLAUSIBLE_MIN_HPA, PRESSURE_REDUCE_MIN_ELEVATION_M, PRESSURE_SAME_HPA
from .derive import resolve_pressure

# binding key -> (variable, statistic types). Rain uses the daily counter's ``change``
# (state_class total_increasing: HA handles the midnight reset in ``sum``/``change``).
HISTORY_KEYS: dict[str, tuple[str, frozenset[str]]] = {
    "weather_temperature": ("t2m", frozenset({"mean", "min", "max"})),
    "weather_humidity": ("rh", frozenset({"mean"})),
    "weather_pressure_absolute": ("p_abs", frozenset({"mean"})),
    "weather_pressure": ("p_rel", frozenset({"mean"})),
    "weather_wind_gust": ("gust", frozenset({"max"})),
    "weather_rain_daily": ("rain", frozenset({"change"})),
    "weather_rain_rate": ("rain_rate", frozenset({"max"})),
    "weather_solar_radiation": ("solar", frozenset({"mean"})),
}
# Output variables whose hour coverage is reported (msl from either pressure input).
OUT_VARS = ("t2m", "rh", "msl", "gust", "rain", "rain_rate", "solar")
UNITS = {
    "temperature": "°C",
    "pressure": "hPa",
    "speed": "m/s",
    "distance": "mm",
    "volumetric_flux": "mm/h",
}
RAIN_MAX_MM_H = 200.0
# HA compiles an hour's statistics a few minutes after it ends; younger hours are not a gap.
STATS_LAG = timedelta(minutes=15)

Rows = Mapping[str, list[dict[str, Any]]]


def _ts(value: Any) -> float | None:
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, datetime):
        return value.timestamp()
    return None


def _num(value: Any) -> float | None:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    return float(value) if value == value else None  # NaN guard


def _r(value: float | None, digits: int = 1) -> float | None:
    return None if value is None else round(value, digits)


def statistic_ids(bindings: Mapping[str, str]) -> dict[str, str]:
    """variable -> statistic_id (sensor statistics share the entity id)."""
    return {var: bindings[key] for key, (var, _) in HISTORY_KEYS.items() if bindings.get(key)}


def aggregate_hours(rows_by_var: Rows, elevation_m: float | None) -> list[dict[str, Any]]:
    """Merge per-variable hourly statistics into hour records (UTC hour start ``ts``)."""
    by_hour: dict[float, dict[str, Any]] = {}
    for var, rows in rows_by_var.items():
        for row in rows:
            ts = _ts(row.get("start"))
            if ts is None:
                continue
            hour = by_hour.setdefault(ts, {})
            if var == "t2m":
                hour["t2m"] = _num(row.get("mean"))
                hour["t_min"] = _num(row.get("min"))
                hour["t_max"] = _num(row.get("max"))
            elif var == "rain":
                change = _num(row.get("change"))
                # A negative change (counter replaced) or an absurd hour is not rain.
                ok = change is not None and 0 <= change <= RAIN_MAX_MM_H
                hour["rain"] = change if ok else None
            elif var in ("gust", "rain_rate"):
                hour[var] = _num(row.get("max"))
            else:
                hour[var] = _num(row.get("mean"))
    out = []
    for ts in sorted(by_hour):
        h = by_hour[ts]
        p = resolve_pressure(
            h.pop("p_rel", None),
            h.pop("p_abs", None),
            elevation_m,
            h.get("t2m"),
            same_hpa=PRESSURE_SAME_HPA,
            msl_min_hpa=MSL_PLAUSIBLE_MIN_HPA,
            min_elevation_m=PRESSURE_REDUCE_MIN_ELEVATION_M,
        )
        h["msl"] = p["msl"]
        h["msl_source"] = p["source"]
        h["ts"] = ts
        out.append(h)
    return out


def _iso(ts: float) -> str:
    return datetime.fromtimestamp(ts, UTC).isoformat().replace("+00:00", "Z")


def hour_records(hours: Iterable[dict[str, Any]]) -> list[dict[str, Any]]:
    """Contract rows for ``period: hour`` (values rounded, nothing filled in)."""
    return [
        {
            "t": _iso(h["ts"]),
            "t2m": _r(h.get("t2m")),
            "t_min": _r(h.get("t_min")),
            "t_max": _r(h.get("t_max")),
            "rh": _r(h.get("rh"), 0),
            "msl": _r(h.get("msl")),
            "gust": _r(h.get("gust")),
            "rain": _r(h.get("rain"), 2),
            "rain_rate": _r(h.get("rain_rate"), 1),
            "solar_wh_m2": _r(h.get("solar"), 0),
        }
        for h in hours
    ]


def _day_hours(day: date, tz: tzinfo) -> int:
    """Hours in a local day (23 / 25 on DST changes)."""
    start = datetime.combine(day, datetime.min.time(), tz)
    end = datetime.combine(day + timedelta(days=1), datetime.min.time(), tz)
    return round((end.astimezone(UTC) - start.astimezone(UTC)).total_seconds() / 3600)


def aggregate_days(
    hours: Iterable[dict[str, Any]],
    tz: tzinfo,
    first: date,
    last: date,
    now: datetime,
    bound: Iterable[str],
) -> list[dict[str, Any]]:
    """Local-day records ``first..last``; today is ``partial`` (complete hours so far).

    ``hours`` = per-variable coverage; ``gaps`` = bound variables with fewer hours than the
    day had (or than have elapsed today). Leading days without any data are dropped (station
    did not exist yet); interior empty days stay, all values null.
    """
    by_day: dict[date, list[dict[str, Any]]] = {}
    for h in hours:
        local = datetime.fromtimestamp(h["ts"], UTC).astimezone(tz).date()
        if first <= local <= last:
            by_day.setdefault(local, []).append(h)
    inputs = set(bound)
    bound_vars = [
        v for v in OUT_VARS if v in inputs or (v == "msl" and inputs & {"p_abs", "p_rel"})
    ]
    today = now.astimezone(tz).date()
    out: list[dict[str, Any]] = []
    day = first
    while day <= last:
        rows = by_day.get(day, [])
        expected = _day_hours(day, tz)
        partial = day == today
        if partial:
            midnight = datetime.combine(day, datetime.min.time(), tz).astimezone(UTC)
            elapsed = (now.astimezone(UTC) - STATS_LAG - midnight).total_seconds()
            expected = max(0, int(elapsed // 3600))

        def vals(key: str, rows: list[dict[str, Any]] = rows) -> list[float]:
            return [r[key] for r in rows if r.get(key) is not None]

        coverage = {v: len(vals(v)) for v in bound_vars}
        t_mean, t_min, t_max = vals("t2m"), vals("t_min"), vals("t_max")
        rain, rh, msl = vals("rain"), vals("rh"), vals("msl")
        gust, rate, solar = vals("gust"), vals("rain_rate"), vals("solar")
        record = {
            "date": day.isoformat(),
            "partial": partial,
            "t_min": _r(min(t_min)) if t_min else None,
            "t_max": _r(max(t_max)) if t_max else None,
            "t_mean": _r(sum(t_mean) / len(t_mean)) if t_mean else None,
            "rain": _r(sum(rain), 1) if rain else None,
            "rain_rate_max": _r(max(rate)) if rate else None,
            "gust_max": _r(max(gust)) if gust else None,
            "rh_mean": _r(sum(rh) / len(rh), 0) if rh else None,
            "msl_mean": _r(sum(msl) / len(msl)) if msl else None,
            "solar_kwh_m2": _r(sum(solar) / 1000, 2) if solar else None,
            "hours": coverage,
            "expected_hours": expected,
            "gaps": [v for v, n in coverage.items() if n < expected],
        }
        if out or any(coverage.values()):
            out.append(record)
        day += timedelta(days=1)
    return out


def rain_by_valid_hour(hours: Iterable[dict[str, Any]]) -> dict[str, float]:
    """Station rain re-keyed to the hour *end* (forecast ``valid_at`` convention)."""
    return {_iso(h["ts"] + 3600): h["rain"] for h in hours if h.get("rain") is not None}


async def async_statistics(
    hass: HomeAssistant, ids: Mapping[str, str], start: datetime, end: datetime | None
) -> dict[str, list[dict[str, Any]]]:
    """Hourly statistics per variable via the recorder executor (public API, read-only)."""
    if not ids or "recorder" not in hass.config.components:
        return {}
    from homeassistant.components.recorder import get_instance  # noqa: PLC0415
    from homeassistant.components.recorder.statistics import (  # noqa: PLC0415
        statistics_during_period,
    )

    types: set[str] = set()
    for var, wanted in HISTORY_KEYS.values():
        if var in ids:
            types |= wanted
    raw = await get_instance(hass).async_add_executor_job(
        statistics_during_period,
        hass,
        start,
        end,
        set(ids.values()),
        "hour",
        dict(UNITS),
        types,
    )
    return {var: list(raw.get(statistic_id) or []) for var, statistic_id in ids.items()}
