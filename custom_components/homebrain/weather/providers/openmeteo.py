"""Open-Meteo multi-model forecast (CC BY 4.0, non-commercial, no key)."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any
from urllib.parse import urlencode

from ..const import OM_DAILY_MODELS, OM_DAILY_VARS, OM_HOURLY_VARS, OM_MODELS

BASE = "https://api.open-meteo.com/v1/forecast"


def _coords(lat: float, lon: float) -> dict[str, str]:
    # Two decimals (~1 km) is enough for every model grid and avoids leaking precision.
    return {"latitude": f"{lat:.2f}", "longitude": f"{lon:.2f}"}


def hourly_url(lat: float, lon: float) -> str:
    query = {
        **_coords(lat, lon),
        "hourly": ",".join(OM_HOURLY_VARS),
        "models": ",".join(model.id for model in OM_MODELS),
        "past_hours": "12",
        "forecast_hours": "72",
        "wind_speed_unit": "ms",
        "timezone": "UTC",
    }
    return f"{BASE}?{urlencode(query, safe=',')}"


def daily_url(lat: float, lon: float, timezone: str) -> str:
    query = {
        **_coords(lat, lon),
        "daily": ",".join(OM_DAILY_VARS),
        "models": ",".join(OM_DAILY_MODELS),
        "forecast_days": "10",
        "wind_speed_unit": "ms",
        "timezone": timezone,
    }
    return f"{BASE}?{urlencode(query, safe=',')}"


def nowcast_url(lat: float, lon: float) -> str:
    query = {
        **_coords(lat, lon),
        "minutely_15": "precipitation",
        "models": "icon_d2",
        "forecast_minutely_15": "12",
        "timezone": "UTC",
    }
    return f"{BASE}?{urlencode(query, safe=',')}"


def _utc(value: str) -> str:
    return datetime.fromisoformat(value).replace(tzinfo=UTC).isoformat().replace("+00:00", "Z")


def _column(block: dict[str, Any], var: str, model: str) -> list[Any] | None:
    # Single-model responses have no suffix; multi-model ones append the model id.
    return block.get(f"{var}_{model}", block.get(var) if len(OM_MODELS) == 1 else None)


def parse_hourly(payload: dict[str, Any]) -> dict[str, dict[str, Any]]:
    """Return {model: {points, status, valid}}; null series stay null, never 0."""
    hourly = payload.get("hourly") or {}
    times = [_utc(t) for t in hourly.get("time", [])]
    result: dict[str, dict[str, Any]] = {}
    for model in OM_MODELS:
        columns = {key: _column(hourly, var, model.id) for var, key in OM_HOURLY_VARS.items()}
        points = []
        for index, t in enumerate(times):
            point: dict[str, Any] = {"t": t}
            for key, column in columns.items():
                value = column[index] if column and index < len(column) else None
                point[key] = value
            points.append(point)
        valid = sum(point["t2m"] is not None for point in points)
        status = (
            "unavailable" if valid == 0 else "fresh" if valid >= 0.9 * len(points) else "partial"
        )
        result[model.id] = {"points": points, "status": status, "valid": valid}
    return result


def parse_daily(payload: dict[str, Any]) -> dict[str, list[dict[str, Any]]]:
    daily = payload.get("daily") or {}
    dates = daily.get("time", [])
    result: dict[str, list[dict[str, Any]]] = {}
    for model in OM_DAILY_MODELS:
        rows = []
        for index, date in enumerate(dates):
            row: dict[str, Any] = {"date": date}
            for var, key in OM_DAILY_VARS.items():
                column = daily.get(f"{var}_{model}")
                row[key] = column[index] if column and index < len(column) else None
            rows.append(row)
        result[model] = rows
    return result


def parse_nowcast(payload: dict[str, Any]) -> list[dict[str, Any]]:
    block = payload.get("minutely_15") or {}
    times = block.get("time", [])
    values = block.get("precipitation") or block.get("precipitation_icon_d2") or []
    slots = []
    for index, t in enumerate(times):
        value = values[index] if index < len(values) else None
        slots.append({"t": _utc(t), "mmh": None if value is None else round(value * 4, 2)})
    return slots
