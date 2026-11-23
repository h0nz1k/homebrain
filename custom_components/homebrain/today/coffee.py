"""Dnes: send a coffee invitation through the configured HA script (Refs #154)."""

from __future__ import annotations

import logging
from collections.abc import Mapping
from typing import Any, Final

import voluptuous as vol
from homeassistant.components import websocket_api
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import (
    ATTR_ENTITY_ID,
    SERVICE_TURN_ON,
    STATE_ON,
    STATE_UNAVAILABLE,
    STATE_UNKNOWN,
)
from homeassistant.core import Context, HassJob, HomeAssistant, callback
from homeassistant.exceptions import HomeAssistantError, Unauthorized
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.dispatcher import async_dispatcher_connect, async_dispatcher_send
from homeassistant.helpers.event import async_call_later, async_track_state_change_event

from ..const import DOMAIN
from ..family import persons
from ..family.ws_common import family_options
from ..roles import entry_roles, resolve_role

CONF_SCRIPT: Final = "coffee_script"
CONF_TV: Final = "coffee_tv"
CONF_MODE: Final = "coffee_mode"
CONF_HOUSEHOLD: Final = "coffee_household_label"
DEFAULT_MODE: Final = "bublina"
MODES: Final = (DEFAULT_MODE, "plna")
ENTITY_DOMAINS: Final = {CONF_SCRIPT: "script", CONF_TV: "media_player"}
COOLDOWN_SECONDS: Final = 30
_COOLDOWN: Final = "homebrain_coffee_cooldown"
_CHANGED: Final = "homebrain_coffee_changed"
_LOGGER = logging.getLogger(__name__)


def validate_entity(key: str, value: str) -> str:
    entity_id = cv.entity_id(value)
    if entity_id.split(".", 1)[0] != ENTITY_DOMAINS[key]:
        raise vol.Invalid("Unexpected entity domain")
    return entity_id


def _entry(hass: HomeAssistant) -> ConfigEntry | None:
    return next(iter(hass.config_entries.async_entries(DOMAIN)), None)


def _entity(options: Mapping[str, Any], key: str) -> str | None:
    if value := options.get(key):
        try:
            return validate_entity(key, value)
        except vol.Invalid:
            pass
    return None


def _reason(hass: HomeAssistant, options: Mapping[str, Any]) -> str | None:
    if not options.get(CONF_SCRIPT):
        return "not_configured"
    entity_id = _entity(options, CONF_SCRIPT)
    script = hass.states.get(entity_id) if entity_id else None
    if script is None or script.state in (STATE_UNAVAILABLE, STATE_UNKNOWN):
        return "script_missing"
    if hass.data.get(_COOLDOWN) or script.state == STATE_ON:
        return "cooldown"
    if options.get(CONF_TV):
        tv_id = _entity(options, CONF_TV)
        tv = hass.states.get(tv_id) if tv_id else None
        if tv is None or tv.state != STATE_ON:
            return "tv_off"
    return None


def _inviter(hass: HomeAssistant, user: Any, options: Mapping[str, Any]) -> str | None:
    if resolve_role(user, entry_roles(hass)) == "kiosk":
        return str(options.get(CONF_HOUSEHOLD) or "").strip() or None
    members = persons.members(hass, hass.states.async_all(), family_options(hass))
    return next((member["name"] for member in members if member["user_id"] == user.id), user.name)


@websocket_api.websocket_command({vol.Required("type"): "homebrain/today/coffee/subscribe"})
@callback
def websocket_coffee_subscribe(hass: HomeAssistant, connection: Any, msg: dict[str, Any]) -> None:
    if connection.user is None:
        raise Unauthorized
    entry = _entry(hass)
    last: dict[str, Any] | None = None
    stop_tracking = None

    @callback
    def publish(_event=None) -> None:
        nonlocal last
        reason = _reason(hass, entry.options if entry else {})
        snapshot = {"reason": reason}
        if snapshot != last:
            last = snapshot
            connection.send_message(websocket_api.event_message(msg["id"], snapshot))

    @callback
    def track() -> None:
        nonlocal stop_tracking
        if stop_tracking:
            stop_tracking()
        options = entry.options if entry else {}
        entity_ids = [eid for key in ENTITY_DOMAINS if (eid := _entity(options, key))]
        stop_tracking = (
            async_track_state_change_event(hass, entity_ids, publish) if entity_ids else None
        )

    async def options_changed(_hass: HomeAssistant, _entry: ConfigEntry) -> None:
        track()
        publish()

    stop_updates = async_dispatcher_connect(hass, _CHANGED, publish)
    stop_options = entry.add_update_listener(options_changed) if entry else None

    @callback
    def unsubscribe() -> None:
        if stop_tracking:
            stop_tracking()
        if stop_options:
            stop_options()
        stop_updates()

    connection.subscriptions[msg["id"]] = unsubscribe
    track()
    connection.send_result(msg["id"])
    publish()


@websocket_api.websocket_command({vol.Required("type"): "homebrain/today/coffee/invite"})
@websocket_api.async_response
async def websocket_coffee_invite(
    hass: HomeAssistant, connection: Any, msg: dict[str, Any]
) -> None:
    user = connection.user
    if user is None:
        raise Unauthorized
    entry = _entry(hass)
    options = entry.options if entry else {}
    if reason := _reason(hass, options):
        connection.send_result(msg["id"], {"ok": False, "reason": reason})
        return

    mode = options.get(CONF_MODE)
    variables = {"rezim": mode if mode in MODES else DEFAULT_MODE}
    if name := _inviter(hass, user, options):
        variables["od"] = name

    @callback
    def end_cooldown(_now) -> None:
        hass.data.pop(_COOLDOWN, None)
        async_dispatcher_send(hass, _CHANGED)

    hass.data[_COOLDOWN] = True
    async_call_later(hass, COOLDOWN_SECONDS, HassJob(end_cooldown, cancel_on_shutdown=True))
    async_dispatcher_send(hass, _CHANGED)
    try:
        # HA's script.turn_on starts the script with wait=False. Wait for dispatch only.
        await hass.services.async_call(
            "script",
            SERVICE_TURN_ON,
            {ATTR_ENTITY_ID: _entity(options, CONF_SCRIPT), "variables": variables},
            blocking=True,
            context=Context(user_id=user.id),
        )
    except HomeAssistantError:
        _LOGGER.debug("Coffee invitation script could not be started")
        connection.send_result(msg["id"], {"ok": False, "reason": "send_failed"})
        return
    connection.send_result(msg["id"], {"ok": True, "reason": None})


COMMANDS: Final = (websocket_coffee_subscribe, websocket_coffee_invite)
