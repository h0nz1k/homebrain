"""Validated, secret-free routing options. Refs #105."""

from __future__ import annotations

import voluptuous as vol
from homeassistant.helpers import config_validation as cv

OPTION = "communication"
CHANNELS = ("push", "todo", "tts", "telegram", "email")
PRIORITIES = ("info", "normal", "high", "critical")
DEFAULT = {
    "people": {"demo": {"channels": {}, "preferences": ["push", "telegram", "email"]}},
    "groups": {"household": ["demo"]},
    "digest_at": "07:00",
    "dedup_seconds": 300,
}


def clock(value):
    value = str(value)
    parts = value.split(":")
    if len(parts) != 2 or not all(p.isdigit() and len(p) == 2 for p in parts):
        raise vol.Invalid("Expected HH:MM")
    if not 0 <= int(parts[0]) < 24 or not 0 <= int(parts[1]) < 60:
        raise vol.Invalid("Invalid time")
    return value


def entity(domain):
    def check(value):
        value = cv.entity_id(value)
        if not value.startswith(domain + "."):
            raise vol.Invalid("Unexpected entity domain")
        return value

    return check


def endpoint(value):
    value = dict(value)
    if "entity_id" in value:
        return vol.Schema({vol.Required("entity_id"): entity("notify")})(value)
    service = value.get("service", "")
    if not (service.startswith("notify.") or service == "telegram_bot.send_message"):
        raise vol.Invalid("Only HA notification services are allowed")
    if service in ("notify.notify", "notify.send_message"):
        raise vol.Invalid("Configure a specific notification service or entity")
    result = vol.Schema(
        {vol.Required("service"): cv.service, vol.Optional("target"): [vol.Any(str, int)]}
    )(value)
    if service == "telegram_bot.send_message" and not result.get("target"):
        raise vol.Invalid("Telegram requires an explicit target")
    return result


CHANNEL_SCHEMA = vol.Schema(
    {
        vol.Optional("push"): vol.All(cv.string, vol.Match(r"^notify\.mobile_app_[a-z0-9_]+$")),
        vol.Optional("todo"): entity("todo"),
        vol.Optional("tts"): {
            vol.Required("entity_id"): entity("tts"),
            vol.Required("media_player_entity_id"): entity("media_player"),
        },
        vol.Optional("telegram"): endpoint,
        vol.Optional("email"): endpoint,
    }
)
PERSON_SCHEMA = vol.Schema(
    {
        vol.Optional("channels", default=dict): CHANNEL_SCHEMA,
        vol.Optional("preferences", default=lambda: ["push", "telegram", "email"]): [
            vol.In(CHANNELS)
        ],
        vol.Optional("quiet_start", default="22:00"): clock,
        vol.Optional("quiet_end", default="07:00"): clock,
    }
)
SCHEMA = vol.Schema(
    {
        vol.Optional("people", default=dict): {cv.slug: PERSON_SCHEMA},
        vol.Optional("groups", default=dict): {cv.slug: [cv.slug]},
        vol.Optional("digest_at", default="07:00"): clock,
        vol.Optional("dedup_seconds", default=300): vol.All(
            vol.Coerce(int), vol.Range(min=0, max=86400)
        ),
    }
)


def validate(value):
    result = SCHEMA(value)
    people, groups = result["people"], result["groups"]
    if people.keys() & groups.keys() or any(
        p not in people for group in groups.values() for p in group
    ):
        raise vol.Invalid("Groups must contain known people and use distinct names")
    return result
