"""ENE-017: configuration snapshot and narrowly allowlisted admin writes."""

import logging
import math
from typing import Any

import voluptuous as vol
from homeassistant.components import websocket_api
from homeassistant.core import Context, HomeAssistant

from ..bindings import get_bindings
from ..const import DOMAIN
from .pv_forecast import DEFAULT_AZIMUTH, DEFAULT_PERFORMANCE_RATIO, DEFAULT_TILT, OPTION_KEY
from .ws import _require_energy

_LOGGER = logging.getLogger(__name__)
# key: section, Czech label, unit, explanation, min, max, step
OPTIONS = {
    "pv_kwp": (
        "Fotovoltaika",
        "Výkon pole",
        "kWp",
        "Součet jmenovitých výkonů panelů. Změna upraví předpověď výroby, nikoli skutečný výkon.",
        0.01,
        100,
        0.01,
    ),
    "pv_tilt": (
        "Fotovoltaika",
        "Sklon panelů",
        "°",
        "Úhel vůči vodorovné ploše. Pro běžnou střechu obvykle 25–45 °; upravuje předpověď.",
        0,
        90,
        1,
    ),
    "pv_azimuth": (
        "Fotovoltaika",
        "Orientace panelů",
        "°",
        (
            "0 ° je jih, −90 ° východ, 90 ° západ a ±180 ° sever. Změna posune průběh "
            "předpovědi během dne."
        ),
        -180,
        180,
        1,
    ),
    "inverter_ac_limit_kw": (
        "Fotovoltaika",
        "AC limit střídače",
        "kW",
        "Jmenovitý střídavý výkon omezuje odhad výroby. Zadejte údaj ze štítku střídače.",
        0.01,
        1000,
        0.01,
    ),
    "battery_capacity_kwh": (
        "Baterie",
        "Kapacita baterie",
        "kWh",
        (
            "Kapacita pro odhad dostupné energie. Zadejte kapacitu podle výrobce; nemění "
            "nastavení BMS."
        ),
        0.01,
        1000,
        0.01,
    ),
    "export_limit_kw": (
        "Síť",
        "Limit přetoku pro předpověď",
        "kW",
        (
            "Modelový limit pro výpočet předpovědi; fyzický limit střídače se tím nemění. "
            "Použijte smluvený limit připojení."
        ),
        0.01,
        1000,
        0.01,
    ),
}
# Binding rows: key, section, label, fallback unit, plain explanation.
BINDINGS = [
    (
        "energy_battery_dod_ongrid",
        "Baterie",
        "Rezerva v síti",
        "%",
        (
            "Minimální nabití při provozu se sítí. Vyšší rezerva ponechá více energie pro "
            "výpadek, ale sníží noční využití baterie. Doporučené rozmezí 10–50 % po 5 %."
        ),
    ),
    (
        "energy_battery_dod_backup",
        "Baterie",
        "Rezerva pro výpadek",
        "%",
        (
            "Minimální nabití v záložním provozu. Vyšší rezerva zkrátí výdrž při výpadku. "
            "Řiďte se doporučením výrobce baterie."
        ),
    ),
    (
        "energy_battery_keep_dod",
        "Baterie",
        "Udržovat DOD",
        "",
        (
            "Udržování hranice vybití chrání rezervu baterie; může vyžadovat energii ze "
            "sítě. Doporučení závisí na typu baterie."
        ),
    ),
    (
        "energy_fast_charge",
        "Baterie",
        "Rychlé nabíjení",
        "",
        (
            "Nucené nabíjení doplní baterii ze sítě. Bezpečnostní automatizace jej vypíná "
            "ve VT. Obvykle vypnuto mimo potřebu rychlého doplnění."
        ),
    ),
    (
        "energy_fast_charge_power",
        "Baterie",
        "Výkon rychlého nabíjení",
        "%",
        (
            "Podíl maximálního nabíjecího výkonu. Vyšší výkon zvýší odběr domu; obvykle "
            "0–100 % podle výrobce."
        ),
    ),
    (
        "energy_fast_charge_soc",
        "Baterie",
        "Cíl rychlého nabíjení",
        "%",
        (
            "Po dosažení cílového nabití se rychlé nabíjení ukončí. Obvykle 10–100 % podle "
            "potřeb zálohy."
        ),
    ),
    (
        "energy_eco_power",
        "Baterie",
        "Výkon ekonomického režimu",
        "%",
        (
            "Výkon plánovaného nabíjení nebo vybíjení. Ovlivňuje odběr i životnost baterie; "
            "rozsah určuje výrobce."
        ),
    ),
    (
        "energy_eco_soc",
        "Baterie",
        "Cílové nabití ekonomického režimu",
        "%",
        (
            "Hranice nabití pro ekonomický plán. Vyšší cíl ponechá více uložené energie; "
            "obvykle 10–100 %."
        ),
    ),
    (
        "energy_export_limit_enabled",
        "Síť",
        "Řízení dodávky do sítě",
        "",
        (
            "Zapnuté řízení omezuje přetok podle limitu střídače. Musí odpovídat podmínkám "
            "distributora."
        ),
    ),
    (
        "energy_export_limit",
        "Síť",
        "Limit přetoku střídače",
        "W",
        (
            "Fyzický limit dodávky do distribuční sítě. Vyšší hodnota umožní více prodávat; "
            "použijte pouze smluvený limit."
        ),
    ),
    (
        "energy_main_breaker",
        "Síť",
        "Hlavní jistič",
        "A",
        (
            "Jmenovitý proud jedné fáze, například 25 A pro 3×25 A. Mění měřítko fází, "
            "nikoli fyzický jistič. Obvykle 16–63 A."
        ),
    ),
    (
        "energy_tariff_price_vt",
        "Tarif a ceny",
        "Cena vysokého tarifu",
        "Kč/kWh",
        "Celková cena odběru ve VT s DPH. Vyšší cena zvýší odhad nákladů; opište aktuální smlouvu.",
    ),
    (
        "energy_tariff_price_nt",
        "Tarif a ceny",
        "Cena nízkého tarifu",
        "Kč/kWh",
        "Celková cena odběru v NT s DPH. Mění odhad nákladů během nízkého tarifu; opište smlouvu.",
    ),
    (
        "energy_tariff_fixed_monthly",
        "Tarif a ceny",
        "Stálé měsíční platby",
        "Kč/měs.",
        (
            "Součet stálých plateb s DPH. Rozpočítá se do odhadu nákladů; použijte částku z "
            "vyúčtování."
        ),
    ),
    (
        "energy_tariff_hdo",
        "Tarif a ceny",
        "Aktuální tarif HDO",
        "",
        (
            "Zapnuto znamená nízký tarif. Stav určuje cenu pro výpočet nákladů; řídí jej "
            "distributor, bez doporučeného číselného rozsahu."
        ),
    ),
    (
        "energy_tariff_next_change",
        "Tarif a ceny",
        "Další změna tarifu",
        "",
        (
            "Čas dalšího přepnutí HDO pomáhá naplánovat spotřebu. Hodnotu dodává integrace "
            "HDO, bez číselného rozsahu."
        ),
    ),
    (
        "energy_spot_markup",
        "Tarif a ceny",
        "Přirážka obchodníka",
        "Kč/kWh",
        (
            "Přirážka ke spotu bez DPH. Vyšší hodnota zvýší srovnávací náklady; použijte "
            "smlouvu obchodníka."
        ),
    ),
    (
        "energy_spot_distribution_vt",
        "Tarif a ceny",
        "Spot: distribuce VT",
        "Kč/kWh",
        (
            "Distribuce, služby a daň s DPH ve VT. Mění srovnání se spotem; použijte ceník "
            "distributora."
        ),
    ),
    (
        "energy_spot_distribution_nt",
        "Tarif a ceny",
        "Spot: distribuce NT",
        "Kč/kWh",
        (
            "Distribuce, služby a daň s DPH v NT. Mění srovnání se spotem; použijte ceník "
            "distributora."
        ),
    ),
    (
        "energy_spot_fixed_monthly",
        "Tarif a ceny",
        "Spot: stálé platby",
        "Kč/měs.",
        (
            "Stálé měsíční platby spotového produktu s DPH. Mění pouze srovnání; použijte "
            "ceník obchodníka."
        ),
    ),
    (
        "energy_inverter_mode",
        "Střídač",
        "Provozní režim",
        "",
        (
            "Strategie řízení baterie a výroby. Změna může zahájit odběr ze sítě; obvykle "
            "obecný režim podle výrobce."
        ),
    ),
    (
        "energy_ems_mode",
        "Střídač",
        "EMS režim",
        "",
        (
            "Nadřazené řízení energetických toků. Změna ovlivní chování střídače; "
            "doporučení je podle instalatéra."
        ),
    ),
    (
        "energy_inverter_status",
        "Střídač",
        "Pracovní stav",
        "",
        (
            "Aktuální stav střídače, například normální provoz nebo porucha. Jde o "
            "diagnostiku, bez doporučeného rozsahu."
        ),
    ),
]
HELPERS = frozenset(
    {
        "energy_main_breaker",
        "energy_tariff_price_vt",
        "energy_tariff_price_nt",
        "energy_tariff_fixed_monthly",
        "energy_spot_markup",
        "energy_spot_distribution_vt",
        "energy_spot_distribution_nt",
        "energy_spot_fixed_monthly",
    }
)


def finite(value: Any) -> float | None:
    try:
        number = float(value)
        return number if math.isfinite(number) and not isinstance(value, bool) else None
    except (TypeError, ValueError):
        return None


def snapshot(hass: HomeAssistant, entry: Any, admin: bool) -> dict[str, Any]:
    rows = []
    options = entry.options.get(OPTION_KEY) or {}
    for key, (section, label, unit, explanation, lo, hi, step) in OPTIONS.items():
        value = finite(options.get(key))
        assumed = value is None and key in {"pv_tilt", "pv_azimuth"}
        if assumed:
            value = DEFAULT_TILT if key == "pv_tilt" else DEFAULT_AZIMUTH
        rows.append(
            dict(
                key=key,
                section=section,
                label=label,
                unit=unit,
                explanation=explanation,
                value=value,
                min=lo,
                max=hi,
                step=step,
                editable=admin,
                assumed=assumed,
                location="v HomeBrainu (model předpovědi)",
            )
        )
    rows.append(
        dict(
            key="performance_ratio",
            section="Fotovoltaika",
            label="Účinnost modelu",
            unit="%",
            value=DEFAULT_PERFORMANCE_RATIO * 100,
            editable=False,
            explanation=(
                "Konstantní performance ratio zahrnuje ztráty kabeláže, střídače a panelů. "
                "Obvyklý odhad 80–90 %; upravuje odhad výroby."
            ),
            location="v Home Assistantu aktualizací integrace",
        )
    )
    bindings = get_bindings(entry).get("energy", {})
    for key, section, label, unit, explanation in BINDINGS:
        entity_id = bindings.get(key)
        state = hass.states.get(entity_id) if entity_id else None
        attrs = state.attributes if state else {}
        value = state.state if state and state.state not in {"unknown", "unavailable"} else None
        if key == "energy_tariff_next_change" and value is None:
            hdo_id = bindings.get("energy_tariff_hdo")
            hdo = hass.states.get(hdo_id) if hdo_id else None
            value = hdo.attributes.get("next_change") if hdo else None
            if value is not None:
                value = str(value)
        numeric = finite(value)
        reserve = key in {"energy_battery_dod_ongrid", "energy_battery_dod_backup"}
        if reserve:
            value = 100 - numeric if numeric is not None else None
            if numeric is not None:
                explanation += f" Surové Maximum vybití (DoD): {numeric:g} %. Rezerva = 100 − DoD."
        lo, hi, step = (finite(attrs.get(k)) for k in ("min", "max", "step"))
        writable = bool(
            numeric is not None
            and entity_id
            and lo is not None
            and hi is not None
            and step is not None
            and step > 0
            and (
                (key in HELPERS and entity_id.startswith("input_number."))
                or (key == "energy_battery_dod_ongrid" and entity_id.startswith("number."))
            )
        )
        rows.append(
            dict(
                key=key,
                section=section,
                label=label,
                unit=attrs.get("unit_of_measurement") or unit,
                explanation=explanation,
                value=value,
                min=10 if reserve else lo,
                max=50 if reserve else hi,
                step=5 if reserve else step,
                editable=admin and writable,
                location="v Home Assistantu"
                if key in HELPERS or key.startswith("energy_tariff_")
                else "v aplikaci SolarGo",
                binding=key,
                connected=bool(state),
                **{"raw_min": lo, "raw_max": hi, "raw_step": step},
            )
        )
    return {"rows": rows}


def validate_write(row: dict[str, Any], value: Any) -> float:
    number = finite(value)
    if (
        number is None
        or row.get("min") is None
        or row.get("max") is None
        or not row["min"] <= number <= row["max"]
    ):
        raise ValueError("Hodnota je mimo povolený rozsah.")
    if not math.isclose(
        (number - row["min"]) / row["step"],
        round((number - row["min"]) / row["step"]),
        abs_tol=1e-6,
    ):
        raise ValueError("Hodnota neodpovídá povolenému kroku.")
    if row["key"] == "energy_battery_dod_ongrid":
        raw = 100 - number
        if not row["raw_min"] <= raw <= row["raw_max"] or not math.isclose(
            (raw - row["raw_min"]) / row["raw_step"],
            round((raw - row["raw_min"]) / row["raw_step"]),
            abs_tol=1e-6,
        ):
            raise ValueError("Rezerva není podporována střídačem.")
    return number


@websocket_api.websocket_command({vol.Required("type"): "homebrain/energy/settings/get"})
@_require_energy
@websocket_api.async_response
async def websocket_settings_get(hass, connection, msg):
    entries = hass.config_entries.async_entries(DOMAIN)
    if not entries:
        connection.send_error(msg["id"], "not_found", "HomeBrain není nastaven.")
        return
    connection.send_result(msg["id"], snapshot(hass, entries[0], connection.user.is_admin))


@websocket_api.websocket_command(
    {
        vol.Required("type"): "homebrain/energy/settings/set",
        vol.Required("key"): str,
        vol.Required("value"): vol.Any(int, float),
    }
)
@websocket_api.require_admin
@websocket_api.async_response
async def websocket_settings_set(hass, connection, msg):
    entries = hass.config_entries.async_entries(DOMAIN)
    if not entries:
        connection.send_error(msg["id"], "not_found", "HomeBrain není nastaven.")
        return
    entry = entries[0]
    row = next((r for r in snapshot(hass, entry, True)["rows"] if r["key"] == msg["key"]), None)
    if row is None or not row["editable"]:
        connection.send_error(msg["id"], "not_allowed", "Toto nastavení zde nelze měnit.")
        return
    try:
        value = validate_write(row, msg["value"])
    except ValueError as err:
        connection.send_error(msg["id"], "invalid_value", str(err))
        return
    key = msg["key"]
    if key in OPTIONS:
        hass.config_entries.async_update_entry(
            entry,
            options={
                **entry.options,
                OPTION_KEY: {**entry.options.get(OPTION_KEY, {}), key: value},
            },
        )
    else:
        entity_id = get_bindings(entry)["energy"][key]
        domain = "number" if key == "energy_battery_dod_ongrid" else "input_number"
        await hass.services.async_call(
            domain,
            "set_value",
            {"entity_id": entity_id, "value": 100 - value if domain == "number" else value},
            blocking=True,
            context=Context(user_id=connection.user.id),
        )
    _LOGGER.info(
        "Energy setting changed: user=%s key=%s old=%s new=%s",
        connection.user.id,
        key,
        row["value"],
        value,
    )
    connection.send_result(msg["id"], snapshot(hass, entry, True))
