"""Read the local station (e.g. Ecowitt) through module bindings, with basic QC."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from homeassistant.core import HomeAssistant

from .const import STATION_STALE_S
from .units import convert

# logical key -> (output key, conversion kind, valid range)
STATION_KEYS: dict[str, tuple[str, str, tuple[float, float] | None]] = {
    "weather_temperature": ("t2m", "temp", (-40, 45)),
    "weather_humidity": ("rh", "num", (1, 100)),
    "weather_dew_point": ("td2m", "temp", (-50, 35)),
    "weather_feels_like": ("feels_like", "temp", (-60, 55)),
    "weather_pressure": ("msl", "pressure", (900, 1080)),
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
