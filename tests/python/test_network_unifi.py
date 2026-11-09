"""Síť V2: optional direct read-only UniFi connection (client, enrichment, rules, poller, flow).

All controller data here is synthetic (locally administered 02:… MACs from the V1 registry
fixture); no real names, MACs or addresses.
"""

from __future__ import annotations

import asyncio
import json
import logging
import re
from typing import Any
from unittest.mock import patch

import aiohttp
import pytest
from aiohttp import web
from aiohttp.test_utils import TestServer
from homeassistant import data_entry_flow
from homeassistant.core import HomeAssistant
from homeassistant.helpers import issue_registry as ir
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.setup import async_setup_component
from pytest_homeassistant_custom_component.common import MockConfigEntry
from test_network import NOW, install
from yarl import URL

from custom_components.homebrain.const import DOMAIN
from custom_components.homebrain.network import rules
from custom_components.homebrain.network.discovery import build_snapshot
from custom_components.homebrain.network.enrich import enrich_snapshot
from custom_components.homebrain.network.topology import build_topology
from custom_components.homebrain.network.unifi_client import (
    UnifiAuthError,
    UnifiClient,
    UnifiConfig,
)
from custom_components.homebrain.network.unifi_data import parse_unifi
from custom_components.homebrain.network.unifi_poller import (
    ISSUE_AUTH,
    PortHistory,
    UnifiPoller,
    async_validate_unifi,
)

SECRET = "s3cret-Pa55-for-tests"
MAC_RE = re.compile(r"(?i)\b[0-9a-f]{2}(:[0-9a-f]{2}){5}\b")


def _radio(radio: str, channel: int, total: int, rx: int = 0, tx: int = 0, sta: int = 0):
    return {
        "name": f"wifi{radio}",
        "radio": radio,
        "channel": channel,
        "cu_total": total,
        "cu_self_rx": rx,
        "cu_self_tx": tx,
        "num_sta": sta,
        "satisfaction": 98,
    }


def raw_fixture(**over: Any) -> dict[str, Any]:
    """stat/device + stat/sta + self, shaped like a Network Application 10.x answer."""
    devices = [
        {
            "mac": "02:00:00:00:00:04",
            "type": "usw",
            "model": "USL16LP",
            "uplink": {"type": "wire", "uplink_mac": "02:00:00:00:0f:ff", "speed": 1000},
            "port_table": [
                {"port_idx": 1, "up": True, "speed": 1000, "is_uplink": True},
                {"port_idx": 3, "up": True, "speed": 1000, "poe_power": "6.10"},
                {"port_idx": 5, "up": True, "speed": 100, "link_down_count": 2},
                {"port_idx": 7, "up": True, "speed": 1000, "link_down_count": 9},
                {"port_idx": 8, "up": False, "speed": 0},
            ],
        },
        {
            "mac": "02:00:00:00:00:01",
            "type": "uap",
            "model": "UAP6MP",
            "uplink": {
                "type": "wire",
                "uplink_mac": "02:00:00:00:00:04",
                "uplink_remote_port": 3,
                "speed": 1000,
                "max_speed": 1000,
            },
            "radio_table_stats": [_radio("ng", 1, 30, 5, 10, 4), _radio("na", 44, 72, 4, 6, 3)],
        },
        {
            "mac": "02:00:00:00:00:02",
            "type": "uap",
            "model": "U7PRO",
            "uplink": {
                "type": "wire",
                "uplink_mac": "02:00:00:00:00:05",
                "uplink_remote_port": 2,
                "speed": 2500,
                "max_speed": 2500,
            },
            "radio_table_stats": [_radio("ng", 6, 12, 2, 4, 2), _radio("na", 36, 20, 6, 8, 5)],
        },
        {
            "mac": "02:00:00:00:00:03",
            "type": "uap",
            "model": "UKPW",
            "uplink": {"type": "wireless", "uplink_mac": "02:00:00:00:00:02", "signal": -71},
            "radio_table_stats": [_radio("ng", 11, 8, 1, 2, 1), _radio("na", 36, 25, 9, 9, 1)],
        },
    ]
    clients = [
        {
            "mac": "02:00:00:00:00:10",
            "is_wired": False,
            "ap_mac": "02:00:00:00:00:02",
            "signal": -78,
            "radio": "na",
            "essid": "demo_home",
        },
        {"mac": "02:00:00:00:00:12", "is_wired": True, "sw_mac": "02:00:00:00:00:04", "sw_port": 7},
        {"mac": "02:00:00:00:00:99", "is_wired": False, "ap_mac": "02:00:00:00:00:01"},
    ]
    raw = {
        "self": [{"site_role": "readonly", "is_super": False}],
        "devices": devices,
        "clients": clients,
    }
    raw.update(over)
    return raw


async def _enriched(hass: HomeAssistant, important: list[str] | None = None, raw=None, downs=None):
    ids = install(hass)
    probe = build_snapshot(hass, {}, now=NOW)
    labels = {c["label"]: c["id"] for c in probe["clients"]}
    opts = {"important": [{"id": labels[name]} for name in (important or [])]}
    macs: dict[str, dict[str, str]] = {}
    snap = build_snapshot(hass, opts, now=NOW, macs=macs)
    enrich_snapshot(snap, parse_unifi(raw or raw_fixture()), macs, downs or {})
    return ids, labels, snap


# ---------------------------------------------------------------- enrichment + topology


async def test_enrichment_maps_by_mac_and_keeps_hashed_ids(hass: HomeAssistant):
    ids, labels, snap = await _enriched(hass, ["Tablet demo", "Notebook demo"])
    assert snap["source"] == "ha+unifi"
    aps = {a["id"]: a for a in snap["aps"]}
    living = aps[ids["ap_living"]]
    assert living["link"] == {
        "type": "wired",
        "port": 3,
        "speed_mbps": 1000,
        "max_mbps": 1000,
        "signal_dbm": None,
    }
    five = next(r for r in living["radios"] if r["band"] == "5")
    assert five == {
        "band": "5",
        "channel": 44,
        "utilization_pct": 72,
        "self_pct": 10,
        "interference_pct": 62,
        "clients": 3,
        "satisfaction": 98,
    }
    garden = aps[ids["ap_garden"]]
    assert garden["link"]["type"] == "mesh" and garden["link"]["signal_dbm"] == -71
    assert garden["uplink"]["id"] == ids["ap_office"]
    clients = {c["id"]: c for c in snap["clients"]}
    tablet = clients[labels["Tablet demo"]]
    assert tablet["signal_dbm"] == -78 and tablet["band"] == "5"
    laptop = clients[labels["Notebook demo"]]
    assert laptop["switch_id"] == ids["sw_main"] and laptop["switch_port"] == 7
    sw = next(s for s in snap["switches"] if s["id"] == ids["sw_main"])
    assert [p["n"] for p in sw["ports"]] == [1, 3, 5, 7, 8]
    assert sw["ports"][1]["poe_w"] == 6.1 and sw["ports"][4]["speed_mbps"] is None
    assert sw["poe"]["used_w"] == 6.1
    # nothing that identifies the LAN leaves the backend
    assert not MAC_RE.search(json.dumps(snap))


async def test_topology_edges_get_exact_port_speed_and_signal(hass: HomeAssistant):
    ids, labels, snap = await _enriched(hass, ["Tablet demo", "Notebook demo"])
    graph = build_topology(snap, [], {})
    edges = {(e["from"], e["to"]): e for e in graph["edges"]}
    mesh = edges[(ids["ap_office"], ids["ap_garden"])]
    assert mesh["type"] == "mesh" and mesh["signal_dbm"] == -71 and mesh["assumed"] is False
    wired = edges[(ids["sw_main"], ids["ap_living"])]
    assert (wired["port"], wired["speed_mbps"], wired["poe_w"]) == (3, 1000, 6.1)
    laptop = edges[(ids["sw_main"], f"client:{labels['Notebook demo']}")]
    assert laptop["assumed"] is False and laptop["port"] == 7 and laptop["speed_mbps"] == 1000
    tablet = edges[(ids["ap_office"], f"client:{labels['Tablet demo']}")]
    assert tablet["signal_dbm"] == -78
    assert graph["meta"]["source"] == "ha+unifi"
    assert not MAC_RE.search(json.dumps(graph))


# ---------------------------------------------------------------- V2 rules


async def test_v2_rules_on_enriched_snapshot(hass: HomeAssistant):
    ids, labels, snap = await _enriched(hass, ["Tablet demo"])
    found = {p["rule"]: p for p in rules.evaluate(snap, NOW)}
    assert found["mesh_weak"]["target"] == {"kind": "ap", "id": ids["ap_garden"]}
    assert "−71 dBm" in found["mesh_weak"]["context"]
    assert found["important_weak_signal"]["target"]["id"] == labels["Tablet demo"]
    assert found["channel_congested"]["target"]["id"] == f"{ids['ap_living']}:5"
    assert found["important_weak_signal"]["source"] == "v2"
    # office (36) is the mesh parent of garden (36): a mesh pair must share it → no warning
    assert "same_channel_neighbors" not in found
    for p in found.values():
        assert p["fix"] and p["title"]


def test_same_channel_neighbors_ignores_mesh_pairs():
    def ap(id_, ch, parent=None, mesh=False):
        return {
            "id": id_,
            "name": id_.upper(),
            "uplink": {"id": parent, "name": parent} if parent else None,
            "link": {"type": "mesh" if mesh else "wired"},
            "radios": [{"band": "5", "channel": ch, "utilization_pct": 10, "self_pct": 5}],
        }

    snap = {"aps": [ap("a", 36), ap("b", 36, "a", mesh=True), ap("c", 36), ap("d", 44)]}
    found = [p for p in rules.evaluate(snap, NOW) if p["rule"] == "same_channel_neighbors"]
    assert len(found) == 1
    assert "A" in found[0]["context"] and "C" in found[0]["context"]
    snap["aps"].pop(2)
    assert not [p for p in rules.evaluate(snap, NOW) if p["rule"] == "same_channel_neighbors"]


def test_channel_congested_needs_low_own_airtime():
    radio = {"band": "5", "channel": 44, "utilization_pct": 65, "self_pct": 30}
    snap = {"aps": [{"id": "a", "name": "A", "radios": [radio]}]}
    assert not [p for p in rules.evaluate(snap, NOW) if p["rule"] == "channel_congested"]
    radio["self_pct"] = 10
    assert [p for p in rules.evaluate(snap, NOW) if p["rule"] == "channel_congested"]


def test_port_flapping_uses_24h_delta():
    sw = {"id": "s", "name": "Switch", "max_link_mbps": 1000, "ports": []}
    sw["ports"] = [{"n": 5, "speed_mbps": 1000, "link_down_24h": 2}]
    assert not [p for p in rules.evaluate({"switches": [sw]}, NOW) if p["rule"] == "port_flapping"]
    sw["ports"][0]["link_down_24h"] = 3
    found = [p for p in rules.evaluate({"switches": [sw]}, NOW) if p["rule"] == "port_flapping"]
    assert found and found[0]["target"] == {"kind": "port", "id": "s:5"}


def test_port_history_delta_window_and_counter_reset():
    hist = PortHistory()
    hist.update("d:5", 10, NOW - 30 * 3600)  # older than the window → baseline only
    hist.update("d:5", 11, NOW - 20 * 3600)
    hist.update("d:5", 13, NOW - 1 * 3600)
    assert hist.delta("d:5", NOW) == 3
    hist.update("d:5", 1, NOW)  # switch rebooted → counter restarted
    assert hist.delta("d:5", NOW) == 4
    assert hist.delta("unknown", NOW) == 0
    restored = PortHistory.from_dict(json.loads(json.dumps(hist.as_dict())))
    assert restored.delta("d:5", NOW) == 4


# ---------------------------------------------------------------- client (both flavours)


def _controller(unifi_os: bool, role: str = "readonly") -> web.Application:
    prefix = "/proxy/network" if unifi_os else ""
    state: dict[str, Any] = {"logins": 0}

    async def root(request: web.Request) -> web.Response:
        if unifi_os:
            return web.Response(text="ok")
        raise web.HTTPFound("/manage")

    async def login(request: web.Request) -> web.Response:
        body = await request.json()
        state["logins"] += 1
        if body.get("password") != SECRET:
            return web.json_response({"meta": {"rc": "error"}}, status=401)
        headers = {"x-csrf-token": "tok"} if unifi_os else {}
        resp = web.json_response({"meta": {"rc": "ok"}, "data": []}, headers=headers)
        resp.set_cookie("unifises" if not unifi_os else "TOKEN", "cookie")
        return resp

    def guarded(payload: Any):
        async def handler(request: web.Request) -> web.Response:
            if "unifises" not in request.cookies and "TOKEN" not in request.cookies:
                return web.json_response({"meta": {"rc": "error"}}, status=401)
            if unifi_os and request.headers.get("x-csrf-token") != "tok":
                return web.json_response({"error": "csrf"}, status=403)
            return web.json_response({"meta": {"rc": "ok"}, "data": payload})

        return handler

    raw = raw_fixture()
    raw["self"][0]["site_role"] = role
    app = web.Application()
    app["state"] = state
    app.router.add_get("/", root)
    app.router.add_post("/api/auth/login" if unifi_os else "/api/login", login)
    app.router.add_get(f"{prefix}/api/s/default/self", guarded(raw["self"]))
    app.router.add_get(f"{prefix}/api/s/default/stat/device", guarded(raw["devices"]))
    app.router.add_get(f"{prefix}/api/s/default/stat/sta", guarded(raw["clients"]))
    return app


@pytest.mark.parametrize("unifi_os", [False, True])
async def test_client_reads_both_controller_flavours(
    hass: HomeAssistant, socket_enabled, unifi_os: bool
):
    server = TestServer(_controller(unifi_os))
    await server.start_server()
    try:
        cfg = UnifiConfig(str(server.make_url("")).rstrip("/"), "default", "homebrain", SECRET)
        async with aiohttp.ClientSession(cookie_jar=aiohttp.CookieJar(unsafe=True)) as session:
            client = UnifiClient(session, cfg)
            raw = await client.fetch()
        assert client.unifi_os is unifi_os
        parsed = parse_unifi(raw)
        assert parsed["readonly"] is True and len(parsed["devices"]) == 4
        assert SECRET not in repr(cfg)
    finally:
        await server.close()


async def test_client_rejects_wrong_password(hass: HomeAssistant, socket_enabled):
    server = TestServer(_controller(False))
    await server.start_server()
    try:
        cfg = UnifiConfig(str(server.make_url("")).rstrip("/"), "default", "homebrain", "wrong")
        async with aiohttp.ClientSession(cookie_jar=aiohttp.CookieJar(unsafe=True)) as session:
            with pytest.raises(UnifiAuthError) as err:
                await UnifiClient(session, cfg).fetch()
        assert "wrong" not in str(err.value)
    finally:
        await server.close()


def test_admin_role_is_not_readonly():
    assert parse_unifi(raw_fixture(self=[{"site_role": "admin"}]))["readonly"] is False
    assert (
        parse_unifi(raw_fixture(self=[{"site_role": "readonly", "is_super": True}]))["readonly"]
        is False
    )


# ---------------------------------------------------------------- poller, repair, secrecy


class FakeClient:
    def __init__(self, results: list[Any]) -> None:
        self.results = results

    async def fetch(self) -> dict[str, Any]:
        result = self.results.pop(0)
        if isinstance(result, Exception):
            raise result
        return result

    async def close(self) -> None:
        return None


async def test_poller_raises_and_clears_repair_issue(hass: HomeAssistant, caplog):
    caplog.set_level(logging.DEBUG)
    cfg = UnifiConfig("https://unifi.example", "default", "homebrain", SECRET)
    poller = UnifiPoller(hass, cfg, client=FakeClient([UnifiAuthError("login"), raw_fixture()]))
    await poller.async_poll_once()
    issues = ir.async_get(hass)
    assert issues.async_get_issue(DOMAIN, ISSUE_AUTH) is not None
    assert poller.status()["status"] == "auth_failed"
    assert poller.next_delay() > 60
    await poller.async_poll_once()
    assert issues.async_get_issue(DOMAIN, ISSUE_AUTH) is None
    assert poller.status() == {
        "configured": True,
        "status": "ok",
        "updated_at": poller.status()["updated_at"],
        "readonly": True,
    }
    assert poller.next_delay() == 60
    assert SECRET not in caplog.text


async def test_ws_never_sends_credentials_and_reports_source(hass: HomeAssistant, hass_ws_client):
    install(hass)
    entry = MockConfigEntry(
        domain=DOMAIN,
        options={
            "network_unifi": {
                "url": "https://unifi.example",
                "site": "default",
                "username": "homebrain",
                "password": SECRET,
                "verify_ssl": False,
            }
        },
    )
    entry.add_to_hass(hass)
    with patch(
        "custom_components.homebrain.network.unifi_poller.UnifiPoller.async_start",
        autospec=True,
    ):
        assert await async_setup_component(hass, DOMAIN, {})
        await hass.async_block_till_done()
    poller = hass.data[DOMAIN]["network_unifi"]
    poller._apply(raw_fixture(), NOW)  # noqa: SLF001 – inject one successful poll
    client = await hass_ws_client(hass)
    seen = []
    for i, kind in enumerate(("get", "topology", "summary", "settings/get", "guest_qr"), start=1):
        await client.send_json({"id": i, "type": f"homebrain/network/{kind}"})
        msg = await client.receive_json()
        assert msg["success"], msg
        seen.append(json.dumps(msg["result"]))
    blob = "\n".join(seen)
    assert SECRET not in blob and "unifi.example" not in blob
    # the username is shown only in the admin settings answer
    assert 'homebrain"' not in "\n".join(seen[:3] + seen[4:])
    assert not MAC_RE.search(blob)
    result = json.loads(seen[0])
    assert result["source"] == "ha+unifi"
    assert result["unifi"]["status"] == "ok" and result["unifi"]["readonly"] is True
    settings = json.loads(seen[3])
    assert settings["unifi"] == {
        "configured": True,
        "status": "ok",
        "readonly": True,
        "source": "manual",
        "account": "homebrain",
    }


# ---------------------------------------------------------------- options flow


async def test_options_flow_unifi_step(hass: HomeAssistant):
    entry = MockConfigEntry(domain=DOMAIN, options={})
    entry.add_to_hass(hass)
    target = "custom_components.homebrain.config_flow.async_validate_unifi"

    result = await hass.config_entries.options.async_init(entry.entry_id)
    assert "network_unifi" in result["menu_options"]
    result = await hass.config_entries.options.async_configure(
        result["flow_id"], {"next_step_id": "network_unifi"}
    )
    assert result["type"] == data_entry_flow.FlowResultType.FORM
    # no HA UniFi entry → manual is the default; it opens the credentials form
    result = await hass.config_entries.options.async_configure(
        result["flow_id"], {"source": "manual"}
    )
    assert result["step_id"] == "network_unifi_manual"
    user = {
        "url": "https://unifi.example:8443",
        "site": "default",
        "username": "homebrain",
        "password": "bad",
        "verify_ssl": False,
    }
    with patch(target, side_effect=UnifiAuthError("login")):
        result = await hass.config_entries.options.async_configure(result["flow_id"], user)
    assert result["errors"] == {"base": "invalid_auth"}
    with patch(target, return_value={"readonly": True}):
        result = await hass.config_entries.options.async_configure(
            result["flow_id"], {**user, "password": SECRET}
        )
    assert result["type"] == data_entry_flow.FlowResultType.CREATE_ENTRY
    assert entry.options["network_unifi"]["password"] == SECRET
    assert entry.options["network_unifi"]["url"] == "https://unifi.example:8443"

    # editing again with an empty password keeps the stored one; empty URL switches V2 off
    result = await hass.config_entries.options.async_init(entry.entry_id)
    result = await hass.config_entries.options.async_configure(
        result["flow_id"], {"next_step_id": "network_unifi"}
    )
    result = await hass.config_entries.options.async_configure(
        result["flow_id"], {"source": "manual"}
    )
    with patch(target, return_value={"readonly": False}) as validate:
        result = await hass.config_entries.options.async_configure(
            result["flow_id"], {**user, "password": ""}
        )
    assert validate.call_args.args[1].password == SECRET
    assert entry.options["network_unifi"]["password"] == SECRET
    result = await hass.config_entries.options.async_init(entry.entry_id)
    result = await hass.config_entries.options.async_configure(
        result["flow_id"], {"next_step_id": "network_unifi"}
    )
    result = await hass.config_entries.options.async_configure(
        result["flow_id"], {"source": "manual"}
    )
    result = await hass.config_entries.options.async_configure(
        result["flow_id"], {"url": "", "site": "default", "verify_ssl": False}
    )
    # an explicit „off“ (not just a missing key: that would re-enable the HA-account default)
    assert entry.options["network_unifi"] == {"source": "off"}


async def test_validate_and_poller_with_ha_session(hass: HomeAssistant, socket_enabled):
    """Real HA client session + own cookie jar against both flavours; start → poll → stop."""
    server = TestServer(_controller(True, role="admin"))
    await server.start_server()
    try:
        cfg = UnifiConfig(str(server.make_url("")).rstrip("/"), "default", "homebrain", SECRET)
        session = async_get_clientsession(hass)
        assert await async_validate_unifi(hass, cfg) == {"readonly": False, "devices": 4}
        assert not session.closed
        poller = UnifiPoller(hass, cfg)
        await poller.async_start()
        for _ in range(50):
            if poller.status()["status"] != "pending":
                break
            await asyncio.sleep(0.05)
        assert poller.status()["status"] == "ok" and poller.status()["readonly"] is False
        await poller.async_stop()
    finally:
        await server.close()


async def test_entry_unload_keeps_shared_session_open(hass: HomeAssistant, socket_enabled, caplog):
    session = async_get_clientsession(hass)
    connector = session.connector
    server = TestServer(_controller(True, role="admin"))
    await server.start_server()
    try:
        url = str(server.make_url("")).rstrip("/")
        entry = MockConfigEntry(
            domain=DOMAIN,
            options={
                "network_unifi": {
                    "source": "manual",
                    "url": url,
                    "username": "homebrain",
                    "password": SECRET,
                    "site": "default",
                }
            },
        )
        entry.add_to_hass(hass)
        with patch.object(UnifiPoller, "_run"):
            assert await async_setup_component(hass, DOMAIN, {})
            await hass.async_block_till_done()
        poller = hass.data[DOMAIN]["network_unifi"]
        await poller.async_poll_once()
        assert poller.status()["status"] == "ok"
        owned_session = poller._session  # noqa: SLF001 - verify session ownership
        assert owned_session is not session
        assert owned_session.cookie_jar.filter_cookies(URL(url))
        assert not session.cookie_jar.filter_cookies(URL(url))

        assert await hass.config_entries.async_unload(entry.entry_id)
        assert not session.closed
        assert connector is not None and not connector.closed
        assert owned_session.closed
        assert "closes the Home Assistant aiohttp session" not in caplog.text
        await poller.async_stop()  # repeated cleanup is harmless
    finally:
        await server.close()
