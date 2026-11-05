"""Recepty: Czech units, durations and schema.org parsing (synthetic fixtures only)."""

import json
from pathlib import Path

import pytest

from custom_components.homebrain.recipes.parser import (
    RecipeParseError,
    parse_recipe_page,
    youtube_id,
)
from custom_components.homebrain.recipes.units import (
    detect_durations,
    first_duration,
    is_countable,
    parse_ingredient,
    parse_iso_duration,
)

FIXTURES = Path(__file__).parent / "fixtures" / "recipes"
BASE = "https://recepty.example.org/recept/"


def _page(name: str) -> str:
    return (FIXTURES / name).read_text(encoding="utf-8")


@pytest.mark.parametrize(
    ("line", "qty", "unit", "name", "note"),
    [
        ("500 g hladké mouky", 500, "g", "hladké mouky", None),
        ("10 dkg másla", 10, "dkg", "másla", None),
        ("1,5 l mléka", 1.5, "l", "mléka", None),
        ("250 ml smetany", 250, "ml", "smetany", None),
        ("2 lžíce oleje", 2, "lžíce", "oleje", None),
        ("1 lžička cukru", 1, "lžička", "cukru", None),
        ("½ lžičky soli", 0.5, "lžička", "soli", None),
        ("1 ½ hrnku mouky", 1.5, "hrnek", "mouky", None),
        ("3 ks vajec", 3, "ks", "vajec", None),
        ("špetka soli", 1, "špetka", "soli", None),
        ("půl hrnku vody", 0.5, "hrnek", "vody", None),
        ("2 PL cukru", 2, "lžíce", "cukru", None),
        ("1/2 l vody", 0.5, "l", "vody", None),
        ("1 cibule, nadrobno nakrájená", 1, None, "cibule", "nadrobno nakrájená"),
        ("1 celer (menší)", 1, None, "celer", "menší"),
        ("hladká mouka 10 dkg", 10, "dkg", "hladká mouka", None),
        ("sůl dle chuti", None, None, "sůl", "dle chuti"),
        ("olej na smažení", None, None, "olej na smažení", None),
        ("2–3 stroužky česneku", 2, "stroužek", "česneku", None),
    ],
)
def test_parse_ingredient(line, qty, unit, name, note):
    got = parse_ingredient(line)
    assert (got["qty"], got["unit"], got["name"], got["note"]) == (qty, unit, name, note)


def test_ingredient_range_and_countable():
    got = parse_ingredient("2–3 stroužky česneku")
    assert got["qtyMax"] == 3
    assert is_countable("stroužek", 2) and is_countable(None, 1)
    assert not is_countable("g", 500) and not is_countable(None, None)


@pytest.mark.parametrize(
    ("value", "seconds"),
    [
        ("PT20M", 1200),
        ("PT1H30M", 5400),
        ("P0DT2H0M", 7200),
        ("PT90S", 90),
        ("PT0,5H", 1800),
        ("P1D", 86400),
        ("", None),
        ("20 min", None),
        (None, None),
        ("PT", None),
    ],
)
def test_iso_duration(value, seconds):
    assert parse_iso_duration(value) == seconds


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("Pečeme 20 minut.", [1200]),
        ("Vaříme 1,5 hodiny, pak 10 min odpočívá.", [5400, 600]),
        ("Necháme půl hodiny odstát.", [1800]),
        ("Dusíme hodinu a půl.", [5400]),
        ("Dusíme hodinu.", [3600]),
        ("Odpočívá čtvrt hodiny.", [900]),
        ("Smažíme 3–4 minuty.", [180]),
        ("Šleháme 30 sekund.", [30]),
        ("Pečeme 2 h při 160 °C.", [7200]),
        ("Restujeme 3 s cibulí.", []),
        ("Přidáme 2 lžíce mouky.", []),
    ],
)
def test_detect_durations(text, expected):
    assert [d["seconds"] for d in detect_durations(text)] == expected


def test_duration_range_keeps_max():
    (dur,) = detect_durations("Smažíme 3–4 minuty")
    assert dur["maxSeconds"] == 240 and first_duration("bez času") is None


def test_youtube_ids():
    for url in (
        "https://www.youtube.com/watch?v=AbCdEfGhIjK&t=30",
        "https://youtu.be/AbCdEfGhIjK",
        "https://www.youtube.com/embed/AbCdEfGhIjK?start=5",
        "https://youtube.com/shorts/AbCdEfGhIjK",
    ):
        assert youtube_id(url) == "AbCdEfGhIjK"
    assert youtube_id("https://vimeo.com/123") is None
    assert youtube_id("https://www.youtube.com/watch?v=bad") is None


def test_parse_svickova_graph_sections_video():
    r = parse_recipe_page(_page("svickova.html"), BASE + "svickova")
    assert r["title"] == "Svíčková na smetaně"
    assert r["servings"] == 6
    assert (r["prepSeconds"], r["cookSeconds"], r["totalSeconds"]) == (2400, 9000, 11400)
    assert r["photoUrl"] == "https://recepty.example.org/img/svickova.jpg"
    assert r["youtubeId"] == "AbCdEfGhIjK"
    assert r["tags"] == ["hlavní jídlo", "česká", "omáčka", "neděle"]
    groups = {i["group"] for i in r["ingredients"]}
    assert groups == {"Na maso", "Na omáčku"}
    beef = r["ingredients"][0]
    assert (beef["qty"], beef["unit"], beef["name"]) == (800, "g", "hovězí svíčkové")
    assert [s["group"] for s in r["steps"]] == ["Maso", "Maso", "Omáčka", "Omáčka"]
    assert [s.get("timerSeconds") for s in r["steps"]] == [None, 600, 7200, 1800]
    # VideoObject.hasPart clips map onto steps by order.
    assert [s["videoTs"] for s in r["steps"]] == [12, 95, 240, 410]
    assert r["sourceName"] == "recepty.example.org"


def test_parse_bramboraky_strings_relative_image():
    r = parse_recipe_page(_page("bramboraky.html"), BASE + "bramboraky")
    assert r["servings"] == 4 and r["totalSeconds"] == 2700
    assert r["photoUrl"] == "https://recepty.example.org/img/bramboraky.png"
    assert len(r["steps"]) == 3 and r["steps"][2]["timerSeconds"] == 180
    garlic = r["ingredients"][2]
    assert (garlic["qty"], garlic["unit"], garlic["countable"]) == (3, "stroužek", True)
    flour = r["ingredients"][3]
    assert (flour["name"], flour["qty"], flour["unit"]) == ("hladká mouka", 10, "dkg")
    assert r["tags"] == ["vegetariánské", "rychlé"]


def test_parse_palacinky_text_blob_and_youtu_be():
    r = parse_recipe_page(_page("palacinky.html"), BASE + "palacinky")
    assert r["servings"] == 8 and r["totalSeconds"] == 1800  # prep + cook fallback
    assert [s["text"].split()[0] for s in r["steps"]] == ["Vše", "Necháme", "Pečeme"]
    assert [s.get("timerSeconds") for s in r["steps"]] == [None, 900, 60]
    milk = r["ingredients"][1]
    assert (milk["qty"], milk["unit"]) == (0.5, "l")
    assert r["ingredients"][0]["unit"] == "hrnek"
    assert r["youtubeId"] == "ZyXwVuTsRqP"


def test_parse_microdata_fallback():
    r = parse_recipe_page(_page("stehna-microdata.html"), BASE + "stehna")
    assert r["title"] == "Kuřecí stehna z fritézy"
    assert r["servings"] == 2 and (r["prepSeconds"], r["cookSeconds"]) == (900, 1500)
    assert [i["name"] for i in r["ingredients"]] == [
        "kuřecí stehna",
        "oleje",
        "uzené papriky",
        "jogurtu",
    ]
    assert [s.get("timerSeconds") for s in r["steps"]] == [None, 1500, 300]
    assert r["photoUrl"] == "https://recepty.example.org/img/stehna.jpg"
    # The nested author scope must not leak its name into the recipe.
    assert r["title"] != "Syntetický autor"


def test_no_recipe_raises():
    with pytest.raises(RecipeParseError):
        parse_recipe_page("<html><body><p>nic</p></body></html>", BASE)


def test_parenthetical_lines_become_notes_or_group_headers():
    """Regression: a line that is only ``(…)`` produced an ingredient with an empty name
    and the save failed with INVALID_FIELD ingredients.2.name (real-world svíčková import)."""
    from custom_components.homebrain.recipes.store import validate_recipe

    r = parse_recipe_page(_page("poznamky-v-zavorkach.html"), BASE + "hovezi")
    rows = [(i["qty"], i["unit"], i["name"], i["note"], i["group"]) for i in r["ingredients"]]
    assert rows == [
        (600, "g", "hovězího masa", None, None),
        (250, "g", "zeleniny na polévku", "mrkev, petržel a celer napůl", None),
        (1, None, "cibule", None, None),
        (1, "lžíce", "hladké mouky", "případně víc; volitelně", None),
        (200, "ml", "smetany", None, "Na omáčku (kořenová zelenina)"),
        (None, None, "sůl", None, "Na omáčku (kořenová zelenina)"),
    ]
    assert all(i["name"].strip() for i in r["ingredients"])
    # The parsed preview passes the (unchanged, strict) store validation.
    assert len(validate_recipe(r)["ingredients"]) == 6


def test_leading_parenthetical_becomes_group_and_limits_are_clamped():
    page = (
        '<script type="application/ld+json">'
        + json.dumps(
            {
                "@type": "Recipe",
                "name": "Syntetický test",
                "recipeIngredient": [
                    "(těsto)",
                    "500 g mouky",
                    "(" + "poznámka " * 40 + ")",
                    "x" * 300,
                ],
            },
            ensure_ascii=False,
        )
        + "</script>"
    )
    r = parse_recipe_page(page, BASE + "limity")
    first, second = r["ingredients"]
    assert (first["name"], first["group"]) == ("mouky", "těsto")
    assert first["note"] is not None and len(first["note"]) <= 200
    assert len(second["name"]) == 200


def test_store_still_rejects_empty_ingredient_name():
    from custom_components.homebrain.recipes.store import RecipeError, validate_recipe

    with pytest.raises(RecipeError) as err:
        validate_recipe({"title": "x", "ingredients": [{"name": " "}], "steps": []})
    assert err.value.field == "ingredients.0.name"
