"""WebSocket API of the energy module."""

from typing import Any

import voluptuous as vol
from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant

from ..const import DOMAIN
from ..roles import require_dnes_access


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
