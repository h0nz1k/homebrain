"""Kitchen WS against synthetic HA entities and public services (Refs #90)."""

from unittest.mock import AsyncMock

import pytest
import voluptuous as vol
from homeassistant.core import SupportsResponse
from homeassistant.helpers import entity_registry as er
from homeassistant.setup import async_setup_component
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.homebrain.const import DOMAIN
from custom_components.homebrain.kitchen.model import SETTINGS, defaults, media_item


@pytest.fixture
async def kitchen(hass):
    ma = MockConfigEntry(domain="music_assistant", data={})
    ma.add_to_hass(hass)
    er.async_get(hass).async_get_or_create(
        "media_player",
        "music_assistant",
        "demo-kitchen",
        suggested_object_id="demo_kitchen",
        config_entry=ma,
    )
    hass.states.async_set(
        "media_player.demo_kitchen",
        "playing",
        {"friendly_name": "Demo tablet", "media_title": "Demo radio", "volume_level": 0.4},
    )
    cfg = defaults()
    cfg["player"] = "media_player.demo_kitchen"
    entry = MockConfigEntry(domain=DOMAIN, data={}, options={"kitchen": cfg})
    entry.add_to_hass(hass)
    assert await async_setup_component(hass, DOMAIN, {})
    await hass.async_block_till_done()
    return entry, ma


async def send(client, command, **data):
    await client.send_json_auto_id({"type": f"homebrain/kitchen/{command}", **data})
    return await client.receive_json()


@pytest.mark.parametrize(
    "patch",
    [
        {"radio": [{"uri": "demo://radio/x", "name": "Demo"}] * 6},
        {"more_radios": [{"uri": "demo://radio/x", "name": "Demo"}] * 11},
        {"rest_minutes": 0},
        {"player": "light.demo"},
        {"persons": []},
        {"meater_url": "javascript:alert(1)"},
    ],
)
def test_settings_bounds(patch):
    with pytest.raises(vol.Invalid):
        SETTINGS({**defaults(), **patch})


def test_ma_metadata_projection():
    raw = {
        "uri": "library://playlist/1",
        "name": "Demo",
        "image": "https://example.org/cover.png",
        "provider_mappings": [
            {"provider_instance": "demo_ytm_a"},
            {"provider_instance": "demo_ytm_b"},
        ],
    }
    assert media_item(raw) == {
        "uri": raw["uri"],
        "name": "Demo",
        "image": "https://example.org/cover.png",
        "providers": ["demo_ytm_a", "demo_ytm_b"],
    }
    assert media_item({"uri": "bad", "name": "x"}) is None


async def test_public_ma_library_and_search(hass, kitchen, hass_ws_client):
    calls = []

    async def library(call):
        calls.append(call)
        return {
            "items": [
                {
                    "uri": "demo://playlist/1",
                    "name": "Demo",
                    "provider_mappings": [{"provider_instance": "demo_a"}],
                }
            ]
        }

    async def search(call):
        calls.append(call)
        return {"radio": [{"uri": "demo://radio/1", "name": "Demo radio"}]}

    hass.services.async_register(
        "music_assistant", "get_library", library, supports_response=SupportsResponse.ONLY
    )
    hass.services.async_register(
        "music_assistant", "search", search, supports_response=SupportsResponse.ONLY
    )
    client = await hass_ws_client(hass)
    result = await send(client, "playlists", provider="demo_a")
    assert result["success"] and len(result["result"]["items"]) == 1
    assert calls[0].data == {
        "config_entry_id": kitchen[1].entry_id,
        "media_type": "playlist",
        "limit": 500,
        "offset": 0,
        "order_by": "name",
    }
    result = await send(client, "search_radios", query="Demo")
    assert result["success"] and result["result"]["items"][0]["name"] == "Demo radio"
    assert calls[1].data["media_type"] == ["radio"]
    assert calls[1].data["limit"] == 30
    assert calls[1].data["library_only"] is False
    assert calls[1].context.user_id is not None


async def test_save_admin_and_persistence(hass, kitchen, hass_ws_client):
    client = await hass_ws_client(hass)
    cfg = defaults()
    cfg["rest_minutes"] = 12
    result = await send(client, "save", config=cfg)
    assert result["success"]
    assert kitchen[0].options["kitchen"]["rest_minutes"] == 12
    result = await send(client, "get")
    assert result["result"]["config"]["rest_minutes"] == 12
    assert result["result"]["is_admin"]


@pytest.mark.parametrize("role", ["adult", "kiosk", "child", "guest"])
async def test_nonadmin_cannot_save(hass, kitchen, hass_ws_client, hass_admin_user, role):
    hass_admin_user.groups = []
    hass.config_entries.async_update_entry(
        kitchen[0], options={**kitchen[0].options, "roles": {hass_admin_user.id: role}}
    )
    client = await hass_ws_client(hass)
    result = await send(client, "save", config=defaults())
    assert not result["success"] and result["error"]["code"] == "unauthorized"
    get = await send(client, "get")
    assert get["success"] == (role in {"adult", "kiosk"})
    if get["success"]:
        assert not get["result"]["is_admin"] and get["result"]["candidates"] is None


async def test_play_and_transport_only_configured_player(hass, kitchen, hass_ws_client):
    calls = []

    async def record(call):
        calls.append(call)

    hass.services.async_register(
        "music_assistant",
        "get_library",
        AsyncMock(return_value={}),
        supports_response=SupportsResponse.ONLY,
    )
    hass.services.async_register("music_assistant", "play_media", record)
    hass.services.async_register("media_player", "media_pause", record)
    hass.services.async_register("media_player", "volume_set", record)
    client = await hass_ws_client(hass)
    assert (await send(client, "play", media_id="demo://radio/1", media_type="radio"))["success"]
    assert calls[-1].domain == "music_assistant" and calls[-1].service == "play_media"
    assert calls[-1].data == {
        "entity_id": "media_player.demo_kitchen",
        "media_id": "demo://radio/1",
        "media_type": "radio",
        "enqueue": "replace",
    }
    assert (await send(client, "transport", action="pause"))["success"]
    assert calls[-1].service == "media_pause"
    assert (await send(client, "transport", action="volume", level=0.65))["success"]
    assert calls[-1].data["volume_level"] == 0.65
    for payload in ({"action": "volume", "level": 2}, {"action": "volume"}, {"action": "stop"}):
        assert not (await send(client, "transport", **payload))["success"]
    assert not (
        await send(
            client,
            "play",
            media_id="demo://radio/1",
            media_type="radio",
            entity_id="media_player.other",
        )
    )["success"]
    hass.states.async_set("media_player.demo_kitchen", "unavailable")
    assert not (await send(client, "play", media_id="demo://radio/1", media_type="radio"))[
        "success"
    ]


async def test_unavailable_ma_and_rate_limit(hass, kitchen, hass_ws_client):
    client = await hass_ws_client(hass)
    result = await send(client, "search_radios", query="Demo")
    assert result["error"]["code"] == "ma_unavailable"
    for _ in range(20):
        result = await send(client, "search_radios", query="Demo")
    assert result["error"]["code"] == "rate_limited"
