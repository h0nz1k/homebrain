"""Recepty WS API: permissions, URL import with photo, settings, music + airfryer (mocked).

No network and no real devices: page/photo fetches are patched, services are mocks.
"""

import io
from pathlib import Path
from unittest.mock import patch

import pytest
from homeassistant.core import HomeAssistant
from homeassistant.setup import async_setup_component
from pytest_homeassistant_custom_component.common import MockConfigEntry, async_mock_service

from custom_components.homebrain.const import DOMAIN
from custom_components.homebrain.recipes import websocket as rws

FIXTURES = Path(__file__).parent / "fixtures" / "recipes"
PAGE_URL = "https://recepty.example.org/recept/svickova"
# Synthetic entity ids (never the owner's real devices).
BINDINGS = {
    "recipes_airfryer_start": "button.test_fryer_start",
    "recipes_airfryer_temperature": "number.test_fryer_temperature",
    "recipes_airfryer_cook_time": "number.test_fryer_cook_time",
    "recipes_airfryer_method": "select.test_fryer_method",
    "recipes_airfryer_drawer": "binary_sensor.test_fryer_drawer",
    "recipes_media_session": "sensor.test_tablet_media_session",
}


def _png() -> bytes:
    from PIL import Image

    out = io.BytesIO()
    Image.new("RGB", (2400, 1600), (200, 120, 60)).save(out, "PNG")
    return out.getvalue()


async def _fake_fetch(_hass, url, kind):
    if kind == "page":
        return (FIXTURES / "svickova.html").read_bytes(), url, "text/html"
    return _png(), url, "image/png"


@pytest.fixture
async def setup(hass: HomeAssistant, tmp_path):
    entry = MockConfigEntry(domain=DOMAIN, data={}, options={"bindings": {"recipes": BINDINGS}})
    entry.add_to_hass(hass)
    with (
        patch.object(rws, "recipes_db_path", return_value=tmp_path / "homebrain" / "recipes.db"),
        patch.object(rws, "FETCH", _fake_fetch),
    ):
        assert await async_setup_component(hass, DOMAIN, {})
        await hass.async_block_till_done()
        yield entry
        await rws.async_close_store(hass)


async def _call(client, **msg):
    await client.send_json_auto_id(msg)
    return await client.receive_json()


async def test_import_preview_save_photo_and_view(hass, setup, hass_ws_client, hass_client):
    ws = await hass_ws_client(hass)
    preview = await _call(ws, type="homebrain/recipes/import_url", url=PAGE_URL)
    assert preview["success"], preview
    assert preview["result"]["saved"] is False
    assert preview["result"]["preview"]["title"] == "Svíčková na smetaně"
    saved = await _call(ws, type="homebrain/recipes/import_url", url=PAGE_URL, save=True)
    recipe = saved["result"]["recipe"]
    assert recipe["photo"]["width"] == 1600  # resized from 2400 px
    assert "authSig=" in recipe["photo"]["thumbUrl"]
    media_dir = Path(hass.config.config_dir) / "homebrain" / "recipes" / "media"
    assert (media_dir / f"{recipe['id']}.webp").is_file()
    assert (media_dir / f"{recipe['id']}-thumb.webp").is_file()
    client = await hass_client()
    resp = await client.get(f"/api/homebrain/recipes/photo/{recipe['id']}/thumb")
    assert resp.status == 200 and resp.content_type == "image/webp"
    assert (await client.get("/api/homebrain/recipes/photo/../x/thumb")).status == 404
    again = await _call(ws, type="homebrain/recipes/import_url", url=PAGE_URL)
    assert again["result"]["duplicateOf"] == recipe["id"]
    listed = await _call(ws, type="homebrain/recipes/list", search="svickova")
    assert [r["id"] for r in listed["result"]["recipes"]] == [recipe["id"]]
    deleted = await _call(ws, type="homebrain/recipes/delete", recipe_id=recipe["id"])
    assert deleted["result"]["recipe"]["title"] == "Svíčková na smetaně"
    assert not (media_dir / f"{recipe['id']}.webp").exists()


async def test_import_rejects_private_and_non_https(hass, setup, hass_ws_client):
    ws = await hass_ws_client(hass)
    with patch.object(rws, "FETCH", rws._fetch):
        private = ".".join(("10", "0", "0", "7"))
        for url in (f"https://{private}/r", "http://recepty.example.org/r", "https://localhost/r"):
            res = await _call(ws, type="homebrain/recipes/import_url", url=url)
            assert res["error"]["code"] == "IMPORT_URL_NOT_ALLOWED", url


async def test_create_update_favourite_rating(hass, setup, hass_ws_client):
    ws = await hass_ws_client(hass)
    res = await _call(
        ws,
        type="homebrain/recipes/create",
        recipe={
            "title": "Ruční recept",
            "steps": [{"text": "Vaříme 5 minut", "timerSeconds": 300}],
        },
    )
    rid = res["result"]["recipe"]["id"]
    upd = await _call(
        ws, type="homebrain/recipes/update", recipe_id=rid, recipe={"title": "Ruční recept 2"}
    )
    assert upd["result"]["recipe"]["title"] == "Ruční recept 2"
    fav = await _call(ws, type="homebrain/recipes/set_favourite", recipe_id=rid, favourite=True)
    assert fav["result"]["recipe"]["favourite"] is True
    rate = await _call(ws, type="homebrain/recipes/set_rating", recipe_id=rid, rating=4)
    assert rate["result"]["recipe"]["rating"] == 4
    bad = await _call(ws, type="homebrain/recipes/create", recipe={"title": ""})
    assert bad["error"]["code"] == "INVALID_FIELD"
    missing = await _call(ws, type="homebrain/recipes/get", recipe_id="0" * 32)
    assert missing["error"]["code"] == "TARGET_NOT_FOUND"


async def test_non_admin_reads_but_cannot_edit(hass, setup, hass_ws_client, hass_admin_user):
    ws = await hass_ws_client(hass)
    rid = (await _call(ws, type="homebrain/recipes/create", recipe={"title": "Polévka"}))["result"][
        "recipe"
    ]["id"]
    hass_admin_user.groups = []
    hass.config_entries.async_update_entry(
        setup, options={**setup.options, "roles": {hass_admin_user.id: "child"}}
    )
    child = await hass_ws_client(hass)
    assert (await _call(child, type="homebrain/recipes/list"))["success"]
    assert (
        await _call(child, type="homebrain/recipes/set_favourite", recipe_id=rid, favourite=True)
    )["success"]
    for msg in (
        {"type": "homebrain/recipes/update", "recipe_id": rid, "recipe": {"title": "x"}},
        {"type": "homebrain/recipes/delete", "recipe_id": rid},
        {"type": "homebrain/recipes/import_url", "url": PAGE_URL},
        {"type": "homebrain/recipes/settings_set", "music_notify_service": None},
        # Children never start the airfryer.
        {"type": "homebrain/recipes/airfryer", "temperature": 180, "minutes": 5, "confirmed": True},
    ):
        assert (await _call(child, **msg))["error"]["code"] == "unauthorized", msg["type"]


async def test_music_hidden_until_configured_then_commands(hass, setup, hass_ws_client):
    ws = await hass_ws_client(hass)
    cfg = await _call(ws, type="homebrain/recipes/config")
    assert cfg["result"]["music"] == {
        "configured": False,
        "mediaSessionEntity": "sensor.test_tablet_media_session",
    }
    assert (await _call(ws, type="homebrain/recipes/music", command="pause"))["error"][
        "code"
    ] == "NOT_CONFIGURED"
    calls = async_mock_service(hass, "notify", "mobile_app_test_tablet")
    got = await _call(ws, type="homebrain/recipes/settings_get")
    assert got["result"]["availableNotifyServices"] == ["mobile_app_test_tablet"]
    bad = await _call(
        ws, type="homebrain/recipes/settings_set", music_notify_service="persistent_notification"
    )
    assert bad["error"]["code"] == "INVALID_FIELD"
    ok = await _call(
        ws,
        type="homebrain/recipes/settings_set",
        music_notify_service="notify.mobile_app_test_tablet",
    )
    assert ok["result"]["musicNotifyService"] == "mobile_app_test_tablet"
    assert (await _call(ws, type="homebrain/recipes/config"))["result"]["music"]["configured"]
    assert (await _call(ws, type="homebrain/recipes/music", command="pause"))["success"]
    assert (await _call(ws, type="homebrain/recipes/music", command="volume", level=5))["success"]
    assert [c.data for c in calls] == [
        {
            "message": "command_media",
            "data": {"media_command": "pause", "media_package_name": rws.YT_MUSIC_PACKAGE},
        },
        {"message": "command_volume_level", "data": {"media_stream": "music_stream", "command": 5}},
    ]


async def test_airfryer_requires_confirm_and_closed_drawer(hass, setup, hass_ws_client):
    ws = await hass_ws_client(hass)
    numbers = async_mock_service(hass, "number", "set_value")
    selects = async_mock_service(hass, "select", "select_option")
    presses = async_mock_service(hass, "button", "press")
    hass.states.async_set("select.test_fryer_method", "Ruční", {"options": ["Ruční", "Hranolky"]})
    cfg = (await _call(ws, type="homebrain/recipes/config"))["result"]["airfryer"]
    assert cfg["configured"] and cfg["allowed"] and cfg["methods"] == ["Ruční", "Hranolky"]
    base = {"type": "homebrain/recipes/airfryer", "temperature": 200, "minutes": 15}
    assert (await _call(ws, **base))["error"]["code"] == "CONFIRMATION_REQUIRED"
    # Drawer unknown -> refused, then open -> refused.
    assert (await _call(ws, **base, confirmed=True))["error"]["code"] == "AIRFRYER_UNAVAILABLE"
    hass.states.async_set("binary_sensor.test_fryer_drawer", "on")
    assert (await _call(ws, **base, confirmed=True))["error"]["code"] == "AIRFRYER_DRAWER_OPEN"
    assert not numbers and not presses
    hass.states.async_set("binary_sensor.test_fryer_drawer", "off")
    bad = await _call(ws, **base, method="Neznámá", confirmed=True)
    assert bad["error"]["code"] == "INVALID_FIELD" and not presses
    ok = await _call(ws, **base, method="Hranolky", confirmed=True)
    assert ok["result"] == {"started": True, "minutes": 15}
    assert [(c.data["entity_id"], c.data["value"]) for c in numbers] == [
        ("number.test_fryer_temperature", 200),
        ("number.test_fryer_cook_time", 15),
    ]
    assert selects[0].data == {"entity_id": "select.test_fryer_method", "option": "Hranolky"}
    assert [c.data for c in presses] == [{"entity_id": "button.test_fryer_start"}]


async def test_airfryer_not_configured(hass, setup, hass_ws_client):
    hass.config_entries.async_update_entry(setup, options={})
    ws = await hass_ws_client(hass)
    cfg = (await _call(ws, type="homebrain/recipes/config"))["result"]
    assert cfg["airfryer"]["configured"] is False and cfg["music"]["mediaSessionEntity"] is None
    res = await _call(
        ws, type="homebrain/recipes/airfryer", temperature=180, minutes=5, confirmed=True
    )
    assert res["error"]["code"] == "NOT_CONFIGURED"


async def test_airfryer_control_autodetects_and_guards(hass, setup, hass_ws_client):
    """Pause/stop/keep warm press the sibling button of the *_cooking_status sensor."""
    ws = await hass_ws_client(hass)
    presses = async_mock_service(hass, "button", "press")
    pause = {"type": "homebrain/recipes/airfryer_control", "action": "pause"}
    assert (await _call(ws, **pause))["error"]["code"] == "NOT_CONFIGURED"
    hass.states.async_set("sensor.demo_fryer_cooking_status", "standby")
    hass.states.async_set("button.demo_fryer_pause", "unknown")
    hass.states.async_set("button.demo_fryer_stop", "unknown")
    cfg = (await _call(ws, type="homebrain/recipes/config"))["result"]["airfryer"]
    assert cfg["entities"]["status"] == "sensor.demo_fryer_cooking_status"
    # Idle fryer: nothing is pressed (no remote start from the live card).
    assert (await _call(ws, **pause))["error"]["code"] == "AIRFRYER_NOT_RUNNING"
    hass.states.async_set("sensor.demo_fryer_cooking_status", "cooking")
    assert (await _call(ws, **pause))["result"] == {"sent": "pause"}
    stop = {"type": "homebrain/recipes/airfryer_control", "action": "stop"}
    assert (await _call(ws, **stop))["error"]["code"] == "CONFIRMATION_REQUIRED"
    assert (await _call(ws, **stop, confirmed=True))["result"] == {"sent": "stop"}
    warm = {"type": "homebrain/recipes/airfryer_control", "action": "keep_warm"}
    assert (await _call(ws, **warm))["error"]["code"] == "AIRFRYER_UNAVAILABLE"
    bad = await _call(ws, type="homebrain/recipes/airfryer_control", action="start")
    assert not bad["success"]
    assert [c.data["entity_id"] for c in presses] == [
        "button.demo_fryer_pause",
        "button.demo_fryer_stop",
    ]


def test_program_name_from_cache_shapes():
    """Synthetic recipe caches only (the real catalogue never lives in the repo)."""
    from custom_components.homebrain.recipes.websocket import program_name_from_cache

    assert program_name_from_cache({"7": "Demo brambory"}, 7) == "Demo brambory"
    assert program_name_from_cache({"7": {"name": "Demo brambory"}}, 7) == "Demo brambory"
    listed = [{"referenceId": 3, "name": "Demo zelenina"}, {"referenceId": "7", "title": "Demo"}]
    assert program_name_from_cache(listed, 7) == "Demo"
    assert program_name_from_cache({"recipes": listed}, 3) == "Demo zelenina"
    assert program_name_from_cache(listed, 9) is None
    assert program_name_from_cache(None, 7) is None
    assert program_name_from_cache("garbage", 7) is None


async def test_airfryer_program_name_from_owning_entry(hass, setup, hass_ws_client):
    """The name comes from the config entry that owns the status sensor; unknown -> None."""
    from homeassistant.helpers import entity_registry as er
    from pytest_homeassistant_custom_component.common import MockConfigEntry

    ws = await hass_ws_client(hass)
    msg = {"type": "homebrain/recipes/airfryer_program", "program": 7}
    assert (await _call(ws, **msg))["error"]["code"] == "NOT_CONFIGURED"
    entry = MockConfigEntry(
        domain="demo_fryer_vendor", data={"recipe_cache": {"7": "Demo brambory"}}
    )
    entry.add_to_hass(hass)
    er.async_get(hass).async_get_or_create(
        "sensor",
        "demo_fryer_vendor",
        "status-1",
        suggested_object_id="demo_fryer_cooking_status",
        config_entry=entry,
    )
    hass.states.async_set("sensor.demo_fryer_cooking_status", "cooking")
    assert (await _call(ws, **msg))["result"] == {"name": "Demo brambory"}
    assert (await _call(ws, **{**msg, "program": 8}))["result"] == {"name": None}
    # Owner override (device naming) wins; blank clears.
    saved = await _call(
        ws, type="homebrain/recipes/settings_set", airfryer_program_names={"7": "Demo mražené"}
    )
    assert saved["result"]["airfryerProgramNames"] == {"7": "Demo mražené"}
    assert (await _call(ws, **msg))["result"] == {"name": "Demo mražené"}
    bad = await _call(ws, type="homebrain/recipes/settings_set", airfryer_program_names={"x": "y"})
    assert not bad["success"]
