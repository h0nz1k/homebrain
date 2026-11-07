"""HomeBrain roles (ADR-0002): server-side role resolution and module visibility."""

from __future__ import annotations

from collections.abc import Callable, Mapping
from functools import wraps
from typing import Any, Final

from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import Unauthorized

from .const import DOMAIN

ROLES: Final = ("owner", "adult", "child", "guest", "kiosk")
# Options key holding the HA ``user_id -> role`` mapping (never stored in Git).
CONF_ROLES: Final = "roles"

# Default module visibility matrix (ADR-0002 §3.1); ``R``/``W`` collapse to "visible" here.
MODULE_VISIBILITY: Final[dict[str, frozenset[str]]] = {
    "owner": frozenset(
        {
            "today",
            "weather",
            "energy",
            "waste",
            "health",
            "wine",
            "family",
            "robots",
            "recipes",
            "access",
            "network",
            "settings",
            "about",
        }
    ),
    "adult": frozenset(
        {
            "today",
            "weather",
            "energy",
            "waste",
            "health",
            "wine",
            "family",
            "robots",
            "recipes",
            "network",
            "about",
        }
    ),
    "child": frozenset({"today", "weather", "waste", "family", "recipes"}),
    # Kiosk: energy as a summary only, family without details, never health/wine/settings.
    "kiosk": frozenset({"today", "weather", "energy", "waste", "family", "recipes"}),
    "guest": frozenset({"about"}),
}


def resolve_role(user: Any, roles: Mapping[str, str] | None) -> str:
    """Effective HomeBrain role of an HA user (ADR-0002 §3 point 2).

    * no user -> ``guest``
    * HA admin -> ``owner`` (an admin can never be lowered, e.g. to ``kiosk``)
    * non-admin with a valid mapping -> mapped role (``owner`` mapping is ignored)
    * anything else -> ``guest`` (default deny)
    """
    if user is None:
        return "guest"
    if getattr(user, "is_admin", False):
        return "owner"
    role = (roles or {}).get(getattr(user, "id", ""))
    if role in ROLES and role != "owner":
        return role
    return "guest"


def visible_modules(role: str) -> list[str]:
    """Sorted module ids visible to ``role`` (unknown role -> guest)."""
    return sorted(MODULE_VISIBILITY.get(role, MODULE_VISIBILITY["guest"]))


# Roles a non-admin HA user can be mapped to (``owner`` is reserved for HA admins).
ASSIGNABLE_ROLES: Final = tuple(role for role in ROLES if role != "owner")

# The only HomeBrain WS commands a non-admin user may call: what the Dnes kiosk panel needs.
# ``session/get`` is open to every signed-in user; the rest additionally need a mapped role.
# Every other ``homebrain/*`` command is admin-only (enforced by tests/python/test_kiosk_panel.py).
KIOSK_WS_COMMANDS: Final = frozenset(
    {
        "homebrain/session/get",
        "homebrain/bindings/get",
        "homebrain/weather/get",
        "homebrain/weather/alerts",
        # Dnes „energy.advice“ feed (PV forecast fallback for the advice cards).
        "homebrain/energy/pv_forecast",
    }
)


# Recepty for mapped non-admins (the kitchen tablet, family): read + cook. Recipe edits,
# URL import and settings stay admin-only.
RECIPES_USER_WS_COMMANDS: Final = frozenset(
    {
        "homebrain/recipes/list",
        "homebrain/recipes/get",
        "homebrain/recipes/tags",
        "homebrain/recipes/config",
        "homebrain/recipes/set_favourite",
        "homebrain/recipes/set_rating",
        "homebrain/recipes/cooked",
        "homebrain/recipes/music",
        "homebrain/recipes/timers/subscribe",
        "homebrain/recipes/timers/start",
        "homebrain/recipes/timers/update",
        "homebrain/recipes/timers/cancel",
    }
)
# Device control (airfryer) is not for children.
RECIPES_DEVICE_WS_COMMANDS: Final = frozenset(
    {
        "homebrain/recipes/airfryer",
        "homebrain/recipes/airfryer_control",
        "homebrain/recipes/airfryer_program",
    }
)
RECIPES_DEVICE_ROLES: Final = frozenset({"owner", "adult", "kiosk"})


# Síť: adults and the kitchen kiosk get the summary (status + headline, no device list); the
# guest Wi-Fi QR is for every mapped role. Device list, settings and the password stay admin-only.
NETWORK_SUMMARY_ROLES: Final = frozenset({"adult", "kiosk"})
NETWORK_QR_ROLES: Final = frozenset({"adult", "child", "kiosk"})


# Rodina: every mapped role reads the family overview, ticks off chores (a child only its own,
# checked in the handler) and edits the shopping list; approving chores is for adults.
FAMILY_WS_COMMANDS: Final = frozenset(
    {
        "homebrain/family/get",
        "homebrain/family/chore/claim",
        "homebrain/family/shopping/add",
        "homebrain/family/shopping/update",
    }
)
FAMILY_APPROVE_ROLES: Final = frozenset({"adult"})
# Energie details (period comparison): HA admins and adults; the kiosk keeps the summary only.
ENERGY_DETAIL_ROLES: Final = frozenset({"adult"})


def role_ws_commands(role: str) -> frozenset[str]:
    """Every ``homebrain/*`` WS command a mapped non-admin role may call."""
    if role == "guest":
        return frozenset({"homebrain/session/get"})
    extra = RECIPES_DEVICE_WS_COMMANDS if role in RECIPES_DEVICE_ROLES else frozenset()
    if role in NETWORK_SUMMARY_ROLES:
        extra |= {"homebrain/network/summary"}
    if role in NETWORK_QR_ROLES:
        extra |= {"homebrain/network/guest_qr"}
    if role in FAMILY_APPROVE_ROLES:
        extra |= {"homebrain/family/chore/approve"}
    if role in ENERGY_DETAIL_ROLES:
        extra |= {"homebrain/energy/compare"}
    return KIOSK_WS_COMMANDS | FAMILY_WS_COMMANDS | RECIPES_USER_WS_COMMANDS | extra


def entry_roles(hass: HomeAssistant) -> dict[str, str]:
    """The ``user_id -> role`` mapping stored in the config entry options."""
    entries = hass.config_entries.async_entries(DOMAIN)
    roles = entries[0].options.get(CONF_ROLES) if entries else None
    return dict(roles) if isinstance(roles, Mapping) else {}


def require_dnes_access(func: Callable[..., Any]) -> Callable[..., Any]:
    """Allow HA admins and non-admins mapped to a HomeBrain role (kiosk/adult/child).

    Unmapped non-admin users resolve to ``guest`` and are rejected (default deny).
    """

    @wraps(func)
    def with_role(
        hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
    ) -> Any:
        if resolve_role(connection.user, entry_roles(hass)) == "guest":
            raise Unauthorized
        return func(hass, connection, msg)

    return with_role
