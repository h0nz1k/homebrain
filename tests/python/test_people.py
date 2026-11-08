"""Kdo je doma: HA ``person.*`` → doma / pryč / nevím, privacy, roles, live push, options.

Synthetic data only (dev-mock names, a big-city centre as coordinates).
"""

from __future__ import annotations

import json
from typing import Any

import pytest
from homeassistant.core import HomeAssistant
from homeassistant.setup import async_setup_component
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.homebrain.const import DOMAIN
from custom_components.homebrain.people import model
from custom_components.homebrain.roles import role_ws_commands

# Prague centre + a zone name: none of this may ever reach a frontend.
SECRET_ATTRS = {
    "latitude": 50.087,
    "longitude": 14.421,
    "gps_accuracy": 12,
    "source": "device_tracker.pixel_jan",
    "user_id": "abc123",
    "device_trackers": ["device_tracker.pixel_jan"],
    "in_zones": ["zone.prace"],
    "editable": True,
}
SECRET_WORDS = (
    "Práce",
    "Škola",
    "latitude",
    "longitude",
    "gps",
    "50.087",
    "14.421",
    "device_tracker",
    "zone.",
    "abc123",
    "in_zones",
    "source",
)


# --- pure state mapping ------------------------------------------------------------------


@pytest.mark.parametrize(
    ("state", "status"),
    [
        ("home", "home"),
        ("not_home", "away"),
        ("Práce", "away"),  # a zone name is just „pryč“
        ("Škola", "away"),
        ("unknown", "unknown"),
        ("unavailable", "unknown"),
        ("", "unknown"),
        (None, "unknown"),
    ],
)
def test_presence_status(state, status):
    assert model.presence_status(state) == status


def test_default_shows_all_persons_sorted_by_name_with_auto_colours():
    people = model.build_people(
        [
            ("person.valinka", "home", "Valinka"),
            ("person.adamek", "not_home", "Adámek"),
            ("person.jan", "Práce", "Jan"),
        ],
        None,
    )
    assert [p["name"] for p in people] == ["Adámek", "Jan", "Valinka"]
    assert [p["status"] for p in people] == ["away", "away", "home"]
    assert all(p["color"] in model.COLORS for p in people)
    assert len({p["color"] for p in people}) == 3  # distinct auto colours


def test_configured_persons_order_names_colours_and_missing_entities():
    config = {
        "persons": [
            {"entity_id": "person.jan", "name": "Táta", "color": "teal"},
            {"entity_id": "person.gone", "name": "Nikdo"},  # removed from HA: skipped
            {"entity_id": "person.babi", "color": "nonsense"},
        ]
    }
    people = model.build_people(
        [
            ("person.babi", "unknown", "Babi"),
            ("person.jan", "home", "Jan"),
            ("person.deda", "home", "Děda"),
        ],
        config,
    )
    assert [(p["id"], p["name"], p["status"]) for p in people] == [
        ("person.jan", "Táta", "home"),
        ("person.babi", "Babi", "unknown"),
    ]
    assert people[0]["color"] == "teal"
    assert people[1]["color"] in model.COLORS  # invalid colour falls back to auto


def test_display_off_shows_nobody():
    assert model.build_people([("person.jan", "home", "Jan")], {"display": False}) == []


# --- WebSocket ---------------------------------------------------------------------------


@pytest.fixture
async def hb(hass: HomeAssistant):
    entry = MockConfigEntry(domain=DOMAIN, data={}, options={})
    entry.add_to_hass(hass)
    assert await async_setup_component(hass, DOMAIN, {})
    await hass.async_block_till_done()
    hass.states.async_set("person.jan", "Práce", {"friendly_name": "Jan", **SECRET_ATTRS})
    hass.states.async_set("person.maminka", "home", {"friendly_name": "Mamínka", **SECRET_ATTRS})
    hass.states.async_set("person.babi", "unavailable", {"friendly_name": "Babi"})
    hass.states.async_set("device_tracker.pixel_jan", "Škola", SECRET_ATTRS)
    return entry


async def _get(hass_ws_client, hass) -> dict[str, Any]:
    client = await hass_ws_client(hass)
    await client.send_json_auto_id({"type": "homebrain/people/get"})
    return await client.receive_json()


async def test_ws_get_maps_states(hass, hb, hass_ws_client):
    msg = await _get(hass_ws_client, hass)
    assert msg["success"], msg
    people = msg["result"]["people"]
    assert [(p["name"], p["status"]) for p in people] == [
        ("Babi", "unknown"),
        ("Jan", "away"),
        ("Mamínka", "home"),
    ]


async def test_ws_never_leaks_zone_gps_or_attributes(hass, hb, hass_ws_client):
    msg = await _get(hass_ws_client, hass)
    assert set(msg["result"]) == {"people"}
    for person in msg["result"]["people"]:
        assert set(person) == {"id", "name", "color", "status"}
        assert person["status"] in {"home", "away", "unknown"}
    raw = json.dumps(msg["result"], ensure_ascii=False)
    for word in SECRET_WORDS:
        assert word not in raw, word


@pytest.mark.parametrize("role", ["adult", "child", "kiosk"])
async def test_ws_mapped_roles_may_read(hass, hb, hass_ws_client, hass_admin_user, role):
    hass_admin_user.groups = []
    hass.config_entries.async_update_entry(hb, options={"roles": {hass_admin_user.id: role}})
    msg = await _get(hass_ws_client, hass)
    assert msg["success"], msg
    assert len(msg["result"]["people"]) == 3


@pytest.mark.parametrize("command", ["homebrain/people/get", "homebrain/people/subscribe"])
async def test_ws_unmapped_user_is_rejected(hass, hb, hass_ws_client, hass_admin_user, command):
    hass_admin_user.groups = []
    client = await hass_ws_client(hass)
    await client.send_json_auto_id({"type": command})
    msg = await client.receive_json()
    assert not msg["success"]
    assert msg["error"]["code"] == "unauthorized"


def test_every_mapped_role_has_people_commands():
    for role in ("adult", "child", "kiosk"):
        assert {"homebrain/people/get", "homebrain/people/subscribe"} <= role_ws_commands(role)
    assert "homebrain/people/get" not in role_ws_commands("guest")


async def test_ws_subscribe_pushes_only_status_changes(hass, hb, hass_ws_client):
    client = await hass_ws_client(hass)
    await client.send_json_auto_id({"type": "homebrain/people/subscribe"})
    msg = await client.receive_json()
    assert msg["success"], msg
    first = await client.receive_json()
    assert first["type"] == "event"
    assert [p["status"] for p in first["event"]["people"]] == ["unknown", "away", "home"]

    # Moving between zones / GPS updates while away: no push (no movement timing leaks).
    hass.states.async_set(
        "person.jan", "Škola", {"friendly_name": "Jan", **SECRET_ATTRS, "latitude": 50.1}
    )
    await hass.async_block_till_done()
    # Arriving home: one push with the new status.
    hass.states.async_set("person.jan", "home", {"friendly_name": "Jan", **SECRET_ATTRS})
    await hass.async_block_till_done()
    pushed = await client.receive_json()
    assert pushed["type"] == "event"
    assert [p["status"] for p in pushed["event"]["people"]] == ["unknown", "home", "home"]
    raw = json.dumps(pushed, ensure_ascii=False)
    for word in SECRET_WORDS:
        assert word not in raw, word


# --- options flow ------------------------------------------------------------------------


async def test_options_people_choose_order_name_and_colour(hass, hb):
    result = await hass.config_entries.options.async_init(hb.entry_id)
    assert "people" in result["menu_options"]
    result = await hass.config_entries.options.async_configure(
        result["flow_id"], {"next_step_id": "people"}
    )
    assert result["step_id"] == "people"
    assert {str(k) for k in result["data_schema"].schema} == {"people_display", "people_persons"}
    result = await hass.config_entries.options.async_configure(
        result["flow_id"],
        {"people_display": True, "people_persons": ["person.maminka", "person.jan"]},
    )
    assert result["step_id"] == "people_style"
    keys = {str(k) for k in result["data_schema"].schema}
    assert keys == {"name_maminka", "color_maminka", "name_jan", "color_jan"}
    result = await hass.config_entries.options.async_configure(
        result["flow_id"],
        {"name_maminka": "Máma", "color_maminka": "pink", "color_jan": "auto"},
    )
    await hass.async_block_till_done()
    assert hb.options["people"] == {
        "display": True,
        "persons": [
            {"entity_id": "person.maminka", "name": "Máma", "color": "pink"},
            {"entity_id": "person.jan"},
        ],
    }
    people = model.people_snapshot(hass)
    assert [(p["name"], p["color"]) for p in people][0] == ("Máma", "pink")
    assert [p["name"] for p in people] == ["Máma", "Jan"]


async def test_options_people_default_all_and_display_off(hass, hb):
    result = await hass.config_entries.options.async_init(hb.entry_id)
    result = await hass.config_entries.options.async_configure(
        result["flow_id"], {"next_step_id": "people"}
    )
    result = await hass.config_entries.options.async_configure(
        result["flow_id"], {"people_display": False}
    )
    await hass.async_block_till_done()
    assert hb.options["people"] == {"display": False, "persons": []}
    assert model.people_snapshot(hass) == []
