"""Validate and read module entity bindings."""

import re
from collections.abc import Mapping

import voluptuous as vol
from homeassistant.config_entries import ConfigEntry
from homeassistant.helpers import config_validation as cv

from .const import BINDING_DOMAINS, BINDING_MODULES, DEFAULT_BINDING_DOMAIN


def is_valid_key(module: str, key: str) -> bool:
    """Check static and dynamic logical keys."""
    return module in BINDING_MODULES and (
        key in BINDING_MODULES[module]
        or (module == "waste" and re.fullmatch(r"waste_next_[a-z0-9_]+", key) is not None)
    )


def binding_domains(key: str) -> tuple[str, ...]:
    """Return every entity domain accepted for a logical key (primary first)."""
    domains = BINDING_DOMAINS.get(key, DEFAULT_BINDING_DOMAIN)
    return (domains,) if isinstance(domains, str) else tuple(domains)


def binding_domain(key: str) -> str:
    """Return the primary entity domain for a logical key."""
    return binding_domains(key)[0]


def validate_binding(key: str, value: str) -> str:
    """Validate an entity_id and its domain for a logical key."""
    entity_id = cv.entity_id(value)
    if entity_id.split(".", 1)[0] not in binding_domains(key):
        raise vol.Invalid(f"{key} requires domain {' or '.join(binding_domains(key))}")
    return entity_id


def get_bindings(entry: ConfigEntry) -> dict[str, dict[str, str]]:
    """Return a validated copy of bindings stored in entry options."""
    result: dict[str, dict[str, str]] = {}
    bindings = entry.options.get("bindings", {})
    if not isinstance(bindings, Mapping):
        return result
    for module, values in bindings.items():
        if module not in BINDING_MODULES or not isinstance(values, Mapping):
            continue
        result[module] = {}
        for key, value in values.items():
            if not isinstance(key, str) or not is_valid_key(module, key) or not value:
                continue
            if not isinstance(value, str):
                continue
            try:
                result[module][key] = validate_binding(key, value)
            except vol.Invalid:
                continue
    return result
