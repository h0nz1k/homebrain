"""Synthetic demo house: deterministic recorder-like history and live stream (no real data).

All entity ids are ``*.demo_*``, devices and integrations are invented. Daily rhythms are
defined in local time (Europe/Prague), so DST days shift the pattern in UTC like a real home.
"""

from __future__ import annotations

import math
import random
import zlib
from collections.abc import Callable, Iterable
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from custom_components.homebrain.anomaly.model import EntityMeta, Sample

TZ = ZoneInfo("Europe/Prague")
UTC = ZoneInfo("UTC")

DISHWASHER = [
    ("power", "Příkon", 3.0, 1.0),
    ("remaining", "Zbývající čas", 0.0, 0.0),
    ("program_state", "Stav programu", 0.0, 0.0),
    ("water_temperature", "Teplota vody", 21.0, 0.3),
    ("water_used", "Spotřeba vody", 0.0, 0.0),
    ("rinse_aid", "Leštidlo", 80.0, 0.0),
    ("salt", "Sůl", 60.0, 0.0),
    ("door", "Dvířka", 0.0, 0.0),
    ("phase", "Fáze", 0.0, 0.0),
    ("delayed_start", "Odložený start", 0.0, 0.0),
    ("wifi_signal", "Signál Wi-Fi", -61.0, 2.0),
    ("energy", "Spotřeba energie", 412.0, 0.0),
    ("cycles", "Počet cyklů", 318.0, 0.0),
    ("drying_temperature", "Teplota sušení", 22.0, 0.3),
    ("water_pressure", "Tlak vody", 3.1, 0.05),
    ("filter", "Filtr", 0.0, 0.0),
    ("program", "Program", 0.0, 0.0),
]
CLIMATE_ROOMS = [
    ("living", "Obývák", 21.0, 45.0),
    ("bedroom", "Ložnice", 19.5, 50.0),
    ("bathroom", "Koupelna", 22.5, 60.0),
    ("cellar", "Sklep", 14.0, 70.0),
]


def house() -> list[EntityMeta]:
    m: list[EntityMeta] = []
    for slug, name, _, _ in DISHWASHER:
        m.append(
            EntityMeta(
                f"sensor.demo_dishwasher_{slug}",
                name,
                "dev_dishwasher",
                "Myčka",
                "numeric",
                "power" if slug == "power" else None,
                "demo_appliance",
            )
        )
    for slug, room, _, _ in CLIMATE_ROOMS:
        dev = f"dev_{slug}_climate"
        label = f"Klima {room.lower()}" if slug != "living" else "Klima obývák"
        m.append(
            EntityMeta(
                f"sensor.demo_{slug}_temperature",
                f"Teplota {room.lower()}",
                dev,
                label,
                "numeric",
                "temperature",
                "demo_zigbee",
            )
        )
        m.append(
            EntityMeta(
                f"sensor.demo_{slug}_humidity",
                f"Vlhkost {room.lower()}",
                dev,
                label,
                "numeric",
                "humidity",
                "demo_zigbee",
            )
        )
    m += [
        EntityMeta(
            "sensor.demo_freezer_temperature",
            "Teplota mrazáku",
            "dev_freezer",
            "Mrazák",
            "numeric",
            "temperature",
            "demo_cloud",
        ),
        EntityMeta(
            "sensor.demo_house_power",
            "Příkon domu",
            "dev_meter",
            "Elektroměr",
            "numeric",
            "power",
            "demo_meter",
        ),
        EntityMeta(
            "sensor.demo_washer_power",
            "Příkon pračky",
            "dev_washer",
            "Pračka",
            "numeric",
            "power",
            "demo_appliance",
        ),
        EntityMeta(
            "binary_sensor.demo_front_door",
            "Vstupní dveře",
            "dev_front_door",
            "Vstupní dveře",
            "discrete",
            "door",
            "demo_zigbee",
        ),
        EntityMeta(
            "binary_sensor.demo_bedroom_window",
            "Okno v ložnici",
            "dev_bedroom_window",
            "Okno v ložnici",
            "discrete",
            "window",
            "demo_zigbee",
        ),
        EntityMeta(
            "light.demo_kitchen",
            "Světlo v kuchyni",
            "dev_kitchen_light",
            "Světlo v kuchyni",
            "discrete",
            None,
            "demo_lights",
        ),
        EntityMeta(
            "switch.demo_aquarium_plug",
            "Zásuvka akvária",
            "dev_aquarium_plug",
            "Zásuvka akvária",
            "discrete",
            None,
            "demo_plugs",
        ),
    ]
    return m


def _rng(entity_id: str, day: date, seed: int) -> random.Random:
    return random.Random(zlib.crc32(f"{seed}:{entity_id}:{day.isoformat()}".encode()))


def _local(day: date, hour: float) -> datetime:
    h = int(hour)
    m = int(round((hour - h) * 60))
    base = datetime.combine(day, time(0), TZ)
    return (base.replace(tzinfo=None) + timedelta(hours=h, minutes=m)).replace(tzinfo=TZ)


def _day_bounds(day: date) -> tuple[datetime, datetime]:
    return _local(day, 0).astimezone(UTC), _local(day + timedelta(days=1), 0).astimezone(UTC)


@dataclass(frozen=True)
class _Periodic:
    entity_id: str
    interval: timedelta
    value: Callable[[float, random.Random, bool], float | str]


def _hour(ts: datetime) -> float:
    lt = ts.astimezone(TZ)
    return lt.hour + lt.minute / 60


def _periodics() -> list[_Periodic]:
    out: list[_Periodic] = []
    for slug, _, base, noise in DISHWASHER:
        out.append(
            _Periodic(
                f"sensor.demo_dishwasher_{slug}",
                timedelta(minutes=10),
                lambda h, r, a, b=base, n=noise: round(b + r.gauss(0, n), 2) if n else b,
            )
        )
    for slug, _, t0, h0 in CLIMATE_ROOMS:
        amp = 0.4 if slug == "cellar" else 1.2

        def temp(h, r, away, t0=t0, amp=amp):
            if away and t0 > 16:
                return round(17.0 + r.gauss(0, 0.15), 2)  # heating set back for the holiday
            return round(t0 + amp * math.sin((h - 13) / 24 * 2 * math.pi) + r.gauss(0, 0.15), 2)

        def hum(h, r, away, h0=h0):
            return round(h0 + 3 * math.sin((h - 6) / 24 * 2 * math.pi) + r.gauss(0, 1.0), 1)

        out.append(_Periodic(f"sensor.demo_{slug}_temperature", timedelta(minutes=10), temp))
        out.append(_Periodic(f"sensor.demo_{slug}_humidity", timedelta(minutes=10), hum))

    def power(h, r, away):
        if away:
            return round(150 + r.gauss(0, 20))
        w = 300.0
        if 6 <= h < 8:
            w += 600
        if 17 <= h < 22:
            w += 900
        if r.random() < 0.01:
            w += 2000  # kettle
        return round(w + r.gauss(0, 50))

    out += [
        _Periodic(
            "sensor.demo_freezer_temperature",
            timedelta(minutes=5),
            lambda h, r, a: round(-18 + r.gauss(0, 0.3), 2),
        ),
        _Periodic("sensor.demo_house_power", timedelta(minutes=1), power),
        _Periodic(
            "sensor.demo_washer_power",
            timedelta(minutes=10),
            lambda h, r, a: round(1.5 + abs(r.gauss(0, 0.3)), 2),
        ),
    ]
    return out


def _episodes(entity_id: str, r: random.Random, away: bool) -> list[tuple[float, float]]:
    """(start hour, duration minutes) of on/open episodes in one local day."""
    if entity_id == "switch.demo_aquarium_plug":
        return [(8.0, 12 * 60)]
    if away:
        return []
    if entity_id == "binary_sensor.demo_front_door":
        return [(r.uniform(6, 21.5), r.uniform(1, 4)) for _ in range(8)]
    if entity_id == "binary_sensor.demo_bedroom_window":
        return [(7 + r.uniform(-0.3, 0.3), r.uniform(15, 40))]
    if entity_id == "light.demo_kitchen":
        return [
            (6.5 + r.uniform(0, 0.3), r.uniform(30, 60)),
            (17.5 + r.uniform(0, 0.5), r.uniform(180, 270)),
        ]
    return []


BINARIES = [
    "binary_sensor.demo_front_door",
    "binary_sensor.demo_bedroom_window",
    "light.demo_kitchen",
    "switch.demo_aquarium_plug",
]


def stream(
    start: datetime, end: datetime, seed: int = 7, away: Callable[[datetime], bool] | None = None
) -> list[Sample]:
    """Normal behaviour of the demo house in ``[start, end)``; ``away(ts)`` = holiday mode."""
    away = away or (lambda ts: False)
    out: list[Sample] = []
    day = start.astimezone(TZ).date() - timedelta(days=1)
    last = end.astimezone(TZ).date()
    while day <= last:
        d0, d1 = _day_bounds(day)
        for p in _periodics():
            r = _rng(p.entity_id, day, seed)
            t = d0 + timedelta(seconds=r.uniform(0, p.interval.total_seconds()))
            washer = p.entity_id == "sensor.demo_washer_power"
            down = False
            while t < d1:
                h = _hour(t)
                if washer and 1 <= h < 5:  # the cloud API drops out every night
                    if not down and start <= t < end:
                        out.append(Sample(p.entity_id, t, "unavailable"))
                    down = True
                else:
                    down = False
                    if start <= t < end:
                        out.append(Sample(p.entity_id, t, str(p.value(h, r, away(t)))))
                t += p.interval * r.uniform(0.9, 1.1)
        for eid in BINARIES:
            r = _rng(eid, day, seed)
            mid = _local(day, 12).astimezone(UTC)
            for h0, minutes in sorted(_episodes(eid, r, away(mid))):
                on = _local(day, h0).astimezone(UTC)
                off = on + timedelta(minutes=minutes)
                on_state = "on"
                if start <= on < end:
                    out.append(Sample(eid, on, on_state))
                if start <= off < end:
                    out.append(Sample(eid, off, "off"))
        day += timedelta(days=1)
    out.sort(key=lambda s: (s.ts, s.entity_id))
    return out


# ------------------------------------------------------------------ fault injection
def drop(
    samples: Iterable[Sample], entity_ids: set[str], start: datetime, end: datetime | None = None
) -> list[Sample]:
    return [
        s
        for s in samples
        if not (s.entity_id in entity_ids and s.ts >= start and (end is None or s.ts < end))
    ]


def transform(
    samples: Iterable[Sample],
    entity_id: str,
    start: datetime,
    end: datetime,
    fn: Callable[[Sample], str],
) -> list[Sample]:
    return [
        Sample(s.entity_id, s.ts, fn(s)) if s.entity_id == entity_id and start <= s.ts < end else s
        for s in samples
    ]


def last_states(samples: Iterable[Sample]) -> dict[str, str]:
    last: dict[str, str] = {}
    for s in samples:
        if s.state not in ("unavailable", "unknown"):
            last[s.entity_id] = s.state
    return last


def restart(
    samples: list[Sample],
    metas: list[EntityMeta],
    at: datetime,
    duration: timedelta,
    known: dict[str, str] | None = None,
) -> list[Sample]:
    """HA stopped for ``duration``: no rows meanwhile, then the usual startup burst.

    ``known`` = last states before ``samples`` start (HA restores them on start-up).
    """
    back = at + duration
    kept = [s for s in samples if not at <= s.ts < back]
    last: dict[str, str] = dict(known or {})
    for s in kept:
        if s.ts < at and s.state not in ("unavailable", "unknown"):
            last[s.entity_id] = s.state
    burst: list[Sample] = []
    for m in metas:
        burst.append(Sample(m.entity_id, back, "unavailable"))
        if m.kind == "discrete" and m.entity_id in last:
            burst.append(Sample(m.entity_id, back + timedelta(seconds=20), last[m.entity_id]))
        if m.integration == "demo_zigbee" and m.kind == "discrete":
            # a stuck contact sensor bounces a few times while the coordinator re-interviews
            for i in range(6):
                st = "on" if i % 2 == 0 else last.get(m.entity_id, "off")
                burst.append(Sample(m.entity_id, back + timedelta(seconds=30 + 10 * i), st))
    return sorted(kept + burst, key=lambda s: (s.ts, s.entity_id))


def run(
    engine,
    samples: list[Sample],
    start: datetime,
    end: datetime,
    step: timedelta = timedelta(minutes=5),
    hooks: dict[datetime, Callable[[], None]] | None = None,
    down: tuple[datetime, datetime] | None = None,
):
    """Feed samples in time order and evaluate every ``step``. Returns [(now, reports)].

    ``down`` = HA not running: no evaluation inside, ``engine.downtime`` is called on start-up.
    """
    hooks = dict(hooks or {})
    if down is not None:
        hooks[down[1]] = lambda: engine.downtime(*down)
    timeline = []
    i = 0
    now = start
    while now <= end:
        if down is not None and down[0] <= now < down[1]:
            now += step
            continue
        for at in sorted(k for k in hooks if k <= now):
            hooks.pop(at)()
        while i < len(samples) and samples[i].ts <= now:
            engine.feed(samples[i])
            i += 1
        timeline.append((now, engine.evaluate(now)))
        now += step
    return timeline
