"""Register the HomeBrain panel, its versioned frontend assets and the modules.

Every backend module is registered and set up in isolation (``modules.py``, #28): a
failing module gets a repair issue and an "unavailable" panel, the others keep running.
Panels are tracked in HomeBrain's own bookkeeping (no foreign ``hass.data`` keys, #27).
"""

import logging
from collections.abc import Callable
from pathlib import Path
from typing import Any

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
from .energy.ws import websocket_compare, websocket_pv_forecast
from .modules import (
    STATE_DISABLED,
    Registrar,
    async_setup_modules,
    async_unload_modules,
    disabled_modules,
    module_states,
    record_failure,
    register_modules,
)
from .network import ws as network_ws
from .recipes import websocket as recipes_ws
from .robots.schedules import RobotScheduler
from .robots.schedules_ws import SCHEDULE_COMMANDS
from .robots.ws import (
    PRESET_COMMANDS,
    RobotMapImageView,
    known_room_ids,
    preset_store,
    websocket_robots_get,
    websocket_robots_map,
)
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
_PANELS_KEY = "panels"


def _http_view(hass: HomeAssistant, view: Any) -> None:
    if hass.http is not None:
        hass.http.register_view(view)


def _commands(*handlers: Any) -> Callable[[HomeAssistant], Callable[[Registrar], None]]:
    def bind(hass: HomeAssistant) -> Callable[[Registrar], None]:
        def register(reg: Registrar) -> None:
            for handler in handlers:
                reg(hass, handler)

        return register

    return bind


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    """Register WebSocket commands once; each module in isolation (disabled -> skipped)."""
    # Core: bindings, session and roles are always available (Settings, kiosk, Dnes).
    websocket_api.async_register_command(hass, websocket_get_bindings)
    websocket_api.async_register_command(hass, websocket_set_bindings)
    websocket_api.async_register_command(hass, websocket_get_session)
    websocket_api.async_register_command(hass, websocket_get_roles)
    websocket_api.async_register_command(hass, websocket_set_roles)

    def weather_reg(reg: Registrar) -> None:
        _commands(websocket_weather_get, websocket_weather_alerts)(hass)(reg)
        _http_view(hass, RadarImageView())

    def robots_reg(reg: Registrar) -> None:
        _commands(websocket_robots_get, websocket_robots_map, *PRESET_COMMANDS, *SCHEDULE_COMMANDS)(
            hass
        )(reg)
        _http_view(hass, RobotMapImageView())

    register_modules(
        hass,
        {
            "weather": weather_reg,
            "energy": _commands(websocket_pv_forecast, websocket_compare)(hass),
            "waste": _commands(websocket_waste_history)(hass),
            "robots": robots_reg,
            "wine": lambda reg: wine_ws.async_register(hass, reg),
            "recipes": lambda reg: recipes_ws.async_register(hass, reg),
            "access": lambda reg: access_ws.async_register(hass, reg),
            "network": _commands(*network_ws.COMMANDS)(hass),
        },
    )
    if module_states(hass).get("wine") is None:
        # Services, intents and sentences are wine's non-WS surface; same isolation.
        try:
            await wine_services.async_setup_services(hass)
            await wine_intents.async_register_intents(hass)
            await wine_sentences.async_install_sentences(hass)
        except Exception as err:  # noqa: BLE001 - isolate the module, keep HA running
            record_failure(hass, "wine", err, registration=True)
    return True


def _frontend_status() -> tuple[bool, bool]:
    """Check for built assets outside the event loop."""
    return _FRONTEND_DIR.is_dir(), (_FRONTEND_DIR / "homebrain-panel.js").is_file()


def _registered_panels(hass: HomeAssistant) -> set[str]:
    """Panels HomeBrain registered itself (own bookkeeping, not HA's private panel map)."""
    return hass.data.setdefault(DOMAIN, {}).setdefault(_PANELS_KEY, set())


async def _async_register_panel(hass: HomeAssistant, path: str, **kwargs: Any) -> None:
    registered = _registered_panels(hass)
    if path in registered:
        return
    await panel_custom.async_register_panel(hass, frontend_url_path=path, **kwargs)
    registered.add(path)


async def _async_setup_panels(hass: HomeAssistant, static_url: str, disabled: set[str]) -> None:
    panels = {
        **{
            path: panel
            for path, panel in MODULE_PANELS.items()
            if panel.get("module") not in disabled
        },
        SETTINGS_PANEL_URL_PATH: {"module": "settings"},
        PANEL_URL_PATH: {"legacy": True},
    }
    for path, panel in panels.items():
        await _async_register_panel(
            hass,
            path,
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
    await _async_register_panel(
        hass,
        KIOSK_PANEL_URL_PATH,
        webcomponent_name=WEB_COMPONENT,
        sidebar_title=KIOSK_PANEL_TITLE,
        sidebar_icon=KIOSK_PANEL_ICON,
        module_url=f"{static_url}/homebrain-panel.js",
        embed_iframe=True,
        require_admin=False,
        config={"kiosk": True},
    )


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Serve the frontend, admin module panels, the Dnes kiosk panel and the modules."""
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

    disabled = disabled_modules(entry.options)
    await _async_setup_panels(hass, static_url, disabled)

    async def _setup_weather(hass: HomeAssistant, entry: ConfigEntry) -> None:
        if "weather" in hass.data[DOMAIN]:
            return
        manager = WeatherManager(hass, entry, str(version))
        hass.data[DOMAIN]["weather"] = manager
        if weather.AUTOSTART:
            await manager.async_start()

    async def _setup_energy(hass: HomeAssistant, entry: ConfigEntry) -> None:
        if "pv_forecast" not in hass.data[DOMAIN]:
            hass.data[DOMAIN]["pv_forecast"] = PvForecastManager(
                hass, USER_AGENT.format(version=version)
            )

    async def _setup_wine(hass: HomeAssistant, entry: ConfigEntry) -> None:
        if weather.AUTOSTART:
            # Weekly polite Znovín e-shop price snapshots (background, ≤1 request/s).
            wine_ws.async_setup_price_refresh(hass, entry)

    async def _setup_recipes(hass: HomeAssistant, entry: ConfigEntry) -> None:
        async def _restore_timers(_hass: HomeAssistant) -> None:
            # Recepty minutky: re-arm persisted timers (expired-while-down ones fire now).
            await recipes_ws.async_restore_timers(hass)

        entry.async_on_unload(async_at_started(hass, _restore_timers))

    async def _setup_robots(hass: HomeAssistant, entry: ConfigEntry) -> None:
        # Roboti: cleaning schedules run by the integration (minute tick, after HA start).
        if "robot_scheduler" in hass.data[DOMAIN]:
            return
        manager = RobotScheduler(
            hass,
            lambda: get_bindings(entry).get("robots", {}),
            lambda: entry.options,
            preset_store(hass),
            lambda vacuum: known_room_ids(hass, vacuum),
        )
        hass.data[DOMAIN]["robot_scheduler"] = manager

        async def _start(_hass: HomeAssistant) -> None:
            await manager.async_start()

        entry.async_on_unload(async_at_started(hass, _start))

    async def _setup_access(hass: HomeAssistant, entry: ConfigEntry) -> None:
        # Přístup: listen to esphome.biolock_* events from the start (history, live wizard).
        await access_ws.async_get_manager(hass)

    await async_setup_modules(
        hass,
        entry,
        {
            "weather": _setup_weather,
            "energy": _setup_energy,
            "waste": _async_setup_waste_history,
            "wine": _setup_wine,
            "recipes": _setup_recipes,
            "access": _setup_access,
            "robots": _setup_robots,
            "network": network_ws.async_setup,
        },
    )
    entry.async_on_unload(entry.add_update_listener(_async_options_updated))
    return True


async def _async_options_updated(hass: HomeAssistant, entry: ConfigEntry) -> None:
    """Reload when a module was switched on/off; plain binding edits need no reload."""
    states = module_states(hass)
    was_disabled = {module for module, state in states.items() if state == STATE_DISABLED}
    if disabled_modules(entry.options) != was_disabled:
        hass.config_entries.async_schedule_reload(entry.entry_id)


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


async def _unload_weather(hass: HomeAssistant) -> None:
    if (manager := hass.data.get(DOMAIN, {}).pop("weather", None)) is not None:
        await manager.async_stop()


async def _unload_energy(hass: HomeAssistant) -> None:
    hass.data.get(DOMAIN, {}).pop("pv_forecast", None)


async def _unload_robots(hass: HomeAssistant) -> None:
    hass.data.get(DOMAIN, {}).pop("robot_rooms", None)
    if (manager := hass.data.get(DOMAIN, {}).pop("robot_scheduler", None)) is not None:
        await manager.async_stop()


async def _unload_waste(hass: HomeAssistant) -> None:
    if (history := hass.data.get(DOMAIN, {}).pop("waste_history", None)) is not None:
        await history.async_stop()


async def _unload_wine(hass: HomeAssistant) -> None:
    await wine_services.async_unload_services(hass)
    await wine_ws.async_close_store(hass)


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Remove our panels (own bookkeeping) while retaining the registered static route."""
    registered = _registered_panels(hass)
    for path in sorted(registered):
        frontend.async_remove_panel(hass, path)
    registered.clear()
    await async_unload_modules(
        hass,
        (
            ("wine", _unload_wine),
            ("recipes", recipes_ws.async_close_store),
            ("access", access_ws.async_stop),
            ("weather", _unload_weather),
            ("energy", _unload_energy),
            ("robots", _unload_robots),
            ("waste", _unload_waste),
            ("network", network_ws.async_unload),
        ),
    )
    return True
