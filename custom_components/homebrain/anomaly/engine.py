"""Live evaluation: detectors, tier escalation, grouping and restart safety (pure Python).

The manager calls ``feed`` from a state-change listener limited to monitored entities, updates
``last_reported`` with ``touch`` and calls ``evaluate`` every 60 s. Open findings survive a
restart via ``dump``/``restore`` (HA ``Store``). Phase 1 never writes to HA and sends nothing:
the engine only produces reports for the panel.
"""

from __future__ import annotations

from collections import defaultdict, deque
from dataclasses import dataclass, field
from datetime import datetime, timedelta, tzinfo
from math import isclose
from typing import Any

from .learn import EntityBaseline, merge_downtimes
from .model import (
    BEHAVIOUR_CLASSES,
    MIN_DWELL,
    ON_STATES,
    SILENT_KINDS,
    TIER_KEYS,
    UNAVAILABLE,
    Config,
    Detector,
    Downtime,
    EntityMeta,
    Finding,
    Report,
    Sample,
    Tier,
    minimum_spread,
)

VALUE_WINDOW = timedelta(hours=1)
VALUE_MAX = 720  # ≥ 1 value per 5 s over the window; older values are dropped by time first

Hit = tuple[Detector, EntityMeta, Tier, dict[str, Any], dict[Tier, datetime]]


@dataclass
class Live:
    last_update: datetime | None = None
    real_state: str | None = None
    real_since: datetime | None = None
    unavailable_since: datetime | None = None
    transitions: deque[datetime] = field(default_factory=lambda: deque(maxlen=256))
    outage_starts: deque[datetime] = field(default_factory=lambda: deque(maxlen=32))
    values: deque[tuple[datetime, float]] = field(default_factory=lambda: deque(maxlen=VALUE_MAX))


def _iso(ts: datetime | None) -> str | None:
    return ts.isoformat() if ts else None


def _observation_only(f: Finding) -> bool:
    return (
        f.detector == "flapping"
        and f.detail.get("what") == "availability"
        or f.detector == "baseline"
        and f.detail.get("seen_before") is True
    )


class Engine:
    def __init__(
        self,
        metas: list[EntityMeta],
        baselines: dict[str, EntityBaseline],
        tz: tzinfo,
        config: Config | None = None,
    ) -> None:
        self.cfg = config or Config()
        self.tz = tz
        self.metas = {m.entity_id: m for m in metas}
        self.baselines = dict(baselines)
        self.live: dict[str, Live] = defaultdict(Live)
        self.tariff_starts: dict[str, datetime | None] = {}  # None: inactive or unknown tariff
        self.downtimes: list[Downtime] = []
        self._blind_windows: list[Downtime] = []
        self.active: dict[str, Finding] = {}
        self.resolved: deque[Finding] = deque(maxlen=self.cfg.resolved_max)
        self.tolerance: dict[str, float] = {}  # entity_id → limit factor ("To je v pořádku")
        self.away = False
        self.mass_outage_since: datetime | None = None
        self._peak: dict[str, tuple[Tier, int]] = {}  # report key → worst (tier, entities)
        self._reached: dict[str, dict[str, datetime]] = {}  # report key → tier key → time
        self._earliest: dict[str, dict[Tier, datetime]] = {}  # finding key → projected tiers

    # ---------------------------------------------------------------- inputs
    def set_away(self, away: bool) -> None:
        self.away = away

    def downtime(self, start: datetime, end: datetime) -> None:
        """HA was stopped (or the recorder had a hole) between ``start`` and ``end``."""
        if end > start:
            self._set_downtimes([*self.downtimes, Downtime(start, end)])

    def _set_downtimes(self, downtimes: list[Downtime]) -> None:
        self.downtimes = merge_downtimes(downtimes)
        self._blind_windows = merge_downtimes(
            Downtime(d.start, d.end + self.cfg.restart_grace) for d in self.downtimes
        )

    def set_metas(self, metas: list[EntityMeta]) -> None:
        """Registry snapshot. Removed entities and a new device behind an entity_id reset it."""
        new = {m.entity_id: m for m in metas}
        for eid, old in list(self.metas.items()):
            meta = new.get(eid)
            if meta is None or meta.removed or meta.device_id != old.device_id:
                self._forget(eid)
        for eid, meta in new.items():
            base = self.baselines.get(eid)
            if base is not None and base.device_id != meta.device_id:
                self._forget(eid)  # replaced sensor: a fresh warm-up
        self.metas = new

    def set_baselines(self, baselines: dict[str, EntityBaseline]) -> None:
        self.baselines = {
            eid: b
            for eid, b in baselines.items()
            if eid in self.metas and self.metas[eid].device_id == b.device_id
        }

    def _forget(self, eid: str) -> None:
        self.baselines.pop(eid, None)
        self.live.pop(eid, None)
        self.tolerance.pop(eid, None)
        for key in [k for k, f in self.active.items() if f.entity_id == eid]:
            del self.active[key]

    def feed(self, s: Sample) -> None:
        if s.entity_id not in self.metas:
            return
        live = self.live[s.entity_id]
        live.last_update = s.ts if live.last_update is None else max(live.last_update, s.ts)
        if s.state in UNAVAILABLE:
            if live.unavailable_since is None:
                live.unavailable_since = s.ts
                if not self._in_grace(s.ts):
                    live.outage_starts.append(s.ts)
            return
        live.unavailable_since = None
        if s.state != live.real_state:
            # restored-after-restart states equal the previous real state: no transition
            if live.real_state is not None and not self._in_grace(s.ts):
                live.transitions.append(s.ts)
            live.real_state = s.state
            live.real_since = s.ts
        v = s.value
        if v is not None:
            live.values.append((s.ts, v))
            while live.values and s.ts - live.values[0][0] > VALUE_WINDOW:
                live.values.popleft()

    def _held_silent(self, entity_id: str, ts: datetime) -> bool:
        """A state restored after a restart is not a report of a device that was silent."""
        blind = any(d.start <= ts < d.end for d in self._blind_windows)
        return blind and f"silent:{entity_id}" in self.active

    def seed(self, s: Sample) -> None:
        """Start-up state of an entity (from the state machine, not a live event)."""
        live = self.live.get(s.entity_id)
        if (
            live is not None
            and live.last_update is not None
            and self._held_silent(s.entity_id, s.ts)
        ):
            live.real_state = live.real_state or s.state
            return
        self.feed(s)

    def touch(self, entity_id: str, reported: datetime) -> None:
        """Same value reported again (``last_reported`` moved): alive, nothing else changed."""
        live = self.live.get(entity_id)
        if live is None or live.last_update is None or reported <= live.last_update:
            return
        if self._held_silent(entity_id, reported):
            return
        if live.unavailable_since is None:
            live.last_update = reported

    # ------------------------------------------------------------- helpers
    def _in_grace(self, ts: datetime) -> bool:
        return any(d.end <= ts < d.end + self.cfg.restart_grace for d in self.downtimes)

    def _elapsed(self, since: datetime, now: datetime) -> timedelta:
        """Wall time minus HA downtime and post-restart grace: the clock pauses while blind."""
        el = now - since
        for d in self._blind_windows:
            a, b = max(since, d.start), min(now, d.end)
            if b > a:
                el -= b - a
        return max(el, timedelta(0))

    @staticmethod
    def _tier_by(el: timedelta, limits: list[timedelta]) -> Tier | None:
        tier = None
        for t, limit in zip(Tier, limits, strict=True):
            if el >= limit:
                tier = t
        return tier

    def _persist_tier(self, key: str, now: datetime, hard: bool) -> Tier:
        held = now - self._persist_since(key, now)
        if hard and held >= self.cfg.persist_confirmed:
            return Tier.CONFIRMED
        if held >= self.cfg.persist_suspicion:
            return Tier.SUSPICION
        return Tier.OBSERVATION

    def _persist_earliest(self, key: str, now: datetime, hard: bool) -> dict[Tier, datetime]:
        since = self._persist_since(key, now)
        out = {Tier.SUSPICION: since + self.cfg.persist_suspicion}
        if hard:
            out[Tier.CONFIRMED] = since + self.cfg.persist_confirmed
        return out

    def _persist_since(self, key: str, now: datetime) -> datetime:
        prev = self.active.get(key)
        return prev.since if prev and not _observation_only(prev) else now

    def _monitored(self, meta: EntityMeta) -> bool:
        return not meta.removed and meta.entity_id in self.baselines

    def _factor(self, eid: str) -> float:
        return self.tolerance.get(eid, 1.0)

    def tolerate(self, entity_ids: list[str]) -> None:
        """ "To je v pořádku": the limits of these entities widen (capped)."""
        for eid in entity_ids:
            self.tolerance[eid] = min(
                self.cfg.tolerance_max, self._factor(eid) * self.cfg.tolerance_step
            )

    def warming_up(self) -> list[str]:
        """Entities still learning (no or too short history) – the UI shows „Učí se“."""
        return sorted(
            e
            for e, m in self.metas.items()
            if not m.removed
            and (e not in self.baselines or self.baselines[e].days < self.cfg.warmup_days)
        )

    def _limits(
        self, floors: tuple[timedelta, ...], factors: tuple[float, ...], usual: timedelta, k: float
    ) -> list[timedelta]:
        return [max(f, usual * m) * k for f, m in zip(floors, factors, strict=True)]

    def _silence_since(self, eid: str, last: datetime) -> datetime | None:
        start = self.tariff_starts.get(eid, last)
        return max(start, last) if start is not None else None

    # ------------------------------------------------------------ detectors
    def _detect(self, now: datetime) -> dict[str, Hit]:
        cfg = self.cfg
        hits: dict[str, Hit] = {}
        for eid, meta in self.metas.items():
            if not self._monitored(meta):
                continue
            b = self.baselines[eid]
            live = self.live.get(eid)
            if live is None or live.last_update is None:
                continue
            warm = b.days >= cfg.warmup_days
            k = self._factor(eid)

            if live.unavailable_since is not None:
                el = self._elapsed(live.unavailable_since, now)
                limits = self._limits(cfg.outage_floors, cfg.outage_factors, b.outage_p95, k)
                tier = self._tier_by(el, limits)
                if tier:
                    detail = {
                        "minutes": round(el / timedelta(minutes=1)),
                        "since": _iso(live.unavailable_since),
                    }
                    earliest = {
                        t: live.unavailable_since + lim for t, lim in zip(Tier, limits, strict=True)
                    }
                    hits[f"unavailable:{eid}"] = ("unavailable", meta, tier, detail, earliest)
                continue

            since = self._silence_since(eid, live.last_update)
            if since is not None and b.periodic and b.p95_interval is not None:
                el = self._elapsed(since, now)
                limits = self._limits(cfg.silent_floors, cfg.silent_factors, b.p95_interval, k)
                tier = self._tier_by(el, limits)
                if tier:
                    detail = {
                        "minutes": round(el / timedelta(minutes=1)),
                        "last": _iso(live.last_update),
                        "interval_s": round((b.p50_interval or b.p95_interval).total_seconds()),
                    }
                    if since > live.last_update:
                        detail["expected_since"] = _iso(since)
                    earliest = {t: since + lim for t, lim in zip(Tier, limits, strict=True)}
                    hits[f"silent:{eid}"] = ("silent", meta, tier, detail, earliest)
                    continue

            recent = [t for t in live.outage_starts if now - t <= cfg.availability_window]
            if len(recent) >= cfg.availability_flaps:
                ratio = b.availability_ratio
                usual = (
                    b.availability_flaps_usual
                    if warm and ratio is not None and 0 < ratio < 1
                    else 0
                )
                if len(recent) > usual:
                    detail = {"count": len(recent), "what": "availability"}
                    hits[f"flapping:{eid}"] = ("flapping", meta, Tier.OBSERVATION, detail, {})
                continue

            if meta.kind == "numeric" and warm:
                self._detect_baseline(now, meta, b, live, hits, k)
            if meta.kind == "discrete" and warm:
                self._detect_discrete(now, meta, b, live, hits, k)
        return hits

    def _detect_baseline(
        self,
        now: datetime,
        meta: EntityMeta,
        b: EntityBaseline,
        live: Live,
        hits: dict[str, Hit],
        k: float,
    ) -> None:
        cfg = self.cfg
        stat = b.hourly[now.astimezone(self.tz).hour]
        window = [v for t, v in live.values if now - t <= VALUE_WINDOW]
        if stat is None or not window or self._in_grace(now):
            return
        x = sum(window) / len(window)  # same shape as the hourly statistics mean
        delta = x - stat.median
        floor = minimum_spread(meta, stat.median)
        if abs(delta) < floor:
            return
        spread = max(stat.spread, floor)
        z = delta / spread
        outside = x > stat.hi + spread * k or x < stat.lo - spread * k
        behaviour = meta.device_class in BEHAVIOUR_CLASSES
        limit = (cfg.z_observe_behaviour if behaviour else cfg.z_observe) * k
        if abs(z) < limit or not outside:
            return
        bounds = b.value_range
        if bounds is None:  # stored profiles from before the all-hours range was learned
            hours = [hour for hour in b.hourly if hour is not None]
            bounds = (min(hour.lo for hour in hours), max(hour.hi for hour in hours))
        lo, hi = bounds
        seen_before = lo <= x <= hi or isclose(x, lo) or isclose(x, hi)
        key = f"baseline:{meta.entity_id}"
        detail = {
            "value": round(x, 2),
            "usual": round(stat.median, 2),
            "lo": stat.lo,
            "hi": stat.hi,
            "z": round(z, 1),
            "seen_before": seen_before,
        }
        if seen_before:
            hits[key] = ("baseline", meta, Tier.OBSERVATION, detail, {})
            return
        margin = cfg.envelope_spreads * spread * k
        hard = abs(z) >= cfg.z_confirm * k and (x > stat.hi + margin or x < stat.lo - margin)
        tier = self._persist_tier(key, now, hard)
        if behaviour and z < 0:
            # Low consumption/light/CO2 follows the people, not the device.
            tier = min(tier, Tier.OBSERVATION if self.away else Tier.SUSPICION)
            hard = False
        elif self.away and not hard:
            tier = Tier.OBSERVATION  # holiday set-back of heating etc.: note it, do not worry
        hits[key] = ("baseline", meta, tier, detail, self._persist_earliest(key, now, hard))

    def _detect_discrete(
        self,
        now: datetime,
        meta: EntityMeta,
        b: EntityBaseline,
        live: Live,
        hits: dict[str, Hit],
        k: float,
    ) -> None:
        cfg = self.cfg
        recent = [t for t in live.transitions if now - t <= cfg.flap_window]
        if len(recent) >= max(cfg.flap_min, cfg.flap_factor * b.flap_usual) * k:
            key = f"flapping:{meta.entity_id}"
            tier = self._persist_tier(key, now, hard=True)
            detail = {"count": len(recent), "what": "state"}
            hits[key] = ("flapping", meta, tier, detail, self._persist_earliest(key, now, True))
            return
        dwell_key = meta.device_class if meta.device_class in MIN_DWELL else meta.domain
        floor = MIN_DWELL.get(dwell_key or "")
        if (
            floor is None
            or live.real_state not in ON_STATES
            or live.real_since is None
            or b.dwell_n < cfg.dwell_min_episodes
            or b.dwell_p95 is None
        ):
            return
        limit = max(b.dwell_p95 * 3, floor) * k
        limits = [limit * m for m in cfg.dwell_factors]
        el = self._elapsed(live.real_since, now)
        tier = self._tier_by(el, limits)
        if tier:
            detail = {
                "minutes": round(el / timedelta(minutes=1)),
                "usual_minutes": round(b.dwell_p95 / timedelta(minutes=1)),
                "since": _iso(live.real_since),
            }
            earliest = {t: live.real_since + lim for t, lim in zip(Tier, limits, strict=True)}
            hits[f"dwell:{meta.entity_id}"] = ("dwell", meta, tier, detail, earliest)

    # ----------------------------------------------------------- evaluation
    def evaluate(self, now: datetime) -> list[Report]:
        cfg = self.cfg
        hits = self._detect(now)

        # Mass outage (HA/network/coordinator restart): one system note instead of N devices.
        if self._mass_outage(now):
            self.mass_outage_since = self.mass_outage_since or now
            hits = {k: h for k, h in hits.items() if h[0] not in SILENT_KINDS}
        else:
            self.mass_outage_since = None

        grace = self._in_grace(now)
        self._earliest = {}
        for key, (det, meta, tier, detail, earliest) in hits.items():
            f = self.active.get(key)
            if f is None:
                if grace:
                    continue  # nothing new is born in the first minutes after a restart
                f = Finding(det, meta.entity_id, meta.device_id, tier, now, now, detail)
                self.active[key] = f
            was_capped = _observation_only(f)
            f.detail = detail
            if _observation_only(f):
                f.tier = tier
                f.reached = {k: v for k, v in f.reached.items() if k == TIER_KEYS[tier]}
            elif was_capped:
                f.since = now
                f.tier = tier
                f.reached.clear()
            else:
                f.tier = max(f.tier, tier)
            f.last_true = now
            for t in Tier:
                if t <= f.tier:
                    f.reached.setdefault(TIER_KEYS[t], now)
            self._earliest[key] = earliest
        for key in [k for k in self.active if k not in hits]:
            f = self.active[key]
            tariff_paused = (
                f.detector == "silent"
                and f.entity_id in self.tariff_starts
                and self.tariff_starts[f.entity_id] is None
            )
            if tariff_paused or now - f.last_true >= cfg.clear_after:
                f.resolved_at = now
                self.resolved.append(self.active.pop(key))
        while self.resolved and now - self.resolved[0].resolved_at > cfg.resolved_keep:  # type: ignore[operator]
            self.resolved.popleft()
        if any(now - d.end > cfg.downtime_keep for d in self.downtimes):
            self._set_downtimes([d for d in self.downtimes if now - d.end <= cfg.downtime_keep])

        reports = [self._sticky(r, now) for r in self._group(now)]
        keys = {r.key for r in reports}
        for key in set(self._peak) - keys:
            self.reset_report_history(key)
        return reports

    def reset_report_history(self, key: str) -> None:
        """Forget sticky tier and counts when a report closes or its scope changes."""
        self._peak.pop(key, None)
        self._reached.pop(key, None)

    def _sticky(self, r: Report, now: datetime) -> Report:
        """While a report is open, its tier and entity count never shrink (no 17 → 7 → 1)."""
        peak = self._peak.get(r.key, (r.tier, 0))
        if r.findings and all(_observation_only(f) for f in r.findings):
            peak = (r.tier, len(r.entities))
            self._reached.pop(r.key, None)
        self._peak[r.key] = (max(peak[0], r.tier), max(peak[1], len(r.entities)))
        r.tier = self._peak[r.key][0]
        reached = self._reached.setdefault(r.key, {})
        for f in r.findings:
            for tier_key, ts in f.reached.items():
                if ts < reached.get(tier_key, ts + timedelta(seconds=1)):
                    reached[tier_key] = ts
        for t in Tier:
            if t <= r.tier:
                reached.setdefault(TIER_KEYS[t], now)
        r.reached = {TIER_KEYS[t]: reached[TIER_KEYS[t]] for t in Tier if TIER_KEYS[t] in reached}
        r.earliest = {
            TIER_KEYS[t]: ts
            for t, ts in r.next_at.items()
            if t > r.tier and TIER_KEYS[t] not in r.reached
        }
        return r

    def peak_entities(self, key: str) -> int:
        peak = self._peak.get(key)
        return peak[1] if peak else 0

    def quiet(self, eid: str, now: datetime) -> bool | None:
        """Looser than the silent detector (2 × own p95, ≥ 15 min): used for grouping only."""
        b = self.baselines.get(eid)
        live = self.live.get(eid)
        if b is None or not b.periodic or b.p95_interval is None or live is None:
            return None
        if live.last_update is None:
            return None
        limit = max(timedelta(minutes=15), b.p95_interval * 2)
        since = live.unavailable_since or self._silence_since(eid, live.last_update)
        return self._elapsed(since, now) >= limit if since is not None else None

    def _mass_outage(self, now: datetime) -> bool:
        """Most devices quiet across several integrations = HA/network problem, not devices."""
        devices: dict[str, bool] = {}
        integrations: set[str] = set()
        for eid, b in self.baselines.items():
            meta = self.metas.get(eid)
            if not b.periodic or b.p95_interval is None or meta is None or meta.removed:
                continue
            quiet = self.quiet(eid, now)
            if quiet is None:
                continue
            devices[meta.device_id] = devices.get(meta.device_id, False) or quiet
            if quiet:
                integrations.add(meta.integration)
        quiet_devices = sum(devices.values())
        return (
            len(devices) >= 3
            and quiet_devices >= self.cfg.mass_outage_share * len(devices)
            and len(integrations) >= 2
        )

    # -------------------------------------------------------------- grouping
    def device_entities(self, device_id: str) -> list[str]:
        return sorted(
            e for e, m in self.metas.items() if m.device_id == device_id and self._monitored(m)
        )

    def _simultaneous_device_outage(self, group: list[Report]) -> bool:
        if len(group) != 2:
            return False
        last_updates: list[datetime] = []
        for r in group:
            monitored = set(self.device_entities(r.device_ids[0]))
            if not monitored.issubset(r.entities):
                return False
            seen = [
                u
                for e in monitored
                if (u := self.live[e].unavailable_since or self.live[e].last_update) is not None
            ]
            if not seen:
                return False
            last_updates.append(max(seen))
        return abs(last_updates[0] - last_updates[1]) <= self.cfg.shared_outage_window

    def _group(self, now: datetime) -> list[Report]:
        by_device: dict[str, list[Finding]] = defaultdict(list)
        for f in self.active.values():
            by_device[f.device_id].append(f)
        reports = [self._device_report(d, fs, now) for d, fs in by_device.items()]

        # Several whole devices of one integration silent together point to the connection.
        by_integration: dict[str, list[Report]] = defaultdict(list)
        for r in reports:
            if all(f.detector in SILENT_KINDS for f in r.findings):
                by_integration[self.metas[r.entities[0]].integration].append(r)
        for integ, group in by_integration.items():
            if len(group) < self.cfg.integration_min_devices and not (
                self._simultaneous_device_outage(group)
            ):
                continue
            for r in group:
                reports.remove(r)
            reports.append(
                Report(
                    key=f"integration:{integ}",
                    tier=max(r.tier for r in group),
                    since=min(r.since for r in group),
                    entities=sorted(e for r in group for e in r.entities),
                    findings=[f for r in group for f in r.findings],
                    scope="integration",
                    device_ids=sorted(d for r in group for d in r.device_ids),
                    integration=integ,
                )
            )
        if self.mass_outage_since is not None:
            reports.append(
                Report(
                    key="system",
                    tier=Tier.OBSERVATION,
                    since=self.mass_outage_since,
                    entities=[],
                    findings=[],
                    scope="system",
                )
            )
        reports.sort(key=lambda r: (-r.tier, r.since, r.key))
        return reports

    def _device_report(self, device_id: str, findings: list[Finding], now: datetime) -> Report:
        monitored = self.device_entities(device_id)
        silent: list[str] = []
        if any(f.detector in SILENT_KINDS for f in findings):
            # count every quiet sibling, so the title does not tick 2 → 7 → 17 as they cross
            silent = sorted(
                {f.entity_id for f in findings if f.detector in SILENT_KINDS}
                | {e for e in monitored if self.quiet(e, now)}
            )
        tier = max(f.tier for f in findings)
        top = max(findings, key=lambda f: (f.tier, -f.since.timestamp()))
        earliest = dict(self._earliest.get(top.key, {}))
        # Corroboration: most of a device going quiet together is a device fault, not noise.
        # Raised one step at a time: a quiet device is a suspicion after persist_suspicion,
        # and confirmed once the silence itself reaches the suspicion threshold.
        if len(silent) >= 2 and len(silent) >= 0.5 * len(monitored):
            first = min(f.since for f in findings)
            if tier >= Tier.SUSPICION:
                tier = Tier.CONFIRMED
            else:
                if now - first >= self.cfg.persist_suspicion:
                    tier = Tier.SUSPICION
                earliest[Tier.SUSPICION] = min(
                    earliest.get(Tier.SUSPICION, first + self.cfg.persist_suspicion),
                    first + self.cfg.persist_suspicion,
                )
            if Tier.SUSPICION in earliest:
                earliest[Tier.CONFIRMED] = min(
                    earliest.get(Tier.CONFIRMED, earliest[Tier.SUSPICION]),
                    earliest[Tier.SUSPICION],
                )
        return Report(
            key=f"device:{device_id}",
            tier=tier,
            since=min(f.since for f in findings),
            entities=sorted({f.entity_id for f in findings} | set(silent)),
            findings=sorted(findings, key=lambda f: (-f.tier, f.since)),
            device_ids=[device_id],
            integration=self.metas[findings[0].entity_id].integration or None,
            next_at=earliest,
        )

    # ----------------------------------------------------------- persistence
    def dump(self) -> dict[str, Any]:
        def finding(f: Finding) -> dict[str, Any]:
            return {
                "det": f.detector,
                "e": f.entity_id,
                "d": f.device_id,
                "t": int(f.tier),
                "since": f.since.isoformat(),
                "last": f.last_true.isoformat(),
                "detail": f.detail,
                "reached": {k: v.isoformat() for k, v in f.reached.items()},
                "res": _iso(f.resolved_at),
            }

        return {
            "active": [finding(f) for f in self.active.values()],
            "resolved": [finding(f) for f in self.resolved],
            "tolerance": dict(self.tolerance),
            "downtimes": [[d.start.isoformat(), d.end.isoformat()] for d in self.downtimes],
            "peak": {k: [int(t), n] for k, (t, n) in self._peak.items()},
            "reached": {
                k: {t: ts.isoformat() for t, ts in v.items()} for k, v in self._reached.items()
            },
        }

    def restore(self, raw: dict[str, Any]) -> None:
        def ts(v: Any) -> datetime | None:
            return datetime.fromisoformat(v) if isinstance(v, str) else None

        def finding(r: dict[str, Any]) -> Finding | None:
            since, last = ts(r.get("since")), ts(r.get("last"))
            if r.get("det") not in ("baseline", "silent", "unavailable", "flapping", "dwell"):
                return None
            if since is None or last is None or r.get("e") not in self.metas:
                return None
            return Finding(
                r["det"],
                r["e"],
                str(r.get("d", "")),
                Tier(min(3, max(1, int(r.get("t", 1))))),
                since,
                last,
                dict(r.get("detail") or {}),
                {k: v for k, raw_ts in (r.get("reached") or {}).items() if (v := ts(raw_ts))},
                ts(r.get("res")),
            )

        for item in raw.get("active") or []:
            if (f := finding(item)) is not None:
                self.active[f.key] = f
                # Silent entities keep their real last report; the restored state is not one.
                live = self.live[f.entity_id]
                if f.detector == "silent" and (last := ts(f.detail.get("last"))):
                    live.last_update = last
                if f.detector == "unavailable" and (since := ts(f.detail.get("since"))):
                    live.last_update = live.last_update or since
                    live.unavailable_since = since
        for item in raw.get("resolved") or []:
            if (f := finding(item)) is not None and f.resolved_at is not None:
                self.resolved.append(f)
        self.tolerance = {
            str(k): float(v)
            for k, v in (raw.get("tolerance") or {}).items()
            if isinstance(v, (int, float)) and k in self.metas
        }
        for pair in raw.get("downtimes") or []:
            start, end = ts(pair[0]), ts(pair[1])
            if start and end:
                self.downtime(start, end)
        self._peak = {
            str(k): (Tier(min(3, max(1, int(v[0])))), int(v[1]))
            for k, v in (raw.get("peak") or {}).items()
        }
        self._reached = {
            str(k): {t: d for t, raw_ts in v.items() if (d := ts(raw_ts))}
            for k, v in (raw.get("reached") or {}).items()
        }
