"""Normalise raw UniFi API answers (pure). MAC keys stay inside the backend."""

from __future__ import annotations

from typing import Any, Final

BANDS: Final = {"ng": "2.4", "na": "5", "6e": "6"}
KINDS: Final = {"uap": "ap", "usw": "switch"}


def _int(value: Any) -> int | None:
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return None


def _float(value: Any) -> float | None:
    try:
        number = round(float(value), 1)
    except (TypeError, ValueError):
        return None
    return number or None  # 0 W = no PoE device (same as the HA sensors)


def _mac(value: Any) -> str | None:
    return str(value).lower() if value else None


def _radio(r: dict[str, Any]) -> dict[str, Any] | None:
    band = BANDS.get(str(r.get("radio")))
    total = _int(r.get("cu_total"))
    if band is None or r.get("channel") is None:
        return None
    own = (_int(r.get("cu_self_rx")) or 0) + (_int(r.get("cu_self_tx")) or 0)
    satisfaction = _int(r.get("satisfaction"))
    return {
        "band": band,
        "channel": _int(r.get("channel")),
        "utilization_pct": total,
        "self_pct": own if total is not None else None,
        "interference_pct": max(0, total - own) if total is not None else None,
        "clients": _int(r.get("num_sta")),
        "satisfaction": satisfaction if satisfaction is not None and satisfaction >= 0 else None,
    }


def _device(d: dict[str, Any]) -> dict[str, Any]:
    up = d.get("uplink") or {}
    wireless = up.get("type") == "wireless"
    ports = [
        {
            "n": _int(p.get("port_idx")),
            "up": bool(p.get("up")),
            "speed_mbps": _int(p.get("speed")) if p.get("up") and _int(p.get("speed")) else None,
            "poe_w": _float(p.get("poe_power")),
            "link_down_count": _int(p.get("link_down_count")),
            "uplink": bool(p.get("is_uplink")),
        }
        for p in d.get("port_table") or []
        if _int(p.get("port_idx")) is not None
    ]
    radios = [r for r in (_radio(x) for x in d.get("radio_table_stats") or []) if r]
    return {
        "kind": KINDS.get(str(d.get("type")), "other"),
        "uplink": {
            "type": "mesh" if wireless else "wired",
            "mac": _mac(up.get("uplink_mac")),
            "port": None if wireless else _int(up.get("uplink_remote_port")),
            "speed_mbps": None if wireless else _int(up.get("speed")),
            "max_mbps": None if wireless else _int(up.get("max_speed")),
            "signal_dbm": _int(up.get("signal")) if wireless else None,
        }
        if up
        else None,
        "ports": sorted(ports, key=lambda p: p["n"]),
        "radios": sorted(radios, key=lambda r: float(r["band"])),
    }


def _client(c: dict[str, Any]) -> dict[str, Any]:
    wired = bool(c.get("is_wired"))
    return {
        "wired": wired,
        "signal_dbm": None if wired else _int(c.get("signal")),
        "band": None if wired else BANDS.get(str(c.get("radio"))),
        "ap_mac": None if wired else _mac(c.get("ap_mac")),
        "sw_mac": _mac(c.get("sw_mac")) if wired else None,
        "sw_port": _int(c.get("sw_port")) if wired else None,
    }


def parse_unifi(raw: dict[str, Any]) -> dict[str, Any]:
    me = next(iter(raw.get("self") or []), {}) or {}
    role = me.get("site_role")
    return {
        "role": role,
        "readonly": role == "readonly" and not me.get("is_super"),
        "devices": {
            mac: _device(d) for d in raw.get("devices") or [] if (mac := _mac(d.get("mac")))
        },
        "clients": {
            mac: _client(c) for c in raw.get("clients") or [] if (mac := _mac(c.get("mac")))
        },
    }
