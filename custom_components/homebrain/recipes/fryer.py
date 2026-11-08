"""Fritéza: manual airfryer start independent of recipes – WS ``homebrain/fryer/*``.

Works with the Philips HomeID integration's entities, found next to the
``sensor.<prefix>_cooking_status`` sensor (the Recepty bindings win where set):

* ``get`` – entity ids, capabilities, limits, start blockers, user favourites (every mapped role;
  ``canControl`` only for owner/adult, the kitchen kiosk and children only watch the status);
* ``start`` – method ``manual`` → temperature → time → air speed (→ probe target) → start button,
  ONLY with ``confirmed: true``; refused while the drawer is open, on a device error or while the
  fryer already cooks; then waits until the status sensor reports cooking (``verified``);
* ``control`` – pause / resume / stop (confirmed) / add_time on a running fryer;
* ``favourites/save|delete`` – user quick presets in HA storage (owner/adult).

The fryer's built-in AutoCook programs are NOT startable: the integration only exposes them
(select ``autocook_program`` + button ``autocook_send``) for local-HTTP models, and a cloud
(MQTT/Fusion) appliance gets neither entity, so ``presets.supported`` is always false here.
The integration also drops the preheat flag on cloud models, so there is no preheat option.
"""

from __future__ import annotations

import asyncio
import logging
import time
import uuid
from collections.abc import Callable, Iterable
from functools import wraps
from typing import Any

import voluptuous as vol
from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import HomeAssistantError, Unauthorized
from homeassistant.helpers.storage import Store

from ..bindings import get_bindings
from ..const import DOMAIN
from ..roles import FRYER_CONTROL_ROLES, entry_roles, resolve_role

_LOGGER = logging.getLogger(__name__)

# Seconds to wait for the status sensor to confirm a start (cloud MQTT round trip).
VERIFY_TIMEOUT = 15.0
# Seconds one service call may block (the integration wakes the fryer from standby first).
CALL_TIMEOUT = 25.0
MAX_FAVOURITES = 24

LIMITS: dict[str, tuple[int, int]] = {
    "temperature": (40, 200),
    "minutes": (1, 60),
    "air_speed": (1, 2),
    "probe_temperature": (40, 100),
}
# role -> (domain, suffix next to the status sensor's prefix)
SUFFIXES: dict[str, tuple[str, str]] = {
    "status": ("sensor", "cooking_status"),
    "remaining": ("sensor", "time_remaining"),
    "current_temperature": ("sensor", "current_temperature"),
    "target_temperature": ("sensor", "target_temperature"),
    "stage": ("sensor", "current_stage"),
    "error": ("sensor", "error_code"),
    "drawer": ("binary_sensor", "drawer"),
    "probe_unplugged": ("binary_sensor", "probe_unplugged"),
    "method": ("select", "cooking_method"),
    "temperature": ("number", "set_temperature"),
    "cook_time": ("number", "set_cook_time"),
    "air_speed": ("number", "set_air_speed"),
    "probe_temperature": ("number", "set_probe_temperature"),
    "start": ("button", "start_cooking"),
    "pause": ("button", "pause"),
    "stop": ("button", "stop"),
}
BINDING_ROLES = {
    "recipes_airfryer_status": "status",
    "recipes_airfryer_start": "start",
    "recipes_airfryer_temperature": "temperature",
    "recipes_airfryer_cook_time": "cook_time",
    "recipes_airfryer_method": "method",
    "recipes_airfryer_drawer": "drawer",
    "recipes_airfryer_remaining": "remaining",
}
REQUIRED = ("status", "start", "temperature", "cook_time", "drawer")
MANUAL_METHOD = "manual"
UNAVAILABLE = frozenset({"unavailable", "unknown", ""})
# Statuses in which the fryer is busy: start is refused, stop is offered instead.
BUSY = frozenset({"cooking", "pause", "user_action", "maintain", "finish", "preheat", "preheating"})
RUNNING = frozenset({"cooking", "user_action", "preheat", "preheating"})
STARTED = RUNNING
NO_ERROR = frozenset({"0", "none", "no_error", "ok"})

_STATUS_SUFFIX = "_cooking_status"
_STORE_KEY = "homebrain.fryer_favourites"
_DATA_KEY = "fryer_favourites"


class FryerError(Exception):
    """Refusal with a stable WS error code."""

    def __init__(self, code: str, message: str = "fryer") -> None:
        super().__init__(code)
        self.code = code
        self.message = message


def resolve_entities(entity_ids: Iterable[str], bindings: dict[str, str]) -> dict[str, str]:
    """Role -> entity id. Prefix from the bound or first ``sensor.*_cooking_status``."""
    ids = set(entity_ids)
    status = bindings.get("recipes_airfryer_status") or next(
        iter(sorted(e for e in ids if e.startswith("sensor.") and e.endswith(_STATUS_SUFFIX))),
        None,
    )
    if not status or not status.endswith(_STATUS_SUFFIX):
        return {}
    prefix = status.removeprefix("sensor.").removesuffix(_STATUS_SUFFIX)
    found = {"status": status}
    for role, (domain, suffix) in SUFFIXES.items():
        candidate = f"{domain}.{prefix}_{suffix}"
        if role != "status" and candidate in ids:
            found[role] = candidate
    for key, role in BINDING_ROLES.items():
        if bindings.get(key):
            found[role] = bindings[key]
    return found


def _state(hass: HomeAssistant, entity_id: str | None) -> str | None:
    state = hass.states.get(entity_id) if entity_id else None
    return None if state is None else state.state


def start_blockers(hass: HomeAssistant, entities: dict[str, str]) -> list[str]:
    """Why a start would be refused right now (empty = may start)."""
    if not all(role in entities for role in REQUIRED):
        return ["NOT_CONFIGURED"]
    out: list[str] = []
    status = _state(hass, entities["status"])
    if status is None or status in UNAVAILABLE:
        out.append("AIRFRYER_UNAVAILABLE")
    elif status in BUSY:
        out.append("AIRFRYER_BUSY")
    drawer = _state(hass, entities["drawer"])
    if drawer == "on":
        out.append("AIRFRYER_DRAWER_OPEN")
    elif drawer != "off" and "AIRFRYER_UNAVAILABLE" not in out:
        out.append("AIRFRYER_UNAVAILABLE")
    error = _state(hass, entities.get("error"))
    if error is not None and error not in UNAVAILABLE and error.lower() not in NO_ERROR:
        out.append("AIRFRYER_ERROR")
    return out


def limits(hass: HomeAssistant, entities: dict[str, str]) -> dict[str, list[int]]:
    """Fixed product ranges narrowed by the number entities' own min/max."""
    roles = {
        "temperature": "temperature",
        "minutes": "cook_time",
        "air_speed": "air_speed",
        "probe_temperature": "probe_temperature",
    }
    out: dict[str, list[int]] = {}
    for key, (low, high) in LIMITS.items():
        state = hass.states.get(entities.get(roles[key], "")) if entities else None
        attrs = state.attributes if state is not None else {}
        try:
            low = max(low, int(float(attrs.get("min", low))))
            high = min(high, int(float(attrs.get("max", high))))
        except (TypeError, ValueError):
            pass
        out[key] = [low, high]
    return out


class FavouriteStore:
    """User quick presets in ``.storage/homebrain.fryer_favourites``."""

    def __init__(self, hass: HomeAssistant) -> None:
        self._store: Store[dict[str, Any]] = Store(hass, 1, _STORE_KEY)
        self._items: list[dict[str, Any]] | None = None

    async def async_list(self) -> list[dict[str, Any]]:
        if self._items is None:
            data = await self._store.async_load() or {}
            self._items = list(data.get("favourites", []))
        return [dict(item) for item in self._items]

    async def async_save(self, favourite: dict[str, Any]) -> list[dict[str, Any]]:
        items = await self.async_list()
        name = favourite["name"].strip()
        if not name:
            raise FryerError("INVALID_FIELD", "name")
        item = {
            "id": favourite.get("id") or uuid.uuid4().hex[:12],
            "name": name,
            "temperature": favourite["temperature"],
            "minutes": favourite["minutes"],
            "air_speed": favourite.get("air_speed", 2),
            "probe_temperature": favourite.get("probe_temperature"),
        }
        index = next((i for i, f in enumerate(items) if f["id"] == item["id"]), None)
        if index is None:
            if favourite.get("id"):
                raise FryerError("TARGET_NOT_FOUND", "favourite")
            if len(items) >= MAX_FAVOURITES:
                raise FryerError("LIMIT_REACHED", "favourites")
            items.append(item)
        else:
            items[index] = item
        return await self._write(items)

    async def async_delete(self, favourite_id: str) -> list[dict[str, Any]]:
        items = await self.async_list()
        kept = [f for f in items if f["id"] != favourite_id]
        if len(kept) == len(items):
            raise FryerError("TARGET_NOT_FOUND", "favourite")
        return await self._write(kept)

    async def _write(self, items: list[dict[str, Any]]) -> list[dict[str, Any]]:
        self._items = items
        await self._store.async_save({"favourites": items})
        return [dict(item) for item in items]


def _favourites(hass: HomeAssistant) -> FavouriteStore:
    data = hass.data.setdefault(DOMAIN, {})
    if (store := data.get(_DATA_KEY)) is None:
        store = data[_DATA_KEY] = FavouriteStore(hass)
    return store


def _entities(hass: HomeAssistant) -> dict[str, str]:
    entries = hass.config_entries.async_entries(DOMAIN)
    bindings = get_bindings(entries[0]).get("recipes", {}) if entries else {}
    return resolve_entities(hass.states.async_entity_ids(), bindings)


def _role(hass: HomeAssistant, connection) -> str:
    return resolve_role(connection.user, entry_roles(hass))


def _guard(*, control: bool) -> Callable:
    """Mapped roles may read; only owner/adult control. FryerError -> WS error."""

    def decorator(func: Callable) -> Callable:
        @wraps(func)
        async def wrapper(hass, connection, msg):
            role = _role(hass, connection)
            if role == "guest" or (control and role not in FRYER_CONTROL_ROLES):
                raise Unauthorized
            try:
                await func(hass, connection, msg, role)
            except FryerError as err:
                connection.send_error(msg["id"], err.code, err.message)
            except (HomeAssistantError, TimeoutError) as err:
                _LOGGER.warning("Fryer command %s failed: %s", msg["type"], err)
                connection.send_error(msg["id"], "DEVICE_FAILED", "fryer")

        return wrapper

    return decorator


async def _service(hass: HomeAssistant, domain: str, service: str, data: dict[str, Any]) -> None:
    async with asyncio.timeout(CALL_TIMEOUT):
        await hass.services.async_call(domain, service, data, blocking=True)


async def _wait_status(hass: HomeAssistant, entity_id: str, wanted: frozenset[str]) -> bool:
    deadline = time.monotonic() + VERIFY_TIMEOUT
    while True:
        if _state(hass, entity_id) in wanted:
            return True
        if time.monotonic() >= deadline:
            return False
        await asyncio.sleep(0.1)


def _range(key: str) -> vol.All:
    low, high = LIMITS[key]
    return vol.All(vol.Coerce(int), vol.Range(min=low, max=high))


def _payload(hass: HomeAssistant, connection, role: str, entities: dict[str, str]) -> dict:
    caps = {
        "airSpeed": "air_speed" in entities,
        "probe": "probe_temperature" in entities,
        "addTime": "cook_time" in entities,
    }
    return {
        "configured": all(r in entities for r in REQUIRED),
        "canControl": role in FRYER_CONTROL_ROLES,
        "entities": entities,
        "capabilities": caps,
        "limits": limits(hass, entities),
        "blockers": start_blockers(hass, entities) if entities else ["NOT_CONFIGURED"],
        "presets": {"supported": False, "programs": []},
    }


@websocket_api.websocket_command({vol.Required("type"): "homebrain/fryer/get"})
@websocket_api.async_response
@_guard(control=False)
async def ws_get(hass, connection, msg, role):
    entities = _entities(hass)
    payload = _payload(hass, connection, role, entities)
    payload["favourites"] = await _favourites(hass).async_list()
    connection.send_result(msg["id"], payload)


@websocket_api.websocket_command(
    {
        vol.Required("type"): "homebrain/fryer/start",
        vol.Required("temperature"): _range("temperature"),
        # Probe cooking ends on the food core temperature: time is optional there.
        vol.Optional("minutes"): vol.Any(None, _range("minutes")),
        vol.Optional("air_speed"): vol.Any(None, _range("air_speed")),
        vol.Optional("probe_temperature"): vol.Any(None, _range("probe_temperature")),
        vol.Optional("confirmed", default=False): bool,
    }
)
@websocket_api.async_response
@_guard(control=True)
async def ws_start(hass, connection, msg, role):
    entities = _entities(hass)
    if not entities or not all(r in entities for r in REQUIRED):
        raise FryerError("NOT_CONFIGURED")
    if not msg["confirmed"]:
        raise FryerError("CONFIRMATION_REQUIRED")
    if blockers := start_blockers(hass, entities):
        raise FryerError(blockers[0])
    bounds = limits(hass, entities)
    probe = msg.get("probe_temperature")
    minutes = msg.get("minutes")
    if minutes is None:
        if probe is None:
            raise FryerError("INVALID_FIELD", "minutes")
        # Probe mode: the fryer stops at the core temperature; the time is only a safety cap.
        minutes = bounds["minutes"][1]
    for key, value in (("temperature", msg["temperature"]), ("minutes", minutes)):
        low, high = bounds[key]
        if not low <= value <= high:
            raise FryerError("INVALID_FIELD", key)
    if probe is not None:
        if "probe_temperature" not in entities:
            raise FryerError("INVALID_FIELD", "probe_temperature")
        if _state(hass, entities.get("probe_unplugged")) != "off":
            raise FryerError("AIRFRYER_PROBE_UNPLUGGED", "probe")
    calls: list[tuple[str, str, dict[str, Any]]] = []
    if method := entities.get("method"):
        options = hass.states.get(method).attributes.get("options", [])
        if MANUAL_METHOD in options:
            # First: the integration wakes the fryer and resets the program here.
            calls.append(("select", "select_option", {"entity_id": method, "option": "manual"}))
    calls.append(
        ("number", "set_value", {"entity_id": entities["temperature"], "value": msg["temperature"]})
    )
    calls.append(
        ("number", "set_value", {"entity_id": entities["cook_time"], "value": minutes})
    )
    if msg.get("air_speed") is not None and "air_speed" in entities:
        calls.append(
            ("number", "set_value", {"entity_id": entities["air_speed"], "value": msg["air_speed"]})
        )
    if probe is not None:
        calls.append(
            ("number", "set_value", {"entity_id": entities["probe_temperature"], "value": probe})
        )
    calls.append(("button", "press", {"entity_id": entities["start"]}))
    for domain, service, data in calls:
        await _service(hass, domain, service, data)
    verified = await _wait_status(hass, entities["status"], STARTED)
    connection.send_result(
        msg["id"], {"started": True, "verified": verified, "minutes": minutes}
    )


@websocket_api.websocket_command(
    {
        vol.Required("type"): "homebrain/fryer/control",
        vol.Required("action"): vol.In(("pause", "resume", "stop", "add_time")),
        vol.Optional("minutes"): vol.All(vol.Coerce(int), vol.Range(min=1, max=10)),
        vol.Optional("confirmed", default=False): bool,
    }
)
@websocket_api.async_response
@_guard(control=True)
async def ws_control(hass, connection, msg, role):
    entities = _entities(hass)
    if "status" not in entities:
        raise FryerError("NOT_CONFIGURED")
    action = msg["action"]
    if action == "stop" and not msg["confirmed"]:
        raise FryerError("CONFIRMATION_REQUIRED")
    status = _state(hass, entities["status"])
    allowed = {
        "pause": RUNNING,
        "resume": frozenset({"pause"}),
        "stop": BUSY,
        "add_time": RUNNING | {"pause"},
    }[action]
    if status not in allowed:
        raise FryerError("AIRFRYER_NOT_RUNNING")
    if action == "add_time":
        number = entities.get("cook_time")
        current = _state(hass, number)
        try:
            value = int(float(current or ""))
        except ValueError as err:
            raise FryerError("AIRFRYER_UNAVAILABLE", "cook_time") from err
        high = limits(hass, entities)["minutes"][1]
        target = min(high, value + msg.get("minutes", 1))
        await _service(hass, "number", "set_value", {"entity_id": number, "value": target})
        connection.send_result(msg["id"], {"sent": action, "minutes": target})
        return
    button = entities.get("start" if action == "resume" else action)
    if not button or hass.states.get(button) is None:
        raise FryerError("AIRFRYER_UNAVAILABLE", action)
    await _service(hass, "button", "press", {"entity_id": button})
    connection.send_result(msg["id"], {"sent": action})


FAVOURITE_SCHEMA = vol.Schema(
    {
        vol.Optional("id"): vol.All(str, vol.Length(min=1, max=40)),
        vol.Required("name"): vol.All(str, vol.Length(max=40)),
        vol.Required("temperature"): _range("temperature"),
        vol.Required("minutes"): _range("minutes"),
        vol.Optional("air_speed", default=2): _range("air_speed"),
        vol.Optional("probe_temperature"): vol.Any(None, _range("probe_temperature")),
    }
)


@websocket_api.websocket_command(
    {
        vol.Required("type"): "homebrain/fryer/favourites/save",
        vol.Required("favourite"): FAVOURITE_SCHEMA,
    }
)
@websocket_api.async_response
@_guard(control=True)
async def ws_favourite_save(hass, connection, msg, role):
    items = await _favourites(hass).async_save(msg["favourite"])
    connection.send_result(msg["id"], {"favourites": items})


@websocket_api.websocket_command(
    {
        vol.Required("type"): "homebrain/fryer/favourites/delete",
        vol.Required("favourite_id"): vol.All(str, vol.Length(min=1, max=40)),
    }
)
@websocket_api.async_response
@_guard(control=True)
async def ws_favourite_delete(hass, connection, msg, role):
    items = await _favourites(hass).async_delete(msg["favourite_id"])
    connection.send_result(msg["id"], {"favourites": items})


COMMANDS = (ws_get, ws_start, ws_control, ws_favourite_save, ws_favourite_delete)
