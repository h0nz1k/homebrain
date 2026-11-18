"""Read the local station (e.g. Ecowitt) through module bindings, with basic QC."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from homeassistant.core import HomeAssistant

from .const import (
    MSL_PLAUSIBLE_MIN_HPA,
    PRESSURE_REDUCE_MIN_ELEVATION_M,
    PRESSURE_SAME_HPA,
    STATION_STALE_S,
)
from .derive import resolve_pressure
from .units import convert

# logical key -> (output key, conversion kind, valid range)
STATION_KEYS: dict[str, tuple[str, str, tuple[float, float] | None]] = {
    "weather_temperature": ("t2m", "temp", (-40, 45)),
    "weather_humidity": ("rh", "num", (1, 100)),
    "weather_dew_point": ("td2m", "temp", (-50, 35)),
    "weather_feels_like": ("feels_like", "temp", (-60, 55)),
    # Station "relative" pressure (Ecowitt REL = ABS + user offset, often 0) and ABS.
    "weather_pressure": ("msl", "pressure", (800, 1080)),
    "weather_pressure_absolute": ("p_abs", "pressure", (500, 1080)),
    "weather_wind_speed": ("wind", "speed", (0, 60)),
    "weather_wind_gust": ("gust", "speed", (0, 90)),
    "weather_wind_direction": ("wind_dir", "num", (0, 360)),
    "weather_rain_rate": ("rain_rate", "rate", (0, 200)),
    "weather_rain_daily": ("rain_today", "precip", (0, 500)),
    "weather_rain_state": ("raining", "bool", None),
    "weather_uv": ("uv", "num", (0, 20)),
    "weather_solar_radiation": ("solar", "num", (0, 1500)),
    "weather_indoor_temperature": ("indoor_t", "temp", (0, 45)),
    "weather_indoor_humidity": ("indoor_rh", "num", (1, 100)),
}
FORECAST_KEY = "weather_forecast"
WEATHER_BINDING_KEYS = (*STATION_KEYS, FORECAST_KEY)
SI_UNITS = {
    "temp": "°C",
    "speed": "m/s",
    "pressure": "hPa",
    "rate": "mm/h",
    "precip": "mm",
}


def read_station(hass: HomeAssistant, bindings: dict[str, str], now: datetime) -> dict[str, Any]:
    """Return {status, updated_at, values}; unavailable values are null, never invented."""
    values: dict[str, dict[str, Any]] = {}
    newest: datetime | None = None
    for logical, (key, kind, valid) in STATION_KEYS.items():
        entity_id = bindings.get(logical)
        if not entity_id:
            continue
        state = hass.states.get(entity_id)
        if state is None or state.state in ("unavailable", "unknown", ""):
            values[key] = {"v": None, "unit": SI_UNITS.get(kind), "qc": ["unavailable"]}
            continue
        reported = getattr(state, "last_reported", None) or state.last_updated
        newest = reported if newest is None or reported > newest else newest
        qc: list[str] = []
        if kind == "bool":
            value: Any = state.state in ("on", "true", "True", "1", "raining")
        else:
            # Unit always comes from unit_of_measurement: e.g. *_rain_rate_piezo may be mm.
            unit = state.attributes.get("unit_of_measurement")
            value = convert(state.state, unit, kind)
            if kind == "rate" and unit and "/" not in unit:
                qc.append("accumulation_unit")
            if value is None:
                qc.append("unparsable")
            elif valid and not valid[0] <= value <= valid[1]:
                qc.append("range")
        if (now - reported).total_seconds() > STATION_STALE_S:
            qc.append("stale")
        values[key] = {
            "v": None if "range" in qc or "unparsable" in qc else value,
            "unit": SI_UNITS.get(kind, "%" if key in ("rh", "indoor_rh") else None),
            "qc": qc or ["ok"],
            "updated_at": reported.isoformat(),
        }
    if not values:
        status = "unbound"
    elif all(v["v"] is None for v in values.values()):
        status = "unavailable"
    elif any("stale" in v["qc"] for v in values.values() if v["v"] is not None):
        status = "stale"
    else:
        status = "fresh"
    return {
        "status": status,
        "updated_at": newest.isoformat() if newest else None,
        "values": values,
    }


def apply_pressure(station: dict[str, Any], elevation_m: float | None) -> dict[str, Any]:
    """Replace the station ``msl`` value by the comparable MSL pressure (spec §4.2, WEA-016).

    The raw relative reading moves to ``p_rel``; ``station["pressure"]`` explains the source
    and flags a relative pressure equal to the absolute one (no offset set in the station).
    """
    values = station["values"]
    raw = values.get("msl")
    rel = raw["v"] if raw else None
    p_abs = values.get("p_abs", {}).get("v")
    t2m = values.get("t2m", {}).get("v")
    info = resolve_pressure(
        rel if isinstance(rel, (int, float)) else None,
        p_abs if isinstance(p_abs, (int, float)) else None,
        elevation_m,
        t2m if isinstance(t2m, (int, float)) else None,
        same_hpa=PRESSURE_SAME_HPA,
        msl_min_hpa=MSL_PLAUSIBLE_MIN_HPA,
        min_elevation_m=PRESSURE_REDUCE_MIN_ELEVATION_M,
    )
    if raw is not None:
        values["p_rel"] = raw
    source = values.get("p_abs") if info["source"] == "derived" else raw
    if info["msl"] is not None and source is not None:
        values["msl"] = {**source, "v": info["msl"], "qc": [*source["qc"], info["source"]]}
    elif raw is not None:
        values["msl"] = {**raw, "v": None, "qc": [*raw["qc"], "ignored"]}
    station["pressure"] = info
    return station
