"""End-to-end: bindings -> fetch (mocked HTTP) -> blend -> WS snapshot."""

import json
from pathlib import Path

from homeassistant.core import HomeAssistant, ServiceResponse, SupportsResponse
from homeassistant.util import dt as dt_util
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.homebrain.const import DOMAIN
from custom_components.homebrain.weather.providers import chmi_alerts, openmeteo
from custom_components.homebrain.weather.station import read_station

FIXTURES = Path(__file__).parent / "fixtures" / "weather"
BINDINGS = {
    "weather_temperature": "sensor.demo_outdoor_temperature",
    "weather_humidity": "sensor.demo_outdoor_humidity",
    "weather_pressure": "sensor.demo_pressure",
    "weather_wind_speed": "sensor.demo_wind_speed",
    "weather_rain_rate": "sensor.demo_rain_rate",
    "weather_forecast": "weather.demo_forecast",
}


def fixture(name: str):
    return json.loads((FIXTURES / name).read_text(encoding="utf-8"))


def set_station(hass: HomeAssistant, temperature: str = "50.0") -> None:
    hass.states.async_set(
        "sensor.demo_outdoor_temperature", temperature, {"unit_of_measurement": "°F"}
    )
    hass.states.async_set("sensor.demo_outdoor_humidity", "80", {"unit_of_measurement": "%"})
    hass.states.async_set("sensor.demo_pressure", "29.92", {"unit_of_measurement": "inHg"})
    hass.states.async_set("sensor.demo_wind_speed", "18", {"unit_of_measurement": "km/h"})
    hass.states.async_set("sensor.demo_rain_rate", "0.0", {"unit_of_measurement": "mm/h"})


async def test_station_units_and_qc(hass: HomeAssistant, freezer):
    freezer.move_to("2026-10-31T18:40:00+00:00")
    set_station(hass, "150")
    hass.states.async_set("sensor.demo_rain_rate", "1.2", {"unit_of_measurement": "mm"})
    station = read_station(hass, BINDINGS, dt_util.utcnow())
    values = station["values"]
    assert values["t2m"]["v"] is None and values["t2m"]["qc"] == ["range"]
    assert values["msl"]["v"] == 1013.2
    assert values["wind"]["v"] == 5.0
    assert "accumulation_unit" in values["rain_rate"]["qc"]
    freezer.move_to("2026-10-31T19:00:00+00:00")
    assert read_station(hass, BINDINGS, dt_util.utcnow())["status"] == "stale"
    assert read_station(hass, {}, dt_util.utcnow())["status"] == "unbound"


async def test_snapshot_over_websocket(
    hass: HomeAssistant, hass_ws_client, aioclient_mock, freezer
):
    hass.config.latitude, hass.config.longitude = 10.0, 20.0
    aioclient_mock.get(openmeteo.hourly_url(10, 20), json=fixture("openmeteo_hourly.json"))
    aioclient_mock.get(
        openmeteo.daily_url(10, 20, str(hass.config.time_zone)),
        json=fixture("openmeteo_daily.json"),
    )
    aioclient_mock.get(openmeteo.nowcast_url(10, 20), json=fixture("openmeteo_nowcast.json"))
    aioclient_mock.get(chmi_alerts.URL, json=fixture("chmi_alerts.json"))

    hass.states.async_set(
        "weather.demo_forecast", "rainy", {"temperature_unit": "°C", "wind_speed_unit": "km/h"}
    )

    async def forecasts(call) -> ServiceResponse:
        return {
            "weather.demo_forecast": {
                "forecast": [
                    {
                        "datetime": "2026-10-31T19:00:00+00:00",
                        "temperature": 6.0,
                        "wind_speed": 36,
                        "precipitation": 0.2,
                    },
                    {
                        "datetime": "2026-10-31T20:00:00+00:00",
                        "temperature": 5.5,
                        "wind_speed": 36,
                        "precipitation": 0.0,
                    },
                ]
            }
        }

    hass.services.async_register(
        "weather", "get_forecasts", forecasts, supports_response=SupportsResponse.ONLY
    )
    entry = MockConfigEntry(
        domain=DOMAIN,
        data={},
        options={"bindings": {"weather": BINDINGS}, "weather": {"chmi_region": "CZ020"}},
    )
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    # The setup refresh is a *background* task (not awaited by a plain block_till_done), so
    # wait for it explicitly and then reset every source schedule: otherwise met.no could be
    # fetched at wall-clock time and skipped by the frozen-time refresh (CI-speed dependent).
    await hass.async_block_till_done(wait_background_tasks=True)
    manager = hass.data[DOMAIN]["weather"]
    for state in manager.states.values():
        state.next_attempt = None
    # Authenticate before freezing time, otherwise the access token is "issued in the future".
    client = await hass_ws_client(hass)
    freezer.move_to("2026-10-31T18:40:00+00:00")
    set_station(hass)
    await hass.async_add_executor_job(manager.store.open)
    manager._store_open = True

    await manager.async_refresh(dt_util.utcnow())
    await client.send_json({"id": 1, "type": "homebrain/weather/get"})
    msg = await client.receive_json()
    assert msg["success"], msg
    snap = msg["result"]
    assert snap["current"]["t2m"] == 10.0 and snap["current"]["provenance"]["t2m"] == "station"
    assert snap["current"]["msl"] == 1013.2
    assert snap["station"]["status"] == "fresh"
    assert 40 <= len(snap["hourly"]) <= 49
    contributors = {c["source"] for c in snap["hourly"][1]["contributors"]}
    assert {"chmi_aladin_cz_1km", "metno"} <= contributors
    assert snap["hourly"][0]["p10"] <= snap["hourly"][0]["t2m"] <= snap["hourly"][0]["p90"]
    assert len(snap["daily"]) == 10
    assert [w["event"] for w in snap["warnings"]] == ["Silný vítr"]
    assert snap["nowcast"]["status"] == "soon" and snap["nowcast"]["eta_min"] == 50
    statuses = {s["id"]: s["status"] for s in snap["sources"]}
    assert statuses["station"] == "fresh" and statuses["chmi:alerts"] == "fresh"
    assert statuses["metno"] == "fresh"
    assert any(a["license"] == "CC-BY-4.0" for a in snap["attribution"])
    assert len({m["id"] for m in snap["models"]}) >= 8

    # Bias learning from the archived 18:00 issue once an hourly observation arrives.
    await manager.async_learn("2026-10-31T20:00:00Z", 5.0, 30)
    verification = manager.snapshot()["verification"]
    assert {row["source"] for row in verification} >= {"ecmwf_ifs", "blend", "metno"}
    assert all(row["n"] == 1 and not row["enough"] for row in verification)

    # Provider isolation: a failing source keeps the others serving (WEA-010).
    aioclient_mock.clear_requests()
    assert await hass.config_entries.async_unload(entry.entry_id)
    assert "weather" not in hass.data[DOMAIN]
