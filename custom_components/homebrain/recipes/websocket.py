"""WebSocket API ``homebrain/recipes/*`` + the authenticated photo view.

Permissions (see ``roles.role_ws_commands``):

* mapped non-admins (kitchen tablet, family) read recipes, mark favourites/ratings, send
  music commands; the airfryer action needs owner/adult/kiosk;
* recipe edits, URL import, delete and settings are admin-only.

Music control talks to the YouTube Music APP on the kitchen tablet through HA Companion
notification commands – https://companion.home-assistant.io/docs/notifications/notification-commands/
(``command_media`` / ``command_volume_level``). Now-playing comes from the Companion
media session sensor – https://companion.home-assistant.io/docs/core/sensors/#media-session-sensor
"""

from __future__ import annotations

import json
import logging
import re
from collections.abc import Callable
from datetime import timedelta
from functools import wraps
from http import HTTPStatus
from pathlib import Path
from typing import Any

import voluptuous as vol
from aiohttp import web
from homeassistant.components import websocket_api
from homeassistant.components.http import HomeAssistantView
from homeassistant.components.http.auth import async_sign_path
from homeassistant.core import HomeAssistant, callback
from homeassistant.exceptions import HomeAssistantError, Unauthorized
from homeassistant.helpers import entity_registry as er

from ..bindings import get_bindings
from ..const import DOMAIN
from ..roles import RECIPES_DEVICE_ROLES, entry_roles, resolve_role
from ..wine.domain import WineError
from . import media
from .parser import RecipeParseError, parse_recipe_page
from .store import RecipeError, RecipeStore, is_recipe_id
from .timers import (
    NOTIFY_TARGET_RE,
    OPS,
    SETTING_TIMER_NOTIFY,
    RecipeTimers,
    TimerError,
    parse_targets,
)

_LOGGER = logging.getLogger(__name__)
_STORE_KEY = "recipes_store"
_TIMERS_KEY = "recipes_timers"
_NOT_TARGETS = ("send_message", "persistent_notification")
PHOTO_URL = "/api/homebrain/recipes/photo/{recipe_id}/{variant}"
YT_MUSIC_PACKAGE = "com.google.android.apps.youtube.music"
MEDIA_COMMANDS = ("play", "pause", "next", "previous")
SETTING_NOTIFY = "music_notify_service"
_NOTIFY_RE = re.compile(r"^mobile_app_[a-z0-9_]{1,80}$")
AIRFRYER_KEYS = (
    "recipes_airfryer_start",
    "recipes_airfryer_temperature",
    "recipes_airfryer_cook_time",
    "recipes_airfryer_method",
    "recipes_airfryer_drawer",
    "recipes_airfryer_remaining",
)
AIRFRYER_REQUIRED = (
    "recipes_airfryer_start",
    "recipes_airfryer_temperature",
    "recipes_airfryer_cook_time",
    "recipes_airfryer_drawer",
)


def recipes_db_path(hass: HomeAssistant) -> Path:
    """Runtime DB lives in /config/homebrain/, never in the repo or /www."""
    return Path(hass.config.path("homebrain", "recipes.db"))


async def async_get_store(hass: HomeAssistant) -> RecipeStore:
    data = hass.data.setdefault(DOMAIN, {})
    if (store := data.get(_STORE_KEY)) is None:
        store = await hass.async_add_executor_job(RecipeStore(recipes_db_path(hass)).open)
        data[_STORE_KEY] = store
    return store


async def async_get_timers(hass: HomeAssistant) -> RecipeTimers:
    """Timer manager (lazy; loading reschedules persisted timers)."""
    data = hass.data.setdefault(DOMAIN, {})
    if (timers := data.get(_TIMERS_KEY)) is None:
        timers = RecipeTimers(hass, await async_get_store(hass))
        data[_TIMERS_KEY] = timers
        await timers.async_load()
    return timers


async def async_restore_timers(hass: HomeAssistant) -> None:
    """At startup: re-arm persisted timers, but never create recipes.db just for that."""
    if await hass.async_add_executor_job(recipes_db_path(hass).exists):
        await async_get_timers(hass)


async def async_close_store(hass: HomeAssistant) -> None:
    if (timers := hass.data.get(DOMAIN, {}).pop(_TIMERS_KEY, None)) is not None:
        timers.async_stop()
    if (store := hass.data.get(DOMAIN, {}).pop(_STORE_KEY, None)) is not None:
        await hass.async_add_executor_job(store.close)


def _recipe_bindings(hass: HomeAssistant) -> dict[str, str]:
    entries = hass.config_entries.async_entries(DOMAIN)
    return get_bindings(entries[0]).get("recipes", {}) if entries else {}


def _role(hass: HomeAssistant, connection) -> str:
    return resolve_role(connection.user, entry_roles(hass))


def require_role(roles: frozenset[str] | None = None) -> Callable:
    """Mapped roles (not guest); with ``roles`` only those (admins resolve to owner)."""

    def decorator(func: Callable) -> Callable:
        @wraps(func)
        def wrapper(hass, connection, msg):
            role = _role(hass, connection)
            if role == "guest" or (roles is not None and role not in roles):
                raise Unauthorized
            return func(hass, connection, msg)

        return wrapper

    return decorator


def _sign(hass: HomeAssistant, connection, recipe: dict[str, Any]) -> dict[str, Any]:
    """``<img>`` cannot send a bearer: attach short-lived signed URLs to local photos."""
    if recipe.get("photo"):
        for variant in media.VARIANTS:
            recipe["photo"][f"{variant}Url"] = async_sign_path(
                hass,
                PHOTO_URL.format(recipe_id=recipe["id"], variant=variant),
                timedelta(hours=12),
                refresh_token_id=connection.refresh_token_id,
            )
    return recipe


async def _run(hass, connection, msg, job: Callable[[RecipeStore], Any], sign: str | None = None):
    store = await async_get_store(hass)
    try:
        result = await hass.async_add_executor_job(job, store)
    except RecipeError as err:
        connection.send_error(msg["id"], err.code, err.field or err.code)
        return
    if sign == "recipe":
        result = {"recipe": _sign(hass, connection, result)}
    elif sign == "recipes":
        result = {"recipes": [_sign(hass, connection, r) for r in result]}
    connection.send_result(msg["id"], result)


_RID = vol.All(str, vol.Length(min=32, max=32))


@websocket_api.websocket_command(
    {
        vol.Required("type"): "homebrain/recipes/list",
        vol.Optional("search"): vol.All(str, vol.Length(max=100)),
        vol.Optional("tag"): vol.All(str, vol.Length(max=30)),
        vol.Optional("favourite"): bool,
    }
)
@require_role()
@websocket_api.async_response
async def ws_list(hass, connection, msg):
    query = {k: msg[k] for k in ("search", "tag", "favourite") if k in msg}
    await _run(hass, connection, msg, lambda s: s.list(query), sign="recipes")


@websocket_api.websocket_command(
    {vol.Required("type"): "homebrain/recipes/get", vol.Required("recipe_id"): str}
)
@require_role()
@websocket_api.async_response
async def ws_get(hass, connection, msg):
    await _run(hass, connection, msg, lambda s: s.get(msg["recipe_id"]), sign="recipe")


@websocket_api.websocket_command({vol.Required("type"): "homebrain/recipes/tags"})
@require_role()
@websocket_api.async_response
async def ws_tags(hass, connection, msg):
    await _run(hass, connection, msg, lambda s: {"tags": s.tags()})


@websocket_api.websocket_command(
    {
        vol.Required("type"): "homebrain/recipes/create",
        vol.Required("recipe"): dict,
        vol.Optional("photo_url"): vol.Any(None, vol.All(str, vol.Length(max=500))),
    }
)
@websocket_api.require_admin
@websocket_api.async_response
async def ws_create(hass, connection, msg):
    store = await async_get_store(hass)
    try:
        recipe = await hass.async_add_executor_job(store.create, msg["recipe"])
        if msg.get("photo_url"):
            recipe = await _attach_photo(hass, store, recipe["id"], msg["photo_url"])
    except RecipeError as err:
        connection.send_error(msg["id"], err.code, err.field or err.code)
        return
    connection.send_result(msg["id"], {"recipe": _sign(hass, connection, recipe)})


@websocket_api.websocket_command(
    {
        vol.Required("type"): "homebrain/recipes/update",
        vol.Required("recipe_id"): str,
        vol.Required("recipe"): dict,
    }
)
@websocket_api.require_admin
@websocket_api.async_response
async def ws_update(hass, connection, msg):
    await _run(
        hass, connection, msg, lambda s: s.update(msg["recipe_id"], msg["recipe"]), sign="recipe"
    )


@websocket_api.websocket_command(
    {vol.Required("type"): "homebrain/recipes/delete", vol.Required("recipe_id"): str}
)
@websocket_api.require_admin
@websocket_api.async_response
async def ws_delete(hass, connection, msg):
    config = hass.config.config_dir

    def job(store: RecipeStore):
        recipe = store.delete(msg["recipe_id"])
        media.delete_photo(config, recipe["id"])
        # The full record goes back so the UI can offer „Zpět“ (toast.undo -> create).
        return {"deleted": recipe["id"], "recipe": recipe}

    await _run(hass, connection, msg, job)


def _user_patch(command: str, schema: dict, build: Callable[[dict], dict]):
    @websocket_api.websocket_command(
        {vol.Required("type"): command, vol.Required("recipe_id"): str, **schema}
    )
    @require_role()
    @websocket_api.async_response
    async def handler(hass, connection, msg):
        changes = build(msg)
        await _run(hass, connection, msg, lambda s: s.patch(msg["recipe_id"], changes), "recipe")

    return handler


ws_set_favourite = _user_patch(
    "homebrain/recipes/set_favourite",
    {vol.Required("favourite"): bool},
    lambda m: {"favourite": m["favourite"]},
)
ws_set_rating = _user_patch(
    "homebrain/recipes/set_rating",
    {vol.Required("rating"): vol.Any(None, vol.All(int, vol.Range(min=1, max=5)))},
    lambda m: {"rating": m["rating"]},
)
ws_cooked = _user_patch("homebrain/recipes/cooked", {}, lambda _m: {"cooked": True})


# ---------- URL import ----------
async def _fetch(hass: HomeAssistant, url: str, kind: str) -> tuple[bytes, str, str]:
    """SSRF-safe GET (public https only, re-validated redirects, size caps)."""
    from ..wine.safe_fetch import SafeFetcher, create_session  # noqa: PLC0415

    session = create_session()
    try:
        return await SafeFetcher(session).get(url, kind)
    except WineError as err:
        code = {
            "LOOKUP_URL_NOT_ALLOWED": "IMPORT_URL_NOT_ALLOWED",
            "LOOKUP_NOT_FOUND": "IMPORT_NOT_FOUND",
            "LOOKUP_CONTENT_TYPE": "IMPORT_CONTENT_TYPE",
            "LOOKUP_RESPONSE_TOO_LARGE": "IMPORT_TOO_LARGE",
        }.get(err.code, "IMPORT_FETCH_FAILED")
        raise RecipeError(code) from err
    finally:
        await session.close()


# Indirection for tests (no network in CI).
FETCH: Callable[..., Any] = _fetch


async def _attach_photo(hass, store: RecipeStore, recipe_id: str, url: str) -> dict[str, Any]:
    """Download the page's photo and store it locally; a failed photo never fails the save."""
    try:
        data, final_url, _ctype = await FETCH(hass, url, "image")
        info = await hass.async_add_executor_job(
            media.store_photo, hass.config.config_dir, recipe_id, data
        )
    except RecipeError as err:
        _LOGGER.info("Recipe photo skipped (%s)", err.code)
        return await hass.async_add_executor_job(store.get, recipe_id)
    photo = {**info, "sourceUrl": final_url}
    return await hass.async_add_executor_job(store.patch, recipe_id, {"photo": photo})


@websocket_api.websocket_command(
    {
        vol.Required("type"): "homebrain/recipes/import_url",
        vol.Required("url"): vol.All(str, vol.Length(min=8, max=500)),
        vol.Optional("save", default=False): bool,
    }
)
@websocket_api.require_admin
@websocket_api.async_response
async def ws_import_url(hass, connection, msg):
    """Fetch + parse schema.org Recipe. ``save=False`` = preview for the editor."""
    store = await async_get_store(hass)
    try:
        body, final_url, _ctype = await FETCH(hass, msg["url"], "page")
        page = body.decode("utf-8", errors="replace")
        try:
            parsed = parse_recipe_page(page, final_url)
        except RecipeParseError as err:
            raise RecipeError("IMPORT_NO_RECIPE") from err
        duplicate = await hass.async_add_executor_job(store.find_by_source, final_url)
        if not msg["save"]:
            connection.send_result(
                msg["id"], {"preview": parsed, "duplicateOf": duplicate, "saved": False}
            )
            return
        recipe = await hass.async_add_executor_job(store.create, parsed)
        if parsed.get("photoUrl"):
            recipe = await _attach_photo(hass, store, recipe["id"], parsed["photoUrl"])
    except RecipeError as err:
        connection.send_error(msg["id"], err.code, err.field or err.code)
        return
    connection.send_result(
        msg["id"],
        {"recipe": _sign(hass, connection, recipe), "duplicateOf": duplicate, "saved": True},
    )


# ---------- settings / config ----------
async def _notify_service(hass: HomeAssistant) -> str | None:
    store = await async_get_store(hass)
    value = await hass.async_add_executor_job(store.setting, SETTING_NOTIFY)
    return value if value and _NOTIFY_RE.match(value) else None


@websocket_api.websocket_command({vol.Required("type"): "homebrain/recipes/config"})
@require_role()
@websocket_api.async_response
async def ws_config(hass, connection, msg):
    """What the cooking mode may show: music bar and airfryer only when fully configured."""
    bindings = _recipe_bindings(hass)
    notify = await _notify_service(hass)
    airfryer = {
        k.removeprefix("recipes_airfryer_"): bindings[k] for k in AIRFRYER_KEYS if k in bindings
    }
    if status_entity := fryer_status_entity(hass, bindings):
        airfryer["status"] = status_entity
    methods: list[str] = []
    if method_entity := bindings.get("recipes_airfryer_method"):
        state = hass.states.get(method_entity)
        methods = list(state.attributes.get("options", [])) if state else []
    role = _role(hass, connection)
    connection.send_result(
        msg["id"],
        {
            "music": {
                "configured": notify is not None,
                "mediaSessionEntity": bindings.get("recipes_media_session"),
            },
            "airfryer": {
                "configured": all(k in bindings for k in AIRFRYER_REQUIRED),
                "allowed": role in RECIPES_DEVICE_ROLES,
                "entities": airfryer,
                "methods": methods,
            },
            "canEdit": bool(connection.user and connection.user.is_admin),
        },
    )


@websocket_api.websocket_command({vol.Required("type"): "homebrain/recipes/settings_get"})
@websocket_api.require_admin
@websocket_api.async_response
async def ws_settings_get(hass, connection, msg):
    services = sorted(
        name for name in hass.services.async_services_for_domain("notify") if _NOTIFY_RE.match(name)
    )
    store = await async_get_store(hass)
    targets = parse_targets(await hass.async_add_executor_job(store.setting, SETTING_TIMER_NOTIFY))
    connection.send_result(
        msg["id"],
        {
            "musicNotifyService": await _notify_service(hass),
            "availableNotifyServices": services,
            "timerNotifyTargets": targets,
            "airfryerProgramNames": await _owner_program_names(hass),
            "availableTimerNotifyTargets": sorted(
                name
                for name in hass.services.async_services_for_domain("notify")
                if NOTIFY_TARGET_RE.match(name)
                and name not in ("send_message", "persistent_notification")
            ),
        },
    )


@websocket_api.websocket_command(
    {
        vol.Required("type"): "homebrain/recipes/settings_set",
        vol.Optional("music_notify_service"): vol.Any(None, str),
        vol.Optional("timer_notify_targets"): vol.All([str], vol.Length(max=10)),
        # Owner names for AutoCook programs as shown on the device ({"14": "…"}); {} clears.
        vol.Optional("airfryer_program_names"): vol.All(
            {vol.All(str, vol.Match(r"^[0-9]{1,6}$")): vol.All(str, vol.Length(min=1, max=80))},
            vol.Length(max=200),
        ),
    }
)
@websocket_api.require_admin
@websocket_api.async_response
async def ws_settings_set(hass, connection, msg):
    store = await async_get_store(hass)
    result: dict[str, Any] = {}
    if "airfryer_program_names" in msg:
        names = {k: v.strip() for k, v in msg["airfryer_program_names"].items() if v.strip()}
        await hass.async_add_executor_job(
            store.set_setting, SETTING_FRYER_NAMES, json.dumps(names) if names else None
        )
        result["airfryerProgramNames"] = names
    if "timer_notify_targets" in msg:
        targets = [t.removeprefix("notify.") for t in msg["timer_notify_targets"]]
        if any(not NOTIFY_TARGET_RE.match(t) for t in targets):
            connection.send_error(msg["id"], "INVALID_FIELD", "timer_notify_targets")
            return
        targets = list(dict.fromkeys(targets))
        await hass.async_add_executor_job(
            store.set_setting, SETTING_TIMER_NOTIFY, json.dumps(targets) if targets else None
        )
        result["timerNotifyTargets"] = targets
    if "music_notify_service" in msg:
        value = msg["music_notify_service"] or None
        if value is not None:
            value = value.removeprefix("notify.")
            if not _NOTIFY_RE.match(value):
                connection.send_error(msg["id"], "INVALID_FIELD", "music_notify_service")
                return
        await hass.async_add_executor_job(store.set_setting, SETTING_NOTIFY, value)
        result["musicNotifyService"] = value
    connection.send_result(msg["id"], result)


# ---------- timers (minutky) ----------
async def _timer_call(connection, msg, job) -> None:
    try:
        result = await job
    except TimerError as err:
        connection.send_error(msg["id"], err.code, err.code)
        return
    connection.send_result(msg["id"], result)


@websocket_api.websocket_command({vol.Required("type"): "homebrain/recipes/timers/subscribe"})
@require_role()
@websocket_api.async_response
async def ws_timers_subscribe(hass, connection, msg):
    """Full timer list now and after every change (start/pause/+1 min/expiry/cancel)."""
    timers = await async_get_timers(hass)

    @callback
    def forward(payload: dict[str, Any]) -> None:
        connection.send_message(websocket_api.event_message(msg["id"], payload))

    connection.subscriptions[msg["id"]] = timers.async_listen(forward)
    connection.send_result(msg["id"])
    forward(timers.snapshot())


@websocket_api.websocket_command(
    {
        vol.Required("type"): "homebrain/recipes/timers/start",
        vol.Required("label"): vol.All(str, vol.Length(min=1, max=200)),
        vol.Required("seconds"): vol.All(int, vol.Range(min=1, max=24 * 3600)),
        vol.Optional("recipe_id"): vol.Any(None, _RID),
        vol.Optional("step_index"): vol.Any(None, vol.All(int, vol.Range(min=0, max=500))),
    }
)
@require_role()
@websocket_api.async_response
async def ws_timers_start(hass, connection, msg):
    timers = await async_get_timers(hass)
    await _timer_call(
        connection,
        msg,
        timers.async_start(
            msg["label"], msg["seconds"], msg.get("recipe_id"), msg.get("step_index")
        ),
    )


@websocket_api.websocket_command(
    {
        vol.Required("type"): "homebrain/recipes/timers/update",
        vol.Required("timer_id"): vol.All(str, vol.Length(min=1, max=64)),
        vol.Required("op"): vol.In(OPS),
        vol.Optional("seconds", default=60): vol.All(int, vol.Range(min=1, max=3600)),
    }
)
@require_role()
@websocket_api.async_response
async def ws_timers_update(hass, connection, msg):
    timers = await async_get_timers(hass)
    await _timer_call(
        connection, msg, timers.async_update(msg["timer_id"], msg["op"], msg["seconds"])
    )


@websocket_api.websocket_command(
    {
        vol.Required("type"): "homebrain/recipes/timers/cancel",
        vol.Required("timer_id"): vol.All(str, vol.Length(min=1, max=64)),
    }
)
@require_role()
@websocket_api.async_response
async def ws_timers_cancel(hass, connection, msg):
    timers = await async_get_timers(hass)
    connection.send_result(msg["id"], {"cancelled": await timers.async_cancel(msg["timer_id"])})


# ---------- devices ----------
@websocket_api.websocket_command(
    {
        vol.Required("type"): "homebrain/recipes/music",
        vol.Required("command"): vol.In((*MEDIA_COMMANDS, "volume")),
        vol.Optional("level"): vol.All(int, vol.Range(min=0, max=15)),
    }
)
@require_role()
@websocket_api.async_response
async def ws_music(hass, connection, msg):
    """YouTube Music on the tablet via a Companion notification command (allow-listed)."""
    service = await _notify_service(hass)
    if service is None or not hass.services.has_service("notify", service):
        connection.send_error(msg["id"], "NOT_CONFIGURED", "music")
        return
    if msg["command"] == "volume":
        if "level" not in msg:
            connection.send_error(msg["id"], "INVALID_FIELD", "level")
            return
        data = {
            "message": "command_volume_level",
            "data": {"media_stream": "music_stream", "command": msg["level"]},
        }
    else:
        data = {
            "message": "command_media",
            "data": {"media_command": msg["command"], "media_package_name": YT_MUSIC_PACKAGE},
        }
    try:
        await hass.services.async_call("notify", service, data, blocking=True)
    except HomeAssistantError as err:
        _LOGGER.warning("Music command failed: %s", err)
        connection.send_error(msg["id"], "DEVICE_FAILED", "music")
        return
    connection.send_result(msg["id"], {"sent": msg["command"]})


@websocket_api.websocket_command(
    {
        vol.Required("type"): "homebrain/recipes/airfryer",
        vol.Required("temperature"): vol.All(int, vol.Range(min=40, max=230)),
        vol.Required("minutes"): vol.All(int, vol.Range(min=1, max=120)),
        vol.Optional("method"): vol.Any(None, vol.All(str, vol.Length(max=40))),
        vol.Optional("confirmed", default=False): bool,
    }
)
@require_role(RECIPES_DEVICE_ROLES)
@websocket_api.async_response
async def ws_airfryer(hass, connection, msg):
    """Set temperature/time(/method) and press start – ONLY with ``confirmed: true``.

    Refused while the drawer is open or its state is unknown.
    """
    bindings = _recipe_bindings(hass)
    if not all(k in bindings for k in AIRFRYER_REQUIRED):
        connection.send_error(msg["id"], "NOT_CONFIGURED", "airfryer")
        return
    if not msg["confirmed"]:
        connection.send_error(msg["id"], "CONFIRMATION_REQUIRED", "airfryer")
        return
    drawer = hass.states.get(bindings["recipes_airfryer_drawer"])
    if drawer is None or drawer.state != "off":
        code = "AIRFRYER_DRAWER_OPEN" if drawer and drawer.state == "on" else "AIRFRYER_UNAVAILABLE"
        connection.send_error(msg["id"], code, "drawer")
        return
    calls: list[tuple[str, str, dict[str, Any]]] = [
        (
            "number",
            "set_value",
            {"entity_id": bindings["recipes_airfryer_temperature"], "value": msg["temperature"]},
        ),
        (
            "number",
            "set_value",
            {"entity_id": bindings["recipes_airfryer_cook_time"], "value": msg["minutes"]},
        ),
    ]
    if msg.get("method"):
        method_entity = bindings.get("recipes_airfryer_method")
        state = hass.states.get(method_entity) if method_entity else None
        if state is None or msg["method"] not in state.attributes.get("options", []):
            connection.send_error(msg["id"], "INVALID_FIELD", "method")
            return
        calls.append(
            ("select", "select_option", {"entity_id": method_entity, "option": msg["method"]})
        )
    calls.append(("button", "press", {"entity_id": bindings["recipes_airfryer_start"]}))
    try:
        for domain, service, data in calls:
            await hass.services.async_call(domain, service, data, blocking=True)
    except HomeAssistantError as err:
        _LOGGER.warning("Airfryer start failed: %s", err)
        connection.send_error(msg["id"], "DEVICE_FAILED", "airfryer")
        return
    connection.send_result(msg["id"], {"started": True, "minutes": msg["minutes"]})


FRYER_STATUS_SUFFIX = "_cooking_status"
# Live card controls: logical action -> button entity suffix next to the status sensor.
FRYER_CONTROL_SUFFIX = {"pause": "pause", "stop": "stop", "keep_warm": "keep_warm"}
# Statuses in which a control press makes sense (never from standby/idle: no remote start).
FRYER_ACTIVE = frozenset({"cooking", "pause", "user_action", "maintain", "finish"})


def fryer_status_entity(hass: HomeAssistant, bindings: dict[str, str]) -> str | None:
    """Bound status sensor, else the first ``sensor.*_cooking_status`` (suffix autodetect)."""
    if bound := bindings.get("recipes_airfryer_status"):
        return bound
    found = sorted(
        e for e in hass.states.async_entity_ids("sensor") if e.endswith(FRYER_STATUS_SUFFIX)
    )
    return found[0] if found else None


@websocket_api.websocket_command(
    {
        vol.Required("type"): "homebrain/recipes/airfryer_control",
        vol.Required("action"): vol.In(tuple(FRYER_CONTROL_SUFFIX)),
        vol.Optional("confirmed", default=False): bool,
    }
)
@require_role(RECIPES_DEVICE_ROLES)
@websocket_api.async_response
async def ws_airfryer_control(hass, connection, msg):
    """Pause / stop / keep warm a RUNNING fryer. Stop needs ``confirmed: true``.

    The button is derived server-side from the status sensor (client ids are never trusted).
    """
    status_id = fryer_status_entity(hass, _recipe_bindings(hass))
    if not status_id or not status_id.endswith(FRYER_STATUS_SUFFIX):
        connection.send_error(msg["id"], "NOT_CONFIGURED", "airfryer")
        return
    if msg["action"] == "stop" and not msg["confirmed"]:
        connection.send_error(msg["id"], "CONFIRMATION_REQUIRED", "airfryer")
        return
    status = hass.states.get(status_id)
    if status is None or status.state not in FRYER_ACTIVE:
        connection.send_error(msg["id"], "AIRFRYER_NOT_RUNNING", "airfryer")
        return
    prefix = status_id.removeprefix("sensor.").removesuffix(FRYER_STATUS_SUFFIX)
    button = f"button.{prefix}_{FRYER_CONTROL_SUFFIX[msg['action']]}"
    if hass.states.get(button) is None:
        connection.send_error(msg["id"], "AIRFRYER_UNAVAILABLE", msg["action"])
        return
    try:
        await hass.services.async_call("button", "press", {"entity_id": button}, blocking=True)
    except HomeAssistantError as err:
        _LOGGER.warning("Airfryer %s failed: %s", msg["action"], err)
        connection.send_error(msg["id"], "DEVICE_FAILED", "airfryer")
        return
    connection.send_result(msg["id"], {"sent": msg["action"]})


_PROGRAM_ID_KEYS = ("referenceId", "reference_id", "id", "recipeId", "recipe_id", "uuid")
_PROGRAM_NAME_KEYS = ("name", "title", "recipeName", "recipe_name", "displayName")


def _program_name_from(item: Any) -> str | None:
    if isinstance(item, str):
        return item.strip() or None
    if isinstance(item, dict):
        for key in _PROGRAM_NAME_KEYS:
            value = item.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()
    return None


def program_name_from_cache(cache: Any, program: int) -> str | None:
    """AutoCook program name from the airfryer integration's recipe cache (shape-tolerant).

    Accepts ``{id: name}``, ``{id: {name: …}}``, ``[{referenceId: id, name: …}]`` or the same
    list under a ``recipes``/``items`` key. Unknown shapes simply give ``None``.
    """
    wanted = str(program)
    if isinstance(cache, dict):
        for nested in ("recipes", "items", "data"):
            if isinstance(cache.get(nested), list | dict):
                found = program_name_from_cache(cache[nested], program)
                if found:
                    return found
        for key, value in cache.items():
            if str(key) == wanted:
                return _program_name_from(value)
        return None
    if isinstance(cache, list):
        for item in cache:
            if not isinstance(item, dict):
                continue
            if any(str(item.get(k)) == wanted for k in _PROGRAM_ID_KEYS if k in item):
                return _program_name_from(item)
    return None


SETTING_FRYER_NAMES = "airfryer_program_names"


async def _owner_program_names(hass: HomeAssistant) -> dict[str, str]:
    store = await async_get_store(hass)
    raw = await hass.async_add_executor_job(store.setting, SETTING_FRYER_NAMES)
    try:
        data = json.loads(raw) if raw else {}
    except ValueError:
        return {}
    return {str(k): str(v) for k, v in data.items()} if isinstance(data, dict) else {}


def fryer_program_name(hass: HomeAssistant, status_id: str, program: int) -> str | None:
    """Resolve the name via the config entry that owns the fryer status sensor (never a copy)."""
    try:
        reg_entry = er.async_get(hass).async_get(status_id)
        entry_id = reg_entry.config_entry_id if reg_entry else None
        entry = hass.config_entries.async_get_entry(entry_id) if entry_id else None
        if entry is None:
            return None
        for source in (entry.data, entry.options):
            name = program_name_from_cache((source or {}).get("recipe_cache"), program)
            if name:
                return name[:80]
    except Exception:  # noqa: BLE001 - foreign integration data must never break the card
        _LOGGER.debug("Airfryer program name lookup failed", exc_info=True)
    return None


@websocket_api.websocket_command(
    {
        vol.Required("type"): "homebrain/recipes/airfryer_program",
        vol.Required("program"): vol.All(int, vol.Range(min=1, max=100000)),
    }
)
@require_role(RECIPES_DEVICE_ROLES)
@websocket_api.async_response
async def ws_airfryer_program(hass, connection, msg):
    """AutoCook program id -> display name from the fryer integration (``None`` = unknown)."""
    status_id = fryer_status_entity(hass, _recipe_bindings(hass))
    if not status_id or not status_id.endswith(FRYER_STATUS_SUFFIX):
        connection.send_error(msg["id"], "NOT_CONFIGURED", "airfryer")
        return
    # Owner names (as printed on the device) win over the integration's cloud catalogue.
    owner = (await _owner_program_names(hass)).get(str(msg["program"]))
    name = owner or fryer_program_name(hass, status_id, msg["program"])
    connection.send_result(msg["id"], {"name": name})


class RecipePhotoView(HomeAssistantView):
    """Locally stored recipe photos for mapped users (bearer or signed path)."""

    url = PHOTO_URL
    name = "api:homebrain:recipes:photo"
    requires_auth = True

    async def get(self, request: web.Request, recipe_id: str, variant: str) -> web.StreamResponse:
        hass = request.app["hass"]
        if not is_recipe_id(recipe_id) or variant not in media.VARIANTS:
            return web.Response(status=HTTPStatus.NOT_FOUND)
        user = request.get("hass_user")
        if user is not None and resolve_role(user, entry_roles(hass)) == "guest":
            return web.Response(status=HTTPStatus.FORBIDDEN)
        path = media.photo_path(hass.config.config_dir, recipe_id, variant)
        if not await hass.async_add_executor_job(path.is_file):
            return web.Response(status=HTTPStatus.NOT_FOUND)
        return web.FileResponse(
            path,
            headers={
                "Content-Type": "image/webp",
                "Cache-Control": "private, max-age=3600",
                "X-Content-Type-Options": "nosniff",
            },
        )


COMMANDS = (
    ws_list,
    ws_get,
    ws_tags,
    ws_create,
    ws_update,
    ws_delete,
    ws_set_favourite,
    ws_set_rating,
    ws_cooked,
    ws_import_url,
    ws_config,
    ws_settings_get,
    ws_settings_set,
    ws_music,
    ws_airfryer,
    ws_airfryer_control,
    ws_airfryer_program,
    ws_timers_subscribe,
    ws_timers_start,
    ws_timers_update,
    ws_timers_cancel,
)


def async_register(
    hass: HomeAssistant,
    register: Callable[[HomeAssistant, Any], None] = websocket_api.async_register_command,
) -> None:
    for command in COMMANDS:
        register(hass, command)
    if getattr(hass, "http", None) is not None:
        hass.http.register_view(RecipePhotoView())
