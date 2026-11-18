"""Export synthetic engine snapshots and their chart data for the mockups.

Run with ``python -m scripts.anomaly_watch_spike.demo > anomaly-demo.json``.
"""

from __future__ import annotations

import json
import sys
from collections import Counter
from datetime import datetime, timedelta
from math import ceil
from statistics import mean

from . import synth
from .engine import Engine
from .learn import learn
from .model import Report, Tier

T0 = datetime(2026, 11, 9, 8, 0, tzinfo=synth.TZ)
STEP = timedelta(minutes=5)
MINUTE = timedelta(minutes=1)
STEPS_PER_HOUR = timedelta(hours=1) // STEP
TEMPERATURE = "sensor.demo_living_temperature"
SNAPSHOTS = {
    "ok": T0 + timedelta(minutes=20),
    "observations": T0 + timedelta(hours=1, minutes=35),
    "suspicion": T0 + timedelta(hours=2, minutes=40),
    "confirmed": T0 + timedelta(hours=3, minutes=50),
}
TIER = {Tier.OBSERVATION: "observation", Tier.SUSPICION: "suspicion", Tier.CONFIRMED: "confirmed"}


def _report(eng: Engine, r: Report, reached: dict[Tier, datetime]) -> dict:
    device_ids = sorted({eng.metas[e].device_id for e in r.entities})
    result = {
        "key": r.key,
        "scope": r.scope,
        "title": r.title,
        "tier": TIER[r.tier],
        "since": r.since,
        "device_ids": device_ids,
        "entities": [eng.metas[e].name for e in r.entities],
        "reached": {TIER[tier]: at for tier, at in reached.items()},
        "earliest": {},
    }
    if not r.findings:
        return result

    f = r.findings[0]
    if r.scope == "device" and all(f.detector == "silent" for f in r.findings):
        cadences = [eng.baselines[e].p50_interval for e in r.entities]
        updates = [eng.live[e].last_update for e in r.entities]
        typical = round(mean(c / MINUTE for c in cadences if c is not None))
        last = max(t for t in updates if t is not None).astimezone(eng.tz)
        last = (last + MINUTE / 2).replace(second=0, microsecond=0)
        result["gap"] = {"last": last, "since": last + typical * MINUTE, "interval": typical}

        # In this demo, each group starts with silence and there are no recorder gaps.
        if r.tier != Tier.CONFIRMED:
            count = sum(
                m.device_id == device_ids[0] and m.entity_id in eng.baselines
                for m in eng.metas.values()
            )
            for tier in Tier:
                if tier <= r.tier:
                    continue
                threshold = (
                    Tier.SUSPICION
                    if tier == Tier.CONFIRMED and len(r.entities) >= max(2, count / 2)
                    else tier
                )
                idx = threshold - 1
                eligible = min(
                    update + max(eng.cfg.silent_floors[idx], p95 * eng.cfg.silent_factors[idx])
                    for e, update in zip(r.entities, updates, strict=True)
                    if update is not None and (p95 := eng.baselines[e].p95_interval) is not None
                )
                result["earliest"][TIER[tier]] = T0 + ceil((eligible - T0) / STEP) * STEP
    elif f.detector == "baseline":
        result["value"] = {"now": f.detail["value"], "usual": f.detail["usual"], "unit": "°C"}
        result["earliest"]["suspicion"] = f.since + eng.cfg.persist_suspicion

    result["phone_at"] = next(
        (n.at for n in reversed(eng.notifications) if n.report_key == r.key), None
    )
    return result


def main() -> None:
    metas = synth.house()
    hist = synth.stream(T0 - timedelta(days=21), T0)
    eng = Engine(metas, learn(metas, hist, [], T0))
    counts = Counter(m.device_id for m in metas if m.entity_id in eng.baselines)
    devices = {
        m.device_id: {"id": m.device_id, "name": m.device_name, "count": counts[m.device_id]}
        for m in metas
        if m.device_id in counts
    }
    start = T0 - timedelta(hours=24)
    for s in hist:
        if start - timedelta(hours=26) <= s.ts < start:
            eng.feed(s)

    dishwasher = {m.entity_id for m in metas if m.device_id == "dev_dishwasher"}
    live = synth.stream(T0, max(SNAPSHOTS.values()) + STEP)
    live = synth.drop(live, {"sensor.demo_cellar_humidity"}, T0)
    live = synth.drop(live, dishwasher, T0 + timedelta(hours=1, minutes=30))
    ramp_start = T0 - timedelta(minutes=30)
    live = [s for s in hist if start <= s.ts] + live
    live = synth.transform(
        live,
        TEMPERATURE,
        ramp_start,
        max(SNAPSHOTS.values()) + STEP,
        lambda s: f"{float(s.state) + 7 * min(1, (s.ts - ramp_start) / (90 * MINUTE)):.2f}",
    )

    learned = eng.baselines[TEMPERATURE].hourly
    out: dict = {
        "devices": list(devices.values()),
        "usual": [
            {"lo": stat.median - stat.spread, "hi": stat.median + stat.spread} for stat in learned
        ],
        "states": {},
    }
    at_snapshot = {at: name for name, at in SNAPSHOTS.items()}
    reached: dict[str, dict[Tier, datetime]] = {}
    temperatures = []
    health = []
    now, i = start, 0
    while now <= max(SNAPSHOTS.values()):
        while i < len(live) and live[i].ts <= now:
            eng.feed(live[i])
            i += 1
        reports = eng.evaluate(now)
        reached = {r.key: reached.get(r.key, {}) for r in reports}
        for r in reports:
            # Grouping can reach suspicion and confirmation in the same evaluation.
            for tier in Tier:
                if tier <= r.tier:
                    reached[r.key].setdefault(tier, now)
        health.append(max((r.tier for r in reports), default=0))
        values = [v for t, v in eng.live[TEMPERATURE].values if now - t <= timedelta(hours=1)]
        if now.date() == T0.date() and values:
            temperatures.append(
                {"minute": now.hour * 60 + now.minute, "value": round(mean(values), 2)}
            )
        if now in at_snapshot:
            hour_ends = range(
                len(health) - 1, len(health) - 1 - 24 * STEPS_PER_HOUR, -STEPS_PER_HOUR
            )
            out["states"][at_snapshot[now]] = {
                "now": now,
                "reports": [_report(eng, r, reached[r.key]) for r in reports],
                "temperature": temperatures.copy(),
                "health": [
                    TIER.get(max(health[j + 1 - STEPS_PER_HOUR : j + 1]), "ok")
                    for j in reversed(hour_ends)
                ],
            }
        now += STEP
    json.dump(out, sys.stdout, ensure_ascii=False, indent=1, default=datetime.isoformat)


if __name__ == "__main__":
    main()
