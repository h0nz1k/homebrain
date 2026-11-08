"""WebSocket API of the Server module (``homebrain/server/*``, admin only)."""

from __future__ import annotations

from datetime import timedelta
from typing import Any, Final

import voluptuous as vol
from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.util import dt as dt_util

from ..const import DOMAIN
from . import rules
from .discovery import build_snapshot, glances_entry
from .glances_api import GlancesApi, base_url, session_fetch

API_KEY: Final = "server_glances_api"
SERIES: Final = ("cpu", "memory", "temperature", "rx", "tx")


def _api(hass: HomeAssistant) -> GlancesApi | None:
    entry = glances_entry(hass)
    url = base_url(entry.data) if entry else None
    if url is None:
        return None
    data = hass.data.setdefault(DOMAIN, {})
    api: GlancesApi | None = data.get(API_KEY)
    if api is None or api.url != url:
        verify = bool(entry.data.get("verify_ssl", True))
        session = async_get_clientsession(hass, verify_ssl=verify)
        api = GlancesApi(url, session_fetch(session, url))
        data[API_KEY] = api
    return api


async def async_snapshot(hass: HomeAssistant, use_api: bool = True) -> dict[str, Any]:
    snap = build_snapshot(hass)
    if not snap.get("host"):
        snap["vms"] = {"status": "off", "items": []}
        return snap
    api = _api(hass) if use_api else None
    if api is None:
        snap["vms"] = {"status": "off", "items": []}
        return snap
    got = await api.async_get((snap.get("memory") or {}).get("total_bytes"))
    if got["thresholds"]:
        snap = build_snapshot(hass, got["thresholds"])
    snap["cpu"]["cores"] = got["cores"]
    snap["vms"] = {"status": got["status"], "items": got["vms"]}
    return snap


@websocket_api.websocket_command(
    {vol.Required("type"): "homebrain/server/get", vol.Optional("api", default=True): bool}
)
@websocket_api.require_admin
@websocket_api.async_response
async def websocket_server_get(hass: HomeAssistant, connection: Any, msg: dict[str, Any]) -> None:
    snap = await async_snapshot(hass, msg["api"])
    snap["updated_at"] = dt_util.utcnow().isoformat()
    snap["thresholds"] = {"memory": rules.MEMORY, "disk": rules.DISK}
    connection.send_result(msg["id"], snap)


async def _statistics(hass: HomeAssistant, ids: list[str], hours: int) -> dict[str, list]:
    """5-minute means via the recorder's public statistics API (read-only)."""
    from homeassistant.components.recorder import get_instance  # noqa: PLC0415
    from homeassistant.components.recorder.statistics import (  # noqa: PLC0415
        statistics_during_period,
    )

    start = dt_util.utcnow() - timedelta(hours=hours)
    return await get_instance(hass).async_add_executor_job(
        statistics_during_period, hass, start, None, set(ids), "5minute", None, {"mean"}
    )


@websocket_api.websocket_command(
    {
        vol.Required("type"): "homebrain/server/history",
        vol.Optional("hours", default=24): vol.All(int, vol.Range(min=1, max=72)),
    }
)
@websocket_api.require_admin
@websocket_api.async_response
async def websocket_server_history(
    hass: HomeAssistant, connection: Any, msg: dict[str, Any]
) -> None:
    snap = build_snapshot(hass)
    entities = {k: v for k, v in (snap.get("history_entities") or {}).items() if v}
    series: dict[str, list[list[float]]] = {}
    if entities and "recorder" in hass.config.components:
        stats = await _statistics(hass, sorted(set(entities.values())), msg["hours"])
        for key, eid in entities.items():
            rows = stats.get(eid) or []
            state = hass.states.get(eid)
            unit = state.attributes.get("unit_of_measurement") if state else None
            factor = _rate_factor(unit) if key in ("rx", "tx") else 1
            series[key] = [
                [row["start"], round(row["mean"] * factor, 2)]
                for row in rows
                if row.get("mean") is not None
            ]
    connection.send_result(msg["id"], {"series": series, "hours": msg["hours"]})


def _rate_factor(unit: str | None) -> float:
    from .discovery import _RATES  # noqa: PLC0415

    return _RATES.get(unit or "", 1)


COMMANDS: Final = (websocket_server_get, websocket_server_history)


async def async_unload(hass: HomeAssistant) -> None:
    hass.data.get(DOMAIN, {}).pop(API_KEY, None)
