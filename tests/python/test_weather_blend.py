"""Blend weights, uncertainty and bias correction."""

import json
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest

from custom_components.homebrain.weather import blend
from custom_components.homebrain.weather.derive import (
    condition,
    dew_point,
    frost_risk,
    pressure_tendency,
    rain_intensity,
    trend_per_hour,
)
from custom_components.homebrain.weather.providers import openmeteo

NOW = datetime(2026, 10, 31, 12, 0, tzinfo=UTC)


def series(offset: float, hours: int = 72, precip: float = 0.0):
    return [
        {
            "t": (NOW + timedelta(hours=h)).isoformat().replace("+00:00", "Z"),
            "t2m": 10 + offset,
            "precip": precip,
            "cloud": 50,
            "wind": 3,
            "wind_dir": 350 if offset > 0 else 10,
        }
        for h in range(hours)
    ]


def test_lead_buckets():
    assert blend.lead_bucket(0) == "0-6"
    assert blend.lead_bucket(30) == "24-48"
    assert blend.lead_bucket(200) == "120+"


def test_prior_weights_taper_floor_and_cap():
    horizons = {"icon_d2": 48, "chmi_aladin_cz_1km": 72, "ecmwf_ifs": 360}
    early = blend.model_weights(list(horizons), 1, horizons, {})
    assert pytest.approx(sum(early.values())) == 1
    assert max(early.values()) <= 0.5 + 1e-9
    late = blend.model_weights(list(horizons), 45, horizons, {})
    assert late["icon_d2"] < early["icon_d2"]  # last 6 h of ICON-D2 horizon fade out
    assert "icon_d2" not in blend.model_weights(list(horizons), 49, horizons, {})


def test_verified_weights_prefer_lower_mae():
    horizons = {"a": 100, "b": 100}
    bias = {
        ("a", "t2m", "0-6"): {"b": 0, "mae": 0.5, "n": 100},
        ("b", "t2m", "0-6"): {"b": 0, "mae": 2.0, "n": 100},
    }
    weights = blend.model_weights(["a", "b"], 1, horizons, bias)
    assert weights["a"] > weights["b"]


def test_blend_mean_spread_pop_and_circular_wind():
    out = blend.blend_hourly(
        {"ecmwf_ifs": series(+1, precip=0.5), "icon_eu": series(-1)},
        {"ecmwf_ifs": 360, "icon_eu": 120},
        {},
        NOW,
    )
    first = out[0]
    assert len(out) == 49
    assert 9 < first["t2m"] < 11 and first["p10"] == 9 and first["p90"] == 11
    assert first["spread"] > 0.9
    assert 0 < first["pop"] < 1
    assert first["wind_dir"] in range(0, 15) or first["wind_dir"] >= 345
    assert {c["source"] for c in first["contributors"]} == {"ecmwf_ifs", "icon_eu"}


def test_bias_correction_removes_synthetic_two_degree_bias():
    """Spec acceptance: +2 °C model bias corrected to |bias| < 0.5 °C within 14 days."""
    state = None
    for _ in range(14 * 4):  # four verifying forecasts per day in this lead bucket
        state = blend.update_bias(state, 2.0)
    assert abs(2.0 - blend.applied_bias(state)) < 0.5
    out = blend.blend_hourly(
        {"ecmwf_ifs": series(+2)}, {"ecmwf_ifs": 360}, {("ecmwf_ifs", "t2m", "0-6"): state}, NOW
    )
    assert abs(out[1]["t2m"] - 10) < 0.5


def test_bias_shrinks_and_clamps():
    assert blend.applied_bias({"b": 3, "mae": 3, "n": 3}) == 0
    assert blend.applied_bias({"b": 30, "mae": 30, "n": 1000}) == 4.0


def test_confidence_classes():
    assert blend.confidence(9, 10, 0.1) == "high"
    assert blend.confidence(5, 12, 0.1) == "low"
    assert blend.confidence(9, 10, 0.5) == "low"
    assert blend.confidence(9, 12, 0.1) == "medium"


def test_daily_blend_from_recorded_fixture():
    payload = json.loads(
        (Path(__file__).parent / "fixtures/weather/openmeteo_daily.json").read_text()
    )
    days = blend.blend_daily(openmeteo.parse_daily(payload))
    assert len(days) == 10
    for day in days:
        assert day["tmax_lo"] <= day["tmax"] <= day["tmax_hi"]
        assert day["confidence"] in {"high", "medium", "low"}


def test_derived_values():
    assert dew_point(20, 50) == pytest.approx(9.3, abs=0.1)
    assert pressure_tendency(-1.8)["arrow"] == "↘"
    assert pressure_tendency(0.05)["class"] == "steady"
    assert pressure_tendency(7)["class"] == "very_rapid"
    assert rain_intensity(1.0) == "light" and rain_intensity(10) == "heavy"
    assert frost_risk(0.5, 80, 5, 1) == "high"
    assert frost_risk(2.5, 10, 1, -1) == "high"
    assert frost_risk(8, 10, 1, -1) == "low"
    assert condition(5, 95, 0) == "overcast"
    assert condition(0, 95, 1) == "snow"
    assert condition(15, 50, 0, [95, 95, 3]) == "thunder"
    samples = [(NOW + timedelta(minutes=m), 10 + m / 60) for m in range(0, 61, 5)]
    assert trend_per_hour(samples) == pytest.approx(1.0)
