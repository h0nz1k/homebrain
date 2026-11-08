"""WebSocket ``homebrain/cooking/subscribe`` (Dnes „Maso v troubě“, MEATER probes).

Every mapped role (adult/child/kiosk) and HA admins may read it (read only, no control).
Probes are discovered from the entity registry (platform ``meater``) on every change, so
entities that only appear during the first cook are picked up without a restart. A push is
sent only when the minimal payload changes; unrelated state changes are filtered cheaply.
"""

from __future__ import annotations

from collections import defaultdict
from typing import Any, Final

import voluptuous as vol
from homeassistant.components import websocket_api
from homeassistant.const import EVENT_STATE_CHANGED
from homeassistant.core import Event, HomeAssistant, callback
from homeassistant.helpers import entity_registry as er
from homeassistant.util import dt as dt_util

from ..roles import require_dnes_access
from . import model


@callback
def discover(hass: HomeAssistant) -> list[dict[str, str]]:
    """``[{key: entity_id}]`` per probe, ordered by probe serial (stable „Sonda N“)."""
    groups: dict[str, dict[str, str]] = defaultdict(dict)
    for entry in er.async_get(hass).entities.values():
        if entry.platform != model.PLATFORM or entry.domain != "sensor" or entry.disabled:
            continue
        key = model.entity_key(entry.unique_id, entry.translation_key)
        if key is None:
            continue
        group = model.probe_group(entry.unique_id, entry.device_id, key)
        if group:
            groups[group][key] = entry.entity_id
    return [groups[group] for group in sorted(groups)]


@callback
def cooking_snapshot(hass: HomeAssistant) -> dict[str, list[dict[str, Any]]]:
    probes = []
    for ids in discover(hass):
        readings: dict[str, model.Reading] = {}
        for key, entity_id in ids.items():
            state = hass.states.get(entity_id)
            if state is not None:
                readings[key] = (state.state, state.attributes.get("unit_of_measurement"))
        probes.append(readings)
    return model.build_snapshot(probes, dt_util.utcnow())


@websocket_api.websocket_command({vol.Required("type"): "homebrain/cooking/subscribe"})
@callback
@require_dnes_access
def websocket_cooking_subscribe(hass: HomeAssistant, connection: Any, msg: dict[str, Any]) -> None:
    last = cooking_snapshot(hass)
    registry = er.async_get(hass)

    @callback
    def _is_meater(event_data: Any) -> bool:
        entity_id = str(event_data.get("entity_id", ""))
        if not entity_id.startswith("sensor."):
            return False
        entry = registry.async_get(entity_id)
        return entry is not None and entry.platform == model.PLATFORM

    @callback
    def changed(_event: Event) -> None:
        nonlocal last
        current = cooking_snapshot(hass)
        if current != last:
            last = current
            connection.send_message(websocket_api.event_message(msg["id"], current))

    connection.subscriptions[msg["id"]] = hass.bus.async_listen(
        EVENT_STATE_CHANGED, changed, event_filter=_is_meater
    )
    connection.send_result(msg["id"])
    connection.send_message(websocket_api.event_message(msg["id"], last))


COMMANDS: Final = (websocket_cooking_subscribe,)
