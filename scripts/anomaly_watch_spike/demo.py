"""Snapshot the engine on one synthetic fault day → JSON for the UI mockups.

``python -m scripts.anomaly_watch_spike.demo > anomaly-demo.json``. The mockups render this
output, so the cards show what the algorithm really produces (titles, tiers, grouping).
"""

from __future__ import annotations

import json
import sys
from datetime import datetime, timedelta

from . import synth
from .engine import Engine
from .learn import learn
from .model import Report, Tier

T0 = datetime(2026, 11, 9, 8, 0, tzinfo=synth.TZ)
SNAPSHOTS = {
    "ok": T0 + timedelta(minutes=20),
    "observations": T0 + timedelta(hours=1, minutes=35),
    "suspicion": T0 + timedelta(hours=2, minutes=40),
    "confirmed": T0 + timedelta(hours=3, minutes=50),
}
TIER = {Tier.OBSERVATION: "observation", Tier.SUSPICION: "suspicion", Tier.CONFIRMED: "confirmed"}


def _report(eng: Engine, r: Report) -> dict:
    return {
        "key": r.key,
        "scope": r.scope,
        "title": r.title,
        "tier": TIER[r.tier],
        "since": r.since.isoformat(),
        "device": eng.metas[r.entities[0]].device_name if r.entities else None,
        "entities": [
            {"entity_id": e, "name": eng.metas[e].name, "device_class": eng.metas[e].device_class}
            for e in r.entities
        ],
        "findings": [
            {
                "detector": f.detector,
                "entity": eng.metas[f.entity_id].name,
                "tier": TIER[f.tier],
                "since": f.since.isoformat(),
                "detail": f.detail,
            }
            for f in r.findings
        ],
    }


def main() -> None:
    metas = synth.house()
    hist = synth.stream(T0 - timedelta(days=21), T0)
    eng = Engine(metas, learn(metas, hist, [], T0))
    for s in hist:
        if s.ts >= T0 - timedelta(hours=26):
            eng.feed(s)
    dishwasher = {m.entity_id for m in metas if m.device_id == "dev_dishwasher"}
    live = synth.stream(T0, T0 + timedelta(hours=5))
    live = synth.drop(live, {"sensor.demo_cellar_humidity"}, T0)
    live = synth.drop(live, dishwasher, T0 + timedelta(hours=1, minutes=30))
    live = synth.transform(
        live,
        "sensor.demo_living_temperature",
        T0 + timedelta(minutes=30),
        T0 + timedelta(hours=5),
        lambda s: f"{float(s.state) + 7:.2f}",
    )
    out: dict = {"generated_for": T0.isoformat(), "watched": len(eng.baselines), "states": {}}
    at_snapshot = {at: name for name, at in SNAPSHOTS.items()}
    now, i = T0, 0
    while now <= max(SNAPSHOTS.values()):
        while i < len(live) and live[i].ts <= now:
            eng.feed(live[i])
            i += 1
        reports = eng.evaluate(now)
        if now in at_snapshot:
            # serialise right away: findings are live objects that keep changing
            out["states"][at_snapshot[now]] = {
                "now": now.isoformat(),
                "reports": [_report(eng, r) for r in reports],
            }
        now += timedelta(minutes=5)
    out["notifications"] = [{"title": n.title, "at": n.at.isoformat()} for n in eng.notifications]
    json.dump(out, sys.stdout, ensure_ascii=False, indent=1, default=str)


if __name__ == "__main__":
    main()
