"""Enrich the HA-based Síť snapshot with UniFi API data (pure).

Pairing is by MAC through the HA device registry (``macs`` from ``build_snapshot``); the
snapshot itself keeps HA device ids and the hashed client ids, so no MAC/IP leaves the backend.
"""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any

LINK_KEYS = ("type", "port", "speed_mbps", "max_mbps", "signal_dbm")


def enrich_snapshot(
    snap: dict[str, Any],
    data: Mapping[str, Any],
    macs: Mapping[str, Mapping[str, str]],
    link_downs: Mapping[str, int],
) -> dict[str, Any]:
    dev_ids = macs.get("devices", {})
    cli_ids = macs.get("clients", {})
    items = {d["id"]: d for d in [*snap.get("aps", []), *snap.get("switches", [])]}

    for mac, unifi in (data.get("devices") or {}).items():
        item = items.get(dev_ids.get(mac, ""))
        if item is None:
            continue
        up = unifi.get("uplink")
        if up:
            parent = items.get(dev_ids.get(up.get("mac") or "", ""))
            if parent is not None and parent["id"] != item["id"]:
                item["uplink"] = {"id": parent["id"], "name": parent["name"]}
            item["link"] = {key: up.get(key) for key in LINK_KEYS}
        if unifi.get("ports"):
            item["ports"] = [
                {
                    "n": p["n"],
                    "speed_mbps": p["speed_mbps"],
                    "poe_w": p["poe_w"],
                    "up": p["up"],
                    "link_down_24h": link_downs.get(f"{mac}:{p['n']}"),
                }
                for p in unifi["ports"]
            ]
            if isinstance(item.get("poe"), dict):
                item["poe"]["used_w"] = round(sum(p["poe_w"] or 0 for p in item["ports"]), 1)
        if unifi.get("radios"):
            item["radios"] = [dict(r) for r in unifi["radios"]]

    clients = {c["id"]: c for c in snap.get("clients", [])}
    for mac, unifi in (data.get("clients") or {}).items():
        client = clients.get(cli_ids.get(mac, ""))
        if client is None:
            continue
        if unifi.get("wired"):
            switch = items.get(dev_ids.get(unifi.get("sw_mac") or "", ""))
            client["wired"] = True
            if switch is not None:
                client["switch_id"] = switch["id"]
                client["switch_port"] = unifi.get("sw_port")
            continue
        client["signal_dbm"] = unifi.get("signal_dbm")
        client["band"] = unifi.get("band")
        ap = items.get(dev_ids.get(unifi.get("ap_mac") or "", ""))
        if ap is not None and not client.get("ap_id"):
            client["ap_id"] = ap["id"]

    snap["source"] = "ha+unifi"
    return snap
