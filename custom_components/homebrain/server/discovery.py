"""Glances entities → server snapshot (entity registry + translation_key + unique_id, no ids)."""

from __future__ import annotations

import re
from typing import Any, Final

from homeassistant.core import HomeAssistant
from homeassistant.helpers import entity_registry as er

from . import rules

GLANCES: Final = "glances"
_BYTES: Final = {
    "B": 1,
    "kB": 1e3,
    "KB": 1e3,
    "MB": 1e6,
    "GB": 1e9,
    "TB": 1e12,
    "KiB": 1024,
    "MiB": 1024**2,
    "GiB": 1024**3,
    "TiB": 1024**4,
}
_RATES: Final = {
    "B/s": 1,
    "kB/s": 1e3,
    "KB/s": 1e3,
    "MB/s": 1e6,
    "GB/s": 1e9,
    "KiB/s": 1024,
    "MiB/s": 1024**2,
    "GiB/s": 1024**3,
    "bit/s": 1 / 8,
    "kbit/s": 125,
    "Mbit/s": 125_000,
    "Gbit/s": 125_000_000,
}
# Glances sensor description keys (unique_id = "<entry_id>-<label>-<key>"), longest first.
_KEYS: Final = sorted(
    (
        "disk_use_percent",
        "disk_use",
        "disk_size",
        "disk_free",
        "memory_use_percent",
        "memory_use",
        "memory_free",
        "swap_use_percent",
        "swap_use",
        "swap_free",
        "processor_load",
        "process_running",
        "process_total",
        "process_thread",
        "process_sleeping",
        "cpu_use_percent",
        "temperature_core",
        "temperature_hdd",
        "temperature",
        "rx",
        "tx",
        "uptime",
    ),
    key=len,
    reverse=True,
)
_VIRTUAL_IF: Final = re.compile(r"^(lo|tap|fwbr|fwpr|fwln|veth|docker|br-|virbr)")
_CPU_TEMP: Final = re.compile(r"^(core|package|cpu|tctl|tdie)", re.I)
_MISSING: Final = {"unavailable", "unknown", "", None}


def glances_entry(hass: HomeAssistant):
    """The Glances config entry with the most enabled sensors (one server per panel)."""
    reg = er.async_get(hass)
    best, best_n = None, 0
    for entry in hass.config_entries.async_entries(GLANCES):
        n = sum(1 for e in er.async_entries_for_config_entry(reg, entry.entry_id) if not e.disabled)
        if n > best_n:
            best, best_n = entry, n
    return best


def _label(unique_id: str, entry_id: str) -> tuple[str, str] | None:
    rest = unique_id[len(entry_id) + 1 :] if unique_id.startswith(f"{entry_id}-") else None
    if rest is None:
        return None
    for key in _KEYS:
        if rest.endswith(f"-{key}"):
            return rest[: -len(key) - 1], key
    return None


def _num(hass: HomeAssistant, entity_id: str) -> float | None:
    state = hass.states.get(entity_id)
    if state is None or state.state in _MISSING:
        return None
    try:
        return float(state.state)
    except ValueError:
        return None


def _scaled(hass: HomeAssistant, entity_id: str, table: dict[str, float]) -> float | None:
    value = _num(hass, entity_id)
    if value is None:
        return None
    unit = hass.states.get(entity_id).attributes.get("unit_of_measurement")
    return value * table.get(unit, 1)


def _round(value: float | None, digits: int = 1) -> float | None:
    return round(value, digits) if value is not None else None


def build_snapshot(
    hass: HomeAssistant, thresholds: dict[str, dict] | None = None
) -> dict[str, Any]:
    entry = glances_entry(hass)
    if entry is None:
        return {
            "available": False,
            "state": "unconfigured",
            "host": None,
            "verdict": {"severity": "unknown", "reasons": []},
        }
    reg = er.async_get(hass)
    found: dict[tuple[str, str], str] = {}
    for ent in er.async_entries_for_config_entry(reg, entry.entry_id):
        if ent.disabled or ent.domain != "sensor" or ent.platform != GLANCES:
            continue
        parsed = _label(ent.unique_id, entry.entry_id)
        if parsed:
            found[(parsed[1], parsed[0])] = ent.entity_id

    def by_key(key: str) -> list[tuple[str, str]]:
        return sorted((label, eid) for (k, label), eid in found.items() if k == key)

    def first(key: str) -> str | None:
        rows = by_key(key)
        return rows[0][1] if rows else None

    def num(key: str) -> float | None:
        eid = first(key)
        return _num(hass, eid) if eid else None

    def size(key: str, label: str | None = None) -> float | None:
        eid = found.get((key, label)) if label is not None else first(key)
        return _scaled(hass, eid, _BYTES) if eid else None

    used, free = size("memory_use"), size("memory_free")
    memory = {
        "percent": num("memory_use_percent"),
        "used_bytes": used,
        "free_bytes": free,
        "total_bytes": used + free if used is not None and free is not None else None,
    }
    s_used, s_free = size("swap_use"), size("swap_free")
    swap = {
        "percent": num("swap_use_percent"),
        "used_bytes": s_used,
        "total_bytes": s_used + s_free if s_used is not None and s_free is not None else None,
    }
    mounts = sorted(
        {label for (k, label) in found if k.startswith("disk_")}, key=lambda m: (m != "/", m)
    )
    disks = []
    for mount in mounts:
        pct_eid = found.get(("disk_use_percent", mount))
        disk = {
            "mount": mount,
            "percent": _num(hass, pct_eid) if pct_eid else None,
            "used_bytes": size("disk_use", mount),
            "free_bytes": size("disk_free", mount),
            "size_bytes": size("disk_size", mount),
        }
        if disk["percent"] is None and disk["size_bytes"] and disk["free_bytes"] is not None:
            disk["percent"] = round((1 - disk["free_bytes"] / disk["size_bytes"]) * 100, 1)
        disk["level"] = rules.level(disk["percent"], *rules.DISK)
        disks.append(disk)
    thresholds = thresholds or {}
    temps = []
    for key in ("temperature_core", "temperature_hdd", "temperature"):
        for label, eid in by_key(key):
            value = _num(hass, eid)
            if value is None:
                continue
            limits = thresholds.get(label) or {}
            sensor = {
                "label": label,
                "value": value,
                "kind": "cpu"
                if _CPU_TEMP.match(label)
                else "disk"
                if label.lower() == "composite" or "nvme" in label.lower()
                else "other",
                "warning": limits.get("warning"),
                "critical": limits.get("critical"),
                "entity_id": eid,
            }
            sensor["level"] = rules.temperature_level(sensor)
            temps.append(sensor)
    cpu_temps = [t for t in temps if t["kind"] == "cpu"]
    hottest = max(cpu_temps or temps, key=lambda t: t["value"], default=None)
    composite = next((t["value"] for t in temps if t["kind"] == "disk"), None)
    ifaces = []
    for label in sorted({lb for (k, lb) in found if k in ("rx", "tx")}):
        if _VIRTUAL_IF.match(label):
            continue
        rx_eid, tx_eid = found.get(("rx", label)), found.get(("tx", label))
        ifaces.append(
            {
                "name": label,
                "rx_bps": _scaled(hass, rx_eid, _RATES) if rx_eid else None,
                "tx_bps": _scaled(hass, tx_eid, _RATES) if tx_eid else None,
                "rx_entity": rx_eid,
                "tx_entity": tx_eid,
            }
        )
    primary = max(ifaces, key=lambda i: (i["rx_bps"] or 0) + (i["tx_bps"] or 0), default=None)
    up_eid = first("uptime")
    up_state = hass.states.get(up_eid) if up_eid else None
    running, total = num("process_running"), num("process_total")
    snap: dict[str, Any] = {
        "host": {"title": entry.title, "entry_id": entry.entry_id},
        "cpu": {"percent": num("cpu_use_percent"), "load": num("processor_load"), "cores": None},
        "memory": memory,
        "swap": swap,
        "disks": disks,
        "temperatures": {
            "cpu_max": hottest["value"] if hottest else None,
            "composite": composite,
            "sensors": temps,
        },
        "network": {"primary": primary["name"] if primary else None, "interfaces": ifaces},
        "processes": {
            "running": int(running) if running is not None else None,
            "total": int(total) if total is not None else None,
        },
        "up_since": up_state.state if up_state and up_state.state not in _MISSING else None,
        "history_entities": {
            "cpu": first("cpu_use_percent"),
            "memory": first("memory_use_percent"),
            "temperature": hottest["entity_id"] if hottest else None,
            "rx": primary["rx_entity"] if primary else None,
            "tx": primary["tx_entity"] if primary else None,
        },
    }
    memory["level"] = rules.level(memory["percent"], *rules.MEMORY)
    values = [
        memory["percent"],
        snap["cpu"]["percent"],
        *(d["percent"] for d in disks),
        *(t["value"] for t in temps),
    ]
    live = any(v is not None for v in values)
    snap["available"] = live
    snap["state"] = "ok" if live else "down"
    snap["verdict"] = rules.verdict(snap) if live else {"severity": "unknown", "reasons": []}
    return snap
