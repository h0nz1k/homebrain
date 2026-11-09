"""Room lists from ``roborock.get_maps`` (read-only service), cached per vacuum."""

from __future__ import annotations

import asyncio
import logging
from collections.abc import Mapping
from datetime import datetime, timedelta
from typing import Any, Final

from homeassistant.core import HomeAssistant
from homeassistant.util import dt as dt_util

_LOGGER = logging.getLogger(__name__)

# The only Roborock service this module ever calls itself; it reads the map list and never
# moves the robot. Cleaning commands are sent by the panel through HA services (allowlist).
READ_ONLY_SERVICE: Final = ("roborock", "get_maps")
CACHE_TTL: Final = timedelta(minutes=30)
ERROR_TTL: Final = timedelta(minutes=2)
CALL_TIMEOUT: Final = 20
MAX_ROOMS: Final = 64


def normalize_maps(response: Any, entity_id: str) -> list[dict[str, Any]]:
    """``{entity_id: {maps: [{flag, name, rooms: {id: name}}]}}`` -> sorted, validated maps."""
    if not isinstance(response, Mapping):
        return []
    payload = response.get(entity_id, response)
    maps = payload.get("maps") if isinstance(payload, Mapping) else None
    result: list[dict[str, Any]] = []
    for item in maps if isinstance(maps, list) else []:
        if not isinstance(item, Mapping):
            continue
        flag = item.get("flag")
        if isinstance(flag, bool) or not isinstance(flag, int):
            continue
        rooms_raw = item.get("rooms")
        rooms: list[dict[str, Any]] = []
        if isinstance(rooms_raw, Mapping):
            for key, name in rooms_raw.items():
                try:
                    room_id = int(key)
                except (TypeError, ValueError):
                    continue
                if room_id < 0 or not isinstance(name, str):
                    continue
                rooms.append({"id": room_id, "name": " ".join(name.split())[:60] or f"#{room_id}"})
        rooms.sort(key=lambda room: room["id"])
        name = item.get("name")
        result.append(
            {
                "flag": flag,
                "name": name if isinstance(name, str) else "",
                "rooms": rooms[:MAX_ROOMS],
            }
        )
    result.sort(key=lambda item: item["flag"])
    return result


class RoomCache:
    """Per-vacuum cache so opening the panel does not query the cloud each time."""

    def __init__(self, hass: HomeAssistant) -> None:
        self.hass = hass
        self._entries: dict[str, tuple[datetime, dict[str, Any]]] = {}
        self._locks: dict[str, asyncio.Lock] = {}
        self._mismatches: dict[str, tuple[frozenset[int], datetime]] = {}

    async def async_get(self, entity_id: str, refresh: bool = False) -> dict[str, Any]:
        """Return ``{maps, error, updated_at}`` for a bound vacuum entity."""
        lock = self._locks.setdefault(entity_id, asyncio.Lock())
        async with lock:
            now = dt_util.utcnow()
            cached = self._entries.get(entity_id)
            if cached and not refresh:
                at, value = cached
                ttl = ERROR_TTL if value["error"] else CACHE_TTL
                if now - at < ttl:
                    return value
            value = await self._async_fetch(entity_id)
            if value["error"] and cached and cached[1]["maps"]:
                # Keep the last good room list; tell the panel it may be outdated.
                value = {**cached[1], "error": value["error"]}
            self._entries[entity_id] = (now, value)
            return value

    async def async_match_segments(
        self, entity_id: str, segment_ids: set[int], selected: str | None = None
    ) -> dict[str, Any]:
        """Refresh a changed active partition, with a retry cooldown for upstream lag."""
        value = await self.async_get(entity_id)
        maps = value["maps"]
        active = next(
            (item for item in maps if selected in (item["name"], f"Map {item['flag']}")),
            maps[0] if maps else None,
        )
        if active and {room["id"] for room in active["rooms"]} == segment_ids:
            self._mismatches.pop(entity_id, None)
            return value
        now = dt_util.utcnow()
        signature = frozenset(segment_ids)
        previous = self._mismatches.get(entity_id)
        if previous and previous[0] == signature and now - previous[1] < ERROR_TTL:
            return value
        self._mismatches[entity_id] = (signature, now)
        return await self.async_get(entity_id, refresh=True)

    async def _async_fetch(self, entity_id: str) -> dict[str, Any]:
        domain, service = READ_ONLY_SERVICE
        if not self.hass.services.has_service(domain, service):
            return {"maps": [], "error": "service_missing", "updated_at": None}
        try:
            async with asyncio.timeout(CALL_TIMEOUT):
                response = await self.hass.services.async_call(
                    domain,
                    service,
                    {},
                    target={"entity_id": entity_id},
                    blocking=True,
                    return_response=True,
                )
        except TimeoutError:
            return {"maps": [], "error": "timeout", "updated_at": None}
        except Exception as err:  # noqa: BLE001 - integration errors must not break the panel
            _LOGGER.debug("roborock.get_maps failed for %s: %s", entity_id, err)
            return {"maps": [], "error": "failed", "updated_at": None}
        return {
            "maps": normalize_maps(response, entity_id),
            "error": None,
            "updated_at": dt_util.utcnow().isoformat(),
        }
