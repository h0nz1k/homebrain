"""Rodina swap model + Store + roles (synthetic). Refs #123."""

from __future__ import annotations

from datetime import UTC, datetime

import pytest
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.homebrain.const import DOMAIN
from custom_components.homebrain.family import swap_model
from custom_components.homebrain.family.swap_store import FamilySwapStore
from custom_components.homebrain.roles import role_ws_commands


def test_request_expires_at_midnight():
    from zoneinfo import ZoneInfo

    tz = ZoneInfo("Europe/Prague")
    exp = swap_model.expires_at(datetime.fromisoformat("2026-06-02").date(), tz)
    assert exp.hour in {21, 22}  # DST-safe boundary check


def test_reduce_request_reject_and_expire():
    req = {
        "status": "pending",
        "requester_user_id": "u1",
        "expires_at": "2020-01-01T00:00:00+00:00",
    }
    now = datetime(2026, 6, 2, 12, tzinfo=UTC)
    out = swap_model.reduce_request(dict(req), "reject", now, actor_id="parent")
    assert out["status"] == "rejected"
    out2 = swap_model.reduce_request(
        {"status": "pending", "requester_user_id": "u1"}, "expire", now
    )
    assert out2["status"] == "expired"


def test_validate_swap_blocks_same_kid():
    from zoneinfo import ZoneInfo

    with pytest.raises(swap_model.DomainError) as err:
        swap_model.validate_swap_request(
            direction="give",
            actor_user_id="u1",
            from_kid="a",
            to_kid="a",
            chore_opaque="c1",
            local_day=datetime(2026, 6, 2).date(),
            now=datetime(2026, 6, 2, 9, tzinfo=UTC),
            tz=ZoneInfo("Europe/Prague"),
            role="child",
            occurrence={"opaque_id": "c1", "can_request_swap": True},
        )
    assert err.value.code == "invalid_input"


@pytest.mark.asyncio
async def test_store_save_increments_revision(hass):
    store = FamilySwapStore(hass)
    await store.async_load()
    before = store.revision
    await store.async_save()
    assert store.revision == before + 1


def test_role_matrix_includes_swap_and_points():
    adult = role_ws_commands("adult")
    child = role_ws_commands("child")
    assert "homebrain/family/swap/request" in child
    assert "homebrain/family/swap/decide" in adult
    assert "homebrain/family/chore/create" in adult
    assert "homebrain/family/points/history" in child
    assert "homebrain/family/swap/decide" not in child


@pytest.mark.asyncio
async def test_store_reconcile_expires_pending(hass):
    store = FamilySwapStore(hass)
    await store.async_load()
    store.upsert_request(
        "r1",
        {
            "status": "pending",
            "expires_at": "2020-01-01T00:00:00+00:00",
        },
    )
    from zoneinfo import ZoneInfo

    store.reconcile_all(datetime(2026, 6, 2, 12, tzinfo=UTC), ZoneInfo("Europe/Prague"))
    assert store.data["requests"]["r1"]["status"] == "expired"


@pytest.mark.asyncio
async def test_integration_store_loaded(hass):
    entry = MockConfigEntry(domain=DOMAIN, data={}, options={})
    entry.add_to_hass(hass)
    from homeassistant.setup import async_setup_component

    assert await async_setup_component(hass, DOMAIN, {})
    await hass.async_block_till_done()
    assert "family_swap" in hass.data[DOMAIN]


def test_pending_approval_contains_requester_chore_points_and_target():
    from custom_components.homebrain.family import model

    snapshot = {
        "kids": [
            {
                "id": "a",
                "kid_uuid": "a",
                "name": "Dcera",
                "chores": [
                    {
                        "id": "chore",
                        "name": "Zalít květiny",
                        "points": 4,
                        "due": "2026-11-16T18:00:00+01:00",
                    }
                ],
            },
            {"id": "b", "kid_uuid": "b", "name": "Syn", "chores": []},
        ]
    }
    store = {
        "requests": {
            "r": {
                "id": "r",
                "status": "pending",
                "source_chore_id": "chore",
                "from_kid_id": "a",
                "to_kid_id": "b",
                "requester_name": "Syn",
            }
        }
    }
    approval = model.pending_approvals(snapshot, store)[0]
    assert approval["requester_name"] == "Syn"
    assert approval["chore_name"] == "Zalít květiny"
    assert approval["points"] == 4
    assert approval["from_kid_id"] == "a"
    assert approval["to_kid_id"] == "b"


def test_only_active_swap_mutes_source_and_decorates_actual_clone():
    from custom_components.homebrain.family import model

    original = {
        "id": "original",
        "opaque_id": "source",
        "chore_uuid": "source",
        "name": "Vynést koš",
    }
    clone = {"id": "clone-row", "opaque_id": "clone", "chore_uuid": "clone", "name": "Vynést koš"}
    kids = {"a": {"id": "a", "name": "Dcera"}, "b": {"id": "b", "name": "Syn"}}
    op = {
        "status": "applying",
        "source_snapshot": {"chore_id": "source"},
        "from_kid_id": "a",
        "to_kid_id": "b",
        "clone_id": "clone",
    }
    store = {"operations": {"o": op}}
    pending = model.apply_swap_overlays(
        [original], kid=kids["a"], store_data=store, kids_by_uuid=kids
    )[0]
    assert pending["swap_today"] is None
    assert pending.get("counts_today") is not False
    op["status"] = "active"
    applied = model.apply_swap_overlays(
        [original], kid=kids["a"], store_data=store, kids_by_uuid=kids
    )[0]
    assert applied["swap_today"]["label"] == "Předáno: Syn · jen dnes"
    assert applied["swap_today"]["partner_name"] == "Syn"
    assert applied["counts_today"] is False
    received = model.apply_swap_overlays(
        [clone], kid=kids["b"], store_data=store, kids_by_uuid=kids
    )[0]
    assert received["swap_today"] == {
        "kind": "transferred_in",
        "label": "Převzato od: Dcera · jen dnes",
        "partner_name": "Dcera",
    }
