"""Topení: WebMaker XML client + poller against a real aiohttp fake PLC (synthetic data)."""

from __future__ import annotations

import json
import logging
from unittest.mock import patch

import aiohttp
import pytest
from aiohttp.test_utils import TestServer
from heating_fake_plc import PASSWORD, USER, FakePlc, write_map
from homeassistant.core import HomeAssistant
from homeassistant.data_entry_flow import FlowResultType
from homeassistant.helpers import issue_registry as ir
from homeassistant.setup import async_setup_component
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.homebrain.const import DOMAIN
from custom_components.homebrain.heating import poller as poller_mod
from custom_components.homebrain.heating.client import (
    TecomatAuthError,
    TecomatClient,
    TecomatConfig,
)
from custom_components.homebrain.heating.poller import ISSUE_AUTH, HeatingPoller

SPACING = 0.05


@pytest.fixture
async def plc(socket_enabled):
    fake = FakePlc()
    server = TestServer(fake.app, host="127.0.0.1")
    await server.start_server()
    fake.url = str(server.make_url("")).rstrip("/")
    yield fake
    await server.close()


@pytest.fixture(autouse=True)
def fast_poller():
    with (
        patch.object(poller_mod, "AUTOSTART", False),
        patch.object(poller_mod, "SPACING", SPACING),
    ):
        yield


def _session() -> aiohttp.ClientSession:
    return aiohttp.ClientSession(cookie_jar=aiohttp.CookieJar(unsafe=True))


async def test_client_login_poll_logout(plc):
    async with _session() as session:
        client = TecomatClient(session, TecomatConfig(plc.url, USER, PASSWORD))
        await client.login()
        ucid, values = await client.read_page(17)
        assert ucid == "4242"
        assert values["__X300_REAL_04.1f"] == "021.4"
        await client.logout()
    paths = [p.lower() for _, _, p in plc.log]
    assert paths[-2:] == ["/logout.xml", "/syswww/logout.xml"]
    assert not plc.sessions
    # Read-only: the login form is the only thing ever POSTed; the password is hashed.
    assert plc.posts() == ["/syswww/LOGIN.XML"]
    assert PASSWORD not in repr(TecomatConfig(plc.url, USER, PASSWORD))


async def test_client_relogins_after_session_expiry(plc):
    async with _session() as session:
        client = TecomatClient(session, TecomatConfig(plc.url, USER, PASSWORD))
        await client.read_page(17)  # logs in on demand
        plc.expire_all()
        _, values = await client.read_page(8)
        assert "__R7100.0_BOOL_i" in values
    assert plc.logins == 2


async def test_client_wrong_password(plc):
    async with _session() as session:
        client = TecomatClient(session, TecomatConfig(plc.url, USER, "wrong"))
        with pytest.raises(TecomatAuthError):
            await client.login()


def _entry(plc, map_path: str, **extra) -> MockConfigEntry:
    return MockConfigEntry(
        domain=DOMAIN,
        options={
            "heating": {
                "url": plc.url,
                "username": USER,
                "password": PASSWORD,
                "map_path": map_path,
                "poll_interval": 30,
                **extra,
            }
        },
    )


async def _setup(hass: HomeAssistant, entry: MockConfigEntry) -> HeatingPoller:
    entry.add_to_hass(hass)
    assert await async_setup_component(hass, DOMAIN, {})
    await hass.async_block_till_done()
    return hass.data[DOMAIN]["heating"]


async def test_poller_entities_and_spacing(hass: HomeAssistant, plc, tmp_path, caplog):
    caplog.set_level(logging.DEBUG)
    poller = await _setup(hass, _entry(plc, write_map(tmp_path / "map.yaml")))
    await poller.async_poll_once()
    await hass.async_block_till_done()

    assert hass.states.get("sensor.heating_house_ref_temp").state == "21.4"
    assert hass.states.get("sensor.heating_house_ref_temp").attributes["unit_of_measurement"] == (
        "°C"
    )
    assert hass.states.get("binary_sensor.heating_heat_pump_compressor_on").state == "off"
    assert hass.states.get("binary_sensor.heating_house_circuit_on").state == "on"
    assert hass.states.get("sensor.heating_activity").state == "house_circuit"
    runtime = hass.states.get("sensor.heating_compressor_runtime_h")
    assert runtime.attributes["state_class"] == "total_increasing"
    assert hass.states.get("sensor.heating_compressor_starts").state == "0"
    assert hass.states.get("sensor.heating_something_unknown") is None

    payload = poller.payload()
    assert payload["source"] == "ok" and payload["stale"] is False
    assert payload["house"]["ref_temp"] == pytest.approx(21.4)
    # ≥ SPACING between consecutive PLC requests (one at a time, never bursts).
    stamps = [t for t, _, path in plc.log if path.startswith("/PAGE")]
    assert len(stamps) >= 3
    assert all(b - a >= SPACING * 0.9 for a, b in zip(stamps, stamps[1:], strict=False))
    blob = json.dumps(payload) + caplog.text
    assert PASSWORD not in blob and plc.url not in json.dumps(payload)

    # Only the pages that are due are fetched on the next poll (PAGE26 every 15 min).
    before = len(plc.log)
    await poller.async_poll_once()
    pages = [p for _, _, p in plc.log[before:] if p.startswith("/PAGE")]
    assert "/PAGE26.XML" not in pages and "/PAGE17.XML" in pages

    # Compressor start is counted and survives in the payload.
    plc.pages[17]["__Y50.7_BOOL_i"] = "1"
    poller._due.clear()  # noqa: SLF001 - force a full poll
    await poller.async_poll_once()
    await hass.async_block_till_done()
    assert poller.payload()["heat_pump"]["starts_today"] == 1
    assert poller.payload()["activity"] == "heating_tank"
    assert hass.states.get("sensor.heating_compressor_starts").state == "1"


async def test_poller_auth_repair_and_backoff(hass: HomeAssistant, plc, tmp_path):
    poller = await _setup(hass, _entry(plc, write_map(tmp_path / "map.yaml")))
    plc.password = "rotated"
    await poller.async_poll_once()
    assert poller.payload()["source"] == "auth"
    assert ir.async_get(hass).async_get_issue(DOMAIN, ISSUE_AUTH) is not None
    first = poller.next_delay()
    await poller.async_poll_once()
    assert poller.next_delay() > first
    plc.password = PASSWORD
    await poller.async_poll_once()
    assert poller.payload()["source"] == "ok"
    assert ir.async_get(hass).async_get_issue(DOMAIN, ISSUE_AUTH) is None
    assert poller.next_delay() == 30


async def test_poller_unreachable_and_missing_map(hass: HomeAssistant, tmp_path):
    entry = MockConfigEntry(
        domain=DOMAIN,
        options={
            "heating": {
                "url": "http://127.0.0.1:9",
                "username": USER,
                "password": PASSWORD,
                "map_path": str(tmp_path / "missing.yaml"),
            }
        },
    )
    poller = await _setup(hass, entry)
    assert poller.payload()["source"] == "unconfigured"
    assert hass.states.get("sensor.heating_activity") is not None


async def test_unconfigured_payload(hass: HomeAssistant):
    entry = MockConfigEntry(domain=DOMAIN, options={})
    entry.add_to_hass(hass)
    assert await async_setup_component(hass, DOMAIN, {})
    await hass.async_block_till_done()
    assert "heating" not in hass.data[DOMAIN]
    assert hass.states.get("sensor.heating_activity") is None


async def test_options_flow_heating_step(hass: HomeAssistant, tmp_path):
    entry = MockConfigEntry(
        domain=DOMAIN,
        options={"heating": {"url": "http://plc.example", "username": "u", "password": "old"}},
    )
    entry.add_to_hass(hass)
    result = await hass.config_entries.options.async_init(entry.entry_id)
    assert "heating" in result["menu_options"]
    result = await hass.config_entries.options.async_configure(
        result["flow_id"], {"next_step_id": "heating"}
    )
    assert result["type"] is FlowResultType.FORM
    # The stored password is never offered back.
    for key in result["data_schema"].schema:
        if str(key) == "password":
            assert not (key.description or {}).get("suggested_value")
    result = await hass.config_entries.options.async_configure(
        result["flow_id"],
        {
            "url": "http://plc.example/",
            "username": "reader",
            "password": "",
            "map_path": "/config/homebrain/heating_map.yaml",
            "poll_interval": 45,
        },
    )
    assert result["type"] is FlowResultType.CREATE_ENTRY
    assert entry.options["heating"] == {
        "url": "http://plc.example",
        "username": "reader",
        "password": "old",
        "map_path": "/config/homebrain/heating_map.yaml",
        "poll_interval": 45,
    }
    result = await hass.config_entries.options.async_init(entry.entry_id)
    result = await hass.config_entries.options.async_configure(
        result["flow_id"], {"next_step_id": "heating"}
    )
    result = await hass.config_entries.options.async_configure(
        result["flow_id"], {"url": "ftp://x", "username": "a", "password": "b"}
    )
    assert result["errors"] == {"url": "invalid_url"}
    result = await hass.config_entries.options.async_configure(result["flow_id"], {"url": ""})
    assert result["type"] is FlowResultType.CREATE_ENTRY
    assert "heating" not in entry.options
