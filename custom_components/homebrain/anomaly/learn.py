"""Nightly learning: compact per-entity baselines from recorder history (pure functions).

The manager feeds every entity separately: state rows (``state_changes_during_period``) for
report intervals, outages, flapping and dwell, and – for numeric ``measurement`` sensors – the
recorder's hourly long-term statistics (``mean``). Only the small ``EntityBaseline`` is kept.

The recorder does not store a new row when a sensor repeats its value, so learned intervals are
an upper bound (fewer false "silent" findings); live silence uses ``State.last_reported``.
"""

from __future__ import annotations

from collections import defaultdict, deque
from collections.abc import Iterable
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta, tzinfo
from statistics import median
from typing import Any

from .model import (
    MIN_SPREAD,
    ON_STATES,
    UNAVAILABLE,
    Config,
    Downtime,
    EntityMeta,
    Sample,
    minimum_spread,
)


def percentile(values: list[float], q: float) -> float:
    """Linear-interpolated percentile, ``q`` in 0..1."""
    s = sorted(values)
    if not s:
        raise ValueError("empty")
    pos = (len(s) - 1) * q
    lo = int(pos)
    hi = min(lo + 1, len(s) - 1)
    return s[lo] + (s[hi] - s[lo]) * (pos - lo)


@dataclass(frozen=True)
class HourStat:
    """Robust statistics of hourly means for one local hour (pooled with its neighbours)."""

    median: float
    spread: float  # max(1.4826 · MAD, class floor, 5 % of |median|)
    lo: float  # lowest hourly mean seen in the pool
    hi: float
    n: int


@dataclass
class EntityBaseline:
    entity_id: str
    device_id: str
    days: float
    hourly: list[HourStat | None] = field(default_factory=lambda: [None] * 24)
    periodic: bool = False
    p50_interval: timedelta | None = None
    p95_interval: timedelta | None = None
    outages: int = 0
    outage_p95: timedelta = timedelta(0)
    flap_usual: int = 0  # max real-state transitions in any flap window
    dwell_n: int = 0
    dwell_p95: timedelta | None = None
    availability_ratio: float | None = None
    availability_flaps_usual: int = 0  # hourly peak reached on at least three days
    value_range: tuple[float, float] | None = None

    # ------------------------------------------------------------ persistence
    def as_dict(self) -> dict[str, Any]:
        def sec(v: timedelta | None) -> float | None:
            return None if v is None else round(v.total_seconds(), 1)

        return {
            "e": self.entity_id,
            "d": self.device_id,
            "days": round(self.days, 2),
            "h": [
                None if s is None else [round(s.median, 3), round(s.spread, 3), s.lo, s.hi, s.n]
                for s in self.hourly
            ],
            "per": self.periodic,
            "p50": sec(self.p50_interval),
            "p95": sec(self.p95_interval),
            "out": self.outages,
            "out95": sec(self.outage_p95),
            "flap": self.flap_usual,
            "dn": self.dwell_n,
            "d95": sec(self.dwell_p95),
            "avail": self.availability_ratio,
            "avail_flaps": self.availability_flaps_usual,
            "range": self.value_range,
        }

    @classmethod
    def from_dict(cls, raw: dict[str, Any]) -> EntityBaseline:
        def td(v: Any) -> timedelta | None:
            return None if v is None else timedelta(seconds=float(v))

        hourly = [
            None if h is None else HourStat(float(h[0]), float(h[1]), h[2], h[3], int(h[4]))
            for h in (raw.get("h") or [None] * 24)
        ]
        return cls(
            entity_id=str(raw["e"]),
            device_id=str(raw.get("d", "")),
            days=float(raw.get("days", 0)),
            hourly=(hourly + [None] * 24)[:24],
            periodic=bool(raw.get("per")),
            p50_interval=td(raw.get("p50")),
            p95_interval=td(raw.get("p95")),
            outages=int(raw.get("out", 0)),
            outage_p95=td(raw.get("out95")) or timedelta(0),
            flap_usual=int(raw.get("flap", 0)),
            dwell_n=int(raw.get("dn", 0)),
            dwell_p95=td(raw.get("d95")),
            availability_ratio=raw.get("avail"),
            availability_flaps_usual=int(raw.get("avail_flaps", 0)),
            value_range=tuple(bounds) if (bounds := raw.get("range")) is not None else None,
        )


def merge_downtimes(downtimes: Iterable[Downtime]) -> list[Downtime]:
    """Sorted, non-overlapping windows (an overlap must never be subtracted twice)."""
    out: list[Downtime] = []
    for d in sorted(downtimes, key=lambda d: d.start):
        if out and d.start <= out[-1].end:
            if d.end > out[-1].end:
                out[-1] = Downtime(out[-1].start, d.end)
        else:
            out.append(d)
    return out


def overlaps(a0: datetime, a1: datetime, downtimes: Iterable[Downtime]) -> bool:
    return any(d.start < a1 and a0 < d.end for d in downtimes)


def _floor_bucket(ts: datetime, size: timedelta) -> int:
    return int(ts.timestamp() // size.total_seconds())


def hourly_means(samples: Iterable[Sample], tz: tzinfo) -> list[tuple[datetime, float]]:
    """Same shape as the recorder's hourly statistics: one mean per local (day, hour)."""
    acc: dict[datetime, list[float]] = defaultdict(list)
    for s in samples:
        v = s.value
        if v is None:
            continue
        local = s.ts.astimezone(tz)
        acc[local.replace(minute=0, second=0, microsecond=0)].append(v)
    return sorted((start, sum(vs) / len(vs)) for start, vs in acc.items())


def learn_entity(
    meta: EntityMeta,
    rows: list[Sample],
    hourly: list[tuple[datetime, float]] | None,
    downtimes: list[Downtime],
    until: datetime,
    tz: tzinfo,
    config: Config | None = None,
    first_seen: datetime | None = None,
) -> EntityBaseline | None:
    """Baseline of one entity; ``None`` when there is no history at all."""
    cfg = config or Config()
    since = until - timedelta(days=cfg.learn_days)
    rows = sorted((s for s in rows if since <= s.ts < until), key=lambda s: s.ts)
    hourly = [(t, v) for t, v in (hourly or []) if since <= t < until]
    starts = [t for t in (rows[0].ts if rows else None, hourly[0][0] if hourly else None) if t]
    if first_seen is not None:
        starts.append(first_seen)
    if not starts:
        return None
    # Anything right after a restart is startup noise, not behaviour.
    blind = merge_downtimes(Downtime(d.start, d.end + cfg.restart_grace) for d in downtimes)
    b = EntityBaseline(meta.entity_id, meta.device_id, (until - min(starts)) / timedelta(days=1))
    if rows:
        _learn_intervals(b, rows, blind, since, until, cfg)
        _learn_outages(b, rows, blind, until, tz, cfg)
        _learn_flapping(b, rows, blind, cfg)
    if meta.kind == "numeric":
        _learn_hourly(b, meta, hourly, blind, tz, cfg)
        values = [v for s in rows if not overlaps(s.ts, s.ts, blind) and (v := s.value) is not None]
        values.extend(v for t, v in hourly if not overlaps(t, t + timedelta(hours=1), blind))
        if values:
            b.value_range = (min(values), max(values))
    elif rows:
        _learn_dwell(b, rows, blind)
    return b


def learn(
    metas: Iterable[EntityMeta],
    samples: Iterable[Sample],
    downtimes: list[Downtime],
    until: datetime,
    tz: tzinfo,
    config: Config | None = None,
) -> dict[str, EntityBaseline]:
    """Convenience for tests/synthetic data: hourly means derived from the samples."""
    by_entity: dict[str, list[Sample]] = defaultdict(list)
    for s in samples:
        by_entity[s.entity_id].append(s)
    blind = [Downtime(d.start, d.end + (config or Config()).restart_grace) for d in downtimes]
    out: dict[str, EntityBaseline] = {}
    for meta in metas:
        if meta.removed:
            continue
        rows = by_entity.get(meta.entity_id, [])
        hourly = None
        if meta.kind == "numeric":
            hourly = hourly_means((s for s in rows if not overlaps(s.ts, s.ts, blind)), tz)
        b = learn_entity(meta, rows, hourly, downtimes, until, tz, config)
        if b is not None:
            out[meta.entity_id] = b
    return out


def _learn_intervals(
    b: EntityBaseline,
    rows: list[Sample],
    blind: list[Downtime],
    since: datetime,
    until: datetime,
    cfg: Config,
) -> None:
    live = [s for s in rows if s.state not in UNAVAILABLE]
    gaps = [
        (b1.ts - a.ts).total_seconds()
        for a, b1 in zip(live, live[1:], strict=False)
        if not overlaps(a.ts, b1.ts, blind)
    ]
    hours = {_floor_bucket(s.ts, timedelta(hours=1)) for s in live}
    start = max(since, rows[0].ts)
    total = max(1, int((until - start).total_seconds() // 3600))
    blind_h = (
        sum(max(0.0, (min(d.end, until) - max(d.start, start)).total_seconds()) for d in blind)
        / 3600
    )
    coverage = len(hours) / max(1.0, total - blind_h)
    if len(gaps) >= cfg.periodic_min_updates:
        b.p50_interval = timedelta(seconds=percentile(gaps, 0.5))
        b.p95_interval = timedelta(seconds=percentile(gaps, 0.95))
        b.periodic = coverage >= cfg.periodic_min_coverage


def _learn_outages(
    b: EntityBaseline,
    rows: list[Sample],
    blind: list[Downtime],
    until: datetime,
    tz: tzinfo,
    cfg: Config,
) -> None:
    def observed(a: datetime, z: datetime) -> timedelta:
        return (
            z
            - a
            - sum(
                (min(z, d.end) - max(a, d.start) for d in blind if d.start < z and a < d.end),
                timedelta(0),
            )
        )

    durations: list[float] = []
    unavailable = timedelta(0)
    recent: deque[datetime] = deque()
    daily_peaks: dict[date, int] = defaultdict(int)
    start: datetime | None = None
    for s in rows:
        if s.state in UNAVAILABLE:
            start = start or s.ts
        elif start is not None:
            unavailable += observed(start, s.ts)
            if not overlaps(start, s.ts, blind):
                durations.append((s.ts - start).total_seconds())
                while recent and start - recent[0] > cfg.availability_window:
                    recent.popleft()
                recent.append(start)
                day = start.astimezone(tz).date()
                daily_peaks[day] = max(daily_peaks[day], len(recent))
            start = None
    if start is not None:
        unavailable += observed(start, until)
    total = observed(rows[0].ts, until)
    if total > timedelta(0):
        b.availability_ratio = 1 - unavailable / total
    peaks = sorted(daily_peaks.values(), reverse=True)
    if len(peaks) >= 3:
        b.availability_flaps_usual = peaks[2]
    b.outages = len(durations)
    if durations:
        b.outage_p95 = timedelta(seconds=percentile(durations, 0.95))


def _learn_flapping(
    b: EntityBaseline, rows: list[Sample], blind: list[Downtime], cfg: Config
) -> None:
    counts: dict[int, int] = defaultdict(int)
    prev: str | None = None
    for s in rows:
        if s.state in UNAVAILABLE:
            continue
        if prev is not None and s.state != prev and not overlaps(s.ts, s.ts, blind):
            counts[_floor_bucket(s.ts, cfg.flap_window)] += 1
        prev = s.state
    b.flap_usual = max(counts.values(), default=0)


def _learn_hourly(
    b: EntityBaseline,
    meta: EntityMeta,
    hourly: list[tuple[datetime, float]],
    blind: list[Downtime],
    tz: tzinfo,
    cfg: Config,
) -> None:
    per_hour: dict[int, list[float]] = defaultdict(list)
    for start, mean in hourly:
        if overlaps(start, start + timedelta(hours=1), blind):
            continue
        per_hour[start.astimezone(tz).hour].append(mean)
    floor = MIN_SPREAD.get(meta.device_class or "", 0.0)
    for hour in range(24):
        # Pooling with the neighbour hours absorbs DST shifts and small schedule drift.
        pool = per_hour[(hour - 1) % 24] + per_hour[hour] + per_hour[(hour + 1) % 24]
        if len(pool) < cfg.baseline_min_samples:
            continue
        med = median(pool)
        mad = median(abs(x - med) for x in pool)
        if mad == 0 and floor == 0:
            continue  # enum-like counters/flags: a "usual level" means nothing here
        spread = max(1.4826 * mad, minimum_spread(meta, med))
        b.hourly[hour] = HourStat(med, spread, round(min(pool), 3), round(max(pool), 3), len(pool))


def _learn_dwell(b: EntityBaseline, rows: list[Sample], blind: list[Downtime]) -> None:
    durations: list[float] = []
    on_since: datetime | None = None
    real: str | None = None
    for s in rows:
        if s.state in UNAVAILABLE or s.state == real:
            continue  # an outage in the middle of an episode does not end it
        real = s.state
        if s.state in ON_STATES:
            on_since = s.ts
        elif on_since is not None:
            if not overlaps(on_since, s.ts, blind):
                durations.append((s.ts - on_since).total_seconds())
            on_since = None
    b.dwell_n = len(durations)
    if durations:
        b.dwell_p95 = timedelta(seconds=percentile(durations, 0.95))
