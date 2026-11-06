"""Kiosk panel WS permission matrix (ADR-0002): non-admins only get what Dnes needs."""

import pytest
from homeassistant.components.websocket_api.const import DOMAIN as WS_DOMAIN
from homeassistant.core import HomeAssistant
from homeassistant.setup import async_setup_component
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.homebrain.const import DOMAIN
from custom_components.homebrain.roles import KIOSK_WS_COMMANDS, role_ws_commands

# A schema-valid payload for every homebrain/* command, so the handler (not voluptuous)
# answers. A new command without an entry here fails test_matrix_covers_every_command.
PAYLOADS: dict[str, dict] = {
    "homebrain/session/get": {},
    "homebrain/bindings/get": {},
    "homebrain/bindings/set": {"module": "waste", "bindings": {}},
    "homebrain/roles/get": {},
    "homebrain/roles/set": {"user_id": "someone", "role": "kiosk"},
    "homebrain/weather/get": {},
    "homebrain/weather/alerts": {},
    "homebrain/energy/pv_forecast": {},
    "homebrain/waste/history": {},
    "homebrain/robots/get": {},
    "homebrain/robots/map": {"slot": 1},
    "homebrain/robots/presets/list": {},
    "homebrain/robots/presets/save": {"slot": 1, "preset": {"name": "x"}},
    "homebrain/robots/presets/delete": {"slot": 1, "preset_id": "abcdef012345"},
    "homebrain/robots/defaults/get": {"slot": 1},
    "homebrain/robots/defaults/set": {"slot": 1, "defaults": None},
    # No robot is bound in the matrix entry: an admin gets not_found, nothing ever starts.
    "homebrain/robots/start": {"slot": 1},
    "homebrain/wine/list": {},
    "homebrain/wine/search": {"query": "x"},
    "homebrain/wine/get": {"wine_id": "x"},
    "homebrain/wine/events": {},
    "homebrain/wine/create": {"wine": {}, "source_operation_id": "op-kiosk-0001"},
    "homebrain/wine/update": {"wine_id": "x", "changes": {}},
    "homebrain/wine/consume": {
        "wine_id": "x",
        "quantity": 1,
        "source_operation_id": "op-kiosk-0002",
    },
    "homebrain/wine/correct": {
        "wine_id": "x",
        "quantity": 1,
        "reason": "x",
        "source_operation_id": "op-kiosk-0003",
    },
    "homebrain/wine/import": {"format": "csv", "content": ""},
    "homebrain/wine/enrich": {"wine_id": "x"},
    "homebrain/wine/enrich_batch": {"wine_ids": ["x"]},
    "homebrain/wine/enrich_status": {},
    "homebrain/wine/renormalize": {"dry_run": True, "fetch": False},
    "homebrain/wine/lookup_providers": {},
    "homebrain/wine/lookup": {"query": "nic"},
    "homebrain/wine/set_image": {"wine_id": "x", "photo": "AA=="},
    "homebrain/wine/import_vivino": {"content": "Wine name\nX\n"},
    "homebrain/wine/voice_consume": {
        "text": "synthetic test",
        "source_operation_id": "op-voice-0001",
        "dry_run": True,
    },
    "homebrain/wine/voice_pending": {},
    "homebrain/wine/voice_resolve": {"pending_id": "x", "wine_id": None},
    "homebrain/recipes/list": {},
    "homebrain/recipes/get": {"recipe_id": "x"},
    "homebrain/recipes/tags": {},
    "homebrain/recipes/create": {"recipe": {}},
    "homebrain/recipes/update": {"recipe_id": "x", "recipe": {}},
    "homebrain/recipes/delete": {"recipe_id": "x"},
    "homebrain/recipes/set_favourite": {"recipe_id": "x", "favourite": True},
    "homebrain/recipes/set_rating": {"recipe_id": "x", "rating": 3},
    "homebrain/recipes/cooked": {"recipe_id": "x"},
    "homebrain/recipes/import_url": {"url": "https://recepty.example.org/x"},
    "homebrain/recipes/config": {},
    "homebrain/recipes/settings_get": {},
    "homebrain/recipes/settings_set": {"music_notify_service": None},
    "homebrain/recipes/music": {"command": "pause"},
    "homebrain/access/state": {},
    "homebrain/access/subscribe": {},
    "homebrain/access/command": {"action": "list_users"},
    "homebrain/access/label": {"user_id": 1001, "hand": "right"},
    "homebrain/access/person": {"person": "Jan", "child": False},
    "homebrain/access/settings": {"notify_reenroll": True},
    "homebrain/access/history": {"limit": 5},
    "homebrain/recipes/timers/subscribe": {},
    "homebrain/recipes/timers/start": {"label": "Krok 1", "seconds": 60},
    "homebrain/recipes/timers/update": {"timer_id": "missing", "op": "pause"},
    "homebrain/recipes/timers/cancel": {"timer_id": "missing"},
    # Never confirmed here: the handler answers NOT_CONFIGURED/CONFIRMATION_REQUIRED.
    "homebrain/recipes/airfryer": {"temperature": 180, "minutes": 5},
    # No fryer in the test HA: NOT_CONFIGURED; stop is never confirmed here.
    "homebrain/recipes/airfryer_control": {"action": "stop"},
    "homebrain/recipes/airfryer_program": {"program": 1},
}


@pytest.fixture
async def setup(hass: HomeAssistant, hass_admin_user):
    entry = MockConfigEntry(domain=DOMAIN, data={}, options={})
    entry.add_to_hass(hass)
    assert await async_setup_component(hass, DOMAIN, {})
    await hass.async_block_till_done()
    return entry


def _homebrain_commands(hass: HomeAssistant) -> set[str]:
    return {name for name in hass.data[WS_DOMAIN] if name.startswith("homebrain/")}


async def _code(client, command: str) -> str | None:
    """None on success, else the error code."""
    await client.send_json_auto_id({"type": command, **PAYLOADS[command]})
    msg = await client.receive_json()
    while msg["type"] == "event":  # pushes from an earlier subscription (Recepty timers)
        msg = await client.receive_json()
    return None if msg["success"] else msg["error"]["code"]


async def test_matrix_covers_every_command(hass: HomeAssistant, setup):
    assert _homebrain_commands(hass) == set(PAYLOADS)
    assert KIOSK_WS_COMMANDS <= set(PAYLOADS)


@pytest.mark.parametrize("role", ["kiosk", "adult", "child", None])
async def test_non_admin_matrix(hass: HomeAssistant, setup, hass_ws_client, hass_admin_user, role):
    """Mapped non-admins: Dnes kiosk + Recepty commands; unmapped (guest): only session/get."""
    hass_admin_user.groups = []  # non-admin HA user, e.g. the tablet account
    if role:
        hass.config_entries.async_update_entry(setup, options={"roles": {hass_admin_user.id: role}})
    allowed = role_ws_commands(role or "guest")
    client = await hass_ws_client(hass)
    for command in sorted(_homebrain_commands(hass)):
        code = await _code(client, command)
        if command in allowed:
            assert code != "unauthorized", command
        else:
            assert code == "unauthorized", command
    # The kiosk account cannot promote itself.
    assert setup.options.get("roles", {}).get(hass_admin_user.id) == role


class _RadarStub:
    def radar_png(self, frame_id: str) -> bytes | None:
        return b"\x89PNG" if frame_id == "f1" else None


@pytest.mark.parametrize(
    ("role", "status"), [("kiosk", 200), ("adult", 200), ("child", 200), (None, 403)]
)
async def test_radar_image_http_matrix(
    hass: HomeAssistant, setup, hass_client, hass_admin_user, role, status
):
    """Radar frames (HTTP view) follow the WS matrix: mapped roles yes, unmapped guest no."""
    hass_admin_user.groups = []
    if role:
        hass.config_entries.async_update_entry(setup, options={"roles": {hass_admin_user.id: role}})
    data = hass.data.setdefault(DOMAIN, {})
    real = data.get("weather")
    data["weather"] = _RadarStub()
    try:
        client = await hass_client()
        resp = await client.get("/api/homebrain/weather/radar/f1")
        assert resp.status == status
        if status == 200:
            assert resp.content_type == "image/png"
    finally:
        if real is None:
            data.pop("weather", None)
        else:
            data["weather"] = real


async def test_admin_is_never_unauthorized(hass: HomeAssistant, setup, hass_ws_client):
    client = await hass_ws_client(hass)
    for command in sorted(_homebrain_commands(hass)):
        if command == "homebrain/roles/set":
            continue  # covered below (it mutates the mapping)
        assert await _code(client, command) != "unauthorized", command


async def test_roles_set_get(hass: HomeAssistant, setup, hass_ws_client):
    client = await hass_ws_client(hass)
    await client.send_json_auto_id(
        {"type": "homebrain/roles/set", "user_id": "tablet-user", "role": "kiosk"}
    )
    msg = await client.receive_json()
    assert msg["result"] == {"roles": {"tablet-user": "kiosk"}}
    assert setup.options["roles"] == {"tablet-user": "kiosk"}
    await client.send_json_auto_id({"type": "homebrain/roles/get"})
    assert (await client.receive_json())["result"] == {"roles": {"tablet-user": "kiosk"}}
    # owner is reserved for HA admins; unknown roles are rejected by the schema.
    for bad in ("owner", "superuser"):
        await client.send_json_auto_id(
            {"type": "homebrain/roles/set", "user_id": "tablet-user", "role": bad}
        )
        assert (await client.receive_json())["error"]["code"] == "invalid_format"
    await client.send_json_auto_id(
        {"type": "homebrain/roles/set", "user_id": "tablet-user", "role": None}
    )
    assert (await client.receive_json())["result"] == {"roles": {}}
