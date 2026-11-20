"""Topení: renamed ground-collector keys – map aliases + entity registry migration."""

from __future__ import annotations

import pytest
from homeassistant.core import HomeAssistant
from homeassistant.helpers import entity_registry as er
from pytest_homeassistant_custom_component.common import MockConfigEntry
from pytest_homeassistant_custom_component.components.recorder.common import (
    async_wait_recording_done,
)

from custom_components.homebrain.const import DOMAIN
from custom_components.homebrain.heating.legacy import LEGACY_KEYS, async_migrate_entities
from custom_components.homebrain.heating.mapfile import parse_map

OLD_IN, OLD_OUT = "heating_heat_pump_brine_in", "heating_heat_pump_brine_out"
NEW_IN, NEW_OUT = "heating_heat_pump_collector_in", "heating_heat_pump_collector_out"


def _register(hass: HomeAssistant, uid: str, object_id: str | None = None) -> str:
    entry = MockConfigEntry(domain=DOMAIN)
    entry.add_to_hass(hass)
    return (
        er.async_get(hass)
        .async_get_or_create(
            "sensor", DOMAIN, uid, suggested_object_id=object_id or uid, config_entry=entry
        )
        .entity_id
    )


def test_old_map_keys_are_aliases():
    hmap = parse_map(
        "keys:\n"
        "  heat_pump.brine_in: {page: 17, var: X360}\n"
        "  heat_pump.brine_out: {page: 17, var: X372}\n"
    )
    assert set(hmap.keys) == {"heat_pump.collector_in", "heat_pump.collector_out"}
    assert hmap.keys["heat_pump.collector_in"].var == "X360"
    assert any("deprecated key 'heat_pump.brine_in'" in w for w in hmap.warnings)


def test_new_map_key_wins_over_alias():
    hmap = parse_map(
        "keys:\n"
        "  heat_pump.collector_in: {page: 17, var: X360}\n"
        "  heat_pump.brine_in: {page: 17, var: X999}\n"
    )
    assert hmap.keys["heat_pump.collector_in"].var == "X360"
    assert any("ignored" in w for w in hmap.warnings)


def test_alias_table_targets_exist():
    from custom_components.homebrain.heating.keys import KEYS

    assert all(new in KEYS and old not in KEYS for old, new in LEGACY_KEYS.items())


async def test_migrates_default_entities_and_is_idempotent(hass: HomeAssistant):
    _register(hass, OLD_IN)
    _register(hass, OLD_OUT)
    reg = er.async_get(hass)

    assert async_migrate_entities(hass) == 2
    assert reg.async_get_entity_id("sensor", DOMAIN, OLD_IN) is None
    assert reg.async_get_entity_id("sensor", DOMAIN, NEW_IN) == f"sensor.{NEW_IN}"
    assert reg.async_get_entity_id("sensor", DOMAIN, NEW_OUT) == f"sensor.{NEW_OUT}"
    assert reg.async_get(f"sensor.{OLD_IN}") is None

    assert async_migrate_entities(hass) == 0
    assert reg.async_get_entity_id("sensor", DOMAIN, NEW_IN) == f"sensor.{NEW_IN}"


async def test_customised_entity_id_is_kept(hass: HomeAssistant):
    _register(hass, OLD_IN, "kolektor_vstup")
    reg = er.async_get(hass)

    assert async_migrate_entities(hass) == 1
    assert reg.async_get_entity_id("sensor", DOMAIN, NEW_IN) == "sensor.kolektor_vstup"


async def test_existing_target_is_not_clobbered(hass: HomeAssistant):
    # new unique id already registered -> the old entry stays untouched
    _register(hass, OLD_IN)
    _register(hass, NEW_IN)
    # target entity id taken by a foreign entity -> unique id moves, entity id stays
    _register(hass, OLD_OUT)
    er.async_get(hass).async_get_or_create("sensor", "other", "x", suggested_object_id=NEW_OUT)
    reg = er.async_get(hass)

    assert async_migrate_entities(hass) == 1
    assert reg.async_get_entity_id("sensor", DOMAIN, OLD_IN) == f"sensor.{OLD_IN}"
    assert reg.async_get_entity_id("sensor", DOMAIN, NEW_IN) == f"sensor.{NEW_IN}"
    assert reg.async_get_entity_id("sensor", DOMAIN, NEW_OUT) == f"sensor.{OLD_OUT}"
    assert reg.async_get_entity_id("sensor", "other", "x") == f"sensor.{NEW_OUT}"


@pytest.fixture
def mock_recorder_before_hass(async_setup_recorder_instance) -> None:
    """Recorder tests: set the recorder up before ``hass``."""


async def test_recorder_history_follows_new_entity_id(hass: HomeAssistant, recorder_mock):
    from homeassistant.components.recorder import history

    old = _register(hass, OLD_IN)
    hass.states.async_set(old, "6.1")
    await async_wait_recording_done(hass)

    async_migrate_entities(hass)
    await hass.async_block_till_done()
    await async_wait_recording_done(hass)

    states = await recorder_mock.async_add_executor_job(
        history.get_last_state_changes, hass, 1, f"sensor.{NEW_IN}"
    )
    assert [s.state for s in states[f"sensor.{NEW_IN}"]] == ["6.1"]
