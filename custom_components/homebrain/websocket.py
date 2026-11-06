"""Expose authenticated access to module bindings."""

from typing import Any

import voluptuous as vol
from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant, callback

from .bindings import get_bindings, is_valid_key, validate_binding
from .const import BINDING_MODULES, DOMAIN
from .modules import entry_disabled_modules, unavailable_modules
from .roles import (
    ASSIGNABLE_ROLES,
    CONF_ROLES,
    entry_roles,
    require_dnes_access,
    resolve_role,
    visible_modules,
)


@websocket_api.websocket_command({vol.Required("type"): "homebrain/session/get"})
@callback
def websocket_get_session(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """Return the caller's effective role (ADR-0002); readable by every signed-in user."""
    if connection.user is None:
        connection.send_error(msg["id"], "unauthorized", "Authentication required")
        return
    role = resolve_role(connection.user, entry_roles(hass))
    disabled = entry_disabled_modules(hass)
    connection.send_result(
        msg["id"],
        {
            "role": role,
            "visible_modules": [m for m in visible_modules(role) if m not in disabled],
            # Module isolation (#28): failed modules render "modul nedostupný" in the panel.
            "unavailable_modules": unavailable_modules(hass),
            "disabled_modules": sorted(disabled),
            "is_admin": bool(connection.user.is_admin),
            # The client always applies the kiosk layout for this role (?kiosk=1 is layout only).
            "kiosk": role == "kiosk",
        },
    )


@websocket_api.websocket_command({vol.Required("type"): "homebrain/bindings/get"})
@require_dnes_access
@callback
def websocket_get_bindings(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """Read bindings (admins and mapped roles, e.g. the kiosk tablet)."""
    if connection.user is None:
        connection.send_error(msg["id"], "unauthorized", "Authentication required")
        return
    if not (entries := hass.config_entries.async_entries(DOMAIN)):
        connection.send_error(msg["id"], "not_found", "HomeBrain is not configured")
        return
    connection.send_result(msg["id"], get_bindings(entries[0]))


@websocket_api.websocket_command(
    {
        vol.Required("type"): "homebrain/bindings/set",
        vol.Required("module"): str,
        vol.Required("bindings"): {str: vol.Any(None, str)},
        vol.Optional("replace", default=False): bool,
    }
)
@websocket_api.require_admin
@callback
def websocket_set_bindings(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """Validate and persist bindings without reloading the entry."""
    module = msg["module"]
    if module not in BINDING_MODULES or any(
        not is_valid_key(module, key) for key in msg["bindings"]
    ):
        connection.send_error(msg["id"], "invalid_format", "Invalid module or logical key")
        return
    try:
        updates = {
            key: validate_binding(key, value) if value else None
            for key, value in msg["bindings"].items()
        }
    except vol.Invalid:
        connection.send_error(msg["id"], "invalid_format", "Invalid entity ID")
        return
    if not (entries := hass.config_entries.async_entries(DOMAIN)):
        connection.send_error(msg["id"], "not_found", "HomeBrain is not configured")
        return
    entry = entries[0]
    bindings = get_bindings(entry)
    values = {} if msg["replace"] else bindings.get(module, {}).copy()
    for key, value in updates.items():
        if value is None:
            values.pop(key, None)
        else:
            values[key] = value
    bindings[module] = values
    hass.config_entries.async_update_entry(entry, options={**entry.options, "bindings": bindings})
    connection.send_result(msg["id"], get_bindings(entry))


@websocket_api.websocket_command({vol.Required("type"): "homebrain/roles/get"})
@websocket_api.require_admin
@callback
def websocket_get_roles(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """Return the ``user_id -> role`` mapping (admin only)."""
    connection.send_result(msg["id"], {"roles": entry_roles(hass)})


@websocket_api.websocket_command(
    {
        vol.Required("type"): "homebrain/roles/set",
        vol.Required("user_id"): vol.All(str, vol.Length(min=1, max=64)),
        # ``None`` removes the mapping (the user falls back to ``guest``).
        vol.Required("role"): vol.Any(None, vol.In(ASSIGNABLE_ROLES)),
    }
)
@websocket_api.require_admin
@callback
def websocket_set_roles(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """Map a HA user to a HomeBrain role, e.g. the tablet account to ``kiosk`` (admin only)."""
    if not (entries := hass.config_entries.async_entries(DOMAIN)):
        connection.send_error(msg["id"], "not_found", "HomeBrain is not configured")
        return
    user_id = msg["user_id"]
    roles = entry_roles(hass)
    if msg["role"] is None:
        roles.pop(user_id, None)
    else:
        roles[user_id] = msg["role"]
    entry = entries[0]
    hass.config_entries.async_update_entry(entry, options={**entry.options, CONF_ROLES: roles})
    connection.send_result(msg["id"], {"roles": entry_roles(hass)})
