"""Manual Znovín e-shop enrichment: product page → preview → (confirm) local WebP photo.

Polite and bounded: https + znovin.cz host allow-list (SSRF guard), no redirects to other
hosts, one product-page request per action (plus a sitemap lookup cached for 24 h; the
e-shop search is disallowed by robots.txt), timeouts and size caps. Older products whose
URL slug lacks the ``-z<code>`` suffix are resolved from slug tokens (name/variety/vintage):
at most ``MAX_CANDIDATES`` pages, ≥1 s apart, accepted only on an exact code match.
Photos are stored only in /config/homebrain/media/wine/<wine_id>.webp (re-encoded, EXIF stripped).
"""

from __future__ import annotations

import asyncio
import html as html_lib
import io
import json
import re
import time
import unicodedata
from pathlib import Path
from typing import Any
from urllib.parse import urljoin, urlsplit

from .domain import WineError
from .naming import clean_label, predicate_from, renormalized

ALLOWED_HOSTS = frozenset({"www.znovin.cz", "znovin.cz"})
BASE = "https://www.znovin.cz"
SITEMAP_URL = f"{BASE}/export/sitemap"
USER_AGENT = "HomeBrain/0.1 (+https://github.com/h0nz1k/homebrain; manual owner action)"
TIMEOUT_S = 15
MAX_HTML_BYTES = 1_500_000
MAX_SITEMAP_BYTES = 3_000_000
MAX_IMAGE_BYTES = 4_000_000
MAX_IMAGE_PX = (600, 800)
MAX_WEBP_BYTES = 350_000
SITEMAP_TTL_S = 24 * 3600
MAX_CANDIDATES = 6
CANDIDATE_PAUSE_S = 1.0
_CODE = re.compile(r"^\s*([A-Za-z])\s*[- ]?\s*(\d{3,6})\s*$")


def normalize_code(value: str) -> str | None:
    match = _CODE.match(value or "")
    return f"{match.group(1).upper()} {match.group(2)}" if match else None


def check_url(url: str, *, image: bool = False) -> str:
    """Allow only https URLs on znovin.cz (product pages under /e-shop/, images /m-images/)."""
    parts = urlsplit(url)
    if parts.scheme != "https" or parts.hostname not in ALLOWED_HOSTS:
        raise WineError("ENRICH_URL_NOT_ALLOWED")
    if parts.port not in (None, 443) or parts.username or parts.password:
        raise WineError("ENRICH_URL_NOT_ALLOWED")
    prefix = "/m-images/" if image else "/e-shop/"
    if not parts.path.startswith(prefix) or ".." in parts.path:
        raise WineError("ENRICH_URL_NOT_ALLOWED")
    return f"https://{parts.hostname}{parts.path}"


def find_product_url(sitemap: str, code: str) -> str | None:
    """New product URLs end with ``-<code>`` (e.g. ``…-z4331``)."""
    slug = code.replace(" ", "").lower()
    pattern = re.compile(rf"<loc>\s*(https://www\.znovin\.cz/e-shop/[a-z0-9-]+-{slug})\s*</loc>")
    match = pattern.search(sitemap)
    return match.group(1) if match else None


_LOC = re.compile(r"<loc>\s*(https://www\.znovin\.cz/e-shop/([a-z0-9-]+))\s*</loc>")
_CODED_SLUG = re.compile(r"-[a-z]\d{3,6}$")
_STOP = frozenset(
    {"a", "s", "v", "z", "ze", "na", "do", "vino", "znovin", "znojmo", "l", "ml", "karton"}
)
_CARTON_MARK = re.compile(r"5\s*\+\s*1|karton", re.I)


def bottle_code(code: str | None) -> str | None:
    """Carton/promo line ``K <n>`` → single bottle ``Z <n>`` (same number)."""
    return f"Z {code[2:]}" if code and code.startswith("K ") else None


def is_carton_image(page: str, image_url: str, name: str | None = None) -> bool:
    """Never store carton/promo photos: ``K…`` file names or '5+1' / 'karton' in alt/title."""
    fname = image_url.rsplit("/", 1)[-1]
    if fname[:1].upper() == "K":
        return True
    marks = [name or ""]
    marks += re.findall(r"<title>(.*?)</title>", page, re.S | re.I)[:1]
    marks += re.findall(r"<img[^>]*/" + re.escape(fname) + r'"[^>]*>', page)
    plain = unicodedata.normalize("NFKD", " ".join(marks)).encode("ascii", "ignore").decode()
    return bool(_CARTON_MARK.search(plain))


def slug_tokens(value: str) -> list[str]:
    """Lowercase, strip diacritics, split on non-alphanumerics (``Pozdní sběr`` → pozdni, sber)."""
    plain = unicodedata.normalize("NFKD", value or "").encode("ascii", "ignore").decode()
    return [t for t in re.split(r"[^a-z0-9]+", plain.lower()) if t]


def wine_tokens(wine: dict[str, Any]) -> tuple[set[str], str | None]:
    """Distinctive tokens of a wine (name, varieties, predicate/attribute) + vintage."""
    parts = [str(wine.get("name") or ""), *[str(v) for v in wine.get("grapeVarieties") or []]]
    parts += [str(wine.get(k) or "") for k in ("attribute", "predicate")]
    words = {t for p in parts for t in slug_tokens(p) if t not in _STOP and not t.isdigit()}
    vintage = wine.get("vintage")
    return words, str(vintage) if isinstance(vintage, int) else None


def candidate_urls(sitemap: str, wine: dict[str, Any], limit: int = MAX_CANDIDATES) -> list[str]:
    """Rank sitemap product URLs without a code suffix by slug-token overlap with the wine.

    A candidate must contain the vintage (when known) and at least one name/variety token;
    ranking: most matched tokens, then fewest unmatched slug tokens, then URL (stable).
    """
    words, vintage = wine_tokens(wine)
    if not words:
        return []
    scored: list[tuple[int, int, str]] = []
    for url, slug in _LOC.findall(sitemap):
        if _CODED_SLUG.search(slug):
            continue  # coded URLs belong to other products (handled by find_product_url)
        tokens = slug.split("-")
        if vintage and vintage not in tokens:
            continue
        hits = len(words.intersection(tokens))
        if not hits:
            continue
        extra = sum(1 for t in tokens if t not in words and t != vintage and not t.isdigit())
        scored.append((-hits, extra, url))
    scored.sort()
    return [url for _, _, url in scored[:limit]]


def _text(fragment: str) -> str:
    return re.sub(r"\s+", " ", html_lib.unescape(re.sub(r"<[^>]+>", " ", fragment))).strip()


def _num(value: str | None) -> float | None:
    if not value:
        return None
    match = re.search(r"\d+(?:[.,]\d+)?", value)
    return float(match.group(0).replace(",", ".")) if match else None


_COLORS = {"bílé": "white", "červené": "red", "růžové": "rose", "oranžové": "orange"}


def parse_product_html(page: str, page_url: str, expected_code: str | None) -> dict[str, Any]:
    """Extract product facts from a Znovín product page (JSON-LD + parameter table)."""
    params: dict[str, str] = {}
    for label, value in re.findall(
        r'<div class="label">(.*?)</div>\s*<div class="value">(.*?)</div>', page, re.S
    ):
        params[_text(label)] = _text(value)
    info: dict[str, str] = {}
    for label, value in re.findall(
        r'<div class="goods_info_item"><span>(.*?)</span>(.*?)</div>', page, re.S
    ):
        info[_text(label)] = _text(value)
    ld: dict[str, Any] = {}
    for block in re.findall(r'<script type="application/ld\+json">(.*?)</script>', page, re.S):
        try:
            data = json.loads(block)
        except ValueError:
            continue
        if isinstance(data, dict) and data.get("@type") == "Product":
            ld = data
            break
    code = normalize_code(info.get("Obj. číslo", "")) or normalize_code(
        str(ld.get("sku", "")).replace("-", " ")
    )
    if expected_code and code != expected_code:
        raise WineError("ENRICH_CODE_MISMATCH")
    if not code:
        raise WineError("ENRICH_NOT_FOUND")
    slug = code.replace(" ", "")
    image = None
    srcs = re.findall(
        r'src="(/m-images/[^"]+/' + re.escape(slug) + r'\.(?:jpg|jpeg|png|webp))"', page
    )
    portrait = [s for s in srcs if "558x744" in s] or srcs
    if portrait:
        image = urljoin(BASE, portrait[0])
    elif isinstance(ld.get("image"), list) and ld["image"]:
        image = str(ld["image"][0])
    if image:
        try:
            image = check_url(image, image=True)
        except WineError:
            image = None
    if image and is_carton_image(
        page, image, ld.get("name") if isinstance(ld.get("name"), str) else None
    ):
        image = None
    line_m = re.search(r'tematicka_rada=[^"]*">(.*?)</a>', page, re.S)
    h1_m = re.search(r"<h1[^>]*>(.*?)</h1>", page, re.S)
    alias_m = re.search(r'<div class="title_alias">(.*?)</div>', page, re.S)
    ld_name = ld.get("name") if isinstance(ld.get("name"), str) else None
    title = (_text(h1_m.group(1)) if h1_m else "") or (ld_name or "").strip() or None
    offers = ld.get("offers")
    if isinstance(offers, list):
        offers = offers[0] if offers else None
    price = _num(str(offers.get("price"))) if isinstance(offers, dict) else None
    regular_m = re.search(r'<div class="price_basic">(.*?)</div>', page, re.S)
    regular = _num(_text(regular_m.group(1)).replace(" ", "")) if regular_m else None
    description = ld.get("description") if isinstance(ld.get("description"), str) else None
    region = params.get("Vinařská podoblast")
    return {
        "catalogueCode": code,
        "batch": info.get("Šarže") or None,
        "name": ld_name,
        "title": title[:200] if title else None,
        "labelName": clean_label(title, _text(alias_m.group(1))) if alias_m else None,
        "predicate": predicate_from(params.get("Přívlastek")),
        "price": price,
        "regularPrice": regular if regular and price and regular > price else None,
        "variety": params.get("Odrůda"),
        "attribute": params.get("Přívlastek"),
        "vintage": int(v) if (v := params.get("Ročník", "")).isdigit() else None,
        "country": params.get("Země původu"),
        "region": f"{region} podoblast" if region else params.get("Region"),
        "village": params.get("Vinařská obec"),
        "vineyard": params.get("Viniční trať"),
        "sweetness": params.get("Kategorie"),
        "alcoholPct": _num(params.get("Alkohol")),
        "residualSugarGl": _num(params.get("Zbytkový cukr")),
        "acidsGl": _num(params.get("Kyseliny")),
        "color": _COLORS.get((params.get("Barva vína") or "").lower()),
        "productLine": _text(line_m.group(1)) if line_m else None,
        "description": description[:4000] if description else None,
        "imageUrl": image,
        "sourceUrl": check_url(page_url),
    }


def proposed_changes(wine: dict[str, Any], facts: dict[str, Any]) -> dict[str, Any]:
    """Only fill empty fields (never overwrite owner data), plus provenance."""
    changes: dict[str, Any] = {}
    if facts.get("variety") and not wine.get("grapeVarieties"):
        changes["grapeVarieties"] = [facts["variety"]]
    for key in (
        "region",
        "sweetness",
        "alcoholPct",
        "residualSugarGl",
        "acidsGl",
        "productLine",
        "description",
        "country",
    ):
        if facts.get(key) is not None and wine.get(key) in (None, ""):
            changes[key] = facts[key]
    if facts.get("color") and wine.get("color") == "other":
        changes["color"] = facts["color"]
    if wine.get("confidence") != "manual":
        # Znovín naming: the e-shop H1 is the title, the label name becomes the subtitle.
        changes.update(renormalized(wine, facts))
    src = dict(wine.get("source") or {})
    src.update(
        {
            "externalProductId": src.get("externalProductId") or facts["catalogueCode"],
            "sourceUrl": facts["sourceUrl"],
            "fetchedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        }
    )
    for key in ("resolvedCode", "resolvedProductUrl"):
        if facts.get(key):
            src[key] = facts[key]  # bottle product for a carton line; own code stays unchanged
    src.setdefault("provider", "local")
    changes["source"] = src
    return changes


def to_webp(data: bytes) -> bytes:
    """Re-encode to WebP: drops EXIF/ICC/metadata, caps dimensions and size."""
    from PIL import Image, UnidentifiedImageError  # noqa: PLC0415 - HA ships Pillow

    if len(data) > MAX_IMAGE_BYTES:
        raise WineError("ENRICH_IMAGE_TOO_LARGE")
    try:
        with Image.open(io.BytesIO(data)) as img:
            if img.format not in {"JPEG", "PNG", "WEBP"}:
                raise WineError("ENRICH_IMAGE_INVALID")
            if img.width * img.height > 20_000_000:
                raise WineError("ENRICH_IMAGE_TOO_LARGE")
            clean = img.convert("RGB")
    except (UnidentifiedImageError, OSError) as err:
        raise WineError("ENRICH_IMAGE_INVALID") from err
    clean.thumbnail(MAX_IMAGE_PX)
    for quality in (82, 70, 55):
        out = io.BytesIO()
        clean.save(out, "WEBP", quality=quality, method=4)
        if out.tell() <= MAX_WEBP_BYTES:
            return out.getvalue()
    raise WineError("ENRICH_IMAGE_TOO_LARGE")


def media_dir(config_path: str) -> Path:
    return Path(config_path) / "homebrain" / "media" / "wine"


def store_image(config_path: str, wine_id: str, webp: bytes) -> str:
    if not re.fullmatch(r"[0-9a-f]{32}|[A-Za-z0-9_-]{1,64}", wine_id):
        raise WineError("INVALID_FIELD", "wine_id")
    folder = media_dir(config_path)
    folder.mkdir(parents=True, exist_ok=True)
    tmp = folder / f".{wine_id}.tmp"
    tmp.write_bytes(webp)
    tmp.replace(folder / f"{wine_id}.webp")
    return f"homebrain/media/wine/{wine_id}.webp"


class Fetcher:
    """aiohttp-based bounded fetcher (session injected for tests)."""

    def __init__(self, session: Any) -> None:
        self._session = session
        self._sitemap: tuple[float, str] | None = None
        # code → (monotonic time, product URL) for slugs resolved by candidate search.
        self._resolved: dict[str, tuple[float, str]] = {}
        self.pause_s = CANDIDATE_PAUSE_S

    async def get(self, url: str, limit: int, *, image: bool = False) -> bytes:
        import aiohttp  # noqa: PLC0415

        if url != SITEMAP_URL:
            url = check_url(url, image=image)
        try:
            async with self._session.get(
                url,
                headers={"User-Agent": USER_AGENT, "Accept-Language": "cs"},
                timeout=aiohttp.ClientTimeout(total=TIMEOUT_S),
                allow_redirects=False,
            ) as resp:
                if resp.status == 404:
                    raise WineError("ENRICH_NOT_FOUND")
                if resp.status != 200:
                    raise WineError("ENRICH_FETCH_FAILED")
                body = bytearray()
                async for chunk in resp.content.iter_chunked(65536):
                    body.extend(chunk)
                    if len(body) > limit:
                        raise WineError("ENRICH_RESPONSE_TOO_LARGE")
        except (aiohttp.ClientError, TimeoutError) as err:
            raise WineError("ENRICH_FETCH_FAILED") from err
        return bytes(body)

    async def sitemap(self) -> str:
        now = time.monotonic()
        if self._sitemap is None or now - self._sitemap[0] > SITEMAP_TTL_S:
            body = await self.get(SITEMAP_URL, MAX_SITEMAP_BYTES)
            self._sitemap = (now, body.decode("utf-8", "replace"))
            self._resolved.clear()
        return self._sitemap[1]

    def cached_url(self, code: str) -> str | None:
        hit = self._resolved.get(code)
        if hit and time.monotonic() - hit[0] <= SITEMAP_TTL_S:
            return hit[1]
        return None

    async def product_url(self, code: str) -> str:
        """Sitemap-only lookup (no product pages fetched): ``-z<code>`` or a cached resolution."""
        url = find_product_url(await self.sitemap(), code) or self.cached_url(code)
        if url is None:
            raise WineError("ENRICH_NOT_FOUND")
        return url

    async def candidates(self, wine: dict[str, Any]) -> list[str]:
        return candidate_urls(await self.sitemap(), wine)

    async def resolve(self, code: str, wine: dict[str, Any]) -> dict[str, Any]:
        """Fallback for slugs without the code: try ranked candidates, exact code match only."""
        for n, url in enumerate(await self.candidates(wine)):
            if n:
                await asyncio.sleep(max(self.pause_s, CANDIDATE_PAUSE_S))
            try:
                page = (await self.get(url, MAX_HTML_BYTES)).decode("utf-8", "replace")
                facts = parse_product_html(page, url, code)
            except WineError:
                continue  # wrong product, missing page or fetch error: never guess
            self._resolved[code] = (time.monotonic(), url)
            return facts
        raise WineError("ENRICH_NOT_FOUND")

    async def _by_code(self, code: str, wine: dict[str, Any] | None) -> dict[str, Any]:
        try:
            page_url = await self.product_url(code)
        except WineError as err:
            if err.code != "ENRICH_NOT_FOUND" or not code or wine is None:
                raise
            return await self.resolve(code, wine)
        page = (await self.get(page_url, MAX_HTML_BYTES)).decode("utf-8", "replace")
        return parse_product_html(page, page_url, code)

    async def product(
        self, code: str | None, url: str | None, wine: dict[str, Any] | None = None
    ) -> dict[str, Any]:
        bottle = bottle_code(code)
        if url:
            page_url = check_url(url)
            page = (await self.get(page_url, MAX_HTML_BYTES)).decode("utf-8", "replace")
            if not bottle:
                return parse_product_html(page, page_url, code)
            facts = parse_product_html(page, page_url, None)
            if facts["catalogueCode"] == bottle:
                return _resolved(facts, bottle)
            if facts["catalogueCode"] != code:
                raise WineError("ENRICH_CODE_MISMATCH")
            return {**facts, "imageUrl": None}
        if bottle:
            # Carton/promo line: prefer the single-bottle product (its facts and photo).
            try:
                return _resolved(await self._by_code(bottle, wine), bottle)
            except WineError as err:
                if err.code != "ENRICH_NOT_FOUND":
                    raise
            facts = await self._by_code(code or "", wine)
            return {**facts, "imageUrl": None}  # never the carton photo
        return await self._by_code(code or "", wine)


def _resolved(facts: dict[str, Any], bottle: str) -> dict[str, Any]:
    return {**facts, "resolvedCode": bottle, "resolvedProductUrl": facts["sourceUrl"]}
