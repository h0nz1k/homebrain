"""Roboti presets + defaults: store, migration, apply order, allowlist, roles (no real robot)."""

import pytest
from homeassistant.core import HomeAssistant, ServiceCall
from homeassistant.setup import async_setup_component
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.homebrain.const import DOMAIN
from custom_components.homebrain.robots import presets as presets_mod
from custom_components.homebrain.robots.presets import (
    STORAGE_KEY,
    PresetError,
    PresetStore,
    build_plan,
    check_allowlist,
    clean_settings,
    effective_settings,
    migrate_data,
)

BINDINGS = {
    "robot1_vacuum": "vacuum.robot_a",
    "robot1_cleaning_mode": "select.robot_a_mode",
    "robot1_mop_intensity": "select.robot_a_water",
    "robot1_mop_mode": "select.robot_a_route",
    "robot2_vacuum": "vacuum.robot_b",
}
FANS = ["quiet", "balanced", "turbo", "max", "max_plus", "off", "custom"]


def _states(hass: HomeAssistant, mode="vac_and_mop", water="high", fan="max") -> None:
    hass.states.async_set("vacuum.robot_a", "docked", {"fan_speed": fan, "fan_speed_list": FANS})
    hass.states.async_set(
        "select.robot_a_mode", mode, {"options": ["vacuum", "vac_and_mop", "mop", "custom"]}
    )
    hass.states.async_set(
        "select.robot_a_water",
        water,
        {"options": ["off", "low", "medium", "high", "custom_water_flow"]},
    )
    hass.states.async_set(
        "select.robot_a_route", "standard", {"options": ["standard", "deep", "deep_plus", "fast"]}
    )
    hass.states.async_set("vacuum.robot_b", "docked", {"fan_speed_list": ["quiet", "max"]})


def _mock_services(hass: HomeAssistant, react: bool = True) -> list[ServiceCall]:
    """Record calls; ``react`` mirrors the new value into the state like a real robot."""
    calls: list[ServiceCall] = []

    async def handler(call: ServiceCall) -> None:
        calls.append(call)
        if not react:
            return
        entities = call.data.get("entity_id", [])
        for entity in [entities] if isinstance(entities, str) else entities:
            state = hass.states.get(entity)
            if call.service == "select_option":
                hass.states.async_set(entity, call.data["option"], state.attributes)
            elif call.service == "set_fan_speed":
                hass.states.async_set(
                    entity, state.state, {**state.attributes, "fan_speed": call.data["fan_speed"]}
                )

    for domain, service in (
        ("select", "select_option"),
        ("vacuum", "set_fan_speed"),
        ("vacuum", "send_command"),
        ("vacuum", "start"),
    ):
        hass.services.async_register(domain, service, handler)
    return calls


def test_clean_settings_and_effective_layers():
    assert clean_settings({"mode": "x", "fan": "Turbo!", "passes": 9}) == {
        "mode": None,
        "fan": None,
        "water": None,
        "route": None,
        "passes": 3,
    }
    defaults = clean_settings({"mode": "both", "fan": "quiet", "water": "low", "passes": 2})
    preset = clean_settings({"fan": "max"})
    assert effective_settings(defaults, preset, None) == {
        "mode": "both",
        "fan": "max",
        "water": "low",
        "route": None,
        "passes": 1,  # preset passes (1) overrides the default
    }
    assert effective_settings(None, None, None)["passes"] == 1


def test_migration_normalises_and_rejects_future_versions():
    raw = {
        "robots": {
            "1": {
                "defaults": {"mode": "mop", "passes": "x"},
                "presets": [
                    {
                        "id": "abcdef012345",
                        "name": " Rychlé  vysátí ",
                        "rooms": [3, 3, -1, True, 2],
                    },
                    {"id": "abcdef012345", "name": "duplicate id"},
                    {"id": "NOT-HEX", "name": "bad id"},
                    {"id": "0123456789ab", "name": ""},
                ],
            },
            "9": {"presets": []},
            "2": "garbage",
        }
    }
    data = migrate_data(1, 0, raw)
    assert list(data["robots"]) == ["1"]
    robot = data["robots"]["1"]
    assert robot["defaults"]["mode"] == "mop" and robot["defaults"]["passes"] == 1
    assert [(p["id"], p["name"], p["rooms"]) for p in robot["presets"]] == [
        ("abcdef012345", "Rychlé vysátí", [3, 2])
    ]
    with pytest.raises(NotImplementedError):
        migrate_data(2, 0, raw)


async def test_store_crud_and_persistence(hass: HomeAssistant, hass_storage):
    store = PresetStore(hass)
    saved = await store.async_save_preset(1, {"name": "Důkladně 2×", "mode": "mop", "passes": 2})
    assert len(saved["id"]) == 12 and saved["passes"] == 2
    with pytest.raises(PresetError) as err:
        await store.async_save_preset(1, {"name": "důkladně 2×"})
    assert err.value.code == "duplicate_name"
    with pytest.raises(PresetError) as err:
        await store.async_save_preset(1, {"id": "ffffffffffff", "name": "x"})
    assert err.value.code == "not_found"
    edited = await store.async_save_preset(1, {**saved, "name": "Mop 2×", "rooms": [5, 4]})
    assert edited["id"] == saved["id"] and edited["rooms"] == [5, 4]
    await store.async_set_defaults(1, {"mode": "vacuum", "fan": "quiet"})
    await hass.async_block_till_done()
    # A fresh store (HA restart) reads the versioned file.
    assert hass_storage[STORAGE_KEY]["version"] == 1
    again = PresetStore(hass)
    listed = await again.async_list()
    assert listed["1"]["defaults"]["fan"] == "quiet"
    assert [p["name"] for p in listed["1"]["presets"]] == ["Mop 2×"]
    assert await again.async_delete_preset(1, saved["id"]) is True
    assert await again.async_delete_preset(1, saved["id"]) is False
    for i in range(presets_mod.MAX_PRESETS):
        await again.async_save_preset(2, {"name": f"P{i}"})
    with pytest.raises(PresetError) as err:
        await again.async_save_preset(2, {"name": "one too many"})
    assert err.value.code == "too_many"


async def test_store_migrates_old_minor_version(hass: HomeAssistant, hass_storage):
    hass_storage[STORAGE_KEY] = {
        "version": 1,
        "minor_version": 0,
        "key": STORAGE_KEY,
        "data": {"robots": {"1": {"presets": [{"id": "abcdef012345", "name": "Old"}]}}},
    }
    listed = await PresetStore(hass).async_list()
    assert listed["1"]["defaults"] is None
    assert listed["1"]["presets"][0]["passes"] == 1


async def test_plan_order_skips_unsupported_and_unchanged(hass: HomeAssistant):
    _states(hass, mode="vacuum", water="high", fan="max")
    settings = effective_settings(
        {"mode": "both", "fan": "quiet", "water": "low", "route": "deep", "passes": 2}
    )
    steps, skipped = build_plan(BINDINGS, 1, hass.states.get, settings, [4, 2])
    assert [(s["domain"], s["service"], s["field"]) for s in steps] == [
        ("select", "select_option", "mode"),
        ("vacuum", "set_fan_speed", "fan"),
        ("select", "select_option", "water"),
        ("select", "select_option", "route"),
        ("vacuum", "send_command", "start"),
    ]
    assert steps[0]["data"] == {"option": "vac_and_mop"}
    assert steps[-1]["data"]["params"] == [{"segments": [4, 2], "repeat": 2}]
    assert skipped == []
    # Vacuum-only: no water/route; unsupported fan + blocked option are skipped.
    steps, skipped = build_plan(
        BINDINGS,
        1,
        hass.states.get,
        effective_settings({"mode": "vacuum", "fan": "smart_mode", "water": "low"}),
        [],
    )
    assert [s["field"] for s in steps] == ["start"]
    assert steps[0]["service"] == "start"
    assert skipped == ["fan"]
    # Mop-only ignores suction; water "off" and the app-only "custom" mode are never applied.
    steps, skipped = build_plan(
        BINDINGS,
        1,
        hass.states.get,
        effective_settings({"mode": "mop", "fan": "turbo", "water": "off", "passes": 3}),
        [],
    )
    assert [s["field"] for s in steps] == ["mode", "start"]
    assert skipped == ["water", "passes"]
    # Robot without mode/water selects (robot 2): only suction + start.
    hass.states.async_set(
        "vacuum.robot_b", "docked", {"fan_speed": "max", "fan_speed_list": ["quiet", "max"]}
    )
    steps, skipped = build_plan(
        BINDINGS, 2, hass.states.get, effective_settings({"mode": "both", "fan": "quiet"}), [1]
    )
    assert [s["field"] for s in steps] == ["fan", "start"]
    assert skipped == ["mode"]


def test_allowlist_refuses_foreign_targets_and_services():
    good = [{"domain": "vacuum", "service": "start", "entity_id": "vacuum.robot_a"}]
    check_allowlist(good, BINDINGS, 1)
    for bad in (
        {"domain": "vacuum", "service": "start", "entity_id": "vacuum.robot_b"},
        {"domain": "lock", "service": "unlock", "entity_id": "vacuum.robot_a"},
        {"domain": "select", "service": "select_option", "entity_id": "select.garage"},
    ):
        with pytest.raises(PresetError):
            check_allowlist([bad], BINDINGS, 1)


@pytest.fixture
async def setup(hass: HomeAssistant):
    entry = MockConfigEntry(domain=DOMAIN, data={}, options={"bindings": {"robots": BINDINGS}})
    entry.add_to_hass(hass)
    assert await async_setup_component(hass, DOMAIN, {})
    await hass.async_block_till_done()
    return entry


async def _ws(client, payload):
    await client.send_json_auto_id(payload)
    return await client.receive_json()


async def test_ws_preset_start_applies_then_starts(hass: HomeAssistant, setup, hass_ws_client):
    _states(hass, mode="vac_and_mop", water="high", fan="max")
    calls = _mock_services(hass)
    client = await hass_ws_client(hass)
    res = await _ws(
        client,
        {
            "type": "homebrain/robots/defaults/set",
            "slot": 1,
            "defaults": {"mode": "both", "fan": "quiet", "water": "low", "passes": 1},
        },
    )
    assert res["success"], res
    res = await _ws(
        client,
        {
            "type": "homebrain/robots/presets/save",
            "slot": 1,
            "preset": {"name": "Rychlé vysátí", "mode": "vacuum", "fan": "turbo", "rooms": [3, 1]},
        },
    )
    preset = res["result"]["preset"]
    res = await _ws(client, {"type": "homebrain/robots/presets/list"})
    assert res["result"]["robots"]["1"]["presets"][0]["name"] == "Rychlé vysátí"
    res = await _ws(
        client, {"type": "homebrain/robots/start", "slot": 1, "preset_id": preset["id"]}
    )
    assert res["success"], res
    assert [(c.domain, c.service) for c in calls] == [
        ("select", "select_option"),
        ("vacuum", "set_fan_speed"),
        ("vacuum", "send_command"),
    ]
    assert calls[0].data["option"] == "vacuum"
    assert calls[1].data["fan_speed"] == "turbo"
    assert calls[2].data["params"] == [{"segments": [3, 1], "repeat": 1}]
    assert res["result"]["applied"] == ["mode", "fan", "start"]
    # Rooms without a preset: the defaults are applied (mode both, quiet, low water).
    calls.clear()
    res = await _ws(client, {"type": "homebrain/robots/start", "slot": 1, "rooms": [2]})
    assert res["success"], res
    assert [c.data.get("option") or c.data.get("fan_speed") for c in calls[:3]] == [
        "vac_and_mop",
        "quiet",
        "low",
    ]
    assert calls[-1].data["params"] == [{"segments": [2], "repeat": 1}]
    res = await _ws(
        client, {"type": "homebrain/robots/presets/delete", "slot": 1, "preset_id": preset["id"]}
    )
    assert res["result"] == {"deleted": True}


async def test_ws_start_waits_for_state_and_aborts_on_mismatch(
    hass: HomeAssistant, setup, hass_ws_client, monkeypatch
):
    _states(hass, mode="vacuum", fan="max")
    calls = _mock_services(hass, react=False)
    monkeypatch.setattr(presets_mod, "VERIFY_TIMEOUT", 0.3)
    monkeypatch.setattr(presets_mod, "VERIFY_STEP", 0.05)
    client = await hass_ws_client(hass)
    res = await _ws(
        client,
        {"type": "homebrain/robots/start", "slot": 1, "rooms": [1], "settings": {"mode": "mop"}},
    )
    assert res["error"]["code"] == "apply_timeout"
    # The robot never got the start command after the mode did not switch.
    assert [(c.domain, c.service) for c in calls] == [("select", "select_option")]
    # A select that never reports (state unknown, e.g. some models) does not block the start.
    hass.states.async_set("select.robot_a_mode", "unknown", {"options": ["vacuum", "mop"]})
    calls.clear()
    res = await _ws(
        client,
        {"type": "homebrain/robots/start", "slot": 1, "rooms": [1], "settings": {"mode": "mop"}},
    )
    assert res["success"], res
    assert res["result"]["unconfirmed"] == ["mode"]
    assert calls[-1].service == "send_command"


async def test_ws_validation_and_unconfigured_robot(hass: HomeAssistant, setup, hass_ws_client):
    _states(hass)
    calls = _mock_services(hass)
    client = await hass_ws_client(hass)
    res = await _ws(client, {"type": "homebrain/robots/start", "slot": 3})
    assert res["error"]["code"] == "not_found"
    res = await _ws(
        client, {"type": "homebrain/robots/start", "slot": 1, "preset_id": "abcdef012345"}
    )
    assert res["error"]["code"] == "not_found"
    res = await _ws(
        client,
        {"type": "homebrain/robots/start", "slot": 1, "settings": {"fan": "Max; rm"}},
    )
    assert res["error"]["code"] == "invalid_format"
    hass.states.async_set("vacuum.robot_a", "unavailable", {})
    res = await _ws(client, {"type": "homebrain/robots/start", "slot": 1})
    assert res["error"]["code"] == "unavailable"
    assert calls == []


async def test_ws_non_admin_is_refused(hass: HomeAssistant, setup, hass_ws_client, hass_admin_user):
    _states(hass)
    calls = _mock_services(hass)
    hass_admin_user.groups = []
    hass.config_entries.async_update_entry(
        setup,
        options={**setup.options, "roles": {hass_admin_user.id: "adult"}},
    )
    client = await hass_ws_client(hass)
    for payload in (
        {"type": "homebrain/robots/start", "slot": 1},
        {"type": "homebrain/robots/presets/save", "slot": 1, "preset": {"name": "x"}},
        {"type": "homebrain/robots/defaults/set", "slot": 1, "defaults": None},
    ):
        res = await _ws(client, payload)
        assert res["error"]["code"] == "unauthorized"
    assert calls == []
