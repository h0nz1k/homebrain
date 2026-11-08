"""Fritéza (manual airfryer control) WS API ``homebrain/fryer/*``.

Fake device only: the button/number/select/switch services are registered by the test and
record every call; pressing start flips the synthetic status sensor like the real appliance.
"""

from unittest.mock import patch

import pytest
from homeassistant.core import HomeAssistant, ServiceCall
from homeassistant.setup import async_setup_component
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.homebrain.const import DOMAIN
from custom_components.homebrain.recipes import fryer
from custom_components.homebrain.recipes import websocket as rws

P = "demo_fryer"
ENTITIES = {
    f"sensor.{P}_cooking_status": "standby",
    f"sensor.{P}_time_remaining": "0",
    f"sensor.{P}_current_temperature": "24",
    f"sensor.{P}_target_temperature": "0",
    f"sensor.{P}_current_stage": "0",
    f"sensor.{P}_error_code": "0",
    f"binary_sensor.{P}_drawer": "off",
    f"binary_sensor.{P}_probe_unplugged": "on",
    f"button.{P}_start_cooking": "unknown",
    f"button.{P}_pause": "unknown",
    f"button.{P}_stop": "unknown",
    f"number.{P}_set_temperature": "180",
    f"number.{P}_set_cook_time": "15",
    f"number.{P}_set_air_speed": "2",
    f"number.{P}_set_probe_temperature": "60",
}
METHODS = ["manual", "auto_cook", "keep_warm", "recipe", "no_selection"]


class FakeFryer:
    """Records service calls in order; start/pause/stop move the status sensor."""

    def __init__(self, hass: HomeAssistant, *, reacts: bool = True) -> None:
        self.hass = hass
        self.calls: list[tuple[str, str, dict]] = []
        self.reacts = reacts
        for domain, service in (
            ("button", "press"),
            ("number", "set_value"),
            ("select", "select_option"),
        ):
            hass.services.async_register(domain, service, self._handler(domain, service))

    def _handler(self, domain: str, service: str):
        async def handle(call: ServiceCall) -> None:
            data = dict(call.data)
            eid = data["entity_id"]
            eid = eid[0] if isinstance(eid, list) else eid
            data["entity_id"] = eid
            self.calls.append((domain, service, data))
            status = f"sensor.{P}_cooking_status"
            if domain == "number":
                self.hass.states.async_set(eid, str(int(data["value"])))
            if not self.reacts or domain != "button":
                return
            if eid.endswith("_start_cooking"):
                self.hass.states.async_set(status, "cooking")
            elif eid.endswith("_pause"):
                self.hass.states.async_set(status, "pause")
            elif eid.endswith("_stop"):
                self.hass.states.async_set(status, "standby")

        return handle


@pytest.fixture
async def setup(hass: HomeAssistant, tmp_path):
    entry = MockConfigEntry(domain=DOMAIN, data={}, options={"bindings": {"recipes": {}}})
    entry.add_to_hass(hass)
    for eid, state in ENTITIES.items():
        attrs = {}
        if eid.startswith("number.") and eid.endswith("_set_cook_time"):
            attrs = {"min": 1, "max": 60}
        hass.states.async_set(eid, state, attrs)
    hass.states.async_set(f"select.{P}_cooking_method", "manual", {"options": METHODS})
    with (
        patch.object(rws, "recipes_db_path", return_value=tmp_path / "homebrain" / "recipes.db"),
        patch.object(fryer, "VERIFY_TIMEOUT", 0.2),
    ):
        assert await async_setup_component(hass, DOMAIN, {})
        await hass.async_block_till_done()
        yield entry
        await rws.async_close_store(hass)


async def _call(client, **msg):
    await client.send_json_auto_id(msg)
    return await client.receive_json()


START = {"type": "homebrain/fryer/start", "temperature": 200, "minutes": 18, "air_speed": 2}


def test_resolve_entities_from_status_prefix_and_bindings():
    ids = list(ENTITIES) + [f"select.{P}_cooking_method"]
    found = fryer.resolve_entities(ids, {"recipes_airfryer_drawer": "binary_sensor.other_drawer"})
    assert found["status"] == f"sensor.{P}_cooking_status"
    assert found["start"] == f"button.{P}_start_cooking"
    assert found["temperature"] == f"number.{P}_set_temperature"
    assert found["method"] == f"select.{P}_cooking_method"
    assert found["drawer"] == "binary_sensor.other_drawer"
    assert fryer.resolve_entities(["sensor.nothing"], {}) == {}


async def test_get_reports_capabilities_and_no_builtin_presets(hass, setup, hass_ws_client):
    ws = await hass_ws_client(hass)
    res = (await _call(ws, type="homebrain/fryer/get"))["result"]
    assert res["configured"] is True and res["canControl"] is True
    assert res["entities"]["status"] == f"sensor.{P}_cooking_status"
    assert res["capabilities"] == {"airSpeed": True, "probe": True, "addTime": True}
    assert res["limits"]["minutes"] == [1, 60] and res["limits"]["temperature"] == [40, 200]
    # The cloud (MQTT) integration exposes no startable AutoCook programs.
    assert res["presets"] == {"supported": False, "programs": []}
    assert res["favourites"] == [] and res["blockers"] == []


async def test_manual_start_sets_method_first_then_values_then_presses_start(
    hass, setup, hass_ws_client
):
    dev = FakeFryer(hass)
    ws = await hass_ws_client(hass)
    res = await _call(ws, **START, confirmed=True)
    assert res["success"], res
    assert res["result"] == {"started": True, "verified": True, "minutes": 18}
    assert [(d, s, c.get("option", c.get("value")), c["entity_id"]) for d, s, c in dev.calls] == [
        ("select", "select_option", "manual", f"select.{P}_cooking_method"),
        ("number", "set_value", 200, f"number.{P}_set_temperature"),
        ("number", "set_value", 18, f"number.{P}_set_cook_time"),
        ("number", "set_value", 2, f"number.{P}_set_air_speed"),
        ("button", "press", None, f"button.{P}_start_cooking"),
    ]


async def test_probe_target_needs_plugged_probe(hass, setup, hass_ws_client):
    dev = FakeFryer(hass)
    ws = await hass_ws_client(hass)
    res = await _call(ws, **START, probe_temperature=70, confirmed=True)
    assert res["error"]["code"] == "AIRFRYER_PROBE_UNPLUGGED" and dev.calls == []
    hass.states.async_set(f"binary_sensor.{P}_probe_unplugged", "off")
    assert (await _call(ws, **START, probe_temperature=70, confirmed=True))["success"]
    assert (
        "number",
        "set_value",
        {"entity_id": f"number.{P}_set_probe_temperature", "value": 70},
    ) in [(d, s, {"entity_id": c["entity_id"], "value": c.get("value")}) for d, s, c in dev.calls]


async def test_probe_start_without_minutes_uses_time_as_safety_cap(hass, setup, hass_ws_client):
    dev = FakeFryer(hass)
    hass.states.async_set(f"binary_sensor.{P}_probe_unplugged", "off")
    ws = await hass_ws_client(hass)
    base = {"type": "homebrain/fryer/start", "temperature": 180, "air_speed": 2, "confirmed": True}
    # No time and no probe: nothing to stop on → refused before any device call.
    res = await _call(ws, **base)
    assert res["error"]["code"] == "INVALID_FIELD" and dev.calls == []
    res = await _call(ws, **base, probe_temperature=63)
    assert res["success"] and res["result"]["minutes"] == 60
    sent = [(d, s, c.get("entity_id"), c.get("value")) for d, s, c in dev.calls]
    assert ("number", "set_value", f"number.{P}_set_cook_time", 60) in sent
    assert ("number", "set_value", f"number.{P}_set_probe_temperature", 63) in sent


async def test_start_requires_confirmation_and_valid_ranges(hass, setup, hass_ws_client):
    dev = FakeFryer(hass)
    ws = await hass_ws_client(hass)
    assert (await _call(ws, **START))["error"]["code"] == "CONFIRMATION_REQUIRED"
    for bad in (
        {"temperature": 230},
        {"temperature": 30},
        {"minutes": 0},
        {"minutes": 61},
        {"air_speed": 3},
        {"probe_temperature": 120},
    ):
        res = await _call(ws, **{**START, **bad, "confirmed": True})
        assert res["error"]["code"] == "invalid_format", bad
    assert dev.calls == []


@pytest.mark.parametrize(
    ("entity", "state", "code"),
    [
        (f"binary_sensor.{P}_drawer", "on", "AIRFRYER_DRAWER_OPEN"),
        (f"binary_sensor.{P}_drawer", "unavailable", "AIRFRYER_UNAVAILABLE"),
        (f"sensor.{P}_cooking_status", "cooking", "AIRFRYER_BUSY"),
        (f"sensor.{P}_cooking_status", "pause", "AIRFRYER_BUSY"),
        (f"sensor.{P}_cooking_status", "unavailable", "AIRFRYER_UNAVAILABLE"),
        (f"sensor.{P}_error_code", "17", "AIRFRYER_ERROR"),
    ],
)
async def test_start_blocked_states(hass, setup, hass_ws_client, entity, state, code):
    dev = FakeFryer(hass)
    hass.states.async_set(entity, state)
    ws = await hass_ws_client(hass)
    assert (await _call(ws, **START, confirmed=True))["error"]["code"] == code
    assert dev.calls == []
    assert code in (await _call(ws, type="homebrain/fryer/get"))["result"]["blockers"]


async def test_start_not_confirmed_by_device_reports_unverified(hass, setup, hass_ws_client):
    FakeFryer(hass, reacts=False)
    ws = await hass_ws_client(hass)
    res = await _call(ws, **START, confirmed=True)
    assert res["result"]["verified"] is False


async def test_control_pause_resume_stop_and_add_time(hass, setup, hass_ws_client):
    dev = FakeFryer(hass)
    ws = await hass_ws_client(hass)
    ctl = {"type": "homebrain/fryer/control"}
    # Nothing runs yet: no pause, no extra time.
    assert (await _call(ws, **ctl, action="pause"))["error"]["code"] == "AIRFRYER_NOT_RUNNING"
    assert (await _call(ws, **ctl, action="add_time", minutes=1))["error"][
        "code"
    ] == "AIRFRYER_NOT_RUNNING"
    hass.states.async_set(f"sensor.{P}_cooking_status", "cooking")
    assert (await _call(ws, **ctl, action="pause"))["success"]
    assert hass.states.get(f"sensor.{P}_cooking_status").state == "pause"
    assert (await _call(ws, **ctl, action="resume"))["success"]
    assert dev.calls[-1][2]["entity_id"] == f"button.{P}_start_cooking"
    added = await _call(ws, **ctl, action="add_time", minutes=5)
    assert added["result"] == {"sent": "add_time", "minutes": 20}
    assert dev.calls[-1][2] == {"entity_id": f"number.{P}_set_cook_time", "value": 20}
    hass.states.async_set(f"number.{P}_set_cook_time", "58", {"min": 1, "max": 60})
    capped = await _call(ws, **ctl, action="add_time", minutes=5)
    assert capped["result"]["minutes"] == 60
    assert (await _call(ws, **ctl, action="stop"))["error"]["code"] == "CONFIRMATION_REQUIRED"
    assert (await _call(ws, **ctl, action="stop", confirmed=True))["success"]
    assert hass.states.get(f"sensor.{P}_cooking_status").state == "standby"


async def test_favourites_crud_validation_and_persistence(hass, setup, hass_ws_client):
    ws = await hass_ws_client(hass)
    fav = {"name": " Hranolky ", "temperature": 200, "minutes": 18, "air_speed": 2}
    saved = (await _call(ws, type="homebrain/fryer/favourites/save", favourite=fav))["result"]
    item = saved["favourites"][0]
    assert item["name"] == "Hranolky" and item["probe_temperature"] is None and item["id"]
    edit = {**item, "minutes": 20}
    again = (await _call(ws, type="homebrain/fryer/favourites/save", favourite=edit))["result"]
    assert [f["minutes"] for f in again["favourites"]] == [20]
    bad = await _call(
        ws, type="homebrain/fryer/favourites/save", favourite={**fav, "temperature": 260}
    )
    assert bad["error"]["code"] == "invalid_format"
    empty = await _call(ws, type="homebrain/fryer/favourites/save", favourite={**fav, "name": " "})
    assert empty["error"]["code"] == "INVALID_FIELD"
    missing = await _call(ws, type="homebrain/fryer/favourites/delete", favourite_id="nope")
    assert missing["error"]["code"] == "TARGET_NOT_FOUND"
    # Persisted through HA storage (a fresh manager sees the same list).
    stored = await fryer.FavouriteStore(hass).async_list()
    assert [f["name"] for f in stored] == ["Hranolky"]
    gone = await _call(ws, type="homebrain/fryer/favourites/delete", favourite_id=item["id"])
    assert gone["result"]["favourites"] == []


@pytest.mark.parametrize("role", ["child", "kiosk"])
async def test_child_and_kiosk_only_see_status(hass, setup, hass_ws_client, hass_admin_user, role):
    dev = FakeFryer(hass)
    hass_admin_user.groups = []
    hass.config_entries.async_update_entry(
        setup, options={**setup.options, "roles": {hass_admin_user.id: role}}
    )
    ws = await hass_ws_client(hass)
    res = (await _call(ws, type="homebrain/fryer/get"))["result"]
    assert res["canControl"] is False
    for msg in (
        {**START, "confirmed": True},
        {"type": "homebrain/fryer/control", "action": "pause"},
        {
            "type": "homebrain/fryer/favourites/save",
            "favourite": {"name": "x", "temperature": 180, "minutes": 5},
        },
        {"type": "homebrain/fryer/favourites/delete", "favourite_id": "x"},
    ):
        assert (await _call(ws, **msg))["error"]["code"] == "unauthorized", msg["type"]
    assert dev.calls == []


async def test_adult_may_start(hass, setup, hass_ws_client, hass_admin_user):
    FakeFryer(hass)
    hass_admin_user.groups = []
    hass.config_entries.async_update_entry(
        setup, options={**setup.options, "roles": {hass_admin_user.id: "adult"}}
    )
    ws = await hass_ws_client(hass)
    assert (await _call(ws, type="homebrain/fryer/get"))["result"]["canControl"] is True
    assert (await _call(ws, **START, confirmed=True))["success"]


async def test_not_configured_without_fryer(hass, setup, hass_ws_client):
    for eid in list(ENTITIES):
        hass.states.async_remove(eid)
    ws = await hass_ws_client(hass)
    res = (await _call(ws, type="homebrain/fryer/get"))["result"]
    assert res["configured"] is False
    assert (await _call(ws, **START, confirmed=True))["error"]["code"] == "NOT_CONFIGURED"
