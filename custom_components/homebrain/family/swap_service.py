"""Swap saga execution against Store + ChoreOps. Refs #123."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any
from zoneinfo import ZoneInfo

from homeassistant.core import HomeAssistant
from homeassistant.util import dt as dt_util

from . import choreops_adapter, swap_model
from .swap_store import FamilySwapStore


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
    effect = swap_model.plan_next_effect(op)
    if effect is None:
        return op
    try:
        resp = await choreops_adapter.call_choreops(
            hass,
            effect.domain,
            effect.service,
            effect.data,
            context=context,
            response=effect.service == "create_chore",
        )
    except Exception as err:  # noqa: BLE001 — surfaced as service_failed to the client
        op = dict(op)
        op["status"] = "failed"
        op["last_error"] = str(err)
        store.upsert_operation(operation_id, op)
        await store.async_save()
        raise swap_model.DomainError("service_failed", str(err)) from err
    observed: dict[str, Any] = {}
    if effect.service == "create_chore":
        cid = (resp or {}).get("chore_id") if isinstance(resp, dict) else None
        if cid:
            observed["chore_id"] = cid
    elif effect.service == "skip_chore_due_date":
        observed["skipped"] = True
    elif effect.service == "delete_chore":
        observed["deleted"] = True
    next_op = swap_model.advance_operation(dict(op), observed)
    store.upsert_operation(operation_id, next_op)
    await store.async_save()
    if next_op.get("step") in {"skip_intent", "delete_clone"} and next_op.get("status") == "applying":
        return await execute_operation_step(hass, store, operation_id, context=context)
    return next_op


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
    local = request.get("local_date")
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
        "status": "applying",
        "step": "create_intent",
        "source_snapshot": source_snapshot,
        "clone_id": None,
        "operation_token": token,
        "clone_claimed": False,
        "created_at": now.isoformat(),
    }
    store.upsert_operation(op_id, op)
    return op_id, op