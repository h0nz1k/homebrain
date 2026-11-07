"""Rodina MVP: discovery (calendars, shopping list, ChoreOps kids), roles and service calls.

Synthetic household only: two ChoreOps children („Dcera“, „Syn“), mocked HA services.
"""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any

import pytest
from homeassistant.core import HomeAssistant, ServiceCall, SupportsResponse
from homeassistant.setup import async_setup_component
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.homebrain.const import DOMAIN
from custom_components.homebrain.family import model
from custom_components.homebrain.roles import role_ws_commands

NOW = datetime.fromisoformat("2026-06-02T09:00:00+02:00")


def _kid(hass: HomeAssistant, slug: str, name: str, chores: list[dict[str, Any]], points: float):
    hass.states.async_set(
        f"sensor.{slug}_choreops_body",
        str(points),
        {"purpose": "purpose_points", "user_name": name, "point_stat_points_earned_today": "3.0"},
    )
    hass.states.async_set(
        f"sensor.{slug}_choreops_ui_dashboard_helper",
        "available",
        {
            "purpose": "purpose_dashboard_helper",
            "user_name": name,
            "chores": chores,
            "core_sensors": {"points_eid": f"sensor.{slug}_choreops_body"},
        },
    )


def _chore(hass, slug: str, key: str, name: str, state: str, group="today", points=2.0):
    eid = f"sensor.{slug}_choreops_chore_{key}"
    hass.states.async_set(
        eid, state, {"default_points": points, "due_date": "2026-06-02T16:00:00+00:00"}
    )
    return {"eid": eid, "name": name, "state": state, "labels": [], "primary_group": group}


def household(hass: HomeAssistant) -> None:
    _kid(
        hass,
        "dcera",
        "Dcera",
        [
            _chore(hass, "dcera", "kos", "Vynést koš", "approved"),
            _chore(hass, "dcera", "luxovat", "Vyluxovat pokoj", "claimed", points=4),
            _chore(hass, "dcera", "kytky", "Zalít květiny", "pending"),
            _chore(hass, "dcera", "okna", "Umýt okna", "pending", group="other"),
        ],
        128,
    )
    _kid(hass, "syn", "Syn", [_chore(hass, "syn", "boty", "Uklidit boty", "overdue", points=1)], 74)
    hass.states.async_set("calendar.rodina", "off", {"friendly_name": "Rodina"})
    hass.states.async_set("calendar.skola_syn", "off", {"friendly_name": "Škola"})
    hass.states.async_set("calendar.vlaky", "off", {"friendly_name": "Odjezdy vlaků"})
    hass.states.async_set("calendar.mealie_obed", "off", {"friendly_name": "Mealie Oběd"})
    hass.states.async_set(
        "calendar.syn_choreops_calendar", "off", {"purpose": "purpose_calendar_schedule"}
    )
    hass.states.async_set(
        "todo.nakup", "2", {"friendly_name": "Nákupní seznam", "supported_features": 15}
    )


# --- pure discovery -------------------------------------------------------------------------


def test_discover_kids_from_choreops_helpers(hass: HomeAssistant):
    household(hass)
    kids = model.discover_kids(hass.states.async_all(), {})
    assert [k["name"] for k in kids] == ["Dcera", "Syn"]
    assert kids[0]["id"] == "dcera"
    assert kids[0]["points_entity"] == "sensor.dcera_choreops_body"


def test_chore_rows_today_with_states_and_points(hass: HomeAssistant):
    household(hass)
    kid = model.discover_kids(hass.states.async_all(), {})[0]
    rows = model.kid_chores(hass.states.get, kid)
    assert [(r["name"], r["state"], r["points"]) for r in rows] == [
        ("Vynést koš", "done", 2.0),
        ("Vyluxovat pokoj", "claimed", 4.0),
        ("Zalít květiny", "todo", 2.0),
    ]
    assert rows[0]["id"] == "sensor.dcera_choreops_chore_kos"


def test_calendars_auto_discovery_skips_foreign_sources(hass: HomeAssistant):
    household(hass)
    cals = model.family_calendars(hass.states.async_all(), {}, {})
    assert [(c["entity_id"], c["kind"]) for c in cals] == [
        ("calendar.rodina", "family"),
        ("calendar.skola_syn", "school"),
    ]


def test_calendars_bindings_win_over_auto_discovery(hass: HomeAssistant):
    household(hass)
    cals = model.family_calendars(
        hass.states.async_all(), {"family_calendar_family": "calendar.vlaky"}, {}
    )
    assert [c["entity_id"] for c in cals] == ["calendar.vlaky"]


def test_shopping_list_binding_then_first_todo(hass: HomeAssistant):
    household(hass)
    assert model.shopping_entity(hass.states.async_all(), {}, {}) == "todo.nakup"
    assert model.shopping_entity([], {"family_todo_shared": "todo.x"}, {}) == "todo.x"


def test_events_privacy_strips_details_for_child_and_kiosk():
    raw = {
        "calendar.rodina": [
            {
                "start": "2026-06-02T16:30:00+02:00",
                "end": "2026-06-02T18:00:00+02:00",
                "summary": "Trénink",
                "location": "Hala",
                "description": "Vzít dres",
            },
            {"start": "2026-06-03", "end": "2026-06-04", "summary": "Výlet"},
        ]
    }
    cals = [{"entity_id": "calendar.rodina", "name": "Rodina", "kind": "family"}]
    adult = model.build_events(raw, cals, "adult")
    assert adult[0]["location"] == "Hala" and adult[1]["all_day"] is True
    for role in ("child", "kiosk"):
        ev = model.build_events(raw, cals, role)[0]
        assert "location" not in ev and "description" not in ev


# --- WebSocket ------------------------------------------------------------------------------


def _ids(call: ServiceCall) -> list[str]:
    eid = call.data["entity_id"]
    return [eid] if isinstance(eid, str) else list(eid)


@pytest.fixture
async def calls(hass: HomeAssistant):
    """Mock HA services: calendar/todo reads + ChoreOps/todo writes (recorded)."""
    recorded: list[tuple[str, str, dict[str, Any]]] = []
    start = (datetime.now().astimezone() + timedelta(hours=1)).replace(microsecond=0)

    async def get_events(call: ServiceCall):
        return {
            eid: {
                "events": [
                    {
                        "start": start.isoformat(),
                        "end": (start + timedelta(hours=1)).isoformat(),
                        "summary": f"Akce {eid}",
                        "location": "Tajné místo",
                    }
                ]
            }
            for eid in _ids(call)
        }

    async def get_items(call: ServiceCall):
        return {
            eid: {
                "items": [
                    {"uid": "u1", "summary": "Mléko", "status": "needs_action"},
                    {"uid": "u2", "summary": "Máslo", "status": "completed"},
                ]
            }
            for eid in _ids(call)
        }

    def recorder(domain: str, service: str):
        async def handler(call: ServiceCall):
            data = dict(call.data)
            if "entity_id" in data:
                data["entity_id"] = _ids(call)
            recorded.append((domain, service, data))

        return handler

    hass.services.async_register(
        "calendar", "get_events", get_events, supports_response=SupportsResponse.ONLY
    )
    hass.services.async_register(
        "todo", "get_items", get_items, supports_response=SupportsResponse.ONLY
    )
    for domain, service in (
        ("todo", "add_item"),
        ("todo", "update_item"),
        ("choreops", "claim_chore"),
        ("choreops", "approve_chore"),
    ):
        hass.services.async_register(domain, service, recorder(domain, service))
    return recorded


@pytest.fixture
async def entry(hass: HomeAssistant, calls):
    household(hass)
    entry = MockConfigEntry(domain=DOMAIN, data={}, options={})
    entry.add_to_hass(hass)
    assert await async_setup_component(hass, DOMAIN, {})
    await hass.async_block_till_done()
    return entry


async def _as(hass, entry, user, role: str | None, kids: list[dict] | None = None):
    if role != "owner":
        user.groups = []
    options: dict[str, Any] = {"roles": {user.id: role}} if role not in (None, "owner") else {}
    if kids is not None:
        options["family"] = {"kids": kids}
    hass.config_entries.async_update_entry(entry, options=options)


async def _ws(client, payload: dict[str, Any]) -> dict[str, Any]:
    await client.send_json_auto_id(payload)
    return await client.receive_json()


async def test_get_owner_sees_everything(hass, entry, hass_ws_client, hass_admin_user):
    client = await hass_ws_client(hass)
    msg = await _ws(client, {"type": "homebrain/family/get"})
    assert msg["success"], msg
    res = msg["result"]
    assert res["role"] == "owner"
    assert [k["name"] for k in res["kids"]] == ["Dcera", "Syn"]
    assert res["kids"][0]["points"] == 128 and res["kids"][0]["points_today"] == 3
    assert res["events"][0]["location"] == "Tajné místo"
    assert [i["summary"] for i in res["shopping"]["items"]] == ["Mléko", "Máslo"]
    assert res["kids"][0]["chores"][1]["can_approve"] is True


async def test_child_sees_only_own_chores_without_details(
    hass, entry, hass_ws_client, hass_admin_user
):
    await _as(
        hass, entry, hass_admin_user, "child", [{"name": "Syn", "user_id": hass_admin_user.id}]
    )
    client = await hass_ws_client(hass)
    res = (await _ws(client, {"type": "homebrain/family/get"}))["result"]
    assert [k["name"] for k in res["kids"]] == ["Syn"]
    assert res["kids"][0]["chores"][0]["can_claim"] is True
    assert "location" not in res["events"][0]
    # Another kid's chore: refused, nothing called.
    msg = await _ws(
        client,
        {
            "type": "homebrain/family/chore/claim",
            "kid": "dcera",
            "chore": "sensor.dcera_choreops_chore_kytky",
        },
    )
    assert msg["error"]["code"] == "unauthorized"


async def test_unmapped_child_gets_no_chores(hass, entry, hass_ws_client, hass_admin_user):
    await _as(hass, entry, hass_admin_user, "child")
    client = await hass_ws_client(hass)
    res = (await _ws(client, {"type": "homebrain/family/get"}))["result"]
    assert res["kids"] == []


async def test_kiosk_claims_chore_via_choreops(hass, entry, hass_ws_client, hass_admin_user, calls):
    await _as(hass, entry, hass_admin_user, "kiosk")
    client = await hass_ws_client(hass)
    res = (await _ws(client, {"type": "homebrain/family/get"}))["result"]
    assert all(not c["can_approve"] for k in res["kids"] for c in k["chores"])
    msg = await _ws(
        client,
        {
            "type": "homebrain/family/chore/claim",
            "kid": "dcera",
            "chore": "sensor.dcera_choreops_chore_kytky",
        },
    )
    assert msg["success"], msg
    assert calls == [
        ("choreops", "claim_chore", {"user_name": "Dcera", "chore_name": "Zalít květiny"})
    ]
    msg = await _ws(
        client,
        {
            "type": "homebrain/family/chore/approve",
            "kid": "dcera",
            "chore": "sensor.dcera_choreops_chore_luxovat",
        },
    )
    assert msg["error"]["code"] == "unauthorized"


async def test_adult_approves_with_configured_approver(
    hass, entry, hass_ws_client, hass_admin_user, calls
):
    await _as(hass, entry, hass_admin_user, "adult")
    hass.config_entries.async_update_entry(
        entry, options={**entry.options, "family": {"approver_name": "Máma"}}
    )
    client = await hass_ws_client(hass)
    msg = await _ws(
        client,
        {
            "type": "homebrain/family/chore/approve",
            "kid": "dcera",
            "chore": "sensor.dcera_choreops_chore_luxovat",
        },
    )
    assert msg["success"], msg
    assert calls == [
        (
            "choreops",
            "approve_chore",
            {"approver_name": "Máma", "user_name": "Dcera", "chore_name": "Vyluxovat pokoj"},
        )
    ]


async def test_unknown_chore_is_not_found(hass, entry, hass_ws_client, hass_admin_user, calls):
    client = await hass_ws_client(hass)
    msg = await _ws(
        client, {"type": "homebrain/family/chore/claim", "kid": "dcera", "chore": "sensor.nope"}
    )
    assert msg["error"]["code"] == "not_found"
    assert calls == []


@pytest.mark.parametrize("role", ["owner", "adult", "child", "kiosk"])
async def test_shopping_add_and_check_off_for_all_family_roles(
    hass, entry, hass_ws_client, hass_admin_user, calls, role
):
    await _as(hass, entry, hass_admin_user, role)
    client = await hass_ws_client(hass)
    assert (await _ws(client, {"type": "homebrain/family/shopping/add", "summary": " Rohlíky "}))[
        "success"
    ]
    assert (
        await _ws(client, {"type": "homebrain/family/shopping/update", "uid": "u1", "done": True})
    )["success"]
    assert calls == [
        ("todo", "add_item", {"entity_id": ["todo.nakup"], "item": "Rohlíky"}),
        ("todo", "update_item", {"entity_id": ["todo.nakup"], "item": "u1", "status": "completed"}),
    ]


async def test_guest_is_refused(hass, entry, hass_ws_client, hass_admin_user):
    await _as(hass, entry, hass_admin_user, None)
    client = await hass_ws_client(hass)
    for payload in (
        {"type": "homebrain/family/get"},
        {"type": "homebrain/family/shopping/add", "summary": "x"},
    ):
        assert (await _ws(client, payload))["error"]["code"] == "unauthorized"


async def test_settings_admin_only_roundtrip(hass, entry, hass_ws_client, hass_admin_user):
    client = await hass_ws_client(hass)
    msg = await _ws(
        client,
        {
            "type": "homebrain/family/settings/set",
            "kids": [{"name": "Syn", "user_id": "u-syn"}],
            "approver_name": "Táta",
        },
    )
    assert msg["success"], msg
    res = (await _ws(client, {"type": "homebrain/family/settings/get"}))["result"]
    assert res["kids"] == [{"name": "Syn", "user_id": "u-syn"}]
    assert res["approver_name"] == "Táta"
    assert {c["entity_id"] for c in res["candidates"]["calendars"]} >= {
        "calendar.rodina",
        "calendar.vlaky",
    }


def test_role_matrix_lists_family_commands():
    for role in ("adult", "child", "kiosk"):
        assert "homebrain/family/get" in role_ws_commands(role)
        assert "homebrain/family/shopping/update" in role_ws_commands(role)
    assert "homebrain/family/chore/approve" in role_ws_commands("adult")
    assert "homebrain/family/chore/approve" not in role_ws_commands("kiosk")
    assert "homebrain/family/chore/approve" not in role_ws_commands("child")
    assert "homebrain/family/get" not in role_ws_commands("guest")
