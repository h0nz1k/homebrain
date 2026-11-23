"""Read the Proxmox VE entity and device registries and their current states."""

from __future__ import annotations

import math
import re
from collections.abc import Mapping
from typing import Any, Final

from homeassistant.core import HomeAssistant, State
from homeassistant.helpers import device_registry as dr
from homeassistant.helpers import entity_registry as er
from homeassistant.util import dt as dt_util

from . import rules
from .discovery import _BYTES, _MISSING, _RATES
from .rates import CounterRates

PROXMOX: Final = "proxmoxve"
_GUEST: Final = re.compile(r"(\d+)_(vm|container)_(.+)")
_DURATION: Final = {"ms": 0.001, "s": 1, "min": 60, "h": 3600, "d": 86400}
States = dict[str, State]


def _value(states: States, key: str) -> str | None:
    state = states.get(key)
    return state.state if state else None


def _number(states: States, key: str, units: Mapping[str, float] | None = None) -> float | None:
    state = states.get(key)
    if state is None:
        return None
    factor = 1 if units is None else units.get(state.attributes.get("unit_of_measurement"), 1)
    try:
        value = float(state.state) * factor
    except ValueError:
        return None
    return value if math.isfinite(value) and value >= 0 else None


def _timestamp(states: States, key: str) -> str | None:
    value = _value(states, key)
    parsed = dt_util.parse_datetime(value) if value else None
    return parsed.isoformat() if parsed else None


def _binary(states: States, key: str) -> bool | None:
    value = _value(states, key)
    return {"on": True, "off": False}.get(value)


def _percent(used: float | None, total: float | None) -> float | None:
    return used / total * 100 if used is not None and total else None


def _network(
    states: States, key: str, rates: CounterRates | None, rate_key: tuple[int, str, str]
) -> tuple[float | None, float | None]:
    """(bytes/s, cumulative bytes): a rate sensor as is, a byte counter via ``rates``."""
    state = states.get(key)
    if state and state.attributes.get("unit_of_measurement") in _RATES:
        return _number(states, key, _RATES), None
    total = _number(states, key, _BYTES)
    if rates is None:
        return None, total
    at = state.last_reported.timestamp() if state is not None else None
    return rates.rate(rate_key, total, at), total


def _round(value: float | None, digits: int = 1) -> float | None:
    return round(value, digits) if value is not None else None


def _guest(
    vmid: int, kind: str, name: str, states: States, rates: CounterRates | None = None
) -> dict[str, Any]:
    status = _value(states, "status")
    if status is None:
        status = {True: "running", False: "stopped"}.get(_binary(states, "running"))
    used = _number(states, "memory", _BYTES)
    total = _number(states, "max_memory", _BYTES)
    percent = _number(states, "memory_percentage")
    if percent is None:
        percent = _percent(used, total)
    disk = _number(states, "disk", _BYTES)
    disk_max = _number(states, "max_disk", _BYTES)
    # PVE reports 0 B used for a VM without the QEMU guest agent: unknown, not empty.
    if kind == "vm" and not disk:
        disk = None
    netin, netin_bytes = _network(states, "netin", rates, (vmid, kind, "in"))
    netout, netout_bytes = _network(states, "netout", rates, (vmid, kind, "out"))
    cpu = _number(states, "cpu")
    cpus = _number(states, "max_cpu")
    disk_percent = _percent(disk, disk_max)
    running = status == "running"
    return {
        "vmid": vmid,
        "name": name,
        "kind": kind,
        "status": status,
        "cpu_percent": cpu,
        "cpus": int(cpus) if cpus else None,
        "mem_bytes": used,
        "mem_max_bytes": total,
        "mem_percent": percent,
        "up_since": _timestamp(states, "uptime"),
        "disk_bytes": disk,
        "disk_max_bytes": disk_max,
        "disk_percent": disk_percent,
        "netin_bps": _round(netin) if running or status is None else None,
        "netout_bps": _round(netout) if running or status is None else None,
        "netin_bytes": netin_bytes,
        "netout_bytes": netout_bytes,
        "cpu_level": rules.cpu_level(cpu) if running else "unknown",
        "mem_level": rules.level(percent, *rules.MEMORY) if running else "unknown",
        "disk_level": rules.level(disk_percent, *rules.DISK),
    }


def _storage(node: str, name: str, states: States) -> dict[str, Any]:
    used = _number(states, "storage_used", _BYTES)
    total = _number(states, "storage_total", _BYTES)
    percent = _number(states, "storage_used_percentage")
    if percent is None:
        percent = _percent(used, total)
    return {
        "name": name,
        "node": node,
        "used_bytes": used,
        "total_bytes": total,
        "percent": percent,
        "active": _binary(states, "storage_active"),
        "level": rules.level(percent, *rules.DISK),
    }


def _backup(node: States, max_age_days: float) -> dict[str, Any] | None:
    # The integration's backup status is a `problem` binary sensor: on = failed, off = OK.
    problem = _binary(node, "node_backup_status")
    last = _timestamp(node, "node_backup_last_backup")
    backup = {
        "ok": None if problem is None else not problem,
        "last": last,
        "duration_s": _number(node, "node_backup_duration", _DURATION),
    }
    if all(value is None for value in backup.values()):
        return None
    parsed = dt_util.parse_datetime(last) if last else None
    age = max(0, (dt_util.utcnow() - dt_util.as_utc(parsed)).days) if parsed else None
    return {
        **backup,
        "age_days": age,
        "max_age_days": max_age_days,
        "age_level": rules.backup_age_level(age, max_age_days),
    }


def _node(name: str, states: States) -> dict[str, Any]:
    used = _number(states, "node_memory", _BYTES)
    total = _number(states, "node_max_memory", _BYTES)
    percent = _number(states, "node_memory_percentage")
    disk = _number(states, "node_disk", _BYTES)
    disk_max = _number(states, "node_max_disk", _BYTES)
    cpus = _number(states, "node_max_cpu")
    return {
        "name": name,
        "status": _node_status(states),
        "up_since": _timestamp(states, "node_uptime") or _timestamp(states, "uptime"),
        "cpu_percent": _number(states, "node_cpu"),
        "cpus": int(cpus) if cpus else None,
        "mem_bytes": used,
        "mem_max_bytes": total,
        "mem_percent": percent if percent is not None else _percent(used, total),
        "disk_bytes": disk,
        "disk_max_bytes": disk_max,
        "disk_percent": _percent(disk, disk_max),
    }


def build_proxmox(
    hass: HomeAssistant,
    backup_max_age_days: float = rules.BACKUP_MAX_AGE_DAYS,
    rates: CounterRates | None = None,
) -> dict[str, Any]:
    entries = hass.config_entries.async_entries(PROXMOX)
    result: dict[str, Any] = {
        "status": "off",
        "node": None,
        "guests": [],
        "storages": [],
        "backup": None,
    }
    if not entries:
        return result

    entry_id = entries[0].entry_id
    devices = dr.async_get(hass)
    reg = er.async_get(hass)
    nodes: dict[str, States] = {}
    guests: dict[tuple[int, str], States] = {}
    names: dict[tuple[int, str], str] = {}
    running: dict[int, State] = {}
    storage_entities: list[tuple[str, str | None, str, State | None]] = []
    prefix = f"{entry_id}_"
    for ent in er.async_entries_for_config_entry(reg, entry_id):
        if ent.platform != PROXMOX or not ent.unique_id.startswith(prefix):
            continue
        if ent.domain not in ("sensor", "binary_sensor"):
            continue

        suffix = ent.unique_id[len(prefix) :]
        key = ent.translation_key
        if key is None and ent.domain == "sensor" and suffix.endswith("_uptime"):
            key = (
                "node_uptime"
                if suffix.startswith("node/") and suffix.endswith("_node_uptime")
                else "uptime"
            )
        if not key or not suffix.endswith(f"_{key}"):
            continue
        identity = suffix[: -len(key) - 1]
        state = hass.states.get(ent.entity_id) if not ent.disabled else None
        if state is not None and state.state in _MISSING:
            state = None
        device = devices.async_get(ent.device_id) if ent.device_id else None

        if identity.startswith("node/"):
            node = nodes.setdefault(identity.removeprefix("node/"), {})
            if state:
                node[key] = state
        elif key.startswith("storage_"):
            storage_id = (
                next(
                    (
                        identifier.removeprefix(f"{prefix}storage_")
                        for domain, identifier in device.identifiers
                        if domain == PROXMOX and identifier.startswith(f"{prefix}storage_")
                    ),
                    None,
                )
                if device
                else None
            )
            storage_entities.append((identity, storage_id, key, state))
        elif match := _GUEST.fullmatch(suffix):
            vmid, guest_type, metric = match.groups()
            if key != f"{guest_type}_{metric}" and (key, metric) != ("uptime", "uptime"):
                continue
            guest_id = (int(vmid), "vm" if guest_type == "vm" else "ct")
            states = guests.setdefault(guest_id, {})
            if device and (name := device.name_by_user or device.name):
                names[guest_id] = name
            if state:
                states[metric] = state
        elif key == "status" and ent.domain == "binary_sensor" and identity.isdecimal():
            vmid = int(identity)
            if state:
                running[vmid] = state
            if device:
                for kind, guest_type in (("vm", "vm"), ("ct", "container")):
                    if (PROXMOX, f"{prefix}{guest_type}_{vmid}") in device.identifiers:
                        guests.setdefault((vmid, kind), {})
                        if name := device.name_by_user or device.name:
                            names[(vmid, kind)] = name

    storages: dict[tuple[str, str], States] = {}
    for identity, storage_id, key, state in storage_entities:
        if storage_id and identity.endswith(f"_{storage_id}"):
            node_name = identity[: -len(storage_id) - 1]
        else:
            node_name = max(
                (name for name in nodes if identity.startswith(f"{name}_")),
                key=len,
                default=identity.partition("_")[0],
            )
            storage_id = identity[len(node_name) + 1 :]
        states = storages.setdefault((node_name, storage_id), {})
        if state:
            states[key] = state

    # Expose one node, prioritising a reported outage over other nodes in the entry.
    node_name = min(
        nodes,
        key=lambda name: (
            _node_status(nodes[name]) != "offline",
            not bool(nodes[name]),
            name,
        ),
        default=None,
    )
    if node_name is not None:
        node = nodes[node_name]
        result["node"] = _node(node_name, node)
        result["backup"] = _backup(node, backup_max_age_days)

    for (vmid, kind), states in sorted(guests.items()):
        if vmid in running:
            states["running"] = running[vmid]
        name = names.get((vmid, kind), str(vmid))
        result["guests"].append(_guest(vmid, kind, name, states, rates))
    if rates is not None:
        rates.prune({(vmid, kind, way) for vmid, kind in guests for way in ("in", "out")})
    # Running first, busiest CPU on top; stopped guests by ID at the end.
    result["guests"].sort(
        key=lambda guest: (guest["status"] != "running", -(guest["cpu_percent"] or 0))
    )
    result["storages"] = [_storage(*key, states) for key, states in sorted(storages.items())]
    live = any(nodes.values()) or any(guests.values()) or any(storages.values())
    result["status"] = "ok" if live else "down"
    return result


def guest_entities(hass: HomeAssistant, vmid: int, kind: str) -> dict[str, str]:
    """``{"cpu", "memory"}`` → entity_id of one guest's CPU % and RAM % sensors (for history)."""
    entries = hass.config_entries.async_entries(PROXMOX)
    if not entries:
        return {}
    prefix = f"{entries[0].entry_id}_{vmid}_{'vm' if kind == 'vm' else 'container'}_"
    wanted = {f"{prefix}cpu": "cpu", f"{prefix}memory_percentage": "memory"}
    reg = er.async_get(hass)
    return {
        wanted[ent.unique_id]: ent.entity_id
        for ent in er.async_entries_for_config_entry(reg, entries[0].entry_id)
        if ent.platform == PROXMOX
        and ent.domain == "sensor"
        and not ent.disabled
        and ent.unique_id in wanted
    }


def _node_status(states: States) -> str | None:
    return _value(states, "node_status") or {True: "online", False: "offline"}.get(
        _binary(states, "status")
    )
