"""GoodWe entity suggestions for the energy bindings config step."""

from custom_components.homebrain.energy.binding_suggestions import suggest_energy_binding


async def test_suggest_when_exactly_one_match(hass):
    hass.states.async_set("switch.inverter_fast_charging", "off")
    assert suggest_energy_binding(hass, "energy_fast_charge") == "switch.inverter_fast_charging"


async def test_suggest_czech_pattern(hass):
    hass.states.async_set("number.demo_maximum_vybiti_v_siti", "90")
    assert suggest_energy_binding(hass, "energy_battery_dod_ongrid") == "number.demo_maximum_vybiti_v_siti"


async def test_suggest_none_when_ambiguous(hass):
    hass.states.async_set("switch.a_fast_charging", "off")
    hass.states.async_set("switch.b_fast_charging", "off")
    assert suggest_energy_binding(hass, "energy_fast_charge") is None


async def test_suggest_none_when_no_match(hass):
    assert suggest_energy_binding(hass, "energy_fast_charge") is None


async def test_suggest_ignores_wrong_domain(hass):
    hass.states.async_set("number.fast_charging", "1")
    assert suggest_energy_binding(hass, "energy_fast_charge") is None