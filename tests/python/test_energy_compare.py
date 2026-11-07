"""Energie period comparison: aggregation of hourly recorder statistics (synthetic data only)."""

import math
from datetime import UTC, datetime, timedelta
from zoneinfo import ZoneInfo

import pytest
from homeassistant.core import HomeAssistant
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.homebrain.const import DOMAIN
from custom_components.homebrain.energy.compare import (
    Tariff,
    compare_periods,
    parse_hdo_schedule,
    statistic_ids,
)

PRAGUE = ZoneInfo("Europe/Prague")


def local(*args: int) -> datetime:
    return datetime(*args, tzinfo=PRAGUE)


def hourly(start: datetime, end: datetime, kwh: float = 1.0) -> list[tuple[float, float]]:
    """One row per UTC hour in [start, end): (start timestamp, kWh)."""
    t = start.astimezone(UTC)
    out = []
    while t < end.astimezone(UTC):
        out.append((t.timestamp(), kwh))
        t += timedelta(hours=1)
    return out


def test_partial_month_compares_the_same_day_and_hour_range():
    now = local(2026, 11, 7, 14, 23)
    rows = {"house": hourly(local(2025, 1, 1), now)}
    res = compare_periods(rows, now, PRAGUE)
    assert res["partial"] == {"day": 7, "hour": 14, "days_in_month": 30}
    month = res["series"]["house"]["month"]
    # 1. 11. 00:00 – 7. 11. 14:00 = 6 × 24 + 14 complete hours, in every compared year/month
    assert month == {"current": 158.0, "last_year": 158.0, "previous": 158.0}
    ytd = res["series"]["house"]["ytd"]
    # 2026 and 2025 both: 1. 1. – 7. 11. 14:00 local, one DST hour lost and one gained → 7454 h
    assert ytd == {"current": 7454.0, "last_year": 7454.0}
    assert res["windows"]["month"]["last_year"][0] == "2025-11-01T00:00:00+01:00"
    assert res["windows"]["month"]["last_year"][1] == "2025-11-07T14:00:00+01:00"


def test_missing_history_is_none_never_zero():
    now = local(2026, 11, 7, 14, 23)
    # recorder only since mid-April 2026 (like a fresh install), import only since November
    rows = {
        "house": hourly(local(2026, 4, 15, 20), now),
        "import": hourly(local(2026, 11, 1, 16), now, 0.5),
    }
    res = compare_periods(rows, now, PRAGUE)
    house = res["series"]["house"]
    assert house["month"]["last_year"] is None
    assert house["ytd"] == {"current": None, "last_year": None}
    assert house["month"]["previous"] == 158.0
    assert house["monthly"]["last_year"] == [None] * 12
    # the first, partially recorded month is not a bar either
    assert house["monthly"]["this_year"][3] is None and house["monthly"]["this_year"][4] == 744.0
    assert house["monthly"]["this_year"][11] is None  # December has not started
    assert house["first"] == "2026-04-15T20:00:00+02:00"
    # data starting a few hours into the window still counts (first-day slack)
    assert res["series"]["import"]["month"]["current"] == pytest.approx(0.5 * 142)
    assert res["series"]["import"]["month"]["previous"] is None
    assert "export" not in res["series"]


def test_dst_months_and_end_of_month_clamp():
    now = local(2026, 3, 31, 12, 10)
    rows = {"house": hourly(local(2025, 1, 1), now)}
    res = compare_periods(rows, now, PRAGUE)
    month = res["series"]["house"]["month"]
    # March 1 – 31 12:00 with the spring-forward night (23 h day) in both years
    assert month["current"] == 30 * 24 + 12 - 1
    assert month["last_year"] == 30 * 24 + 12 - 1
    # day 31 does not exist in February → whole February
    assert month["previous"] == 28 * 24
    assert res["windows"]["month"]["previous"][1] == "2026-03-01T00:00:00+01:00"
    last = res["series"]["house"]["monthly"]["last_year"]
    assert last[2] == 743.0  # March 2025 (23 h day)
    assert last[9] == 745.0  # October 2025 (25 h day)
    assert last[1] == 672.0
    assert res["series"]["house"]["monthly"]["this_year"][2] == 731.0  # running month, partial


def test_cost_vt_nt_and_fixed_fee_only_where_import_exists():
    now = local(2026, 11, 7, 14, 23)
    rows = {"import": hourly(local(2025, 11, 1), now)}
    tariff = Tariff(vt=6.0, nt=4.0, fixed_monthly=300.0, schedule=[(0, 360)])
    res = compare_periods(rows, now, PRAGUE, tariff)
    cost = res["series"]["cost"]
    # November 2025: 30 days × (6 h NT × 4 + 18 h VT × 6) + full monthly fee
    assert cost["monthly"]["last_year"][10] == 30 * (6 * 4 + 18 * 6) + 300
    assert cost["monthly"]["last_year"][9] is None  # no import data in October 2025
    # 6 full days + 14 h of 7 November (6 NT + 8 VT) + fee for the elapsed share of the month
    energy = 6 * (6 * 4 + 18 * 6) + 6 * 4 + 8 * 6
    fee = 300 * (6 * 24 + 14) / (30 * 24)
    assert cost["month"]["current"] == pytest.approx(round(energy + fee))
    assert cost["month"]["last_year"] == cost["month"]["current"]
    assert cost["ytd"]["last_year"] is None
    assert res["cost_basis"] == {"vt": 6.0, "nt": 4.0, "fixed_monthly": 300.0, "hdo": True}


def test_no_tariff_no_cost():
    now = local(2026, 11, 7, 14, 23)
    rows = {"import": hourly(local(2025, 11, 1), now)}
    assert "cost" not in compare_periods(rows, now, PRAGUE)["series"]
    no_vt = Tariff(vt=None, nt=4.0, fixed_monthly=None, schedule=None)
    assert "cost" not in compare_periods(rows, now, PRAGUE, no_vt)["series"]


def test_hdo_schedule_and_statistic_ids():
    attrs = {"hdo_cas_od": ["22:00", "05:00"], "hdo_cas_do": ["02:00", "06:00"]}
    assert parse_hdo_schedule(attrs) == [(1320, 1440), (0, 120), (300, 360)]
    assert parse_hdo_schedule({"hdo_times_today_raw": [{"od": "13:00", "do": "23:59"}]}) == [
        (780, 1440)
    ]
    assert parse_hdo_schedule({}) is None
    assert statistic_ids(
        {"energy_house_energy_today": "sensor.demo_house", "energy_pv_energy_today": " "}
    ) == {"house": "sensor.demo_house"}


async def test_ws_without_bindings_or_recorder(hass: HomeAssistant, hass_ws_client):
    entry = MockConfigEntry(domain=DOMAIN, data={}, options={})
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    client = await hass_ws_client(hass)
    await client.send_json_auto_id({"type": "homebrain/energy/compare"})
    reply = await client.receive_json()
    assert reply["success"] and reply["result"]["status"] == "unconfigured"

    hass.config_entries.async_update_entry(
        entry,
        options={"bindings": {"energy": {"energy_house_energy_today": "sensor.demo_house"}}},
    )
    await client.send_json_auto_id({"type": "homebrain/energy/compare"})
    reply = await client.receive_json()
    assert reply["success"] and reply["result"]["status"] == "unsupported"


def realistic(start: datetime, end: datetime) -> list[tuple[float, float]]:
    """House-like hourly kWh: winter ~50 kWh/day, summer ~32, evening peak, weekday noise."""
    out = []
    t = start.astimezone(UTC)
    while t < end.astimezone(UTC):
        wall = t.astimezone(PRAGUE)
        doy = wall.timetuple().tm_yday
        day = 41 + 9 * math.cos(2 * math.pi * (doy - 15) / 365) + 3 * math.sin(doy * 1.7)
        shape = 0.6 + (0.9 if 17 <= wall.hour < 22 else 0.4 if 6 <= wall.hour < 9 else 0)
        out.append((t.timestamp(), round(day * shape / 22.2, 3)))
        t += timedelta(hours=1)
    return out


def test_card_values_equal_chart_months_on_real_shaped_data():
    now = local(2026, 11, 7, 16, 23)
    data = realistic(local(2025, 1, 1), now)
    res = compare_periods({"house": data}, now, PRAGUE)
    house = res["series"]["house"]

    def window(a: datetime, b: datetime) -> float:
        return round(sum(v for t, v in data if a.timestamp() <= t < b.timestamp()), 1)

    # the running-month card == the running-month bar
    assert house["month"]["current"] == house["monthly"]["this_year"][10]
    assert house["month"]["current"] == window(local(2026, 11, 1), local(2026, 11, 7, 16))
    # previous month = the same days and hours (1.–7. 10. do 16:00), not the whole October
    assert house["month"]["previous"] == window(local(2026, 10, 1), local(2026, 10, 7, 16))
    assert house["month"]["previous"] < house["monthly"]["this_year"][9] / 4
    assert house["month"]["last_year"] == window(local(2025, 11, 1), local(2025, 11, 7, 16))
    # YTD = the bars summed (bar rounding only)
    assert house["ytd"]["current"] == pytest.approx(sum(house["monthly"]["this_year"][:11]), abs=1)
    assert house["ytd"]["last_year"] == pytest.approx(
        sum(house["monthly"]["last_year"][:10]) + house["month"]["last_year"], abs=1
    )
    # plausible daily rate of a running November
    assert 30 < house["month"]["current"] / (6 + 16 / 24) < 60
