"""Pure Topení model: raw PLC values → ``homebrain/heating/get`` payload.

No Home Assistant imports here; everything is unit-tested with synthetic values.
"""

from __future__ import annotations

import statistics
from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta
from typing import Any

from .client import parse_name, parse_value
from .keys import KEYS
from .mapfile import HeatingMap, VarSpec

MAX_GAP = timedelta(minutes=20)  # longer gaps (HA down, PLC offline) are not credited
DEGREE_DAY_BASE = 20.0


def _index(page: dict[str, str]) -> dict[str, str]:
    """address (``R6509.3``) → first full name on the page carrying it."""
    out: dict[str, str] = {}
    for name in page:
        if (ref := parse_name(name)) is not None:
            out.setdefault(ref.address, name)
    return out


def _value(spec: VarSpec, pages: dict[int, dict[str, str]], idx: dict[int, dict[str, str]]) -> Any:
    page = pages.get(spec.page)
    if page is None:
        return None
    name = (
        spec.var
        if spec.var.startswith("__")
        else idx.setdefault(spec.page, _index(page)).get(spec.var)
    )
    if name is None or name not in page or (ref := parse_name(name)) is None:
        return None
    value = parse_value(ref.type, page[name])
    if isinstance(value, bool):
        return (not value) if spec.invert else value
    if isinstance(value, int | float) and spec.scale is not None:
        return value * spec.scale
    return value


@dataclass
class Resolved:
    values: dict[str, Any] = field(default_factory=dict)
    mapped: set[str] = field(default_factory=set)
    faults: list[tuple[str, str, bool | None]] = field(default_factory=list)
    schedules: list[dict[str, Any]] = field(default_factory=list)

    def active_faults(self) -> set[str]:
        return {key for key, _label, active in self.faults if active}


def resolve(
    hmap: HeatingMap, pages: dict[int, dict[str, str]], weekday: int | None = None
) -> Resolved:
    """Map raw page values to contract keys (``weekday`` 1 = Monday picks schedule days)."""
    idx: dict[int, dict[str, str]] = {}
    res = Resolved(mapped=set(hmap.keys))
    for key, spec in hmap.keys.items():
        res.values[key] = _value(spec, pages, idx)
    for fault in hmap.faults:
        active = _value(fault.var, pages, idx)
        res.faults.append((fault.key, fault.label, active if isinstance(active, bool) else None))
    for sched in hmap.schedules:
        pairs = sched.days.get(weekday or 0) or sched.slots
        slots = []
        for on_var, off_var in pairs:
            on = _value(VarSpec(sched.page, on_var), pages, idx)
            off = _value(VarSpec(sched.page, off_var), pages, idx)
            if isinstance(on, str) and isinstance(off, str) and on != off:
                slots.append([on, off])
        res.schedules.append({"key": sched.key, "label": sched.label, "slots": slots})
    return res


def derive_activity(values: dict[str, Any], *, any_fault: bool) -> str:
    """One word for "what is the heat pump doing" (contract ``activity``)."""
    if any_fault or values.get("faults.fatal") or values.get("faults.compressor_block"):
        return "fault"
    if values.get("heat_pump.compressor_on"):
        if values.get("dhw.valve_to_dhw"):
            return "heating_dhw"
        if values.get("mode.cooling"):
            return "cooling"
        return "heating_tank"
    if values.get("mode.cooling"):
        return "cooling"
    if values.get("mode.hdo_low_tariff") is False:
        return "blocked_hdo"
    if values.get("house.circuit_on") or values.get("pumps.heating"):
        return "house_circuit"
    return "idle"


def _iso(value: datetime | None) -> str | None:
    return value.isoformat() if value else None


def _dt(value: Any) -> datetime | None:
    if not isinstance(value, str):
        return None
    try:
        return datetime.fromisoformat(value)
    except ValueError:
        return None


def _num(value: Any) -> float | None:
    return float(value) if isinstance(value, int | float) and not isinstance(value, bool) else None


@dataclass
class DayCounters:
    """Today's compressor runtime/starts (from on/off samples), outdoor min/max, energy.

    Persisted (``as_dict``) so an HA restart neither resets the day nor counts a new start.
    """

    day: str | None = None
    runtime_s: float = 0.0
    starts: int = 0
    running_since: datetime | None = None
    last: datetime | None = None
    last_on: bool | None = None
    outdoor_min: float | None = None
    outdoor_max: float | None = None
    energy_base: float | None = None
    energy_last: float | None = None
    fault_since: dict[str, str] = field(default_factory=dict)

    @property
    def runtime_h(self) -> float:
        return self.runtime_s / 3600

    @property
    def energy_today(self) -> float | None:
        if self.energy_base is None or self.energy_last is None:
            return None
        return max(0.0, self.energy_last - self.energy_base)

    def _roll(self, day: str) -> None:
        self.day = day
        self.runtime_s = 0.0
        self.starts = 0
        self.outdoor_min = self.outdoor_max = None
        self.energy_base = self.energy_last  # yesterday's last reading = today's zero

    def update(
        self,
        now: datetime,
        on: bool | None,
        *,
        outdoor: float | None = None,
        energy_total: float | None = None,
        faults: set[str] | None = None,
    ) -> None:
        day = now.date().isoformat()
        gap = (now - self.last) if self.last is not None else None
        credit = bool(self.last_on) and gap is not None and timedelta(0) < gap <= MAX_GAP
        if self.day != day:
            if credit and self.last is not None:
                midnight = datetime.combine(now.date(), time(0), tzinfo=now.tzinfo)
                self._roll(day)
                self.runtime_s += max(0.0, (now - max(midnight, self.last)).total_seconds())
            else:
                self._roll(day)
        elif credit and gap is not None:
            self.runtime_s += gap.total_seconds()
        if on is True:
            if self.last_on is False:
                self.starts += 1
                self.running_since = now
            elif self.running_since is None:
                self.running_since = now  # first sample ever: start time unknown
        elif on is False:
            self.running_since = None
        if outdoor is not None:
            self.outdoor_min = (
                outdoor if self.outdoor_min is None else min(self.outdoor_min, outdoor)
            )
            self.outdoor_max = (
                outdoor if self.outdoor_max is None else max(self.outdoor_max, outdoor)
            )
        if energy_total is not None:
            if self.energy_base is None or energy_total < self.energy_base:
                self.energy_base = energy_total  # first reading / meter reset
            self.energy_last = energy_total
        if faults is not None:
            self.fault_since = {
                key: self.fault_since.get(key) or now.isoformat() for key in sorted(faults)
            }
        self.last = now
        self.last_on = on

    def as_dict(self) -> dict[str, Any]:
        return {
            "day": self.day,
            "runtime_s": self.runtime_s,
            "starts": self.starts,
            "running_since": _iso(self.running_since),
            "last": _iso(self.last),
            "last_on": self.last_on,
            "outdoor_min": self.outdoor_min,
            "outdoor_max": self.outdoor_max,
            "energy_base": self.energy_base,
            "energy_last": self.energy_last,
            "fault_since": dict(self.fault_since),
        }

    @classmethod
    def from_dict(cls, raw: Any) -> DayCounters:
        if not isinstance(raw, dict):
            return cls()
        try:
            day = raw.get("day")
            starts = raw.get("starts", 0)
            if (day is not None and not isinstance(day, str)) or not isinstance(starts, int):
                return cls()
            last_on = raw.get("last_on")
            return cls(
                day=day,
                runtime_s=float(raw.get("runtime_s") or 0.0),
                starts=starts,
                running_since=_dt(raw.get("running_since")),
                last=_dt(raw.get("last")),
                last_on=last_on if isinstance(last_on, bool) else None,
                outdoor_min=_num(raw.get("outdoor_min")),
                outdoor_max=_num(raw.get("outdoor_max")),
                energy_base=_num(raw.get("energy_base")),
                energy_last=_num(raw.get("energy_last")),
                fault_since={str(k): str(v) for k, v in (raw.get("fault_since") or {}).items()},
            )
        except (TypeError, ValueError, AttributeError):
            return cls()


def _r(value: Any, digits: int = 1) -> Any:
    return round(value, digits) if isinstance(value, float) else value


def build_payload(
    res: Resolved,
    counters: DayCounters,
    *,
    source: str,
    updated_at: datetime | None,
    now: datetime,
    stale: bool,
    power_w: float | None = None,
    rooms: list[dict[str, Any]] | None = None,
    monitored: int | None = None,
) -> dict[str, Any]:
    """The full contract payload; every unmapped/unavailable value is ``None``."""
    v = res.values.get
    hours, minutes = v("heat_pump.motohours"), v("heat_pump.motominutes")
    motohours = hours + (minutes or 0) / 60 if isinstance(hours, int | float) else None
    dhw_target, dhw_hyst = v("dhw.target"), v("dhw.hysteresis")
    active = res.active_faults()
    curve = sorted(
        [v(f"curve.p{i}_outdoor"), v(f"curve.p{i}_water")]
        for i in range(1, 5)
        if v(f"curve.p{i}_outdoor") is not None and v(f"curve.p{i}_water") is not None
    )
    winter = v("mode.winter")

    def _field(key: str) -> Any:
        if key not in res.mapped:
            return None
        if KEYS.get(key) and KEYS[key].kind == "bool":
            return v(key)
        return _r(v(key), 2 if key.endswith("hysteresis") else 1)

    def extra_group(temp_key: str, **fields: str) -> dict[str, Any] | None:
        keys = (temp_key, *fields.values())
        if not any(k in res.mapped for k in keys):
            return None
        out: dict[str, Any] = {"temp": _field(temp_key)}
        for name, fkey in fields.items():
            out[name] = _field(fkey)
        return out

    return {
        "updated_at": _iso(updated_at),
        "stale": stale,
        "source": source,
        "activity": derive_activity(res.values, any_fault=bool(active)),
        "mode": {
            "season": None if winter is None else ("winter" if winter else "summer"),
            "auto_season": v("mode.auto_season"),
            "setback_active": v("mode.setback_active"),
            "main_switch": v("mode.main_switch"),
            "cooling": v("mode.cooling"),
            "hdo_low_tariff": v("mode.hdo_low_tariff"),
        },
        "house": {
            "ref_temp": _r(v("house.ref_temp")),
            "ref_target": _r(v("house.ref_target")),
            "ref_target_effective": _r(v("house.ref_target_effective")),
            "hysteresis": _r(v("house.hysteresis"), 2),
            "attic_temp": _r(v("house.attic_temp")),
            "circuit_on": v("house.circuit_on"),
            "mixing_valve_pct": (
                None if v("house.mixing_valve_pct") is None
                else round(v("house.mixing_valve_pct"))
            ),
            "supply_temp": _r(v("house.supply_temp")),
        },
        "heat_pump": {
            "compressor_on": v("heat_pump.compressor_on"),
            "running_since": _iso(counters.running_since) if v("heat_pump.compressor_on") else None,
            "power_w": None if power_w is None else round(power_w),
            "condenser_out": _r(v("heat_pump.condenser_out")),
            "return_temp": _r(v("heat_pump.return_temp")),
            "brine_in": _r(v("heat_pump.brine_in")),
            "brine_out": _r(v("heat_pump.brine_out")),
            "primary_prerun": v("heat_pump.primary_prerun"),
            "discharge_temp": _r(v("heat_pump.discharge_temp")),
            "discharge_bar": _r(v("heat_pump.discharge_bar")),
            "suction_temp": _r(v("heat_pump.suction_temp")),
            "suction_bar": _r(v("heat_pump.suction_bar")),
            "runtime_today_h": round(counters.runtime_h, 2),
            "starts_today": counters.starts,
            "energy_today_kwh": _r(counters.energy_today, 2),
            "motohours": _r(motohours),
        },
        "tank": {
            "top": _r(v("tank.top")),
            "bottom": _r(v("tank.bottom")),
            "target": _r(v("tank.target")),
            "hysteresis": _r(v("tank.hysteresis")),
            "curve_target": _r(v("tank.curve_target")),
        },
        "dhw": {
            "temp": _r(v("dhw.temp")),
            "target": _r(dhw_target),
            "reheat_below": _r(dhw_target - dhw_hyst)
            if isinstance(dhw_target, int | float) and isinstance(dhw_hyst, int | float)
            else None,
            "valve_to_dhw": v("dhw.valve_to_dhw"),
        },
        "outdoor": {
            "temp": _r(v("outdoor.temp")),
            "min_today": _r(counters.outdoor_min),
            "max_today": _r(counters.outdoor_max),
        },
        "pumps": {
            "heating": v("pumps.heating"),
            "secondary": v("pumps.secondary"),
            "circulation": v("pumps.circulation"),
        },
        "backup_heater": {
            "on": v("backup_heater.on"),
            "available": "backup_heater.on" in res.mapped,
        },
        "faults": {
            "active": [
                {"key": key, "label": label, "since": counters.fault_since.get(key)}
                for key, label, on in res.faults
                if on
            ],
            "fatal": bool(v("faults.fatal")),
            "compressor_block": bool(v("faults.compressor_block")),
            "monitored": len(res.faults) if monitored is None else monitored,
        },
        "curve": {"points": curve, "outdoor_now": _r(v("outdoor.temp"))},
        "schedules": res.schedules,
        "extras": {
            "solar": extra_group("extras.solar_temp", pump="extras.solar_pump"),
            "pool": extra_group(
                "extras.pool_temp",
                heating_pump="extras.pool_heating_pump",
                filter_pump="extras.pool_filter_pump",
            ),
            "fish": extra_group(
                "extras.fish_temp",
                target="extras.fish_target",
                hysteresis="extras.fish_hysteresis",
                heating_on="extras.fish_heating_on",
                valve_open="extras.fish_valve_open",
            ),
        },
        "rooms": rooms or [],
    }


def empty_payload(source: str, now: datetime) -> dict[str, Any]:
    """Skeleton with every value ``None`` (not configured / no data yet)."""
    payload = build_payload(
        Resolved(), DayCounters(), source=source, updated_at=None, now=now, stale=True
    )
    payload["heat_pump"]["runtime_today_h"] = None
    payload["heat_pump"]["starts_today"] = None
    return payload


_KIOSK = {
    "house": ("ref_temp", "ref_target_effective"),
    "heat_pump": ("compressor_on", "running_since"),
    "dhw": ("temp", "target", "reheat_below"),
    "outdoor": ("temp",),
    "faults": ("active", "fatal", "compressor_block"),
}


def kiosk_subset(payload: dict[str, Any]) -> dict[str, Any]:
    """What the Dnes wall tablet needs for its signals (no schedules, curve, rooms…)."""
    out = {k: payload.get(k) for k in ("updated_at", "stale", "source", "activity")}
    for section, fields in _KIOSK.items():
        data = payload.get(section) or {}
        out[section] = {f: data.get(f) for f in fields}
    return out


def season_of(day: date) -> str:
    """Heating season July–June: 2026-01-05 → ``2025/26``."""
    start = day.year if day.month >= 7 else day.year - 1
    return f"{start}/{(start + 1) % 100:02d}"


def compute_seasons(
    days: list[dict[str, Any]], *, today: date, kwh_per_run_hour: float | None
) -> list[dict[str, Any]]:
    """Per-season totals from daily rows (``date, runtime_h, starts, outdoor_mean, energy_kwh``).

    Degree days: Σ max(0, 20 °C − daily mean outdoor), the daily mean being the mean of the
    hourly means. ``median_run_min`` is the median over days of (runtime / starts).
    """
    groups: dict[str, list[dict[str, Any]]] = {}
    for row in days:
        groups.setdefault(season_of(row["date"]), []).append(row)
    out = []
    for season, rows in sorted(groups.items(), reverse=True):
        first = int(season[:4])
        start, end = date(first, 7, 1), date(first + 1, 6, 30)
        elapsed = max(1, (min(today, end) - start).days + 1)
        hours = sum(r.get("runtime_h") or 0.0 for r in rows)
        starts = int(sum(r.get("starts") or 0 for r in rows))
        runs = [
            r["runtime_h"] * 60 / r["starts"]
            for r in rows
            if (r.get("starts") or 0) > 0 and r.get("runtime_h") is not None
        ]
        means = [r["outdoor_mean"] for r in rows if r.get("outdoor_mean") is not None]
        dd = sum(max(0.0, DEGREE_DAY_BASE - m) for m in means)
        measured = [r["energy_kwh"] for r in rows if r.get("energy_kwh") is not None]
        if measured:
            energy: float | None = sum(measured)
        elif kwh_per_run_hour:
            energy = hours * kwh_per_run_hour
        else:
            energy = None
        out.append(
            {
                "season": season,
                "partial": today <= end,
                "compressor_h": round(hours, 2),
                "starts": starts,
                "median_run_min": round(statistics.median(runs), 1) if runs else None,
                "degree_days": round(dd, 1),
                "h_per_100dd": round(hours / dd * 100, 2) if dd > 0 else None,
                "energy_kwh": round(energy, 1) if energy is not None else None,
                "energy_measured": bool(measured),
                "coverage": round(min(1.0, len(means) / elapsed), 3),
                "outdoor_mean": round(statistics.fmean(means), 2) if means else None,
                "backup_heater_h": None,
            }
        )
    return out
