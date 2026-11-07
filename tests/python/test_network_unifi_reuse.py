"""Síť V2: reuse the account of Home Assistant's own UniFi integration (no second account).

The HA ``unifi`` config entry is read through the public ``hass.config_entries`` API at connect
time; its password must never land in HomeBrain options, WebSocket answers or logs.
"""

from __future__ import annotations

import json
import logging
from unittest.mock import patch

import pytest

from homeassistant import data_entry_flow
from homeassistant.config_entries import ConfigEntryState
from homeassistant.core import HomeAssistant
from homeassistant.helpers import issue_registry as ir
from homeassistant.setup import async_setup_component
from pytest_homeassistant_custom_component.common import MockConfigEntry
from test_network import NOW, install
from test_network_unifi import SECRET, FakeClient, raw_fixture

from custom_components.homebrain.const import DOMAIN
from custom_components.homebrain.network.unifi_client import UnifiConfig
from custom_components.homebrain.network.unifi_poller import ISSUE_AUTH, UnifiPoller
from custom_components.homebrain.network.unifi_source import (
    SOURCE_HA,
    SOURCE_MANUAL,
    UnifiSource,
)

VALIDATE = "custom_components.homebrain.config_flow.async_validate_unifi"


@pytest.fixture(autouse=True)
async def _no_real_unifi_unload(hass: HomeAssistant):
    """The mocked HA ``unifi`` entries are "loaded" without the real integration (no aiounifi)."""
    yield
    for entry in hass.config_entries.async_entries("unifi"):
        entry.mock_state(hass, ConfigEntryState.NOT_LOADED)


def _ha_unifi(
    hass: HomeAssistant,
    *,
    password: str = SECRET,
    state: ConfigEntryState = ConfigEntryState.LOADED,
    host: str = "192.0.2.10",
    title: str = "UniFi Network",
) -> MockConfigEntry:
    entry = MockConfigEntry(
        domain="unifi", title=title, state=state, data=_ha_unifi_data(password, host)
    )
    entry.add_to_hass(hass)
    return entry


def _ha_unifi_data(password: str = SECRET, host: str = "192.0.2.10") -> dict[str, object]:
    """``entry.data`` shape of HA core's ``unifi`` integration."""
    return {
        "host": host,
        "port": 8443,
        "site": "default",
        "username": "ha",
        "password": password,
        "verify_ssl": False,
    }


# ---------------------------------------------------------------- source resolution


async def test_default_source_reuses_the_single_ha_unifi_entry(hass: HomeAssistant):
    _ha_unifi(hass)
    source = UnifiSource.from_options(None, hass)
    assert source is not None and source.kind == SOURCE_HA
    cfg = source.resolve(hass)
    assert cfg == UnifiConfig("https://192.0.2.10:8443", "default", "ha", SECRET, False)
    assert source.account(hass) == "ha"
    assert SECRET not in repr(source) and SECRET not in repr(cfg)


async def test_ha_source_reads_entry_data_at_connect_time(hass: HomeAssistant):
    entry = _ha_unifi(hass)
    source = UnifiSource.from_options({"source": SOURCE_HA}, hass)
    hass.config_entries.async_update_entry(entry, data={**entry.data, "password": "rotated"})
    assert source.resolve(hass).password == "rotated"


async def test_multiple_entries_need_an_explicit_choice(hass: HomeAssistant):
    _ha_unifi(hass)
    second = _ha_unifi(hass, host="192.0.2.20", title="Chata")
    assert UnifiSource.from_options(None, hass) is None
    source = UnifiSource.from_options({"source": SOURCE_HA, "entry_id": second.entry_id}, hass)
    assert source.resolve(hass).url == "https://192.0.2.20:8443"
    # an unpicked HA source with two entries cannot guess
    assert UnifiSource.from_options({"source": SOURCE_HA}, hass).resolve(hass) is None


async def test_manual_credentials_override_the_ha_entry(hass: HomeAssistant):
    _ha_unifi(hass)
    manual = {
        "url": "https://unifi.example",
        "site": "default",
        "username": "homebrain",
        "password": "own",
    }
    for raw in (manual, {**manual, "source": SOURCE_MANUAL}):  # legacy options had no source
        source = UnifiSource.from_options(raw, hass)
        assert source.kind == SOURCE_MANUAL
        assert source.resolve(hass).username == "homebrain"
        assert source.account(hass) == "homebrain"
    assert UnifiSource.from_options({"source": "off"}, hass) is None


async def test_missing_or_unloaded_entry_gives_calm_status(hass: HomeAssistant, caplog):
    caplog.set_level(logging.DEBUG)
    entry = _ha_unifi(hass, state=ConfigEntryState.NOT_LOADED)
    source = UnifiSource.from_options({"source": SOURCE_HA, "entry_id": entry.entry_id}, hass)
    assert source.resolve(hass) is None
    client = FakeClient([raw_fixture()])
    poller = UnifiPoller(hass, source, client=client)
    await poller.async_poll_once()
    assert poller.status()["status"] == "unifi_source_missing"
    assert client.results, "no request without a usable account"
    assert ir.async_get(hass).async_get_issue(DOMAIN, ISSUE_AUTH) is None

    gone = UnifiSource.from_options({"source": SOURCE_HA, "entry_id": "removed"}, hass)
    poller = UnifiPoller(hass, gone, client=FakeClient([]))
    await poller.async_poll_once()
    assert poller.status()["status"] == "unifi_source_missing"

    # once the HA integration is loaded again the next poll succeeds
    entry.mock_state(hass, ConfigEntryState.LOADED)
    poller = UnifiPoller(hass, source, client=FakeClient([raw_fixture()]))
    await poller.async_poll_once()
    assert poller.status()["status"] == "ok"
    assert SECRET not in caplog.text


# ---------------------------------------------------------------- options flow + secrecy


async def _open_unifi_step(hass: HomeAssistant, entry: MockConfigEntry):
    result = await hass.config_entries.options.async_init(entry.entry_id)
    return await hass.config_entries.options.async_configure(
        result["flow_id"], {"next_step_id": "network_unifi"}
    )


async def test_options_flow_ha_source_never_stores_the_password(hass: HomeAssistant):
    ha_entry = _ha_unifi(hass)
    entry = MockConfigEntry(domain=DOMAIN, options={})
    entry.add_to_hass(hass)
    result = await _open_unifi_step(hass, entry)
    assert result["type"] == data_entry_flow.FlowResultType.FORM
    schema = result["data_schema"].schema
    default = next(k for k in schema if k == "source").default()
    assert default == SOURCE_HA
    with patch(VALIDATE, return_value={"readonly": True}) as validate:
        result = await hass.config_entries.options.async_configure(
            result["flow_id"], {"source": SOURCE_HA, "entry_id": ha_entry.entry_id}
        )
    assert result["type"] == data_entry_flow.FlowResultType.CREATE_ENTRY
    assert validate.call_args.args[1].password == SECRET  # used at connect time only
    assert entry.options["network_unifi"] == {"source": SOURCE_HA, "entry_id": ha_entry.entry_id}
    assert SECRET not in json.dumps(dict(entry.options))


async def test_options_flow_ha_source_missing_entry(hass: HomeAssistant):
    ha_entry = _ha_unifi(hass, state=ConfigEntryState.NOT_LOADED)
    entry = MockConfigEntry(domain=DOMAIN, options={})
    entry.add_to_hass(hass)
    result = await _open_unifi_step(hass, entry)
    with patch(VALIDATE) as validate:
        result = await hass.config_entries.options.async_configure(
            result["flow_id"], {"source": SOURCE_HA, "entry_id": ha_entry.entry_id}
        )
    assert result["errors"] == {"base": "unifi_source_missing"}
    validate.assert_not_called()


async def test_ws_shows_account_from_ha_integration_without_secret(
    hass: HomeAssistant, hass_ws_client, caplog
):
    caplog.set_level(logging.DEBUG)
    install(hass)  # adds the (empty) HA UniFi entry of the synthetic registry
    (ha_entry,) = hass.config_entries.async_entries("unifi")
    hass.config_entries.async_update_entry(ha_entry, data=dict(_ha_unifi_data()))
    ha_entry.mock_state(hass, ConfigEntryState.LOADED)
    entry = MockConfigEntry(domain=DOMAIN, options={})
    entry.add_to_hass(hass)
    with patch(
        "custom_components.homebrain.network.unifi_poller.UnifiPoller.async_start",
        autospec=True,
    ):
        assert await async_setup_component(hass, DOMAIN, {})
        await hass.async_block_till_done()
    poller = hass.data[DOMAIN]["network_unifi"]
    poller._apply(raw_fixture(), NOW)  # noqa: SLF001 – inject one successful poll
    client = await hass_ws_client(hass)
    blobs = []
    for i, kind in enumerate(("get", "topology", "summary", "settings/get"), start=1):
        await client.send_json({"id": i, "type": f"homebrain/network/{kind}"})
        msg = await client.receive_json()
        assert msg["success"], msg
        blobs.append(json.dumps(msg["result"]))
    assert all(SECRET not in b and "192.0.2.10" not in b for b in blobs)
    assert json.loads(blobs[0])["unifi"]["source"] == SOURCE_HA
    assert json.loads(blobs[3])["unifi"] == {
        "configured": True,
        "status": "ok",
        "readonly": True,
        "source": SOURCE_HA,
        "account": "ha",
    }
    assert SECRET not in json.dumps(dict(entry.options))
    assert SECRET not in caplog.text
