"""Wine store, WS API, validation, idempotency and import (synthetic data only)."""

import json
import sqlite3
from unittest.mock import patch

import pytest
from homeassistant.core import HomeAssistant
from homeassistant.setup import async_setup_component

from custom_components.homebrain.const import DOMAIN
from custom_components.homebrain.wine import domain as d
from custom_components.homebrain.wine.importer import run_import
from custom_components.homebrain.wine.store import (
    CURRENT_SCHEMA_VERSION,
    MIGRATION_V1_SQL,
    WineStore,
    migrate,
    schema_version,
)

SYNTH = {
    "name": "Synthetic Ryzlink",
    "producer": "Vinařství Synthetic A",
    "vintage": 2021,
    "wineType": "still",
    "color": "white",
    "grapeVarieties": ["Ryzlink rýnský"],
    "volumeMl": 750,
    "location": {"zone": "Zóna A", "shelf": "2"},
    "quantity": 3,
}


@pytest.fixture
def store(tmp_path):
    s = WineStore(tmp_path / "wine.db").open()
    yield s
    s.close()


def _create(store, op="op-create-0001", **over):
    return store.create({**SYNTH, **over}, op)["wine"]


@pytest.mark.parametrize(
    ("args", "code"),
    [
        ((1, 3, 0, False), d.INVALID_QUANTITY),
        ((1, 3, 1.5, False), d.INVALID_QUANTITY),
        ((0, 3, 1, False), d.TARGET_NOT_FOUND),
        ((2, 3, 1, False), d.TARGET_AMBIGUOUS),
        ((1, -1, 1, False), d.INVALID_QUANTITY),
        ((1, 0, 1, False), d.ZERO_STOCK),
        ((1, 2, 3, True), d.INVALID_QUANTITY),
        ((1, 1, 1, False), d.CONFIRMATION_REQUIRED),
        ((1, 5, 2, False), d.CONFIRMATION_REQUIRED),
    ],
)
def test_evaluate_consume_codes(args, code):
    with pytest.raises(d.WineError) as err:
        d.evaluate_consume(*args)
    assert err.value.code == code


def test_evaluate_consume_ok_and_rating():
    d.evaluate_consume(1, 5, 1, False)
    d.evaluate_consume(1, 1, 1, True)
    with pytest.raises(d.WineError, match=d.RATING_OUT_OF_RANGE):
        d.evaluate_rating(5.5)


def test_migration_v1_to_current_preserves_data(tmp_path):
    path = tmp_path / "old.db"
    conn = sqlite3.connect(path, isolation_level=None)
    conn.executescript(
        "BEGIN;" + MIGRATION_V1_SQL + "INSERT INTO schema_migrations VALUES (1, 'x');"
        "INSERT INTO wines (id,name,producer,vintage,wine_type,color,grape_varieties_json,"
        "volume_ml,quantity,status,source_json,confidence,created_at,updated_at) VALUES "
        "('w1','Synthetic','P',2020,'still','red','[]',750,2,'in_stock','{\"provider\":\"local\"}',"
        "'manual','t','t');COMMIT;"
    )
    conn.close()
    s = WineStore(path).open()
    assert schema_version(s.conn) == CURRENT_SCHEMA_VERSION
    assert s.get("w1")["quantity"] == 2 and s.get("w1")["drinkWindow"] is None
    s.close()
    again = WineStore(path).open()  # idempotent re-open
    assert schema_version(again.conn) == CURRENT_SCHEMA_VERSION
    again.close()


def test_forward_compatible_one_version(tmp_path, store):
    _create(store)
    store.conn.execute("ALTER TABLE wines ADD COLUMN future_col TEXT NULL")
    store.conn.execute(
        "INSERT INTO schema_migrations VALUES (?, 'future')", (CURRENT_SCHEMA_VERSION + 1,)
    )
    assert migrate(store.conn) == CURRENT_SCHEMA_VERSION + 1
    assert store.list()[0]["name"] == "Synthetic Ryzlink"
    store.conn.execute(
        "INSERT INTO schema_migrations VALUES (?, 'future')", (CURRENT_SCHEMA_VERSION + 2,)
    )
    with pytest.raises(d.WineError, match=d.SCHEMA_TOO_NEW):
        migrate(store.conn)


def test_quantity_never_negative(store):
    with pytest.raises(d.WineError, match=d.INVALID_QUANTITY):
        store.create({**SYNTH, "quantity": -1}, "op-neg-00001")
    wine = _create(store)
    with pytest.raises(d.WineError, match=d.INVALID_QUANTITY):
        store.correct(wine["id"], -2, "Inventura", "op-corr-neg1")
    with pytest.raises(sqlite3.IntegrityError):
        store.conn.execute("UPDATE wines SET quantity = -1")
    with pytest.raises(d.WineError, match="quantity"):
        store.update(wine["id"], {"quantity": 10})


def test_consume_events_and_idempotency(store):
    wine = _create(store)
    first = store.consume(wine["id"], 1, False, "op-consume-01", actor={"type": "user"})
    assert first["wine"]["quantity"] == 2 and not first["replayed"]
    assert first["event"]["operation"] == "consume" and first["event"]["quantityDelta"] == -1
    replay = store.consume(wine["id"], 1, False, "op-consume-01")
    assert replay["replayed"] and replay["event"]["eventId"] == first["event"]["eventId"]
    assert store.get(wine["id"])["quantity"] == 2
    with pytest.raises(d.WineError, match=d.IDEMPOTENT_REPLAY):
        store.consume(wine["id"], 2, True, "op-consume-01")
    with pytest.raises(d.WineError, match=d.CONFIRMATION_REQUIRED):
        store.consume(wine["id"], 2, False, "op-consume-02")
    store.consume(wine["id"], 2, True, "op-consume-03")
    assert store.get(wine["id"])["status"] == "consumed"
    with pytest.raises(d.WineError, match=d.ZERO_STOCK):
        store.consume(wine["id"], 1, True, "op-consume-04")
    with pytest.raises(d.WineError, match=d.TARGET_NOT_FOUND):
        store.consume("missing", 1, True, "op-consume-05")
    ops = [e["operation"] for e in store.events(wine["id"])]
    assert ops == ["consume", "consume", "stock_in"]


def test_events_append_only(store):
    wine = _create(store)
    with pytest.raises(sqlite3.IntegrityError, match="append-only"):
        store.conn.execute("UPDATE inventory_events SET quantity_delta = 99")
    with pytest.raises(sqlite3.IntegrityError, match="append-only"):
        store.conn.execute("DELETE FROM inventory_events")
    assert len(store.events(wine["id"])) == 1


def test_correction_audit(store):
    wine = _create(store)
    result = store.correct(wine["id"], 7, "Inventura", "op-correct-1")
    assert result["event"]["quantityDelta"] == 4 and result["wine"]["quantity"] == 7
    with pytest.raises(d.WineError, match=d.NO_CHANGE):
        store.correct(wine["id"], 7, "Inventura", "op-correct-2")
    with pytest.raises(d.WineError, match="reason"):
        store.correct(wine["id"], 5, " ", "op-correct-3")


def test_validation_rejects_bad_fields(store):
    for bad in (
        {"color": "blue"},
        {"personalRating": 6},
        {"vintage": "2020"},
        {"location": {"shelf": "1"}},
        {"drinkWindow": {"from": 2030, "to": 2025}},
        {"unknownField": 1},
    ):
        with pytest.raises(d.WineError):
            store.create({**SYNTH, **bad}, "op-bad-000001")
    assert store.list() == []


def test_list_filters_and_sort(store):
    _create(store, "op-a-0000001", name="Synthetic Ábel", personalRating=4.0)
    _create(
        store,
        "op-b-0000001",
        name="Synthetic Býk",
        color="red",
        vintage=2018,
        personalRating=5.0,
        location={"zone": "Zóna B"},
    )
    assert [w["name"] for w in store.list({"search": "synthetic abel"})] == ["Synthetic Ábel"]
    assert [w["color"] for w in store.list({"colors": ["red"]})] == ["red"]
    assert [w["name"] for w in store.list({"sort": "rating"})][0] == "Synthetic Býk"
    assert len(store.list({"zones": ["Zóna B"], "vintageTo": 2019})) == 1
    assert store.list({"ratingMin": 4.5, "colors": ["white"]}) == []


CSV = (
    "nazev;vyrobce;rocnik;barva;odruda;mnozstvi;zona;hodnoceni\n"
    "Synthetic Veltlín;Vinařství Synthetic B;2022;bílé;Veltlínské zelené;4;Zóna A;4,5\n"
    "Synthetic Frankovka;Vinařství Synthetic C;2019;červené;Frankovka;2;Zóna B;\n"
    "Bad Row;;2020;modré;;1;;\n"
)


def test_import_dry_run_then_apply_idempotent(store):
    plan = run_import(store, CSV, "csv", True, {"type": "import"})
    assert plan["dryRun"] and plan["summary"] == {"create": 2}
    assert plan["errors"][0]["row"] == 3 and store.list() == []
    applied = run_import(store, CSV, "csv", False, {"type": "import"})
    assert applied["summary"] == {"create": 2}
    assert sorted(w["quantity"] for w in store.list()) == [2, 4]
    again = run_import(store, CSV, "csv", False, None)
    assert again["summary"] == {"already_imported": 2}
    payload = json.dumps(
        {
            "wines": [
                {
                    **SYNTH,
                    "name": "Synthetic Veltlín",
                    "producer": "Vinařství Synthetic B",
                    "vintage": 2022,
                    "quantity": 1,
                    "id": "ignored",
                }
            ]
        }
    )
    restock = run_import(store, payload, "json", False, None)
    assert restock["summary"] == {"stock_in": 1}
    with pytest.raises(d.WineError, match="IMPORT_PARSE_ERROR"):
        run_import(store, "{nope", "json", True, None)


# ---------------- WebSocket ----------------


@pytest.fixture
async def ws(hass: HomeAssistant, hass_ws_client, tmp_path):
    with patch(
        "custom_components.homebrain.wine.websocket.wine_db_path",
        return_value=tmp_path / "homebrain" / "wine.db",
    ):
        assert await async_setup_component(hass, DOMAIN, {})
        client = await hass_ws_client(hass)
        yield client
        from custom_components.homebrain.wine.websocket import async_close_store

        await async_close_store(hass)


async def _call(client, **msg):
    await client.send_json_auto_id(msg)
    return await client.receive_json()


async def test_ws_flow(ws):
    created = await _call(
        ws, type="homebrain/wine/create", wine=SYNTH, source_operation_id="ws-create-01"
    )
    assert created["success"], created
    wine_id = created["result"]["wine"]["id"]
    listed = await _call(ws, type="homebrain/wine/search", query="ryzlink")
    assert [w["id"] for w in listed["result"]["wines"]] == [wine_id]
    need = await _call(
        ws,
        type="homebrain/wine/consume",
        wine_id=wine_id,
        quantity=2,
        source_operation_id="ws-consume-01",
    )
    assert need["error"]["code"] == "CONFIRMATION_REQUIRED"
    ok = await _call(
        ws,
        type="homebrain/wine/consume",
        wine_id=wine_id,
        quantity=2,
        confirmed=True,
        source_operation_id="ws-consume-02",
    )
    assert ok["result"]["wine"]["quantity"] == 1
    replay = await _call(
        ws,
        type="homebrain/wine/consume",
        wine_id=wine_id,
        quantity=2,
        confirmed=True,
        source_operation_id="ws-consume-02",
    )
    assert replay["result"]["replayed"] is True
    bad = await _call(
        ws,
        type="homebrain/wine/correct",
        wine_id=wine_id,
        quantity=-1,
        reason="x",
        source_operation_id="ws-correct-01",
    )
    assert bad["error"]["code"] == "INVALID_QUANTITY"
    fix = await _call(
        ws,
        type="homebrain/wine/correct",
        wine_id=wine_id,
        quantity=6,
        reason="Inventura",
        source_operation_id="ws-correct-02",
    )
    assert fix["result"]["event"]["quantityDelta"] == 5
    upd = await _call(
        ws,
        type="homebrain/wine/update",
        wine_id=wine_id,
        changes={"personalRating": 4.5, "personalNote": "Synthetic note"},
    )
    assert upd["result"]["wine"]["personalRating"] == 4.5
    got = await _call(ws, type="homebrain/wine/get", wine_id=wine_id)
    assert [e["operation"] for e in got["result"]["events"]] == [
        "correction",
        "consume",
        "stock_in",
    ]
    assert got["result"]["events"][0]["actor"]["type"] == "user"
    events = await _call(ws, type="homebrain/wine/events", limit=10)
    assert len(events["result"]["events"]) == 3
    dry = await _call(ws, type="homebrain/wine/import", format="csv", content=CSV)
    assert dry["result"]["dryRun"] is True and dry["result"]["summary"] == {"create": 2}
    missing = await _call(ws, type="homebrain/wine/get", wine_id="nope")
    assert missing["error"]["code"] == "TARGET_NOT_FOUND"


async def test_ws_non_admin_cannot_write(hass, ws, hass_ws_client, hass_read_only_access_token):
    created = await _call(
        ws, type="homebrain/wine/create", wine=SYNTH, source_operation_id="ws-create-02"
    )
    wine_id = created["result"]["wine"]["id"]
    child = await hass_ws_client(hass, access_token=hass_read_only_access_token)
    # Wine is not part of the kiosk panel: non-admins cannot even read it.
    read = await _call(child, type="homebrain/wine/list")
    assert read["error"]["code"] == "unauthorized"
    for msg in (
        {
            "type": "homebrain/wine/consume",
            "wine_id": wine_id,
            "quantity": 1,
            "source_operation_id": "child-consume-1",
        },
        {"type": "homebrain/wine/import", "format": "csv", "content": CSV},
        {"type": "homebrain/wine/update", "wine_id": wine_id, "changes": {"name": "x"}},
    ):
        res = await _call(child, **msg)
        assert res["error"]["code"] == "unauthorized"
    after = await _call(ws, type="homebrain/wine/get", wine_id=wine_id)
    assert after["result"]["wine"]["quantity"] == 3


async def test_ws_write_results_keep_signed_photo_url(ws):
    """Rating a wine must not drop its photo: every write result carries the signed URL."""
    photo = {"localPath": "homebrain/media/wine/synthetic.webp", "licenseStatus": "approved"}

    def signed(res):
        assert res["success"], res
        url = res["result"]["wine"]["image"]["url"]
        assert url.startswith("/api/homebrain/wine/image/") and "authSig=" in url
        return res["result"]["wine"]

    created = signed(
        await _call(
            ws,
            type="homebrain/wine/create",
            wine={**SYNTH, "image": photo},
            source_operation_id="ws-photo-create",
        )
    )
    wine_id = created["id"]
    rated = signed(
        await _call(
            ws, type="homebrain/wine/update", wine_id=wine_id, changes={"personalRating": 4}
        )
    )
    assert rated["personalRating"] == 4
    assert rated["image"]["localPath"] == photo["localPath"]
    signed(
        await _call(
            ws, type="homebrain/wine/update", wine_id=wine_id, changes={"purchasePrice": 199}
        )
    )
    consume = {
        "type": "homebrain/wine/consume",
        "wine_id": wine_id,
        "quantity": 1,
        "source_operation_id": "ws-photo-consume",
    }
    assert signed(await _call(ws, **consume))["quantity"] == 2
    # Idempotent replay returns the stored snapshot – signed as well.
    replay = await _call(ws, **consume)
    assert replay["result"]["replayed"] and signed(replay)["quantity"] == 2
    corrected = await _call(
        ws,
        type="homebrain/wine/correct",
        wine_id=wine_id,
        quantity=5,
        reason="Inventura",
        source_operation_id="ws-photo-correct",
    )
    assert signed(corrected)["quantity"] == 5
    # Wines without a local photo stay untouched (no image, no URL).
    plain = await _call(
        ws, type="homebrain/wine/create", wine=SYNTH, source_operation_id="ws-plain-create"
    )
    plain_rated = await _call(
        ws,
        type="homebrain/wine/update",
        wine_id=plain["result"]["wine"]["id"],
        changes={"personalRating": 3},
    )
    assert plain_rated["success"] and plain_rated["result"]["wine"]["image"] is None
