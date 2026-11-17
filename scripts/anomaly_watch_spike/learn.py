"""Nightly learning: per-entity baselines from recorder history (pure, synthetic in the spike).

In the integration this runs once a night in the recorder executor, in chunks of ~50 entities:
numeric sensors from long-term hourly statistics (``statistics_during_period``, ``mean``), the
rest from ``state_changes_during_period``. Only the compact ``EntityBaseline`` is kept.
"""

from __future__ import annotations

from collections import defaultdict
from collections.abc import Iterable
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from statistics import median
from zoneinfo import ZoneInfo

from .model import (
    MIN_SPREAD,
    ON_STATES,
    UNAVAILABLE,
    Config,
    Downtime,
    EntityMeta,
    Sample,
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
    lo: float  # lowest hourly mean ever seen in the pool
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


def overlaps(a0: datetime, a1: datetime, downtimes: Iterable[Downtime]) -> bool:
    return any(d.start < a1 and a0 < d.end for d in downtimes)


def _floor_bucket(ts: datetime, size: timedelta) -> int:
    return int(ts.timestamp() // size.total_seconds())


def learn(
    metas: Iterable[EntityMeta],
    samples: Iterable[Sample],
    downtimes: list[Downtime],
    until: datetime,
    config: Config | None = None,
) -> dict[str, EntityBaseline]:
    cfg = config or Config()
    tz = ZoneInfo(cfg.timezone)
    since = until - timedelta(days=cfg.learn_days)
    by_entity: dict[str, list[Sample]] = defaultdict(list)
    for s in samples:
        if since <= s.ts < until:
            by_entity[s.entity_id].append(s)
    # Anything right after a restart is startup noise, not behaviour.
    blind = [Downtime(d.start, d.end + cfg.restart_grace) for d in downtimes]

    out: dict[str, EntityBaseline] = {}
    for meta in metas:
        if meta.removed:
            continue
        rows = sorted(by_entity.get(meta.entity_id, []), key=lambda s: s.ts)
        if not rows:
            continue
        b = EntityBaseline(meta.entity_id, meta.device_id, (until - rows[0].ts) / timedelta(days=1))
        _learn_intervals(b, rows, blind, since, until, cfg)
        _learn_outages(b, rows, blind)
        _learn_flapping(b, rows, blind, cfg)
        if meta.kind == "numeric":
            _learn_hourly(b, meta, rows, blind, tz, cfg)
        else:
            _learn_dwell(b, rows, blind)
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


def _learn_outages(b: EntityBaseline, rows: list[Sample], blind: list[Downtime]) -> None:
    durations: list[float] = []
    start: datetime | None = None
    for s in rows:
        if s.state in UNAVAILABLE:
            start = start or s.ts
        elif start is not None:
            if not overlaps(start, s.ts, blind):
                durations.append((s.ts - start).total_seconds())
            start = None
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
    # numeric sensors change on every report: flapping is only meaningful for discrete states
    b.flap_usual = max(counts.values(), default=0)


def _learn_hourly(
    b: EntityBaseline,
    meta: EntityMeta,
    rows: list[Sample],
    blind: list[Downtime],
    tz: ZoneInfo,
    cfg: Config,
) -> None:
    # Same shape as recorder long-term statistics: one mean per (local day, local hour).
    acc: dict[tuple[object, int], list[float]] = defaultdict(list)
    for s in rows:
        v = s.value
        if v is None or overlaps(s.ts, s.ts, blind):
            continue
        local = s.ts.astimezone(tz)
        acc[(local.date(), local.hour)].append(v)
    per_hour: dict[int, list[float]] = defaultdict(list)
    for (_, hour), values in acc.items():
        per_hour[hour].append(sum(values) / len(values))
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
        spread = max(1.4826 * mad, floor, abs(med) * 0.05)
        b.hourly[hour] = HourStat(med, spread, min(pool), max(pool), len(pool))


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
