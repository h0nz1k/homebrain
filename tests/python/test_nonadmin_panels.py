"""Non-admin module panels (ADR-0002 §3.1, Fáze 4): panels.json flags + role × WS matrix.

The family-relevant panels (Dnes, Počasí, Odpady, Rodina, Energie read-only, Recepty, Síť)
are registered with ``require_admin: false``; everything else stays admin-only. Opening a
panel is only UX — the WS commands behind it are authorised per role here, explicitly.
"""

import json
from pathlib import Path

import pytest
from homeassistant.core import HomeAssistant
from homeassistant.setup import async_setup_component
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.homebrain.const import DOMAIN

PANELS_JSON = Path(__file__).parents[2] / "custom_components" / "homebrain" / "panels.json"

NON_ADMIN_MODULES = {"today", "weather", "waste", "family", "energy", "recipes", "network"}
ADMIN_ONLY_MODULES = {"wine", "health", "robots", "access"}


def _panels() -> dict:
    return json.loads(PANELS_JSON.read_text(encoding="utf-8"))


def test_family_panels_are_open_to_non_admins():
    modules = {p["module"]: p.get("require_admin", True) for p in _panels()["modules"]}
    assert {m for m, admin in modules.items() if not admin} == NON_ADMIN_MODULES
    assert {m for m, admin in modules.items() if admin} == ADMIN_ONLY_MODULES


def test_settings_and_legacy_panels_stay_admin_only():
    panels = _panels()
    assert panels["settings"].get("require_admin", True) is True
    assert panels["legacy"].get("require_admin", True) is True


ALL = {"admin", "adult", "child", "kiosk", "unmapped"}
MAPPED = {"admin", "adult", "child", "kiosk"}
ADMIN = {"admin"}

# Every WS command the opened panels (Dnes, Počasí, Odpady, Rodina, Energie) call, plus the
# admin-only mutations next to them. Explicit on purpose: a role change must edit this table.
MATRIX: dict[str, tuple[dict, set[str]]] = {
    "homebrain/session/get": ({}, ALL),
    "homebrain/bindings/get": ({}, MAPPED),
    "homebrain/weather/get": ({}, MAPPED),
    "homebrain/weather/alerts": ({}, MAPPED),
    "homebrain/energy/pv_forecast": ({}, MAPPED),
    # Energie details are adult+admin; child has no Energie, kiosk the summary only.
    "homebrain/energy/compare": ({}, {"admin", "adult"}),
    # Energie „Faktury“: adults read; upload/edit/delete stay admin-only.
    "homebrain/energy/invoices/list": ({}, {"admin", "adult"}),
    "homebrain/energy/invoices/compare": ({"invoice_id": "0000000000000000"}, {"admin", "adult"}),
    "homebrain/energy/invoices/save": (
        {"invoice_id": "0000000000000000", "fields": {}},
        ADMIN,
    ),
    "homebrain/energy/invoices/delete": ({"invoice_id": "0000000000000000"}, ADMIN),
    "homebrain/waste/history": ({}, MAPPED),
    "homebrain/today/meals": ({}, MAPPED),
    "homebrain/family/get": ({}, MAPPED),
    "homebrain/family/chore/claim": ({"kid": "nobody", "chore": "sensor.nothing"}, MAPPED),
    "homebrain/family/chore/approve": (
        {"kid": "nobody", "chore": "sensor.nothing"},
        {"admin", "adult"},
    ),
    "homebrain/family/shopping/add": ({"summary": "Mléko"}, MAPPED),
    "homebrain/family/shopping/update": ({"uid": "u1", "done": True}, MAPPED),
    # Settings, bindings and role mapping stay admin-only.
    "homebrain/family/settings/get": ({}, ADMIN),
    "homebrain/family/settings/set": ({}, ADMIN),
    "homebrain/bindings/set": ({"module": "waste", "bindings": {}}, ADMIN),
    "homebrain/roles/get": ({}, ADMIN),
}


@pytest.fixture
async def entry(hass: HomeAssistant, hass_admin_user):
    entry = MockConfigEntry(domain=DOMAIN, data={}, options={})
    entry.add_to_hass(hass)
    assert await async_setup_component(hass, DOMAIN, {})
    await hass.async_block_till_done()
    return entry


def _as_role(hass: HomeAssistant, entry, user, role: str) -> None:
    if role == "admin":
        return
    user.groups = []  # non-admin HA user
    if role != "unmapped":
        hass.config_entries.async_update_entry(entry, options={"roles": {user.id: role}})


async def _send(client, command: str, payload: dict) -> dict:
    await client.send_json_auto_id({"type": command, **payload})
    msg = await client.receive_json()
    while msg["type"] == "event":
        msg = await client.receive_json()
    return msg


@pytest.mark.parametrize("role", sorted(ALL))
@pytest.mark.parametrize("command", sorted(MATRIX))
async def test_role_command_matrix(
    hass: HomeAssistant, entry, hass_ws_client, hass_admin_user, role, command
):
    payload, allowed = MATRIX[command]
    _as_role(hass, entry, hass_admin_user, role)
    msg = await _send(await hass_ws_client(hass), command, payload)
    code = None if msg["success"] else msg["error"]["code"]
    if role in allowed:
        assert code != "unauthorized", (role, command)
    else:
        assert code == "unauthorized", (role, command)


@pytest.mark.parametrize("role", ["adult", "child", "kiosk", "unmapped"])
async def test_non_admin_cannot_change_roles(
    hass: HomeAssistant, entry, hass_ws_client, hass_admin_user, role
):
    _as_role(hass, entry, hass_admin_user, role)
    msg = await _send(
        await hass_ws_client(hass),
        "homebrain/roles/set",
        {"user_id": hass_admin_user.id, "role": "adult"},
    )
    assert msg["error"]["code"] == "unauthorized"
    expected = None if role == "unmapped" else role
    assert entry.options.get("roles", {}).get(hass_admin_user.id) == expected


@pytest.mark.parametrize(
    ("role", "modules"),
    [
        ("adult", {"today", "weather", "waste", "family", "energy"}),
        ("child", {"today", "weather", "waste", "family"}),
        ("kiosk", {"today", "weather", "waste", "family", "energy"}),
        ("unmapped", set()),
    ],
)
async def test_session_visible_modules_per_role(
    hass: HomeAssistant, entry, hass_ws_client, hass_admin_user, role, modules
):
    """The panel shows „Nemáte přístup“ for every module not in ``visible_modules``."""
    _as_role(hass, entry, hass_admin_user, role)
    msg = await _send(await hass_ws_client(hass), "homebrain/session/get", {})
    opened = {"today", "weather", "waste", "family", "energy"}
    assert set(msg["result"]["visible_modules"]) & opened == modules
    assert msg["result"]["is_admin"] is False
