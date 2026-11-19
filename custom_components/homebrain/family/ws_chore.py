"""Adult-only occurrence and series management through ChoreOps. Refs #123."""

from __future__ import annotations

import logging
from typing import Any, Final
from zoneinfo import ZoneInfo

import voluptuous as vol
from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant
from homeassistant.util import dt as dt_util

from . import chore_management, choreops_adapter, model
from .swap_store import FamilySwapStore
from .ws_common import _role, family_options
from .ws_swap import _require_adult, _serialize_mutation, _store

_LOGGER = logging.getLogger(__name__)


CHORE_MANAGEMENT_SCHEMA: Final = {
    vol.Required("client_request_id"): vol.All(str, vol.Length(min=8, max=64)),
    vol.Required("kid"): vol.All(str, vol.Length(min=1, max=64)),
    vol.Required("chore"): vol.All(str, vol.Length(min=1, max=255)),
}

_MANAGEMENT_ERRORS = {
    "not_found": "Úkol už není dostupný.",
    "not_configured": "Úkoly nejsou nastavené.",
    "unsupported_chore": "Dnešní termín tohoto úkolu nelze smazat.",
    "conflict": "Úkol se mezitím změnil. Otevři jeho akce znovu.",
    "restore_failed": "Původní termín už nelze obnovit.",
    "service_failed": "Úkol se nepodařilo upravit. Zkus to znovu.",
    "partial_delete": "Některé časy se nepodařilo smazat. Zkontroluj zbývající úkoly.",
}


def _send_management_result(connection: Any, msg: dict[str, Any], result: dict[str, Any]) -> None:
    if error := result.get("error"):
        connection.send_error(msg["id"], error, _MANAGEMENT_ERRORS[error])
    else:
        connection.send_result(msg["id"], result)


def _cancel_deleted_swaps(
    store: FamilySwapStore, cfg: str, target: dict[str, Any], aliases: set[str]
) -> None:
    aliases = aliases | {target["id"] or target["name"]}
    for rid, request in (store.data.get("requests") or {}).items():
        if request.get("source_chore_id") in aliases and request["status"] == "pending":
            store.upsert_request(rid, {**request, "status": "cancelled"})
    for oid, operation in (store.data.get("operations") or {}).items():
        if operation.get("config_entry_id") != cfg or operation["status"] not in {
            "applying",
            "cleanup_pending",
            "active",
        }:
            continue
        source = operation.get("source_snapshot") or {}
        if aliases.intersection(
            {source.get("chore_id"), source.get("opaque_id"), operation.get("clone_id")}
        ):
            store.upsert_operation(oid, {**operation, "status": "cancelled"})
            rid = operation.get("request_id")
            request = (store.data.get("requests") or {}).get(rid)
            if request and request["status"] == "approved":
                store.upsert_request(rid, {**request, "status": "cancelled"})


async def _delete_chore(
    hass: HomeAssistant,
    store: FamilySwapStore,
    cfg: str,
    row: dict[str, Any],
    rows: dict[tuple[str, str], dict[str, Any]],
    msg: dict[str, Any],
    context: Any,
) -> dict[str, Any]:
    groups = store.data.get("chore_groups") or {}
    requested_ids = msg.get("series_ids")
    targets = [row]
    if requested_ids is not None:
        targets = chore_management.series(row, rows.values(), groups, cfg)
        if len(targets) < 2 or sorted(requested_ids) != sorted(item["id"] for item in targets):
            return {"error": "conflict"}

    deleted = 0
    for target in targets:
        cid = target["id"]
        try:
            await choreops_adapter.call_choreops(
                hass,
                "choreops",
                "delete_chore",
                {"config_entry_id": cfg, **({"id": cid} if cid else {"name": target["name"]})},
                context=context,
            )
        except Exception:  # noqa: BLE001 - report any completed deletions
            return {"error": "partial_delete" if deleted else "service_failed"}
        deleted += 1
        aliases = {
            eid
            for (_, eid), candidate in rows.items()
            if (cid and candidate["id"] == cid) or candidate["name"] == target["name"]
        }
        _cancel_deleted_swaps(store, cfg, target, aliases)
        for gid, group in list(groups.items()):
            if group["config_entry_id"] == cfg and cid in group["chore_ids"]:
                group["chore_ids"].remove(cid)
                if not group["chore_ids"]:
                    del groups[gid]
        _LOGGER.info("Rodina: chore deleted (actor=%s)", context.user_id)
        await store.async_save()
    return {"deleted": deleted}


async def _skip_chore_today(
    hass: HomeAssistant,
    store: FamilySwapStore,
    cfg: str,
    row: dict[str, Any],
    kids: list[dict[str, Any]],
    msg: dict[str, Any],
    context: Any,
    actor: str,
) -> dict[str, Any]:
    original_due = row["due"]
    tz = ZoneInfo(hass.config.time_zone)
    assignee = {"user_name": row["user_name"]} if row["independent"] else {}
    if undo_id := msg.get("undo_request_id"):
        previous = store.dedupe_lookup(undo_id) or {}
        undo = previous.get("result", {}).get("undo")
        if (
            not undo
            or undo["identity"] != [cfg, row["id"], row["name"]]
            or undo["next_due"] != original_due
            or previous["payload"]["actor"] != actor
            or previous["payload"]["kid"] != msg["kid"]
            or previous["payload"]["chore"] != msg["chore"]
            or row["state"] != "todo"
            or len(row["assignees"]) != 1
            or not chore_management.future_due(undo["due"], dt_util.now(), tz)
        ):
            return {"error": "restore_failed"}
        service = "set_chore_due_date"
        data = {"chore_name": row["name"], "due_date": undo["due"]}
    else:
        if not chore_management.can_skip(row):
            return {"error": "unsupported_chore"}
        if msg.get("expected_due") != original_due:
            return {"error": "conflict"}
        service = "skip_chore_due_date"
        data = {"chore_id": row["id"]} if row["id"] else {"chore_name": row["name"]}
        data["mark_as_missed"] = False

    try:
        await choreops_adapter.call_choreops(
            hass,
            "choreops",
            service,
            {"config_entry_id": cfg, **data, **assignee},
            context=context,
        )
    except Exception:  # noqa: BLE001 - surface the operation outcome through WS
        return {"error": "restore_failed" if undo_id else "service_failed"}
    _LOGGER.info("Rodina: %s (actor=%s)", service, context.user_id)
    if undo_id:
        del previous["result"]["undo"]
        return {"ok": True}

    result: dict[str, Any] = {"ok": True}
    if (
        row["state"] == "todo"
        and len(row["assignees"]) == 1
        and chore_management.future_due(original_due, dt_util.now(), tz)
    ):
        refreshed = chore_management.catalog(hass, cfg, kids).get((msg["kid"], msg["chore"]))
        if refreshed and refreshed["due"] and refreshed["due"] != original_due:
            result["undo"] = {
                "identity": [cfg, row["id"], row["name"]],
                "due": original_due,
                "next_due": refreshed["due"],
            }
    return result


async def _manage_chore(
    hass: HomeAssistant, connection: Any, msg: dict[str, Any], *, action: str
) -> None:
    _require_adult(_role(hass, connection))
    store = _store(hass)
    actor = str(getattr(connection.user, "id", "") or "")
    request_id = msg["client_request_id"]
    payload = {key: value for key, value in msg.items() if key != "id"}
    payload.update(action=action, actor=actor)
    previous = store.dedupe_lookup(request_id)
    if previous:
        result = previous["result"] if previous["payload"] == payload else {"error": "conflict"}
    else:
        cfg = choreops_adapter.config_entry_id(hass)
        if not cfg:
            return _send_management_result(connection, msg, {"error": "not_configured"})
        kids = model.discover_kids(hass.states.async_all(), family_options(hass))
        rows = chore_management.catalog(hass, cfg, kids)
        row = rows.get((msg["kid"], msg["chore"]))
        if not row:
            return _send_management_result(connection, msg, {"error": "not_found"})
        # Persist the intent before invoking ChoreOps. A replay after interruption
        # has an uncertain outcome and must never skip the next occurrence.
        store.remember_dedupe(request_id, payload, {"error": "conflict"})
        await store.async_save()
        context = connection.context(msg)
        if action == "delete":
            result = await _delete_chore(hass, store, cfg, row, rows, msg, context)
        else:
            result = await _skip_chore_today(hass, store, cfg, row, kids, msg, context, actor)
        store.remember_dedupe(request_id, payload, result)
        await store.async_save()

    if "undo" in result:
        result = {"ok": True, "can_undo": True}
    _send_management_result(connection, msg, result)


@websocket_api.websocket_command(
    {
        vol.Required("type"): "homebrain/family/chore/skip_today",
        **CHORE_MANAGEMENT_SCHEMA,
        vol.Optional("expected_due"): vol.All(str, vol.Length(min=1, max=64)),
        vol.Optional("undo_request_id"): vol.All(str, vol.Length(min=8, max=64)),
    }
)
@websocket_api.async_response
@_serialize_mutation
async def websocket_family_chore_skip_today(
    hass: HomeAssistant, connection: Any, msg: dict[str, Any]
) -> None:
    await _manage_chore(hass, connection, msg, action="skip_today")


@websocket_api.websocket_command(
    {
        vol.Required("type"): "homebrain/family/chore/delete",
        **CHORE_MANAGEMENT_SCHEMA,
        vol.Optional("series_ids"): vol.All(
            [vol.All(str, vol.Length(min=1, max=64))], vol.Length(min=2, max=64)
        ),
    }
)
@websocket_api.async_response
@_serialize_mutation
async def websocket_family_chore_delete(
    hass: HomeAssistant, connection: Any, msg: dict[str, Any]
) -> None:
    await _manage_chore(hass, connection, msg, action="delete")


CHORE_MANAGEMENT_COMMANDS: Final = (
    websocket_family_chore_skip_today,
    websocket_family_chore_delete,
)
