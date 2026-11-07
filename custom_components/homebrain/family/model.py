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
            "name": name,
            "helper_entity": helper,
            "points_entity": points_by_name.get(name),
            "user_id": users.get(name),
        }
        for name, helper in sorted(helpers.items())
    ]


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
        attrs = sensor.attributes if sensor else {}
        points = _float(attrs.get("default_points", attrs.get("points")))
        out.append(
            {
                "id": str(row.get("eid") or row["name"]),
                "name": str(row["name"]),
                "state": state,
                "points": points,
                "due": attrs.get("due_date") if isinstance(attrs.get("due_date"), str) else None,
            }
        )
    return out


def kid_payload(
    get_state: Callable[[str], Any], kid: Mapping[str, Any], role: str, own: bool
) -> dict[str, Any]:
    points_state = get_state(kid["points_entity"]) if kid.get("points_entity") else None
    claim = role in ("owner", "adult", "kiosk") or (role == "child" and own)
    approve = role in ("owner", "adult")
    chores = [
        {
            **c,
            "can_claim": claim and c["state"] in ("todo", "overdue"),
            "can_approve": approve and c["state"] == "claimed",
        }
        for c in kid_chores(get_state, kid)
    ]
    return {
        "id": kid["id"],
        "name": kid["name"],
        "points": _float(points_state.state) if points_state else None,
        "points_today": _float(points_state.attributes.get("point_stat_points_earned_today"))
        if points_state
        else None,
        "chores": chores,
    }


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
