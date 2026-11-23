"""Synthetic Home Assistant statistics and runtime samples for Topení."""

from __future__ import annotations

from dataclasses import replace
from datetime import UTC, date, datetime, timedelta
from unittest.mock import AsyncMock, Mock, patch
from zoneinfo import ZoneInfo

import pytest
from homeassistant.components.sensor import SensorDeviceClass, SensorStateClass
from homeassistant.core import State
from homeassistant.helpers.restore_state import RestoredExtraData, RestoreEntity, StoredState

from custom_components.homebrain.heating import advisor as a
from custom_components.homebrain.heating.entities import HeatingRuntimeSensor
from custom_components.homebrain.heating.keys import RUNTIME_SOURCES, spec_of

DAY = date(2025, 1, 13)
TODAY = DAY + timedelta(days=7)
ZONE = ZoneInfo("Europe/Prague")


def hourly(day: date, hours: int = 24, **fields) -> list[dict]:
    start = datetime.combine(day, datetime.min.time(), ZONE).timestamp()
    return [{"start": start + i * 3600, **fields} for i in range(hours)]


def test_local_days_and_counter_completeness():
    outdoor, compressor, included = [], [], []
    for i, (out_hours, run_hours, change) in enumerate(
        [(24, 24, 12), (20, 20, 4), (19, 24, 1), (24, 19, 1), (24, 24, -12), (24, 24, 25)]
    ):
        day = DAY + timedelta(days=i)
        outdoor.extend(hourly(day, out_hours, mean=3))
        compressor.extend(hourly(day, run_hours, change=change / run_hours))
        if i < 2:
            included.append((day, 3, change))
    stats = a.group_hourly({a.OUTDOOR: outdoor, a.COMPRESSOR: compressor}, ZONE)
    rows = a.model_days(stats)
    assert [row[:2] for row in rows] == [row[:2] for row in included]
    assert [row[2] for row in rows] == pytest.approx([12, 4])


def test_regression_uses_heating_days_and_seasons():
    rows = [
        (date(2024 + i % 2, 12, 1), x, max(0, (14 - x) * 0.5)) for i, x in enumerate(range(-10, 19))
    ]
    options = a.AdvisorOptions()
    fit = a.fit_model(rows, options)
    assert fit["slope_h_per_k"] == pytest.approx(0.5)
    assert fit["balance_temp"] == pytest.approx(14)
    assert fit["r2"] == pytest.approx(1)
    assert fit["days"] == 24
    assert fit["confidence"] == "medium"
    assert fit["heat_loss_wk_low"] is None
    assert fit["design_loss_kw_high"] is None
    assert [row["season"] for row in fit["seasons"]] == ["2025/26", "2024/25"]
    assert all(row["slope_h_per_k"] == pytest.approx(0.5) for row in fit["seasons"])

    fit = a.fit_model(rows, replace(options, thermal_kw=9.6, design_temp=-11))
    assert fit["heat_loss_wk_low"] == pytest.approx(200)
    assert fit["heat_loss_wk_high"] == pytest.approx(200)
    assert fit["design_loss_kw_low"] == pytest.approx(5)
    assert fit["design_loss_kw_high"] == pytest.approx(5)


@pytest.mark.parametrize(
    ("count", "confidence"), [(19, "low"), (20, "medium"), (60, "medium"), (61, "high")]
)
def test_confidence_and_nonzero_slope_error(count, confidence):
    rows = [(DAY, x / 10, 13 - x / 10 + (-1) ** x) for x in range(count)]
    fit = a.fit_model(rows, a.AdvisorOptions(thermal_kw=8))
    assert fit["days"] == count
    assert fit["confidence"] == confidence
    mid = fit["slope_h_per_k"] * 8000 / 24
    assert fit["heat_loss_wk_low"] < mid < fit["heat_loss_wk_high"]
    assert fit["heat_loss_wk_high"] - mid == pytest.approx(mid - fit["heat_loss_wk_low"])


def test_many_days_still_need_a_good_fit_for_high_confidence():
    rows = [(DAY, x / 20, 10 - x / 40 + (-1) ** x * 3) for x in range(70)]
    fit = a.fit_model(rows, a.AdvisorOptions())
    assert fit["days"] == 70
    assert fit["r2"] < 0.2
    assert fit["confidence"] == "low"


def _curve_stats(count=7, circuit=3, cold_days=0, attic=21, outdoor=4.5, room=21.3):
    raw = {key: [] for key in (a.OUTDOOR, a.CIRCUIT, a.REF, a.TARGET, a.ATTIC, *a.CURVE_KEYS)}
    for i in range(count):
        day = DAY + timedelta(days=i)
        cold = i < cold_days
        for key, value in ((a.OUTDOOR, outdoor), (a.REF, room), (a.TARGET, 21), (a.ATTIC, attic)):
            raw[key].extend(hourly(day, mean=value, min=value, max=value))
        if cold:
            for row in raw[a.REF][-24:-17]:
                row["mean"] = 20.6
        raw[a.CIRCUIT].extend(hourly(day, change=circuit / 24))
        for j, (_, x, y) in enumerate(a.POINTS):
            for key, value in ((x, j * 10 - 15.5), (y, 40 - j * 2)):
                raw[key].extend(hourly(day, mean=value, min=value, max=value))
    return raw


@pytest.mark.parametrize(
    ("kwargs", "has_attic", "status", "used", "missing"),
    [
        ({}, True, "suggest_lower", 7, 0),
        ({"attic": 19}, True, "ok", 7, 0),
        ({"attic": 19}, False, "suggest_lower", 7, 0),
        ({"circuit": 21, "room": 21}, True, "ok", 7, 0),
        ({"circuit": 21, "room": 20.75}, True, "suggest_higher", 7, 0),
        ({"room": 20.94}, True, "ok", 7, 0),
        ({"room": 20.96}, True, "ok", 7, 0),
        ({"count": 5}, True, "ok", 5, 0),
        ({"cold_days": 3, "room": 21}, True, "suggest_higher", 7, 0),
        ({"circuit": 6}, True, "ok", 7, 0),
        ({"count": 6}, True, "suggest_lower", 6, 0),
        ({"count": 4}, True, "insufficient_data", 4, 1),
        ({"outdoor": 8}, True, "insufficient_data", 0, 5),
    ],
)
def test_curve_status(kwargs, has_attic, status, used, missing):
    stats = a.group_hourly(_curve_stats(**kwargs), ZONE)
    today = DAY + timedelta(days=kwargs.get("count", 7))
    result = a.assess_curve(
        a.curve_days(stats, has_attic=has_attic),
        a.curve_variation(stats),
        a.AdvisorOptions(),
        today,
    )
    assert (result["status"], result["days_used"], result["days_missing"]) == (
        status,
        used,
        missing,
    )
    if status.startswith("suggest_"):
        assert result["step_c"] == 1
        assert result["point"] == [{"id": "p3", "outdoor_c": 4.5}]
        assert "v bodě křivky p3 (venku +4,5\u00a0°C)" in result["text"]
    else:
        assert result["step_c"] is None


def test_curve_interpolation_uses_both_points_and_requires_overlapping_hours():
    raw = _curve_stats(outdoor=1.5)
    raw[a.REF] = raw[a.REF][4:]
    raw[a.TARGET] = raw[a.TARGET][:20] + raw[a.TARGET][24:]
    stats = a.group_hourly(raw, ZONE)
    result = a.assess_curve(a.curve_days(stats, has_attic=True), {}, a.AdvisorOptions(), TODAY)
    assert result["days_used"] == 6
    assert result["point"] == [{"id": "p2", "outdoor_c": -5.5}, {"id": "p3", "outdoor_c": 4.5}]


@pytest.mark.parametrize("within_hour", [True, False])
def test_recent_change_overrides_advice(within_hour):
    raw = _curve_stats()
    rows = raw["curve.p4_water"]
    if within_hour:
        rows[3 * 24 + 12]["max"] += 1
    else:
        for row in rows[3 * 24 :]:
            row.update(mean=47, min=47, max=47)
    stats = a.group_hourly(raw, ZONE)
    result = a.assess_curve(
        a.curve_days(stats, has_attic=True), a.curve_variation(stats), a.AdvisorOptions(), TODAY
    )
    assert result["status"] == "recent_change"
    assert result["days_missing"] == 4
    assert result["step_c"] is None


@pytest.mark.parametrize(("day", "hours"), [(date(2025, 3, 30), 23), (date(2025, 10, 26), 25)])
def test_statistics_accept_both_dst_day_lengths(day, hours):
    raw = {
        a.OUTDOOR: hourly(day, hours, mean=3),
        a.COMPRESSOR: hourly(day, hours, change=12 / hours),
    }
    assert a.model_days(a.group_hourly(raw, ZONE)) == [(day, 3, pytest.approx(12))]


def test_effective_target_and_recovery_prevent_false_deficits():
    raw = _curve_stats(circuit=21)
    raw[a.EFFECTIVE_TARGET] = [
        dict(row, mean=20.6 if i % 24 < 8 else 21) for i, row in enumerate(raw[a.TARGET])
    ]
    for i, row in enumerate(raw[a.REF]):
        row["mean"] = 20.6 if i % 24 < 11 else 21
    # One missing effective reading falls back to the nominal target.
    del raw[a.EFFECTIVE_TARGET][-1]
    days = a.curve_days(a.group_hourly(raw, ZONE), has_attic=True)
    assert all(day.cold_hours == 0 and day.ref == day.target for day in days.values())
    assert a.assess_curve(days, {}, a.AdvisorOptions(), TODAY)["status"] == "ok"


def test_lowering_compares_room_temperature_to_the_setback_target():
    raw = _curve_stats()
    raw[a.EFFECTIVE_TARGET] = [
        dict(row, mean=20.4 if i % 24 < 8 else 21) for i, row in enumerate(raw[a.TARGET])
    ]
    for i, row in enumerate(raw[a.REF]):
        if i % 24 < 11:
            row["mean"] = 20.7
    days = a.curve_days(a.group_hourly(raw, ZONE), has_attic=True)
    options = a.AdvisorOptions()
    assert a.assess_curve(days, {}, options, TODAY)["status"] == "suggest_lower"

    del raw[a.EFFECTIVE_TARGET]
    days = a.curve_days(a.group_hourly(raw, ZONE), has_attic=True)
    assert a.assess_curve(days, {}, options, TODAY)["status"] == "ok"


def test_curve_uses_hysteresis_and_reports_incomplete_attic():
    raw = _curve_stats(room=21.3)
    raw[a.HYSTERESIS] = [dict(row, mean=0.4) for row in raw[a.TARGET]]
    options = a.AdvisorOptions()
    days = a.curve_days(a.group_hourly(raw, ZONE), has_attic=True)
    assert a.assess_curve(days, {}, options, TODAY)["status"] == "ok"

    raw[a.ATTIC] = []
    missing = set()
    days = a.curve_days(a.group_hourly(raw, ZONE), has_attic=True, missing_attic=missing)
    result = a.assess_curve(days, {}, options, TODAY, missing)
    assert result["status"] == "insufficient_data"
    assert "pod 8 °C" in result["text"]
    assert "chybí údaje z čidla v podkroví" in result["text"]


def test_curve_does_not_mix_old_and_recent_days():
    raw = _curve_stats()
    for series in raw.values():
        for row in series[-72:]:
            row["start"] += timedelta(days=150).total_seconds()
    days = a.curve_days(a.group_hourly(raw, ZONE), has_attic=True)
    result = a.assess_curve(days, {}, a.AdvisorOptions(), TODAY + timedelta(days=150))
    assert result["status"] == "insufficient_data"
    assert result["days_used"] == 3
    assert "21 dní" in result["text"]


def test_recorder_reads_only_hourly_lts_and_ignores_today(hass):
    raw = _curve_stats(count=8)
    raw[a.COMPRESSOR] = [dict(row, change=0.25) for row in raw[a.CIRCUIT]]
    ids = {key: f"sensor.test_{key.replace('.', '_')}" for key in raw}
    now = datetime(2025, 1, 20, 9, tzinfo=ZONE)
    with (
        patch.object(a.dt_util, "get_default_time_zone", return_value=ZONE),
        patch(
            "homeassistant.components.recorder.statistics.statistics_during_period",
            side_effect=lambda hass, start, end, sids, *_: {
                sid: [
                    row for row in raw[key] if start.timestamp() <= row["start"] < end.timestamp()
                ]
                for key, sid in ids.items()
                if sid in sids
            },
        ) as read,
    ):
        result = a._read_advisor(hass, now, ids, a.AdvisorOptions(lookback_years=1))
    assert read.call_count == 2
    assert all(call.args[4] == "hour" for call in read.call_args_list)
    assert result["curve"]["days_used"] == 7
    assert result["curve"]["status"] == "suggest_lower"
    assert result["computed_at"] == now.isoformat()


@pytest.mark.parametrize("key", list(RUNTIME_SOURCES))
async def test_runtime_sensor_accumulates_resets_and_restores(hass, key):
    poller = Mock()
    poller.opts.interval = 60
    now = datetime(2025, 1, 13, 23, 58, tzinfo=UTC)
    spec = spec_of(key)
    assert spec is not None

    def entity() -> HeatingRuntimeSensor:
        sensor = HeatingRuntimeSensor(poller, key, spec)
        sensor.hass = hass
        sensor.async_write_ha_state = Mock()
        return sensor

    with (
        patch.object(a.dt_util, "now", side_effect=lambda: now),
        patch.object(a.dt_util, "utcnow", side_effect=lambda: now),
        patch.object(RestoreEntity, "_async_get_restored_data") as restored,
        patch("custom_components.homebrain.heating.entities.async_track_time_change") as timer,
    ):
        restored.return_value = None
        poller.runtime_sample.return_value = (now, True)
        sensor = entity()
        await sensor.async_added_to_hass()
        assert sensor.available
        assert sensor.device_class == SensorDeviceClass.DURATION
        assert sensor.state_class == SensorStateClass.TOTAL_INCREASING
        assert sensor.native_unit_of_measurement == "h"
        now += timedelta(minutes=1)
        poller.runtime_sample.return_value = (now, True)
        sensor._updated()
        assert sensor.native_value == pytest.approx(1 / 60, abs=1e-6)
        poller.runtime_sample.assert_called_with(RUNTIME_SOURCES[key])

        restored.return_value = StoredState(
            State(sensor.entity_id, "unavailable"),
            RestoredExtraData(sensor.extra_restore_state_data.as_dict()),
            now,
        )
        assert not sensor.extra_state_attributes
        poller.runtime_sample.return_value = None
        restarted = entity()
        await restarted.async_added_to_hass()
        assert restarted.native_value == sensor.native_value
        assert not restarted.available
        now += timedelta(minutes=1)
        timer.call_args.args[1](now)
        assert restarted.native_value == 0

        old_day = entity()
        await old_day.async_added_to_hass()
        assert old_day.native_value == 0
        poller.runtime_sample.return_value = (now, True)
        old_day._updated()
        now += timedelta(minutes=10)
        poller.runtime_sample.return_value = (now, False)
        old_day._updated()
        assert old_day.native_value == 0


async def test_advisor_refresh_without_recorder(hass):
    advisor = a.HeatingAdvisor(hass, a.AdvisorOptions(), [])
    await advisor._refresh(datetime.combine(TODAY, datetime.min.time(), ZONE))
    assert advisor.result["curve"]["status"] == "insufficient_data"


async def test_advisor_refresh_retries_once_and_skips_disabled_entities(hass):
    advisor = a.HeatingAdvisor(hass, a.AdvisorOptions(), [a.EFFECTIVE_TARGET, a.HYSTERESIS])
    now = datetime.combine(TODAY, datetime.min.time(), ZONE)
    hass.config.components.add("recorder")
    registry = Mock()
    registry.async_get_entity_id.side_effect = lambda _, __, uid: f"sensor.{uid}"
    registry.async_get.side_effect = lambda entity: Mock(
        disabled=entity in {"sensor.heating_outdoor_temp", "sensor.heating_house_hysteresis"}
    )
    job = AsyncMock(side_effect=[RuntimeError("test read"), RuntimeError("test retry")])
    with (
        patch.object(a.er, "async_get", return_value=registry),
        patch(
            "homeassistant.components.recorder.get_instance",
            return_value=Mock(async_add_executor_job=job),
        ),
        patch.object(a, "async_call_later") as later,
    ):
        await advisor._refresh(now)
        assert advisor.result is None
        assert later.call_args.args[1] == a.RETRY_DELAY
        ids = job.call_args.args[3]
        assert a.EFFECTIVE_TARGET in ids
        assert a.HYSTERESIS not in ids
        assert a.OUTDOOR not in ids
        later.call_args.args[2](now + a.RETRY_DELAY)
        await advisor._task
        assert job.await_count == 2
        later.assert_called_once()
        await advisor.stop()
