"""Contract keys of the private heating map (docs/modules/heating.md).

Every key is ``<payload section>.<field>`` of ``homebrain/heating/get``; the entity /
statistics id is ``heating_<section>_<field>``. ``kind`` is ``num`` (float), ``bool`` or
``time`` (``hh:mm``, schedules only).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Final


@dataclass(frozen=True)
class KeySpec:
    kind: str = "num"
    unit: str | None = "°C"
    device_class: str | None = "temperature"
    label: str = ""


_T = KeySpec()


def _b(device_class: str | None, label: str) -> KeySpec:
    return KeySpec("bool", None, device_class, label)


def _n(unit: str | None, device_class: str | None, label: str) -> KeySpec:
    return KeySpec("num", unit, device_class, label)


def _t(label: str) -> KeySpec:
    return KeySpec("num", "°C", "temperature", label)


KEYS: Final[dict[str, KeySpec]] = {
    # mode
    "mode.winter": _b(None, "Zimní režim"),
    "mode.auto_season": _b(None, "Automatické léto/zima"),
    "mode.setback_active": _b(None, "Útlum aktivní"),
    "mode.main_switch": _b("power", "Hlavní vypínač TČ"),
    "mode.cooling": _b(None, "Chlazení"),
    "mode.hdo_low_tariff": _b(None, "HDO nízký tarif"),
    # house
    "house.ref_temp": _t("Referenční místnost"),
    "house.ref_target": _t("Referenční místnost – žádaná"),
    "house.ref_target_effective": _t("Referenční místnost – žádaná aktuální"),
    "house.hysteresis": _n("°C", None, "Hystereze místnosti"),
    "house.attic_temp": _t("Podkroví"),
    "house.circuit_on": _b("running", "Topný okruh domu"),
    "house.mixing_valve_pct": _n("%", None, "Směšovací ventil – otevření"),
    "house.supply_temp": _t("Teplota do topného okruhu"),
    # heat pump
    "heat_pump.compressor_on": _b("running", "Kompresor"),
    "heat_pump.condenser_out": _t("Výstup z kondenzátoru"),
    "heat_pump.return_temp": _t("Zpátečka do TČ"),
    "heat_pump.brine_in": _t("Primár vstup"),
    "heat_pump.brine_out": _t("Primár výstup"),
    "heat_pump.primary_prerun": _b("running", "Předběh primáru"),
    "heat_pump.discharge_temp": _t("Výtlak – teplota"),
    "heat_pump.discharge_bar": _n("bar", "pressure", "Výtlak – tlak"),
    "heat_pump.suction_temp": _t("Sání – teplota"),
    "heat_pump.suction_bar": _n("bar", "pressure", "Sání – tlak"),
    "heat_pump.motohours": _n("h", "duration", "Motohodiny kompresoru"),
    "heat_pump.motominutes": _n("min", None, "Motominuty kompresoru"),
    # tank (AKN)
    "tank.top": _t("Nádrž nahoře"),
    "tank.bottom": _t("Nádrž dole"),
    "tank.target": _t("Nádrž – žádaná"),
    "tank.hysteresis": _n("°C", None, "Nádrž – hystereze"),
    "tank.curve_target": _t("Nádrž – žádaná z ekvitermu"),
    # domestic hot water
    "dhw.temp": _t("Teplá voda"),
    "dhw.target": _t("Teplá voda – žádaná"),
    "dhw.hysteresis": _n("°C", None, "Teplá voda – hystereze"),
    "dhw.valve_to_dhw": _b(None, "Ventil na teplou vodu"),
    # outdoor
    "outdoor.temp": _t("Venkovní teplota"),
    # pumps
    "pumps.heating": _b("running", "Čerpadlo topení"),
    "pumps.secondary": _b("running", "Čerpadlo sekundáru"),
    "pumps.circulation": _b("running", "Cirkulace"),
    # backup heater (never shown as running unless the owner maps a confirmed output)
    "backup_heater.on": _b("running", "Záložní ohřev"),
    # fault summaries (single lamps go to the ``faults`` list of the map)
    "faults.fatal": _b("problem", "Fatální chyba"),
    "faults.compressor_block": _b("problem", "Blokace kompresoru"),
    # heating curve (4 points)
    **{
        f"curve.p{i}_{part}": _n("°C", None, f"Ekviterm bod {i} – {name}")
        for i in range(1, 5)
        for part, name in (("outdoor", "venku"), ("water", "voda"))
    },
    # extras (side circuits – mapping lives outside the repo)
    "extras.solar_temp": _t("Solární kolektor"),
    "extras.solar_pump": _b("running", "Solár – čerpadlo"),
    "extras.solar_enabled": _b("power", "Solár zapnut"),
    "extras.solar_pump_pct": _n("%", None, "Solár – výkon čerpadla"),
    "extras.pool_temp": _t("Bazén – zpátečka"),
    "extras.pool_heating_pump": _b("running", "Bazén – čerpadlo natápění"),
    "extras.pool_filter_pump": _b("running", "Bazén – filtrace"),
    "extras.fish_temp": _t("Rybárna – teplota vzduchu"),
    "extras.fish_target": _t("Rybárna – žádaná teplota vzduchu"),
    "extras.fish_hysteresis": _n("°C", None, "Rybárna – hystereze"),
    "extras.fish_heating_on": _b(None, "Rybárna – vytápění zapnuto"),
    "extras.fish_valve_open": _b("opening", "Rybárna – ventil topení otevřen"),
}

# Derived entities that are not read from the PLC (always present when Topení is set up).
DERIVED: Final[dict[str, KeySpec]] = {
    "compressor_runtime_h": _n("h", "duration", "Kompresor dnes – hodiny"),
    "compressor_starts": _n(None, None, "Kompresor dnes – starty"),
    "energy_kwh": _n("kWh", "energy", "Spotřeba TČ dnes"),
}
COUNTER_KEYS: Final = frozenset(DERIVED)
ACTIVITIES: Final = (
    "idle",
    "heating_tank",
    "heating_dhw",
    "house_circuit",
    "cooling",
    "fault",
    "blocked_hdo",
)


def object_id(key: str) -> str:
    """``tank.bottom`` → ``tank_bottom`` (history/import key and entity suffix)."""
    return key.replace(".", "_")


def key_from_object_id(oid: str) -> str | None:
    """Reverse :func:`object_id` for contract and derived keys (``None`` when unknown)."""
    if oid in DERIVED:
        return oid
    if oid in KEYS:
        return oid
    for key in KEYS:
        if object_id(key) == oid:
            return key
    return None


def spec_of(key: str) -> KeySpec | None:
    return KEYS.get(key) or DERIVED.get(key)
