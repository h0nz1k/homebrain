"""WebSocket API ``homebrain/wine/*`` (reads: any user, writes: admin only)."""

from __future__ import annotations

import asyncio
import calendar
import logging
import re
import time
from collections.abc import Callable
from datetime import timedelta
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit

import voluptuous as vol
from aiohttp import web
from homeassistant.components import websocket_api
from homeassistant.components.http import HomeAssistantView
from homeassistant.components.http.auth import async_sign_path
from homeassistant.core import HomeAssistant
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.helpers.event import async_call_later, async_track_time_interval

from ..const import DOMAIN
from . import enrich as zn
from . import lookup as lk
from . import voice as voice_mod
from .domain import WINE_COLORS, WINE_TYPES, WineError
from .importer import run_import, run_order_import
from .naming import renormalized
from .safe_fetch import SafeFetcher, create_session
from .store import SORTS, WineStore
from .vivino import run_vivino_import

_LOGGER = logging.getLogger(__name__)
_STORE_KEY = "wine_store"
_FETCHER_KEY = "wine_fetcher"
_AUTO_KEY = "wine_auto_enrich"
_WEB_KEY = "wine_web_fetcher"
AUTO_ENRICH_PAUSE_S = 1.0
AUTO_ENRICH_MAX = 60
FETCH_PAUSE_S = 1.0  # polite pacing: at most one e-shop request per second
PRICE_REFRESH_EVERY = timedelta(days=7)
PRICE_REFRESH_CHECK = timedelta(hours=6)
PRICE_REFRESH_FIRST_S = 900
_PRICE_META = "shop_prices_refreshed_at"
_PRICE_TASK = "wine_price_refresh"
IMAGE_URL = "/api/homebrain/wine/image/{wine_id}"
_IMAGE_ID = re.compile(r"^[A-Za-z0-9_-]{1,64}$")


def wine_db_path(hass: HomeAssistant) -> Path:
    """Runtime DB lives in /config/homebrain/, never in the repo or /www."""
    return Path(hass.config.path("homebrain", "wine.db"))


async def async_get_store(hass: HomeAssistant) -> WineStore:
    data = hass.data.setdefault(DOMAIN, {})
    if (store := data.get(_STORE_KEY)) is None:
        store = await hass.async_add_executor_job(WineStore(wine_db_path(hass)).open)
        data[_STORE_KEY] = store
    return store


async def async_close_store(hass: HomeAssistant) -> None:
    if (store := hass.data.get(DOMAIN, {}).pop(_STORE_KEY, None)) is not None:
        await hass.async_add_executor_job(store.close)
    if (web_fetcher := hass.data.get(DOMAIN, {}).pop(_WEB_KEY, None)) is not None:
        await web_fetcher[0].close()


def _signed(hass: HomeAssistant, connection, wines: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Attach a short-lived signed URL for local photos (``<img>`` cannot send a bearer)."""
    for wine in wines:
        image = wine.get("image")
        if image and str(image.get("localPath", "")).startswith("homebrain/media/wine/"):
            image["url"] = async_sign_path(
                hass,
                IMAGE_URL.format(wine_id=wine["id"]),
                timedelta(hours=12),
                refresh_token_id=connection.refresh_token_id,
            )
    return wines


def _signed_result(hass: HomeAssistant, connection, result: dict[str, Any]) -> dict[str, Any]:
    """Sign the ``wine`` record of a write result (the UI replaces its copy with it)."""
    if isinstance(result.get("wine"), dict):
        result["wine"] = _signed(hass, connection, [result["wine"]])[0]
    return result


def _actor(connection: websocket_api.ActiveConnection, kind: str = "user") -> dict[str, Any]:
    return {"type": kind, "id": connection.user.id} if connection.user else {"type": kind}


async def _run(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
    job: Callable[[WineStore], Any],
) -> None:
    if connection.user is None:
        connection.send_error(msg["id"], "unauthorized", "Authentication required")
        return
    store = await async_get_store(hass)
    try:
        result = await hass.async_add_executor_job(job, store)
    except WineError as err:
        connection.send_error(msg["id"], err.code, err.field or err.code)
        return
    connection.send_result(msg["id"], result)


_OP_ID = vol.All(str, vol.Length(min=8, max=128))
_QUERY = {
    vol.Optional("search"): vol.All(str, vol.Length(max=100)),
    vol.Optional("wineTypes"): [vol.In(WINE_TYPES)],
    vol.Optional("colors"): [vol.In(WINE_COLORS)],
    vol.Optional("varieties"): [str],
    vol.Optional("zones"): [str],
    vol.Optional("vintageFrom"): vol.Any(None, int),
    vol.Optional("vintageTo"): vol.Any(None, int),
    vol.Optional("ratingMin"): vol.Any(None, vol.Coerce(float)),
    vol.Optional("inStockOnly"): bool,
    vol.Optional("sort"): vol.In(SORTS),
}


def _query(msg: dict[str, Any]) -> dict[str, Any]:
    return {k.schema: msg[k.schema] for k in _QUERY if k.schema in msg}


@websocket_api.websocket_command({vol.Required("type"): "homebrain/wine/list", **_QUERY})
@websocket_api.require_admin
@websocket_api.async_response
async def ws_list(hass, connection, msg):
    query = _query(msg)
    await _run(hass, connection, msg, lambda s: {"wines": _signed(hass, connection, s.list(query))})


@websocket_api.websocket_command(
    {vol.Required("type"): "homebrain/wine/search", vol.Required("query"): str, **_QUERY}
)
@websocket_api.require_admin
@websocket_api.async_response
async def ws_search(hass, connection, msg):
    query = {**_query(msg), "search": msg["query"][:100]}
    await _run(hass, connection, msg, lambda s: {"wines": _signed(hass, connection, s.list(query))})


@websocket_api.websocket_command(
    {vol.Required("type"): "homebrain/wine/get", vol.Required("wine_id"): str}
)
@websocket_api.require_admin
@websocket_api.async_response
async def ws_get(hass, connection, msg):
    def job(store: WineStore):
        wine = _signed(hass, connection, [store.get(msg["wine_id"])])[0]
        return {
            "wine": wine,
            "events": store.events(msg["wine_id"], 50),
            "priceHistory": store.price_history(msg["wine_id"]),
        }

    await _run(hass, connection, msg, job)


@websocket_api.websocket_command(
    {
        vol.Required("type"): "homebrain/wine/events",
        vol.Optional("wine_id"): str,
        vol.Optional("limit", default=100): vol.All(int, vol.Range(min=1, max=500)),
    }
)
@websocket_api.require_admin
@websocket_api.async_response
async def ws_events(hass, connection, msg):
    await _run(
        hass,
        connection,
        msg,
        lambda s: {"events": s.events(msg.get("wine_id"), msg["limit"])},
    )


@websocket_api.websocket_command(
    {
        vol.Required("type"): "homebrain/wine/create",
        vol.Required("wine"): dict,
        vol.Required("source_operation_id"): _OP_ID,
    }
)
@websocket_api.require_admin
@websocket_api.async_response
async def ws_create(hass, connection, msg):
    actor = _actor(connection)
    await _run(
        hass,
        connection,
        msg,
        lambda s: _signed_result(
            hass, connection, s.create(msg["wine"], msg["source_operation_id"], actor)
        ),
    )


@websocket_api.websocket_command(
    {
        vol.Required("type"): "homebrain/wine/update",
        vol.Required("wine_id"): str,
        vol.Required("changes"): dict,
    }
)
@websocket_api.require_admin
@websocket_api.async_response
async def ws_update(hass, connection, msg):
    # Signed like list/get: the UI swaps its record for this one (a bare record lost the photo).
    await _run(
        hass,
        connection,
        msg,
        lambda s: _signed_result(
            hass, connection, {"wine": s.update(msg["wine_id"], msg["changes"])}
        ),
    )


@websocket_api.websocket_command(
    {
        vol.Required("type"): "homebrain/wine/consume",
        vol.Required("wine_id"): str,
        # Type checks happen in evaluate_consume so every DomainErrorCode is reachable.
        vol.Required("quantity"): vol.Any(int, float),
        vol.Optional("confirmed", default=False): bool,
        vol.Required("source_operation_id"): _OP_ID,
        vol.Optional("reason"): vol.All(str, vol.Length(max=200)),
    }
)
@websocket_api.require_admin
@websocket_api.async_response
async def ws_consume(hass, connection, msg):
    actor = _actor(connection)
    await _run(
        hass,
        connection,
        msg,
        lambda s: _signed_result(
            hass,
            connection,
            s.consume(
                msg["wine_id"],
                msg["quantity"],
                msg["confirmed"],
                msg["source_operation_id"],
                msg.get("reason"),
                actor,
            ),
        ),
    )


@websocket_api.websocket_command(
    {
        vol.Required("type"): "homebrain/wine/correct",
        vol.Required("wine_id"): str,
        vol.Required("quantity"): vol.Any(int, float),
        vol.Required("reason"): str,
        vol.Required("source_operation_id"): _OP_ID,
    }
)
@websocket_api.require_admin
@websocket_api.async_response
async def ws_correct(hass, connection, msg):
    actor = _actor(connection)
    await _run(
        hass,
        connection,
        msg,
        lambda s: _signed_result(
            hass,
            connection,
            s.correct(
                msg["wine_id"], msg["quantity"], msg["reason"], msg["source_operation_id"], actor
            ),
        ),
    )


@websocket_api.websocket_command(
    {
        vol.Required("type"): "homebrain/wine/import",
        # pdf = base64 (data URL allowed), text = pasted order confirmation.
        vol.Required("format"): vol.In(("csv", "json", "pdf", "text")),
        vol.Required("content"): vol.All(str, vol.Length(max=3_400_000)),
        vol.Optional("dry_run", default=True): bool,
    }
)
@websocket_api.require_admin
@websocket_api.async_response
async def ws_import(hass, connection, msg):
    actor = _actor(connection, "import")
    order = msg["format"] in ("pdf", "text")

    def job(s: WineStore) -> dict[str, Any]:
        if order:
            return run_order_import(s, msg["content"], msg["format"], msg["dry_run"], actor)
        return run_import(s, msg["content"], msg["format"], msg["dry_run"], actor)

    if connection.user is None:
        connection.send_error(msg["id"], "unauthorized", "Authentication required")
        return
    store = await async_get_store(hass)
    try:
        result = await hass.async_add_executor_job(job, store)
    except WineError as err:
        connection.send_error(msg["id"], err.code, err.field or err.code)
        return
    if order and not result["dryRun"]:
        ids = [p["wineId"] for p in result["plan"] if p.get("wineId") and p.get("catalogueCode")]
        result["autoEnrich"] = schedule_auto_enrich(hass, store, ids)
    connection.send_result(msg["id"], result)


def _fetcher(hass: HomeAssistant) -> zn.Fetcher:
    data = hass.data.setdefault(DOMAIN, {})
    if (fetcher := data.get(_FETCHER_KEY)) is None:
        fetcher = data[_FETCHER_KEY] = zn.Fetcher(async_get_clientsession(hass))
    return fetcher


async def _enrich_one(
    hass: HomeAssistant,
    store: WineStore,
    wine_id: str,
    code: str | None,
    url: str | None,
    confirm: bool,
) -> dict[str, Any]:
    wine = await hass.async_add_executor_job(store.get, wine_id)
    code = zn.normalize_code(code or "") or zn.normalize_code(
        (wine.get("source") or {}).get("externalProductId") or ""
    )
    if not code and not url:
        raise WineError("ENRICH_NO_CODE")
    fetcher = _fetcher(hass)
    facts = await fetcher.product(code, url, wine)
    changes = zn.proposed_changes(wine, facts)
    result: dict[str, Any] = {
        "wineId": wine_id,
        "facts": facts,
        "changes": {k: v for k, v in changes.items() if k != "source"},
        "photo": bool(facts.get("imageUrl")),
        "applied": False,
    }
    if not confirm:
        return result
    if facts.get("imageUrl"):
        raw = await fetcher.get(facts["imageUrl"], zn.MAX_IMAGE_BYTES, image=True)
        webp = await hass.async_add_executor_job(zn.to_webp, raw)
        local = await hass.async_add_executor_job(
            zn.store_image, hass.config.config_dir, wine_id, webp
        )
        changes["image"] = {
            "localPath": local,
            "sourceUrl": facts["imageUrl"],
            # Owner-approved private use of the vendor's product photo (2026-11-01).
            "licenseStatus": "approved",
        }
    updated = await hass.async_add_executor_job(store.update, wine_id, changes)
    await _record_shop_price(hass, store, wine_id, facts)
    result["wine"] = updated
    result["applied"] = True
    return result


async def _record_shop_price(
    hass: HomeAssistant, store: WineStore, wine_id: str, facts: dict[str, Any] | None
) -> bool:
    """E-shop price snapshot (one per wine and day)."""
    price = (facts or {}).get("price")
    if not isinstance(price, int | float) or isinstance(price, bool) or price <= 0:
        return False
    day = time.strftime("%Y-%m-%d", time.gmtime())

    def job() -> bool:
        return store.add_price_point(
            wine_id,
            "shop",
            float(price),
            point_id=f"shop:{wine_id}:{day}",
            observed_on=day,
            regular_price=(facts or {}).get("regularPrice"),
        )

    return await hass.async_add_executor_job(job)


async def _run_async(hass, connection, msg, job) -> None:
    if connection.user is None:
        connection.send_error(msg["id"], "unauthorized", "Authentication required")
        return
    store = await async_get_store(hass)
    try:
        result = await job(store)
    except WineError as err:
        connection.send_error(msg["id"], err.code, err.field or err.code)
        return
    connection.send_result(msg["id"], result)


@websocket_api.websocket_command(
    {
        vol.Required("type"): "homebrain/wine/enrich",
        vol.Required("wine_id"): str,
        vol.Optional("code"): vol.All(str, vol.Length(max=20)),
        vol.Optional("url"): vol.All(str, vol.Length(max=300)),
        vol.Optional("confirm", default=False): bool,
    }
)
@websocket_api.require_admin
@websocket_api.async_response
async def ws_enrich(hass, connection, msg):
    """Manual 'Doplnit ze Znovínu': preview (default) or confirm (downloads the photo)."""

    async def job(store):
        result = await _enrich_one(
            hass, store, msg["wine_id"], msg.get("code"), msg.get("url"), msg["confirm"]
        )
        return _signed_result(hass, connection, result)

    await _run_async(hass, connection, msg, job)


@websocket_api.websocket_command(
    {
        vol.Required("type"): "homebrain/wine/enrich_batch",
        vol.Required("wine_ids"): vol.All([str], vol.Length(min=1, max=60)),
        vol.Optional("confirm", default=False): bool,
    }
)
@websocket_api.require_admin
@websocket_api.async_response
async def ws_enrich_batch(hass, connection, msg):
    """'Doplnit ze Znovínu vše z importu': preview resolves codes via the cached sitemap only;
    confirm enriches one wine after another with a polite pause."""

    async def job(store):
        items = []
        for n, wine_id in enumerate(msg["wine_ids"]):
            try:
                if msg["confirm"]:
                    if n:
                        await asyncio.sleep(1.0)
                    res = await _enrich_one(hass, store, wine_id, None, None, True)
                    items.append({"wineId": wine_id, "ok": True, "photo": res["photo"]})
                else:
                    wine = await hass.async_add_executor_job(store.get, wine_id)
                    code = zn.normalize_code(
                        (wine.get("source") or {}).get("externalProductId") or ""
                    )
                    if not code:
                        raise WineError("ENRICH_NO_CODE")
                    fetcher = _fetcher(hass)
                    try:
                        url = await fetcher.product_url(code)
                    except WineError:
                        # Older slug without the code: confirm will search these candidates.
                        if not await fetcher.candidates(wine):
                            raise
                        url = None
                    items.append({"wineId": wine_id, "ok": True, "name": wine["name"], "url": url})
            except WineError as err:
                items.append({"wineId": wine_id, "ok": False, "code": err.code})
        return {"confirm": msg["confirm"], "items": items}

    await _run_async(hass, connection, msg, job)


def _web(hass: HomeAssistant) -> SafeFetcher:
    """Public-internet fetcher (own session: its resolver refuses private addresses)."""
    data = hass.data.setdefault(DOMAIN, {})
    if (entry := data.get(_WEB_KEY)) is None:
        session = create_session()
        entry = data[_WEB_KEY] = (session, SafeFetcher(session))
    return entry[1]


@websocket_api.websocket_command({vol.Required("type"): "homebrain/wine/lookup_providers"})
@websocket_api.require_admin
@websocket_api.async_response
async def ws_lookup_providers(hass, connection, msg):
    """Which lookup providers can run here (the AI one needs an HA ``ai_task`` entity)."""
    connection.send_result(msg["id"], {"providers": lk.providers_info(hass)})


@websocket_api.websocket_command(
    {
        vol.Required("type"): "homebrain/wine/lookup",
        vol.Optional("query"): vol.All(str, vol.Length(max=200)),
        vol.Optional("ean"): vol.All(str, vol.Length(max=20)),
        vol.Optional("url"): vol.All(str, vol.Length(max=500)),
        # Label photo, base64 or data URL, already downscaled by the client (≤ ~3 MB).
        vol.Optional("photo"): vol.All(str, vol.Length(max=4_100_000)),
        vol.Optional("wine_id"): str,
        vol.Optional("providers"): [vol.In([p.id for p in lk.PROVIDERS])],
    }
)
@websocket_api.require_admin
@websocket_api.async_response
async def ws_lookup(hass, connection, msg):
    """'Dohledat': name / EAN / URL / photo → proposals. Never writes anything."""

    async def job(store):
        wine = None
        if msg.get("wine_id"):
            wine = await hass.async_add_executor_job(store.get, msg["wine_id"])
        query = lk.build_query(msg, wine)
        ctx = lk.LookupContext(hass=hass, store=store, znovin=_fetcher(hass), web=_web(hass))
        result = await lk.run_lookup(ctx, query, msg.get("providers"))
        for item in result["proposals"]:
            item["vivinoUrl"] = lk.vivino_search_url(item["fields"])
        result["query"] = {
            "text": query.text,
            "ean": query.ean,
            "url": query.url,
            "photo": bool(query.photo),
        }
        return result

    await _run_async(hass, connection, msg, job)


async def _download_image(hass: HomeAssistant, url: str) -> bytes:
    if (urlsplit(url).hostname or "") in zn.ALLOWED_HOSTS:
        return await _fetcher(hass).get(url, zn.MAX_IMAGE_BYTES, image=True)
    body, _final, _ctype = await _web(hass).get(url, "image")
    return body


@websocket_api.websocket_command(
    {
        vol.Required("type"): "homebrain/wine/set_image",
        vol.Required("wine_id"): str,
        # Either the owner's own label photo (base64) or a proposal's image URL.
        vol.Exclusive("photo", "image"): vol.All(str, vol.Length(max=4_100_000)),
        vol.Exclusive("image_url", "image"): vol.All(str, vol.Length(max=500)),
    }
)
@websocket_api.require_admin
@websocket_api.async_response
async def ws_set_image(hass, connection, msg):
    """Store the bottle photo the owner confirmed (re-encoded to WebP, metadata dropped)."""

    async def job(store):
        await hass.async_add_executor_job(store.get, msg["wine_id"])  # 404 before any fetch
        if msg.get("photo"):
            raw, _mime = lk.decode_photo(msg["photo"])
            source_url = None
        elif msg.get("image_url"):
            raw = await _download_image(hass, msg["image_url"])
            source_url = msg["image_url"]
        else:
            raise WineError("IMAGE_MISSING")
        webp = await hass.async_add_executor_job(zn.to_webp, raw)
        local = await hass.async_add_executor_job(
            zn.store_image, hass.config.config_dir, msg["wine_id"], webp
        )
        image = {
            "localPath": local,
            "sourceUrl": source_url,
            # The owner's own photo, or a photo the owner explicitly confirmed in the
            # lookup proposal (source kept for attribution) – private household use.
            "licenseStatus": "approved",
        }
        wine = await hass.async_add_executor_job(store.update, msg["wine_id"], {"image": image})
        return _signed_result(hass, connection, {"wine": wine})

    await _run_async(hass, connection, msg, job)


@websocket_api.websocket_command(
    {
        vol.Required("type"): "homebrain/wine/import_vivino",
        vol.Required("content"): vol.All(str, vol.Length(max=3_000_000)),
        vol.Optional("dry_run", default=True): bool,
        vol.Optional("accept"): [{vol.Required("row"): int, vol.Required("wine_id"): str}],
    }
)
@websocket_api.require_admin
@websocket_api.async_response
async def ws_import_vivino(hass, connection, msg):
    """Owner's Vivino export → personal rating/note; fuzzy pairs only when confirmed."""
    accept = [{"row": a["row"], "wineId": a["wine_id"]} for a in msg.get("accept") or []]
    await _run(
        hass,
        connection,
        msg,
        lambda s: run_vivino_import(s, msg["content"], msg["dry_run"], accept),
    )


def _naming(wine: dict[str, Any]) -> dict[str, Any]:
    return {k: wine.get(k) for k in ("name", "labelName", "predicate")}


async def renormalize_all(
    hass: HomeAssistant, store: WineStore, *, dry_run: bool = False, fetch: bool = True
) -> dict[str, Any]:
    """One-off backfill: re-derive name/labelName/predicate (Znovín H1 + label name).

    Wines with a code or e-shop URL re-fetch their product page (≥1 s apart, the bounded
    fetcher); otherwise the stored data is used (variety as title, old name as label).
    Only the naming fields (and missing provenance URL) change; personal fields stay.
    """
    fetcher = _fetcher(hass)
    wines = await hass.async_add_executor_job(lambda: store.list({"sort": "id"}))
    items: list[dict[str, Any]] = []
    fetched_any = False
    for wine in wines:
        src = wine.get("source") or {}
        code = zn.normalize_code(src.get("externalProductId") or "")
        url = src.get("sourceUrl")
        item: dict[str, Any] = {"wineId": wine["id"], "before": _naming(wine), "fetched": False}
        facts = None
        if fetch and (code or url):
            if fetched_any:
                await asyncio.sleep(FETCH_PAUSE_S)
            fetched_any = True
            try:
                facts = await fetcher.product(code, url, wine)
                item["fetched"] = True
            except WineError as err:
                item["code"] = err.code
            except Exception:  # noqa: BLE001 - one wine must not stop the backfill
                _LOGGER.exception("wine renormalize fetch failed for %s", wine["id"])
                item["code"] = "ENRICH_FAILED"
        changes = renormalized(wine, facts)
        if facts and not url and facts.get("sourceUrl"):
            changes["source"] = {**src, "sourceUrl": facts["sourceUrl"]}
        after = {**wine, **changes}
        item["after"] = _naming(after)
        item["changed"] = sorted(k for k in changes if k != "source")
        if not dry_run:
            if changes:
                await hass.async_add_executor_job(store.update, wine["id"], changes)
            if facts:
                item["shopPrice"] = await _record_shop_price(hass, store, wine["id"], facts)
        items.append(item)
    return {
        "dryRun": dry_run,
        "total": len(items),
        "changed": sum(1 for i in items if i["changed"]),
        "fetched": sum(1 for i in items if i["fetched"]),
        "items": items,
    }


@websocket_api.websocket_command(
    {
        vol.Required("type"): "homebrain/wine/renormalize",
        vol.Optional("dry_run", default=False): bool,
        vol.Optional("fetch", default=True): bool,
    }
)
@websocket_api.require_admin
@websocket_api.async_response
async def ws_renormalize(hass, connection, msg):
    """Admin backfill of the Znovín naming for existing wines."""

    async def job(store):
        return await renormalize_all(hass, store, dry_run=msg["dry_run"], fetch=msg["fetch"])

    await _run_async(hass, connection, msg, job)


async def refresh_shop_prices(hass: HomeAssistant, store: WineStore) -> dict[str, int]:
    """Weekly e-shop price snapshot for wines with a product URL (≤1 request/s)."""
    fetcher = _fetcher(hass)
    wines = await hass.async_add_executor_job(lambda: store.list({"sort": "id"}))
    stats = {"total": 0, "ok": 0, "failed": 0}
    for wine in wines:
        src = wine.get("source") or {}
        url = src.get("sourceUrl")
        if not url:
            continue
        if stats["total"]:
            await asyncio.sleep(FETCH_PAUSE_S)
        stats["total"] += 1
        code = zn.normalize_code(src.get("externalProductId") or "")
        try:
            page = (await fetcher.get(url, zn.MAX_HTML_BYTES)).decode("utf-8", "replace")
            facts = zn.parse_product_html(page, url, None)
            if code and facts["catalogueCode"] not in (code, zn.bottle_code(code)):
                raise WineError("ENRICH_CODE_MISMATCH")
            await _record_shop_price(hass, store, wine["id"], facts)
            stats["ok"] += 1
        except WineError:
            stats["failed"] += 1
    stamp = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    await hass.async_add_executor_job(store.meta_set, _PRICE_META, stamp)
    return stats


def _refresh_due(last: str | None, now: float) -> bool:
    if not last:
        return True
    try:
        then = calendar.timegm(time.strptime(last, "%Y-%m-%dT%H:%M:%SZ"))
    except ValueError:
        return True
    return now - then >= PRICE_REFRESH_EVERY.total_seconds()


async def async_maybe_refresh_prices(hass: HomeAssistant) -> bool:
    """Start the weekly refresh when due (never two at once). Returns True if started."""
    data = hass.data.setdefault(DOMAIN, {})
    task = data.get(_PRICE_TASK)
    if task is not None and not task.done():
        return False
    store = await async_get_store(hass)
    last = await hass.async_add_executor_job(store.meta_get, _PRICE_META)
    if not _refresh_due(last, time.time()):
        return False

    async def run() -> None:
        try:
            stats = await refresh_shop_prices(hass, store)
            _LOGGER.debug("wine price refresh: %s", stats)
        except Exception:  # noqa: BLE001 - background job: log, never crash HA
            _LOGGER.exception("wine price refresh failed")

    data[_PRICE_TASK] = hass.async_create_background_task(run(), "homebrain_wine_prices")
    return True


def async_setup_price_refresh(hass: HomeAssistant, entry) -> None:
    """Check every 6 h (first check 15 min after start) whether a weekly refresh is due."""

    async def tick(_now=None) -> None:
        await async_maybe_refresh_prices(hass)

    entry.async_on_unload(async_track_time_interval(hass, tick, PRICE_REFRESH_CHECK))
    entry.async_on_unload(async_call_later(hass, PRICE_REFRESH_FIRST_S, tick))


def auto_enrich_state(hass: HomeAssistant) -> dict[str, Any]:
    data = hass.data.setdefault(DOMAIN, {})
    return data.setdefault(
        _AUTO_KEY,
        {"running": False, "total": 0, "done": 0, "ok": 0, "failed": 0, "items": [], "queue": []},
    )


def _public_state(state: dict[str, Any]) -> dict[str, Any]:
    return {k: v for k, v in state.items() if k not in ("queue", "task")}


def schedule_auto_enrich(hass: HomeAssistant, store: WineStore, wine_ids: list[str]) -> dict:
    """Queue imported wines for background enrichment (one at a time, polite pause).

    Wines that already have a photo are skipped by the worker; failures are recorded per
    wine and never affect the import itself.
    """
    state = auto_enrich_state(hass)
    queued = [i for i in dict.fromkeys(wine_ids) if i not in state["queue"]]
    if not queued:
        return _public_state(state)
    if not state["running"]:
        state.update(running=True, total=0, done=0, ok=0, failed=0, items=[], queue=[])
        state["startedAt"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        state.pop("finishedAt", None)
        state["queue"].extend(queued[:AUTO_ENRICH_MAX])
        state["total"] = len(state["queue"])
        state["task"] = hass.async_create_background_task(
            _auto_enrich_worker(hass, store, state), "homebrain_wine_auto_enrich"
        )
    else:
        room = max(0, AUTO_ENRICH_MAX - state["total"])
        state["queue"].extend(queued[:room])
        state["total"] += len(queued[:room])
    return _public_state(state)


async def _auto_enrich_worker(hass: HomeAssistant, store: WineStore, state: dict) -> None:
    fetched = False
    try:
        while state["queue"]:
            wine_id = state["queue"].pop(0)
            item: dict[str, Any] = {"wineId": wine_id}
            try:
                wine = await hass.async_add_executor_job(store.get, wine_id)
                item["name"] = wine.get("name")
                if wine.get("image"):
                    item.update(ok=True, skipped="has_image")
                else:
                    if fetched:
                        await asyncio.sleep(AUTO_ENRICH_PAUSE_S)
                    fetched = True
                    res = await _enrich_one(hass, store, wine_id, None, None, True)
                    item.update(ok=True, photo=res["photo"])
            except WineError as err:
                item.update(ok=False, code=err.code)
            except Exception:  # noqa: BLE001 - background job: record, never crash HA
                _LOGGER.exception("wine auto-enrich failed for %s", wine_id)
                item.update(ok=False, code="ENRICH_FAILED")
            state["items"].append(item)
            state["done"] += 1
            state["ok" if item["ok"] else "failed"] += 1
    finally:
        state["running"] = False
        state["queue"] = []
        state["finishedAt"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


@websocket_api.websocket_command(
    {
        vol.Required("type"): "homebrain/wine/voice_consume",
        vol.Required("text"): vol.All(str, vol.Length(min=1, max=500)),
        vol.Required("source_operation_id"): _OP_ID,
        vol.Optional("dry_run", default=False): bool,
    }
)
@websocket_api.require_admin
@websocket_api.async_response
async def ws_voice_consume(hass, connection, msg):
    actor = _actor(connection, "user")
    actor["source"] = "voice"

    def job(store: WineStore):
        return voice_mod.apply_voice_consume(
            store,
            msg["text"],
            msg["source_operation_id"],
            dry_run=msg["dry_run"],
            actor=actor,
        )

    await _run(hass, connection, msg, job)


@websocket_api.websocket_command({vol.Required("type"): "homebrain/wine/voice_pending"})
@websocket_api.require_admin
@websocket_api.async_response
async def ws_voice_pending(hass, connection, msg):
    await _run(hass, connection, msg, lambda s: {"pending": s.voice_pending_list()})


@websocket_api.websocket_command(
    {
        vol.Required("type"): "homebrain/wine/voice_resolve",
        vol.Required("pending_id"): str,
        vol.Required("wine_id"): vol.Any(None, str),
    }
)
@websocket_api.require_admin
@websocket_api.async_response
async def ws_voice_resolve(hass, connection, msg):
    actor = _actor(connection, "user")
    actor["source"] = "voice"

    def job(store: WineStore):
        return voice_mod.resolve_voice_pending(
            store, msg["pending_id"], msg["wine_id"], actor=actor
        )

    await _run(hass, connection, msg, job)


@websocket_api.websocket_command({vol.Required("type"): "homebrain/wine/enrich_status"})
@websocket_api.require_admin
@websocket_api.async_response
async def ws_enrich_status(hass, connection, msg):
    """Progress of the automatic post-import enrichment (polled by the UI)."""
    connection.send_result(msg["id"], _public_state(auto_enrich_state(hass)))


class WineImageView(HomeAssistantView):
    """Serves locally stored bottle photos to authenticated users only (signed path)."""

    url = IMAGE_URL
    name = "api:homebrain:wine_image"
    requires_auth = True

    async def get(self, request: web.Request, wine_id: str) -> web.StreamResponse:
        if not _IMAGE_ID.match(wine_id):
            return web.Response(status=404)
        hass = request.app["hass"]
        path = zn.media_dir(hass.config.config_dir) / f"{wine_id}.webp"
        if not await hass.async_add_executor_job(path.is_file):
            return web.Response(status=404)
        return web.FileResponse(
            path,
            headers={
                "Content-Type": "image/webp",
                "Cache-Control": "private, max-age=3600",
                "X-Content-Type-Options": "nosniff",
            },
        )


COMMANDS = (
    ws_list,
    ws_search,
    ws_get,
    ws_events,
    ws_create,
    ws_update,
    ws_consume,
    ws_correct,
    ws_import,
    ws_enrich,
    ws_enrich_batch,
    ws_enrich_status,
    ws_renormalize,
    ws_lookup_providers,
    ws_lookup,
    ws_set_image,
    ws_import_vivino,
    ws_voice_consume,
    ws_voice_pending,
    ws_voice_resolve,
)


def async_register(
    hass: HomeAssistant,
    register: Callable[[HomeAssistant, Any], None] = websocket_api.async_register_command,
) -> None:
    for command in COMMANDS:
        register(hass, command)
    if getattr(hass, "http", None) is not None:
        hass.http.register_view(WineImageView())
