"""Roboti (#21): robot floor + entity bindings discovered from the HA registries.

Only public helpers (``entity_registry``/``device_registry``/``area_registry``/
``floor_registry``). Used by the options flow alone – nothing is rediscovered at setup.
"""

from __future__ import annotations

from collections.abc import Mapping
from typing import Final

from homeassistant.core import HomeAssistant
from homeassistant.helpers import area_registry as ar
from homeassistant.helpers import device_registry as dr
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers import floor_registry as fr

from .config import ROBOT_KEY_DOMAINS

# (domain, translation_key) of the HA Roborock entities -> binding suffix. Verified on
# Qrevo Edge (a187), Saros 10R (a144) and S7 MaxV Ultra (a27); dock entities live on the
# separate "<duid>_dock" device of the same config entry.
TRANSLATION_KEYS: Final[dict[tuple[str, str], str]] = {
    ("vacuum", "roborock"): "vacuum",
    ("sensor", "status"): "status",
    ("sensor", "vacuum_error"): "error",
    ("sensor", "dock_error"): "dock_error",
    ("sensor", "current_room"): "current_room",
    ("sensor", "clean_percent"): "cleaning_progress",
    ("sensor", "main_brush_time_left"): "main_brush",
    ("sensor", "side_brush_time_left"): "side_brush",
    ("sensor", "filter_time_left"): "filter",
    ("sensor", "sensor_time_left"): "sensors",
    ("sensor", "strainer_time_left"): "dock_strainer",
    ("sensor", "cleaning_brush_time_left"): "dock_brush",
    ("binary_sensor", "clean_box_empty"): "clean_water",
    ("binary_sensor", "dirty_box_full"): "dirty_water",
    ("binary_sensor", "clean_fluid_empty"): "cleaning_fluid",
    ("binary_sensor", "water_shortage"): "water_shortage",
    ("select", "cleaning_mode"): "cleaning_mode",
    ("select", "mop_intensity"): "mop_intensity",
    ("select", "mop_mode"): "mop_mode",
    ("select", "selected_map"): "selected_map",
}
# Entities without a translation_key, matched by device class instead.
DEVICE_CLASSES: Final[dict[tuple[str, str], str]] = {("sensor", "battery"): "battery"}
DOCK_SUFFIX: Final = "_dock"


def _vacuum_device(
    hass: HomeAssistant, vacuum: str
) -> tuple[er.RegistryEntry, dr.DeviceEntry] | None:
    if not vacuum or not (entity := er.async_get(hass).async_get(vacuum)) or not entity.device_id:
        return None
    if (device := dr.async_get(hass).async_get(entity.device_id)) is None:
        return None
    return entity, device


def _companion_devices(hass: HomeAssistant, device: dr.DeviceEntry) -> list[dr.DeviceEntry]:
    """The robot device first, then its dock (HA Roborock: identifier ``<duid>_dock``)."""
    devices = dr.async_get(hass)
    found = [device]
    for domain, identifier in sorted(device.identifiers):
        dock = devices.async_get_device(identifiers={(domain, f"{identifier}{DOCK_SUFFIX}")})
        if dock is not None and dock not in found:
            found.append(dock)
    return found


def _suffix(entity: er.RegistryEntry) -> str | None:
    if entity.translation_key and (
        suffix := TRANSLATION_KEYS.get((entity.domain, entity.translation_key))
    ):
        return suffix
    device_class = entity.device_class or entity.original_device_class
    if not entity.translation_key and device_class:
        return DEVICE_CLASSES.get((entity.domain, str(device_class)))
    return None


def discover_bindings(hass: HomeAssistant, vacuum: str) -> dict[str, str]:
    """Binding suffix -> entity id found on the vacuum's device (+ dock); enabled entities only."""
    if (found := _vacuum_device(hass, vacuum)) is None:
        return {}
    vacuum_entity, device = found
    registry = er.async_get(hass)
    result: dict[str, str] = {"vacuum": vacuum_entity.entity_id}
    images: list[str] = []
    for companion in _companion_devices(hass, device):
        entries = sorted(
            er.async_entries_for_device(registry, companion.id), key=lambda e: e.entity_id
        )
        for entity in entries:
            if entity.hidden_by is not None:
                continue
            if entity.domain == "image" and companion.id == device.id:
                images.append(entity.entity_id)
            suffix = _suffix(entity)
            if suffix and suffix not in result and ROBOT_KEY_DOMAINS[suffix] == entity.domain:
                result[suffix] = entity.entity_id
    if len(images) == 1:  # several maps -> ambiguous, the user picks one
        result["map_image"] = images[0]
    return result


def discover_floor(hass: HomeAssistant, vacuum: str) -> str | None:
    """Name of the HA floor of the vacuum's area (entity area overrides the device's)."""
    if (found := _vacuum_device(hass, vacuum)) is None:
        return None
    entity, device = found
    if not (area_id := entity.area_id or device.area_id):
        return None
    if (area := ar.async_get(hass).async_get_area(area_id)) is None or not area.floor_id:
        return None
    floor = fr.async_get(hass).async_get_floor(area.floor_id)
    return floor.name if floor is not None else None


def missing_bindings(
    current: Mapping[str, str], slot: int, found: Mapping[str, str]
) -> dict[str, str]:
    """Discovered bindings for keys of ``slot`` that are still empty (never overwrites)."""
    return {
        key: entity_id
        for suffix, entity_id in found.items()
        if not current.get(key := f"robot{slot}_{suffix}")
    }
