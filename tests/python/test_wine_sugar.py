"""Schema v7 – residual sugar / acidity for the legal sugar category (synthetic data only)."""

import sqlite3

import pytest

from custom_components.homebrain.wine import domain as d
from custom_components.homebrain.wine.enrich import proposed_changes
from custom_components.homebrain.wine.importer import parse_import
from custom_components.homebrain.wine.lookup import sanitize_fields, znovin_fields
from custom_components.homebrain.wine.store import (
    CURRENT_SCHEMA_VERSION,
    WineStore,
    downgrade,
    migrate,
    schema_version,
)

SYNTH = {
    "name": "Synthetic Pálava",
    "producer": "Vinařství Synthetic B",
    "vintage": 2023,
    "wineType": "still",
    "color": "white",
    "grapeVarieties": ["Pálava"],
    "volumeMl": 750,
    "quantity": 2,
}


@pytest.fixture
def store(tmp_path):
    s = WineStore(tmp_path / "wine.db").open()
    yield s
    s.close()


def _columns(conn: sqlite3.Connection) -> set[str]:
    return {row[1] for row in conn.execute("PRAGMA table_info(wines)")}


def test_v7_roundtrip_fields(store):
    assert CURRENT_SCHEMA_VERSION == 7
    wine = store.create(
        {**SYNTH, "sweetness": "polosuché", "residualSugarGl": 14.5, "acidsGl": 7.2},
        "op-sugar-0001",
    )["wine"]
    got = store.get(wine["id"])
    assert (got["sweetness"], got["residualSugarGl"], got["acidsGl"]) == ("polosuché", 14.5, 7.2)
    assert store.update(wine["id"], {"residualSugarGl": None})["residualSugarGl"] is None


@pytest.mark.parametrize(
    ("field", "value"), [("residualSugarGl", -1), ("residualSugarGl", 2000), ("acidsGl", "x")]
)
def test_v7_validation(field, value):
    with pytest.raises(d.WineError) as err:
        d.validate_fields({field: value}, partial=True)
    assert err.value.code == d.INVALID_FIELD


def test_v7_downgrade_is_reversible_and_keeps_rows(tmp_path):
    s = WineStore(tmp_path / "w.db").open()
    wine = s.create({**SYNTH, "sweetness": "suché", "residualSugarGl": 2.1}, "op-sugar-0002")[
        "wine"
    ]
    conn = s.conn
    assert {"residual_sugar_gl", "acids_gl"} <= _columns(conn)
    assert downgrade(conn, 6) == 6 and schema_version(conn) == 6
    assert not {"residual_sugar_gl", "acids_gl"} & _columns(conn)
    row = conn.execute("SELECT sweetness FROM wines WHERE id = ?", (wine["id"],)).fetchone()
    assert row[0] == "suché"  # the label term survives the rollback
    assert migrate(conn) == 7 and {"residual_sugar_gl", "acids_gl"} <= _columns(conn)
    s.close()


def test_v6_code_opens_v7_db(tmp_path):
    """Rolling back to rc.12 (v6) keeps working: one version newer is forward compatible."""
    s = WineStore(tmp_path / "w.db").open()
    assert migrate(s.conn, target=6) == 7
    s.close()


def test_enrichment_fills_sugar_only_when_empty():
    facts = {
        "sweetness": "suché",
        "residualSugarGl": 3.1,
        "acidsGl": 6.4,
        "catalogueCode": "Z 0000",
        "sourceUrl": "https://example.invalid/vino",
    }
    empty = {"id": "w", "sweetness": None, "residualSugarGl": None, "acidsGl": None}
    changes = proposed_changes(empty, facts)
    assert (changes["residualSugarGl"], changes["acidsGl"], changes["sweetness"]) == (
        3.1,
        6.4,
        "suché",
    )
    owned = {"id": "w", "sweetness": "polosuché", "residualSugarGl": 9.0, "acidsGl": 7.0}
    changes = proposed_changes(owned, facts)
    assert not {"sweetness", "residualSugarGl", "acidsGl"} & set(changes)


def test_lookup_proposal_carries_sugar_numbers():
    fields = znovin_fields({"title": "Synthetic", "residualSugarGl": 3.1, "acidsGl": 6.4})
    assert fields["residualSugarGl"] == 3.1 and fields["acidsGl"] == 6.4
    clean = sanitize_fields({"name": "X", "residualSugarGl": "2,4", "acidsGl": 500})
    assert clean["residualSugarGl"] == 2.4 and "acidsGl" not in clean


def test_csv_import_sugar_columns():
    csv = "Název;Vinařství;Barva;Obsah cukru;Zbytkový cukr;Kyseliny\n"
    csv += "Synthetic Ryzlink;Vinařství Synthetic C;bílé;suché;2,1 g/l;6,8\n"
    (row,) = parse_import(csv, "csv")
    assert (row["sweetness"], row["residualSugarGl"], row["acidsGl"]) == ("suché", 2.1, 6.8)
