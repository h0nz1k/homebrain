"""Renamed contract keys: map aliases + one-time entity registry migration.

The two ground-collector temperatures used older key names. An existing private map
keeps working (old names are aliases, logged as deprecated) and the entities registered
under the old unique ids are moved to the new ones on setup, so the recorder carries
state history and long-term statistics over to the new entity ids.
"""

from __future__ import annotations

import logging
from typing import Final

from homeassistant.core import HomeAssistant
from homeassistant.helpers import entity_registry as er

from ..const import DOMAIN
from .keys import object_id

_LOGGER = logging.getLogger(__name__)

# old contract key -> current contract key (the only place the old names may appear)
LEGACY_KEYS: Final[dict[str, str]] = {
    "heat_pump.brine_in": "heat_pump.collector_in",
    "heat_pump.brine_out": "heat_pump.collector_out",
}

_PLATFORM: Final = "sensor"


def _uid(key: str) -> str:
    # same as entities.unique_id (not imported: mapfile -> legacy must stay import-light)
    return f"heating_{object_id(key)}"


def async_migrate_entities(hass: HomeAssistant) -> int:
    """Move legacy-key entities to the current unique id (and default entity id).

    Idempotent. Skips an entry when the new unique id is already registered; keeps a
    user-customised entity id and never takes an entity id that is already in use.
    Returns the number of migrated entries.
    """
    reg = er.async_get(hass)
    migrated = 0
    for old_key, new_key in LEGACY_KEYS.items():
        old_uid, new_uid = _uid(old_key), _uid(new_key)
        entity_id = reg.async_get_entity_id(_PLATFORM, DOMAIN, old_uid)
        if entity_id is None:
            continue
        if reg.async_get_entity_id(_PLATFORM, DOMAIN, new_uid) is not None:
            _LOGGER.warning(
                "Topení: %s not migrated, unique id %s already exists", entity_id, new_uid
            )
            continue
        changes: dict[str, str] = {"new_unique_id": new_uid}
        target = f"{_PLATFORM}.{new_uid}"
        if entity_id == f"{_PLATFORM}.{old_uid}":
            if reg.async_is_registered(target) or hass.states.get(target) is not None:
                _LOGGER.warning("Topení: %s kept, %s is already in use", entity_id, target)
            else:
                changes["new_entity_id"] = target
        reg.async_update_entity(entity_id, **changes)
        _LOGGER.info("Topení: migrated %s -> %s", entity_id, changes)
        migrated += 1
    return migrated
