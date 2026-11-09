"""Roboti: slot settings, read-only room lists (roborock.get_maps), WS and options flow."""

from datetime import timedelta
from unittest.mock import patch

from homeassistant.core import HomeAssistant, ServiceCall, SupportsResponse
from homeassistant.setup import async_setup_component
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.homebrain.bindings import get_bindings, is_valid_key
from custom_components.homebrain.const import DOMAIN
from custom_components.homebrain.robots.config import (
    ROBOT_BINDING_KEYS,
    slot_keys,
    slot_settings,
    valid_image,
)
from custom_components.homebrain.robots.rooms import (
    ERROR_TTL,
    READ_ONLY_SERVICE,
    RoomCache,
    normalize_maps,
)

MAPS = {
    "vacuum.robot_a": {
        "maps": [
            {"flag": 1, "name": "", "rooms": {"18": "Pokoj", "16": "WC"}},
            {
                "flag": 0,
                "name": "Dole",
                "rooms": {"2": "Kuchyně", "1": " Obývací   pokoj ", "x": "?"},
            },
            {"flag": True, "name": "bad flag", "rooms": {}},
            "garbage",
        ]
    }
}


def test_slot_keys_and_bindings_domains():
    assert slot_keys(1)[0] == "robot1_vacuum"
    assert "robot3_map_image" in ROBOT_BINDING_KEYS
    assert is_valid_key("robots", "robot2_status")
    assert not is_valid_key("robots", "robot4_vacuum")
    entry = MockConfigEntry(
        domain=DOMAIN,
        options={
            "bindings": {
                "robots": {
                    "robot1_vacuum": "vacuum.robot_a",
                    "robot1_map_image": "image.robot_a_map",
                    "robot1_cleaning_mode": "sensor.wrong_domain",
                    "robot1_clean_water": "binary_sensor.robot_a_clean_water",
                }
            }
        },
    )
    assert get_bindings(entry)["robots"] == {
        "robot1_vacuum": "vacuum.robot_a",
        "robot1_map_image": "image.robot_a_map",
        "robot1_clean_water": "binary_sensor.robot_a_clean_water",
    }


def test_slot_settings_defaults_and_validation():
    assert slot_settings({}, 1) == {
        "name": "Robot 1",
        "floor": "Přízemí",
        "image": "",
        "rotation": 0,
    }
    options = {
        "robots": {
            "2": {
                "name": "  Alfa  ",
                "floor": "3. patro",
                "image": "/local/roboti/alfa.png",
                "rotation": "90",
            },
            "3": {"name": "x" * 99, "image": "javascript:alert(1)", "rotation": 45},
        }
    }
    assert slot_settings(options, 2) == {
        "name": "Alfa",
        "floor": "3. patro",
        "image": "/local/roboti/alfa.png",
        "rotation": 90,
    }
    third = slot_settings(options, 3)
    assert len(third["name"]) == 40 and third["image"] == "" and third["rotation"] == 0
    assert valid_image("https://example.com/robot.webp")
    assert not valid_image("http://example.com/robot.webp")
    assert not valid_image("/local/../secrets.yaml")
    assert not valid_image('/local/a.png" onerror="x')


def test_normalize_maps_sorts_and_validates():
    assert normalize_maps(MAPS, "vacuum.robot_a") == [
        {
            "flag": 0,
            "name": "Dole",
            "rooms": [{"id": 1, "name": "Obývací pokoj"}, {"id": 2, "name": "Kuchyně"}],
        },
        {"flag": 1, "name": "", "rooms": [{"id": 16, "name": "WC"}, {"id": 18, "name": "Pokoj"}]},
    ]
    assert normalize_maps(None, "vacuum.robot_a") == []
    assert normalize_maps({"vacuum.robot_a": {"maps": "x"}}, "vacuum.robot_a") == []


def _register_get_maps(hass: HomeAssistant, calls: list, fail: bool = False) -> None:
    async def handler(call: ServiceCall):
        calls.append(call)
        if fail:
            raise RuntimeError("cloud down")
        ids = call.data.get("entity_id", [])
        return {eid: MAPS["vacuum.robot_a"] for eid in ([ids] if isinstance(ids, str) else ids)}

    hass.services.async_register(
        *READ_ONLY_SERVICE, handler, supports_response=SupportsResponse.ONLY
    )


async def test_room_cache_caches_and_keeps_last_good(hass: HomeAssistant, freezer):
    # Hermetic: frozen clock (TTL decisions are deterministic) and an in-process fake
    # service – no Roborock integration, no network, no real robot.
    freezer.move_to("2026-06-02T10:00:00+00:00")
    calls: list = []
    cache = RoomCache(hass)
    missing = await cache.async_get("vacuum.robot_a")
    assert missing["error"] == "service_missing"
    _register_get_maps(hass, calls)
    # The error result is cached for ERROR_TTL only.
    assert (await cache.async_get("vacuum.robot_a"))["error"] == "service_missing"
    freezer.tick(ERROR_TTL + timedelta(seconds=1))
    first = await cache.async_get("vacuum.robot_a")
    assert first["error"] is None and [m["flag"] for m in first["maps"]] == [0, 1]
    assert len(calls) == 1
    freezer.tick(timedelta(minutes=29))
    assert await cache.async_get("vacuum.robot_a") == first
    assert len(calls) == 1  # still cached within CACHE_TTL
    hass.services.async_remove(*READ_ONLY_SERVICE)
    _register_get_maps(hass, calls, fail=True)
    stale = await cache.async_get("vacuum.robot_a", refresh=True)
    assert stale["error"] == "failed" and stale["maps"] == first["maps"]
    assert len(calls) == 2
    await hass.async_block_till_done()


async def test_ws_robots_get_reads_only_bound_vacuums(hass: HomeAssistant, hass_ws_client):
    calls: list = []
    _register_get_maps(hass, calls)
    entry = MockConfigEntry(
        domain=DOMAIN,
        options={
            "bindings": {"robots": {"robot2_vacuum": "vacuum.robot_a"}},
            "robots": {"2": {"name": "Alfa", "floor": "1. patro", "image": ""}},
        },
    )
    entry.add_to_hass(hass)
    assert await async_setup_component(hass, DOMAIN, {})
    await hass.async_block_till_done()
    client = await hass_ws_client(hass)
    await client.send_json({"id": 1, "type": "homebrain/robots/get"})
    response = await client.receive_json()
    assert response["success"], response
    robots = response["result"]["robots"]
    assert [(r["slot"], r["name"], r["floor"], r["vacuum"]) for r in robots] == [
        (2, "Alfa", "1. patro", "vacuum.robot_a")
    ]
    assert robots[0]["maps"][0]["rooms"][0] == {"id": 1, "name": "Obývací pokoj"}
    assert robots[0]["maps_error"] is None
    # Only the read-only map service was called, only for the bound vacuum.
    assert [c.domain + "." + c.service for c in calls] == ["roborock.get_maps"]
    assert calls[0].data["entity_id"] in ("vacuum.robot_a", ["vacuum.robot_a"])


async def test_options_flow_robot_step(hass: HomeAssistant):
    entry = MockConfigEntry(domain=DOMAIN, options={})
    entry.add_to_hass(hass)
    result = await hass.config_entries.options.async_init(entry.entry_id)
    result = await hass.config_entries.options.async_configure(
        result["flow_id"], {"next_step_id": "robots_1"}
    )
    assert result["step_id"] == "robots_1"
    bad = await hass.config_entries.options.async_configure(
        result["flow_id"], {"name": "Alfa", "image": "ftp://x/y.png"}
    )
    assert bad["errors"] == {"image": "invalid_image"}
    done = await hass.config_entries.options.async_configure(
        result["flow_id"],
        {
            "name": "Alfa",
            "floor": "Přízemí",
            "image": "/local/roboti/alfa.png",
            "robot1_vacuum": "vacuum.robot_a",
            "robot1_battery": "sensor.robot_a_battery",
        },
    )
    assert done["type"] == "create_entry"
    assert entry.options["robots"]["1"] == {
        "name": "Alfa",
        "floor": "Přízemí",
        "image": "/local/roboti/alfa.png",
        "rotation": 0,
    }
    assert entry.options["bindings"]["robots"] == {
        "robot1_vacuum": "vacuum.robot_a",
        "robot1_battery": "sensor.robot_a_battery",
    }


async def test_options_flow_robot_rotation(hass: HomeAssistant):
    """Per-robot map rotation: offered with the stored value, saved as int, other keys kept."""
    entry = MockConfigEntry(
        domain=DOMAIN,
        options={"robots": {"2": {"name": "Beta", "floor": "1. patro", "image": ""}}},
    )
    entry.add_to_hass(hass)
    result = await hass.config_entries.options.async_init(entry.entry_id)
    result = await hass.config_entries.options.async_configure(
        result["flow_id"], {"next_step_id": "robots_2"}
    )
    rotation = next(key for key in result["data_schema"].schema if key == "rotation")
    assert rotation.default() == "0"
    done = await hass.config_entries.options.async_configure(
        result["flow_id"], {"name": "Beta", "floor": "1. patro", "rotation": "270"}
    )
    assert done["type"] == "create_entry"
    assert entry.options["robots"]["2"]["rotation"] == 270
    assert slot_settings(entry.options, 2)["rotation"] == 270
    assert entry.options["robots"]["2"]["name"] == "Beta"


async def test_room_cache_partition_refresh_and_retry_cooldown(hass: HomeAssistant, freezer):
    """A new segment refreshes names without a user refresh; upstream lag is bounded."""
    calls: list = []
    _register_get_maps(hass, calls)
    cache = RoomCache(hass)
    await cache.async_get("vacuum.robot_a")
    await cache.async_match_segments("vacuum.robot_a", {1, 2})
    assert len(calls) == 1
    await cache.async_match_segments("vacuum.robot_a", {1, 2, 3})
    assert len(calls) == 2
    await cache.async_match_segments("vacuum.robot_a", {1, 2, 3})
    assert len(calls) == 2
    freezer.tick(ERROR_TTL + timedelta(seconds=1))
    await cache.async_match_segments("vacuum.robot_a", {1, 2, 3})
    assert len(calls) == 3
    freezer.tick(timedelta(minutes=31))
    await cache.async_get("vacuum.robot_a")
    assert len(calls) == 4


async def test_room_cache_refreshes_renamed_rooms(hass: HomeAssistant, freezer):
    calls: list = []
    _register_get_maps(hass, calls)
    cache = RoomCache(hass)
    first = await cache.async_get("vacuum.robot_a")
    changed = {
        "maps": [
            {
                "flag": 0,
                "rooms": [
                    {"id": 1, "name": "Studio A"},
                    {"id": 2, "name": "Studio B"},
                    {"id": 3, "name": "Komora"},
                ],
            }
        ]
    }
    with patch.object(cache, "_async_fetch", return_value={**first, **changed}):
        value = await cache.async_match_segments("vacuum.robot_a", {1, 2, 3})
    assert value["maps"][0]["rooms"][2]["name"] == "Komora"


async def test_map_ws_refreshes_room_partition(hass: HomeAssistant, hass_ws_client):
    """The real map WS handler detects a stale partition, then get returns new names."""
    from unittest.mock import AsyncMock

    from custom_components.homebrain.robots import ws

    calls: list = []
    _register_get_maps(hass, calls)
    entry = MockConfigEntry(
        domain=DOMAIN,
        options={
            "bindings": {
                "robots": {"robot1_vacuum": "vacuum.robot_a", "robot1_map_image": "image.robot_map"}
            }
        },
    )
    entry.add_to_hass(hass)
    assert await async_setup_component(hass, DOMAIN, {})
    await hass.async_block_till_done()
    cache = ws._cache(hass)
    await cache.async_get("vacuum.robot_a")
    changed = {
        "maps": [
            {
                "flag": 0,
                "name": "",
                "rooms": [
                    {"id": 1, "name": "Ateliér"},
                    {"id": 2, "name": "Studio"},
                    {"id": 3, "name": "Komora"},
                ],
            }
        ],
        "error": None,
        "updated_at": None,
    }
    client = await hass_ws_client(hass)
    vector = {"available": True, "map": {"rooms": [{"id": i} for i in (1, 2, 3)]}}
    with (
        patch.object(
            ws, "_map_cache", return_value=AsyncMock(async_get=AsyncMock(return_value=vector))
        ),
        patch.object(cache, "_async_fetch", return_value=changed) as fetch,
    ):
        await client.send_json({"id": 1, "type": "homebrain/robots/map", "slot": 1})
        assert (await client.receive_json())["success"]
        fetch.assert_awaited_once()
    await client.send_json({"id": 2, "type": "homebrain/robots/get"})
    response = await client.receive_json()
    assert response["result"]["robots"][0]["maps"] == changed["maps"]


async def test_room_names_refresh_on_ttl_without_segment_change(hass: HomeAssistant, freezer):
    calls: list = []
    _register_get_maps(hass, calls)
    cache = RoomCache(hass)
    first = await cache.async_get("vacuum.robot_a")
    renamed = {
        **first,
        "maps": [
            {
                **first["maps"][0],
                "rooms": [{"id": 1, "name": "Studio A"}, {"id": 2, "name": "Studio B"}],
            }
        ],
    }
    with patch.object(cache, "_async_fetch", return_value=renamed) as fetch:
        assert await cache.async_match_segments("vacuum.robot_a", {1, 2}) == first
        fetch.assert_not_awaited()
        freezer.tick(timedelta(minutes=31))
        value = await cache.async_get("vacuum.robot_a")
        fetch.assert_awaited_once()
        assert value["maps"][0]["rooms"][0]["name"] == "Studio A"
