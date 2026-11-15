"""Shared Rodina WS helpers (no command registration)."""

from __future__ import annotations

from typing import Any, Final

from homeassistant.core import HomeAssistant
from homeassistant.exceptions import Unauthorized

from ..const import DOMAIN
from ..roles import entry_roles, resolve_role
from . import model

CONF_FAMILY: Final = "family"


def _entry(hass: HomeAssistant):
    entries = hass.config_entries.async_entries(DOMAIN)
    return entries[0] if entries else None


def family_options(hass: HomeAssistant) -> dict[str, Any]:
    entry = _entry(hass)
    raw = entry.options.get(CONF_FAMILY) if entry else None
    return dict(raw) if isinstance(raw, dict) else {}


def _bindings(hass: HomeAssistant) -> dict[str, Any]:
    entry = _entry(hass)
    raw = (entry.options.get("bindings") or {}).get("family") if entry else None
    return dict(raw) if isinstance(raw, dict) else {}


def _role(hass: HomeAssistant, connection: Any) -> str:
    role = resolve_role(connection.user, entry_roles(hass))
    if role == "guest":
        raise Unauthorized
    return role


def _visible_kids(hass: HomeAssistant, connection: Any, role: str) -> list[dict[str, Any]]:
    kids = model.discover_kids(hass.states.async_all(), family_options(hass))
    if role == "child":
        uid = getattr(connection.user, "id", None)
        return [k for k in kids if uid and k.get("user_id") == uid]
    return kids


async def _service(hass, connection, msg, domain, service, data, target=None, response=False):
    return await hass.services.async_call(
        domain,
        service,
        data,
        target=target,
        blocking=True,
        context=connection.context(msg),
        return_response=response,
    )