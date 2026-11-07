"""WebSocket API of the energy module."""

import time
from collections.abc import Callable
from functools import wraps
from typing import Any

import voluptuous as vol
from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import Unauthorized
from homeassistant.util import dt as dt_util

from ..bindings import get_bindings
from ..const import DOMAIN
from ..roles import ENERGY_DETAIL_ROLES, entry_roles, require_dnes_access, resolve_role
from .compare import Tariff, compare_periods, parse_hdo_schedule, statistic_ids

COMPARE_CACHE_S = 900


@websocket_api.websocket_command({vol.Required("type"): "homebrain/energy/pv_forecast"})
@require_dnes_access
@websocket_api.async_response
async def websocket_pv_forecast(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """Return the Open-Meteo PV forecast fallback (or ``status: unconfigured``)."""
    manager = hass.data.get(DOMAIN, {}).get("pv_forecast")
    entries = hass.config_entries.async_entries(DOMAIN)
    if manager is None or not entries:
        connection.send_error(msg["id"], "not_found", "HomeBrain is not configured")
        return
    connection.send_result(msg["id"], await manager.async_get(dict(entries[0].options)))


def _require_energy(func: Callable[..., Any]) -> Callable[..., Any]:
    """HA admins (owner) and the mapped roles that see Energie details (adults)."""

    @wraps(func)
    def with_role(hass: HomeAssistant, connection: Any, msg: dict[str, Any]) -> Any:
        role = resolve_role(connection.user, entry_roles(hass))
        if role != "owner" and role not in ENERGY_DETAIL_ROLES:
            raise Unauthorized
        return func(hass, connection, msg)

    return with_role


def _number(hass: HomeAssistant, entity_id: str | None) -> float | None:
    state = hass.states.get(entity_id) if entity_id else None
    if state is None:
        return None
    try:
        return float(str(state.state).replace(",", "."))
    except ValueError:
        return None


def _tariff(hass: HomeAssistant, bindings: dict[str, str]) -> Tariff:
    hdo = hass.states.get(bindings.get("energy_tariff_hdo", "") or "")
    correction = _number(hass, bindings.get("energy_meter_correction"))
    return Tariff(
        vt=_number(hass, bindings.get("energy_tariff_price_vt")),
        nt=_number(hass, bindings.get("energy_tariff_price_nt")),
        fixed_monthly=_number(hass, bindings.get("energy_tariff_fixed_monthly")),
        schedule=parse_hdo_schedule(hdo.attributes if hdo else None),
        correction=correction if correction is not None and 0.5 < correction < 2 else 1.0,
    )


async def _hourly_rows(
    hass: HomeAssistant, ids: dict[str, str], start: Any
) -> dict[str, list[tuple[float, float | None]]]:
    """Hourly ``change`` (kWh) via the recorder's public statistics API (read-only)."""
    from homeassistant.components.recorder import get_instance
    from homeassistant.components.recorder.statistics import statistics_during_period

    raw = await get_instance(hass).async_add_executor_job(
        statistics_during_period,
        hass,
        start,
        None,
        set(ids.values()),
        "hour",
        {"energy": "kWh"},
        {"change"},
    )
    out: dict[str, list[tuple[float, float | None]]] = {}
    for key, statistic_id in ids.items():
        rows = raw.get(statistic_id) or []
        out[key] = [
            (float(r["start"]), r.get("change")) for r in rows if r.get("start") is not None
        ]
    return out


@websocket_api.websocket_command({vol.Required("type"): "homebrain/energy/compare"})
@_require_energy
@websocket_api.async_response
async def websocket_compare(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """Period comparison (month / year-to-date vs last year and the previous month)."""
    entries = hass.config_entries.async_entries(DOMAIN)
    bindings = get_bindings(entries[0]).get("energy", {}) if entries else {}
    ids = statistic_ids(bindings)
    if not ids:
        connection.send_result(msg["id"], {"status": "unconfigured"})
        return
    if "recorder" not in hass.config.components:
        connection.send_result(msg["id"], {"status": "unsupported"})
        return
    tz = dt_util.get_time_zone(hass.config.time_zone) or dt_util.get_default_time_zone()
    now = dt_util.now(tz)
    tariff = _tariff(hass, bindings)
    key = (tuple(sorted(ids.items())), tariff, now.strftime("%Y%m%d%H"))
    cache = hass.data.setdefault(DOMAIN, {}).get("energy_compare")
    if cache and cache["key"] == key and time.monotonic() - cache["at"] < COMPARE_CACHE_S:
        connection.send_result(msg["id"], cache["result"])
        return
    start = now.replace(year=now.year - 1, month=1, day=1, hour=0, minute=0, second=0)
    rows = await _hourly_rows(hass, ids, dt_util.as_utc(start.replace(microsecond=0)))
    result = compare_periods(rows, now, tz, tariff)
    hass.data[DOMAIN]["energy_compare"] = {"key": key, "at": time.monotonic(), "result": result}
    connection.send_result(msg["id"], result)
