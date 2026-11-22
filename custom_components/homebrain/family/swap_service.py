"""Swap saga execution against Store + ChoreOps. Refs #123."""

from __future__ import annotations

import logging
import uuid
from datetime import date
from typing import Any, Never
from zoneinfo import ZoneInfo

from homeassistant.core import Context, HomeAssistant
from homeassistant.util import dt as dt_util

from . import choreops_adapter, model, persons, swap_model
from .swap_store import FamilySwapStore
from .ws_common import family_options

_LOGGER = logging.getLogger(__name__)


async def execute_operation_step(
    hass: HomeAssistant,
    store: FamilySwapStore,
    operation_id: str,
    *,
    context,
) -> dict[str, Any]:
    ops = store.data.get("operations") or {}
    op = ops.get(operation_id)
    if not isinstance(op, dict):
        raise swap_model.DomainError("not_found", "Operace nenalezena.")
    if op["status"] == "scheduled":
        tz = ZoneInfo(op["timezone"])
        now = dt_util.now()
        day = date.fromisoformat(op["local_date"])
        if day != swap_model.local_today(now, tz):
            return op
        members = persons.members(hass, hass.states.async_all(), family_options(hass))
        kids = {str(k.get("kid_uuid") or k["id"]): k for k in members if k["role"] == "child"}
        source, recipient = kids.get(op["from_kid_id"]), kids.get(op["to_kid_id"])
        if not source or not recipient:
            # ChoreOps helpers may not be ready during HA startup.
            return op
        snap = op["source_snapshot"]
        cfg = op["config_entry_id"]
        eid = snap["opaque_id"]
        finish_service = "update_chore" if snap["frequency"] == "none" else "skip_chore_due_date"
        if (
            not hass.states.get(eid)
            or not hass.services.has_service("choreops", "create_chore")
            or not hass.services.has_service("choreops", finish_service)
        ):
            return op
        if not choreops_adapter.matches_entry(hass, cfg, eid):
            return await _fail_changed_occurrence(store, operation_id, op)
            return op
        rows = model.kid_chores(hass.states.get, source) + model.kid_upcoming(
            hass.states.get,
            source,
            limit=None,
        )
        current = next((row for row in rows if row["id"] == eid), None)
        if (
            not current
            or not current["can_request_swap"]
            or current["frequency"] != snap["frequency"]
            or swap_model.swap_day(current, now.astimezone(tz)) != day
            or swap_model.occurrence_day(current["due"], tz)
            != swap_model.occurrence_day(snap["due"], tz)
        ):
            return await _fail_changed_occurrence(store, operation_id, op)
        op = {
            **op,
            "status": "applying",
            "from_kid_name": source["name"],
            "to_kid_name": recipient["name"],
            "assignee_name": recipient["name"],
            "source_snapshot": {
                **snap,
                "due": current["due"],
                "name": current["name"],
                "points": current["points"],
            },
            "clone_due": swap_model.clone_due(current["due"], now, tz),
        }
        if snap["frequency"] == "none" and not snap["chore_id"]:
            return await _fail_changed_occurrence(store, operation_id, op)
        store.upsert_operation(operation_id, op)
        await store.async_save()
    effect = swap_model.plan_next_effect(op)
    if effect is None:
        return op
    if effect.service in {"skip_chore_due_date", "update_chore"} and not _still_current(hass, op):
        # The source has not been modified, so the newly created clone can be rolled back.
        try:
            await choreops_adapter.call_choreops(
                hass,
                "choreops",
                "delete_chore",
                {"config_entry_id": op["config_entry_id"], "id": op["clone_id"]},
                context=context,
            )
        except Exception:  # noqa: BLE001 — retain the ID for repair
            _LOGGER.warning("Rodina: nelze vrátit vytvoření náhradního výskytu")
        return await _fail_changed_occurrence(store, operation_id, op)
    try:
        resp = await choreops_adapter.call_choreops(
            hass,
            effect.domain,
            effect.service,
            effect.data,
            context=context,
            response=effect.service in {"create_chore", "update_chore"},
        )
        observed: dict[str, Any] = {}
        if effect.service == "create_chore":
            cid = (resp.get("id") or resp.get("chore_id")) if isinstance(resp, dict) else None
            if not cid:
                raise swap_model.DomainError("service_failed", "ChoreOps nevrátil ID úkolu.")
            observed["chore_id"] = cid
    except Exception as err:  # noqa: BLE001 — surfaced using a stable WS code
        code = (
            model.create_error_code(err) if effect.service == "create_chore" else "service_failed"
        )
        failed = swap_model.advance_operation(op, {"error": code})
        store.upsert_operation(operation_id, failed)
        await store.async_save()
        raise swap_model.DomainError(code, "Přeřazení se nepovedlo.") from err
    if effect.service == "skip_chore_due_date":
        observed["skipped"] = True
    elif effect.service == "update_chore":
        observed["updated"] = True
    elif effect.service == "delete_chore":
        observed["deleted"] = True
    next_op = swap_model.advance_operation(dict(op), observed)
    store.upsert_operation(operation_id, next_op)
    await store.async_save()
    step = next_op.get("step")
    if step in {"skip_intent", "remove_assignment"} and next_op.get("status") == "applying":
        return await execute_operation_step(hass, store, operation_id, context=context)
    return next_op


def _still_current(hass: HomeAssistant, op: dict[str, Any]) -> bool:
    """The skip targets the current occurrence, so guard again after creating the clone."""
    tz = ZoneInfo(op["timezone"])
    day = date.fromisoformat(op["local_date"])
    state = hass.states.get(op["source_snapshot"]["opaque_id"])
    return (
        day == swap_model.local_today(dt_util.now(), tz)
        and state is not None
        and state.attributes.get("due_date") == op["source_snapshot"]["due"]
        and state.state not in model.DONE_STATES | model.CLAIMED_STATES | {"missed", "paused"}
    )


async def _fail_changed_occurrence(
    store: FamilySwapStore, operation_id: str, op: dict[str, Any]
) -> Never:
    error = swap_model.DomainError("unsupported_chore", "Výskyt už nelze přeřadit.")
    store.upsert_operation(operation_id, {**op, "status": "failed", "last_error": error.code})
    await store.async_save()
    raise error


def start_operation_from_request(
    store: FamilySwapStore,
    request: dict[str, Any],
    *,
    actor_user_id: str,
    config_entry_id: str,
    from_kid_name: str,
    to_kid_name: str,
    source_snapshot: dict[str, Any],
    tz: ZoneInfo,
) -> tuple[str, dict[str, Any]]:
    op_id = store.new_operation_id()
    token = str(uuid.uuid4())
    local = request["local_date"]
    now = dt_util.now()
    op = {
        "kind": "swap",
        "request_id": request.get("id"),
        "client_request_id": request.get("client_request_id"),
        "actor_user_id": actor_user_id,
        "config_entry_id": config_entry_id,
        "local_date": local,
        "timezone": str(tz),
        "from_kid_id": request.get("from_kid_id"),
        "to_kid_id": request.get("to_kid_id"),
        "from_kid_name": from_kid_name,
        "to_kid_name": to_kid_name,
        "assignee_name": to_kid_name,
        "status": "scheduled",
        "step": "create_intent",
        "source_snapshot": source_snapshot,
        "clone_due": swap_model.clone_due(source_snapshot.get("due"), now, tz),
        "clone_id": None,
        "operation_token": token,
        "clone_claimed": False,
        "created_at": now.isoformat(),
    }
    store.upsert_operation(op_id, op)
    return op_id, op


async def apply_scheduled_swaps(hass: HomeAssistant, store: FamilySwapStore) -> None:
    """Apply due transfers with their original actor, serializing with WebSocket writes."""
    async with store.mutation_lock:
        today = swap_model.local_today(dt_util.now(), ZoneInfo(hass.config.time_zone)).isoformat()
        for operation_id, op in list(store.data["operations"].items()):
            if op["status"] != "scheduled" or op["local_date"] != today:
                continue
            try:
                await execute_operation_step(
                    hass,
                    store,
                    operation_id,
                    context=Context(user_id=op["actor_user_id"]),
                )
            except swap_model.DomainError as err:
                _LOGGER.warning("Rodina: naplánované přeřazení selhalo (%s)", err.code)
