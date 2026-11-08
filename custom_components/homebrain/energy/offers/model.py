"""Offer model of Energie „Srovnání nabídek“ (user-entered, stored in the HA Store).

Prices of offers and regulated components are Kč/MWh WITHOUT VAT (as suppliers publish them);
monthly fees are Kč/month without VAT. VAT is added in the calculation. The current contract
keeps using the existing tariff helpers (Kč/kWh incl. VAT).
"""

from __future__ import annotations

import secrets
from collections.abc import Mapping
from typing import Any, Final

KINDS: Final = ("fixed", "spot")
EXPORT_MODES: Final = ("none", "fixed", "spot")
MAX_PRICE: Final = 100_000.0  # Kč/MWh
MAX_FEE: Final = 20_000.0  # Kč/month
MAX_OFFERS: Final = 12
REGULATED_YEAR: Final = 2026
REGULATED_KEYS: Final = (
    "distribution_vt",
    "distribution_nt",
    "system_services",
    "poze",
    "tax",
    "monthly_fixed",
    "current_export_price",
)


class OfferError(ValueError):
    """Invalid offer input (``code`` goes to the WS error)."""

    def __init__(self, code: str = "invalid_offer") -> None:
        super().__init__(code)
        self.code = code


def _num(value: Any, *, required: bool = False, limit: float = MAX_PRICE, low: float = 0.0):
    if value is None or (isinstance(value, str) and not value.strip()):
        if required:
            raise OfferError
        return None
    if isinstance(value, bool):
        raise OfferError
    if isinstance(value, str):
        value = value.replace("\u00a0", "").replace(" ", "").replace(",", ".")
    try:
        out = float(value)
    except (TypeError, ValueError) as err:
        raise OfferError from err
    if out != out or out < low or out > limit:  # NaN or out of range
        raise OfferError
    return round(out, 4)


def _offer_id(value: Any) -> str:
    if isinstance(value, str) and len(value) == 12 and all(c in "0123456789abcdef" for c in value):
        return value
    return secrets.token_hex(6)


def sanitize_offer(raw: Mapping[str, Any]) -> dict[str, Any]:
    """Validated offer dict; raises :class:`OfferError`."""
    name = str(raw.get("name") or "").strip()[:60]
    kind = raw.get("kind")
    if not name or kind not in KINDS:
        raise OfferError
    offer: dict[str, Any] = {
        "id": _offer_id(raw.get("id")),
        "name": name,
        "kind": kind,
        "price_vt": None,
        "price_nt": None,
        "margin": None,
        "monthly_fee": _num(raw.get("monthly_fee"), limit=MAX_FEE) or 0,
    }
    if kind == "fixed":
        offer["price_vt"] = _num(raw.get("price_vt"), required=True)
        offer["price_nt"] = _num(raw.get("price_nt"), required=True)
    else:
        offer["margin"] = _num(raw.get("margin"), required=True, low=-MAX_PRICE)
    raw_export = raw.get("export")
    export: Mapping[str, Any] = raw_export if isinstance(raw_export, Mapping) else {}
    mode = export.get("mode") or "none"
    if mode not in EXPORT_MODES or (mode == "spot" and kind != "spot"):
        raise OfferError
    offer["export"] = {
        "mode": mode,
        "price": _num(export.get("price"), required=True) if mode == "fixed" else None,
        "fee": (_num(export.get("fee"), low=-MAX_PRICE) or 0.0) if mode == "spot" else None,
    }
    return offer


def sanitize_regulated(raw: Mapping[str, Any]) -> dict[str, Any]:
    """Shared regulated components (Kč/MWh or Kč/month without VAT) + VAT %."""
    out: dict[str, Any] = {
        key: _num(raw.get(key), limit=MAX_PRICE) or 0.0 for key in REGULATED_KEYS
    }
    vat = _num(raw.get("vat_percent"), limit=50)
    out["vat_percent"] = 21 if vat is None else vat
    out["year"] = REGULATED_YEAR
    out["source"] = "saved"
    return out


def regulated_defaults(values: Mapping[str, float | None]) -> dict[str, Any]:
    """Prefill from the existing Energie helpers (spot comparison distribution, incl. VAT).

    ``dist_vt``/``dist_nt`` are Kč/kWh incl. VAT (distribution + system services + tax),
    ``fixed`` Kč/month incl. VAT. The user should split and check them in the editor.
    """
    out: dict[str, Any] = dict.fromkeys(REGULATED_KEYS, 0.0)
    out.update(vat_percent=21, year=REGULATED_YEAR, source="empty")
    mapping = (
        ("dist_vt", "distribution_vt", 1000),
        ("dist_nt", "distribution_nt", 1000),
        ("fixed", "monthly_fixed", 1),
    )
    for src, key, scale in mapping:
        value = values.get(src)
        if isinstance(value, (int, float)) and value > 0:
            out[key] = round(value * scale / 1.21, 2)
            out["source"] = "bindings"
    return out


def _part(group: Any, key: str) -> float | None:
    value = group.get(key) if isinstance(group, Mapping) else None
    return float(value) if isinstance(value, (int, float)) and not isinstance(value, bool) else None


def latest_confirmed_invoice(records: list[Mapping[str, Any]]) -> Mapping[str, Any] | None:
    """Newest user-confirmed invoice (by billing period end) with distribution prices."""
    best: Mapping[str, Any] | None = None
    best_end = ""
    for record in records:
        fields = record.get("fields")
        if record.get("status") != "confirmed" or not isinstance(fields, Mapping):
            continue
        period = fields.get("period")
        dist = fields.get("distribution_czk_per_mwh_excl_vat")
        if not (isinstance(period, list) and len(period) == 2 and isinstance(period[1], str)):
            continue
        if _part(dist, "vt") is None and _part(dist, "nt") is None:
            continue
        if period[1] > best_end:
            best, best_end = record, period[1]
    return best


def regulated_from_invoice(fields: Mapping[str, Any], base: Mapping[str, Any]) -> dict[str, Any]:
    """Regulated components prefilled from a confirmed invoice (all Kč without VAT).

    Distribution VT/NT, system services and the electricity tax come per MWh; the regulated
    monthly items are the breaker fee + OTE non-network infrastructure (the supplier's own fixed
    fee belongs to the offer). POZE: when the invoice charges it per month it is added to the
    monthly items; when the state waived it (2026), POZE stays 0 and ``poze_waived`` is set.
    """
    out = dict(base)
    dist = fields.get("distribution_czk_per_mwh_excl_vat")
    for src, key in (
        ("vt", "distribution_vt"),
        ("nt", "distribution_nt"),
        ("systemove_sluzby", "system_services"),
        ("dan", "tax"),
    ):
        value = _part(dist, src)
        if value is not None:
            out[key] = round(value, 2)
    fixed = fields.get("fixed_monthly_excl_vat")
    monthly = [_part(fixed, k) for k in ("jistic", "nesitova_infrastruktura")]
    poze_month = _part(fields, "poze_czk_per_month_excl_vat")
    waived = _part(fields, "poze_waived_czk")
    if any(v is not None for v in monthly):
        out["monthly_fixed"] = round(sum(v or 0.0 for v in monthly) + (poze_month or 0.0), 2)
    out["poze"] = 0.0
    out["poze_waived"] = bool(waived and waived > 0 and not poze_month)
    vat = _part(fields, "vat_rate")
    if vat is not None and 0 <= vat <= 50:
        out["vat_percent"] = vat
    out["source"] = "invoice"
    period = fields.get("period")
    out["source_period"] = list(period) if isinstance(period, list) else None
    return out
