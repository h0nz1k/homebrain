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
    assert "homebrain/family/chore/create" in role_ws_commands("adult")
    assert "homebrain/family/swap/request" in role_ws_commands("child")
    assert "homebrain/family/chore/approve" not in role_ws_commands("kiosk")
    assert "homebrain/family/chore/approve" not in role_ws_commands("child")
    assert "homebrain/family/get" not in role_ws_commands("guest")


# ChoreOps 1.6 validates create_chore with a strict vol.Schema (extra keys rejected).
# Mirror its public field set so a stray key (e.g. ``return_response``) fails here
# exactly like on the real install.
CHOREOPS_CREATE_FIELDS = (
    "config_entry_id",
    "config_entry_title",
    "name",
    "assigned_user_names",
    "assigned_user_ids",
    "points",
    "description",
    "icon",
    "labels",
    "frequency",
    "custom_interval",
    "custom_interval_unit",
    "applicable_days",
    "completion_criteria",
    "standby_claim_mode",
    "approval_reset_type",
    "pending_claims",
    "overdue_handling",
    "chore_claim_lock_until_window",
    "auto_approve",
    "due_date",
    "due_window_offset",
    "due_reminder_offset",
    "notification_channel",
    "notification_importance",
    "notify_on_claim",
    "notify_on_approval",
    "notify_on_disapproval",
    "notify_on_overdue",
    "notify_on_due_window",
    "notify_due_reminder",
    "show_on_calendar",
)


def _strict_create_chore(hass: HomeAssistant, recorded: list[dict[str, Any]]) -> None:
    import voluptuous as vol

    schema = vol.Schema(
        {vol.Required("name"): str, **{vol.Optional(k): object for k in CHOREOPS_CREATE_FIELDS}}
    )

    async def handler(call: ServiceCall):
        recorded.append(dict(call.data))
        # ChoreOps 1.6 handle_create_chore returns {"id": internal_id}
        return {"id": f"chore-new-{len(recorded)}"}

    hass.services.async_register(
        "choreops",
        "create_chore",
        handler,
        schema=schema,
        supports_response=SupportsResponse.OPTIONAL,
    )
    MockConfigEntry(domain="choreops", data={}, entry_id="choreops-entry").add_to_hass(hass)


async def test_adult_creates_chore_via_strict_choreops_schema(
    hass, entry, hass_ws_client, hass_admin_user
):
    recorded: list[dict[str, Any]] = []
    _strict_create_chore(hass, recorded)
    await _as(hass, entry, hass_admin_user, "adult")
    client = await hass_ws_client(hass)
    msg = await _ws(
        client,
        {
            "type": "homebrain/family/chore/create",
            "client_request_id": "req-12345678",
            "name": "Zalít květiny",
            "points": 2,
            "assignees": ["dcera"],
            "recurrence": "weekly",
            "weekdays": ["mon", "thu"],
            "first_date": "2026-11-19",
            "due_time": "18:00",
            "icon": "mdi:flower",
        },
    )
    assert msg["success"], msg
    assert msg["result"]["chore_id"] == "chore-new-1"
    assert msg["result"]["status"] == "created"
    assert len(recorded) == 1
    data = recorded[0]
    assert "return_response" not in data
    assert data["assigned_user_names"] == ["Dcera"]
    assert data["applicable_days"] == ["mon", "thu"]
    assert data["due_date"] == "2026-11-19T18:00:00"


def test_swap_create_effect_has_only_choreops_fields():
    from custom_components.homebrain.family import swap_model

    effect = swap_model.plan_next_effect(
        {
            "step": "create_intent",
            "status": "applying",
            "config_entry_id": "choreops-entry",
            "operation_token": "op-test",
            "clone_due": "2026-11-19T18:00:00",
            "assignee_name": "Syn",
            "from_kid_name": "Dcera",
            "source_snapshot": {"name": "Zalít květiny", "points": 2, "due": "2026-11-19T18:00:00"},
        }
    )
    assert effect is not None and effect.service == "create_chore"
    assert set(effect.data) <= set(CHOREOPS_CREATE_FIELDS)


# --- Rodina „Přidat úkol“ fix: upcoming chores, stable error codes, „Vícekrát denně“ -------


def test_upcoming_lists_this_week_and_other_sorted_by_due(hass: HomeAssistant):
    """A chore due tomorrow (``this_week``) was invisible; now it is in ``upcoming``."""
    household(hass)
    hass.states.async_set(
        "sensor.dcera_choreops_chore_mycka",
        "pending",
        {"default_points": 3, "due_date": "2026-06-03T18:00:00+02:00"},
    )
    helper = hass.states.get("sensor.dcera_choreops_ui_dashboard_helper")
    rows = [
        *helper.attributes["chores"],
        {
            "eid": "sensor.dcera_choreops_chore_mycka",
            "name": "Vyndat myčku",
            "state": "pending",
            "primary_group": "this_week",
        },
        {
            "eid": "sensor.dcera_choreops_chore_x",
            "name": "Hotové",
            "state": "approved",
            "primary_group": "this_week",
        },
    ]
    hass.states.async_set(helper.entity_id, helper.state, {**helper.attributes, "chores": rows})
    kid = model.discover_kids(hass.states.async_all(), {})[0]
    upcoming = model.kid_upcoming(hass.states.get, kid)
    # „Umýt okna“ (other, due 2026-06-02T16:00Z) sorts before tomorrow's chore; done rows skip.
    assert [(u["name"], u["group"]) for u in upcoming] == [
        ("Umýt okna", "other"),
        ("Vyndat myčku", "this_week"),
    ]
    assert upcoming[1]["due"] == "2026-06-03T18:00:00+02:00" and upcoming[1]["points"] == 3
    # Today's actionable list is unchanged (claim/swap only work on today's rows).
    assert "Vyndat myčku" not in [r["name"] for r in model.kid_chores(hass.states.get, kid)]
    payload = model.kid_payload(hass.states.get, kid, "owner", False)
    assert [u["name"] for u in payload["upcoming"]] == ["Umýt okna", "Vyndat myčku"]


def test_upcoming_is_capped_and_undated_last(hass: HomeAssistant):
    rows = []
    for i in range(10):
        eid = f"sensor.dcera_choreops_chore_u{i}"
        due = None if i == 0 else f"2026-06-{10 + i:02d}T18:00:00+02:00"
        hass.states.async_set(eid, "pending", {"default_points": 1, "due_date": due})
        rows.append({"eid": eid, "name": f"Úkol {i}", "state": "pending", "primary_group": "other"})
    _kid(hass, "dcera", "Dcera", rows, 1)
    kid = model.discover_kids(hass.states.async_all(), {})[0]
    upcoming = model.kid_upcoming(hass.states.get, kid)
    assert len(upcoming) == model.UPCOMING_LIMIT
    assert upcoming[0]["name"] == "Úkol 1"
    assert all(u["due"] for u in upcoming)


def _fields(**extra: Any) -> dict[str, Any]:
    return model.validate_create_chore_fields(
        {
            "name": "Myčka horní koš",
            "points": 2,
            "assignees": ["dcera"],
            "recurrence": "once",
            "first_date": "2026-06-02",
            "due_time": "18:00",
            **extra,
        }
    )


def test_plan_daily_multi_creates_one_daily_chore_per_time():
    fields = _fields(recurrence="daily_multi", times=["19:00", "08:30"], due_time="19:00")
    plans = model.plan_create_chores(fields, config_entry_id="cfg", user_names=["Dcera"], now=NOW)
    # 08:30 already passed at NOW (09:00) → starts tomorrow; 19:00 still today.
    assert [(p["name"], p["due_date"]) for p in plans] == [
        ("Myčka horní koš (08:30)", "2026-06-03T08:30:00"),
        ("Myčka horní koš (19:00)", "2026-06-02T19:00:00"),
    ]
    for p in plans:
        assert p["frequency"] == "daily"
        assert p["approval_reset_type"] == "at_midnight_once"
        assert p["assigned_user_names"] == ["Dcera"]
        assert set(p) <= set(CHOREOPS_CREATE_FIELDS)


@pytest.mark.parametrize(
    "times",
    [["12:00"], ["12:00", "12:00"], ["1:00", "12:00"], [f"{h:02d}:00" for h in range(7)], None],
)
def test_daily_multi_rejects_bad_times(times):
    with pytest.raises(ValueError):
        _fields(recurrence="daily_multi", times=times)


def test_daily_multi_name_leaves_room_for_the_time_suffix():
    with pytest.raises(ValueError):
        _fields(name="x" * 75, recurrence="daily_multi", times=["08:00", "18:00"])


def test_plan_once_keeps_manual_reset():
    (plan,) = model.plan_create_chores(
        _fields(), config_entry_id="cfg", user_names=["Dcera"], now=NOW
    )
    assert plan["frequency"] == "none" and plan["approval_reset_type"] == "manual"
    assert plan["due_date"] == "2026-06-02T18:00:00"


def test_create_error_code_maps_choreops_translation_keys():
    import voluptuous as vol
    from homeassistant.exceptions import HomeAssistantError

    def ha(key: str) -> HomeAssistantError:
        return HomeAssistantError(translation_domain="choreops", translation_key=key)

    assert model.create_error_code(ha("duplicate_chore")) == "duplicate_name"
    assert model.create_error_code(HomeAssistantError("duplicate_chore")) == "duplicate_name"
    assert model.create_error_code(ha("due_date_in_past")) == "due_in_past"
    assert model.create_error_code(ha("error_msg_no_entry_found")) == "not_configured"
    assert model.create_error_code(vol.Invalid("extra keys not allowed")) == "invalid_input"
    assert model.create_error_code(RuntimeError("boom")) == "service_failed"


def _failing_create_chore(hass: HomeAssistant, recorded: list, fail_on: str | None, key: str):
    from homeassistant.exceptions import HomeAssistantError

    async def create(call: ServiceCall):
        if fail_on is None or call.data["name"] == fail_on:
            raise HomeAssistantError(translation_domain="choreops", translation_key=key)
        recorded.append(("create", dict(call.data)))
        return {"id": f"id-{len(recorded)}"}

    async def delete(call: ServiceCall):
        recorded.append(("delete", dict(call.data)))

    hass.services.async_register(
        "choreops", "create_chore", create, supports_response=SupportsResponse.OPTIONAL
    )
    hass.services.async_register("choreops", "delete_chore", delete)
    MockConfigEntry(domain="choreops", data={}, entry_id="choreops-entry").add_to_hass(hass)


CREATE_MSG = {
    "type": "homebrain/family/chore/create",
    "client_request_id": "req-12345678",
    "name": "Myčka horní koš",
    "points": 2,
    "assignees": ["dcera"],
    "recurrence": "once",
    "first_date": "2099-06-02",
    "due_time": "18:00",
}


async def test_create_duplicate_returns_stable_code(hass, entry, hass_ws_client, hass_admin_user):
    recorded: list = []
    _failing_create_chore(hass, recorded, None, "duplicate_chore")
    client = await hass_ws_client(hass)
    msg = await _ws(client, dict(CREATE_MSG))
    assert not msg["success"]
    assert msg["error"]["code"] == "duplicate_name"
    assert msg["error"]["message"] == "Úkol s tímto názvem už existuje."
    assert "duplicate_chore" not in msg["error"]["message"]


async def test_create_daily_multi_rolls_back_on_later_slot_failure(
    hass, entry, hass_ws_client, hass_admin_user
):
    recorded: list = []
    _failing_create_chore(hass, recorded, "Myčka horní koš (19:00)", "duplicate_chore")
    client = await hass_ws_client(hass)
    msg = await _ws(
        client,
        {
            **CREATE_MSG,
            "recurrence": "daily_multi",
            "times": ["12:00", "19:00"],
            "due_time": "12:00",
        },
    )
    assert msg["error"]["code"] == "duplicate_name"
    assert recorded == [
        ("create", recorded[0][1]),
        ("delete", {"config_entry_id": "choreops-entry", "id": "id-1"}),
    ]
    assert recorded[0][1]["name"] == "Myčka horní koš (12:00)"


async def test_create_daily_multi_via_strict_schema(hass, entry, hass_ws_client, hass_admin_user):
    recorded: list[dict[str, Any]] = []
    _strict_create_chore(hass, recorded)
    client = await hass_ws_client(hass)
    msg = await _ws(
        client,
        {
            **CREATE_MSG,
            "recurrence": "daily_multi",
            "times": ["12:00", "19:00"],
            "due_time": "12:00",
        },
    )
    assert msg["success"], msg
    assert msg["result"]["names"] == ["Myčka horní koš (12:00)", "Myčka horní koš (19:00)"]
    assert [d["due_date"] for d in recorded] == ["2099-06-02T12:00:00", "2099-06-02T19:00:00"]
    assert all(d["frequency"] == "daily" for d in recorded)
    groups = hass.data[DOMAIN]["family_swap"].data["chore_groups"]
    (group,) = groups.values()
    assert group == {
        "config_entry_id": "choreops-entry",
        "chore_ids": ["chore-new-1", "chore-new-2"],
    }


async def test_create_without_choreops_is_not_configured(
    hass, entry, hass_ws_client, hass_admin_user
):
    client = await hass_ws_client(hass)
    msg = await _ws(client, dict(CREATE_MSG))
    assert msg["error"]["code"] == "not_configured"


@pytest.mark.parametrize(
    ("mode", "source_due", "clone_due"),
    [
        ("reassign", "2026-06-01T22:43:00+02:00", "2026-06-02T23:59:00+02:00"),
        ("reassign", "2026-06-02T18:00:00+02:00", "2026-06-02T18:00:00+02:00"),
        ("decide", "2026-06-01T22:43:00+02:00", "2026-06-02T23:59:00+02:00"),
        ("failed", "2026-06-01T22:43:00+02:00", "2026-06-02T23:59:00+02:00"),
    ],
)
async def test_swap_choreops_create_and_skip(
    hass, entry, hass_ws_client, hass_admin_user, monkeypatch, mode, source_due, clone_due
):
    import voluptuous as vol
    from homeassistant.exceptions import HomeAssistantError
    from homeassistant.util import dt as dt_util

    monkeypatch.setattr(hass.config, "time_zone", "Europe/Prague")
    monkeypatch.setattr(dt_util, "now", lambda *args: NOW)
    for slug in ("dcera", "syn"):
        hass.states.async_remove(f"sensor.{slug}_choreops_ui_dashboard_helper")
    source = _chore(
        hass,
        "ema",
        "kytky",
        "Zalít květiny",
        "overdue" if source_due < NOW.isoformat() else "pending",
    )
    hass.states.async_set(
        source["eid"],
        source["state"],
        {"chore_id": "source", "default_points": 2, "due_date": source_due, "frequency": "daily"},
    )
    _kid(hass, "ema", "Ema", [source], 0)
    _kid(hass, "kuba", "Kuba", [], 0)
    seen = []

    async def create(call):
        seen.append("create")
        assert call.data["assigned_user_names"] == ["Kuba"]
        assert call.data["due_date"] == clone_due
        assert datetime.fromisoformat(call.data["due_date"]) > NOW
        if mode == "failed":
            raise HomeAssistantError(
                translation_domain="choreops", translation_key="due_date_in_past"
            )
        clone = _chore(hass, "kuba", "clone", call.data["name"], "pending")
        hass.states.async_set(clone["eid"], "pending", {"chore_id": "clone", "due_date": clone_due})
        _kid(hass, "kuba", "Kuba", [clone], 0)
        return {"id": "clone"}

    async def skip(call):
        seen.append("skip")
        assert call.data == {
            "config_entry_id": "choreops-entry",
            "chore_id": "source",
            "user_name": "Ema",
            "mark_as_missed": False,
        }
        _kid(hass, "ema", "Ema", [{**source, "primary_group": "this_week"}], 0)

    MockConfigEntry(domain="choreops", data={}, entry_id="choreops-entry").add_to_hass(hass)
    hass.services.async_register(
        "choreops",
        "create_chore",
        create,
        schema=vol.Schema({vol.Optional(k): object for k in CHOREOPS_CREATE_FIELDS}),
        supports_response=SupportsResponse.OPTIONAL,
    )
    hass.services.async_register("choreops", "skip_chore_due_date", skip)
    await _as(hass, entry, hass_admin_user, "adult")
    client = await hass_ws_client(hass)
    payload = {
        "type": "homebrain/family/swap/reassign",
        "client_request_id": "swap-12345678",
        "chore": source["eid"],
        "from_kid": "ema",
        "to_kid": "kuba",
        "local_date": "2026-06-02",
    }
    if mode == "decide":
        req = await _ws(client, {**payload, "type": "homebrain/family/swap/request"})
        assert req["success"], req
        payload = {
            "type": "homebrain/family/swap/decide",
            "request_id": req["result"]["request"]["id"],
            "decision": "approve",
        }
    result = await _ws(client, payload)
    if mode != "decide":
        replay = await _ws(client, payload)
        assert replay["success"] == result["success"]
        assert replay.get("result") == result.get("result")
    if mode == "failed":
        assert not result["success"]
        assert result["error"]["code"] == replay["error"]["code"] == "due_in_past"
        assert seen == ["create"]
        store = hass.data[DOMAIN]["family_swap"]
        (failed,) = store.data["operations"].values()
        assert failed["status"] == "failed"
        assert failed["step"] == "create_intent"
        return
    assert result["success"], result
    assert result["result"]["operation"]["status"] == "active"
    assert seen == ["create", "skip"]
    snapshot = (await _ws(client, {"type": "homebrain/family/get"}))["result"]
    kids = {kid["id"]: kid for kid in snapshot["kids"]}
    assert kids["ema"]["chores"] == []
    assert kids["kuba"]["chores"][0]["swap_today"]["kind"] == "transferred_in"


@pytest.fixture
def manageable_chores(hass, monkeypatch):
    from homeassistant.helpers import entity_registry as er
    from homeassistant.util import dt as dt_util

    monkeypatch.setattr(hass.config, "time_zone", "Europe/Prague")
    monkeypatch.setattr(dt_util, "now", lambda *args: NOW)
    for slug in ("dcera", "syn"):
        hass.states.async_remove(f"sensor.{slug}_choreops_ui_dashboard_helper")
    config = MockConfigEntry(domain="choreops", data={}, entry_id="choreops-entry")
    config.add_to_hass(hass)
    registry = er.async_get(hass)
    chores = {}

    def add(key, name, frequency, kid="Ema", group="today"):
        eid = registry.async_get_or_create(
            "sensor",
            "choreops",
            f"{config.entry_id}_{kid.lower()}_{key}_chore_status",
            config_entry=config,
            suggested_object_id=f"{kid.lower()}_{key}",
        ).entity_id
        due = "2026-06-02T18:00:00+02:00"
        hass.states.async_set(
            eid,
            "pending",
            {
                "recurring_frequency": frequency,
                "assigned_user_names": [kid],
                "due_date": due,
                "completion_criteria": "independent",
            },
        )
        chores[key] = {
            "eid": eid,
            "name": name,
            "primary_group": group,
            "state": "pending",
            "kid": kid,
        }

    def refresh():
        for name in ("Ema", "Kuba"):
            _kid(
                hass, name.lower(), name, [row for row in chores.values() if row["kid"] == name], 0
            )

    add("early", "Zalít záhon (12:00)", "daily")
    add("late", "Zalít záhon (18:00)", "daily", group="other")
    add("extraneous", "Zalít záhon (20:00)", "daily", kid="Kuba")
    add("one", "Vyndat myčku", "none")
    refresh()
    return chores, refresh


@pytest.mark.parametrize("role", ["child", "kiosk"])
@pytest.mark.parametrize("action", ["skip_today", "delete"])
async def test_chore_management_requires_adult(
    hass, entry, hass_ws_client, hass_admin_user, manageable_chores, role, action
):
    chores, _ = manageable_chores
    await _as(hass, entry, hass_admin_user, role, [{"name": "Ema", "user_id": hass_admin_user.id}])
    client = await hass_ws_client(hass)
    result = await _ws(
        client,
        {
            "type": f"homebrain/family/chore/{action}",
            "client_request_id": "blocked-12345678",
            "kid": "ema",
            "chore": chores["early"]["eid"],
        },
    )
    assert result["error"]["code"] == "unauthorized"


@pytest.mark.parametrize("mode", ["single", "series", "legacy", "stale"])
async def test_delete_chore_uses_confirmed_scope_and_cancels_swaps(
    hass, entry, hass_ws_client, manageable_chores, mode
):
    import voluptuous as vol

    chores, refresh = manageable_chores
    store = hass.data[DOMAIN]["family_swap"]
    if mode in {"series", "stale"}:
        store.data["chore_groups"] = {
            "known": {"config_entry_id": "choreops-entry", "chore_ids": ["early", "late"]},
        }
    key = "one" if mode == "single" else "early"
    eid = chores[key]["eid"]
    store.upsert_request("pending", {"id": "pending", "source_chore_id": eid, "status": "pending"})
    store.upsert_operation(
        "applying",
        {
            "source_snapshot": {"chore_id": key},
            "status": "applying",
            "config_entry_id": "choreops-entry",
        },
    )
    store.upsert_request(
        "unrelated",
        {
            "id": "unrelated",
            "source_chore_id": chores["extraneous"]["eid"],
            "status": "pending",
        },
    )
    deleted = []

    async def delete(call):
        assert call.data["config_entry_id"] == "choreops-entry"
        deleted.append(call.data["id"])
        del chores[call.data["id"]]
        refresh()
        return {"id": call.data["id"]}

    hass.services.async_register(
        "choreops",
        "delete_chore",
        delete,
        schema=vol.Schema({vol.Required("config_entry_id"): str, vol.Required("id"): str}),
        supports_response=SupportsResponse.OPTIONAL,
    )
    client = await hass_ws_client(hass)
    snapshot = (await _ws(client, {"type": "homebrain/family/get"}))["result"]
    row = next(c for c in snapshot["kids"][0]["chores"] if c["id"] == eid)
    assert row["management"]["one_off"] is (mode == "single")
    if mode != "single":
        assert [slot["id"] for slot in row["management"]["slots"]] == ["early", "late"]
    payload = {
        "type": "homebrain/family/chore/delete",
        "kid": "ema",
        "chore": eid,
        "client_request_id": "delete-12345678",
    }
    if mode != "single":
        payload["series_ids"] = ["early", "extraneous" if mode == "stale" else "late"]
    result = await _ws(client, payload)
    replay = await _ws(client, payload)
    if mode == "stale":
        assert result["error"]["code"] == replay["error"]["code"] == "conflict"
        assert not deleted
        return
    assert result["success"], result
    assert replay["result"] == result["result"]
    assert deleted == (["one"] if mode == "single" else ["early", "late"])
    assert store.data["requests"]["pending"]["status"] == "cancelled"
    assert store.data["operations"]["applying"]["status"] == "cancelled"
    assert store.data["requests"]["unrelated"]["status"] == "pending"
    assert "extraneous" in chores
    if mode == "series":
        assert store.data["chore_groups"] == {}


async def test_skip_today_dedupes_and_can_restore_future_occurrence(
    hass, entry, hass_ws_client, manageable_chores
):
    import voluptuous as vol

    chores, refresh = manageable_chores
    eid = chores["early"]["eid"]
    original_due = hass.states.get(eid).attributes["due_date"]
    next_due = "2026-06-03T18:00:00+02:00"
    calls = []

    def due_change(group, due):
        chores["early"]["primary_group"] = group
        state = hass.states.get(eid)
        hass.states.async_set(eid, state.state, {**state.attributes, "due_date": due})
        refresh()

    async def skip(call):
        calls.append(dict(call.data))
        due_change("this_week", next_due)

    async def restore(call):
        calls.append(dict(call.data))
        due_change("today", original_due)

    hass.services.async_register(
        "choreops",
        "skip_chore_due_date",
        skip,
        schema=vol.Schema(
            {
                vol.Required("config_entry_id"): str,
                vol.Required("chore_id"): str,
                vol.Required("user_name"): str,
                vol.Required("mark_as_missed"): bool,
            }
        ),
    )
    hass.services.async_register(
        "choreops",
        "set_chore_due_date",
        restore,
        schema=vol.Schema(
            {
                vol.Required("config_entry_id"): str,
                vol.Required("chore_name"): str,
                vol.Required("user_name"): str,
                vol.Required("due_date"): str,
            }
        ),
    )
    client = await hass_ws_client(hass)
    base = {"type": "homebrain/family/chore/skip_today", "kid": "ema", "chore": eid}
    payload = {**base, "client_request_id": "skip-12345678", "expected_due": original_due}
    result = await _ws(client, payload)
    assert result["result"] == {"ok": True, "can_undo": True}
    assert (await _ws(client, payload))["result"] == result["result"]
    assert hass.states.get(eid).attributes["due_date"] == next_due
    assert calls == [
        {
            "config_entry_id": "choreops-entry",
            "chore_id": "early",
            "user_name": "Ema",
            "mark_as_missed": False,
        }
    ]
    restore_result = await _ws(
        client,
        {
            **base,
            "client_request_id": "undo-12345678",
            "undo_request_id": "skip-12345678",
        },
    )
    assert restore_result["success"], restore_result
    assert calls[-1] == {
        "config_entry_id": "choreops-entry",
        "chore_name": "Zalít záhon (12:00)",
        "user_name": "Ema",
        "due_date": original_due,
    }
