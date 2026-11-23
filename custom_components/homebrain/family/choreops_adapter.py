"""ChoreOps service calls for Rodina swap/create (backend only). Refs #123."""

from __future__ import annotations

from typing import Any, Final

from homeassistant.core import HomeAssistant, HomeAssistantError
from homeassistant.helpers import entity_registry as er

ALLOWED: Final = frozenset(
    {
        ("choreops", "create_chore"),
        ("choreops", "update_chore"),
        ("choreops", "claim_chore"),
        ("choreops", "skip_chore_due_date"),
        ("choreops", "set_chore_due_date"),
        ("choreops", "delete_chore"),
        ("choreops", "get_ledger"),
    }
)


async def call_choreops(
    hass: HomeAssistant,
    domain: str,
    service: str,
    data: dict[str, Any],
    *,
    context,
    response: bool = False,
) -> Any:
    if (domain, service) not in ALLOWED:
        raise HomeAssistantError(f"Služba {domain}.{service} není povolena.")
    return await hass.services.async_call(
        domain,
        service,
        data,
        blocking=True,
        context=context,
        return_response=response,
    )


def config_entry_id(hass: HomeAssistant) -> str | None:
    for entry in hass.config_entries.async_entries("choreops"):
        return entry.entry_id
    return None


def matches_entry(hass: HomeAssistant, config_id: str, entity_id: str) -> bool:
    entity = er.async_get(hass).async_get(entity_id)
    return entity is None or (entity.platform == "choreops" and entity.config_entry_id == config_id)


def chore_id(hass: HomeAssistant, config_id: str, entity_id: str) -> str | None:
    """Resolve the ChoreOps 1.6 status sensor's internal chore ID."""
    entity = er.async_get(hass).async_get(entity_id)
    if entity is not None:
        if entity.platform != "choreops" or entity.config_entry_id != config_id:
            return None
        prefix = f"{config_id}_"
        if entity.unique_id.startswith(prefix):
            key = entity.unique_id.removeprefix(prefix)
            if key.endswith("_chore_status") and "_" in key.removesuffix("_chore_status"):
                return key.removesuffix("_chore_status").rsplit("_", 1)[1]
            if key.endswith("_chore_global_status"):
                return key.removesuffix("_chore_global_status")
    state = hass.states.get(entity_id)
    if state:
        value = state.attributes.get("chore_id") or state.attributes.get("id")
        return str(value) if value else None
    return None


def coordinator(hass: HomeAssistant, config_id: str) -> Any:
    """Read ChoreOps 1.6 runtime collections even before sensors have refreshed."""
    entry = hass.config_entries.async_get_entry(config_id)
    runtime = getattr(entry, "runtime_data", None)
    return runtime if hasattr(runtime, "chores_data") else None
