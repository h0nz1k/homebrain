"""Module isolation: per-module setup, on/off switches and module-gated WS commands (#28).

HomeBrain runs inside the Home Assistant process. One broken module must neither stop
HA nor the other modules, so every module is set up in its own ``try``/``except``:

* a failure marks the module ``failed`` (its panel shows "modul nedostupný"), raises a
  repair issue and leaves the other modules running;
* a module switched off in the options flow is ``disabled``: its WS commands and its
  panel are not registered at all (WS commands registered before the switch answer
  ``module_unavailable`` until HA restarts — HA has no public way to unregister them).

The default (no ``disabled_modules`` option) keeps every module enabled, so existing
config entries behave exactly as before.
"""

from __future__ import annotations

import functools
import logging
from collections.abc import Awaitable, Callable, Iterable
from typing import Any, Final

from homeassistant.components import websocket_api
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers import issue_registry as ir

from .const import DOMAIN

_LOGGER = logging.getLogger(__name__)

# Backend modules that can fail or be switched off independently. ``today``/``health``/
# ``settings`` have no backend of their own and are always available.
MODULES: Final = (
    "weather",
    "energy",
    "waste",
    "robots",
    "wine",
    "recipes",
    "access",
    "network",
    "family",
    "server",
)
CONF_DISABLED_MODULES: Final = "disabled_modules"

STATE_OK: Final = "ok"
STATE_DISABLED: Final = "disabled"
STATE_FAILED: Final = "failed"
ERROR_UNAVAILABLE: Final = "module_unavailable"
ISSUE_PREFIX: Final = "module_failed_"
_STATES_KEY: Final = "module_states"
_REGISTER_FAILED_KEY: Final = "module_register_failed"
_ERROR_MAX: Final = 200

Registrar = Callable[[HomeAssistant, Any], None]


def disabled_modules(options: Any) -> set[str]:
    """Known module ids switched off in the entry options (unknown ids are ignored)."""
    raw = options.get(CONF_DISABLED_MODULES) if hasattr(options, "get") else None
    if not isinstance(raw, (list, tuple, set)):
        return set()
    return {module for module in raw if module in MODULES}


def entry_disabled_modules(hass: HomeAssistant) -> set[str]:
    """Disabled modules of the (single) HomeBrain entry; none when not configured yet."""
    entries = hass.config_entries.async_entries(DOMAIN)
    return disabled_modules(entries[0].options) if entries else set()


def module_states(hass: HomeAssistant) -> dict[str, str]:
    """Mutable ``module -> state`` map; a module without a record is ``ok``."""
    return hass.data.setdefault(DOMAIN, {}).setdefault(_STATES_KEY, {})


def module_state(hass: HomeAssistant, module: str) -> str:
    return module_states(hass).get(module, STATE_OK)


def unavailable_modules(hass: HomeAssistant) -> list[str]:
    """Sorted modules that failed to set up (the panel shows "modul nedostupný")."""
    return sorted(m for m, state in module_states(hass).items() if state == STATE_FAILED)


def gated(module: str, handler: Any) -> Any:
    """Wrap a WS handler so it answers ``module_unavailable`` unless the module is ok.

    ``functools.wraps`` copies ``_ws_schema``/``_ws_command`` so HA registers the wrapper
    under the original command; the role checks inside ``handler`` still apply.
    """

    @callback
    @functools.wraps(handler)
    def _gated(hass: HomeAssistant, connection: Any, msg: dict[str, Any]) -> None:
        if (state := module_state(hass, module)) != STATE_OK:
            connection.send_error(
                msg["id"], ERROR_UNAVAILABLE, f"HomeBrain module '{module}' is {state}"
            )
            return
        handler(hass, connection, msg)

    return _gated


def registrar(module: str) -> Registrar:
    """``websocket_api.async_register_command`` replacement that gates by module."""

    def _register(hass: HomeAssistant, handler: Any) -> None:
        websocket_api.async_register_command(hass, gated(module, handler))

    return _register


def _register_failed(hass: HomeAssistant) -> set[str]:
    """Modules whose ``async_setup`` registration failed (stays failed until HA restarts)."""
    return hass.data.setdefault(DOMAIN, {}).setdefault(_REGISTER_FAILED_KEY, set())


def record_failure(
    hass: HomeAssistant, module: str, err: BaseException, *, registration: bool = False
) -> None:
    """Mark ``module`` failed, log the traceback and raise a repair issue."""
    module_states(hass)[module] = STATE_FAILED
    if registration:
        _register_failed(hass).add(module)
    _LOGGER.exception("HomeBrain module %s failed to set up; other modules keep running", module)
    ir.async_create_issue(
        hass,
        DOMAIN,
        f"{ISSUE_PREFIX}{module}",
        is_fixable=False,
        is_persistent=False,
        severity=ir.IssueSeverity.ERROR,
        translation_key="module_failed",
        translation_placeholders={
            "module": module,
            "error": (f"{type(err).__name__}: {err}")[:_ERROR_MAX],
        },
    )


def register_modules(
    hass: HomeAssistant, registrations: dict[str, Callable[[Registrar], None]]
) -> None:
    """Register each enabled module's WS commands/views in isolation (``async_setup``)."""
    disabled = entry_disabled_modules(hass)
    for module, register in registrations.items():
        if module in disabled:
            module_states(hass)[module] = STATE_DISABLED
            continue
        try:
            register(registrar(module))
        except Exception as err:  # noqa: BLE001 - isolate the module, keep HA running
            record_failure(hass, module, err, registration=True)


async def async_setup_modules(
    hass: HomeAssistant,
    entry: ConfigEntry,
    setups: dict[str, Callable[[HomeAssistant, ConfigEntry], Awaitable[None]]],
) -> dict[str, str]:
    """Run each enabled module's entry setup in isolation; returns the resulting states."""
    disabled = disabled_modules(entry.options)
    states = module_states(hass)
    for module in MODULES:
        if module in disabled:
            states[module] = STATE_DISABLED
            ir.async_delete_issue(hass, DOMAIN, f"{ISSUE_PREFIX}{module}")
            continue
        if module in _register_failed(hass):
            states[module] = STATE_FAILED
            continue  # registration in async_setup already failed; keep the repair issue
        states[module] = STATE_OK
        if (setup := setups.get(module)) is None:
            ir.async_delete_issue(hass, DOMAIN, f"{ISSUE_PREFIX}{module}")
            continue
        try:
            await setup(hass, entry)
        except Exception as err:  # noqa: BLE001 - isolate the module, keep HA running
            record_failure(hass, module, err)
        else:
            ir.async_delete_issue(hass, DOMAIN, f"{ISSUE_PREFIX}{module}")
    return dict(states)


async def async_unload_modules(
    hass: HomeAssistant, unloads: Iterable[tuple[str, Callable[[HomeAssistant], Awaitable[Any]]]]
) -> None:
    """Unload every module that was set up; one failing unload does not block the rest."""
    states = module_states(hass)
    for module, unload in unloads:
        if states.get(module, STATE_OK) == STATE_DISABLED:
            continue
        try:
            await unload(hass)
        except Exception:  # noqa: BLE001 - best effort, the entry must still unload
            _LOGGER.exception("HomeBrain module %s failed to unload cleanly", module)
    # Re-evaluated on the next setup; registration failures stay until HA restarts.
    states.clear()
    states.update(dict.fromkeys(_register_failed(hass), STATE_FAILED))
