"""Bounded settings and Music Assistant response projection; no private MA client."""

from __future__ import annotations

from typing import Any
from urllib.parse import urlsplit

import voluptuous as vol

TEXT = vol.All(str, vol.Strip, vol.Length(min=1, max=120))


def entity(domain):
    return vol.Any(None, vol.All(str, vol.Length(max=255), vol.Match(rf"^{domain}\.[a-z0-9_]+$")))


def app_url(value: str) -> str:
    if len(value) > 1024 or not value.startswith(("https://", "vnd.youtube://", "meater://")):
        raise vol.Invalid("Unsupported application URL")
    parsed = urlsplit(value)
    if parsed.username or parsed.password or any(c in value for c in "\r\n"):
        raise vol.Invalid("Invalid application URL")
    return value


def image_url(value: str | None) -> str | None:
    if not value:
        return None
    if len(value) <= 2048 and (
        value.startswith(("http://", "https://"))
        or (value.startswith("/") and not value.startswith("//"))
    ):
        return value
    return None


MEDIA = vol.Schema(
    {
        vol.Required("uri"): vol.All(
            str, vol.Length(min=1, max=1024), vol.Match(r"^[a-zA-Z0-9_+-]+://[^\s]+$")
        ),
        vol.Required("name"): TEXT,
        vol.Optional("image", default=None): vol.Any(None, vol.All(str, vol.Length(max=2048))),
        vol.Optional("providers", default=list): vol.All(
            [vol.All(str, vol.Length(max=120))], vol.Length(max=20)
        ),
    }
)
PERSON = vol.Schema(
    {
        vol.Required("name"): vol.All(str, vol.Strip, vol.Length(min=1, max=40)),
        vol.Required("person_entity"): entity("person"),
        vol.Required("provider"): vol.All(str, vol.Length(max=120)),
        vol.Required("playlists"): vol.All([MEDIA], vol.Length(max=5)),
        vol.Required("youtube_url"): app_url,
    }
)
SETTINGS = vol.Schema(
    {
        vol.Required("player"): entity("media_player"),
        vol.Required("radios"): vol.All([MEDIA], vol.Length(max=5)),
        vol.Required("more_radios"): vol.All([MEDIA], vol.Length(max=10)),
        vol.Required("persons"): vol.All([PERSON], vol.Length(min=1, max=6)),
        vol.Required("battery_sensor"): entity("sensor"),
        vol.Required("battery_state_sensor"): entity("sensor"),
        vol.Required("meater_url"): app_url,
        vol.Required("rest_minutes"): vol.All(int, vol.Range(min=1, max=120)),
    }
)


def defaults(persons: list[str] | None = None) -> dict[str, Any]:
    persons = persons or []
    return {
        "player": None,
        "radios": [],
        "more_radios": [],
        "persons": [
            {
                "name": name,
                "person_entity": persons[i] if i < len(persons) else None,
                "provider": "",
                "playlists": [],
                "youtube_url": "vnd.youtube://",
            }
            for i, name in enumerate(("Táta", "Máma"))
        ],
        "battery_sensor": None,
        "battery_state_sensor": None,
        "meater_url": "meater://",
        "rest_minutes": 10,
    }


def media_item(raw: Any) -> dict[str, Any] | None:
    if not isinstance(raw, dict) or not raw.get("uri") or not raw.get("name"):
        return None
    images = (raw.get("metadata") or {}).get("images") or []
    image = image_url(raw.get("image")) or next(
        (
            image_url(i.get("path"))
            for i in images
            if isinstance(i, dict) and image_url(i.get("path"))
        ),
        None,
    )
    mappings = raw.get("provider_mappings") or []
    providers = sorted(
        {
            str(m.get("provider_instance"))
            for m in mappings
            if isinstance(m, dict) and m.get("provider_instance")
        }
    )
    uri_provider = str(raw["uri"]).split("://", 1)[0]
    if uri_provider != "library":
        providers = sorted(set([*providers, uri_provider]))
    if raw.get("provider") and raw["provider"] != "library":
        providers = sorted(set([*providers, str(raw["provider"])]))
    try:
        return MEDIA(
            {"uri": raw["uri"], "name": raw["name"], "image": image, "providers": providers[:20]}
        )
    except vol.Invalid:
        return None
