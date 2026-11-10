"""Kitchen WS: role-checked, bounded public HA actions (Refs #90)."""

from __future__ import annotations

import asyncio
import time
from collections import deque

import voluptuous as vol
from homeassistant.components import websocket_api
from homeassistant.core import callback
from homeassistant.exceptions import HomeAssistantError, Unauthorized
from homeassistant.helpers import entity_registry as er

from ..const import DOMAIN
from ..roles import entry_roles, resolve_role
from .model import SETTINGS, TEXT, defaults, image_url, media_item

ROLES = frozenset({"owner", "adult", "kiosk"})


def _entry(hass):
    entries = hass.config_entries.async_entries(DOMAIN)
    return entries[0] if entries else None


def config(hass):
    entry = _entry(hass)
    return (
        entry.options.get("kitchen")
        or defaults(sorted(s.entity_id for s in hass.states.async_all("person")))
        if entry
        else defaults()
    )


def players(hass):
    return [
        {"entity_id": e.entity_id, "name": s.attributes.get("friendly_name", e.entity_id)}
        for e in er.async_get(hass).entities.values()
        if e.platform == "music_assistant"
        and e.domain == "media_player"
        and not e.disabled
        and (s := hass.states.get(e.entity_id)) is not None
    ]


def _ma(hass):
    entries = hass.config_entries.async_entries("music_assistant")
    return (
        entries[0].entry_id
        if entries and hass.services.has_service("music_assistant", "get_library")
        else None
    )


def _access(hass, connection, msg, *, limit=30):
    if resolve_role(connection.user, entry_roles(hass)) not in ROLES:
        raise Unauthorized
    # Buckets are keyed by authenticated user, never by arbitrary message data. Evict idle users.
    buckets = hass.data.setdefault(DOMAIN, {}).setdefault("kitchen_limits", {})
    now = time.monotonic()
    for key in list(buckets):
        if not buckets[key] or now - buckets[key][-1] > 60:
            del buckets[key]
    key = (connection.user.id, msg["type"])
    bucket = buckets.setdefault(key, deque(maxlen=60))
    while bucket and now - bucket[0] > 60:
        bucket.popleft()
    if len(bucket) >= limit:
        connection.send_error(msg["id"], "rate_limited", "Chvíli vyčkejte a zkuste to znovu")
        return False
    bucket.append(now)
    return True


async def _call(hass, connection, msg, domain, service, data, *, target=None, response=False):
    async with asyncio.timeout(15):
        return await hass.services.async_call(
            domain,
            service,
            data,
            target=target,
            blocking=True,
            return_response=response,
            context=connection.context(msg),
        )


def _target(hass):
    eid = config(hass)["player"]
    state = hass.states.get(eid) if eid else None
    return (
        eid
        if eid in {p["entity_id"] for p in players(hass)}
        and state
        and state.state not in ("unavailable", "unknown")
        else None
    )


@websocket_api.websocket_command({vol.Required("type"): "homebrain/kitchen/get"})
@callback
def websocket_get(hass, connection, msg):
    if not _access(hass, connection, msg, limit=60):
        return
    cfg = config(hass)
    eid = _target(hass)
    state = hass.states.get(eid) if eid else None
    attrs = state.attributes if state else {}
    battery = hass.states.get(cfg["battery_sensor"]) if cfg["battery_sensor"] else None
    charging = hass.states.get(cfg["battery_state_sensor"]) if cfg["battery_state_sensor"] else None
    admin = bool(connection.user.is_admin)
    connection.send_result(
        msg["id"],
        {
            "config": cfg,
            "is_admin": admin,
            "ma_available": bool(_ma(hass)),
            "player": {
                "entity_id": eid,
                "name": attrs.get("friendly_name", "Přehrávač"),
                "state": state.state,
                "title": attrs.get("media_title") or attrs.get("media_channel") or "Nic nehraje",
                "artist": attrs.get("media_artist", ""),
                "image": image_url(attrs.get("entity_picture")),
                "volume": attrs.get("volume_level", 0),
            }
            if state
            else None,
            "battery": {
                "level": battery.state if battery else None,
                "state": charging.state if charging else None,
            },
            "candidates": {
                "players": players(hass),
                "persons": [
                    {
                        "entity_id": s.entity_id,
                        "name": s.attributes.get("friendly_name", s.entity_id),
                    }
                    for s in hass.states.async_all("person")
                ],
                "sensors": [
                    {
                        "entity_id": s.entity_id,
                        "name": s.attributes.get("friendly_name", s.entity_id),
                    }
                    for s in hass.states.async_all("sensor")
                    if s.attributes.get("device_class") == "battery"
                    or s.entity_id.endswith("_battery_state")
                ],
            }
            if admin
            else None,
        },
    )


async def _catalog(hass, connection, msg, kind):
    if not _access(hass, connection, msg, limit=20):
        return
    if not (entry_id := _ma(hass)):
        connection.send_error(msg["id"], "ma_unavailable", "Music Assistant není dostupný")
        return
    try:
        if kind == "radio":
            result = await _call(
                hass,
                connection,
                msg,
                "music_assistant",
                "search",
                {
                    "config_entry_id": entry_id,
                    "name": msg["query"],
                    "media_type": ["radio"],
                    "limit": 30,
                    "library_only": False,
                },
                response=True,
            )
            raw = (result or {}).get("radio", [])
        else:
            result = await _call(
                hass,
                connection,
                msg,
                "music_assistant",
                "get_library",
                {
                    "config_entry_id": entry_id,
                    "media_type": "playlist",
                    "limit": 500,
                    "offset": msg.get("offset", 0),
                    "order_by": "name",
                },
                response=True,
            )
            raw = (result or {}).get("items", [])
        items = [item for r in raw[:500] if (item := media_item(r))]
        # Public HA responses omit provider mappings for library:// URIs. Preserve explicit
        # owner assignments; never infer an account from a playlist title.
        for item in items:
            for person in config(hass)["persons"]:
                if person["provider"] and any(p["uri"] == item["uri"] for p in person["playlists"]):
                    item["providers"] = sorted(set([*item["providers"], person["provider"]]))
        provider = msg.get("provider", "")
        connection.send_result(
            msg["id"],
            {
                "items": [i for i in items if not provider or provider in i["providers"]],
                "next_offset": msg.get("offset", 0) + 500
                if kind == "playlist" and len(raw) == 500
                else None,
            },
        )
    except (HomeAssistantError, TimeoutError, vol.Invalid):
        connection.send_error(
            msg["id"], "ma_unavailable", "Music Assistant neodpovídá. Zkuste to znovu."
        )


@websocket_api.websocket_command(
    {vol.Required("type"): "homebrain/kitchen/search_radios", vol.Required("query"): TEXT}
)
@websocket_api.async_response
async def websocket_search(hass, connection, msg):
    await _catalog(hass, connection, msg, "radio")


@websocket_api.websocket_command(
    {
        vol.Required("type"): "homebrain/kitchen/playlists",
        vol.Optional("provider", default=""): vol.All(str, vol.Length(max=120)),
        vol.Optional("offset", default=0): vol.All(int, vol.Range(min=0, max=1000000)),
    }
)
@websocket_api.async_response
async def websocket_playlists(hass, connection, msg):
    await _catalog(hass, connection, msg, "playlist")


async def _action(hass, connection, msg, *, play=False):
    if not _access(hass, connection, msg):
        return
    eid = _target(hass)
    if not eid or not _ma(hass):
        connection.send_error(msg["id"], "no_player", "Vyberte přehrávač")
        return
    # Only the configured MA player is ever controlled; callers cannot submit a target.
    if not connection.user.permissions.check_entity(eid, "control"):
        raise Unauthorized
    domain = "media_player"
    if play:
        domain, service = "music_assistant", "play_media"
        data = {"media_id": msg["media_id"], "media_type": msg["media_type"], "enqueue": "replace"}
    else:
        service = {"play": "media_play", "pause": "media_pause", "volume": "volume_set"}[
            msg["action"]
        ]
        data = {"volume_level": msg["level"]} if msg["action"] == "volume" else {}
    try:
        await _call(hass, connection, msg, domain, service, data, target={"entity_id": eid})
        connection.send_result(msg["id"], {"ok": True})
    except (HomeAssistantError, TimeoutError, vol.Invalid):
        connection.send_error(msg["id"], "service_failed", "Příkaz se nepodařilo provést")


@websocket_api.websocket_command(
    {
        vol.Required("type"): "homebrain/kitchen/play",
        vol.Required("media_id"): vol.All(
            str, vol.Length(min=1, max=1024), vol.Match(r"^[a-zA-Z0-9_+-]+://[^\s]+$")
        ),
        vol.Required("media_type"): vol.In(("radio", "playlist")),
    }
)
@websocket_api.async_response
async def websocket_play(hass, connection, msg):
    await _action(hass, connection, msg, play=True)


@websocket_api.websocket_command(
    {
        vol.Required("type"): "homebrain/kitchen/transport",
        vol.Required("action"): vol.In(("play", "pause", "volume")),
        vol.Optional("level"): vol.All(vol.Coerce(float), vol.Range(min=0, max=1)),
    }
)
@websocket_api.async_response
async def websocket_transport(hass, connection, msg):
    if msg["action"] == "volume" and "level" not in msg:
        connection.send_error(msg["id"], "invalid_format", "Chybí hlasitost")
        return
    await _action(hass, connection, msg)


@websocket_api.websocket_command(
    {vol.Required("type"): "homebrain/kitchen/save", vol.Required("config"): SETTINGS}
)
@websocket_api.require_admin
@callback
def websocket_save(hass, connection, msg):
    if not _access(hass, connection, msg, limit=10):
        return
    entry = _entry(hass)
    if not entry:
        connection.send_error(msg["id"], "not_configured", "HomeBrain není nastaven")
        return
    cfg = msg["config"]
    if cfg["player"] and cfg["player"] not in {p["entity_id"] for p in players(hass)}:
        connection.send_error(msg["id"], "invalid_format", "Vyberte přehrávač Music Assistantu")
        return
    # Sanitize artwork URLs even when settings arrive directly over WS.
    for item in [
        *cfg["radios"],
        *cfg["more_radios"],
        *(i for p in cfg["persons"] for i in p["playlists"]),
    ]:
        item["image"] = image_url(item.get("image"))
    hass.config_entries.async_update_entry(entry, options={**entry.options, "kitchen": cfg})
    connection.send_result(msg["id"], {"ok": True})


COMMANDS = (
    websocket_get,
    websocket_search,
    websocket_playlists,
    websocket_play,
    websocket_transport,
    websocket_save,
)
