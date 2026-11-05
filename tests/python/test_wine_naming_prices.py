"""Znovín naming (title + label name + predicate) and price history (SYNTHETIC data only)."""

import sqlite3
from datetime import timedelta
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest
from homeassistant.core import HomeAssistant
from homeassistant.setup import async_setup_component

from custom_components.homebrain.const import DOMAIN
from custom_components.homebrain.wine import enrich as zn
from custom_components.homebrain.wine import websocket as wsmod
from custom_components.homebrain.wine.importer import run_order_import
from custom_components.homebrain.wine.importers.znovin import parse_order_text
from custom_components.homebrain.wine.naming import clean_label, predicate_from, renormalized
from custom_components.homebrain.wine.store import WineStore, migrate

FIXTURES = Path(__file__).parent / "fixtures"
HTML = (FIXTURES / "znovin_product_synthetic.html").read_text(encoding="utf-8")
PAGE = "https://www.znovin.cz/e-shop/ukazkovy-ryzlink-kabinetni-vino-2023-z9101"

# Variety heading line + product/label name, like the e-mail confirmation.
ORDER = """Potvrzení objednávky Ukázka, číslo: 880011
Souhrn objednávky
Rulandské šedé
Ukázkový Pinot gris Cryo 3,14 °C
polosuché/pozdní sběr 2025/Ukázková řada
Šarže 9201 /Obj. číslo Z 9201 /Obsah 0,75 l
2 ks 390 Kč
Rulandské modré klaret
Ukázkový Pinot noir klaret Cryo 3,14 °C
polosuché/moravské zemské víno 2025/Ukázková řada
Šarže 9202 /Obj. číslo Z 9202 /Obsah 0,75 l
1 ks 195 Kč
Sauvignon
Sauvignon z Ukázkového vrchu
suché/VOC Znojmo 2024/Ukázková řada
Šarže 9203 /Obj. číslo Z 9203 /Obsah 0,75 l
3 ks 600 Kč
UKÁZKOVÉ PRVNÍ - Rulandské šedé
suché/moravské zemské víno 2026/Ukázková řada
Šarže 9204 /Obj. číslo Z 9204 /Obsah 0,75 l
2 ks 190 Kč
Cena celkem: 1 375 Kč
"""


@pytest.fixture
def store(tmp_path):
    s = WineStore(tmp_path / "wine.db").open()
    yield s
    s.close()


def test_parser_variety_heading_label_and_predicate():
    draft = parse_order_text(ORDER)
    assert draft.check_ok
    gris, klaret, sauv, first = draft.lines
    assert (gris.name, gris.label_name, gris.predicate) == (
        "Rulandské šedé",
        "Ukázkový Pinot gris Cryo 3,14 °C",
        "pozdní sběr",
    )
    assert (klaret.name, klaret.label_name) == (
        "Rulandské modré klaret",
        "Ukázkový Pinot noir klaret Cryo 3,14 °C",
    )
    assert klaret.color == "white"  # klaret = white wine from blue grapes
    assert klaret.predicate == "moravské zemské víno"
    assert (sauv.name, sauv.label_name, sauv.predicate) == (
        "Sauvignon",
        "Sauvignon z Ukázkového vrchu",
        "VOC Znojmo",
    )
    assert (first.name, first.label_name) == ("UKÁZKOVÉ PRVNÍ - Rulandské šedé", None)


def test_naming_helpers():
    assert (
        clean_label("Sauvignon", "Sauvignon z Ukázkového vrchu") == "Sauvignon z Ukázkového vrchu"
    )
    assert clean_label("Lehké jako pírko - Šumivé víno", "Lehké jako pírko") is None
    assert clean_label("Rulandské šedé", "rulandske sede") is None
    assert clean_label("X", "  ") is None
    assert predicate_from("Pozdní sběr") == "pozdní sběr"
    assert predicate_from("voc znojmo") == "VOC Znojmo"
    assert predicate_from(None) is None
    wine = {"name": "Ukázkový Pinot gris", "grapeVarieties": ["Rulandské šedé"], "labelName": None}
    assert renormalized(wine, None) == {
        "name": "Rulandské šedé",
        "labelName": "Ukázkový Pinot gris",
    }
    facts = {
        "title": "Rulandské šedé",
        "labelName": "Ukázkový Pinot gris",
        "predicate": "pozdní sběr",
    }
    done = {**wine, **renormalized(wine, facts)}
    assert done["predicate"] == "pozdní sběr" and renormalized(done, facts) == {}


def test_product_page_title_label_predicate_price():
    facts = zn.parse_product_html(HTML, PAGE, "Z 9101")
    assert facts["title"] == "Ryzlink rýnský"
    assert facts["labelName"] == "Ukázkový Ryzlink z Trati"
    assert facts["predicate"] == "kabinetní víno"
    assert facts["price"] == 123.0 and facts["regularPrice"] == 150.0


def test_migration_v4_adds_columns_and_backfills_lots(tmp_path):
    path = tmp_path / "old.db"
    conn = sqlite3.connect(path, isolation_level=None)
    conn.row_factory = sqlite3.Row
    migrate(conn, 3)
    conn.execute(
        "INSERT INTO wines (id, name, producer, wine_type, color, grape_varieties_json, volume_ml,"
        " quantity, purchase_price, status, source_json, confidence, created_at, updated_at)"
        " VALUES ('w1', 'Ukázka', 'P', 'still', 'white', '[]', 750, 2, 195, 'in_stock', '{}',"
        " 'inferred', '2026-10-30T10:00:00Z', '2026-10-30T10:00:00Z')"
    )
    conn.execute(
        "INSERT INTO inventory_events VALUES ('e1', 'w1', 'stock_in', 2, 'Import objednávky',"
        " 'order:ukazka-1-objednavka:1', '2026-10-30T10:00:00.000Z', NULL)"
    )
    conn.close()
    s = WineStore(path).open()
    try:
        wine = s.get("w1")
        assert wine["labelName"] is None and wine["predicate"] is None
        hist = s.price_history("w1")
        assert hist["purchases"] == [
            {"date": "2026-10-30", "unitPrice": 195.0, "quantity": 2, "orderRef": "ukazka-1"}
        ]
        assert hist["shop"] == []
    finally:
        s.close()


def test_price_lots_and_identity_never_by_price(store):
    run_order_import(store, ORDER, "text", False, None)
    gris = next(w for w in store.list() if w["source"]["externalProductId"] == "Z 9201")
    assert gris["name"] == "Rulandské šedé" and gris["labelName"].endswith("Cryo 3,14 °C")
    assert gris["predicate"] == "pozdní sběr"
    # Same wine again in another order at a different price → same record, new lot.
    again = ORDER.replace("880011", "880012").replace("2 ks 390 Kč", "2 ks 350 Kč")
    again = again.replace("Cena celkem: 1 375 Kč", "Cena celkem: 1 335 Kč")
    res = run_order_import(store, again, "text", False, None)
    assert res["summary"] == {"stock_in": 4}
    wines = [w for w in store.list() if w["source"]["externalProductId"] == "Z 9201"]
    assert len(wines) == 1 and wines[0]["quantity"] == 4
    lots = store.price_history(wines[0]["id"])["purchases"]
    assert [(lot["unitPrice"], lot["quantity"]) for lot in lots] == [(195.0, 2), (175.0, 2)]
    assert all(len(lot["orderRef"]) == 8 for lot in lots)
    assert lots[0]["orderRef"] != lots[1]["orderRef"]
    assert "880011" not in str(lots)
    # Another batch under the same code is a different wine.
    other = again.replace("880012", "880013").replace("Šarže 9201", "Šarže 9299")
    res = run_order_import(store, other, "text", False, None)
    assert res["summary"]["create"] == 1
    assert len([w for w in store.list() if w["source"]["externalProductId"] == "Z 9201"]) == 2


def test_same_wine_twice_in_one_order_at_two_prices(store):
    dup = ORDER.replace(
        "Cena celkem: 1 375 Kč",
        "Rulandské šedé\nUkázkový Pinot gris Cryo 3,14 °C\n"
        "polosuché/pozdní sběr 2025/Ukázková řada\n"
        "Šarže 9201 /Obj. číslo Z 9201 /Obsah 0,75 l\n1 ks 150 Kč\nCena celkem: 1 525 Kč",
    )
    res = run_order_import(store, dup, "text", False, None)
    assert res["summary"] == {"create": 4, "stock_in": 1}
    gris = next(w for w in store.list() if w["source"]["externalProductId"] == "Z 9201")
    assert gris["quantity"] == 3
    lots = store.price_history(gris["id"])["purchases"]
    assert sorted(lot["unitPrice"] for lot in lots) == [150.0, 195.0]


@pytest.fixture
async def ws(hass: HomeAssistant, hass_ws_client, tmp_path):
    from custom_components.homebrain.wine.websocket import async_close_store

    hass.config.config_dir = str(tmp_path)
    with patch(
        "custom_components.homebrain.wine.websocket.wine_db_path", return_value=tmp_path / "w.db"
    ):
        assert await async_setup_component(hass, DOMAIN, {})
        client = await hass_ws_client(hass)
        yield client
        await async_close_store(hass)


async def _call(client, **msg):
    await client.send_json_auto_id(msg)
    return await client.receive_json()


class FakeFetcher(zn.Fetcher):
    def __init__(self, pages: dict[str, str]):
        super().__init__(None)
        self.pages = pages
        self.calls: list[str] = []

    async def get(self, url, limit, *, image=False):
        self.calls.append(url)
        if url == zn.SITEMAP_URL:
            return b"<urlset></urlset>"
        return self.pages[url].encode()

    async def product_url(self, code):
        for url in self.pages:
            if url.endswith(code.replace(" ", "").lower()):
                return url
        raise zn.WineError("ENRICH_NOT_FOUND")


async def _seed(hass) -> tuple[WineStore, dict[str, str]]:
    store = await wsmod.async_get_store(hass)

    def job():
        ids = {}
        for code, name, variety, url in (
            ("Z 9101", "Ukázkový Ryzlink z Trati", "Ryzlink rýnský", PAGE),
            ("Z 9102", "Ukázkový Pinot gris", "Rulandské šedé", None),
            (None, "Ruční víno", None, None),
        ):
            res = store.create(
                {
                    "name": name,
                    "producer": "Znovín Znojmo",
                    "vintage": 2023,
                    "color": "white",
                    "grapeVarieties": [variety] if variety else [],
                    "personalRating": 4.5,
                    "personalNote": "syntetická poznámka",
                    "location": {"zone": "A", "shelf": "1", "position": None},
                    "confidence": "inferred",
                    "source": {
                        "provider": "order-import",
                        "externalProductId": code,
                        "sourceUrl": url,
                    },
                    "quantity": 2,
                },
                f"seed-op-{name[:6]}-{code}",
            )
            ids[name] = res["wine"]["id"]
        return ids

    return store, await hass.async_add_executor_job(job)


async def test_ws_renormalize_keeps_personal_fields_and_paces(hass, ws, monkeypatch):
    store, ids = await _seed(hass)
    fake = FakeFetcher({PAGE: HTML})
    sleeps: list[float] = []

    async def fake_sleep(s):
        sleeps.append(s)

    monkeypatch.setattr(wsmod.asyncio, "sleep", fake_sleep)
    with patch.object(wsmod, "_fetcher", return_value=fake):
        dry = await _call(ws, type="homebrain/wine/renormalize", dry_run=True)
        assert dry["success"], dry
        assert dry["result"]["changed"] == 2
        assert (await hass.async_add_executor_job(store.get, ids["Ukázkový Pinot gris"]))[
            "name"
        ] == "Ukázkový Pinot gris"
        res = await _call(ws, type="homebrain/wine/renormalize")
    assert res["success"], res
    out = res["result"]
    assert out["total"] == 3 and out["fetched"] == 1
    assert all(s >= 1.0 for s in sleeps) and sleeps
    ryz = await hass.async_add_executor_job(store.get, ids["Ukázkový Ryzlink z Trati"])
    assert (ryz["name"], ryz["labelName"], ryz["predicate"]) == (
        "Ryzlink rýnský",
        "Ukázkový Ryzlink z Trati",
        "kabinetní víno",
    )
    assert ryz["personalRating"] == 4.5 and ryz["personalNote"] == "syntetická poznámka"
    assert ryz["location"]["zone"] == "A" and ryz["quantity"] == 2 and ryz["color"] == "white"
    # No product page found → offline fallback from stored data (variety as title).
    gris = await hass.async_add_executor_job(store.get, ids["Ukázkový Pinot gris"])
    assert (gris["name"], gris["labelName"]) == ("Rulandské šedé", "Ukázkový Pinot gris")
    manual = await hass.async_add_executor_job(store.get, ids["Ruční víno"])
    assert manual["name"] == "Ruční víno" and manual["labelName"] is None
    got = await _call(ws, type="homebrain/wine/get", wine_id=ryz["id"])
    shop = got["result"]["priceHistory"]["shop"]
    assert len(shop) == 1 and shop[0]["unitPrice"] == 123.0 and shop[0]["regularPrice"] == 150.0
    # Idempotent: a second run changes nothing and keeps one snapshot per day.
    with patch.object(wsmod, "_fetcher", return_value=fake):
        again = await _call(ws, type="homebrain/wine/renormalize")
    assert again["result"]["changed"] == 0
    hist = await hass.async_add_executor_job(store.price_history, ryz["id"])
    assert len(hist["shop"]) == 1


async def test_weekly_price_refresh_is_scheduled_due_and_polite(hass, ws, monkeypatch):
    store, ids = await _seed(hass)
    fake = FakeFetcher({PAGE: HTML})
    sleeps: list[float] = []

    async def fake_sleep(s):
        sleeps.append(s)

    monkeypatch.setattr(wsmod.asyncio, "sleep", fake_sleep)
    with patch.object(wsmod, "_fetcher", return_value=fake):
        assert await wsmod.async_maybe_refresh_prices(hass)
        await hass.data[DOMAIN]["wine_price_refresh"]
        # Only wines with a product URL are fetched.
        assert [c for c in fake.calls if c != zn.SITEMAP_URL] == [PAGE]
        assert not await wsmod.async_maybe_refresh_prices(hass)  # not due for a week
        hist = await hass.async_add_executor_job(
            store.price_history, ids["Ukázkový Ryzlink z Trati"]
        )
        assert [p["unitPrice"] for p in hist["shop"]] == [123.0]
        await hass.async_add_executor_job(
            store.meta_set, "shop_prices_refreshed_at", "2020-01-01T00:00:00Z"
        )
        assert await wsmod.async_maybe_refresh_prices(hass)
        await hass.data[DOMAIN]["wine_price_refresh"]
    assert wsmod._refresh_due(None, 0) and not wsmod._refresh_due("2026-11-01T00:00:00Z", 0)
    entry = MagicMock()
    with (
        patch.object(wsmod, "async_track_time_interval") as interval,
        patch.object(wsmod, "async_call_later") as later,
    ):
        wsmod.async_setup_price_refresh(hass, entry)
    assert interval.call_args.args[2] == timedelta(hours=6)
    assert later.call_args.args[1] == wsmod.PRICE_REFRESH_FIRST_S
    assert entry.async_on_unload.call_count == 2
    assert wsmod.PRICE_REFRESH_EVERY == timedelta(days=7) and wsmod.FETCH_PAUSE_S >= 1.0
