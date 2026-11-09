"""Topení entry setup/unload: poller + sensor platforms, in its own isolation."""

from __future__ import annotations

from typing import Any, Final

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant

from ..bindings import get_bindings
from ..const import DOMAIN
from ..modules import CONF_DISABLED_MODULES, record_failure
from .poller import CONF_HEATING, DATA_KEY, HeatingOptions, HeatingPoller

PLATFORMS: Final = ["sensor", "binary_sensor"]
_PLATFORMS_KEY: Final = "heating_platforms"


def _heating_options(entry: ConfigEntry) -> dict[str, Any]:
    raw = entry.options.get(CONF_HEATING)
    return dict(raw) if isinstance(raw, dict) else {}


async def async_setup_heating(hass: HomeAssistant, entry: ConfigEntry) -> None:
    """Start the read-only poller and the entities when a PLC URL is configured."""
    snapshot = _heating_options(entry)

    async def _options_updated(hass: HomeAssistant, entry: ConfigEntry) -> None:
        if _heating_options(entry) != snapshot:
            hass.config_entries.async_schedule_reload(entry.entry_id)

    entry.async_on_unload(entry.add_update_listener(_options_updated))
    if "heating" in (entry.options.get(CONF_DISABLED_MODULES) or []):
        return
    if (opts := HeatingOptions.from_options(snapshot, hass)) is None:
        return
    data = hass.data.setdefault(DOMAIN, {})
    try:
        poller = HeatingPoller(hass, opts, lambda: get_bindings(entry).get("heating", {}))
        await poller.async_start()
        data[DATA_KEY] = poller
        await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
        data[_PLATFORMS_KEY] = True
    except Exception as err:  # noqa: BLE001 - isolate the module, keep HA running
        record_failure(hass, "heating", err)


async def async_unload_heating(hass: HomeAssistant, entry: ConfigEntry) -> None:
    data = hass.data.get(DOMAIN, {})
    if data.pop(_PLATFORMS_KEY, False):
        await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
    poller: HeatingPoller | None = data.pop(DATA_KEY, None)
    if poller is not None:
        await poller.async_stop()
