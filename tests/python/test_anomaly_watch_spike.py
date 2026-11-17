"""Spike #128 – anomaly watch prototype on a synthetic demo house (no HA, no real data).

Each test injects one fault (or one false-positive trap) into a normal synthetic stream and
checks what the owner would see: grouped reports, their tier and phone notifications.
"""

import time as _time
from dataclasses import replace
from datetime import datetime, timedelta

import pytest

from scripts.anomaly_watch_spike import synth
from scripts.anomaly_watch_spike.engine import Engine
from scripts.anomaly_watch_spike.learn import learn
from scripts.anomaly_watch_spike.model import Config, Downtime, EntityMeta, Sample, Tier

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
    return learn(synth.house(), history, [], T0)


def _engine(history, baselines, config=None, metas=None):
    eng = Engine(metas or synth.house(), baselines, config)
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


def _max_tier(timeline):
    return max((r.tier for _, reps in timeline for r in reps), default=None)


# ------------------------------------------------------------------ quiet baseline
def test_quiet_day_has_no_findings(history, baselines):
    """24 h of normal life incl. the washer's nightly cloud outage: nothing at all."""
    eng = _engine(history, baselines)
    tl = _run(eng, synth.stream(T0, T0 + timedelta(hours=25)), 24)
    assert _keys(tl) == set()
    assert eng.notifications == []


# ------------------------------------------------------------------ silent / grouping
def test_dishwasher_silent_is_one_grouped_report_and_one_notification(history, baselines):
    eng = _engine(history, baselines)
    gone = T0 + timedelta(hours=1)
    live = synth.stream(T0, T0 + timedelta(hours=12))
    live = synth.drop(live, DISHWASHER, gone, T0 + timedelta(hours=5))  # back after 4 h
    live = synth.drop(live, DISHWASHER, T0 + timedelta(hours=7))  # and gone again
    tl = _run(eng, live, 11)

    assert _keys(tl) == {"device:dev_dishwasher"}
    reps = [r for _, rs in tl for r in rs]
    assert {r.title for r in reps} == {"Myčka neodpovídá (17 entit)"}
    first_obs = _first(tl, lambda r: r.tier == Tier.OBSERVATION)
    confirmed = _first(tl, lambda r: r.tier == Tier.CONFIRMED)
    # clocks run from each entity's last report (≤ 10 min before ``gone``)
    assert timedelta(minutes=20) <= first_obs - gone <= timedelta(minutes=45)
    # 17 entities silent together = device fault: confirmed after 2 h, not the single-entity 6 h
    assert timedelta(hours=1, minutes=50) <= confirmed - gone <= timedelta(hours=2, minutes=15)
    # recovery clears it, the relapse within 24 h does not ring the phone again
    assert not any(
        tl_r
        for now, tl_r in tl
        if T0 + timedelta(hours=5, minutes=30) <= now < T0 + timedelta(hours=7)
    )
    assert _first(
        [(n, r) for n, r in tl if n > T0 + timedelta(hours=7)], lambda r: r.tier == Tier.CONFIRMED
    )
    assert [n.title for n in eng.notifications] == ["Myčka neodpovídá (17 entit)"]


def test_single_silent_sensor_escalates_slowly(history, baselines):
    eng = _engine(history, baselines)
    gone = T0 + timedelta(hours=1)
    live = synth.drop(
        synth.stream(T0, T0 + timedelta(hours=9)), {"sensor.demo_living_temperature"}, gone
    )
    tl = _run(eng, live, 8)
    title = {r.title for _, rs in tl for r in rs}
    assert title == {"Klima obývák: Teplota obývák neposílá data"}
    obs = _first(tl, lambda r: r.tier == Tier.OBSERVATION)
    sus = _first(tl, lambda r: r.tier == Tier.SUSPICION)
    conf = _first(tl, lambda r: r.tier == Tier.CONFIRMED)
    assert obs - gone <= timedelta(minutes=45)
    assert timedelta(hours=2) <= sus - gone <= timedelta(hours=2, minutes=15)
    assert timedelta(hours=6) <= conf - gone <= timedelta(hours=6, minutes=15)


def test_integration_down_rolls_up_devices(history, baselines):
    zigbee = {
        m.entity_id for m in synth.house() if m.integration == "demo_zigbee" and m.kind == "numeric"
    }
    eng = _engine(history, baselines)
    live = synth.drop(synth.stream(T0, T0 + timedelta(hours=4)), zigbee, T0 + timedelta(hours=1))
    tl = _run(eng, live, 4)
    final = tl[-1][1]
    assert [r.title for r in final] == ["Integrace demo_zigbee neodpovídá (4 zařízení)"]
    assert final[0].tier == Tier.CONFIRMED and len(final[0].entities) == 8


def test_mass_outage_is_one_system_note_not_n_alarms(history, baselines):
    periodic = {e for e, b in baselines.items() if b.periodic}
    eng = _engine(history, baselines)
    live = synth.drop(synth.stream(T0, T0 + timedelta(hours=8)), periodic, T0 + timedelta(hours=1))
    tl = _run(eng, live, 8)
    assert _keys(tl) == {"system"}
    assert _max_tier(tl) == Tier.OBSERVATION
    assert eng.notifications == []


# ------------------------------------------------------------------ baseline
def test_freezer_warming_is_confirmed_and_notified_once(history, baselines):
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
    obs = _first(tl, lambda r: r.tier >= Tier.OBSERVATION)
    sus = _first(tl, lambda r: r.tier >= Tier.SUSPICION)
    conf = _first(tl, lambda r: r.tier == Tier.CONFIRMED)
    assert obs < sus < conf
    assert conf - obs >= timedelta(hours=2)
    assert {r.title for _, rs in tl for r in rs} == {"Teplota mrazáku: neobvykle vysoko"}
    assert len(eng.notifications) == 1


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
    assert eng.notifications == []


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
    assert {r.title for _, rs in tl for r in rs} == {"Zásuvka akvária neobvykle často přepíná"}
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
    assert "Mrazák opakovaně vypadává" in {r.title for _, rs in tl for r in rs}


# ------------------------------------------------------------------ dwell + quiet hours
def test_door_left_open_at_night_notifies_in_the_morning(history, baselines):
    eng = _engine(history, baselines)
    door = "binary_sensor.demo_front_door"
    opened = _local(9, 23)
    live = synth.drop(
        synth.stream(T0, T0 + timedelta(hours=26)), {door}, opened - timedelta(minutes=1)
    )
    live = sorted(live + [Sample(door, opened, "on")], key=lambda s: s.ts)
    tl = _run(eng, live, 25)
    assert {r.title for _, rs in tl for r in rs} == {"Vstupní dveře je otevřené déle než obvykle"}
    conf = _first(tl, lambda r: r.tier == Tier.CONFIRMED)
    assert conf - opened <= timedelta(hours=1, minutes=5)
    (note,) = eng.notifications
    assert note.at == _local(10, 7) and note.deferred_from == conf


def test_resolved_during_quiet_hours_never_wakes_anyone(history, baselines):
    eng = _engine(history, baselines)
    door = "binary_sensor.demo_front_door"
    opened = _local(9, 23)
    live = synth.drop(
        synth.stream(T0, T0 + timedelta(hours=26)), {door}, opened - timedelta(minutes=1)
    )
    live = sorted(
        live + [Sample(door, opened, "on"), Sample(door, _local(10, 2), "off")], key=lambda s: s.ts
    )
    _run(eng, live, 25)
    assert eng.notifications == []


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
    base = learn(synth.house(), holey, [gap], T0)
    ref = learn(synth.house(), history, [], T0)
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
    eng = Engine(metas, learn(metas, hist, [], learn_until))
    for s in hist[-5000:]:
        eng.feed(s)
    live = synth.stream(learn_until, learn_until + timedelta(hours=31))
    tl = synth.run(eng, live, learn_until, learn_until + timedelta(hours=30), STEP)
    assert _keys(tl) == set()


def test_vacation_week(history, baselines):
    away = lambda ts: ts >= T0  # noqa: E731
    live = synth.stream(T0, T0 + timedelta(days=7, hours=1), away=away)
    # with a presence hint: low consumption is expected, nothing reaches the Dnes card
    eng = _engine(history, baselines)
    eng.set_away(True)
    tl = _run(eng, live, 24 * 7, step=timedelta(minutes=15))
    assert _max_tier(tl) in (None, Tier.OBSERVATION)
    assert eng.notifications == []
    # without it: may be noted/suspected, never confirmed, never on the phone
    eng = _engine(history, baselines)
    tl = _run(eng, live, 24 * 7, step=timedelta(minutes=15))
    assert _max_tier(tl) in (None, Tier.OBSERVATION, Tier.SUSPICION)
    assert eng.notifications == []


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
        # same entity_id re-paired to new hardware (new device_id, faster, +0,4 °C offset)
        eng.update_meta(replace(metas[new_living], device_id="dev_living_climate_v2"))
        # old entity deleted, a new one with a new id appears
        eng.update_meta(replace(metas[old_bedroom], removed=True))
        eng.update_meta(
            EntityMeta(
                new_bedroom,
                "Teplota ložnice",
                "dev_bedroom_climate_v2",
                "Klima ložnice",
                "numeric",
                "temperature",
                "demo_zigbee",
            )
        )

    live = synth.drop(synth.stream(T0, T0 + timedelta(hours=25)), {new_living, old_bedroom}, at)
    for i in range(24 * 60):
        t = at + timedelta(minutes=i)
        live += [Sample(new_living, t, "21.4"), Sample(new_bedroom, t, "19.9")]
    live.sort(key=lambda s: s.ts)
    tl = _run(eng, live, 24, hooks={at: swap})
    assert _keys(tl) == set()
    assert {new_living, new_bedroom} <= set(eng.warming_up())


def test_warm_up_blocks_baseline_findings(history):
    short = learn(synth.house(), history, [], T0)
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


# ------------------------------------------------------------------ tiers + budget
def test_tiers_only_escalate_and_only_confirmed_notifies(history, baselines):
    eng = _engine(history, baselines)
    live = synth.drop(
        synth.stream(T0, T0 + timedelta(hours=9)), {"sensor.demo_cellar_humidity"}, T0
    )
    tl = _run(eng, live, 9)
    tiers = [r.tier for _, rs in tl for r in rs]
    assert tiers == sorted(tiers) and tiers[0] == Tier.OBSERVATION and tiers[-1] == Tier.CONFIRMED
    first_conf = _first(tl, lambda r: r.tier == Tier.CONFIRMED)
    assert [n.at for n in eng.notifications] == [first_conf]


def test_quiet_hours_can_be_disabled(history, baselines):
    eng = _engine(history, baselines, Config(quiet_hours=None))
    door = "binary_sensor.demo_front_door"
    opened = _local(9, 23)
    live = synth.drop(
        synth.stream(T0, T0 + timedelta(hours=18)), {door}, opened - timedelta(minutes=1)
    )
    live = sorted(live + [Sample(door, opened, "on")], key=lambda s: s.ts)
    _run(eng, live, 17)
    assert eng.notifications and eng.notifications[0].at < _local(10, 1)


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
    eng = Engine(metas, base)
    for k in range(40):
        for s in tail:
            eng.feed(Sample(f"{s.entity_id}_{k}", s.ts, s.state))
    assert len(metas) >= 1200
    t = _time.perf_counter()
    for i in range(5):
        eng.evaluate(T0 + timedelta(minutes=i))
    per_eval = (_time.perf_counter() - t) / 5
    assert per_eval < 0.5, per_eval  # target on the HA box: < 50 ms every 60 s
