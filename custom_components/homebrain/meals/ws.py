"""WebSocket ``homebrain/today/meals``: what is cooked today (Mealie meal plan) for Dnes.

Every mapped role reads it (the kitchen kiosk too); the „naplánujte v Mealie“ hint is only
for HA admins (``can_plan``). Mealie is optional: no loaded entry = calm empty state.
"""

from __future__ import annotations

from typing import Any, Final

import voluptuous as vol
from homeassistant.components import websocket_api
from homeassistant.config_entries import ConfigEntryState
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import Unauthorized
from homeassistant.util import dt as dt_util

from ..modules import module_states
from ..roles import entry_roles, resolve_role
from . import model

MEALIE: Final = "mealie"


async def _local_recipes(hass: HomeAssistant) -> list[dict[str, Any]]:
    """Recepty summaries for linking; empty when the module is off or the store fails."""
    if module_states(hass).get("recipes") is not None:
        return []
    from ..recipes.websocket import async_get_store

    try:
        store = await async_get_store(hass)
        return await hass.async_add_executor_job(store.list)
    except Exception:  # noqa: BLE001 - linking is optional, meals still show by name
        return []


@websocket_api.websocket_command({vol.Required("type"): "homebrain/today/meals"})
@websocket_api.async_response
async def websocket_today_meals(hass: HomeAssistant, connection: Any, msg: dict[str, Any]) -> None:
    role = resolve_role(connection.user, entry_roles(hass))
    if role == "guest":
        raise Unauthorized
    today = dt_util.now().date()
    entries = [
        e for e in hass.config_entries.async_entries(MEALIE) if e.state is ConfigEntryState.LOADED
    ]
    configured = bool(entries) and hass.services.has_service(MEALIE, "get_mealplan")
    plans: list[Any] = []
    errors: list[str] = []
    for entry in entries if configured else []:
        try:
            resp = await hass.services.async_call(
                MEALIE,
                "get_mealplan",
                {
                    "config_entry_id": entry.entry_id,
                    "start_date": today.isoformat(),
                    "end_date": today.isoformat(),
                },
                blocking=True,
                context=connection.context(msg),
                return_response=True,
            )
            rows = (resp or {}).get("mealplan")
            plans.extend(rows if isinstance(rows, list) else [])
        except Exception:  # noqa: BLE001 - Mealie down must not break Dnes
            errors.append(MEALIE)
    local = await _local_recipes(hass) if plans else []
    connection.send_result(
        msg["id"],
        {
            "date": today.isoformat(),
            "configured": configured,
            "can_plan": role == "owner",
            "meals": model.build_meals(plans, today, local),
            "errors": sorted(set(errors)),
        },
    )


COMMANDS: Final = (websocket_today_meals,)
