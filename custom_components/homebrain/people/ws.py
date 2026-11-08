"""WebSocket ``homebrain/people/get`` + ``homebrain/people/subscribe`` (Kdo je doma).

Every mapped role (adult/child/kiosk) and HA admins read it; unmapped users get
``unauthorized``. The subscription pushes a new list only when a shown status changes, so
zone hops and GPS updates while away are invisible to clients.
"""

from __future__ import annotations

from typing import Any, Final

import voluptuous as vol
from homeassistant.components import websocket_api
from homeassistant.const import EVENT_STATE_CHANGED
from homeassistant.core import Event, HomeAssistant, callback

from ..roles import require_dnes_access
from .model import people_snapshot


@websocket_api.websocket_command({vol.Required("type"): "homebrain/people/get"})
@callback
@require_dnes_access
def websocket_people_get(hass: HomeAssistant, connection: Any, msg: dict[str, Any]) -> None:
    connection.send_result(msg["id"], {"people": people_snapshot(hass)})


@callback
def _is_person(event_data: Any) -> bool:
    return str(event_data.get("entity_id", "")).startswith("person.")


@websocket_api.websocket_command({vol.Required("type"): "homebrain/people/subscribe"})
@callback
@require_dnes_access
def websocket_people_subscribe(hass: HomeAssistant, connection: Any, msg: dict[str, Any]) -> None:
    last = people_snapshot(hass)

    @callback
    def changed(_event: Event) -> None:
        nonlocal last
        current = people_snapshot(hass)
        if current != last:
            last = current
            connection.send_message(websocket_api.event_message(msg["id"], {"people": current}))

    connection.subscriptions[msg["id"]] = hass.bus.async_listen(
        EVENT_STATE_CHANGED, changed, event_filter=_is_person
    )
    connection.send_result(msg["id"])
    connection.send_message(websocket_api.event_message(msg["id"], {"people": last}))


COMMANDS: Final = (websocket_people_get, websocket_people_subscribe)
