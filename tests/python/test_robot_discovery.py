"""Roboti (#21): robot floor + entity bindings discovered from the HA registries.

Fixtures are the real entity registries of three Roborock models (object ids anonymised,
``translation_key``/device split kept): the robot device plus its separate ``<duid>_dock`` device.
"""

import json
from pathlib import Path
from typing import Any

import pytest
from homeassistant.core import HomeAssistant
from homeassistant.helpers import area_registry as ar
from homeassistant.helpers import device_registry as dr
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers import floor_registry as fr
from homeassistant.setup import async_setup_component
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.homebrain.const import DOMAIN
from custom_components.homebrain.robots.discovery import (
    discover_bindings,
    discover_floor,
    missing_bindings,
)

FIXTURES = Path(__file__).parent / "fixtures" / "robots"

# Binding suffix -> entity every model must yield (only what the model really has).
COMMON = {
    "vacuum": "vacuum.{r}",
    "status": "sensor.{r}_stav",
    "error": "sensor.{r}_chyba_vysavace",
    "dock_error": "sensor.{r}_dock_chyba_doku",
    "battery": "sensor.{r}_baterie",
    "current_room": "sensor.{r}_aktualni_mistnost",
    "cleaning_progress": "sensor.{r}_prubeh_uklidu",
    "main_brush": "sensor.{r}_zbyvajici_cas_hlavniho_kartace",
    "side_brush": "sensor.{r}_zbyvajici_cas_bocniho_kartace",
    "filter": "sensor.{r}_zbyvajici_cas_filtru",
    "sensors": "sensor.{r}_zbyvajici_cas_senzoru",
    "dock_strainer": "sensor.{r}_dock_zbyvajici_doba_sitka",
    "clean_water": "binary_sensor.{r}_dock_nadoba_na_cistou_vodu",
    "dirty_water": "binary_sensor.{r}_dock_nadoba_na_spinavou_vodu",
    "water_shortage": "binary_sensor.{r}_nedostatek_vody",
    "cleaning_mode": "select.{r}_rezim_uklidu",
    "mop_intensity": "select.{r}_intenzita_mopovani",
    "mop_mode": "select.{r}_rezim_mopovani",
    "selected_map": "select.{r}_vybrana_mapa",
}
MODELS = {
    "qrevo_edge": ("robot_a", {"map_image": "image.robot_a_prizemi"}),
    "saros_10r": (
        "robot_b",
        {
            "map_image": "image.robot_b_map_0",
            "cleaning_fluid": "binary_sensor.robot_b_dock_cistici_kapalina",
        },
    ),
    "s7_maxv_ultra": (
        "robot_c",
        {
            "map_image": "image.robot_c_map_1",
            "dock_brush": "sensor.robot_c_dock_zbyvajici_doba_udrzby_kartacku",
        },
    ),
}


def _load(model: str) -> dict:
    return json.loads((FIXTURES / f"registry_{model}.json").read_text(encoding="utf-8"))


def install_registry(hass: HomeAssistant, model: str, *, with_area: bool = True) -> dict:
    """Recreate one robot's devices/entities (+ area→floor) in the HA registries."""
    data = _load(model)
    entry = MockConfigEntry(domain="roborock", title=model)
    entry.add_to_hass(hass)
    duid = f"duid_{model}"
    devices = dr.async_get(hass)
    area_id = None
    if with_area:
        floor = fr.async_get(hass).async_create(data["floor"]["name"], level=data["floor"]["level"])
        area_id = ar.async_get(hass).async_create(f"Chodba {model}", floor_id=floor.floor_id).id
    ids = {}
    for role, identifier, name in (("main", duid, "Robot"), ("dock", f"{duid}_dock", "Dock")):
        device = devices.async_get_or_create(
            config_entry_id=entry.entry_id,
            identifiers={("roborock", identifier)},
            name=f"{name} {model}",
            model=data["model"] + ("" if role == "main" else " Dock"),
        )
        if area_id:
            devices.async_update_device(device.id, area_id=area_id)
        ids[role] = device.id
    entities = er.async_get(hass)
    for index, item in enumerate(data["entities"]):
        domain, object_id = item["entity_id"].split(".", 1)
        created = entities.async_get_or_create(
            domain,
            "roborock",
            f"{model}_{index}",
            suggested_object_id=object_id,
            config_entry=entry,
            device_id=ids[item["device"]],
            translation_key=item["translation_key"],
            original_device_class=item["original_device_class"],
            disabled_by=er.RegistryEntryDisabler.INTEGRATION if item["disabled"] else None,
        )
        assert created.entity_id == item["entity_id"]
    return data


@pytest.mark.parametrize("model", list(MODELS))
async def test_discovers_bindings_for_each_model(hass: HomeAssistant, model: str):
    robot, extra = MODELS[model]
    data = install_registry(hass, model)
    expected = {key: value.format(r=robot) for key, value in COMMON.items()} | extra
    assert discover_bindings(hass, data["vacuum"]) == expected


@pytest.mark.parametrize("model", list(MODELS))
async def test_floor_from_device_area(hass: HomeAssistant, model: str):
    data = install_registry(hass, model)
    assert discover_floor(hass, data["vacuum"]) == data["floor"]["name"]


async def test_no_area_no_floor_and_unknown_vacuum(hass: HomeAssistant):
    data = install_registry(hass, "qrevo_edge", with_area=False)
    assert discover_floor(hass, data["vacuum"]) is None
    assert discover_floor(hass, "vacuum.unknown") is None
    assert discover_bindings(hass, "vacuum.unknown") == {}
    assert discover_bindings(hass, "") == {}


def test_missing_bindings_never_overwrites():
    current = {"robot2_vacuum": "vacuum.x", "robot2_status": "sensor.manual"}
    found = {"vacuum": "vacuum.x", "status": "sensor.auto", "battery": "sensor.auto_battery"}
    assert missing_bindings(current, 2, found) == {"robot2_battery": "sensor.auto_battery"}


def _suggested(result: Any) -> dict:
    return {
        str(key): (key.description or {}).get("suggested_value")
        for key in result["data_schema"].schema
    }


async def _open(hass: HomeAssistant, entry: MockConfigEntry, step: str) -> Any:
    result = await hass.config_entries.options.async_init(entry.entry_id)
    return await hass.config_entries.options.async_configure(
        result["flow_id"], {"next_step_id": step}
    )


async def test_options_flow_shows_prefilled_bindings_and_ha_floor(hass: HomeAssistant):
    install_registry(hass, "saros_10r")
    entry = MockConfigEntry(
        domain=DOMAIN,
        options={
            "bindings": {
                "robots": {"robot1_vacuum": "vacuum.robot_b", "robot1_status": "sensor.manual"}
            },
            "robots": {"1": {"name": "Beta", "floor": "Sklep", "image": ""}},
        },
    )
    entry.add_to_hass(hass)
    result = await _open(hass, entry, "robots_1")
    suggested = _suggested(result)
    assert suggested["robot1_status"] == "sensor.manual"  # manual binding kept
    assert suggested["robot1_dock_error"] == "sensor.robot_b_dock_chyba_doku"
    assert suggested["robot1_cleaning_fluid"] == "binary_sensor.robot_b_dock_cistici_kapalina"
    assert suggested["robot1_dock_brush"] is None  # Saros dock has no brush sensor
    assert suggested["floor"] == "1. patro"  # HA area → floor wins over the manual value
    assert result["description_placeholders"]["ha_floor"] == "1. patro"


async def test_options_flow_new_vacuum_prefills_then_saves(hass: HomeAssistant):
    install_registry(hass, "s7_maxv_ultra")
    entry = MockConfigEntry(domain=DOMAIN, options={})
    entry.add_to_hass(hass)
    result = await _open(hass, entry, "robots_3")
    shown = await hass.config_entries.options.async_configure(
        result["flow_id"],
        {"name": "Céčko", "robot3_vacuum": "vacuum.robot_c", "robot3_battery": "sensor.mine"},
    )
    # The form comes back once with everything found on the same device filled in.
    assert shown["type"] == "form" and shown["step_id"] == "robots_3"
    suggested = _suggested(shown)
    assert suggested["robot3_battery"] == "sensor.mine"
    assert suggested["robot3_dock_brush"] == "sensor.robot_c_dock_zbyvajici_doba_udrzby_kartacku"
    assert suggested["name"] == "Céčko"
    assert suggested["floor"] == "2. patro"
    # The user cleared one prefilled field: that choice is respected on save.
    user_input = {key: value for key, value in suggested.items() if value is not None}
    user_input.pop("robot3_mop_mode")
    done = await hass.config_entries.options.async_configure(shown["flow_id"], user_input)
    assert done["type"] == "create_entry"
    saved = entry.options["bindings"]["robots"]
    assert saved["robot3_battery"] == "sensor.mine"
    assert saved["robot3_dirty_water"] == "binary_sensor.robot_c_dock_nadoba_na_spinavou_vodu"
    assert "robot3_mop_mode" not in saved
    assert entry.options["robots"]["3"]["floor"] == "2. patro"


async def test_options_flow_without_discovery_saves_directly(hass: HomeAssistant):
    entry = MockConfigEntry(domain=DOMAIN, options={})
    entry.add_to_hass(hass)
    result = await _open(hass, entry, "robots_2")
    assert result["description_placeholders"]["ha_floor"] == "–"
    done = await hass.config_entries.options.async_configure(
        result["flow_id"], {"floor": "Půda", "robot2_vacuum": "vacuum.no_registry"}
    )
    assert done["type"] == "create_entry"
    assert entry.options["robots"]["2"]["floor"] == "Půda"


async def test_ws_robots_get_floor_from_ha_area_else_manual(hass: HomeAssistant, hass_ws_client):
    install_registry(hass, "qrevo_edge")
    entry = MockConfigEntry(
        domain=DOMAIN,
        options={
            "bindings": {
                "robots": {"robot1_vacuum": "vacuum.robot_a", "robot2_vacuum": "vacuum.other"}
            },
            "robots": {
                "1": {"name": "A", "floor": "Sklep", "image": ""},
                "2": {"name": "B", "floor": "Půda", "image": ""},
            },
        },
    )
    entry.add_to_hass(hass)
    assert await async_setup_component(hass, DOMAIN, {})
    await hass.async_block_till_done()
    client = await hass_ws_client(hass)
    await client.send_json({"id": 1, "type": "homebrain/robots/get"})
    response = await client.receive_json()
    assert response["success"], response
    assert [(r["slot"], r["floor"]) for r in response["result"]["robots"]] == [
        (1, "Přízemí"),
        (2, "Půda"),
    ]
