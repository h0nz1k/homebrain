"""Data model of the anomaly-watch spike (#128). Pure Python, no Home Assistant imports.

Everything here mirrors what the integration would read from the recorder / state machine:
``Sample`` = one recorded state row (``last_reported`` for the live stream), ``Downtime`` = a
window where HA or the recorder was not running (``homeassistant_stop`` → ``homeassistant_start``
or a hole in the states table). Thresholds live in ``Config`` so the owner can tune them.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta
from enum import IntEnum
from typing import Literal

UNAVAILABLE = frozenset({"unavailable", "unknown"})
ON_STATES = frozenset({"on", "open"})


class Tier(IntEnum):
    """Observation → suspicion → confirmed. Only CONFIRMED may reach the phone."""

    OBSERVATION = 1
    SUSPICION = 2
    CONFIRMED = 3


Kind = Literal["numeric", "binary"]
Detector = Literal["baseline", "silent", "unavailable", "flapping", "dwell"]


@dataclass(frozen=True)
class EntityMeta:
    """Registry facts used for grouping and thresholds (entity + device registry)."""

    entity_id: str
    name: str
    device_id: str
    device_name: str
    kind: Kind
    device_class: str | None = None
    integration: str = "demo"
    removed: bool = False

    @property
    def domain(self) -> str:
        return self.entity_id.split(".", 1)[0]


@dataclass(frozen=True)
class Sample:
    entity_id: str
    ts: datetime  # timezone-aware
    state: str

    @property
    def value(self) -> float | None:
        try:
            return float(self.state)
        except ValueError:
            return None


@dataclass(frozen=True)
class Downtime:
    """HA stopped / recorder gap: nothing can be known about this window."""

    start: datetime
    end: datetime


# Floors for the numeric spread (absolute units per device_class). Adapted from Vatra (MIT).
MIN_SPREAD: dict[str, float] = {
    "temperature": 1.5,
    "humidity": 6.0,
    "power": 30.0,
    "illuminance": 50.0,
    "co2": 150.0,
    "pressure": 5.0,
    "voltage": 8.0,
    "current": 1.0,
    "battery": 10.0,
}
# Minimum "unusually long" durations per class/domain. Adapted from Vatra (MIT).
MIN_DWELL: dict[str, timedelta] = {
    "door": timedelta(minutes=15),
    "garage_door": timedelta(minutes=15),
    "opening": timedelta(minutes=30),
    "window": timedelta(hours=6),
    "light": timedelta(hours=5),
    "switch": timedelta(hours=8),
}
# Numeric classes whose level follows what the people at home do (not device health).
BEHAVIOUR_CLASSES = frozenset({"power", "current", "energy", "illuminance", "co2"})


@dataclass(frozen=True)
class Config:
    timezone: str = "Europe/Prague"
    learn_days: int = 21
    # warm-up: a detector is silent for an entity until it has seen this much history
    warmup_days: int = 7
    baseline_min_samples: int = 15  # pooled (hour-1, hour, hour+1) day-means
    dwell_min_episodes: int = 5
    periodic_min_updates: int = 48
    periodic_min_coverage: float = 0.85  # share of hours with at least one update
    # baseline
    z_observe: float = 4.0
    z_observe_behaviour: float = 6.0  # kettles and parties are not faults
    z_confirm: float = 6.0
    envelope_spreads: float = 3.0  # confirmed only outside min/max ever seen ± 3 spreads
    # silent: multiples of the entity's own p95 update interval, with absolute floors
    silent_factors: tuple[float, float, float] = (3.0, 6.0, 12.0)
    silent_floors: tuple[timedelta, timedelta, timedelta] = (
        timedelta(minutes=30),
        timedelta(hours=2),
        timedelta(hours=6),
    )
    # unavailable: multiples of the entity's own p95 outage, with absolute floors
    outage_factors: tuple[float, float, float] = (2.0, 4.0, 8.0)
    outage_floors: tuple[timedelta, timedelta, timedelta] = (
        timedelta(minutes=30),
        timedelta(hours=2),
        timedelta(hours=6),
    )
    # flapping
    flap_window: timedelta = timedelta(minutes=15)
    flap_min: int = 10
    flap_factor: float = 2.0
    # dwell: multiples of max(3 × p95, MIN_DWELL)
    dwell_factors: tuple[float, float, float] = (1.0, 2.0, 4.0)
    # persistence for time-based escalation (baseline, flapping)
    persist_suspicion: timedelta = timedelta(minutes=30)
    persist_confirmed: timedelta = timedelta(hours=2)
    clear_after: timedelta = timedelta(minutes=15)
    # restart safety
    restart_grace: timedelta = timedelta(minutes=15)
    mass_outage_share: float = 0.5
    # grouping
    integration_min_devices: int = 3
    # notifications
    notify_cooldown: timedelta = timedelta(hours=24)
    quiet_hours: tuple[int, int] | None = (22, 7)


@dataclass
class Finding:
    """One detector firing on one entity, tracked across evaluations."""

    detector: Detector
    entity_id: str
    device_id: str
    tier: Tier
    since: datetime
    last_true: datetime
    detail: dict[str, float | str] = field(default_factory=dict)

    @property
    def key(self) -> str:
        return f"{self.detector}:{self.entity_id}"


@dataclass
class Report:
    """What the UI and notifications see: findings grouped by device (or integration)."""

    key: str  # "device:<id>" | "integration:<name>" | "system"
    title: str
    tier: Tier
    since: datetime
    entities: list[str]
    findings: list[Finding]
    scope: Literal["device", "integration", "system"] = "device"


@dataclass(frozen=True)
class Notification:
    report_key: str
    title: str
    at: datetime
    deferred_from: datetime | None = None
