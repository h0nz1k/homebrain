"""Municipal-web waste parser (scripts/waste/gcm_waste_parser.py): history and caching."""

import importlib.util
import json
from datetime import date
from pathlib import Path

import pytest

SCRIPT = Path(__file__).resolve().parents[2] / "scripts" / "waste" / "gcm_waste_parser.py"
_spec = importlib.util.spec_from_file_location("gcm_waste_parser", SCRIPT)
assert _spec and _spec.loader
parser = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(parser)

TODAY = date(2026, 11, 2)
# Synthetic month pages in the communal_services layout (no real municipality data).
PAGES = {
    (2026, 9): [("20260921", "Plasty", "Obec"), ("20260924", "Barevné sklo", "Obec")],
    (2026, 10): [
        ("20261005", "Plasty", "Obec"),
        ("20261019", "Plasty", "Obec"),
        ("20261020", "Papír", "Obec"),
        ("20261021", "Komunální odpad", "Jiná obec"),
        ("20261101", "Plasty", "Obec"),  # trailing day of the next month
    ],
    (2026, 11): [
        ("20261102", "Plasty", "Obec"),
        ("20261103", "Papír", "Obec"),
        ("20261112", "Barevné sklo", "Obec"),
    ],
}


def page(year: int, month: int) -> str:
    blocks = "".join(
        f'<a href="#" data-tip="tooltip{ymd}"><span class="gcm-communal-name">{name}</span>'
        f'<span class="gcm-calendar-venue-name">{venue}</span></a>'
        for ymd, name, venue in PAGES.get((year, month), [])
    )
    return f'<div class="communal_services">{blocks}</div>'


class Fetcher:
    def __init__(self, fail: set[tuple[int, int]] | None = None) -> None:
        self.calls: list[tuple[int, int]] = []
        self.fail = fail or set()

    def __call__(self, _url: str, month: int, year: int) -> str:
        self.calls.append((year, month))
        if (year, month) in self.fail:
            raise RuntimeError("offline")
        return page(year, month)


def run(old: dict, fetcher: Fetcher, history_months: int = 2) -> dict:
    return parser.collect(
        url="https://example.invalid/svoz",
        locality="Obec",
        months=2,
        history_months=history_months,
        today=TODAY,
        old=old,
        fetcher=fetcher,
    )


def as_cache(result: dict) -> dict:
    return {
        "months_complete": result["months_complete"],
        "events": [
            {"date": d.isoformat(), "type": k, "type_label": lbl} for d, k, lbl in result["events"]
        ],
    }


def test_parse_month_filters_locality_and_neighbour_days():
    present, events = parser.parse_month(page(2026, 10), "Obec", 2026, 10)
    assert present
    assert sorted((d.isoformat(), lbl) for d, _k, lbl in events) == [
        ("2026-10-05", "Plasty"),
        ("2026-10-19", "Plasty"),
        ("2026-10-20", "Papir"),
    ]
    assert parser.parse_month("<html></html>", "Obec", 2026, 10) == (False, set())


def test_history_includes_today_and_last_collection_per_type():
    result = run({}, Fetcher())
    assert result["history"] == {
        "2026-09-21": "Plasty",
        "2026-09-24": "Barevne sklo",
        "2026-10-05": "Plasty",
        "2026-10-19": "Plasty",
        "2026-10-20": "Papir",
        "2026-11-02": "Plasty",
    }
    assert result["last_collection"] == {
        "Plasty": "2026-11-02",
        "Barevne sklo": "2026-09-24",
        "Papir": "2026-10-20",
    }
    assert [e[0].isoformat() for e in result["future"]] == [
        "2026-11-02",
        "2026-11-03",
        "2026-11-12",
    ]
    assert result["months_complete"] == ["2026-09", "2026-10"]


def test_finished_past_months_come_from_cache():
    first = run({}, Fetcher())
    fetcher = Fetcher()
    second = run(as_cache(first), fetcher)
    assert (2026, 9) not in fetcher.calls and (2026, 10) not in fetcher.calls
    assert second["history"] == first["history"]


def test_history_survives_web_outage_and_removal():
    first = run({}, Fetcher())
    # The web is down for the current month and already dropped September.
    PAGES_BACKUP = dict(PAGES)
    try:
        PAGES.pop((2026, 9))
        result = run({"events": as_cache(first)["events"]}, Fetcher(fail={(2026, 11)}))
    finally:
        PAGES.clear()
        PAGES.update(PAGES_BACKUP)
    assert "2026-09-21" in result["history"]
    assert "2026-11-02" in result["history"]
    assert result["months_failed"] == ["2026-11: offline"]


def test_history_window_limits_old_events():
    result = run({}, Fetcher(), history_months=1)
    assert min(result["history"]) == "2026-10-05"


def test_main_writes_ics_without_history_and_status_with_history(tmp_path, monkeypatch):
    class Today(date):
        @classmethod
        def today(cls):
            return TODAY

    monkeypatch.setattr(parser, "date", Today)
    monkeypatch.setattr(parser, "fetch", lambda url, month, year: page(year, month))
    rc = parser.main(
        [
            "--url",
            "https://example.invalid/svoz",
            "--locality",
            "Obec",
            "--months",
            "2",
            "--history-months",
            "2",
            "--output-dir",
            str(tmp_path),
        ]
    )
    assert rc == 0
    ics = (tmp_path / "odpady.ics").read_text()
    assert "DTSTART;VALUE=DATE:20261102" in ics
    assert "20261019" not in ics  # the ICS keeps its v2 window (from the 1st of this month)
    status = json.loads((tmp_path / "odpady_status.json").read_text())
    assert status["parser_version"] == 3
    assert status["history"]["2026-10-19"] == "Plasty"
    assert status["history_from"] == "2026-09-21"
    assert status["months_with_data"] == ["2026-11"]


@pytest.mark.parametrize("missing", [["--url", "x"], ["--locality", "x"]])
def test_url_and_locality_are_required(missing, tmp_path):
    with pytest.raises(SystemExit):
        parser.main([*missing, "--output-dir", str(tmp_path)])
