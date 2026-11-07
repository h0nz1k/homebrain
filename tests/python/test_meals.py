"""Dnes „Co se dnes vaří“: Mealie meal plan discovery, mapping, Recepty links, roles, timezone.

Synthetic data only: a mocked ``mealie.get_mealplan`` service and made-up recipes.
"""

from __future__ import annotations

from datetime import date
from typing import Any

import pytest
from homeassistant.config_entries import ConfigEntryState
from homeassistant.core import HomeAssistant, ServiceCall, SupportsResponse
from homeassistant.setup import async_setup_component
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.homebrain.const import DOMAIN
from custom_components.homebrain.meals import model
from custom_components.homebrain.roles import role_ws_commands

TODAY = date(2026, 6, 2)


def _plan(day: str, kind: str, name: str | None, *, slug=None, url=None, title="", pid=1):
    recipe = (
        {"recipe_id": f"r{pid}", "name": name, "slug": slug or f"slug-{pid}", "original_url": url}
        if name
        else None
    )
    return {
        "mealplan_id": pid,
        "entry_type": kind,
        "mealplan_date": day,
        "title": title,
        "description": "",
        "recipe": recipe,
    }


# --- pure mapping --------------------------------------------------------------------------


def test_meals_sorted_by_meal_type_then_plan_order():
    plans = [
        _plan("2026-06-02", "dinner", "Rizoto s houbami", pid=1),
        _plan("2026-06-02", "breakfast", "Ovesná kaše", pid=2),
        _plan("2026-06-02", "snack", "Jablečný koláč", pid=3),
        _plan("2026-06-02", "lunch", "Kuřecí vývar", pid=4),
        _plan("2026-06-02", "lunch", None, title="Zbytky z neděle", pid=5),
        _plan("2026-06-03", "lunch", "Zítřejší guláš", pid=6),
        _plan("2026-06-02", "side", "Bramborová kaše", pid=7),
    ]
    meals = model.build_meals(plans, TODAY, [])
    assert [(m["type"], m["title"]) for m in meals] == [
        ("breakfast", "Ovesná kaše"),
        ("lunch", "Kuřecí vývar"),
        ("lunch", "Zbytky z neděle"),
        ("snack", "Jablečný koláč"),
        ("dinner", "Rizoto s houbami"),
        ("side", "Bramborová kaše"),
    ]
    assert meals[0]["label"] == "Snídaně"
    assert meals[3]["label"] == "Svačina"
    assert meals[2]["slug"] is None and meals[2]["recipe_id"] is None


def test_unknown_meal_type_goes_last_and_bad_rows_are_skipped():
    plans = [
        {"entry_type": "brunch", "mealplan_date": "2026-06-02", "title": "Palačinky"},
        "garbage",
        {"entry_type": "lunch", "mealplan_date": "2026-06-02"},  # neither recipe nor title
        _plan("2026-06-02", "dinner", "Halušky", pid=9),
    ]
    meals = model.build_meals(plans, TODAY, [])
    assert [(m["type"], m["label"], m["title"]) for m in meals] == [
        ("dinner", "Večeře", "Halušky"),
        ("other", "Jídlo", "Palačinky"),
    ]


def test_meal_links_to_recepty_by_source_url_slug_or_name():
    local = [
        {"id": "a1", "title": "Svíčková na smetaně", "sourceUrl": None},
        {"id": "b2", "title": "Něco jiného", "sourceUrl": "https://recepty.example/svickova"},
        {"id": "c3", "title": "Kulajda", "sourceUrl": "http://mealie.local/g/home/r/kulajda-babi"},
    ]
    plans = [
        _plan("2026-06-02", "lunch", "Moje svíčková", url="https://recepty.example/svickova/"),
        _plan("2026-06-02", "dinner", "Polévka", slug="kulajda-babi", pid=2),
        _plan("2026-06-02", "snack", "SVICKOVA na smetane", pid=3),
        _plan("2026-06-02", "side", "Neznámý recept", pid=4),
    ]
    by_type = {m["type"]: m["recipe_id"] for m in model.build_meals(plans, TODAY, local)}
    assert by_type == {"lunch": "b2", "dinner": "c3", "snack": "a1", "side": None}


def test_no_plans_is_empty():
    assert model.build_meals([], TODAY, []) == []


# --- WS command ----------------------------------------------------------------------------


@pytest.fixture
def mealie(hass: HomeAssistant):
    """A loaded Mealie entry + mocked ``mealie.get_mealplan`` returning ``plans``."""
    state: dict[str, Any] = {"plans": [], "calls": []}

    async def get_mealplan(call: ServiceCall):
        state["calls"].append(dict(call.data))
        return {"mealplan": state["plans"]}

    entry = MockConfigEntry(domain="mealie", data={}, title="Mealie")
    entry.add_to_hass(hass)
    entry.mock_state(hass, ConfigEntryState.LOADED)
    hass.services.async_register(
        "mealie", "get_mealplan", get_mealplan, supports_response=SupportsResponse.ONLY
    )
    state["entry"] = entry
    yield state
    # The real Mealie integration is not installed here: never let teardown unload it.
    entry.mock_state(hass, ConfigEntryState.NOT_LOADED)


@pytest.fixture
async def hb(hass: HomeAssistant):
    entry = MockConfigEntry(domain=DOMAIN, data={}, options={})
    entry.add_to_hass(hass)
    assert await async_setup_component(hass, DOMAIN, {})
    await hass.async_block_till_done()
    return entry


async def _get(hass_ws_client, hass, client=None) -> dict[str, Any]:
    client = client or await hass_ws_client(hass)
    await client.send_json_auto_id({"type": "homebrain/today/meals"})
    return await client.receive_json()


async def test_ws_meals_for_today(hass, hb, mealie, hass_ws_client, freezer):
    await hass.config.async_set_time_zone("Europe/Prague")
    client = await hass_ws_client(hass)  # auth before the clock jumps
    freezer.move_to("2026-06-02T07:00:00+00:00")
    mealie["plans"] = [
        _plan("2026-06-02", "dinner", "Rizoto s houbami", pid=1),
        _plan("2026-06-02", "lunch", "Kuřecí vývar", pid=2),
    ]
    msg = await _get(hass_ws_client, hass, client)
    assert msg["success"], msg
    res = msg["result"]
    assert res["date"] == "2026-06-02"
    assert res["configured"] is True
    assert res["can_plan"] is True  # HA admin gets the „naplánujte v Mealie“ hint
    assert [m["title"] for m in res["meals"]] == ["Kuřecí vývar", "Rizoto s houbami"]
    assert mealie["calls"] == [
        {
            "config_entry_id": mealie["entry"].entry_id,
            "start_date": "2026-06-02",
            "end_date": "2026-06-02",
        }
    ]


async def test_ws_uses_prague_date_after_utc_midnight_boundary(
    hass, hb, mealie, hass_ws_client, freezer
):
    # 22:30 UTC on 1 June = 00:30 on 2 June in Prague (CEST): today is the 2nd.
    await hass.config.async_set_time_zone("Europe/Prague")
    client = await hass_ws_client(hass)  # auth before the clock jumps
    freezer.move_to("2026-06-01T22:30:00+00:00")
    mealie["plans"] = [
        _plan("2026-06-01", "dinner", "Včerejší večeře", pid=1),
        _plan("2026-06-02", "breakfast", "Dnešní snídaně", pid=2),
    ]
    res = (await _get(hass_ws_client, hass, client))["result"]
    assert res["date"] == "2026-06-02"
    assert [m["title"] for m in res["meals"]] == ["Dnešní snídaně"]
    assert mealie["calls"][0]["start_date"] == "2026-06-02"


async def test_ws_without_mealie_is_calm_empty(hass, hb, hass_ws_client):
    res = (await _get(hass_ws_client, hass))["result"]
    assert res["configured"] is False
    assert res["available"] is False
    assert res["meals"] == []
    assert res["errors"] == []


async def test_ws_mealie_error_is_reported_not_raised(hass, hb, hass_ws_client):
    async def broken(call: ServiceCall):
        raise RuntimeError("mealie down")

    entry = MockConfigEntry(domain="mealie", data={})
    entry.add_to_hass(hass)
    entry.mock_state(hass, ConfigEntryState.LOADED)
    hass.services.async_register(
        "mealie", "get_mealplan", broken, supports_response=SupportsResponse.ONLY
    )
    res = (await _get(hass_ws_client, hass))["result"]
    entry.mock_state(hass, ConfigEntryState.NOT_LOADED)
    assert res["configured"] is True
    assert res["meals"] == []
    assert res["errors"] == ["mealie"]


async def test_ws_kiosk_sees_meals_without_plan_hint(
    hass, hb, mealie, hass_ws_client, hass_admin_user
):
    hass_admin_user.groups = []
    hass.config_entries.async_update_entry(hb, options={"roles": {hass_admin_user.id: "kiosk"}})
    msg = await _get(hass_ws_client, hass)
    assert msg["success"], msg
    assert msg["result"]["can_plan"] is False


async def test_ws_unmapped_user_is_rejected(hass, hb, mealie, hass_ws_client, hass_admin_user):
    hass_admin_user.groups = []
    msg = await _get(hass_ws_client, hass)
    assert not msg["success"]
    assert msg["error"]["code"] == "unauthorized"


def test_every_mapped_role_may_read_meals():
    for role in ("adult", "child", "kiosk"):
        assert "homebrain/today/meals" in role_ws_commands(role)
    assert "homebrain/today/meals" not in role_ws_commands("guest")


async def test_ws_without_mealie_is_unavailable_and_silent(hass, hb, hass_ws_client, caplog):
    """No Mealie = Dnes hides the tile: ``available`` false, no service call, nothing logged."""
    caplog.clear()
    msg = await _get(hass_ws_client, hass)
    assert msg["success"], msg
    assert msg["result"]["available"] is False
    assert msg["result"]["meals"] == []
    noisy = [r for r in caplog.records if r.levelname in ("WARNING", "ERROR", "CRITICAL")]
    assert noisy == []
    assert "mealie" not in caplog.text.lower()


async def test_ws_mealie_entry_not_loaded_is_unavailable(hass, hb, hass_ws_client):
    calls: list[Any] = []

    async def get_mealplan(call: ServiceCall):
        calls.append(call)
        return {"mealplan": []}

    MockConfigEntry(domain="mealie", data={}).add_to_hass(hass)  # NOT_LOADED (removed add-on)
    hass.services.async_register(
        "mealie", "get_mealplan", get_mealplan, supports_response=SupportsResponse.ONLY
    )
    res = (await _get(hass_ws_client, hass))["result"]
    assert res["available"] is False
    assert res["errors"] == []
    assert calls == []


async def test_ws_with_mealie_is_available(hass, hb, mealie, hass_ws_client):
    res = (await _get(hass_ws_client, hass))["result"]
    assert res["available"] is True
    assert res["configured"] is True


async def test_ws_meals_switched_off_skips_mealie(hass, hb, mealie, hass_ws_client):
    hass.config_entries.async_update_entry(hb, options={"meals_display": "off"})
    await hass.async_block_till_done()
    mealie["plans"] = [_plan("2026-06-02", "lunch", "Kuřecí vývar", pid=1)]
    res = (await _get(hass_ws_client, hass))["result"]
    assert res["available"] is False
    assert res["meals"] == []
    assert mealie["calls"] == []


async def _meals_step(hass, entry, value: str) -> None:
    result = await hass.config_entries.options.async_init(entry.entry_id)
    assert "meals" in result["menu_options"]
    result = await hass.config_entries.options.async_configure(
        result["flow_id"], {"next_step_id": "meals"}
    )
    assert result["step_id"] == "meals"
    assert {str(key) for key in result["data_schema"].schema} == {"meals_display"}
    await hass.config_entries.options.async_configure(result["flow_id"], {"meals_display": value})
    await hass.async_block_till_done()


async def test_options_meals_display_toggle(hass, hb):
    await _meals_step(hass, hb, "off")
    assert hb.options["meals_display"] == "off"
    await _meals_step(hass, hb, "auto")
    assert "meals_display" not in hb.options  # auto = default: old entries stay byte-identical
