"""met.no hourly forecast read server-side from the HA weather entity."""

from __future__ import annotations

from typing import Any

from homeassistant.core import HomeAssistant

from ..units import to_celsius, to_hpa, to_mm, to_ms


async def async_get_metno(hass: HomeAssistant, entity_id: str) -> list[dict[str, Any]]:
    """Call weather.get_forecasts and normalise to SI units."""
    state = hass.states.get(entity_id)
    if state is None:
        raise ValueError("weather entity missing")
    attrs = state.attributes
    response = await hass.services.async_call(
        "weather",
        "get_forecasts",
        {"entity_id": entity_id, "type": "hourly"},
        blocking=True,
        return_response=True,
    )
    forecast = ((response or {}).get(entity_id) or {}).get("forecast") or []
    points = []
    for item in forecast:
        when = item.get("datetime")
        if not when:
            continue
        points.append(
            {
                "t": str(when).replace("+00:00", "Z"),
                "t2m": to_celsius(item.get("temperature"), attrs.get("temperature_unit")),
                "td2m": to_celsius(item.get("dew_point"), attrs.get("temperature_unit")),
                "precip": to_mm(item.get("precipitation"), attrs.get("precipitation_unit")),
                "pop": item.get("precipitation_probability"),
                "wind": to_ms(item.get("wind_speed"), attrs.get("wind_speed_unit")),
                "gust": to_ms(item.get("wind_gust_speed"), attrs.get("wind_speed_unit")),
                "wind_dir": item.get("wind_bearing"),
                "msl": to_hpa(item.get("pressure"), attrs.get("pressure_unit")),
                "cloud": item.get("cloud_coverage"),
                "wmo": None,
                "condition": item.get("condition"),
            }
        )
    return points
