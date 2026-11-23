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
from .proxmox import build_proxmox, guest_entities
from .rates import CounterRates

API_KEY: Final = "server_glances_api"
RATES_KEY: Final = "server_net_rates"
SERIES: Final = ("cpu", "memory", "temperature", "rx", "tx")


def _api(hass: HomeAssistant, collect_vms: bool) -> GlancesApi | None:
    entry = glances_entry(hass)
    url = base_url(entry.data) if entry else None
    if url is None:
        return None
    data = hass.data.setdefault(DOMAIN, {})
    api: GlancesApi | None = data.get(API_KEY)
    if api is None or api.url != url or api.collect_vms != collect_vms:
        verify = bool(entry.data.get("verify_ssl", True))
        session = async_get_clientsession(hass, verify_ssl=verify)
        api = GlancesApi(url, session_fetch(session, url), collect_vms=collect_vms)
        data[API_KEY] = api
    return api


def backup_max_age_days(hass: HomeAssistant) -> int:
    """Configured backup age limit; the default for a missing or invalid value."""
    low, high = rules.BACKUP_MAX_AGE_RANGE
    for entry in hass.config_entries.async_entries(DOMAIN):
        value = (entry.options.get(rules.OPTION) or {}).get(rules.BACKUP_MAX_AGE)
        try:
            days = int(value)
        except (TypeError, ValueError):
            continue
        if low <= days <= high:
            return days
    return rules.BACKUP_MAX_AGE_DAYS


def _rates(hass: HomeAssistant) -> CounterRates:
    """Previous guest network counters (memory only, shared by all panels)."""
    data = hass.data.setdefault(DOMAIN, {})
    rates = data.get(RATES_KEY)
    if rates is None:
        rates = data[RATES_KEY] = CounterRates()
    return rates


async def async_snapshot(hass: HomeAssistant, use_api: bool = True) -> dict[str, Any]:
    snap = build_snapshot(hass)
    proxmox = build_proxmox(hass, backup_max_age_days(hass), _rates(hass))
    collect_vms = proxmox["status"] == "off"
    vms = {"status": "off", "items": []}
    api = _api(hass, collect_vms) if use_api and snap.get("host") else None
    if api is not None:
        got = await api.async_get((snap.get("memory") or {}).get("total_bytes"))
        if got["thresholds"]:
            snap = build_snapshot(hass, got["thresholds"])
        if "cpu" in snap:
            snap["cpu"]["cores"] = got["cores"]
            if got["load"]:
                snap["cpu"]["load_avg"] = got["load"]
                snap["cpu"]["load"] = got["load"][2]
        if collect_vms:
            vms = {"status": got["status"], "items": got["vms"]}
    node = proxmox["node"] or {}
    if "cpu" in snap and not snap["cpu"]["cores"] and node.get("cpus"):
        # Same machine: the hypervisor's core count when the Glances API is off.
        snap["cpu"]["cores"] = node["cpus"]
    snap["vms"] = vms
    snap["proxmox"] = proxmox
    if proxmox["status"] == "ok" or snap.get("available"):
        snap["verdict"] = rules.verdict(snap)
    return snap


@websocket_api.websocket_command(
    {vol.Required("type"): "homebrain/server/get", vol.Optional("api", default=True): bool}
)
@websocket_api.require_admin
@websocket_api.async_response
async def websocket_server_get(hass: HomeAssistant, connection: Any, msg: dict[str, Any]) -> None:
    snap = await async_snapshot(hass, msg["api"])
    snap["updated_at"] = dt_util.utcnow().isoformat()
    snap["thresholds"] = {
        "memory": rules.MEMORY,
        "disk": rules.DISK,
        "backup_days": backup_max_age_days(hass),
    }
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
        # One Proxmox guest's CPU % and RAM % instead of the host series.
        vol.Optional("guest"): {
            vol.Required("vmid"): vol.All(int, vol.Range(min=0)),
            vol.Required("kind"): vol.In(("vm", "ct")),
        },
    }
)
@websocket_api.require_admin
@websocket_api.async_response
async def websocket_server_history(
    hass: HomeAssistant, connection: Any, msg: dict[str, Any]
) -> None:
    if guest := msg.get("guest"):
        entities = guest_entities(hass, guest["vmid"], guest["kind"])
    else:
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
    hass.data.get(DOMAIN, {}).pop(RATES_KEY, None)
