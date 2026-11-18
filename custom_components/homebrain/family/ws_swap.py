"""WS: swap, create chore, points (Rodina). Refs #123."""

from __future__ import annotations

from datetime import date, timedelta
from typing import Any, Final
from zoneinfo import ZoneInfo

import voluptuous as vol
from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import Unauthorized
from homeassistant.util import dt as dt_util

from ..roles import FAMILY_APPROVE_ROLES
from . import choreops_adapter, model, points_model, swap_model, swap_service
from .swap_store import FamilySwapStore
from .ws_common import _role, _visible_kids, family_options


def _store(hass: HomeAssistant) -> FamilySwapStore:
    raw = hass.data.get("homebrain", {}).get("family_swap")
    if not isinstance(raw, FamilySwapStore):
        raise RuntimeError("family swap store missing")
    return raw


def _kids_index(kids: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    return {str(k.get("kid_uuid") or k["id"]): k for k in kids}


def _occurrence(hass: HomeAssistant, kid: dict[str, Any], opaque: str) -> dict[str, Any] | None:
    for row in model.kid_chores(hass.states.get, kid):
        if row.get("opaque_id") == opaque or row.get("id") == opaque:
            return row
    return None


def _require_adult(role: str) -> None:
    if role not in {"owner", *FAMILY_APPROVE_ROLES}:
        raise Unauthorized


@websocket_api.websocket_command(
    {
        vol.Required("type"): "homebrain/family/swap/options",
        vol.Required("direction"): vol.In(("give", "take")),
        vol.Optional("chore"): vol.All(str, vol.Length(min=1, max=255)),
    }
)
@websocket_api.async_response
async def websocket_family_swap_options(
    hass: HomeAssistant, connection: Any, msg: dict[str, Any]
) -> None:
    role = _role(hass, connection)
    kids = _visible_kids(hass, connection, role)
    actor = str(getattr(connection.user, "id", "") or "")
    occs: list[dict[str, Any]] = []
    for kid in kids:
        for row in model.kid_chores(hass.states.get, kid):
            if not row.get("can_request_swap"):
                continue
            if role == "child" and msg["direction"] == "give" and kid.get("user_id") != actor:
                continue
            occs.append(
                {
                    "opaque_id": row["opaque_id"],
                    "name": row["name"],
                    "points": row.get("points"),
                    "due": row.get("due"),
                    "owner_name": kid["name"],
                    "owner_kid_uuid": kid.get("kid_uuid"),
                }
            )
    partners = [
        {"id": k.get("kid_uuid"), "name": k["name"]}
        for k in model.discover_kids(hass.states.async_all(), family_options(hass))
        if msg["direction"] != "take" or k.get("user_id") == actor or role in {"owner", "adult"}
    ]
    connection.send_result(msg["id"], {"occurrences": occs, "partners": partners})


SWAP_REQUEST_SCHEMA: Final = {
    vol.Required("client_request_id"): vol.All(str, vol.Length(min=8, max=64)),
    vol.Required("chore"): vol.All(str, vol.Length(min=1, max=255)),
    vol.Required("from_kid"): vol.All(str, vol.Length(min=1, max=64)),
    vol.Required("to_kid"): vol.All(str, vol.Length(min=1, max=64)),
    vol.Required("local_date"): vol.Match(r"^\d{4}-\d{2}-\d{2}$"),
    vol.Optional("expected_revision", default=0): vol.Coerce(int),
    vol.Optional("direction", default="give"): vol.In(("give", "take")),
}


@websocket_api.websocket_command(
    {vol.Required("type"): "homebrain/family/swap/request", **SWAP_REQUEST_SCHEMA}
)
@websocket_api.async_response
async def websocket_family_swap_request(
    hass: HomeAssistant, connection: Any, msg: dict[str, Any]
) -> None:
    role = _role(hass, connection)
    store = _store(hass)
    tz = ZoneInfo(hass.config.time_zone)
    now = dt_util.now()
    actor = str(getattr(connection.user, "id", "") or "")
    kids = model.discover_kids(hass.states.async_all(), family_options(hass))
    by_uuid = _kids_index(kids)
    from_k = by_uuid.get(msg["from_kid"])
    to_k = by_uuid.get(msg["to_kid"])
    if not from_k or not to_k:
        connection.send_error(msg["id"], "not_found", "Dítě nenalezeno")
        return
    occ = _occurrence(hass, from_k, msg["chore"])
    try:
        swap_model.validate_swap_request(
            direction=msg["direction"],
            actor_user_id=actor,
            from_kid=msg["from_kid"],
            to_kid=msg["to_kid"],
            chore_opaque=msg["chore"],
            local_day=date.fromisoformat(msg["local_date"]),
            now=now,
            tz=tz,
            role=role,
            occurrence=occ,
        )
    except swap_model.DomainError as err:
        connection.send_error(msg["id"], err.code, str(err))
        return
    dedupe = store.dedupe_lookup(msg["client_request_id"])
    if dedupe:
        connection.send_result(msg["id"], dedupe["result"])
        return
    rid = store.new_request_id()
    req = {
        "id": rid,
        "requester_user_id": actor,
        "requester_name": (to_k if msg["direction"] == "take" else from_k)["name"],
        "source_chore_id": msg["chore"],
        "from_kid_id": msg["from_kid"],
        "to_kid_id": msg["to_kid"],
        "local_date": msg["local_date"],
        "timezone": str(hass.config.time_zone),
        "expires_at": swap_model.expires_at(date.fromisoformat(msg["local_date"]), tz).isoformat(),
        "status": "pending",
        "created_at": now.isoformat(),
        "revision": store.revision + 1,
    }
    store.upsert_request(rid, req)
    await store.async_save()
    result = {"request": req, "revision": store.revision}
    store.remember_dedupe(msg["client_request_id"], dict(msg), result)
    await store.async_save()
    connection.send_result(msg["id"], result)


@websocket_api.websocket_command(
    {
        vol.Required("type"): "homebrain/family/swap/decide",
        vol.Required("request_id"): vol.All(str, vol.Length(min=8, max=64)),
        vol.Required("decision"): vol.In(("approve", "reject")),
        vol.Optional("expected_revision", default=0): vol.Coerce(int),
    }
)
@websocket_api.async_response
async def websocket_family_swap_decide(
    hass: HomeAssistant, connection: Any, msg: dict[str, Any]
) -> None:
    role = _role(hass, connection)
    try:
        _require_adult(role)
    except Unauthorized:
        raise
    store = _store(hass)
    req = (store.data.get("requests") or {}).get(msg["request_id"])
    if not isinstance(req, dict):
        connection.send_error(msg["id"], "not_found", "Žádost nenalezena")
        return
    now = dt_util.now()
    actor = str(getattr(connection.user, "id", "") or "")
    try:
        updated = swap_model.reduce_request(dict(req), msg["decision"], now, actor_id=actor)
    except swap_model.DomainError as err:
        connection.send_error(msg["id"], err.code, str(err))
        return
    store.upsert_request(msg["request_id"], updated)
    await store.async_save()
    op_payload = None
    if updated.get("status") == "approved":
        cfg = choreops_adapter.config_entry_id(hass)
        if not cfg:
            connection.send_error(msg["id"], "not_configured", "ChoreOps není nastaven")
            return
        kids = model.discover_kids(hass.states.async_all(), family_options(hass))
        by_uuid = _kids_index(kids)
        from_k = by_uuid.get(str(updated.get("from_kid_id")))
        to_k = by_uuid.get(str(updated.get("to_kid_id")))
        if not from_k or not to_k:
            connection.send_error(msg["id"], "not_found", "Dítě nenalezeno")
            return
        occ = _occurrence(hass, from_k, str(updated.get("source_chore_id")))
        snap = {
            "chore_id": (occ or {}).get("chore_uuid") or updated.get("source_chore_id"),
            "name": (occ or {}).get("name") or "Úkol",
            "due": (occ or {}).get("due"),
            "points": (occ or {}).get("points"),
        }
        op_id, op = swap_service.start_operation_from_request(
            store,
            {**updated, "id": msg["request_id"]},
            actor_user_id=actor,
            config_entry_id=cfg,
            from_kid_name=from_k["name"],
            to_kid_name=to_k["name"],
            source_snapshot=snap,
            tz=ZoneInfo(hass.config.time_zone),
        )
        try:
            op = await swap_service.execute_operation_step(
                hass, store, op_id, context=connection.context(msg)
            )
        except swap_model.DomainError as err:
            connection.send_error(msg["id"], err.code, str(err))
            return
        op_payload = {"id": op_id, **op}
    connection.send_result(
        msg["id"], {"request": updated, "operation": op_payload, "revision": store.revision}
    )


@websocket_api.websocket_command(
    {vol.Required("type"): "homebrain/family/swap/reassign", **SWAP_REQUEST_SCHEMA}
)
@websocket_api.async_response
async def websocket_family_swap_reassign(
    hass: HomeAssistant, connection: Any, msg: dict[str, Any]
) -> None:
    role = _role(hass, connection)
    _require_adult(role)
    # Direct path: create approved operation without pending request.
    store = _store(hass)
    now = dt_util.now()
    cfg = choreops_adapter.config_entry_id(hass)
    if not cfg:
        connection.send_error(msg["id"], "not_configured", "ChoreOps není nastaven")
        return
    kids = model.discover_kids(hass.states.async_all(), family_options(hass))
    by_uuid = _kids_index(kids)
    from_k = by_uuid.get(msg["from_kid"])
    to_k = by_uuid.get(msg["to_kid"])
    if not from_k or not to_k:
        connection.send_error(msg["id"], "not_found", "Dítě nenalezeno")
        return
    occ = _occurrence(hass, from_k, msg["chore"])
    tz = ZoneInfo(hass.config.time_zone)
    try:
        swap_model.validate_swap_request(
            direction="give",
            actor_user_id=str(getattr(connection.user, "id", "") or ""),
            from_kid=msg["from_kid"],
            to_kid=msg["to_kid"],
            chore_opaque=msg["chore"],
            local_day=date.fromisoformat(msg["local_date"]),
            now=now,
            tz=tz,
            role=role,
            occurrence=occ,
        )
    except swap_model.DomainError as err:
        connection.send_error(msg["id"], err.code, str(err))
        return
    req = {
        "id": None,
        "client_request_id": msg["client_request_id"],
        "from_kid_id": msg["from_kid"],
        "to_kid_id": msg["to_kid"],
        "local_date": msg["local_date"],
    }
    snap = {
        "chore_id": (occ or {}).get("chore_uuid") or msg["chore"],
        "name": (occ or {}).get("name") or "Úkol",
        "due": (occ or {}).get("due"),
        "points": (occ or {}).get("points"),
    }
    op_id, op = swap_service.start_operation_from_request(
        store,
        req,
        actor_user_id=str(getattr(connection.user, "id", "") or ""),
        config_entry_id=cfg,
        from_kid_name=from_k["name"],
        to_kid_name=to_k["name"],
        source_snapshot=snap,
        tz=tz,
    )
    try:
        op = await swap_service.execute_operation_step(
            hass, store, op_id, context=connection.context(msg)
        )
    except swap_model.DomainError as err:
        connection.send_error(msg["id"], err.code, str(err))
        return
    connection.send_result(
        msg["id"],
        {"operation": {"id": op_id, **op}, "revision": store.revision},
    )


@websocket_api.websocket_command(
    {
        vol.Required("type"): "homebrain/family/swap/cancel",
        vol.Required("request_id"): vol.All(str, vol.Length(min=8, max=64)),
        vol.Optional("expected_revision", default=0): vol.Coerce(int),
    }
)
@websocket_api.async_response
async def websocket_family_swap_cancel(
    hass: HomeAssistant, connection: Any, msg: dict[str, Any]
) -> None:
    role = _role(hass, connection)
    store = _store(hass)
    req = (store.data.get("requests") or {}).get(msg["request_id"])
    if not isinstance(req, dict):
        connection.send_error(msg["id"], "not_found", "Žádost nenalezena")
        return
    actor = str(getattr(connection.user, "id", "") or "")
    if role == "child" and req.get("requester_user_id") != actor:
        raise Unauthorized
    try:
        updated = swap_model.reduce_request(
            dict(req), "cancel", dt_util.now(), actor_id=actor if role == "child" else None
        )
    except swap_model.DomainError as err:
        connection.send_error(msg["id"], err.code, str(err))
        return
    store.upsert_request(msg["request_id"], updated)
    await store.async_save()
    connection.send_result(msg["id"], {"request": updated, "revision": store.revision})


CREATE_SCHEMA: Final = {
    vol.Required("client_request_id"): vol.All(str, vol.Length(min=8, max=64)),
    vol.Required("name"): vol.All(str, vol.Length(min=1, max=80)),
    vol.Required("points"): vol.Coerce(float),
    vol.Required("assignees"): vol.All([str], vol.Length(min=1, max=8)),
    vol.Required("recurrence"): vol.In(("once", "daily", "weekly")),
    vol.Optional("weekdays"): [vol.In(("mon", "tue", "wed", "thu", "fri", "sat", "sun"))],
    vol.Required("first_date"): vol.Match(r"^\d{4}-\d{2}-\d{2}$"),
    vol.Required("due_time"): vol.Match(r"^\d{2}:\d{2}$"),
    vol.Optional("icon"): vol.All(str, vol.Length(max=64)),
}


@websocket_api.websocket_command(
    {vol.Required("type"): "homebrain/family/chore/create", **CREATE_SCHEMA}
)
@websocket_api.async_response
async def websocket_family_chore_create(
    hass: HomeAssistant, connection: Any, msg: dict[str, Any]
) -> None:
    role = _role(hass, connection)
    _require_adult(role)
    try:
        fields = model.validate_create_chore_fields(msg)
    except ValueError:
        connection.send_error(msg["id"], "invalid_input", "Neplatná data formuláře")
        return
    cfg = choreops_adapter.config_entry_id(hass)
    if not cfg:
        connection.send_error(msg["id"], "not_configured", "ChoreOps není nastaven")
        return
    kids = model.discover_kids(hass.states.async_all(), family_options(hass))
    by_uuid = _kids_index(kids)
    names = [by_uuid[a]["name"] for a in fields["assignees"] if a in by_uuid]
    if len(names) != len(fields["assignees"]):
        connection.send_error(msg["id"], "invalid_input", "Neplatné přiřazení")
        return
    freq = {"once": "none", "daily": "daily", "weekly": "weekly"}[fields["recurrence"]]
    due = f"{fields['first_date']}T{fields['due_time']}:00"
    data: dict[str, Any] = {
        "config_entry_id": cfg,
        "name": fields["name"],
        "points": fields["points"],
        "assigned_user_names": names,
        "frequency": freq,
        "completion_criteria": "independent",
        "due_date": due,
        "auto_approve": False,
        "approval_reset_type": "at_midnight_once" if freq != "none" else "manual",
        "pending_claims": "hold_pending",
    }
    if fields["recurrence"] == "weekly" and fields["weekdays"]:
        data["applicable_days"] = fields["weekdays"]
    if fields.get("icon"):
        data["icon"] = fields["icon"]
    try:
        resp = await choreops_adapter.call_choreops(
            hass, "choreops", "create_chore", data, context=connection.context(msg), response=True
        )
    except Exception as err:  # noqa: BLE001
        connection.send_error(msg["id"], "service_failed", str(err))
        return
    chore_id = (resp or {}).get("chore_id") if isinstance(resp, dict) else None
    connection.send_result(
        msg["id"],
        {
            "operation_id": fields["client_request_id"],
            "chore_id": chore_id,
            "status": "created" if chore_id else "unknown",
            "revision": _store(hass).revision,
        },
    )


POINTS_SCHEMA: Final = {
    vol.Required("kid"): vol.All(str, vol.Length(min=1, max=64)),
}


@websocket_api.websocket_command(
    {vol.Required("type"): "homebrain/family/points/get", **POINTS_SCHEMA}
)
@websocket_api.async_response
async def websocket_family_points_get(
    hass: HomeAssistant, connection: Any, msg: dict[str, Any]
) -> None:
    role = _role(hass, connection)
    kids = _visible_kids(hass, connection, role)
    kid = next((k for k in kids if k.get("kid_uuid") == msg["kid"] or k["id"] == msg["kid"]), None)
    if kid is None:
        connection.send_error(msg["id"], "not_found", "Dítě nenalezeno")
        return
    ps = hass.states.get(kid.get("points_entity") or "")
    balance = model._float(ps.state) if ps else None
    summary = (
        points_model.build_points_summary(
            dict(ps.attributes) if ps else {},
            kid_name=kid["name"],
            balance=balance,
        )
        if ps
        else {"kid_name": kid["name"], "balance": balance}
    )
    connection.send_result(msg["id"], summary)


@websocket_api.websocket_command(
    {
        vol.Required("type"): "homebrain/family/points/history",
        **POINTS_SCHEMA,
        vol.Optional("limit", default=30): vol.All(vol.Coerce(int), vol.Range(min=1, max=1000)),
        vol.Optional("days", default=7): vol.In((7, 30)),
    }
)
@websocket_api.async_response
async def websocket_family_points_history(
    hass: HomeAssistant, connection: Any, msg: dict[str, Any]
) -> None:
    role = _role(hass, connection)
    kids = _visible_kids(hass, connection, role)
    kid = next((k for k in kids if k.get("kid_uuid") == msg["kid"] or k["id"] == msg["kid"]), None)
    if kid is None:
        connection.send_error(msg["id"], "not_found", "Dítě nenalezeno")
        return
    cfg = choreops_adapter.config_entry_id(hass)
    entries: list[dict[str, Any]] = []
    truncated = False
    if cfg:
        try:
            resp = await choreops_adapter.call_choreops(
                hass,
                "choreops",
                "get_ledger",
                {
                    "config_entry_id": cfg,
                    "user_name": kid["name"],
                    "limit": msg["limit"],
                },
                context=connection.context(msg),
                response=True,
            )
            if isinstance(resp, dict):
                entries = list(resp.get("entries") or [])
                truncated = bool(resp.get("truncated"))
        except Exception:
            truncated = True
    days = int(msg["days"])
    today = dt_util.now().date()
    keys = [(today - timedelta(days=i)).isoformat() for i in range(days - 1, -1, -1)]
    chart = points_model.bucket_ledger(entries, days=days, local_keys=keys)
    connection.send_result(
        msg["id"],
        {
            "entries": list(reversed(entries))[: msg["limit"]],
            "chart": chart,
            "truncated": truncated,
            "generated_at": dt_util.now().isoformat(),
        },
    )


SWAP_COMMANDS: Final = (
    websocket_family_swap_options,
    websocket_family_swap_request,
    websocket_family_swap_decide,
    websocket_family_swap_reassign,
    websocket_family_swap_cancel,
    websocket_family_chore_create,
    websocket_family_points_get,
    websocket_family_points_history,
)
