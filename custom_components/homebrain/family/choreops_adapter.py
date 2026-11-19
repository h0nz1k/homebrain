"""ChoreOps service calls for Rodina swap/create (backend only). Refs #123."""

from __future__ import annotations

from typing import Any, Final

from homeassistant.core import HomeAssistant, HomeAssistantError

ALLOWED: Final = frozenset(
    {
        ("choreops", "create_chore"),
        ("choreops", "claim_chore"),
        ("choreops", "skip_chore_due_date"),
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
