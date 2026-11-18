"""Live evaluation: detectors, tier escalation, grouping, restart safety, notifications.

The integration would call ``feed`` from a ``state_changed``/``state_reported`` listener limited
to monitored entities and ``evaluate`` every 60 s. Everything is in memory; open findings and
mutes are persisted with HA ``Store`` so a restart keeps context (not modelled here).
"""

from __future__ import annotations

from collections import defaultdict, deque
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from .learn import EntityBaseline
from .model import (
    BEHAVIOUR_CLASSES,
    MIN_DWELL,
    ON_STATES,
    UNAVAILABLE,
    Config,
    Detector,
    Downtime,
    EntityMeta,
    Finding,
    Notification,
    Report,
    Sample,
    Tier,
)

SILENT_KINDS = frozenset({"silent", "unavailable"})
AVAILABILITY_WINDOW = timedelta(hours=1)
AVAILABILITY_FLAPS = 4
SHARED_OUTAGE_WINDOW = timedelta(minutes=15)


@dataclass
class Live:
    last_update: datetime | None = None
    real_state: str | None = None
    real_since: datetime | None = None
    unavailable_since: datetime | None = None
    transitions: deque[datetime] = field(default_factory=lambda: deque(maxlen=512))
    outage_starts: deque[datetime] = field(default_factory=lambda: deque(maxlen=64))
    values: deque[tuple[datetime, float]] = field(default_factory=lambda: deque(maxlen=512))


def plural_entities(n: int) -> str:
    if n == 1:
        return "1 entita"
    if 2 <= n <= 4:
        return f"{n} entity"
    return f"{n} entit"


def plural_devices(n: int) -> str:
    if n == 1:
        return "1 zařízení"
    return f"{n} zařízení"


class Engine:
    def __init__(
        self,
        metas: list[EntityMeta],
        baselines: dict[str, EntityBaseline],
        config: Config | None = None,
    ) -> None:
        self.cfg = config or Config()
        self.tz = ZoneInfo(self.cfg.timezone)
        self.metas = {m.entity_id: m for m in metas}
        self.baselines = dict(baselines)
        self.live: dict[str, Live] = defaultdict(Live)
        self.downtimes: list[Downtime] = []
        self.active: dict[str, Finding] = {}
        self.resolved: list[Finding] = []
        self.notifications: list[Notification] = []
        self._notified: dict[str, datetime] = {}
        self._deferred: dict[str, datetime] = {}
        self.away = False
        self.mass_outage_since: datetime | None = None
        self._peak: dict[str, Report] = {}  # report key → its worst/biggest version so far

    # ---------------------------------------------------------------- inputs
    def set_away(self, away: bool) -> None:
        """Optional presence hint (logical key, e.g. a household ``group``/``zone`` binding)."""
        self.away = away

    def downtime(self, start: datetime, end: datetime) -> None:
        """HA was stopped (or the recorder had a hole) between ``start`` and ``end``."""
        self.downtimes.append(Downtime(start, end))

    def update_meta(self, meta: EntityMeta) -> None:
        """Registry change. A new device behind the same entity_id starts a fresh warm-up."""
        old = self.metas.get(meta.entity_id)
        self.metas[meta.entity_id] = meta
        base = self.baselines.get(meta.entity_id)
        replaced = base is not None and base.device_id != meta.device_id
        if meta.removed or replaced or (old and old.device_id != meta.device_id):
            self.baselines.pop(meta.entity_id, None)
            self.live.pop(meta.entity_id, None)
            for key in [k for k, f in self.active.items() if f.entity_id == meta.entity_id]:
                del self.active[key]

    def feed(self, s: Sample) -> None:
        if s.entity_id not in self.metas:
            return
        live = self.live[s.entity_id]
        live.last_update = s.ts
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

    # ------------------------------------------------------------- helpers
    def _starts(self) -> list[datetime]:
        return [d.end for d in self.downtimes]

    def _in_grace(self, ts: datetime) -> bool:
        return any(st <= ts < st + self.cfg.restart_grace for st in self._starts())

    def _elapsed(self, since: datetime, now: datetime) -> timedelta:
        """Wall time minus HA downtime and post-restart grace: the clock pauses while blind."""
        el = now - since
        for d in self.downtimes:
            a, b = max(since, d.start), min(now, d.end + self.cfg.restart_grace)
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
        prev = self.active.get(key)
        held = now - prev.since if prev else timedelta(0)
        if hard and held >= self.cfg.persist_confirmed:
            return Tier.CONFIRMED
        if held >= self.cfg.persist_suspicion:
            return Tier.SUSPICION
        return Tier.OBSERVATION

    def _monitored(self, meta: EntityMeta) -> bool:
        return not meta.removed and meta.entity_id in self.baselines

    def warming_up(self) -> list[str]:
        """Entities still learning (no or too short history) – the UI shows „Učí se…“."""
        return sorted(
            e
            for e, m in self.metas.items()
            if not m.removed
            and (e not in self.baselines or self.baselines[e].days < self.cfg.warmup_days)
        )

    # ------------------------------------------------------------ detectors
    def _detect(self, now: datetime) -> dict[str, tuple[Detector, EntityMeta, Tier, dict]]:
        cfg = self.cfg
        hits: dict[str, tuple[Detector, EntityMeta, Tier, dict]] = {}
        for eid, meta in self.metas.items():
            if not self._monitored(meta):
                continue
            b = self.baselines[eid]
            live = self.live.get(eid)
            if live is None or live.last_update is None:
                continue
            warm = b.days >= cfg.warmup_days

            if live.unavailable_since is not None:
                el = self._elapsed(live.unavailable_since, now)
                limits = [
                    max(f, b.outage_p95 * k)
                    for f, k in zip(cfg.outage_floors, cfg.outage_factors, strict=True)
                ]
                tier = self._tier_by(el, limits)
                if tier:
                    hits[f"unavailable:{eid}"] = (
                        "unavailable",
                        meta,
                        tier,
                        {"minutes": el / timedelta(minutes=1)},
                    )
                continue

            if b.periodic and b.p95_interval is not None:
                el = self._elapsed(live.last_update, now)
                limits = [
                    max(f, b.p95_interval * k)
                    for f, k in zip(cfg.silent_floors, cfg.silent_factors, strict=True)
                ]
                tier = self._tier_by(el, limits)
                if tier:
                    hits[f"silent:{eid}"] = (
                        "silent",
                        meta,
                        tier,
                        {"minutes": el / timedelta(minutes=1)},
                    )
                    continue

            recent = [t for t in live.outage_starts if now - t <= AVAILABILITY_WINDOW]
            if len(recent) >= AVAILABILITY_FLAPS:
                key = f"flapping:{eid}"
                tier = self._persist_tier(key, now, hard=True)
                hits[key] = ("flapping", meta, tier, {"count": len(recent), "what": "availability"})
                continue

            if meta.kind == "numeric" and warm:
                self._detect_baseline(now, meta, b, live, hits)
            if meta.kind == "binary" and warm:
                self._detect_binary(now, meta, b, live, hits)
        return hits

    def _detect_baseline(self, now, meta, b, live, hits) -> None:
        cfg = self.cfg
        stat = b.hourly[now.astimezone(self.tz).hour]
        window = [v for t, v in live.values if now - t <= timedelta(hours=1)]
        if stat is None or not window or self._in_grace(now):
            return
        x = sum(window) / len(window)  # same shape as the hourly statistics mean
        z = (x - stat.median) / stat.spread
        outside = x > stat.hi + stat.spread or x < stat.lo - stat.spread
        behaviour = meta.device_class in BEHAVIOUR_CLASSES
        if abs(z) < (cfg.z_observe_behaviour if behaviour else cfg.z_observe) or not outside:
            return
        margin = cfg.envelope_spreads * stat.spread
        hard = abs(z) >= cfg.z_confirm and (x > stat.hi + margin or x < stat.lo - margin)
        key = f"baseline:{meta.entity_id}"
        tier = self._persist_tier(key, now, hard)
        if behaviour and z < 0:
            # Low consumption/light/CO2 follows the people, not the device.
            tier = min(tier, Tier.OBSERVATION if self.away else Tier.SUSPICION)
        elif self.away and not hard:
            tier = Tier.OBSERVATION  # holiday set-back of heating etc.: note it, do not worry
        detail = {"value": round(x, 2), "usual": round(stat.median, 2), "z": round(z, 1)}
        hits[key] = ("baseline", meta, tier, detail)

    def _detect_binary(self, now, meta, b, live, hits) -> None:
        cfg = self.cfg
        recent = [t for t in live.transitions if now - t <= cfg.flap_window]
        if len(recent) >= max(cfg.flap_min, cfg.flap_factor * b.flap_usual):
            key = f"flapping:{meta.entity_id}"
            tier = self._persist_tier(key, now, hard=True)
            hits[key] = ("flapping", meta, tier, {"count": len(recent), "what": "state"})
            return
        dwell_key = meta.device_class if meta.device_class in MIN_DWELL else meta.domain
        floor = MIN_DWELL.get(dwell_key)
        if (
            floor is None
            or live.real_state not in ON_STATES
            or live.real_since is None
            or b.dwell_n < cfg.dwell_min_episodes
            or b.dwell_p95 is None
        ):
            return
        limit = max(b.dwell_p95 * 3, floor)
        el = self._elapsed(live.real_since, now)
        tier = self._tier_by(el, [limit * k for k in cfg.dwell_factors])
        if tier:
            detail = {
                "minutes": el / timedelta(minutes=1),
                "usual": b.dwell_p95 / timedelta(minutes=1),
            }
            hits[f"dwell:{meta.entity_id}"] = ("dwell", meta, tier, detail)

    # ----------------------------------------------------------- evaluation
    def evaluate(self, now: datetime) -> list[Report]:
        cfg = self.cfg
        hits = self._detect(now)

        # Mass outage (HA/network/coordinator restart): one system note instead of N devices.
        mass = self._mass_outage(now)
        if mass:
            self.mass_outage_since = self.mass_outage_since or now
            hits = {k: h for k, h in hits.items() if h[0] not in SILENT_KINDS}
        else:
            self.mass_outage_since = None

        grace = self._in_grace(now)
        for key, (det, meta, tier, detail) in hits.items():
            f = self.active.get(key)
            if f is None:
                if grace:
                    continue  # nothing new is born in the first minutes after a restart
                f = Finding(det, meta.entity_id, meta.device_id, tier, now, now, detail)
                self.active[key] = f
            f.tier = max(f.tier, tier)  # sticky: a finding never de-escalates while active
            f.last_true = now
            f.detail = detail
        for key in [k for k in self.active if k not in hits]:
            f = self.active[key]
            if now - f.last_true >= cfg.clear_after:
                self.resolved.append(self.active.pop(key))

        reports = [self._sticky(r) for r in self._group(now)]
        for key in set(self._peak) - {r.key for r in reports}:
            del self._peak[key]
        self._notify(now, reports)
        return reports

    def _sticky(self, r: Report) -> Report:
        """While a report is open, its tier and headline never shrink (no 17 → 7 → 1 ticker)."""
        peak = self._peak.get(r.key)
        if peak is None or (r.tier, len(r.entities)) >= (peak.tier, len(peak.entities)):
            self._peak[r.key] = r
            return r
        r.tier = max(r.tier, peak.tier)
        r.title = peak.title
        return r

    def _quiet(self, eid: str, now: datetime) -> bool | None:
        """Looser than the silent detector (2 × own p95, ≥ 15 min): used for grouping only."""
        b = self.baselines.get(eid)
        live = self.live.get(eid)
        if b is None or not b.periodic or b.p95_interval is None or live is None:
            return None
        if live.last_update is None:
            return None
        limit = max(timedelta(minutes=15), b.p95_interval * 2)
        since = live.unavailable_since or live.last_update
        return self._elapsed(since, now) >= limit

    def _mass_outage(self, now: datetime) -> bool:
        """Most devices quiet across several integrations = HA/network problem, not devices.

        Uses a looser "quiet" test (2 × own p95, ≥ 15 min) than the silent detector so the
        mass state is known before the first per-device observation would be born.
        """
        devices: dict[str, bool] = {}
        integrations: set[str] = set()
        for eid, b in self.baselines.items():
            meta = self.metas.get(eid)
            if not b.periodic or b.p95_interval is None or meta is None or meta.removed:
                continue
            quiet = self._quiet(eid, now)
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
    def _simultaneous_device_outage(self, group: list[Report]) -> bool:
        if len(group) != 2:
            return False
        last_updates = []
        for r in group:
            device_id = r.findings[0].device_id
            monitored = {
                e for e, m in self.metas.items() if m.device_id == device_id and self._monitored(m)
            }
            if not monitored.issubset(r.entities):
                return False
            last_updates.append(
                max(self.live[e].unavailable_since or self.live[e].last_update for e in monitored)
            )
        return abs(last_updates[0] - last_updates[1]) <= SHARED_OUTAGE_WINDOW

    def _group(self, now: datetime) -> list[Report]:
        by_device: dict[str, list[Finding]] = defaultdict(list)
        for f in self.active.values():
            by_device[f.device_id].append(f)
        reports: list[Report] = []
        for device_id, findings in by_device.items():
            reports.append(self._device_report(device_id, findings, now))

        # Two whole devices becoming silent together also point to a shared connection.
        by_integration: dict[str, list[Report]] = defaultdict(list)
        for r in reports:
            if all(f.detector in SILENT_KINDS for f in r.findings):
                integ = self.metas[r.entities[0]].integration
                by_integration[integ].append(r)
        for integ, group in by_integration.items():
            if len(
                group
            ) < self.cfg.integration_min_devices and not self._simultaneous_device_outage(group):
                continue
            for r in group:
                reports.remove(r)
            reports.append(
                Report(
                    key=f"integration:{integ}",
                    title=f"Integrace {integ} neodpovídá ({plural_devices(len(group))})",
                    tier=max(r.tier for r in group),
                    since=min(r.since for r in group),
                    entities=sorted(e for r in group for e in r.entities),
                    findings=[f for r in group for f in r.findings],
                    scope="integration",
                )
            )
        if self.mass_outage_since is not None:
            reports.append(
                Report(
                    key="system",
                    title="Většina senzorů mlčí – nejspíš restart nebo výpadek sítě",
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
        metas = [self.metas[f.entity_id] for f in findings]
        device_name = metas[0].device_name
        monitored = [
            e for e, m in self.metas.items() if m.device_id == device_id and self._monitored(m)
        ]
        silent: list[str] = []
        if any(f.detector in SILENT_KINDS for f in findings):
            # count every quiet sibling, so the title does not tick 2 → 7 → 17 as they cross
            silent = sorted(
                {f.entity_id for f in findings if f.detector in SILENT_KINDS}
                | {e for e in monitored if self._quiet(e, now)}
            )
        tier = max(f.tier for f in findings)
        # Corroboration: most of a device going quiet together is a device fault, not noise.
        # Raised one step at a time: a quiet device is a suspicion after persist_suspicion,
        # and confirmed once the silence itself reaches the suspicion threshold.
        if len(silent) >= 2 and len(silent) >= 0.5 * len(monitored):
            if tier >= Tier.SUSPICION:
                tier = min(Tier.CONFIRMED, Tier(tier + 1))
            elif now - min(f.since for f in findings) >= self.cfg.persist_suspicion:
                tier = Tier.SUSPICION
        top = max(findings, key=lambda f: (f.tier, -f.since.timestamp()))
        if len(silent) >= 2:
            title = f"{device_name} neodpovídá ({plural_entities(len(silent))})"
        else:
            title = self._title(top)
        return Report(
            key=f"device:{device_id}",
            title=title,
            tier=tier,
            since=min(f.since for f in findings),
            entities=sorted({f.entity_id for f in findings} | set(silent)),
            findings=sorted(findings, key=lambda f: (-f.tier, f.since)),
        )

    def _title(self, f: Finding) -> str:
        m = self.metas[f.entity_id]
        if f.detector == "silent":
            return f"{m.device_name}: {m.name} neposílá data"
        if f.detector == "unavailable":
            return f"{m.device_name}: {m.name} je nedostupné"
        if f.detector == "flapping":
            if f.detail.get("what") == "availability":
                return f"{m.device_name} opakovaně vypadává"
            return f"{m.name} neobvykle často přepíná"
        if f.detector == "baseline":
            z = float(f.detail.get("z", 0))
            return f"{m.name}: neobvykle {'vysoko' if z > 0 else 'nízko'}"
        verb = {"light": "svítí", "switch": "je zapnuté"}.get(m.domain, "je otevřené")
        return f"{m.name} {verb} déle než obvykle"

    # --------------------------------------------------------- notifications
    def _quiet_hours(self, now: datetime) -> bool:
        if self.cfg.quiet_hours is None:
            return False
        start, end = self.cfg.quiet_hours
        h = now.astimezone(self.tz).hour
        return h >= start or h < end if start > end else start <= h < end

    def _notify(self, now: datetime, reports: list[Report]) -> None:
        confirmed = {r.key: r for r in reports if r.tier == Tier.CONFIRMED}
        for key in list(self._deferred):
            if key not in confirmed:
                del self._deferred[key]  # resolved during quiet hours: nobody is woken up later
        for key, r in confirmed.items():
            last = self._notified.get(key)
            if last is not None and now - last < self.cfg.notify_cooldown:
                continue
            if self._quiet_hours(now):
                self._deferred.setdefault(key, now)
                continue
            self._notified[key] = now
            self.notifications.append(
                Notification(key, r.title, now, deferred_from=self._deferred.pop(key, None))
            )
