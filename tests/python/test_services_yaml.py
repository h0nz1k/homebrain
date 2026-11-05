"""Every registered HomeBrain service has a description in services.yaml (no load error)."""

from homeassistant.core import HomeAssistant
from homeassistant.helpers.service import async_get_all_descriptions
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.homebrain.const import DOMAIN
from custom_components.homebrain.wine.services import async_setup_services


async def test_registered_services_have_descriptions(hass: HomeAssistant, caplog):
    MockConfigEntry(domain=DOMAIN, data={}).add_to_hass(hass)
    await async_setup_services(hass)
    descriptions = await async_get_all_descriptions(hass)
    registered = set(hass.services.async_services().get(DOMAIN, {}))
    assert registered
    for service in registered:
        assert service in descriptions[DOMAIN]
        assert descriptions[DOMAIN][service].get("fields"), service
    assert "Failed to load services.yaml" not in caplog.text
