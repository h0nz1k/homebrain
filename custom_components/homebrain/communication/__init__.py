"""Communication module lifecycle, HA service and admin-only audit websocket."""

from __future__ import annotations

import voluptuous as vol
from homeassistant.components import websocket_api
from homeassistant.core import SupportsResponse, callback
from homeassistant.exceptions import ServiceValidationError, Unauthorized
from homeassistant.helpers import config_validation as cv

from ..const import DOMAIN
from .config import CHANNELS, PRIORITIES
from .router import Router

SERVICE_SCHEMA = vol.Schema(
    {
        vol.Required("recipient"): cv.slug,
        vol.Required("message"): vol.All(cv.string, vol.Length(min=1, max=4096)),
        vol.Optional("title", default="HomeBrain"): vol.All(cv.string, vol.Length(max=200)),
        vol.Optional("priority", default="normal"): vol.In(PRIORITIES),
        vol.Optional("channel"): vol.In(CHANNELS),
        vol.Optional("tag"): vol.All(cv.string, vol.Length(min=1, max=200)),
        vol.Optional("data", default=dict): dict,
    }
)


async def async_setup(hass, entry):
    if "communication" in hass.data.setdefault(DOMAIN, {}):
        return
    router = Router(hass, entry)
    await router.start()
    hass.data[DOMAIN]["communication"] = router

    async def notify(call):
        # Automations (no user context) and administrators may send; role mapping alone
        # never grants arbitrary users authority to address other people's channels.
        if call.context.user_id:
            user = await hass.auth.async_get_user(call.context.user_id)
            if not user or not user.is_admin:
                raise Unauthorized()
        try:
            return await router.notify(dict(call.data), call.context)
        except ValueError as err:
            raise ServiceValidationError("Neznámý příjemce zprávy") from err

    hass.services.async_register(
        DOMAIN, "notify", notify, schema=SERVICE_SCHEMA, supports_response=SupportsResponse.OPTIONAL
    )


async def async_unload(hass):
    hass.services.async_remove(DOMAIN, "notify")
    if router := hass.data.get(DOMAIN, {}).pop("communication", None):
        await router.stop()


@websocket_api.websocket_command({vol.Required("type"): "homebrain/communication/recent"})
@callback
@websocket_api.require_admin
def websocket_recent(hass, connection, msg):
    router = hass.data.get(DOMAIN, {}).get("communication")
    if router is None:
        connection.send_error(msg["id"], "module_unavailable", "Komunikační centrum není dostupné")
        return
    connection.send_result(msg["id"], {"messages": router.snapshot()})
