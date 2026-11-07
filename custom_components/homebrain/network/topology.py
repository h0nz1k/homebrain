"""Síť topology graph (pure): Internet → gateway → switches → APs → clients.

V1 uses Home Assistant data only (``build_snapshot``): AP parents come from the UniFi
``device_uplink_mac`` sensor, mesh = the parent is another AP. Whatever HA cannot prove is
drawn with ``assumed=True`` (switch uplinks into a non-UniFi gateway, wired clients).
Optional edge fields (``port``, ``speed_mbps``, ``poe_w``, ``signal_dbm``) stay ``None`` until
a source knows them – V2 (own read-only UniFi account) only fills them in.
"""

from __future__ import annotations

from collections.abc import Iterable, Mapping
from typing import Any, Final

DEFAULT_GATEWAY_LABEL: Final = "Router"
INTERNET: Final = "internet"
GATEWAY: Final = "gateway"
SEVERITY_RANK: Final = {"critical": 0, "warning": 1, "notice": 2, "info": 3}

Graph = dict[str, Any]


def _status(state: Any) -> str:
    if state is None:
        return "unknown"
    return "ok" if state in ("connected", True) else "offline"


def _edge(
    src: str,
    dst: str,
    kind: str = "wired",
    *,
    assumed: bool = False,
    port: int | None = None,
    speed: int | None = None,
    max_mbps: int | None = None,
    poe: float | None = None,
    signal: int | None = None,
) -> dict[str, Any]:
    return {
        "from": src,
        "to": dst,
        "type": kind,
        "assumed": assumed,
        "port": port,
        "speed_mbps": speed,
        "max_mbps": max_mbps,
        "poe_w": poe,
        "signal_dbm": signal,
        # 100 Mb/s on a gigabit-capable link = bad cable/pair (red in the UI).
        "slow": bool(speed and speed < 1000 and (max_mbps or 1000) >= 1000),
    }


def _ap_link(ap: Mapping[str, Any], parent: Mapping[str, Any] | None, siblings: int):
    """(port, speed, poe) for a wired AP – only where the match is unambiguous."""
    if parent is not None and siblings == 1:
        powered = [p for p in parent.get("ports", []) if p.get("poe_w")]
        if len(powered) == 1:
            p = powered[0]
            return p["n"], p.get("speed_mbps"), p.get("poe_w")
    own = [p for p in ap.get("ports", []) if p.get("speed_mbps")]
    if len(own) == 1:  # the AP's own single port („PoE In + Data“)
        return None, own[0]["speed_mbps"], None
    return None, None, None


def _port_poe(parent: Mapping[str, Any] | None, port: int | None) -> float | None:
    for p in (parent or {}).get("ports", []):
        if p.get("n") == port:
            return p.get("poe_w")
    return None


def _port_speed(parent: Mapping[str, Any] | None, port: int | None) -> int | None:
    for p in (parent or {}).get("ports", []):
        if p.get("n") == port:
            return p.get("speed_mbps")
    return None


def _severity(problems: Iterable[Mapping[str, Any]]) -> dict[str, list[Mapping[str, Any]]]:
    out: dict[str, list[Mapping[str, Any]]] = {}
    for p in problems:
        target = p.get("target") or {}
        kind, tid = target.get("kind"), str(target.get("id", ""))
        if kind == "internet":
            node = INTERNET
        elif kind == "gateway":
            node = GATEWAY
        elif kind in ("port", "radio"):
            node = tid.rsplit(":", 1)[0]
        elif kind == "client":
            node = f"client:{tid}"
        else:
            node = tid
        out.setdefault(node, []).append(p)
    return out


def build_topology(
    snap: Mapping[str, Any],
    problems: Iterable[Mapping[str, Any]] | None = None,
    options: Mapping[str, Any] | None = None,
) -> Graph:
    options = options or {}
    nodes: list[dict[str, Any]] = []
    edges: list[dict[str, Any]] = []

    def node(id_: str, kind: str, label: str, parent: str | None, **extra: Any) -> None:
        nodes.append(
            {
                "id": id_,
                "kind": kind,
                "label": label,
                "parent": parent,
                "status": "unknown",
                "severity": None,
                "problem_ids": [],
                **extra,
            }
        )

    internet = snap.get("internet") or {}
    gateway = snap.get("gateway") or {}
    node(
        INTERNET,
        "internet",
        "Internet",
        None,
        status=_status(internet.get("online")),
        latency_ms=internet.get("latency_ms"),
    )
    node(
        GATEWAY,
        "gateway",
        str(options.get("gateway_label") or DEFAULT_GATEWAY_LABEL),
        INTERNET,
        status=_status(gateway.get("online")),
        latency_ms=gateway.get("latency_ms"),
    )
    edges.append(_edge(INTERNET, GATEWAY))

    switches = list(snap.get("switches") or [])
    aps = list(snap.get("aps") or [])
    devices = {d["id"]: d for d in switches + aps}
    ap_ids = {a["id"] for a in aps}

    for sw in sorted(switches, key=lambda s: s["name"]):
        up = str((sw.get("uplink") or {}).get("id") or "")
        parent = up if up in devices else GATEWAY
        node(
            sw["id"],
            "switch",
            sw["name"],
            parent,
            status=_status(sw.get("state")),
            model_label=sw.get("model_label"),
            ref={"kind": "switch", "id": sw["id"]},
        )
        link = sw.get("link") or {}
        edges.append(
            _edge(
                parent,
                sw["id"],
                assumed=parent == GATEWAY,
                port=link.get("port"),
                speed=link.get("speed_mbps"),
                max_mbps=link.get("max_mbps"),
            )
        )

    wired_children: dict[str, int] = {}
    for ap in aps:
        up = str((ap.get("uplink") or {}).get("id") or "")
        if up in devices and up not in ap_ids:
            wired_children[up] = wired_children.get(up, 0) + 1

    for ap in sorted(aps, key=lambda a: a["name"]):
        up = str((ap.get("uplink") or {}).get("id") or "")
        parent = up if up in devices else GATEWAY
        node(
            ap["id"],
            "ap",
            ap["name"],
            parent,
            status=_status(ap.get("state")),
            model_label=ap.get("model_label"),
            clients=ap.get("clients"),
            ref={"kind": "ap", "id": ap["id"]},
        )
        link = ap.get("link") or {}
        if parent in ap_ids:
            edges.append(_edge(parent, ap["id"], "mesh", signal=link.get("signal_dbm")))
            continue
        if link.get("type") == "wired" and link.get("speed_mbps"):
            port, speed = link.get("port"), link.get("speed_mbps")
            poe = _port_poe(devices.get(parent), port)
        else:
            port, speed, poe = _ap_link(ap, devices.get(parent), wired_children.get(parent, 0))
        edges.append(
            _edge(
                parent,
                ap["id"],
                assumed=parent == GATEWAY,
                port=port,
                speed=speed,
                max_mbps=ap.get("max_link_mbps"),
                poe=poe,
            )
        )

    drawn: dict[str, int] = {}
    others: dict[str, int] = {}
    for c in sorted(snap.get("clients") or [], key=lambda c: str(c.get("label")).lower()):
        ap_id = c.get("ap_id") if c.get("ap_id") in ap_ids else None
        if not c.get("important"):
            if ap_id and c.get("online"):
                others[ap_id] = others.get(ap_id, 0) + 1
            continue
        cid = f"client:{c['id']}"
        switch_id = c.get("switch_id") if c.get("switch_id") in devices else None
        parent = ap_id or switch_id or GATEWAY
        node(
            cid,
            "client",
            str(c.get("label")),
            parent,
            status="ok" if c.get("online") else "offline",
            wired=bool(c.get("wired")),
            ref={"kind": "client", "id": c["id"]},
        )
        if ap_id:
            if c.get("online"):
                drawn[ap_id] = drawn.get(ap_id, 0) + 1
            edges.append(_edge(ap_id, cid, "wireless", signal=c.get("signal_dbm")))
        elif switch_id:
            port = c.get("switch_port")
            edges.append(
                _edge(switch_id, cid, port=port, speed=_port_speed(devices[switch_id], port))
            )
        else:
            edges.append(
                _edge(GATEWAY, cid, "wired" if c.get("wired") else "wireless", assumed=True)
            )

    for ap in aps:
        rest = max((ap.get("clients") or 0) - drawn.get(ap["id"], 0), others.get(ap["id"], 0))
        if rest > 0:
            mid = f"more:{ap['id']}"
            node(mid, "more", f"+{rest}", ap["id"], status="ok", count=rest)
            edges.append(_edge(ap["id"], mid, "wireless"))

    by_node = _severity(problems or [])
    for n in nodes:
        found = sorted(by_node.get(n["id"], []), key=lambda p: SEVERITY_RANK.get(p["severity"], 9))
        if found:
            n["severity"] = found[0]["severity"]
            n["problem_ids"] = [p["id"] for p in found]

    return {
        "nodes": nodes,
        "edges": edges,
        "meta": {
            "source": snap.get("source") or "ha",
            "slow_links": sum(1 for e in edges if e["slow"]),
            "mesh": sum(1 for e in edges if e["type"] == "mesh"),
            "assumed": sum(1 for e in edges if e["assumed"]),
        },
    }
