"""WebSocket API of the Roboti module (maps read-only; presets/defaults + apply-and-start)."""

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
from .discovery import discover_floor
from .map_source import RASTER_PATH, VectorMapCache
from .models import max_passes_for_model, model_for_vacuum
from .presets import (
    MAX_PASSES,
    MODES,
    PresetError,
    PresetStore,
    async_start_cleaning,
)
from .rooms import RoomCache


def _cache(hass: HomeAssistant) -> RoomCache:
    data = hass.data.setdefault(DOMAIN, {})
    if (cache := data.get("robot_rooms")) is None:
        cache = data["robot_rooms"] = RoomCache(hass)
    return cache


async def known_room_ids(hass: HomeAssistant, vacuum: str) -> set[int]:
    """Segment ids on the robot's maps (empty = unknown, the start is not blocked)."""
    maps = (await _cache(hass).async_get(vacuum))["maps"]
    return {room["id"] for item in maps for room in item["rooms"]}


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
        settings = slot_settings(entry.options, slot)
        model = model_for_vacuum(hass, vacuum)
        robots.append(
            {
                "slot": slot,
                **settings,
                # HA area -> floor of the vacuum's device; the manual floor is the fallback.
                "floor": discover_floor(hass, vacuum) or settings["floor"],
                "vacuum": vacuum,
                "model": model,
                "max_passes": max_passes_for_model(model),
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
    if result.get("available") and (vacuum := bindings.get(f"robot{msg['slot']}_vacuum")):
        selected_entity = bindings.get(f"robot{msg['slot']}_selected_map")
        selected_state = hass.states.get(selected_entity) if selected_entity else None
        await _cache(hass).async_match_segments(
            vacuum,
            {room["id"] for room in result["map"]["rooms"]},
            selected_state.state if selected_state else None,
        )
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


# --- presets, defaults, start -----------------------------------------------------------

_OPTION = vol.Any(None, vol.All(str, vol.Match(r"^[a-z0-9_]{1,32}$")))
SETTINGS_SCHEMA = {
    vol.Optional("mode"): vol.Any(None, vol.In(MODES)),
    vol.Optional("fan"): _OPTION,
    vol.Optional("water"): _OPTION,
    vol.Optional("route"): _OPTION,
    vol.Optional("passes", default=1): vol.All(int, vol.Range(min=1, max=MAX_PASSES)),
}
_SLOT = vol.All(int, vol.In(ROBOT_SLOTS))
_ROOMS = vol.All([vol.All(int, vol.Range(min=0))], vol.Length(max=64))
_PRESET_ID = vol.All(str, vol.Match(r"^[a-f0-9]{8,32}$"))


def preset_store(hass: HomeAssistant) -> PresetStore:
    data = hass.data.setdefault(DOMAIN, {})
    if (store := data.get("robot_presets")) is None:
        store = data["robot_presets"] = PresetStore(hass)
    return store


def _robot_bindings(hass: HomeAssistant, connection: Any, msg: dict[str, Any]) -> dict | None:
    if not (entries := hass.config_entries.async_entries(DOMAIN)):
        connection.send_error(msg["id"], "not_found", "HomeBrain is not configured")
        return None
    bindings = get_bindings(entries[0]).get("robots", {})
    if "slot" in msg and not bindings.get(f"robot{msg['slot']}_vacuum"):
        connection.send_error(msg["id"], "not_found", "Robot is not configured")
        return None
    return bindings


@websocket_api.websocket_command({vol.Required("type"): "homebrain/robots/presets/list"})
@websocket_api.require_admin
@websocket_api.async_response
async def websocket_presets_list(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """Defaults + presets of every robot slot: ``{robots: {"1": {defaults, presets}}}``."""
    if _robot_bindings(hass, connection, msg) is None:
        return
    connection.send_result(msg["id"], {"robots": await preset_store(hass).async_list()})


@websocket_api.websocket_command(
    {
        vol.Required("type"): "homebrain/robots/presets/save",
        vol.Required("slot"): _SLOT,
        vol.Required("preset"): {
            vol.Optional("id"): vol.Any(None, _PRESET_ID),
            vol.Required("name"): vol.All(str, vol.Length(min=1, max=80)),
            vol.Optional("rooms", default=list): _ROOMS,
            **SETTINGS_SCHEMA,
        },
    }
)
@websocket_api.require_admin
@websocket_api.async_response
async def websocket_presets_save(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """Create (no id) or replace a named preset; answers the stored preset."""
    if _robot_bindings(hass, connection, msg) is None:
        return
    try:
        preset = await preset_store(hass).async_save_preset(msg["slot"], msg["preset"])
    except PresetError as err:
        connection.send_error(msg["id"], err.code, str(err))
        return
    connection.send_result(msg["id"], {"preset": preset})


@websocket_api.websocket_command(
    {
        vol.Required("type"): "homebrain/robots/presets/delete",
        vol.Required("slot"): _SLOT,
        vol.Required("preset_id"): _PRESET_ID,
    }
)
@websocket_api.require_admin
@websocket_api.async_response
async def websocket_presets_delete(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    if _robot_bindings(hass, connection, msg) is None:
        return
    if not await preset_store(hass).async_delete_preset(msg["slot"], msg["preset_id"]):
        connection.send_error(msg["id"], "not_found", "Preset not found")
        return
    connection.send_result(msg["id"], {"deleted": True})


@websocket_api.websocket_command(
    {vol.Required("type"): "homebrain/robots/defaults/get", vol.Required("slot"): _SLOT}
)
@websocket_api.require_admin
@websocket_api.async_response
async def websocket_defaults_get(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    if _robot_bindings(hass, connection, msg) is None:
        return
    defaults = await preset_store(hass).async_get_defaults(msg["slot"])
    connection.send_result(msg["id"], {"defaults": defaults})


@websocket_api.websocket_command(
    {
        vol.Required("type"): "homebrain/robots/defaults/set",
        vol.Required("slot"): _SLOT,
        vol.Required("defaults"): vol.Any(None, SETTINGS_SCHEMA),
    }
)
@websocket_api.require_admin
@websocket_api.async_response
async def websocket_defaults_set(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """Remember (or clear with ``null``) the robot's default cleaning setup."""
    if _robot_bindings(hass, connection, msg) is None:
        return
    defaults = await preset_store(hass).async_set_defaults(msg["slot"], msg["defaults"])
    connection.send_result(msg["id"], {"defaults": defaults})


@websocket_api.websocket_command(
    {
        vol.Required("type"): "homebrain/robots/start",
        vol.Required("slot"): _SLOT,
        vol.Exclusive("preset_id", "source"): _PRESET_ID,
        vol.Exclusive("rooms", "source"): _ROOMS,
        vol.Optional("settings"): SETTINGS_SCHEMA,
    }
)
@websocket_api.require_admin
@websocket_api.async_response
async def websocket_robots_start(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """Apply defaults ← preset ← explicit settings on the robot, wait for HA, then start.

    Rooms come from the preset or the message (ordered segment ids); none = whole home.
    Only the slot's bound vacuum/select entities are ever targeted (allowlist).
    """
    if (bindings := _robot_bindings(hass, connection, msg)) is None:
        return
    try:
        result = await async_start_cleaning(
            hass,
            bindings,
            msg["slot"],
            preset_store(hass),
            preset_id=msg.get("preset_id"),
            rooms=msg.get("rooms"),
            settings=msg.get("settings"),
            known_rooms=lambda vacuum: known_room_ids(hass, vacuum),
        )
    except PresetError as err:
        connection.send_error(msg["id"], err.code, str(err))
        return
    except Exception as err:  # noqa: BLE001 - integration errors must reach the panel
        connection.send_error(msg["id"], "failed", str(err) or type(err).__name__)
        return
    connection.send_result(msg["id"], result)


PRESET_COMMANDS = (
    websocket_presets_list,
    websocket_presets_save,
    websocket_presets_delete,
    websocket_defaults_get,
    websocket_defaults_set,
    websocket_robots_start,
)
