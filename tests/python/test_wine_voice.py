"""Wine voice write-off: normalization, fuzzy match, pending, WS (synthetic data only)."""

from __future__ import annotations

from unittest.mock import patch

import pytest
from homeassistant.core import HomeAssistant
from homeassistant.setup import async_setup_component

from custom_components.homebrain.const import DOMAIN
from custom_components.homebrain.wine import voice as voice_mod
from custom_components.homebrain.wine.store import WineStore

BASE = {
    "producer": "Vinařství Synthetic Z",
    "wineType": "still",
    "color": "white",
    "grapeVarieties": ["Rulandské šedé"],
    "volumeMl": 750,
    "location": {"zone": "Zóna A"},
}


def _stock(store: WineStore, op: str, **fields):
    wine = {
        **BASE,
        "name": "Rulandské šedé",
        "quantity": 2,
        **fields,
    }
    return store.create(wine, op)["wine"]


@pytest.fixture
def store(tmp_path):
    s = WineStore(tmp_path / "wine.db").open()
    yield s
    s.close()


def test_normalize_and_parse():
    parsed = voice_mod.parse_voice_text("Vypil jsem prosím jednu láhev Rulandské šedé 2025")
    assert parsed.query == "rulandske sede"
    assert parsed.vintage == 2025
    assert parsed.quantity == 1

    parsed2 = voice_mod.parse_voice_text("Odepiš dvě láhve rulandske sede ročník 21")
    assert parsed2.vintage == 2021
    assert parsed2.quantity == 2
    assert "rulandske" in parsed2.query


def test_unique_match_and_consume(store):
    w = _stock(store, "op-v-001", vintage=2025, labelName="Pinot gris Cryo")
    result = voice_mod.apply_voice_consume(
        store, "vypil jsem rulandske sede 2025", "voice-op-unique01"
    )
    assert result["status"] == "consumed"
    assert result["wine"]["id"] == w["id"]
    assert result["wine"]["quantity"] == 1
    assert result["lastBottle"] is False

    events = store.events(w["id"])
    assert events[0]["operation"] == "consume"
    assert events[0]["actor"]["type"] == "assist"
    assert events[0]["actor"]["source"] == "voice"


def test_ambiguous_two_pinots(store):
    a = _stock(store, "op-v-a001", vintage=2024, labelName="Etiketa A")
    _stock(store, "op-v-b001", vintage=2025, labelName="Etiketa B")
    result = voice_mod.apply_voice_consume(store, "odepiš rulandské šedé", "voice-op-ambig01")
    assert result["status"] == "ambiguous"
    assert len(result["candidates"]) >= 2
    assert store.get(a["id"])["quantity"] == 2
    pending = store.voice_pending_list()
    assert len(pending) == 1
    assert pending[0]["sourceOperationId"] == "voice-op-ambig01"


def test_not_found(store):
    _stock(store, "op-v-nf001")
    assert (
        voice_mod.apply_voice_consume(store, "vypil jsem frankovka", "voice-op-nf001")["status"]
        == "not_found"
    )


def test_out_of_stock(store):
    w = _stock(store, "op-v-os001", vintage=2020, quantity=1)
    store.consume(w["id"], 1, True, "voice-op-empty01")
    result = voice_mod.apply_voice_consume(
        store, "vypil jsem rulandske sede 2020", "voice-op-os001"
    )
    assert result["status"] == "out_of_stock"


def test_last_bottle_flag(store):
    w = _stock(store, "op-v-lb001", vintage=2022, quantity=1)
    result = voice_mod.apply_voice_consume(
        store, "vypil jsem rulandske sede 2022", "voice-op-lb001"
    )
    assert result["status"] == "consumed"
    assert result["lastBottle"] is True
    assert store.get(w["id"])["quantity"] == 0


def test_idempotency(store):
    w = _stock(store, "op-v-id001", vintage=2023)
    first = voice_mod.apply_voice_consume(store, "rulandske sede 2023", "voice-op-idem01")
    second = voice_mod.apply_voice_consume(store, "rulandske sede 2023", "voice-op-idem01")
    assert first["status"] == "consumed"
    assert second["status"] == "consumed"
    assert second["replayed"] is True
    assert store.get(w["id"])["quantity"] == 1


def test_dry_run_no_write(store):
    w = _stock(store, "op-v-dr001", vintage=2026)
    result = voice_mod.apply_voice_consume(
        store, "rulandske sede 2026", "voice-op-dry001", dry_run=True
    )
    assert result["status"] == "consumed"
    assert result.get("dryRun") is True
    assert store.get(w["id"])["quantity"] == 2


def test_resolve_and_dismiss_pending(store):
    a = _stock(store, "op-v-r001", vintage=2024, labelName="A")
    _stock(store, "op-v-r002", vintage=2025, labelName="B")
    amb = voice_mod.apply_voice_consume(store, "rulandske sede", "voice-op-res001")
    assert amb["status"] == "ambiguous"
    pid = amb["pendingId"]
    resolved = voice_mod.resolve_voice_pending(store, pid, a["id"])
    assert resolved["status"] == "consumed"
    assert store.get(a["id"])["quantity"] == 1
    assert store.voice_pending_list() == []

    amb2 = voice_mod.apply_voice_consume(store, "rulandske sede", "voice-op-dis001")
    dismissed = voice_mod.resolve_voice_pending(store, amb2["pendingId"], None)
    assert dismissed["status"] == "dismissed"
    assert store.voice_pending_list() == []


def test_invalid_quantity_refused(store):
    assert (
        voice_mod.apply_voice_consume(store, "0 lahve rulandske", "voice-op-zero01")["status"]
        == "invalid_quantity"
    )


def test_invalid_quantity_parse():
    parsed = voice_mod.parse_voice_text("0 lahve rulandske")
    assert parsed.quantity == 0


def test_czech_response_strings():
    assert "Odepsáno" in voice_mod.czech_response(
        {"status": "consumed", "wine": {"name": "Rulandské šedé", "vintage": 2025, "quantity": 1}}
    )
    assert "nebo" in voice_mod.czech_response(
        {
            "status": "ambiguous",
            "candidates": [
                {"name": "Synthetic A", "vintage": 2024},
                {"name": "Synthetic B", "vintage": 2025},
            ],
        }
    )
    assert "nemám" in voice_mod.czech_response({"status": "not_found"})


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


async def test_ws_voice_admin_and_guest(ws, hass, hass_ws_client, hass_read_only_access_token):
    await _call(
        ws,
        type="homebrain/wine/create",
        wine={**BASE, "name": "Rulandské šedé", "vintage": 2025, "quantity": 2},
        source_operation_id="ws-voice-create1",
    )
    ok = await _call(
        ws,
        type="homebrain/wine/voice_consume",
        text="vypil jsem rulandske sede 2025",
        source_operation_id="ws-voice-consume1",
    )
    assert ok["success"], ok
    assert ok["result"]["status"] == "consumed"

    child = await hass_ws_client(hass, access_token=hass_read_only_access_token)
    for msg in (
        {
            "type": "homebrain/wine/voice_consume",
            "text": "x",
            "source_operation_id": "child-voice-01",
        },
        {"type": "homebrain/wine/voice_pending"},
        {"type": "homebrain/wine/voice_resolve", "pending_id": "x", "wine_id": None},
    ):
        res = await _call(child, **msg)
        assert res["error"]["code"] == "unauthorized"


async def test_ha_service_wine_consume_text(hass: HomeAssistant, tmp_path):
    with patch(
        "custom_components.homebrain.wine.websocket.wine_db_path",
        return_value=tmp_path / "homebrain" / "wine.db",
    ):
        assert await async_setup_component(hass, DOMAIN, {})
        store = WineStore(tmp_path / "homebrain" / "wine.db").open()
        store.create(
            {**BASE, "name": "Rulandské šedé", "vintage": 2027, "quantity": 1},
            "svc-create-01",
        )
        store.close()
        result = await hass.services.async_call(
            DOMAIN,
            "wine_consume_text",
            {
                "text": "rulandske sede 2027",
                "source_operation_id": "svc-consume-01",
            },
            blocking=True,
            return_response=True,
        )
        assert result["status"] == "consumed"
