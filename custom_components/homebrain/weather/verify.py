"""Precipitation verification against the station gauge (issue #131 B, spec §4.6).

Pure functions, no I/O. A *pair* is one forecast of the precipitation in the hour ending at
``valid_at`` (mm) together with the station's measured rain of the same hour.

Contingency table for an event "≥ threshold" (Wilks, Statistical Methods, ch. 8):

    a = hits, b = false alarms, c = misses, d = correct negatives, n = a + b + c + d
    POD = a / (a + c)          FAR = b / (a + b)        CSI = a / (a + b + c)
    a_r = (a + b)(a + c) / n   ETS = (a - a_r) / (a + b + c - a_r)
    frequency bias = (a + b) / (a + c)

Brier score of a probability p for the event o ∈ {0, 1}: BS = mean((p - o)²); the skill
score against the sample climatology ō is BSS = 1 - BS / (ō (1 - ō)).
"""

from __future__ import annotations

import json
from collections import defaultdict
from collections.abc import Iterable, Mapping, Sequence
from datetime import UTC, date, datetime, time, timedelta, tzinfo
from typing import Any, NamedTuple

from .const import (
    POP_CALIB_BINS,
    POP_CALIB_MIN_PAIRS,
    POP_CALIB_PRIOR_N,
    POP_THRESHOLD_MM_H,
    PRECIP_DAILY_THRESHOLDS,
    PRECIP_HOURLY_THRESHOLDS,
    PRECIP_LEAD_BUCKETS,
    PRECIP_MIN_PAIRS,
    PRECIP_MIN_WET,
)

BLEND = "blend"


class Pair(NamedTuple):
    source: str
    lead_h: float
    valid_at: str
    fc: float
    obs: float
    pop: float | None = None  # forecast probability 0..1, when the source has one


def precip_lead_bucket(lead_h: float) -> str:
    low = 0
    for edge in PRECIP_LEAD_BUCKETS:
        if lead_h < edge:
            return f"{low}-{edge}"
        low = edge
    return f"{PRECIP_LEAD_BUCKETS[-1]}+"


def contingency(pairs: Iterable[tuple[float, float]], threshold: float) -> dict[str, int]:
    """Counts for the event value ≥ threshold over (forecast, observed) pairs."""
    a = b = c = d = 0
    for fc, obs in pairs:
        f, o = fc >= threshold, obs >= threshold
        if f and o:
            a += 1
        elif f:
            b += 1
        elif o:
            c += 1
        else:
            d += 1
    return {"a": a, "b": b, "c": c, "d": d}


def _div(num: float, den: float) -> float | None:
    return None if den == 0 else num / den


def categorical(ct: Mapping[str, int]) -> dict[str, Any]:
    """POD, FAR, CSI, ETS and frequency bias from a contingency table (None if undefined)."""
    a, b, c, d = ct["a"], ct["b"], ct["c"], ct["d"]
    n = a + b + c + d
    a_r = (a + b) * (a + c) / n if n else 0.0
    out = {
        "pod": _div(a, a + c),
        "far": _div(b, a + b),
        "csi": _div(a, a + b + c),
        "ets": _div(a - a_r, a + b + c - a_r),
        "freq_bias": _div(a + b, a + c),
    }
    return {**ct, **{k: None if v is None else round(v, 3) for k, v in out.items()}}


def brier(probs: Iterable[tuple[float, int]]) -> dict[str, Any]:
    """Brier score and skill vs. sample climatology over (probability, outcome) pairs."""
    items = list(probs)
    if not items:
        return {"brier": None, "bss": None, "base_rate": None}
    n = len(items)
    bs = sum((p - o) ** 2 for p, o in items) / n
    base = sum(o for _, o in items) / n
    ref = base * (1 - base)
    return {
        "brier": round(bs, 4),
        "bss": None if ref == 0 else round(1 - bs / ref, 3),
        "base_rate": round(base, 3),
    }


def _local_day(valid_at: str, tz: tzinfo) -> str:
    # The hour ending at valid_at belongs to the local day of its start.
    when = datetime.fromisoformat(valid_at.replace("Z", "+00:00")) - timedelta(hours=1)
    return when.astimezone(tz).date().isoformat()


def _day_length_h(day: str, tz: tzinfo) -> int:
    """Hours in a local day (23 / 25 on DST changes)."""
    first = date.fromisoformat(day)
    start = datetime.combine(first, time.min, tz).astimezone(UTC)
    end = datetime.combine(first + timedelta(days=1), time.min, tz).astimezone(UTC)
    return round((end - start).total_seconds() / 3600)


def daily_pairs(pairs: Sequence[Pair], tz: tzinfo) -> list[tuple[float, float]]:
    """Daily (forecast, observed) sums over complete local days only.

    Several issues may forecast the same hour within one lead bucket: their mean is the
    bucket's forecast for that hour. A day counts only when every hour has a pair.
    """
    per_hour: dict[str, list[float]] = defaultdict(list)
    obs_hour: dict[str, float] = {}
    for p in pairs:
        per_hour[p.valid_at].append(p.fc)
        obs_hour[p.valid_at] = p.obs
    days: dict[str, list[tuple[float, float]]] = defaultdict(list)
    for valid_at, fcs in per_hour.items():
        days[_local_day(valid_at, tz)].append((sum(fcs) / len(fcs), obs_hour[valid_at]))
    out = []
    for day, hours in days.items():
        if len(hours) >= _day_length_h(day, tz):
            out.append((sum(f for f, _ in hours), sum(o for _, o in hours)))
    return out


def score_group(pairs: Sequence[Pair], tz: tzinfo) -> dict[str, Any]:
    """All precipitation metrics for one (source, lead bucket)."""
    fo = [(p.fc, p.obs) for p in pairs]
    n = len(fo)
    wet = sum(o >= POP_THRESHOLD_MM_H for _, o in fo)
    probs = [
        (
            p.pop if p.pop is not None else float(p.fc >= POP_THRESHOLD_MM_H),
            int(p.obs >= POP_THRESHOLD_MM_H),
        )
        for p in pairs
    ]
    days = daily_pairs(pairs, tz)
    total_obs = sum(o for _, o in fo)
    # Several issues may verify the same hour: distinct hours / days are the sample size a
    # person can relate to ("z 86 deštivých hodin za 40 dní"); n counts the pairs.
    obs_hour = {p.valid_at: p.obs for p in pairs}
    return {
        "n": n,
        "n_wet": wet,
        "hours": len(obs_hour),
        "wet_hours": sum(o >= POP_THRESHOLD_MM_H for o in obs_hour.values()),
        "days": len({_local_day(v, tz) for v in obs_hour}),
        "enough": n >= PRECIP_MIN_PAIRS and wet >= PRECIP_MIN_WET,
        "bias_mm": round(sum(f - o for f, o in fo) / n, 3) if n else None,
        "amount_ratio": round(sum(f for f, _ in fo) / total_obs, 2) if total_obs > 0 else None,
        "probabilistic": any(p.pop is not None for p in pairs),
        **brier(probs),
        "hourly": {f"{t:g}": categorical(contingency(fo, t)) for t in PRECIP_HOURLY_THRESHOLDS},
        "n_days": len(days),
        "daily": {f"{t:g}": categorical(contingency(days, t)) for t in PRECIP_DAILY_THRESHOLDS},
    }


def blend_out_of_sample(p: Pair) -> bool:
    """True if a blend pair could not have influenced the weights it was issued with.

    The blend is scored only on its own archived forecasts (rolling origin): a forecast
    issued at T used the precipitation weights of the last nightly scoring N <= T, which
    only saw station hours that had already ended (valid_at <= N). Its pairs are valid
    after T (lead > 0), so they are never part of the sample its weights came from.
    Previous Runs rows have no blend, and a lead <= 0 would break the argument -> dropped.
    """
    return p.source != BLEND or p.lead_h > 0


def precip_scores(pairs: Iterable[Pair], tz: tzinfo) -> dict[tuple[str, str], dict[str, Any]]:
    """Metrics per (source, precip lead bucket); the blend only out-of-sample."""
    groups: dict[tuple[str, str], list[Pair]] = defaultdict(list)
    for p in pairs:
        if blend_out_of_sample(p):
            groups[(p.source, precip_lead_bucket(p.lead_h))].append(p)
    out = {key: score_group(items, tz) for key, items in groups.items()}
    for (source, _), metrics in out.items():
        if source == BLEND:
            metrics["out_of_sample"] = True
    return out


def skill(metrics: Mapping[str, Any] | None) -> float | None:
    """Precipitation skill in [0, 1] for weighting: mean of ETS(≥0.2 mm/h) and Brier skill.

    Negative skill (worse than chance / climatology) counts as 0. None until ``enough``.
    """
    if not metrics or not metrics.get("enough"):
        return None
    ets = (metrics.get("hourly") or {}).get(f"{PRECIP_HOURLY_THRESHOLDS[0]:g}", {}).get("ets")
    bss = metrics.get("bss")
    parts = [max(0.0, v) for v in (ets, bss) if v is not None]
    return sum(parts) / len(parts) if parts else None


# -- PoP calibration (reliability binning) ---------------------------------------------------
def _isotonic(values: list[float], weights: list[float]) -> list[float]:
    """Weighted pool-adjacent-violators: the closest non-decreasing sequence."""
    blocks: list[list[float]] = []  # [mean, weight, size]
    for v, w in zip(values, weights, strict=True):
        blocks.append([v, w, 1])
        while len(blocks) > 1 and blocks[-2][0] > blocks[-1][0]:
            m2, w2, n2 = blocks.pop()
            m1, w1, n1 = blocks.pop()
            blocks.append([(m1 * w1 + m2 * w2) / (w1 + w2), w1 + w2, n1 + n2])
    out: list[float] = []
    for mean, _, size in blocks:
        out.extend([mean] * int(size))
    return out


def reliability_table(
    probs: Iterable[tuple[float, int]],
    bins: int = POP_CALIB_BINS,
    prior_n: int = POP_CALIB_PRIOR_N,
    min_pairs: int = POP_CALIB_MIN_PAIRS,
) -> dict[str, Any] | None:
    """Observed event frequency per forecast-probability bin, shrunk to the bin centre.

    calibrated_k = (events_k + prior_n · centre_k) / (n_k + prior_n): a bin with few pairs
    stays close to the raw forecast; then a weighted isotonic fit keeps the curve monotone.
    None until ``min_pairs`` pairs exist.
    """
    counts = [[0, 0] for _ in range(bins)]
    total = 0
    for p, o in probs:
        k = min(bins - 1, max(0, int(p * bins)))
        counts[k][0] += 1
        counts[k][1] += o
        total += 1
    if total < min_pairs:
        return None
    centres = [(k + 0.5) / bins for k in range(bins)]
    values = [
        (events + prior_n * centres[k]) / (n + prior_n) for k, (n, events) in enumerate(counts)
    ]
    weights = [n + prior_n for n, _ in counts]
    values = [round(v, 3) for v in _isotonic(values, weights)]
    return {"bins": bins, "n": total, "counts": counts, "calibrated": values}


def calibrate(p: float | None, table: Mapping[str, Any] | None) -> float | None:
    """Piecewise-linear interpolation of the reliability curve between bin centres."""
    if p is None or not table:
        return p
    bins, values = table["bins"], table["calibrated"]
    x = p * bins - 0.5
    if x <= 0:
        return values[0]
    if x >= bins - 1:
        return values[-1]
    lo = int(x)
    frac = x - lo
    return round(values[lo] + (values[lo + 1] - values[lo]) * frac, 3)


def dumps(scores: Mapping[tuple[str, str], Any]) -> str:
    return json.dumps({f"{s}|{b}": v for (s, b), v in scores.items()})


def loads(raw: str | None) -> dict[tuple[str, str], dict[str, Any]]:
    if not raw:
        return {}
    try:
        data = json.loads(raw)
    except ValueError:
        return {}
    return {tuple(k.split("|", 1)): v for k, v in data.items() if "|" in k}  # type: ignore[misc]
