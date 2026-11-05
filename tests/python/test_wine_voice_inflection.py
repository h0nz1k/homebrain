"""#93 Czech declension in voice write-off: "vypil jsem Pálavu / Frankovku / Blauburgeru".

Catalogue-like but invented wines (common Moravian varieties, no private data).
"""

from __future__ import annotations

import pytest

from custom_components.homebrain.wine import voice as voice_mod
from custom_components.homebrain.wine.store import WineStore

CATALOGUE = [
    {"id": "w01", "name": "Frankovka", "vintage": 2021, "predicate": "pozdní sběr"},
    {"id": "w02", "name": "Pálava", "vintage": 2022, "predicate": "výběr z hroznů"},
    {"id": "w03", "name": "Blauburger", "vintage": 2020},
    {"id": "w04", "name": "Ryzlink rýnský", "vintage": 2023, "predicate": "kabinetní"},
    {"id": "w05", "name": "Ryzlink vlašský", "vintage": 2022},
    {"id": "w06", "name": "Veltlínské zelené", "vintage": 2023},
    {"id": "w07", "name": "Sauvignon", "vintage": 2024},
    {"id": "w08", "name": "Tramín červený", "vintage": 2022},
    {"id": "w09", "name": "Müller-Thurgau", "vintage": 2024},
    {"id": "w10", "name": "Rulandské šedé", "vintage": 2025},
    {"id": "w11", "name": "Cabernet Moravia", "vintage": 2021},
]


def _wines() -> list[dict]:
    return [{**w, "grapeVarieties": [w["name"]], "quantity": 2} for w in CATALOGUE]


def _rank(text: str, wines: list[dict] | None = None):
    parsed = voice_mod.parse_voice_text(text)
    ranked = voice_mod.rank_in_stock_wines(wines or _wines(), parsed)
    return voice_mod.decide_match(ranked), ranked


@pytest.mark.parametrize(
    ("word", "lemma"),
    [
        ("frankovku", "frankovka"),
        ("frankovkou", "frankovka"),
        ("frankovce", "frankovka"),
        ("frankovky", "frankovka"),
        ("palavu", "palava"),
        ("palave", "palava"),
        ("blauburgeru", "blauburger"),
        ("blauburgerem", "blauburger"),
        ("blauburgerovi", "blauburger"),
        ("ryzlinku", "ryzlink"),
        ("veltlinskeho", "veltlinske"),
        ("zeleneho", "zelene"),
        ("rynskeho", "rynsky"),
        ("sauvignonu", "sauvignon"),
        ("traminu", "tramin"),
        ("moravii", "moravia"),
    ],
)
def test_lemma_candidates(word, lemma):
    assert lemma in voice_mod.czech_lemma_candidates(word)


@pytest.mark.parametrize("word", ["muller-thurgau", "2021", "pet", "su", ""])
def test_no_lemma_for_short_or_non_alpha(word):
    assert voice_mod.czech_lemma_candidates(word) == []


@pytest.mark.parametrize(
    ("text", "wine_id"),
    [
        ("vypil jsem Frankovku", "w01"),
        ("vypil jsem Frankovka", "w01"),
        ("odepiš Frankovkou", "w01"),
        ("vypili jsme dvě Frankovky", "w01"),
        ("vypil jsem Frankovku 2021", "w01"),
        ("vypil jsem Pálavu", "w02"),
        ("vypil jsem Pálavu 2022", "w02"),
        ("odepiš Blauburgeru", "w03"),
        ("vypil jsem Blauburgerem", "w03"),
        ("vypil jsem Ryzlinku rýnského", "w04"),
        ("vypil jsem Veltlínského zeleného", "w06"),
        ("vypil jsem Veltlínským zeleným", "w06"),
        ("vypil jsem Sauvignonu", "w07"),
        ("vypil jsem Tramínu", "w08"),
        ("vypil jsem Tramínu červeného", "w08"),
        ("vypil jsem Müller-Thurgau", "w09"),
        ("vypil jsem Rulandského šedého", "w10"),
        ("vypil jsem Cabernet Moravii", "w11"),
    ],
)
def test_declined_names_match_uniquely(text, wine_id):
    decision, ranked = _rank(text)
    assert decision == "unique", (text, ranked[:3])
    assert ranked[0]["wine"]["id"] == wine_id


@pytest.mark.parametrize("text", ["vypil jsem Merlot", "vypil jsem Merlotu", "vypil jsem Franka"])
def test_no_false_positive(text):
    assert _rank(text)[0] == "not_found"


def test_declined_ambiguity_unchanged():
    decision, ranked = _rank("vypil jsem Ryzlinku")
    assert decision == "ambiguous"
    assert {c["wine"]["id"] for c in ranked[:2]} == {"w04", "w05"}


def test_exact_form_ranks_before_lemma():
    wines = [
        {"id": "a", "name": "Frankovka", "quantity": 1},
        {"id": "b", "name": "Frankovky", "quantity": 1},
    ]
    decision, ranked = _rank("vypil jsem Frankovky", wines)
    assert decision == "ambiguous"
    assert ranked[0]["wine"]["id"] == "b"
    assert ranked[0]["score"] > ranked[1]["score"]


@pytest.fixture
def store(tmp_path):
    s = WineStore(tmp_path / "wine.db").open()
    yield s
    s.close()


def _add(store: WineStore, op: str, name: str, quantity: int):
    wine = {
        "producer": "Vinařství Synthetic Z",
        "wineType": "still",
        "color": "white",
        "volumeMl": 750,
        "location": {"zone": "Zóna A"},
        "name": name,
        "grapeVarieties": [name],
        "quantity": quantity,
    }
    return store.create(wine, op)["wine"]


def test_declined_consume_and_out_of_stock(store):
    palava = _add(store, "op-infl-0001", "Pálava", 2)
    _add(store, "op-infl-0002", "Blauburger", 0)
    _add(store, "op-infl-0003", "Veltlínské zelené", 1)

    result = voice_mod.apply_voice_consume(store, "vypil jsem Pálavu", "voice-infl-0001")
    assert result["status"] == "consumed"
    assert result["wine"]["id"] == palava["id"]
    assert result["wine"]["quantity"] == 1

    gone = voice_mod.apply_voice_consume(store, "odepiš Blauburgeru", "voice-infl-0002")
    assert gone["status"] == "out_of_stock"
    assert gone["wine"]["name"] == "Blauburger"
