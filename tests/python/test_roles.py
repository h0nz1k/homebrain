"""Role resolution and homebrain/session/get (ADR-0002)."""

from types import SimpleNamespace

import pytest
from homeassistant.core import HomeAssistant
from homeassistant.setup import async_setup_component
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.homebrain.const import DOMAIN
from custom_components.homebrain.roles import MODULE_VISIBILITY, resolve_role, visible_modules

ROLES = {"u-kiosk": "kiosk", "u-adult": "adult", "u-child": "child", "u-owner": "owner"}


def user(uid: str, admin: bool = False):
    return SimpleNamespace(id=uid, is_admin=admin)


@pytest.mark.parametrize(
    ("who", "expected"),
    [
        (None, "guest"),
        (user("u-admin", admin=True), "owner"),
        # An admin can never be lowered to kiosk (tablet logged in as admin sees everything).
        (user("u-kiosk", admin=True), "owner"),
        (user("u-kiosk"), "kiosk"),
        (user("u-adult"), "adult"),
        (user("u-child"), "child"),
        # Owner is reserved for HA admins; a non-admin mapped to owner is default-denied.
        (user("u-owner"), "guest"),
        (user("u-unknown"), "guest"),
    ],
)
def test_resolve_role(who, expected):
    assert resolve_role(who, ROLES) == expected


def test_resolve_role_ignores_invalid_mapping():
    assert resolve_role(user("u-x"), {"u-x": "superuser"}) == "guest"
    assert resolve_role(user("u-x"), None) == "guest"


def test_kiosk_never_sees_private_modules():
    for module in ("health", "wine", "settings"):
        assert module not in MODULE_VISIBILITY["kiosk"]
    assert visible_modules("kiosk") == ["energy", "family", "recipes", "today", "waste", "weather"]
    assert visible_modules("nonsense") == ["about"]


async def test_session_get_admin(hass: HomeAssistant, hass_ws_client):
    MockConfigEntry(domain=DOMAIN, data={}, options={}).add_to_hass(hass)
    assert await async_setup_component(hass, DOMAIN, {})
    client = await hass_ws_client(hass)
    await client.send_json_auto_id({"type": "homebrain/session/get"})
    msg = await client.receive_json()
    assert msg["success"]
    assert msg["result"]["role"] == "owner"
    assert msg["result"]["is_admin"] is True
    assert msg["result"]["kiosk"] is False


async def test_session_get_kiosk_user(hass: HomeAssistant, hass_ws_client, hass_admin_user):
    hass_admin_user.groups = []  # non-admin HA user (the tablet account)
    MockConfigEntry(
        domain=DOMAIN, data={}, options={"roles": {hass_admin_user.id: "kiosk"}}
    ).add_to_hass(hass)
    assert await async_setup_component(hass, DOMAIN, {})
    client = await hass_ws_client(hass)
    await client.send_json_auto_id({"type": "homebrain/session/get"})
    msg = await client.receive_json()
    assert msg["success"]
    assert msg["result"] == {
        "role": "kiosk",
        "visible_modules": ["energy", "family", "recipes", "today", "waste", "weather"],
        "is_admin": False,
        "kiosk": True,
        "unavailable_modules": [],
        "disabled_modules": [],
    }
    # Admin-only commands stay admin-only for the kiosk account.
    await client.send_json_auto_id(
        {"type": "homebrain/bindings/set", "module": "waste", "bindings": {}}
    )
    denied = await client.receive_json()
    assert not denied["success"] and denied["error"]["code"] == "unauthorized"


async def test_session_get_unmapped_non_admin_is_guest(
    hass: HomeAssistant, hass_ws_client, hass_admin_user
):
    hass_admin_user.groups = []
    assert await async_setup_component(hass, DOMAIN, {})
    client = await hass_ws_client(hass)
    await client.send_json_auto_id({"type": "homebrain/session/get"})
    msg = await client.receive_json()
    assert msg["result"]["role"] == "guest"
    assert msg["result"]["visible_modules"] == ["about"]
