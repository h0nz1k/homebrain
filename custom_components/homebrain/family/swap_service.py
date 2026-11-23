"""Swap saga execution against Store + ChoreOps. Refs #123."""

from __future__ import annotations

import logging
import uuid
from datetime import date, datetime
from typing import Any
from zoneinfo import ZoneInfo

from homeassistant.core import Context, HomeAssistant
from homeassistant.util import dt as dt_util

from . import chore_management, choreops_adapter, model, persons, swap_model
from .swap_store import FamilySwapStore
from .ws_common import family_options

_LOGGER = logging.getLogger(__name__)


_UNAVAILABLE = {"unknown", "unavailable"}
_FINISHED = model.DONE_STATES | model.CLAIMED_STATES
OVERDUE_SHARED = "Jednorázový úkol po termínu s více řešiteli nelze přeřadit."


def assignment_status(hass, cfg, eid, source_name, now, tz):
    """Return whether this is the last assignee and whether the remaining dates allow removal."""
    cid = choreops_adapter.chore_id(hass, cfg, eid)
    runtime = choreops_adapter.coordinator(hass, cfg)
    definition = runtime.chores_data.get(cid) if runtime else None
    if definition is not None:
        users = runtime.assignees_data
        assigned = definition.get("assigned_user_ids", [])
        remaining = [uid for uid in assigned if users.get(uid, {}).get("name") != source_name]
        if remaining == assigned:
            return False, True
        dates = definition.get("per_assignee_due_dates") or {}
        return not remaining, any(
            dates.get(uid) and not chore_management.future_due(dates[uid], now, tz)
            for uid in remaining
        )
    state = hass.states.get(eid)
    attrs = state.attributes if state else {}
    names = attrs.get("assigned_user_names") or []
    if not names:
        return False, not chore_management.future_due(attrs.get("due_date"), now, tz)
    remaining = set(names) - {source_name}
    return not remaining, bool(remaining) and not chore_management.future_due(
        attrs.get("due_date"), now, tz
    )


async def _save(store, op_id, op, **changes):
    updated = {**op, **changes}
    store.upsert_operation(op_id, updated)
    await store.async_save()
    return updated


def _clone_id(hass, op, recipient, runtime):
    suffix = swap_model.clone_suffix(op["operation_token"])
    if runtime is not None:
        return next(
            (
                cid
                for cid, row in runtime.chores_data.items()
                if row.get("name", "").endswith(suffix)
            ),
            None,
        )
    if recipient:
        for row in model._helper_rows(hass.states.get, recipient):
            if row.get("name", "").endswith(suffix) and row.get("eid"):
                return choreops_adapter.chore_id(hass, op["config_entry_id"], row["eid"])
    return None


def _source_finished(hass, op, runtime):
    # Older journals persisted the clone ID before the source write without an intent flag.
    if not op.get("source_intent") and ("sole_assignee" in op or not op.get("clone_id")):
        return False
    snap = op["source_snapshot"]
    if op["step"] in {"delete_source", "remove_assignment"} and runtime is not None:
        definition = runtime.chores_data.get(snap["chore_id"])
        return definition is None or all(
            runtime.assignees_data.get(uid, {}).get("name") != op["from_kid_name"]
            for uid in definition.get("assigned_user_ids", [])
        )
    state = hass.states.get(snap["opaque_id"])
    if op["step"] == "skip_intent":
        if runtime is not None:
            definition = runtime.chores_data.get(snap["chore_id"])
            if definition:
                uid = next(
                    (
                        uid
                        for uid, user in runtime.assignees_data.items()
                        if user.get("name") == op["from_kid_name"]
                    ),
                    None,
                )
                user_chore = (
                    runtime.assignees_data.get(uid, {})
                    .get("chore_data", {})
                    .get(snap["chore_id"], {})
                )
                if user_chore.get("state") in _FINISHED:
                    return False
                if started := op.get("source_started_at"):
                    tz = ZoneInfo(op["timezone"])
                    if any(
                        chore_management.future_due(
                            user_chore.get(key), datetime.fromisoformat(started), tz
                        )
                        for key in ("last_claimed", "last_approved", "last_completed")
                    ):
                        return False
                due = (definition.get("per_assignee_due_dates") or {}).get(uid)
                due = due or definition.get("due_date")
                return bool(due and not swap_model.same_due(due, snap["due"]))
        return bool(
            state
            and state.state not in _UNAVAILABLE | _FINISHED
            and state.attributes.get("due_date")
            and not swap_model.same_due(state.attributes["due_date"], snap["due"])
        )
    return False


async def _cleanup(hass, store, op_id, op, runtime, recipient, context):
    clone_id = op["clone_id"]
    rollback = op["status"] == "rollback_pending"
    terminal = op.get("rollback_status", "failed") if rollback else "cleaned"
    if not clone_id or (runtime is not None and clone_id not in runtime.chores_data):
        return await _save(store, op_id, op, status=terminal, clone_id=None)

    if not rollback:
        if runtime is not None:
            records = [
                user.get("chore_data", {}).get(clone_id, {})
                for user in runtime.assignees_data.values()
            ]
            claimed = any(
                row.get("state") in _FINISHED
                or row.get("last_claimed")
                or row.get("last_approved")
                or row.get("last_completed")
                for row in records
            )
        else:
            sensor = (
                next(
                    (
                        hass.states.get(row["eid"])
                        for row in model._helper_rows(hass.states.get, recipient)
                        if row.get("eid")
                        and choreops_adapter.chore_id(hass, op["config_entry_id"], row["eid"])
                        == clone_id
                    ),
                    None,
                )
                if recipient
                else None
            )
            if not sensor or sensor.state in _UNAVAILABLE:
                return op
            claimed = sensor.state in _FINISHED or any(
                sensor.attributes.get(key)
                for key in ("last_claimed", "last_approved", "last_completed")
            )
        if claimed:
            return await _save(store, op_id, op, status="completed", clone_claimed=True)
    try:
        await choreops_adapter.call_choreops(
            hass,
            "choreops",
            "delete_chore",
            {"config_entry_id": op["config_entry_id"], "id": clone_id},
            context=context,
        )
    except Exception:  # noqa: BLE001 — keep the ID and retry on the next tick
        _LOGGER.warning("Rodina: kopii přeřazeného úkolu se nepodařilo smazat")
        if not rollback and op.get("last_error") != "cleanup_failed":
            return await _save(store, op_id, op, last_error="cleanup_failed")
        return op
    return await _save(store, op_id, op, status=terminal, step="cleaned", clone_id=None)


async def _fail(hass, store, op_id, op, runtime, recipient, context, code, *, expired=False):
    terminal = "needs_repair" if expired else "failed"
    if op.get("clone_id"):
        pending = await _save(
            store,
            op_id,
            op,
            status="rollback_pending",
            step="delete_clone",
            rollback_status=terminal,
            last_error=code,
            recovery_checked=True,
        )
        await _cleanup(hass, store, op_id, pending, runtime, recipient, context)
    else:
        await _save(store, op_id, op, status=terminal, last_error=code, recovery_checked=True)
    raise swap_model.DomainError(code, "Přeřazení se nepovedlo.")


async def execute_operation_step(
    hass: HomeAssistant,
    store: FamilySwapStore,
    operation_id: str,
    *,
    context,
) -> dict[str, Any]:
    op = store.data["operations"].get(operation_id)
    if not isinstance(op, dict):
        raise swap_model.DomainError("not_found", "Operace nenalezena.")
    tz = ZoneInfo(op["timezone"])
    now = dt_util.now()
    today = swap_model.local_today(now, tz)
    day = date.fromisoformat(op["local_date"])
    snap = op["source_snapshot"]
    cfg = op["config_entry_id"]
    eid = snap["opaque_id"]
    runtime = choreops_adapter.coordinator(hass, cfg)
    members = persons.members(hass, hass.states.async_all(), family_options(hass))
    kids = {str(k.get("kid_uuid") or k["id"]): k for k in members if k["role"] == "child"}
    source, recipient = kids.get(op["from_kid_id"]), kids.get(op["to_kid_id"])

    if op["status"] in {"cleanup_pending", "unclaimed_expired", "rollback_pending"}:
        return await _cleanup(hass, store, operation_id, op, runtime, recipient, context)

    if op["status"] == "needs_repair":
        # Older versions could expire an applying operation before looking up its clone.
        if runtime is None:
            return op
        cid = op.get("clone_id") or _clone_id(hass, op, recipient, runtime)
        if not cid or cid not in runtime.chores_data:
            return await _save(store, operation_id, op, recovery_checked=True, clone_id=None)
        op = await _save(store, operation_id, op, status="applying", recovery_checked=True)

    async def fail(code="unsupported_chore"):
        await _fail(
            hass, store, operation_id, op, runtime, recipient, context, code, expired=day < today
        )

    if op["status"] == "scheduled":
        if day != today or not source or not recipient:
            return op
        finish = "update_chore" if snap["frequency"] == "none" else "skip_chore_due_date"
        state = hass.states.get(eid)
        if (
            not state
            or state.state in _UNAVAILABLE
            or not hass.services.has_service("choreops", "create_chore")
            or not hass.services.has_service("choreops", finish)
        ):
            return op
        if not choreops_adapter.matches_entry(hass, cfg, eid):
            await fail()
        rows = model.kid_chores(hass.states.get, source) + model.kid_upcoming(
            hass.states.get,
            source,
            limit=None,
        )
        current = next((row for row in rows if row["id"] == eid), None)
        if state.state in _FINISHED:
            await fail()
        if not current or current["raw_state"] in _UNAVAILABLE:
            return op
        if (
            not current["can_request_swap"]
            or current["frequency"] != snap["frequency"]
            or swap_model.swap_day(current, now.astimezone(tz)) != day
            or not swap_model.same_due(current["due"], snap["due"])
        ):
            await fail()
        sole_assignee = False
        if snap["frequency"] == "none":
            sole_assignee, blocked = assignment_status(hass, cfg, eid, source["name"], now, tz)
            if blocked or not snap["chore_id"]:
                await fail()
            if sole_assignee and not hass.services.has_service("choreops", "delete_chore"):
                return op
        snap = {**snap, "name": current["name"], "points": current["points"]}
        op = await _save(
            store,
            operation_id,
            op,
            status="applying",
            from_kid_name=source["name"],
            to_kid_name=recipient["name"],
            assignee_name=recipient["name"],
            source_snapshot=snap,
            clone_due=op.get("clone_due")
            if op.get("clone_due_picked")
            else swap_model.clone_due(current["due"], now, tz),
            sole_assignee=sole_assignee,
        )

    while op["status"] == "applying":
        effect = swap_model.plan_next_effect(op)
        if effect is None:
            await fail("service_failed")
        creating = op["step"] == "create_intent"
        now = dt_util.now()
        today = swap_model.local_today(now, tz)
        if creating:
            if cid := _clone_id(hass, op, recipient, runtime):
                op = await _save(store, operation_id, swap_model.clone_created(op, cid))
                continue
            if runtime is None and not recipient:
                return op
        else:
            finished = _source_finished(hass, op, runtime)
            if runtime is not None and op["clone_id"] not in runtime.chores_data:
                # HA may restart before the ChoreOps store flushes a newly created clone.
                if finished:
                    await _save(
                        store,
                        operation_id,
                        op,
                        status="needs_repair",
                        last_error="missing_clone",
                        recovery_checked=True,
                        clone_id=None,
                    )
                    raise swap_model.DomainError("service_failed", "Chybí náhradní úkol.")
                op = await _save(
                    store,
                    operation_id,
                    op,
                    step="create_intent",
                    clone_id=None,
                    source_intent=False,
                    source_started_at=None,
                )
                continue
            if finished:
                return await _save(store, operation_id, op, status="active", step="active")
        if day < today:
            if runtime is None and not hass.services.has_service("choreops", "create_chore"):
                return op
            await fail("expired_day")
        if not hass.services.has_service("choreops", effect.service):
            return op
        if not creating and not op.get("source_intent"):
            op = await _save(
                store, operation_id, op, source_intent=True, source_started_at=now.isoformat()
            )
            now = dt_util.now()
            today = swap_model.local_today(now, tz)
            if day < today:
                await fail("expired_day")
        state = hass.states.get(eid)
        if not state or state.state in _UNAVAILABLE:
            return op
        if not swap_model.same_due(
            state.attributes.get("due_date"), snap["due"]
        ) or state.state in _FINISHED | {"missed", "paused"}:
            await fail()
        if not creating and snap["frequency"] == "none":
            sole, blocked = assignment_status(hass, cfg, eid, op["from_kid_name"], now, tz)
            if blocked or (op["step"] == "delete_source" and not sole):
                await fail()
            if sole and op["step"] == "remove_assignment":
                op = await _save(store, operation_id, op, step="delete_source")
                continue
        try:
            response = await choreops_adapter.call_choreops(
                hass,
                effect.domain,
                effect.service,
                effect.data,
                context=context,
                response=creating or effect.service == "update_chore",
            )
        except Exception as err:  # noqa: BLE001 — check for an effect committed before sync failed
            if not creating and _source_finished(hass, op, runtime):
                return await _save(store, operation_id, op, status="active", step="active")
            if creating and (cid := _clone_id(hass, op, recipient, runtime)):
                op = await _save(store, operation_id, swap_model.clone_created(op, cid))
                continue
            await fail(model.create_error_code(err) if creating else "service_failed")
        if not creating:
            if runtime is not None and not _source_finished(hass, op, runtime):
                await fail("service_failed")
            return await _save(store, operation_id, op, status="active", step="active")
        cid = (
            (response.get("id") or response.get("chore_id")) if isinstance(response, dict) else None
        )
        cid = cid or _clone_id(hass, op, recipient, runtime)
        if not cid:
            await fail("service_failed")
        op = await _save(store, operation_id, swap_model.clone_created(op, cid))
        if runtime is not None and cid not in runtime.chores_data:
            await fail("service_failed")
    return op


def cancel_operation(store, operation_id, op):
    store.upsert_operation(operation_id, {**op, "status": "cancelled"})
    rid = op.get("request_id")
    request = store.data["requests"].get(rid)
    if request and request["status"] == "approved":
        store.upsert_request(rid, {**request, "status": "cancelled"})


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
    clone_due: str | None = None,
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
        "clone_due": clone_due or swap_model.clone_due(source_snapshot.get("due"), now, tz),
        "clone_due_picked": bool(clone_due),
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
        now = dt_util.now()
        if store.reconcile_all(now, ZoneInfo(hass.config.time_zone)):
            await store.async_save()
        for operation_id, op in list(store.data["operations"].items()):
            recover_legacy = (
                op["status"] == "needs_repair"
                and op.get("last_error") == "expired_day"
                and op.get("operation_token")
                and not op.get("recovery_checked")
            )
            if not recover_legacy and op["status"] not in {
                "scheduled",
                "applying",
                "cleanup_pending",
                "unclaimed_expired",
                "rollback_pending",
            }:
                continue
            if (
                op["status"] == "scheduled"
                and op["local_date"]
                != swap_model.local_today(now, ZoneInfo(op["timezone"])).isoformat()
            ):
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
                current = store.data["operations"][operation_id]
                if current["status"] == "failed" and not current.get("background_failure"):
                    # Nobody saw this one fail (unlike a rejected tap in the sheet): tell parents.
                    await _save(store, operation_id, current, background_failure=True)
            except Exception:  # noqa: BLE001 — isolate each operation and retain its recovery step
                current = store.data["operations"][operation_id]
                status = "needs_repair" if current["status"] == "scheduled" else current["status"]
                await _save(
                    store, operation_id, current, status=status, last_error="service_failed"
                )
                _LOGGER.warning("Rodina: naplánované přeřazení se nepodařilo dokončit")
