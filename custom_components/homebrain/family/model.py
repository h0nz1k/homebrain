"""Pure discovery and payload building for Rodina (no I/O, no service calls).

* calendars: bindings ``family_calendar_family``/``family_calendar_school`` win; otherwise
  calendars that look like a family/school calendar (name heuristics). Integration-owned
  calendars (ChoreOps schedules, Mealie meal plans, waste collection) are never picked.
* shopping list: binding ``family_todo_shared`` or the ``family.shopping`` option, else the
  first ``todo.*`` entity.
* kids: ChoreOps dashboard helper sensors (``purpose_dashboard_helper``) – one per assignee.
"""

from __future__ import annotations

import re
from collections.abc import Callable, Iterable, Mapping
from typing import Any, Final

from homeassistant.util import slugify

from . import points_model

PURPOSE_HELPER: Final = "purpose_dashboard_helper"
PURPOSE_POINTS: Final = "purpose_points"
DONE_STATES: Final = frozenset(
    {"approved", "approved_in_part", "completed", "completed_in_part", "completed_by_other"}
)
CLAIMED_STATES: Final = frozenset({"claimed", "claimed_in_part"})
OVERDUE_STATES: Final = frozenset({"overdue", "missed"})
_FAMILY_RE: Final = re.compile(r"rodin|famil|kroužk|kruzk", re.IGNORECASE)
_SCHOOL_RE: Final = re.compile(r"škol|skol|school|rozvrh", re.IGNORECASE)
_FOREIGN_RE: Final = re.compile(r"mealie|choreops|odpad|waste", re.IGNORECASE)
PRIVATE_EVENT_FIELDS: Final = ("location", "description")
DETAIL_ROLES: Final = frozenset({"owner", "adult"})


def _name(state: Any) -> str:
    return str(state.attributes.get("friendly_name") or state.entity_id)


def _float(value: Any) -> float | None:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def family_calendars(
    states: Iterable[Any], bindings: Mapping[str, Any], opts: Mapping[str, Any]
) -> list[dict[str, str]]:
    """Calendars shown in Rodina, in display order (family first, then school)."""
    names = {s.entity_id: _name(s) for s in states if s.entity_id.startswith("calendar.")}
    chosen = opts.get("calendars")
    if isinstance(chosen, list) and chosen:
        return [
            {
                "entity_id": c["entity_id"],
                "name": names.get(c["entity_id"], c["entity_id"]),
                "kind": c.get("kind", "family"),
            }
            for c in chosen
            if isinstance(c, Mapping) and c.get("entity_id")
        ]
    bound = [
        (bindings.get(key), kind)
        for key, kind in (
            ("family_calendar_family", "family"),
            ("family_calendar_school", "school"),
        )
    ]
    if any(eid for eid, _ in bound):
        return [
            {"entity_id": eid, "name": names.get(eid, eid), "kind": kind}
            for eid, kind in bound
            if eid
        ]
    found: list[dict[str, str]] = []
    for state in states:
        eid = state.entity_id
        if not eid.startswith("calendar.") or state.attributes.get("purpose"):
            continue
        text = f"{eid} {_name(state)}"
        if _FOREIGN_RE.search(text):
            continue
        if _SCHOOL_RE.search(text):
            found.append({"entity_id": eid, "name": _name(state), "kind": "school"})
        elif _FAMILY_RE.search(text):
            found.append({"entity_id": eid, "name": _name(state), "kind": "family"})
    return sorted(found, key=lambda c: (c["kind"] != "family", c["entity_id"]))


def shopping_entity(
    states: Iterable[Any], bindings: Mapping[str, Any], opts: Mapping[str, Any]
) -> str | None:
    if eid := bindings.get("family_todo_shared") or opts.get("shopping"):
        return str(eid)
    todos = sorted(s.entity_id for s in states if s.entity_id.startswith("todo."))
    return todos[0] if todos else None


def discover_kids(states: Iterable[Any], opts: Mapping[str, Any]) -> list[dict[str, Any]]:
    """ChoreOps assignees (children) with their helper/points sensors and mapped HA user."""
    users = {
        str(k.get("name")): k.get("user_id")
        for k in opts.get("kids") or []
        if isinstance(k, Mapping) and k.get("name")
    }
    points_by_name: dict[str, str] = {}
    helpers: dict[str, str] = {}
    for state in states:
        purpose = state.attributes.get("purpose")
        name = state.attributes.get("user_name")
        if not name:
            continue
        if purpose == PURPOSE_HELPER:
            helpers[str(name)] = state.entity_id
            core = state.attributes.get("core_sensors")
            if isinstance(core, Mapping) and core.get("points_eid"):
                points_by_name.setdefault(str(name), str(core["points_eid"]))
        elif purpose == PURPOSE_POINTS:
            points_by_name[str(name)] = state.entity_id
    return [
        {
            "id": slugify(name),
            "kid_uuid": str(users.get(name) or slugify(name)),
            "name": name,
            "helper_entity": helper,
            "points_entity": points_by_name.get(name),
            "user_id": users.get(name),
        }
        for name, helper in sorted(helpers.items())
    ]


def _swap_block_reason(attrs: Mapping[str, Any]) -> str | None:
    crit = str(attrs.get("completion_criteria") or attrs.get("criteria") or "independent")
    if crit != "independent":
        return "Společný úkol zatím nelze předat."
    freq = str(attrs.get("frequency") or attrs.get("recurrence") or "")
    if freq.startswith("rotation") or freq in {"shared_first", "shared_all"}:
        if freq.startswith("rotation"):
            return "Střídání upravuje rodič v ChoreOps."
        return "Společný úkol zatím nelze předat."
    if freq in {"none", "daily_multi", ""} and crit != "independent":
        return "Tento úkol nelze dnes předat."
    return None


def _enrich_chore_row(row: Mapping[str, Any], sensor: Any, kid: Mapping[str, Any]) -> dict[str, Any]:
    attrs = sensor.attributes if sensor else {}
    state = _chore_state(str(row.get("state") or ""))
    block = _swap_block_reason(attrs)
    raw = str(row.get("state") or "")
    can_swap = (
        block is None
        and row.get("primary_group") == "today"
        and state in ("todo", "overdue")
        and raw not in DONE_STATES
        and raw not in CLAIMED_STATES
    )
    return {
        "id": str(row.get("eid") or row["name"]),
        "opaque_id": str(row.get("eid") or row["name"]),
        "chore_uuid": str(attrs.get("chore_id") or attrs.get("id") or row.get("eid") or ""),
        "name": str(row["name"]),
        "state": state,
        "points": _float(attrs.get("default_points", attrs.get("points"))),
        "due": attrs.get("due_date") if isinstance(attrs.get("due_date"), str) else None,
        "can_request_swap": can_swap,
        "swap_unavailable_reason": block,
        "kid_uuid": kid.get("kid_uuid") or kid["id"],
    }


def apply_swap_overlays(
    chores: list[dict[str, Any]],
    *,
    kid: Mapping[str, Any],
    store_data: Mapping[str, Any],
    kids_by_uuid: Mapping[str, Mapping[str, Any]],
) -> list[dict[str, Any]]:
    """Decorate chore rows with today-only swap badges from Store."""
    requests = store_data.get("requests") or {}
    operations = store_data.get("operations") or {}
    kid_uuid = str(kid.get("kid_uuid") or kid["id"])
    out: list[dict[str, Any]] = []
    for chore in chores:
        row = dict(chore)
        row["swap_today"] = None
        for req in requests.values():
            if not isinstance(req, Mapping):
                continue
            if req.get("status") == "pending" and req.get("source_chore_id") == chore.get(
                "opaque_id"
            ):
                if req.get("from_kid_id") == kid_uuid:
                    to = kids_by_uuid.get(str(req.get("to_kid_id") or ""), {})
                    row["swap_today"] = {
                        "kind": "pending_give",
                        "label": "Čeká na předání",
                        "partner_name": to.get("name"),
                    }
        for op in operations.values():
            if not isinstance(op, Mapping) or op.get("status") not in {"applying", "active"}:
                continue
            snap = op.get("source_snapshot") or {}
            if snap.get("chore_id") != chore.get("chore_uuid") and snap.get("chore_id") != chore.get(
                "opaque_id"
            ):
                continue
            if op.get("from_kid_id") == kid_uuid:
                to = kids_by_uuid.get(str(op.get("to_kid_id") or ""), {})
                row["swap_today"] = {
                    "kind": "transferred_out",
                    "label": f"Dnes {to.get('name', 'někdo')}",
                    "muted": True,
                }
                row["counts_today"] = False
            elif op.get("to_kid_id") == kid_uuid and op.get("clone_id"):
                from_k = kids_by_uuid.get(str(op.get("from_kid_id") or ""), {})
                row["swap_today"] = {
                    "kind": "transferred_in",
                    "label": f"za {from_k.get('name', 'někdo')}",
                }
        out.append(row)
    return out


def pending_approvals(snapshot: Mapping[str, Any], store_data: Mapping[str, Any]) -> list[dict[str, Any]]:
    """Unified parent queue: completion claims + swap requests."""
    items: list[dict[str, Any]] = []
    for kid in snapshot.get("kids") or []:
        for chore in kid.get("chores") or []:
            if chore.get("can_approve"):
                items.append(
                    {
                        "kind": "completion",
                        "type_label": "Hotovo ke kontrole",
                        "kid_id": kid["id"],
                        "kid_name": kid["name"],
                        "chore_id": chore["id"],
                        "chore_name": chore["name"],
                        "points": chore.get("points"),
                        "due": chore.get("due"),
                    }
                )
    for req in (store_data.get("requests") or {}).values():
        if isinstance(req, Mapping) and req.get("status") == "pending":
            items.append(
                {
                    "kind": "swap",
                    "type_label": "Předání na dnes",
                    "request_id": req.get("id"),
                    "from_kid_id": req.get("from_kid_id"),
                    "to_kid_id": req.get("to_kid_id"),
                    "chore_id": req.get("source_chore_id"),
                    "revision": req.get("revision"),
                }
            )
    return items


def validate_create_chore_fields(msg: Mapping[str, Any]) -> dict[str, Any]:
    name = str(msg.get("name") or "").strip()
    if not name or len(name) > 80:
        raise ValueError("name")
    points = _float(msg.get("points"))
    if points is None or points < 0 or points > 1000:
        raise ValueError("points")
    assignees = msg.get("assignees")
    if not isinstance(assignees, list) or not assignees:
        raise ValueError("assignees")
    recurrence = msg.get("recurrence")
    if recurrence not in {"once", "daily", "weekly"}:
        raise ValueError("recurrence")
    return {
        "name": name,
        "points": points,
        "assignees": [str(a) for a in assignees],
        "recurrence": recurrence,
        "weekdays": msg.get("weekdays") or [],
        "first_date": str(msg.get("first_date") or ""),
        "due_time": str(msg.get("due_time") or ""),
        "icon": msg.get("icon"),
        "client_request_id": str(msg.get("client_request_id") or ""),
    }


def _chore_state(raw: str) -> str:
    if raw in DONE_STATES:
        return "done"
    if raw in CLAIMED_STATES:
        return "claimed"
    if raw in OVERDUE_STATES:
        return "overdue"
    return "todo"


def kid_chores(get_state: Callable[[str], Any], kid: Mapping[str, Any]) -> list[dict[str, Any]]:
    """Today's chores of one kid (ChoreOps ``today`` group + anything waiting for approval)."""
    helper = get_state(kid["helper_entity"])
    rows = helper.attributes.get("chores") if helper else None
    out: list[dict[str, Any]] = []
    for row in rows if isinstance(rows, list) else []:
        if not isinstance(row, Mapping) or not row.get("name"):
            continue
        state = _chore_state(str(row.get("state") or ""))
        if row.get("primary_group") != "today" and state != "claimed":
            continue
        sensor = get_state(row["eid"]) if row.get("eid") else None
        out.append(_enrich_chore_row(row, sensor, kid))
    return out


def kid_payload(
    get_state: Callable[[str], Any],
    kid: Mapping[str, Any],
    role: str,
    own: bool,
    *,
    store_data: Mapping[str, Any] | None = None,
    kids_by_uuid: Mapping[str, Mapping[str, Any]] | None = None,
    include_points_detail: bool = False,
) -> dict[str, Any]:
    points_state = get_state(kid["points_entity"]) if kid.get("points_entity") else None
    claim = role in ("owner", "adult", "kiosk") or (role == "child" and own)
    approve = role in ("owner", "adult")
    chores = kid_chores(get_state, kid)
    if store_data and kids_by_uuid:
        chores = apply_swap_overlays(chores, kid=kid, store_data=store_data, kids_by_uuid=kids_by_uuid)
    chores = [
        {
            **c,
            "can_claim": claim
            and c["state"] in ("todo", "overdue")
            and not (c.get("swap_today") or {}).get("muted"),
            "can_approve": approve and c["state"] == "claimed",
        }
        for c in chores
    ]
    balance = _float(points_state.state) if points_state else None
    payload: dict[str, Any] = {
        "id": kid["id"],
        "kid_uuid": kid.get("kid_uuid") or kid["id"],
        "name": kid["name"],
        "points": balance,
        "points_today": _float(points_state.attributes.get("point_stat_points_earned_today"))
        if points_state
        else None,
        "chores": chores,
    }
    if include_points_detail and points_state:
        attrs = dict(points_state.attributes)
        payload["points_summary"] = points_model.build_points_summary(
            attrs, kid_name=kid["name"], balance=balance
        )
    swap_labels = [c["swap_today"]["label"] for c in chores if c.get("swap_today")]
    if swap_labels:
        payload["swap_badge"] = swap_labels[0] if len(swap_labels) == 1 else f"Dnes {len(swap_labels)} předání"
    return payload


def build_events(
    raw: Mapping[str, list[Mapping[str, Any]]], calendars: list[dict[str, str]], role: str
) -> list[dict[str, Any]]:
    """Merged, time-sorted events; place/notes only for owner/adult (FAM-017)."""
    meta = {c["entity_id"]: c for c in calendars}
    out: list[dict[str, Any]] = []
    for eid, events in raw.items():
        cal = meta.get(eid, {"name": eid, "kind": "family"})
        for i, ev in enumerate(events):
            start = str(ev.get("start") or "")
            if not start:
                continue
            item = {
                "id": f"{eid}#{i}",
                "calendar": eid,
                "source": cal.get("name", eid),
                "kind": cal.get("kind", "family"),
                "summary": str(ev.get("summary") or "Událost"),
                "start": start,
                "end": str(ev.get("end") or start),
                "all_day": len(start) == 10,
            }
            if role in DETAIL_ROLES:
                for key in PRIVATE_EVENT_FIELDS:
                    if ev.get(key):
                        item[key] = str(ev[key])
            out.append(item)
    return sorted(out, key=lambda e: (e["start"][:10], not e["all_day"], e["start"]))
