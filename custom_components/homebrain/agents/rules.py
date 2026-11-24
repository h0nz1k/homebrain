"""Thresholds, window labels and the verdict of the Agents module (pure)."""

from __future__ import annotations

import re
from typing import Any, Final

# Entry options of the module (options flow step „agents“); the URL is household data.
OPTION: Final = "agents"
MONITOR_URL: Final = "monitor_url"
BINDING_KEY: Final = "agents_status"

# Quota: remaining % below CRIT (or exhausted) = critical, below WARN = warning.
QUOTA_CRIT: Final = 10.0
QUOTA_WARN: Final = 25.0
# Service availability over 24 h below this = warning.
SLA_WARN: Final = 95.0

_ORDER: Final = {"critical": 0, "warning": 1, "ok": 2, "unknown": 3}
_KIND: Final = {"service": 0, "quota": 1, "data": 2, "status": 3}
# Monitoring status (template sensor state) → HomeBrain level.
_STATUS_LEVEL: Final = {"ok": "ok", "attention": "warning", "critical": "critical"}

# Raw quota window (attribute `okno`) → Czech label; unknown windows are shown as they are.
_WINDOW_EXACT: Final = {
    "included": "měsíc",
    "actions min": "měsíc",
    "month": "měsíc",
    "monthly": "měsíc",
    "měsíc": "měsíc",
    "api": "kredit",
    "credit": "kredit",
    "credits": "kredit",
    "kredit": "kredit",
    "bonus": "kredit",
    "week": "týden",
    "weekly": "týden",
    "týden": "týden",
    "day": "den",
    "daily": "den",
}
_HOURS: Final = re.compile(r"(?:^|\s)(\d+)\s*h$")
_DAYS: Final = re.compile(r"(?:^|\s)(\d+)\s*d$")


def _days(n: int) -> str:
    return f"{n} den" if n == 1 else f"{n} dny" if 2 <= n <= 4 else f"{n} dní"


def window_label(raw: Any) -> str | None:
    """„5h“ → „5 h“, „7d“ → „7 dní“, „Claude week“ → „týden“, „GCP Bonus“ → „kredit“."""
    if not isinstance(raw, str) or not raw.strip():
        return None
    text = " ".join(raw.split())
    low = text.lower()
    if low in _WINDOW_EXACT:
        return _WINDOW_EXACT[low]
    if m := _HOURS.search(low):
        return f"{int(m.group(1))} h"
    if m := _DAYS.search(low):
        return _days(int(m.group(1)))
    # „<provider> week“, „GCP Bonus“: the last word names the window.
    last = low.rsplit(" ", 1)[-1]
    return _WINDOW_EXACT.get(last, text)


def status_level(state: str | None) -> str:
    return _STATUS_LEVEL.get(state or "", "unknown")


def quota_level(quota: dict[str, Any]) -> str:
    remaining = quota.get("remaining_pct")
    if quota.get("exhausted") or (remaining is not None and remaining < QUOTA_CRIT):
        return "critical"
    if quota.get("exhaust_before_reset") or (remaining is not None and remaining < QUOTA_WARN):
        return "warning"
    return "ok" if remaining is not None else "unknown"


def service_level(service: dict[str, Any]) -> str:
    if service.get("up") is None:
        return "unknown"
    if not service["up"] or service.get("state") == "down":
        return "critical"
    sla = service.get("sla_24h")
    if (sla is not None and sla < SLA_WARN) or service.get("state") == "degraded":
        return "warning"
    return "ok"


def level_sort_key(level: str) -> int:
    return _ORDER.get(level, _ORDER["unknown"])


def verdict(snap: dict[str, Any]) -> dict[str, Any]:
    """``level`` ok|warning|critical|unknown + reasons (critical first)."""
    reasons: list[dict[str, Any]] = []

    def add(kind: str, label: str, lvl: str, value: Any = None, detail: str | None = None) -> None:
        if lvl in ("critical", "warning"):
            reasons.append(
                {"kind": kind, "label": label, "level": lvl, "value": value, "detail": detail}
            )

    for service in snap.get("services") or []:
        detail = "down" if service["level"] == "critical" else "sla"
        add("service", service["name"], service["level"], service.get("sla_24h"), detail)
    for quota in snap.get("quotas") or []:
        if quota["exhausted"]:
            detail = "exhausted"
        elif quota["remaining_pct"] is not None and quota["remaining_pct"] < QUOTA_WARN:
            detail = "low"
        else:
            detail = "forecast"
        label = " · ".join(p for p in (quota["provider"], quota["window_label"]) if p)
        add("quota", label or quota["id"], quota["level"], quota["remaining_pct"], detail)
    if (snap.get("data") or {}).get("current") is False:
        add("data", "Data nejsou aktuální", "warning", (snap["data"] or {}).get("since"))
    status = snap.get("status") or {}
    item_worst = min((level_sort_key(r["level"]) for r in reasons), default=_ORDER["ok"])
    s_level = status_level(status.get("level"))
    # The monitoring's own aggregate only speaks when the items do not already explain it.
    if s_level in ("critical", "warning") and level_sort_key(s_level) < item_worst:
        add("status", "Monitoring", s_level, None)
    reasons.sort(
        key=lambda r: (
            _ORDER[r["level"]],
            _KIND[r["kind"]],
            r["value"] if isinstance(r["value"], (int, float)) else 0,
        )
    )
    if reasons:
        level = reasons[0]["level"]
    elif s_level == "ok" or any(q["level"] == "ok" for q in snap.get("quotas") or []):
        level = "ok"
    else:
        level = "unknown"
    return {"level": level, "reasons": reasons}
