"""Maso v troubě: MEATER probes (HA core ``meater``) → minimal Dnes cooking payload.

Synthetic data only: made-up probe serials, entity ids chosen by the test (the real ones are
never relied upon – discovery goes through the entity registry, platform ``meater``).
"""

from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from homeassistant.core import HomeAssistant
from homeassistant.helpers import device_registry as dr
from homeassistant.helpers import entity_registry as er
from homeassistant.setup import async_setup_component
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.homebrain.const import DOMAIN
from custom_components.homebrain.cooking import model
from custom_components.homebrain.roles import role_ws_commands

NOW = datetime(2026, 11, 8, 17, 0, tzinfo=UTC)
SERIALS = ("aaaa1111demo0001", "bbbb2222demo0002", "cccc3333demo0003", "dddd4444demo0004")
CMD = "homebrain/cooking/subscribe"


def _iso(delta_s: float) -> str:
    return (NOW + timedelta(seconds=delta_s)).isoformat()


# --- pure model --------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("unique_id", "translation_key", "key"),
    [
        ("aaaa1111demo0001-internal", "internal", "internal"),
        ("aaaa1111demo0001-cook_time_remaining", None, "cook_time_remaining"),
        ("aaaa1111demo0001-cook_time_elapsed", "something_renamed", "cook_time_elapsed"),
        (None, "cook_peak_temp", "cook_peak_temp"),
        ("aaaa1111demo0001-battery", "battery", None),  # future sensor: ignored
        (None, None, None),
    ],
)
def test_entity_key_prefers_translation_key_then_unique_id_suffix(unique_id, translation_key, key):
    assert model.entity_key(unique_id, translation_key) == key


@pytest.mark.parametrize(
    ("raw", "state"),
    [
        ("started", "cooking"),
        ("ready_for_resting", "remove"),
        ("Ready For Resting", "remove"),  # raw cloud value, defensive
        ("resting", "resting"),
        ("finished", "done"),
        ("slightly_underdone", "underdone"),
        ("slightly_overdone", "overdone"),
        ("overcooked", "overcooked"),
        ("OVERCOOK!", "overcooked"),
        ("not_started", "ready"),
        ("configured", "ready"),
        ("unknown", "unknown"),  # cook exists, state not mapped by HA
        ("brand_new_state", "unknown"),
        ("unavailable", None),
        (None, None),
        ("", None),
    ],
)
def test_normalize_state(raw, state):
    assert model.normalize_state(raw) == state


def _readings(**over: Any) -> dict[str, tuple[str | None, str | None]]:
    base: dict[str, tuple[str | None, str | None]] = {
        "internal": ("48.4", "°C"),
        "ambient": ("181.2", "°C"),
        "cook_name": ("Vepřová plec", None),
        "cook_state": ("started", None),
        "cook_target_temp": ("63", "°C"),
        "cook_peak_temp": ("48.4", "°C"),
        "cook_time_remaining": (_iso(12 * 60 + 20), None),
        "cook_time_elapsed": (_iso(-95 * 60), None),
    }
    base.update(over)
    return base


def test_build_probe_full_cook():
    probe = model.build_probe(1, _readings(), NOW)
    assert probe == {
        "id": "probe1",
        "name": "Vepřová plec",
        "internal": 48.4,
        "ambient": 181.2,
        "target": 63.0,
        "peak": 48.4,
        "remaining_s": 740,
        "elapsed_s": 5700,
        "state": "cooking",
        "progress": pytest.approx(48.4 / 63, abs=0.001),
    }


def test_build_probe_without_cook_is_inactive():
    unavailable = {key: ("unavailable", None) for key in model.COOK_KEYS}
    # Probe out of the dock, temperatures readable, but no cook configured → not shown.
    assert model.build_probe(2, _readings(**unavailable), NOW) is None
    assert model.build_probe(2, {}, NOW) is None
    everything = {key: ("unavailable", None) for key in model.KEYS}
    assert model.build_probe(2, everything, NOW) is None


def test_build_probe_unknown_state_name_fallback_and_estimating():
    probe = model.build_probe(
        3,
        _readings(
            cook_state=("unknown", None),
            cook_name=("unknown", None),
            cook_time_remaining=("unknown", None),
            ambient=("unavailable", None),
        ),
        NOW,
    )
    assert probe is not None
    assert probe["name"] == "Sonda 3"
    assert probe["state"] == "unknown"
    assert probe["remaining_s"] is None  # „odhaduje se…“
    assert probe["ambient"] is None


def test_build_probe_converts_fahrenheit_and_clamps_progress():
    probe = model.build_probe(
        1,
        _readings(
            internal=("150.8", "°F"),
            cook_target_temp=("145.4", "°F"),
            cook_state=("ready_for_resting", None),
            cook_time_remaining=(_iso(-30), None),
        ),
        NOW,
    )
    assert probe is not None
    assert probe["internal"] == 66.0
    assert probe["target"] == 63.0
    assert probe["progress"] == 1.0
    assert probe["remaining_s"] == 0
    assert probe["state"] == "remove"


def test_build_probe_garbage_numbers_are_none():
    probe = model.build_probe(
        1, _readings(internal=("abc", "°C"), cook_target_temp=("0", "°C")), NOW
    )
    assert probe is not None
    assert probe["internal"] is None
    assert probe["progress"] is None


# --- WebSocket ---------------------------------------------------------------------------


def _register_probe(hass: HomeAssistant, meater: MockConfigEntry, serial: str) -> dict[str, str]:
    """Registry rows like HA core creates them; entity ids deliberately arbitrary."""
    dev = dr.async_get(hass).async_get_or_create(
        config_entry_id=meater.entry_id,
        identifiers={("meater", serial)},
        name=f"Meater Probe {serial[:8]}",
    )
    reg = er.async_get(hass)
    ids = {}
    for n, key in enumerate(model.KEYS):
        entry = reg.async_get_or_create(
            "sensor",
            "meater",
            f"{serial}-{key}",
            config_entry=meater,
            device_id=dev.id,
            translation_key=key,
            suggested_object_id=f"demo_{serial[:4]}_{n}",
        )
        ids[key] = entry.entity_id
    return ids


def _set(
    hass: HomeAssistant, ids: dict[str, str], readings: dict[str, tuple[str | None, str | None]]
):
    for key, entity_id in ids.items():
        state, unit = readings.get(key, ("unavailable", None))
        attrs = {"unit_of_measurement": unit} if unit else {}
        hass.states.async_set(entity_id, state, attrs)


@pytest.fixture
async def hb(hass: HomeAssistant, freezer):
    freezer.move_to(NOW)
    entry = MockConfigEntry(domain=DOMAIN, data={}, options={})
    entry.add_to_hass(hass)
    assert await async_setup_component(hass, DOMAIN, {})
    await hass.async_block_till_done()
    meater = MockConfigEntry(domain="meater", data={}, title="Meater")
    meater.add_to_hass(hass)
    return entry, meater


async def _subscribe(hass, hass_ws_client) -> tuple[Any, dict[str, Any]]:
    client = await hass_ws_client(hass)
    await client.send_json_auto_id({"type": CMD})
    msg = await client.receive_json()
    assert msg["success"], msg
    first = await client.receive_json()
    assert first["type"] == "event"
    return client, first["event"]


async def test_ws_no_meater_entities_is_empty(hass, hb, hass_ws_client):
    _client, event = await _subscribe(hass, hass_ws_client)
    assert event == {"probes": []}


async def test_ws_one_probe_cooking(hass, hb, hass_ws_client):
    _hb, meater = hb
    ids = _register_probe(hass, meater, SERIALS[0])
    _set(hass, ids, _readings())
    hass.states.async_set("sensor.demo_oven_temperature", "180", {"unit_of_measurement": "°C"})
    _client, event = await _subscribe(hass, hass_ws_client)
    assert len(event["probes"]) == 1
    probe = event["probes"][0]
    assert probe["name"] == "Vepřová plec"
    assert probe["state"] == "cooking"
    assert probe["remaining_s"] == 740
    raw = json.dumps(event)
    for serial in SERIALS:  # never the probe serial / device ids
        assert serial[:8] not in raw


async def test_ws_four_probes_skip_unavailable_and_push_changes(hass, hb, hass_ws_client):
    _hb, meater = hb
    probes = [_register_probe(hass, meater, serial) for serial in SERIALS]
    _set(hass, probes[0], _readings())
    _set(
        hass,
        probes[1],
        _readings(cook_name=("unavailable", None), cook_state=("ready_for_resting", None)),
    )
    _set(hass, probes[2], {})  # in the dock / not cooking: everything unavailable
    _set(hass, probes[3], _readings(cook_name=("Hovězí", None), cook_state=("resting", None)))
    client, event = await _subscribe(hass, hass_ws_client)
    assert [(p["id"], p["name"], p["state"]) for p in event["probes"]] == [
        ("probe1", "Vepřová plec", "cooking"),
        ("probe2", "Sonda 2", "remove"),
        ("probe4", "Hovězí", "resting"),
    ]
    # Unrelated sensors never trigger a push; a MEATER change does.
    hass.states.async_set("sensor.demo_oven_temperature", "200", {"unit_of_measurement": "°C"})
    hass.states.async_set(probes[0]["cook_state"], "ready_for_resting")
    await hass.async_block_till_done()
    pushed = await client.receive_json()
    assert pushed["type"] == "event"
    assert pushed["event"]["probes"][0]["state"] == "remove"
    # Cook ends on probe 4 → it disappears.
    _set(hass, probes[3], {})
    await hass.async_block_till_done()
    while True:
        pushed = await client.receive_json()
        if len(pushed["event"]["probes"]) == 2:
            break
    assert [p["id"] for p in pushed["event"]["probes"]] == ["probe1", "probe2"]


async def test_ws_entities_appearing_later_are_discovered(hass, hb, hass_ws_client):
    """MEATER only creates its entities during the first cook: the subscription must notice."""
    _hb, meater = hb
    client, event = await _subscribe(hass, hass_ws_client)
    assert event["probes"] == []
    ids = _register_probe(hass, meater, SERIALS[0])
    _set(hass, ids, _readings())
    await hass.async_block_till_done()
    while True:
        pushed = await client.receive_json()
        if pushed["event"]["probes"]:
            break
    assert pushed["event"]["probes"][0]["name"] == "Vepřová plec"


@pytest.mark.parametrize("role", ["adult", "child", "kiosk"])
async def test_ws_mapped_roles_may_subscribe(hass, hb, hass_ws_client, hass_admin_user, role):
    entry, _meater = hb
    hass_admin_user.groups = []
    hass.config_entries.async_update_entry(entry, options={"roles": {hass_admin_user.id: role}})
    _client, event = await _subscribe(hass, hass_ws_client)
    assert event == {"probes": []}


async def test_ws_unmapped_user_is_rejected(hass, hb, hass_ws_client, hass_admin_user):
    hass_admin_user.groups = []
    client = await hass_ws_client(hass)
    await client.send_json_auto_id({"type": CMD})
    msg = await client.receive_json()
    assert not msg["success"]
    assert msg["error"]["code"] == "unauthorized"


def test_every_mapped_role_has_cooking_command():
    for role in ("adult", "child", "kiosk"):
        assert CMD in role_ws_commands(role)
    assert CMD not in role_ws_commands("guest")
