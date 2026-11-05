"""WebSocket API for the weather module."""

from http import HTTPStatus
from typing import Any

import voluptuous as vol
from aiohttp import web
from homeassistant.components import websocket_api
from homeassistant.components.http import HomeAssistantView
from homeassistant.core import HomeAssistant, callback

from ..const import DOMAIN
from ..roles import entry_roles, require_dnes_access, resolve_role


@websocket_api.websocket_command({vol.Required("type"): "homebrain/weather/get"})
@require_dnes_access
@callback
def websocket_weather_get(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """Return the blended weather snapshot (current, 48 h, 10 days, warnings, sources)."""
    manager = hass.data.get(DOMAIN, {}).get("weather")
    if manager is None:
        connection.send_error(msg["id"], "not_found", "Weather is not running")
        return
    connection.send_result(msg["id"], manager.snapshot())


@websocket_api.websocket_command({vol.Required("type"): "homebrain/weather/alerts"})
@require_dnes_access
@callback
def websocket_weather_alerts(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """ČHMÚ warnings for the home ORP (area resolved from HA home coordinates)."""
    manager = hass.data.get(DOMAIN, {}).get("weather")
    if manager is None:
        connection.send_error(msg["id"], "not_found", "Weather is not running")
        return
    from homeassistant.util import dt as dt_util

    connection.send_result(msg["id"], manager.alerts_block(dt_util.utcnow()))


class RadarImageView(HomeAssistantView):
    """Cropped ČHMÚ radar frames around home. Authenticated (bearer or signed path)."""

    url = "/api/homebrain/weather/radar/{frame_id}"
    name = "api:homebrain:weather:radar"
    requires_auth = True

    async def get(self, request: web.Request, frame_id: str) -> web.Response:
        hass = request.app["hass"]
        manager = hass.data.get(DOMAIN, {}).get("weather")
        if manager is None or len(frame_id) > 20:
            return web.Response(status=HTTPStatus.NOT_FOUND)
        # Same default-deny as the snapshot: the crop is centred on home.
        user = request.get("hass_user")
        if user is not None and resolve_role(user, entry_roles(hass)) == "guest":
            return web.Response(status=HTTPStatus.FORBIDDEN)
        png = await hass.async_add_executor_job(manager.radar_png, frame_id)
        if png is None:
            return web.Response(status=HTTPStatus.NOT_FOUND)
        return web.Response(
            body=png,
            content_type="image/png",
            headers={"Cache-Control": "private, max-age=300"},
        )
