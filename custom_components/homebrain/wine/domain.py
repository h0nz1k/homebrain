"""Server-side port of the wine-domain rules (mirrors modules/wine/src/domain)."""

from __future__ import annotations

import re
from datetime import date
from typing import Any

WINE_TYPES = ("still", "sparkling", "semi_sparkling", "other")
WINE_COLORS = ("white", "red", "rose", "orange", "other")
WINE_STATUSES = ("in_stock", "reserved", "consumed", "archived")
CONFIDENCES = ("verified", "matched", "inferred", "manual")
OPERATIONS = ("stock_in", "consume", "correction", "reserve", "release")
SOURCE_PROVIDERS = ("local", "order-import", "catalog-provider")
LICENSE_STATUSES = ("placeholder", "approved", "review")
ACTOR_TYPES = ("user", "assist", "import")
RATING_MIN = 0
RATING_MAX = 5

# DomainErrorCode (donor) + server-only codes.
INVALID_QUANTITY = "INVALID_QUANTITY"
ZERO_STOCK = "ZERO_STOCK"
CONFIRMATION_REQUIRED = "CONFIRMATION_REQUIRED"
TARGET_NOT_FOUND = "TARGET_NOT_FOUND"
TARGET_AMBIGUOUS = "TARGET_AMBIGUOUS"
RATING_OUT_OF_RANGE = "RATING_OUT_OF_RANGE"
IDEMPOTENT_REPLAY = "IDEMPOTENT_REPLAY"
INVALID_FIELD = "INVALID_FIELD"
NO_CHANGE = "NO_CHANGE"
SCHEMA_TOO_NEW = "SCHEMA_TOO_NEW"


class WineError(Exception):
    """Domain/validation failure with a stable machine code."""

    def __init__(self, code: str, field: str | None = None) -> None:
        super().__init__(code if field is None else f"{code}:{field}")
        self.code = code
        self.field = field


def is_non_negative_integer(value: Any) -> bool:
    return isinstance(value, int) and not isinstance(value, bool) and value >= 0


def evaluate_consume(match_count: int, stock_quantity: Any, quantity: Any, confirmed: bool) -> None:
    """Pure consume gate, 1:1 with donor evaluateConsume. Raises WineError on failure."""
    if not is_non_negative_integer(quantity) or quantity < 1:
        raise WineError(INVALID_QUANTITY)
    if match_count == 0:
        raise WineError(TARGET_NOT_FOUND)
    if match_count > 1:
        raise WineError(TARGET_AMBIGUOUS)
    if not is_non_negative_integer(stock_quantity):
        raise WineError(INVALID_QUANTITY)
    if stock_quantity == 0:
        raise WineError(ZERO_STOCK)
    if quantity > stock_quantity:
        raise WineError(INVALID_QUANTITY)
    if (stock_quantity == 1 or quantity > 1) and not confirmed:
        raise WineError(CONFIRMATION_REQUIRED)


def evaluate_rating(rating: Any) -> None:
    if (
        isinstance(rating, bool)
        or not isinstance(rating, int | float)
        or rating != rating
        or rating < RATING_MIN
        or rating > RATING_MAX
    ):
        raise WineError(RATING_OUT_OF_RANGE)


def _text(value: Any, field: str, *, required: bool = False, max_len: int = 200) -> str | None:
    if value is None or (isinstance(value, str) and value.strip() == ""):
        if required:
            raise WineError(INVALID_FIELD, field)
        return None
    if not isinstance(value, str) or len(value) > max_len:
        raise WineError(INVALID_FIELD, field)
    return value.strip()


def _enum(value: Any, field: str, allowed: tuple[str, ...]) -> str:
    if value not in allowed:
        raise WineError(INVALID_FIELD, field)
    return value


def _int_or_none(value: Any, field: str, lo: int, hi: int) -> int | None:
    if value is None:
        return None
    if isinstance(value, bool) or not isinstance(value, int) or not lo <= value <= hi:
        raise WineError(INVALID_FIELD, field)
    return value


def _num_or_none(value: Any, field: str, lo: float, hi: float) -> float | None:
    if value is None:
        return None
    if isinstance(value, bool) or not isinstance(value, int | float) or not lo <= value <= hi:
        raise WineError(INVALID_FIELD, field)
    return float(value)


_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")

EDITABLE_FIELDS = (
    "name",
    "producer",
    "vintage",
    "wineType",
    "color",
    "grapeVarieties",
    "country",
    "region",
    "sweetness",
    "volumeMl",
    "alcoholPct",
    "location",
    "acquiredOn",
    "purchasePrice",
    "personalRating",
    "personalNote",
    "status",
    "image",
    "source",
    "confidence",
    "drinkWindow",
    "productLine",
    "description",
    "labelName",
    "predicate",
    "ean",
    "residualSugarGl",
    "acidsGl",
)


def gtin_valid(code: str) -> bool:
    """EAN-8 / UPC-A / EAN-13 / GTIN-14 with a correct mod-10 check digit."""
    if not code.isdigit() or len(code) not in (8, 12, 13, 14):
        return False
    digits = [int(c) for c in code]
    body, check = digits[:-1], digits[-1]
    total = sum(d * (3 if n % 2 == 0 else 1) for n, d in enumerate(reversed(body)))
    return (10 - total % 10) % 10 == check


def normalize_ean(value: Any) -> str | None:
    """Strip spaces/dashes; ``None`` when the value is not a valid GTIN."""
    if not isinstance(value, str | int) or isinstance(value, bool):
        return None
    code = re.sub(r"[\s-]", "", str(value))
    return code if gtin_valid(code) else None


def validate_fields(data: dict[str, Any], *, partial: bool) -> dict[str, Any]:
    """Validate WineRecord fields (camelCase). Quantity is handled separately."""
    out: dict[str, Any] = {}
    unknown = set(data) - set(EDITABLE_FIELDS) - {"quantity"}
    if unknown:
        raise WineError(INVALID_FIELD, sorted(unknown)[0])

    def has(key: str) -> bool:
        return key in data or not partial

    if has("name"):
        out["name"] = _text(data.get("name"), "name", required=True)
    if has("producer"):
        out["producer"] = _text(data.get("producer"), "producer", required=True)
    if has("vintage"):
        out["vintage"] = _int_or_none(data.get("vintage"), "vintage", 1800, 2200)
    if has("wineType"):
        out["wineType"] = _enum(data.get("wineType", "still"), "wineType", WINE_TYPES)
    if has("color"):
        out["color"] = _enum(data.get("color"), "color", WINE_COLORS)
    if has("grapeVarieties"):
        grapes = data.get("grapeVarieties") or []
        if not isinstance(grapes, list) or len(grapes) > 20:
            raise WineError(INVALID_FIELD, "grapeVarieties")
        out["grapeVarieties"] = [_text(g, "grapeVarieties", required=True) for g in grapes]
    for key in ("country", "region", "sweetness"):
        if has(key):
            out[key] = _text(data.get(key), key)
    if has("volumeMl"):
        out["volumeMl"] = _int_or_none(data.get("volumeMl", 750), "volumeMl", 1, 30000)
        if out["volumeMl"] is None:
            raise WineError(INVALID_FIELD, "volumeMl")
    if has("alcoholPct"):
        out["alcoholPct"] = _num_or_none(data.get("alcoholPct"), "alcoholPct", 0, 100)
    if has("location"):
        loc = data.get("location")
        if loc is None:
            out["location"] = None
        elif not isinstance(loc, dict) or set(loc) - {"zone", "shelf", "position"}:
            raise WineError(INVALID_FIELD, "location")
        else:
            out["location"] = {
                "zone": _text(loc.get("zone"), "location", required=True, max_len=60),
                "shelf": _text(loc.get("shelf"), "location", max_len=60),
                "position": _text(loc.get("position"), "location", max_len=60),
            }
    # Schema v7: residual sugar / total acidity in g/l (EU 2019/33 Annex III).
    if has("residualSugarGl"):
        out["residualSugarGl"] = _num_or_none(
            data.get("residualSugarGl"), "residualSugarGl", 0, 1000
        )
    if has("acidsGl"):
        out["acidsGl"] = _num_or_none(data.get("acidsGl"), "acidsGl", 0, 100)
    if has("acquiredOn"):
        acq = data.get("acquiredOn")
        if acq is not None:
            if not isinstance(acq, str) or not _DATE_RE.match(acq):
                raise WineError(INVALID_FIELD, "acquiredOn")
            try:
                date.fromisoformat(acq)
            except ValueError as err:
                raise WineError(INVALID_FIELD, "acquiredOn") from err
        out["acquiredOn"] = acq
    if has("purchasePrice"):
        out["purchasePrice"] = _num_or_none(data.get("purchasePrice"), "purchasePrice", 0, 1e7)
    if has("personalRating"):
        rating = data.get("personalRating")
        if rating is not None:
            evaluate_rating(rating)
            rating = float(rating)
        out["personalRating"] = rating
    if has("productLine"):
        out["productLine"] = _text(data.get("productLine"), "productLine", max_len=120)
    if has("labelName"):
        out["labelName"] = _text(data.get("labelName"), "labelName", max_len=200)
    if has("predicate"):
        out["predicate"] = _text(data.get("predicate"), "predicate", max_len=80)
    if has("description"):
        out["description"] = _text(data.get("description"), "description", max_len=4000)
    if has("ean"):
        raw = data.get("ean")
        if raw in (None, ""):
            out["ean"] = None
        elif (ean := normalize_ean(raw)) is None:
            raise WineError(INVALID_FIELD, "ean")
        else:
            out["ean"] = ean
    if has("personalNote"):
        out["personalNote"] = _text(data.get("personalNote"), "personalNote", max_len=4000)
    if has("status"):
        out["status"] = _enum(data.get("status", "in_stock"), "status", WINE_STATUSES)
    if has("image"):
        img = data.get("image")
        if img is not None:
            if not isinstance(img, dict):
                raise WineError(INVALID_FIELD, "image")
            img = {
                "localPath": _text(img.get("localPath"), "image", required=True, max_len=300),
                "sourceUrl": _text(img.get("sourceUrl"), "image", max_len=500),
                "licenseStatus": _enum(
                    img.get("licenseStatus", "review"), "image", LICENSE_STATUSES
                ),
            }
        out["image"] = img
    if has("source"):
        src = data.get("source") or {}
        if not isinstance(src, dict):
            raise WineError(INVALID_FIELD, "source")
        out["source"] = {
            "provider": _enum(src.get("provider", "local"), "source", SOURCE_PROVIDERS),
            "externalProductId": _text(src.get("externalProductId"), "source", max_len=120),
            "batch": _text(src.get("batch"), "source", max_len=120),
            "sourceUrl": _text(src.get("sourceUrl"), "source", max_len=500),
            "fetchedAt": _text(src.get("fetchedAt"), "source", max_len=40),
        }
        # Which lookup provider proposed the record (znovin, openfoodfacts, web, ai_task…).
        if src.get("catalog") is not None:
            out["source"]["catalog"] = _text(src.get("catalog"), "source", max_len=40)
    if has("confidence"):
        out["confidence"] = _enum(data.get("confidence", "manual"), "confidence", CONFIDENCES)
    if has("drinkWindow"):
        win = data.get("drinkWindow")
        if win is not None:
            if not isinstance(win, dict) or set(win) - {"from", "to"}:
                raise WineError(INVALID_FIELD, "drinkWindow")
            lo = _int_or_none(win.get("from"), "drinkWindow", 1800, 2300)
            hi = _int_or_none(win.get("to"), "drinkWindow", 1800, 2300)
            if lo is not None and hi is not None and lo > hi:
                raise WineError(INVALID_FIELD, "drinkWindow")
            win = {"from": lo, "to": hi}
        out["drinkWindow"] = win
    return out


def validate_quantity(value: Any) -> int:
    if not is_non_negative_integer(value):
        raise WineError(INVALID_QUANTITY)
    return value
