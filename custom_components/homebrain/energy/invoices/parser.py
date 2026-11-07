"""Electricity invoice parsing (pure): supplier parsers + a generic fallback.

Input is the PDF text layer (pypdf ``layout`` mode keeps table rows on one line). Regexes run on
an accent-folded copy of the text (``Kč`` -> ``Kc``) with identical character offsets, so the
same rules work for PDFs whose fonts lose diacritics. Only billing data is extracted – never the
customer's name, address, contact, customer/contract numbers, EAN or meter number.
"""

from __future__ import annotations

import io
import re
import unicodedata
from datetime import date
from typing import Any, Final

MAX_PDF_BYTES: Final = 5 * 1024 * 1024
MAX_PDF_PAGES: Final = 20
MAX_TEXT_CHARS: Final = 200_000

NUM: Final = r"\d{1,3}(?:[ \u00a0]\d{3})*(?:,\d+)?"
DATE: Final = r"(\d{1,2})\.\s?(\d{1,2})\.\s?(\d{4})"
DASH: Final = r"\s*[-\u2013\u2014]\s*"

# Every field the UI can edit; nested dicts list their keys.
FIELDS: Final[dict[str, tuple[str, ...] | str]] = {
    "supplier": "text",
    "distributor": "text",
    "product": "text",
    "rate": "text",
    "breaker": "text",
    "period": "period",
    "issued": "date",
    "due": "date",
    "contract_end": "date",
    "meter": ("vt", "nt"),
    "kwh": ("vt", "nt", "total"),
    "commodity_czk_per_mwh_excl_vat": ("vt", "nt"),
    "fixed_monthly_excl_vat": ("stala_platba", "jistic", "nesitova_infrastruktura"),
    "distribution_czk_per_mwh_excl_vat": ("vt", "nt", "systemove_sluzby", "dan"),
    "poze_czk_per_month_excl_vat": "number",
    "poze_waived_czk": "number",
    "total_excl_vat": "number",
    "vat": "number",
    "vat_rate": "number",
    "total_incl_vat": "number",
    "avg_incl_vat": ("vt", "nt"),
    "fixed_monthly_incl_vat": "number",
    "history": "history",
}
# Required for the comparison; reported in ``missing`` when absent.
CORE: Final = ("period", "kwh", "total_incl_vat", "avg_incl_vat", "fixed_monthly_incl_vat")


class InvoiceError(Exception):
    """Unreadable upload or invalid edited fields (``code`` for the UI)."""

    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


def pdf_text(data: bytes) -> str:
    """Text layer of a PDF (pypdf layout mode; bounded size/pages). ``''`` = scan/no text."""
    if len(data) > MAX_PDF_BYTES:
        raise InvoiceError("too_large")
    if not data.startswith(b"%PDF"):
        raise InvoiceError("not_pdf")
    from pypdf import PdfReader  # noqa: PLC0415 - heavy dependency, manifest requirement

    try:
        reader = PdfReader(io.BytesIO(data))
        if reader.is_encrypted or len(reader.pages) > MAX_PDF_PAGES:
            raise InvoiceError("unreadable_pdf")
        pages = [page.extract_text(extraction_mode="layout") or "" for page in reader.pages]
    except InvoiceError:
        raise
    except Exception as err:  # noqa: BLE001 - pypdf raises many types on broken files
        raise InvoiceError("unreadable_pdf") from err
    return "\n=====PAGE=====\n".join(pages)[:MAX_TEXT_CHARS]


def _fold(text: str) -> str:
    """Strip diacritics char-by-char (same length -> offsets map back to the original)."""
    return "".join(unicodedata.normalize("NFKD", c)[0] if c else c for c in text)


def _num(raw: str | None) -> float | None:
    if raw is None:
        return None
    try:
        return float(re.sub(r"[ \u00a0]", "", raw).replace(",", "."))
    except ValueError:
        return None


def _int(raw: str | None) -> int | float | None:
    value = _num(raw)
    if value is None:
        return None
    return int(value) if value.is_integer() else value


def _iso(d: str, m: str, y: str) -> str | None:
    try:
        return date(int(y), int(m), int(d)).isoformat()
    except ValueError:
        return None


class _Text:
    def __init__(self, text: str) -> None:
        self.raw = unicodedata.normalize("NFC", text)
        self.fold = _fold(self.raw)

    def search(self, pattern: str, flags: int = re.M) -> re.Match[str] | None:
        return re.search(pattern, self.fold, flags)

    def original(self, match: re.Match[str], group: int = 1) -> str:
        return self.raw[match.start(group) : match.end(group)]

    def date(self, pattern: str) -> str | None:
        m = self.search(pattern)
        return _iso(m.group(1), m.group(2), m.group(3)) if m else None

    def number(self, pattern: str, flags: int = re.M) -> float | None:
        m = self.search(pattern, flags)
        return _num(m.group(1)) if m else None

    def unit_price(self, label: str) -> float | None:
        """Unit price column of a billing row: ``<label> <qty> <unit> <price> Kc <total> Kc``."""
        return self.number(rf"^\s*{label}\s+{NUM}\s+(?:MWh|mes\.)\s+({NUM})\s*Kc")


def _avg_incl_vat(t: _Text, kwh: dict[str, Any]) -> dict[str, float] | None:
    m = t.search(rf"({NUM})\s*Kc\s+({NUM})\s*Kc\s*\n\s*Vase prumerna cena")
    if m:
        return {"vt": _num(m.group(1)), "nt": _num(m.group(2))}  # type: ignore[dict-item]
    out: dict[str, float] = {}
    for key, label in (("vt", r"Vysoky tarif \(VT/T1\)"), ("nt", r"Nizky tarif \(NT/T2\)")):
        m = t.search(rf"^\s*{label}\s+({NUM}) kWh\s+{NUM} Kc/kWh\s+{NUM} Kc\s+({NUM}) Kc")
        qty = _num(m.group(1)) if m else None
        if not m or not qty:
            return None
        out[key] = round((_num(m.group(2)) or 0) / qty, 2)
    return out


def _history(t: _Text, period_start: str | None) -> list[dict[str, Any]]:
    head = t.search(r"Historie spotreby")
    if not head:
        return []
    rows: list[dict[str, Any]] = []
    pattern = (
        rf"^\s*{DATE}{DASH}{DATE}\s+\d+\s+({NUM}) kWh\s+({NUM}) kWh\s+({NUM}) kWh"
        rf"\s+({NUM})\s*Kc\s+({NUM})\s*Kc"
    )
    for m in re.finditer(pattern, t.fold[head.end() :], re.M):
        start = _iso(m.group(1), m.group(2), m.group(3))
        if start is None or start == period_start:
            continue
        rows.append(
            {
                "month": start[:7],
                "vt": _int(m.group(7)),
                "nt": _int(m.group(8)),
                "total": _int(m.group(9)),
                "czk": _num(m.group(11)),
            }
        )
    return rows


def _parse_cez(t: _Text) -> dict[str, Any]:
    f: dict[str, Any] = {"supplier": "ČEZ Prodej"}
    m = t.search(r"porucho\w* linka\s*-\s*([A-Z][\w.]*[\w])")
    f["distributor"] = m.group(1) if m else None
    m = t.search(r"Produkt (\S.*?)(?:\s{2,}|$)")
    f["product"] = t.original(m) if m else None
    m = t.search(r"(?:Distribucni s|S)azba\s+(D\d{2}[A-Z])")
    f["rate"] = m.group(1) if m else None
    m = t.search(r"Jistic:\s*(\d)\s*[x\u00d7]\s*(\d+)\s*A")
    f["breaker"] = f"{m.group(1)}x{m.group(2)}A" if m else None
    start = t.date(rf"Zacatek zuctovaciho obdobi\s+{DATE}")
    end = t.date(rf"Konec zuctovaciho obdobi\s+{DATE}")
    f["period"] = [start, end] if start and end else None
    f["issued"] = t.date(rf"Datum vystaveni\s+{DATE}")
    f["due"] = t.date(rf"Datum splatnosti:?\s+{DATE}")
    f["contract_end"] = t.date(rf"na dobu urcitou do dne\s+{DATE}")
    a = t.search(rf"Pocatecni stav elektromeru\s+({NUM}) kWh\s+({NUM}) kWh")
    b = t.search(rf"Konecny stav elektromeru\s+({NUM}) kWh\s+({NUM}) kWh")
    f["meter"] = (
        {
            "vt": [_int(a.group(1)), _int(b.group(1))],
            "nt": [_int(a.group(2)), _int(b.group(2))],
        }
        if a and b
        else None
    )
    m = t.search(rf"Celkove distribuovane mnozstvi elektriny\s+({NUM}) kWh\s+({NUM}) kWh")
    total = t.number(rf"Celkove dodane mnozstvi elektriny\s+({NUM}) kWh")
    f["kwh"] = (
        {"vt": _int(m.group(1)), "nt": _int(m.group(2)), "total": _int(f"{total:g}")}
        if m and total is not None
        else None
    )
    f["commodity_czk_per_mwh_excl_vat"] = {
        "vt": t.unit_price(r"Spotreba / vysoky tarif \(VT/T1\)"),
        "nt": t.unit_price(r"Spotreba / nizky tarif \(NT/T2\)"),
    }
    f["fixed_monthly_excl_vat"] = {
        "stala_platba": t.unit_price("Stala platba"),
        "jistic": t.unit_price("Platba za jistic"),
        "nesitova_infrastruktura": t.unit_price("Provoz nesitove infrastruktury"),
    }
    f["distribution_czk_per_mwh_excl_vat"] = {
        "vt": t.unit_price(r"Distribuce / vysoky tarif \(VT/T1\)"),
        "nt": t.unit_price(r"Distribuce / nizky tarif \(NT/T2\)"),
        "systemove_sluzby": t.unit_price("Systemove sluzby"),
        "dan": t.unit_price("Dan z elektriny"),
    }
    f["poze_czk_per_month_excl_vat"] = t.unit_price("Platba POZE")
    f["poze_waived_czk"] = t.number(rf"odpustenou\s+platbu.{{0,200}}?ve vysi\s+({NUM})\s*Kc", re.S)
    m = t.search(rf"^\s*Celkem\s+({NUM})\s*Kc\s+(\d+)\s*%\s+({NUM})\s*Kc\s+({NUM})\s*Kc")
    f["total_excl_vat"] = _num(m.group(1)) if m else None
    f["vat_rate"] = int(m.group(2)) if m else None
    f["vat"] = _num(m.group(3)) if m else None
    f["total_incl_vat"] = _num(m.group(4)) if m else None
    f["avg_incl_vat"] = _avg_incl_vat(t, f["kwh"] or {})
    m = t.search(
        rf"Polozky nezavisle na mnozstvi\s+({NUM}) mes\.\s+{NUM} Kc/mes\.\s+{NUM} Kc\s+({NUM}) Kc"
    )
    months = _num(m.group(1)) if m else None
    f["fixed_monthly_incl_vat"] = (
        round((_num(m.group(2)) or 0) / months, 2) if m and months else None
    )
    f["history"] = _history(t, start)
    return f


def _parse_generic(t: _Text) -> dict[str, Any]:
    f: dict[str, Any] = {key: None for key in FIELDS}
    f["history"] = []
    m = t.search(rf"{DATE}{DASH}{DATE}")
    if m:
        a, b = _iso(m.group(1), m.group(2), m.group(3)), _iso(m.group(4), m.group(5), m.group(6))
        f["period"] = [a, b] if a and b else None
    m = t.search(rf"(?i)(?:spotreb|celkem|dodan)[^\n]*?({NUM})\s*kWh")
    f["kwh"] = {"vt": None, "nt": None, "total": _int(m.group(1))} if m else None
    incl = re.findall(rf"(?i)(?:s DPH|k uhrade)[^\n]*?({NUM})\s*Kc", t.fold)
    excl = re.findall(rf"(?i)bez DPH[^\n]*?({NUM})\s*Kc", t.fold)
    f["total_incl_vat"] = max((_num(x) or 0 for x in incl), default=None) or None
    f["total_excl_vat"] = max((_num(x) or 0 for x in excl), default=None) or None
    return f


def _filled(value: Any, partial: bool) -> bool:
    if value is None:
        return False
    if isinstance(value, dict):
        check = any if partial else all
        return check(_filled(v, partial) for v in value.values())
    if isinstance(value, list):
        return all(v is not None for v in value)
    return True


def parse_invoice_text(text: str) -> dict[str, Any]:
    """``{parser, fields, confidence, missing}``; every field stays editable in the UI."""
    t = _Text(text or "")
    cez = bool(t.search(r"CEZ Prodej")) and bool(t.search(r"VYUCTOVANI ZA ELEKTRINU", re.M | re.I))
    fields = _parse_cez(t) if cez else _parse_generic(t)
    for key in FIELDS:
        fields.setdefault(key, [] if key == "history" else None)
    level = "high" if cez else "low"
    confidence = {
        k: level for k, v in fields.items() if k != "history" and _filled(v, partial=not cez)
    }
    missing = [k for k in (FIELDS if cez else CORE) if k != "history" and k not in confidence]
    return {
        "parser": "cez_prodej" if cez else "generic",
        "fields": fields,
        "confidence": confidence,
        "missing": missing,
    }


def _clean_text(value: Any) -> str | None:
    if value is None or value == "":
        return None
    out = re.sub(r"[^\w .,/×+\-–()%]", "", str(value), flags=re.U).strip()[:80]
    return out or None


def _clean_num(value: Any) -> float | None:
    if value is None or value == "":
        return None
    if isinstance(value, bool):
        raise InvoiceError("invalid_field")
    if isinstance(value, int | float):
        number = float(value)
    else:
        number = _num(str(value).strip())
        if number is None:
            raise InvoiceError("invalid_field")
    if not -1e7 < number < 1e7:
        raise InvoiceError("invalid_field")
    return number


def _clean_date(value: Any) -> str | None:
    if value is None or value == "":
        return None
    try:
        return date.fromisoformat(str(value)).isoformat()
    except ValueError as err:
        raise InvoiceError("invalid_field") from err


def sanitize_fields(raw: dict[str, Any]) -> dict[str, Any]:
    """Validate edited fields: known keys only, numbers/dates normalised, text stripped."""
    out: dict[str, Any] = {}
    for key, kind in FIELDS.items():
        value = raw.get(key)
        if isinstance(kind, tuple):
            src = value if isinstance(value, dict) else {}
            if key == "meter":
                out[key] = {
                    k: [_clean_num(x) for x in (src.get(k) or [None, None])[:2]] for k in kind
                }
            else:
                out[key] = {k: _clean_num(src.get(k)) for k in kind}
        elif kind == "text":
            out[key] = _clean_text(value)
        elif kind == "date":
            out[key] = _clean_date(value)
        elif kind == "period":
            pair = value if isinstance(value, list) and len(value) == 2 else [None, None]
            dates = [_clean_date(x) for x in pair]
            out[key] = dates if all(dates) else None
        elif kind == "history":
            rows = value if isinstance(value, list) else []
            out[key] = [
                {
                    "month": str(r.get("month"))[:7],
                    **{k: _clean_num(r.get(k)) for k in ("vt", "nt", "total", "czk")},
                }
                for r in rows[:24]
                if isinstance(r, dict) and re.fullmatch(r"\d{4}-\d{2}", str(r.get("month")))
            ]
        else:
            out[key] = _clean_num(value)
    return out
