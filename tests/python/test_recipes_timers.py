"""Recepty server-side timers: WS start/cancel, persistence across restart, expiry event + notify.

Synthetic notify targets only (``notify.test_kitchen_phone``); no real devices.
"""

from datetime import timedelta
from unittest.mock import patch

import pytest
from homeassistant.core import HomeAssistant
from homeassistant.setup import async_setup_component
from pytest_homeassistant_custom_component.common import (
    MockConfigEntry,
    async_capture_events,
    async_fire_time_changed,
    async_mock_service,
)

from custom_components.homebrain.const import DOMAIN
from custom_components.homebrain.recipes import websocket as rws
from custom_components.homebrain.recipes.timers import EVENT_TIMER_DONE, notify_message

RID = "a" * 32


@pytest.fixture
async def setup(hass: HomeAssistant, tmp_path):
    entry = MockConfigEntry(domain=DOMAIN, data={}, options={})
    entry.add_to_hass(hass)
    with patch.object(rws, "recipes_db_path", return_value=tmp_path / "homebrain" / "recipes.db"):
        assert await async_setup_component(hass, DOMAIN, {})
        await hass.async_block_till_done()
        yield entry
        await rws.async_close_store(hass)


async def _call(client, **msg):
    await client.send_json_auto_id(msg)
    return await client.receive_json()


async def _start(ws, seconds=120, step_index=2, label="Guláš · krok 3"):
    res = await _call(
        ws,
        type="homebrain/recipes/timers/start",
        label=label,
        seconds=seconds,
        recipe_id=RID,
        step_index=step_index,
    )
    assert res["success"], res
    return res["result"]


async def test_start_subscribe_and_cancel(hass, setup, hass_ws_client):
    ws = await hass_ws_client(hass)
    sub = await _call(ws, type="homebrain/recipes/timers/subscribe")
    assert sub["success"]
    first = await ws.receive_json()
    assert first["event"]["timers"] == [] and first["event"]["serverNow"] > 0

    ws2 = await hass_ws_client(hass)
    timer = await _start(ws2)
    assert timer["recipeId"] == RID and timer["stepIndex"] == 2 and timer["durationMs"] == 120_000
    pushed = await ws.receive_json()
    assert [t["id"] for t in pushed["event"]["timers"]] == [timer["id"]]

    # Same recipe step from another device joins the running timer instead of a duplicate.
    again = await _start(ws2)
    assert again["id"] == timer["id"]

    cancel = await _call(ws2, type="homebrain/recipes/timers/cancel", timer_id=timer["id"])
    assert cancel["result"] == {"cancelled": True}
    # A join may also push an (unchanged) snapshot first; the last push must be empty.
    for _ in range(3):
        pushed = await ws.receive_json()
        if pushed["event"]["timers"] == []:
            break
    assert pushed["event"]["timers"] == []


async def test_pause_resume_add_time(hass, setup, hass_ws_client, freezer):
    ws = await hass_ws_client(hass)
    timer = await _start(ws, seconds=60)
    freezer.tick(timedelta(seconds=20))
    paused = await _call(
        ws, type="homebrain/recipes/timers/update", timer_id=timer["id"], op="pause"
    )
    assert paused["result"]["endsAt"] is None
    assert paused["result"]["pausedRemainingMs"] == 40_000
    added = await _call(
        ws, type="homebrain/recipes/timers/update", timer_id=timer["id"], op="add_time", seconds=60
    )
    assert added["result"]["pausedRemainingMs"] == 100_000
    resumed = await _call(
        ws, type="homebrain/recipes/timers/update", timer_id=timer["id"], op="resume"
    )
    assert (
        resumed["result"]["endsAt"] is not None and resumed["result"]["pausedRemainingMs"] is None
    )
    missing = await _call(ws, type="homebrain/recipes/timers/update", timer_id="nope", op="ack")
    assert missing["error"]["code"] == "TARGET_NOT_FOUND"


async def test_expiry_fires_event_and_notifies_configured_targets(
    hass, setup, hass_ws_client, freezer
):
    calls = async_mock_service(hass, "notify", "test_kitchen_phone")
    events = async_capture_events(hass, EVENT_TIMER_DONE)
    ws = await hass_ws_client(hass)
    saved = await _call(
        ws,
        type="homebrain/recipes/settings_set",
        timer_notify_targets=["notify.test_kitchen_phone"],
    )
    assert saved["result"] == {"timerNotifyTargets": ["test_kitchen_phone"]}
    got = await _call(ws, type="homebrain/recipes/settings_get")
    assert got["result"]["timerNotifyTargets"] == ["test_kitchen_phone"]
    assert "test_kitchen_phone" in got["result"]["availableTimerNotifyTargets"]

    timer = await _start(ws, seconds=90)
    freezer.tick(timedelta(seconds=91))
    async_fire_time_changed(hass)
    await hass.async_block_till_done()

    assert [e.data["timer_id"] for e in events] == [timer["id"]]
    assert events[0].data["label"] == "Guláš · krok 3"
    assert len(calls) == 1
    assert calls[0].data["message"] == "⏰ Minutka: Guláš · krok 3 – hotovo"
    assert notify_message("X") == "⏰ Minutka: X – hotovo"

    # Fires once: more time passing does not repeat the event.
    freezer.tick(timedelta(seconds=20))
    async_fire_time_changed(hass)
    await hass.async_block_till_done()
    assert len(events) == 1 and len(calls) == 1

    # +1 min re-arms it.
    await _call(ws, type="homebrain/recipes/timers/update", timer_id=timer["id"], op="add_time")
    freezer.tick(timedelta(seconds=61))
    async_fire_time_changed(hass)
    await hass.async_block_till_done()
    assert len(events) == 2 and len(calls) == 2


async def test_no_notification_by_default(hass, setup, hass_ws_client, freezer):
    calls = async_mock_service(hass, "notify", "test_kitchen_phone")
    events = async_capture_events(hass, EVENT_TIMER_DONE)
    ws = await hass_ws_client(hass)
    await _start(ws, seconds=5)
    freezer.tick(timedelta(seconds=6))
    async_fire_time_changed(hass)
    await hass.async_block_till_done()
    assert len(events) == 1 and calls == []


async def test_timers_survive_restart_and_fire_after_downtime(hass, setup, hass_ws_client, freezer):
    events = async_capture_events(hass, EVENT_TIMER_DONE)
    ws = await hass_ws_client(hass)
    running = await _start(ws, seconds=600, step_index=1, label="Knedlíky")
    short = await _start(ws, seconds=30, step_index=4, label="Omáčka")

    await rws.async_close_store(hass)  # "HA stops": callbacks cancelled, DB closed
    freezer.tick(timedelta(seconds=120))  # the short timer expires while HA is down
    await rws.async_restore_timers(hass)
    await hass.async_block_till_done()

    assert [e.data["timer_id"] for e in events] == [short["id"]]
    ws2 = await hass_ws_client(hass)
    await _call(ws2, type="homebrain/recipes/timers/subscribe")
    snap = (await ws2.receive_json())["event"]
    assert {t["id"] for t in snap["timers"]} == {running["id"], short["id"]}
    restored = next(t for t in snap["timers"] if t["id"] == running["id"])
    assert restored["endsAt"] == running["endsAt"]

    freezer.tick(timedelta(seconds=481))
    async_fire_time_changed(hass)
    await hass.async_block_till_done()
    assert [e.data["timer_id"] for e in events] == [short["id"], running["id"]]

    # A second restart does not fire anything again.
    await rws.async_close_store(hass)
    await rws.async_restore_timers(hass)
    await hass.async_block_till_done()
    assert len(events) == 2


async def test_invalid_input_rejected(hass, setup, hass_ws_client):
    ws = await hass_ws_client(hass)
    bad = await _call(
        ws, type="homebrain/recipes/settings_set", timer_notify_targets=["notify.Bad Target"]
    )
    assert bad["error"]["code"] == "INVALID_FIELD"
    zero = await _call(ws, type="homebrain/recipes/timers/start", label="x", seconds=0)
    assert not zero["success"]


async def test_restore_without_db_creates_nothing(hass, setup, tmp_path):
    await rws.async_close_store(hass)
    await rws.async_restore_timers(hass)
    assert not (tmp_path / "homebrain" / "recipes.db").exists()
    assert "recipes_timers" not in hass.data[DOMAIN]
