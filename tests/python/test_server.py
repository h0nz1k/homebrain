"""Server module: Glances discovery from synthetic registries, kvm parsing, thresholds, API down."""

from __future__ import annotations

import asyncio
from datetime import timedelta

import pytest
from homeassistant.core import HomeAssistant
from homeassistant.helpers import device_registry as dr
from homeassistant.helpers import entity_registry as er
from homeassistant.setup import async_setup_component
from homeassistant.util import dt as dt_util
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.homebrain.const import DOMAIN
from custom_components.homebrain.server import rules
from custom_components.homebrain.server.discovery import build_snapshot, glances_entry
from custom_components.homebrain.server.glances_api import GlancesApi, base_url
from custom_components.homebrain.server.procs import parse_kvm, vms_from_processes
from custom_components.homebrain.server.proxmox import guest_entities
from custom_components.homebrain.server.rates import STALE_S, CounterRates
from custom_components.homebrain.server.ws import async_snapshot, backup_max_age_days

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
    assert snap["cpu"] == {"percent": 23.5, "load": 1.42, "load_avg": None, "cores": None}
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
    assert res["proxmox"] == {
        "status": "off",
        "node": None,
        "guests": [],
        "storages": [],
        "backup": None,
    }
    assert res["verdict"]["severity"] == "ok"


async def test_ws_history_without_recorder(hass: HomeAssistant, setup, hass_ws_client):
    install(hass)
    client = await hass_ws_client(hass)
    await client.send_json({"id": 2, "type": "homebrain/server/history"})
    msg = await client.receive_json()
    assert msg["success"], msg
    assert msg["result"]["series"] == {}


# ---------- Proxmox VE ----------

PROXMOX_UP = "2026-10-30T06:12:00+00:00"
PROXMOX_BACKUP = "2026-10-30T08:20:00+00:00"


@pytest.fixture
def proxmox_entity(hass: HomeAssistant):
    entry = MockConfigEntry(domain="proxmoxve")
    entry.add_to_hass(hass)
    registry = er.async_get(hass)
    devices = dr.async_get(hass)

    def add(unique_id, key, value, unit=None, *, binary=False, device=None, disabled=False):
        device_id = None
        if device:
            identifier, name = device
            device_id = devices.async_get_or_create(
                config_entry_id=entry.entry_id,
                identifiers={("proxmoxve", f"{entry.entry_id}_{identifier}")},
                name=name,
            ).id
        entity = registry.async_get_or_create(
            "binary_sensor" if binary else "sensor",
            "proxmoxve",
            f"{entry.entry_id}_{unique_id}",
            suggested_object_id="synteticka_hodnota",
            config_entry=entry,
            device_id=device_id,
            translation_key=key,
            disabled_by=er.RegistryEntryDisabler.INTEGRATION if disabled else None,
        )
        attributes = {"unit_of_measurement": unit} if unit else {}
        hass.states.async_set(entity.entity_id, value, attributes)
        return entity.entity_id

    return add


async def test_proxmox_registry_and_units(hass: HomeAssistant, proxmox_entity, freezer) -> None:
    freezer.move_to("2026-10-31T08:00:00+00:00")
    add = proxmox_entity
    web = ("vm_101", "web-01")
    container = ("container_103", "db-ct")
    add("node/node_demo_node_status", "node_status", "online")
    add("node/node_demo_node_uptime", None, PROXMOX_UP)
    add("node/node_demo_node_backup_status", "node_backup_status", "off", binary=True)
    add("node/node_demo_node_backup_last_backup", "node_backup_last_backup", PROXMOX_BACKUP)
    add("node/node_demo_node_backup_duration", "node_backup_duration", "2.5", "min")
    add("101_vm_status", "vm_status", "running", device=web)
    add("101_vm_cpu", "vm_cpu", "3", "%")
    add("101_vm_uptime", None, PROXMOX_UP)
    add("101_vm_memory", "vm_memory", "1", "GiB")
    add("101_vm_max_memory", "vm_max_memory", "4", "GB")
    add("101_vm_netin", "vm_netin", "2", "GiB")
    add("101_vm_netout", "vm_netout", "1", "GiB", disabled=True)
    add("102_vm_status", "vm_status", "stopped")
    add("102_vm_memory", "vm_memory", "unavailable")
    add("103_status", "status", "on", binary=True, device=container)
    add("103_container_disk", "container_disk", str(4 * GIB), "B")
    add("103_container_max_disk", "container_max_disk", "10", "GiB")
    add("104_status", "status", "off", binary=True, device=("vm_104", "sleep-01"))
    add("105_vm_status", "vm_status", "suspended")
    add("105_status", "status", "off", binary=True)
    storage = ("storage_local_pool", "Storage (local_pool)")
    add("node_demo_local_pool_storage_total", "storage_total", "12", "GB", device=storage)
    add("node_demo_local_pool_storage_used", "storage_used", str(3 * 10**9), "B")
    add("node_demo_local_pool_storage_active", "storage_active", "off", binary=True)

    result = await async_snapshot(hass, use_api=False)
    snap = result["proxmox"]
    assert snap["status"] == "ok"
    assert snap["node"] == {
        "name": "node_demo",
        "status": "online",
        "up_since": PROXMOX_UP,
        "cpu_percent": None,
        "cpus": None,
        "mem_bytes": None,
        "mem_max_bytes": None,
        "mem_percent": None,
        "disk_bytes": None,
        "disk_max_bytes": None,
        "disk_percent": None,
    }
    assert snap["backup"] == {
        "ok": True,
        "last": PROXMOX_BACKUP,
        "duration_s": 150,
        "age_days": 0,
        "max_age_days": 8,
        "age_level": "ok",
    }
    assert [guest["vmid"] for guest in snap["guests"]] == [101, 103, 102, 104, 105]
    vm, ct, stopped, binary_only, suspended = snap["guests"]
    assert vm == {
        "vmid": 101,
        "name": "web-01",
        "kind": "vm",
        "status": "running",
        "cpu_percent": 3,
        "cpus": None,
        "mem_bytes": GIB,
        "mem_max_bytes": 4 * 10**9,
        "mem_percent": pytest.approx(GIB / (4 * 10**9) * 100),
        "up_since": PROXMOX_UP,
        "disk_bytes": None,
        "disk_max_bytes": None,
        "disk_percent": None,
        "netin_bps": None,  # first counter sample: no rate yet
        "netout_bps": None,
        "netin_bytes": 2 * GIB,
        "netout_bytes": None,
        "cpu_level": "ok",
        "mem_level": "ok",
        "disk_level": "unknown",
    }
    assert (ct["name"], ct["kind"], ct["disk_percent"]) == ("db-ct", "ct", 40)
    assert (stopped["name"], stopped["mem_bytes"]) == ("102", None)
    assert binary_only["status"] == "stopped"
    assert suspended["status"] == "suspended"
    assert snap["storages"] == [
        {
            "name": "local_pool",
            "node": "node_demo",
            "used_bytes": 3 * 10**9,
            "total_bytes": 12 * 10**9,
            "percent": 25,
            "active": False,
            "level": "ok",
        }
    ]
    assert result["verdict"] == {"severity": "ok", "reasons": []}


async def test_proxmox_unavailable_and_optional_entities(hass, proxmox_entity) -> None:
    add = proxmox_entity
    install(hass)
    node = add("node/demo_node_status", "node_status", "unavailable")
    add("101_vm_status", "vm_status", "unavailable")
    add("node/demo_node_backup_status", "node_backup_status", "on", binary=True, disabled=True)
    add("node/demo_node_backup_last_backup", "node_backup_last_backup", "unknown")
    result = await async_snapshot(hass, use_api=False)
    assert result["proxmox"]["status"] == "down"
    assert result["proxmox"]["backup"] is None
    assert result["cpu"]["percent"] == 23.5
    assert result["verdict"] == {"severity": "ok", "reasons": []}

    hass.states.async_set(node, "online")
    result = await async_snapshot(hass, use_api=False)
    assert result["proxmox"]["status"] == "ok"
    assert result["proxmox"]["backup"] is None
    assert result["proxmox"]["guests"][0]["status"] is None


@pytest.mark.parametrize(
    ("node", "storage", "backup", "severity", "reasons"),
    [
        ("online", "84.9", "off", "ok", []),
        ("online", "85", "off", "warning", ["storage"]),
        ("online", "95", "off", "critical", ["storage"]),
        ("online", "30", "on", "warning", ["backup"]),
        ("offline", "95", "on", "critical", ["node", "storage", "backup"]),
    ],
)
async def test_proxmox_verdict(hass, proxmox_entity, node, storage, backup, severity, reasons):
    add = proxmox_entity
    add("node/demo_node_status", "node_status", node)
    add("demo_local_storage_used_percentage", "storage_used_percentage", storage, "%")
    add("node/demo_node_backup_status", "node_backup_status", backup, binary=True)
    add("101_vm_status", "vm_status", "stopped")
    result = await async_snapshot(hass, use_api=False)
    assert result["verdict"]["severity"] == severity
    assert [reason["kind"] for reason in result["verdict"]["reasons"]] == reasons


@pytest.mark.parametrize(
    ("age", "limit", "level", "reasons"),
    [
        (1, None, "ok", []),
        (8, None, "ok", []),
        (10, None, "warning", [("backup_age", "warning", 10)]),
        (20, None, "critical", [("backup_age", "critical", 20)]),
        (395, None, "critical", [("backup_age", "critical", 395)]),
        (10, 30, "ok", []),
        (4, 3, "warning", [("backup_age", "warning", 4)]),
        (6, 3, "critical", [("backup_age", "critical", 6)]),
    ],
)
async def test_proxmox_backup_age(
    hass, setup, proxmox_entity, freezer, age, limit, level, reasons
) -> None:
    freezer.move_to("2026-11-22T12:00:00+00:00")
    if limit is not None:
        hass.config_entries.async_update_entry(
            setup, options={rules.OPTION: {rules.BACKUP_MAX_AGE: limit}}
        )
    last = dt_util.utcnow() - timedelta(days=age, hours=1)
    add = proxmox_entity
    add("node/demo_node_status", "node_status", "online")
    add("node/demo_node_backup_status", "node_backup_status", "off", binary=True)
    add("node/demo_node_backup_last_backup", "node_backup_last_backup", last.isoformat())
    add("node/demo_node_backup_duration", "node_backup_duration", "17", "s")
    result = await async_snapshot(hass, use_api=False)
    backup = result["proxmox"]["backup"]
    assert backup["ok"] is True
    assert backup["duration_s"] == 17
    assert (backup["age_days"], backup["max_age_days"], backup["age_level"]) == (
        age,
        limit or rules.BACKUP_MAX_AGE_DAYS,
        level,
    )
    got = [(r["kind"], r["level"], r["value"]) for r in result["verdict"]["reasons"]]
    assert got == reasons
    assert result["verdict"]["severity"] == (level if reasons else "ok")


@pytest.mark.parametrize("value", ["0", "abc", None, "1000"])
async def test_backup_limit_invalid_falls_back(hass, setup, value) -> None:
    hass.config_entries.async_update_entry(
        setup, options={rules.OPTION: {rules.BACKUP_MAX_AGE: value}}
    )
    assert backup_max_age_days(hass) == rules.BACKUP_MAX_AGE_DAYS


async def test_proxmox_backup_without_last_backup_sensor(hass, proxmox_entity, freezer) -> None:
    freezer.move_to("2026-11-22T12:00:00+00:00")
    add = proxmox_entity
    add("node/demo_node_status", "node_status", "online")
    add("node/demo_node_backup_status", "node_backup_status", "off", binary=True)
    result = await async_snapshot(hass, use_api=False)
    backup = result["proxmox"]["backup"]
    assert (backup["ok"], backup["last"], backup["age_days"]) == (True, None, None)
    assert backup["age_level"] == "unknown"
    assert result["verdict"] == {"severity": "ok", "reasons": []}


async def test_proxmox_without_any_backup_sensor(hass, proxmox_entity) -> None:
    proxmox_entity("node/demo_node_status", "node_status", "online")
    result = await async_snapshot(hass, use_api=False)
    assert result["proxmox"]["backup"] is None
    assert result["verdict"] == {"severity": "ok", "reasons": []}


@pytest.mark.parametrize(("state", "ok", "reasons"), [("on", False, ["backup"]), ("off", True, [])])
async def test_proxmox_backup_status_is_problem_sensor(
    hass, proxmox_entity, freezer, state, ok, reasons
) -> None:
    """device_class problem: on = the backup failed, off = OK."""
    freezer.move_to("2026-11-22T12:00:00+00:00")
    add = proxmox_entity
    add("node/demo_node_status", "node_status", "online")
    add("node/demo_node_backup_status", "node_backup_status", state, binary=True)
    add("node/demo_node_backup_last_backup", "node_backup_last_backup", "2026-11-22T02:00:00+00:00")
    result = await async_snapshot(hass, use_api=False)
    assert result["proxmox"]["backup"]["ok"] is ok
    assert [r["kind"] for r in result["verdict"]["reasons"]] == reasons


async def test_options_flow_backup_limit(hass, setup) -> None:
    result = await hass.config_entries.options.async_init(setup.entry_id)
    result = await hass.config_entries.options.async_configure(
        result["flow_id"], {"next_step_id": "server"}
    )
    assert result["step_id"] == "server"
    field = next(key for key in result["data_schema"].schema if str(key) == rules.BACKUP_MAX_AGE)
    assert field.default() == rules.BACKUP_MAX_AGE_DAYS
    result = await hass.config_entries.options.async_configure(
        result["flow_id"], {rules.BACKUP_MAX_AGE: 14}
    )
    assert setup.options[rules.OPTION] == {rules.BACKUP_MAX_AGE: 14}
    assert backup_max_age_days(hass) == 14


async def test_glances_api_keeps_host_data_without_processes() -> None:
    calls = []

    async def fetch(path):
        calls.append(path)
        return {"/sensors": [{"label": "Core", "warning": 90}], "/core": {"log": 4}}[path]

    got = await GlancesApi("http://glances.example/api/4", fetch, collect_vms=False).async_get()
    assert calls == ["/sensors", "/core", "/load"]
    assert got["load"] is None
    assert got["cores"] == 4
    assert got["thresholds"] == {"Core": {"warning": 90, "critical": None}}
    assert got["vms"] == []


async def test_ws_proxmox_shape(hass, setup, hass_ws_client, proxmox_entity):
    proxmox_entity("101_vm_status", "vm_status", "stopped")
    client = await hass_ws_client(hass)
    await client.send_json_auto_id({"type": "homebrain/server/get", "api": False})
    msg = await client.receive_json()
    assert msg["success"]
    proxmox = msg["result"]["proxmox"]
    assert set(proxmox) == {"status", "node", "guests", "storages", "backup"}
    assert proxmox["guests"][0]["vmid"] == 101
    assert msg["result"]["vms"] == {"status": "off", "items": []}


@pytest.mark.parametrize("command", ["get", "history"])
async def test_ws_server_requires_admin(hass, setup, hass_ws_client, hass_admin_user, command):
    hass_admin_user.groups = []
    client = await hass_ws_client(hass)
    await client.send_json_auto_id({"type": f"homebrain/server/{command}"})
    msg = await client.receive_json()
    assert not msg["success"]
    assert msg["error"]["code"] == "unauthorized"


# ---------- Proxmox detail: guests, node, network rates ----------


def test_counter_rates_first_sample_reset_and_stale() -> None:
    rates = CounterRates()
    key = (101, "vm", "in")
    assert rates.rate(key, 1_000, 100.0) is None  # first sample
    assert rates.rate(key, 11_000, 110.0) == 1_000
    # Same Proxmox sample read again by another panel: same rate, not 0 B/s.
    assert rates.rate(key, 11_000, 110.0) == 1_000
    assert rates.rate(key, 11_000, 170.0) == 0  # idle guest, integration reported again
    assert rates.rate(key, 500, 230.0) is None  # counter reset (guest restarted)
    assert rates.rate(key, 6_500, 290.0) == 100
    assert rates.rate(key, 9_000, 290.0 + STALE_S + 1) is None  # too old to compare
    assert rates.rate(key, None, 2_000.0) is None
    assert rates.rate(key, 10_000, 2_010.0) is None  # sample forgotten with the missing value
    rates.prune(set())
    assert rates.rate(key, 20_000, 2_020.0) is None


async def test_proxmox_guest_detail_and_network_rate(hass, proxmox_entity, freezer) -> None:
    freezer.move_to("2026-11-23T08:00:00+00:00")
    add = proxmox_entity
    add("node/pve_node_status", "node_status", "online")
    add("node/pve_node_cpu", "node_cpu", "12.5", "%")
    add("node/pve_node_max_cpu", "node_max_cpu", "4")
    add("node/pve_node_memory", "node_memory", "16", "GiB")
    add("node/pve_node_max_memory", "node_max_memory", "32", "GiB")
    add("node/pve_node_disk", "node_disk", "20", "GiB")
    add("node/pve_node_max_disk", "node_max_disk", "80", "GiB")
    add("101_vm_status", "vm_status", "running", device=("vm_101", "web"))
    add("101_vm_cpu", "vm_cpu", "95", "%")
    add("101_vm_max_cpu", "vm_max_cpu", "2")
    add("101_vm_memory_percentage", "vm_memory_percentage", "93", "%")
    add("101_vm_disk", "vm_disk", "0", "B")
    add("101_vm_max_disk", "vm_max_disk", "64", "GB")
    netin = add("101_vm_netin", "vm_netin", "1000000", "B")
    add("102_container_status", "container_status", "running", device=("container_102", "db"))
    add("102_container_cpu", "container_cpu", "4", "%")
    add("102_container_disk", "container_disk", "31", "GB")
    add("102_container_max_disk", "container_max_disk", "100", "GB")
    add("103_container_status", "container_status", "stopped")
    add("103_container_cpu", "container_cpu", "0", "%")

    result = await async_snapshot(hass, use_api=False)
    proxmox = result["proxmox"]
    node = proxmox["node"]
    assert (node["cpu_percent"], node["cpus"], node["mem_percent"]) == (12.5, 4, 50)
    assert node["disk_percent"] == 25
    vm, ct, stopped = proxmox["guests"]
    assert (vm["vmid"], ct["vmid"], stopped["vmid"]) == (101, 102, 103)  # CPU desc, stopped last
    assert (vm["cpus"], vm["cpu_level"], vm["mem_level"]) == (2, "warning", "warning")
    # VM without the guest agent: 0 B used is unknown, the allocation stays.
    assert (vm["disk_bytes"], vm["disk_max_bytes"], vm["disk_percent"]) == (None, 64e9, None)
    assert (ct["disk_percent"], ct["disk_level"]) == (31, "ok")
    assert (stopped["cpu_level"], stopped["netin_bps"]) == ("unknown", None)
    assert vm["netin_bps"] is None  # first sample

    freezer.tick(60)
    hass.states.async_set(netin, "7000000", {"unit_of_measurement": "B"})
    result = await async_snapshot(hass, use_api=False)
    assert result["proxmox"]["guests"][0]["netin_bps"] == 100_000
    assert result["proxmox"]["guests"][0]["netin_bytes"] == 7_000_000

    freezer.tick(60)
    hass.states.async_set(netin, "2000", {"unit_of_measurement": "B"})  # guest rebooted
    result = await async_snapshot(hass, use_api=False)
    assert result["proxmox"]["guests"][0]["netin_bps"] is None
    # Host cores from Proxmox when the Glances API is off.
    assert "cpu" not in result or result["cpu"]["cores"] == 4


async def test_load_above_cores_is_a_warning(hass, proxmox_entity) -> None:
    sensors = [s if s[1] != "processor_load" else (*s[:3], "4.7", None) for s in SENSORS]
    install(hass, sensors)
    result = await async_snapshot(hass, use_api=False)
    assert result["cpu"]["cores"] is None  # no API, no Proxmox: no core count, no verdict
    assert result["verdict"]["reasons"] == []
    proxmox_entity("node/pve_node_status", "node_status", "online")
    proxmox_entity("node/pve_node_max_cpu", "node_max_cpu", "4")
    result = await async_snapshot(hass, use_api=False)
    assert result["cpu"]["cores"] == 4
    assert result["verdict"]["reasons"] == [
        {"kind": "load", "label": "zátěž", "value": 4.7, "level": "warning"}
    ]


@pytest.mark.parametrize(
    ("load", "cores", "level"),
    [(4.7, 4, "warning"), (4.0, 4, "ok"), (1.2, 4, "ok"), (2.0, None, "unknown")],
)
def test_load_level(load, cores, level) -> None:
    assert rules.load_level(load, cores) == level


async def test_discovery_reads_diskio_of_physical_disks(hass: HomeAssistant) -> None:
    install(
        hass,
        [
            *SENSORS,
            ("diskio_read", "read", "nvme0n1", "2.5", "MB/s"),
            ("diskio_write", "write", "nvme0n1", "800", "kB/s"),
            ("diskio_read", "read", "nvme0n1p3", "2.5", "MB/s"),
            ("diskio_write", "write", "dm-1", "9", "MB/s"),
            ("diskio_read", "read", "sda", "0", "B/s"),
        ],
    )
    diskio = build_snapshot(hass)["diskio"]
    assert diskio["primary"] == "nvme0n1"
    assert [d["name"] for d in diskio["disks"]] == ["nvme0n1", "sda"]
    assert diskio["disks"][0]["read_bps"] == pytest.approx(2.5e6)
    assert diskio["disks"][0]["write_bps"] == pytest.approx(8e5)


async def test_api_reads_load_averages() -> None:
    async def fetch(path: str):
        return {
            "/sensors": [],
            "/core": {"log": 4},
            "/load": {"min1": 4.71, "min5": 3.2, "min15": 2.05, "cpucore": 4},
        }[path]

    got = await GlancesApi("http://x/api/4", fetch, collect_vms=False).async_get()
    assert got["load"] == [4.71, 3.2, 2.05]


async def test_ws_guest_history_uses_its_sensors(hass, setup, hass_ws_client, proxmox_entity):
    cpu = proxmox_entity("101_vm_cpu", "vm_cpu", "5", "%")
    mem = proxmox_entity("101_vm_memory_percentage", "vm_memory_percentage", "40", "%")
    proxmox_entity("102_container_cpu", "container_cpu", "5", "%")
    assert guest_entities(hass, 101, "vm") == {"cpu": cpu, "memory": mem}
    assert guest_entities(hass, 101, "ct") == {}
    client = await hass_ws_client(hass)
    await client.send_json_auto_id(
        {"type": "homebrain/server/history", "guest": {"vmid": 101, "kind": "vm"}}
    )
    msg = await client.receive_json()
    assert msg["success"], msg
    assert msg["result"]["series"] == {}  # no recorder in tests
