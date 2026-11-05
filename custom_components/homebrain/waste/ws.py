"""WebSocket API of the waste module."""

from datetime import timedelta
from typing import Any

import voluptuous as vol
from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant
from homeassistant.util import dt as dt_util

from ..const import DOMAIN

# Opening the panel re-reads the sources when the last pass is older than this.
STALE_AFTER = timedelta(minutes=30)


@websocket_api.websocket_command({vol.Required("type"): "homebrain/waste/history"})
@websocket_api.require_admin
@websocket_api.async_response
async def websocket_waste_history(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """Observed collections up to today (oldest first) for "last collected" and the calendar."""
    manager = hass.data.get(DOMAIN, {}).get("waste_history")
    if manager is None:
        connection.send_error(msg["id"], "not_found", "HomeBrain is not configured")
        return
    if manager.last_refresh is None or dt_util.utcnow() - manager.last_refresh > STALE_AFTER:
        await manager.async_refresh()
    events = manager.store.history(dt_util.now().date())
    connection.send_result(
        msg["id"],
        {
            "events": events,
            "since": events[0]["date"] if events else None,
            "updated_at": manager.last_refresh.isoformat() if manager.last_refresh else None,
        },
    )
