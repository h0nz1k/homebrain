"""Maso v troubě: pure mapping of HA core ``meater`` sensors to the Dnes cooking payload.

The MEATER cloud integration creates one device per probe and these sensors per probe
(``unique_id = f"{device_id}-{key}"``, ``translation_key = key``):

* ``internal`` / ``ambient`` – tip and oven temperature,
* ``cook_name`` / ``cook_state`` / ``cook_target_temp`` / ``cook_peak_temp`` – only
  available while a cook is configured (``unavailable_when_not_cooking``),
* ``cook_time_remaining`` / ``cook_time_elapsed`` – TIMESTAMP sensors (now ± seconds);
  remaining is ``unknown`` while the app is still estimating.

Entity ids are never relied upon: the entities only appear during the first cook and the
owner may rename them. Keys come from ``translation_key`` (fallback: ``unique_id`` suffix).
"""

from __future__ import annotations

from collections.abc import Mapping
from datetime import datetime
from typing import Any, Final

from homeassistant.util import dt as dt_util

PLATFORM: Final = "meater"

TEMP_KEYS: Final = ("internal", "ambient", "cook_target_temp", "cook_peak_temp")
COOK_KEYS: Final = (
    "cook_name",
    "cook_state",
    "cook_target_temp",
    "cook_peak_temp",
    "cook_time_remaining",
    "cook_time_elapsed",
)
KEYS: Final = ("internal", "ambient", *COOK_KEYS)
# Longest first so a suffix never matches a shorter key by accident.
_SUFFIX_KEYS: Final = tuple(sorted(KEYS, key=len, reverse=True))

NO_VALUE: Final = frozenset({"unavailable", "unknown", "none", ""})

# HA enum options (sensor.py COOK_STATES) and the raw cloud strings → HomeBrain states.
STATE_MAP: Final = {
    "not_started": "ready",
    "configured": "ready",
    "started": "cooking",
    "ready_for_resting": "remove",
    "resting": "resting",
    "slightly_underdone": "underdone",
    "finished": "done",
    "slightly_overdone": "overdone",
    "overcooked": "overcooked",
    "overcook!": "overcooked",
}
# States where the meat already reached the target (progress shows full).
FINISHED_STATES: Final = frozenset({"remove", "resting", "done", "overdone", "overcooked"})

Reading = tuple[str | None, str | None]  # (state, unit_of_measurement)


def entity_key(unique_id: str | None, translation_key: str | None) -> str | None:
    """Which MEATER sensor this registry entry is (``None`` = not one we use)."""
    if translation_key in KEYS:
        return translation_key
    if unique_id:
        for key in _SUFFIX_KEYS:
            if unique_id.endswith(f"-{key}"):
                return key
    return None


def probe_group(unique_id: str | None, device_id: str | None, key: str) -> str | None:
    """Group key per probe: the probe serial (unique_id prefix), else the HA device id."""
    if unique_id and unique_id.endswith(f"-{key}"):
        return unique_id[: -len(key) - 1]
    return device_id


def normalize_state(raw: str | None) -> str | None:
    """``None`` = no cook on this probe; unmapped values while cooking → ``unknown``."""
    if raw is None or raw == "unavailable" or not str(raw).strip():
        return None
    value = str(raw).strip().lower().replace(" ", "_")
    return STATE_MAP.get(value, "unknown")


def _available(reading: Reading | None) -> bool:
    return reading is not None and reading[0] not in (None, "unavailable")


def _value(reading: Reading | None) -> str | None:
    if reading is None or reading[0] is None or str(reading[0]).strip().lower() in NO_VALUE:
        return None
    return str(reading[0])


def _temp(reading: Reading | None) -> float | None:
    raw = _value(reading)
    if raw is None:
        return None
    try:
        value = float(raw)
    except ValueError:
        return None
    if reading and reading[1] in ("°F", "F"):
        value = (value - 32) * 5 / 9
    return round(value, 1)


def _seconds(reading: Reading | None, now: datetime, sign: int) -> int | None:
    raw = _value(reading)
    stamp = dt_util.parse_datetime(raw) if raw else None
    if stamp is None:
        return None
    return max(0, round(sign * (stamp - now).total_seconds()))


def build_probe(
    index: int, readings: Mapping[str, Reading], now: datetime
) -> dict[str, Any] | None:
    """One active probe for the card, or ``None`` when no cook runs on it."""
    if not any(_available(readings.get(key)) for key in COOK_KEYS):
        return None
    state = normalize_state(readings.get("cook_state", (None, None))[0])
    if state is None:
        # cook_state itself unavailable while other cook sensors answer: still a cook.
        state = "unknown"
    internal = _temp(readings.get("internal"))
    target = _temp(readings.get("cook_target_temp"))
    progress: float | None = None
    if state in FINISHED_STATES:
        progress = 1.0
    elif internal is not None and target:
        progress = round(max(0.0, min(1.0, internal / target)), 3)
    return {
        "id": f"probe{index}",
        "name": _value(readings.get("cook_name")) or f"Sonda {index}",
        "internal": internal,
        "ambient": _temp(readings.get("ambient")),
        "target": target,
        "peak": _temp(readings.get("cook_peak_temp")),
        "remaining_s": _seconds(readings.get("cook_time_remaining"), now, 1),
        "elapsed_s": _seconds(readings.get("cook_time_elapsed"), now, -1),
        "state": state,
        "progress": progress,
    }


def build_snapshot(
    probes: list[Mapping[str, Reading]], now: datetime
) -> dict[str, list[dict[str, Any]]]:
    """Active probes in stable probe order (``Sonda N`` = position among ALL probes)."""
    rows = (build_probe(n, readings, now) for n, readings in enumerate(probes, start=1))
    return {"probes": [row for row in rows if row is not None]}
