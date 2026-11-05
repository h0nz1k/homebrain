"""WIN-014 Assist: Czech sentences, conversation pipeline, follow-up and edge cases.

Synthetic wine names only. The conversation tests go through HA's real default agent
(``conversation.async_converse`` with ``language="cs"``), i.e. the same path as Assist on
a phone, with the sentences installed by the integration into the test config dir.
"""

from __future__ import annotations

from pathlib import Path
from unittest.mock import patch

import pytest
import yaml
from hassil import Intents, recognize
from homeassistant.components import conversation
from homeassistant.core import Context, HomeAssistant
from homeassistant.setup import async_setup_component

from custom_components.homebrain.const import DOMAIN
from custom_components.homebrain.wine import sentences as sentences_mod
from custom_components.homebrain.wine import voice as voice_mod
from custom_components.homebrain.wine.store import WineStore

BASE = {
    "producer": "Vinařství Synthetic Z",
    "wineType": "still",
    "color": "white",
    "volumeMl": 750,
    "location": {"zone": "Zóna A"},
}


@pytest.fixture
def store(tmp_path):
    s = WineStore(tmp_path / "wine.db").open()
    yield s
    s.close()


def _add(store: WineStore, op: str, name: str, **fields):
    return store.create({**BASE, "name": name, "quantity": 2, **fields}, op)["wine"]


# ---------- parsing (review findings) ----------


@pytest.mark.parametrize(
    ("text", "query", "vintage", "qty"),
    [
        ("vypil jsem Prosiměřický Veltlín", "prosimericky veltlin", None, 1),
        ("odepiš Podepsaný Tramín 2023", "podepsany tramin", 2023, 1),
        ("vypili jsme pet nat", "petnat", None, 1),
        ("vypil jsem Pet-Nat Frankovka", "petnat frankovka", None, 1),
        ("vypili jsme dvě Frankovky", "frankovky", None, 2),
        ("odepiš pět lahví Synthetic Tramín", "synthetic tramin", None, 5),
        ("odepiš Tramín pět", "tramin pet", None, 1),
        ("vypil jsem si víno Synthetic Ryzlink ročník 22", "synthetic ryzlink", 2022, 1),
        ("odepiš 3x Synthetic Muškát", "synthetic muskat", None, 3),
    ],
)
def test_parse_edge_cases(text, query, vintage, qty):
    parsed = voice_mod.parse_voice_text(text)
    assert (parsed.query, parsed.vintage, parsed.quantity) == (query, vintage, qty)


def test_petnat_matches_catalogue(store):
    w = _add(store, "op-pn-0001", "Pet-Nat Synthetic Rosé", vintage=2024)
    _add(store, "op-pn-0002", "Synthetic Veltlín", vintage=2024)
    result = voice_mod.apply_voice_consume(store, "vypil jsem pet nat rosé", "voice-pn-0001")
    assert result["status"] == "consumed"
    assert result["wine"]["id"] == w["id"]


def test_pending_add_same_op_returns_existing(store):
    first = store.voice_pending_add("a", "a", None, 1, [], "voice-dup-0001")
    second = store.voice_pending_add("a", "a", None, 1, [], "voice-dup-0001")
    assert first == second
    assert len(store.voice_pending_list()) == 1


# ---------- follow-up ----------


def _ambiguous(store: WineStore):
    a = _add(store, "op-amb-0001", "Synthetic Ryzlink", vintage=2022)
    b = _add(store, "op-amb-0002", "Synthetic Ryzlink", vintage=2023)
    result = voice_mod.apply_voice_consume(store, "vypil jsem synthetic ryzlink", "voice-amb-01")
    assert result["status"] == "ambiguous"
    return a, b, result


def test_choose_latest_pending(store):
    a, b, result = _ambiguous(store)
    speech = voice_mod.czech_response(result)
    assert speech.startswith("Mám víc podobných vín. Myslíš první Synthetic Ryzlink")
    assert speech.endswith("?")
    first_id = result["candidates"][0]["id"]
    out = voice_mod.choose_latest_pending(store, 1)
    assert out["status"] == "consumed"
    assert out["wine"]["id"] == first_id
    assert store.voice_pending_list() == []
    assert store.get(first_id)["quantity"] == 1
    assert {a["id"], b["id"]} >= {first_id}
    assert voice_mod.choose_latest_pending(store, 1)["status"] == "no_pending"


def test_choose_bad_index_and_dismiss(store):
    _ambiguous(store)
    assert voice_mod.choose_latest_pending(store, 5)["status"] == "bad_choice"
    out = voice_mod.choose_latest_pending(store, None)
    assert out["status"] == "dismissed"
    assert voice_mod.czech_response(out) == "Dobře, nic neodepisuji."
    assert store.voice_pending_list() == []


def test_stale_pending_not_resolved_by_voice(store):
    _ambiguous(store)
    assert voice_mod.choose_latest_pending(store, 1, max_age_s=-1)["status"] == "no_pending"
    assert len(store.voice_pending_list()) == 1  # still waiting for the UI


def test_last_bottle_and_zero_stock_speech(store):
    _add(store, "op-last-0001", "Synthetic Sylvánské", quantity=1)
    out = voice_mod.apply_voice_consume(store, "odepiš synthetic sylvánské", "voice-last-01")
    assert out["status"] == "consumed"
    assert out["lastBottle"] is True
    assert "poslední láhev" in voice_mod.czech_response(out)
    again = voice_mod.apply_voice_consume(store, "odepiš synthetic sylvánské", "voice-last-02")
    assert again["status"] == "out_of_stock"
    assert voice_mod.czech_response(again) == "Synthetic Sylvánské už ve vinotéce není."


def test_not_enough_bottles_speech(store):
    _add(store, "op-few-0001", "Synthetic Cabernet", quantity=2)
    out = voice_mod.apply_voice_consume(store, "odepiš tři láhve synthetic cabernet", "voice-few-1")
    assert out["status"] == "out_of_stock"
    assert voice_mod.czech_response(out) == "Od vína Synthetic Cabernet mám jen 2 láhve."


# ---------- sentences ----------


def _intents() -> Intents:
    return Intents.from_dict(yaml.safe_load(sentences_mod.BUNDLED.read_text(encoding="utf-8")))


@pytest.mark.parametrize(
    ("sentence", "intent_name", "slot", "value"),
    [
        ("vypil jsem Synthetic Ryzlink 2022", "HomebrainWineConsumeText", "wine", None),
        ("vypila jsem si dvě láhve Frankovky", "HomebrainWineConsumeText", "wine", None),
        ("odepiš láhev Pet-Nat", "HomebrainWineConsumeText", "wine", None),
        ("otevřeli jsme Tramín", "HomebrainWineConsumeText", "wine", None),
        ("vypil jsem Pálavu", "HomebrainWineConsumeText", "wine", None),
        ("odepiš Blauburgeru 2020", "HomebrainWineConsumeText", "wine", None),
        ("vypila jsem si Veltlínského zeleného", "HomebrainWineConsumeText", "wine", None),
        ("to první", "HomebrainWineVoiceChoose", "wine_choice", 1),
        ("tu druhou láhev", "HomebrainWineVoiceChoose", "wine_choice", 2),
        ("myslel jsem to třetí", "HomebrainWineVoiceChoose", "wine_choice", 3),
        ("ani jedno", "HomebrainWineVoiceDismiss", None, None),
        ("žádné z nich", "HomebrainWineVoiceDismiss", None, None),
    ],
)
def test_sentences_recognized(sentence, intent_name, slot, value):
    result = recognize(sentence, _intents())
    assert result is not None, sentence
    assert result.intent.name == intent_name
    if slot:
        assert slot in result.entities
        if value is not None:
            assert result.entities[slot].value == value


def test_sync_sentences_respects_user_copy(tmp_path: Path):
    assert sentences_mod.sync_sentences(tmp_path) is True
    assert sentences_mod.sync_sentences(tmp_path) is False
    target = tmp_path / sentences_mod.FILENAME
    target.write_text('language: "cs"\nintents: {}\n', encoding="utf-8")
    assert sentences_mod.sync_sentences(tmp_path) is False
    assert "managed-by" not in target.read_text(encoding="utf-8")


# ---------- real HA conversation pipeline ----------


@pytest.fixture
async def assist(hass: HomeAssistant, tmp_path):
    db = tmp_path / "homebrain" / "wine.db"
    with patch("custom_components.homebrain.wine.websocket.wine_db_path", return_value=db):
        assert await async_setup_component(hass, "homeassistant", {})
        assert await async_setup_component(hass, "conversation", {})
        assert await async_setup_component(hass, DOMAIN, {})
        await hass.async_block_till_done()
        from custom_components.homebrain.wine.websocket import async_close_store, async_get_store

        yield await async_get_store(hass)
        await async_close_store(hass)


async def _say(hass: HomeAssistant, text: str) -> str:
    result = await conversation.async_converse(hass, text, None, Context(), language="cs")
    return result.response.speech["plain"]["speech"]


async def test_assist_conversation_flow(hass: HomeAssistant, assist: WineStore):
    assert (Path(hass.config.path("custom_sentences", "cs")) / "homebrain_wine.yaml").exists()
    await hass.async_add_executor_job(
        lambda: [
            _add(assist, "op-conv-0001", "Synthetic Ryzlink", vintage=2022),
            _add(assist, "op-conv-0002", "Synthetic Ryzlink", vintage=2023),
            _add(assist, "op-conv-0003", "Synthetic Frankovka", vintage=2021, quantity=1),
            _add(assist, "op-conv-0004", "Pálava", vintage=2022, quantity=3),
        ]
    )

    speech = await _say(hass, "vypil jsem Pálavu")
    assert speech == "Odepsáno: Pálava 2022, zbývá 2 láhve."

    speech = await _say(hass, "vypil jsem Synthetic Frankovku 2021")
    assert speech == "Odepsáno: Synthetic Frankovka 2021. Pozor, to byla poslední láhev."

    speech = await _say(hass, "vypil jsem Synthetic Ryzlink")
    assert speech.startswith("Mám víc podobných vín. Myslíš první Synthetic Ryzlink")

    speech = await _say(hass, "to druhé")
    assert speech.startswith("Odepsáno: Synthetic Ryzlink 202")
    assert speech.endswith("zbývá 1 láhev.")

    assert await _say(hass, "ani jedno") == "Nemám žádné nevyřízené odepsání."
    assert await _say(hass, "odepiš Synthetic Merlot") == "Tohle víno ve vinotéce nemám."
    events = await hass.async_add_executor_job(assist.events)
    consumes = [e for e in events if e["operation"] == "consume"]
    assert len(consumes) == 3
    assert all(e["sourceOperationId"].startswith("voice:") for e in consumes)
