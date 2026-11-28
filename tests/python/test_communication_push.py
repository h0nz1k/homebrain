"""Push companion clickAction/url from module or tag. Synthetic endpoints only."""

from copy import deepcopy
from datetime import timedelta

import pytest
from homeassistant.core import callback
from homeassistant.util import dt as dt_util
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.homebrain.communication import SERVICE_SCHEMA
from custom_components.homebrain.communication.adapters import deliver, panel_click_path
from custom_components.homebrain.communication.router import Router
from custom_components.homebrain.const import MODULE_URL_PATHS

CONFIG = {
    "people": {
        "demo": {
            "preferences": ["push"],
            "quiet_start": "22:00",
            "quiet_end": "07:00",
            "channels": {"push": "notify.mobile_app_demo"},
        }
    },
    "groups": {},
}


@pytest.fixture
async def router(hass, freezer):
    dt_util.set_default_time_zone(dt_util.UTC)
    freezer.move_to("2026-11-12T12:00:00+00:00")
    entry = MockConfigEntry(domain="homebrain", options={"communication": deepcopy(CONFIG)})
    router = Router(hass, entry)
    await router.start()
    yield router
    await router.stop()


@pytest.fixture
def calls(hass):
    result = []

    @callback
    def capture(call):
        result.append(dict(call.data))

    hass.services.async_register("notify", "mobile_app_demo", capture)
    return result


def request(**kwargs):
    return SERVICE_SCHEMA({"recipient": "demo", "message": "Syntetická zpráva", **kwargs})


def test_module_url_paths_from_panels():
    assert MODULE_URL_PATHS["heating"] == "homebrain-topeni"
    assert MODULE_URL_PATHS["recipes"] == "homebrain-recepty"
    assert panel_click_path({"module": "heating"}) == "/homebrain-topeni"
    assert panel_click_path({"tag": "recipes.timer"}) == "/homebrain-recepty"
    assert panel_click_path({"module": "unknown-mod"}) is None
    assert panel_click_path({"tag": "unknown.mod"}) is None


async def test_push_module_heating_sets_click_action_and_url(hass, calls):
    await deliver(
        hass,
        "push",
        "notify.mobile_app_demo",
        request(module="heating", channel="push") | {"id": "n1"},
    )
    data = calls[-1]["data"]
    assert data["clickAction"] == "/homebrain-topeni"
    assert data["url"] == "/homebrain-topeni"


async def test_push_module_recipes_sets_click_action_and_url(hass, calls):
    await deliver(
        hass,
        "push",
        "notify.mobile_app_demo",
        request(module="recipes", channel="push") | {"id": "n2"},
    )
    data = calls[-1]["data"]
    assert data["clickAction"] == "/homebrain-recepty"
    assert data["url"] == "/homebrain-recepty"


async def test_push_caller_click_action_wins(hass, calls):
    await deliver(
        hass,
        "push",
        "notify.mobile_app_demo",
        request(module="heating", data={"clickAction": "/custom"}, channel="push") | {"id": "n3"},
    )
    data = calls[-1]["data"]
    assert data["clickAction"] == "/custom"
    assert "url" not in data


async def test_push_unknown_module_omits_click_targets(hass, calls):
    await deliver(
        hass,
        "push",
        "notify.mobile_app_demo",
        request(module="no-such-module", channel="push") | {"id": "n4"},
    )
    data = calls[-1]["data"]
    assert "clickAction" not in data
    assert "url" not in data


async def test_push_critical_keeps_alarm_fields_and_click_action(hass, calls):
    await deliver(
        hass,
        "push",
        "notify.mobile_app_demo",
        request(module="heating", priority="critical", channel="push") | {"id": "n5"},
    )
    data = calls[-1]["data"]
    assert data["push"]["sound"]["critical"] == 1
    assert data["ttl"] == 0
    assert data["priority"] == "high"
    assert data["channel"] == "alarm_stream"
    assert data["clickAction"] == "/homebrain-topeni"
    assert data["url"] == "/homebrain-topeni"


async def test_push_tag_prefix_derives_module(hass, calls):
    await deliver(
        hass,
        "push",
        "notify.mobile_app_demo",
        request(tag="heating.solar_off_hot", channel="push") | {"id": "n6"},
    )
    data = calls[-1]["data"]
    assert data["clickAction"] == "/homebrain-topeni"
    assert data["url"] == "/homebrain-topeni"


async def test_module_survives_schema_and_quiet_queue(router, calls, freezer):
    validated = request(module="heating", priority="normal", tag="heating.queued")
    assert validated["module"] == "heating"
    freezer.move_to("2026-11-12T23:00:00+00:00")
    result = await router.notify(validated)
    assert result["results"][0]["status"] == "queued"
    assert router.state["queue"][0]["module"] == "heating"
    freezer.move_to("2026-11-13T07:00:00+00:00")
    await router.tick()
    data = calls[-1]["data"]
    assert data["clickAction"] == "/homebrain-topeni"
    assert data["url"] == "/homebrain-topeni"


async def test_module_survives_escalation_pending(router, calls, freezer):
    await router.notify(request(module="recipes", priority="high", tag="recipes.ack"))
    pending = next(iter(router.state["pending"].values()))
    assert pending["message"]["module"] == "recipes"
    freezer.tick(timedelta(minutes=5))
    await router.tick()
    # Escalation uses telegram/email preferences; push already sent once with click path.
    assert calls[0]["data"]["clickAction"] == "/homebrain-recepty"
    assert calls[0]["data"]["url"] == "/homebrain-recepty"
