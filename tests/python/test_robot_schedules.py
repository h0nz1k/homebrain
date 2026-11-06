"""Roboti schedules: firing, quiet hours, retries + give-up, restart catch-up, pause, conflicts."""

from datetime import datetime, time, timedelta

import pytest
from homeassistant.core import HomeAssistant, ServiceCall
from homeassistant.setup import async_setup_component
from homeassistant.util import dt as dt_util
from pytest_homeassistant_custom_component.common import MockConfigEntry, async_fire_time_changed

from custom_components.homebrain.const import DOMAIN
from custom_components.homebrain.robots.presets import PresetStore
from custom_components.homebrain.robots.schedules import (
    STORAGE_KEY,
    RobotScheduler,
    ScheduleError,
    in_quiet,
    migrate_data,
    next_run,
)

BINDINGS = {
    "robot1_vacuum": "vacuum.robot_a",
    "robot1_battery": "sensor.robot_a_battery",
    "robot1_error": "sensor.robot_a_error",
    "robot2_vacuum": "vacuum.robot_b",
}
TZ = "Europe/Prague"


def at(text: str) -> datetime:
    """Local time on Wednesday 2026-11-04 (weekday 2) unless a full date is given."""
    value = text if "T" in text else f"2026-11-04T{text}"
    return datetime.fromisoformat(value).replace(tzinfo=dt_util.get_default_time_zone())


@pytest.fixture
async def env(hass: HomeAssistant):
    await hass.config.async_set_time_zone(TZ)
    assert await async_setup_component(hass, "persistent_notification", {})
    hass.states.async_set("vacuum.robot_a", "docked", {"fan_speed_list": ["quiet", "max"]})
    hass.states.async_set("sensor.robot_a_battery", "100")
    hass.states.async_set("sensor.robot_a_error", "none")
    hass.states.async_set("vacuum.robot_b", "docked", {"battery_level": 90})
    calls: list[ServiceCall] = []
    notes: list[ServiceCall] = []

    async def vacuum_handler(call: ServiceCall) -> None:
        calls.append(call)
        entities = call.data.get("entity_id", [])
        for entity in [entities] if isinstance(entities, str) else entities:
            state = hass.states.get(entity)
            hass.states.async_set(entity, "cleaning", state.attributes)

    async def notify_handler(call: ServiceCall) -> None:
        notes.append(call)

    for service in ("start", "send_command", "set_fan_speed"):
        hass.services.async_register("vacuum", service, vacuum_handler)
    hass.services.async_register("notify", "mobile_app_phone", notify_handler)
    options = {"robots_notify_service": "mobile_app_phone"}
    presets = PresetStore(hass)
    manager = RobotScheduler(hass, lambda: BINDINGS, lambda: options, presets)
    return manager, calls, notes, options


async def _schedule(manager, now, **kw):
    raw = {"name": "Chodba", "slot": 1, "days": [0, 1, 2, 3, 4, 5, 6], "time": "10:00", **kw}
    return await manager.async_save(raw, now)


def _notifications(hass) -> list[str]:
    return (
        [n["message"] for n in hass.data["persistent_notification"].values()]
        if isinstance(hass.data.get("persistent_notification"), dict)
        else []
    )


def test_quiet_hours_wrap_midnight():
    t = time
    assert in_quiet(t(23, 0), "22:00", "07:00") and in_quiet(t(6, 59), "22:00", "07:00")
    assert not in_quiet(t(7, 0), "22:00", "07:00") and not in_quiet(t(21, 59), "22:00", "07:00")
    assert in_quiet(t(13, 0), "12:00", "14:00") and not in_quiet(t(3, 0), "08:00", "08:00")


async def test_fires_at_time_once_and_logs(hass: HomeAssistant, env):
    manager, calls, notes, _ = env
    schedule = await _schedule(manager, at("08:00"), rooms=[16])
    await manager.async_tick(at("09:59"))
    assert calls == []
    await manager.async_tick(at("10:00"))
    assert [c.service for c in calls] == ["send_command"]
    assert calls[0].data["params"] == [{"segments": [16], "repeat": 1}]
    await manager.async_tick(at("10:01"))
    assert len(calls) == 1  # handled once per day
    overview = await manager.async_overview(at("10:02"))
    item = overview["schedules"][0]
    assert item["last_run"]["result"] == "started"
    assert item["next_run"] == at("2026-11-05T10:00").isoformat()
    # Robot back on the dock → run closed as ok, no notifications at all on success.
    hass.states.async_set("vacuum.robot_a", "docked", {})
    await manager.async_tick(at("10:40"))
    assert (await manager.async_overview(at("10:41")))["runs"][0]["result"] == "ok"
    assert notes == [] and schedule["preset_id"] is None


async def test_minute_tick_via_time_helper(hass: HomeAssistant, env, freezer):
    manager, calls, _, _ = env
    freezer.move_to(at("09:58").astimezone(dt_util.UTC))
    await _schedule(manager, at("09:58"))
    await manager.async_start()
    freezer.move_to(at("10:00").astimezone(dt_util.UTC))
    async_fire_time_changed(hass, at("10:00"))
    await hass.async_block_till_done()
    assert [c.service for c in calls] == ["start"]
    await manager.async_stop()


async def test_quiet_hours_block_save_and_skip(hass: HomeAssistant, env):
    manager, calls, _, _ = env
    with pytest.raises(ScheduleError) as err:
        await _schedule(manager, at("08:00"), time="23:00")
    assert err.value.code == "quiet_hours"
    await _schedule(manager, at("08:00"), time="21:00")
    await manager.async_set_quiet("20:00", "07:00")  # quiet hours moved over the schedule
    await manager.async_tick(at("21:00"))
    assert calls == []
    runs = (await manager.async_overview(at("21:01")))["runs"]
    assert runs[0]["result"] == "skipped" and runs[0]["reason"] == "quiet_hours"


async def test_not_ready_retries_every_30_min_then_gives_up(hass: HomeAssistant, env):
    manager, calls, notes, _ = env
    await _schedule(manager, at("08:00"), time="20:30")
    hass.states.async_set("sensor.robot_a_battery", "12")
    await manager.async_tick(at("20:30"))
    pending = (await manager.async_overview(at("20:31")))["schedules"][0]["pending"]
    assert pending["reason"] == "battery" and pending["attempts"] == 1
    assert pending["next_try"] == at("21:00").isoformat()
    await manager.async_tick(at("20:45"))  # not yet
    await manager.async_tick(at("21:00"))
    await manager.async_tick(at("21:30"))  # next retry would be 22:00 = quiet → give up
    assert calls == []
    overview = await manager.async_overview(at("21:31"))
    assert overview["schedules"][0]["pending"] is None
    assert overview["runs"][0]["result"] == "gave_up" and overview["runs"][0]["attempts"] == 3
    assert len(notes) == 1 and "baterie" in notes[0].data["message"]
    assert any("Chodba" in m for m in _notifications(hass)) or len(notes) == 1


async def test_retry_succeeds_when_robot_returns(hass: HomeAssistant, env):
    manager, calls, notes, _ = env
    await _schedule(manager, at("08:00"))
    hass.states.async_set("vacuum.robot_a", "cleaning", {})  # someone started it manually
    await manager.async_tick(at("10:00"))
    hass.states.async_set("vacuum.robot_a", "docked", {})
    await manager.async_tick(at("10:30"))
    assert [c.service for c in calls] == ["start"]
    assert notes == []
    assert (await manager.async_overview(at("10:31")))["runs"][0]["attempts"] == 2


async def test_failed_start_and_robot_error_notify(hass: HomeAssistant, env):
    manager, calls, notes, _ = env
    hass.services.async_remove("vacuum", "start")

    async def broken(call: ServiceCall) -> None:
        if "vacuum.robot_a" in call.data["entity_id"]:
            raise RuntimeError("cloud down")
        hass.states.async_set("vacuum.robot_b", "cleaning", {})

    hass.services.async_register("vacuum", "start", broken)
    await _schedule(manager, at("08:00"))
    await manager.async_tick(at("10:00"))
    assert (await manager.async_overview(at("10:01")))["runs"][0]["result"] == "failed"
    assert len(notes) == 1 and "nepodařilo" in notes[0].data["message"]
    # robot error during a scheduled run
    await _schedule(manager, at("10:05"), name="Kuchyň", slot=2, time="11:00")
    await manager.async_tick(at("11:00"))
    hass.states.async_set("vacuum.robot_b", "error", {})
    await manager.async_tick(at("11:05"))
    runs = (await manager.async_overview(at("11:06")))["runs"]
    assert runs[0]["result"] == "error" and len(notes) == 2


async def test_restart_recompute_and_missed_runs(hass: HomeAssistant, env, hass_storage):
    manager, calls, _, options = env
    await _schedule(manager, at("08:00"), time="09:00")
    await _schedule(manager, at("08:00"), name="Obývák", slot=2, time="20:00")
    await manager.async_stop()
    # HA was down 08:30–21:40: 09:00 is missed but same day + outside quiet hours → runs once.
    restarted = RobotScheduler(hass, lambda: BINDINGS, lambda: options, PresetStore(hass))
    await restarted.async_tick(at("21:40"))
    assert [c.service for c in calls] == ["start", "start"]
    # Down until 22:30 (quiet hours): the missed run is skipped, not started at night.
    calls.clear()
    hass.states.async_set("vacuum.robot_a", "docked", {})
    third = RobotScheduler(hass, lambda: BINDINGS, lambda: options, PresetStore(hass))
    await third.async_tick(at("2026-11-05T22:30"))
    assert calls == []
    runs = (await third.async_overview(at("2026-11-05T22:31")))["runs"]
    assert {r["reason"] for r in runs[:2]} == {"missed"}
    # next runs recomputed from the store
    overview = await third.async_overview(at("2026-11-05T22:31"))
    assert overview["schedules"][0]["next_run"] == at("2026-11-06T09:00").isoformat()
    assert STORAGE_KEY in hass_storage


async def test_saving_past_time_today_does_not_fire(hass: HomeAssistant, env):
    manager, calls, _, _ = env
    await _schedule(manager, at("12:00"), time="10:00")
    await manager.async_tick(at("12:01"))
    assert calls == []


async def test_global_and_schedule_pause(hass: HomeAssistant, env):
    manager, calls, notes, _ = env
    s = await _schedule(manager, at("08:00"))
    with pytest.raises(ScheduleError):
        await manager.async_pause("2026-11-01", at("08:00"))
    await manager.async_pause("2026-11-05", at("08:00"))
    await manager.async_tick(at("10:00"))
    await manager.async_tick(at("2026-11-05T10:00"))
    assert calls == [] and notes == []
    overview = await manager.async_overview(at("2026-11-05T11:00"))
    assert overview["runs"] == []  # paused days are consumed silently
    assert overview["schedules"][0]["next_run"] == at("2026-11-06T10:00").isoformat()
    await manager.async_pause(None, at("2026-11-05T11:00"))
    await manager.async_save({**s, "enabled": False}, at("2026-11-05T11:00"))
    await manager.async_tick(at("2026-11-06T10:00"))
    assert calls == []
    s2 = await manager.async_save(
        {**s, "enabled": True, "paused_until": "2026-11-07"}, at("2026-11-06T11:00")
    )
    assert next_run(
        s2, (await manager.async_data())["settings"], at("2026-11-06T11:00"), None
    ) == at("2026-11-08T10:00")


async def test_conflict_same_robot_waits_for_first_run(hass: HomeAssistant, env):
    manager, calls, notes, _ = env
    await _schedule(manager, at("08:00"), name="Chodba")
    await _schedule(manager, at("08:00"), name="Kuchyň", rooms=[17])
    await manager.async_tick(at("10:00"))
    assert len(calls) == 1  # second one is queued
    queued = [s["pending"] for s in (await manager.async_overview(at("10:00")))["schedules"]]
    assert any(p and p["reason"] == "queued" for p in queued)
    await manager.async_tick(at("10:20"))
    assert len(calls) == 1  # first run still cleaning
    hass.states.async_set("vacuum.robot_a", "docked", {})
    await manager.async_tick(at("10:45"))  # first closes as ok, second starts
    assert len(calls) == 2 and calls[1].service == "send_command"
    assert notes == []


async def test_run_now_and_migration(hass: HomeAssistant, env):
    manager, calls, _, _ = env
    s = await _schedule(manager, at("08:00"))
    hass.states.async_set("vacuum.robot_a", "returning", {})
    with pytest.raises(ScheduleError) as err:
        await manager.async_run_now(s["id"], at("08:01"))
    assert err.value.code == "not_ready"
    hass.states.async_set("vacuum.robot_a", "docked", {})
    result = await manager.async_run_now(s["id"], at("08:02"))
    assert result["started"] and result["run"]["manual"] and len(calls) == 1
    data = migrate_data(1, 0, {"schedules": [{"id": "zz"}, {**s}], "runs": [{"result": "x"}]})
    assert [x["id"] for x in data["schedules"]] == [s["id"]] and data["runs"] == []
    assert data["settings"]["quiet_start"] == "22:00"


async def test_ws_schedules_roundtrip(hass: HomeAssistant, hass_ws_client):
    await hass.config.async_set_time_zone(TZ)
    hass.states.async_set("vacuum.robot_a", "docked", {})
    hass.services.async_register("notify", "mobile_app_phone", lambda call: None)
    entry = MockConfigEntry(domain=DOMAIN, data={}, options={"bindings": {"robots": BINDINGS}})
    entry.add_to_hass(hass)
    assert await async_setup_component(hass, DOMAIN, {})
    await hass.async_block_till_done()
    client = await hass_ws_client(hass)

    async def ws(payload):
        await client.send_json_auto_id(payload)
        return await client.receive_json()

    msg = await ws(
        {
            "type": "homebrain/robots/schedules/save",
            "schedule": {"name": "Vytřít", "slot": 1, "days": [2], "time": "13:00"},
        }
    )
    assert msg["success"], msg
    sid = msg["result"]["schedule"]["id"]
    bad = await ws(
        {
            "type": "homebrain/robots/schedules/save",
            "schedule": {"name": "Noc", "slot": 1, "days": [2], "time": "23:30"},
        }
    )
    assert bad["error"]["code"] == "quiet_hours"
    unbound = await ws(
        {
            "type": "homebrain/robots/schedules/save",
            "schedule": {"name": "X", "slot": 3, "days": [2], "time": "13:00"},
        }
    )
    assert unbound["error"]["code"] == "not_found"
    msg = await ws(
        {"type": "homebrain/robots/schedules/settings", "notify_service": "mobile_app_phone"}
    )
    assert msg["result"]["notify_service"] == "mobile_app_phone"
    assert entry.options["robots_notify_service"] == "mobile_app_phone"
    msg = await ws({"type": "homebrain/robots/schedules/list"})
    assert msg["result"]["schedules"][0]["id"] == sid
    assert msg["result"]["available_notify_services"] == ["mobile_app_phone"]
    assert (await ws({"type": "homebrain/robots/schedules/pause", "until": "2099-01-01"}))["error"][
        "code"
    ] == "invalid_format"
    assert (await ws({"type": "homebrain/robots/schedules/delete", "schedule_id": sid}))["success"]


async def test_ws_non_admin_refused(hass: HomeAssistant, hass_ws_client, hass_admin_user):
    entry = MockConfigEntry(domain=DOMAIN, data={}, options={"bindings": {"robots": BINDINGS}})
    entry.add_to_hass(hass)
    assert await async_setup_component(hass, DOMAIN, {})
    await hass.async_block_till_done()
    hass_admin_user.groups = []
    hass.config_entries.async_update_entry(
        entry, options={**entry.options, "roles": {hass_admin_user.id: "adult"}}
    )
    client = await hass_ws_client(hass)
    await client.send_json_auto_id({"type": "homebrain/robots/schedules/list"})
    assert (await client.receive_json())["error"]["code"] == "unauthorized"


def test_next_run_skips_disabled():
    schedule = {
        "id": "abcdef012345",
        "days": [0],
        "time": "10:00",
        "enabled": False,
        "paused_until": None,
    }
    settings = {"quiet_start": "22:00", "quiet_end": "07:00", "paused_until": None}
    assert next_run(schedule, settings, datetime.now(dt_util.UTC), None) is None
    assert timedelta(minutes=30)


async def test_schedule_inline_max_plus_requires_vacuum(hass: HomeAssistant, env):
    manager, _, _, _ = env
    bad = {"mode": "both", "fan": "max_plus", "passes": 1}
    with pytest.raises(ScheduleError) as err:
        await _schedule(manager, at("08:00"), settings=bad)
    assert err.value.code == "max_plus_requires_vacuum"
    ok = await _schedule(manager, at("08:00"), settings={**bad, "mode": "vacuum"})
    assert ok["settings"]["fan"] == "max_plus"
