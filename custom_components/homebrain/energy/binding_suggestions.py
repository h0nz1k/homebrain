"""Suggest GoodWe entity bindings from existing HA entities (config flow only)."""

from __future__ import annotations

import fnmatch

from homeassistant.core import HomeAssistant

from ..bindings import binding_domains

# Logical key → entity_id glob patterns (Czech and English GoodWe ids).
GOODWE_ENERGY_PATTERNS: dict[str, tuple[str, ...]] = {
    "energy_battery_dod_ongrid": (
        "number.*maximum_vybiti_v_siti",
        "number.*depth_of_discharge_on_grid",
    ),
    "energy_battery_dod_backup": (
        "number.*maximum_vybiti_backup",
        "number.*depth_of_discharge_backup",
    ),
    "energy_battery_keep_dod": (
        "switch.*udrzovat_dod_baterie",
        "switch.*keep_battery_dod",
    ),
    "energy_fast_charge": ("switch.*rychle_nabijeni", "switch.*fast_charging"),
    "energy_fast_charge_power": (
        "number.*rychle_nabijeni_vykon",
        "number.*fast_charging_power",
    ),
    "energy_fast_charge_soc": (
        "number.*rychle_nabijeni_stav_baterie",
        "number.*fast_charging_state_of_charge",
    ),
    "energy_eco_power": (
        "number.*vykon_v_ekonomickem_rezimu",
        "number.*eco_mode_power",
    ),
    "energy_eco_soc": (
        "number.*stav_nabiti_baterie_ekonomickem_rezimu",
        "number.*eco_mode_soc",
    ),
    "energy_export_limit_enabled": (
        "switch.*rizeni_dodavky_do_site",
        "switch.*export_limit_switch",
    ),
    "energy_export_limit": (
        "number.*limit_dodavky_do_site",
        "number.*grid_export_limit",
    ),
    "energy_inverter_mode": (
        "select.*provozni_rezim_stridace",
        "select.*inverter_operation_mode",
    ),
    "energy_ems_mode": ("select.*ems_mode",),
}


def suggest_energy_binding(hass: HomeAssistant, key: str) -> str | None:
    """Return entity_id when exactly one state matches known GoodWe patterns."""
    patterns = GOODWE_ENERGY_PATTERNS.get(key)
    if not patterns:
        return None
    allowed = set(binding_domains(key))
    matches = [
        entity_id
        for entity_id in hass.states.async_entity_ids()
        if entity_id.partition(".")[0] in allowed
        and any(fnmatch.fnmatchcase(entity_id, pattern) for pattern in patterns)
    ]
    return matches[0] if len(matches) == 1 else None