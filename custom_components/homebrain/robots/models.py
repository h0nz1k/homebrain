"""Roborock model ids (public HA device models) → capabilities used by presets/start."""

from __future__ import annotations

from typing import Final

from homeassistant.core import HomeAssistant

from .discovery import vacuum_device_model

# Home Assistant `device_registry` model strings (not tied to owner nicknames).
MODEL_A27: Final = "roborock.vacuum.a27"
MODEL_A187: Final = "roborock.vacuum.a187"
MODEL_A144: Final = "roborock.vacuum.a144"

MAX_PASSES_ABSOLUTE: Final = 3
MAX_PASSES_DEFAULT: Final = 2
MAX_PASSES_BY_MODEL: Final[dict[str, int]] = {
    MODEL_A27: 3,
    MODEL_A187: 2,
    MODEL_A144: 2,
}

DEEP_ROUTES: Final = frozenset({"deep", "deep_plus"})


def max_passes_for_model(model: str | None) -> int:
    """Passes per room (`repeat`); unknown models use the conservative default (2)."""
    if model and model in MAX_PASSES_BY_MODEL:
        return MAX_PASSES_BY_MODEL[model]
    return MAX_PASSES_DEFAULT


def model_for_vacuum(hass: HomeAssistant, vacuum: str | None) -> str | None:
    return vacuum_device_model(hass, vacuum) if vacuum else None