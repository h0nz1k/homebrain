"""Dnes coffee invitation, using only synthetic HA accounts and entities."""

from datetime import timedelta
from unittest.mock import Mock

import pytest
from homeassistant.core import callback
from homeassistant.exceptions import HomeAssistantError, Unauthorized
from homeassistant.setup import async_setup_component
from homeassistant.util import dt as dt_util
from pytest_homeassistant_custom_component.common import MockConfigEntry, async_fire_time_changed

from custom_components.homebrain.const import DOMAIN
from custom_components.homebrain.family.model import PURPOSE_HELPER
from custom_components.homebrain.today import coffee

SCRIPT = "script.demo_coffee"
TV = "media_player.demo_tv"
INVITE = "homebrain/today/coffee/invite"
STATUS = "homebrain/today/coffee/subscribe"


@pytest.fixture
async def entry(hass):
    entry = MockConfigEntry(domain=DOMAIN, options={"coffee_script": SCRIPT})
    entry.add_to_hass(hass)
    assert await async_setup_component(hass, DOMAIN, {})
    return entry


async def _send(client, command=INVITE):
    await client.send_json_auto_id({"type": command})
    result = await client.receive_json()
    assert result["success"] is True
    return result["result"]


@pytest.mark.parametrize(
    ("role", "member", "label", "mode", "variables"),
    [
        ("adult", True, "", "plna", {"od": "Ema", "rezim": "plna"}),
        (None, False, "", None, {"od": "Kuba", "rezim": "bublina"}),
        ("kiosk", True, "  Domácnost  ", None, {"od": "Domácnost", "rezim": "bublina"}),
        ("kiosk", True, "", None, {"rezim": "bublina"}),
    ],
)
async def test_dispatch(
    hass, entry, hass_ws_client, hass_admin_user, role, member, label, mode, variables
):
    user = hass_admin_user
    user.groups = []
    user.name = "Kuba"
    options = {"coffee_script": SCRIPT, "coffee_household_label": label}
    if role:
        options["roles"] = {user.id: role}
    if mode:
        options["coffee_mode"] = mode
    hass.config_entries.async_update_entry(entry, options=options)
    if member:
        hass.states.async_set(
            "sensor.demo_helper", "0", {"purpose": PURPOSE_HELPER, "user_name": "Ema"}
        )
        hass.states.async_set(
            "person.demo_ema", "home", {"friendly_name": "Ema", "user_id": user.id}
        )
    hass.states.async_set(SCRIPT, "off")
    calls = []

    @callback
    def record(event):
        calls.append(event.data)

    hass.bus.async_listen("call_service", record)
    hass.services.async_register("script", "turn_on", lambda _: None)
    client = await hass_ws_client(hass)
    assert await _send(client) == {"ok": True, "reason": None}
    assert await _send(client) == {"ok": False, "reason": "cooldown"}
    assert calls == [
        {
            "domain": "script",
            "service": "turn_on",
            "service_data": {"entity_id": SCRIPT, "variables": variables},
        }
    ]


@pytest.mark.parametrize(
    ("script", "state", "tv_state", "reason"),
    [
        ("", None, None, "not_configured"),
        (SCRIPT, None, None, "script_missing"),
        (SCRIPT, "unavailable", None, "script_missing"),
        (TV, "off", None, "script_missing"),
        (SCRIPT, "off", "off", "tv_off"),
        (SCRIPT, "off", "idle", "tv_off"),
    ],
)
async def test_guard(hass, entry, hass_ws_client, script, state, tv_state, reason):
    calls = []
    hass.services.async_register("script", "turn_on", lambda call: calls.append(call))
    hass.config_entries.async_update_entry(
        entry, options={"coffee_script": script, "coffee_tv": TV if tv_state else ""}
    )
    if state:
        hass.states.async_set(script, state)
    if tv_state:
        hass.states.async_set(TV, tv_state)
    client = await hass_ws_client(hass)
    assert await _send(client) == {"ok": False, "reason": reason}
    assert calls == []


async def test_real_ha_script_dispatch_does_not_wait(hass, entry, hass_ws_client):
    assert await async_setup_component(
        hass,
        "script",
        {"script": {"demo_coffee": {"sequence": [{"delay": "00:00:25"}], "mode": "single"}}},
    )
    client = await hass_ws_client(hass)
    assert await _send(client) == {"ok": True, "reason": None}
    assert hass.states.is_state(SCRIPT, "on")
    async_fire_time_changed(hass, dt_util.utcnow() + timedelta(seconds=31))
    await hass.async_block_till_done()
    assert hass.states.is_state(SCRIPT, "off")


async def test_reject_unauthenticated(hass):
    connection = Mock(user=None)
    with pytest.raises(Unauthorized):
        coffee.websocket_coffee_subscribe(hass, connection, {"id": 1})
    coffee.websocket_coffee_invite(hass, connection, {"id": 2})
    await hass.async_block_till_done()
    connection.async_handle_exception.assert_called_once()
    assert isinstance(connection.async_handle_exception.call_args.args[-1], Unauthorized)


async def test_status_updates_and_dispatch_failure(hass, entry, hass_ws_client):
    hass.config_entries.async_update_entry(
        entry, options={"coffee_script": SCRIPT, "coffee_tv": TV}
    )
    hass.states.async_set(SCRIPT, "off")
    hass.states.async_set(TV, "off")

    @callback
    def fail(_call):
        raise HomeAssistantError("synthetic failure")

    hass.services.async_register("script", "turn_on", fail)
    listener = await hass_ws_client(hass)
    assert await _send(listener, STATUS) is None

    async def expect_reason(reason):
        event = await listener.receive_json()
        assert event == {"id": 1, "type": "event", "event": {"reason": reason}}

    await expect_reason("tv_off")
    hass.states.async_set(TV, "on")
    await expect_reason(None)

    client = await hass_ws_client(hass)
    assert await _send(client) == {"ok": False, "reason": "send_failed"}
    await expect_reason("cooldown")
    async_fire_time_changed(hass, dt_util.utcnow() + timedelta(seconds=31))
    await expect_reason(None)

    hass.config_entries.async_update_entry(entry, options={})
    await expect_reason("not_configured")


async def test_options(hass, entry):
    async def open_flow():
        manager = hass.config_entries.options
        menu = await manager.async_init(entry.entry_id)
        assert "coffee" in menu["menu_options"]
        return await manager.async_configure(menu["flow_id"], {"next_step_id": "coffee"})

    flow = await open_flow()
    result = await hass.config_entries.options.async_configure(
        flow["flow_id"],
        {"coffee_script": SCRIPT, "coffee_tv": TV, "coffee_household_label": "  Domácnost "},
    )
    assert result["type"] == "create_entry"
    assert entry.options == {
        "coffee_script": SCRIPT,
        "coffee_tv": TV,
        "coffee_mode": "bublina",
        "coffee_household_label": "Domácnost",
    }

    flow = await open_flow()
    await hass.config_entries.options.async_configure(flow["flow_id"], {"coffee_mode": "plna"})
    assert entry.options == {"coffee_mode": "plna"}
