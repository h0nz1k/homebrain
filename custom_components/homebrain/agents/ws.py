"""WebSocket API of the Agents module (``homebrain/agents/get``, admin only, read-only)."""

from __future__ import annotations

from typing import Any, Final

import voluptuous as vol
from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant, callback
from homeassistant.util import dt as dt_util

from .discovery import build_snapshot


@websocket_api.websocket_command({vol.Required("type"): "homebrain/agents/get"})
@websocket_api.require_admin
@callback
def websocket_agents_get(hass: HomeAssistant, connection: Any, msg: dict[str, Any]) -> None:
    snap = build_snapshot(hass)
    snap["updated_at"] = dt_util.utcnow().isoformat()
    connection.send_result(msg["id"], snap)


COMMANDS: Final = (websocket_agents_get,)
