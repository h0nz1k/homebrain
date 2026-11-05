"""Test bindings validation, authorization, and persistence."""

from unittest.mock import Mock, patch

import pytest
import voluptuous as vol
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import Unauthorized
from homeassistant.setup import async_setup_component
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.homebrain.bindings import get_bindings, is_valid_key
from custom_components.homebrain.const import DOMAIN
from custom_components.homebrain.websocket import websocket_get_bindings


@pytest.fixture
def entry(hass: HomeAssistant):
    """Add an entry with synthetic bindings."""
    entry = MockConfigEntry(
        domain=DOMAIN,
        data={},
        options={
            "demo_option": True,
            "bindings": {
                "waste": {
                    "waste_dataset": "sensor.demo_waste_dataset",
                    "waste_next_papir": "sensor.demo_paper",
                }
            },
        },
    )
    entry.add_to_hass(hass)
    return entry


@pytest.fixture
async def client(hass: HomeAssistant, hass_ws_client):
    """Register commands without loading the panel."""
    assert await async_setup_component(hass, DOMAIN, {})
    return await hass_ws_client(hass)


@pytest.mark.parametrize(
    ("module", "key", "valid"),
    [
        ("waste", "waste_dataset", True),
        ("waste", "waste_next", True),
        ("waste", "waste_next_papir", True),
        ("waste", "waste_next_demo_2", True),
        ("waste", "waste_calendar", True),
        ("waste", "waste_next_", False),
        ("waste", "waste_next_Paper", False),
        ("waste", "waste_next_demo\n", False),
        ("waste", "unknown", False),
        ("unknown", "waste_next", False),
        ("health", "health_weekly_strength_progress", True),
        ("health", "health_milestone_0500", True),
        ("health", "health_weight_trend", True),
        ("health", "health_milestone_0500_2", False),
        ("health", "waste_next", False),
        ("waste", "health_xp_total", False),
        ("energy", "energy_pv_power", True),
        ("energy", "energy_spot_price_electricity", True),
        ("energy", "energy_grid_import_energy_today", True),
        ("energy", "energy_pv_power_2", False),
        ("energy", "energy_appliance_heat_pump_power", True),
        ("energy", "energy_appliance_dishwasher_energy", True),
        ("energy", "energy_appliance_coffee_maker_switch", True),
        ("energy", "energy_appliance_dehumidifier_power", True),
        ("energy", "energy_appliance_washer_power", False),
        ("energy", "waste_next", False),
        ("waste", "energy_pv_power", False),
    ],
)
def test_valid_key(module, key, valid):
    """Only supported logical keys are accepted."""
    assert is_valid_key(module, key) is valid


def test_get_bindings_copy():
    """Ignore malformed stored values and return independent dictionaries."""
    options = {
        "bindings": {
            "unknown": {"waste_next": "sensor.demo_next"},
            "waste": {
                "waste_dataset": "sensor.demo_dataset",
                "waste_next": "",
                "waste_next_papir": "invalid",
                "waste_next_demo": None,
                "waste_next_number": 1,
                "waste_calendar": "sensor.demo_not_calendar",
                "unknown": "sensor.demo_unknown",
            },
        }
    }
    entry = MockConfigEntry(domain=DOMAIN, data={}, options=options)
    result = get_bindings(entry)
    assert result == {"waste": {"waste_dataset": "sensor.demo_dataset"}}
    result["waste"]["waste_dataset"] = "sensor.demo_changed"
    assert entry.options["bindings"]["waste"]["waste_dataset"] == "sensor.demo_dataset"


@pytest.mark.parametrize("stored", [None, [], {"waste": None}])
def test_malformed_bindings(stored):
    """Malformed mappings are ignored."""
    entry = MockConfigEntry(domain=DOMAIN, data={}, options={"bindings": stored})
    assert get_bindings(entry) == {}


async def test_get_admin(client, entry):
    """Admins receive the nested options mapping."""
    await client.send_json_auto_id({"type": "homebrain/bindings/get"})
    response = await client.receive_json()
    assert response["success"]
    assert response["result"] == entry.options["bindings"]


async def test_non_admin(
    hass, hass_ws_client, hass_read_only_access_token, hass_read_only_user, client, entry
):
    """Unmapped non-admins get nothing; a mapped role (kiosk) reads but cannot change."""
    reader = await hass_ws_client(hass, access_token=hass_read_only_access_token)
    await reader.send_json_auto_id({"type": "homebrain/bindings/get"})
    response = await reader.receive_json()
    assert response["error"]["code"] == "unauthorized"
    hass.config_entries.async_update_entry(
        entry, options={**entry.options, "roles": {hass_read_only_user.id: "kiosk"}}
    )
    await reader.send_json_auto_id({"type": "homebrain/bindings/get"})
    response = await reader.receive_json()
    assert response["success"]
    assert response["result"] == entry.options["bindings"]
    original = dict(entry.options)
    await reader.send_json_auto_id(
        {
            "type": "homebrain/bindings/set",
            "module": "waste",
            "bindings": {},
            "replace": True,
        }
    )
    response = await reader.receive_json()
    assert not response["success"]
    assert response["error"]["code"] == "unauthorized"
    assert entry.options == original


def test_get_unauthenticated(hass):
    """The handler also rejects connections without a user (role guest)."""
    connection = Mock(user=None)
    with pytest.raises(Unauthorized):
        websocket_get_bindings(hass, connection, {"id": 1, "type": "homebrain/bindings/get"})
    connection.send_result.assert_not_called()


@pytest.mark.parametrize("command", ["get", "set"])
async def test_missing_entry(client, command):
    """Commands report missing configuration."""
    message = {"type": f"homebrain/bindings/{command}"}
    if command == "set":
        message.update(module="waste", bindings={})
    await client.send_json_auto_id(message)
    response = await client.receive_json()
    assert not response["success"]
    assert response["error"]["code"] == "not_found"


async def test_set_merge_replace_remove(hass, client, entry):
    """Writes merge, replace, and delete without reloading or losing other options."""
    updates = [
        (
            {"waste_next": "sensor.demo_waste_next"},
            False,
            {
                "waste_dataset": "sensor.demo_waste_dataset",
                "waste_next_papir": "sensor.demo_paper",
                "waste_next": "sensor.demo_waste_next",
            },
        ),
        (
            {"waste_next": None, "waste_dataset": ""},
            False,
            {
                "waste_next_papir": "sensor.demo_paper",
            },
        ),
        (
            {"waste_next": "sensor.demo_replaced"},
            True,
            {
                "waste_next": "sensor.demo_replaced",
            },
        ),
        ({}, True, {}),
    ]
    with patch.object(hass.config_entries, "async_reload") as reload_entry:
        for bindings, replace, expected in updates:
            await client.send_json_auto_id(
                {
                    "type": "homebrain/bindings/set",
                    "module": "waste",
                    "bindings": bindings,
                    "replace": replace,
                }
            )
            response = await client.receive_json()
            assert response["success"]
            assert response["result"] == {"waste": expected}
            assert entry.options == {"demo_option": True, "bindings": {"waste": expected}}
            await hass.async_block_till_done()
        reload_entry.assert_not_called()


@pytest.mark.parametrize(
    ("module", "bindings"),
    [
        ("unknown", {}),
        ("waste", {"unknown": "sensor.demo_next"}),
        ("waste", {"waste_next_": "sensor.demo_next"}),
        ("waste", {"waste_next": "invalid"}),
        ("waste", {"waste_next": "sensor.invalid value"}),
        ("waste", {"waste_next": 1}),
        ("waste", {"waste_dataset": "sensor.demo_changed", "waste_next": "invalid"}),
    ],
)
async def test_set_invalid(client, entry, module, bindings):
    """Invalid updates are rejected atomically."""
    original = dict(entry.options)
    await client.send_json_auto_id(
        {
            "type": "homebrain/bindings/set",
            "module": module,
            "bindings": bindings,
        }
    )
    response = await client.receive_json()
    assert not response["success"]
    assert response["error"]["code"] == "invalid_format"
    assert entry.options == original


def test_get_bindings_calendar_domain():
    """waste_calendar keeps calendar.* entities only (Refs #41)."""
    entry = MockConfigEntry(
        domain=DOMAIN,
        data={},
        options={"bindings": {"waste": {"waste_calendar": "calendar.demo_waste"}}},
    )
    assert get_bindings(entry) == {"waste": {"waste_calendar": "calendar.demo_waste"}}


async def test_set_rejects_wrong_domain(hass, client, entry):
    """WS set refuses a sensor for waste_calendar (Refs #41)."""
    await client.send_json_auto_id(
        {
            "type": "homebrain/bindings/set",
            "module": "waste",
            "bindings": {"waste_calendar": "sensor.demo_waste"},
            "replace": False,
        }
    )
    response = await client.receive_json()
    assert not response["success"]
    assert response["error"]["code"] == "invalid_format"


def test_appliance_switch_binding_domain():
    """Appliance switches are read-only switch bindings; power/energy stay sensors."""
    from custom_components.homebrain.bindings import binding_domain, validate_binding

    assert binding_domain("energy_appliance_dishwasher_switch") == "switch"
    assert binding_domain("energy_appliance_dishwasher_power") == "sensor"
    assert binding_domain("energy_appliance_heat_pump_energy") == "sensor"
    validate_binding("energy_appliance_dishwasher_switch", "switch.demo_dishwasher_plug")
    with pytest.raises(vol.Invalid):
        validate_binding("energy_appliance_dishwasher_switch", "sensor.demo_dishwasher_plug")


HEALTH_BINARY = (
    "health_weekly_goal_met",
    "health_flex_meal_token",
    "health_milestone_0500",
    "health_milestone_1500",
    "health_milestone_3000",
    "health_milestone_5000",
    "health_milestone_10000",
)


def test_health_binary_binding_domains():
    """On/off health keys accept binary_sensor (and sensor); other health keys stay sensor."""
    from custom_components.homebrain.bindings import binding_domains, validate_binding
    from custom_components.homebrain.const import HEALTH_BINARY_BINDING_KEYS, HEALTH_BINDING_KEYS

    assert set(HEALTH_BINARY_BINDING_KEYS) == set(HEALTH_BINARY)
    assert set(HEALTH_BINARY) <= set(HEALTH_BINDING_KEYS)
    for key in HEALTH_BINARY:
        assert binding_domains(key) == ("binary_sensor", "sensor")
        assert validate_binding(key, f"binary_sensor.demo_{key}") == f"binary_sensor.demo_{key}"
        assert validate_binding(key, f"sensor.demo_{key}") == f"sensor.demo_{key}"
        with pytest.raises(vol.Invalid):
            validate_binding(key, f"switch.demo_{key}")
    for key in set(HEALTH_BINDING_KEYS) - set(HEALTH_BINARY):
        assert binding_domains(key) == ("sensor",)
        with pytest.raises(vol.Invalid):
            validate_binding(key, f"binary_sensor.demo_{key}")
    entry = MockConfigEntry(
        domain=DOMAIN,
        data={},
        options={"bindings": {"health": {"health_weekly_goal_met": "binary_sensor.demo_goal"}}},
    )
    assert get_bindings(entry) == {"health": {"health_weekly_goal_met": "binary_sensor.demo_goal"}}


async def test_set_health_binary_sensor_bindings(client, entry):
    """homebrain/bindings/set accepts binary_sensor for the on/off health keys."""
    bindings = {key: f"binary_sensor.demo_{key}" for key in HEALTH_BINARY}
    bindings["health_xp_total"] = "sensor.demo_xp_total"
    await client.send_json_auto_id(
        {"type": "homebrain/bindings/set", "module": "health", "bindings": bindings}
    )
    response = await client.receive_json()
    assert response["success"], response
    assert response["result"]["health"] == bindings
    assert entry.options["bindings"]["health"] == bindings
    await client.send_json_auto_id(
        {
            "type": "homebrain/bindings/set",
            "module": "health",
            "bindings": {"health_xp_total": "binary_sensor.demo_xp_total"},
        }
    )
    response = await client.receive_json()
    assert not response["success"] and response["error"]["code"] == "invalid_format"


def test_energy_main_breaker_binding_domains():
    """The main breaker accepts an input_number/number helper or a sensor."""
    from custom_components.homebrain.bindings import binding_domains, validate_binding

    assert binding_domains("energy_main_breaker") == ("input_number", "number", "sensor")
    for eid in ("input_number.demo_breaker", "number.demo_breaker", "sensor.demo_breaker"):
        assert validate_binding("energy_main_breaker", eid) == eid
    with pytest.raises(vol.Invalid):
        validate_binding("energy_main_breaker", "switch.demo_breaker")
    assert binding_domains("energy_grid_l1_power") == ("sensor",)
