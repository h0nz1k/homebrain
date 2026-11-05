"""Znovín order-confirmation importer (PDF print of the e-mail or pasted text).

Privacy: only product lines and totals are extracted. Billing/delivery blocks, names,
addresses, phone numbers and e-mails are never parsed into the result. The order
number is reduced to an HMAC fingerprint (per-install secret) and never stored.
"""

from __future__ import annotations

import hashlib
import hmac
import io
import re
import unicodedata
from dataclasses import asdict, dataclass, field
from typing import Any

from ..domain import WineError
from ..naming import clean_label, predicate_from

# HA's WebSocket frame limit is 4 MB; base64 adds 1/3, so the PDF itself stays below 2.5 MB.
MAX_PDF_BYTES = 2_500_000
MAX_TEXT_CHARS = 400_000
MAX_PDF_PAGES = 30
MAX_ITEMS = 300
PRODUCER = "Znovín Znojmo"

SWEETNESS = (
    "extra brut",
    "brut nature",
    "demi sec",
    "polosuché",
    "polosladké",
    "sladké",
    "suché",
    "extra dry",
    "brut",
    "sec",
    "doux",
)
# Longest first so "Rulandské modré" wins over "Rulandské".
VARIETIES: dict[str, str] = {
    "Muškát moravský": "white",
    "Muškát Ottonel": "white",
    "Pálava": "white",
    "Rulandské bílé": "white",
    "Rulandské šedé": "white",
    "Rulandské modré": "red",
    "Tramín červený": "white",
    "Sauvignon": "white",
    "Ryzlink rýnský": "white",
    "Ryzlink vlašský": "white",
    "Veltlínské zelené": "white",
    "Veltlínské červené rané": "white",
    "Neuburské": "white",
    "Sylvánské zelené": "white",
    "Müller Thurgau": "white",
    "Chardonnay": "white",
    "Irsai Oliver": "white",
    "Hibernal": "white",
    "Solaris": "white",
    "Kerner": "white",
    "Aurelius": "white",
    "Frankovka": "red",
    "Svatovavřinecké": "red",
    "Zweigeltrebe": "red",
    "Modrý Portugal": "red",
    "Blauburger": "red",
    "André": "red",
    "Cabernet Sauvignon": "red",
    "Cabernet Moravia": "red",
    "Merlot": "red",
    "Dornfelder": "red",
}
_VARIETY_ORDER = sorted(VARIETIES, key=len, reverse=True)

_ANCHOR = re.compile(r"Obj\.?\s*č(?:íslo|\.)\s*:?\s*([A-Z])\s*[- ]?\s*(\d{3,6})")
_BATCH = re.compile(r"Šarže\s*:?\s*([A-Za-z0-9-]{1,20})")
_VOLUME = re.compile(r"Obsah\s*:?\s*(\d+(?:[,.]\d+)?)\s*l\b")
_MONEY = r"(-?\s*\d{1,3}(?:[ \u00a0\u202f]?\d{3})*(?:,\d{1,2})?)\s*(?:Kč|CZK)"
_QTY_PRICE = re.compile(rf"^(\d{{1,4}})\s*ks\s+{_MONEY}$")
_QTY_ONLY = re.compile(r"^(\d{1,4})\s*ks$")
_PRICE_ONLY = re.compile(rf"^{_MONEY}$")
_TOTAL = re.compile(rf"Cena\s+celkem\s*:?\s*{_MONEY}")
_CAT_VINTAGE = re.compile(r"^(.*?)\s*((?:19|20)\d{2})?$")
_ORDER_NO = re.compile(r"(?:[Oo]bjednávk[ay]|[Oo]bjednávce)\D{0,25}?(\d{5,12})\b")
_HEADER_STOP = re.compile(r"objednáv|souhrn|Dobrý den|Děkujeme", re.IGNORECASE)
_SWEET_RE = re.compile(r"^(" + "|".join(re.escape(s) for s in SWEETNESS) + r")\s*/", re.IGNORECASE)
# Multipacks: "5+1" promo cartons (Znovín codes them "K <batch>") or "karton 6 lahví".
_PROMO_PACK = re.compile(r"(?<![\d,.])(\d{1,2})\s*\+\s*(\d{1,2})(?![\d,.])")
_CARTON = re.compile(
    r"\s*[-–(]?\s*\bkarton\w*\s*(?:po|à|a|-|\()?\s*(\d{1,2})\s*(?:ks|lahv\w*|x)\b\)?",
    re.IGNORECASE,
)
MAX_PACK = 24


def money(value: str) -> float:
    return float(re.sub(r"[\s\u00a0\u202f]", "", value).replace(",", "."))


def _norm(text: str) -> str:
    return unicodedata.normalize("NFC", text)


def pdf_to_text(data: bytes) -> str:
    """Extract text from a PDF (pypdf, lazily imported; bounded size/pages)."""
    if len(data) > MAX_PDF_BYTES:
        raise WineError("IMPORT_TOO_LARGE")
    if not data.startswith(b"%PDF"):
        raise WineError("IMPORT_PARSE_ERROR", "pdf")
    try:
        from pypdf import PdfReader  # noqa: PLC0415 - optional heavy dependency
        from pypdf.errors import PdfReadError  # noqa: PLC0415
    except ImportError as err:  # pragma: no cover - manifest installs pypdf
        raise WineError("IMPORT_PARSE_ERROR", "pypdf") from err
    try:
        reader = PdfReader(io.BytesIO(data))
        if reader.is_encrypted or len(reader.pages) > MAX_PDF_PAGES:
            raise WineError("IMPORT_PARSE_ERROR", "pdf")
        text = "\n".join(page.extract_text() or "" for page in reader.pages)
    except (PdfReadError, ValueError, KeyError, TypeError) as err:
        raise WineError("IMPORT_PARSE_ERROR", "pdf") from err
    return text[:MAX_TEXT_CHARS]


def _lines(text: str) -> list[str]:
    raw = [_norm(p).strip() for chunk in text.splitlines() for p in chunk.split("\t")]
    raw = [re.sub(r"[ \u00a0\u202f]+", " ", line) for line in raw if line.strip()]
    out: list[str] = []
    for line in raw:
        prev = out[-1] if out else ""
        # Re-join table cells that the print/paste split apart.
        if out and (
            (_QTY_ONLY.match(prev) and _PRICE_ONLY.match(line))
            or (re.fullmatch(r"Šarže\s*:?\s*\S+\s*/?", prev) and "Obj" in line)
            or (_ANCHOR.search(prev) and line.startswith(("/Obsah", "Obsah")))
            or (_SWEET_RE.match(prev) and prev.count("/") < 2 and line.startswith("/"))
        ):
            out[-1] = f"{prev} {line}"
            continue
        out.append(line)
    return out


@dataclass
class DraftLine:
    index: int
    catalogue_code: str
    batch: str | None
    title: str
    name: str
    variety: str | None
    label_name: str | None
    predicate: str | None
    color: str
    wine_type: str
    sweetness: str | None
    category: str | None
    vintage: int | None
    line: str | None
    volume_l: float
    quantity: int | None = None  # bottles (order units × pack size)
    order_units: int | None = None  # units as printed on the order (cartons for multipacks)
    pack_size: int = 1  # bottles per ordered unit
    pack_label: str | None = None  # e.g. "5+1" or "karton 6"
    line_total: float | None = None
    unit_price: float | None = None
    currency: str = "CZK"
    issues: list[str] = field(default_factory=list)


@dataclass
class OrderDraft:
    recognized: bool
    vendor: str | None
    lines: list[DraftLine]
    items_total: float
    discounts: float
    fees: float
    order_total: float | None
    check_ok: bool
    issues: list[str]
    order_ref: str | None  # transient; never persisted or returned

    def bottles(self) -> int:
        return sum(item.quantity or 0 for item in self.lines)

    def public(self) -> dict[str, Any]:
        return {
            "recognized": self.recognized,
            "vendor": self.vendor,
            "lines": [asdict(item) for item in self.lines],
            "itemCount": len(self.lines),
            "bottles": self.bottles(),
            "check": {
                "ok": self.check_ok,
                "itemsTotal": round(self.items_total, 2),
                "discounts": round(self.discounts, 2),
                "fees": round(self.fees, 2),
                "orderTotal": self.order_total,
                "expectedTotal": round(self.items_total - self.discounts + self.fees, 2),
            },
            "issues": self.issues,
        }


def _variety(text: str) -> str | None:
    folded = text.casefold()
    for name in _VARIETY_ORDER:
        if name.casefold() in folded:
            return name
    return None


def _detail(text: str) -> tuple[str | None, str | None, int | None, str | None]:
    parts = [p.strip() for p in text.split("/", 2)]
    while len(parts) < 3:
        parts.append("")
    sweetness = parts[0].lower() or None
    match = _CAT_VINTAGE.match(parts[1])
    category = (match.group(1) if match else parts[1]).strip() or None
    vintage = int(match.group(2)) if match and match.group(2) else None
    line = re.sub(r"\s*-\s*", "-", parts[2]).strip() or None
    return sweetness, category, vintage, line


def _wine_type(category: str | None, sweetness: str | None, title: str) -> str:
    text = f"{category or ''} {title}".casefold()
    if "perliv" in text:
        return "semi_sparkling"
    if "šumiv" in text or "sekt" in text or sweetness in {"brut", "sec", "demi sec", "extra brut"}:
        return "sparkling"
    return "still"


def _color(title: str, variety: str | None) -> str:
    folded = title.casefold()
    if "rosé" in folded or "rose " in folded or "růžov" in folded:
        return "rose"
    if "klaret" in folded or "blanc de noir" in folded:
        return "white"
    return VARIETIES.get(variety or "", "other")


def _pack(code: str, title_parts: list[str]) -> tuple[int, str | None, list[str]]:
    """Bottles per ordered unit for multipack lines ("5+1" promo cartons, "karton 6 lahví").

    Znovín prints a promo carton as one line with quantity 1 ("Zweigeltrebe 5+1",
    catalogue code ``K <batch>``) although it contains six bottles. A ``K`` code without a
    readable pack size is flagged instead of guessed.
    """
    text = " ".join(title_parts)
    if m := _PROMO_PACK.search(text):
        size = int(m.group(1)) + int(m.group(2))
        if 2 <= size <= MAX_PACK:
            return size, f"{m.group(1)}+{m.group(2)}", []
    if (m := _CARTON.search(text)) and 2 <= int(m.group(1)) <= MAX_PACK:
        return int(m.group(1)), f"karton {m.group(1)}", []
    if code.startswith("K "):
        return 1, None, ["pack_size_unknown"]
    return 1, None, []


def _strip_pack(text: str) -> str:
    text = _PROMO_PACK.sub("", text)
    text = _CARTON.sub("", text)
    return re.sub(r"\s{2,}", " ", text).strip(" -–")


def parse_order_text(text: str) -> OrderDraft:
    """Parse Znovín order text. Unknown layouts return recognized=False (no guessing)."""
    if len(text) > MAX_TEXT_CHARS:
        raise WineError("IMPORT_TOO_LARGE")
    lines = _lines(text)
    anchors = [i for i, line in enumerate(lines) if _ANCHOR.search(line)]
    if not anchors or not any(_BATCH.search(lines[i]) for i in anchors):
        return OrderDraft(False, None, [], 0, 0, 0, None, False, ["unrecognised"], None)
    if len(anchors) > MAX_ITEMS:
        raise WineError("IMPORT_TOO_LARGE")
    last = anchors[-1]
    tail_end = next(
        (i for i in range(last, len(lines)) if re.match(r"Slevov|Doprava|Cena celkem", lines[i])),
        len(lines),
    )
    qty_rows = [
        (i, int(m.group(1)), money(m.group(2)))
        for i, line in enumerate(lines[:tail_end])
        if (m := _QTY_PRICE.match(line))
    ]
    issues: list[str] = []
    items: list[DraftLine] = []
    for n, a in enumerate(anchors, start=1):
        anchor = lines[a]
        code_m = _ANCHOR.search(anchor)
        code = f"{code_m.group(1)} {code_m.group(2)}"
        batch_m = _BATCH.search(anchor) or (_BATCH.search(lines[a - 1]) if a else None)
        vol_m = _VOLUME.search(anchor) or (
            _VOLUME.search(lines[a + 1]) if a + 1 < len(lines) else None
        )
        floor = anchors[n - 2] if n > 1 else -1
        detail_idx = next(
            (i for i in range(a - 1, max(floor, a - 4), -1) if _SWEET_RE.match(lines[i])),
            None,
        )
        sweetness = category = line = None
        vintage = None
        title_parts: list[str] = []
        if detail_idx is not None:
            sweetness, category, vintage, line = _detail(lines[detail_idx])
            i = detail_idx - 1
            while i > floor and len(title_parts) < 2:
                cur = lines[i]
                if _QTY_PRICE.match(cur):
                    i -= 1
                    continue
                if _ANCHOR.search(cur) or _HEADER_STOP.search(cur) or _SWEET_RE.match(cur):
                    break
                title_parts.insert(0, cur)
                i -= 1
        pack_size, pack_label, pack_issues = _pack(code, title_parts)
        title_parts = [cleaned for part in title_parts if (cleaned := _strip_pack(part))]
        title = " – ".join(title_parts) or code
        variety = _variety(title)
        # Two title lines = variety heading (the e-shop H1) + product/label name.
        name = title_parts[0] if title_parts else code
        label = clean_label(name, title_parts[-1]) if len(title_parts) > 1 else None
        item = DraftLine(
            index=n,
            catalogue_code=code,
            batch=batch_m.group(1) if batch_m else None,
            title=title,
            name=name,
            variety=variety,
            label_name=label,
            predicate=predicate_from(category),
            color=_color(title, variety),
            wine_type=_wine_type(category, sweetness, title),
            sweetness=sweetness,
            category=category,
            vintage=vintage,
            line=line,
            volume_l=money(vol_m.group(1)) if vol_m else 0.75,
            pack_size=pack_size,
            pack_label=pack_label,
        )
        item.issues.extend(pack_issues)
        if detail_idx is None:
            item.issues.append("detail_missing")
        if not title_parts:
            item.issues.append("title_missing")
        items.append(item)
    # Table cells may shift (a qty/price pair printed next to the following title), but
    # the document order is preserved, so pairs are assigned to items in order.
    if len(qty_rows) == len(items):
        for item, (_, qty, total) in zip(items, qty_rows, strict=True):
            item.order_units = qty
            item.quantity = qty * item.pack_size
            item.line_total = total
            item.unit_price = round(total / item.quantity, 2) if item.quantity else None
    else:
        issues.append("quantity_mismatch")
    discounts = fees = 0.0
    tail = lines[last + 1 :]
    for i, cur in enumerate(tail):
        if cur.startswith("Slevov"):
            for nxt in tail[i + 1 : i + 4]:
                if (m := _PRICE_ONLY.match(nxt)) and money(m.group(1)) < 0:
                    discounts += -money(m.group(1))
                    break
        elif cur.startswith(("Doprava", "Platba")):
            for nxt in tail[i + 1 : i + 5]:
                if nxt.lower() == "zdarma":
                    break
                if m := _PRICE_ONLY.match(nxt):
                    fees += money(m.group(1))
                    break
    total_m = next((m for cur in tail if (m := _TOTAL.search(cur))), None)
    order_total = money(total_m.group(1)) if total_m else None
    items_total = sum(item.line_total or 0 for item in items)
    if order_total is None:
        issues.append("total_missing")
    check_ok = (
        order_total is not None
        and "quantity_mismatch" not in issues
        and abs(items_total - discounts + fees - order_total) < 0.01
    )
    if order_total is not None and not check_ok and "quantity_mismatch" not in issues:
        issues.append("arithmetic_mismatch")
    order_m = _ORDER_NO.search("\n".join(lines[: anchors[0]]))
    vendor = "znovin" if re.search(r"znov[ií]n", text, re.IGNORECASE) else "znovin-like"
    return OrderDraft(
        True,
        vendor,
        items,
        items_total,
        discounts,
        fees,
        order_total,
        check_ok,
        issues,
        order_m.group(1) if order_m else None,
    )


def order_fingerprint(secret: bytes, draft: OrderDraft) -> str:
    """HMAC of the order number (or of the product lines when it is missing)."""
    if draft.order_ref:
        material = f"order:{draft.order_ref}"
    else:
        material = "lines:" + "|".join(
            # Ordered units, not bottles, so fingerprints stay stable across pack handling.
            f"{i.catalogue_code}:{i.vintage}:{i.order_units or i.quantity}:{i.line_total}"
            for i in draft.lines
        )
    return hmac.new(secret, material.encode(), hashlib.sha256).hexdigest()
