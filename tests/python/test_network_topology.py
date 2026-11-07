"""Síť – topology graph (HA-only V1): edges from uplink MACs, mesh, assumptions, roles."""

import pytest
from homeassistant.core import HomeAssistant
from homeassistant.setup import async_setup_component
from pytest_homeassistant_custom_component.common import MockConfigEntry
from test_network import NOW, install

from custom_components.homebrain.const import DOMAIN
from custom_components.homebrain.network.discovery import build_snapshot
from custom_components.homebrain.network.topology import build_topology


def _dev(id_, name, uplink=None, **over):
    return {
        "id": id_,
        "name": name,
        "model_label": "U7 Pro",
        "state": "connected",
        "clients": 0,
        "max_link_mbps": 1000,
        "uplink": {"id": uplink, "name": uplink} if uplink else None,
        "ports": [],
        **over,
    }


def _client(id_, label, ap_id=None, important=True, wired=False, online=True):
    return {
        "id": id_,
        "label": label,
        "wired": wired,
        "ap_id": ap_id,
        "online": online,
        "important": important,
    }


def _snap(**over):
    base = {
        "internet": {"online": True, "latency_ms": 14.0},
        "gateway": {"online": True, "latency_ms": 0.6},
        "switches": [
            _dev(
                "sw-a",
                "Switch A",
                model_label="USW Lite 16 PoE",
                ports=[
                    {"n": 1, "speed_mbps": 1000, "poe_w": 6.5},
                    {"n": 16, "speed_mbps": 1000, "poe_w": None},
                ],
            ),
            _dev("sw-b", "Switch B", model_label="USW Ultra"),
        ],
        "aps": [
            _dev("ap-1", "AP Jedna", uplink="sw-a", clients=5, max_link_mbps=2500),
            _dev("ap-2", "AP Dva", uplink="ap-1", clients=3),
        ],
        "clients": [
            _client("c-tab", "Tablet", ap_id="ap-1"),
            _client("c-x", "Telefon", ap_id="ap-1", important=False),
            _client("c-nas", "NAS", wired=True),
        ],
    }
    base.update(over)
    return base


def _edge(graph, to):
    return next(e for e in graph["edges"] if e["to"] == to)


def _node(graph, id_):
    return next(n for n in graph["nodes"] if n["id"] == id_)


def test_backbone_internet_gateway_and_assumed_switch_uplinks():
    g = build_topology(_snap(), [], {})
    assert _node(g, "internet")["parent"] is None
    gw = _node(g, "gateway")
    assert gw["label"] == "Router" and gw["parent"] == "internet" and gw["status"] == "ok"
    assert _edge(g, "gateway")["assumed"] is False
    for sw in ("sw-a", "sw-b"):
        edge = _edge(g, sw)
        # Switch uplink is not a UniFi device: drawn to the gateway as an assumption.
        assert edge["from"] == "gateway" and edge["assumed"] is True and edge["type"] == "wired"
    assert g["meta"]["source"] == "ha"


def test_gateway_label_is_configurable():
    g = build_topology(_snap(), [], {"gateway_label": "Brána ER"})
    assert _node(g, "gateway")["label"] == "Brána ER"


def test_ap_uplink_by_mac_and_unambiguous_port():
    g = build_topology(_snap(), [], {})
    edge = _edge(g, "ap-1")
    assert edge["from"] == "sw-a" and edge["type"] == "wired" and edge["assumed"] is False
    # One AP on the switch and exactly one powered port → the port is known.
    assert (edge["port"], edge["speed_mbps"], edge["poe_w"]) == (1, 1000, 6.5)
    assert edge["max_mbps"] == 2500 and edge["slow"] is False


def test_ambiguous_ports_give_no_port_data():
    snap = _snap()
    snap["switches"][0]["ports"].append({"n": 2, "speed_mbps": 100, "poe_w": 5.6})
    snap["aps"].append(_dev("ap-3", "AP Tři", uplink="sw-a"))
    g = build_topology(snap, [], {})
    for ap in ("ap-1", "ap-3"):
        edge = _edge(g, ap)
        assert edge["port"] is None and edge["speed_mbps"] is None and edge["poe_w"] is None


def test_ap_own_single_port_gives_slow_link():
    snap = _snap()
    snap["aps"].append(
        _dev(
            "ap-3",
            "AP Tři",
            uplink="sw-b",
            max_link_mbps=2500,
            ports=[{"n": 1, "speed_mbps": 100, "poe_w": None}],
        )
    )
    edge = _edge(build_topology(snap, [], {}), "ap-3")
    assert edge["speed_mbps"] == 100 and edge["port"] is None and edge["slow"] is True


def test_mesh_when_parent_is_an_ap():
    g = build_topology(_snap(), [], {})
    edge = _edge(g, "ap-2")
    assert edge["from"] == "ap-1" and edge["type"] == "mesh" and edge["assumed"] is False
    assert edge["signal_dbm"] is None  # HA has no mesh signal (V2: UniFi API)
    assert g["meta"]["mesh"] == 1


def test_unknown_ap_uplink_is_assumed_on_gateway():
    snap = _snap()
    snap["aps"][1]["uplink"] = None
    edge = _edge(build_topology(snap, [], {}), "ap-2")
    assert edge["from"] == "gateway" and edge["assumed"] is True


def test_clients_important_always_others_collapsed_per_ap():
    g = build_topology(_snap(), [], {})
    tab = _node(g, "client:c-tab")
    assert tab["parent"] == "ap-1" and tab["kind"] == "client"
    assert _edge(g, "client:c-tab")["type"] == "wireless"
    assert not any(n["id"] == "client:c-x" for n in g["nodes"])
    more = _node(g, "more:ap-1")
    # AP reports 5 clients, one is drawn → 4 others behind a collapsible chip.
    assert more["count"] == 4 and more["parent"] == "ap-1"
    assert _node(g, "more:ap-2")["count"] == 3
    # A wired important client: switch/port unknown in HA → assumed under the gateway.
    nas = _edge(g, "client:c-nas")
    assert nas["from"] == "gateway" and nas["assumed"] is True and nas["type"] == "wired"


def test_missing_data_still_gives_a_tree():
    g = build_topology(
        {
            "internet": None,
            "aps": [_dev("ap-1", "AP", state=None, clients=None)],
            "switches": [],
            "clients": [],
        },
        [],
        {},
    )
    assert _node(g, "internet")["status"] == "unknown"
    assert _node(g, "gateway")["status"] == "unknown"
    assert _node(g, "ap-1")["status"] == "unknown"
    assert not any(n["kind"] == "more" for n in g["nodes"])
    ids = {n["id"] for n in g["nodes"]}
    assert all(e["from"] in ids and e["to"] in ids for e in g["edges"])


def test_problems_highlight_their_nodes():
    problems = [
        {"id": "ap_offline:ap-2", "severity": "critical", "target": {"kind": "ap", "id": "ap-2"}},
        {
            "id": "port_slow:sw-a:2",
            "severity": "notice",
            "target": {"kind": "port", "id": "sw-a:2"},
        },
        {"id": "x:c-tab", "severity": "warning", "target": {"kind": "client", "id": "c-tab"}},
        {"id": "net", "severity": "warning", "target": {"kind": "internet", "id": "internet"}},
    ]
    g = build_topology(_snap(), problems, {})
    assert _node(g, "ap-2")["severity"] == "critical"
    assert _node(g, "ap-2")["problem_ids"] == ["ap_offline:ap-2"]
    assert _node(g, "sw-a")["severity"] == "notice"
    assert _node(g, "client:c-tab")["severity"] == "warning"
    assert _node(g, "internet")["severity"] == "warning"
    assert _node(g, "ap-1")["severity"] is None


async def test_snapshot_uplink_by_mac_feeds_the_graph(hass: HomeAssistant):
    ids = install(hass)
    g = build_topology(build_snapshot(hass, {}, now=NOW), [], {})
    edge = _edge(g, ids["ap_living"])
    assert edge["from"] == ids["sw_main"] and edge["assumed"] is False
    assert "02:00:00" not in str(g)  # never a MAC


@pytest.fixture
async def entry(hass: HomeAssistant):
    entry = MockConfigEntry(domain=DOMAIN, data={}, options={})
    entry.add_to_hass(hass)
    assert await async_setup_component(hass, DOMAIN, {})
    await hass.async_block_till_done()
    return entry


async def test_topology_ws_is_admin_only(
    hass: HomeAssistant, entry, hass_ws_client, hass_admin_user
):
    install(hass)
    client = await hass_ws_client(hass)
    await client.send_json_auto_id({"type": "homebrain/network/topology"})
    msg = await client.receive_json()
    assert msg["success"], msg
    assert {"nodes", "edges", "meta"} <= set(msg["result"])
    for role in ("kiosk", "adult"):
        hass_admin_user.groups = []
        hass.config_entries.async_update_entry(
            entry, options={**entry.options, "roles": {hass_admin_user.id: role}}
        )
        await client.send_json_auto_id({"type": "homebrain/network/topology"})
        assert (await client.receive_json())["error"]["code"] == "unauthorized"
