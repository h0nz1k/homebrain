"""Build the Síť snapshot from HA registries + states (UniFi and ping integrations).

Pairing is done by ``device_id`` + ``translation_key`` + ``unique_id`` – never by entity_id,
which users rename freely (and which can point to a different device than its name says).
Only public helpers are used (entity/device/area/floor registry, ``hass.states``).
"""

from __future__ import annotations

import hashlib
import ipaddress
import re
import time
from collections import defaultdict, deque
from collections.abc import Iterable, Mapping
from typing import Any, Final

from homeassistant.core import Event, HomeAssistant, callback
from homeassistant.helpers import area_registry as ar
from homeassistant.helpers import device_registry as dr
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers import floor_registry as fr

from .models import DEFAULT_MEM_THRESHOLD, model_info

UNIFI: Final = "unifi"
PING: Final = "ping"
OUTDOOR: Final = "outdoor"
FLAP_WINDOW_S: Final = 24 * 3600
# translation_keys that mark a UniFi infrastructure device (AP / switch).
INFRA_KEYS: Final = frozenset(
    {"device_state", "device_clients", "device_cpu_utilization", "device_memory_utilization"}
)
PORT_KEYS: Final = frozenset({"port_poe_power", "port_link_speed"})


def client_id(raw: str) -> str:
    """Stable, non-reversible client id (never the MAC)."""
    return hashlib.sha256(f"homebrain-network:{raw}".encode()).hexdigest()[:12]


def _num(value: Any) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if number == number else None  # NaN


def _ts(dt: Any) -> float | None:
    return dt.timestamp() if dt is not None else None


def _port_no(unique_id: str) -> int | None:
    tail = unique_id.rsplit("_", 1)[-1]
    return int(tail) if tail.isdigit() else None


def _macs(device: dr.DeviceEntry | None) -> set[str]:
    if device is None:
        return set()
    return {v.lower() for k, v in device.connections if k == dr.CONNECTION_NETWORK_MAC}


class FlapTracker:
    """Counts connected -> other transitions of UniFi ``device_state`` sensors (24 h, in memory).

    V1 keeps the history in memory (it restarts empty with HA); V2 reads UniFi's event log.
    """

    def __init__(self) -> None:
        self._events: dict[str, deque[float]] = defaultdict(deque)

    def record(self, device_id: str, when: float) -> None:
        self._events[device_id].append(when)

    def count(self, device_id: str, now: float) -> int:
        events = self._events.get(device_id)
        if not events:
            return 0
        while events and now - events[0] > FLAP_WINDOW_S:
            events.popleft()
        return len(events)

    @callback
    def async_listen(self, hass: HomeAssistant) -> Any:
        registry = er.async_get(hass)

        @callback
        def _changed(event: Event) -> None:
            old, new = event.data.get("old_state"), event.data.get("new_state")
            if old is None or new is None or old.state != "connected" or new.state == "connected":
                return
            entry = registry.async_get(event.data["entity_id"])
            if entry and entry.platform == UNIFI and entry.translation_key == "device_state":
                if entry.device_id:
                    self.record(entry.device_id, time.time())

        return hass.bus.async_listen("state_changed", _changed)


_MINUS_RE: Final = re.compile(r"(^|[\s(])-(?=\d)")


def _floors(hass: HomeAssistant) -> list[dict[str, Any]]:
    floors = sorted(
        fr.async_get(hass).async_list_floors(),
        key=lambda f: (f.level if f.level is not None else 0, f.name),
        reverse=True,
    )
    # „-1. patro“ → „−1. patro“ (U+2212) so problem copy uses a real minus sign.
    out = [
        {"id": f.floor_id, "name": _MINUS_RE.sub("\\1\u2212", f.name), "level": f.level}
        for f in floors
    ]
    return out


def _place(hass: HomeAssistant, device: dr.DeviceEntry | None, entry: er.RegistryEntry | None):
    area_id = (entry.area_id if entry else None) or (device.area_id if device else None)
    if not area_id:
        return None, None
    area = ar.async_get(hass).async_get_area(area_id)
    if area is None:
        return None, None
    return area.name, area.floor_id or OUTDOOR


def _private_host(host: str) -> bool:
    try:
        return ipaddress.ip_address(host).is_private
    except ValueError:
        return False


def _ping_entries(
    hass: HomeAssistant, entities: Iterable[er.RegistryEntry]
) -> dict[str, tuple[bool, list[er.RegistryEntry]]]:
    """ping config entries -> (pings a private LAN host, its entities)."""
    by_entry: dict[str, list[er.RegistryEntry]] = defaultdict(list)
    for e in entities:
        if e.platform == PING and e.config_entry_id and not e.disabled_by:
            by_entry[e.config_entry_id].append(e)
    out = {}
    for entry_id, items in by_entry.items():
        cfg = hass.config_entries.async_get_entry(entry_id)
        host = str((cfg.options.get("host") or cfg.data.get("host")) if cfg else "")
        out[entry_id] = (bool(host) and _private_host(host), items)
    return out


def _ping_status(hass: HomeAssistant, chosen: Iterable[er.RegistryEntry]) -> dict[str, Any]:
    out: dict[str, Any] = {
        "online": None,
        "since": None,
        "latency_ms": None,
        "jitter_ms": None,
        "loss_pct": None,
    }
    for e in chosen:
        state = hass.states.get(e.entity_id)
        if state is None:
            continue
        if e.domain == "binary_sensor":
            out["online"] = state.state == "on" if state.state in ("on", "off") else None
            out["since"] = _ts(state.last_changed)
        elif e.translation_key == "round_trip_time_avg":
            out["latency_ms"] = _num(state.state)
        elif e.translation_key == "round_trip_time_mdev":
            out["jitter_ms"] = _num(state.state)
    return out


def _internet(hass: HomeAssistant, entities: Iterable[er.RegistryEntry]) -> dict[str, Any] | None:
    """Pick the ping config entry that pings a public host; fallback = the first one."""
    pings = _ping_entries(hass, entities)
    if not pings:
        return None
    chosen = min(pings, key=lambda k: 1 if pings[k][0] else 0)
    return _ping_status(hass, pings[chosen][1])


def _gateway(hass: HomeAssistant, entities: Iterable[er.RegistryEntry]) -> dict[str, Any] | None:
    """The router = a ping config entry with a private (LAN) host, if there is one."""
    lan = [items for private, items in _ping_entries(hass, entities).values() if private]
    return _ping_status(hass, lan[0]) if lan else None


def build_snapshot(
    hass: HomeAssistant,
    options: Mapping[str, Any],
    flaps: FlapTracker | None = None,
    now: float | None = None,
) -> dict[str, Any]:
    """Network snapshot (no MAC/IP) for the admin view; ``rules.evaluate`` adds problems."""
    now = time.time() if now is None else now
    ents = er.async_get(hass)
    devs = dr.async_get(hass)
    all_entities = list(ents.entities.values())
    unifi = [e for e in all_entities if e.platform == UNIFI]
    by_device: dict[str, list[er.RegistryEntry]] = defaultdict(list)
    # Client trackers that HA creates disabled-by-default (and the user enables later) have no
    # device entry; they are still clients and must be listed (e.g. robots, locks, tablets).
    loose_trackers: list[er.RegistryEntry] = []
    for e in unifi:
        if e.device_id:
            by_device[e.device_id].append(e)
        elif e.domain == "device_tracker":
            loose_trackers.append(e)

    important_cfg = {
        item["id"]: item for item in options.get("important", []) if isinstance(item, Mapping)
    }
    floors = _floors(hass)
    aps: list[dict[str, Any]] = []
    switches: list[dict[str, Any]] = []
    ssids: list[dict[str, Any]] = []
    mac_owner: dict[str, dict[str, Any]] = {}
    uplink_macs: dict[str, str] = {}
    trackers: list[er.RegistryEntry] = list(loose_trackers)

    for device_id, entities in by_device.items():
        keys = {e.translation_key for e in entities}
        device = devs.async_get(device_id)
        if "wlan_clients" in keys:
            e = next(e for e in entities if e.translation_key == "wlan_clients")
            st = hass.states.get(e.entity_id)
            name = (device.name_by_user or device.name) if device else e.original_name
            ssids.append(
                {
                    "name": name or "Wi-Fi",
                    "clients": int(_num(st.state) or 0) if st else None,
                    "guest": any(w in (name or "").lower() for w in ("guest", "host")),
                }
            )
            continue
        if not keys & INFRA_KEYS:
            trackers.extend(e for e in entities if e.domain == "device_tracker")
            continue
        model_code = device.model if device else None
        info = model_info(model_code)
        has_ports = bool(keys & PORT_KEYS)
        kind = (
            info.kind
            if info
            else ("switch" if has_ports and "device_uplink_mac" not in keys else "ap")
        )
        area, floor_id = _place(hass, device, None)
        item: dict[str, Any] = {
            "id": device_id,
            "name": (device.name_by_user or device.name) if device else device_id,
            "model": model_code,
            "model_label": info.label if info else (device.model if device else None),
            "area": area,
            "floor_id": floor_id,
            "state": None,
            "state_since": None,
            "clients": None,
            "cpu_pct": None,
            "mem_pct": None,
            "mem_threshold": info.mem_threshold if info else DEFAULT_MEM_THRESHOLD,
            "max_link_mbps": info.max_link_mbps if info else 1000,
            "uptime_since": None,
            "uplink": None,
            "uplink_known": "device_uplink_mac" in keys,
            "fw": None,
            "flaps_24h": flaps.count(device_id, now) if flaps else 0,
            "ports": [],
        }
        ports: dict[int, dict[str, Any]] = {}
        for e in entities:
            st = hass.states.get(e.entity_id)
            tk = e.translation_key
            if e.domain == "update":
                if st is not None:
                    item["fw"] = {
                        "installed": st.attributes.get("installed_version"),
                        "latest": st.attributes.get("latest_version"),
                        "update": st.state == "on",
                    }
                continue
            if tk in PORT_KEYS:
                n = _port_no(e.unique_id)
                if n is None:
                    continue
                port = ports.setdefault(n, {"n": n, "speed_mbps": None, "poe_w": None})
                value = _num(st.state) if st else None
                if tk == "port_poe_power":
                    port["poe_w"] = value
                else:
                    port["speed_mbps"] = int(value) if value is not None else None
                continue
            if st is None:
                continue
            if tk == "device_state":
                item["state"] = st.state
                item["state_since"] = _ts(st.last_changed)
            elif tk == "device_clients":
                v = _num(st.state)
                item["clients"] = int(v) if v is not None else None
            elif tk == "device_cpu_utilization":
                item["cpu_pct"] = _num(st.state)
            elif tk == "device_memory_utilization":
                item["mem_pct"] = _num(st.state)
            elif tk == "device_uptime":
                item["uptime_since"] = st.state
            elif tk == "device_uplink_mac" and st.state not in ("unknown", "unavailable"):
                uplink_macs[device_id] = st.state.lower()
        item["ports"] = [ports[n] for n in sorted(ports)]
        if kind == "switch":
            used = sum(p["poe_w"] or 0 for p in item["ports"])
            item["poe"] = {
                "used_w": round(used, 1),
                "budget_w": info.poe_budget_w if info else None,
            }
            switches.append(item)
        else:
            aps.append(item)
        for mac in _macs(device):
            mac_owner[mac] = item

    for ap_id, mac in uplink_macs.items():
        parent = mac_owner.get(mac)
        ap = next((a for a in aps + switches if a["id"] == ap_id), None)
        if parent and ap:
            ap["uplink"] = {"id": parent["id"], "name": parent["name"]}

    clients = []
    for e in trackers:
        st = hass.states.get(e.entity_id)
        if st is None or e.disabled_by:
            continue
        device = devs.async_get(e.device_id) if e.device_id else None
        cid = client_id(e.device_id or e.unique_id)
        ap = mac_owner.get(str(st.attributes.get("ap_mac", "")).lower())
        area, floor_id = _place(hass, device, e)
        cfg = important_cfg.get(cid, {})
        clients.append(
            {
                "id": cid,
                "label": cfg.get("label")
                or (device.name_by_user or device.name if device else None)
                or st.name,
                "wired": st.attributes.get("essid") is None,
                "ssid": st.attributes.get("essid"),
                "ap_id": ap["id"] if ap else None,
                "area": area,
                "floor_id": floor_id,
                "online": st.state == "home",
                "since": _ts(st.last_changed),
                "ap_since": _ts(st.last_updated),
                "important": cid in important_cfg,
                "expected_floor_id": cfg.get("expected_floor_id"),
            }
        )
    clients.sort(key=lambda c: (not c["important"], not c["online"], str(c["label"]).lower()))

    if any(a["floor_id"] == OUTDOOR for a in aps):
        floors.append({"id": OUTDOOR, "name": "Venku", "level": None})
    return {
        "updated_at": now,
        "source": "ha",
        "internet": _internet(hass, all_entities),
        "gateway": _gateway(hass, all_entities),
        "floors": floors,
        "aps": sorted(aps, key=lambda a: (-(a["clients"] or 0), a["name"])),
        "switches": sorted(switches, key=lambda s: s["name"]),
        "ssids": ssids,
        "clients": clients,
    }
