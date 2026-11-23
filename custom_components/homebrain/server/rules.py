"""Thresholds and the health verdict of the server (pure)."""

from __future__ import annotations

from typing import Any, Final

MEMORY: Final = (85.0, 95.0)
DISK: Final = (85.0, 95.0)
# Guest CPU: a busy guest is only worth a highlight, never a critical verdict on its own.
GUEST_CPU_WARN: Final = 90.0
# Without Glances sensor thresholds (no REST API): conservative defaults for N100/N200 + NVMe.
TEMPERATURE: Final = (80.0, 95.0)
# Entry options of the Server module (options flow step „server“).
OPTION: Final = "server"
BACKUP_MAX_AGE: Final = "backup_max_age_days"
# Last Proxmox backup older than this many days = warning, twice as old = critical.
BACKUP_MAX_AGE_DAYS: Final = 8
BACKUP_MAX_AGE_RANGE: Final = (1, 365)
_ORDER: Final = {"critical": 0, "warning": 1}
_KIND: Final = {
    "node": 0,
    "memory": 1,
    "disk": 2,
    "storage": 3,
    "temperature": 4,
    "backup": 5,
    "backup_age": 6,
    "load": 7,
}


def level(value: float | None, warn: float, crit: float) -> str:
    if value is None:
        return "unknown"
    if value >= crit:
        return "critical"
    if value >= warn:
        return "warning"
    return "ok"


def cpu_level(percent: float | None) -> str:
    if percent is None:
        return "unknown"
    return "warning" if percent >= GUEST_CPU_WARN else "ok"


def load_level(load15: float | None, cores: float | None) -> str:
    """15-minute load average above the core count = sustained overload (warning)."""
    if load15 is None or not cores:
        return "unknown"
    return "warning" if load15 > cores else "ok"


def backup_age_level(age_days: float | None, max_age_days: float) -> str:
    """Older than the limit = warning, at least twice the limit = critical."""
    if age_days is None:
        return "unknown"
    if age_days >= 2 * max_age_days:
        return "critical"
    if age_days > max_age_days:
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

    cpu = snap.get("cpu") or {}
    add("load", "zátěž", cpu.get("load"), load_level(cpu.get("load"), cpu.get("cores")))
    mem = (snap.get("memory") or {}).get("percent")
    add("memory", "paměť", mem, level(mem, *MEMORY))
    for disk in snap.get("disks") or []:
        add("disk", disk.get("mount", ""), disk.get("percent"), level(disk.get("percent"), *DISK))
    for sensor in (snap.get("temperatures") or {}).get("sensors") or []:
        add("temperature", sensor.get("label", ""), sensor.get("value"), temperature_level(sensor))
    proxmox = snap.get("proxmox") or {}
    node = proxmox.get("node") or {}
    if node.get("status") == "offline":
        add("node", node["name"], None, "critical")
    for storage in proxmox.get("storages") or []:
        add("storage", storage["name"], storage["percent"], level(storage["percent"], *DISK))
    backup = proxmox.get("backup") or {}
    if backup.get("ok") is False:
        add("backup", node.get("name", ""), None, "warning")
    if backup.get("age_days") is not None:
        add("backup_age", node.get("name", ""), backup["age_days"], backup.get("age_level", ""))
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
