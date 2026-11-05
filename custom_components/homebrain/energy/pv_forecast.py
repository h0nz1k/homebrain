"""PV production forecast fallback from Open-Meteo global tilted irradiance.

Used only when the owner configured the array (kWp, tilt, azimuth) in the integration options;
unconfigured installations get ``status: unconfigured`` and the panel says so instead of
guessing. Open-Meteo radiation values are the mean of the *preceding* hour, so the value at
``T`` describes the interval ``[T - 1 h, T)``.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any
from urllib.parse import urlencode

import aiohttp
from homeassistant.core import HomeAssistant
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.util import dt as dt_util

from ..weather.fetch import FetchError, fetch_json

BASE = "https://api.open-meteo.com/v1/forecast"
OPTION_KEY = "energy_pv"
#: Lumped system losses (inverter, wiring, soiling, temperature) – a transparent constant.
DEFAULT_PERFORMANCE_RATIO = 0.85
CACHE_S = 30 * 60
#: Keep serving the last good forecast this long when Open-Meteo fails.
STALE_S = 6 * 3600


SYSTEM_KEYS = ("inverter_ac_limit_kw", "battery_capacity_kwh", "export_limit_kw")
DEFAULT_TILT = 35.0
DEFAULT_AZIMUTH = 0.0


@dataclass(frozen=True)
class PvArray:
    kwp: float
    tilt: float
    #: Open-Meteo convention: 0 = south, -90 = east, 90 = west, ±180 = north.
    azimuth: float
    tilt_assumed: bool = False
    azimuth_assumed: bool = False
    performance_ratio: float = DEFAULT_PERFORMANCE_RATIO


def _num(raw: dict[str, Any], key: str, lo: float, hi: float) -> float | None:
    value = raw.get(key)
    if value is None or value == "":
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if lo <= number <= hi else None


def array_from_options(options: dict[str, Any]) -> PvArray | None:
    """Return the configured array or None (default: unconfigured, no kWp)."""
    raw = options.get(OPTION_KEY) or {}
    kwp = _num(raw, "pv_kwp", 0.01, 100)
    if kwp is None:
        return None
    tilt = _num(raw, "pv_tilt", 0, 90)
    azimuth = _num(raw, "pv_azimuth", -180, 180)
    return PvArray(
        kwp=kwp,
        tilt=DEFAULT_TILT if tilt is None else tilt,
        azimuth=DEFAULT_AZIMUTH if azimuth is None else azimuth,
        tilt_assumed=tilt is None,
        azimuth_assumed=azimuth is None,
    )


def system_from_options(options: dict[str, Any]) -> dict[str, float | None]:
    """Inverter AC limit, battery capacity and export limit (each optional)."""
    raw = options.get(OPTION_KEY) or {}
    return {key: _num(raw, key, 0.01, 1000) for key in SYSTEM_KEYS}


def forecast_url(lat: float, lon: float, array: PvArray) -> str:
    query = {
        # Two decimals (~1 km) is plenty for irradiance and avoids leaking precision.
        "latitude": f"{lat:.2f}",
        "longitude": f"{lon:.2f}",
        "hourly": "global_tilted_irradiance",
        "tilt": f"{array.tilt:g}",
        "azimuth": f"{array.azimuth:g}",
        "forecast_days": "3",
        "timezone": "UTC",
    }
    return f"{BASE}?{urlencode(query, safe=',')}"


def parse_forecast(payload: dict[str, Any], array: PvArray, tz: Any = UTC) -> dict[str, Any]:
    """Hourly PV power estimate (kW) plus local-day energy totals (kWh).

    ``null`` irradiance stays a gap (never a silent zero). Day totals are only reported for
    local days fully covered by data.
    """
    hourly = payload.get("hourly") or {}
    times = hourly.get("time") or []
    values = hourly.get("global_tilted_irradiance") or []
    points: list[dict[str, Any]] = []
    for index, raw_time in enumerate(times):
        value = values[index] if index < len(values) else None
        if value is None:
            continue
        try:
            end = datetime.fromisoformat(raw_time).replace(tzinfo=UTC)
            gti = max(0.0, float(value))
        except (TypeError, ValueError):
            continue
        kw = min(array.kwp, gti / 1000.0 * array.kwp * array.performance_ratio)
        start = end - timedelta(hours=1)
        points.append(
            {
                "start": start.isoformat().replace("+00:00", "Z"),
                "end": end.isoformat().replace("+00:00", "Z"),
                "kw": round(kw, 3),
            }
        )
    days: dict[str, dict[str, float]] = {}
    for point in points:
        start = datetime.fromisoformat(point["start"].replace("Z", "+00:00"))
        key = start.astimezone(tz).date().isoformat()
        day = days.setdefault(key, {"kwh": 0.0, "hours": 0})
        day["kwh"] += point["kw"]
        day["hours"] += 1

    def day_hours(key: str) -> float:
        # 23 h / 25 h on DST days: measure the real local day length.
        first = datetime.fromisoformat(key).replace(tzinfo=tz)
        nxt = (first + timedelta(days=1, hours=2)).replace(hour=0)
        return (nxt.astimezone(UTC) - first.astimezone(UTC)).total_seconds() / 3600

    totals = {
        key: round(day["kwh"], 2) for key, day in days.items() if day["hours"] >= day_hours(key)
    }
    return {"points": points, "days": totals}


class PvForecastManager:
    """Lazily fetches and caches the Open-Meteo PV forecast (read-only, no entities)."""

    def __init__(self, hass: HomeAssistant, user_agent: str) -> None:
        self.hass = hass
        self.user_agent = user_agent
        self._data: dict[str, Any] | None = None
        self._fetched_at: datetime | None = None
        self._key: tuple | None = None
        self._error: str | None = None

    async def async_get(
        self, options: dict[str, Any], session: aiohttp.ClientSession | None = None
    ) -> dict[str, Any]:
        array = array_from_options(options)
        base = {
            "source": "open_meteo",
            "attribution": "Open-Meteo.com (CC BY 4.0)",
            "system": system_from_options(options),
        }
        if array is None:
            return {**base, "status": "unconfigured", "points": [], "days": {}, "array": None}
        lat, lon = self.hass.config.latitude, self.hass.config.longitude
        key = (round(lat, 2), round(lon, 2), array)
        now = dt_util.utcnow()
        age = None if self._fetched_at is None else (now - self._fetched_at).total_seconds()
        if self._key != key or age is None or age > CACHE_S:
            try:
                payload = await fetch_json(
                    session or async_get_clientsession(self.hass),
                    forecast_url(lat, lon, array),
                    user_agent=self.user_agent,
                )
                tz = dt_util.get_time_zone(self.hass.config.time_zone) or UTC
                self._data = parse_forecast(payload, array, tz)
                self._fetched_at, self._key, self._error = now, key, None
                age = 0
            except FetchError as err:
                self._error = str(err)
                if self._key != key:
                    self._data, self._fetched_at = None, None
        array_info = {
            "kwp": array.kwp,
            "tilt": array.tilt,
            "azimuth": array.azimuth,
            "assumed": [
                name
                for name, flag in (("tilt", array.tilt_assumed), ("azimuth", array.azimuth_assumed))
                if flag
            ],
        }
        if self._data is None or age is None or age > STALE_S:
            return {
                **base,
                "status": "error",
                "error": self._error,
                "points": [],
                "days": {},
                "array": array_info,
            }
        return {
            **base,
            "status": "stale" if self._error else "ok",
            "fetched_at": self._fetched_at.isoformat() if self._fetched_at else None,
            "array": array_info,
            **self._data,
        }
