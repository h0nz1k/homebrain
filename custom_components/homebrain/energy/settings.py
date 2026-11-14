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
# key: section, Czech label, unit, (visible summary, tooltip help), min, max, step.
# The tooltip never repeats the summary: meaning, practical consequence, recommended range.
OPTIONS = {
    "pv_kwp": (
        "Fotovoltaika",
        "Výkon pole",
        "kWp",
        (
            "Součet jmenovitých výkonů všech panelů.",
            "kWp je výkon panelů za ideálního slunce, najdete ho ve smlouvě nebo na štítcích. "
            "Mění jen předpověď výroby, skutečný výkon elektrárny zůstává stejný.",
        ),
        0.01,
        100,
        0.01,
    ),
    "pv_tilt": (
        "Fotovoltaika",
        "Sklon panelů",
        "°",
        (
            "Úhel panelů vůči vodorovné ploše.",
            "0 ° znamená panely naležato, 90 ° svisle na fasádě. Mění jen předpověď výroby; "
            "běžná šikmá střecha má 25–45 °.",
        ),
        0,
        90,
        1,
    ),
    "pv_azimuth": (
        "Fotovoltaika",
        "Orientace panelů",
        "°",
        (
            "Kam panely míří: 0 ° jih, −90 ° východ, 90 ° západ.",
            "Určuje, kdy během dne předpověď čeká nejvíc výroby: východ dopoledne, západ "
            "odpoledne. Sever je ±180 °.",
        ),
        -180,
        180,
        1,
    ),
    "inverter_ac_limit_kw": (
        "Fotovoltaika",
        "AC limit střídače",
        "kW",
        (
            "Nejvyšší výkon, který střídač dodá do domu.",
            "Při silném slunci se výroba nad tento výkon ořízne a předpověď s tím počítá. "
            "Zadejte jmenovitý výkon ze štítku střídače.",
        ),
        0.01,
        1000,
        0.01,
    ),
    "battery_capacity_kwh": (
        "Baterie",
        "Kapacita baterie",
        "kWh",
        (
            "Využitelná kapacita baterie.",
            "Slouží k výpočtu zbývající energie a dopadu změny rezervy v kWh. Nastavení "
            "baterie se tím nemění; zadejte údaj výrobce.",
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
            "Maximální přetok, se kterým počítá předpověď.",
            "Přetok je elektřina, kterou dům nespotřebuje a která odteče do sítě. Tento limit "
            "platí jen pro výpočet předpovědi, střídač neovlivní; použijte smluvený limit.",
        ),
        0.01,
        1000,
        0.01,
    ),
}
# Binding rows: key, section, label, fallback unit, (visible summary, tooltip help).
BINDINGS = [
    (
        "energy_battery_dod_ongrid",
        "Baterie",
        "Rezerva při běžném provozu",
        "%",
        (
            "Co baterie v běžném provozu nikdy nedá do domu.",
            "Nižší rezerva = víc energie na noc; vyšší = jistota při výpadcích a šetrnější "
            "k baterii v mrazu.",
        ),
    ),
    (
        "energy_battery_dod_backup",
        "Baterie",
        "Rezerva pro výpadek",
        "%",
        (
            "Spodní hranice baterie, když dům při výpadku jede ze zálohy.",
            "Při výpadku sítě napájí baterie dům až k této hranici, pak se záloha vypne. "
            "Nižší hodnota prodlouží výdrž bez sítě, vyšší šetří baterii.",
        ),
    ),
    (
        "energy_battery_keep_dod",
        "Baterie",
        "Hlídat rezervu",
        "",
        (
            "Střídač nedovolí baterii klesnout pod rezervu.",
            "Když baterie klesne pod rezervu, střídač ji dobije i ze sítě. Chrání to baterii "
            "za cenu malého odběru ze sítě; běžně zapnuto.",
        ),
    ),
    (
        "energy_fast_charge",
        "Baterie",
        "Rychlé nabíjení",
        "",
        (
            "Nucené nabíjení baterie ze sítě.",
            "Hodí se před ohlášeným výpadkem nebo při levné elektřině. Ve vysokém tarifu ho "
            "bezpečnostní automatizace sama vypne; běžně vypnuto.",
        ),
    ),
    (
        "energy_fast_charge_power",
        "Baterie",
        "Výkon rychlého nabíjení",
        "%",
        (
            "Jak rychle se baterie při rychlém nabíjení plní.",
            "Udává se v procentech nejvyššího nabíjecího výkonu. Vyšší hodnota zvýší odběr "
            "ze sítě, proto hlídejte hlavní jistič.",
        ),
    ),
    (
        "energy_fast_charge_soc",
        "Baterie",
        "Cíl rychlého nabíjení",
        "%",
        (
            "Do kolika procent se baterie rychle nabije.",
            "Po dosažení cíle se rychlé nabíjení samo ukončí. Pro zálohu obvykle stačí 80–100 %.",
        ),
    ),
    (
        "energy_eco_power",
        "Baterie",
        "Výkon ekonomického režimu",
        "%",
        (
            "Výkon plánovaného nabíjení nebo vybíjení.",
            "Platí v ekonomickém režimu podle časového plánu. Vyšší výkon zrychlí nabití, "
            "ale víc zatíží baterii; rozsah určuje výrobce.",
        ),
    ),
    (
        "energy_eco_soc",
        "Baterie",
        "Cíl ekonomického režimu",
        "%",
        (
            "Do kolika procent ekonomický plán nabíjí.",
            "Vyšší cíl ponechá víc energie na večer, nižší nechá víc místa pro slunce. "
            "Obvykle 80–100 %.",
        ),
    ),
    (
        "energy_export_limit_enabled",
        "Síť",
        "Řízení dodávky do sítě",
        "",
        (
            "Zda střídač omezuje přetok do sítě.",
            "Když je zapnuto, střídač nepustí do sítě víc než limit přetoku střídače. "
            "Nastavení musí odpovídat podmínkám distributora.",
        ),
    ),
    (
        "energy_export_limit",
        "Síť",
        "Limit přetoku střídače",
        "W",
        (
            "Kolik smí střídač skutečně poslat do sítě.",
            "Přetok je přebytek elektřiny, který odteče do sítě. Vyšší limit umožní víc "
            "prodat, ale musí odpovídat smlouvě s distributorem.",
        ),
    ),
    (
        "energy_main_breaker",
        "Síť",
        "Hlavní jistič",
        "A",
        (
            "Proud jističe na jednu fázi, např. 25 A pro 3×25 A.",
            "Slouží jako stupnice pro zatížení fází v přehledu, skutečný jistič se tím "
            "nemění. Domácnosti mají obvykle 16–32 A.",
        ),
    ),
    (
        "energy_tariff_price_vt",
        "Tarif a ceny",
        "Cena vysokého tarifu",
        "Kč/kWh",
        (
            "Celková cena 1 kWh ve vysokém tarifu s DPH.",
            "Podle ní se počítají náklady na odběr ve VT. Opište ji z aktuálního ceníku "
            "nebo vyúčtování.",
        ),
    ),
    (
        "energy_tariff_price_nt",
        "Tarif a ceny",
        "Cena nízkého tarifu",
        "Kč/kWh",
        (
            "Celková cena 1 kWh v nízkém tarifu s DPH.",
            "Podle ní se počítají náklady na odběr v NT. Opište ji z aktuálního ceníku "
            "nebo vyúčtování.",
        ),
    ),
    (
        "energy_tariff_fixed_monthly",
        "Tarif a ceny",
        "Stálé měsíční platby",
        "Kč/měs.",
        (
            "Platby nezávislé na spotřebě, s DPH.",
            "Rozpočítají se do odhadu měsíčních nákladů. Použijte součet stálých položek "
            "z vyúčtování.",
        ),
    ),
    (
        "energy_tariff_hdo",
        "Tarif a ceny",
        "Aktuální tarif HDO",
        "",
        (
            "Který tarif právě platí.",
            "HDO je signál distributora, který přepíná nízký a vysoký tarif. Podle něj se "
            "vybírá cena pro výpočet nákladů.",
        ),
    ),
    (
        "energy_tariff_next_change",
        "Tarif a ceny",
        "Další změna tarifu",
        "",
        (
            "Kdy se tarif příště přepne.",
            "Pomáhá naplánovat pračku, myčku nebo ohřev vody do nízkého tarifu. Čas dodává "
            "integrace HDO.",
        ),
    ),
    (
        "energy_spot_markup",
        "Tarif a ceny",
        "Přirážka obchodníka",
        "Kč/kWh",
        (
            "Přirážka ke spotové ceně bez DPH.",
            "Použije se jen pro srovnání se spotovým produktem. Hodnotu najdete ve smlouvě "
            "obchodníka.",
        ),
    ),
    (
        "energy_spot_distribution_vt",
        "Tarif a ceny",
        "Spot: distribuce VT",
        "Kč/kWh",
        (
            "Distribuce, služby a daň ve VT s DPH.",
            "Použije se jen pro srovnání se spotovým produktem. Hodnotu najdete v ceníku "
            "distributora.",
        ),
    ),
    (
        "energy_spot_distribution_nt",
        "Tarif a ceny",
        "Spot: distribuce NT",
        "Kč/kWh",
        (
            "Distribuce, služby a daň v NT s DPH.",
            "Použije se jen pro srovnání se spotovým produktem. Hodnotu najdete v ceníku "
            "distributora.",
        ),
    ),
    (
        "energy_spot_fixed_monthly",
        "Tarif a ceny",
        "Spot: stálé platby",
        "Kč/měs.",
        (
            "Stálé měsíční platby spotového produktu s DPH.",
            "Použijí se jen pro srovnání se spotovým produktem. Hodnotu najdete v ceníku "
            "obchodníka.",
        ),
    ),
    (
        "energy_inverter_mode",
        "Střídač",
        "Provozní režim",
        "",
        (
            "Jak střídač hospodaří s baterií a výrobou.",
            "Jiný režim může například začít nabíjet baterii ze sítě. Běžně stačí obecný "
            "režim, změny konzultujte s instalatérem.",
        ),
    ),
    (
        "energy_ems_mode",
        "Střídač",
        "Řízení toků (EMS)",
        "",
        (
            "Nadřazené řízení toků energie ve střídači.",
            "EMS rozhoduje, kdy se baterie nabíjí, vybíjí nebo čeká. Běžně automatický "
            "režim; jiné nastavení doporučí instalatér.",
        ),
    ),
    (
        "energy_inverter_status",
        "Střídač",
        "Pracovní stav",
        "",
        (
            "Co střídač právě dělá.",
            "Slouží jen k diagnostice, například normální provoz, čekání nebo porucha. "
            "Při poruše kontaktujte servis.",
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


LOCATIONS = {
    "HomeBrain": "v HomeBrainu",
    "Home Assistant": "v Home Assistantu",
    "SolarGo": "v aplikaci SolarGo",
    "Správce": "jen správce v HomeBrainu",
}


def _where(admin: bool, writable: bool, origin: str) -> dict[str, str | None]:
    """Where a row is changed; editable rows need no note, admin-only rows name the admin."""
    if admin and writable:
        return {"source": None, "location": None}
    source = "Správce" if writable else origin
    return {"source": source, "location": LOCATIONS[source]}


BINDING_SETUP = "v Home Assistantu: Zařízení a služby → HomeBrain → Konfigurovat → Energie"


def _unassigned(admin: bool) -> dict[str, str]:
    """Unbound rows: entity assignment is admin-only, so others are just told who does it."""
    if admin:
        return {"source": "Home Assistant", "location": BINDING_SETUP}
    return {"source": "Správce", "location": LOCATIONS["Správce"]}


def snapshot(hass: HomeAssistant, entry: Any, admin: bool) -> dict[str, Any]:
    rows = []
    options = entry.options.get(OPTION_KEY) or {}
    for key, (section, label, unit, (summary, explanation), lo, hi, step) in OPTIONS.items():
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
                summary=summary,
                explanation=explanation,
                value=value,
                min=lo,
                max=hi,
                step=step,
                editable=admin,
                assumed=assumed,
                **_where(admin, True, "HomeBrain"),
            )
        )
    rows.append(
        dict(
            key="performance_ratio",
            section="Fotovoltaika",
            label="Účinnost systému",
            unit="%",
            value=DEFAULT_PERFORMANCE_RATIO * 100,
            editable=False,
            summary="Podíl výroby, který zbude po ztrátách.",
            explanation=(
                "Zahrnuje ztráty v kabelech, ve střídači a zahříváním panelů. Předpověď jí "
                "násobí teoretickou výrobu; běžné systémy mají 80–90 %."
            ),
            source="Home Assistant",
            location="v Home Assistantu aktualizací integrace HomeBrain",
        )
    )
    bindings = get_bindings(entry).get("energy", {})
    for key, section, label, unit, (summary, explanation) in BINDINGS:
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
                explanation += (
                    " Ve střídači odpovídá parametru „Maximum vybití“ = 100 % − rezerva "
                    f"(teď {numeric:g} %)."
                )
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
                summary=summary,
                explanation=explanation,
                value=value,
                min=10
                if key == "energy_battery_dod_ongrid"
                else (100 - hi if reserve and hi is not None else lo),
                max=50
                if key == "energy_battery_dod_ongrid"
                else (100 - lo if reserve and lo is not None else hi),
                step=5 if key == "energy_battery_dod_ongrid" else step,
                editable=admin and writable,
                **(
                    _where(
                        admin,
                        writable,
                        "Home Assistant"
                        if key in HELPERS or key.startswith("energy_tariff_")
                        else "SolarGo",
                    )
                    if entity_id
                    else _unassigned(admin)
                ),
                binding=key,
                assigned=bool(entity_id),
                # Entity ids are configuration detail; only the admin sees them.
                entity_id=entity_id if admin else None,
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
