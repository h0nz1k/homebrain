"""Fixtures for HomeBrain integration tests."""

from pathlib import Path
from unittest.mock import patch

import pytest


@pytest.fixture(autouse=True)
def auto_enable_custom_integrations(enable_custom_integrations):
    """Enable custom integration loading through the pytest HA plugin."""


@pytest.fixture(autouse=True)
def frontend_assets(tmp_path):
    """Avoid requiring HA's compiled UI assets for backend registration tests."""
    with patch("homeassistant.components.frontend._frontend_root", return_value=tmp_path):
        yield


@pytest.fixture(autouse=True)
def weather_autostart_off():
    """Weather fetch timers only run in tests that start the manager explicitly."""
    with patch("custom_components.homebrain.weather.AUTOSTART", False):
        yield


@pytest.fixture
def hass_config_dir(tmp_path: Path) -> str:
    """Keep HA storage private to each test, including concurrent worktree runs."""
    config_dir = tmp_path / "ha-config"
    config_dir.mkdir()
    return str(config_dir)
