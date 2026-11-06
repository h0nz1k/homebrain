"""Universal wine lookup (#81): providers, SSRF guard, ai_task, Vivino import, WS flow.

Real-world fixture: Mionetto Prosecco DOC Treviso (EAN 8006220001669) as published by
Open Food Facts (ODbL); no network access in tests.
"""

from __future__ import annotations

import base64
import io
import json
from pathlib import Path
from unittest.mock import patch

import pytest
from homeassistant.core import HomeAssistant, SupportsResponse
from homeassistant.exceptions import HomeAssistantError
from homeassistant.setup import async_setup_component

from custom_components.homebrain.const import DOMAIN
from custom_components.homebrain.wine import lookup as lk
from custom_components.homebrain.wine import safe_fetch as sf
from custom_components.homebrain.wine import websocket as wsmod
from custom_components.homebrain.wine.domain import WineError, gtin_valid, normalize_ean
from custom_components.homebrain.wine.store import WineStore
from custom_components.homebrain.wine.vivino import parse_export, run_vivino_import

# RFC 1918 vectors are built at runtime so the repo's private-ipv4 leak scan stays strict.
LAN_A = ".".join(("192", "168", "0", "10"))
LAN_B = ".".join(("10", "0", "0", "1"))
LAN_C = ".".join(("192", "168", "0", "5"))

FIX = Path(__file__).parent / "fixtures"
EAN = "8006220001669"
BASE = {"color": "white", "wineType": "still", "quantity": 1}
OFF = json.loads((FIX / "off_mionetto_8006220001669.json").read_text())


def _jpeg(size=(40, 60)) -> bytes:
    from PIL import Image

    buf = io.BytesIO()
    Image.new("RGB", size, (200, 180, 90)).save(buf, "JPEG")
    return buf.getvalue()


# ---------------------------------------------------------------- EAN / heuristics


def test_gtin_check_digit():
    assert gtin_valid(EAN)
    assert not gtin_valid("8006220001668")
    assert gtin_valid("96385074")  # EAN-8
    assert normalize_ean(" 800-6220 001669 ") == EAN
    assert normalize_ean("abc") is None and normalize_ean(True) is None


def test_infer_from_label_text():
    got = lk.infer_from_text("Mionetto Prosecco DOC Treviso Brut 11 % vol 750 ml")
    assert got == {
        "sweetness": "Brut",
        "wineType": "sparkling",
        "country": "Itálie",
        "grapeVarieties": ["Glera"],
        "color": "white",
        "region": "Veneto",
        "alcoholPct": 11.0,
        "volumeMl": 750,
    }
    assert lk.infer_from_text("Ryzlink rýnský 2021 pozdní sběr, polosuché 0,75 l") == {
        "sweetness": "polosuché",
        "vintage": 2021,
        "volumeMl": 750,
    }


def test_sanitize_drops_unknown_and_invalid():
    out = lk.sanitize_fields(
        {
            "name": "  <b>Brut</b>  ",
            "color": "purple",
            "vintage": "2019",
            "alcoholPct": "11,5 %",
            "volumeMl": 99999,
            "ean": "123",
            "quantity": 50,
            "grapeVarieties": "Glera, Chardonnay",
        }
    )
    assert out == {
        "name": "<b>Brut</b>",
        "vintage": 2019,
        "alcoholPct": 11.5,
        "grapeVarieties": ["Glera", "Chardonnay"],
    }


def test_vivino_search_link():
    url = lk.vivino_search_url({"producer": "Mionetto", "name": "Prosecco DOC Treviso"})
    assert url == "https://www.vivino.com/search/wines?q=Mionetto%20Prosecco%20DOC%20Treviso"


# ---------------------------------------------------------------- SSRF guard


@pytest.mark.parametrize(
    "url",
    [
        "http://example.com/x",
        "https://localhost/x",
        "https://homeassistant.local/x",
        f"https://{LAN_A}/x",
        f"https://{LAN_B}/",
        "https://127.0.0.1/",
        "https://[::1]/",
        "https://169.254.169.254/latest/meta-data",
        "https://100.64.0.1/",
        "https://example.com:8123/",
        "https://user:pw@example.com/",
        "https://intranet/",
        "file:///etc/passwd",
    ],
)
def test_check_public_url_rejects(url):
    with pytest.raises(WineError) as err:
        sf.check_public_url(url)
    assert err.value.code == "LOOKUP_URL_NOT_ALLOWED"


def test_check_public_url_accepts_public():
    assert sf.check_public_url("https://Mionetto.com/en/wines/x?a=1#f") == (
        "https://mionetto.com/en/wines/x?a=1"
    )
    assert sf.check_public_url("https://8.8.8.8/") == "https://8.8.8.8/"


async def test_public_resolver_drops_private_answers():
    class Inner:
        def __init__(self, hosts):
            self.hosts = hosts

        async def resolve(self, host, port, family):
            return [{"host": h, "port": port} for h in self.hosts]

        async def close(self):
            return None

    mixed = sf.PublicResolver(Inner([LAN_C, "93.184.215.14"]))
    assert [i["host"] for i in await mixed.resolve("x.example", 443)] == ["93.184.215.14"]
    rebinding = sf.PublicResolver(Inner(["127.0.0.1", f"::ffff:{LAN_B}"]))
    with pytest.raises(OSError):
        await rebinding.resolve("evil.example", 443)


class _Resp:
    def __init__(self, status=200, body=b"", headers=None):
        self.status = status
        self.headers = headers or {}
        self._body = body
        self.content = self

    async def iter_chunked(self, n):
        for i in range(0, len(self._body), n):
            yield self._body[i : i + n]

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False


class _Session:
    def __init__(self, routes):
        self.routes = routes
        self.calls: list[str] = []

    def get(self, url, **kwargs):
        assert kwargs["allow_redirects"] is False and kwargs["timeout"].total == sf.TIMEOUT_S
        self.calls.append(url)
        return self.routes[url]()


async def test_safe_fetch_redirect_types_and_size():
    ok = {"Content-Type": "application/json; charset=utf-8"}
    session = _Session(
        {
            "https://a.example/p": lambda: _Resp(302, headers={"Location": "/q"}),
            "https://a.example/q": lambda: _Resp(200, b'{"x":1}', ok),
            "https://a.example/evil": lambda: _Resp(
                301, headers={"Location": f"https://{LAN_A}:8123/api"}
            ),
            "https://a.example/html": lambda: _Resp(200, b"<html>", {"Content-Type": "text/html"}),
            "https://a.example/big": lambda: _Resp(200, b"x" * (sf.LIMITS["json"] + 10), ok),
        }
    )
    fetch = sf.SafeFetcher(session)
    body, final, ctype = await fetch.get("https://a.example/p", "json")
    assert (body, final, ctype) == (b'{"x":1}', "https://a.example/q", "application/json")
    for url, code in (
        ("https://a.example/evil", "LOOKUP_URL_NOT_ALLOWED"),
        ("https://a.example/html", "LOOKUP_CONTENT_TYPE"),
        ("https://a.example/big", "LOOKUP_RESPONSE_TOO_LARGE"),
    ):
        with pytest.raises(WineError) as err:
            await fetch.get(url, "json")
        assert err.value.code == code
    assert f"https://{LAN_A}:8123/api" not in session.calls


# ---------------------------------------------------------------- providers


def test_open_food_facts_mapping_mionetto():
    prop = lk.OpenFoodFactsProvider().map_product(EAN, OFF["product"])
    assert prop["fields"] == {
        "name": "Prosecco DOC Treviso",
        "producer": "Mionetto",
        "ean": EAN,
        "volumeMl": 750,
        "country": "Itálie",
        "wineType": "sparkling",
        "region": "Veneto",
        "grapeVarieties": ["Glera"],
        "color": "white",
    }
    assert set(prop["inferred"]) == {"region", "grapeVarieties", "color"}
    assert prop["imageUrl"].startswith("https://images.openfoodfacts.org/")
    assert prop["imageLicense"] == "review" and prop["confidence"] == "matched"


def test_web_page_json_ld_and_og():
    page = """<html><head><title>Shop</title>
    <meta property="og:site_name" content="Vinotéka Synthetic">
    <meta property="og:image" content="/img/bottle.jpg">
    <script type="application/ld+json">{"@context":"https://schema.org","@graph":[
      {"@type":"Product","name":"Prosecco DOC Treviso Brut","brand":{"name":"Mionetto"},
       "gtin13":"8006220001669","offers":{"price":"239.00"},
       "description":"Šumivé víno, 11 % vol, 750 ml."}]}</script></head>
    <body>© 2019 Synthetic 50 % sleva</body></html>"""
    got = lk.parse_web_page(page, "https://shop.example/p/1")
    assert got is not None
    fields = lk.sanitize_fields(got["fields"])
    assert fields["producer"] == "Mionetto" and fields["ean"] == EAN
    assert fields["purchasePrice"] == 239.0 and fields["sweetness"] == "Brut"
    assert fields["alcoholPct"] == 11.0 and "vintage" not in fields  # page chrome ignored
    assert got["imageUrl"] == "https://shop.example/img/bottle.jpg"


def test_build_query_variants():
    assert lk.build_query({"query": EAN}).ean == EAN  # typed EAN in the search box
    with pytest.raises(WineError, match="LOOKUP_EAN_INVALID"):
        lk.build_query({"ean": "8006220001668"})
    with pytest.raises(WineError, match="LOOKUP_EMPTY"):
        lk.build_query({"query": "  "})
    with pytest.raises(WineError, match="LOOKUP_URL_NOT_ALLOWED"):
        lk.build_query({"url": f"https://{LAN_A}/"})
    q = lk.build_query({"photo": "data:image/jpeg;base64," + base64.b64encode(_jpeg()).decode()})
    assert q.photo_type == "image/jpeg" and q.kinds == {"photo"}
    with pytest.raises(WineError, match="LOOKUP_PHOTO_INVALID"):
        lk.build_query({"photo": base64.b64encode(b"GIF89a....").decode()})
    existing = {"name": "Prosecco", "producer": "Mionetto", "vintage": None, "ean": EAN}
    assert lk.build_query({}, existing).ean == EAN


# ---------------------------------------------------------------- Vivino export

VIVINO_CSV = (
    "Winery,Wine name,Vintage,Region,Country,Regional wine style,Average rating,"
    "Scan date,Scan/Review Location,Your rating,Your review,Personal Note,Label image\n"
    "Mionetto,Prosecco DOC Treviso Brut,,Prosecco,Italy,Italian Prosecco,3.6,"
    "2026-08-01,,4.5,Svěží na terasu,Koupeno v Albertu,\n"
    "Synthetic Winery,Ryzlink rýnský,2021,Morava,Czechia,,3.9,2026-07-01,,4,,,\n"
    "Nobody,Unknown Wine,2015,,,,,2026-01-01,,3,,,\n"
)


def test_vivino_parse_and_plan(tmp_path):
    rows = parse_export(VIVINO_CSV)
    assert [r["rating"] for r in rows] == [4.5, 4.0, 3.0]
    assert rows[0]["note"] == "Svěží na terasu\n\nKoupeno v Albertu"
    store = WineStore(tmp_path / "w.db").open()
    try:
        mio = store.create(
            {"name": "Prosecco DOC Treviso Brut", "producer": "Mionetto", **BASE}, "op-viv-0001"
        )["wine"]
        ryz = store.create(
            {
                "name": "Ryzlink rýnský",
                "producer": "Synthetic Winery",
                "vintage": 2020,
                **BASE,
            },
            "op-viv-0002",
        )["wine"]
        dry = run_vivino_import(store, VIVINO_CSV, True, None)
        plan = {p["row"]: p for p in dry["plan"]}
        assert plan[1]["match"] == "exact" and plan[1]["selected"]
        assert plan[2]["match"] == "fuzzy" and not plan[2]["selected"]  # vintage differs
        assert plan[2]["wineId"] == ryz["id"]
        assert plan[3]["match"] == "none"
        assert store.get(mio["id"])["personalRating"] is None  # dry run writes nothing
        # Only confirmed rows are applied; a wine the plan did not offer is ignored.
        done = run_vivino_import(
            store,
            VIVINO_CSV,
            False,
            [{"row": 1, "wineId": mio["id"]}, {"row": 3, "wineId": ryz["id"]}],
        )
        assert done["applied"] == 1
        assert store.get(mio["id"])["personalRating"] == 4.5
        assert "Koupeno v Albertu" in store.get(mio["id"])["personalNote"]
        assert store.get(ryz["id"])["personalRating"] is None
    finally:
        store.close()


def test_vivino_unrecognised():
    with pytest.raises(WineError, match="IMPORT_VIVINO_UNRECOGNISED"):
        parse_export("foo,bar\n1,2\n")


# ---------------------------------------------------------------- WS + ai_task


@pytest.fixture
async def ws(hass: HomeAssistant, hass_ws_client, tmp_path):
    hass.config.config_dir = str(tmp_path)
    with patch.object(wsmod, "wine_db_path", return_value=tmp_path / "homebrain" / "wine.db"):
        assert await async_setup_component(hass, DOMAIN, {})
        client = await hass_ws_client(hass)
        yield client
        await wsmod.async_close_store(hass)


async def _call(client, **msg):
    await client.send_json_auto_id(msg)
    return await client.receive_json()


class _FakeWeb:
    def __init__(self):
        self.calls: list[str] = []

    async def get(self, url, kind="page"):
        self.calls.append(url)
        sf.check_public_url(url)  # same guard as the real SafeFetcher
        if url.startswith(f"https://world.openfoodfacts.org/api/v2/product/{EAN}.json"):
            return json.dumps(OFF).encode(), url, "application/json"
        if url.startswith("https://world.openfoodfacts.org/api/v2/product/"):
            return b'{"status":0}', url, "application/json"
        if kind == "image":
            return _jpeg(), url, "image/jpeg"
        raise WineError("LOOKUP_NOT_FOUND")


async def test_ws_ean_lookup_create_and_dedupe(hass, ws):
    web = _FakeWeb()
    with patch.object(wsmod, "_web", return_value=web):
        info = await _call(ws, type="homebrain/wine/lookup_providers")
        ai = next(p for p in info["result"]["providers"] if p["id"] == "ai_task")
        assert ai == {**ai, "available": False, "hint": "ai_task_missing"}

        res = await _call(ws, type="homebrain/wine/lookup", ean=EAN)
        assert res["success"], res
        prop = res["result"]["proposals"][0]
        assert prop["provider"] == "openfoodfacts" and prop["fields"]["producer"] == "Mionetto"
        assert "vivino.com/search/wines?q=Mionetto" in prop["vivinoUrl"]
        statuses = {s["id"]: s["status"] for s in res["result"]["providers"]}
        assert statuses["openfoodfacts"] == "ok" and statuses["ai_task"] == "unavailable"
        assert "znovin" not in statuses  # an EAN never goes to the Znovín sitemap

        wine = {
            **prop["fields"],
            "sweetness": "Brut",
            "alcoholPct": 11,
            "quantity": 2,
            "source": {
                "provider": "catalog-provider",
                "catalog": "openfoodfacts",
                "sourceUrl": prop["sourceUrl"],
            },
            "confidence": "matched",
        }
        created = await _call(
            ws, type="homebrain/wine/create", wine=wine, source_operation_id="ws-add-mionetto"
        )
        assert created["success"], created
        wine_id = created["result"]["wine"]["id"]
        assert created["result"]["wine"]["ean"] == EAN
        assert created["result"]["wine"]["source"]["catalog"] == "openfoodfacts"

        img = await _call(
            ws, type="homebrain/wine/set_image", wine_id=wine_id, image_url=prop["imageUrl"]
        )
        assert img["success"], img
        image = img["result"]["wine"]["image"]
        assert image["licenseStatus"] == "approved" and "authSig=" in image["url"]
        assert image["sourceUrl"] == prop["imageUrl"]
        assert (Path(hass.config.config_dir) / image["localPath"]).exists()

        # Second scan of the same bottle: the cellar answers first, no network call.
        web.calls.clear()
        again = await _call(ws, type="homebrain/wine/lookup", ean=EAN)
        first = again["result"]["proposals"][0]
        assert first["provider"] == "local" and first["existing"]["wineId"] == wine_id
        assert first["existing"]["quantity"] == 2 and web.calls == []
        found = await _call(ws, type="homebrain/wine/search", query=EAN)
        assert [w["id"] for w in found["result"]["wines"]] == [wine_id]

        own = base64.b64encode(_jpeg((80, 120))).decode()
        mine = await _call(ws, type="homebrain/wine/set_image", wine_id=wine_id, photo=own)
        assert mine["result"]["wine"]["image"]["sourceUrl"] is None
        bad = await _call(
            ws,
            type="homebrain/wine/set_image",
            wine_id=wine_id,
            image_url=f"https://{LAN_A}/x.jpg",
        )
        assert not bad["success"]


async def test_ws_ai_task_photo_proposal(hass, ws):
    hass.config.components.add("ai_task")
    hass.states.async_set("ai_task.synthetic", "unknown", {"supported_features": 3})
    seen: dict = {}
    calls: list = []

    async def generate(call):
        # Like ai_task without a preferred entity: HomeBrain must not read ai_task's private
        # preferences (#27) and falls back to an explicit attachment-capable entity.
        calls.append(call.data.get("entity_id"))
        if "entity_id" not in call.data:
            raise HomeAssistantError("No entity_id provided and no preferred entity set")
        seen.update(call.data)
        item = call.data["attachments"][0]["media_content_id"]
        token = item.rsplit("/", 1)[-1]
        from homeassistant.components.media_source import MediaSourceItem

        from custom_components.homebrain.media_source import LabelPhotoSource

        media = await LabelPhotoSource(hass).async_resolve_media(
            MediaSourceItem(hass, DOMAIN, f"label/{token}", None)
        )
        seen["path"] = str(media.path)
        seen["path_exists"] = await hass.async_add_executor_job(Path(seen["path"]).exists)
        return {
            "conversation_id": "x",
            "data": {
                "producer": "Mionetto",
                "name": "Prosecco DOC Treviso Brut",
                "wine_type": "sparkling",
                "color": "white",
                "alcohol_pct": 11,
                "volume_ml": 750,
                "grape_varieties": "Glera",
                "sweetness": "Brut",
                "country": "Itálie",
                "region": "Veneto",
                "ean": EAN,
                "price": 9999,
            },
        }

    hass.services.async_register(
        "ai_task", "generate_data", generate, supports_response=SupportsResponse.ONLY
    )
    info = await _call(ws, type="homebrain/wine/lookup_providers")
    ai = next(p for p in info["result"]["providers"] if p["id"] == "ai_task")
    assert ai["available"] and ai["photo"]

    photo = "data:image/jpeg;base64," + base64.b64encode(_jpeg()).decode()
    with patch.object(wsmod, "_web", return_value=_FakeWeb()):
        res = await _call(ws, type="homebrain/wine/lookup", photo=photo)
    assert res["success"], res
    by = {p["provider"]: p for p in res["result"]["proposals"]}
    assert by["ai_task"]["fields"] == {
        "producer": "Mionetto",
        "name": "Prosecco DOC Treviso Brut",
        "country": "Itálie",
        "region": "Veneto",
        "sweetness": "Brut",
        "color": "white",
        "wineType": "sparkling",
        "grapeVarieties": ["Glera"],
        "alcoholPct": 11.0,
        "volumeMl": 750,
        "ean": EAN,
    }
    assert by["ai_task"]["confidence"] == "inferred"
    assert "openfoodfacts" in by  # barcode read by the AI → exact OFF lookup
    assert seen["entity_id"] == "ai_task.synthetic" and seen["structure"]["producer"]
    assert calls == [None, "ai_task.synthetic"]
    gone = not await hass.async_add_executor_job(Path(seen["path"]).exists)
    assert seen["path_exists"] and gone  # temp photo removed right after the AI call


async def test_ws_ai_task_without_attachment_support(hass, ws):
    hass.config.components.add("ai_task")
    hass.states.async_set("ai_task.textonly", "unknown", {"supported_features": 1})
    info = await _call(ws, type="homebrain/wine/lookup_providers")
    ai = next(p for p in info["result"]["providers"] if p["id"] == "ai_task")
    assert ai["available"] and not ai["photo"] and ai["hint"] == "no_attachments"
    photo = base64.b64encode(_jpeg()).decode()
    res = await _call(ws, type="homebrain/wine/lookup", photo=photo)
    status = {s["id"]: s for s in res["result"]["providers"]}["ai_task"]
    assert status["status"] == "error" and status["code"] == "LOOKUP_AI_NO_ATTACHMENTS"


async def test_ws_lookup_and_vivino_admin_only(
    hass, ws, hass_ws_client, hass_read_only_access_token
):
    ro = await hass_ws_client(hass, hass_read_only_access_token)
    for msg in (
        {"type": "homebrain/wine/lookup", "ean": EAN},
        {"type": "homebrain/wine/lookup_providers"},
        {"type": "homebrain/wine/import_vivino", "content": VIVINO_CSV},
        {"type": "homebrain/wine/set_image", "wine_id": "x", "photo": "AA=="},
    ):
        res = await _call(ro, **msg)
        assert not res["success"] and res["error"]["code"] == "unauthorized"


async def test_ws_vivino_dry_run(ws):
    await _call(
        ws,
        type="homebrain/wine/create",
        wine={"name": "Prosecco DOC Treviso Brut", "producer": "Mionetto", **BASE},
        source_operation_id="ws-viv-0001",
    )
    res = await _call(ws, type="homebrain/wine/import_vivino", content=VIVINO_CSV)
    assert res["success"], res
    assert res["result"]["summary"] == {"exact": 1, "none": 2}


async def test_ai_task_uses_the_preferred_entity_via_public_service(hass, ws):
    """No private ``ai_task`` const: the service call omits entity_id when it can (#27)."""
    hass.config.components.add("ai_task")
    hass.states.async_set("ai_task.synthetic", "unknown", {"supported_features": 3})
    calls: list = []

    async def generate(call):
        calls.append(call.data.get("entity_id"))
        return {"conversation_id": "x", "data": {"producer": "Synthetic", "name": "Test"}}

    hass.services.async_register(
        "ai_task", "generate_data", generate, supports_response=SupportsResponse.ONLY
    )
    with patch.object(wsmod, "_web", return_value=_FakeWeb()):
        photo = "data:image/jpeg;base64," + base64.b64encode(_jpeg()).decode()
        res = await _call(ws, type="homebrain/wine/lookup", photo=photo, providers=["ai_task"])
    assert res["success"], res
    assert calls == [None]
