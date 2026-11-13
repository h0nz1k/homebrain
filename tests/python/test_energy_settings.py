"""ENE-017 role, allowlist, conversion and validation contracts."""

from unittest.mock import AsyncMock

import pytest
from homeassistant.setup import async_setup_component
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.homebrain.const import DOMAIN


@pytest.fixture
async def setup(hass):
    entry = MockConfigEntry(
        domain=DOMAIN,
        data={},
        options={
            "energy_pv": {"pv_kwp": 8, "battery_capacity_kwh": 12},
            "bindings": {
                "energy": {
                    "energy_battery_dod_ongrid": "number.demo_dod",
                    "energy_tariff_price_vt": "input_number.demo_vt",
                }
            },
        },
    )
    entry.add_to_hass(hass)
    assert await async_setup_component(hass, DOMAIN, {})
    await hass.async_block_till_done()
    hass.states.async_set("number.demo_dod", "90", {"min": 0, "max": 100, "step": 1})
    hass.states.async_set("input_number.demo_vt", "5", {"min": 0, "max": 20, "step": 0.1})
    return entry


async def request(client, command="get", **data):
    await client.send_json({"id": 1, "type": f"homebrain/energy/settings/{command}", **data})
    return await client.receive_json()


async def test_get_reserve_defaults_and_unbound(hass, setup, hass_ws_client):
    result = await request(await hass_ws_client(hass))
    rows = {r["key"]: r for r in result["result"]["rows"]}
    assert rows["energy_battery_dod_ongrid"]["value"] == 10
    assert rows["energy_battery_dod_ongrid"]["editable"]
    assert "90 %" in rows["energy_battery_dod_ongrid"]["explanation"]
    assert rows["pv_tilt"]["value"] == 35 and rows["pv_tilt"]["assumed"]
    assert rows["energy_fast_charge"]["value"] is None
    assert not rows["energy_fast_charge"]["editable"]


async def test_options_update_preserves_other_options(hass, setup, hass_ws_client):
    result = await request(await hass_ws_client(hass), "set", key="pv_tilt", value=40)
    assert result["success"]
    assert setup.options["energy_pv"]["pv_tilt"] == 40
    assert setup.options["energy_pv"]["pv_kwp"] == 8
    assert setup.options["bindings"]


@pytest.mark.parametrize(
    "key,value,code",
    [
        ("pv_tilt", 91, "invalid_value"),
        ("energy_battery_dod_ongrid", 9, "invalid_value"),
        ("energy_battery_dod_ongrid", 12, "invalid_value"),
        ("energy_fast_charge", 1, "not_allowed"),
        ("unknown", 1, "not_allowed"),
        ("energy_tariff_price_vt", 5.05, "invalid_value"),
    ],
)
async def test_reject_writes(hass, setup, hass_ws_client, key, value, code):
    result = await request(await hass_ws_client(hass), "set", key=key, value=value)
    assert result["error"]["code"] == code


@pytest.mark.parametrize(
    "key,value,domain,raw",
    [
        ("energy_battery_dod_ongrid", 20, "number", 80),
        ("energy_tariff_price_vt", 6, "input_number", 6),
    ],
)
async def test_service_write_and_new_snapshot(hass, setup, hass_ws_client, key, value, domain, raw):
    async def service(call):
        hass.states.async_set(
            call.data["entity_id"], call.data["value"], {"min": 0, "max": 100, "step": 1}
        )

    callback = AsyncMock(side_effect=service)
    hass.services.async_register(domain, "set_value", callback)
    result = await request(await hass_ws_client(hass), "set", key=key, value=value)
    assert result["success"]
    assert callback.call_args.args[0].data["value"] == raw
    assert callback.call_args.args[0].context.user_id
    assert float(next(r for r in result["result"]["rows"] if r["key"] == key)["value"]) == value


async def test_non_admin_write_rejected(hass, setup, hass_ws_client, hass_admin_user):
    hass_admin_user.groups = []
    client = await hass_ws_client(hass)
    result = await request(client, "set", key="pv_tilt", value=40)
    assert result["error"]["code"] == "unauthorized"


async def test_adult_reads_but_cannot_edit(hass, setup, hass_ws_client, hass_admin_user):
    hass_admin_user.groups = []
    hass.config_entries.async_update_entry(
        setup, options={**setup.options, "roles": {hass_admin_user.id: "adult"}}
    )
    result = await request(await hass_ws_client(hass))
    assert result["success"]
    assert not any(r["editable"] for r in result["result"]["rows"])


async def test_wrong_domain_read_only(hass, setup, hass_ws_client):
    hass.config_entries.async_update_entry(
        setup,
        options={
            **setup.options,
            "bindings": {"energy": {"energy_main_breaker": "number.demo_breaker"}},
        },
    )
    hass.states.async_set("number.demo_breaker", 25, {"min": 0, "max": 63, "step": 1})
    result = await request(await hass_ws_client(hass), "set", key="energy_main_breaker", value=30)
    assert result["error"]["code"] == "not_allowed"
