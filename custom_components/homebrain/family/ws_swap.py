"""WS: swap, create chore, points (Rodina). Refs #123."""

from __future__ import annotations

import logging
from datetime import date, timedelta
from functools import wraps
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

_LOGGER = logging.getLogger(__name__)


def _store(hass: HomeAssistant) -> FamilySwapStore:
    raw = hass.data.get("homebrain", {}).get("family_swap")
    if not isinstance(raw, FamilySwapStore):
        raise RuntimeError("family swap store missing")
    return raw


def _serialize_mutation(handler):
    @wraps(handler)
    async def run(hass: HomeAssistant, connection: Any, msg: dict[str, Any]) -> None:
        async with _store(hass).mutation_lock:
            await handler(hass, connection, msg)

    return run


def _kids_index(kids: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    return {str(k.get("kid_uuid") or k["id"]): k for k in kids}


def _occurrence(hass: HomeAssistant, kid: dict[str, Any], opaque: str) -> dict[str, Any] | None:
    for row in model.kid_chores(hass.states.get, kid):
        if row.get("opaque_id") == opaque or row.get("id") == opaque:
            return row
    return None


def _swap_snapshot(hass: HomeAssistant, cfg: str, occ: dict[str, Any]) -> dict[str, Any]:
    return {
        "chore_id": choreops_adapter.chore_id(hass, cfg, occ["id"]),
        "opaque_id": occ["id"],
        "name": occ["name"],
        "due": occ["due"],
        "points": occ["points"],
    }


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
@_serialize_mutation
async def websocket_family_swap_request(
    hass: HomeAssistant, connection: Any, msg: dict[str, Any]
) -> None:
    role = _role(hass, connection)
    store = _store(hass)
    tz = ZoneInfo(hass.config.time_zone)
    now = dt_util.now()
    actor = str(getattr(connection.user, "id", "") or "")
    payload = {key: value for key, value in msg.items() if key != "id"}
    payload["actor"] = actor
    dedupe = store.dedupe_lookup(msg["client_request_id"])
    if dedupe:
        saved = dedupe["payload"]
        request = dedupe["result"].get("request") or {}
        legacy = {key: value for key, value in saved.items() if key != "id"}
        if saved == payload or (
            request.get("requester_user_id") == actor and {**legacy, "actor": actor} == payload
        ):
            connection.send_result(msg["id"], dedupe["result"])
        else:
            connection.send_error(msg["id"], "conflict", "Tento požadavek už byl použit.")
        return
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
    store.remember_dedupe(msg["client_request_id"], payload, result)
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
@_serialize_mutation
async def websocket_family_swap_decide(
    hass: HomeAssistant, connection: Any, msg: dict[str, Any]
) -> None:
    role = _role(hass, connection)
    _require_adult(role)
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
    if msg["decision"] == "approve" and swap_model.request_expired(req, now):
        store.upsert_request(msg["request_id"], swap_model.reduce_request(req, "expire", now))
        await store.async_save()
        connection.send_error(msg["id"], "expired", "Platí jen pro dnešní den.")
        return
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
        if not occ:
            connection.send_error(msg["id"], "not_found", "Povinnost nenalezena.")
            return
        if not occ["can_request_swap"]:
            connection.send_error(msg["id"], "unsupported_chore", "Tento úkol nelze dnes předat.")
            return
        snap = _swap_snapshot(hass, cfg, occ)
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
        store.upsert_request(msg["request_id"], updated)
        await store.async_save()
        try:
            op = await swap_service.execute_operation_step(
                hass, store, op_id, context=connection.context(msg)
            )
        except swap_model.DomainError as err:
            connection.send_error(msg["id"], err.code, str(err))
            return
        op_payload = {"id": op_id, **op}
    else:
        store.upsert_request(msg["request_id"], updated)
        await store.async_save()
    connection.send_result(
        msg["id"], {"request": updated, "operation": op_payload, "revision": store.revision}
    )


@websocket_api.websocket_command(
    {vol.Required("type"): "homebrain/family/swap/reassign", **SWAP_REQUEST_SCHEMA}
)
@websocket_api.async_response
@_serialize_mutation
async def websocket_family_swap_reassign(
    hass: HomeAssistant, connection: Any, msg: dict[str, Any]
) -> None:
    role = _role(hass, connection)
    _require_adult(role)
    store = _store(hass)
    actor = str(getattr(connection.user, "id", "") or "")
    payload = {key: msg[key] for key in ("chore", "from_kid", "to_kid", "local_date")}
    payload.update(action="swap/reassign", actor=actor)
    previous = store.dedupe_lookup(msg["client_request_id"])
    if previous:
        if previous["payload"] != payload:
            connection.send_error(msg["id"], "conflict", "Tento požadavek už byl použit.")
            return
        op_id = previous["result"]["operation_id"]
        op = store.data["operations"][op_id]
        if op["status"] in {"active", "completed", "cleaned", "unclaimed_expired"}:
            connection.send_result(
                msg["id"], {"operation": {"id": op_id, **op}, "revision": store.revision}
            )
        else:
            connection.send_error(
                msg["id"], op.get("last_error") or "service_failed", "Přeřazení se nepovedlo."
            )
        return
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
    req = {
        "id": None,
        "client_request_id": msg["client_request_id"],
        "from_kid_id": msg["from_kid"],
        "to_kid_id": msg["to_kid"],
        "local_date": msg["local_date"],
    }
    assert occ is not None
    snap = _swap_snapshot(hass, cfg, occ)
    op_id, _ = swap_service.start_operation_from_request(
        store,
        req,
        actor_user_id=actor,
        config_entry_id=cfg,
        from_kid_name=from_k["name"],
        to_kid_name=to_k["name"],
        source_snapshot=snap,
        tz=tz,
    )
    store.remember_dedupe(msg["client_request_id"], payload, {"operation_id": op_id})
    await store.async_save()
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
@_serialize_mutation
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
    vol.Required("recurrence"): vol.In(model.RECURRENCES),
    vol.Optional("weekdays"): [vol.In(("mon", "tue", "wed", "thu", "fri", "sat", "sun"))],
    vol.Required("first_date"): vol.Match(r"^\d{4}-\d{2}-\d{2}$"),
    vol.Required("due_time"): vol.Match(r"^\d{2}:\d{2}$"),
    vol.Optional("times"): vol.All(
        [vol.Match(r"^\d{2}:\d{2}$")],
        vol.Length(min=model.MULTI_TIMES[0], max=model.MULTI_TIMES[1]),
    ),
    vol.Optional("icon"): vol.All(str, vol.Length(max=64)),
}


@websocket_api.websocket_command(
    {vol.Required("type"): "homebrain/family/chore/create", **CREATE_SCHEMA}
)
@websocket_api.async_response
@_serialize_mutation
async def websocket_family_chore_create(
    hass: HomeAssistant, connection: Any, msg: dict[str, Any]
) -> None:
    role = _role(hass, connection)
    _require_adult(role)
    try:
        fields = model.validate_create_chore_fields(msg)
    except ValueError:
        _create_error(connection, msg, "invalid_input")
        return
    cfg = choreops_adapter.config_entry_id(hass)
    if not cfg:
        _create_error(connection, msg, "not_configured")
        return
    kids = model.discover_kids(hass.states.async_all(), family_options(hass))
    by_uuid = _kids_index(kids)
    names = [by_uuid[a]["name"] for a in fields["assignees"] if a in by_uuid]
    if len(names) != len(fields["assignees"]):
        _create_error(connection, msg, "invalid_input")
        return
    try:
        plans = model.plan_create_chores(
            fields, config_entry_id=cfg, user_names=names, now=dt_util.now()
        )
    except ValueError:
        _create_error(connection, msg, "invalid_input")
        return
    created: list[str] = []
    for data in plans:
        try:
            resp = await choreops_adapter.call_choreops(
                hass,
                "choreops",
                "create_chore",
                data,
                context=connection.context(msg),
                response=True,
            )
        except Exception as err:  # noqa: BLE001 - ChoreOps raises HomeAssistantError/vol.Invalid
            code = model.create_error_code(err)
            _LOGGER.warning("Rodina: create_chore %s failed: %s (%s)", data["name"], code, err)
            await _rollback_created(hass, connection, msg, cfg, created)
            _create_error(connection, msg, code)
            return
        chore_id = (resp.get("id") or resp.get("chore_id")) if isinstance(resp, dict) else None
        if chore_id:
            created.append(str(chore_id))
    if len(plans) > 1 and len(created) == len(plans):
        store = _store(hass)
        groups = store.data.setdefault("chore_groups", {})
        groups[store.new_operation_id()] = {"config_entry_id": cfg, "chore_ids": created}
        await store.async_save()
    connection.send_result(
        msg["id"],
        {
            "operation_id": fields["client_request_id"],
            "chore_id": created[0] if created else None,
            "chore_ids": created,
            "names": [p["name"] for p in plans],
            "status": "created" if len(created) == len(plans) else "unknown",
            "revision": _store(hass).revision,
        },
    )


def _create_error(connection: Any, msg: dict[str, Any], code: str) -> None:
    connection.send_error(
        msg["id"], code, model.CREATE_ERROR_MESSAGES.get(code, "Úkol se nepodařilo uložit.")
    )


async def _rollback_created(
    hass: HomeAssistant, connection: Any, msg: dict[str, Any], cfg: str, created: list[str]
) -> None:
    """„Vícekrát denně“ is all-or-nothing: delete slots created before a later slot failed."""
    for chore_id in created:
        try:
            await choreops_adapter.call_choreops(
                hass,
                "choreops",
                "delete_chore",
                {"config_entry_id": cfg, "id": chore_id},
                context=connection.context(msg),
            )
        except Exception as err:  # noqa: BLE001
            _LOGGER.warning("Rodina: rollback delete_chore %s failed: %s", chore_id, err)


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
