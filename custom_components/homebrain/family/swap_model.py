"""Pure swap / chore-create state machine (no HA I/O). Refs #123."""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from typing import Any, Final
from zoneinfo import ZoneInfo

REQUEST_TERMINAL: Final = frozenset({"rejected", "cancelled", "expired"})
REQUEST_ACTIVE: Final = frozenset({"pending", "approved"})
OPERATION_TERMINAL: Final = frozenset(
    {"completed", "failed", "cleaned", "unclaimed_expired", "needs_repair"}
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
        raise DomainError("unsupported_chore", "Tento úkol nelze dnes předat.")
    if direction == "give" and role == "child" and actor_user_id != from_kid:
        raise DomainError("unauthorized", "Můžete předat jen vlastní úkol.")
    if direction == "take" and role == "child" and actor_user_id != to_kid:
        raise DomainError("unauthorized", "Můžete převzít jen pro sebe.")
    if local_day != local_today(now, tz):
        raise DomainError("expired", "Platí jen pro dnešní den.")


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
    status = str(op.get("status") or "")
    if status not in {"applying", "cleanup_pending"}:
        return None
    snap = op.get("source_snapshot") or {}
    cfg = str(op.get("config_entry_id") or "")
    token = str(op.get("operation_token") or "")
    if step == "create_intent":
        due = snap.get("due")
        assignee = op.get("assignee_name")
        points = snap.get("points")
        base = str(snap.get("name") or "Úkol")
        from_name = str(op.get("from_kid_name") or "")
        return Effect(
            "choreops",
            "create_chore",
            {
                "config_entry_id": cfg,
                "name": f"{base} (za {from_name}) · HB-{token[:8]}",
                "assigned_user_names": [assignee],
                "points": points,
                "frequency": "none",
                "completion_criteria": "independent",
                "due_date": due,
                "auto_approve": False,
                "approval_reset_type": "manual",
                "pending_claims": "hold_pending",
                "overdue_handling": "never_overdue",
                "return_response": True,
            },
        )
    if step == "skip_intent":
        return Effect(
            "choreops",
            "skip_chore_due_date",
            {
                "config_entry_id": cfg,
                "chore_id": snap.get("chore_id"),
                "user_id": op.get("from_kid_name"),
                "mark_as_missed": False,
            },
        )
    if step == "delete_clone":
        clone = op.get("clone_id")
        if clone:
            return Effect(
                "choreops",
                "delete_chore",
                {"config_entry_id": cfg, "id": clone},
            )
    return None


def advance_operation(op: dict[str, Any], observed: Mapping[str, Any]) -> dict[str, Any]:
    """Merge observed ChoreOps outcome and move to the next step."""
    out = dict(op)
    step = str(out.get("step") or "")
    if step == "create_intent" and observed.get("chore_id"):
        out["clone_id"] = observed["chore_id"]
        out["step"] = "skip_intent"
        out["status"] = "applying"
        return out
    if step == "skip_intent" and observed.get("skipped"):
        out["step"] = "active"
        out["status"] = "active"
        return out
    if step == "delete_clone" and observed.get("deleted"):
        out["step"] = "cleaned"
        out["status"] = "cleaned"
        return out
    if observed.get("error"):
        out["status"] = "failed"
        out["last_error"] = str(observed["error"])
    return out


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
    """Midnight / startup: expire unclaimed clones, mark stale applying ops."""
    out: dict[str, dict[str, Any]] = {}
    today = local_today(now, tz)
    for oid, op in operations.items():
        cur = dict(op)
        status = str(cur.get("status") or "")
        local = cur.get("local_date")
        try:
            op_day = date.fromisoformat(str(local))
        except ValueError:
            op_day = today
        if status == "active" and op_day < today and not cur.get("clone_claimed"):
            cur["status"] = "unclaimed_expired"
            cur["step"] = "delete_clone"
        elif status == "applying" and op_day < today:
            cur["status"] = "needs_repair"
            cur["last_error"] = "expired_day"
        out[oid] = cur
    return out