"""Test panel registration, static assets, and unloading."""

from pathlib import Path
from unittest.mock import patch

import pytest
from homeassistant.core import HomeAssistant
from homeassistant.loader import async_get_integration
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.homebrain import async_setup_entry, async_unload_entry
from custom_components.homebrain.const import DOMAIN, MODULE_PANELS


@pytest.mark.parametrize("assets", ["built", "missing_directory", "missing_entry"])
async def test_setup_unload_reload(
    hass: HomeAssistant, tmp_path: Path, caplog, assets: str, hass_client
):
    """Panel setup tolerates absent builds and static routes survive reloads."""
    frontend_dir = tmp_path / "frontend"
    if assets != "missing_directory":
        frontend_dir.mkdir()
    if assets == "built":
        (frontend_dir / "homebrain-panel.js").write_text("// Test frontend\n")

    entry = MockConfigEntry(domain=DOMAIN, title="HomeBrain", data={})
    entry.add_to_hass(hass)

    with patch("custom_components.homebrain._FRONTEND_DIR", frontend_dir):
        assert await hass.config_entries.async_setup(entry.entry_id)
        await hass.async_block_till_done()
        integration = await async_get_integration(hass, DOMAIN)
        for panel_id, panel_info in MODULE_PANELS.items():
            panel = hass.data["frontend_panels"][panel_id]
            assert panel.sidebar_title == panel_info["title"]
            assert panel.sidebar_icon == panel_info["icon"]
            assert panel.require_admin is panel_info.get("require_admin", True)
            assert panel.config["module"] == panel_info["module"]
            assert panel.config["_panel_custom"] == {
                "name": "homebrain-panel",
                "embed_iframe": True,
                "handle_safe_area": False,
                "trust_external": False,
                "module_url": f"/homebrain_static/{integration.version}/homebrain-panel.js",
            }

        legacy = hass.data["frontend_panels"]["homebrain"]
        assert legacy.sidebar_title is None
        assert legacy.config["legacy"] is True
        assert legacy.sidebar_icon is None
        assert legacy.require_admin is True

        settings = hass.data["frontend_panels"]["homebrain-nastaveni"]
        assert settings.sidebar_title is None
        assert settings.sidebar_icon is None
        assert settings.require_admin is True
        assert settings.config["module"] == "settings"

        # Check common config on one panel
        custom_config = hass.data["frontend_panels"]["homebrain-dnes"].config["_panel_custom"]
        assert custom_config["name"] == "homebrain-panel"
        assert custom_config["embed_iframe"] is True
        assert custom_config["module_url"] == (
            f"/homebrain_static/{integration.version}/homebrain-panel.js"
        )
        kiosk = hass.data["frontend_panels"]["homebrain-kiosk"]
        assert kiosk.require_admin is False
        assert kiosk.sidebar_title == "Dnes"
        kiosk_config = kiosk.config["_panel_custom"]
        assert kiosk_config["name"] == "homebrain-panel"
        assert kiosk_config["module_url"] == custom_config["module_url"]
        assert kiosk.config["kiosk"] is True
        if assets != "built":
            assert "HomeBrain frontend build is missing" in caplog.text

        # Repeated setup must neither overwrite nor duplicate registered panels.
        panels_before = dict(hass.data["frontend_panels"])
        with patch(
            "custom_components.homebrain.panel_custom.async_register_panel"
        ) as register_panel:
            assert await async_setup_entry(hass, entry)
            register_panel.assert_not_called()
        assert hass.data["frontend_panels"] == panels_before

        with patch.object(
            hass.http, "async_register_static_paths", wraps=hass.http.async_register_static_paths
        ) as register_paths:
            assert await hass.config_entries.async_unload(entry.entry_id)
            for panel_id in MODULE_PANELS:
                assert panel_id not in hass.data["frontend_panels"]
            assert "homebrain" not in hass.data["frontend_panels"]
            assert "homebrain-nastaveni" not in hass.data["frontend_panels"]
            assert "homebrain-kiosk" not in hass.data["frontend_panels"]
            assert await hass.config_entries.async_setup(entry.entry_id)
            await hass.async_block_till_done()
            register_paths.assert_not_called()
        for panel_id in MODULE_PANELS:
            assert panel_id in hass.data["frontend_panels"]
        assert "homebrain" in hass.data["frontend_panels"]
        assert "homebrain-nastaveni" in hass.data["frontend_panels"]
        assert "homebrain-kiosk" in hass.data["frontend_panels"]
        if assets == "built":
            client = await hass_client()
            response = await client.get(custom_config["module_url"])
            assert response.status == 200
            assert await response.text() == "// Test frontend\n"
            assert "public" in response.headers["Cache-Control"]
        assert await hass.config_entries.async_unload(entry.entry_id)

    # Cleanup is safe even when panels have already been removed.
    assert await async_unload_entry(hass, entry)
