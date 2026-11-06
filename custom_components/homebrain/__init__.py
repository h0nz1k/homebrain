"""Register the HomeBrain panel and its versioned frontend assets."""

import logging
from pathlib import Path

from homeassistant.components import frontend, panel_custom, websocket_api
from homeassistant.components.http import StaticPathConfig
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.start import async_at_started
from homeassistant.helpers.typing import ConfigType
from homeassistant.loader import async_get_integration

from . import weather
from .access import ws as access_ws
from .bindings import get_bindings
from .const import (
    DOMAIN,
    KIOSK_PANEL_ICON,
    KIOSK_PANEL_TITLE,
    KIOSK_PANEL_URL_PATH,
    MODULE_PANELS,
    PANEL_URL_PATH,
    SETTINGS_PANEL_URL_PATH,
    STATIC_URL_BASE,
    WEB_COMPONENT,
)
from .energy.pv_forecast import PvForecastManager
from .energy.ws import websocket_pv_forecast
from .recipes import websocket as recipes_ws
from .robots.ws import RobotMapImageView, websocket_robots_get, websocket_robots_map
from .waste.history import WasteHistoryManager
from .waste.ws import websocket_waste_history
from .weather.coordinator import WeatherManager
from .weather.fetch import USER_AGENT
from .weather.ws import RadarImageView, websocket_weather_alerts, websocket_weather_get
from .websocket import (
    websocket_get_bindings,
    websocket_get_roles,
    websocket_get_session,
    websocket_set_bindings,
    websocket_set_roles,
)
from .wine import intents as wine_intents
from .wine import sentences as wine_sentences
from .wine import services as wine_services
from .wine import websocket as wine_ws

CONFIG_SCHEMA = cv.config_entry_only_config_schema(DOMAIN)

_LOGGER = logging.getLogger(__name__)
_FRONTEND_DIR = Path(__file__).parent / "frontend"


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    """Register WebSocket commands once for the integration."""
    websocket_api.async_register_command(hass, websocket_get_bindings)
    websocket_api.async_register_command(hass, websocket_set_bindings)
    websocket_api.async_register_command(hass, websocket_get_session)
    websocket_api.async_register_command(hass, websocket_get_roles)
    websocket_api.async_register_command(hass, websocket_set_roles)
    wine_ws.async_register(hass)
    recipes_ws.async_register(hass)
    access_ws.async_register(hass)
    await wine_services.async_setup_services(hass)
    await wine_intents.async_register_intents(hass)
    await wine_sentences.async_install_sentences(hass)
    websocket_api.async_register_command(hass, websocket_weather_get)
    websocket_api.async_register_command(hass, websocket_weather_alerts)
    if hass.http is not None:
        hass.http.register_view(RadarImageView())
        hass.http.register_view(RobotMapImageView())
    websocket_api.async_register_command(hass, websocket_pv_forecast)
    websocket_api.async_register_command(hass, websocket_waste_history)
    websocket_api.async_register_command(hass, websocket_robots_get)
    websocket_api.async_register_command(hass, websocket_robots_map)
    return True


def _frontend_status() -> tuple[bool, bool]:
    """Check for built assets outside the event loop."""
    return _FRONTEND_DIR.is_dir(), (_FRONTEND_DIR / "homebrain-panel.js").is_file()


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Serve the frontend, admin module panels and the Dnes kiosk panel."""
    integration = await async_get_integration(hass, DOMAIN)
    version = integration.version
    static_url = f"{STATIC_URL_BASE}/{version}"
    registered_paths = hass.data.setdefault(DOMAIN, {}).setdefault("static_paths", set())

    directory_exists, entry_exists = await hass.async_add_executor_job(_frontend_status)
    if not directory_exists or not entry_exists:
        _LOGGER.warning(
            "HomeBrain frontend build is missing at %s; build the frontend to use the panel",
            _FRONTEND_DIR,
        )

    # HTTP routes outlive config entries, so retain this guard when unloading.
    # A missing directory cannot be registered; retry on the next setup instead.
    if directory_exists and static_url not in registered_paths:
        await hass.http.async_register_static_paths(
            [StaticPathConfig(static_url, str(_FRONTEND_DIR), cache_headers=True)]
        )
        registered_paths.add(static_url)

    panels = {
        **MODULE_PANELS,
        SETTINGS_PANEL_URL_PATH: {"module": "settings"},
        PANEL_URL_PATH: {"legacy": True},
    }
    for path, panel in panels.items():
        if path in hass.data.get("frontend_panels", {}):
            continue
        await panel_custom.async_register_panel(
            hass,
            frontend_url_path=path,
            webcomponent_name=WEB_COMPONENT,
            sidebar_title=panel.get("title"),
            sidebar_icon=panel.get("icon"),
            module_url=f"{static_url}/homebrain-panel.js",
            embed_iframe=True,
            require_admin=panel.get("require_admin", True),
            config={"legacy": True} if panel.get("legacy") else {"module": panel["module"]},
        )
    # Wall tablet: same bundle, always Dnes in kiosk layout. Non-admin users may open it;
    # the server only answers them the kiosk WS commands (roles.KIOSK_WS_COMMANDS).
    if KIOSK_PANEL_URL_PATH not in hass.data.get("frontend_panels", {}):
        await panel_custom.async_register_panel(
            hass,
            frontend_url_path=KIOSK_PANEL_URL_PATH,
            webcomponent_name=WEB_COMPONENT,
            sidebar_title=KIOSK_PANEL_TITLE,
            sidebar_icon=KIOSK_PANEL_ICON,
            module_url=f"{static_url}/homebrain-panel.js",
            embed_iframe=True,
            require_admin=False,
            config={"kiosk": True},
        )

    await _async_setup_waste_history(hass, entry)
    # Přístup: listen to esphome.biolock_* events from the start (history, live wizard state).
    await access_ws.async_get_manager(hass)

    async def _restore_timers(_hass: HomeAssistant) -> None:
        # Recepty minutky: re-arm persisted timers (expired-while-down ones fire now).
        await recipes_ws.async_restore_timers(hass)

    entry.async_on_unload(async_at_started(hass, _restore_timers))

    if "weather" in hass.data[DOMAIN]:
        return True
    manager = WeatherManager(hass, entry, str(version))
    hass.data[DOMAIN]["weather"] = manager
    hass.data[DOMAIN]["pv_forecast"] = PvForecastManager(hass, USER_AGENT.format(version=version))
    if weather.AUTOSTART:
        await manager.async_start()
        # Weekly polite Znovín e-shop price snapshots (background, ≤1 request/s).
        wine_ws.async_setup_price_refresh(hass, entry)
    return True


async def _async_setup_waste_history(hass: HomeAssistant, entry: ConfigEntry) -> None:
    """Remember observed waste collections (the sources only publish the future)."""
    if "waste_history" in hass.data[DOMAIN]:
        return
    manager = WasteHistoryManager(hass, lambda: get_bindings(entry).get("waste", {}))
    hass.data[DOMAIN]["waste_history"] = manager

    async def _start(_hass: HomeAssistant) -> None:
        await manager.async_start()

    entry.async_on_unload(async_at_started(hass, _start))

    async def _options_updated(_hass: HomeAssistant, _entry: ConfigEntry) -> None:
        # Bindings are saved without reloading the entry; follow them here.
        await manager.async_refresh()

    entry.async_on_unload(entry.add_update_listener(_options_updated))


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Remove all panels while retaining the registered static route."""
    for path in (*MODULE_PANELS, SETTINGS_PANEL_URL_PATH, PANEL_URL_PATH, KIOSK_PANEL_URL_PATH):
        frontend.async_remove_panel(hass, path)
    await wine_services.async_unload_services(hass)
    await wine_ws.async_close_store(hass)
    await recipes_ws.async_close_store(hass)
    await access_ws.async_stop(hass)
    if (manager := hass.data.get(DOMAIN, {}).pop("weather", None)) is not None:
        await manager.async_stop()
    hass.data.get(DOMAIN, {}).pop("pv_forecast", None)
    hass.data.get(DOMAIN, {}).pop("robot_rooms", None)
    if (history := hass.data.get(DOMAIN, {}).pop("waste_history", None)) is not None:
        await history.async_stop()
    return True
