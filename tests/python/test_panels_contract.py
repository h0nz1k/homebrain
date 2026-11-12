"""Panel url paths have one source (panels.json) shared by the integration and the frontend."""

import json
from pathlib import Path

from custom_components.homebrain import const

ROOT = Path(__file__).resolve().parents[2]
PANELS = json.loads((ROOT / "custom_components/homebrain/panels.json").read_text(encoding="utf-8"))


def test_access_panel_is_registered_under_its_czech_path():
    """Přístup tabs navigate to /homebrain-pristup/<tab>; HA must know that panel."""
    assert const.MODULE_PANELS["homebrain-pristup"]["module"] == "access"


def test_const_panels_come_from_panels_json():
    expected = {
        panel["url_path"]: {key: value for key, value in panel.items() if key != "url_path"}
        for panel in PANELS["modules"]
    }
    assert expected == const.MODULE_PANELS
    assert PANELS["settings"]["url_path"] == const.SETTINGS_PANEL_URL_PATH
    assert PANELS["kiosk"]["url_path"] == const.KIOSK_PANEL_URL_PATH
    assert PANELS["kiosk"]["title"] == const.KIOSK_PANEL_TITLE
    assert PANELS["kiosk"]["icon"] == const.KIOSK_PANEL_ICON
    assert PANELS["legacy"]["url_path"] == const.PANEL_URL_PATH


def test_every_frontend_module_has_a_panel():
    """A module without a registered panel sends its links to HA's default dashboard."""
    frontend = {
        path.name for path in (ROOT / "modules").iterdir() if (path / "package.json").exists()
    }
    # family lives inside the settings panel.
    routed = {panel["module"] for panel in PANELS["modules"]} | {"family"}
    # Kitchen and communication are panel-local views.
    assert frontend | {"kitchen", "communication"} == routed


def test_panel_paths_are_unique_and_prefixed():
    paths = [panel["url_path"] for panel in PANELS["modules"]]
    paths += [PANELS["settings"]["url_path"], PANELS["kiosk"]["url_path"]]
    assert len(paths) == len(set(paths))
    assert all(path.startswith("homebrain-") and "/" not in path for path in paths)
