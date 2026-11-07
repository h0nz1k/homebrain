"""Invoice vs HA measurement (pure): grid kWh, house/PV, cost estimate and tariff check."""

from __future__ import annotations

from collections.abc import Iterable, Mapping
from datetime import datetime, tzinfo
from typing import Any, Final

from ..compare import Tariff, _fee_share, _nt_share, _Series

# |Δ| of grid kWh up to this share counts as a match (reading time, rounding, meter class).
GRID_TOLERANCE_PCT: Final = 3.0
PRICE_TOLERANCE: Final = 0.005  # Kč/kWh (prices are printed with 2 decimals)
FIXED_TOLERANCE: Final = 0.5  # Kč/month


def _pct(value: float, base: float) -> float | None:
    return round((value - base) / base * 100, 1) if base else None


def estimate_cost(
    rows: Iterable[tuple[float, float | None]],
    start: datetime,
    end: datetime,
    tz: tzinfo,
    tariff: Tariff,
) -> float | None:
    """Grid import × today's VT/NT price (HDO share per hour) + prorated monthly fee."""
    if tariff.vt is None:
        return None
    series = _Series(rows)
    nt = tariff.nt if tariff.nt is not None else tariff.vt

    def price(t: float) -> float:
        share = _nt_share(t, tz, tariff.schedule)
        return tariff.vt * (1 - share) + nt * share  # type: ignore[operator]

    energy = series.sum(start, end, price)
    if energy is None:
        return None
    fee = (tariff.fixed_monthly or 0.0) * _fee_share(tz, start, end)
    return round(energy * tariff.correction + fee, 2)


def tariff_check(fields: Mapping[str, Any], current: Mapping[str, float | None]) -> dict[str, Any]:
    """Invoice-derived prices incl. VAT vs the HA tariff helpers."""
    avg = fields.get("avg_incl_vat") or {}
    invoice = {
        "vt": avg.get("vt"),
        "nt": avg.get("nt"),
        "fixed_monthly": fields.get("fixed_monthly_incl_vat"),
    }
    items: dict[str, Any] = {}
    for key, value in invoice.items():
        if value is None:
            continue
        cur = current.get(key)
        tol = FIXED_TOLERANCE if key == "fixed_monthly" else PRICE_TOLERANCE
        items[key] = {
            "invoice": value,
            "current": cur,
            "differs": cur is None or abs(cur - value) > tol,
        }
    return {"items": items, "mismatch": any(i["differs"] for i in items.values())}


def compare_invoice(
    fields: Mapping[str, Any],
    sums: Mapping[str, float | None],
    firsts: Mapping[str, str | None],
    estimate: float | None,
) -> dict[str, Any]:
    """Invoice period vs HA statistics (``sums`` kWh per series, None = not measured)."""
    kwh = (fields.get("kwh") or {}).get("total")
    invoice_kwh = float(kwh) if kwh is not None else None
    measured = sums.get("import")
    grid: dict[str, Any] = {
        "invoice": invoice_kwh,
        "measured": None if measured is None else round(measured, 1),
        "diff": None,
        "pct": None,
        "status": "missing",
        "measured_since": firsts.get("import"),
    }
    if measured is not None and invoice_kwh is not None:
        grid["diff"] = round(measured - invoice_kwh, 1)
        grid["pct"] = _pct(measured, invoice_kwh)
        ok = grid["pct"] is not None and abs(grid["pct"]) <= GRID_TOLERANCE_PCT
        grid["status"] = "ok" if ok else "diff"
    house = sums.get("house")
    self_use: dict[str, Any] | None = None
    if house is not None and measured is not None:
        self_use = {"kwh": round(max(0.0, house - measured), 1), "basis": "house_minus_import"}
    elif house is not None and invoice_kwh is not None:
        self_use = {"kwh": round(max(0.0, house - invoice_kwh), 1), "basis": "house_minus_invoice"}
    total = fields.get("total_incl_vat")
    cost: dict[str, Any] = {"invoice": total, "estimate": estimate, "diff": None, "pct": None}
    if total is not None and estimate is not None:
        cost["diff"] = round(estimate - total, 2)
        cost["pct"] = _pct(estimate, total)
    rnd = {
        k: (None if sums.get(k) is None else round(sums[k], 1)) for k in ("house", "pv", "export")
    }
    return {"grid": grid, **rnd, "self_consumption": self_use, "cost": cost}
