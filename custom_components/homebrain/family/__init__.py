"""Rodina: family calendar, kids' chores (ChoreOps), swap saga and points. Refs #123."""

from __future__ import annotations

from datetime import timedelta
from typing import Any

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.event import async_track_point_in_time
from homeassistant.util import dt as dt_util
from zoneinfo import ZoneInfo

from ..const import DOMAIN
from .swap_store import FamilySwapStore


async def async_setup_family(hass: HomeAssistant, entry: ConfigEntry) -> None:
    """Load swap Store and schedule midnight reconcile."""
    store = FamilySwapStore(hass)
    await store.async_load()
    hb = hass.data.setdefault(DOMAIN, {})
    hb["family_swap"] = store

    def _schedule_midnight() -> None:
        local = dt_util.start_of_local_day() + timedelta(days=1)

        @callback
        def _reconcile(_now) -> None:
            tz = ZoneInfo(hass.config.time_zone)
            store.reconcile_all(dt_util.now(), tz)
            hass.async_create_task(store.async_save())
            _schedule_midnight()

        cancel = async_track_point_in_time(hass, _reconcile, local)
        entry.async_on_unload(cancel)

    _schedule_midnight()
    tz = ZoneInfo(hass.config.time_zone)
    store.reconcile_all(dt_util.now(), tz)
    await store.async_save()