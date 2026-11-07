"""Odpady: data horizon (last known pickup overall and per waste type) + repair issue."""

from datetime import UTC, date, datetime, timedelta

from homeassistant.core import HomeAssistant
from homeassistant.helpers import issue_registry as ir
from homeassistant.setup import async_setup_component
from homeassistant.util import dt as dt_util
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.homebrain.const import DOMAIN
from custom_components.homebrain.waste.horizon import (
    REPAIR_ISSUE_ID,
    async_update_horizon_issue,
    compute_horizon,
)

NOW = datetime(2026, 12, 10, 12, 0, tzinfo=UTC)


def rec(day: str, label: str) -> dict[str, str]:
    return {"date": day, "label": label}


def test_empty_dataset_has_no_horizon_and_no_warning():
    result = compute_horizon([], NOW)
    assert result == {
        "status": "empty",
        "last_date": None,
        "days_left": None,
        "warn_days": 30,
        "warning": False,
        "types": [],
    }


def test_far_horizon_is_ok():
    records = [rec("2026-12-12", "Plasty"), rec("2027-03-30", "Papir")]
    result = compute_horizon(records, NOW)
    assert result["status"] == "ok"
    assert result["last_date"] == "2027-03-30"
    assert result["days_left"] == 110
    assert result["warning"] is False


def test_some_types_ending_lists_last_pickup_per_type():
    records = [
        rec("2026-11-20", "Plasty"),
        rec("2026-12-16", "Plasty"),
        rec("2026-12-30", "Papír"),
        rec("2026-12-02", "Papir"),  # same type, different spelling
        rec("2026-10-22", "Nebezpecny odpad"),  # no further pickup known at all
    ]
    result = compute_horizon(records, NOW)
    assert result["status"] == "ending"
    assert result["last_date"] == "2026-12-30"
    assert result["days_left"] == 20
    assert result["warning"] is True
    assert result["types"] == [
        {"label": "Nebezpecny odpad", "last_date": "2026-10-22", "days_left": -49},
        {"label": "Plasty", "last_date": "2026-12-16", "days_left": 6},
        {"label": "Papír", "last_date": "2026-12-30", "days_left": 20},
    ]


def test_all_types_ended():
    result = compute_horizon([rec("2026-12-01", "Plasty")], NOW)
    assert result["status"] == "ended"
    assert result["days_left"] == -9
    assert result["warning"] is True


def test_threshold_is_configurable():
    records = [rec("2026-12-30", "Plasty")]
    assert compute_horizon(records, NOW, warn_days=14)["warning"] is False
    assert compute_horizon(records, NOW, warn_days=14)["status"] == "ok"
    assert compute_horizon(records, NOW, warn_days=21)["warning"] is True


def test_invalid_records_are_ignored():
    records = [rec("2026-13-01", "Plasty"), {"date": 5, "label": "x"}, rec("2026-12-20", " ")]
    assert compute_horizon(records, NOW)["status"] == "empty"


async def test_days_count_in_local_time_zone(hass: HomeAssistant):
    await hass.config.async_set_time_zone("Europe/Prague")
    # 23:30 UTC on 29 Dec is already 30 Dec in Prague: the last pickup is today.
    late = datetime(2026, 12, 29, 23, 30, tzinfo=UTC)
    result = compute_horizon([rec("2026-12-30", "Plasty")], late)
    assert result["days_left"] == 0
    assert result["status"] == "ending"


async def test_repair_issue_only_below_14_days(hass: HomeAssistant):
    await hass.config.async_set_time_zone("Europe/Prague")
    registry = ir.async_get(hass)
    today = dt_util.now().date()

    def horizon_in(days: int) -> dict:
        return compute_horizon(
            [rec((today + timedelta(days=days)).isoformat(), "Plasty")], dt_util.now()
        )

    async_update_horizon_issue(hass, horizon_in(20))
    assert registry.async_get_issue(DOMAIN, REPAIR_ISSUE_ID) is None

    async_update_horizon_issue(hass, horizon_in(10))
    issue = registry.async_get_issue(DOMAIN, REPAIR_ISSUE_ID)
    assert issue is not None
    assert issue.translation_key == "waste_data_horizon"
    assert issue.severity == ir.IssueSeverity.WARNING
    last = today + timedelta(days=10)
    assert issue.translation_placeholders == {
        "last_date": f"{last.day}. {last.month}. {last.year}",
        "next_year": str(last.year + 1 if last.month == 12 else last.year),
    }

    # New schedule published -> the issue disappears by itself.
    async_update_horizon_issue(hass, horizon_in(200))
    assert registry.async_get_issue(DOMAIN, REPAIR_ISSUE_ID) is None

    # No data at all is reported by the panel itself, not as a horizon issue.
    async_update_horizon_issue(hass, horizon_in(5))
    async_update_horizon_issue(hass, compute_horizon([], dt_util.now()))
    assert registry.async_get_issue(DOMAIN, REPAIR_ISSUE_ID) is None


async def test_repair_issue_asks_for_next_year_when_december_ends(hass: HomeAssistant):
    records = [rec("2026-12-30", "Plasty")]
    async_update_horizon_issue(hass, compute_horizon(records, datetime(2026, 12, 20, tzinfo=UTC)))
    issue = ir.async_get(hass).async_get_issue(DOMAIN, REPAIR_ISSUE_ID)
    assert issue.translation_placeholders == {"last_date": "30. 12. 2026", "next_year": "2027"}


def test_date_only_records_keep_iso_dates():
    result = compute_horizon([rec(date(2027, 1, 5).isoformat(), "Sklo")], NOW)
    assert result["types"][0]["last_date"] == "2027-01-05"


async def test_ws_history_reports_horizon_and_refresh_raises_issue(
    hass: HomeAssistant, hass_ws_client
):
    async def _setup(hass: HomeAssistant, bindings: dict[str, str]) -> None:
        entry = MockConfigEntry(domain=DOMAIN, data={}, options={"bindings": {"waste": bindings}})
        entry.add_to_hass(hass)
        assert await async_setup_component(hass, DOMAIN, {})
        await hass.async_block_till_done()

    await hass.config.async_set_time_zone("Europe/Prague")
    today = dt_util.now().date()

    def day(offset: int) -> str:
        return (today + timedelta(days=offset)).isoformat()

    hass.states.async_set(
        "sensor.svoz", "Papir", {day(3): "Papir", day(10): "Plasty", "friendly_name": "Svoz"}
    )
    hass.states.async_set("sensor.data_do", "data do", {"history": {day(-30): "Barevne sklo"}})
    await _setup(hass, {"waste_next": "sensor.svoz", "waste_history": "sensor.data_do"})

    client = await hass_ws_client(hass)
    await client.send_json_auto_id({"type": "homebrain/waste/history"})
    msg = await client.receive_json()
    assert msg["success"], msg
    horizon = msg["result"]["horizon"]
    assert horizon["status"] == "ending"
    assert horizon["last_date"] == day(10)
    assert horizon["days_left"] == 10
    assert [t["label"] for t in horizon["types"]] == ["Barevne sklo", "Papir", "Plasty"]
    # Future pickups stay out of the history list itself.
    assert msg["result"]["events"] == [{"date": day(-30), "label": "Barevne sklo"}]

    await client.send_json_auto_id({"type": "homebrain/waste/history", "warn_days": 7})
    msg = await client.receive_json()
    assert msg["result"]["horizon"]["warning"] is False

    # The refresh (start-up) already raised the admin repair issue: < 14 days left.
    assert ir.async_get(hass).async_get_issue(DOMAIN, REPAIR_ISSUE_ID) is not None
