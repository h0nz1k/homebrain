"""Znovín order import + enrichment (SYNTHETIC fixtures only – no real order/page data)."""

import base64
import io
from pathlib import Path
from unittest.mock import patch

import pytest
from homeassistant.core import HomeAssistant
from homeassistant.setup import async_setup_component

from custom_components.homebrain.const import DOMAIN
from custom_components.homebrain.wine import enrich as zn
from custom_components.homebrain.wine.domain import WineError
from custom_components.homebrain.wine.importer import run_order_import
from custom_components.homebrain.wine.importers.znovin import (
    order_fingerprint,
    parse_order_text,
    pdf_to_text,
)
from custom_components.homebrain.wine.store import WineStore

FIXTURES = Path(__file__).parent / "fixtures"

# Mimics the Gmail print layout: title lines, detail, batch/code/volume, qty+price.
# Item 3 has its qty/price printed before the detail line (shifted table cell).
ORDER = """Potvrzení objednávky Ukázka, číslo: 990011
Souhrn objednávky
UKÁZKA - Ryzlink rýnský
suché/moravské zemské víno 2026/Ukázková řada
Šarže 9101 /Obj. číslo Z 9101 /Obsah 0,75 l
3 ks 300 Kč
Frankovka
Frankovka z Ukázkové trati
polosuché/pozdní sběr 2024/Terroir - ukázková řada
Šarže 9102 /Obj. číslo Z 9102 /Obsah 0,75 l
2 ks 400 Kč
Rulandské modré
Pinot noir Ukázka
6 ks 1 200 Kč
suché/výběr z hroznů 2025/Ukázková řada
Šarže 9103 /Obj. číslo Z 9103 /Obsah 0,75 l
Ukázkové šumivé víno Rosé
demi sec/jakostní šumivé víno 2022/Sekty ukázkové
Šarže 9104 /Obj. číslo K 9104 /Obsah 0,75 l
1 ks 250 Kč
Slevový kód
Ukázková sleva
-150 Kč
Doprava
Osobní odběr
zdarma
Platba
Karta
zdarma
Cena celkem: 2 000 Kč
Fakturační údaje
SYNTETICKÉ JMÉNO
"""


@pytest.fixture
def store(tmp_path):
    s = WineStore(tmp_path / "wine.db").open()
    yield s
    s.close()


def test_parse_synthetic_order_with_shifted_cells_and_discount():
    draft = parse_order_text(ORDER)
    out = draft.public()
    assert out["recognized"] and out["itemCount"] == 4 and out["bottles"] == 12
    assert out["check"] == {
        "ok": True,
        "itemsTotal": 2150.0,
        "discounts": 150.0,
        "fees": 0.0,
        "orderTotal": 2000.0,
        "expectedTotal": 2000.0,
    }
    first, second, third, fourth = draft.lines
    assert (first.catalogue_code, first.batch, first.vintage) == ("Z 9101", "9101", 2026)
    assert first.variety == "Ryzlink rýnský" and first.sweetness == "suché"
    assert second.name == "Frankovka" and second.color == "red"
    assert second.label_name == "Frankovka z Ukázkové trati"
    assert second.predicate == "pozdní sběr" and first.predicate == "moravské zemské víno"
    assert first.name == "UKÁZKA - Ryzlink rýnský" and first.label_name is None
    assert second.line == "Terroir-ukázková řada" and second.unit_price == 200.0
    assert third.quantity == 6 and third.line_total == 1200.0 and third.unit_price == 200.0
    assert third.title == "Rulandské modré – Pinot noir Ukázka"
    assert (third.name, third.label_name) == ("Rulandské modré", "Pinot noir Ukázka")
    assert third.predicate == "výběr z hroznů"
    assert fourth.catalogue_code == "K 9104" and fourth.wine_type == "sparkling"
    assert fourth.color == "rose" and fourth.category == "jakostní šumivé víno"
    # Personal blocks never leak into the draft; order number only via fingerprint.
    assert "SYNTETICK" not in str(out) and "990011" not in str(out)


def test_arithmetic_mismatch_is_flagged_and_apply_refused(store):
    bad = ORDER.replace("Cena celkem: 2 000 Kč", "Cena celkem: 2 100 Kč")
    out = parse_order_text(bad).public()
    assert not out["check"]["ok"] and "arithmetic_mismatch" in out["issues"]
    with pytest.raises(WineError) as err:
        run_order_import(store, bad, "text", False, None)
    assert err.value.code == "IMPORT_CHECK_FAILED"
    assert store.list() == []


def test_missing_quantity_row_is_flagged():
    out = parse_order_text(ORDER.replace("2 ks 400 Kč\n", "")).public()
    assert "quantity_mismatch" in out["issues"] and not out["check"]["ok"]


def test_unrecognised_text_does_not_guess(store):
    res = run_order_import(store, "Nákupní seznam: 2x víno, 1x sýr", "text", True, None)
    assert res["errors"][0]["code"] == "IMPORT_UNRECOGNISED" and res["plan"] == []


def test_apply_is_idempotent_and_merges_by_code_and_vintage(store):
    preview = run_order_import(store, ORDER, "text", True, None)
    assert preview["summary"] == {"create": 4} and store.list() == []
    applied = run_order_import(store, ORDER, "text", False, {"type": "import"})
    assert applied["summary"] == {"create": 4}
    wines = {w["source"]["externalProductId"]: w for w in store.list()}
    assert wines["Z 9103"]["quantity"] == 6 and wines["Z 9103"]["purchasePrice"] == 200.0
    assert wines["Z 9101"]["productLine"] == "Ukázková řada"
    assert wines["Z 9101"]["source"]["batch"] == "9101"
    again = run_order_import(store, ORDER, "text", False, None)
    assert again["summary"] == {"already_imported": 4} and again["order"]["alreadyImported"]
    assert sum(w["quantity"] for w in store.list()) == 12
    # A different order (other number) with the same wine stocks in onto the same record.
    second = ORDER.replace("990011", "990012")
    res = run_order_import(store, second, "text", False, None)
    assert res["summary"] == {"stock_in": 4}
    assert {w["source"]["externalProductId"]: w for w in store.list()}["Z 9103"]["quantity"] == 12


def test_fingerprint_is_hmac_and_secret_bound(store):
    draft = parse_order_text(ORDER)
    fp = order_fingerprint(store.secret(), draft)
    assert len(fp) == 64 and "990011" not in fp
    assert order_fingerprint(b"other-secret", draft) != fp
    assert store.secret() == store.secret()


def _pdf(text: str) -> bytes:
    """Minimal one-page PDF with the given lines (Helvetica, ASCII only)."""
    lines = text.splitlines()
    ops = (
        ["BT /F1 9 Tf 20 800 Td 11 TL"]
        + [
            "(" + ln.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)") + ") '"
            for ln in lines
        ]
        + ["ET"]
    )
    stream = "\n".join(ops).encode("latin-1")
    objs = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R "
        b"/Resources << /Font << /F1 5 0 R >> >> >>",
        b"<< /Length %d >>\nstream\n" % len(stream) + stream + b"\nendstream",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ]
    out = io.BytesIO()
    out.write(b"%PDF-1.4\n")
    offsets = []
    for n, body in enumerate(objs, start=1):
        offsets.append(out.tell())
        out.write(b"%d 0 obj\n" % n + body + b"\nendobj\n")
    xref = out.tell()
    out.write(b"xref\n0 %d\n0000000000 65535 f \n" % (len(objs) + 1))
    for off in offsets:
        out.write(b"%010d 00000 n \n" % off)
    out.write(
        b"trailer << /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n" % (len(objs) + 1, xref)
    )
    return out.getvalue()


def test_pdf_path_and_limits(store):
    ascii_order = (
        "Merlot\nUkazka Merlot\nsuche/pozdni sber 2024/Ukazkova rada\n"
        "Sarze 9301 /Obj. cislo Z 9301 /Obsah 0,75 l\n2 ks 300 Kc\nCena celkem: 300 Kc\n"
    )
    text = pdf_to_text(_pdf(ascii_order))
    assert "Merlot" in text
    with pytest.raises(WineError):
        pdf_to_text(b"not a pdf")
    with pytest.raises(WineError) as err:
        run_order_import(store, "A" * 4_000_000, "pdf", True, None)
    assert err.value.code == "IMPORT_TOO_LARGE"
    res = run_order_import(store, base64.b64encode(_pdf("Ahoj")).decode(), "pdf", True, None)
    assert res["errors"][0]["code"] == "IMPORT_UNRECOGNISED"


# ---------- enrichment ----------
HTML = (FIXTURES / "znovin_product_synthetic.html").read_text(encoding="utf-8")
PAGE = "https://www.znovin.cz/e-shop/ukazkovy-ryzlink-kabinetni-vino-2023-z9101"


def test_parse_product_page_fixture():
    facts = zn.parse_product_html(HTML, PAGE, "Z 9101")
    assert facts["catalogueCode"] == "Z 9101" and facts["variety"] == "Ryzlink rýnský"
    assert facts["alcoholPct"] == 11.5 and facts["residualSugarGl"] == 3.1
    assert facts["color"] == "white" and facts["vintage"] == 2023
    assert facts["productLine"] == "Ukázková řada" and facts["region"] == "Ukázková podoblast"
    assert facts["imageUrl"].endswith("/l-558x744-80/Z9101.jpg")
    with pytest.raises(WineError) as err:
        zn.parse_product_html(HTML, PAGE, "Z 9999")
    assert err.value.code == "ENRICH_CODE_MISMATCH"


@pytest.mark.parametrize(
    "url",
    [
        "http://www.znovin.cz/e-shop/x",
        "https://evil.example/e-shop/x",
        "https://www.znovin.cz.evil.example/e-shop/x",
        "https://" + "user" + "\x40" + "www.znovin.cz/e-shop/x",  # userinfo in URL
        "https://www.znovin.cz:8443/e-shop/x",
        "https://www.znovin.cz/admin/x",
        "https://127.0.0.1/e-shop/x",
    ],
)
def test_ssrf_guard(url):
    with pytest.raises(WineError):
        zn.check_url(url)


def test_sitemap_lookup_and_webp(tmp_path):
    sitemap = f"<urlset><url><loc>{PAGE}</loc></url><url><loc>{PAGE}1</loc></url></urlset>"
    assert zn.find_product_url(sitemap, "Z 9101") == PAGE
    assert zn.find_product_url(sitemap, "Z 9100") is None
    from PIL import Image

    raw = io.BytesIO()
    img = Image.new("RGB", (1200, 1600), "#f0f0f0")
    exif = Image.Exif()
    exif[0x010E] = "synthetic secret"
    img.save(raw, "JPEG", exif=exif)
    webp = zn.to_webp(raw.getvalue())
    out = Image.open(io.BytesIO(webp))
    assert out.format == "WEBP" and out.size == (600, 800) and not out.getexif()
    assert b"synthetic secret" not in webp
    path = zn.store_image(str(tmp_path), "abc123", webp)
    assert path == "homebrain/media/wine/abc123.webp"
    assert (tmp_path / path).read_bytes() == webp
    with pytest.raises(WineError):
        zn.to_webp(b"<svg/>")


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


async def test_ws_import_and_enrich_flow(hass, ws, hass_client, tmp_path):
    preview = await _call(ws, type="homebrain/wine/import", format="text", content=ORDER)
    assert preview["success"] and preview["result"]["order"]["check"]["ok"]
    assert preview["result"]["dryRun"]
    with patch(
        "custom_components.homebrain.wine.websocket.schedule_auto_enrich", return_value={}
    ) as sched:
        done = await _call(
            ws, type="homebrain/wine/import", format="text", content=ORDER, dry_run=False
        )
    wine_id = next(p["wineId"] for p in done["result"]["plan"] if p["catalogueCode"] == "Z 9101")
    assert wine_id in sched.call_args.args[2] and len(sched.call_args.args[2]) == 4

    from PIL import Image

    raw = io.BytesIO()
    Image.new("RGB", (300, 400), "#e0e8d0").save(raw, "JPEG")

    class FakeFetcher(zn.Fetcher):
        calls: list[str] = []

        async def get(self, url, limit, *, image=False):
            self.calls.append(url)
            if image:
                zn.check_url(url, image=True)
                return raw.getvalue()
            return HTML.encode()

        async def product_url(self, code):
            return PAGE

    fake = FakeFetcher(None)
    with patch("custom_components.homebrain.wine.websocket._fetcher", return_value=fake):
        prev = await _call(ws, type="homebrain/wine/enrich", wine_id=wine_id)
        assert prev["success"] and not prev["result"]["applied"] and prev["result"]["photo"]
        assert prev["result"]["changes"]["alcoholPct"] == 11.5
        assert not (tmp_path / "homebrain/media/wine").exists()
        conf = await _call(ws, type="homebrain/wine/enrich", wine_id=wine_id, confirm=True)
        assert conf["success"], conf
        wine = conf["result"]["wine"]
        assert wine["image"]["localPath"] == f"homebrain/media/wine/{wine_id}.webp"
        assert "authSig=" in wine["image"]["url"] and wine["alcoholPct"] == 11.5
        batch = await _call(ws, type="homebrain/wine/enrich_batch", wine_ids=[wine_id, "nope"])
        assert batch["result"]["items"][0]["ok"] and not batch["result"]["items"][1]["ok"]
    http = await hass_client()
    resp = await http.get(wine["image"]["url"])
    assert resp.status == 200 and resp.headers["Content-Type"] == "image/webp"
    unsigned = await http.get(f"/api/homebrain/wine/image/{wine_id}", headers={"Authorization": ""})
    assert unsigned.status == 401
    assert (await http.get("/api/homebrain/wine/image/..%2Fsecret")).status in (400, 401, 404)


# --- (B) fallback resolver for e-shop slugs without the ``-z<code>`` suffix -----------------

E = "https://www.znovin.cz/e-shop/"
SYN_WINE = {
    "name": "Ukázkový Ryzlink pozdní sběr",
    "grapeVarieties": ["Ryzlink rýnský"],
    "vintage": 2019,
}
SYN_SITEMAP = (
    "<urlset>"
    + "".join(
        f"<url><loc>{E}{slug}</loc></url>"
        for slug in (
            "frankovka-ukazkova-2019",
            "ukazkovy-ryzlink-pozdni-sber-2018",
            "ukazkovy-ryzlink-pozdni-sber-2019-z9101",
            "ryzlink-2019",
            "ukazkovy-ryzlink-pozdni-sber-2019-6",
            "ukazkovy-ryzlink-pozdni-sber-2019",
        )
    )
    + "</urlset>"
)


def _page(code_digits: str) -> str:
    return HTML.replace("9101", code_digits)


def test_slug_tokens_and_candidate_ranking():
    assert zn.slug_tokens("Pozdní sběr – Ryzlink rýnský") == ["pozdni", "sber", "ryzlink", "rynsky"]
    cands = zn.candidate_urls(SYN_SITEMAP, SYN_WINE)
    assert cands == [
        E + "ukazkovy-ryzlink-pozdni-sber-2019",
        E + "ukazkovy-ryzlink-pozdni-sber-2019-6",
        E + "ryzlink-2019",
    ]  # wrong vintage, coded URL of another product and unrelated slugs are excluded
    assert zn.candidate_urls(SYN_SITEMAP, {"name": "", "vintage": 2019}) == []
    assert len(zn.candidate_urls(SYN_SITEMAP * 3, SYN_WINE, limit=2)) == 2


class _SiteFetcher(zn.Fetcher):
    """Fetcher with a synthetic site instead of the network."""

    def __init__(self, pages):
        super().__init__(None)
        self.pages = pages
        self.calls: list[str] = []

    async def get(self, url, limit, *, image=False):
        self.calls.append(url)
        if url == zn.SITEMAP_URL:
            return SYN_SITEMAP.encode()
        zn.check_url(url, image=image)
        if url not in self.pages:
            raise WineError("ENRICH_NOT_FOUND")
        return self.pages[url].encode()


async def test_resolver_accepts_only_exact_code_and_caches(monkeypatch):
    sleeps: list[float] = []

    async def fake_sleep(s):
        sleeps.append(s)

    monkeypatch.setattr(zn.asyncio, "sleep", fake_sleep)
    f = _SiteFetcher(
        {
            E + "ukazkovy-ryzlink-pozdni-sber-2019": _page("9104"),  # same name, other code
            E + "ukazkovy-ryzlink-pozdni-sber-2019-6": _page("9105"),
        }
    )
    facts = await f.product("Z 9105", None, SYN_WINE)
    assert facts["catalogueCode"] == "Z 9105"
    assert facts["sourceUrl"] == E + "ukazkovy-ryzlink-pozdni-sber-2019-6"
    assert f.calls == [
        zn.SITEMAP_URL,
        E + "ukazkovy-ryzlink-pozdni-sber-2019",
        E + "ukazkovy-ryzlink-pozdni-sber-2019-6",
    ]
    assert sleeps == [1.0]  # polite pause between candidate pages
    # Cached code → URL: next lookup goes straight to the product page (no search).
    assert await f.product_url("Z 9105") == E + "ukazkovy-ryzlink-pozdni-sber-2019-6"
    f.calls.clear()
    await f.product("Z 9105", None, SYN_WINE)
    assert f.calls == [E + "ukazkovy-ryzlink-pozdni-sber-2019-6"]
    # Coded URLs still win without any candidate fetch.
    assert await f.product_url("Z 9101") == E + "ukazkovy-ryzlink-pozdni-sber-2019-z9101"


async def test_resolver_never_guesses(monkeypatch):
    async def fake_sleep(s):
        return None

    monkeypatch.setattr(zn.asyncio, "sleep", fake_sleep)
    many = (
        "<urlset>"
        + "".join(f"<url><loc>{E}ukazkovy-ryzlink-2019-{n}</loc></url>" for n in range(10))
        + "</urlset>"
    )
    f = _SiteFetcher({f"{E}ukazkovy-ryzlink-2019-{n}": _page("9104") for n in range(10)})
    f._sitemap = (zn.time.monotonic(), many)
    with pytest.raises(WineError) as err:
        await f.product("Z 9106", None, SYN_WINE)
    assert err.value.code == "ENRICH_NOT_FOUND"
    assert len(f.calls) == zn.MAX_CANDIDATES  # bounded: at most 6 candidate pages
    with pytest.raises(WineError):
        await f.product_url("Z 9106")  # a miss is not cached as a hit
    with pytest.raises(WineError):  # without wine data there is no search at all
        await _SiteFetcher({}).product("Z 9106", None, None)


# --- (A) automatic enrichment after an order import ----------------------------------------


async def test_auto_enrich_after_order_import(hass, ws, tmp_path):
    from PIL import Image

    from custom_components.homebrain.wine import websocket as wsmod

    raw = io.BytesIO()
    Image.new("RGB", (300, 400), "#e0e8d0").save(raw, "JPEG")

    class Fake(_SiteFetcher):
        async def get(self, url, limit, *, image=False):
            if image:
                self.calls.append(url)
                return raw.getvalue()
            return await super().get(url, limit, image=image)

    fake = Fake({PAGE: HTML})
    fake._sitemap = (zn.time.monotonic(), f"<urlset><url><loc>{PAGE}</loc></url></urlset>")
    with (
        patch.object(wsmod, "_fetcher", return_value=fake),
        patch.object(wsmod, "AUTO_ENRICH_PAUSE_S", 0),
    ):
        done = await _call(
            ws, type="homebrain/wine/import", format="text", content=ORDER, dry_run=False
        )
        assert done["success"], done
        assert done["result"]["autoEnrich"]["running"]
        assert done["result"]["autoEnrich"]["total"] == 4
        await hass.data[DOMAIN]["wine_auto_enrich"]["task"]
        status = (await _call(ws, type="homebrain/wine/enrich_status"))["result"]
        assert not status["running"] and status["done"] == 4 and "task" not in status
        assert status["ok"] == 1 and status["failed"] == 3  # failures are per wine, non-fatal
        by_code = {i["wineId"]: i for i in status["items"]}
        ok = next(i for i in status["items"] if i["ok"])
        assert ok["photo"] and all(
            i.get("code") == "ENRICH_NOT_FOUND" for i in by_code.values() if not i["ok"]
        )
        listed = (await _call(ws, type="homebrain/wine/list"))["result"]["wines"]
        assert sum(1 for w in listed if w.get("image")) == 1
        # Re-import (idempotent): wines with a photo are skipped, others retried.
        fake.calls.clear()
        again = await _call(
            ws, type="homebrain/wine/import", format="text", content=ORDER, dry_run=False
        )
        assert again["success"]
        await hass.data[DOMAIN]["wine_auto_enrich"]["task"]
        status = (await _call(ws, type="homebrain/wine/enrich_status"))["result"]
        assert [i.get("skipped") for i in status["items"]].count("has_image") == 1
        assert not any("m-images" in c for c in fake.calls)
    # Preview / dry run never schedules anything.
    with patch.object(wsmod, "schedule_auto_enrich") as sched:
        await _call(ws, type="homebrain/wine/import", format="text", content=ORDER)
    sched.assert_not_called()


# --- carton / promo lines (``K <n>``) resolve to the single bottle ``Z <n>`` ------------------


def _carton_page() -> str:
    return (
        HTML.replace("Z 9101", "K 9107")
        .replace("Z9101", "K9107")
        .replace("z-9101", "k-9107")
        .replace("9101", "9107")
    )


CARTON_WINE = {"name": "Ukázkové víno 5+1", "vintage": 2021}
CARTON = E + "ukazkove-vino-karton-jakostni-vino-2021-k9107"
BOTTLE = E + "ukazkove-vino-jakostni-vino-2021-1"


def _carton_site(with_bottle: bool) -> _SiteFetcher:
    pages = {CARTON: _carton_page()}
    if with_bottle:
        pages[BOTTLE] = _page("9107")
    f = _SiteFetcher(pages)
    locs = [CARTON, BOTTLE] if with_bottle else [CARTON]
    f._sitemap = (zn.time.monotonic(), "".join(f"<loc>{u}</loc>" for u in locs))
    return f


async def test_carton_code_prefers_bottle_page(monkeypatch):
    async def fake_sleep(s):
        return None

    monkeypatch.setattr(zn.asyncio, "sleep", fake_sleep)
    f = _carton_site(with_bottle=True)
    facts = await f.product("K 9107", None, CARTON_WINE)
    assert facts["catalogueCode"] == "Z 9107" and facts["resolvedCode"] == "Z 9107"
    assert facts["resolvedProductUrl"] == BOTTLE and facts["imageUrl"].endswith("/Z9107.jpg")
    assert CARTON not in f.calls  # carton page not needed
    wine = {"color": "other", "source": {"provider": "order-import", "externalProductId": "K 9107"}}
    src = zn.proposed_changes(wine, facts)["source"]
    assert src["externalProductId"] == "K 9107"  # order record keeps the carton code
    assert src["resolvedCode"] == "Z 9107" and src["resolvedProductUrl"] == BOTTLE
    # Explicit URL of the bottle page for a carton wine is accepted as the resolved product.
    via_url = await _carton_site(True).product("K 9107", BOTTLE, CARTON_WINE)
    assert via_url["resolvedCode"] == "Z 9107" and via_url["imageUrl"]


async def test_carton_without_bottle_uses_facts_but_never_the_photo(monkeypatch):
    async def fake_sleep(s):
        return None

    monkeypatch.setattr(zn.asyncio, "sleep", fake_sleep)
    facts = await _carton_site(with_bottle=False).product("K 9107", None, CARTON_WINE)
    assert facts["catalogueCode"] == "K 9107" and facts["imageUrl"] is None
    assert "resolvedCode" not in facts and facts["alcoholPct"] == 11.5
    via_url = await _carton_site(False).product("K 9107", CARTON, CARTON_WINE)
    assert via_url["imageUrl"] is None
    with pytest.raises(WineError) as err:
        await _carton_site(True).product("K 9108", BOTTLE, CARTON_WINE)
    assert err.value.code == "ENRICH_CODE_MISMATCH"


def test_carton_photo_guard_on_any_page():
    # K… image file name is rejected even when the code check passes.
    assert zn.parse_product_html(_carton_page(), CARTON, "K 9107")["imageUrl"] is None
    # '5+1' / 'karton' in the product title or image alt → no photo.
    promo = _page("9107").replace("<title>", "<title>Akce 5+1 ")
    if "<title>" not in _page("9107"):
        promo = _page("9107").replace('alt=""', 'alt="Ukázkové víno karton"')
    assert zn.parse_product_html(promo, BOTTLE, "Z 9107")["imageUrl"] is None
    assert zn.parse_product_html(_page("9107"), BOTTLE, "Z 9107")["imageUrl"]
    assert zn.bottle_code("K 9107") == "Z 9107" and zn.bottle_code("Z 9107") is None


PACK_ORDER = """Potvrzení objednávky Ukázka, číslo: 990022
Souhrn objednávky
Zweigeltrebe 5+1
Ukázkový Cvajgl
suché/jakostní víno 2021/Ukázková řada
Šarže 9201 /Obj. číslo K 9201 /Obsah 0,75 l
1 ks 550 Kč
Ryzlink vlašský
Ukázka karton 6 lahví
suché/jakostní víno 2024/Ukázková řada
Šarže 9202 /Obj. číslo K 9202 /Obsah 0,75 l
2 ks 1 200 Kč
Frankovka
Ukázka bez kartonu
suché/jakostní víno 2024/Ukázková řada
Šarže 9203 /Obj. číslo Z 9203 /Obsah 0,75 l
3 ks 300 Kč
Doprava
Osobní odběr
zdarma
Cena celkem: 2 050 Kč
"""


def test_promo_carton_counts_bottles_not_order_units():
    draft = parse_order_text(PACK_ORDER)
    promo, carton, single = draft.lines
    assert (promo.order_units, promo.pack_size, promo.quantity) == (1, 6, 6)
    assert promo.pack_label == "5+1" and promo.unit_price == round(550 / 6, 2)
    assert promo.name == "Zweigeltrebe" and "5+1" not in promo.title
    assert (carton.order_units, carton.pack_size, carton.quantity) == (2, 6, 12)
    assert carton.unit_price == 100.0 and "karton" not in carton.title.lower()
    assert (single.order_units, single.pack_size, single.quantity) == (3, 1, 3)
    assert draft.bottles() == 21 and draft.check_ok
    assert all(not item.issues for item in draft.lines)


def test_carton_code_without_readable_size_is_flagged_not_guessed():
    text = PACK_ORDER.replace("Zweigeltrebe 5+1", "Zweigeltrebe")
    promo = parse_order_text(text).lines[0]
    assert (promo.quantity, promo.pack_size) == (1, 1)
    assert promo.issues == ["pack_size_unknown"]


def test_fingerprint_without_order_number_uses_ordered_units(store):
    text = PACK_ORDER.replace(", číslo: 990022", "")
    draft = parse_order_text(text)
    assert draft.order_ref is None
    material_units = [item.order_units for item in draft.lines]
    assert material_units == [1, 2, 3]
    assert order_fingerprint(store.secret(), draft) == order_fingerprint(
        store.secret(), parse_order_text(text)
    )


def test_apply_promo_carton_stocks_six_bottles(store):
    result = run_order_import(store, PACK_ORDER, "text", False, {"type": "import"})
    row = next(r for r in result["plan"] if r["catalogueCode"] == "K 9201")
    pack = (row["quantity"], row["orderUnits"], row["packSize"], row["packLabel"])
    assert pack == (6, 1, 6, "5+1")
    wine = store.get(row["wineId"])
    assert wine["quantity"] == 6 and wine["purchasePrice"] == round(550 / 6, 2)
    assert sum(w["quantity"] for w in store.list()) == 21
