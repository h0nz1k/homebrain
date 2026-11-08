"""Pure mapping of HA ``person.*`` states to the „Kdo je doma“ indicator.

Privacy by construction: the output carries only an id, a display name, an avatar colour
token and ``home``/``away``/``unknown``. Zone names, GPS, trackers and every other attribute
are dropped here, before anything reaches a WebSocket client.
"""

from __future__ import annotations

from collections.abc import Iterable, Mapping
from typing import Any, Final

from homeassistant.core import HomeAssistant

from ..const import DOMAIN

CONF_PEOPLE: Final = "people"
STATUS_HOME: Final = "home"
STATUS_AWAY: Final = "away"
STATUS_UNKNOWN: Final = "unknown"
# Avatar colour tokens (frontend maps them to theme colours). No green/red: those are the
# status colours.
COLORS: Final = ("blue", "teal", "purple", "pink", "amber", "orange", "indigo", "slate")
AUTO: Final = "auto"
_UNKNOWN_STATES: Final = frozenset({"unknown", "unavailable", ""})

PersonState = tuple[str, str | None, str | None]  # entity_id, state, friendly name


def presence_status(state: str | None) -> str:
    """``home`` → home, ``unknown``/``unavailable``/empty → unknown, anything else → away."""
    if state is None or state in _UNKNOWN_STATES:
        return STATUS_UNKNOWN
    return STATUS_HOME if state == "home" else STATUS_AWAY


def _name(entity_id: str, friendly: str | None) -> str:
    return (friendly or "").strip() or entity_id.split(".", 1)[-1].replace("_", " ").title()


def build_people(persons: Iterable[PersonState], config: Mapping[str, Any] | None) -> list[dict]:
    """Rows for the indicator; ``config`` = ``options['people']`` (missing = all, by name)."""
    config = config if isinstance(config, Mapping) else {}
    if config.get("display") is False:
        return []
    states = {eid: (state, _name(eid, friendly)) for eid, state, friendly in persons}
    chosen = [p for p in config.get("persons") or [] if isinstance(p, Mapping)]
    if chosen:
        rows = [
            (p["entity_id"], p.get("name"), p.get("color"))
            for p in chosen
            if p.get("entity_id") in states
        ]
    else:
        rows = [
            (eid, None, None) for eid in sorted(states, key=lambda e: (states[e][1].casefold(), e))
        ]
    people: list[dict] = []
    for index, (eid, name, color) in enumerate(rows):
        state, default_name = states[eid]
        people.append(
            {
                "id": eid,
                "name": (name or "").strip() or default_name,
                "color": color if color in COLORS else COLORS[index % len(COLORS)],
                "status": presence_status(state),
            }
        )
    return people


def people_config(hass: HomeAssistant) -> Mapping[str, Any] | None:
    entries = hass.config_entries.async_entries(DOMAIN)
    return entries[0].options.get(CONF_PEOPLE) if entries else None


def people_snapshot(hass: HomeAssistant) -> list[dict]:
    """Current indicator rows from the state machine (only state + friendly name are read)."""
    persons = [
        (s.entity_id, s.state, s.attributes.get("friendly_name"))
        for s in hass.states.async_all("person")
    ]
    return build_people(persons, people_config(hass))
