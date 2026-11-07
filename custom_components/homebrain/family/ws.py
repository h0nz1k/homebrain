"""WebSocket API of Rodina (``homebrain/family/*``).

* ``get`` – every mapped role: events (7 days), kids' chores + points, shopping list.
  ``child`` sees only the kid mapped to its HA user; ``child``/``kiosk`` get no event
  place/notes (FAM-017).
* ``chore/claim`` – owner, adult, kiosk; a child only its own chores (ChoreOps ``claim_chore``).
* ``chore/approve`` – owner and adult (ChoreOps ``approve_chore``).
* ``shopping/add`` / ``shopping/update`` – every mapped role (``todo.add_item``/``update_item``).
* ``settings/get`` / ``settings/set`` – HA admin only.

Writes go through public HA services with the caller's context (audit trail in HA).
"""

from __future__ import annotations

from datetime import timedelta
from typing import Any, Final

import voluptuous as vol
from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant, callback
from homeassistant.exceptions import HomeAssistantError, Unauthorized
from homeassistant.util import dt as dt_util

from ..const import DOMAIN
from ..roles import FAMILY_APPROVE_ROLES, entry_roles, resolve_role
from . import model

CONF_FAMILY: Final = "family"
DAYS: Final = 8  # today + the next 7 days


def _entry(hass: HomeAssistant):
    entries = hass.config_entries.async_entries(DOMAIN)
    return entries[0] if entries else None


def family_options(hass: HomeAssistant) -> dict[str, Any]:
    entry = _entry(hass)
    raw = entry.options.get(CONF_FAMILY) if entry else None
    return dict(raw) if isinstance(raw, dict) else {}


def _bindings(hass: HomeAssistant) -> dict[str, Any]:
    entry = _entry(hass)
    raw = (entry.options.get("bindings") or {}).get("family") if entry else None
    return dict(raw) if isinstance(raw, dict) else {}


def _role(hass: HomeAssistant, connection: Any) -> str:
    role = resolve_role(connection.user, entry_roles(hass))
    if role == "guest":
        raise Unauthorized
    return role


def _visible_kids(hass: HomeAssistant, connection: Any, role: str) -> list[dict[str, Any]]:
    kids = model.discover_kids(hass.states.async_all(), family_options(hass))
    if role == "child":
        uid = getattr(connection.user, "id", None)
        return [k for k in kids if uid and k.get("user_id") == uid]
    return kids


async def _service(hass, connection, msg, domain, service, data, target=None, response=False):
    return await hass.services.async_call(
        domain,
        service,
        data,
        target=target,
        blocking=True,
        context=connection.context(msg),
        return_response=response,
    )


@websocket_api.websocket_command({vol.Required("type"): "homebrain/family/get"})
@websocket_api.async_response
async def websocket_family_get(hass: HomeAssistant, connection: Any, msg: dict[str, Any]) -> None:
    role = _role(hass, connection)
    states = hass.states.async_all()
    opts, bindings = family_options(hass), _bindings(hass)
    calendars = model.family_calendars(states, bindings, opts)
    start = dt_util.start_of_local_day()
    raw: dict[str, list[dict[str, Any]]] = {}
    errors: list[str] = []
    for cal in calendars:  # one by one: a broken calendar must not hide the others (FAM-002)
        try:
            resp = await _service(
                hass,
                connection,
                msg,
                "calendar",
                "get_events",
                {"start_date_time": start, "end_date_time": start + timedelta(days=DAYS)},
                target={"entity_id": cal["entity_id"]},
                response=True,
            )
            raw[cal["entity_id"]] = list((resp or {}).get(cal["entity_id"], {}).get("events", []))
        except (HomeAssistantError, vol.Invalid):
            errors.append(cal["entity_id"])
    shopping = None
    if eid := model.shopping_entity(states, bindings, opts):
        try:
            resp = await _service(
                hass,
                connection,
                msg,
                "todo",
                "get_items",
                {},
                target={"entity_id": eid},
                response=True,
            )
            items = (resp or {}).get(eid, {}).get("items", [])
            shopping = {
                "entity_id": eid,
                "name": model._name(hass.states.get(eid)) if hass.states.get(eid) else eid,
                "items": [
                    {
                        "uid": i.get("uid"),
                        "summary": i.get("summary"),
                        "done": i.get("status") == "completed",
                    }
                    for i in items
                    if i.get("uid")
                ],
            }
        except (HomeAssistantError, vol.Invalid):
            errors.append(eid)
    uid = getattr(connection.user, "id", None)
    kids = [
        model.kid_payload(hass.states.get, k, role, bool(uid and k.get("user_id") == uid))
        for k in _visible_kids(hass, connection, role)
    ]
    connection.send_result(
        msg["id"],
        {
            "role": role,
            "calendars": [{k: c[k] for k in ("entity_id", "name", "kind")} for c in calendars],
            "events": model.build_events(raw, calendars, role),
            "kids": kids,
            "shopping": shopping,
            "errors": errors,
            "generated_at": dt_util.now().isoformat(),
        },
    )


def _find_chore(hass, connection, role, msg) -> tuple[dict[str, Any], dict[str, Any]]:
    kids = model.discover_kids(hass.states.async_all(), family_options(hass))
    kid = next((k for k in kids if k["id"] == msg["kid"]), None)
    chore = (
        next((c for c in model.kid_chores(hass.states.get, kid) if c["id"] == msg["chore"]), None)
        if kid
        else None
    )
    if kid is None or chore is None:
        raise LookupError
    if role == "child" and kid.get("user_id") != getattr(connection.user, "id", None):
        raise Unauthorized
    return kid, chore


CHORE_SCHEMA: Final = {
    vol.Required("kid"): vol.All(str, vol.Length(min=1, max=64)),
    vol.Required("chore"): vol.All(str, vol.Length(min=1, max=255)),
}


@websocket_api.websocket_command(
    {vol.Required("type"): "homebrain/family/chore/claim", **CHORE_SCHEMA}
)
@websocket_api.async_response
async def websocket_family_claim(hass: HomeAssistant, connection: Any, msg: dict[str, Any]) -> None:
    role = _role(hass, connection)
    try:
        kid, chore = _find_chore(hass, connection, role, msg)
    except LookupError:
        connection.send_error(msg["id"], "not_found", "Povinnost nenalezena")
        return
    try:
        await _service(
            hass,
            connection,
            msg,
            "choreops",
            "claim_chore",
            {"user_name": kid["name"], "chore_name": chore["name"]},
        )
    except HomeAssistantError as err:
        connection.send_error(msg["id"], "service_failed", str(err))
        return
    connection.send_result(msg["id"], {"ok": True})


@websocket_api.websocket_command(
    {vol.Required("type"): "homebrain/family/chore/approve", **CHORE_SCHEMA}
)
@websocket_api.async_response
async def websocket_family_approve(
    hass: HomeAssistant, connection: Any, msg: dict[str, Any]
) -> None:
    role = _role(hass, connection)
    if role != "owner" and role not in FAMILY_APPROVE_ROLES:
        raise Unauthorized
    try:
        kid, chore = _find_chore(hass, connection, role, msg)
    except LookupError:
        connection.send_error(msg["id"], "not_found", "Povinnost nenalezena")
        return
    approver = family_options(hass).get("approver_name") or getattr(connection.user, "name", "")
    try:
        await _service(
            hass,
            connection,
            msg,
            "choreops",
            "approve_chore",
            {"approver_name": approver, "user_name": kid["name"], "chore_name": chore["name"]},
        )
    except HomeAssistantError as err:
        connection.send_error(msg["id"], "service_failed", str(err))
        return
    connection.send_result(msg["id"], {"ok": True})


def _shopping(hass: HomeAssistant) -> str | None:
    return model.shopping_entity(hass.states.async_all(), _bindings(hass), family_options(hass))


async def _todo(hass, connection, msg, service: str, data: dict[str, Any]) -> None:
    _role(hass, connection)
    if not (eid := _shopping(hass)):
        connection.send_error(msg["id"], "not_configured", "Nákupní seznam není nastaven")
        return
    try:
        await _service(hass, connection, msg, "todo", service, data, target={"entity_id": eid})
    except HomeAssistantError as err:
        connection.send_error(msg["id"], "service_failed", str(err))
        return
    connection.send_result(msg["id"], {"ok": True})


@websocket_api.websocket_command(
    {
        vol.Required("type"): "homebrain/family/shopping/add",
        vol.Required("summary"): vol.All(str, vol.Strip, vol.Length(min=1, max=120)),
    }
)
@websocket_api.async_response
async def websocket_family_shopping_add(
    hass: HomeAssistant, connection: Any, msg: dict[str, Any]
) -> None:
    await _todo(hass, connection, msg, "add_item", {"item": msg["summary"]})


@websocket_api.websocket_command(
    {
        vol.Required("type"): "homebrain/family/shopping/update",
        vol.Required("uid"): vol.All(str, vol.Length(min=1, max=255)),
        vol.Required("done"): bool,
    }
)
@websocket_api.async_response
async def websocket_family_shopping_update(
    hass: HomeAssistant, connection: Any, msg: dict[str, Any]
) -> None:
    status = "completed" if msg["done"] else "needs_action"
    await _todo(hass, connection, msg, "update_item", {"item": msg["uid"], "status": status})


def _settings(hass: HomeAssistant) -> dict[str, Any]:
    opts = family_options(hass)
    states = hass.states.async_all()
    return {
        "calendars": opts.get("calendars") or None,
        "shopping": opts.get("shopping"),
        "kids": opts.get("kids") or [],
        "approver_name": opts.get("approver_name"),
        "effective": {
            "calendars": model.family_calendars(states, _bindings(hass), opts),
            "shopping": model.shopping_entity(states, _bindings(hass), opts),
            "kids": [k["name"] for k in model.discover_kids(states, opts)],
        },
        "candidates": {
            "calendars": [
                {"entity_id": s.entity_id, "name": model._name(s)}
                for s in states
                if s.entity_id.startswith("calendar.")
            ],
            "todos": [s.entity_id for s in states if s.entity_id.startswith("todo.")],
        },
    }


@websocket_api.websocket_command({vol.Required("type"): "homebrain/family/settings/get"})
@websocket_api.require_admin
@callback
def websocket_family_settings_get(
    hass: HomeAssistant, connection: Any, msg: dict[str, Any]
) -> None:
    connection.send_result(msg["id"], _settings(hass))


@websocket_api.websocket_command(
    {
        vol.Required("type"): "homebrain/family/settings/set",
        vol.Optional("calendars"): vol.Any(
            None,
            vol.All(
                [
                    vol.Schema(
                        {
                            vol.Required("entity_id"): vol.All(str, vol.Match(r"^calendar\.")),
                            vol.Optional("kind", default="family"): vol.In(("family", "school")),
                        }
                    )
                ],
                vol.Length(max=12),
            ),
        ),
        vol.Optional("shopping"): vol.Any(None, vol.All(str, vol.Match(r"^todo\."))),
        vol.Optional("kids"): vol.All(
            [
                vol.Schema(
                    {
                        vol.Required("name"): vol.All(str, vol.Length(min=1, max=64)),
                        vol.Optional("user_id"): vol.Any(None, vol.All(str, vol.Length(max=64))),
                    }
                )
            ],
            vol.Length(max=12),
        ),
        vol.Optional("approver_name"): vol.Any(None, vol.All(str, vol.Length(max=64))),
    }
)
@websocket_api.require_admin
@callback
def websocket_family_settings_set(
    hass: HomeAssistant, connection: Any, msg: dict[str, Any]
) -> None:
    entry = _entry(hass)
    if entry is None:
        connection.send_error(msg["id"], "not_configured", "HomeBrain není nastaven")
        return
    opts = family_options(hass)
    for key in ("calendars", "shopping", "kids", "approver_name"):
        if key in msg:
            opts[key] = msg[key]
    hass.config_entries.async_update_entry(entry, options={**entry.options, CONF_FAMILY: opts})
    connection.send_result(msg["id"], _settings(hass))


COMMANDS: Final = (
    websocket_family_get,
    websocket_family_claim,
    websocket_family_approve,
    websocket_family_shopping_add,
    websocket_family_shopping_update,
    websocket_family_settings_get,
    websocket_family_settings_set,
)
