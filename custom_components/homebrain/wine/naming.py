"""Znovín naming: H1 title (``name``), product/label name (``labelName``) and predicate.

The e-shop H1 is usually the variety ("Rulandské šedé") with the label name as a subtitle
("Pinot gris Cryo 3,14 °C"); some products carry a full name in the H1 ("Lehké jako
pírko - Šumivé víno") and have no subtitle. The order confirmation prints the same pair:
a variety heading line followed by the product name.
"""

from __future__ import annotations

import re
import unicodedata
from typing import Any

# Order "category" → predicate as Znovín writes it (the vintage is stripped by the parser).
KNOWN_PREDICATES = (
    "moravské zemské víno",
    "jakostní víno odrůdové",
    "jakostní víno známkové",
    "jakostní víno",
    "VOC Znojmo",
    "kabinetní víno",
    "pozdní sběr",
    "výběr z hroznů",
    "výběr z bobulí",
    "výběr z cibéb",
    "ledové víno",
    "slámové víno",
    "jakostní šumivé víno",
    "šumivé víno",
    "perlivé víno",
)


def _fold(text: str | None) -> str:
    norm = unicodedata.normalize("NFD", (text or "").casefold())
    plain = "".join(ch for ch in norm if unicodedata.category(ch) != "Mn")
    return re.sub(r"[\s\-–—]+", " ", plain).strip()


def clean_label(name: str | None, label: str | None) -> str | None:
    """Label/product name as a subtitle; omitted when empty, equal or contained in the name."""
    label = (label or "").strip()
    if not label:
        return None
    if _fold(label) in _fold(name):
        return None
    return label[:200]


def predicate_from(category: str | None) -> str | None:
    """Normalise an order/page category ("pozdní sběr", "VOC Znojmo") to the predicate."""
    text = re.sub(r"\s+", " ", (category or "")).strip()
    if not text:
        return None
    folded = _fold(text)
    for known in KNOWN_PREDICATES:
        if _fold(known) == folded:
            return known
    return text[:80]


def offline_naming(wine: dict[str, Any]) -> dict[str, Any]:
    """Without the product page: a label-only name gets the variety as its title."""
    name = (wine.get("name") or "").strip()
    label = wine.get("labelName")
    varieties = wine.get("grapeVarieties") or []
    variety = str(varieties[0]).strip() if varieties else ""
    if variety and not label and _fold(variety) not in _fold(name):
        return {"name": variety, "labelName": clean_label(variety, name)}
    return {"name": name, "labelName": clean_label(name, label)}


def renormalized(wine: dict[str, Any], facts: dict[str, Any] | None) -> dict[str, Any]:
    """Changes (name/labelName/predicate only) that bring a wine to the Znovín naming."""
    if facts and facts.get("title"):
        name = str(facts["title"]).strip()[:200]
        old_name = (wine.get("name") or "").strip()
        label_source = facts.get("labelName") or wine.get("labelName") or old_name
        target = {"name": name, "labelName": clean_label(name, label_source)}
    else:
        target = offline_naming(wine)
    target["predicate"] = predicate_from(
        (facts or {}).get("predicate") or (facts or {}).get("attribute")
    ) or wine.get("predicate")
    return {k: v for k, v in target.items() if v != wine.get(k)}
