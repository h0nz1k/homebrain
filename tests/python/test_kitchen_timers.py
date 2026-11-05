"""Kitchen timers (Minutky): finish event ``homebrain_timer_finished`` + persistent notification.

Synthetic labels only; the notification is dismissed when the timer is silenced or cancelled.
"""

from datetime import timedelta
from unittest.mock import patch

import pytest
from homeassistant.components import persistent_notification
from homeassistant.core import HomeAssistant
from homeassistant.setup import async_setup_component
from pytest_homeassistant_custom_component.common import (
    MockConfigEntry,
    async_capture_events,
    async_fire_time_changed,
)

from custom_components.homebrain.const import DOMAIN
from custom_components.homebrain.recipes import websocket as rws
from custom_components.homebrain.recipes.timers import (
    EVENT_TIMER_FINISHED,
    notification_id,
)


@pytest.fixture
async def setup(hass: HomeAssistant, tmp_path):
    entry = MockConfigEntry(domain=DOMAIN, data={}, options={})
    entry.add_to_hass(hass)
    assert await async_setup_component(hass, "persistent_notification", {})
    with patch.object(rws, "recipes_db_path", return_value=tmp_path / "homebrain" / "recipes.db"):
        assert await async_setup_component(hass, DOMAIN, {})
        await hass.async_block_till_done()
        yield entry
        await rws.async_close_store(hass)


async def _call(client, **msg):
    await client.send_json_auto_id(msg)
    return await client.receive_json()


def _notes(hass):
    return persistent_notification._async_get_or_create_notifications(hass)


async def test_standalone_timer_fires_finished_event_and_notification(
    hass, setup, hass_ws_client, freezer
):
    events = async_capture_events(hass, EVENT_TIMER_FINISHED)
    ws = await hass_ws_client(hass)
    res = await _call(
        ws, type="homebrain/recipes/timers/start", label="Vejce M naměkko (2 ks)", seconds=320
    )
    assert res["success"], res
    timer = res["result"]
    assert timer["recipeId"] is None and timer["stepIndex"] is None

    freezer.tick(timedelta(seconds=321))
    async_fire_time_changed(hass)
    await hass.async_block_till_done()

    assert len(events) == 1
    assert events[0].data["name"] == "Vejce M naměkko (2 ks)"
    assert events[0].data["timer_id"] == timer["id"]
    note = _notes(hass)[notification_id(timer["id"])]
    assert note["title"] == "Minutka doběhla"
    assert "Vejce M naměkko (2 ks)" in note["message"]

    # Silencing in the panel dismisses the HA notification.
    await _call(ws, type="homebrain/recipes/timers/update", timer_id=timer["id"], op="ack")
    await hass.async_block_till_done()
    assert notification_id(timer["id"]) not in _notes(hass)


async def test_cancel_dismisses_notification(hass, setup, hass_ws_client, freezer):
    ws = await hass_ws_client(hass)
    timer = (await _call(ws, type="homebrain/recipes/timers/start", label="Těstoviny", seconds=60))[
        "result"
    ]
    freezer.tick(timedelta(seconds=61))
    async_fire_time_changed(hass)
    await hass.async_block_till_done()
    assert notification_id(timer["id"]) in _notes(hass)
    await _call(ws, type="homebrain/recipes/timers/cancel", timer_id=timer["id"])
    await hass.async_block_till_done()
    assert notification_id(timer["id"]) not in _notes(hass)
