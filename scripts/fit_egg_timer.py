#!/usr/bin/env python3
"""Fit the egg-timer constants (Recepty → Minutky → Vajíčka) to reference times.

Model: C. D. H. Williams, "The Science of Boiling an Egg" (University of Exeter),
    t[min] = 0.451 · M^(2/3) · ln(0.76 · (T_egg − T_water) / (T_yolk − T_water))
plus ``perExtraEggS`` seconds for every egg beyond the first, with the same constants as
``modules/recipes/src/domain/eggs.ts`` (EGG_MODEL).

Input: JSON like ``tests/fixtures/egg-timer/observations.json`` (times in seconds from
putting the eggs into boiling water). For every doneness with chicken samples the script
finds the yolk temperature T_yolk that minimises the squared time error (least squares,
golden-section search). With samples at two or more egg counts it also fits
``perExtraEggS`` (else it keeps the default 20 s). Quail samples are reported as fixed times.

Usage:
    python3 scripts/fit_egg_timer.py tests/fixtures/egg-timer/observations.json
Prints a residual table and a JSON block with the values to copy into EGG_MODEL.
Standard library only.
"""

from __future__ import annotations

import argparse
import json
import math
import sys
from collections.abc import Callable
from pathlib import Path
from typing import Any

MASS_G = {"S": 48.1, "M": 58.0, "L": 70.9, "XL": 76.9}
FRIDGE_C = 5.0
ROOM_C = 20.0
MAX_WATER_C = 99.0
PER_EXTRA_EGG_S = 20.0
DONENESS = ("namekko", "nahnilicko", "natvrdo")


def williams_minutes(mass_g: float, egg_c: float, water_c: float, yolk_c: float) -> float:
    if yolk_c >= water_c or egg_c >= yolk_c:
        return 0.0
    arg = 0.76 * (egg_c - water_c) / (yolk_c - water_c)
    return 0.0 if arg <= 1 else 0.451 * mass_g ** (2 / 3) * math.log(arg)


def predict(
    obs: dict[str, Any],
    yolk_c: float,
    per_extra_egg_s: float = PER_EXTRA_EGG_S,
    water_c: float = MAX_WATER_C,
) -> float:
    """Seconds for one chicken observation (same maths as eggs.ts, before rounding)."""
    mass = MASS_G[obs["size"]]
    egg_c = FRIDGE_C if obs["chilled"] else ROOM_C
    base = williams_minutes(mass, egg_c, water_c, yolk_c) * 60
    return max(60.0, base + per_extra_egg_s * (max(1, obs["count"]) - 1))


def golden(fn: Callable[[float], float], lo: float, hi: float, tol: float = 1e-4) -> float:
    g = (math.sqrt(5) - 1) / 2
    a, b = lo, hi
    c, d = b - g * (b - a), a + g * (b - a)
    while b - a > tol:
        if fn(c) < fn(d):
            b = d
        else:
            a = c
        c, d = b - g * (b - a), a + g * (b - a)
    return (a + b) / 2


def fit(observations: list[dict[str, Any]]) -> dict[str, Any]:
    chicken = [o for o in observations if o["kind"] == "chicken" and o.get("doneness") in DONENESS]
    counts = {o["count"] for o in chicken}

    def sse(group: list[dict[str, Any]], yolk: float, pe: float) -> float:
        return sum((predict(o, yolk, pe) - o["seconds"]) ** 2 for o in group)

    def fit_yolks(pe: float) -> dict[str, float]:
        out = {}
        for d in DONENESS:
            group = [o for o in chicken if o["doneness"] == d]
            if group:
                out[d] = round(golden(lambda y, g=group: sse(g, y, pe), 55.0, 95.0), 2)
        return out

    per_egg = PER_EXTRA_EGG_S
    if len(counts) > 1:

        def total(pe: float) -> float:
            yolks = fit_yolks(pe)
            return sum(
                sse([o for o in chicken if o["doneness"] == d], y, pe) for d, y in yolks.items()
            )

        per_egg = round(golden(total, 0.0, 90.0), 1)
    yolks = fit_yolks(per_egg)
    rows = []
    for o in chicken:
        p = predict(o, yolks[o["doneness"]], per_egg)
        rows.append({**o, "predicted": round(p), "error_s": round(p - o["seconds"], 1)})
    # Quail: fixed table per doneness (size and count ignored), chilled reference only.
    quail = {
        o["doneness"]: o["seconds"]
        for o in observations
        if o["kind"] == "quail" and o["chilled"] and o.get("doneness")
    }
    return {
        "yolkC": yolks,
        "perExtraEggS": per_egg,
        "countFitted": len(counts) > 1,
        "quailSeconds": quail,
        "rows": rows,
        "rmse_s": round(math.sqrt(sum(r["error_s"] ** 2 for r in rows) / len(rows)), 2)
        if rows
        else None,
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("observations", type=Path)
    args = parser.parse_args(argv)
    data = json.loads(args.observations.read_text(encoding="utf-8"))
    result = fit(data["observations"])
    print(f"{'vejce':<6}{'stupeň':<12}{'lednice':<9}{'ks':>3}{'app':>6}{'model':>7}{'chyba':>7}")
    for r in result["rows"]:
        print(
            f"{r['size']:<6}{r['doneness']:<12}{'ano' if r['chilled'] else 'ne':<9}"
            f"{r['count']:>3}{r['seconds']:>6}{r['predicted']:>7}{r['error_s']:>7}"
        )
    print(f"RMSE {result['rmse_s']} s")
    if not result["countFitted"]:
        print("Počet vajec: všechna měření mají stejný počet → perExtraEggS zůstává 20 s.")
    print(json.dumps({k: result[k] for k in ("yolkC", "perExtraEggS", "quailSeconds")}, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
