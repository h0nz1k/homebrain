"""Robot slots: logical binding keys and per-slot display settings (name, floor, image)."""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any, Final
from urllib.parse import urlparse

ROBOT_SLOTS: Final = (1, 2, 3)
# Options key holding per-slot display settings (never stored in Git).
CONF_ROBOTS: Final = "robots"
DEFAULT_FLOORS: Final = {1: "Přízemí", 2: "1. patro", 3: "2. patro"}

# Logical key suffix -> accepted entity domain(s). Entity ids are bound in HA, never in Git.
ROBOT_KEY_DOMAINS: Final[dict[str, str | tuple[str, ...]]] = {
    "vacuum": "vacuum",
    "status": "sensor",
    "error": "sensor",
    "dock_error": "sensor",
    "battery": "sensor",
    "current_room": "sensor",
    "cleaning_progress": "sensor",
    "main_brush": "sensor",
    "side_brush": "sensor",
    "filter": "sensor",
    "sensors": "sensor",
    "dock_strainer": "sensor",
    "dock_brush": "sensor",
    "clean_water": "binary_sensor",
    "dirty_water": "binary_sensor",
    "cleaning_fluid": "binary_sensor",
    "water_shortage": "binary_sensor",
    "cleaning_mode": "select",
    # Roborock mop water level (key water_box_mode) and mop route (standard/deep/deep_plus).
    "mop_intensity": "select",
    "mop_mode": "select",
    "selected_map": "select",
    "map_image": "image",
}
MAX_TEXT: Final = 40
MAX_IMAGE: Final = 300


def slot_keys(slot: int) -> tuple[str, ...]:
    """Binding keys of one robot slot, e.g. ``robot1_vacuum``."""
    return tuple(f"robot{slot}_{suffix}" for suffix in ROBOT_KEY_DOMAINS)


ROBOT_BINDING_KEYS: Final = tuple(key for slot in ROBOT_SLOTS for key in slot_keys(slot))
ROBOT_BINDING_DOMAINS: Final = {
    f"robot{slot}_{suffix}": domain
    for slot in ROBOT_SLOTS
    for suffix, domain in ROBOT_KEY_DOMAINS.items()
    if domain != "sensor"
}


def valid_image(value: str) -> bool:
    """User robot picture: an HA-served path (``/local/…``, ``/media/…``) or an https URL."""
    if not value or len(value) > MAX_IMAGE or any(c in value for c in "\"'<> \\"):
        return False
    if value.startswith(("/local/", "/media/", "/api/image/serve/")):
        return ".." not in value
    parsed = urlparse(value)
    return parsed.scheme == "https" and bool(parsed.netloc)


def clean_text(value: Any, default: str = "") -> str:
    """Trimmed single-line text, at most MAX_TEXT characters."""
    if not isinstance(value, str):
        return default
    text = " ".join(value.split())[:MAX_TEXT]
    return text or default


def slot_settings(options: Mapping[str, Any], slot: int) -> dict[str, str]:
    """Validated display settings of a slot (missing values fall back to defaults)."""
    raw = options.get(CONF_ROBOTS)
    values = raw.get(str(slot)) if isinstance(raw, Mapping) else None
    values = values if isinstance(values, Mapping) else {}
    image = values.get("image")
    return {
        "name": clean_text(values.get("name"), f"Robot {slot}"),
        "floor": clean_text(values.get("floor"), DEFAULT_FLOORS[slot]),
        "image": image if isinstance(image, str) and valid_image(image) else "",
    }
