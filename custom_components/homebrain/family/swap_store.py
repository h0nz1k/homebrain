"""Persistent swap/chore journal in HA Store. Refs #123."""

from __future__ import annotations

import asyncio
import copy
import uuid
from typing import Any, Final

from homeassistant.core import HomeAssistant
from homeassistant.helpers.storage import Store

from ..const import DOMAIN
from . import swap_model

STORAGE_KEY: Final = f"{DOMAIN}.family_swaps"
STORAGE_VERSION: Final = 1
DEDUPE_RETENTION_DAYS: Final = 90


def _empty() -> dict[str, Any]:
    return {
        "schema": 1,
        "revision": 0,
        "requests": {},
        "operations": {},
        "dedupe": {},
        "daily_points": {},
    }


class FamilySwapStore:
    def __init__(self, hass: HomeAssistant) -> None:
        self._store = Store(hass, STORAGE_VERSION, STORAGE_KEY)
        self.mutation_lock = asyncio.Lock()
        self._data: dict[str, Any] = _empty()

    @property
    def data(self) -> dict[str, Any]:
        return self._data

    @property
    def revision(self) -> int:
        return int(self._data.get("revision") or 0)

    async def async_load(self) -> None:
        loaded = await self._store.async_load()
        self._data = loaded if isinstance(loaded, dict) else _empty()

    async def async_save(self) -> None:
        self._data["revision"] = int(self._data.get("revision") or 0) + 1
        await self._store.async_save(self._data)

    def bump_revision(self) -> int:
        self._data["revision"] = int(self._data.get("revision") or 0) + 1
        return self._data["revision"]

    def remember_dedupe(
        self, client_request_id: str, payload: dict[str, Any], result: dict[str, Any]
    ) -> None:
        dedupe = self._data.setdefault("dedupe", {})
        dedupe[client_request_id] = {"payload": payload, "result": result}

    def dedupe_lookup(self, client_request_id: str) -> dict[str, Any] | None:
        row = (self._data.get("dedupe") or {}).get(client_request_id)
        return row if isinstance(row, dict) else None

    def new_request_id(self) -> str:
        return str(uuid.uuid4())

    def new_operation_id(self) -> str:
        return str(uuid.uuid4())

    def upsert_request(self, request_id: str, record: dict[str, Any]) -> dict[str, Any]:
        requests = self._data.setdefault("requests", {})
        requests[request_id] = copy.deepcopy(record)
        return requests[request_id]

    def upsert_operation(self, operation_id: str, record: dict[str, Any]) -> dict[str, Any]:
        ops = self._data.setdefault("operations", {})
        ops[operation_id] = copy.deepcopy(record)
        return ops[operation_id]

    def reconcile_all(self, now, tz) -> bool:
        reqs = swap_model.reconcile_requests(self._data.get("requests") or {}, now)
        ops = swap_model.reconcile_operations(self._data.get("operations") or {}, now, tz)
        changed = reqs != self._data["requests"] or ops != self._data["operations"]
        self._data["requests"] = reqs
        self._data["operations"] = ops
        return changed
