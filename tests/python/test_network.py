"""Síť (network module): discovery from synthetic registries, problem rules, roles, options."""

import json
import time
from pathlib import Path

import pytest
from homeassistant.core import HomeAssistant
from homeassistant.helpers import area_registry as ar
from homeassistant.helpers import device_registry as dr
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers import floor_registry as fr
from homeassistant.setup import async_setup_component
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.homebrain.const import DOMAIN
from custom_components.homebrain.network import rules
from custom_components.homebrain.network.discovery import FlapTracker, build_snapshot, client_id
from custom_components.homebrain.network.ws import wifi_qr_payload

FIXTURE = Path(__file__).parent / "fixtures" / "network" / "registry.json"
NOW = 1_800_000_000.0


def install(hass: HomeAssistant) -> dict[str, str]:
    """Recreate the synthetic UniFi + ping setup in the HA registries; returns key -> device_id."""
    data = json.loads(FIXTURE.read_text(encoding="utf-8"))
    entry = MockConfigEntry(domain="unifi", title="Default")
    entry.add_to_hass(hass)
    floors = {
        f["name"]: fr.async_get(hass).async_create(f["name"], level=f["level"]).floor_id
        for f in data["floors"]
    }
    areas = {
        a["name"]: ar.async_get(hass)
        .async_create(a["name"], floor_id=floors.get(a["floor"]) if a["floor"] else None)
        .id
        for a in data["areas"]
    }
    devices = dr.async_get(hass)
    ids = {}
    for d in data["devices"]:
        dev = devices.async_get_or_create(
            config_entry_id=entry.entry_id,
            identifiers={("unifi", d["key"])},
            connections={(dr.CONNECTION_NETWORK_MAC, d["mac"])} if d["mac"] else set(),
            name=d["name"],
            model=d["model"],
        )
        if d["area"]:
            devices.async_update_device(dev.id, area_id=areas[d["area"]])
        ids[d["key"]] = dev.id
    entities = er.async_get(hass)
    for e in data["entities"]:
        domain, object_id = e["entity_id"].split(".", 1)
        entities.async_get_or_create(
            domain,
            "unifi",
            e["uid"],
            suggested_object_id=object_id,
            config_entry=entry,
            device_id=ids[e["device"]],
            translation_key=e["tk"],
            disabled_by=er.RegistryEntryDisabler.INTEGRATION if e.get("disabled") else None,
        )
        if e["state"] is not None:
            hass.states.async_set(e["entity_id"], e["state"], e.get("attrs", {}))
    ping = MockConfigEntry(domain="ping", data={}, options={"host": "example.org"})
    ping.add_to_hass(hass)
    for domain, tk, oid, state in (
        ("binary_sensor", None, "internet_demo", "on"),
        ("sensor", "round_trip_time_avg", "internet_demo_latence", "14.2"),
        ("sensor", "round_trip_time_mdev", "internet_demo_jitter", "1.1"),
    ):
        entities.async_get_or_create(
            domain,
            "ping",
            f"ping-{oid}",
            suggested_object_id=oid,
            config_entry=ping,
            translation_key=tk,
        )
        hass.states.async_set(f"{domain}.{oid}", state)
    return ids


async def test_discovery_pairs_by_device_not_entity_id(hass: HomeAssistant):
    ids = install(hass)
    snap = build_snapshot(hass, {}, now=NOW)
    aps = {a["name"]: a for a in snap["aps"]}
    assert set(aps) == {"AP Obývák", "AP Pracovna", "AP Zahrada"}
    # sensor.ap_zahrada_* belongs to AP Obývák: the device decides, not the entity_id.
    assert aps["AP Obývák"]["clients"] == 14
    assert aps["AP Obývák"]["state"] == "connected"
    assert aps["AP Zahrada"]["state"] == "disconnected"
    assert aps["AP Obývák"]["uplink"] == {"id": ids["sw_main"], "name": "USW Lite 16"}
    assert aps["AP Obývák"]["fw"] == {"installed": "6.8.2", "latest": "6.8.3", "update": True}
    assert aps["AP Zahrada"]["floor_id"] == "outdoor"
    assert snap["floors"][-1] == {"id": "outdoor", "name": "Venku", "level": None}
    assert [f["name"] for f in snap["floors"][:2]] == ["1. patro", "Přízemí"]
    sw = {s["name"]: s for s in snap["switches"]}
    assert set(sw) == {"USW Lite 16", "USW Flex"}
    lite = sw["USW Lite 16"]
    assert lite["poe"] == {"used_w": 37.6, "budget_w": 45.0}
    ports = {p["n"]: p for p in lite["ports"]}
    assert ports[2] == {"n": 2, "speed_mbps": 100, "poe_w": 7.5}
    assert ports[10]["speed_mbps"] is None  # disabled sensor: no speed, still listed
    assert snap["ssids"] == [{"name": "demo_home", "clients": 17, "guest": False}]
    assert snap["internet"]["online"] is True and snap["internet"]["latency_ms"] == 14.2


async def test_clients_have_hash_ids_and_ap_mapping(hass: HomeAssistant):
    ids = install(hass)
    tablet = client_id(ids["tablet"])
    snap = build_snapshot(hass, {"important": [{"id": tablet, "expected_floor_id": "x"}]}, now=NOW)
    clients = {c["label"]: c for c in snap["clients"]}
    assert clients["Tablet demo"]["id"] == tablet and len(tablet) == 12
    assert clients["Tablet demo"]["important"] is True
    assert clients["Tablet demo"]["ap_id"] == ids["ap_office"]
    assert clients["Tablet demo"]["wired"] is False
    assert clients["Notebook demo"]["wired"] is True
    assert clients["Robot demo"]["online"] is False
    blob = json.dumps(snap)
    assert "02:00:00" not in blob  # no MAC ever leaves the integration


async def test_rules_on_discovered_snapshot(hass: HomeAssistant):
    install(hass)
    snap = build_snapshot(hass, {}, now=time.time())
    found = {p["rule"] for p in rules.evaluate(snap, time.time() + 600)}
    assert {
        "ap_offline",
        "device_high_cpu",
        "device_high_mem",
        "poe_near_budget",
        "port_slow",
        "firmware_available",
    } <= found
    # U7 at 81 % and USW Flex at 77 % memory are normal for those models.
    mem = [p for p in rules.evaluate(snap, time.time()) if p["rule"] == "device_high_mem"]
    assert [p["title"] for p in mem] == ["AP Obývák: plná paměť"]


def _ap(**over):
    base = {
        "id": "a1",
        "name": "AP Obývák",
        "state": "connected",
        "state_since": NOW - 3600,
        "clients": 5,
        "floor_id": "f0",
        "uplink": None,
        "fw": None,
    }
    return {**base, **over}


@pytest.mark.parametrize(
    ("internet", "expected"),
    [
        ({"online": False, "since": NOW - 300}, ["internet_down"]),
        ({"online": False, "since": NOW - 30}, []),
        ({"online": True, "since": NOW - 30, "latency_ms": 400}, ["internet_degraded"]),
        ({"online": True, "since": NOW - 30, "latency_ms": 12, "jitter_ms": 2}, []),
    ],
)
def test_internet_rules(internet, expected):
    assert [p["rule"] for p in rules.internet_rules({"internet": internet}, NOW)] == expected


def test_ap_offline_names_the_uplink_switch():
    ap = _ap(state="disconnected", state_since=NOW - 600, uplink={"id": "s", "name": "USW Lite 16"})
    [p] = rules.ap_rules({"aps": [ap]}, NOW)
    assert p["severity"] == "critical" and "USW Lite 16" in p["fix"]
    assert rules.ap_rules({"aps": [_ap(state="disconnected", state_since=NOW - 60)]}, NOW) == []


def test_ap_flapping_thresholds():
    assert rules.ap_rules({"aps": [_ap(flaps_24h=2)]}, NOW) == []
    assert rules.ap_rules({"aps": [_ap(flaps_24h=3)]}, NOW)[0]["severity"] == "warning"
    assert rules.ap_rules({"aps": [_ap(flaps_24h=7)]}, NOW)[0]["severity"] == "critical"


def test_flap_tracker_window():
    t = FlapTracker()
    for when in (NOW - 90_000, NOW - 600, NOW - 60):
        t.record("a1", when)
    assert t.count("a1", NOW) == 2


def test_client_imbalance():
    aps = [
        _ap(id="a", name="AP A", clients=16),
        _ap(id="b", name="AP B", clients=2),
        _ap(id="c", name="AP C", clients=4, floor_id="f1"),
    ]
    [p] = rules.imbalance_rules({"aps": aps}, NOW)
    assert p["target"]["id"] == "a" and p["severity"] == "notice"
    aps[0]["clients"] = 8
    assert rules.imbalance_rules({"aps": aps}, NOW) == []


def test_poe_budget_levels():
    sw = lambda used: {"id": "s", "name": "Lite", "poe": {"used_w": used, "budget_w": 45.0}}  # noqa: E731
    assert rules.poe_rules({"switches": [sw(30)]}, NOW) == []
    assert rules.poe_rules({"switches": [sw(37)]}, NOW)[0]["severity"] == "notice"
    assert rules.poe_rules({"switches": [sw(44)]}, NOW)[0]["severity"] == "warning"


def test_port_slow_only_where_faster_is_possible():
    fast = {
        "id": "s",
        "name": "Lite",
        "max_link_mbps": 1000,
        "ports": [{"n": 2, "speed_mbps": 100, "poe_w": 6.0}, {"n": 3, "speed_mbps": 1000}],
    }
    [p] = rules.port_rules({"switches": [fast]}, NOW)
    assert p["severity"] == "warning" and "port 2" in p["title"]
    slow = {**fast, "max_link_mbps": 100}
    assert rules.port_rules({"switches": [slow]}, NOW) == []


def test_important_offline_and_wrong_ap():
    floors = [{"id": "f0", "name": "Přízemí"}, {"id": "f1", "name": "1. patro"}]
    aps = [_ap(id="a", floor_id="f1", name="AP Pracovna")]
    c = {
        "id": "c1",
        "label": "Tablet",
        "important": True,
        "online": True,
        "ap_id": "a",
        "expected_floor_id": "f0",
        "since": NOW - 7200,
        "ap_since": NOW - 2400,
    }
    [p] = rules.important_rules({"aps": aps, "floors": floors, "clients": [c]}, NOW)
    assert p["rule"] == "important_wrong_ap" and "AP Pracovna (1. patro)" in p["context"]
    off = {**c, "online": False, "since": NOW - 1200}
    assert rules.important_rules({"clients": [off]}, NOW)[0]["rule"] == "important_offline"
    assert rules.important_rules({"clients": [{**off, "since": NOW - 60}]}, NOW) == []
    assert rules.important_rules({"clients": [{**off, "important": False}]}, NOW) == []


def test_every_problem_has_czech_fix_and_summary_order():
    snap = {
        "internet": {"online": True, "latency_ms": 400},
        "aps": [_ap(state="disconnected", state_since=NOW - 900)],
        "switches": [
            {
                "id": "s",
                "name": "Lite",
                "fw": {"update": True},
                "poe": {"used_w": 40, "budget_w": 45},
            }
        ],
    }
    problems = rules.evaluate(snap, NOW)
    assert all(p["fix"] and p["title"] for p in problems)
    assert [p["severity"] for p in problems] == ["critical", "warning", "notice", "info"]
    s = rules.summary(snap, problems)
    assert s["status"] == "problem" and s["headline"] == "AP Obývák je offline"
    assert (s["problems_count"], s["tips_count"]) == (2, 2)
    ok = rules.summary({"internet": {"online": True}}, [])
    assert ok["headline"] == "Síť v pořádku" and ok["status"] == "ok"


def test_wifi_qr_payload_escapes():
    assert wifi_qr_payload("Host;1", "a:b", "WPA") == "WIFI:T:WPA;S:Host\\;1;P:a\\:b;;"
    assert wifi_qr_payload("Host", None) == "WIFI:T:nopass;S:Host;;"


@pytest.fixture
async def entry(hass: HomeAssistant):
    entry = MockConfigEntry(domain=DOMAIN, data={}, options={})
    entry.add_to_hass(hass)
    assert await async_setup_component(hass, DOMAIN, {})
    await hass.async_block_till_done()
    return entry


async def _ws(client, payload):
    await client.send_json_auto_id(payload)
    return await client.receive_json()


async def test_settings_and_guest_qr_roles(
    hass: HomeAssistant, entry, hass_ws_client, hass_admin_user
):
    install(hass)
    client = await hass_ws_client(hass)
    msg = await _ws(client, {"type": "homebrain/network/guest_qr"})
    assert msg["result"]["configured"] is False
    msg = await _ws(
        client,
        {
            "type": "homebrain/network/settings/set",
            "guest": {"ssid": "Host demo", "password": "synthetic-pass"},
            "important": [{"id": "abc", "label": "Robot", "expected_floor_id": None}],
        },
    )
    assert msg["success"], msg
    assert entry.options["network"]["important"] == [{"id": "abc", "label": "Robot"}]
    msg = await _ws(client, {"type": "homebrain/network/get"})
    assert {"aps", "switches", "clients", "problems", "summary"} <= set(msg["result"])
    # Kiosk: summary + QR (password only inside the QR payload), never the device list.
    hass_admin_user.groups = []
    hass.config_entries.async_update_entry(
        entry, options={**entry.options, "roles": {hass_admin_user.id: "kiosk"}}
    )
    qr = (await _ws(client, {"type": "homebrain/network/guest_qr"}))["result"]
    assert qr == {
        "configured": True,
        "ssid": "Host demo",
        "open": False,
        "qr_payload": "WIFI:T:WPA;S:Host demo;P:synthetic-pass;;",
    }
    summary = (await _ws(client, {"type": "homebrain/network/summary"}))["result"]
    assert summary["status"] == "problem" and "aps" not in summary
    for cmd in ("homebrain/network/get", "homebrain/network/settings/get"):
        assert (await _ws(client, {"type": cmd}))["error"]["code"] == "unauthorized"
