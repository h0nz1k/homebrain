"""WebSocket API of the Roboti module (read-only)."""

from __future__ import annotations

from http import HTTPStatus
from typing import Any

import voluptuous as vol
from aiohttp import web
from homeassistant.components import websocket_api
from homeassistant.components.http import HomeAssistantView
from homeassistant.core import HomeAssistant

from ..bindings import get_bindings
from ..const import DOMAIN
from .config import ROBOT_SLOTS, slot_settings
from .map_source import RASTER_PATH, VectorMapCache
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


def _map_cache(hass: HomeAssistant) -> VectorMapCache:
    data = hass.data.setdefault(DOMAIN, {})
    if (cache := data.get("robot_vector_maps")) is None:
        cache = data["robot_vector_maps"] = VectorMapCache(hass)
    return cache


@websocket_api.websocket_command(
    {
        vol.Required("type"): "homebrain/robots/map",
        vol.Required("slot"): vol.All(int, vol.In(ROBOT_SLOTS)),
    }
)
@websocket_api.require_admin
@websocket_api.async_response
async def websocket_robots_map(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """Vector floor plan of one robot (room polygons, dock, robot, path) – read-only.

    Answers ``{available: false, reason}`` whenever the internal Roborock data cannot be
    used; the panel then shows the ``image.*`` PNG instead.
    """
    if not (entries := hass.config_entries.async_entries(DOMAIN)):
        connection.send_error(msg["id"], "not_found", "HomeBrain is not configured")
        return
    bindings = get_bindings(entries[0]).get("robots", {})
    image = bindings.get(f"robot{msg['slot']}_map_image")
    if not image:
        connection.send_result(msg["id"], {"available": False, "reason": "no_map_entity"})
        return
    result = await _map_cache(hass).async_get(image)
    if result.get("available") and (raster := result["map"].get("raster")):
        raster["path"] = RASTER_PATH.format(slot=msg["slot"], digest=result["map"]["digest"])
    connection.send_result(msg["id"], result)


class RobotMapImageView(HomeAssistantView):
    """Raster base layer of a robot map (PNG per theme). Admin only, like the WS API.

    The URL carries the floor-plan digest, so responses are immutable: long private cache
    plus an ETag. A stale digest answers 404 and the panel reloads the map payload.
    """

    url = "/api/homebrain/robots/map/{slot}/{digest}/{theme}.png"
    name = "api:homebrain:robots:map"
    requires_auth = True

    async def get(self, request: web.Request, slot: str, digest: str, theme: str) -> web.Response:
        hass: HomeAssistant = request.app["hass"]
        user = request.get("hass_user")
        if user is None or not user.is_admin:
            return web.Response(status=HTTPStatus.FORBIDDEN)
        if not slot.isdigit() or int(slot) not in ROBOT_SLOTS or len(digest) > 32:
            return web.Response(status=HTTPStatus.NOT_FOUND)
        etag = f'"{digest}-{theme}"'
        headers = {"Cache-Control": "private, max-age=86400, immutable", "ETag": etag}
        if request.headers.get("If-None-Match") == etag:
            return web.Response(status=HTTPStatus.NOT_MODIFIED, headers=headers)
        if not (entries := hass.config_entries.async_entries(DOMAIN)):
            return web.Response(status=HTTPStatus.NOT_FOUND)
        image = get_bindings(entries[0]).get("robots", {}).get(f"robot{slot}_map_image")
        if not image:
            return web.Response(status=HTTPStatus.NOT_FOUND)
        png = await _map_cache(hass).async_png(image, digest, theme)
        if png is None:
            return web.Response(status=HTTPStatus.NOT_FOUND)
        return web.Response(body=png, content_type="image/png", headers=headers)
