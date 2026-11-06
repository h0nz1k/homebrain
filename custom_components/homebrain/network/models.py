"""UniFi model table: device kind, PoE budget, fastest port and memory threshold.

HA's UniFi integration exposes the model code (``device.model``) but not the PoE budget or
port capabilities, so V1 keeps a small table. Unknown models fall back to sensors present.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Final


@dataclass(frozen=True)
class Model:
    kind: str  # "ap" | "switch"
    label: str
    poe_budget_w: float | None = None
    max_link_mbps: int = 1000
    # Memory % above which the device is reported (U7/USW run at 75-82 % normally).
    mem_threshold: float = 92.0


MODELS: Final[dict[str, Model]] = {
    # Access points
    "UAP6MP": Model("ap", "U6 Pro", mem_threshold=85.0),
    "UAL6": Model("ap", "U6 Lite", mem_threshold=85.0),
    "U6PLUS": Model("ap", "U6+", mem_threshold=85.0),
    "UALR6v2": Model("ap", "U6 LR", mem_threshold=85.0),
    "U7LR": Model("ap", "AC LR", mem_threshold=85.0),
    "U7PRO": Model("ap", "U7 Pro", max_link_mbps=2500),
    "U7PIW": Model("ap", "U7 Pro Wall", max_link_mbps=2500),
    "UAPA6A5": Model("ap", "U7 In-Wall", max_link_mbps=2500),
    "UKPW": Model("ap", "U7 Outdoor", max_link_mbps=2500),
    # Switches
    "USL16LP": Model("switch", "USW Lite 16 PoE", poe_budget_w=45.0),
    "USL8LP": Model("switch", "USW Lite 8 PoE", poe_budget_w=52.0),
    "USM8P": Model("switch", "USW Ultra", poe_budget_w=42.0),
    "USWED35": Model("switch", "USW Flex 2.5G 5", max_link_mbps=2500),
    "USF5P": Model("switch", "USW Flex Mini"),
    "US24P250": Model("switch", "USW 24 PoE", poe_budget_w=250.0),
}

DEFAULT_MEM_THRESHOLD: Final = 90.0


def model_info(code: str | None) -> Model | None:
    return MODELS.get(code or "")
