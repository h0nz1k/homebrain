"""Record missed occurrences before ChoreOps advances their due date."""

from __future__ import annotations

from datetime import timedelta
from typing import Any

from homeassistant.core import HomeAssistant
from homeassistant.helpers.storage import Store
from homeassistant.util import dt as dt_util

from ..const import DOMAIN
from . import model

RETENTION_DAYS = 90


class PersonHistory:
    def __init__(self, hass: HomeAssistant) -> None:
        self._store = Store(hass, 1, f"{DOMAIN}.family_missed")
        self._rows: dict[str, list[dict[str, Any]]] = {}

    async def async_load(self) -> None:
        self._rows = await self._store.async_load() or {}

    def observe(
        self, member: dict[str, Any], missed: list[dict[str, Any]], now
    ) -> list[dict[str, Any]]:
        member_id = member["choreops_user_id"]
        existing = self._rows.get(member_id, [])
        cutoff = now.date() - timedelta(days=RETENTION_DAYS)
        rows = {
            (row["id"], row["date"]): row
            for row in [*existing, *missed]
            if (day := model.chore_date(row["date"], now)) and day >= cutoff
        }
        result = sorted(rows.values(), key=lambda row: row["date"], reverse=True)
        if existing != result:
            self._rows[member_id] = result
            self._store.async_delay_save(lambda: self._rows, 10)
        return result

    def reconcile(self, hass: HomeAssistant, members: list[dict[str, Any]]) -> None:
        now = dt_util.now()
        for member in members:
            _, missed, _ = model.partition_chores(model.kid_chores(hass.states.get, member), now)
            self.observe(member, missed, now)
