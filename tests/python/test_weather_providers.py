"""Providers parse recorded, anonymised payloads (no live calls)."""

import json
from datetime import UTC, datetime
from pathlib import Path

from custom_components.homebrain.weather.providers import chmi_alerts, openmeteo

FIXTURES = Path(__file__).parent / "fixtures" / "weather"
NOW = datetime(2026, 10, 31, 18, 40, tzinfo=UTC)


def load(name: str):
    return json.loads((FIXTURES / name).read_text(encoding="utf-8"))


def test_urls_round_coordinates_and_request_all_models():
    url = openmeteo.hourly_url(12.3456, 45.6789)
    assert "latitude=12.35" in url and "longitude=45.68" in url
    assert "chmi_aladin_cz_1km,icon_d2,geosphere_arome_austria" in url
    assert "past_hours=12" in url and "wind_speed_unit=ms" in url
    assert "minutely_15=precipitation" in openmeteo.nowcast_url(1, 2)
    assert "forecast_days=10" in openmeteo.daily_url(1, 2, "Europe/Prague")


def test_parse_hourly_keeps_nulls_and_reports_status():
    parsed = openmeteo.parse_hourly(load("openmeteo_hourly.json"))
    assert set(parsed) >= {"chmi_aladin_cz_1km", "icon_d2", "ecmwf_ifs", "ukmo_seamless"}
    aladin = parsed["chmi_aladin_cz_1km"]
    assert aladin["status"] == "fresh" and aladin["points"][0]["t"].endswith("Z")
    icon = parsed["icon_d2"]
    assert icon["valid"] < len(icon["points"])
    # Missing ICON-D2 hours stay None (never 0) so the blend skips them.
    assert any(p["t2m"] is None for p in icon["points"])
    assert all(p["t2m"] != 0 or p["t2m"] is None for p in icon["points"] if p["t2m"] is None)


def test_parse_hourly_marks_empty_model_unavailable():
    payload = load("openmeteo_hourly.json")
    hourly = payload["hourly"]
    hourly["temperature_2m_icon_d2"] = [None] * len(hourly["time"])
    assert openmeteo.parse_hourly(payload)["icon_d2"]["status"] == "unavailable"


def test_parse_daily_and_nowcast():
    daily = openmeteo.parse_daily(load("openmeteo_daily.json"))
    assert len(daily["ecmwf_ifs"]) == 10
    assert daily["ecmwf_ifs"][0]["tmax"] is not None
    slots = openmeteo.parse_nowcast(load("openmeteo_nowcast.json"))
    assert len(slots) == 12
    assert slots[3]["mmh"] == 1.2  # 0.3 mm per 15 min -> 1.2 mm/h


def test_alerts_region_filter_expiry_and_order():
    payload = load("chmi_alerts.json")
    regional = chmi_alerts.parse_alerts(payload, "CZ020", NOW)
    assert [w["event"] for w in regional] == ["Silný vítr"]
    assert regional[0]["level_label"] == "Žlutá" and regional[0]["instruction"]
    everywhere = chmi_alerts.parse_alerts(payload, None, NOW)
    assert [w["level"] for w in everywhere] == [2, 1]
    assert all(not w["region_filtered"] for w in everywhere)
