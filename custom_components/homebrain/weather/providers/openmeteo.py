"""Open-Meteo multi-model forecast (CC BY 4.0, non-commercial, no key)."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any
from urllib.parse import urlencode

from ..const import (
    ENSEMBLE_HORIZON_H,
    ENSEMBLE_MODEL,
    ENSEMBLE_URL,
    OM_DAILY_MODELS,
    OM_DAILY_VARS,
    OM_HOURLY_VARS,
    OM_MODELS,
    POP_THRESHOLD_MM_H,
    PREV_RUNS_DAYS,
    PREV_RUNS_URL,
)

BASE = "https://api.open-meteo.com/v1/forecast"


def _coords(lat: float, lon: float, elevation: float | None = None) -> dict[str, str]:
    # Two decimals (~1 km) is enough for every model grid and avoids leaking precision.
    # ``elevation`` drives Open-Meteo's statistical downscaling (default: 90 m DEM); sent only
    # when the home elevation is actually known (HA config or options.weather.elevation_m).
    out = {"latitude": f"{lat:.2f}", "longitude": f"{lon:.2f}"}
    if elevation is not None:
        out["elevation"] = f"{elevation:.0f}"
    return out


def hourly_url(lat: float, lon: float, elevation: float | None = None) -> str:
    query = {
        **_coords(lat, lon, elevation),
        "hourly": ",".join(OM_HOURLY_VARS),
        "models": ",".join(model.id for model in OM_MODELS),
        "past_hours": "12",
        "forecast_hours": "72",
        "wind_speed_unit": "ms",
        "timezone": "UTC",
    }
    return f"{BASE}?{urlencode(query, safe=',')}"


def daily_url(lat: float, lon: float, timezone: str, elevation: float | None = None) -> str:
    query = {
        **_coords(lat, lon, elevation),
        "daily": ",".join(OM_DAILY_VARS),
        "models": ",".join(OM_DAILY_MODELS),
        "forecast_days": "10",
        "wind_speed_unit": "ms",
        "timezone": timezone,
    }
    return f"{BASE}?{urlencode(query, safe=',')}"


def nowcast_url(lat: float, lon: float, elevation: float | None = None) -> str:
    query = {
        **_coords(lat, lon, elevation),
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


def call_weight(n_vars: int, n_days: float, n_models: int = 1) -> float:
    """Conservative Open-Meteo call weight of one request.

    Documented (pricing FAQ, 2026-11): > 10 variables or > 2 weeks count as several calls,
    fractionally (15 variables × 2 weeks = 1.5; 4 weeks = 2.0 per 10 variables). Whether
    extra models multiply the variable count is not documented, so we assume they do.
    """
    return max(1.0, n_vars * n_models / 10) * max(1.0, n_days / 14)


def prev_runs_vars() -> list[str]:
    return [f"precipitation_previous_day{day}" for day in PREV_RUNS_DAYS]


def prev_runs_url(
    lat: float, lon: float, start: str, end: str, elevation: float | None = None
) -> str:
    """Previous Runs API: what each model predicted 24/48/72 h before every valid hour.

    Endpoint and ``<var>_previous_dayN`` naming per the official docs; ``models`` and
    ``start_date``/``end_date`` follow the Forecast API ("supports the same models").
    """
    query = {
        **_coords(lat, lon, elevation),
        "hourly": ",".join(prev_runs_vars()),
        "models": ",".join(model.id for model in OM_MODELS),
        "start_date": start,
        "end_date": end,
        "timezone": "UTC",
    }
    return f"{PREV_RUNS_URL}?{urlencode(query, safe=',')}"


def parse_prev_runs(payload: dict[str, Any]) -> list[tuple[str, str, int, str, float]]:
    """Rows (model, valid_at, day, "precip", mm) for fc_prev; null values are skipped."""
    hourly = payload.get("hourly") or {}
    times = [_utc(t) for t in hourly.get("time", [])]
    rows = []
    for model in OM_MODELS:
        for day in PREV_RUNS_DAYS:
            column = _column(hourly, f"precipitation_previous_day{day}", model.id)
            if not column:
                continue
            for index, t in enumerate(times):
                value = column[index] if index < len(column) else None
                if value is not None:
                    rows.append((model.id, t, day, "precip", float(value)))
    return rows


def ensemble_url(lat: float, lon: float, elevation: float | None = None) -> str:
    query = {
        **_coords(lat, lon, elevation),
        "hourly": "precipitation",
        "models": ENSEMBLE_MODEL,
        "forecast_hours": str(ENSEMBLE_HORIZON_H),
        "timezone": "UTC",
    }
    return f"{ENSEMBLE_URL}?{urlencode(query, safe=',')}"


def parse_ensemble(
    payload: dict[str, Any], threshold: float = POP_THRESHOLD_MM_H
) -> dict[str, float]:
    """{valid_at: fraction of members ≥ threshold}. Every ``precipitation*`` column is one
    member (control + ``_memberNN``); hours where fewer than 5 members report are dropped."""
    hourly = payload.get("hourly") or {}
    times = [_utc(t) for t in hourly.get("time", [])]
    members = [v for k, v in hourly.items() if k.startswith("precipitation") and v]
    out: dict[str, float] = {}
    for index, t in enumerate(times):
        values = [m[index] for m in members if index < len(m) and m[index] is not None]
        if len(values) >= 5:
            out[t] = round(sum(v >= threshold for v in values) / len(values), 3)
    return out
