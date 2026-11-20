"""Family profiles and Wi-Fi-only presence. Refs #123."""

from __future__ import annotations

from typing import Any

from homeassistant.core import HomeAssistant
from homeassistant.helpers import entity_registry as er

from ..roles import entry_roles
from . import model


def unifi_trackers(hass: HomeAssistant) -> dict[str, str]:
    registry = er.async_get(hass)
    return {
        entry.entity_id: model._name(state)
        if (state := hass.states.get(entry.entity_id))
        else (entry.name or entry.original_name or entry.entity_id)
        for entry in registry.entities.values()
        if entry.domain == "device_tracker" and entry.platform == "unifi" and not entry.disabled
    }


def members(hass: HomeAssistant, states, opts) -> list[dict[str, Any]]:
    people = model.discover_members(states, opts)
    roles = entry_roles(hass)
    trackers = unifi_trackers(hass)
    for member in people:
        person = hass.states.get(member["person"]) if member["person"] else None
        attrs = person.attributes if person else {}
        user_id = member["user_id"] or attrs.get("user_id")
        member["user_id"] = user_id
        if user_id and member["role"] == "child":
            member["kid_uuid"] = str(user_id)
        if not member["configured"] and roles.get(user_id) == "adult":
            member["role"] = "adult"
        tracker = member["tracker"]
        if not member["configured"]:
            linked = [eid for eid in attrs.get("device_trackers", []) if eid in trackers]
            tracker = linked[0] if len(linked) == 1 else None
        member["tracker"] = tracker if tracker in trackers else None
        state = hass.states.get(tracker) if member["tracker"] else None
        member["presence"] = (
            {"kind": "home" if state.state == "home" else "away"}
            if state and state.state in ("home", "not_home")
            else None
        )
    return people
