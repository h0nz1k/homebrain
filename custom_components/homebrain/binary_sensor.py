"""HomeBrain binary sensors (Topení heat pump; only when the module is configured)."""

from __future__ import annotations

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .const import DOMAIN


async def async_setup_entry(
    hass: HomeAssistant, entry: ConfigEntry, async_add_entities: AddEntitiesCallback
) -> None:
    from .heating.entities import build_entities

    if (poller := hass.data.get(DOMAIN, {}).get("heating")) is not None:
        async_add_entities(build_entities(poller, "binary_sensor"))
