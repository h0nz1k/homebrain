"""Energie „Srovnání nabídek“: what the household would have paid with another offer.

Pure calculation over the household's metered hourly grid import/export (recorder long-term
statistics, kWh per hour) for the last up to 12 complete calendar months:

- current contract = the existing tariff helpers (VT/NT Kč/kWh incl. VAT, fixed Kč/month incl.
  VAT, meter correction on import) + the user's current buy-back price for export;
- offer = commodity (fixed VT/NT or hourly spot + margin) + shared regulated components
  (distribution VT/NT, system services, POZE, tax per MWh; fixed monthly) + VAT; export revenue
  (fixed price or spot − fee) is not subject to VAT (household is not a VAT payer).

VT/NT split per hour follows the HDO schedule of the existing tariff (same NT hours every day).
Totals compare only months in which every plan has a value (spot prices known for all hours).
"""

from __future__ import annotations

from collections.abc import Iterable, Mapping, Sequence
from datetime import UTC, datetime, tzinfo
from typing import Any, Final

from ..compare import Tariff, _month_start, _nt_share, _ts

MONTHS: Final = 12
CURRENT_ID: Final = "current"
ASSUMPTIONS: Final = (
    "same_profile",
    "hourly_metering",
    "hdo_schedule",
    "regulated_user",
    "export_no_vat",
)

Window = tuple[str, float, float, float]  # (YYYY-MM, start ts, end ts, fee share)


def month_windows(now: datetime, tz: tzinfo, first_ts: float) -> list[Window]:
    """Last up to 12 complete months before ``now``'s month, starting at the first data."""
    local = now.astimezone(tz)
    out: list[Window] = []
    for back in range(MONTHS, 0, -1):
        ms = _month_start(tz, local.year, local.month - back)
        me = _month_start(tz, ms.year, ms.month + 1)
        start, end = _ts(ms), _ts(me)
        if end <= first_ts:
            continue
        begin = max(start, first_ts)
        out.append((f"{ms.year:04d}-{ms.month:02d}", start, end, (end - begin) / (end - start)))
    return out


def _clean(rows: Iterable[tuple[float, float | None]]) -> dict[float, float]:
    out: dict[float, float] = {}
    for t, v in rows:
        if v is not None:
            out[float(t)] = out.get(float(t), 0.0) + max(0.0, float(v))
    return out


def _r(value: float | None) -> float | None:
    return None if value is None else round(value, 2)


def _plan_month(
    plan: Mapping[str, Any],
    hours: Sequence[tuple[float, float, float, float]],  # (ts, import kWh, export kWh, nt share)
    spot: Mapping[float, float],
    regulated: Mapping[str, Any],
    current: Tariff,
    fee_share: float,
) -> tuple[dict[str, float | None], int]:
    """Cost breakdown of one plan in one month (Kč) and the number of hours without spot."""
    missing = 0
    energy = distribution = export = 0.0
    if plan["kind"] == "current":
        vt, nt = current.vt or 0.0, current.nt if current.nt is not None else current.vt or 0.0
        buyback = float(regulated.get("current_export_price") or 0.0) / 1000
        for _, imp, exp, s in hours:
            energy += imp * current.correction * (vt * (1 - s) + nt * s)
            export += exp * buyback
        fees = (current.fixed_monthly or 0.0) * fee_share
        vat = (energy + fees) * 0.21 / 1.21  # informative: tariff prices already include VAT
        return {
            "energy": _r(energy),
            "distribution": None,
            "fees": _r(fees),
            "vat": _r(vat),
            "export": _r(export),
            "total": _r(energy + fees - export),
        }, 0
    per_mwh = (
        float(regulated.get("system_services") or 0)
        + float(regulated.get("poze") or 0)
        + float(regulated.get("tax") or 0)
    )
    d_vt = float(regulated.get("distribution_vt") or 0)
    d_nt = float(regulated.get("distribution_nt") or 0)
    mode = plan["export"]["mode"]
    for ts, imp, exp, s in hours:
        price = spot.get(ts)
        if plan["kind"] == "spot" or mode == "spot":
            if price is None and (imp > 0 or exp > 0):
                missing += 1
                continue
        if plan["kind"] == "fixed":
            commodity = plan["price_vt"] * (1 - s) + plan["price_nt"] * s
        else:
            commodity = (price or 0.0) + plan["margin"]
        energy += imp * commodity / 1000
        distribution += imp * (d_vt * (1 - s) + d_nt * s + per_mwh) / 1000
        if mode == "fixed":
            export += exp * plan["export"]["price"] / 1000
        elif mode == "spot":
            export += exp * ((price or 0.0) - plan["export"]["fee"]) / 1000
    fees = (float(plan.get("monthly_fee") or 0) + float(regulated.get("monthly_fixed") or 0)) * (
        fee_share
    )
    base = energy + distribution + fees
    vat = base * float(regulated.get("vat_percent", 21)) / 100
    total = None if missing else base + vat - export
    return {
        "energy": _r(energy),
        "distribution": _r(distribution),
        "fees": _r(fees),
        "vat": _r(vat),
        "export": _r(export),
        "total": _r(total),
    }, missing


def compare_offers(
    *,
    imports: Iterable[tuple[float, float | None]],
    exports: Iterable[tuple[float, float | None]],
    spot: Mapping[float, float],
    current: Tariff,
    regulated: Mapping[str, Any],
    offers: Sequence[Mapping[str, Any]],
    now: datetime,
    tz: tzinfo,
) -> dict[str, Any]:
    """Per-month and total cost of the current contract and every offer, ranked cheapest first."""
    imp, exp = _clean(imports), _clean(exports)
    if not imp:
        return {"status": "nodata"}
    windows = month_windows(now, tz, min(imp))
    if not windows:
        return {"status": "nodata"}
    plans: list[dict[str, Any]] = []
    if current.vt is not None:
        plans.append({"id": CURRENT_ID, "name": "Současná smlouva", "kind": "current"})
    plans.extend({**o} for o in offers)
    months: list[dict[str, Any]] = []
    per_plan: dict[str, list[dict[str, float | None]]] = {p["id"]: [] for p in plans}
    missing: dict[str, int] = {p["id"]: 0 for p in plans}
    for key, start, end, share in windows:
        hours = []
        for ts in sorted(t for t in set(imp) | set(exp) if start <= t < end):
            hours.append(
                (ts, imp.get(ts, 0.0), exp.get(ts, 0.0), _nt_share(ts, tz, current.schedule))
            )
        imp_kwh = sum(h[1] for h in hours)
        nt_kwh = sum(h[1] * h[3] for h in hours)
        months.append(
            {
                "month": key,
                "partial": share < 0.999,
                "import_kwh": _r(imp_kwh),
                "export_kwh": _r(sum(h[2] for h in hours)),
                "nt_share": _r(nt_kwh / imp_kwh) if imp_kwh else None,
            }
        )
        for plan in plans:
            row, miss = _plan_month(plan, hours, spot, regulated, current, share)
            per_plan[plan["id"]].append(row)
            missing[plan["id"]] += miss
    compared = [
        i
        for i in range(len(windows))
        if all(per_plan[p["id"]][i]["total"] is not None for p in plans)
    ]
    for i in compared:
        months[i]["compared"] = True
    out_plans = []
    for plan in plans:
        rows = per_plan[plan["id"]]
        total = sum(rows[i]["total"] or 0.0 for i in compared) if compared else None
        out_plans.append(
            {
                "id": plan["id"],
                "name": plan["name"],
                "kind": plan["kind"],
                "months": rows,
                "total": _r(total),
                "missing_spot_hours": missing[plan["id"]],
            }
        )
    cur = next((p for p in out_plans if p["id"] == CURRENT_ID), None)
    for p in out_plans:
        p["diff"] = (
            _r(p["total"] - cur["total"])
            if cur and p is not cur and p["total"] is not None and cur["total"] is not None
            else None
        )
    ranking = [
        p["id"] for p in sorted(out_plans, key=lambda p: (p["total"] is None, p["total"] or 0.0))
    ]
    return {
        "status": "ok",
        "period": {"from": windows[0][0], "to": windows[-1][0]},
        "months": months,
        "months_compared": len(compared),
        "plans": out_plans,
        "ranking": ranking,
        "assumptions": list(ASSUMPTIONS),
        "generated": datetime.now(UTC).isoformat(timespec="seconds"),
    }
