"""Issue #131 B: precipitation verification, per-variable weights, PoP calibration.

Contingency tables are hand-computed in the comments; all data is synthetic.
"""

from datetime import UTC, datetime, timedelta
from urllib.parse import parse_qs, urlparse
from zoneinfo import ZoneInfo

import pytest
from homeassistant.core import HomeAssistant
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.homebrain.const import DOMAIN
from custom_components.homebrain.weather import blend, history, verify
from custom_components.homebrain.weather.const import (
    OM_MODELS,
    PRECIP_MIN_PAIRS,
    PREV_RUNS_URL,
)
from custom_components.homebrain.weather.providers import openmeteo
from custom_components.homebrain.weather.providers.metno_ha import to_interval_end
from custom_components.homebrain.weather.store import WeatherStore

PRAGUE = ZoneInfo("Europe/Prague")
NOW = datetime(2026, 11, 18, 12, 0, tzinfo=UTC)

# (forecast, observed) mm/h
PAIRS = [
    (0.5, 0.4),  # ≥0.2: hit
    (1.2, 0.0),  # false alarm (also ≥1.0 false alarm)
    (0.0, 0.6),  # miss
    (0.0, 0.0),  # correct negative
    (0.3, 1.5),  # hit (≥1.0: miss)
    (0.1, 0.1),  # correct negative (both below 0.2)
    (0.2, 0.2),  # hit: the threshold itself counts as the event
]


def test_contingency_and_scores_hand_computed():
    # ≥ 0.2: a=3 b=1 c=1 d=2, n=7; a_r = (a+b)(a+c)/n = 4·4/7 = 2.2857
    ct = verify.contingency(PAIRS, 0.2)
    assert ct == {"a": 3, "b": 1, "c": 1, "d": 2}
    s = verify.categorical(ct)
    assert s["pod"] == 0.75  # 3/4
    assert s["far"] == 0.25  # 1/4
    assert s["csi"] == 0.6  # 3/5
    assert s["ets"] == pytest.approx((3 - 16 / 7) / (5 - 16 / 7), abs=1e-3)  # 0.263
    assert s["freq_bias"] == 1.0  # 4/4
    # ≥ 1.0: a=0 b=1 c=1 d=5; a_r = 1·1/7; ETS = (0 - 1/7)/(2 - 1/7) = -0.077
    s1 = verify.categorical(verify.contingency(PAIRS, 1.0))
    assert (s1["a"], s1["b"], s1["c"], s1["d"]) == (0, 1, 1, 5)
    assert s1["pod"] == 0 and s1["far"] == 1 and s1["csi"] == 0
    assert s1["ets"] == pytest.approx(-0.077, abs=1e-3)


def test_undefined_scores_are_none_not_zero():
    s = verify.categorical(verify.contingency([(0.0, 0.0)] * 5, 0.2))
    assert s["pod"] is None and s["far"] is None and s["csi"] is None and s["ets"] is None


def test_brier_and_skill_vs_climatology():
    # BS = (0.2² + 0.2² + 0.5² + 0²)/4 = 0.0825; ō = 0.5 → ref 0.25 → BSS = 1 - 0.33 = 0.67
    b = verify.brier([(0.8, 1), (0.2, 0), (0.5, 1), (0.0, 0)])
    assert b["brier"] == 0.0825 and b["bss"] == 0.67 and b["base_rate"] == 0.5
    assert verify.brier([])["brier"] is None
    assert verify.brier([(0.1, 0), (0.0, 0)])["bss"] is None  # no event: undefined skill


def _hours(day: str, values: list[tuple[float, float]], source="icon_d2", lead=10.0):
    start = datetime.fromisoformat(day).replace(tzinfo=PRAGUE).astimezone(UTC)
    return [
        verify.Pair(
            source,
            lead,
            (start + timedelta(hours=i + 1)).isoformat().replace("+00:00", "Z"),
            fc,
            obs,
        )
        for i, (fc, obs) in enumerate(values)
    ]


def test_daily_pairs_need_complete_local_days():
    full = _hours("2026-11-16", [(0.5, 0.25)] * 24)  # 12 mm vs 6 mm
    partial = _hours("2026-11-17", [(1.0, 1.0)] * 20)
    days = verify.daily_pairs(full + partial, PRAGUE)
    assert days == [(12.0, 6.0)]
    # DST day (25 h) needs 25 hours.
    dst = _hours("2026-10-25", [(0.1, 0.0)] * 24)
    assert verify.daily_pairs(dst, PRAGUE) == []
    assert len(verify.daily_pairs(_hours("2026-10-25", [(0.1, 0.0)] * 25), PRAGUE)) == 1


def test_score_group_amount_bias_and_daily_thresholds():
    pairs = _hours("2026-11-16", [(0.5, 0.25)] * 24)
    m = verify.score_group(pairs, PRAGUE)
    assert m["n"] == 24 and m["n_wet"] == 24
    assert m["bias_mm"] == 0.25 and m["amount_ratio"] == 2.0
    assert m["n_days"] == 1
    assert m["daily"]["1"]["a"] == 1 and m["daily"]["5"]["a"] == 1  # 12 vs 6 mm: both events
    assert m["hourly"]["0.2"]["pod"] == 1.0 and m["probabilistic"] is False
    assert m["enough"] is False  # 24 < PRECIP_MIN_PAIRS
    assert m["hours"] == 24 and m["wet_hours"] == 24 and m["days"] == 1


def test_sample_size_counts_distinct_hours_not_issues():
    # two issues verify the same 3 hours: 6 pairs, but only 3 hours (2 wet) of 1 day
    obs = [0.0, 0.4, 1.0]
    pairs = [
        verify.Pair("icon_d2", lead, f"2026-11-16T{10 + h:02d}:00:00Z", 0.0, o)
        for lead in (3, 9)
        for h, o in enumerate(obs)
    ]
    m = verify.score_group(pairs, PRAGUE)
    assert m["n"] == 6 and m["n_wet"] == 4
    assert (m["hours"], m["wet_hours"], m["days"]) == (3, 2, 1)


def test_blend_is_scored_out_of_sample_rolling_origin():
    """The mix is never scored on hours that could have trained its weights.

    Night N1 scores the pairs known by then and the weights follow from those scores; a
    blend issued after N1 is archived; night N2 scores the blend only from that archive.
    The blend's scored hours are all later than every hour seen at N1, and a blend pair
    without positive lead (would overlap the training sample) is dropped.
    """
    n1 = "2026-11-10T03:00:00Z"
    seen_at_n1 = [
        verify.Pair(
            "icon_d2", 6, f"2026-11-09T{h:02d}:00:00Z", 0.5 * (h % 3 == 0), 0.4 * (h % 3 == 0)
        )
        for h in range(24)
    ]
    issued = "2026-11-10T06:00:00Z"
    later = [f"2026-11-10T{h:02d}:00:00Z" for h in range(7, 24)]
    blend = [verify.Pair("blend", i + 1, v, 0.3, 0.3) for i, v in enumerate(later)]
    leak = verify.Pair("blend", 0, n1, 0.3, 0.3)  # lead 0: never counted
    scores = verify.precip_scores([*seen_at_n1, *blend, leak], PRAGUE)
    row = scores[("blend", "0-24")]
    assert row["out_of_sample"] is True and row["n"] == len(later)
    assert "out_of_sample" not in scores[("icon_d2", "0-24")]
    assert all(p.valid_at > issued > n1 for p in blend)
    assert not verify.blend_out_of_sample(leak)
    assert verify.blend_out_of_sample(seen_at_n1[0])


def test_precip_lead_buckets():
    assert verify.precip_lead_bucket(1) == "0-24"
    assert verify.precip_lead_bucket(24) == "24-48"  # Previous Runs day1
    assert verify.precip_lead_bucket(48) == "48-72"
    assert verify.precip_lead_bucket(72) == "72+"


def _metrics(n: int, wet: int, ets: float, bss: float) -> dict:
    return {
        "n": n,
        "n_wet": wet,
        "enough": n >= PRECIP_MIN_PAIRS and wet >= 12,
        "bss": bss,
        "hourly": {"0.2": {"ets": ets}},
    }


def test_precip_weights_priors_until_enough_then_shrink_to_skill():
    horizons = {"icon_d2": 48, "chmi_aladin_cz_1km": 72, "ecmwf_ifs": 360}
    sources = sorted(horizons)
    prior, verified = blend.precip_weights(sources, 5, horizons, {})
    assert not verified
    # Prior shares 0.25 / 0.25 / 0.15 normalised.
    assert prior["icon_d2"] == pytest.approx(0.25 / 0.65, abs=1e-6)
    few = {("icon_d2", "0-24"): _metrics(100, 30, 0.9, 0.9)}
    assert blend.precip_weights(sources, 5, horizons, few)[0] == prior  # n < MIN: prior
    scores = {
        ("icon_d2", "0-24"): _metrics(480, 40, 0.4, 0.2),  # skill 0.3
        ("chmi_aladin_cz_1km", "0-24"): _metrics(480, 40, 0.1, 0.0),  # skill 0.05
        ("ecmwf_ifs", "0-24"): _metrics(480, 40, -0.1, -0.2),  # negative → 0
    }
    w, verified = blend.precip_weights(sources, 5, horizons, scores)
    assert verified
    # λ = 480/(480+480) = 0.5, all verified (M = 1): icon = 0.5·0.3846 + 0.5·0.3/0.35 = 0.621,
    # ALADIN 0.264, IFS 0.115 → cap 0.5 → renormalised over 0.879: 0.569 / 0.300 / 0.131.
    assert w["icon_d2"] == pytest.approx(0.569, abs=0.002)
    assert w["ecmwf_ifs"] == pytest.approx(0.131, abs=0.002)
    assert (
        w["ecmwf_ifs"] < prior["ecmwf_ifs"]
        and w["chmi_aladin_cz_1km"] < prior["chmi_aladin_cz_1km"]
    )
    assert sum(w.values()) == pytest.approx(1)
    # A single verified source only reshuffles its own prior mass: unchanged alone.
    alone, _ = blend.precip_weights(
        sources, 5, horizons, {("icon_d2", "0-24"): scores[("icon_d2", "0-24")]}
    )
    assert alone == pytest.approx(prior)


def test_precip_skill_needs_enough():
    assert verify.skill(_metrics(100, 5, 0.5, 0.5)) is None
    assert verify.skill(_metrics(500, 50, 0.4, 0.2)) == pytest.approx(0.3)
    assert verify.skill(_metrics(500, 50, -0.3, -0.1)) == 0.0


def _series(precip: float, pop=None):
    return [
        {
            "t": (NOW + timedelta(hours=h)).isoformat().replace("+00:00", "Z"),
            "t2m": 5.0,
            "precip": precip,
            "pop": pop,
            "cloud": 80,
        }
        for h in range(6)
    ]


def test_blend_pop_threshold_drizzle_and_precip_contributors():
    horizons = {"icon_d2": 48, "chmi_aladin_cz_1km": 72}
    # 0.15 mm/h drizzle in both models: below the 0.2 mm/h PoP threshold → PoP 0 (was 1.0).
    out = blend.blend_hourly(
        {"icon_d2": _series(0.15), "chmi_aladin_cz_1km": _series(0.15)}, horizons, {}, NOW
    )
    assert out[1]["pop"] == 0.0 and out[1]["pop_calibrated"] is False
    assert out[1]["precip_weights"] == "prior"
    assert {c["source"] for c in out[1]["precip_contributors"]} == set(horizons)
    out = blend.blend_hourly(
        {"icon_d2": _series(0.6), "chmi_aladin_cz_1km": _series(0.0, pop=40)}, horizons, {}, NOW
    )
    assert out[1]["pop"] == pytest.approx(0.5 * 1.0 + 0.5 * 0.4, abs=0.01)


def test_blend_uses_precip_weights_for_amount_but_not_temperature():
    horizons = {"icon_d2": 48, "chmi_aladin_cz_1km": 72, "ecmwf_ifs": 360}
    series = {
        "icon_d2": _series(2.0),
        "chmi_aladin_cz_1km": _series(0.0),
        "ecmwf_ifs": _series(0.0),
    }
    for s, pts in series.items():
        for p in pts:
            p["t2m"] = {"icon_d2": 4.0, "chmi_aladin_cz_1km": 6.0, "ecmwf_ifs": 5.0}[s]
    scores = {
        ("icon_d2", "0-24"): _metrics(10_000, 500, 0.8, 0.6),
        ("chmi_aladin_cz_1km", "0-24"): _metrics(10_000, 500, 0.05, 0.05),
        ("ecmwf_ifs", "0-24"): _metrics(10_000, 500, 0.0, -0.1),
    }
    before = blend.blend_hourly(series, horizons, {}, NOW)[1]
    after = blend.blend_hourly(series, horizons, {}, NOW, precip_scores=scores)[1]
    assert before["precip"] == 0.0 and after["precip"] == 2.0  # icon_d2 now ≥ half the weight
    assert after["t2m"] == before["t2m"]
    assert after["contributors"] == before["contributors"]
    assert after["precip_weights"] == "verified"


def test_reliability_table_shrinks_and_stays_monotone():
    assert verify.reliability_table([(0.75, 1)] * 10) is None  # too few pairs
    # 500 forecasts of 75 % that verified only half of the time (drizzle over-forecast).
    probs = [(0.75, i % 2) for i in range(500)]
    table = verify.reliability_table(probs)
    assert table is not None and table["counts"][7] == [500, 250]
    cal = table["calibrated"]
    assert all(a <= b for a, b in zip(cal, cal[1:], strict=False))
    # bin 7: (250 + 20·0.75)/520 = 0.51; isotonic pools it with bins 5-6 (0.55, 0.65) → 0.516
    assert verify.calibrate(0.75, table) == pytest.approx(0.516, abs=0.01)
    assert verify.calibrate(0.95, table) == pytest.approx(0.95, abs=0.01)
    assert verify.calibrate(None, table) is None
    assert verify.calibrate(0.3, None) == 0.3


def test_blend_applies_calibration_table():
    horizons = {"icon_d2": 48}
    table = verify.reliability_table([(0.75, i % 2) for i in range(500)])
    out = blend.blend_hourly({"icon_d2": _series(0.0, pop=75)}, horizons, {}, NOW, pop_table=table)[
        1
    ]
    assert out["pop_raw"] == 0.75 and out["pop"] == pytest.approx(0.52, abs=0.01)
    assert out["pop_calibrated"] is True


def test_blend_mixes_ensemble_probability_within_horizon():
    t = (NOW + timedelta(hours=1)).isoformat().replace("+00:00", "Z")
    out = blend.blend_hourly(
        {"icon_d2": _series(0.0)}, {"icon_d2": 48}, {}, NOW, ensemble_pop={t: 0.6}
    )[1]
    assert out["pop_raw"] == pytest.approx(0.3) and out["pop_ensemble"] == 0.6


def test_metno_precip_moves_to_interval_end():
    pts = [
        {"t": "2026-11-18T10:00:00Z", "precip": 1.0, "pop": 80, "t2m": 5},
        {"t": "2026-11-18T11:00:00Z", "precip": 0.0, "pop": 10, "t2m": 5},
        {"t": "2026-11-18T13:00:00Z", "precip": 2.0, "pop": 90, "t2m": 5},  # gap
    ]
    out = to_interval_end(pts)
    assert out[0]["precip"] is None
    assert out[1]["precip"] == 1.0 and out[1]["pop"] == 80
    assert out[2]["precip"] is None  # no value for 12-13 h: never invented


# -- Open-Meteo Previous Runs / Ensemble ---------------------------------------------------
def test_prev_runs_url_and_parse():
    url = openmeteo.prev_runs_url(50.0, 15.0, "2026-11-01", "2026-11-28", 364)
    parsed = urlparse(url)
    assert url.startswith(PREV_RUNS_URL)
    q = parse_qs(parsed.query)
    assert q["hourly"] == [
        "precipitation_previous_day1,precipitation_previous_day2,precipitation_previous_day3"
    ]
    assert q["start_date"] == ["2026-11-01"] and q["elevation"] == ["364"]
    payload = {
        "hourly": {
            "time": ["2026-11-17T00:00", "2026-11-17T01:00"],
            "precipitation_previous_day1_icon_d2": [0.4, None],
            "precipitation_previous_day2_icon_d2": [0.1, 0.0],
            "precipitation_previous_day1_ecmwf_ifs": [None, None],
        }
    }
    rows = openmeteo.parse_prev_runs(payload)
    assert ("icon_d2", "2026-11-17T00:00:00Z", 1, "precip", 0.4) in rows
    assert ("icon_d2", "2026-11-17T01:00:00Z", 2, "precip", 0.0) in rows
    assert len(rows) == 3  # nulls skipped, never 0


def test_call_weight_budget_math():
    n_models = len(OM_MODELS)
    # 3 variables × 8 models = 24 "variables" → 2.4; 28 days → ×2.
    assert openmeteo.call_weight(3, 3, n_models) == pytest.approx(2.4)
    assert openmeteo.call_weight(3, 28, n_models) == pytest.approx(4.8)
    assert openmeteo.call_weight(1, 2) == 1.0


def test_parse_ensemble_probability():
    payload = {
        "hourly": {
            "time": ["2026-11-18T13:00", "2026-11-18T14:00"],
            "precipitation": [0.0, 0.5],
            **{f"precipitation_member{i:02d}": [0.3 if i < 5 else 0.0, 0.5] for i in range(1, 20)},
        }
    }
    probs = openmeteo.parse_ensemble(payload)
    assert probs["2026-11-18T13:00:00Z"] == pytest.approx(4 / 20)
    assert probs["2026-11-18T14:00:00Z"] == 1.0


# -- store + nightly job -------------------------------------------------------------------
def test_store_pairs_join_own_archive_and_previous_runs(tmp_path):
    store = WeatherStore(tmp_path / "weather.db")
    store.open()
    assert store.schema_version() == 2
    store.put_obs_many("precip", {"2026-11-17T01:00:00Z": 0.6, "2026-11-17T02:00:00Z": 0.0})
    store.archive(
        [
            ("icon_d2", "2026-11-16T18:00:00Z", "2026-11-17T01:00:00Z", 7, "precip", 0.5),
            ("icon_d2", "2026-11-16T18:00:00Z", "2026-11-17T01:00:00Z", 7, "pop", 0.7),
            ("blend", "2026-11-16T18:00:00Z", "2026-11-17T01:00:00Z", 7, "precip", 0.4),
            ("blend", "2026-11-16T18:00:00Z", "2026-11-17T01:00:00Z", 7, "pop_raw", 0.55),
            ("icon_d2", "2026-11-16T18:00:00Z", "2026-11-17T03:00:00Z", 9, "precip", 0.1),
        ]
    )
    store.put_prev([("ecmwf_ifs", "2026-11-17T02:00:00Z", 1, "precip", 0.3)])
    pairs = sorted(store.precip_pairs("2026-11-01"))
    assert pairs == [
        ("blend", 7, "2026-11-17T01:00:00Z", 0.4, 0.6, 0.55),
        ("ecmwf_ifs", 24, "2026-11-17T02:00:00Z", 0.3, 0.0, None),
        ("icon_d2", 7, "2026-11-17T01:00:00Z", 0.5, 0.6, 0.7),
    ]  # the 03:00 forecast has no observation yet
    assert store.prev_dates("2026-11-01") == {"2026-11-17"}
    store.put_meta("k", "v")
    assert store.get_meta("k") == "v"
    store.prune(datetime(2027, 6, 1, tzinfo=UTC))
    assert store.prev_dates("2026-11-01") == set()
    store.close()


async def test_nightly_job_bootstraps_and_scores(
    hass: HomeAssistant, aioclient_mock, monkeypatch, tmp_path
):
    await hass.config.async_set_time_zone("Europe/Prague")
    hass.config.latitude, hass.config.longitude = 50.0, 15.0
    monkeypatch.setattr("custom_components.homebrain.weather.AUTOSTART", False)
    entry = MockConfigEntry(
        domain=DOMAIN,
        data={},
        options={"bindings": {"weather": {"weather_rain_daily": "sensor.demo_rain"}}},
    )
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    manager = hass.data[DOMAIN]["weather"]
    manager.store = WeatherStore(tmp_path / "w.db")
    await hass.async_add_executor_job(manager.store.open)
    hass.config.components.add("recorder")
    now = datetime(2026, 11, 18, 3, 30, tzinfo=UTC)  # 04:30 local

    async def fake_stats(_hass, ids, start, end):
        assert ids == {"rain": "sensor.demo_rain"}
        base = datetime(2026, 11, 17, 0, 0, tzinfo=UTC).timestamp()
        return {
            "rain": [
                {"start": base + 3600 * h, "change": 1.0 if h % 6 == 0 else 0.0} for h in range(24)
            ]
        }

    monkeypatch.setattr(history, "async_statistics", fake_stats)
    aioclient_mock.get(
        PREV_RUNS_URL,
        json={
            "hourly": {
                "time": [f"2026-11-17T{h:02d}:00" for h in range(24)],
                "precipitation_previous_day1_icon_d2": [
                    1.2 if h % 6 == 1 else 0.0 for h in range(24)
                ],
            }
        },
    )
    session = async_get_clientsession(hass)
    await manager._verify_precip(session, now)
    # 90-day window → 4 chunks (28+28+28+6 days) within the weight budget.
    assert aioclient_mock.call_count == 4
    info = manager.verify_info
    assert info["status"] == "ok" and info["prev_runs_weight"] == pytest.approx(16.8)
    row = manager.precip_scores[("icon_d2", "24-48")]
    # Station hours valid 01:00…24:00 vs forecasts 00:00…23:00 → 23 pairs; 01, 07, 13, 19 h
    # (hour end of starts 0, 6, 12, 18) are wet and forecast wet.
    assert row["n"] == 23 and row["hourly"]["0.2"]["a"] == 4 and row["hourly"]["0.2"]["b"] == 0
    snap = manager.snapshot(now)
    assert snap["verification_precip"][0]["source"] == "icon_d2"
    assert snap["verification_info"]["ensemble"] is False
    # Same night again: nothing.
    await manager._verify_precip(session, now + timedelta(minutes=5))
    assert aioclient_mock.call_count == 4
    # Before 03:00 local the next night: nothing either.
    manager.verify_info["last"] = "2026-11-18"
    await manager._verify_precip(session, now + timedelta(hours=22))
    assert aioclient_mock.call_count == 4
    await hass.async_add_executor_job(manager.store.close)
