"""Odpady: persistent collection history (store, sources, WS)."""

from datetime import date, timedelta

import pytest
from homeassistant.core import HomeAssistant, ServiceCall, State, SupportsResponse
from homeassistant.setup import async_setup_component
from homeassistant.util import dt as dt_util
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.homebrain.const import DOMAIN
from custom_components.homebrain.waste.history import (
    STORAGE_KEY,
    WasteHistory,
    observations_from_calendar,
    observations_from_state,
)

TODAY = date(2026, 11, 2)


def test_wcs_sensor_date_attributes():
    state = State(
        "sensor.svoz",
        "Papir",
        {"2026-11-03": "Papir", "2026-11-04": "Komunalni odpad", "friendly_name": "Svoz"},
    )
    assert observations_from_state("waste_next", state) == [
        ("2026-11-03", "Papir"),
        ("2026-11-04", "Komunalni odpad"),
    ]


def test_date_state_sensor_and_unavailable():
    state = State("sensor.next", "2026-11-02", {"waste_type": "Plasty"})
    assert observations_from_state("waste_next", state) == [("2026-11-02", "Plasty")]
    assert observations_from_state("waste_next", State("sensor.next", "unavailable")) is None


def test_history_attribute_dict_and_list():
    as_dict = State(
        "sensor.data_do",
        "data do 2026-12-30",
        {"history": {"2026-10-19": "Plasty", "2026-10-20": "Papir"}, "valid_to": "2026-12-30"},
    )
    assert observations_from_state("waste_history", as_dict) == [
        ("2026-10-19", "Plasty"),
        ("2026-10-20", "Papir"),
    ]
    as_list = State("sensor.h", "ok", {"history": [{"date": "2026-10-08", "label": "Sklo"}]})
    assert observations_from_state("waste_history", as_list) == [("2026-10-08", "Sklo")]


def test_dataset_skips_cancelled_events():
    state = State(
        "sensor.dataset",
        "ready",
        {
            "waste_dashboard": {
                "events": [
                    {"collection_date": "2026-11-05", "display_name": "Bio", "availability": "x"},
                    {
                        "collection_date": "2026-11-06",
                        "display_name": "Papír",
                        "availability": "cancelled",
                    },
                ]
            }
        },
    )
    assert observations_from_state("waste_dataset", state) == [("2026-11-05", "Bio")]


def test_calendar_items():
    events = [
        {"start": "2026-11-02", "summary": "Plasty"},
        {"start": {"date": "2026-11-03"}, "summary": "Papir"},
        {"start": "2026-11-04T12:00:00+01:00", "summary": "Komunalni odpad"},
        {"start": "garbage", "summary": "x"},
        {"start": "2026-11-05"},
    ]
    assert observations_from_calendar(events) == [
        ("2026-11-02", "Plasty"),
        ("2026-11-03", "Papir"),
        ("2026-11-04", "Komunalni odpad"),
    ]


async def test_today_survives_midnight_and_moved_pickups_are_forgotten(hass: HomeAssistant):
    history = WasteHistory(hass)
    day_before = date(2026, 11, 1)
    history.observe(
        "sensor.svoz",
        [("2026-11-02", "Plasty"), ("2026-11-03", "Papir"), ("2026-11-12", "Barevne sklo")],
        day_before,
    )
    # Midnight: the WCS sensor drops today's pickup and glass moved from the 12th to the 13th.
    history.observe("sensor.svoz", [("2026-11-03", "Papír"), ("2026-11-13", "Barevne sklo")], TODAY)
    assert history.history(TODAY) == [{"date": "2026-11-02", "label": "Plasty"}]
    assert history.history(date(2026, 11, 20)) == [
        {"date": "2026-11-02", "label": "Plasty"},
        {"date": "2026-11-03", "label": "Papir"},
        {"date": "2026-11-13", "label": "Barevne sklo"},
    ]
    # An empty/failed listing never prunes.
    assert history.observe("sensor.svoz", None, TODAY) is False
    # Another source keeps a record alive although the first one dropped it.
    history.observe("calendar.svoz", [("2026-11-20", "Bio")], TODAY)
    history.observe("sensor.svoz", [("2026-11-20", "Bio")], TODAY)
    history.observe("sensor.svoz", [("2026-11-21", "Plasty")], TODAY)
    assert {"date": "2026-11-20", "label": "Bio"} in history.history(date(2026, 11, 30))


async def test_retention_and_persistence(hass: HomeAssistant, hass_storage):
    history = WasteHistory(hass)
    history.observe("sensor.h", [("2025-01-01", "Plasty"), ("2026-10-19", "Plasty")], TODAY)
    await history.async_flush()
    assert hass_storage[STORAGE_KEY]["data"]["records"] == [
        {"date": "2026-10-19", "label": "Plasty", "sources": ["sensor.h"]}
    ]
    again = WasteHistory(hass)
    await again.async_load()
    assert again.history(TODAY) == [{"date": "2026-10-19", "label": "Plasty"}]


async def _setup(hass: HomeAssistant, bindings: dict[str, str]) -> MockConfigEntry:
    entry = MockConfigEntry(domain=DOMAIN, data={}, options={"bindings": {"waste": bindings}})
    entry.add_to_hass(hass)
    assert await async_setup_component(hass, DOMAIN, {})
    await hass.async_block_till_done()
    return entry


async def test_ws_history_from_all_sources(hass: HomeAssistant, hass_ws_client):
    await hass.config.async_set_time_zone("Europe/Prague")
    today = dt_util.now().date()

    def day(offset: int) -> str:
        return (today + timedelta(days=offset)).isoformat()

    calls: list[ServiceCall] = []

    async def get_events(call: ServiceCall):
        calls.append(call)
        return {"calendar.svoz": {"events": [{"start": day(0), "summary": "Plasty"}]}}

    hass.services.async_register(
        "calendar", "get_events", get_events, supports_response=SupportsResponse.ONLY
    )
    hass.states.async_set("calendar.svoz", "on", {})
    hass.states.async_set("sensor.svoz", "Papir", {day(1): "Papir"})
    hass.states.async_set(
        "sensor.data_do",
        "data do",
        {"history": {day(-25): "Barevne sklo", day(-14): "Plasty"}},
    )
    await _setup(
        hass,
        {
            "waste_next": "sensor.svoz",
            "waste_calendar": "calendar.svoz",
            "waste_history": "sensor.data_do",
        },
    )
    assert calls and calls[0].data["entity_id"] == "calendar.svoz"

    client = await hass_ws_client(hass)
    await client.send_json_auto_id({"type": "homebrain/waste/history"})
    msg = await client.receive_json()
    assert msg["success"], msg
    # Tomorrow's paper is remembered but not reported as history yet.
    assert msg["result"]["events"] == [
        {"date": day(-25), "label": "Barevne sklo"},
        {"date": day(-14), "label": "Plasty"},
        {"date": day(0), "label": "Plasty"},
    ]
    assert msg["result"]["since"] == day(-25)

    # Live sensor updates are recorded without waiting for the 3 h refresh.
    hass.states.async_set("sensor.data_do", "data do", {"history": {day(-40): "Plasty"}})
    await hass.async_block_till_done()
    await client.send_json_auto_id({"type": "homebrain/waste/history"})
    msg = await client.receive_json()
    assert msg["result"]["since"] == day(-40)


async def test_ws_history_denies_unmapped_non_admin(
    hass: HomeAssistant, hass_ws_client, hass_admin_user
):
    await _setup(hass, {})
    hass_admin_user.groups = []
    client = await hass_ws_client(hass)
    await client.send_json_auto_id({"type": "homebrain/waste/history"})
    msg = await client.receive_json()
    assert msg["error"]["code"] == "unauthorized"


@pytest.mark.parametrize("role", ["adult", "child", "kiosk"])
async def test_ws_history_mapped_role_gets_events_without_admin_horizon(
    hass: HomeAssistant, hass_ws_client, hass_admin_user, role
):
    """Odpady for the family: history yes; the data horizon („Co s tím“) is admin-only."""
    entry = await _setup(hass, {})
    hass_admin_user.groups = []
    hass.config_entries.async_update_entry(
        entry, options={**entry.options, "roles": {hass_admin_user.id: role}}
    )
    client = await hass_ws_client(hass)
    await client.send_json_auto_id({"type": "homebrain/waste/history"})
    msg = await client.receive_json()
    assert msg["success"], msg
    assert msg["result"]["events"] == []
    assert msg["result"]["horizon"] is None


async def test_ws_history_admin_gets_horizon(hass: HomeAssistant, hass_ws_client):
    await _setup(hass, {})
    client = await hass_ws_client(hass)
    await client.send_json_auto_id({"type": "homebrain/waste/history"})
    msg = await client.receive_json()
    assert msg["result"]["horizon"] is not None
