"""Test the single-instance HomeBrain config flow."""

from unittest.mock import patch

import pytest
from homeassistant.core import HomeAssistant
from homeassistant.data_entry_flow import FlowResultType, InvalidData
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.homebrain.const import DOMAIN


async def test_user_creates_entry(hass: HomeAssistant):
    """Confirm the empty form creates a HomeBrain entry."""
    result = await hass.config_entries.flow.async_init(DOMAIN, context={"source": "user"})
    assert result["type"] is FlowResultType.FORM
    assert result["step_id"] == "user"
    assert not result["data_schema"].schema

    with patch("custom_components.homebrain.async_setup_entry", return_value=True):
        result = await hass.config_entries.flow.async_configure(result["flow_id"], {})
        await hass.async_block_till_done()

    assert result["type"] is FlowResultType.CREATE_ENTRY
    assert result["title"] == "HomeBrain"
    assert result["data"] == {}

    result = await hass.config_entries.flow.async_init(DOMAIN, context={"source": "user"})
    assert result["type"] is FlowResultType.ABORT
    assert result["reason"] == "single_instance_allowed"


@pytest.mark.parametrize(
    ("user_input", "expected"),
    [
        (
            {"waste_dataset": "sensor.demo_waste_dataset", "waste_next": "sensor.demo_waste_next"},
            {"waste_dataset": "sensor.demo_waste_dataset", "waste_next": "sensor.demo_waste_next"},
        ),
        (
            {"waste_dataset": "sensor.demo_waste_dataset"},
            {"waste_dataset": "sensor.demo_waste_dataset"},
        ),
        (
            {"waste_calendar": "calendar.demo_waste"},
            {"waste_calendar": "calendar.demo_waste"},
        ),
        ({}, {}),
    ],
)
async def test_options_bindings(hass: HomeAssistant, user_input, expected):
    """Options preserve dynamic keys and unrelated options while saving or clearing."""
    entry = MockConfigEntry(
        domain=DOMAIN,
        data={},
        options={
            "demo_option": True,
            "bindings": {
                "waste": {
                    "waste_next": "sensor.demo_previous",
                    "waste_next_papir": "sensor.demo_paper",
                }
            },
        },
    )
    entry.add_to_hass(hass)
    result = await hass.config_entries.options.async_init(entry.entry_id)
    assert result["type"] is FlowResultType.MENU
    assert result["step_id"] == "init"
    assert result["menu_options"] == [
        "waste",
        "energy",
        "family",
        "recipes",
        "energy_pv",
        "robots_1",
        "robots_2",
        "robots_3",
        "modules",
    ]
    result = await hass.config_entries.options.async_configure(
        result["flow_id"], {"next_step_id": "waste"}
    )
    assert result["type"] is FlowResultType.FORM
    assert result["step_id"] == "waste"
    fields = result["data_schema"].schema
    assert {str(key) for key in fields} == {
        "waste_dataset",
        "waste_next",
        "waste_calendar",
        "waste_history",
    }
    next_field = next(key for key in fields if str(key) == "waste_next")
    assert next_field.description["suggested_value"] == "sensor.demo_previous"
    assert fields[next_field].config["domain"] == ["sensor"]
    calendar_field = next(key for key in fields if str(key) == "waste_calendar")
    assert fields[calendar_field].config["domain"] == ["calendar"]

    with patch("custom_components.homebrain.async_setup_entry") as setup:
        result = await hass.config_entries.options.async_configure(result["flow_id"], user_input)
        await hass.async_block_till_done()
        setup.assert_not_called()
    assert result["type"] is FlowResultType.CREATE_ENTRY
    assert (
        result["data"]
        == entry.options
        == {
            "demo_option": True,
            "bindings": {"waste": {**expected, "waste_next_papir": "sensor.demo_paper"}},
        }
    )


async def test_options_family_calendars(hass: HomeAssistant):
    """Family step offers only calendar entities, saves them and keeps other modules."""
    entry = MockConfigEntry(
        domain=DOMAIN,
        data={},
        options={"bindings": {"waste": {"waste_next": "sensor.demo_waste_next"}}},
    )
    entry.add_to_hass(hass)
    result = await hass.config_entries.options.async_init(entry.entry_id)
    result = await hass.config_entries.options.async_configure(
        result["flow_id"], {"next_step_id": "family"}
    )
    assert result["type"] is FlowResultType.FORM
    assert result["step_id"] == "family"
    fields = result["data_schema"].schema
    assert [str(key) for key in fields] == ["family_calendar_family", "family_calendar_school"]
    assert all(fields[key].config["domain"] == ["calendar"] for key in fields)

    result = await hass.config_entries.options.async_configure(
        result["flow_id"], {"family_calendar_family": "calendar.demo_family"}
    )
    await hass.async_block_till_done()
    assert result["type"] is FlowResultType.CREATE_ENTRY
    assert entry.options["bindings"] == {
        "waste": {"waste_next": "sensor.demo_waste_next"},
        "family": {"family_calendar_family": "calendar.demo_family"},
    }


async def test_options_family_rejects_non_calendar(hass: HomeAssistant):
    """A sensor cannot be bound as a family calendar."""
    entry = MockConfigEntry(domain=DOMAIN, data={}, options={})
    entry.add_to_hass(hass)
    result = await hass.config_entries.options.async_init(entry.entry_id)
    result = await hass.config_entries.options.async_configure(
        result["flow_id"], {"next_step_id": "family"}
    )
    with pytest.raises(InvalidData):
        await hass.config_entries.options.async_configure(
            result["flow_id"], {"family_calendar_school": "sensor.demo_school"}
        )


async def test_options_energy_bindings(hass: HomeAssistant):
    """Energy step offers all logical keys, saves, clears and keeps other modules."""
    from custom_components.homebrain.const import ENERGY_BINDING_KEYS

    entry = MockConfigEntry(
        domain=DOMAIN,
        data={},
        options={
            "bindings": {
                "waste": {"waste_next": "sensor.demo_waste_next"},
                "energy": {"energy_pv_power": "sensor.demo_old_pv"},
            }
        },
    )
    entry.add_to_hass(hass)
    result = await hass.config_entries.options.async_init(entry.entry_id)
    result = await hass.config_entries.options.async_configure(
        result["flow_id"], {"next_step_id": "energy"}
    )
    assert result["type"] is FlowResultType.FORM
    assert result["step_id"] == "energy"
    fields = result["data_schema"].schema
    assert [str(key) for key in fields] == list(ENERGY_BINDING_KEYS)
    pv_field = next(key for key in fields if str(key) == "energy_pv_power")
    assert pv_field.description["suggested_value"] == "sensor.demo_old_pv"

    result = await hass.config_entries.options.async_configure(
        result["flow_id"],
        {
            "energy_grid_power": "sensor.demo_grid_power",
            "energy_battery_soc": "sensor.demo_battery_soc",
            "energy_spot_price_electricity": "sensor.demo_spot_price",
        },
    )
    await hass.async_block_till_done()
    assert result["type"] is FlowResultType.CREATE_ENTRY
    assert entry.options["bindings"] == {
        "waste": {"waste_next": "sensor.demo_waste_next"},
        "energy": {
            "energy_grid_power": "sensor.demo_grid_power",
            "energy_battery_soc": "sensor.demo_battery_soc",
            "energy_spot_price_electricity": "sensor.demo_spot_price",
        },
    }


async def test_existing_entry_aborts(hass: HomeAssistant):
    """An existing instance prevents a second setup."""
    MockConfigEntry(domain=DOMAIN, title="HomeBrain", data={}).add_to_hass(hass)
    result = await hass.config_entries.flow.async_init(DOMAIN, context={"source": "user"})
    assert result["type"] is FlowResultType.ABORT
    assert result["reason"] == "single_instance_allowed"


@pytest.mark.parametrize(
    "user_input",
    [{"waste_calendar": "sensor.demo_waste"}, {"waste_next": "calendar.demo_waste"}],
)
async def test_options_reject_wrong_domain(hass: HomeAssistant, user_input):
    """Calendar key accepts only calendar.*, sensor keys only sensor.* (Refs #41)."""
    entry = MockConfigEntry(domain=DOMAIN, data={}, options={})
    entry.add_to_hass(hass)
    result = await hass.config_entries.options.async_init(entry.entry_id)
    with pytest.raises(InvalidData):
        await hass.config_entries.options.async_configure(result["flow_id"], user_input)
    assert entry.options == {}
