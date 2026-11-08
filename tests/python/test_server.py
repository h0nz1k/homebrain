"""Server module: Glances discovery from synthetic registries, kvm parsing, thresholds, API down."""

from __future__ import annotations

import asyncio

import pytest
from homeassistant.core import HomeAssistant
from homeassistant.helpers import device_registry as dr
from homeassistant.helpers import entity_registry as er
from homeassistant.setup import async_setup_component
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.homebrain.const import DOMAIN
from custom_components.homebrain.server import rules
from custom_components.homebrain.server.discovery import build_snapshot, glances_entry
from custom_components.homebrain.server.glances_api import GlancesApi, base_url
from custom_components.homebrain.server.procs import parse_kvm, vms_from_processes

GIB = 1024**3
MIB = 1024**2

# (translation_key, key, label, state, unit) – the entity_ids are deliberately "localised" and
# arbitrary: discovery must only use platform + device + translation_key + unique_id.
SENSORS = [
    ("cpu_usage", "cpu_use_percent", "cpu", "23.5", "%"),
    ("processor_load", "processor_load", "cpu", "1.42", None),
    ("memory_usage", "memory_use_percent", "memory", "74.2", "%"),
    ("memory_use", "memory_use", "memory", "24310", "MiB"),
    ("memory_free", "memory_free", "memory", "8458", "MiB"),
    ("swap_usage", "swap_use_percent", "memory", "3.0", "%"),
    ("swap_use", "swap_use", "memory", "0.24", "GiB"),
    ("swap_free", "swap_free", "memory", "7.76", "GiB"),
    ("disk_usage", "disk_use_percent", "/", "41.0", "%"),
    ("disk_used", "disk_use", "/", "38.5", "GiB"),
    ("disk_size", "disk_size", "/", "93.9", "GiB"),
    ("disk_free", "disk_free", "/", "55.4", "GiB"),
    ("disk_usage", "disk_use_percent", "/boot/efi", "0.4", "%"),
    ("disk_free", "disk_free", "/boot/efi", "1.0", "GiB"),
    ("disk_size", "disk_size", "/boot/efi", "1.0", "GiB"),
    ("temperature", "temperature_core", "Package id 0", "51", "°C"),
    ("temperature", "temperature_core", "Core 0", "48", "°C"),
    ("temperature", "temperature_core", "Core 3", "53", "°C"),
    ("temperature", "temperature_core", "Composite", "41.9", "°C"),
    ("network_rx", "rx", "vmbr0", "152.4", "kB/s"),
    ("network_tx", "tx", "vmbr0", "48.0", "kB/s"),
    ("network_rx", "rx", "tap101i0", "999", "kB/s"),
    ("network_tx", "tx", "tap101i0", "999", "kB/s"),
    ("network_rx", "rx", "lo", "5000", "kB/s"),
    ("process_running", "process_running", "processes", "2", None),
    ("process_total", "process_total", "processes", "312", None),
    ("uptime", "uptime", "computed", "2026-10-30T06:12:00+00:00", None),
]


def install(hass: HomeAssistant, sensors=SENSORS, *, title="Proxmox (demo)") -> MockConfigEntry:
    entry = MockConfigEntry(
        domain="glances",
        title=title,
        data={"host": "glances.example", "port": 61208, "ssl": False, "version": 4},
    )
    entry.add_to_hass(hass)
    device = dr.async_get(hass).async_get_or_create(
        config_entry_id=entry.entry_id, identifiers={("glances", entry.entry_id)}, name=title
    )
    reg = er.async_get(hass)
    for i, (tk, key, label, state, unit) in enumerate(sensors):
        reg.async_get_or_create(
            "sensor",
            "glances",
            f"{entry.entry_id}-{label}-{key}",
            suggested_object_id=f"demo_hodnota_{i}",
            config_entry=entry,
            device_id=device.id,
            translation_key=tk,
        )
        attrs = {"unit_of_measurement": unit} if unit else {}
        hass.states.async_set(f"sensor.demo_hodnota_{i}", state, attrs)
    return entry


async def test_discovery_reads_glances_registry(hass: HomeAssistant) -> None:
    install(hass)
    snap = build_snapshot(hass)
    assert snap["available"] is True
    assert snap["host"]["title"] == "Proxmox (demo)"
    assert snap["cpu"] == {"percent": 23.5, "load": 1.42, "cores": None}
    mem = snap["memory"]
    assert mem["percent"] == 74.2
    assert mem["used_bytes"] == 24310 * MIB
    assert mem["total_bytes"] == (24310 + 8458) * MIB
    assert snap["swap"]["used_bytes"] == pytest.approx(0.24 * GIB)
    assert [d["mount"] for d in snap["disks"]] == ["/", "/boot/efi"]
    root = snap["disks"][0]
    assert root["percent"] == 41.0
    assert root["free_bytes"] == pytest.approx(55.4 * GIB)
    assert root["size_bytes"] == pytest.approx(93.9 * GIB)
    temps = snap["temperatures"]
    assert temps["cpu_max"] == 53
    assert temps["composite"] == 41.9
    assert {t["label"] for t in temps["sensors"]} >= {"Core 0", "Core 3", "Composite"}
    net = snap["network"]
    assert net["primary"] == "vmbr0"
    assert [i["name"] for i in net["interfaces"]] == ["vmbr0"]  # tap/lo hidden
    assert net["interfaces"][0]["rx_bps"] == pytest.approx(152400)
    assert snap["processes"] == {"running": 2, "total": 312}
    assert snap["up_since"] == "2026-10-30T06:12:00+00:00"
    hist = snap["history_entities"]
    assert hist["cpu"] == "sensor.demo_hodnota_0"
    assert hist["memory"] == "sensor.demo_hodnota_2"
    assert hist["temperature"] == "sensor.demo_hodnota_17"  # hottest CPU sensor (Core 3)
    assert hist["rx"] == "sensor.demo_hodnota_19"


async def test_discovery_ignores_disabled_and_foreign(hass: HomeAssistant) -> None:
    entry = install(hass, SENSORS[:3])
    reg = er.async_get(hass)
    reg.async_update_entity("sensor.demo_hodnota_0", disabled_by=er.RegistryEntryDisabler.USER)
    other = MockConfigEntry(domain="systemmonitor")
    other.add_to_hass(hass)
    reg.async_get_or_create(
        "sensor", "systemmonitor", "x-cpu", config_entry=other, translation_key="cpu_usage"
    )
    hass.states.async_set("sensor.systemmonitor_x_cpu", "99", {"unit_of_measurement": "%"})
    snap = build_snapshot(hass)
    assert snap["cpu"]["percent"] is None
    assert snap["cpu"]["load"] == 1.42
    assert glances_entry(hass).entry_id == entry.entry_id


async def test_no_glances_means_unconfigured(hass: HomeAssistant) -> None:
    snap = build_snapshot(hass)
    assert snap["available"] is False
    assert snap["state"] == "unconfigured"


async def test_all_sensors_unavailable_is_down(hass: HomeAssistant) -> None:
    install(hass, [(tk, k, lb, "unavailable", u) for tk, k, lb, _s, u in SENSORS])
    snap = build_snapshot(hass)
    assert snap["available"] is False
    assert snap["state"] == "down"
    assert snap["verdict"]["severity"] == "unknown"


# ---------- kvm cmdline ----------

PVE_CMD = [
    "/usr/bin/kvm",
    "-id",
    "101",
    "-name",
    "homeassistant,debug-threads=on",
    "-no-shutdown",
    "-pidfile",
    "/var/run/qemu-server/101.pid",
    "-m",
    "8192",
]


def test_parse_kvm_proxmox_cmdline() -> None:
    assert parse_kvm(PVE_CMD) == {"vmid": 101, "name": "homeassistant"}


def test_parse_kvm_string_and_guest_form() -> None:
    cmd = "/usr/bin/kvm -name guest=media,debug-threads=on -id 205 -smp 2"
    assert parse_kvm(cmd) == {"vmid": 205, "name": "media"}


def test_parse_kvm_without_id_uses_pidfile() -> None:
    cmd = ["qemu-system-x86_64", "-name", "lab", "-pidfile", "/var/run/qemu-server/300.pid"]
    assert parse_kvm(cmd) == {"vmid": 300, "name": "lab"}


def test_parse_kvm_without_name_falls_back_to_vmid() -> None:
    assert parse_kvm(["/usr/bin/kvm", "-id", "7"]) == {"vmid": 7, "name": "VM 7"}


@pytest.mark.parametrize(
    "cmd",
    [
        ["/usr/bin/python3", "-id", "5"],
        ["/usr/bin/kvm", "-name", "noid"],
        ["/usr/bin/kvm", "-id"],
        ["/usr/bin/kvm", "-id", "abc"],
        [],
        None,
        "",
    ],
)
def test_parse_kvm_rejects_non_vm(cmd) -> None:
    assert parse_kvm(cmd) is None


def test_vms_sorted_by_ram_and_merged() -> None:
    procs = [
        {"name": "kvm", "cmdline": PVE_CMD, "cpu_percent": 12.5, "memory_info": {"rss": 6 * GIB}},
        {
            "name": "kvm",
            "cmdline": ["/usr/bin/kvm", "-id", "102", "-name", "media"],
            "cpu_percent": 30.0,
            "memory_info": [2 * GIB, 9 * GIB],
        },
        {
            "name": "kvm",
            "cmdline": ["/usr/bin/kvm", "-id", "102", "-name", "media"],
            "cpu_percent": 1.0,
            "memory_info": {"rss": 1 * GIB},
        },
        {"name": "pvedaemon", "cmdline": ["pvedaemon"], "cpu_percent": 50, "memory_info": {}},
    ]
    vms = vms_from_processes(procs, total_bytes=32 * GIB)
    assert [v["vmid"] for v in vms] == [101, 102]
    assert vms[0] == {
        "vmid": 101,
        "name": "homeassistant",
        "cpu_percent": 12.5,
        "mem_bytes": 6 * GIB,
        "mem_percent": 18.8,
    }
    assert vms[1]["cpu_percent"] == 31.0
    assert vms[1]["mem_bytes"] == 2 * GIB


# ---------- thresholds / verdict ----------


@pytest.mark.parametrize(
    ("value", "level"),
    [(84.9, "ok"), (85, "warning"), (94.9, "warning"), (95, "critical"), (None, "unknown")],
)
def test_level_thresholds(value, level) -> None:
    assert rules.level(value, 85, 95) == level


def test_verdict_ok_with_74_percent_ram() -> None:
    snap = {
        "memory": {"percent": 74.0},
        "disks": [{"mount": "/", "percent": 41}],
        "temperatures": {"sensors": [{"label": "Core 0", "value": 50, "warning": None}]},
    }
    assert rules.verdict(snap) == {"severity": "ok", "reasons": []}


def test_verdict_orders_critical_first() -> None:
    snap = {
        "memory": {"percent": 87.0},
        "disks": [{"mount": "/", "percent": 96.0}],
        "temperatures": {
            "sensors": [
                {"label": "Core 1", "value": 88, "warning": 85, "critical": 100},
                {"label": "Composite", "value": 60, "warning": None, "critical": None},
            ]
        },
    }
    v = rules.verdict(snap)
    assert v["severity"] == "critical"
    assert [(r["kind"], r["level"]) for r in v["reasons"]] == [
        ("disk", "critical"),
        ("memory", "warning"),
        ("temperature", "warning"),
    ]
    assert v["reasons"][0]["label"] == "/"


def test_temperature_defaults_without_glances_thresholds() -> None:
    hot = {"label": "Composite", "value": 81, "warning": None, "critical": None}
    assert rules.temperature_level(hot) == "warning"
    assert rules.temperature_level({**hot, "value": 79}) == "ok"


# ---------- Glances REST API ----------


def test_base_url_from_entry_data() -> None:
    data = {"host": "glances.example", "port": 61208, "ssl": False, "version": 4}
    assert base_url(data) == "http://glances.example:61208/api/4"
    assert base_url({**data, "ssl": True}) == "https://glances.example:61208/api/4"
    assert base_url({"host": "", "port": 1}) is None


async def test_api_down_is_calm_and_cached() -> None:
    calls = []

    async def fetch(path: str):
        calls.append(path)
        raise TimeoutError

    clock = [1000.0]
    api = GlancesApi("http://glances.example:61208/api/4", fetch=fetch, clock=lambda: clock[0])
    first = await api.async_get()
    assert first["status"] == "down"
    assert first["vms"] == []
    n = len(calls)
    clock[0] += 10
    assert (await api.async_get())["status"] == "down"
    assert len(calls) == n  # no new 5 s timeout on every poll
    clock[0] += 31
    await api.async_get()
    assert len(calls) > n


async def test_api_reads_processlist_sensors_and_core() -> None:
    async def fetch(path: str):
        await asyncio.sleep(0)
        return {
            "/processlist/name/kvm": {
                "kvm": [
                    {
                        "name": "kvm",
                        "cmdline": PVE_CMD,
                        "cpu_percent": 4.0,
                        "memory_info": {"rss": GIB},
                    }
                ]
            },
            "/sensors": [{"label": "Core 0", "value": 50, "warning": 90, "critical": 105}],
            "/core": {"phys": 4, "log": 4},
        }[path]

    api = GlancesApi("http://x/api/4", fetch=fetch, clock=lambda: 0.0)
    got = await api.async_get(total_bytes=32 * GIB)
    assert got["status"] == "ok"
    assert got["cores"] == 4
    assert got["thresholds"] == {"Core 0": {"warning": 90, "critical": 105}}
    assert got["vms"][0]["name"] == "homeassistant"


# ---------- WS ----------


@pytest.fixture
async def setup(hass: HomeAssistant, hass_admin_user):
    entry = MockConfigEntry(domain=DOMAIN, data={}, options={})
    entry.add_to_hass(hass)
    assert await async_setup_component(hass, DOMAIN, {})
    await hass.async_block_till_done()
    return entry


async def test_ws_get_returns_snapshot_without_api(hass: HomeAssistant, setup, hass_ws_client):
    install(hass)
    hass.config_entries.async_get_entry  # noqa: B018 - entry exists, API not reachable in tests
    client = await hass_ws_client(hass)
    await client.send_json({"id": 1, "type": "homebrain/server/get", "api": False})
    msg = await client.receive_json()
    assert msg["success"], msg
    res = msg["result"]
    assert res["available"] is True
    assert res["vms"]["status"] == "off"
    assert res["verdict"]["severity"] == "ok"


async def test_ws_history_without_recorder(hass: HomeAssistant, setup, hass_ws_client):
    install(hass)
    client = await hass_ws_client(hass)
    await client.send_json({"id": 2, "type": "homebrain/server/history"})
    msg = await client.receive_json()
    assert msg["success"], msg
    assert msg["result"]["series"] == {}
