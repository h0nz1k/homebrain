"""ChoreOps occurrence and series metadata used by family management actions. Refs #123."""

from __future__ import annotations

import re
from collections.abc import Iterable, Mapping
from datetime import datetime
from typing import Any
from zoneinfo import ZoneInfo

from homeassistant.core import HomeAssistant

from . import choreops_adapter, model

_SLOT = re.compile(r"(.+) \(((?:[01][0-9]|2[0-3]):[0-5][0-9])\)$")


def catalog(
    hass: HomeAssistant, cfg: str, kids: list[dict[str, Any]]
) -> dict[tuple[str, str], dict[str, Any]]:
    """Read all ChoreOps helper rows, including slots beyond the upcoming display limit."""
    rows = {}
    for kid in kids:
        helper = hass.states.get(kid["helper_entity"])
        chores = helper.attributes.get("chores") if helper else None
        for row in chores if isinstance(chores, list) else []:
            if not isinstance(row, Mapping) or not row.get("name") or not row.get("eid"):
                continue
            eid = row["eid"]
            sensor = hass.states.get(eid)
            if not sensor or not choreops_adapter.matches_entry(hass, cfg, eid):
                continue
            attrs = sensor.attributes
            name = str(row["name"])
            slot = _SLOT.fullmatch(name)
            assigned = attrs.get("assigned_user_names")
            rows[kid["id"], eid] = {
                "id": choreops_adapter.chore_id(hass, cfg, eid),
                "name": name,
                "base": slot[1] if slot else name,
                "time": slot[2] if slot else None,
                "frequency": model.chore_frequency(attrs),
                "assignees": sorted(set(assigned)) if isinstance(assigned, (tuple, list)) else [],
                "user_name": kid["name"],
                "independent": attrs.get("completion_criteria", "independent") == "independent",
                "due": attrs.get("due_date") if isinstance(attrs.get("due_date"), str) else None,
                "today": row.get("primary_group") == "today",
                "state": model._chore_state(str(row.get("state") or "")),
            }

    # Older sensors without the assignee attribute are represented in each assignee's helper.
    by_chore: dict[str, set[str]] = {}
    for row in rows.values():
        key = row["id"] or row["name"]
        by_chore.setdefault(key, set()).add(row["user_name"])
    for row in rows.values():
        if not row["assignees"]:
            row["assignees"] = sorted(by_chore[row["id"] or row["name"]])
    return rows


def series(
    row: dict[str, Any],
    rows: Iterable[dict[str, Any]],
    groups: Mapping[str, dict[str, Any]],
    cfg: str,
) -> list[dict[str, Any]]:
    """Prefer the recorded group, otherwise match legacy slots with identical assignees."""
    if not row["id"]:
        return []
    stored_group = next(
        (
            group["chore_ids"]
            for group in groups.values()
            if group["config_entry_id"] == cfg and row["id"] in group["chore_ids"]
        ),
        None,
    )
    tracked_ids = {
        cid
        for group in groups.values()
        if group["config_entry_id"] == cfg
        for cid in group["chore_ids"]
    }
    matches = {}
    for candidate in rows:
        cid = candidate["id"]
        if not cid:
            continue
        if stored_group is not None:
            match = cid in stored_group
        else:
            match = (
                row["frequency"] == candidate["frequency"] == "daily"
                and row["time"] is not None
                and candidate["time"] is not None
                and row["base"] == candidate["base"]
                and row["assignees"] == candidate["assignees"]
                and cid not in tracked_ids
            )
        if match:
            matches[cid] = candidate
    matches[row["id"]] = row
    return sorted(matches.values(), key=lambda item: (item["time"] or "", item["name"]))


def can_skip(row: dict[str, Any]) -> bool:
    return bool(row["today"] and row["due"] and row["frequency"] not in {"", "none"})


def metadata(
    row: dict[str, Any],
    rows: Iterable[dict[str, Any]],
    groups: Mapping[str, dict[str, Any]],
    cfg: str,
) -> dict[str, Any]:
    slots = series(row, rows, groups, cfg)
    return {
        "id": row["id"],
        "one_off": row["frequency"] == "none",
        "can_skip": can_skip(row),
        "times_per_day": max(1, len(slots)) if row["frequency"] == "daily" else None,
        "assignees": row["assignees"],
        "series_name": row["base"] if len(slots) > 1 else row["name"],
        "time": row["time"],
        "slots": [
            {key: slot[key] for key in ("id", "name", "time", "assignees")} for slot in slots
        ],
    }


def future_due(due: str | None, now: datetime, tz: ZoneInfo) -> bool:
    if not due:
        return False
    try:
        parsed = datetime.fromisoformat(due)
    except ValueError:
        return False
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=tz)
    return parsed.timestamp() > now.timestamp()
