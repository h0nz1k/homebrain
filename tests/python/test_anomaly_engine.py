"""Hlídání domu (#128) – detection engine on a synthetic demo house (no HA, no real data).

Each test injects one fault (or one false-positive trap) into a normal synthetic stream and
checks what the owner would see: grouped reports and their tier. Ported from the spike (#129).
"""

import time as _time
from dataclasses import replace
from datetime import datetime, timedelta

import anomaly_synth as synth
import pytest

from custom_components.homebrain.anomaly.engine import Engine
from custom_components.homebrain.anomaly.learn import EntityBaseline, HourStat, learn
from custom_components.homebrain.anomaly.model import Config, Downtime, EntityMeta, Sample, Tier

TZ = synth.TZ
T0 = datetime(2026, 11, 9, 8, 0, tzinfo=TZ)  # Monday morning
STEP = timedelta(minutes=5)
DISHWASHER = {m.entity_id for m in synth.house() if m.device_id == "dev_dishwasher"}


def _local(day: int, hour: int, minute: int = 0) -> datetime:
    return datetime(2026, 11, day, hour, minute, tzinfo=TZ)


@pytest.fixture(scope="module")
def history():
    return synth.stream(T0 - timedelta(days=21), T0)


@pytest.fixture(scope="module")
def baselines(history):
    return learn(synth.house(), history, [], T0, TZ)


def _engine(history, baselines, config=None, metas=None):
    eng = Engine(metas or synth.house(), baselines, TZ, config)
    for s in history:
        if s.ts >= T0 - timedelta(hours=26):
            eng.feed(s)  # live state at start-up = last known state of every entity
    return eng


def _run(eng, samples, hours, start=T0, step=STEP, hooks=None):
    return synth.run(eng, samples, start, start + timedelta(hours=hours), step, hooks)


def _first(timeline, pred):
    return next((now for now, reps in timeline if any(pred(r) for r in reps)), None)


def _keys(timeline):
    return {r.key for _, reps in timeline for r in reps}


def _detectors(timeline):
    return {f.detector for _, reps in timeline for r in reps for f in r.findings}


def _max_tier(timeline):
    return max((r.tier for _, reps in timeline for r in reps), default=None)


# ------------------------------------------------------------------ quiet baseline
def test_quiet_day_has_no_findings(history, baselines):
    """24 h of normal life incl. the washer's nightly cloud outage: nothing at all."""
    eng = _engine(history, baselines)
    tl = _run(eng, synth.stream(T0, T0 + timedelta(hours=25)), 24)
    assert _keys(tl) == set()


# ------------------------------------------------------------------ silent / grouping
def test_dishwasher_silent_is_one_grouped_report(history, baselines):
    eng = _engine(history, baselines)
    gone = T0 + timedelta(hours=1)
    live = synth.stream(T0, T0 + timedelta(hours=12))
    live = synth.drop(live, DISHWASHER, gone, T0 + timedelta(hours=5))  # back after 4 h
    live = synth.drop(live, DISHWASHER, T0 + timedelta(hours=7))  # and gone again
    tl = _run(eng, live, 11)

    assert _keys(tl) == {"device:dev_dishwasher"}
    # the entity count never shrinks while the report is open (no 17 → 7 → 1)
    assert eng.peak_entities("device:dev_dishwasher") == 17
    first_obs = _first(tl, lambda r: r.tier == Tier.OBSERVATION)
    confirmed = _first(tl, lambda r: r.tier == Tier.CONFIRMED)
    # clocks run from each entity's last report (≤ 10 min before ``gone``)
    assert timedelta(minutes=20) <= first_obs - gone <= timedelta(minutes=45)
    # 17 entities silent together = device fault: confirmed after 2 h, not the single-entity 6 h
    assert timedelta(hours=1, minutes=50) <= confirmed - gone <= timedelta(hours=2, minutes=15)
    suspected = _first(tl, lambda r: r.tier == Tier.SUSPICION)
    assert suspected - first_obs >= timedelta(minutes=30)
    assert confirmed - suspected >= timedelta(minutes=30)
    # recovery clears it ...
    assert not any(
        reps
        for now, reps in tl
        if T0 + timedelta(hours=5, minutes=30) <= now < T0 + timedelta(hours=7)
    )
    # ... the relapse is reported again, and an already confirmed device keeps evaluating
    later = [(n, r) for n, r in tl if n > T0 + timedelta(hours=7)]
    assert _first(later, lambda r: r.tier == Tier.CONFIRMED)
    final = tl[-1][1][0]
    assert final.reached.keys() == {"observation", "suspicion", "confirmed"}
    assert final.reached["observation"] <= final.reached["suspicion"] <= final.reached["confirmed"]


def test_single_silent_sensor_escalates_slowly(history, baselines):
    eng = _engine(history, baselines)
    gone = T0 + timedelta(hours=1)
    live = synth.drop(
        synth.stream(T0, T0 + timedelta(hours=9)), {"sensor.demo_living_temperature"}, gone
    )
    tl = _run(eng, live, 8)
    assert _keys(tl) == {"device:dev_living_climate"}
    assert _detectors(tl) == {"silent"}
    obs = _first(tl, lambda r: r.tier == Tier.OBSERVATION)
    sus = _first(tl, lambda r: r.tier == Tier.SUSPICION)
    conf = _first(tl, lambda r: r.tier == Tier.CONFIRMED)
    assert obs - gone <= timedelta(minutes=45)
    assert timedelta(hours=2) <= sus - gone <= timedelta(hours=2, minutes=15)
    assert timedelta(hours=6) <= conf - gone <= timedelta(hours=6, minutes=15)
    # projected next tiers are anchored to the last report, not to the first observation
    report = next(r for now, reps in tl if now == obs for r in reps)
    last = datetime.fromisoformat(report.findings[0].detail["last"])
    assert last <= gone
    assert report.earliest["suspicion"] - last == timedelta(hours=2)
    assert report.earliest["confirmed"] - last == timedelta(hours=6)


def test_integration_down_rolls_up_devices(history, baselines):
    zigbee = {
        m.entity_id for m in synth.house() if m.integration == "demo_zigbee" and m.kind == "numeric"
    }
    eng = _engine(history, baselines)
    live = synth.drop(synth.stream(T0, T0 + timedelta(hours=4)), zigbee, T0 + timedelta(hours=1))
    tl = _run(eng, live, 4)
    (final,) = tl[-1][1]
    assert final.key == "integration:demo_zigbee" and final.scope == "integration"
    assert len(final.device_ids) == 4
    assert final.tier == Tier.CONFIRMED and len(final.entities) == 8


@pytest.mark.parametrize("delay", [0, 40])
def test_two_whole_devices_share_a_report_only_for_simultaneous_silence(history, baselines, delay):
    eng = _engine(history, baselines)
    start = T0 + timedelta(hours=1)
    live = synth.stream(T0, T0 + timedelta(hours=4))
    for room, minutes in (("living", 0), ("cellar", delay)):
        entities = {m.entity_id for m in synth.house() if m.device_id == f"dev_{room}_climate"}
        live = synth.drop(live, entities, start + timedelta(minutes=minutes))
    _, reports = _run(eng, live, 4)[-1]
    assert {r.key for r in reports} == (
        {"integration:demo_zigbee"}
        if delay == 0
        else {"device:dev_living_climate", "device:dev_cellar_climate"}
    )


def test_mass_outage_is_one_system_note_not_n_alarms(history, baselines):
    periodic = {e for e, b in baselines.items() if b.periodic}
    eng = _engine(history, baselines)
    live = synth.drop(synth.stream(T0, T0 + timedelta(hours=8)), periodic, T0 + timedelta(hours=1))
    tl = _run(eng, live, 8)
    assert _keys(tl) == {"system"}
    assert _max_tier(tl) == Tier.OBSERVATION


# ------------------------------------------------------------------ baseline
@pytest.mark.parametrize(("spread", "value"), [(0, "0"), (0, "0.001"), (0.000001, "0.0028")])
def test_constant_baseline_ignores_zero_and_noise(spread, value):
    meta = EntityMeta(
        "sensor.demo_power", "Výkon", "demo", "Zařízení", "numeric", "power", unit="kW"
    )
    baseline = EntityBaseline(
        meta.entity_id, meta.device_id, 21, [HourStat(0, spread, 0, 0, 21)] * 24
    )
    baseline = EntityBaseline.from_dict(baseline.as_dict())
    eng = Engine([meta], {meta.entity_id: baseline}, TZ)
    eng.feed(Sample(meta.entity_id, T0, value))
    assert eng.evaluate(T0) == []


@pytest.mark.parametrize(("value", "tier"), [("1.4", Tier.OBSERVATION), ("2.0", Tier.CONFIRMED)])
def test_irregular_load_only_escalates_for_unseen_magnitudes(value, tier):
    meta = EntityMeta(
        "sensor.demo_power", "Výkon", "demo", "Zařízení", "numeric", "power", unit="kW"
    )
    history = [
        Sample(
            meta.entity_id,
            T0 - timedelta(days=day) + timedelta(hours=hour),
            "1.4" if hour == 12 else "0",
        )
        for day in range(1, 22)
        for hour in range(24)
    ]
    base = learn([meta], history, [], T0, TZ)[meta.entity_id]
    assert base.hourly[T0.hour].median == 0
    eng = Engine([meta], {meta.entity_id: EntityBaseline.from_dict(base.as_dict())}, TZ)
    for mins in (0, 30, 120, 180):
        now = T0 + timedelta(minutes=mins)
        eng.feed(Sample(meta.entity_id, now, value))
        (report,) = eng.evaluate(now)
        assert report.findings[0].detail["seen_before"] is (tier == Tier.OBSERVATION)
        if tier == Tier.OBSERVATION:
            assert report.earliest == {}
            assert report.tier == tier
    assert report.tier == tier
    if tier == Tier.OBSERVATION:
        now = T0 + timedelta(hours=5)
        eng.feed(Sample(meta.entity_id, now, "2.0"))
        (report,) = eng.evaluate(now)
        assert report.tier == Tier.OBSERVATION
        assert report.earliest["suspicion"] == now + timedelta(minutes=30)


def test_freezer_warming_is_confirmed(history, baselines):
    eng = _engine(history, baselines)
    start = T0 + timedelta(hours=2)

    def warm(s: Sample) -> str:
        minutes = (s.ts - start) / timedelta(minutes=1)
        return f"{min(4.0, -18 + 22 * minutes / 60):.2f}"

    live = synth.transform(
        synth.stream(T0, T0 + timedelta(hours=7)),
        "sensor.demo_freezer_temperature",
        start,
        T0 + timedelta(hours=7),
        warm,
    )
    tl = _run(eng, live, 7)
    assert _keys(tl) == {"device:dev_freezer"}
    assert _detectors(tl) == {"baseline"}
    obs = _first(tl, lambda r: r.tier >= Tier.OBSERVATION)
    sus = _first(tl, lambda r: r.tier >= Tier.SUSPICION)
    conf = _first(tl, lambda r: r.tier == Tier.CONFIRMED)
    assert obs < sus < conf
    assert conf - obs >= timedelta(hours=2)
    detail = tl[-1][1][0].findings[0].detail
    assert detail["z"] > 0 and detail["seen_before"] is False


def test_warm_afternoon_is_suspicion_at_most(history, baselines):
    """+7 °C in the living room (sun through the window) is odd, but not a fault."""
    eng = _engine(history, baselines)
    a, b = T0 + timedelta(hours=4), T0 + timedelta(hours=10)
    live = synth.transform(
        synth.stream(T0, T0 + timedelta(hours=12)),
        "sensor.demo_living_temperature",
        a,
        b,
        lambda s: f"{float(s.state) + 7:.2f}",
    )
    tl = _run(eng, live, 12)
    assert _max_tier(tl) == Tier.SUSPICION
    # a suspicion that can only become a fault in an extreme has no projected confirmation
    sus = next(r for _, reps in tl for r in reps if r.tier == Tier.SUSPICION)
    assert "confirmed" not in sus.earliest


# ------------------------------------------------------------------ flapping
def test_flapping_plug(history, baselines):
    eng = _engine(history, baselines)
    a = T0 + timedelta(hours=2)
    burst = [
        Sample("switch.demo_aquarium_plug", a + timedelta(seconds=30 * i), "off" if i % 2 else "on")
        for i in range(2 * 60 * 3)
    ]
    live = sorted(synth.stream(T0, T0 + timedelta(hours=6)) + burst, key=lambda s: s.ts)
    tl = _run(eng, live, 6)
    assert _keys(tl) == {"device:dev_aquarium_plug"} and _detectors(tl) == {"flapping"}
    conf = _first(tl, lambda r: r.tier == Tier.CONFIRMED)
    assert timedelta(hours=2) <= conf - a <= timedelta(hours=2, minutes=30)


def test_availability_flapping(history, baselines):
    eng = _engine(history, baselines)
    a = T0 + timedelta(hours=1)
    eid = "sensor.demo_freezer_temperature"
    burst = []
    for i in range(12):  # drops out for 2 min every 10 min
        t = a + timedelta(minutes=10 * i)
        burst += [Sample(eid, t, "unavailable"), Sample(eid, t + timedelta(minutes=2), "-18.0")]
    live = sorted(synth.stream(T0, T0 + timedelta(hours=4)) + burst, key=lambda s: s.ts)
    tl = _run(eng, live, 4)
    assert any(
        f.detail.get("what") == "availability" for _, reps in tl for r in reps for f in r.findings
    )


def _demo_weather():
    return [
        EntityMeta(f"sensor.demo_weather_{i}", "Hodnota", "demo_weather", "Stanice", "numeric")
        for i in range(35)
    ]


@pytest.mark.parametrize("learned", [False, True])
def test_conditional_sensor_flapping_on_healthy_device(learned):
    metas = _demo_weather()
    eid = metas[0].entity_id

    def flaps(at):
        return [
            Sample(eid, at + timedelta(minutes=10 * i + offset), state)
            for i in range(21)
            for offset, state in ((0, "unknown" if i % 2 else "unavailable"), (2, "1"))
        ]

    bases = {m.entity_id: EntityBaseline(m.entity_id, m.device_id, 21) for m in metas}
    if learned:
        history = [
            Sample(eid, T0 - timedelta(days=21), "1"),
            *(s for day in range(20, 0, -1) for s in flaps(T0 - timedelta(days=day))),
        ]
        trained = learn(metas, history, [], T0, TZ)[eid]
        assert trained.availability_ratio == pytest.approx(1 - 20 * 21 * 2 / (21 * 24 * 60))
        assert trained.availability_flaps_usual == 7
        bases[eid] = EntityBaseline.from_dict(trained.as_dict())
    eng = Engine(metas, bases, TZ)
    healthy = [Sample(m.entity_id, T0, "1") for m in metas[1:]]
    timeline = _run(eng, [*healthy, *flaps(T0)], 4, step=timedelta(minutes=1))
    reports = [r for _, reports in timeline for r in reports]
    if learned:
        assert reports == []
    else:
        assert reports
        assert all(
            r.tier == Tier.OBSERVATION and r.entities == [eid] and not r.earliest for r in reports
        )


def test_whole_device_unavailability_reaches_fault_on_schedule():
    metas = _demo_weather()
    bases = {m.entity_id: EntityBaseline(m.entity_id, m.device_id, 21) for m in metas}
    eng = Engine(metas, bases, TZ)
    for meta in metas:
        eng.feed(Sample(meta.entity_id, T0, "unavailable"))
    for mins, tier in (
        (29, None),
        (30, Tier.OBSERVATION),
        (60, Tier.SUSPICION),
        (119, Tier.SUSPICION),
        (120, Tier.CONFIRMED),
    ):
        reports = eng.evaluate(T0 + timedelta(minutes=mins))
        if tier is None:
            assert reports == []
        else:
            (report,) = reports
            assert report.tier == tier
            assert len(report.entities) == len(metas)
            assert {f.detector for f in report.findings} == {"unavailable"}


# ------------------------------------------------------------------ dwell
def test_door_left_open_at_night(history, baselines):
    eng = _engine(history, baselines)
    door = "binary_sensor.demo_front_door"
    opened = _local(9, 23)
    live = synth.drop(
        synth.stream(T0, T0 + timedelta(hours=26)), {door}, opened - timedelta(minutes=1)
    )
    live = sorted(live + [Sample(door, opened, "on")], key=lambda s: s.ts)
    tl = _run(eng, live, 25)
    assert _keys(tl) == {"device:dev_front_door"} and _detectors(tl) == {"dwell"}
    conf = _first(tl, lambda r: r.tier == Tier.CONFIRMED)
    assert conf - opened <= timedelta(hours=1, minutes=5)


# ------------------------------------------------------------------ false-positive traps
@pytest.mark.parametrize("down", [timedelta(minutes=20), timedelta(hours=3)])
def test_ha_restart_creates_no_findings(history, baselines, down):
    eng = _engine(history, baselines)
    at = T0 + timedelta(hours=3)
    live = synth.restart(
        synth.stream(T0, T0 + timedelta(hours=25)),
        synth.house(),
        at,
        down,
        known=synth.last_states(history),
    )
    tl = synth.run(eng, live, T0, T0 + timedelta(hours=24), STEP, down=(at, at + down))
    assert _keys(tl) == set()


def test_recorder_gap_in_history_does_not_skew_learning(history):
    gap = Downtime(T0 - timedelta(days=4, hours=3), T0 - timedelta(days=4))
    holey = synth.restart(history, synth.house(), gap.start, gap.end - gap.start)
    base = learn(synth.house(), holey, [gap], T0, TZ)
    ref = learn(synth.house(), history, [], T0, TZ)
    for eid, b in base.items():
        if b.p95_interval is not None:
            assert b.p95_interval <= ref[eid].p95_interval * 1.1, eid
        # an outage cut by the gap is unknowable and dropped, never counted twice
        assert ref[eid].outages - 1 <= b.outages <= ref[eid].outages, eid
    eng = _engine(holey, base)
    assert _keys(_run(eng, synth.stream(T0, T0 + timedelta(hours=13)), 12)) == set()


@pytest.mark.parametrize(
    "learn_until",
    [datetime(2026, 10, 25, 0, 0, tzinfo=TZ), datetime(2026, 3, 29, 0, 0, tzinfo=TZ)],
    ids=["autumn-fallback", "spring-forward"],
)
def test_dst_change_creates_no_findings(learn_until):
    metas = synth.house()
    hist = synth.stream(learn_until - timedelta(days=21), learn_until)
    eng = Engine(metas, learn(metas, hist, [], learn_until, TZ), TZ)
    for s in hist[-5000:]:
        eng.feed(s)
    live = synth.stream(learn_until, learn_until + timedelta(hours=31))
    tl = synth.run(eng, live, learn_until, learn_until + timedelta(hours=30), STEP)
    assert _keys(tl) == set()


def test_vacation_week(history, baselines):
    def away(ts):
        return ts >= T0

    live = synth.stream(T0, T0 + timedelta(days=7, hours=1), away=away)
    eng = _engine(history, baselines)
    eng.set_away(True)
    tl = _run(eng, live, 24 * 7, step=timedelta(minutes=15))
    assert _max_tier(tl) in (None, Tier.OBSERVATION)
    # without the presence hint: may be noted/suspected, never a fault
    eng = _engine(history, baselines)
    tl = _run(eng, live, 24 * 7, step=timedelta(minutes=15))
    assert _max_tier(tl) in (None, Tier.OBSERVATION, Tier.SUSPICION)


def test_sensor_replaced_restarts_warm_up(history, baselines):
    eng = _engine(history, baselines)
    at = T0 + timedelta(hours=1)
    new_living = "sensor.demo_living_temperature"
    old_bedroom, new_bedroom = (
        "sensor.demo_bedroom_temperature",
        "sensor.demo_bedroom_temperature_2",
    )
    metas = {m.entity_id: m for m in synth.house()}

    def swap():
        # same entity_id re-paired to new hardware; old bedroom entity deleted, a new one added
        current = dict(metas)
        current[new_living] = replace(metas[new_living], device_id="dev_living_climate_v2")
        del current[old_bedroom]
        current[new_bedroom] = EntityMeta(
            new_bedroom,
            "Teplota ložnice",
            "dev_bedroom_climate_v2",
            "Klima ložnice",
            "numeric",
            "temperature",
            "demo_zigbee",
        )
        eng.set_metas(list(current.values()))

    live = synth.drop(synth.stream(T0, T0 + timedelta(hours=25)), {new_living, old_bedroom}, at)
    for i in range(24 * 60):
        t = at + timedelta(minutes=i)
        live += [Sample(new_living, t, "21.4"), Sample(new_bedroom, t, "19.9")]
    live.sort(key=lambda s: s.ts)
    tl = _run(eng, live, 24, hooks={at: swap})
    assert _keys(tl) == set()
    assert {new_living, new_bedroom} <= set(eng.warming_up())


def test_warm_up_blocks_baseline_findings(history):
    short = learn(synth.house(), history, [], T0, TZ)
    for b in short.values():
        b.days = 3.0
    eng = _engine(history, short)
    start = T0 + timedelta(hours=1)
    live = synth.transform(
        synth.stream(T0, T0 + timedelta(hours=5)),
        "sensor.demo_freezer_temperature",
        start,
        T0 + timedelta(hours=5),
        lambda s: "4.0",
    )
    assert _keys(_run(eng, live, 4)) == set()
    assert "sensor.demo_freezer_temperature" in eng.warming_up()


# ------------------------------------------------------------------ tiers, tolerance, restart
def test_tiers_only_escalate(history, baselines):
    eng = _engine(history, baselines)
    live = synth.drop(
        synth.stream(T0, T0 + timedelta(hours=9)), {"sensor.demo_cellar_humidity"}, T0
    )
    tl = _run(eng, live, 9)
    tiers = [r.tier for _, rs in tl for r in rs]
    assert tiers == sorted(tiers) and tiers[0] == Tier.OBSERVATION and tiers[-1] == Tier.CONFIRMED


def test_tolerance_widens_limits_and_is_capped(history, baselines):
    eid = "sensor.demo_cellar_humidity"
    live = synth.drop(synth.stream(T0, T0 + timedelta(hours=4)), {eid}, T0)
    plain = _first(_run(_engine(history, baselines), live, 4), lambda r: True)
    eng = _engine(history, baselines)
    eng.tolerate([eid])
    tolerant = _first(_run(eng, live, 4), lambda r: True)
    assert tolerant - plain >= timedelta(minutes=10)
    for _ in range(10):
        eng.tolerate([eid])
    assert eng.tolerance[eid] == Config().tolerance_max


def test_open_findings_survive_a_restart(history, baselines):
    """Dump → new engine → restore: tier, start and the real last report are kept."""
    eid = "sensor.demo_cellar_humidity"
    gone = T0
    eng = _engine(history, baselines)
    live = synth.drop(synth.stream(T0, T0 + timedelta(hours=8)), {eid}, gone)
    before = _run(eng, live, 3)[-1][1]
    stored = eng.dump()
    back = T0 + timedelta(hours=3, minutes=20)

    eng2 = Engine(synth.house(), baselines, TZ)
    eng2.restore(stored)
    eng2.downtime(T0 + timedelta(hours=3), back)
    # start-up: every entity gets its restored state with a fresh timestamp (not a report)
    for s in synth.stream(back - timedelta(hours=1), back):
        eng2.seed(Sample(s.entity_id, back, s.state))
    eng2.touch(eid, back)  # restored state's last_reported = start-up, ignored in grace
    rest = synth.drop(synth.stream(back, T0 + timedelta(hours=8)), {eid}, back)
    after = _run(eng2, rest, 4, start=back)
    (r0,) = before
    first = after[0][1][0]
    assert first.key == r0.key and first.tier >= r0.tier and first.since == r0.since
    assert first.findings[0].detail["last"] == r0.findings[0].detail["last"]
    assert after[-1][1][0].tier == Tier.CONFIRMED


def test_baseline_round_trip():
    b = EntityBaseline("sensor.demo_x", "dev_x", 9.5, periodic=True)
    b.p95_interval = timedelta(minutes=10)
    again = EntityBaseline.from_dict(b.as_dict())
    assert again == b


def test_evaluation_budget_1200_entities(history, baselines):
    metas, base = [], {}
    for k in range(40):
        for m in synth.house():
            eid = f"{m.entity_id}_{k}"
            metas.append(replace(m, entity_id=eid, device_id=f"{m.device_id}_{k}"))
            if m.entity_id in baselines:
                base[eid] = replace(
                    baselines[m.entity_id], entity_id=eid, device_id=f"{m.device_id}_{k}"
                )
    tail = [s for s in history if s.ts >= T0 - timedelta(hours=2)]
    eng = Engine(metas, base, TZ)
    for k in range(40):
        for s in tail:
            eng.feed(Sample(f"{s.entity_id}_{k}", s.ts, s.state))
    assert len(metas) >= 1200
    t = _time.perf_counter()
    for i in range(5):
        eng.evaluate(T0 + timedelta(minutes=i))
    per_eval = (_time.perf_counter() - t) / 5
    # target on the HA box: < 50 ms every 60 s; 0.5 s here keeps the shared CI stable
    assert per_eval < 0.5, per_eval
