"""Přístup (BioLock): labels store, event parsing and the admin WS API (synthetic data only)."""

import json

import pytest
import voluptuous as vol
from homeassistant.core import HomeAssistant
from homeassistant.setup import async_setup_component
from homeassistant.util import dt as dt_util
from pytest_homeassistant_custom_component.common import MockConfigEntry, async_mock_service

from custom_components.homebrain.access.store import (
    AccessError,
    LabelStore,
    UserListAssembler,
    modality,
    parse_users_page,
    validate_label,
)
from custom_components.homebrain.access.ws import labels_path
from custom_components.homebrain.const import DOMAIN


def test_modality_ranges():
    assert modality(1) == "face"
    assert modality(1000) == "face"
    assert modality(1001) == "palm"
    assert modality(2000) == "palm"
    with pytest.raises(AccessError):
        modality(0)
    with pytest.raises(AccessError):
        modality(2001)


def test_parse_users_page_skips_malformed_items():
    page = parse_users_page(
        {
            "page": "1",
            "pages": "2",
            "total": "12",
            "incomplete": "false",
            "users": "1|face|Jan|allowed;1002|palm|Jan|blocked;bad;99999|palm|X|allowed",
        }
    )
    assert page["pages"] == 2
    assert page["users"] == [
        {"id": 1, "type": "face", "name": "Jan", "allowed": True},
        {"id": 1002, "type": "palm", "name": "Jan", "allowed": False},
    ]


def test_assembler_waits_for_all_pages_and_restarts_on_page_one():
    asm = UserListAssembler()
    first = parse_users_page({"page": "1", "pages": "2", "users": "1001|palm|Petra|allowed"})
    second = parse_users_page({"page": "2", "pages": "2", "users": "2|face|Petra|allowed"})
    assert asm.add(first) is None
    assert [u["id"] for u in asm.add(second)] == [2, 1001]
    # A new listing starts from page 1 again.
    assert asm.add(first) is None
    assert asm.add(parse_users_page({"page": "1", "pages": "1", "users": ""})) == []


def test_validate_label():
    assert validate_label(1001, "left", "  Tomáš  ") == {"hand": "left", "person": "Tomáš"}
    assert validate_label(1001, None, "") == {}
    with pytest.raises(AccessError, match="hand_for_face"):
        validate_label(1, "left", None)
    with pytest.raises(AccessError, match="invalid_hand"):
        validate_label(1001, "middle", None)
    with pytest.raises(AccessError, match="invalid_person"):
        validate_label(1001, None, "x" * 41)


def test_label_store_roundtrip_and_ignores_garbage(tmp_path):
    store = LabelStore(tmp_path / "homebrain" / "access.json")
    assert store.load() == {}
    store.set(1002, "left", None)
    store.set(1003, "right", "Petra")
    assert store.load() == {"1002": {"hand": "left"}, "1003": {"hand": "right", "person": "Petra"}}
    store.set(1002, None, None)  # empty label removes the entry
    assert "1002" not in store.load()
    store.forget(1003)
    assert store.load() == {}
    store.stamp_enrolled(1002, "2026-01-15")
    store.set(1002, "left", None)  # set keeps the enrolment date
    assert store.load()["1002"] == {"hand": "left", "enrolled_at": "2026-01-15"}
    store.set_person(" Tomáš ", True)
    store.mark_notified([1002])
    doc = store.load_all()
    assert doc["people"] == {"tomáš": {"child": True}} and doc["notified"] == [1002]
    store.forget(1002)
    assert store.load_all()["notified"] == []
    with pytest.raises(AccessError, match="invalid_date"):
        store.stamp_enrolled(1, "15.1.2026")
    store.path.write_text(json.dumps({"labels": {"1": {"hand": "left"}, "x": {}, "1004": 3}}))
    assert store.load() == {}
    store.path.write_text("{not json")
    assert store.load() == {}


@pytest.fixture
async def setup(hass: HomeAssistant, hass_admin_user):
    entry = MockConfigEntry(domain=DOMAIN, data={}, options={})
    entry.add_to_hass(hass)
    assert await async_setup_component(hass, DOMAIN, {})
    await hass.async_block_till_done()
    return entry


async def _next(client, kind):
    while True:
        msg = await client.receive_json()
        if msg.get("type") == "event" and msg["event"]["event"] == kind:
            return msg


async def _call(client, payload):
    await client.send_json_auto_id(payload)
    while True:
        msg = await client.receive_json()
        if msg.get("type") == "result":
            return msg


async def test_state_users_history_and_live_events(hass: HomeAssistant, setup, hass_ws_client):
    client = await hass_ws_client(hass)
    msg = await _call(client, {"type": "homebrain/access/state"})
    assert msg["success"]
    assert msg["result"]["users"] is None
    assert msg["result"]["entities"]["service_mode"] == "switch.biolock_servisni_rezim"

    sub = await _call(client, {"type": "homebrain/access/subscribe"})
    assert sub["success"]
    hass.bus.async_fire(
        "esphome.biolock_users",
        {
            "page": "1",
            "pages": "1",
            "total": "2",
            "incomplete": "false",
            "users": "1|face|Jan|allowed;1002|palm|Jan|allowed",
        },
    )
    await hass.async_block_till_done()
    pushed = await _next(client, "users")
    assert [u["id"] for u in pushed["event"]["users"]] == [1, 1002]

    hass.bus.async_fire(
        "esphome.biolock_recognized",
        {
            "user_id": "1002",
            "type": "palm",
            "name": "Jan",
            "liveness": "ok",
            "decision": "denied",
            "reason": "service_mode",
            "admin": "false",
        },
    )
    await hass.async_block_till_done()
    pushed = await _next(client, "recognized")
    assert pushed["event"]["data"]["user_id"] == 1002
    assert pushed["event"]["data"]["admin"] is False

    state = await _call(client, {"type": "homebrain/access/state"})
    assert [u["id"] for u in state["result"]["users"]] == [1, 1002]
    assert state["result"]["history"][0]["reason"] == "service_mode"


async def test_labels_and_forget_on_delete(hass: HomeAssistant, setup, hass_ws_client):
    client = await hass_ws_client(hass)
    msg = await _call(client, {"type": "homebrain/access/label", "user_id": 1002, "hand": "left"})
    assert msg["success"]
    assert msg["result"]["labels"] == {"1002": {"hand": "left"}}
    stored = json.loads(labels_path(hass).read_text())
    assert stored["labels"] == {"1002": {"hand": "left"}}
    assert stored["version"] == 1

    bad = await _call(client, {"type": "homebrain/access/label", "user_id": 1, "hand": "left"})
    assert bad["error"]["code"] == "hand_for_face"

    hass.bus.async_fire(
        "esphome.biolock_users",
        {"page": "1", "pages": "1", "users": "1|face|Jan|allowed;1002|palm|Jan|allowed"},
    )
    hass.bus.async_fire(
        "esphome.biolock_enrolled",
        {
            "ok": "true",
            "user_id": "1",
            "type": "face",
            "name": "Jan",
            "reason": "",
            "admin": "false",
        },
    )
    await hass.async_block_till_done()
    state = await _call(client, {"type": "homebrain/access/state"})
    assert state["result"]["labels"]["1"]["enrolled_at"] == dt_util.now().date().isoformat()
    person = await _call(
        client, {"type": "homebrain/access/person", "person": "Jan", "child": True}
    )
    assert person["result"]["people"] == {"jan": {"child": True}}

    hass.bus.async_fire("esphome.biolock_deleted", {"user_id": "1002", "ok": "true", "reason": ""})
    await hass.async_block_till_done()
    state = await _call(client, {"type": "homebrain/access/state"})
    assert "1002" not in state["result"]["labels"]


async def test_commands_call_only_allowlisted_services(hass: HomeAssistant, setup, hass_ws_client):
    client = await hass_ws_client(hass)
    missing = await _call(client, {"type": "homebrain/access/command", "action": "list_users"})
    assert missing["error"]["code"] == "device_unavailable"

    enroll = async_mock_service(hass, "esphome", "biolock_enroll_palm")
    delete = async_mock_service(hass, "esphome", "biolock_delete_user")
    switch_on = async_mock_service(hass, "switch", "turn_on")
    select = async_mock_service(hass, "select", "select_option")

    msg = await _call(
        client,
        {"type": "homebrain/access/command", "action": "enroll_palm", "data": {"name": " Jan "}},
    )
    assert msg["success"]
    assert enroll[0].data == {"name": "Jan"}
    # Old firmware: the action has no timeout_s field -> HomeBrain leaves it out.
    msg = await _call(
        client,
        {
            "type": "homebrain/access/command",
            "action": "enroll_palm",
            "data": {"name": "Jan", "timeout_s": 20},
        },
    )
    assert msg["success"] and enroll[1].data == {"name": "Jan"}
    # New firmware (biolock-firmware#8) declares it -> sent through.
    face = async_mock_service(
        hass,
        "esphome",
        "biolock_enroll_face",
        schema=vol.Schema(
            {vol.Required("name"): str, vol.Optional("admin"): bool, vol.Optional("timeout_s"): int}
        ),
    )
    msg = await _call(
        client,
        {
            "type": "homebrain/access/command",
            "action": "enroll_face",
            "data": {"name": "Petra", "timeout_s": 25},
        },
    )
    assert msg["success"] and face[0].data == {"name": "Petra", "admin": False, "timeout_s": 25}
    bad = await _call(
        client,
        {
            "type": "homebrain/access/command",
            "action": "enroll_face",
            "data": {"name": "Petra", "timeout_s": 999},
        },
    )
    assert bad["error"]["code"] == "invalid_format"
    msg = await _call(
        client,
        {"type": "homebrain/access/command", "action": "delete_user", "data": {"user_id": "1002"}},
    )
    assert msg["success"] and delete[0].data == {"user_id": 1002}
    msg = await _call(
        client, {"type": "homebrain/access/command", "action": "service_mode", "data": {"on": True}}
    )
    assert msg["success"]
    assert switch_on[0].data == {"entity_id": "switch.biolock_servisni_rezim"}
    msg = await _call(
        client,
        {
            "type": "homebrain/access/command",
            "action": "recognition_action",
            "data": {"option": "Otevřít západku"},
        },
    )
    assert msg["success"] and select[0].data["option"] == "Otevřít západku"

    bad = await _call(
        client,
        {"type": "homebrain/access/command", "action": "delete_user", "data": {"user_id": 5000}},
    )
    assert bad["error"]["code"] == "invalid_format"
    bad = await _call(client, {"type": "homebrain/access/command", "action": "delete_all"})
    assert not bad["success"]
    bad = await _call(
        client,
        {
            "type": "homebrain/access/command",
            "action": "recognition_action",
            "data": {"option": "Cokoliv"},
        },
    )
    assert bad["error"]["code"] == "invalid_format"


async def test_reenroll_notification_once(hass: HomeAssistant, setup, hass_ws_client):
    notes = async_mock_service(hass, "persistent_notification", "create")
    labels_path(hass).parent.mkdir(parents=True, exist_ok=True)
    labels_path(hass).write_text(json.dumps({"labels": {"3": {"enrolled_at": "2020-01-01"}}}))
    client = await hass_ws_client(hass)
    for _ in range(2):
        hass.bus.async_fire(
            "esphome.biolock_users", {"page": "1", "pages": "1", "users": "3|face|Tomáš|allowed"}
        )
        await hass.async_block_till_done()
    assert len(notes) == 1
    assert "přezapsat obličej (Tomáš)" in notes[0].data["message"]
    state = await _call(client, {"type": "homebrain/access/state"})
    assert state["result"]["advice"] == {"3": ["age"]}
    off = await _call(client, {"type": "homebrain/access/settings", "notify_reenroll": False})
    assert off["result"]["settings"] == {"notify_reenroll": False}


async def test_enrolment_outside_panel_updates_users_and_history(
    hass: HomeAssistant, setup, hass_ws_client
):
    """Enrolled via an HA script (no wizard): the list and Historie update without a re-list."""
    client = await hass_ws_client(hass)
    await _call(client, {"type": "homebrain/access/subscribe"})
    hass.bus.async_fire(
        "esphome.biolock_users",
        {"page": "1", "pages": "1", "total": "1", "users": "1|face|Jan|allowed"},
    )
    await hass.async_block_till_done()
    await _next(client, "users")

    hass.bus.async_fire(
        "esphome.biolock_enroll_retry",
        {
            "type": "face",
            "type_requested": "palm",
            "name": "Jan",
            "reason": "face_instead_of_palm",
            "reason_text": "zachycen obličej místo dlaně",
            "attempt": "1",
            "remaining_s": "21",
            "rolled_back_id": "2",
        },
    )
    await hass.async_block_till_done()
    retry = await _next(client, "enroll_retry")
    assert retry["event"]["data"]["remaining_s"] == 21
    assert retry["event"]["data"]["rolled_back_id"] == 2

    hass.bus.async_fire(
        "esphome.biolock_enrolled",
        {
            "ok": "true",
            "user_id": "1002",
            "type": "palm",
            "type_requested": "palm",
            "name": "Jan",
            "reason": "success",
            "attempts": "2",
        },
    )
    await hass.async_block_till_done()
    pushed = await _next(client, "users")
    assert [u["id"] for u in pushed["event"]["users"]] == [1, 1002]
    assert pushed["event"]["users"][1] == {"id": 1002, "type": "palm", "name": "Jan", "allowed": True}

    hass.bus.async_fire(
        "esphome.biolock_enrolled",
        {"ok": "false", "user_id": "0", "type_requested": "palm", "name": "Jan", "reason": "timeout"},
    )
    hass.bus.async_fire("esphome.biolock_audit", {"action": "unlock", "user_id": "1"})
    hass.bus.async_fire("esphome.biolock_audit", {"action": "lockout"})
    hass.bus.async_fire("esphome.biolock_deleted", {"ok": "true", "user_id": "1"})
    await hass.async_block_till_done()
    pushed = await _next(client, "users")
    assert [u["id"] for u in pushed["event"]["users"]] == [1002]

    state = await _call(client, {"type": "homebrain/access/state"})
    kinds = [h["kind"] for h in state["result"]["history"]]
    # newest first; the audit "unlock" is not duplicated, retry progress is not stored
    assert kinds == ["deleted", "lockout", "enrolled", "enrolled"]
    assert state["result"]["history"][2]["reason"] == "timeout"
    assert state["result"]["history"][3]["attempts"] == 2

    page = await _call(client, {"type": "homebrain/access/history", "limit": 2})
    assert [h["kind"] for h in page["result"]["items"]] == ["deleted", "lockout"]
    assert page["result"]["more"] is True
    older = await _call(
        client,
        {"type": "homebrain/access/history", "before": page["result"]["items"][-1]["time"]},
    )
    assert [h["kind"] for h in older["result"]["items"]] == ["enrolled", "enrolled"]
    assert older["result"]["more"] is False


async def test_enrolment_before_first_listing_keeps_users_unknown(
    hass: HomeAssistant, setup, hass_ws_client
):
    client = await hass_ws_client(hass)
    hass.bus.async_fire("esphome.biolock_enrolled", {"ok": "true", "user_id": "1001", "name": "Jan"})
    await hass.async_block_till_done()
    state = await _call(client, {"type": "homebrain/access/state"})
    assert state["result"]["users"] is None  # the panel lists on load instead of a partial list
    assert state["result"]["history"][0]["type"] == "palm"


async def test_state_resolves_smart_lock_entities(hass: HomeAssistant, setup, hass_ws_client):
    from homeassistant.helpers import device_registry as dr
    from homeassistant.helpers import entity_registry as er

    mqtt_entry = MockConfigEntry(domain="mqtt")
    mqtt_entry.add_to_hass(hass)
    dev_reg = dr.async_get(hass)
    ent_reg = er.async_get(hass)
    device = dev_reg.async_get_or_create(
        config_entry_id=mqtt_entry.entry_id,
        identifiers={("mqtt", "demo_lock")},
        manufacturer="Nuki",
        model="Smart Lock",
    )
    other = dev_reg.async_get_or_create(
        config_entry_id=mqtt_entry.entry_id,
        identifiers={("mqtt", "garage")},
        manufacturer="Acme",
        model="Garage",
    )
    ent_reg.async_get_or_create("lock", "mqtt", "garage", device_id=other.id, suggested_object_id="garage")
    ent_reg.async_get_or_create("lock", "mqtt", "fd", device_id=device.id, suggested_object_id="front_door")
    ent_reg.async_get_or_create(
        "sensor", "mqtt", "fd_bat", device_id=device.id,
        suggested_object_id="front_door_battery", original_device_class="battery",
    )
    ent_reg.async_get_or_create(
        "binary_sensor", "mqtt", "fd_crit", device_id=device.id,
        suggested_object_id="front_door_battery_critical", original_device_class="battery",
    )
    ent_reg.async_get_or_create(
        "event", "mqtt", "fd_action", device_id=device.id, suggested_object_id="front_door_action"
    )
    client = await hass_ws_client(hass)
    state = await _call(client, {"type": "homebrain/access/state"})
    ents = state["result"]["entities"]
    assert ents["lock"] == "lock.front_door"
    assert ents["lockBattery"] == "sensor.front_door_battery"
    assert ents["lockBatteryCritical"] == "binary_sensor.front_door_battery_critical"
    assert ents["lockAction"] == "event.front_door_action"
    assert ents["service_mode"] == "switch.biolock_servisni_rezim"
