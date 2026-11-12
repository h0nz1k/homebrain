"""Communication hub, synthetic endpoints and mocked HA services only. Refs #105."""

from copy import deepcopy
from datetime import timedelta
from unittest.mock import MagicMock, patch

import pytest
import voluptuous as vol
from homeassistant.core import Context, callback
from homeassistant.exceptions import HomeAssistantError, Unauthorized
from homeassistant.util import dt as dt_util
from pytest_homeassistant_custom_component.common import MockConfigEntry, async_fire_time_changed

from custom_components.homebrain.communication import (
    SERVICE_SCHEMA,
    async_setup,
    async_unload,
    websocket_recent,
)
from custom_components.homebrain.communication.adapters import deliver
from custom_components.homebrain.communication.config import validate
from custom_components.homebrain.communication.router import LIMIT, Router

CONFIG = {
    "people": {
        "demo": {
            "preferences": ["push", "telegram", "email"],
            "quiet_start": "22:00",
            "quiet_end": "07:00",
            "channels": {
                "push": "notify.mobile_app_demo",
                "telegram": {"service": "notify.demo_chat"},
                "email": {"service": "notify.demo_mail"},
                "todo": "todo.demo",
                "tts": {"entity_id": "tts.demo", "media_player_entity_id": "media_player.demo"},
            },
        },
        "other": {"preferences": ["todo"], "channels": {"todo": "todo.other"}},
    },
    "groups": {"household": ["demo", "other", "demo"]},
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
        result.append((call.domain, call.service, dict(call.data)))

    for domain, service in [
        ("notify", "mobile_app_demo"),
        ("notify", "demo_chat"),
        ("notify", "demo_mail"),
        ("todo", "add_item"),
        ("tts", "speak"),
        ("notify", "send_message"),
        ("telegram_bot", "send_message"),
    ]:
        hass.services.async_register(domain, service, capture)
    return result


def request(**kwargs):
    return SERVICE_SCHEMA({"recipient": "demo", "message": "Syntetická zpráva", **kwargs})


async def test_preferences_and_group_expansion(router, calls):
    result = await router.notify(request(recipient="household"))
    assert len(result["results"]) == 2
    assert [(d, s) for d, s, _ in calls] == [("notify", "mobile_app_demo"), ("todo", "add_item")]


async def test_missing_service_and_rejected_call_fallback(router, calls, hass):
    hass.services.async_remove("notify", "mobile_app_demo")
    await router.notify(request())
    assert calls[-1][1] == "demo_chat"
    assert router.snapshot()[1]["reason"] == "service_unavailable"

    async def fail(call):
        raise HomeAssistantError("Sensitive provider detail")

    hass.services.async_register("notify", "mobile_app_demo", fail)
    await router.notify(request())
    assert calls[-1][1] == "demo_chat"
    assert router.snapshot()[1]["reason"] == "service_error"


async def test_unconfigured_fallback_and_no_channel(router, calls):
    del router.entry.options["communication"]["people"]["demo"]["channels"]["push"]
    await router.notify(request())
    assert calls[-1][1] == "demo_chat"
    assert router.snapshot()[1]["reason"] == "unconfigured"
    result = await router.notify(request(channel="push"))
    assert result["results"][0]["status"] == "failed"
    assert router.snapshot()[0]["reason"] == "no_channel"


@pytest.mark.parametrize("priority", ["normal", "high", "critical"])
async def test_quiet_hours_critical_bypass_and_flush(router, calls, freezer, priority):
    freezer.move_to("2026-11-12T23:00:00+00:00")
    await router.notify(request(priority=priority))
    assert bool(calls) == (priority == "critical")
    if priority != "critical":
        assert len(router.state["queue"]) == 1
        freezer.move_to("2026-11-13T07:00:00+00:00")
        await router.tick()
        assert calls[-1][1] == "mobile_app_demo"
        assert not router.state["queue"]


async def test_local_timezone_and_daytime_quiet(router, freezer):
    dt_util.set_default_time_zone(dt_util.get_time_zone("Europe/Prague"))
    freezer.move_to("2026-11-12T21:00:00+00:00")
    assert router.quiet(router.config["people"]["demo"], dt_util.utcnow())
    dt_util.set_default_time_zone(dt_util.UTC)
    person = {"quiet_start": "12:00", "quiet_end": "13:00"}
    freezer.move_to("2026-11-12T12:30:00+00:00")
    assert router.quiet(person, dt_util.utcnow())
    person["quiet_end"] = "12:00"
    assert not router.quiet(person, dt_util.utcnow())


async def test_dedup_per_person_and_expiry(router, calls, freezer):
    await router.notify(request(tag="demo-tag"))
    result = await router.notify(request(tag="demo-tag"))
    assert result["results"][0]["status"] == "duplicate"
    await router.notify(request(tag="demo-tag", recipient="other"))
    assert len(calls) == 2
    freezer.tick(timedelta(seconds=301))
    await router.notify(request(tag="demo-tag"))
    assert len(calls) == 3


async def test_escalation_exactly_five_minutes(router, calls, freezer):
    await router.notify(request(priority="high"))
    freezer.tick(timedelta(minutes=4, seconds=59))
    await router.tick()
    assert len(calls) == 1
    freezer.tick(timedelta(seconds=1))
    await router.tick()
    assert [s for _, s, _ in calls] == ["mobile_app_demo", "demo_chat"]
    await router.tick()
    assert len(calls) == 2


async def test_timer_drives_escalation(router, calls, hass, freezer):
    await router.notify(request(priority="high"))
    freezer.tick(timedelta(minutes=5))
    async_fire_time_changed(hass, dt_util.utcnow())
    await hass.async_block_till_done()
    assert calls[-1][1] == "demo_chat"


async def test_ack_event_cancels_escalation(router, calls, hass, freezer):
    await router.notify(request(priority="high"))
    action = calls[0][2]["data"]["actions"][0]
    assert action["title"] == "Beru"
    hass.bus.async_fire("mobile_app_notification_action", {"action": action["action"]})
    await hass.async_block_till_done()
    assert router.snapshot()[0]["ack"]
    freezer.tick(timedelta(minutes=6))
    await router.tick()
    assert len(calls) == 1
    assert not router.state["pending"]


async def test_escalation_email_fallback(router, calls, hass, freezer):
    await router.notify(request(priority="critical"))
    hass.services.async_remove("notify", "demo_chat")
    freezer.tick(timedelta(minutes=5))
    await router.tick()
    assert calls[-1][1] == "demo_mail"


async def test_escalation_respects_quiet_hours(router, calls, freezer):
    freezer.move_to("2026-11-12T21:58:00+00:00")
    await router.notify(request(priority="high"))
    freezer.tick(timedelta(minutes=5))
    await router.tick()
    assert len(calls) == 1
    freezer.move_to("2026-11-13T07:00:00+00:00")
    await router.tick()
    assert calls[-1][1] == "demo_chat"


async def test_daily_digest_and_retry(router, calls, freezer, hass):
    await router.notify(request(priority="info", message="První položka"))
    await router.notify(request(priority="info", message="Druhá položka"))
    assert not calls
    freezer.move_to("2026-11-13T06:59:00+00:00")
    await router.tick()
    assert not calls
    freezer.tick(timedelta(minutes=1))
    hass.services.async_remove("notify", "demo_chat")
    hass.services.async_remove("notify", "demo_mail")
    await router.tick()
    assert len(router.state["queue"]) == 2
    hass.services.async_register("notify", "demo_chat", lambda call: None)
    await router.tick()
    sent = [r for r in router.snapshot() if r["status"] == "sent"]
    assert sent[0]["title"] == "Denní souhrn"
    assert sent[0]["message"] == "První položka\nDruhá položka"
    assert not router.state["queue"]
    await router.tick()
    assert len([r for r in router.snapshot() if r["status"] == "sent"]) == 1


async def test_persistence_restores_audit_queue_dedup_and_pending(router, calls, freezer):
    await router.notify(request(priority="high", tag="restore"))
    await router.notify(request(priority="info"))
    await router.stop()
    restored = Router(router.hass, router.entry)
    await restored.start()
    try:
        assert restored.snapshot() == router.snapshot()
        assert restored.state == router.state
        assert (await restored.notify(request(tag="restore")))["results"][0][
            "status"
        ] == "duplicate"
        freezer.tick(timedelta(minutes=5))
        await restored.tick()
        assert calls[-1][1] == "demo_chat"
    finally:
        await restored.stop()


async def test_bounds_and_removed_recipient(router, calls, freezer):
    for i in range(LIMIT + 1):
        router.audit(
            {"id": str(i), "recipient": "demo", "message": "Test", "priority": "normal"},
            "push",
            "sent",
        )
    assert len(router.snapshot()) == LIMIT
    assert router.snapshot()[-1]["notification_id"] == "1"
    await router.notify(request(priority="info"))
    router.state["queue"] *= LIMIT
    result = await router.notify(request(priority="info", tag="overflow"))
    assert result["results"][0]["status"] == "failed"
    assert "demo:overflow" not in router.state["dedup"]
    router.entry.options["communication"]["people"].pop("demo")
    router.entry.options["communication"]["groups"] = {}
    await router.tick()
    assert not router.state["queue"]


async def test_expired_queue(router, calls, freezer):
    await router.notify(request(priority="info"))
    freezer.tick(timedelta(days=8))
    await router.tick()
    assert not router.state["queue"]
    assert router.snapshot()[0]["reason"] == "expired"
    assert not calls


@pytest.mark.parametrize(
    "channel,endpoint,expected",
    [
        ("todo", "todo.demo", ("todo", "add_item", {"entity_id": "todo.demo", "item": "Test"})),
        (
            "tts",
            {"entity_id": "tts.demo", "media_player_entity_id": "media_player.demo"},
            (
                "tts",
                "speak",
                {
                    "entity_id": "tts.demo",
                    "media_player_entity_id": "media_player.demo",
                    "message": "Test",
                },
            ),
        ),
        (
            "email",
            {"entity_id": "notify.demo"},
            (
                "notify",
                "send_message",
                {"entity_id": "notify.demo", "message": "Test", "title": "HomeBrain"},
            ),
        ),
        (
            "telegram",
            {"service": "telegram_bot.send_message", "target": [12345]},
            (
                "telegram_bot",
                "send_message",
                {"target": [12345], "message": "Test", "title": "HomeBrain"},
            ),
        ),
    ],
)
async def test_adapters(hass, calls, channel, endpoint, expected):
    result = await deliver(
        hass, channel, endpoint, {"id": "demo", "message": "Test", "priority": "normal"}
    )
    assert result[0] == "sent"
    assert calls[-1] == expected


async def test_push_reserved_fields_and_critical(hass, calls):
    data = {"actions": [{"action": "INJECTED"}], "tag": "wrong", "url": "/demo"}
    await deliver(
        hass,
        "push",
        "notify.mobile_app_demo",
        {
            "id": "demo",
            "message": "Test",
            "priority": "critical",
            "data": data,
        },
    )
    payload = calls[-1][2]["data"]
    assert payload["tag"] == "demo"
    assert payload["actions"][0]["action"] == "HOMEBRAIN_ACK_demo"
    assert payload["push"]["sound"]["critical"] == 1
    assert data["tag"] == "wrong"


@pytest.mark.parametrize(
    "value",
    [
        {"groups": {"unknown": ["absent"]}},
        {"people": {"demo": {}}, "groups": {"demo": ["demo"]}},
        {"people": {"demo": {"quiet_start": "25:00"}}},
        {"people": {"demo": {"channels": {"push": "script.demo"}}}},
        {"people": {"demo": {"channels": {"email": {"service": "homeassistant.restart"}}}}},
        {"people": {"demo": {"channels": {"todo": "light.demo"}}}},
    ],
)
def test_invalid_config(value):
    with pytest.raises(vol.Invalid):
        validate(value)


async def test_service_admin_and_automation_only(hass, calls, hass_admin_user, hass_read_only_user):
    entry = MockConfigEntry(domain="homebrain", options={"communication": deepcopy(CONFIG)})
    await async_setup(hass, entry)
    try:
        with pytest.raises(Unauthorized):
            await hass.services.async_call(
                "homebrain",
                "notify",
                request(),
                blocking=True,
                context=Context(user_id=hass_read_only_user.id),
            )
        for context in (Context(), Context(user_id=hass_admin_user.id)):
            result = await hass.services.async_call(
                "homebrain",
                "notify",
                request(priority="critical"),
                blocking=True,
                context=context,
                return_response=True,
            )
            assert result["results"][0]["status"] == "sent"
    finally:
        await async_unload(hass)
    assert not hass.services.has_service("homebrain", "notify")


async def test_websocket_admin_only(hass, hass_admin_user, hass_read_only_user):
    connection = MagicMock()
    connection.user = hass_read_only_user
    with pytest.raises(Unauthorized):
        websocket_recent(hass, connection, {"id": 1})
    connection.send_result.assert_not_called()
    connection.reset_mock()
    connection.user = hass_admin_user
    router = MagicMock()
    router.snapshot.return_value = []
    hass.data["homebrain"] = {"communication": router}
    websocket_recent(hass, connection, {"id": 2})
    connection.send_result.assert_called_once_with(2, {"messages": []})


async def test_options_flow_validates_and_preserves_other_options(hass):
    from homeassistant.data_entry_flow import FlowResultType

    entry = MockConfigEntry(domain="homebrain", data={}, options={"demo_option": True})
    entry.add_to_hass(hass)
    flow = await hass.config_entries.options.async_init(entry.entry_id)
    flow = await hass.config_entries.options.async_configure(
        flow["flow_id"], {"next_step_id": "communication"}
    )
    assert flow["step_id"] == "communication"
    invalid = {"people": {"demo": {"quiet_end": "25:00"}}}
    flow = await hass.config_entries.options.async_configure(
        flow["flow_id"], {"communication": invalid}
    )
    assert flow["errors"] == {"base": "invalid_communication"}
    flow = await hass.config_entries.options.async_configure(
        flow["flow_id"], {"communication": deepcopy(CONFIG)}
    )
    assert flow["type"] is FlowResultType.CREATE_ENTRY
    assert entry.options["demo_option"]
    assert entry.options["communication"]["digest_at"] == "07:00"


async def test_digest_splits_large_messages(router, calls, freezer):
    await router.notify(request(priority="info", message="A" * 3000))
    await router.notify(request(priority="info", message="B" * 3000))
    freezer.move_to("2026-11-13T07:00:00+00:00")
    await router.tick()
    assert len(calls) == 2
    assert all(len(data["message"]) <= 4096 for _, _, data in calls)
    assert not router.state["queue"]


@pytest.mark.parametrize(
    "error",
    [TimeoutError(), vol.Invalid("Rejected schema"), ConnectionError("Provider unavailable")],
)
async def test_adapter_timeout_or_validation_falls_back(router, calls, hass, error):
    async def fail(call):
        raise error

    hass.services.async_register("notify", "mobile_app_demo", fail)
    await router.notify(request())
    assert calls[-1][1] == "demo_chat"


def test_telegram_requires_explicit_target():
    with pytest.raises(vol.Invalid):
        validate(
            {
                "people": {
                    "demo": {"channels": {"telegram": {"service": "telegram_bot.send_message"}}}
                }
            }
        )


async def test_normal_push_acknowledgement_without_escalation(router, calls, freezer, hass):
    await router.notify(request())
    freezer.tick(timedelta(minutes=6))
    await router.tick()
    assert len(calls) == 1
    hass.bus.async_fire(
        "mobile_app_notification_action", {"action": calls[0][2]["data"]["actions"][0]["action"]}
    )
    await hass.async_block_till_done()
    assert router.snapshot()[0]["status"] == "acknowledged"
    assert not router.state["pending"]


async def test_idle_ticks_do_not_rewrite_store(router, calls, freezer):
    freezer.move_to("2026-11-12T23:00:00+00:00")
    await router.notify(request())
    with patch.object(router.store, "async_save", wraps=router.store.async_save) as save:
        await router.tick()
        save.assert_not_called()
        freezer.move_to("2026-11-13T07:00:00+00:00")
        await router.tick()
        save.assert_awaited_once()
