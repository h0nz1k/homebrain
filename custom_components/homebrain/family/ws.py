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

from ..const import DOMAIN as HB_DOMAIN
from ..roles import FAMILY_APPROVE_ROLES
from . import chore_management, choreops_adapter, model, persons
from .person_history import PersonHistory
from .school import SCHOOL_SETTINGS, websocket_school
from .swap_store import FamilySwapStore
from .timetable import (
    TIMETABLE_SETTINGS,
    derive_presence,
    timetable_settings,
    websocket_timetable,
)
from .ws_chore import CHORE_MANAGEMENT_COMMANDS
from .ws_common import (
    CONF_FAMILY,
    _bindings,
    _entry,
    _role,
    _service,
    family_options,
)
from .ws_swap import SWAP_COMMANDS, _serialize_mutation

DAYS: Final = 8  # today + the next 7 days


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

    store: FamilySwapStore | None = hass.data.get(HB_DOMAIN, {}).get("family_swap")
    store_data = store.data if isinstance(store, FamilySwapStore) else {}
    history: PersonHistory | None = hass.data.get(HB_DOMAIN, {}).get("family_history")
    profiles = persons.members(hass, hass.states.async_all(), opts)
    if role != "kiosk":
        derive_presence(hass, profiles, dt_util.now())
    kids_by_uuid = {str(k.get("kid_uuid") or k["id"]): k for k in profiles}
    now = dt_util.now()
    members = []
    free: dict[tuple, dict[str, Any]] = {}
    include_detail = role in ("owner", "adult")
    for profile in profiles:
        own = bool(uid and profile.get("user_id") == uid)
        member = model.kid_payload(
            hass.states.get,
            profile,
            role,
            own,
            store_data=store_data,
            kids_by_uuid=kids_by_uuid,
            include_points_detail=include_detail,
            now=now,
        )
        if history:
            member["missed"] = history.observe(profile, member["missed"], now)
        for chore in member.pop("free"):
            entry = free.setdefault(
                (chore["name"], chore["due"]),
                {**{k: chore[k] for k in ("name", "points", "due")}, "assignees": []},
            )
            entry["assignees"].append(
                {
                    "member": member["id"],
                    "chore": chore["id"],
                    "can_claim": chore["can_claim"],
                }
            )
        if not include_detail:
            for chore in (*member["chores"], *member["upcoming"]):
                if swap := chore.get("swap_today"):
                    swap.pop("operation_id", None)
        member.update({k: profile[k] for k in ("role", "color", "presence")}, own=own)
        if role == "kiosk" or (role == "child" and not own):
            for chore in member["chores"]:
                chore.pop("kid_uuid", None)
            member.pop("kid_uuid", None)
        members.append(member)
    kids = [
        {**m, "upcoming": m["upcoming"][: model.UPCOMING_LIMIT]}
        for m in members
        if m["role"] == "child" and (role != "child" or m["own"])
    ]
    cfg = choreops_adapter.config_entry_id(hass) if include_detail else None
    if cfg:
        rows = chore_management.catalog(hass, cfg, profiles)
        groups = store_data.get("chore_groups") or {}
        for kid in members:
            for chore in (*kid["chores"], *kid["upcoming"]):
                row = rows.get((kid["id"], chore["id"]))
                if row is not None:
                    chore["management"] = chore_management.metadata(row, rows.values(), groups, cfg)
    payload: dict[str, Any] = {
        "role": role,
        "revision": int(store_data.get("revision") or 0),
        "calendars": [{k: c[k] for k in ("entity_id", "name", "kind")} for c in calendars],
        "events": model.build_events(raw, calendars, role),
        "kids": kids,
        "members": members,
        "free_chores": list(free.values()),
        "shopping": shopping,
        "errors": errors,
        "generated_at": now.isoformat(),
        "capabilities": {
            "can_create_chore": role in ("owner", "adult"),
            "can_swap": role in ("owner", "adult", "child"),
            "can_view_points": role in ("owner", "adult", "child"),
        },
    }
    if role in ("owner", "adult"):
        payload["swap_issues"] = [
            {
                "id": oid,
                "chore_name": op["source_snapshot"]["name"],
                "source_name": (
                    op.get("from_kid_name") if op.get("last_error") != "missing_clone" else None
                ),
                "pending": op["status"] in {"applying", "rollback_pending", "cleanup_pending"},
            }
            for oid, op in (store_data.get("operations") or {}).items()
            if op["status"] in {"needs_repair", "rollback_pending"}
            or (op["status"] in {"failed", "applying", "cleanup_pending"} and op.get("last_error"))
        ]
        payload["pending_approvals"] = model.pending_approvals({"kids": members}, store_data)
        payload["swap_requests"] = [
            r for r in (store_data.get("requests") or {}).values() if r.get("status") == "pending"
        ]
    if role == "kiosk":
        payload["swap_badges"] = [
            {
                "text": c.get("swap_today", {}).get("label"),
                "kid": k["name"],
            }
            for k in members
            for c in k.get("chores") or []
            if c.get("swap_today")
        ][:3]
    connection.send_result(msg["id"], payload)


def _find_chore(hass, connection, role, msg) -> tuple[dict[str, Any], dict[str, Any]]:
    kids = persons.members(hass, hass.states.async_all(), family_options(hass))
    kid = next((k for k in kids if k["id"] == msg["kid"]), None)
    chore = (
        next((c for c in model.kid_chores(hass.states.get, kid) if c["id"] == msg["chore"]), None)
        if kid
        else None
    )
    if kid is None or chore is None:
        raise LookupError
    if role == "child" and (
        not kid.get("user_id") or kid["user_id"] != getattr(connection.user, "id", None)
    ):
        raise Unauthorized
    store = hass.data[HB_DOMAIN]["family_swap"]
    decorated = model.apply_swap_overlays(
        [chore],
        kid=kid,
        store_data=store.data,
        kids_by_uuid={},
    )[0]
    chore["transfer_locked"] = bool((decorated["swap_today"] or {}).get("muted"))
    return kid, chore


CHORE_SCHEMA: Final = {
    vol.Required("kid"): vol.All(str, vol.Length(min=1, max=64)),
    vol.Required("chore"): vol.All(str, vol.Length(min=1, max=255)),
}


@websocket_api.websocket_command(
    {vol.Required("type"): "homebrain/family/chore/claim", **CHORE_SCHEMA}
)
@websocket_api.async_response
@_serialize_mutation
async def websocket_family_claim(hass: HomeAssistant, connection: Any, msg: dict[str, Any]) -> None:
    role = _role(hass, connection)
    try:
        kid, chore = _find_chore(hass, connection, role, msg)
    except LookupError:
        connection.send_error(msg["id"], "not_found", "Povinnost nenalezena")
        return
    today, _, free = model.partition_chores([chore], dt_util.now())
    if (
        not (today or free)
        or chore["transfer_locked"]
        or not chore["claim_allowed"]
        or chore["state"] not in ("todo", "overdue")
    ):
        connection.send_error(msg["id"], "service_failed", "Úkol už nelze převzít.")
        return
    try:
        data = {"user_name": kid["name"], "chore_name": chore["name"]}
        if cfg := choreops_adapter.config_entry_id(hass):
            data["config_entry_id"] = cfg
        await choreops_adapter.call_choreops(
            hass,
            "choreops",
            "claim_chore",
            data,
            context=connection.context(msg),
        )
    except (HomeAssistantError, vol.Invalid):
        connection.send_error(msg["id"], "service_failed", "Úkol už nelze převzít.")
        return
    connection.send_result(msg["id"], {"ok": True})


@websocket_api.websocket_command(
    {vol.Required("type"): "homebrain/family/chore/approve", **CHORE_SCHEMA}
)
@websocket_api.async_response
@_serialize_mutation
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
    if chore["transfer_locked"]:
        connection.send_error(msg["id"], "service_failed", "Úkol teď nelze schválit.")
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


@websocket_api.websocket_command(
    {
        vol.Required("type"): "homebrain/family/person/history",
        vol.Required("member"): vol.All(str, vol.Length(min=1, max=64)),
    }
)
@websocket_api.async_response
async def websocket_family_person_history(hass, connection, msg) -> None:
    _role(hass, connection)
    profiles = persons.members(hass, hass.states.async_all(), family_options(hass))
    person = next((p for p in profiles if p["id"] == msg["member"]), None)
    if not person:
        connection.send_error(msg["id"], "not_found", "Osoba nenalezena")
        return
    now = dt_util.now()
    cutoff = now.date() - timedelta(days=29)
    entries = []
    if cfg := choreops_adapter.config_entry_id(hass):
        try:
            response = await choreops_adapter.call_choreops(
                hass,
                "choreops",
                "get_ledger",
                {"config_entry_id": cfg, "user_name": person["name"], "limit": 250},
                context=connection.context(msg),
                response=True,
            )
        except (HomeAssistantError, vol.Invalid):
            connection.send_error(msg["id"], "service_failed", "Historii se nepodařilo načíst.")
            return
        for row in (response or {}).get("entries", []):
            if not isinstance(row, dict) or row.get("source") != "chores":
                continue
            stamp, name = row.get("timestamp"), row.get("item_name")
            if not isinstance(stamp, str) or not isinstance(name, str) or not name.strip():
                continue
            day = model.chore_date(stamp, now)
            if day and day >= cutoff:
                entries.append(
                    {"date": stamp, "name": name, "points": model._float(row.get("amount"))}
                )
    from_ledger = {(row["name"], model.chore_date(row["date"], now)) for row in entries}
    for row in model.last_approvals(hass.states.get, person):
        day = model.chore_date(row["date"], now)
        if day and day >= cutoff and (row["name"], day) not in from_ledger:
            entries.append(row)
    connection.send_result(msg["id"], {"entries": entries})


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
        "persons": [
            {
                k: m[k]
                for k in (
                    "choreops_user_id",
                    "name",
                    "role",
                    "color",
                    "person",
                    "tracker",
                    "grade",
                    "configured",
                )
            }
            for m in persons.members(hass, states, opts)
        ],
        "approver_name": opts.get("approver_name"),
        "school": {**SCHOOL_SETTINGS({}), **(opts.get("school") or {})},
        "timetable": timetable_settings(hass),
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
            "people": [
                {"id": s.entity_id, "name": model._name(s)}
                for s in states
                if s.entity_id.startswith("person.")
            ],
            "trackers": [
                {"id": eid, "name": name} for eid, name in persons.unifi_trackers(hass).items()
            ],
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
        vol.Optional("persons"): vol.All(
            [
                vol.Schema(
                    {
                        vol.Required("choreops_user_id"): vol.All(str, vol.Length(min=1, max=128)),
                        vol.Required("role"): vol.In(("owner", "adult", "child")),
                        vol.Required("color"): vol.All(int, vol.Range(min=1, max=4)),
                        vol.Optional("person"): vol.Any(
                            None, vol.All(str, vol.Match(r"^person\.[a-z0-9_]+$"))
                        ),
                        vol.Optional("grade"): vol.Any(None, vol.All(int, vol.Range(min=1, max=9))),
                        vol.Optional("tracker"): vol.Any(
                            None, vol.All(str, vol.Match(r"^device_tracker\.[a-z0-9_]+$"))
                        ),
                    }
                )
            ],
            vol.Length(max=32),
        ),
        vol.Optional("school"): SCHOOL_SETTINGS,
        vol.Optional("timetable"): TIMETABLE_SETTINGS,
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
    if "persons" in msg:
        grades = {p["choreops_user_id"]: p.get("grade") for p in opts.get("persons") or []}
        profiles = [
            {
                **p,
                "grade": p.get("grade", grades.get(p["choreops_user_id"]))
                if p["role"] == "child"
                else None,
            }
            for p in msg["persons"]
        ]
        ids = {p["choreops_user_id"] for p in profiles}
        trackers = persons.unifi_trackers(hass)
        if len(ids) != len(profiles) or any(
            p.get("tracker") and p["tracker"] not in trackers for p in profiles
        ):
            connection.send_error(msg["id"], "invalid_input", "Zkontrolujte nastavení osob.")
            return
    for key in (
        "calendars",
        "shopping",
        "kids",
        "approver_name",
        "persons",
        "school",
        "timetable",
    ):
        if key in msg:
            opts[key] = msg[key]
    if "persons" in msg:
        opts["persons"] = profiles
    hass.config_entries.async_update_entry(entry, options={**entry.options, CONF_FAMILY: opts})
    connection.send_result(msg["id"], _settings(hass))


COMMANDS: Final = (
    websocket_family_get,
    websocket_school,
    websocket_timetable,
    websocket_family_person_history,
    websocket_family_claim,
    websocket_family_approve,
    websocket_family_shopping_add,
    websocket_family_shopping_update,
    websocket_family_settings_get,
    websocket_family_settings_set,
    *SWAP_COMMANDS,
    *CHORE_MANAGEMENT_COMMANDS,
)
