"""Points overview from ChoreOps sensor attributes (pure). Refs #123."""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any

SOURCE_LABELS: dict[str, str] = {
    "chores": "Úkoly",
    "bonus": "Bonusy",
    "rewards": "Odměny",
    "penalty": "Sankce",
    "other": "Ostatní",
}


def _num(value: Any) -> float | None:
    try:
        f = float(value)
    except (TypeError, ValueError):
        return None
    if f != f:  # NaN
        return None
    return f


def build_points_summary(
    attrs: Mapping[str, Any], *, kid_name: str, balance: float | None = None
) -> dict[str, Any]:
    earned_today = _num(attrs.get("point_stat_points_earned_today"))
    earned_week = _num(attrs.get("point_stat_points_earned_week"))
    earned_month = _num(attrs.get("point_stat_points_earned_month"))
    spent_month = _num(attrs.get("point_stat_points_spent_month"))
    net_month = _num(attrs.get("point_stat_points_net_month"))
    earned_all = _num(attrs.get("point_stat_points_earned_all_time"))
    spent_all = _num(attrs.get("point_stat_points_spent_all_time"))
    streak = _num(attrs.get("chore_stat_longest_streak"))
    top_raw = attrs.get("chore_stat_top_chores_month")
    top_chore = None
    if isinstance(top_raw, list) and top_raw:
        item = top_raw[0]
        if isinstance(item, Mapping):
            top_chore = str(item.get("name") or item.get("chore") or "")
    elif isinstance(top_raw, str) and top_raw.strip():
        top_chore = top_raw.strip()
    sources: dict[str, float | None] = {}
    for key, label in SOURCE_LABELS.items():
        attr = f"point_stat_points_by_source_month_{key}"
        sources[label] = _num(attrs.get(attr))
    return {
        "kid_name": kid_name,
        "balance": balance,
        "earned_today": earned_today,
        "earned_week": earned_week,
        "earned_month": earned_month,
        "spent_month": spent_month,
        "net_month": net_month,
        "earned_all_time": earned_all,
        "spent_all_time": spent_all,
        "longest_streak": streak,
        "top_chore_month": top_chore,
        "sources_month": sources,
    }


def bucket_ledger(
    entries: list[Mapping[str, Any]],
    *,
    days: int,
    local_keys: list[str],
) -> dict[str, Any]:
    """Bucket positive ledger amounts per local day (synthetic chart contract)."""
    earned: dict[str, float] = {k: 0.0 for k in local_keys}
    for row in entries:
        ts = row.get("timestamp")
        amount = _num(row.get("amount"))
        if ts is None or amount is None or amount <= 0:
            continue
        day = str(ts)[:10]
        if day in earned:
            earned[day] += amount
    values = [earned[k] for k in local_keys]
    return {
        "days": local_keys,
        "earned": values,
        "max": max(values) if values else 0,
        "coverage_complete": len(local_keys) == days,
    }