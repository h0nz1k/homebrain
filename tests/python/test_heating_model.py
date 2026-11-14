"""Topení: pure parts (name grammar, private map loader, payload, activity, counters, seasons)."""

from __future__ import annotations

from datetime import UTC, date, datetime, timedelta

import pytest
from heating_fake_plc import EXAMPLE_MAP, PAGES, page_xml

from custom_components.homebrain.heating.client import parse_name, parse_page, parse_value
from custom_components.homebrain.heating.mapfile import MapError, parse_map
from custom_components.homebrain.heating.model import (
    DayCounters,
    Resolved,
    SolarSample,
    build_payload,
    compute_seasons,
    derive_activity,
    derive_solar_state,
    kiosk_subset,
    resolve,
    season_of,
)

CONTRACT_TOP = {
    "updated_at",
    "stale",
    "source",
    "activity",
    "alerts",
    "mode",
    "house",
    "heat_pump",
    "tank",
    "dhw",
    "outdoor",
    "pumps",
    "backup_heater",
    "faults",
    "curve",
    "schedules",
    "extras",
    "rooms",
}


def test_parse_name_grammar():
    ref = parse_name("__R7031.3_BOOL_i")
    assert (ref.area, ref.addr, ref.bit, ref.type, ref.fmt) == ("R", 7031, 3, "BOOL", "i")
    assert ref.address == "R7031.3"
    ref = parse_name("__R7200_TIME_Thh:mm")
    assert (ref.address, ref.type, ref.fmt) == ("R7200", "TIME", "Thh:mm")
    assert parse_name("__X300_REAL_04.1f").address == "X300"
    assert parse_name("garbage") is None


def test_parse_value_types():
    assert parse_value("REAL", "021.4") == pytest.approx(21.4)
    assert parse_value("REAL", "-04") == -4.0
    assert parse_value("INT", "001234") == 1234
    assert parse_value("BOOL", "1") is True
    assert parse_value("BOOL", "0") is False
    assert parse_value("TIME", "05:30") == "05:30"
    assert parse_value("REAL", "") is None
    assert parse_value("REAL", "n/a") is None


def test_parse_page_cp1250():
    ucid, values = parse_page(page_xml(17, PAGES[17]).decode("cp1250"))
    assert ucid == "4242"
    assert values["__X300_REAL_04.1f"] == "021.4"


def test_map_loader_validates_and_warns():
    hmap = parse_map(EXAMPLE_MAP)
    assert "house.ref_temp" in hmap.keys
    assert "something.unknown" not in hmap.keys
    assert any("something.unknown" in w for w in hmap.warnings)
    assert hmap.keys["mode.setback_active"].invert is True
    assert hmap.pages == {17: 30, 8: 60, 26: 900}
    assert [f.key for f in hmap.faults] == ["f_01", "f_02"]
    assert hmap.needed_pages() == {8, 17, 26}
    with pytest.raises(MapError):
        parse_map("keys: [1, 2]")
    with pytest.raises(MapError):
        parse_map("- not a mapping")
    bad = parse_map("keys:\n  house.ref_temp: {page: x, var: X1}\n  tank.top: {page: 1}\n")
    assert bad.keys == {}
    assert len(bad.warnings) == 2


def _pages() -> dict[int, dict[str, str]]:
    return {n: dict(v) for n, v in PAGES.items()}


def test_resolve_and_payload_shape():
    hmap = parse_map(EXAMPLE_MAP)
    res = resolve(hmap, _pages())
    assert res.values["house.ref_temp"] == pytest.approx(21.4)
    assert res.values["mode.setback_active"] is False  # inverted flag
    counters = DayCounters()
    now = datetime(2026, 1, 10, 12, 0, tzinfo=UTC)
    payload = build_payload(
        res, counters, source="ok", updated_at=now, now=now, stale=False, power_w=None
    )
    assert set(payload) == CONTRACT_TOP
    assert payload["house"]["ref_temp"] == pytest.approx(21.4)
    assert payload["heat_pump"]["motohours"] == pytest.approx(1234.5)
    assert payload["heat_pump"]["discharge_temp"] is None  # not mapped
    assert payload["dhw"]["reheat_below"] == pytest.approx(42.0)
    assert payload["mode"]["season"] == "winter"
    assert payload["faults"]["monitored"] == 2
    assert payload["faults"]["active"] == []
    assert payload["schedules"] == [
        {"key": "setback", "label": "Komfort", "slots": [["05:30", "21:00"]]}
    ]
    assert payload["backup_heater"] == {"on": None, "available": False}
    assert payload["rooms"] == []
    assert payload["activity"] == "house_circuit"


@pytest.mark.parametrize(
    ("values", "faulty", "expected"),
    [
        ({"heat_pump.compressor_on": True, "dhw.valve_to_dhw": False}, False, "heating_tank"),
        ({"heat_pump.compressor_on": True, "dhw.valve_to_dhw": True}, False, "heating_dhw"),
        ({"heat_pump.compressor_on": False, "house.circuit_on": True}, False, "house_circuit"),
        ({"heat_pump.compressor_on": False, "house.circuit_on": False}, False, "idle"),
        ({"heat_pump.compressor_on": False, "mode.cooling": True}, False, "cooling"),
        ({"heat_pump.compressor_on": False, "mode.hdo_low_tariff": False}, False, "blocked_hdo"),
        ({"mode.main_switch": False, "heat_pump.compressor_on": False}, False, "off"),
        (
            {
                "mode.winter": True,
                "mode.heating_enabled": False,
                "heat_pump.compressor_on": False,
            },
            False,
            "dhw_only",
        ),
        ({"heat_pump.compressor_on": True, "faults.fatal": True}, False, "fault"),
        (
            {"heat_pump.compressor_on": False, "mode.main_switch": False, "faults.fatal": True},
            False,
            "fault",
        ),
        ({"heat_pump.compressor_on": False}, True, "fault"),
        ({}, False, "idle"),
    ],
)
def test_activity_derivation(values, faulty, expected):
    assert derive_activity(values, any_fault=faulty) == expected


def _t(h: int, m: int = 0, day: int = 10) -> datetime:
    return datetime(2026, 1, day, h, m, tzinfo=UTC)


def test_counters_runtime_and_starts():
    c = DayCounters()
    c.update(_t(10), False)
    c.update(_t(10, 5), True)  # start
    c.update(_t(10, 20), True)
    c.update(_t(10, 35), False)  # stop after ~30 min (sampled)
    c.update(_t(11), True)  # second start
    c.update(_t(11, 6), True)
    assert c.starts == 2
    assert c.runtime_h == pytest.approx(36 / 60)
    assert c.running_since == _t(11)


def test_counters_split_at_midnight():
    c = DayCounters()
    c.update(_t(23, 50), True)
    c.update(_t(23, 58), True)
    c.update(_t(0, 4, day=11), True)  # crosses midnight while running
    assert c.day == "2026-01-11"
    assert c.starts == 0  # the run started yesterday
    assert c.runtime_h == pytest.approx(4 / 60)
    assert c.running_since == _t(23, 50)


def test_counters_survive_restart_and_skip_gaps():
    c = DayCounters()
    c.update(_t(8), False)
    c.update(_t(8, 1), True)
    c.update(_t(8, 9), True)
    restored = DayCounters.from_dict(c.as_dict())
    assert restored.starts == 1
    # HA was down 2 h; compressor still on: no new start, the gap is not credited.
    restored.update(_t(10, 9), True)
    restored.update(_t(10, 10), True)
    assert restored.starts == 1
    assert restored.runtime_h == pytest.approx(9 / 60)
    # A broken store is ignored instead of crashing.
    assert DayCounters.from_dict({"day": 5, "starts": "x"}).starts == 0


def test_counters_outdoor_and_energy():
    c = DayCounters()
    c.update(_t(1), False, outdoor=-3.0, energy_total=100.0)
    c.update(_t(2), False, outdoor=2.5, energy_total=101.5)
    c.update(_t(3), False, outdoor=0.0, energy_total=103.0)
    assert (c.outdoor_min, c.outdoor_max) == (-3.0, 2.5)
    assert c.energy_today == pytest.approx(3.0)
    c.update(_t(0, 1, day=11), False, outdoor=1.0, energy_total=103.2)
    assert c.energy_today == pytest.approx(0.2)  # baseline = yesterday's last reading
    assert (c.outdoor_min, c.outdoor_max) == (1.0, 1.0)


def test_fault_since_is_tracked():
    hmap = parse_map(EXAMPLE_MAP)
    pages = _pages()
    pages[8]["__R7100.1_BOOL_i"] = "1"
    res = resolve(hmap, pages)
    c = DayCounters()
    now = _t(9)
    c.update(now, False, faults=res.active_faults())
    payload = build_payload(res, c, source="ok", updated_at=now, now=now, stale=False)
    assert payload["activity"] == "fault"
    assert payload["faults"]["active"] == [
        {"key": "f_02", "label": "Čidlo venku", "since": now.isoformat()}
    ]


def test_kiosk_subset_drops_details():
    hmap = parse_map(EXAMPLE_MAP)
    now = _t(9)
    payload = build_payload(
        resolve(hmap, _pages()), DayCounters(), source="ok", updated_at=now, now=now, stale=False
    )
    sub = kiosk_subset(payload)
    assert set(sub) <= CONTRACT_TOP
    assert "schedules" not in sub and "curve" not in sub and "heat_pump" in sub
    assert set(sub["heat_pump"]) == {"compressor_on", "running_since"}


def test_season_of():
    assert season_of(date(2025, 7, 1)) == "2025/26"
    assert season_of(date(2026, 6, 30)) == "2025/26"
    assert season_of(date(2026, 1, 5)) == "2025/26"
    assert season_of(date(2009, 12, 31)) == "2009/10"


def test_compute_seasons_math():
    start = date(2024, 7, 1)
    days = []
    for i in range(365):
        d = start + timedelta(days=i)
        cold = d.month in (12, 1, 2)
        days.append(
            {
                "date": d,
                "runtime_h": 4.0 if cold else 1.0,
                "starts": 8 if cold else 2,
                "outdoor_mean": 0.0 if cold else 15.0,
                "energy_kwh": None,
            }
        )
    rows = compute_seasons(days, today=date(2025, 8, 1), kwh_per_run_hour=None)
    assert [r["season"] for r in rows] == ["2024/25"]
    row = rows[0]
    cold_days = 31 + 31 + 28
    assert row["partial"] is False
    assert row["compressor_h"] == pytest.approx(cold_days * 4 + (365 - cold_days))
    assert row["starts"] == cold_days * 8 + (365 - cold_days) * 2
    assert row["median_run_min"] == pytest.approx(30.0)
    assert row["degree_days"] == pytest.approx(cold_days * 20 + (365 - cold_days) * 5)
    assert row["h_per_100dd"] == pytest.approx(row["compressor_h"] / row["degree_days"] * 100, 0.01)
    assert row["energy_kwh"] is None and row["energy_measured"] is False
    assert row["coverage"] == pytest.approx(1.0)
    assert row["backup_heater_h"] is None
    assert row["counter_reset"] is False
    assert row["compressor_unavailable"] is None
    est = compute_seasons(days, today=date(2025, 8, 1), kwh_per_run_hour=2.0)[0]
    assert est["energy_kwh"] == pytest.approx(row["compressor_h"] * 2.0)
    measured = [{**d, "energy_kwh": 1.0} for d in days]
    m = compute_seasons(measured, today=date(2025, 8, 1), kwh_per_run_hour=2.0)[0]
    assert m["energy_kwh"] == pytest.approx(365.0) and m["energy_measured"] is True
    partial = compute_seasons(days[:100], today=start + timedelta(days=99), kwh_per_run_hour=None)
    assert partial[0]["partial"] is True and partial[0]["coverage"] == pytest.approx(1.0)
    assert partial[0]["counter_reset"] is False


def test_compute_seasons_ignores_counter_reset_day():
    """Synthetic repro: one negative daily change must not flip the whole season negative."""
    days = [
        {
            "date": date(2026, 7, 1),
            "runtime_h": 2.0,
            "starts": 5,
            "outdoor_mean": 12.0,
        },
        {
            "date": date(2026, 11, 9),
            "runtime_h": -10_096.75,
            "starts": -23_787,
            "outdoor_mean": 8.0,
        },
        {
            "date": date(2026, 11, 10),
            "runtime_h": 1.5,
            "starts": 3,
            "outdoor_mean": 9.0,
        },
    ]
    row = compute_seasons(days, today=date(2026, 11, 14), kwh_per_run_hour=None)[0]
    assert row["season"] == "2026/27"
    assert row["compressor_h"] == pytest.approx(3.5)
    assert row["starts"] == 8
    assert row["compressor_h"] > 0 and row["starts"] > 0
    assert row["counter_reset"] is True
    assert row["compressor_unavailable"] is None


@pytest.mark.parametrize("opening, expected", [(None, None), (72.4, 72), (99.8, 100), (0, 0)])
def test_mixing_valve_contract(opening, expected):
    from custom_components.homebrain.heating.keys import KEYS

    spec = KEYS["house.mixing_valve_pct"]
    assert spec.kind == "num"
    assert spec.unit == "%"
    assert spec.device_class is None
    assert spec.label == "Směšovací ventil – otevření"
    res = resolve(parse_map(EXAMPLE_MAP), _pages())
    assert res.values.get("house.mixing_valve_pct") is None
    if opening is not None:
        res.values["house.mixing_valve_pct"] = opening
    now = datetime(2026, 1, 10, 12, 0, tzinfo=UTC)
    payload = build_payload(
        res, DayCounters(), source="ok", updated_at=now, now=now, stale=False, power_w=None
    )
    assert payload["house"]["mixing_valve_pct"] == expected
    assert expected is None or type(payload["house"]["mixing_valve_pct"]) is int


def test_extras_side_circuits_null_when_unmapped():
    now = datetime(2026, 1, 10, 12, 0, tzinfo=UTC)
    payload = build_payload(
        Resolved(), DayCounters(), source="ok", updated_at=now, now=now, stale=False
    )
    assert payload["extras"] == {"solar": None, "pool": None, "fish": None}


def test_extras_side_circuits_mapped_and_partial():
    res = Resolved()
    res.mapped.add("extras.fish_temp")
    res.mapped.add("extras.fish_target")
    res.mapped.add("extras.fish_hysteresis")
    res.mapped.add("extras.fish_heating_on")
    res.mapped.add("extras.fish_valve_open")
    res.mapped.add("extras.solar_temp")
    res.mapped.add("extras.solar_pump")
    res.mapped.add("extras.pool_temp")
    res.values.update(
        {
            "extras.fish_temp": 7.94,
            "extras.fish_target": 8.0,
            "extras.fish_hysteresis": 0.2,
            "extras.fish_heating_on": True,
            "extras.fish_valve_open": True,
            "extras.solar_temp": 12.1,
            "extras.solar_pump": False,
            "extras.pool_temp": 27.88,
        }
    )
    now = datetime(2026, 1, 10, 12, 0, tzinfo=UTC)
    payload = build_payload(res, DayCounters(), source="ok", updated_at=now, now=now, stale=False)
    assert payload["extras"]["fish"] == {
        "temp": 7.9,
        "target": 8.0,
        "hysteresis": 0.2,
        "heating_on": True,
        "valve_open": True,
    }
    assert payload["extras"]["solar"] == {
        "temp": 12.1,
        "pump": False,
        "enabled": None,
        "pump_pct": None,
        "state": "idle",
    }
    assert payload["extras"]["pool"] == {
        "temp": 27.9,
        "heating_pump": None,
        "filter_pump": None,
    }


def test_extras_fish_temp_only_backward_compatible():
    res = Resolved()
    res.mapped.add("extras.fish_temp")
    res.values["extras.fish_temp"] = 11.2
    now = datetime(2026, 1, 10, 12, 0, tzinfo=UTC)
    payload = build_payload(res, DayCounters(), source="ok", updated_at=now, now=now, stale=False)
    assert payload["extras"]["fish"] == {
        "temp": 11.2,
        "target": None,
        "hysteresis": None,
        "heating_on": None,
        "valve_open": None,
    }


def test_mixing_valve_resolves_a_mapped_numeric_sensor():
    hmap = parse_map(EXAMPLE_MAP)
    # Reuse a synthetic numeric fixture binding; no household mapping is stored here.
    hmap.keys["house.mixing_valve_pct"] = hmap.keys["house.ref_temp"]
    res = resolve(hmap, _pages())
    assert res.values["house.mixing_valve_pct"] == pytest.approx(21.4)
    now = datetime(2026, 1, 10, 12, 0, tzinfo=UTC)
    payload = build_payload(
        res, DayCounters(), source="ok", updated_at=now, now=now, stale=False, power_w=None
    )
    assert payload["house"]["mixing_valve_pct"] == 21
    assert type(payload["house"]["mixing_valve_pct"]) is int


def test_derive_solar_state_priorities():
    now = datetime(2026, 3, 10, 14, 0, tzinfo=UTC)
    assert derive_solar_state(48.0, 38.0, True, (), now) == "heating"
    samples = [
        SolarSample(now - timedelta(minutes=30), 62.0, 38.0, True),
        SolarSample(now - timedelta(minutes=1), 62.0, 38.05, True),
    ]
    assert derive_solar_state(62.0, 38.05, True, tuple(samples), now) == "no_gain"
    assert derive_solar_state(112.0, 45.0, False, (), now) == "stagnation"
    assert derive_solar_state(30.0, 28.0, False, (), now) == "idle"


def test_extras_solar_extended_fields_and_state():
    res = Resolved()
    res.mapped.update(
        {
            "extras.solar_temp",
            "extras.solar_pump",
            "extras.solar_enabled",
            "extras.solar_pump_pct",
            "tank.bottom",
        }
    )
    res.values.update(
        {
            "extras.solar_temp": 56.2,
            "extras.solar_pump": True,
            "extras.solar_enabled": True,
            "extras.solar_pump_pct": 73.4,
            "tank.bottom": 38.5,
        }
    )
    now = datetime(2026, 3, 10, 14, 0, tzinfo=UTC)
    payload = build_payload(res, DayCounters(), source="ok", updated_at=now, now=now, stale=False)
    assert payload["extras"]["solar"] == {
        "temp": 56.2,
        "pump": True,
        "enabled": True,
        "pump_pct": 73,
        "state": "heating",
    }
