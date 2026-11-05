"""PV forecast fallback: Open-Meteo global tilted irradiance -> kW profile (synthetic JSON)."""

from datetime import UTC, datetime, timedelta
from zoneinfo import ZoneInfo

from homeassistant import data_entry_flow
from homeassistant.core import HomeAssistant
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.homebrain.const import DOMAIN
from custom_components.homebrain.energy.pv_forecast import (
    PvArray,
    array_from_options,
    forecast_url,
    parse_forecast,
    system_from_options,
)

ARRAY = PvArray(kwp=10.0, tilt=35, azimuth=0)
PRAGUE = ZoneInfo("Europe/Prague")


def synthetic(start: datetime, hours: int, gti) -> dict:
    """Open-Meteo-shaped hourly payload (UTC, no suffix, preceding-hour means)."""
    times = [(start + timedelta(hours=i)).strftime("%Y-%m-%dT%H:%M") for i in range(hours)]
    return {
        "latitude": 49.2,
        "longitude": 16.0,
        "hourly_units": {"global_tilted_irradiance": "W/m²"},
        "hourly": {"time": times, "global_tilted_irradiance": [gti(i) for i in range(hours)]},
    }


def test_url_uses_open_meteo_azimuth_and_rounded_coords():
    url = forecast_url(50.08804, 14.42076, PvArray(5, 30, -45))
    assert "latitude=50.09&longitude=14.42" in url
    assert "tilt=30&azimuth=-45" in url
    assert "hourly=global_tilted_irradiance" in url


def test_unconfigured_by_default_assumed_tilt_and_system():
    assert array_from_options({}) is None
    assert array_from_options({"energy_pv": {"pv_kwp": 0}}) is None
    assert array_from_options({"energy_pv": {"pv_kwp": "x"}}) is None
    array = array_from_options({"energy_pv": {"pv_kwp": 7.5}})
    assert array == PvArray(7.5, 35, 0, tilt_assumed=True, azimuth_assumed=True)
    assert array_from_options({"energy_pv": {"pv_kwp": 5, "pv_tilt": 20, "pv_azimuth": 200}}) == (
        PvArray(5, 20, 0, azimuth_assumed=True)
    )  # out-of-range azimuth falls back to south, flagged as assumed
    assert system_from_options({"energy_pv": {"export_limit_kw": 4}}) == {
        "inverter_ac_limit_kw": None,
        "battery_capacity_kwh": None,
        "export_limit_kw": 4.0,
    }


def test_parse_power_preceding_hour_gap_and_cap():
    payload = synthetic(
        datetime(2026, 6, 1, 10, tzinfo=UTC),
        4,
        lambda i: [500, None, 1400, -3][i],
    )
    points = parse_forecast(payload, ARRAY)["points"]
    # 500 W/m² · 10 kWp · 0.85 = 4.25 kW for the hour BEFORE the stamp.
    assert points[0] == {"start": "2026-06-01T09:00:00Z", "end": "2026-06-01T10:00:00Z", "kw": 4.25}
    # null stays a gap, never zero
    assert [p["start"] for p in points] == [
        "2026-06-01T09:00:00Z",
        "2026-06-01T11:00:00Z",
        "2026-06-01T12:00:00Z",
    ]
    assert points[1]["kw"] == 10.0  # capped at kWp
    assert points[2]["kw"] == 0.0  # negative noise clamped


def test_day_totals_local_days_incl_dst():
    # 2026-10-25 is the 25 h DST day in Europe/Prague (local midnight = 22:00 UTC on 24th).
    payload = synthetic(
        datetime(2026, 10, 24, 23, tzinfo=UTC), 72, lambda i: 200 if 8 <= i % 24 <= 14 else 0
    )
    result = parse_forecast(payload, ARRAY, PRAGUE)
    days = result["days"]
    assert set(days) == {"2026-10-25", "2026-10-26"}  # partial first/last days are dropped
    assert all(v > 0 for v in days.values())
    assert abs(sum(p["kw"] for p in result["points"]) - 7 * 3 * 1.7) < 1e-6


async def test_ws_unconfigured_and_configured(hass: HomeAssistant, hass_ws_client, aioclient_mock):
    hass.config.latitude, hass.config.longitude = 50.09, 14.42
    entry = MockConfigEntry(domain=DOMAIN, data={}, options={})
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    client = await hass_ws_client(hass)

    await client.send_json({"id": 1, "type": "homebrain/energy/pv_forecast"})
    reply = await client.receive_json()
    assert reply["success"] and reply["result"]["status"] == "unconfigured"
    assert reply["result"]["points"] == []
    assert aioclient_mock.call_count == 0

    array = PvArray(8.0, 30, 0)
    start = datetime.now(UTC).replace(minute=0, second=0, microsecond=0)
    aioclient_mock.get(
        forecast_url(50.09, 14.42, array), json=synthetic(start, 48, lambda i: 100.0 * (i % 5))
    )
    hass.config_entries.async_update_entry(
        entry, options={"energy_pv": {"pv_kwp": 8, "pv_tilt": 30, "export_limit_kw": 5}}
    )
    await client.send_json({"id": 2, "type": "homebrain/energy/pv_forecast"})
    reply = await client.receive_json()
    result = reply["result"]
    assert result["status"] == "ok"
    assert result["array"] == {"kwp": 8.0, "tilt": 30.0, "azimuth": 0.0, "assumed": ["azimuth"]}
    assert result["system"]["export_limit_kw"] == 5.0
    assert len(result["points"]) == 48
    assert result["points"][1]["kw"] == 0.68
    # cached: a second request does not refetch
    await client.send_json({"id": 3, "type": "homebrain/energy/pv_forecast"})
    assert (await client.receive_json())["result"]["status"] == "ok"
    assert aioclient_mock.call_count == 1


async def test_ws_fetch_error_is_honest(hass: HomeAssistant, hass_ws_client, aioclient_mock):
    hass.config.latitude, hass.config.longitude = 50.09, 14.42
    aioclient_mock.get(forecast_url(50.09, 14.42, PvArray(5, 35, 0)), status=503)
    entry = MockConfigEntry(domain=DOMAIN, data={}, options={"energy_pv": {"pv_kwp": 5}})
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    client = await hass_ws_client(hass)
    await client.send_json({"id": 1, "type": "homebrain/energy/pv_forecast"})
    result = (await client.receive_json())["result"]
    assert result["status"] == "error"
    assert result["points"] == []


async def test_options_flow_pv_array(hass: HomeAssistant):
    entry = MockConfigEntry(domain=DOMAIN, data={}, options={"bindings": {}})
    entry.add_to_hass(hass)
    result = await hass.config_entries.options.async_init(entry.entry_id)
    result = await hass.config_entries.options.async_configure(
        result["flow_id"], {"next_step_id": "energy_pv"}
    )
    assert result["step_id"] == "energy_pv"
    result = await hass.config_entries.options.async_configure(
        result["flow_id"], {"pv_kwp": 9.6, "pv_azimuth": -10, "battery_capacity_kwh": 12}
    )
    assert result["type"] == data_entry_flow.FlowResultType.CREATE_ENTRY
    assert entry.options["energy_pv"] == {
        "pv_kwp": 9.6,
        "pv_azimuth": -10.0,
        "battery_capacity_kwh": 12.0,
    }
    assert entry.options["bindings"] == {}
