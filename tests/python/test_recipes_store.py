"""Recepty store: migrations (up + down), CRUD, search, validation."""

import sqlite3

import pytest

from custom_components.homebrain.recipes.store import (
    CURRENT_SCHEMA_VERSION,
    MIGRATION_V1_SQL,
    RecipeError,
    RecipeStore,
    downgrade,
    migrate,
    schema_version,
)

RECIPE = {
    "title": "Syntetický guláš",
    "servings": 4,
    "totalSeconds": 5400,
    "tags": ["Hlavní jídlo", "hlavní jídlo", "česká"],
    "ingredients": [
        {"qty": 500, "unit": "g", "name": "hovězí kližka", "group": None},
        {"qty": 2, "unit": None, "name": "cibule", "countable": True},
        {"qty": None, "unit": None, "name": "sůl"},
    ],
    "steps": [
        {"text": "Cibuli orestujeme 10 minut.", "timerSeconds": 600},
        {"text": "Dusíme 80 minut.", "timerSeconds": 4800, "videoTs": 42},
        {
            "text": "Brambory dopečeme ve fritéze.",
            "airfryer": {"temperature": 200, "minutes": 15, "method": "Hranolky"},
        },
    ],
}


@pytest.fixture
def store(tmp_path):
    s = RecipeStore(tmp_path / "recipes.db").open()
    yield s
    s.close()


def test_migrations_up_down_up(tmp_path):
    conn = sqlite3.connect(tmp_path / "m.db", isolation_level=None)
    assert migrate(conn) == CURRENT_SCHEMA_VERSION == 3
    cols = {r[1] for r in conn.execute("PRAGMA table_info(recipes)")}
    assert "notes" in cols
    assert downgrade(conn, 1) == 1
    assert "notes" not in {r[1] for r in conn.execute("PRAGMA table_info(recipes)")}
    assert downgrade(conn, 0) == 0 and schema_version(conn) == 0
    assert conn.execute("SELECT count(*) FROM sqlite_master WHERE type='table'").fetchone()[0] in (
        0,
        1,  # sqlite_sequence may stay behind
    )
    assert migrate(conn) == 3


def test_v1_data_survives_upgrade(tmp_path):
    conn = sqlite3.connect(tmp_path / "v1.db", isolation_level=None)
    conn.executescript(
        "BEGIN;" + MIGRATION_V1_SQL + "INSERT INTO schema_migrations VALUES (1, 'x');"
        "INSERT INTO recipes (id, title, title_fold, created_at, updated_at) VALUES "
        "('" + "a" * 32 + "', 'Starý', 'stary', 'x', 'x');COMMIT;"
    )
    conn.close()
    s = RecipeStore(tmp_path / "v1.db").open()
    try:
        assert s.get("a" * 32)["title"] == "Starý"
        assert schema_version(s.conn) == 3
    finally:
        s.close()


def test_newer_schema_is_refused(tmp_path):
    conn = sqlite3.connect(tmp_path / "n.db", isolation_level=None)
    migrate(conn)
    conn.execute("INSERT INTO schema_migrations VALUES (9, 'x')")
    with pytest.raises(RecipeError):
        migrate(conn)


def test_crud_roundtrip(store):
    created = store.create(RECIPE)
    assert created["tags"] == ["hlavní jídlo", "česká"] or created["tags"] == [
        "česká",
        "hlavní jídlo",
    ]
    assert [i["name"] for i in created["ingredients"]] == ["hovězí kližka", "cibule", "sůl"]
    assert created["ingredients"][1]["countable"] is True
    assert created["steps"][1]["videoTs"] == 42
    assert created["steps"][2]["airfryer"] == {
        "temperature": 200,
        "minutes": 15,
        "method": "Hranolky",
    }
    rid = created["id"]
    updated = store.update(rid, {**RECIPE, "title": "Guláš II", "steps": RECIPE["steps"][:1]})
    assert updated["title"] == "Guláš II" and len(updated["steps"]) == 1
    fav = store.patch(rid, {"favourite": True, "rating": 5, "cooked": True})
    assert fav["favourite"] and fav["rating"] == 5 and fav["lastCookedAt"]
    store.delete(rid)
    with pytest.raises(RecipeError):
        store.get(rid)
    # Children cascade.
    assert store.conn.execute("SELECT count(*) FROM ingredients").fetchone()[0] == 0


def test_list_search_tag_favourite(store):
    a = store.create(RECIPE)
    store.create(
        {
            **RECIPE,
            "title": "Palačinky",
            "tags": ["sladké"],
            "ingredients": [{"qty": 2, "name": "vejce"}],
        }
    )
    assert [r["title"] for r in store.list({"search": "gulas"})] == ["Syntetický guláš"]
    assert [r["title"] for r in store.list({"search": "klizka"})] == ["Syntetický guláš"]
    assert [r["title"] for r in store.list({"tag": "sladké"})] == ["Palačinky"]
    store.patch(a["id"], {"favourite": True})
    assert [r["title"] for r in store.list({"favourite": True})] == ["Syntetický guláš"]
    assert store.list()[0]["id"] == a["id"]  # favourites first
    assert store.list()[0]["ingredientCount"] == 3
    assert {t["tag"] for t in store.tags()} == {"hlavní jídlo", "česká", "sladké"}


@pytest.mark.parametrize(
    "bad",
    [
        {"title": ""},
        {"title": "x", "servings": 0},
        {"title": "x", "youtubeId": "short"},
        {"title": "x", "sourceUrl": "javascript:alert(1)"},
        {"title": "x", "steps": [{"text": ""}]},
        {"title": "x", "steps": [{"text": "a", "airfryer": {"temperature": 400, "minutes": 5}}]},
        {"title": "x", "steps": [{"text": "a", "airfryer": {"temperature": 180}}]},
        {"title": "x", "ingredients": [{"qty": -1, "name": "a"}]},
    ],
)
def test_validation(store, bad):
    with pytest.raises(RecipeError):
        store.create(bad)


def test_settings(store):
    assert store.setting("k") is None
    store.set_setting("k", "v")
    store.set_setting("k", "w")
    assert store.setting("k") == "w"
    store.set_setting("k", None)
    assert store.setting("k") is None
