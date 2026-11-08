"""Thresholds and the health verdict of the server (pure)."""

from __future__ import annotations

from typing import Any, Final

MEMORY: Final = (85.0, 95.0)
DISK: Final = (85.0, 95.0)
# Without Glances sensor thresholds (no REST API): conservative defaults for N100/N200 + NVMe.
TEMPERATURE: Final = (80.0, 95.0)
_ORDER: Final = {"critical": 0, "warning": 1}
_KIND: Final = {"memory": 0, "disk": 1, "temperature": 2}


def level(value: float | None, warn: float, crit: float) -> str:
    if value is None:
        return "unknown"
    if value >= crit:
        return "critical"
    if value >= warn:
        return "warning"
    return "ok"


def temperature_level(sensor: dict[str, Any]) -> str:
    warn = sensor.get("warning") or TEMPERATURE[0]
    crit = sensor.get("critical") or max(TEMPERATURE[1], warn)
    return level(sensor.get("value"), warn, crit)


def verdict(snap: dict[str, Any]) -> dict[str, Any]:
    """``severity`` ok|warning|critical + reasons (critical first, then by value)."""
    reasons: list[dict[str, Any]] = []

    def add(kind: str, label: str, value: float | None, lvl: str) -> None:
        if lvl in _ORDER:
            reasons.append({"kind": kind, "label": label, "value": value, "level": lvl})

    mem = (snap.get("memory") or {}).get("percent")
    add("memory", "paměť", mem, level(mem, *MEMORY))
    for disk in snap.get("disks") or []:
        add("disk", disk.get("mount", ""), disk.get("percent"), level(disk.get("percent"), *DISK))
    for sensor in (snap.get("temperatures") or {}).get("sensors") or []:
        add("temperature", sensor.get("label", ""), sensor.get("value"), temperature_level(sensor))
    reasons.sort(key=lambda r: (_ORDER[r["level"]], _KIND[r["kind"]], -(r["value"] or 0)))
    # One temperature line is enough (all cores heat up together).
    seen_temp = False
    unique = []
    for reason in reasons:
        if reason["kind"] == "temperature":
            if seen_temp:
                continue
            seen_temp = True
        unique.append(reason)
    severity = unique[0]["level"] if unique else "ok"
    return {"severity": severity, "reasons": unique}
