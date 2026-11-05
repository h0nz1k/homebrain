"""Universal wine lookup (#81): name / EAN / producer URL / label photo → field proposals.

Each provider turns one kind of input into *proposals* (fields + optional photo + source).
Nothing is ever written here – the owner confirms a proposal in the UI, which then calls
``homebrain/wine/create`` (+ ``set_image``) or ``update``. Provider order follows the issue:
local DB → Znovín → Open Food Facts (EAN) → producer/distributor page → HA ``ai_task``.
"""

from __future__ import annotations

import asyncio
import base64
import binascii
import html as html_lib
import json
import logging
import re
import secrets
import time
import unicodedata
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any
from urllib.parse import quote, urljoin, urlsplit

from ..const import DOMAIN
from . import enrich as zn
from .domain import WINE_COLORS, WINE_TYPES, WineError, normalize_ean
from .safe_fetch import SafeFetcher, check_public_url

_LOGGER = logging.getLogger(__name__)

PROVIDER_TIMEOUT_S = 25
AI_TIMEOUT_S = 90
MAX_PHOTO_BYTES = 3_000_000
PHOTO_TYPES = {b"\xff\xd8\xff": "image/jpeg", b"\x89PNG": "image/png", b"RIFF": "image/webp"}
OFF_API = "https://world.openfoodfacts.org/api/v2/product/{ean}.json"
OFF_FIELDS = (
    "code,product_name,product_name_cs,product_name_en,generic_name,brands,quantity,"
    "product_quantity,product_quantity_unit,categories_tags,labels_tags,origins,"
    "origins_tags,image_front_url,nutriments"
)
OFF_IMAGE_HOSTS = ("images.openfoodfacts.org", "static.openfoodfacts.org")
VIVINO_SEARCH = "https://www.vivino.com/search/wines?q={q}"
LABEL_TTL_S = 300

# ---------------------------------------------------------------- text heuristics

_SWEETNESS = (
    ("brut nature", "Brut Nature"),
    ("pas dose", "Brut Nature"),
    ("extra brut", "Extra Brut"),
    ("extra dry", "Extra Dry"),
    ("extra sec", "Extra Dry"),
    ("demi sec", "Demi-sec"),
    ("polosuche", "polosuché"),
    ("polosladke", "polosladké"),
    ("brut", "Brut"),
    ("suche", "suché"),
    ("sladke", "sladké"),
    ("doux", "sladké"),
    ("dolce", "sladké"),
    ("dry", "Dry"),
)
_SPARKLING = (
    "prosecco",
    "spumante",
    "champagne",
    "cava",
    "cremant",
    "sekt",
    "sumive",
    "sparkling",
    "franciacorta",
)
_SEMI_SPARKLING = ("frizzante", "perlive", "petillant")
_COLOR_WORDS = (
    (("rose", "rosato", "rosado", "ruzove", "blush"), "rose"),
    (("orange", "oranzove", "ramato"), "orange"),
    (("rosso", "tinto", "rouge", "cervene", "red"), "red"),
    (("bianco", "blanco", "blanc", "bile", "white", "weiss"), "white"),
)
# Appellation → (country, region, varieties) – only facts implied by the appellation itself.
_APPELLATIONS = (
    ("prosecco", "Itálie", None, ["Glera"]),
    ("treviso", "Itálie", "Veneto", None),
    ("valdobbiadene", "Itálie", "Veneto", None),
    ("conegliano", "Itálie", "Veneto", None),
    ("asolo", "Itálie", "Veneto", None),
    ("champagne", "Francie", "Champagne", None),
    ("chianti", "Itálie", "Toskánsko", None),
    ("rioja", "Španělsko", "Rioja", None),
    ("tokaj", "Maďarsko", "Tokaj", None),
)
_COUNTRIES = {
    "italy": "Itálie",
    "france": "Francie",
    "spain": "Španělsko",
    "germany": "Německo",
    "austria": "Rakousko",
    "czech-republic": "Česko",
    "czechia": "Česko",
    "slovakia": "Slovensko",
    "hungary": "Maďarsko",
    "portugal": "Portugalsko",
    "chile": "Chile",
    "argentina": "Argentina",
    "australia": "Austrálie",
    "new-zealand": "Nový Zéland",
    "south-africa": "Jihoafrická republika",
    "united-states": "USA",
    "slovenia": "Slovinsko",
    "croatia": "Chorvatsko",
    "greece": "Řecko",
    "moldova": "Moldavsko",
}
_YEAR = re.compile(r"\b(19[5-9]\d|20[0-4]\d)\b")
_ABV = re.compile(r"(\d{1,2}(?:[.,]\d{1,2})?)\s*%\s*(?:vol|obj|alc)", re.I)
_VOLUME = re.compile(r"(\d{3,4})\s*ml\b|(\d{2,3})\s*cl\b|\b(0[.,]\d{1,3}|1[.,]5|3)\s*l\b", re.I)
_ZN_CODE = re.compile(r"\b([ZKzk])\s?-?\s?(\d{3,6})\b")


def fold(text: str | None) -> str:
    norm = unicodedata.normalize("NFKD", (text or "").casefold())
    plain = "".join(ch for ch in norm if not unicodedata.combining(ch))
    return re.sub(r"[^a-z0-9]+", " ", plain).strip()


def tokens(text: str | None) -> list[str]:
    return [t for t in fold(text).split() if t]


def parse_volume(text: str | None) -> int | None:
    match = _VOLUME.search(text or "")
    if not match:
        return None
    if match.group(1):
        return int(match.group(1))
    if match.group(2):
        return int(match.group(2)) * 10
    return round(float(match.group(3).replace(",", ".")) * 1000)


def infer_from_text(text: str) -> dict[str, Any]:
    """Facts that follow from words on the label/name (always marked as inferred)."""
    folded = f" {fold(text)} "
    out: dict[str, Any] = {}
    for word, value in _SWEETNESS:
        if f" {word} " in folded:
            out["sweetness"] = value
            break
    if any(f" {w} " in folded for w in _SPARKLING):
        out["wineType"] = "sparkling"
    elif any(f" {w} " in folded for w in _SEMI_SPARKLING):
        out["wineType"] = "semi_sparkling"
    for words, color in _COLOR_WORDS:
        if any(f" {w} " in folded for w in words):
            out["color"] = color
            break
    for word, country, region, grapes in _APPELLATIONS:
        if f" {word} " in folded:
            out.setdefault("country", country)
            if region:
                out.setdefault("region", region)
            if grapes:
                out.setdefault("grapeVarieties", grapes)
                out.setdefault("color", "white")
    if (year := _YEAR.search(text)) is not None:
        out["vintage"] = int(year.group(1))
    if (abv := _ABV.search(text)) is not None:
        value = float(abv.group(1).replace(",", "."))
        if 0 < value <= 25:
            out["alcoholPct"] = value
    if (volume := parse_volume(text)) and 100 <= volume <= 15000:
        out["volumeMl"] = volume
    return out


def _clean_text(value: Any, max_len: int = 200) -> str | None:
    if not isinstance(value, str):
        return None
    text = re.sub(r"\s+", " ", html_lib.unescape(value)).strip()
    return text[:max_len] or None


def sanitize_fields(raw: dict[str, Any]) -> dict[str, Any]:
    """Keep only valid, known wine fields from untrusted provider data (AI, web pages)."""
    out: dict[str, Any] = {}
    for key, max_len in (
        ("name", 200),
        ("producer", 200),
        ("country", 200),
        ("region", 200),
        ("sweetness", 200),
        ("labelName", 200),
        ("predicate", 80),
        ("productLine", 120),
        ("description", 4000),
    ):
        if (text := _clean_text(raw.get(key), max_len)) is not None:
            out[key] = text
    vintage = raw.get("vintage")
    if isinstance(vintage, float) and vintage.is_integer():
        vintage = int(vintage)
    if isinstance(vintage, str) and vintage.strip().isdigit():
        vintage = int(vintage.strip())
    if isinstance(vintage, int) and not isinstance(vintage, bool) and 1900 <= vintage <= 2100:
        out["vintage"] = vintage
    if raw.get("color") in WINE_COLORS:
        out["color"] = raw["color"]
    if raw.get("wineType") in WINE_TYPES:
        out["wineType"] = raw["wineType"]
    grapes = raw.get("grapeVarieties")
    if isinstance(grapes, str):
        grapes = re.split(r"\s*[,;/]\s*", grapes)
    if isinstance(grapes, list):
        clean = [g for g in (_clean_text(x, 80) for x in grapes[:8]) if g]
        if clean:
            out["grapeVarieties"] = clean
    for key, lo, hi in (
        ("alcoholPct", 0.5, 25.0),
        ("purchasePrice", 0.0, 1e6),
        ("residualSugarGl", 0.0, 1000.0),
        ("acidsGl", 0.0, 100.0),
    ):
        value = raw.get(key)
        if isinstance(value, str):
            try:
                value = float(value.replace(",", ".").strip().rstrip("%"))
            except ValueError:
                value = None
        if isinstance(value, int | float) and not isinstance(value, bool) and lo <= value <= hi:
            out[key] = round(float(value), 2)
    volume = raw.get("volumeMl")
    if isinstance(volume, float) and volume.is_integer():
        volume = int(volume)
    if isinstance(volume, int) and not isinstance(volume, bool) and 100 <= volume <= 15000:
        out["volumeMl"] = volume
    if (ean := normalize_ean(raw.get("ean"))) is not None:
        out["ean"] = ean
    return out


def proposal(
    provider: Provider,
    fields: dict[str, Any],
    *,
    confidence: str,
    inferred: list[str] | None = None,
    image_url: str | None = None,
    image_license: str = "review",
    source_url: str | None = None,
    external_id: str | None = None,
    existing: dict[str, Any] | None = None,
    note: str | None = None,
) -> dict[str, Any]:
    clean = sanitize_fields(fields)
    return {
        "provider": provider.id,
        "providerLabel": provider.label,
        "confidence": confidence,
        "fields": clean,
        "inferred": sorted(k for k in set(inferred or []) if k in clean),
        "imageUrl": image_url,
        "imageLicense": image_license if image_url else None,
        "sourceUrl": source_url,
        "externalProductId": external_id,
        "existing": existing,
        "note": note,
    }


def with_inference(base: dict[str, Any], text: str) -> tuple[dict[str, Any], list[str]]:
    """Fill only missing fields from the label/name heuristics; report which were inferred."""
    guessed = infer_from_text(text)
    merged = dict(base)
    inferred = []
    for key, value in guessed.items():
        if merged.get(key) in (None, "", []):
            merged[key] = value
            inferred.append(key)
    return merged, inferred


def vivino_search_url(wine: dict[str, Any]) -> str:
    parts = [wine.get("producer"), wine.get("name"), wine.get("vintage")]
    query = " ".join(str(p) for p in parts if p)
    return VIVINO_SEARCH.format(q=quote(query[:120]))


# ---------------------------------------------------------------- query / context


@dataclass
class LookupQuery:
    text: str | None = None
    ean: str | None = None
    url: str | None = None
    photo: bytes | None = None
    photo_type: str | None = None
    wine: dict[str, Any] | None = None  # existing record (Detail → 'Dohledat')

    @property
    def kinds(self) -> set[str]:
        return {
            k
            for k, v in (
                ("text", self.text),
                ("ean", self.ean),
                ("url", self.url),
                ("photo", self.photo),
            )
            if v
        }


def decode_photo(data: str) -> tuple[bytes, str]:
    """Base64 / data URL → bytes + sniffed type (JPEG/PNG/WebP only, ≤ 3 MB)."""
    if "," in data[:100] and data.startswith("data:"):
        data = data.split(",", 1)[1]
    try:
        raw = base64.b64decode(data, validate=True)
    except (binascii.Error, ValueError) as err:
        raise WineError("LOOKUP_PHOTO_INVALID") from err
    if len(raw) > MAX_PHOTO_BYTES:
        raise WineError("LOOKUP_PHOTO_TOO_LARGE")
    for magic, mime in PHOTO_TYPES.items():
        if raw.startswith(magic) and (mime != "image/webp" or raw[8:12] == b"WEBP"):
            return raw, mime
    raise WineError("LOOKUP_PHOTO_INVALID")


def build_query(msg: dict[str, Any], wine: dict[str, Any] | None = None) -> LookupQuery:
    text = (msg.get("query") or "").strip()[:200] or None
    ean = None
    if raw_ean := (msg.get("ean") or "").strip():
        ean = normalize_ean(raw_ean)
        if ean is None:
            raise WineError("LOOKUP_EAN_INVALID")
    elif text and normalize_ean(text):
        ean, text = normalize_ean(text), None  # a scanned/typed EAN in the search box
    url = (msg.get("url") or "").strip() or None
    if url:
        url = check_public_url(url)
    photo = photo_type = None
    if msg.get("photo"):
        photo, photo_type = decode_photo(msg["photo"])
    if wine is not None:
        ean = ean or wine.get("ean")
        if not (text or ean or url or photo):
            code = (wine.get("source") or {}).get("externalProductId")
            name = " ".join(
                str(p) for p in (wine.get("producer"), wine.get("name"), wine.get("vintage")) if p
            )
            text = code or name or None
    query = LookupQuery(text=text, ean=ean, url=url, photo=photo, photo_type=photo_type, wine=wine)
    if not query.kinds:
        raise WineError("LOOKUP_EMPTY")
    return query


@dataclass
class LookupContext:
    hass: Any
    store: Any
    znovin: zn.Fetcher
    web: SafeFetcher
    results: list[dict[str, Any]] = field(default_factory=list)


class Provider:
    """Lookup provider: one kind of input → proposals (never writes)."""

    id = ""
    label = ""
    inputs: tuple[str, ...] = ()
    network = True

    def availability(self, hass: Any) -> dict[str, Any]:
        return {"available": True, "hint": None}

    def accepts(self, query: LookupQuery) -> bool:
        return bool(query.kinds & set(self.inputs))

    async def lookup(self, ctx: LookupContext, query: LookupQuery) -> list[dict[str, Any]]:
        raise NotImplementedError


# ---------------------------------------------------------------- providers


class LocalProvider(Provider):
    id = "local"
    label = "Vaše vinotéka"
    inputs = ("text", "ean")
    network = False

    async def lookup(self, ctx: LookupContext, query: LookupQuery) -> list[dict[str, Any]]:
        def job() -> list[dict[str, Any]]:
            hits: list[tuple[str, dict[str, Any]]] = []
            if query.ean:
                hits += [("matched", w) for w in ctx.store.find_by_ean(query.ean)]
            if query.text and not hits:
                wanted = [t for t in tokens(query.text) if len(t) >= 3 or t.isdigit()]
                if wanted:
                    for wine in ctx.store.list({"sort": "name"}):
                        hay = set(
                            tokens(
                                f"{wine['name']} {wine.get('labelName') or ''} "
                                f"{wine['producer']} {wine.get('vintage') or ''}"
                            )
                        )
                        if all(t in hay for t in wanted):
                            hits.append(("inferred", wine))
            own = (query.wine or {}).get("id")
            return [
                proposal(
                    self,
                    wine,
                    confidence=conf,
                    existing={
                        "wineId": wine["id"],
                        "name": wine["name"],
                        "producer": wine["producer"],
                        "vintage": wine.get("vintage"),
                        "quantity": wine["quantity"],
                    },
                )
                for conf, wine in hits[:3]
                if wine["id"] != own
            ]

        return await ctx.hass.async_add_executor_job(job)


def znovin_fields(facts: dict[str, Any]) -> dict[str, Any]:
    title = facts.get("title") or facts.get("name")
    return {
        "name": title,
        "labelName": facts.get("labelName"),
        "predicate": facts.get("predicate"),
        "producer": "Znovín Znojmo",
        "vintage": facts.get("vintage"),
        "color": facts.get("color"),
        "grapeVarieties": [facts["variety"]] if facts.get("variety") else None,
        "country": facts.get("country"),
        "region": facts.get("region"),
        "sweetness": facts.get("sweetness"),
        "alcoholPct": facts.get("alcoholPct"),
        "residualSugarGl": facts.get("residualSugarGl"),
        "acidsGl": facts.get("acidsGl"),
        "productLine": facts.get("productLine"),
        "description": facts.get("description"),
        "purchasePrice": facts.get("price"),
    }


class ZnovinProvider(Provider):
    id = "znovin"
    label = "Znovín e-shop"
    inputs = ("text", "url")
    max_pages = 2

    def accepts(self, query: LookupQuery) -> bool:
        if query.url:
            return (urlsplit(query.url).hostname or "") in zn.ALLOWED_HOSTS
        return bool(query.text)

    async def lookup(self, ctx: LookupContext, query: LookupQuery) -> list[dict[str, Any]]:
        if query.url:
            facts = await ctx.znovin.product(None, query.url)
            return [self._proposal(facts, "matched")]
        text = query.text or ""
        if (code_m := _ZN_CODE.search(text)) is not None:
            code = zn.normalize_code(f"{code_m.group(1)} {code_m.group(2)}")
            facts = await ctx.znovin.product(code, None, {"name": text})
            return [self._proposal(facts, "matched")]
        words = {t for t in tokens(text) if t not in zn._STOP and not t.isdigit() and len(t) > 2}  # noqa: SLF001
        if not words:
            return []
        year = _YEAR.search(text)
        mentions = "znovin" in fold(text)
        sitemap = await ctx.znovin.sitemap()
        urls = zn.candidate_urls(
            sitemap, {"name": text, "vintage": int(year.group(1)) if year else None}
        )
        strong = [
            u for u in urls if mentions or len(words & set(u.rsplit("/", 1)[-1].split("-"))) >= 2
        ]
        out = []
        for n, url in enumerate(strong[: self.max_pages]):
            if n:
                await asyncio.sleep(zn.CANDIDATE_PAUSE_S)
            page = (await ctx.znovin.get(url, zn.MAX_HTML_BYTES)).decode("utf-8", "replace")
            try:
                out.append(self._proposal(zn.parse_product_html(page, url, None), "inferred"))
            except WineError:
                continue
        return out

    def _proposal(self, facts: dict[str, Any], confidence: str) -> dict[str, Any]:
        return proposal(
            self,
            znovin_fields(facts),
            confidence=confidence,
            image_url=facts.get("imageUrl"),
            # Owner-approved private use of the vendor's product photos (2026-11-01).
            image_license="approved",
            source_url=facts.get("sourceUrl"),
            external_id=facts.get("catalogueCode"),
        )


class OpenFoodFactsProvider(Provider):
    id = "openfoodfacts"
    label = "Open Food Facts"
    inputs = ("ean",)

    async def lookup(self, ctx: LookupContext, query: LookupQuery) -> list[dict[str, Any]]:
        assert query.ean
        url = f"{OFF_API.format(ean=query.ean)}?fields={OFF_FIELDS}"
        body, _final, _ctype = await ctx.web.get(url, "json")
        try:
            data = json.loads(body)
        except ValueError as err:
            raise WineError("LOOKUP_PARSE_FAILED") from err
        if not isinstance(data, dict) or data.get("status") != 1:
            return []
        product = data.get("product")
        if not isinstance(product, dict):
            return []
        return [self.map_product(query.ean, product)]

    def map_product(self, ean: str, product: dict[str, Any]) -> dict[str, Any]:
        name = next(
            (
                product[k].strip()
                for k in ("product_name_cs", "product_name", "product_name_en", "generic_name")
                if isinstance(product.get(k), str) and product[k].strip()
            ),
            None,
        )
        brands = [b.strip() for b in str(product.get("brands") or "").split(",") if b.strip()]
        producer = brands[0] if brands else None
        cats = [str(c) for c in product.get("categories_tags") or []]
        fields: dict[str, Any] = {"name": name, "producer": producer, "ean": ean}
        unit = str(product.get("product_quantity_unit") or "").lower()
        qty = product.get("product_quantity")
        if isinstance(qty, int | float | str) and unit in ("ml", "cl", "l"):
            try:
                value = float(qty)
                fields["volumeMl"] = round(value * {"ml": 1, "cl": 10, "l": 1000}[unit])
            except ValueError:
                pass
        if "volumeMl" not in fields:
            fields["volumeMl"] = parse_volume(str(product.get("quantity") or ""))
        nutr = product.get("nutriments") if isinstance(product.get("nutriments"), dict) else {}
        for key in ("alcohol_value", "alcohol", "alcohol_100g"):
            if isinstance(nutr.get(key), int | float) and 0 < nutr[key] <= 25:
                fields["alcoholPct"] = float(nutr[key])
                break
        for cat in cats:
            slug = cat.split(":", 1)[-1]
            if slug.startswith("wines-from-") and slug[11:] in _COUNTRIES:
                fields.setdefault("country", _COUNTRIES[slug[11:]])
            if slug in ("red-wines",):
                fields.setdefault("color", "red")
            elif slug in ("white-wines",):
                fields.setdefault("color", "white")
            elif slug in ("rose-wines",):
                fields.setdefault("color", "rose")
            if slug in (
                "sparkling-wines",
                "champagnes",
                "prosecco",
                "proseccos",
                "cavas",
                "cremants",
            ):
                fields.setdefault("wineType", "sparkling")
        origins = [o.split(":", 1)[-1] for o in product.get("origins_tags") or []]
        for origin in origins:
            if origin in _COUNTRIES:
                fields.setdefault("country", _COUNTRIES[origin])
        hint = " ".join([name or "", *brands[1:], *(c.split(":", 1)[-1] for c in cats)])
        merged, inferred = with_inference(fields, hint.replace("-", " "))
        image = product.get("image_front_url")
        image_ok = isinstance(image, str) and (urlsplit(image).hostname or "") in OFF_IMAGE_HOSTS
        return proposal(
            self,
            merged,
            confidence="matched",
            inferred=inferred,
            image_url=image if image_ok else None,
            image_license="review",  # OFF photos are CC BY-SA – owner approves before display
            source_url=f"https://world.openfoodfacts.org/product/{ean}",
            note="Data © Open Food Facts contributors (ODbL).",
        )


_LD = re.compile(r'<script[^>]+type="application/ld\+json"[^>]*>(.*?)</script>', re.S | re.I)
_META = re.compile(r"<meta\s+[^>]*>", re.I)
_ATTR = re.compile(r'(\w[\w:-]*)\s*=\s*"([^"]*)"')


def _ld_products(page: str) -> list[dict[str, Any]]:
    found: list[dict[str, Any]] = []

    def walk(node: Any) -> None:
        if isinstance(node, list):
            for item in node[:50]:
                walk(item)
        elif isinstance(node, dict):
            kind = node.get("@type")
            kinds = kind if isinstance(kind, list) else [kind]
            if "Product" in kinds:
                found.append(node)
            walk(node.get("@graph"))

    for block in _LD.findall(page)[:10]:
        try:
            walk(json.loads(block))
        except ValueError:
            continue
    return found


def parse_web_page(page: str, url: str) -> dict[str, Any] | None:
    """JSON-LD Product + OpenGraph + label heuristics of a producer/distributor page."""
    meta: dict[str, str] = {}
    for tag in _META.findall(page)[:200]:
        attrs = dict(_ATTR.findall(tag))
        key = attrs.get("property") or attrs.get("name")
        if key and "content" in attrs:
            meta.setdefault(key.lower(), html_lib.unescape(attrs["content"]))
    product = (_ld_products(page) or [{}])[0]
    title_m = re.search(r"<title[^>]*>(.*?)</title>", page, re.S | re.I)
    name = (
        product.get("name")
        or meta.get("og:title")
        or (html_lib.unescape(title_m.group(1)) if title_m else None)
    )
    if not isinstance(name, str) or not name.strip():
        return None
    brand = product.get("brand")
    if isinstance(brand, dict):
        brand = brand.get("name")
    image = product.get("image") or meta.get("og:image")
    if isinstance(image, list):
        image = image[0] if image else None
    if isinstance(image, dict):
        image = image.get("url")
    offers = product.get("offers")
    if isinstance(offers, list):
        offers = offers[0] if offers else None
    price = offers.get("price") if isinstance(offers, dict) else None
    description = product.get("description") or meta.get("og:description")
    fields: dict[str, Any] = {
        "name": name,
        "producer": brand if isinstance(brand, str) else meta.get("og:site_name"),
        "ean": product.get("gtin13") or product.get("gtin") or product.get("gtin12"),
        "description": description,
        "purchasePrice": price,
    }
    # Only the product's own name/description: page chrome carries unrelated years/percentages.
    merged, inferred = with_inference(fields, f"{name} {description or ''}")
    image_url = None
    if isinstance(image, str):
        try:
            image_url = check_public_url(urljoin(url, image))
        except WineError:
            image_url = None
    return {"fields": merged, "inferred": inferred, "imageUrl": image_url}


class WebPageProvider(Provider):
    id = "web"
    label = "Stránka výrobce / distributora"
    inputs = ("url",)

    def accepts(self, query: LookupQuery) -> bool:
        return bool(query.url) and (urlsplit(query.url).hostname or "") not in zn.ALLOWED_HOSTS

    async def lookup(self, ctx: LookupContext, query: LookupQuery) -> list[dict[str, Any]]:
        assert query.url
        body, final, _ctype = await ctx.web.get(query.url, "page")
        parsed = parse_web_page(body.decode("utf-8", "replace"), final)
        if parsed is None:
            return []
        return [
            proposal(
                self,
                parsed["fields"],
                confidence="inferred",
                inferred=parsed["inferred"],
                image_url=parsed["imageUrl"],
                image_license="review",
                source_url=final,
            )
        ]


# ---------------------------------------------------------------- HA ai_task

AI_INSTRUCTIONS = (
    "You read wine bottle labels. Extract only what is printed on the label or the text "
    "given below; leave a field empty when unsure – never guess prices. "
    "color is one of white, red, rose, orange, other; wine_type one of still, sparkling, "
    "semi_sparkling, other. grape_varieties is a comma separated list. volume_ml in "
    "millilitres, alcohol_pct as a number. Use the language printed on the label; "
    "write the country in Czech (e.g. Itálie, Francie, Česko)."
)


def _sel_text() -> dict[str, Any]:
    return {"selector": {"text": {}}}


def _sel_num(lo: float, hi: float, step: float = 1) -> dict[str, Any]:
    return {"selector": {"number": {"min": lo, "max": hi, "step": step, "mode": "box"}}}


AI_STRUCTURE: dict[str, Any] = {
    "producer": {**_sel_text(), "description": "Producer / winery"},
    "name": {**_sel_text(), "description": "Wine name without producer and vintage"},
    "vintage": {**_sel_num(1900, 2100), "description": "Vintage year"},
    "color": {"selector": {"select": {"options": list(WINE_COLORS)}}},
    "wine_type": {"selector": {"select": {"options": list(WINE_TYPES)}}},
    "grape_varieties": {**_sel_text(), "description": "Comma separated grape varieties"},
    "country": _sel_text(),
    "region": _sel_text(),
    "sweetness": {**_sel_text(), "description": "e.g. suché, polosuché, Brut, Extra Dry"},
    "alcohol_pct": _sel_num(0, 25, 0.1),
    "volume_ml": _sel_num(100, 15000),
    "ean": {**_sel_text(), "description": "Barcode digits if visible"},
}
_AI_KEYS = {
    "wine_type": "wineType",
    "grape_varieties": "grapeVarieties",
    "alcohol_pct": "alcoholPct",
    "volume_ml": "volumeMl",
}


def ai_entities(hass: Any) -> list[tuple[str, int]]:
    out = []
    for state in hass.states.async_all("ai_task"):
        features = state.attributes.get("supported_features") or 0
        if isinstance(features, int) and features & 1 and state.state != "unavailable":
            out.append((state.entity_id, features))
    return out


def ai_entity(hass: Any, need_photo: bool) -> str | None:
    entities = dict(ai_entities(hass))
    preferred = None
    try:
        from homeassistant.components.ai_task.const import DATA_PREFERENCES  # noqa: PLC0415

        prefs = hass.data.get(DATA_PREFERENCES)
        preferred = getattr(prefs, "gen_data_entity_id", None)
    except ImportError:  # pragma: no cover - HA without ai_task
        pass
    order = ([preferred] if preferred in entities else []) + sorted(entities)
    for entity_id in order:
        if not need_photo or entities[entity_id] & 2:
            return entity_id
    return None


def label_photos(hass: Any) -> dict[str, tuple[Path, str, float]]:
    return hass.data.setdefault(DOMAIN, {}).setdefault("wine_label_photos", {})


class AiTaskProvider(Provider):
    id = "ai_task"
    label = "AI v Home Assistantu"
    inputs = ("photo", "text")

    def availability(self, hass: Any) -> dict[str, Any]:
        if "ai_task" not in hass.config.components:
            return {"available": False, "hint": "ai_task_missing", "photo": False}
        entity = ai_entity(hass, need_photo=False)
        if entity is None:
            return {"available": False, "hint": "no_ai_entity", "photo": False}
        photo = ai_entity(hass, need_photo=True) is not None
        return {"available": True, "hint": None if photo else "no_attachments", "photo": photo}

    async def lookup(self, ctx: LookupContext, query: LookupQuery) -> list[dict[str, Any]]:
        hass = ctx.hass
        if not self.availability(hass)["available"]:
            raise WineError("LOOKUP_AI_UNAVAILABLE")
        entity_id = ai_entity(hass, need_photo=bool(query.photo))
        if entity_id is None:
            raise WineError("LOOKUP_AI_NO_ATTACHMENTS")
        data: dict[str, Any] = {
            "task_name": "HomeBrain – etiketa vína",
            "entity_id": entity_id,
            "instructions": AI_INSTRUCTIONS
            + (f"\nText from the owner: {query.text}" if query.text else ""),
            "structure": AI_STRUCTURE,
        }
        token = None
        if query.photo:
            token = await hass.async_add_executor_job(
                _write_label, hass.config.config_dir, query.photo, query.photo_type or ""
            )
            path, mime = token[1], query.photo_type or "image/jpeg"
            label_photos(hass)[token[0]] = (path, mime, time.monotonic())
            data["attachments"] = [
                {
                    "media_content_id": f"media-source://homebrain/label/{token[0]}",
                    "media_content_type": mime,
                }
            ]
        try:
            async with asyncio.timeout(AI_TIMEOUT_S):
                response = await hass.services.async_call(
                    "ai_task", "generate_data", data, blocking=True, return_response=True
                )
        except TimeoutError as err:
            raise WineError("LOOKUP_AI_TIMEOUT") from err
        except WineError:
            raise
        except Exception as err:  # noqa: BLE001 - provider errors surface as one code
            _LOGGER.warning("ai_task wine lookup failed: %s", err)
            raise WineError("LOOKUP_AI_FAILED") from err
        finally:
            if token is not None:
                label_photos(hass).pop(token[0], None)
                await hass.async_add_executor_job(token[1].unlink, True)
        raw = (response or {}).get("data")
        if not isinstance(raw, dict):
            raise WineError("LOOKUP_AI_FAILED")
        mapped = {_AI_KEYS.get(str(k)) or str(k): v for k, v in raw.items()}
        fields = sanitize_fields(mapped)
        if not fields.get("name") and not fields.get("producer"):
            return []
        return [
            proposal(
                self,
                fields,
                confidence="inferred",
                inferred=list(fields),
                note="Návrh AI – před uložením zkontrolujte.",
            )
        ]


def _write_label(config_dir: str, photo: bytes, mime: str) -> tuple[str, Path]:
    folder = Path(config_dir) / "homebrain" / "tmp"
    folder.mkdir(parents=True, exist_ok=True)
    ext = {"image/png": ".png", "image/webp": ".webp"}.get(mime, ".jpg")
    token = secrets.token_hex(16)
    path = folder / f"label-{token}{ext}"
    path.write_bytes(photo)
    return token, path


OFF_PROVIDER = OpenFoodFactsProvider()
PROVIDERS: tuple[Provider, ...] = (
    LocalProvider(),
    ZnovinProvider(),
    OFF_PROVIDER,
    WebPageProvider(),
    AiTaskProvider(),
)


def providers_info(hass: Any) -> list[dict[str, Any]]:
    return [
        {"id": p.id, "label": p.label, "inputs": list(p.inputs), **p.availability(hass)}
        for p in PROVIDERS
    ]


async def _run_one(
    provider: Provider, ctx: LookupContext, query: LookupQuery
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    status: dict[str, Any] = {"id": provider.id, "label": provider.label}
    timeout = AI_TIMEOUT_S + 5 if provider.id == "ai_task" else PROVIDER_TIMEOUT_S
    try:
        async with asyncio.timeout(timeout):
            found = await provider.lookup(ctx, query)
    except TimeoutError:
        status.update(status="error", code="LOOKUP_TIMEOUT")
        return status, []
    except WineError as err:
        status.update(status="error", code=err.code)
        return status, []
    except Exception:  # noqa: BLE001 - one provider must never break the lookup
        _LOGGER.exception("wine lookup provider %s failed", provider.id)
        status.update(status="error", code="LOOKUP_FAILED")
        return status, []
    status.update(status="ok" if found else "empty", count=len(found))
    return status, found


async def run_lookup(
    ctx: LookupContext, query: LookupQuery, only: list[str] | None = None
) -> dict[str, Any]:
    """Local first (an EAN hit short-circuits the network), then the rest concurrently."""
    statuses: list[dict[str, Any]] = []
    proposals: list[dict[str, Any]] = []
    chosen = [p for p in PROVIDERS if (only is None or p.id in only)]
    local = [p for p in chosen if p.id == "local" and p.accepts(query)]
    for p in local:
        status, found = await _run_one(p, ctx, query)
        statuses.append(status)
        proposals += found
    if query.ean and any(p["confidence"] == "matched" for p in proposals) and not query.photo:
        statuses += [
            {"id": p.id, "label": p.label, "status": "skipped"}
            for p in chosen
            if p.id != "local" and p.accepts(query)
        ]
        return {"proposals": proposals, "providers": statuses}
    remote = [p for p in chosen if p.id not in ("local", "ai_task") and p.accepts(query)]
    ai = next((p for p in chosen if p.id == "ai_task"), None)
    ai_now = ai is not None and bool(query.photo) and ai.availability(ctx.hass)["available"]
    tasks = [_run_one(p, ctx, query) for p in remote]
    if ai_now and ai is not None:
        tasks.append(_run_one(ai, ctx, query))
    for status, found in await asyncio.gather(*tasks):
        statuses.append(status)
        proposals += found
    # Text-only AI is a paid fallback: only when nothing else matched.
    if (
        ai is not None
        and not ai_now
        and query.text
        and not [p for p in proposals if p["provider"] != "local"]
        and ai.availability(ctx.hass)["available"]
    ):
        status, found = await _run_one(ai, ctx, query)
        statuses.append(status)
        proposals += found
    elif ai is not None and not ai_now:
        available = ai.availability(ctx.hass)["available"]
        statuses.append(
            {"id": ai.id, "label": ai.label, "status": "skipped" if available else "unavailable"}
        )
    # A barcode read by the AI → one more exact lookup in Open Food Facts.
    ai_ean = next((p["fields"].get("ean") for p in proposals if p["provider"] == "ai_task"), None)
    if ai_ean and not query.ean and (only is None or "openfoodfacts" in only):
        status, found = await _run_one(OFF_PROVIDER, ctx, LookupQuery(ean=ai_ean))
        statuses.append(status)
        proposals += found
    rank = {"matched": 0, "verified": 0, "inferred": 1}
    proposals.sort(
        key=lambda p: (p["existing"] is None, rank.get(p["confidence"], 2), -len(p["fields"]))
    )
    return {"proposals": proposals, "providers": statuses}


def cleanup_label_photos(hass: Any) -> None:
    """Drop expired temp label photos (normally removed right after the AI call)."""
    now = time.monotonic()
    photos = label_photos(hass)
    for token, (path, _mime, at) in list(photos.items()):
        if now - at > LABEL_TTL_S:
            photos.pop(token, None)
            path.unlink(missing_ok=True)
