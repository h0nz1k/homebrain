"""Bias correction (decaying average) and weighted multi-model blend."""

from __future__ import annotations

import math
from collections import Counter
from datetime import datetime, timedelta
from typing import Any

from .const import (
    BIAS_CLAMP_C,
    BIAS_MIN_N,
    BIAS_SHRINK,
    BIAS_W,
    LEAD_BUCKETS,
    MIN_VERIFIED_PAIRS,
    OM_DAILY_MODELS,
    PRIOR_LONG,
    PRIOR_SHORT,
    TAPER_H,
    WEIGHT_CAP,
    WEIGHT_FLOOR,
)
from .derive import condition

BiasKey = tuple[str, str, str]


def lead_bucket(lead_h: float) -> str:
    low = 0
    for edge in LEAD_BUCKETS:
        if lead_h < edge:
            return f"{low}-{edge}"
        low = edge
    return f"{LEAD_BUCKETS[-1]}+"


def update_bias(
    state: dict[str, float] | None, error: float, w: float = BIAS_W
) -> dict[str, float]:
    """NAEFS-style decaying average: B_t = (1-w) B_{t-1} + w b_t."""
    if not state or not state.get("n"):
        return {"b": error, "mae": abs(error), "n": 1}
    return {
        "b": (1 - w) * state["b"] + w * error,
        "mae": (1 - w) * state["mae"] + w * abs(error),
        "n": state["n"] + 1,
    }


def applied_bias(state: dict[str, float] | None) -> float:
    """Shrink towards zero while data is scarce and clamp to a sane range."""
    if not state or state.get("n", 0) < BIAS_MIN_N:
        return 0.0
    n = state["n"]
    value = state["b"] * n / (n + BIAS_SHRINK)
    return max(-BIAS_CLAMP_C, min(BIAS_CLAMP_C, value))


def _normalise(raw: dict[str, float]) -> dict[str, float]:
    total = sum(raw.values())
    if total <= 0:
        return {}
    weights = {k: v / total for k, v in raw.items() if v > 0}
    if len(weights) > 1:
        weights = {k: min(WEIGHT_CAP, max(WEIGHT_FLOOR, v)) for k, v in weights.items()}
        total = sum(weights.values())
        weights = {k: v / total for k, v in weights.items()}
    return weights


def model_weights(
    sources: list[str],
    lead_h: float,
    horizons: dict[str, int],
    bias: dict[BiasKey, dict[str, float]],
) -> dict[str, float]:
    """Verified inverse-MAE² weights when every contributor has enough pairs, else priors."""
    bucket = lead_bucket(lead_h)
    verified = [bias.get((src, "t2m", bucket)) for src in sources]
    use_verified = bool(sources) and all(
        v is not None and v.get("n", 0) >= MIN_VERIFIED_PAIRS for v in verified
    )
    prior = PRIOR_SHORT if lead_h < 48 else PRIOR_LONG
    raw: dict[str, float] = {}
    for src, ver in zip(sources, verified, strict=True):
        weight = 1 / (ver["mae"] ** 2 + 0.25) if use_verified and ver else prior.get(src, 0.0)
        remaining = horizons.get(src, 9999) - lead_h
        if remaining <= 0:
            weight = 0.0
        elif remaining < TAPER_H:
            weight *= remaining / TAPER_H
        raw[src] = weight
    return _normalise(raw)


def weighted_quantile(values: list[tuple[float, float]], q: float) -> float | None:
    if not values:
        return None
    ordered = sorted(values)
    total = sum(w for _, w in ordered)
    acc = 0.0
    for value, weight in ordered:
        acc += weight
        if acc >= q * total - 1e-9:
            return value
    return ordered[-1][0]


def _wmean(pairs: list[tuple[float, float]]) -> float | None:
    total = sum(w for _, w in pairs)
    return None if total <= 0 else sum(v * w for v, w in pairs) / total


def _circular(pairs: list[tuple[float, float]]) -> float | None:
    if not pairs:
        return None
    x = sum(math.cos(math.radians(v)) * w for v, w in pairs)
    y = sum(math.sin(math.radians(v)) * w for v, w in pairs)
    if abs(x) < 1e-9 and abs(y) < 1e-9:
        return None
    return round(math.degrees(math.atan2(y, x)) % 360)


def _r(value: float | None, digits: int = 1) -> float | None:
    return None if value is None else round(value, digits)


def confidence(p10: float | None, p90: float | None, pop: float | None) -> str:
    width = None if p10 is None or p90 is None else p90 - p10
    if (width is not None and width > 5) or (pop is not None and 0.4 < pop < 0.6):
        return "low"
    if (width is None or width < 2) and (pop is None or not 0.3 < pop < 0.7):
        return "high"
    return "medium"


def _parse(t: str) -> datetime:
    return datetime.fromisoformat(t.replace("Z", "+00:00"))


def blend_hourly(
    series: dict[str, list[dict[str, Any]]],
    horizons: dict[str, int],
    bias: dict[BiasKey, dict[str, float]],
    now: datetime,
    hours: int = 48,
) -> list[dict[str, Any]]:
    """Blend all sources hour by hour from the current hour."""
    start = now.replace(minute=0, second=0, microsecond=0)
    by_time: dict[datetime, dict[str, dict[str, Any]]] = {}
    for src, points in series.items():
        for point in points:
            when = _parse(point["t"])
            if start <= when < start + timedelta(hours=hours + 1):
                by_time.setdefault(when, {})[src] = point
    out = []
    for when in sorted(by_time):
        lead = (when - now).total_seconds() / 3600
        bucket = lead_bucket(max(lead, 0))
        points = {s: p for s, p in by_time[when].items() if p.get("t2m") is not None}
        weights = model_weights(sorted(points), max(lead, 0), horizons, bias)
        if not weights:
            continue
        temps = {s: points[s]["t2m"] - applied_bias(bias.get((s, "t2m", bucket))) for s in weights}
        t2m = _wmean([(temps[s], w) for s, w in weights.items()])
        p10 = weighted_quantile([(temps[s], w) for s, w in weights.items()], 0.1)
        p90 = weighted_quantile([(temps[s], w) for s, w in weights.items()], 0.9)
        spread = math.sqrt(sum(w * (temps[s] - t2m) ** 2 for s, w in weights.items()))

        def pairs(
            key: str, pts: dict[str, dict[str, Any]] = points, ws: dict[str, float] = weights
        ) -> list[tuple[float, float]]:
            return [(pts[s][key], w) for s, w in ws.items() if pts[s].get(key) is not None]

        precip_pairs = pairs("precip")
        pop_votes = []
        for s, w in weights.items():
            if points[s].get("pop") is not None:
                pop_votes.append((points[s]["pop"] / 100, w))
            elif points[s].get("precip") is not None:
                pop_votes.append((1.0 if points[s]["precip"] >= 0.1 else 0.0, w))
        pop = _wmean(pop_votes)
        precip = weighted_quantile(precip_pairs, 0.5)
        cloud = _wmean(pairs("cloud"))
        out.append(
            {
                "t": when.isoformat().replace("+00:00", "Z"),
                "lead_h": round(lead, 1),
                "t2m": _r(t2m),
                "p10": _r(p10),
                "p90": _r(p90),
                "spread": _r(spread, 2),
                "td2m": _r(_wmean(pairs("td2m"))),
                "precip": _r(precip, 2),
                "pop": _r(pop, 2),
                "wind": _r(_wmean(pairs("wind"))),
                "gust": _r(_wmean(pairs("gust"))),
                "wind_dir": _circular(pairs("wind_dir")),
                "msl": _r(_wmean(pairs("msl"))),
                "cloud": _r(cloud, 0),
                "condition": condition(
                    t2m, cloud, precip, [int(p["wmo"]) for p in points.values() if p.get("wmo")]
                ),
                "confidence": confidence(p10, p90, pop),
                "contributors": [
                    {"source": s, "weight": round(w, 3)}
                    for s, w in sorted(weights.items(), key=lambda kv: -kv[1])
                ],
            }
        )
    return out


_WMO_CONDITION = {0: "clear", 1: "clear", 2: "partly", 3: "overcast", 45: "fog", 48: "fog"}


def blend_daily(daily: dict[str, list[dict[str, Any]]]) -> list[dict[str, Any]]:
    """Daily blend of global models with min/max spread and a confidence pill."""
    dates = sorted({row["date"] for rows in daily.values() for row in rows})
    out = []
    for date in dates:
        rows = {
            model: next((r for r in daily.get(model, []) if r["date"] == date), None)
            for model in OM_DAILY_MODELS
        }
        rows = {m: r for m, r in rows.items() if r and r.get("tmax") is not None}
        if not rows:
            continue
        weights = _normalise({m: OM_DAILY_MODELS[m][1] for m in rows})

        def pairs(
            key: str, rows: dict[str, dict[str, Any]] = rows, ws: dict[str, float] = weights
        ) -> list[tuple[float, float]]:
            return [(rows[m][key], w) for m, w in ws.items() if rows[m].get(key) is not None]

        tmax_values = [v for v, _ in pairs("tmax")]
        tmin_values = [v for v, _ in pairs("tmin")]
        pop_pairs = pairs("pop")
        pop = (
            _wmean([(v / 100, w) for v, w in pop_pairs])
            if pop_pairs
            else _wmean([(1.0 if v >= 1 else 0.0, w) for v, w in pairs("precip")])
        )
        precip = weighted_quantile(pairs("precip"), 0.5)
        tmax = _wmean(pairs("tmax"))
        if precip is not None and precip >= 1 and (pop or 0) >= 0.5:
            cond = "snow" if tmax is not None and tmax <= 1 else "rain"
        else:
            votes = Counter()
            for m, w in weights.items():
                code = rows[m].get("wmo")
                if code is not None:
                    votes[_WMO_CONDITION.get(int(code), "cloudy" if code < 50 else "rain")] += w
            cond = votes.most_common(1)[0][0] if votes else "unknown"
        spread = (max(tmax_values) - min(tmax_values)) if tmax_values else None
        out.append(
            {
                "date": date,
                "tmax": _r(tmax),
                "tmin": _r(_wmean(pairs("tmin"))),
                "tmax_lo": _r(min(tmax_values)) if tmax_values else None,
                "tmax_hi": _r(max(tmax_values)) if tmax_values else None,
                "tmin_lo": _r(min(tmin_values)) if tmin_values else None,
                "tmin_hi": _r(max(tmin_values)) if tmin_values else None,
                "precip": _r(precip),
                "pop": _r(pop, 2),
                "wind": _r(_wmean(pairs("wind"))),
                "gust": _r(_wmean(pairs("gust"))),
                "condition": cond,
                "confidence": confidence(0, spread, pop) if spread is not None else "low",
                "contributors": [
                    {"source": f"om:{m}", "weight": round(w, 3)} for m, w in weights.items()
                ],
            }
        )
    return out
