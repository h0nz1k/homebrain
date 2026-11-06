"""Module isolation, on/off switches, upgrade compatibility and the CI guards (#27, #28)."""

import copy
import importlib.util
import subprocess
import sys
from pathlib import Path
from unittest.mock import patch

import pytest
from homeassistant.core import HomeAssistant
from homeassistant.data_entry_flow import FlowResultType
from homeassistant.helpers import issue_registry as ir
from homeassistant.setup import async_setup_component
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.homebrain.bindings import binding_domains, get_bindings
from custom_components.homebrain.const import BINDING_MODULES, DOMAIN, MODULE_PANELS
from custom_components.homebrain.modules import (
    CONF_DISABLED_MODULES,
    ERROR_UNAVAILABLE,
    MODULES,
    STATE_FAILED,
    STATE_OK,
    disabled_modules,
    module_states,
)
from custom_components.homebrain.robots.config import ROBOT_SLOTS, slot_keys, slot_settings

ROOT = Path(__file__).resolve().parents[2]
WINE_PANEL = next(path for path, panel in MODULE_PANELS.items() if panel["module"] == "wine")
ROBOTS_PANEL = next(path for path, panel in MODULE_PANELS.items() if panel["module"] == "robots")


def _synthetic(key: str, index: int) -> str:
    return f"{sorted(binding_domains(key))[0]}.synthetic_{index}"


def realistic_options() -> dict:
    """Shape of a long-running production entry (synthetic IDs, invented values)."""
    energy = list(BINDING_MODULES["energy"])[:61]
    robots = [key for slot in ROBOT_SLOTS for key in slot_keys(slot)][:48]
    return {
        "bindings": {
            "energy": {key: _synthetic(key, i) for i, key in enumerate(energy)},
            "robots": {key: _synthetic(key, i) for i, key in enumerate(robots)},
            "waste": {"waste_calendar": "calendar.synthetic_waste"},
            "family": {key: _synthetic(key, i) for i, key in enumerate(BINDING_MODULES["family"])},
        },
        "robots": {
            "1": {"name": "Kraken", "floor": "Přízemí", "image": "", "rotation": 180},
            "2": {"name": "Robot B", "floor": "Patro", "image": "", "rotation": 90},
        },
        "energy_pv": {"pv_kwp": 9.9, "pv_tilt": 35.0, "battery_capacity_kwh": 10.0},
        "roles": {"0123456789abcdef0123456789abcdef": "kiosk"},
    }


async def _setup(hass: HomeAssistant, options: dict | None = None) -> MockConfigEntry:
    entry = MockConfigEntry(domain=DOMAIN, title="HomeBrain", data={}, options=options or {})
    entry.add_to_hass(hass)
    assert await async_setup_component(hass, DOMAIN, {})
    await hass.async_block_till_done()
    return entry


async def _ws(client, **msg) -> dict:
    await client.send_json_auto_id(msg)
    return await client.receive_json()


async def test_failing_entry_setup_isolated(hass: HomeAssistant, hass_ws_client):
    """A module crashing in setup gets a repair issue; HA and the other modules run on."""
    with patch(
        "custom_components.homebrain.access_ws.async_get_manager",
        side_effect=RuntimeError("synthetic access failure"),
    ):
        entry = await _setup(hass)
    assert entry.state.name == "LOADED"
    states = module_states(hass)
    assert states["access"] == STATE_FAILED
    assert all(states[m] == STATE_OK for m in MODULES if m != "access")
    issue = ir.async_get(hass).async_get_issue(DOMAIN, "module_failed_access")
    assert issue is not None and issue.translation_key == "module_failed"
    assert "synthetic access failure" in issue.translation_placeholders["error"]

    client = await hass_ws_client(hass)
    session = await _ws(client, type="homebrain/session/get")
    assert session["result"]["unavailable_modules"] == ["access"]
    access = await _ws(client, type="homebrain/access/state")
    assert access["error"]["code"] == ERROR_UNAVAILABLE
    bindings = await _ws(client, type="homebrain/bindings/get")
    assert bindings["success"]
    other = await _ws(client, type="homebrain/weather/get")
    assert other.get("error", {}).get("code") != ERROR_UNAVAILABLE

    # A clean reload clears the failure and its repair issue.
    assert await hass.config_entries.async_reload(entry.entry_id)
    await hass.async_block_till_done()
    assert module_states(hass)["access"] == STATE_OK
    assert ir.async_get(hass).async_get_issue(DOMAIN, "module_failed_access") is None


async def test_failing_registration_isolated(hass: HomeAssistant, hass_ws_client):
    """A module whose WS registration crashes does not stop the integration."""
    with patch(
        "custom_components.homebrain.wine_ws.async_register",
        side_effect=RuntimeError("synthetic wine failure"),
    ):
        await _setup(hass)
    assert module_states(hass)["wine"] == STATE_FAILED
    assert ir.async_get(hass).async_get_issue(DOMAIN, "module_failed_wine") is not None
    client = await hass_ws_client(hass)
    session = await _ws(client, type="homebrain/session/get")
    assert session["result"]["unavailable_modules"] == ["wine"]
    recipes = await _ws(client, type="homebrain/recipes/list")
    assert recipes.get("error", {}).get("code") != ERROR_UNAVAILABLE
    # The failed module keeps its panel so it can say "modul nedostupný".
    assert WINE_PANEL in hass.data["frontend_panels"]


async def test_disabled_module_registers_nothing(hass: HomeAssistant, hass_ws_client):
    await _setup(hass, {CONF_DISABLED_MODULES: ["wine"]})
    client = await hass_ws_client(hass)
    wine = await _ws(client, type="homebrain/wine/list")
    assert wine["error"]["code"] == "unknown_command"
    assert WINE_PANEL not in hass.data["frontend_panels"]
    assert ROBOTS_PANEL in hass.data["frontend_panels"]
    session = await _ws(client, type="homebrain/session/get")
    assert "wine" not in session["result"]["visible_modules"]
    assert session["result"]["disabled_modules"] == ["wine"]


async def test_options_toggle_reloads_and_gates(hass: HomeAssistant, hass_ws_client):
    entry = await _setup(hass)
    flow = await hass.config_entries.options.async_init(entry.entry_id)
    flow = await hass.config_entries.options.async_configure(
        flow["flow_id"], {"next_step_id": "modules"}
    )
    assert flow["step_id"] == "modules"
    enabled = [m for m in MODULES if m != "robots"]
    result = await hass.config_entries.options.async_configure(
        flow["flow_id"], {"enabled_modules": enabled}
    )
    assert result["type"] is FlowResultType.CREATE_ENTRY
    await hass.async_block_till_done()
    assert entry.options[CONF_DISABLED_MODULES] == ["robots"]
    assert ROBOTS_PANEL not in hass.data["frontend_panels"]
    # Registered before the switch: HA cannot unregister, so the gate answers instead.
    client = await hass_ws_client(hass)
    robots = await _ws(client, type="homebrain/robots/get")
    assert robots["error"]["code"] == ERROR_UNAVAILABLE

    flow = await hass.config_entries.options.async_init(entry.entry_id)
    flow = await hass.config_entries.options.async_configure(
        flow["flow_id"], {"next_step_id": "modules"}
    )
    await hass.config_entries.options.async_configure(
        flow["flow_id"], {"enabled_modules": list(MODULES)}
    )
    await hass.async_block_till_done()
    assert CONF_DISABLED_MODULES not in entry.options
    assert ROBOTS_PANEL in hass.data["frontend_panels"]


async def test_existing_production_options_upgrade_unchanged(hass: HomeAssistant):
    """Old entries (no ``disabled_modules``) load with every module on and options intact."""
    options = realistic_options()
    entry = await _setup(hass, copy.deepcopy(options))
    assert dict(entry.options) == options
    assert disabled_modules(entry.options) == set()
    assert all(module_states(hass)[m] == STATE_OK for m in MODULES)
    assert all(path in hass.data["frontend_panels"] for path in MODULE_PANELS)
    bindings = get_bindings(entry)
    assert len(bindings["energy"]) == 61 and len(bindings["robots"]) == 48
    assert slot_settings(entry.options, 1)["rotation"] == 180
    # Opening and saving the modules step with everything on keeps options byte-identical.
    flow = await hass.config_entries.options.async_init(entry.entry_id)
    flow = await hass.config_entries.options.async_configure(
        flow["flow_id"], {"next_step_id": "modules"}
    )
    await hass.config_entries.options.async_configure(
        flow["flow_id"], {"enabled_modules": list(MODULES)}
    )
    await hass.async_block_till_done()
    assert dict(entry.options) == options


def test_disabled_modules_ignores_garbage():
    assert disabled_modules({}) == set()
    assert disabled_modules({CONF_DISABLED_MODULES: "wine"}) == set()
    assert disabled_modules({CONF_DISABLED_MODULES: ["wine", "nope", 3]}) == {"wine"}


async def test_blocking_call_fixture_detects_loop_io(
    hass: HomeAssistant, fail_on_blocking_calls, tmp_path
):
    """Self-test: HomeBrain code doing file I/O in a loop callback is caught."""
    from custom_components.homebrain.wine.lookup import _write_label  # noqa: PLC0415

    hass.loop.call_soon(_write_label, str(tmp_path), b"x", "image/png")
    await hass.async_block_till_done()
    found = list(fail_on_blocking_calls)
    fail_on_blocking_calls.clear()
    assert any("wine/lookup.py" in item for item in found), found


def _guard():
    spec = importlib.util.spec_from_file_location(
        "check_private_ha_api", ROOT / "scripts/ci/check_private_ha_api.py"
    )
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_private_ha_api_guard_clean_tree():
    assert _guard().check_tree(ROOT) == []
    run = subprocess.run(
        [sys.executable, str(ROOT / "scripts/ci/check_private_ha_api.py"), str(ROOT)],
        capture_output=True,
        text=True,
        check=False,
    )
    assert run.returncode == 0, run.stdout


@pytest.mark.parametrize(
    ("source", "detail"),
    [
        ('x = hass.data.get("frontend_panels", {})', "frontend_panels"),
        ('x = self.hass.data["image"]', "image"),
        ('if "frontend_panels" in hass.data: pass', "frontend_panels"),
        (
            "from homeassistant.components.ai_task.const import DATA_PREFERENCES\n"
            "p = hass.data.get(DATA_PREFERENCES)",
            "DATA_PREFERENCES",
        ),
        ("from homeassistant.components.ai_task.const import DATA_PREFERENCES", None),
    ],
)
def test_private_ha_api_guard_flags(source: str, detail: str | None):
    findings = _guard().check_source(source, "x.py")
    assert findings
    if detail is not None:
        assert any(f[1] == "hass-data" and f[2] == detail for f in findings)
    else:
        assert findings[0][1] == "import"


def test_private_ha_api_guard_allows_own_domain():
    source = 'hass.data.setdefault(DOMAIN, {})\nhass.data["homebrain"]'
    assert _guard().check_source(source, "x") == []
