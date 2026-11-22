"""Pure swap / chore-create state machine (no HA I/O). Refs #123."""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from datetime import UTC, date, datetime, time, timedelta, tzinfo
from typing import Any, Final
from zoneinfo import ZoneInfo

SWAP_WINDOW_DAYS: Final = 7  # today plus seven following civil days

REQUEST_TERMINAL: Final = frozenset({"rejected", "cancelled", "expired"})
REQUEST_ACTIVE: Final = frozenset({"pending", "approved"})
OPERATION_TERMINAL: Final = frozenset(
    {"completed", "failed", "cleaned", "unclaimed_expired", "needs_repair", "cancelled"}
)

SWAP_BLOCKED_CRITERIA: Final = frozenset(
    {
        "shared_first",
        "shared_all",
        "rotation_daily",
        "rotation_weekly",
        "rotation_custom",
    }
)


class DomainError(Exception):
    """Validation failure with a stable WS code."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


def kid_key(kid: Mapping[str, Any]) -> str:
    """Stable kid id: configured HA user id, else slug id."""
    uid = kid.get("user_id")
    return str(uid) if uid else str(kid["id"])


def local_today(now: datetime, tz: ZoneInfo) -> date:
    if now.tzinfo is None:
        now = now.replace(tzinfo=UTC)
    return now.astimezone(tz).date()


def day_end_utc(local_day: date, tz: ZoneInfo) -> datetime:
    start = datetime(local_day.year, local_day.month, local_day.day, tzinfo=tz) + timedelta(days=1)
    return start.astimezone(UTC)


def clone_due(due: str | None, now: datetime, tz: ZoneInfo) -> str:
    """Give a swapped occurrence a usable deadline in the household's local day."""
    if now.tzinfo is None:
        now = now.replace(tzinfo=UTC)
    if due:
        try:
            source = datetime.fromisoformat(due)
        except ValueError:
            source = None
        if source is not None:
            if source.tzinfo is None:
                source = source.replace(tzinfo=tz)
            if source.astimezone(UTC) > now.astimezone(UTC) + timedelta(minutes=15):
                return due
    end = datetime.combine(local_today(now, tz), time(23, 59), tz)
    if end.timestamp() <= now.timestamp():
        end = end.replace(second=59, microsecond=999999)
    return end.isoformat()


def expires_at(local_day: date, tz: ZoneInfo) -> datetime:
    return day_end_utc(local_day, tz)


def request_expired(req: Mapping[str, Any], now: datetime) -> bool:
    if req.get("status") != "pending":
        return False
    exp = req.get("expires_at")
    if not isinstance(exp, str):
        return False
    try:
        return datetime.fromisoformat(exp.replace("Z", "+00:00")) <= now.astimezone(UTC)
    except ValueError:
        return True


def reduce_request(
    req: dict[str, Any], event: str, now: datetime, *, actor_id: str | None = None
) -> dict[str, Any]:
    """Apply a domain event to a swap request record."""
    out = dict(req)
    status = str(out.get("status") or "pending")
    if status in REQUEST_TERMINAL or status == "approved":
        raise DomainError("conflict", "Žádost už je uzavřená.")
    if event == "cancel":
        if actor_id and actor_id != out.get("requester_user_id"):
            raise DomainError("unauthorized", "Žádost může zrušit jen žadatel.")
        out["status"] = "cancelled"
        return out
    if event == "reject":
        out["status"] = "rejected"
        out["decided_by"] = actor_id
        out["decision_at"] = now.isoformat()
        return out
    if event == "approve":
        out["status"] = "approved"
        out["decided_by"] = actor_id
        out["decision_at"] = now.isoformat()
        return out
    if event == "expire" or request_expired(out, now):
        out["status"] = "expired"
        return out
    raise DomainError("invalid_input", f"Neznámá událost: {event}")


def occurrence_day(due: str | None, tz: tzinfo | None) -> date | None:
    if not isinstance(due, str) or not due:
        return None
    try:
        stamp = datetime.fromisoformat(due)
    except ValueError:
        return None
    return stamp.astimezone(tz).date() if stamp.tzinfo else stamp.date()


def same_due(first: str | None, second: str | None) -> bool:
    if first == second:
        return True
    if not first or not second:
        return False
    try:
        return datetime.fromisoformat(first) == datetime.fromisoformat(second)
    except ValueError:
        return False


def clone_suffix(token: str) -> str:
    return f" · HB-{token[:8]}"


def swap_day(occurrence: Mapping[str, Any], local_now: datetime) -> date | None:
    """Carried overdue chores are still actionable today with a new deadline."""
    day = occurrence_day(occurrence.get("due"), local_now.tzinfo)
    today = local_now.date()
    if day and occurrence.get("state") == "overdue" and 0 < (today - day).days <= 3:
        return today
    return day


def in_swap_window(day: date, now: datetime, tz: ZoneInfo) -> bool:
    return 0 <= (day - local_today(now, tz)).days <= SWAP_WINDOW_DAYS


def validate_swap_request(
    *,
    direction: str,
    actor_user_id: str,
    from_kid: str,
    to_kid: str,
    chore_opaque: str,
    local_day: date,
    now: datetime,
    tz: ZoneInfo,
    role: str,
    occurrence: Mapping[str, Any] | None,
) -> None:
    if from_kid == to_kid:
        raise DomainError("invalid_input", "Vyberte jiné dítě.")
    if occurrence is None:
        raise DomainError("not_found", "Povinnost nenalezena.")
    if str(occurrence.get("opaque_id") or "") != chore_opaque:
        raise DomainError("not_found", "Povinnost nenalezena.")
    reason = occurrence.get("swap_unavailable_reason")
    if reason:
        raise DomainError("unsupported_chore", str(reason))
    if not occurrence.get("can_request_swap"):
        raise DomainError("unsupported_chore", "Tento úkol nelze předat.")
    if direction == "give" and role == "child" and actor_user_id != from_kid:
        raise DomainError("unauthorized", "Můžete předat jen vlastní úkol.")
    if direction == "take" and role == "child" and actor_user_id != to_kid:
        raise DomainError("unauthorized", "Můžete převzít jen pro sebe.")
    if not in_swap_window(local_day, now, tz):
        raise DomainError("expired", "Vyber den v povoleném období.")
    if swap_day(occurrence, now.astimezone(tz)) != local_day:
        raise DomainError("unsupported_chore", "Úkol nemá termín ve vybraný den.")


def dedupe_key(client_request_id: str) -> str:
    return client_request_id


def same_payload(a: Mapping[str, Any], b: Mapping[str, Any], keys: tuple[str, ...]) -> bool:
    return all(a.get(k) == b.get(k) for k in keys)


@dataclass(frozen=True)
class Effect:
    domain: str
    service: str
    data: dict[str, Any]


def plan_next_effect(op: Mapping[str, Any]) -> Effect | None:
    """One ChoreOps side-effect for the current operation step."""
    step = str(op.get("step") or "")
    if op.get("status") != "applying":
        return None
    snap = op.get("source_snapshot") or {}
    cfg = str(op.get("config_entry_id") or "")
    token = str(op.get("operation_token") or "")
    if step == "delete_source":
        return Effect("choreops", "delete_chore", {"config_entry_id": cfg, "id": snap["chore_id"]})
    if step == "remove_assignment":
        return Effect(
            "choreops",
            "update_chore",
            {
                "config_entry_id": cfg,
                "id": snap["chore_id"],
                "assigned_user_names": [op["from_kid_name"]],
                "assignment_action": "remove",
            },
        )
    if step == "create_intent":
        assignee = op.get("assignee_name")
        points = snap.get("points")
        base = str(snap.get("name") or "Úkol")
        from_name = str(op.get("from_kid_name") or "")
        return Effect(
            "choreops",
            "create_chore",
            {
                "config_entry_id": cfg,
                "name": f"{base} (za {from_name}){clone_suffix(token)}",
                "assigned_user_names": [assignee],
                **({"points": points} if points is not None else {}),
                "frequency": "none",
                "completion_criteria": "independent",
                "due_date": op.get("clone_due"),
                "auto_approve": False,
                "approval_reset_type": "manual",
                "pending_claims": "hold_pending",
                "overdue_handling": "never_overdue",
            },
        )
    if step == "skip_intent":
        return Effect(
            "choreops",
            "skip_chore_due_date",
            {
                "config_entry_id": cfg,
                **(
                    {"chore_id": snap["chore_id"]}
                    if snap.get("chore_id")
                    else {"chore_name": snap["name"]}
                ),
                "user_name": op.get("from_kid_name"),
                "mark_as_missed": False,
            },
        )
    return None


def clone_created(op: dict[str, Any], clone_id: str) -> dict[str, Any]:
    """Record the recipient's copy before modifying the source occurrence."""
    if op["source_snapshot"]["frequency"] == "none":
        step = "delete_source" if op.get("sole_assignee") else "remove_assignment"
    else:
        step = "skip_intent"
    return {**op, "clone_id": clone_id, "step": step}


def reconcile_requests(
    requests: dict[str, dict[str, Any]], now: datetime
) -> dict[str, dict[str, Any]]:
    out: dict[str, dict[str, Any]] = {}
    for rid, req in requests.items():
        if req.get("status") == "pending" and request_expired(req, now):
            out[rid] = reduce_request(dict(req), "expire", now)
        else:
            out[rid] = dict(req)
    return out


def reconcile_operations(
    operations: dict[str, dict[str, Any]], now: datetime, tz: ZoneInfo
) -> dict[str, dict[str, Any]]:
    """Queue expired clones for inspection and flag missed scheduled transfers."""
    out: dict[str, dict[str, Any]] = {}
    for oid, op in operations.items():
        cur = dict(op)
        status = str(cur.get("status") or "")
        op_tz = ZoneInfo(cur["timezone"]) if cur.get("timezone") else tz
        today = local_today(now, op_tz)
        try:
            op_day = date.fromisoformat(str(cur.get("local_date")))
        except ValueError:
            op_day = today
        if (
            status == "active"
            and op_day < today
            and cur.get("clone_id")
            and not cur.get("clone_claimed")
        ):
            cur["status"] = "cleanup_pending"
            cur["step"] = "delete_clone"
        elif status == "failed" and cur.get("clone_id"):
            cur.update(status="rollback_pending", step="delete_clone")
        elif status == "scheduled" and op_day < today:
            cur.update(status="needs_repair", last_error="expired_day", recovery_checked=True)
        out[oid] = cur
    return out
