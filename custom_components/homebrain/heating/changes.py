"""Settings change log – detect mapped writable keys, persist last 200 entries."""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

from .keys import KEYS, spec_of

MAX_CHANGES = 200
IMMEDIATE_NOTIFY_KEYS = frozenset(
    {"mode.main_switch", "mode.heating_enabled", "extras.solar_enabled"}
)

# Keys whose value changes are logged (sensors/outputs excluded).
CHANGE_LOG_KEYS: frozenset[str] = frozenset(
    k
    for k in KEYS
    if (k.startswith("mode.") and k not in ("mode.cooling",))
    or k
    in (
        "mode.winter_limit",
        "house.ref_target",
        "house.hysteresis",
        "house.setback_drop",
        "house.setback_drop_alt",
        "dhw.target",
        "dhw.hysteresis",
        "tank.hysteresis",
        "extras.solar_enabled",
        "extras.fish_target",
        "extras.fish_hysteresis",
        "extras.fish_heating_on",
    )
    or k.startswith("curve.")
)


def _fmt(value: Any, key: str) -> str:
    spec = spec_of(key)
    if isinstance(value, bool):
        return "zapnuto" if value else "vypnuto"
    if value is None:
        return "—"
    if spec and spec.unit == "°C":
        return f"{float(value):g} °C"
    if isinstance(value, int | float):
        return f"{float(value):g}"
    return str(value)


@dataclass
class ChangeEntry:
    ts: str
    key: str
    label: str
    old: Any
    new: Any
    late: bool

    def as_dict(self) -> dict[str, Any]:
        return {
            "ts": self.ts,
            "key": self.key,
            "label": self.label,
            "old": self.old,
            "new": self.new,
            "late": self.late,
        }

    @classmethod
    def from_dict(cls, raw: Any) -> ChangeEntry | None:
        if not isinstance(raw, dict):
            return None
        key = raw.get("key")
        ts = raw.get("ts")
        if not isinstance(key, str) or not isinstance(ts, str):
            return None
        spec = spec_of(key)
        return cls(
            ts=ts,
            key=key,
            label=str(raw.get("label") or (spec.label if spec else key)),
            old=raw.get("old"),
            new=raw.get("new"),
            late=bool(raw.get("late")),
        )


@dataclass
class ChangeLog:
    entries: list[ChangeEntry] = field(default_factory=list)
    last_values: dict[str, Any] = field(default_factory=dict)
    baselined: bool = False

    def as_dict(self) -> dict[str, Any]:
        return {
            "entries": [e.as_dict() for e in self.entries[-MAX_CHANGES:]],
            "last_values": dict(self.last_values),
            "baselined": self.baselined,
        }

    @classmethod
    def from_dict(cls, raw: Any) -> ChangeLog:
        if not isinstance(raw, dict):
            return cls()
        entries = [e for e in (ChangeEntry.from_dict(x) for x in raw.get("entries") or []) if e]
        last = raw.get("last_values")
        return cls(
            entries=entries[-MAX_CHANGES:],
            last_values={str(k): v for k, v in last.items()} if isinstance(last, dict) else {},
            baselined=bool(raw.get("baselined")),
        )

    def detect(
        self,
        now: datetime,
        values: dict[str, Any],
        mapped: set[str],
        schedules: list[dict[str, Any]],
        *,
        late: bool,
    ) -> list[ChangeEntry]:
        """Compare current values to persisted baseline; first run only seeds baseline."""
        ts = now.isoformat()
        current: dict[str, Any] = {}
        for key in CHANGE_LOG_KEYS:
            if key not in mapped:
                continue
            current[key] = values.get(key)
        for sched in schedules:
            sk = f"schedule:{sched.get('key')}"
            if sched.get("slots") is not None:
                current[sk] = sched.get("slots")

        if not self.baselined:
            self.last_values = current
            self.baselined = True
            return []

        new_entries: list[ChangeEntry] = []
        for key, new_val in current.items():
            old_val = self.last_values.get(key)
            if _same(old_val, new_val):
                continue
            label = (
                spec_of(key).label
                if key in KEYS and spec_of(key)
                else next(
                    (s.get("label", key) for s in schedules if f"schedule:{s.get('key')}" == key),
                    key,
                )
            )
            new_entries.append(
                ChangeEntry(
                    ts=ts,
                    key=key,
                    label=str(label),
                    old=old_val,
                    new=new_val,
                    late=late,
                )
            )
        self.last_values = current
        if new_entries:
            self.entries = (new_entries + self.entries)[:MAX_CHANGES]
        return new_entries


def _same(a: Any, b: Any) -> bool:
    if a is None and b is None:
        return True
    return json.dumps(a, sort_keys=True, default=str) == json.dumps(b, sort_keys=True, default=str)


def format_change_line(entry: ChangeEntry) -> str:
    old = _fmt(entry.old, entry.key)
    new = _fmt(entry.new, entry.key)
    return f"{entry.label}: {old} → {new}"
