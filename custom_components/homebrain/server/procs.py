"""Proxmox VMs from the Glances process list: ``kvm`` processes with ``-id``/``-name``."""

from __future__ import annotations

import re
import shlex
from collections.abc import Iterable, Mapping
from typing import Any

_PIDFILE = re.compile(r"/qemu-server/(\d+)\.pid$")
_BINARIES = ("kvm", "qemu-system-x86_64", "qemu-kvm")


def _argv(cmdline: Any) -> list[str]:
    if isinstance(cmdline, str):
        try:
            return shlex.split(cmdline)
        except ValueError:
            return cmdline.split()
    if isinstance(cmdline, (list, tuple)):
        return [str(part) for part in cmdline]
    return []


def _value(argv: list[str], flag: str) -> str | None:
    try:
        i = argv.index(flag)
    except ValueError:
        return None
    return argv[i + 1] if i + 1 < len(argv) else None


def parse_kvm(cmdline: Any) -> dict[str, Any] | None:
    """``{"vmid", "name"}`` of a Proxmox/QEMU VM process, ``None`` for anything else."""
    argv = _argv(cmdline)
    if not argv or not argv[0].rsplit("/", 1)[-1].startswith(_BINARIES):
        return None
    raw_id = _value(argv, "-id")
    vmid: int | None = int(raw_id) if raw_id and raw_id.isdigit() else None
    if vmid is None and raw_id is None:
        match = _PIDFILE.search(_value(argv, "-pidfile") or "")
        vmid = int(match.group(1)) if match else None
    if vmid is None:
        return None
    name = (_value(argv, "-name") or "").split(",", 1)[0]
    if name.startswith("guest="):
        name = name[len("guest=") :]
    return {"vmid": vmid, "name": name or f"VM {vmid}"}


def _rss(info: Any) -> int:
    if isinstance(info, Mapping):
        value = info.get("rss")
    elif isinstance(info, (list, tuple)) and info:
        value = info[0]
    else:
        value = None
    return int(value) if isinstance(value, (int, float)) and value >= 0 else 0


def vms_from_processes(
    processes: Iterable[Mapping[str, Any]], total_bytes: float | None = None
) -> list[dict[str, Any]]:
    """One row per VM (duplicate processes of a vmid merged), largest RAM first."""
    rows: dict[int, dict[str, Any]] = {}
    for proc in processes:
        if not isinstance(proc, Mapping):
            continue
        vm = parse_kvm(proc.get("cmdline"))
        if vm is None:
            continue
        cpu = proc.get("cpu_percent")
        cpu = float(cpu) if isinstance(cpu, (int, float)) else 0.0
        row = rows.setdefault(vm["vmid"], {**vm, "cpu_percent": 0.0, "mem_bytes": 0})
        row["cpu_percent"] = round(row["cpu_percent"] + cpu, 1)
        row["mem_bytes"] = max(row["mem_bytes"], _rss(proc.get("memory_info")))
    out = []
    for row in rows.values():
        pct = row["mem_bytes"] / total_bytes * 100 if total_bytes else None
        out.append({**row, "mem_percent": round(pct, 1) if pct is not None else None})
    return sorted(out, key=lambda r: (-r["mem_bytes"], r["vmid"]))
