"""Issue #131 A: elevation override, MSL pressure, measured history from HA statistics.

All inputs are synthetic (no real coordinates, entity ids or station data).
"""

from datetime import UTC, date, datetime, timedelta
from zoneinfo import ZoneInfo

import pytest
from homeassistant.core import HomeAssistant
from homeassistant.util import dt as dt_util
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.homebrain.const import DOMAIN
from custom_components.homebrain.weather import history
from custom_components.homebrain.weather.derive import msl_pressure, resolve_pressure
from custom_components.homebrain.weather.providers import openmeteo
from custom_components.homebrain.weather.station import apply_pressure, read_station

PRAGUE = ZoneInfo("Europe/Prague")
KW = {"same_hpa": 0.5, "msl_min_hpa": 955, "min_elevation_m": 100}


# -- MSL pressure ---------------------------------------------------------------------------
@pytest.mark.parametrize(
    ("p", "h", "t", "expected"),
    [
        # ICAO standard atmosphere: p(h), T(h) reduce back to 1013.25 hPa.
        (970.28, 364, 15 - 0.0065 * 364, 1013.25),
        (898.75, 1000, 8.5, 1013.25),
        (954.61, 500, 11.75, 1013.25),
        # Sea level stays as it is.
        (1013.2, 0, 10.0, 1013.2),
    ],
)
def test_msl_matches_standard_atmosphere(p, h, t, expected):
    assert msl_pressure(p, h, t) == pytest.approx(expected, abs=0.15)


def test_msl_temperature_dependence_and_missing_inputs():
    warm = msl_pressure(947.0, 364, 25.0)
    cold = msl_pressure(947.0, 364, -10.0)
    assert 985 < warm < cold < 995  # colder column = denser = larger reduction
    assert msl_pressure(947.0, 364, 5.0) == pytest.approx(990.1, abs=0.1)
    assert msl_pressure(947.0, 364, None) == pytest.approx(msl_pressure(947.0, 364, 12.6), abs=0.1)
    assert msl_pressure(None, 364, 5.0) is None
    assert msl_pressure(947.0, None, 5.0) is None


def test_resolve_pressure_flags_relative_equal_to_absolute():
    info = resolve_pressure(947.0, 947.0, 364, 5.0, **KW)
    assert info["source"] == "derived" and info["relative_ignored"] is True
    assert info["msl"] == pytest.approx(990.1, abs=0.1)
    # Offset configured in the station: still derived from ABS, REL not flagged.
    info = resolve_pressure(989.0, 947.0, 364, 5.0, **KW)
    assert info["source"] == "derived" and info["relative_ignored"] is False


def test_resolve_pressure_relative_only():
    # REL 947 at 364 m is impossible as MSL -> it is the absolute pressure (offset 0).
    info = resolve_pressure(947.0, None, 364, 5.0, **KW)
    assert info["source"] == "relative_as_absolute" and info["relative_ignored"] is True
    assert info["msl"] == pytest.approx(990.1, abs=0.1)
    # A plausible MSL reading is used as is; without elevation nothing is reduced.
    assert resolve_pressure(1012.0, None, 364, 5.0, **KW)["source"] == "station"
    assert resolve_pressure(947.0, None, None, 5.0, **KW)["msl"] == 947.0
    # REL == ABS but unknown elevation: never invent -> no MSL at all.
    info = resolve_pressure(947.0, 947.0, None, 5.0, **KW)
    assert info["msl"] is None and info["relative_ignored"] is True


def test_apply_pressure_on_station_values(hass: HomeAssistant):
    bindings = {
        "weather_temperature": "sensor.demo_t",
        "weather_pressure": "sensor.demo_rel",
        "weather_pressure_absolute": "sensor.demo_abs",
    }
    hass.states.async_set("sensor.demo_t", "5.0", {"unit_of_measurement": "°C"})
    hass.states.async_set("sensor.demo_rel", "947.0", {"unit_of_measurement": "hPa"})
    hass.states.async_set("sensor.demo_abs", "947.0", {"unit_of_measurement": "hPa"})
    station = apply_pressure(read_station(hass, bindings, dt_util.utcnow()), 364)
    assert station["values"]["msl"]["v"] == pytest.approx(990.1, abs=0.1)
    assert "derived" in station["values"]["msl"]["qc"]
    assert station["values"]["p_rel"]["v"] == 947.0
    assert station["pressure"]["relative_ignored"] is True


# -- elevation ------------------------------------------------------------------------------
def test_openmeteo_urls_send_elevation_only_when_known():
    assert "elevation=364" in openmeteo.hourly_url(50, 15, 364)
    assert "elevation=364" in openmeteo.daily_url(50, 15, "UTC", 364.4)
    assert "elevation=364" in openmeteo.nowcast_url(50, 15, 364)
    assert "elevation" not in openmeteo.hourly_url(50, 15)


async def _manager(hass: HomeAssistant, options: dict, monkeypatch):
    monkeypatch.setattr("custom_components.homebrain.weather.AUTOSTART", False)
    entry = MockConfigEntry(domain=DOMAIN, data={}, options=options)
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    return hass.data[DOMAIN]["weather"]


async def test_elevation_option_fills_ha_zero(hass: HomeAssistant, monkeypatch):
    manager = await _manager(hass, {"weather": {"elevation_m": 364}}, monkeypatch)
    hass.config.elevation = 0
    assert manager.elevation == (364.0, "option")
    hass.config.elevation = 250
    assert manager.elevation == (250.0, "ha")
    hass.config.elevation = 0
    hass.config_entries.async_update_entry(manager.entry, options={"weather": {}})
    assert manager.elevation == (None, None)
    snap = manager.snapshot()
    assert snap["location"]["elevation_m"] is None
    assert snap["location"]["elevation_source"] is None


# -- history aggregation --------------------------------------------------------------------
def _ts(local: str) -> float:
    return datetime.fromisoformat(local).replace(tzinfo=PRAGUE).timestamp()


def _day_rows(day: str, hours: range, rain: dict[int, float] | None = None):
    rows: dict[str, list[dict]] = {"t2m": [], "rain": [], "gust": [], "p_abs": [], "rh": []}
    for h in hours:
        start = _ts(f"{day}T{h:02d}:00:00")
        t = 2.0 + h * 0.25
        rows["t2m"].append({"start": start, "mean": t, "min": t - 0.5, "max": t + 0.5})
        rows["rain"].append({"start": start, "change": (rain or {}).get(h, 0.0)})
        rows["gust"].append({"start": start, "max": 3.0 + h % 5})
        rows["p_abs"].append({"start": start, "mean": 947.0})
        rows["rh"].append({"start": start, "mean": 80.0})
    return rows


def _merge(*parts):
    out: dict[str, list[dict]] = {}
    for part in parts:
        for k, v in part.items():
            out.setdefault(k, []).extend(v)
    return out


BOUND = ("t2m", "rain", "gust", "p_abs", "rh")


def test_aggregate_days_full_partial_gap_and_leading_empty():
    rows = _merge(
        _day_rows("2026-11-16", range(24), {7: 1.2, 8: 3.0, 9: 0.4}),
        _day_rows("2026-11-17", range(0, 20)),  # 4 h missing at the end of the day
        _day_rows("2026-11-18", range(0, 10)),
    )
    hours = history.aggregate_hours(rows, 364)
    now = datetime(2026, 11, 18, 10, 40, tzinfo=PRAGUE)
    days = history.aggregate_days(hours, PRAGUE, date(2026, 11, 10), date(2026, 11, 18), now, BOUND)
    assert [d["date"] for d in days] == ["2026-11-16", "2026-11-17", "2026-11-18"]
    full, gap, today = days
    assert full["rain"] == 4.6 and full["gaps"] == [] and full["expected_hours"] == 24
    assert full["t_min"] == 1.5 and full["t_max"] == pytest.approx(8.25, abs=0.06)
    assert full["t_mean"] == pytest.approx(2.0 + 11.5 * 0.25, abs=0.05)
    assert full["gust_max"] == 7.0 and full["rh_mean"] == 80
    assert full["msl_mean"] == pytest.approx(msl_pressure(947.0, 364, 4.875), abs=0.3)
    assert full["hours"]["t2m"] == 24 and full["partial"] is False
    assert set(gap["gaps"]) == {"t2m", "rain", "gust", "msl", "rh"}
    assert gap["hours"]["rain"] == 20 and gap["rain"] == 0.0
    # Today: 10 complete hours, the 10:00 hour is not compiled yet -> no gap.
    assert today["partial"] is True and today["expected_hours"] == 10 and today["gaps"] == []


def test_aggregate_days_interior_empty_day_is_null_not_zero():
    rows = _merge(_day_rows("2026-11-14", range(24)), _day_rows("2026-11-16", range(24)))
    hours = history.aggregate_hours(rows, 364)
    now = datetime(2026, 11, 17, 12, 0, tzinfo=PRAGUE)
    days = history.aggregate_days(hours, PRAGUE, date(2026, 11, 14), date(2026, 11, 16), now, BOUND)
    empty = days[1]
    assert empty["date"] == "2026-11-15"
    assert empty["rain"] is None and empty["t_max"] is None and empty["msl_mean"] is None
    assert set(empty["gaps"]) == {"t2m", "rain", "gust", "msl", "rh"}


def test_dst_day_has_25_hours_and_bad_rain_is_dropped():
    rows = {"rain": [], "t2m": []}
    start = datetime(2026, 10, 25, 0, 0, tzinfo=PRAGUE).astimezone(UTC)
    for i in range(25):  # 25 UTC hours = local 25.10. (CEST -> CET)
        ts = (start + timedelta(hours=i)).timestamp()
        rows["rain"].append({"start": ts, "change": -5.0 if i == 3 else 0.5})
        rows["t2m"].append({"start": ts, "mean": 5.0, "min": 4.0, "max": 6.0})
    hours = history.aggregate_hours(rows, None)
    now = datetime(2026, 10, 27, 12, 0, tzinfo=PRAGUE)
    day = history.aggregate_days(
        hours, PRAGUE, date(2026, 10, 25), date(2026, 10, 25), now, ("rain", "t2m")
    )[0]
    assert day["expected_hours"] == 25 and day["hours"]["t2m"] == 25
    assert day["hours"]["rain"] == 24 and day["gaps"] == ["rain"]  # counter reset hour dropped
    assert day["rain"] == 12.0


def test_hour_records_and_rain_valid_hour_convention():
    rows = _day_rows("2026-11-16", range(2), {1: 0.6})
    hours = history.aggregate_hours(rows, 364)
    recs = history.hour_records(hours)
    assert recs[0]["t"] == "2026-11-15T23:00:00Z" and recs[1]["rain"] == 0.6
    # Station hour [00:00, 01:00) UTC (= local 01:00) pairs with the forecast valid at
    # 01:00 UTC (sum of the preceding hour, Open-Meteo convention).
    by_valid = history.rain_by_valid_hour(hours)
    assert by_valid["2026-11-16T01:00:00Z"] == 0.6 and by_valid["2026-11-16T00:00:00Z"] == 0.0


def test_statistic_ids_only_bound_keys():
    ids = history.statistic_ids(
        {"weather_temperature": "sensor.demo_t", "weather_rain_daily": "sensor.demo_rain"}
    )
    assert ids == {"t2m": "sensor.demo_t", "rain": "sensor.demo_rain"}


# -- WS -------------------------------------------------------------------------------------
async def test_history_ws(hass: HomeAssistant, hass_ws_client, monkeypatch, freezer):
    await hass.config.async_set_time_zone("Europe/Prague")
    calls = []

    async def fake_stats(_hass, ids, start, end):
        calls.append((dict(ids), start))
        return _merge(
            _day_rows("2026-11-17", range(24), {5: 2.0}), _day_rows("2026-11-18", range(10))
        )

    monkeypatch.setattr(history, "async_statistics", fake_stats)
    hass.config.components.add("recorder")
    manager = await _manager(
        hass,
        {
            "bindings": {
                "weather": {
                    "weather_temperature": "sensor.demo_t",
                    "weather_rain_daily": "sensor.demo_rain",
                    "weather_wind_gust": "sensor.demo_gust",
                    "weather_pressure_absolute": "sensor.demo_abs",
                    "weather_humidity": "sensor.demo_rh",
                }
            },
            "weather": {"elevation_m": 364},
        },
        monkeypatch,
    )
    hass.config.elevation = 0
    # Authenticate before freezing time, otherwise the access token is "issued in the future".
    client = await hass_ws_client(hass)
    freezer.move_to("2026-11-18T09:40:00+00:00")
    await client.send_json({"id": 1, "type": "homebrain/weather/history", "days": 2})
    msg = await client.receive_json()
    assert msg["success"], msg
    res = msg["result"]
    assert res["status"] == "ok" and res["elevation_source"] == "option"
    assert [d["date"] for d in res["days"]] == ["2026-11-17", "2026-11-18"]
    assert res["days"][0]["rain"] == 2.0 and res["days"][1]["partial"] is True
    assert calls[0][1] == datetime(2026, 11, 16, 23, 0, tzinfo=UTC)
    # Cached within the hour: no second recorder query.
    await client.send_json({"id": 2, "type": "homebrain/weather/history", "days": 2})
    assert (await client.receive_json())["success"] and len(calls) == 1
    await client.send_json(
        {"id": 3, "type": "homebrain/weather/history", "period": "hour", "days": 1}
    )
    msg = await client.receive_json()
    assert msg["success"] and msg["result"]["hours"][0]["t"].endswith("Z")
    await client.send_json(
        {"id": 4, "type": "homebrain/weather/history", "period": "hour", "days": 60}
    )
    assert (await client.receive_json())["error"]["code"] == "invalid_format"
    await client.send_json({"id": 5, "type": "homebrain/weather/history", "days": 401})
    assert (await client.receive_json())["success"] is False
    assert manager is hass.data[DOMAIN]["weather"]


async def test_history_ws_unconfigured(hass: HomeAssistant, hass_ws_client, monkeypatch):
    await _manager(hass, {}, monkeypatch)
    client = await hass_ws_client(hass)
    await client.send_json({"id": 1, "type": "homebrain/weather/history"})
    msg = await client.receive_json()
    assert msg["result"]["status"] == "unconfigured" and msg["result"]["days"] == []
