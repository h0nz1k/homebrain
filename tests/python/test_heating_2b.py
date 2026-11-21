"""Topení 2b: weekly programs (PLC clock offset + DST), duration programs, clock drift,
compressor short cycling, daily solar summary, new optional keys (all synthetic)."""

from __future__ import annotations

from datetime import UTC, date, datetime, timedelta
from zoneinfo import ZoneInfo

import pytest

from custom_components.homebrain.heating.alerts import (
    AlertState,
    EvalContext,
    evaluate_alerts,
    plan_notifications,
)
from custom_components.homebrain.heating.mapfile import parse_map
from custom_components.homebrain.heating.model import (
    DayCounters,
    Resolved,
    build_payload,
    cycling_summary,
    cycling_verdict,
    resolve,
)
from custom_components.homebrain.heating.programs import (
    clock_info,
    local_week,
    minutes_of,
    parse_slot,
)

PRAGUE = ZoneInfo("Europe/Prague")

MAP_2B = """
version: 1
plc_utc_offset_minutes: 60
keys:
  heat_pump.compressor_on: {page: 40, var: Y9001.0}
  plc.clock_hour: {page: 41, var: S9008}
  plc.clock_minute: {page: 41, var: S9007}
  extras.pool_temp: {page: 42, var: X9010}
  extras.pool_filter_enabled: {page: 42, var: R9011.0}
  extras.pool_filter_program_active: {page: 42, var: R9012.0}
  extras.pool_target: {page: 42, var: R9013}
schedules:
  - key: setback
    label: Útlum
    page: 41
    slots: [[R9100, R9101], [R9102, R9103]]
  - key: pool_filter
    label: Filtrace bazénu
    page: 42
    format: start_duration
    slots: [[R9200, R9201], [R9202, R9203]]
    days:
      7: [[R9210, R9211]]
"""


def _pages() -> dict[int, dict[str, str]]:
    return {
        40: {"__Y9001.0_BOOL_i": "1"},
        41: {
            "__S9008_USINT_u": "9",
            "__S9007_USINT_u": "33",
            "__R9100_TIME_Thh:mm": "04:00",
            "__R9101_TIME_Thh:mm": "19:00",
            "__R9102_TIME_Thh:mm": "23:30",
            "__R9103_TIME_Thh:mm": "00:30",
        },
        42: {
            "__X9010_REAL_05.1f": "025.0",
            "__R9011.0_BOOL_i": "1",
            "__R9012.0_BOOL_i": "0",
            "__R9013_REAL_.0f": "28",
            "__R9200_TIME_Thh:mm": "11:00",
            "__R9201_TIME_Thh:mm": "01:30",
            "__R9202_TIME_Thh:mm": "18:00",
            "__R9203_TIME_Thh:mm": "00:00",  # run time 0 = slot off
            "__R9210_TIME_Thh:mm": "22:00",
            "__R9211_TIME_Thh:mm": "03:00",  # past midnight
        },
    }


# --- parsers ------------------------------------------------------------------------


def test_minutes_of_and_parse_slot_formats():
    assert minutes_of("05:30") == 330
    assert minutes_of("24:00") == 1440
    assert minutes_of("24:01") is None
    assert minutes_of("7:65") is None
    assert minutes_of(None) is None
    # start / end
    assert parse_slot("04:00", "19:00", "start_end") == (240, 900)
    assert parse_slot("22:00", "04:00", "start_end") == (1320, 360)  # past midnight
    assert parse_slot("00:00", "00:00", "start_end") is None
    assert parse_slot("00:00", "24:00", "start_end") == (0, 1440)
    # start + duration
    assert parse_slot("11:00", "01:30", "start_duration") == (660, 90)
    assert parse_slot("11:00", "00:00", "start_duration") is None
    assert parse_slot("bad", "01:00", "start_duration") is None


def test_map_offset_and_format_options():
    hmap = parse_map(MAP_2B)
    assert hmap.plc_utc_offset_minutes == 60
    assert [s.format for s in hmap.schedules] == ["start_end", "start_duration"]
    assert parse_map("keys: {}\n").plc_utc_offset_minutes == 60  # default
    bad = parse_map(
        "plc_utc_offset_minutes: lots\nschedules:\n"
        "  - {key: x, page: 1, format: weird, slots: [[R1, R2]]}\n"
    )
    assert bad.plc_utc_offset_minutes == 60
    assert bad.schedules == []
    assert any("plc_utc_offset_minutes" in w for w in bad.warnings)
    assert any("format" in w for w in bad.warnings)


# --- weekly program + PLC offset / DST ----------------------------------------------


def test_local_week_winter_time_equals_plc_time():
    week = local_week(
        {d: [(240, 900)] for d in range(1, 8)},
        today=date(2026, 1, 14),
        tz=PRAGUE,
        offset_minutes=60,
    )
    assert [d["day"] for d in week] == [1, 2, 3, 4, 5, 6, 7]
    assert week[0]["slots"] == [
        {"start": "04:00", "end": "19:00", "minutes": 900, "plc_start": "04:00", "plc_end": "19:00"}
    ]


def test_local_week_summer_time_shifts_one_hour_and_crosses_midnight():
    # PLC Monday 23:30 (UTC+1) = local Tuesday 00:30 in summer time (UTC+2)
    week = local_week(
        {1: [(240, 900), (1410, 60)], 7: [(1410, 30)]},
        today=date(2026, 7, 15),
        tz=PRAGUE,
        offset_minutes=60,
    )
    assert [(s["start"], s["end"]) for s in week[0]["slots"]] == [
        ("00:30", "01:00"),  # Sunday's 23:30 slot wraps to Monday (weekly program)
        ("05:00", "20:00"),
    ]
    assert [(s["start"], s["end"], s["plc_start"]) for s in week[1]["slots"]] == [
        ("00:30", "01:30", "23:30")
    ]
    assert week[6]["slots"] == []


def test_local_week_dst_switch_day_by_day():
    # 2026-03-29 (Sunday) is the switch to summer time: Mon–Sat +0 h, Sunday +1 h
    week = local_week(
        {d: [(240, 900)] for d in range(1, 8)},
        today=date(2026, 3, 25),
        tz=PRAGUE,
        offset_minutes=60,
    )
    assert [d["slots"][0]["start"] for d in week] == ["04:00"] * 6 + ["05:00"]


def test_local_week_respects_other_offsets():
    # a PLC kept on UTC (offset 0) seen from Prague in winter: +1 h
    week = local_week({3: [(600, 60)]}, today=date(2026, 1, 14), tz=PRAGUE, offset_minutes=0)
    assert week[2]["slots"][0]["start"] == "11:00"


def test_resolve_weekly_and_duration_programs_into_payload():
    hmap = parse_map(MAP_2B)
    read_at = datetime(2026, 7, 15, 8, 30, 40, tzinfo=UTC)  # 09:30 PLC time
    res = resolve(hmap, _pages(), weekday=3, page_times={41: read_at})
    now = datetime(2026, 7, 15, 8, 31, tzinfo=UTC)
    payload = build_payload(
        res, DayCounters(), source="ok", updated_at=now, now=now, stale=False, tz=PRAGUE
    )
    setback, pool = payload["schedules"]
    assert setback["format"] == "start_end"
    assert setback["slots"] == [["04:00", "19:00"], ["23:30", "00:30"]]  # PLC time (change log)
    assert [(s["start"], s["end"]) for s in setback["week"][2]["slots"]] == [
        ("00:30", "01:30"),
        ("05:00", "20:00"),
    ]
    assert pool["format"] == "start_duration"
    assert pool["slots"] == [["11:00", "12:30"]]  # run time 00:00 slot skipped
    assert [(s["start"], s["minutes"]) for s in pool["week"][0]["slots"]] == [("12:00", 90)]
    # Sunday has its own row: 22:00 PLC + 3 h = local 23:00–02:00
    assert [(s["start"], s["end"], s["minutes"]) for s in pool["week"][6]["slots"]] == [
        ("23:00", "02:00", 180)
    ]
    clock = payload["clock"]
    assert clock == {
        "plc_utc_offset_minutes": 60,
        "local_shift_min": 60,
        "plc_time": "09:33",
        "drift_min": 3,  # 09:33 on the PLC vs 09:30 PLC time when the page was read
    }


def test_clock_drift_minutes_and_wrap():
    now = datetime(2026, 1, 10, 22, 59, 10, tzinfo=UTC)  # 23:59 PLC time
    info = clock_info(offset_minutes=60, tz=PRAGUE, now=now, hour=0, minute=2, read_at=now)
    assert info["plc_time"] == "00:02"
    assert info["drift_min"] == 3  # fast across midnight
    assert info["local_shift_min"] == 0  # winter
    slow = clock_info(offset_minutes=60, tz=PRAGUE, now=now, hour=23, minute=58, read_at=now)
    assert slow["drift_min"] == -1
    # clock not mapped / page time unknown
    assert clock_info(offset_minutes=60, tz=PRAGUE, now=now)["plc_time"] is None
    nodrift = clock_info(offset_minutes=60, tz=PRAGUE, now=now, hour=1, minute=2)
    assert (nodrift["plc_time"], nodrift["drift_min"]) == ("01:02", None)
    assert clock_info(offset_minutes=60, tz=PRAGUE, now=now, hour=25, minute=0)["plc_time"] is None


# --- short cycling ------------------------------------------------------------------


@pytest.mark.parametrize(
    ("starts", "avg", "expected"),
    [
        (None, None, None),
        (5, 4.0, False),  # too few starts to judge the average
        (12, 6.0, True),
        (12, 9.0, False),
        (31, 20.0, True),
        (66, 6.0, True),  # archive reality (summer)
    ],
)
def test_cycling_verdict(starts, avg, expected):
    assert cycling_verdict(starts, avg) is expected


def _counters_with_runs(day: datetime, runs: int, run_min: int) -> DayCounters:
    c = DayCounters()
    t = day
    for _ in range(runs):
        c.update(t, False)
        t += timedelta(minutes=10)
        c.update(t, True)
        t += timedelta(minutes=run_min)
        c.update(t, False)
    return c


def test_cycling_summary_today_and_yesterday():
    res = Resolved(mapped={"heat_pump.compressor_on"})
    c = _counters_with_runs(datetime(2026, 5, 3, 0, 5, tzinfo=UTC), 40, 6)
    summary = cycling_summary(res, c)
    assert summary["starts_today"] == 40
    assert summary["avg_run_min_today"] == pytest.approx(6.0)
    assert summary["short_cycling"] is True
    assert summary["starts_yesterday"] is None
    # next day: yesterday's totals stay visible
    c.update(datetime(2026, 5, 4, 0, 1, tzinfo=UTC), False)
    nxt = cycling_summary(res, c)
    assert (nxt["starts_today"], nxt["starts_yesterday"]) == (0, 40)
    assert nxt["avg_run_min_yesterday"] == pytest.approx(6.0)
    assert nxt["short_cycling"] is True
    # two days later the old day is no longer "yesterday"
    c.update(datetime(2026, 5, 6, 0, 1, tzinfo=UTC), False)
    assert cycling_summary(res, c)["starts_yesterday"] is None
    # compressor not mapped → no summary at all
    assert cycling_summary(Resolved(), c) is None


def _ctx(now: datetime, cycling: dict | None) -> EvalContext:
    return EvalContext(
        now=now,
        values={},
        mapped=set(),
        activity="idle",
        source="ok",
        stale=False,
        updated_at=now,
        faults_active=[],
        project_changed=False,
        winter=None,
        cycling=cycling,
    )


def test_short_cycling_alert_is_info_debounced_and_never_pushed():
    t0 = datetime(2026, 5, 3, 12, 0, tzinfo=UTC)
    state = AlertState()
    state.poll_count = 10  # past the startup skip
    cyc = {
        "starts_today": 34,
        "avg_run_min_today": 6.2,
        "starts_yesterday": 51,
        "avg_run_min_yesterday": 5.8,
        "short_cycling": True,
    }
    assert evaluate_alerts(_ctx(t0, cyc), state) == []
    active = evaluate_alerts(_ctx(t0 + timedelta(minutes=16), cyc), state)
    assert [(a.id, a.severity) for a in active] == [("short_cycling", "info")]
    assert "Dnes 34 startů, průměrný běh 6 min" in active[0].body
    assert "včera 51 startů" in active[0].body
    plan = plan_notifications(
        state=state, prev_active={}, now_active=active, now=t0, startup_skip=False
    )
    assert plan.calls == []
    calm = dict(cyc, short_cycling=False)
    assert evaluate_alerts(_ctx(t0 + timedelta(minutes=20), calm), state) == []
    # unmapped compressor: no alert, no error
    assert evaluate_alerts(_ctx(t0 + timedelta(minutes=40), None), state) == []


def test_short_cycling_survives_old_eval_context_without_field():
    ctx = EvalContext(
        now=datetime(2026, 5, 3, tzinfo=UTC),
        values={},
        mapped=set(),
        activity="idle",
        source="ok",
        stale=False,
        updated_at=None,
        faults_active=[],
        project_changed=False,
        winter=None,
    )
    assert evaluate_alerts(ctx, AlertState()) == []


# --- daily solar summary ------------------------------------------------------------


def test_solar_day_pump_hours_max_and_stagnation():
    c = DayCounters()
    t = datetime(2026, 7, 1, 9, 0, tzinfo=UTC)
    samples = [
        (0, 40.0, True),
        (15, 60.0, True),
        (30, 75.0, True),  # 3 × 15 min pumping credited
        (45, 115.0, False),
        (60, 121.0, False),  # 15 min stagnation (≥ 110 °C, pump off)
        (75, 98.0, False),  # 15 min stagnation
        (90, 90.0, False),  # below 110: not credited
        (200, 95.0, True),  # gap > 20 min: not credited
    ]
    for minute, temp, pump in samples:
        c.update(t + timedelta(minutes=minute), False, solar_temp=temp, solar_pump=pump)
    assert c.solar_pump_s == pytest.approx(2700)
    assert c.solar_stagnation_s == pytest.approx(1800)
    assert c.solar_max == pytest.approx(121.0)
    res = Resolved(mapped={"extras.solar_temp", "extras.solar_pump"})
    res.values.update({"extras.solar_temp": 90.0, "extras.solar_pump": False})
    now = t + timedelta(minutes=200)
    solar = build_payload(res, c, source="ok", updated_at=now, now=now, stale=False)["extras"][
        "solar"
    ]
    assert solar["today"] == {"pump_h": 0.75, "max_temp": 121.0, "stagnation_min": 30}
    assert solar["yesterday"] is None
    # roll over: today restarts, yesterday keeps the totals; persisted round trip
    late = datetime(2026, 7, 1, 23, 50, tzinfo=UTC)
    c.update(late, False, solar_temp=12.0, solar_pump=False)
    c.update(late + timedelta(minutes=15), False, solar_temp=12.0, solar_pump=False)
    c2 = DayCounters.from_dict(c.as_dict())
    assert c2.prev["solar_pump_s"] == pytest.approx(2700)
    assert c2.solar_max == pytest.approx(12.0)
    solar2 = build_payload(res, c2, source="ok", updated_at=now, now=now, stale=False)["extras"][
        "solar"
    ]
    assert solar2["yesterday"] == {"pump_h": 0.75, "max_temp": 121.0, "stagnation_min": 30}
    assert solar2["today"]["pump_h"] == 0


def test_solar_summary_hides_what_is_not_mapped():
    c = DayCounters()
    t = datetime(2026, 7, 1, 9, 0, tzinfo=UTC)
    c.update(t, False, solar_temp=50.0)
    res = Resolved(mapped={"extras.solar_temp"})
    res.values["extras.solar_temp"] = 50.0
    solar = build_payload(res, c, source="ok", updated_at=t, now=t, stale=False)["extras"]["solar"]
    assert solar["today"] == {"pump_h": None, "max_temp": 50.0, "stagnation_min": None}


def test_legacy_counters_without_solar_fields_still_load():
    c = DayCounters.from_dict({"day": "2026-01-10", "runtime_s": 60.0, "starts": 2})
    assert (c.starts, c.solar_pump_s, c.solar_max, c.prev) == (2, 0.0, None, None)
    assert DayCounters.from_dict({"day": "2026-01-10", "starts": 1, "prev": "junk"}).prev is None


def test_compressor_runtime_unchanged_by_refactor():
    c = DayCounters()
    t = datetime(2026, 1, 10, 23, 50, tzinfo=UTC)
    c.update(t, False)
    c.update(t + timedelta(minutes=1), True)
    c.update(t + timedelta(minutes=16), True)  # crosses midnight: only 6 min credited today
    assert c.day == "2026-01-11"
    assert c.runtime_s == pytest.approx(360)
    assert c.prev["runtime_s"] == pytest.approx(540)
    assert c.prev["starts"] == 1


# --- missing keys -------------------------------------------------------------------


def test_new_fields_null_when_keys_unmapped():
    now = datetime(2026, 1, 10, 12, 0, tzinfo=UTC)
    payload = build_payload(
        Resolved(), DayCounters(), source="ok", updated_at=now, now=now, stale=False
    )
    assert payload["mode"]["winter_limit"] is None
    assert payload["mode"]["summer_limit"] is None
    assert payload["curve"]["constant_target"] is None
    assert payload["curve"]["min_water"] is None
    assert payload["curve"]["weather_comp"] is None
    assert payload["heat_pump"]["cycling"] is None
    assert payload["schedules"] == []
    assert payload["clock"]["plc_time"] is None
    assert payload["clock"]["drift_min"] is None
    assert payload["extras"] == {"solar": None, "pool": None, "fish": None}


def test_pool_settings_partial_mapping():
    hmap = parse_map(MAP_2B)
    res = resolve(hmap, _pages(), weekday=1)
    now = datetime(2026, 1, 12, 12, 0, tzinfo=UTC)
    pool = build_payload(res, DayCounters(), source="ok", updated_at=now, now=now, stale=False)[
        "extras"
    ]["pool"]
    assert pool["filter_enabled"] is True
    assert pool["filter_program_active"] is False
    assert pool["target"] == 28
    assert pool["heating_enabled"] is None  # not mapped
    assert pool["auto"] is None


def test_clock_keys_get_no_entity():
    from custom_components.homebrain.heating.keys import KEYS

    assert KEYS["plc.clock_hour"].kind == "clock"
    assert KEYS["mode.summer_limit"].kind == "num"
