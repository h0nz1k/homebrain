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
from datetime import date, datetime, time, timedelta
from typing import Any, Final

import voluptuous as vol
from homeassistant.util import dt as dt_util
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
_TIME_RE: Final = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")
RECURRENCES: Final = ("once", "daily", "daily_multi", "weekly")
MULTI_TIMES: Final = (2, 6)


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


def discover_members(states: Iterable[Any], opts: Mapping[str, Any]) -> list[dict[str, Any]]:
    """Discover ChoreOps assignees, including adults, and preserve legacy public IDs."""
    users = {
        str(k.get("name")): k.get("user_id")
        for k in opts.get("kids") or []
        if isinstance(k, Mapping) and k.get("name")
    }
    points_by_name: dict[str, str] = {}
    helpers: dict[str, Any] = {}
    people: dict[str, list[Any]] = {}
    profiles = {p["choreops_user_id"]: p for p in opts.get("persons") or []}
    for state in states:
        if state.entity_id.startswith("person."):
            people.setdefault(_name(state).strip().casefold(), []).append(state)
        purpose = state.attributes.get("purpose")
        name = state.attributes.get("user_name")
        if not name:
            continue
        if (
            purpose == PURPOSE_HELPER
            and state.attributes.get("chore_workflow_enabled") is not False
        ):
            helpers[str(name)] = state
            core = state.attributes.get("core_sensors")
            if isinstance(core, Mapping) and core.get("points_eid"):
                points_by_name.setdefault(str(name), str(core["points_eid"]))
        elif purpose == PURPOSE_POINTS:
            points_by_name[str(name)] = state.entity_id
    members = []
    for index, (name, helper) in enumerate(sorted(helpers.items())):
        public_id = slugify(name)
        choreops_id = str(helper.attributes.get("user_id") or public_id)
        profile = profiles.get(choreops_id, {})
        matches = people.get(name.strip().casefold(), [])
        person = (
            profile.get("person")
            if profile
            else (matches[0].entity_id if len(matches) == 1 else None)
        )
        members.append(
            {
                "id": public_id,
                "kid_uuid": str(users.get(name) or public_id),
                "choreops_user_id": choreops_id,
                "name": name,
                "helper_entity": helper.entity_id,
                "points_entity": points_by_name.get(name),
                "user_id": users.get(name) or profile.get("user_id"),
                "role": profile.get("role", "child"),
                "color": profile.get("color", index % 4 + 1),
                "person": person,
                "configured": bool(profile),
                "tracker": profile.get("tracker"),
            }
        )
    return members


def discover_kids(states: Iterable[Any], opts: Mapping[str, Any]) -> list[dict[str, Any]]:
    """Child-only handover workflow."""
    return [m for m in discover_members(states, opts) if m["role"] == "child"]


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


def _enrich_chore_row(
    row: Mapping[str, Any], sensor: Any, kid: Mapping[str, Any]
) -> dict[str, Any]:
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
        "can_request_swap": can_swap and kid.get("role", "child") == "child",
        "claim_allowed": attrs.get("can_claim") is not False,
        "shared_first": attrs.get("completion_criteria") == "shared_first",
        "shared_taken": bool(attrs.get("claimed_by") or attrs.get("completed_by")),
        "raw_state": raw,
        "frequency": attrs.get("recurring_frequency"),
        "rotation_turn": attrs.get("turn_user_name"),
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
                        "label": "Předání čeká na schválení",
                        "partner_name": to.get("name"),
                    }
        for op in operations.values():
            if not isinstance(op, Mapping) or op.get("status") != "active":
                continue
            snap = op.get("source_snapshot") or {}
            chore_uuid = chore.get("chore_uuid")
            opaque = chore.get("opaque_id")
            source_matches = snap.get("chore_id") in {chore_uuid, opaque, chore.get("id")}
            clone_matches = op.get("clone_id") is not None and op.get("clone_id") in {
                chore_uuid,
                opaque,
                chore.get("id"),
            }
            if op.get("from_kid_id") == kid_uuid and source_matches:
                to = kids_by_uuid.get(str(op.get("to_kid_id") or ""), {})
                row["swap_today"] = {
                    "kind": "transferred_out",
                    "label": f"Předáno: {to.get('name', 'někdo')} · jen dnes",
                    "partner_name": to.get("name"),
                    "muted": True,
                }
                row["counts_today"] = False
            elif op.get("to_kid_id") == kid_uuid and clone_matches:
                from_k = kids_by_uuid.get(str(op.get("from_kid_id") or ""), {})
                row["swap_today"] = {
                    "kind": "transferred_in",
                    "label": f"Převzato od: {from_k.get('name', 'někdo')} · jen dnes",
                    "partner_name": from_k.get("name"),
                }
        out.append(row)
    return out


def pending_approvals(
    snapshot: Mapping[str, Any], store_data: Mapping[str, Any]
) -> list[dict[str, Any]]:
    """Unified parent queue: completion claims + swap requests."""
    items: list[dict[str, Any]] = []
    for kid in snapshot.get("kids") or []:
        for chore in kid.get("chores") or []:
            if (
                chore.get("can_approve")
                and (chore.get("swap_today") or {}).get("kind") != "pending_give"
            ):
                items.append(
                    {
                        "kind": "completion",
                        "type_label": "Splnění ke kontrole",
                        "kid_id": kid["id"],
                        "kid_name": kid["name"],
                        "chore_id": chore["id"],
                        "chore_name": chore["name"],
                        "points": chore.get("points"),
                        "due": chore.get("due"),
                    }
                )
    kids = snapshot.get("kids") or []
    by_uuid = {str(k.get("kid_uuid") or k["id"]): k for k in kids}
    for req in (store_data.get("requests") or {}).values():
        if isinstance(req, Mapping) and req.get("status") == "pending":
            original = by_uuid.get(str(req.get("from_kid_id")), {})
            source = next(
                (
                    c
                    for c in original.get("chores", [])
                    if req.get("source_chore_id")
                    in {c.get("id"), c.get("opaque_id"), c.get("chore_uuid")}
                ),
                {},
            )
            requester = by_uuid.get(str(req.get("requester_user_id")), {})
            items.append(
                {
                    "kind": "swap",
                    "type_label": "Předání na dnes",
                    "request_id": req.get("id"),
                    "requester_name": (
                        req.get("requester_name") or requester.get("name") or original.get("name")
                    ),
                    "chore_name": source.get("name"),
                    "points": source.get("points"),
                    "due": source.get("due"),
                    "from_kid_id": req.get("from_kid_id"),
                    "to_kid_id": req.get("to_kid_id"),
                    "chore_id": req.get("source_chore_id"),
                    "revision": req.get("revision"),
                }
            )
    return items


def _slot_name(name: str, time: str) -> str:
    return f"{name} ({time})"


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
    if recurrence not in RECURRENCES:
        raise ValueError("recurrence")
    times: list[str] = []
    if recurrence == "daily_multi":
        raw = msg.get("times")
        if not isinstance(raw, list) or not all(isinstance(t, str) for t in raw):
            raise ValueError("times")
        times = sorted(set(raw))
        lo, hi = MULTI_TIMES
        if len(times) != len(raw) or not lo <= len(times) <= hi:
            raise ValueError("times")
        if not all(_TIME_RE.match(t) for t in times):
            raise ValueError("times")
        if len(_slot_name(name, times[0])) > 80:
            raise ValueError("name")
    return {
        "name": name,
        "points": points,
        "assignees": [str(a) for a in assignees],
        "recurrence": recurrence,
        "weekdays": msg.get("weekdays") or [],
        "first_date": str(msg.get("first_date") or ""),
        "due_time": str(msg.get("due_time") or ""),
        "times": times,
        "icon": msg.get("icon"),
        "client_request_id": str(msg.get("client_request_id") or ""),
    }


def plan_create_chores(
    fields: Mapping[str, Any], *, config_entry_id: str, user_names: list[str], now: datetime
) -> list[dict[str, Any]]:
    """``choreops.create_chore`` payloads for one Rodina „Přidat úkol“ submit.

    ``daily_multi`` („Vícekrát denně“): ChoreOps 1.6 ``create_chore`` accepts neither the
    ``daily_multi`` frequency nor ``daily_multi_times`` (Options flow only), so each time of
    the day becomes its own daily chore „<název> (12:00)“. Every slot is a separate claim
    with its own points and approval, resets at midnight like any daily chore and stays
    visible in today's list with its own deadline. A slot already past on the first day
    starts the next day (ChoreOps rejects due dates in the past).
    """
    base: dict[str, Any] = {
        "config_entry_id": config_entry_id,
        "points": fields["points"],
        "assigned_user_names": user_names,
        "completion_criteria": "independent",
        "auto_approve": False,
        "pending_claims": "hold_pending",
    }
    if fields.get("icon"):
        base["icon"] = fields["icon"]
    first = date.fromisoformat(fields["first_date"])
    if fields["recurrence"] == "daily_multi":
        out = []
        for slot in fields["times"]:
            hour, minute = (int(x) for x in slot.split(":"))
            due = datetime.combine(first, time(hour, minute), tzinfo=now.tzinfo)
            if due <= now:
                due += timedelta(days=1)
            out.append(
                {
                    **base,
                    "name": _slot_name(fields["name"], slot),
                    "frequency": "daily",
                    "due_date": due.replace(tzinfo=None).isoformat(timespec="seconds"),
                    "approval_reset_type": "at_midnight_once",
                }
            )
        return out
    freq = {"once": "none", "daily": "daily", "weekly": "weekly"}[fields["recurrence"]]
    data = {
        **base,
        "name": fields["name"],
        "frequency": freq,
        "due_date": f"{fields['first_date']}T{fields['due_time']}:00",
        "approval_reset_type": "at_midnight_once" if freq != "none" else "manual",
    }
    if fields["recurrence"] == "weekly" and fields["weekdays"]:
        data["applicable_days"] = fields["weekdays"]
    return [data]


# ChoreOps raises HomeAssistantError(translation_key=…); str(err) is the bare key.
_CREATE_ERRORS: Final = {
    "duplicate_chore": "duplicate_name",
    "invalid_chore_name": "invalid_input",
    "invalid_points": "invalid_input",
    "invalid_due_date": "invalid_input",
    "due_date_in_past": "due_in_past",
    "not_found": "invalid_input",
    "missing_field": "invalid_input",
    "error_msg_no_entry_found": "not_configured",
    "service_target_ambiguous": "not_configured",
    "service_target_title_not_found": "not_configured",
}
CREATE_ERROR_MESSAGES: Final = {
    "duplicate_name": "Úkol s tímto názvem už existuje.",
    "due_in_past": "Termín už minul.",
    "invalid_input": "Neplatná data formuláře",
    "not_configured": "ChoreOps není nastaven",
    "service_failed": "Úkol se nepodařilo uložit.",
}


def create_error_code(err: BaseException) -> str:
    """Stable Rodina error code for a failed ``create_chore`` (never the raw ChoreOps text)."""
    key = getattr(err, "translation_key", None) or str(err).strip()
    if key in _CREATE_ERRORS:
        return _CREATE_ERRORS[key]
    if isinstance(err, vol.Invalid):
        return "invalid_input"
    return "service_failed"


def _chore_state(raw: str) -> str:
    if raw in DONE_STATES:
        return "done"
    if raw in CLAIMED_STATES:
        return "claimed"
    if raw in OVERDUE_STATES:
        return "overdue"
    return "todo"


def _helper_rows(get_state: Callable[[str], Any], member: Mapping[str, Any]) -> list[Any]:
    helper = get_state(member["helper_entity"])
    if not helper:
        return []
    attrs = helper.attributes
    rows = attrs.get("chores") or []
    refs = (attrs.get("dashboard_helpers") or {}).get("chore_helper_eids") or []
    if not refs:
        return rows if isinstance(rows, list) else []
    return [
        row
        for eid in refs
        if (shard := get_state(eid))
        for row in shard.attributes.get("chores", [])
    ]


def kid_chores(get_state: Callable[[str], Any], kid: Mapping[str, Any]) -> list[dict[str, Any]]:
    """Today's chores of one kid (ChoreOps ``today`` group + anything waiting for approval)."""
    out: list[dict[str, Any]] = []
    for row in _helper_rows(get_state, kid):
        if not isinstance(row, Mapping) or not row.get("name"):
            continue
        state = _chore_state(str(row.get("state") or ""))
        sensor = get_state(row["eid"]) if row.get("eid") else None
        attrs = sensor.attributes if sensor else {}
        shared = attrs.get("completion_criteria") == "shared_first"
        if (
            row.get("primary_group") != "today"
            and state not in ("claimed", "overdue")
            and not shared
        ):
            continue
        out.append(_enrich_chore_row(row, sensor, kid))
    return out


UPCOMING_GROUPS: Final = ("this_week", "other")
UPCOMING_LIMIT: Final = 8


def kid_upcoming(
    get_state: Callable[[str], Any], kid: Mapping[str, Any], *, limit: int | None = UPCOMING_LIMIT
) -> list[dict[str, Any]]:
    """Planned chores of later days (ChoreOps ``this_week`` / ``other`` groups).

    A new chore due tomorrow lands in ``this_week``; without this list it was invisible in
    Rodina and looked as if it had not been saved. Rows are read-only (ChoreOps does not
    allow claiming before the due window), sorted by due date, dated rows first.
    """
    out: list[dict[str, Any]] = []
    for row in _helper_rows(get_state, kid):
        if not isinstance(row, Mapping) or not row.get("name"):
            continue
        group = row.get("primary_group")
        state = _chore_state(str(row.get("state") or ""))
        if group not in UPCOMING_GROUPS or state in ("done", "claimed"):
            continue
        sensor = get_state(row["eid"]) if row.get("eid") else None
        attrs = sensor.attributes if sensor else {}
        due = attrs.get("due_date") if isinstance(attrs.get("due_date"), str) else None
        if attrs.get("completion_criteria") == "shared_first" or attrs.get("claim_mode") in (
            "blocked_not_my_turn",
            "blocked_standby",
            "blocked_paused",
        ):
            continue
        item: dict[str, Any] = {
            "id": str(row.get("eid") or row["name"]),
            "name": str(row["name"]),
            "points": _float(attrs.get("default_points", attrs.get("points"))),
            "due": due,
            "group": group,
        }
        out.append(item)
    out.sort(key=lambda r: (r["due"] is None, r["due"] or "", r["name"]))
    return out[:limit]


def last_approvals(
    get_state: Callable[[str], Any], member: Mapping[str, Any]
) -> list[dict[str, Any]]:
    """Chore status also records approvals without a points transaction."""
    entries = []
    for row in _helper_rows(get_state, member):
        if not isinstance(row, Mapping) or not row.get("eid") or not row.get("name"):
            continue
        sensor = get_state(row["eid"])
        if not sensor:
            continue
        stamp = sensor.attributes.get("last_approved")
        if isinstance(stamp, str) and stamp:
            entries.append({"name": str(row["name"]), "date": stamp, "points": None})
    return entries


def chore_date(value: str | None, now: datetime) -> date | None:
    if not value or not (stamp := dt_util.parse_datetime(value)):
        return None
    return (stamp.astimezone(now.tzinfo) if stamp.tzinfo else stamp).date()


def partition_chores(rows: list[dict[str, Any]], now: datetime) -> tuple[list, list, list]:
    """Use civil days so the three-day window also works across clock changes."""
    today, missed, free = [], [], []
    for row in rows:
        if row["raw_state"] == "completed_by_other":
            continue
        due_day = chore_date(row["due"], now)
        age = (now.date() - due_day).days if due_day else 0
        expired = row["raw_state"] == "missed" or (
            row["state"] == "overdue"
            and age > 3
            and row["frequency"] not in ("custom_from_complete", "custom_from_complete_date_only")
        )
        if expired:
            if not row["shared_first"]:
                missed.append({"id": row["id"], "name": row["name"], "date": row["due"]})
            continue
        if row["shared_first"] and row["state"] in ("todo", "overdue"):
            if not row["shared_taken"] and row["raw_state"] != "paused":
                free.append(row)
            continue
        if age > 0 and row["state"] == "overdue":
            row = {**row, "carried_days": age}
        today.append(row)
    return today, missed, free


def chore_counts(chores: list[dict[str, Any]]) -> dict[str, int]:
    rows = [c for c in chores if c.get("counts_today") is not False]
    done = sum(c["state"] == "done" for c in rows)
    pending = sum(c["state"] == "claimed" for c in rows)
    return {
        "total": len(rows),
        "done": done,
        "pending": pending,
        "open": len(rows) - done - pending,
    }


def kid_payload(
    get_state: Callable[[str], Any],
    kid: Mapping[str, Any],
    role: str,
    own: bool,
    *,
    store_data: Mapping[str, Any] | None = None,
    kids_by_uuid: Mapping[str, Mapping[str, Any]] | None = None,
    include_points_detail: bool = False,
    now: datetime | None = None,
) -> dict[str, Any]:
    points_state = get_state(kid["points_entity"]) if kid.get("points_entity") else None
    claim = role in ("owner", "adult", "kiosk") or (role == "child" and own)
    approve = role in ("owner", "adult")
    chores, missed, free = partition_chores(kid_chores(get_state, kid), now or dt_util.now())
    if store_data and kids_by_uuid:
        chores = apply_swap_overlays(
            chores, kid=kid, store_data=store_data, kids_by_uuid=kids_by_uuid
        )
    chores = [
        {
            **c,
            "can_claim": claim
            and c["state"] in ("todo", "overdue")
            and c["claim_allowed"]
            and not (c.get("swap_today") or {}).get("muted"),
            "can_approve": approve and c["state"] == "claimed",
        }
        for c in chores
    ]
    present = {c["id"] for c in chores}
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
        "upcoming": [u for u in kid_upcoming(get_state, kid, limit=None) if u["id"] not in present],
        "missed": missed,
        "free": [
            {
                **{k: c[k] for k in ("id", "name", "points", "due")},
                "can_claim": claim and c["claim_allowed"],
            }
            for c in free
        ],
        "points_week": _float(points_state.attributes.get("point_stat_points_earned_week"))
        if points_state
        else None,
        "counts": chore_counts(chores),
    }
    for row in payload["chores"]:
        for field in ("claim_allowed", "shared_first", "shared_taken", "raw_state", "frequency"):
            row.pop(field, None)
    if include_points_detail and points_state:
        attrs = dict(points_state.attributes)
        payload["points_summary"] = points_model.build_points_summary(
            attrs, kid_name=kid["name"], balance=balance
        )
    swap_labels = [c["swap_today"]["label"] for c in chores if c.get("swap_today")]
    if swap_labels:
        payload["swap_badge"] = (
            swap_labels[0] if len(swap_labels) == 1 else f"Dnes {len(swap_labels)} předání"
        )
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
