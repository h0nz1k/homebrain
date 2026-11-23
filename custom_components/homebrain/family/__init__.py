"""Rodina: family calendar, kids' chores (ChoreOps), swap saga and points. Refs #123."""

from __future__ import annotations

from datetime import timedelta

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.event import async_track_point_in_time, async_track_time_interval
from homeassistant.util import dt as dt_util

from ..const import DOMAIN
from ..modules import disabled_modules
from . import model, swap_service
from .person_history import PersonHistory
from .school import SchoolImport
from .swap_store import FamilySwapStore
from .ws_common import family_options


async def async_setup_family(hass: HomeAssistant, entry: ConfigEntry) -> None:
    """Load swap Store and schedule midnight reconcile."""
    store = FamilySwapStore(hass)
    await store.async_load()
    hb = hass.data.setdefault(DOMAIN, {})
    hb["family_swap"] = store
    history = PersonHistory(hass)
    await history.async_load()
    hb["family_history"] = history
    if "family" not in disabled_modules(entry.options):
        school = SchoolImport(hass, entry)
        hb["family_school"] = school
        await school.async_setup()

        @callback
        def _remove_school() -> None:
            hb.pop("family_school", None)

        entry.async_on_unload(_remove_school)

    def _record_missed() -> None:
        history.reconcile(
            hass, model.discover_members(hass.states.async_all(), family_options(hass))
        )

    _record_missed()

    def _schedule_midnight() -> None:
        local = dt_util.start_of_local_day() + timedelta(days=1)

        @callback
        def _reconcile(_now) -> None:
            _record_missed()
            hass.async_create_task(_run_swaps())
            _schedule_midnight()

        cancel = async_track_point_in_time(hass, _reconcile, local)
        entry.async_on_unload(cancel)

    async def _run_swaps(_now=None) -> None:
        await swap_service.apply_scheduled_swaps(hass, store)

    _schedule_midnight()
    # Retry while the matching ChoreOps helpers are still loading after startup.
    entry.async_on_unload(async_track_time_interval(hass, _run_swaps, timedelta(minutes=1)))
    await _run_swaps()
