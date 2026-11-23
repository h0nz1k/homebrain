"""Timetable: synthetic bell page, pure schedule functions and the WS snapshot. Refs #175."""

from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

import pytest
import voluptuous as vol

from custom_components.homebrain.family.school_parse import parse_bells
from custom_components.homebrain.family.timetable import (
    DEFAULT_ITEMS,
    TIMETABLE_SETTINGS,
    at_school,
    build_context,
    day_schedule,
    holiday_dates,
    is_school_day,
    next_school_day,
    timetable_snapshot,
)

PRAGUE = ZoneInfo("Europe/Prague")
MONDAY = date(2026, 11, 23)
WEDNESDAY = date(2026, 11, 25)
BELLS_HTML = """
<main>
  <h2>Časový rozvrh vyučování</h2>
  <ul>
    <li>1. hodina 7.30 – 8.15</li>
    <li>2. hodina 8.25 – 9.10</li>
    <li>3. hodina 9.30 – 10.15</li>
    <li>4. hodina 10.25 – 11.10</li>
    <li>5. hodina 11.20 – 12.05</li>
    <li>6. hodina 12.15 – 13.00</li>
  </ul>
  <p><strong>STŘEDA – 8. – 9. ročník</strong></p>
  <p><strong>POLEDNÍ PŘESTÁVKA – 12.05 – 13.05</strong></p>
  <ul>
    <li>6. hodina 13.05 – 13.50</li>
    <li>7. hodina 13.55 – 14.40</li>
  </ul>
</main>
<footer><ul><li>1. hodina 0.00 – 0.45</li></ul></footer>
"""
BELLS = [
    {"start": "07:30", "end": "08:15"},
    {"start": "08:25", "end": "09:10"},
    {"start": "09:30", "end": "10:15"},
    {"start": "10:25", "end": "11:10"},
    {"start": "11:20", "end": "12:05"},
    {"start": "12:15", "end": "13:00"},
]
AFTERNOON = {
    "weekday": 2,
    "grades": [8, 9],
    "lunch": {"start": "12:05", "end": "13:05"},
    "periods": [
        {"period": 6, "start": "13:05", "end": "13:50"},
        {"period": 7, "start": "13:55", "end": "14:40"},
    ],
}
# Synthetic children: Ema (4th grade) and Kuba (9th grade, afternoon lessons on Wednesday).
EMA = {
    "days": [
        ["Čj", "M", "Aj", "Vl", "Tv"],
        ["Čj", "M", "Vv", "Vv", "Hv"],
        ["Čj", "M", "Př", "Aj", "Inf", "Pč"],
        ["Čj", "M", "Vl", "Tv", "Tv"],
        ["Čj", "", "M", "Aj", "Př"],
    ],
    "afternoon_days": None,
}
KUBA = {
    "days": [
        ["M", "Čj", "Aj", "F", "D", "Z"],
        ["Ch", "M", "Čj", "Př", "Tv", "Tv"],
        ["Čj", "M", "Aj", "Nj", "F", "Tv", "Tv"],
        ["M", "Čj", "Inf", "Ch", "D"],
        ["Aj", "M", "Čj", "Z", "Nj"],
    ],
    "afternoon_days": None,
}


def ctx(holidays=None, free=None, afternoon=AFTERNOON):
    return build_context(
        {"items": DEFAULT_ITEMS, "free": free or []},
        {"bells": BELLS, "afternoon": afternoon},
        holidays or {},
        PRAGUE,
    )


def test_parse_bells_reads_shared_times_and_afternoon_variant():
    assert parse_bells(BELLS_HTML) == {"bells": BELLS, "afternoon": AFTERNOON}
    assert parse_bells("<ul><li>1. hod. 8:00 - 8:45</li></ul>")["afternoon"] is None
    with pytest.raises(ValueError):
        parse_bells("<p>Rozvrh bude doplněn.</p>")


def test_double_periods_and_items_per_day():
    tuesday = day_schedule(EMA, 4, MONDAY + timedelta(days=1), ctx())
    assert [lesson["subject"] for lesson in tuesday["lessons"]] == ["Čj", "M", "Vv", "Vv", "Hv"]
    assert (tuesday["start"], tuesday["end"]) == ("07:30", "12:05")
    # Hv has an empty default, Vv appears once despite the double period.
    assert tuesday["bring"] == [{"subject": "Vv", "item": "výtvarné potřeby"}]
    friday = day_schedule(EMA, 4, MONDAY + timedelta(days=4), ctx())
    assert [lesson["period"] for lesson in friday["lessons"]] == [1, 3, 4, 5]


def test_afternoon_override_applies_only_to_matching_grade_and_weekday():
    kuba = day_schedule(KUBA, 9, WEDNESDAY, ctx())
    assert [(row["period"], row["start"], row["end"]) for row in kuba["lessons"][-2:]] == [
        (6, "13:05", "13:50"),
        (7, "13:55", "14:40"),
    ]
    assert kuba["end"] == "14:40"
    assert kuba["lunch"] == {"start": "12:05", "end": "13:05"}
    ema = day_schedule(EMA, 4, WEDNESDAY, ctx())
    assert (ema["end"], ema["lunch"]) == ("13:00", None)
    # A manual per-child choice wins over the imported grades.
    moved = {**KUBA, "afternoon_days": [1]}
    assert day_schedule(moved, 9, WEDNESDAY, ctx())["lessons"][5]["start"] == "12:15"
    assert day_schedule(moved, 9, WEDNESDAY - timedelta(days=1), ctx())["end"] == "13:50"


def test_manual_bells_win_over_import():
    manual = build_context({"bells": [{"start": "08:00", "end": "08:45"}]}, {"bells": BELLS}, {})
    assert day_schedule(EMA, 4, MONDAY, manual)["lessons"] == [
        {"period": 1, "subject": "Čj", "start": "08:00", "end": "08:45"}
    ]


def test_weekend_holiday_and_free_ranges():
    holidays = holiday_dates(
        [
            {"start": "2026-10-28", "end": "2026-10-29", "summary": "Den vzniku státu"},
            {"start": "2026-12-24", "end": "2026-12-27", "summary": "Vánoce"},
        ]
    )
    assert holidays == {
        "2026-10-28": "Den vzniku státu",
        "2026-12-24": "Vánoce",
        "2026-12-25": "Vánoce",
        "2026-12-26": "Vánoce",
    }
    free = [{"start": "2026-10-29", "end": "2026-10-30", "label": "Podzimní prázdniny"}]
    context = ctx(holidays, free)
    assert not is_school_day(date(2026, 11, 28), context)
    assert not is_school_day(date(2026, 10, 28), context)
    assert is_school_day(MONDAY, context)
    holiday = day_schedule(EMA, 4, date(2026, 10, 29), context)
    assert (holiday["school"], holiday["free"], holiday["lessons"]) == (
        False,
        "Podzimní prázdniny",
        [],
    )
    assert day_schedule(EMA, 4, date(2026, 11, 28), context)["free"] is None
    # Tuesday evening before the holidays: the next school day is the Monday after.
    evening = datetime(2026, 10, 27, 19, 0, tzinfo=PRAGUE)
    assert next_school_day(EMA, 4, evening, context)["date"] == "2026-11-02"


def test_next_school_day_switches_after_the_last_lesson():
    context = ctx()
    assert (
        next_school_day(EMA, 4, datetime(2026, 11, 23, 11, 0, tzinfo=PRAGUE), context)["date"]
        == "2026-11-23"
    )
    assert (
        next_school_day(EMA, 4, datetime(2026, 11, 23, 12, 5, tzinfo=PRAGUE), context)["date"]
        == "2026-11-24"
    )
    friday = datetime(2026, 11, 27, 15, 0, tzinfo=PRAGUE)
    assert next_school_day(EMA, 4, friday, context)["date"] == "2026-11-30"
    assert next_school_day({"days": [[]] * 5}, 4, friday, context) is None


def test_lesson_times_follow_local_clock_across_dst():
    # Summer time ends on Sunday 2026-10-25; Monday lessons still start at 7:30 local.
    context = ctx()
    before = datetime(2026, 10, 26, 6, 29, tzinfo=ZoneInfo("UTC"))  # 7:29 CET
    during = datetime(2026, 10, 26, 6, 31, tzinfo=ZoneInfo("UTC"))  # 7:31 CET
    assert not at_school(EMA, 4, before, context)
    assert at_school(EMA, 4, during, context)
    # Friday before the change is still CEST (UTC+2).
    assert at_school(EMA, 4, datetime(2026, 10, 23, 5, 31, tzinfo=ZoneInfo("UTC")), context)
    assert not at_school(EMA, 4, datetime(2026, 10, 23, 10, 6, tzinfo=ZoneInfo("UTC")), context)
    # Spring forward (2027-03-28): Monday 7:30 CEST = 5:30 UTC.
    assert at_school(EMA, 4, datetime(2027, 3, 29, 5, 31, tzinfo=ZoneInfo("UTC")), context)
    # Weekends never count as school, whatever the clock.
    assert not at_school(EMA, 4, datetime(2026, 11, 28, 9, 0, tzinfo=PRAGUE), context)


def test_settings_schema_defaults_and_validation():
    settings = TIMETABLE_SETTINGS({})
    assert settings["holiday_calendar"] == "auto"
    assert settings["items"]["Tv"] == "cvičky a úbor"
    assert settings["children"] == {}
    child = TIMETABLE_SETTINGS({"children": {"ema": {}}})["children"]["ema"]
    assert child == {"days": [[], [], [], [], []], "afternoon_days": None}
    for bad in (
        {"bells": [{"start": "08:45", "end": "08:00"}]},
        {"bells": [{"start": "8:00", "end": "08:45"}]},
        {"free": [{"start": "2026-11-02", "end": "2026-11-01", "label": "Volno"}]},
        {"holiday_calendar": "sensor.x"},
        {"children": {"ema": {"days": [[]] * 4}}},
        {"children": {"ema": {"days": [["M"] * 10] + [[]] * 4}}},
    ):
        with pytest.raises(vol.Invalid):
            TIMETABLE_SETTINGS(bad)


def test_snapshot_roles_and_children_without_timetable():
    options = TIMETABLE_SETTINGS(
        {"children": {"ema-id": EMA, "kuba-id": KUBA, "other": {"days": [[]] * 5}}}
    )
    kids = [
        {"id": "ema", "choreops_user_id": "ema-id", "name": "Ema", "grade": 4},
        {"id": "kuba", "choreops_user_id": "kuba-id", "name": "Kuba", "grade": 9},
        {"id": "other", "choreops_user_id": "other", "name": "Bez rozvrhu", "grade": 2},
    ]
    now = datetime(2026, 11, 25, 9, 0, tzinfo=PRAGUE)
    imported = {"bells": BELLS, "afternoon": AFTERNOON}
    snap = timetable_snapshot(options, imported, {}, kids, now, "adult")
    assert snap["enabled"] and snap["today"] == "2026-11-25"
    assert [child["name"] for child in snap["children"]] == ["Ema", "Kuba"]
    kuba = snap["children"][1]
    assert kuba["afternoon_days"] == [2]
    assert kuba["days"][0]["end"] == "14:40"
    assert kuba["next"]["date"] == "2026-11-25"
    assert len(kuba["days"]) == 8
    kiosk = timetable_snapshot(options, imported, {}, kids, now, "kiosk")
    assert kiosk == {
        "enabled": False,
        "today": "2026-11-25",
        "bells": [],
        "afternoon": None,
        "children": [],
    }
