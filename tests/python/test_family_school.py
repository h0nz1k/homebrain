"""School import exercises only generated PDFs, synthetic HTML and a fake network."""

from datetime import date, datetime
from io import BytesIO
from unittest.mock import AsyncMock, patch

import pytest
from pypdf import PdfWriter
from pypdf.generic import DecodedStreamObject, DictionaryObject, NameObject

from custom_components.homebrain.family.school import SchoolImport, school_snapshot
from custom_components.homebrain.family.school_parse import (
    grades_from_text,
    menu_links,
    menu_weeks,
    parse_events,
    parse_menu,
)
from custom_components.homebrain.wine.domain import WineError

MONDAY = date(2026, 11, 23)
THURSDAY = date(2026, 11, 26)
NEXT = date(2026, 11, 30)
BASE = "https://example.org/skola/"
MENU_URL = BASE + "jidelnicky"
EVENTS_URL = BASE + "akce"
DATES_URL = BASE + "terminy"
OPTIONS = {"menu_url": MENU_URL, "events_url": EVENTS_URL, "dates_url": DATES_URL}
EVENTS_HTML = """
<ul>
  <li>st 25.&nbsp;11. — Divadlo pro 4. a 5. třídu</li>
  <li>26.11.2026 — Výstava (celá škola)</li>
  <li>27. – 30. 11. — Projekt pro 8. a 9. ročník</li>
</ul>
<table><tr><td>1. 12.</td><td>Dílny</td><td>Program pro 4.–6. třídu</td></tr></table>
<article><h3>2. 12. – 4. 12.</h3><p>Hry</p></article>
"""
INDEX_HTML = """
<a href="predchozi.pdf">16. – 20. 11.</a>
<a href="aktualni.pdf">23. 11. – 27. 11.</a>
<a href="dalsi.pdf">30. 11. – 4. 12.</a>
"""
MENU_LINES = [
    "Pondeli 23.11.2026",
    "Svacina: chleb",
    "Polevka: mrkvova (1, 9)",
    "Obed: cizrnove placicky (3, 7)",
    "Priloha: kase (7)",
    "Salat: okurkovy",
    "Obed 2: jina varianta (8)",
    "Odpoledni svacina: jablko (6)",
    "Utery 24. 11.",
    "SVATEK",
    "Streda 25. 11.",
    "Ctvrtek 26. 11.",
    "prazdniny",
    "Patek 27. 11.",
    "Obed: kuskus",
]


def generated_pdf(lines: list[str]) -> bytes:
    writer = PdfWriter()
    page = writer.add_blank_page(width=500, height=800)
    name = NameObject
    page[name("/Resources")] = DictionaryObject(
        {
            name("/Font"): DictionaryObject(
                {
                    name("/F1"): DictionaryObject(
                        {
                            name("/Type"): name("/Font"),
                            name("/Subtype"): name("/Type1"),
                            name("/BaseFont"): name("/Helvetica"),
                        }
                    ),
                }
            ),
        }
    )
    stream = DecodedStreamObject()
    encoded = [f"<{line.encode('ascii').hex()}> Tj T*" for line in lines]
    stream.set_data(f"BT /F1 12 Tf 18 TL 40 750 Td {' '.join(encoded)} ET".encode("ascii"))
    page.replace_contents(stream)
    out = BytesIO()
    writer.write(out)
    return out.getvalue()


def test_menu_weeks_and_generated_text_pdf():
    assert menu_weeks(MONDAY) == [MONDAY]
    assert menu_weeks(THURSDAY) == [MONDAY, NEXT]
    assert menu_links(INDEX_HTML, MENU_URL, menu_weeks(THURSDAY)) == {
        MONDAY: [(BASE + "aktualni.pdf", True)],
        NEXT: [(BASE + "dalsi.pdf", True)],
    }
    coverage, menu = parse_menu(generated_pdf(MENU_LINES), MONDAY)
    assert len(coverage) == 5
    assert menu == [
        {
            "date": "2026-11-23",
            "soup": "mrkvova",
            "main": "cizrnove placicky",
            "sides": ["kase", "okurkovy"],
            "allergens": ["lepek", "vejce", "mléko", "celer"],
        },
        {"date": "2026-11-27", "soup": "", "main": "kuskus", "sides": [], "allergens": []},
    ]
    pdf = generated_pdf(["Pondeli", "Obed: ryze (14)"])
    assert parse_menu(pdf, NEXT)[1] == []
    assert parse_menu(pdf, NEXT, True)[1][0]["allergens"] == ["měkkýši"]


def test_menu_download_links_are_selected_by_their_label_range():
    this_week, next_week = date(2031, 2, 10), date(2031, 2, 17)
    base = "https://example.org"
    path = "/modules/file_storage/download.php"
    html = f"""
    <a href="{path}?file=901&amp;inline=1">Obědy 3.2.-7.2.2031</a>
    <a href="{path}?file=902&amp;inline=1">Obědy 10.2.-14.2.2031</a>
    <a href="{path}?file=903&amp;inline=1">Obědy 17.2.-21.2.2031</a>
    <a href="{path}?file=904&amp;inline=1">Příloha</a>
    <a href="/galerie">Výstava 10.2.-14.2.2031</a>
    """
    assert menu_links(html, base, [this_week, next_week]) == {
        this_week: [(f"{base}{path}?file=902&inline=1", True)],
        next_week: [(f"{base}{path}?file=903&inline=1", True)],
    }


@pytest.mark.parametrize(
    ("label", "media_type", "accepted"),
    [
        ("Rozpis 10.2.-14.2.2031", "application/octet-stream", True),
        ("Příloha", "application/pdf", True),
        ("Příloha", "application/octet-stream", False),
    ],
)
async def test_menu_download_fetch_uses_the_range_or_pdf_content_type(
    hass, label, media_type, accepted
):
    week = date(2031, 2, 10)
    href = "/modules/file_storage/download.php?file=905"
    pdf = generated_pdf(["Pondeli 10.2.2031", "Obed: jahlove krokety"])
    fetch = AsyncMock()
    fetch.get.return_value = (pdf, f"https://example.org{href}", media_type)
    importer = SchoolImport(hass, None)
    request = importer._menu(fetch, f'<a href="{href}">{label}</a>', MENU_URL, week, [])
    if accepted:
        rows, retained = await request
        assert not retained
        assert [(row["date"], row["main"]) for row in rows] == [("2031-02-10", "jahlove krokety")]
    else:
        with pytest.raises(ValueError, match="No current school PDF"):
            await request
    fetch.get.assert_awaited_once_with(f"https://example.org{href}", "pdf")


def test_parse_menu_with_trailing_glued_meal_labels():
    week = date(2031, 2, 10)
    pdf = generated_pdf(
        [
            "Pondeli 10.2.2031",
            "mandlovy kolac, bylinkovy cajPresnidav.",
            "obsahuje alergeny: 08",
            "kvetakovy krem, jahlove krokety, pastinak,",
            "mata s ledemObed",
            "obsahuje alergeny: 01,07",
            "tvaroh s hruskou, kakaove mlekoSvacina",
            "obsahuje alergeny: 06",
            "Utery 11.2.2031",
            "cizrnovy chleb, jablecny mostPresnidav.",
            "obsahuje alergeny: 08",
            "hrachovy vyvar, dyna plnena pohankou, piskot",
            "Obed",
            "obsahuje alergeny: 03",
            "ovesne vlockySvacina",
        ]
    )
    days, rows = parse_menu(pdf, week)
    assert len(days) == 2
    assert rows == [
        {
            "date": "2031-02-10",
            "soup": "kvetakovy krem",
            "main": "jahlove krokety",
            "sides": ["pastinak", "mata s ledem"],
            "allergens": ["lepek", "mléko"],
        },
        {
            "date": "2031-02-11",
            "soup": "hrachovy vyvar",
            "main": "dyna plnena pohankou",
            "sides": ["piskot"],
            "allergens": ["vejce"],
        },
    ]


def test_parse_menu_drops_allergen_intro_in_prefix_layout():
    pdf = generated_pdf(["Pondeli 10.2.2031", "Obed: jahlove krokety obsahuje alergeny: 01,07"])
    _, rows = parse_menu(pdf, date(2031, 2, 10))
    assert rows[0]["main"] == "jahlove krokety"
    assert rows[0]["sides"] == []
    assert rows[0]["allergens"] == ["lepek", "mléko"]


def test_dates_use_their_section_heading_and_ignore_surrounding_page():
    html = """
    <div class="site-sidebar"><h2>Nástěnka</h2><ul><li>Po 7.10.2030</li></ul></div>
    <div class="site-main">
      <nav><h2>Navigace</h2><ul><li>Po 18.11.2030</li></ul></nav>
      <h2>Zkoušky souboru</h2>
      <ul><li><strong>Po 4.11.2030</strong></li><li>St 15. 1. 2031</li></ul>
      <aside><h2>Odkazy</h2><ul><li>Út 12.11.2030</li></ul></aside>
      <h2>Výměna učebnic</h2>
      <ul><li>Po 12. 5. 2031</li></ul>
      <p>Poslední aktualizace: 6.11.2030</p>
      <footer><p>8.11.2030 Archiv</p></footer>
    </div>
    <div><h2>Archiv</h2><ul><li>Čt 7.11.2030</li></ul></div>
    """
    dates = parse_events(html, date(2030, 11, 8), important=True)
    assert [(row["date"], row["title"]) for row in dates] == [
        ("2030-11-04", "Zkoušky souboru"),
        ("2031-01-15", "Zkoušky souboru"),
        ("2031-05-12", "Výměna učebnic"),
    ]


@pytest.mark.parametrize(
    ("text", "grades"),
    [
        ("4.tř.", [4]),
        ("4. tř.", [4]),
        ("3.roč.", [3]),
        ("1.-4.ročník", [1, 2, 3, 4]),
        ("4.a5.tř.", [4, 5]),
        ("4. a 5.tř.", [4, 5]),
        ("4.a", [4]),
    ],
)
def test_grades_accept_abbreviations_and_distinguish_class_letters(text, grades):
    assert grades_from_text(text) == grades


def test_events_follow_the_school_year_and_skip_update_text():
    html = """
    <main><ul>
      <li>27.9. - Papírové loutky - 4.tř.</li>
      <li>3.6.-5.6. Stavba modelů - 4. a 5.ročník</li>
      <li>7.-8.6. Čtenářská dílna - 6.třída</li>
    </ul><p>Poslední aktualizace: 6.11.2030</p><p>Archiv pořadů</p></main>
    """
    events = parse_events(html, date(2030, 11, 8))
    assert [(row["date"], row["end_date"], row["grades"]) for row in events] == [
        ("2030-09-27", None, [4]),
        ("2031-06-03", "2031-06-05", [4, 5]),
        ("2031-06-07", "2031-06-08", [6]),
    ]


def test_event_dates_grades_and_parent_reminders():
    events = parse_events(EVENTS_HTML, MONDAY)
    assert [(item["date"], item["end_date"], item["grades"]) for item in events] == [
        ("2026-11-25", None, [4, 5]),
        ("2026-11-26", None, None),
        ("2026-11-27", "2026-11-30", [8, 9]),
        ("2026-12-01", None, [4, 5, 6]),
        ("2026-12-02", "2026-12-04", None),
    ]
    assert events[3]["title"] == "Dílny"
    assert events[3]["description"] == "Program pro 4.–6. třídu"
    dates = parse_events(
        "<li>25. 11. Schůzky</li><li>4. 1. Volno</li><li>30. 8. Začátek zápisu</li>",
        MONDAY,
        True,
    )
    assert [row["date"] for row in dates] == ["2026-11-25", "2027-01-04", "2027-08-30"]
    cached = {
        "events": {"url": EVENTS_URL, "rows": events},
        "dates": {"url": DATES_URL, "rows": dates},
    }
    kid = [{"id": "dite", "grade": 4}]
    child = school_snapshot(OPTIONS, cached, MONDAY, "child", kid)
    assert child["dates"] == []
    assert child["events"][0]["person_ids"] == ["dite"]
    assert len(child["events"]) == 4
    assert len(school_snapshot(OPTIONS, cached, MONDAY, "adult", kid)["dates"]) == 3
    assert school_snapshot(OPTIONS, cached, MONDAY, "adult", kid, reminders_only=True)["dates"] == [
        {"date": "2026-11-25", "title": "Schůzky"},
    ]
    assert (
        school_snapshot({**OPTIONS, "reminder_days": 1}, cached, MONDAY, "kiosk", kid)["dates"]
        == []
    )
    assert school_snapshot({}, cached, MONDAY, "owner", kid) == {
        "enabled": False,
        "updated_at": None,
        "lunch": [],
        "events": [],
        "dates": [],
    }


@pytest.mark.asyncio
async def test_refresh_retains_cache_on_network_failure(hass):
    class Fetcher:
        failing = False

        async def get(self, url, kind="page"):
            if self.failing and url in (MENU_URL, DATES_URL):
                raise WineError("LOOKUP_FETCH_FAILED")
            return (
                {
                    MENU_URL: INDEX_HTML.encode(),
                    BASE + "aktualni.pdf": generated_pdf(MENU_LINES) if kind == "pdf" else b"",
                    BASE + "dalsi.pdf": generated_pdf(["Pondeli", "Obed: ryze"])
                    if kind == "pdf"
                    else b"",
                    EVENTS_URL: EVENTS_HTML.encode(),
                    DATES_URL: "<li>28. 11. Schůzky</li>".encode(),
                }[url],
                url,
                "application/pdf" if kind == "pdf" else "text/html",
            )

    fetcher = Fetcher()
    importer = SchoolImport(hass, None)
    save = AsyncMock()
    instant = datetime.fromisoformat("2026-11-26T08:00:00+01:00")
    with (
        patch.object(importer, "options", return_value=OPTIONS),
        patch.object(importer.store, "async_save", save),
        patch("custom_components.homebrain.family.school.create_session", return_value=AsyncMock()),
        patch("custom_components.homebrain.family.school.SafeFetcher", return_value=fetcher),
        patch("custom_components.homebrain.family.school.dt_util.now") as now,
    ):
        now.return_value = instant
        await importer.refresh()
        assert [row["date"] for row in importer.data["lunch"]["rows"]] == [
            "2026-11-23",
            "2026-11-27",
            "2026-11-30",
        ]
        before = importer.data
        fetcher.failing = True
        now.return_value = instant.replace(hour=9)
        await importer.refresh()
        assert importer.data["lunch"] == before["lunch"]
        assert importer.data["dates"] == before["dates"]
        assert importer.data["events"]["updated_at"] > before["events"]["updated_at"]
        assert save.await_count == 2
