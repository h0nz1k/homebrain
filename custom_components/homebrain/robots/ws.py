"""WebSocket API of the Roboti module (read-only)."""

from __future__ import annotations

from typing import Any

import voluptuous as vol
from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant

from ..bindings import get_bindings
from ..const import DOMAIN
from .config import ROBOT_SLOTS, slot_settings
from .rooms import RoomCache


def _cache(hass: HomeAssistant) -> RoomCache:
    data = hass.data.setdefault(DOMAIN, {})
    if (cache := data.get("robot_rooms")) is None:
        cache = data["robot_rooms"] = RoomCache(hass)
    return cache


@websocket_api.websocket_command(
    {vol.Required("type"): "homebrain/robots/get", vol.Optional("refresh", default=False): bool}
)
@websocket_api.require_admin
@websocket_api.async_response
async def websocket_robots_get(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """Configured robots: display settings + room lists of their maps (no robot commands)."""
    if not (entries := hass.config_entries.async_entries(DOMAIN)):
        connection.send_error(msg["id"], "not_found", "HomeBrain is not configured")
        return
    entry = entries[0]
    bindings = get_bindings(entry).get("robots", {})
    cache = _cache(hass)
    robots = []
    for slot in ROBOT_SLOTS:
        vacuum = bindings.get(f"robot{slot}_vacuum")
        if not vacuum:
            continue
        rooms = await cache.async_get(vacuum, refresh=msg["refresh"])
        robots.append(
            {
                "slot": slot,
                **slot_settings(entry.options, slot),
                "vacuum": vacuum,
                "maps": rooms["maps"],
                "maps_error": rooms["error"],
                "maps_updated_at": rooms["updated_at"],
            }
        )
    connection.send_result(msg["id"], {"robots": robots})
