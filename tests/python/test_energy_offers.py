"""Energie „Srovnání nabídek“: OTE/CNB parsing, offer model and the cost calculation.

Synthetic data only (invented prices, consumption and offers).
"""

import json
from datetime import UTC, date, datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

import pytest
from homeassistant.core import HomeAssistant
from homeassistant.setup import async_setup_component
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.homebrain.const import DOMAIN
from custom_components.homebrain.energy.compare import Tariff
from custom_components.homebrain.energy.offers.calc import compare_offers, month_windows
from custom_components.homebrain.energy.offers.model import (
    OfferError,
    regulated_defaults,
    sanitize_offer,
    sanitize_regulated,
)
from custom_components.homebrain.energy.offers.spot import (
    SpotManager,
    SpotParseError,
    czk_hours,
    ote_url,
    parse_cnb_year,
    parse_ote_chart,
    rate_on,
)

PRAGUE = ZoneInfo("Europe/Prague")
FIX = Path(__file__).parent / "fixtures" / "energy_offers"


def load(name: str):
    return json.loads((FIX / name).read_text(encoding="utf-8"))


def local(*args: int) -> datetime:
    return datetime(*args, tzinfo=PRAGUE)


def hourly(start: datetime, end: datetime, kwh: float) -> list[tuple[float, float]]:
    t = start.astimezone(UTC)
    out = []
    while t < end.astimezone(UTC):
        out.append((t.timestamp(), kwh))
        t += timedelta(hours=1)
    return out


# ---------- OTE / CNB parsing ----------


def test_ote_url_uses_the_public_chart_data_endpoint():
    assert ote_url(date(2026, 1, 5)) == (
        "https://www.ote-cr.cz/pw-data/chart-data/01?language=cs&report_date=2026-01-05"
    )


def test_parse_quarter_hour_chart_averages_to_hours():
    hours = parse_ote_chart(load("ote_15min_synthetic.json"), date(2026, 1, 5), PRAGUE)
    assert len(hours) == 24
    first = local(2026, 1, 5).astimezone(UTC).timestamp()
    # quarters 100,101,102,103 -> mean 101.5; the 60min index line (999) is ignored
    assert hours[0] == (first, pytest.approx(101.5))
    assert hours[23][0] == first + 23 * 3600
    assert hours[23][1] == pytest.approx(124.5)


def test_parse_hourly_chart_before_the_15min_switch():
    hours = parse_ote_chart(load("ote_hourly_synthetic.json"), date(2025, 6, 5), PRAGUE)
    assert len(hours) == 24
    assert hours[0] == (local(2025, 6, 5).astimezone(UTC).timestamp(), 50.0)
    assert hours[-1][1] == 73.0


def test_parse_dst_day_with_25_hours():
    hours = parse_ote_chart(load("ote_15min_dst_synthetic.json"), date(2025, 10, 26), PRAGUE)
    assert len(hours) == 25
    starts = [h[0] for h in hours]
    assert starts == sorted(set(starts))
    assert starts[-1] - starts[0] == 24 * 3600


def test_parse_rejects_mismatched_period_count():
    data = load("ote_hourly_synthetic.json")
    data["data"]["dataLine"][1]["point"] = data["data"]["dataLine"][1]["point"][:20]
    with pytest.raises(SpotParseError):
        parse_ote_chart(data, date(2025, 6, 5), PRAGUE)


def test_parse_empty_chart_is_no_data():
    assert parse_ote_chart(load("ote_empty_synthetic.json"), date(2030, 1, 1), PRAGUE) == []


def test_cnb_year_parsing_and_rate_lookup():
    rates = parse_cnb_year((FIX / "cnb_year_synthetic.txt").read_text(encoding="utf-8"))
    assert rates == {"2026-01-02": 25.0, "2026-01-05": 25.1}
    assert rate_on(rates, date(2026, 1, 4)) == 25.0  # weekend -> last fixing
    assert rate_on(rates, date(2026, 1, 6)) == 25.1
    assert rate_on(rates, date(2025, 12, 31)) is None


def test_czk_hours_converts_with_the_day_rate():
    t = local(2026, 1, 5, 10).astimezone(UTC).timestamp()
    out = czk_hours({str(int(t)): 100.0}, {"2026-01-05": 25.0}, PRAGUE)
    assert out == {t: 2500.0}


async def test_spot_manager_backfills_politely_and_caches(hass: HomeAssistant):
    calls: list[str] = []

    async def fetch(url: str) -> str:
        calls.append(url)
        if "cnb.cz" in url:
            return (FIX / "cnb_year_synthetic.txt").read_text(encoding="utf-8")
        return json.dumps(load("ote_hourly_synthetic.json"))

    manager = SpotManager(hass, fetch=fetch, delay=0)
    await manager.async_load()
    await manager.async_backfill(date(2026, 1, 5), date(2026, 1, 7), PRAGUE)
    ote_calls = [c for c in calls if "ote-cr" in c]
    assert len(ote_calls) == 2
    assert manager.status()["days"] == 2
    prices = manager.czk_prices(PRAGUE)
    assert len(prices) == 48
    assert prices[local(2026, 1, 5).astimezone(UTC).timestamp()] == pytest.approx(50.0 * 25.1)
    await manager.async_backfill(date(2026, 1, 5), date(2026, 1, 7), PRAGUE)
    assert len([c for c in calls if "ote-cr" in c]) == 2  # cached, no refetch


async def test_spot_manager_records_failures_without_raising(hass: HomeAssistant):
    async def fetch(url: str) -> str:
        raise TimeoutError

    manager = SpotManager(hass, fetch=fetch, delay=0)
    await manager.async_load()
    await manager.async_backfill(date(2026, 1, 5), date(2026, 1, 6), PRAGUE)
    status = manager.status()
    assert status["days"] == 0
    assert status["failed"] == 1


# ---------- offer model ----------


def test_sanitize_fixed_offer():
    offer = sanitize_offer(
        {"name": "  Fixní 2027 ", "kind": "fixed", "price_vt": "2 990,5", "price_nt": 2500}
    )
    assert offer["name"] == "Fixní 2027"
    assert offer["price_vt"] == 2990.5
    assert offer["monthly_fee"] == 0
    assert offer["export"] == {"mode": "none", "price": None, "fee": None}
    assert len(offer["id"]) == 12


def test_sanitize_spot_offer_with_buyback():
    offer = sanitize_offer(
        {
            "id": "abcdef012345",
            "name": "Spot",
            "kind": "spot",
            "margin": 350,
            "monthly_fee": 99,
            "export": {"mode": "spot", "fee": 400},
        }
    )
    assert offer["id"] == "abcdef012345"
    assert offer["export"] == {"mode": "spot", "price": None, "fee": 400.0}


@pytest.mark.parametrize(
    "raw",
    [
        {"name": "", "kind": "fixed", "price_vt": 1, "price_nt": 1},
        {"name": "x", "kind": "gas"},
        {"name": "x", "kind": "fixed", "price_vt": None, "price_nt": 1},
        {"name": "x", "kind": "spot", "margin": 1e9},
        {"name": "x", "kind": "spot", "margin": 1, "export": {"mode": "fixed"}},
    ],
)
def test_sanitize_offer_rejects(raw):
    with pytest.raises(OfferError):
        sanitize_offer(raw)


def test_regulated_defaults_from_the_spot_distribution_bindings():
    reg = regulated_defaults({"dist_vt": 2.42, "dist_nt": 1.21, "fixed": 605.0})
    assert reg["distribution_vt"] == pytest.approx(2000.0)
    assert reg["distribution_nt"] == pytest.approx(1000.0)
    assert reg["monthly_fixed"] == pytest.approx(500.0)
    assert reg["vat_percent"] == 21
    assert reg["year"] == 2026
    assert reg["source"] == "bindings"
    assert regulated_defaults({})["source"] == "empty"


def test_sanitize_regulated_keeps_vat_in_range():
    reg = sanitize_regulated({"distribution_vt": 1000, "vat_percent": 15})
    assert reg["vat_percent"] == 15
    assert reg["source"] == "saved"
    with pytest.raises(OfferError):
        sanitize_regulated({"vat_percent": 80})


# ---------- calculation ----------

REG = {
    "distribution_vt": 2000.0,
    "distribution_nt": 500.0,
    "system_services": 0.0,
    "poze": 0.0,
    "tax": 0.0,
    "monthly_fixed": 100.0,
    "vat_percent": 20,
    "current_export_price": 1000.0,
    "year": 2026,
    "source": "saved",
}
NT_ALL_DAY = [(0, 1440)]


def test_month_windows_last_complete_months_clipped_by_data():
    now = local(2026, 11, 8, 12)
    first = local(2026, 8, 15).astimezone(UTC).timestamp()
    windows = month_windows(now, PRAGUE, first)
    assert [w[0] for w in windows] == ["2026-08", "2026-09", "2026-10"]
    assert windows[0][3] == pytest.approx(17 / 31, abs=1e-3)  # fee share of the partial month
    assert windows[1][3] == 1.0
    full = month_windows(now, PRAGUE, local(2020, 1, 1).timestamp())
    assert len(full) == 12
    assert full[0][0] == "2025-11"


def _one_month():
    start, end = local(2026, 10, 1), local(2026, 11, 1)
    return hourly(start, end, 1.0), hourly(start, end, 0.5)


def test_fixed_offer_vs_current_contract_one_month():
    imp, exp = _one_month()
    hours = len(imp)  # 745 (DST end)
    current = Tariff(vt=5.0, nt=4.0, fixed_monthly=300.0, schedule=NT_ALL_DAY)
    offer = sanitize_offer(
        {
            "id": "fixed0000001",
            "name": "Fix",
            "kind": "fixed",
            "price_vt": 3000,
            "price_nt": 1500,
            "monthly_fee": 50,
        }
    )
    res = compare_offers(
        imports=imp,
        exports=exp,
        spot={},
        current=current,
        regulated=REG,
        offers=[offer],
        now=local(2026, 11, 8),
        tz=PRAGUE,
    )
    assert res["status"] == "ok"
    assert [m["month"] for m in res["months"]] == ["2026-10"]
    cur, off = (next(p for p in res["plans"] if p["id"] == i) for i in ("current", offer["id"]))
    # current: all NT 4 Kč/kWh incl. VAT + 300 fee - export 0.5 kWh × 1 Kč
    assert cur["total"] == pytest.approx(hours * 4.0 + 300 - hours * 0.5)
    # offer: (1500 + 500)/1000 per kWh + fees (50 + 100), +20 % VAT; no buy-back
    base = hours * 2.0 + 150
    assert off["total"] == pytest.approx(base * 1.2)
    assert off["months"][0]["vat"] == pytest.approx(base * 0.2)
    assert off["months"][0]["export"] == 0
    assert off["diff"] == pytest.approx(off["total"] - cur["total"])
    assert res["ranking"][0] == offer["id"]  # cheaper than the current contract


def test_spot_offer_uses_hourly_prices_and_buyback():
    start, end = local(2026, 10, 1), local(2026, 10, 2)
    imp, exp = hourly(start, end, 2.0), hourly(start, end, 1.0)
    spot = {t: 3000.0 for t, _ in imp}
    offer = sanitize_offer(
        {
            "id": "spot00000001",
            "name": "Spot",
            "kind": "spot",
            "margin": 500,
            "monthly_fee": 0,
            "export": {"mode": "spot", "fee": 1000},
        }
    )
    res = compare_offers(
        imports=imp,
        exports=exp,
        spot=spot,
        current=Tariff(None, None, None, None),
        regulated={**REG, "monthly_fixed": 0},
        offers=[offer],
        now=local(2026, 11, 8),
        tz=PRAGUE,
    )
    plan = next(p for p in res["plans"] if p["id"] == offer["id"])
    month = plan["months"][0]
    # 24 h × 2 kWh × (3000 + 500 + 2000 VT? no: NT schedule None -> all VT 2000) / 1000
    assert month["energy"] == pytest.approx(48 * 3.5)
    assert month["distribution"] == pytest.approx(48 * 2.0)
    assert month["export"] == pytest.approx(24 * 1.0 * 2.0)
    assert plan["total"] == pytest.approx((48 * 5.5) * 1.2 - 48)
    assert not any(p["id"] == "current" for p in res["plans"])  # no tariff -> no current plan


def test_spot_offer_month_without_prices_is_incomplete_and_excluded_from_totals():
    imp, exp = _one_month()
    spot = {t: 2000.0 for t, _ in imp[:-5]}
    offer = sanitize_offer({"id": "spot00000002", "name": "Spot", "kind": "spot", "margin": 0})
    current = Tariff(vt=5.0, nt=4.0, fixed_monthly=0.0, schedule=None)
    res = compare_offers(
        imports=imp,
        exports=exp,
        spot=spot,
        current=current,
        regulated=REG,
        offers=[offer],
        now=local(2026, 11, 8),
        tz=PRAGUE,
    )
    plan = next(p for p in res["plans"] if p["id"] == offer["id"])
    assert plan["missing_spot_hours"] == 5
    assert plan["months"][0]["total"] is None
    assert plan["total"] is None
    assert res["months_compared"] == 0
    assert res["ranking"][-1] == offer["id"]


def test_no_import_data_is_nodata():
    res = compare_offers(
        imports=[],
        exports=[],
        spot={},
        current=Tariff(5, 4, 0, None),
        regulated=REG,
        offers=[],
        now=local(2026, 11, 8),
        tz=PRAGUE,
    )
    assert res["status"] == "nodata"


# ---------- WebSocket ----------


@pytest.fixture
async def setup(hass: HomeAssistant, hass_admin_user):
    entry = MockConfigEntry(
        domain=DOMAIN,
        data={},
        options={
            "bindings": {
                "energy": {
                    "energy_spot_distribution_vt": "input_number.demo_dist_vt",
                    "energy_spot_distribution_nt": "input_number.demo_dist_nt",
                }
            }
        },
    )
    entry.add_to_hass(hass)
    assert await async_setup_component(hass, DOMAIN, {})
    await hass.async_block_till_done()
    hass.states.async_set("input_number.demo_dist_vt", "2.42")
    hass.states.async_set("input_number.demo_dist_nt", "1.21")
    return entry


async def test_ws_offer_crud_and_compare_unconfigured(hass: HomeAssistant, setup, hass_ws_client):
    client = await hass_ws_client(hass)
    await client.send_json_auto_id({"type": "homebrain/energy/offers/get"})
    got = (await client.receive_json())["result"]
    assert got["offers"] == []
    assert got["can_edit"] is True
    assert got["regulated"]["distribution_vt"] == pytest.approx(2000.0)

    await client.send_json_auto_id(
        {
            "type": "homebrain/energy/offers/save",
            "offer": {"name": "Fix", "kind": "fixed", "price_vt": 3000, "price_nt": 2000},
            "regulated": {**REG, "vat_percent": 21},
        }
    )
    saved = (await client.receive_json())["result"]
    assert len(saved["offers"]) == 1
    assert saved["regulated"]["vat_percent"] == 21
    offer_id = saved["offers"][0]["id"]

    await client.send_json_auto_id(
        {"type": "homebrain/energy/offers/save", "offer": {"name": "x", "kind": "gas"}}
    )
    assert (await client.receive_json())["error"]["code"] == "invalid_offer"

    await client.send_json_auto_id({"type": "homebrain/energy/offers/compare"})
    cmp = (await client.receive_json())["result"]
    assert cmp["status"] == "unconfigured"

    await client.send_json_auto_id({"type": "homebrain/energy/offers/delete", "offer_id": offer_id})
    assert (await client.receive_json())["result"]["offers"] == []
