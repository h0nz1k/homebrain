"""Roboti cleaning history: dwell per room, source, unavailable robot, restart, backfill, WS."""

from datetime import datetime, timedelta

import pytest
from freezegun.api import FrozenDateTimeFactory
from homeassistant.core import HomeAssistant, State
from homeassistant.setup import async_setup_component
from homeassistant.util import dt as dt_util
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.homebrain.const import DOMAIN
from custom_components.homebrain.robots.history import (
    STORAGE_KEY,
    Observation,
    RobotHistory,
    RunTracker,
    last_cleaned,
    merge_record,
    prune,
    replay,
    resolve_rooms,
    run_flag,
)

T0 = datetime(2026, 11, 4, 8, 0, tzinfo=dt_util.UTC)
BINDINGS = {
    "robot1_vacuum": "vacuum.robot_a",
    "robot1_current_room": "sensor.robot_a_room",
}
MAPS = [
    {
        "flag": 0,
        "name": "Přízemí",
        "rooms": [{"id": 16, "name": "Kuchyně"}, {"id": 17, "name": "Chodba"}],
    },
    {"flag": 1, "name": "Patro", "rooms": [{"id": 20, "name": "Ložnice"}]},
]


def obs(minutes: float, running, room=None, moving=True, **kw) -> Observation:
    return Observation(
        at=T0 + timedelta(minutes=minutes), running=running, moving=moving, room=room, **kw
    )


# --- pure tracker -----------------------------------------------------------------------


def test_app_started_run_counts_rooms_and_ignores_pass_through():
    tracker = RunTracker(1)
    assert tracker.observe(obs(0, True, "Chodba")) is None
    tracker.observe(obs(0.5, True, "Kuchyně"))  # 30 s in the hallway: passing through
    tracker.observe(obs(12, True, "Chodba"))
    tracker.observe(obs(12.6, True, "Obývací pokoj"))  # 36 s hallway again (sum 66 s)
    record = tracker.observe(obs(30, False, None, area=24.5, duration=1800))
    assert record is not None
    assert record["source"] == "aplikace"
    assert record["area_m2"] == 24.5 and record["duration_s"] == 1800
    names = {room["name"]: room["dwell_s"] for room in record["rooms"]}
    assert names == {"Kuchyně": 690, "Obývací pokoj": 1044, "Chodba": 66}
    assert record["rooms"][0]["name"] == "Obývací pokoj"  # longest first


def test_pass_through_room_below_one_minute_is_not_cleaned():
    tracker = RunTracker(1)
    tracker.observe(obs(0, True, "Kuchyně"))
    tracker.observe(obs(10, True, "Chodba"))
    tracker.observe(obs(10.5, True, "Koupelna"))
    record = tracker.observe(obs(20, False))
    assert [room["name"] for room in record["rooms"]] == ["Kuchyně", "Koupelna"]


def test_homebrain_started_run_within_two_minutes():
    tracker = RunTracker(1)
    tracker.note_command(T0 - timedelta(seconds=40))
    tracker.observe(obs(0, True, "Kuchyně"))
    assert tracker.observe(obs(5, False))["source"] == "homebrain"
    # A command long before the run does not count.
    tracker.note_command(T0)
    tracker.observe(obs(10, True, "Kuchyně"))
    assert tracker.observe(obs(15, False))["source"] == "aplikace"


def test_paused_and_docked_time_is_not_dwell():
    tracker = RunTracker(1)
    tracker.observe(obs(0, True, "Kuchyně"))
    tracker.observe(obs(2, True, "Kuchyně", moving=False))  # paused 10 min
    tracker.observe(obs(12, True, "Kuchyně"))
    record = tracker.observe(obs(13, False))
    assert record["rooms"] == [{"id": None, "name": "Kuchyně", "dwell_s": 180}]


def test_robot_unavailable_mid_run_keeps_the_run():
    tracker = RunTracker(1)
    tracker.observe(obs(0, True, "Kuchyně"))
    tracker.observe(obs(5, None))  # cloud hiccup: unavailable for 20 min
    assert tracker.running
    tracker.observe(obs(25, True, "Chodba"))
    record = tracker.observe(obs(27, False))
    assert record["start"] == T0.isoformat()
    assert {r["name"]: r["dwell_s"] for r in record["rooms"]} == {"Kuchyně": 300, "Chodba": 120}


def test_short_accidental_run_is_dropped():
    tracker = RunTracker(1)
    tracker.observe(obs(0, True, None))
    assert tracker.observe(obs(0.5, False)) is None


def test_restart_mid_run_continues_or_closes():
    tracker = RunTracker(1)
    tracker.observe(obs(0, True, "Kuchyně"))
    tracker.observe(obs(5, True, "Kuchyně"))
    stored = tracker.active.to_dict()

    # HA back while the robot still cleans: run continues, downtime is not dwell.
    from custom_components.homebrain.robots.history import ActiveRun

    again = RunTracker(1)
    again.active = ActiveRun.from_dict(stored)
    assert again.resume(obs(20, True, "Chodba"), None) is None
    record = again.observe(obs(22, False))
    assert {r["name"]: r["dwell_s"] for r in record["rooms"]} == {"Kuchyně": 300, "Chodba": 120}

    # HA back after the run ended: closed at the robot's own end time.
    done = RunTracker(1)
    done.active = ActiveRun.from_dict(stored)
    record = done.resume(obs(60, False), T0 + timedelta(minutes=9))
    assert record["end"] == (T0 + timedelta(minutes=9)).isoformat()
    assert not done.running


def test_run_flag_sources():
    assert run_flag("docked", "on", False) is True
    assert run_flag("cleaning", "off", True) is False
    assert run_flag("cleaning", "unavailable", False) is None
    assert run_flag("cleaning", None, False) is True
    assert run_flag("returning", None, True) is True
    assert run_flag("returning", None, False) is False
    assert run_flag("docked", None, True) is False
    assert run_flag("unavailable", None, True) is None


def test_records_merge_prune_and_last_cleaned():
    runs: list[dict] = []
    tracker = RunTracker(1)
    tracker.observe(obs(0, True, "Kuchyně"))
    runs.append(tracker.observe(obs(10, False)))
    # Official record of the same run fixes its times; an unseen one becomes partial.
    assert merge_record(runs, T0 - timedelta(seconds=30), T0 + timedelta(minutes=11), 1, T0)
    assert runs[0]["official"] and runs[0]["start"] == (T0 - timedelta(seconds=30)).isoformat()
    assert not merge_record(runs, T0 - timedelta(seconds=30), T0 + timedelta(minutes=11), 1, T0)
    assert merge_record(runs, T0 - timedelta(days=1), T0 - timedelta(days=1, minutes=-20), 1, T0)
    assert runs[0]["partial"] and runs[0]["rooms"] == []
    old = {**runs[1], "start": "2026-01-01T00:00:00+00:00", "end": "2026-01-01T01:00:00+00:00"}
    assert len(prune([old, *runs], T0)) == 2
    resolve_rooms(runs[1], MAPS, "Přízemí")
    assert runs[1]["rooms"][0]["id"] == 16
    assert last_cleaned(runs) == [{"id": 16, "name": "Kuchyně", "at": runs[1]["end"]}]


def test_resolve_rooms_on_another_floor_and_unknown():
    run = {
        "map": "Patro",
        "rooms": [{"id": None, "name": "Ložnice"}, {"id": None, "name": "Sklep"}],
    }
    resolve_rooms(run, MAPS, "Přízemí")
    assert [room["id"] for room in run["rooms"]] == [20, None]
    assert last_cleaned([{**run, "end": "x"}])[1]["name"] == "Sklep"


def test_replay_from_recorder_states():
    def st(entity, value, minutes):
        at = T0 + timedelta(minutes=minutes)
        return State(entity, value, last_changed=at, last_updated=at)

    roles = {"vacuum": "vacuum.robot_a", "current_room": "sensor.robot_a_room"}
    history = {
        "vacuum.robot_a": [
            st("vacuum.robot_a", "docked", -60),
            st("vacuum.robot_a", "cleaning", 0),
            st("vacuum.robot_a", "returning", 20),
            st("vacuum.robot_a", "docked", 22),
        ],
        "sensor.robot_a_room": [
            st("sensor.robot_a_room", "Kuchyně", 1),
            st("sensor.robot_a_room", "Chodba", 15),
        ],
    }
    runs = replay(1, history, roles, T0 + timedelta(hours=1))
    assert len(runs) == 1
    assert runs[0]["source"] is None
    assert {r["name"]: r["dwell_s"] for r in runs[0]["rooms"]} == {"Kuchyně": 840, "Chodba": 300}


# --- HA wrapper -------------------------------------------------------------------------


@pytest.fixture
async def history(hass: HomeAssistant, freezer: FrozenDateTimeFactory):
    freezer.move_to(T0)
    hass.states.async_set("vacuum.robot_a", "docked")
    hass.states.async_set("sensor.robot_a_room", "Kuchyně")
    rooms = {"maps": MAPS, "error": None}
    manager = RobotHistory(hass, lambda: BINDINGS, lambda vacuum: rooms)
    await manager.async_start()
    yield manager
    await manager.async_stop()


def _step(hass, freezer, minutes, **states):
    freezer.move_to(T0 + timedelta(minutes=minutes))
    for entity, value in states.items():
        hass.states.async_set(entity.replace("__", "."), value)


async def test_live_run_from_states_with_homebrain_source(hass, freezer, history):
    seen: list[dict] = []
    history.subscribe(seen.append)
    history.mark(1, T0 + timedelta(minutes=1))
    _step(hass, freezer, 1.5, vacuum__robot_a="cleaning")
    _step(hass, freezer, 2, sensor__robot_a_room="Chodba")
    _step(hass, freezer, 2.5, sensor__robot_a_room="Kuchyně")
    _step(hass, freezer, 20, vacuum__robot_a="returning")
    _step(hass, freezer, 21, vacuum__robot_a="docked")
    await hass.async_block_till_done()
    payload = history.payload()["robots"]["1"]
    assert seen == [{"slot": 1}]
    run = payload["runs"][0]
    assert run["source"] == "homebrain"
    assert run["rooms"] == [{"id": 16, "name": "Kuchyně", "dwell_s": 1080}]
    assert payload["last_cleaned"] == [{"id": 16, "name": "Kuchyně", "at": run["end"]}]


async def test_restart_mid_run_resumes_from_store(hass, freezer, hass_storage):
    freezer.move_to(T0)
    hass.states.async_set("vacuum.robot_a", "cleaning")
    hass.states.async_set("sensor.robot_a_room", "Kuchyně")
    first = RobotHistory(hass, lambda: BINDINGS)
    await first.async_start()
    _step(hass, freezer, 5, sensor__robot_a_room="Chodba")
    await first.async_stop()  # HA stops mid-run
    assert hass_storage[STORAGE_KEY]["data"]["active"]["1"]["dwell"] == {"Kuchyně": 300.0}

    _step(hass, freezer, 15)
    second = RobotHistory(hass, lambda: BINDINGS)
    await second.async_start()
    _step(hass, freezer, 18, vacuum__robot_a="docked")
    await hass.async_block_till_done()
    run = second.payload()["robots"]["1"]["runs"][0]
    assert run["start"] == T0.isoformat()
    assert {r["name"]: r["dwell_s"] for r in run["rooms"]} == {"Kuchyně": 300, "Chodba": 180}
    await second.async_stop()


async def test_ws_history_and_mark(hass, hass_ws_client):
    entry = MockConfigEntry(domain=DOMAIN, options={"bindings": {"robots": BINDINGS}})
    entry.add_to_hass(hass)
    hass.states.async_set("vacuum.robot_a", "docked")
    assert await async_setup_component(hass, DOMAIN, {})
    await hass.async_block_till_done()
    manager = hass.data[DOMAIN]["robot_history"]
    client = await hass_ws_client(hass)
    await client.send_json_auto_id({"type": "homebrain/robots/history/mark", "slot": 1})
    assert (await client.receive_json())["success"]
    await client.send_json_auto_id({"type": "homebrain/robots/history"})
    msg = await client.receive_json()
    assert msg["success"]
    assert msg["result"]["robots"]["1"] == {"last_cleaned": [], "runs": [], "active": None}
    assert manager._trackers[1].mark is not None
    await client.send_json_auto_id({"type": "homebrain/robots/history/subscribe"})
    assert (await client.receive_json())["success"]
