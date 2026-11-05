#!/usr/bin/env python3
"""Municipal waste calendar scraper -> ICS + JSON cache + status/history (stdlib only).

Reads the month-calendar module ("communal_services", ``?communal_month=M&communal_year=Y``)
that many Czech municipal websites use. Each pickup is an ``<a ... data-tip="tooltipYYYYMMDD">``
block with ``<span class="gcm-communal-name">`` and venue spans.

Outputs (``--output-dir``):

- ``<prefix>.ics`` – events from the 1st of the current month on, for the
  ``waste_collection_schedule`` ICS source (unchanged since v2, so WCS sensors keep their values);
- ``<prefix>_cache.json`` – every known event incl. history (the parser's own memory);
- ``<prefix>_status.json`` – health of the last run plus ``history``
  (``{"YYYY-MM-DD": "Label, Label"}``
  for past collections up to today) and ``last_collection`` (``{"Label": "YYYY-MM-DD"}``).
  Expose ``history`` through a ``command_line`` sensor and bind it to HomeBrain ``waste_history``.

v3 (history):
- also reads ``--history-months`` past months; a finished past month is fetched once and then
  served from the cache (past pickups do not change);
- past events stay in the cache for ``--history-months`` months even after they disappear from
  the municipal web, so "last collected" survives month boundaries;
- months that fail to download keep their events from the previous cache;
- never overwrites a good ICS with an empty one.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import tempfile
import time
from collections.abc import Callable, Iterable
from datetime import UTC, date, datetime, timedelta
from html import unescape
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen

PARSER_VERSION = 3
DEFAULT_MONTHS = 14
DEFAULT_HISTORY_MONTHS = 12
TIME_BUDGET_S = 45  # HA shell_command hard timeout is 60 s

TYPE_MAP = {
    "komunalni odpad": "komunalni",
    "smesny komunalni odpad": "komunalni",
    "plasty": "plasty",
    "plast": "plasty",
    "papir": "papir",
    "barevne sklo": "sklo",
    "sklo": "sklo",
    "bile sklo": "sklo_bile",
    "cire sklo": "sklo_bile",
    "elektro odpad": "elektro",
    "nebezpecny odpad": "nebezpecny",
    "bioodpad": "bio",
    "bio odpad": "bio",
}
# ASCII labels identical to the ICS produced since 2026-04 (keeps WCS sensor values stable).
TYPE_LABELS = {
    "komunalni": "Komunalni odpad",
    "plasty": "Plasty",
    "papir": "Papir",
    "sklo": "Barevne sklo",
    "sklo_bile": "Bile sklo",
    "elektro": "Elektro odpad",
    "nebezpecny": "Nebezpecny odpad",
    "bio": "Bioodpad",
}
_TR = str.maketrans("áčďéěíňóřšťúůýžÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ", "acdeeinorstuuyzACDEEINORSTUUYZ")

Event = tuple[date, str, str]  # (day, type key, label)


def norm(text: str) -> str:
    return re.sub(r"\s+", " ", unescape(text or "").replace("\xa0", " ")).strip()


def slug(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", norm(text).translate(_TR).lower()).strip()


def fetch(url: str, month: int, year: int, retries: int = 1) -> str:
    full = url + "?" + urlencode({"communal_month": month, "communal_year": year})
    last: Exception | None = None
    for attempt in range(retries + 1):
        try:
            req = Request(full, headers={"User-Agent": "Mozilla/5.0 (HomeAssistant waste parser)"})
            with urlopen(req, timeout=10) as resp:  # noqa: S310 - fixed https URL from config
                return resp.read().decode("utf-8", errors="replace")
        except Exception as exc:  # pylint: disable=broad-except
            last = exc
            time.sleep(2 * (attempt + 1))
    raise RuntimeError(f"fetch {year}-{month:02d} failed: {last}")


BLOCK_RE = re.compile(r'(?is)<a\b[^>]*data-tip="tooltip(\d{8})"[^>]*>(.*?)</a>')
NAME_RE = re.compile(r'(?is)<span class="gcm-communal-name">(.*?)</span>')
VENUE_RE = re.compile(r'(?is)<span class="gcm-calendar-venue-(?:full)?name">(.*?)</span>')


def parse_month(html: str, locality: str, year: int, month: int) -> tuple[bool, set[Event]]:
    """Return (module_present, set of (date, type_key, label))."""
    if "communal_services" not in html:
        return False, set()
    want = slug(locality)
    out: set[Event] = set()
    for ymd, body in BLOCK_RE.findall(html):
        try:
            day = datetime.strptime(ymd, "%Y%m%d").date()
        except ValueError:
            continue
        if (day.year, day.month) != (year, month):
            continue  # leading/trailing days of neighbouring months
        venues = {slug(re.sub(r"<[^>]+>", " ", v)) for v in VENUE_RE.findall(body)}
        if venues and not any(v == want or v.startswith(want + " ") for v in venues):
            continue
        for raw in NAME_RE.findall(body):
            label = norm(re.sub(r"<[^>]+>", " ", raw))
            if not label:
                continue
            key = TYPE_MAP.get(slug(label), slug(label).replace(" ", "_"))
            out.add((day, key, TYPE_LABELS.get(key, label)))
    return True, out


def build_ics(events: Iterable[Event], locality: str, generated_at: datetime) -> str:
    ts = generated_at.strftime("%Y%m%dT%H%M%SZ")
    rows = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//homeassistant//odpady//cs",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        "X-WR-CALNAME:Svoz odpadu",
    ]
    for day, key, label in events:
        rows += [
            "BEGIN:VEVENT",
            f"UID:{day.isoformat()}-{key}@odpady",
            f"DTSTAMP:{ts}",
            f"DTSTART;VALUE=DATE:{day:%Y%m%d}",
            f"DTEND;VALUE=DATE:{day + timedelta(days=1):%Y%m%d}",
            f"SUMMARY:{label}",
            f"CATEGORIES:{key}",
            f"DESCRIPTION:Lokalita {locality}",
            "END:VEVENT",
        ]
    rows.append("END:VCALENDAR")
    return "\r\n".join(rows) + "\r\n"


def atomic_write(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(
        "w", encoding="utf-8", delete=False, dir=str(path.parent)
    ) as tmp:
        tmp.write(content)
    Path(tmp.name).chmod(0o644)
    Path(tmp.name).replace(path)


def add_months(year: int, month: int, delta: int) -> tuple[int, int]:
    index = year * 12 + (month - 1) + delta
    return index // 12, index % 12 + 1


def month_tag(year: int, month: int) -> str:
    return f"{year}-{month:02d}"


def history_from(events: Iterable[Event], today: date) -> tuple[dict[str, str], dict[str, str]]:
    """Past collections up to today: ``{date: "A, B"}`` and ``{label: last date}``."""
    by_day: dict[str, list[str]] = {}
    last: dict[str, str] = {}
    for day, _key, label in sorted(events):
        if day > today:
            continue
        by_day.setdefault(day.isoformat(), []).append(label)
        last[label] = day.isoformat()
    return {day: ", ".join(sorted(set(labels))) for day, labels in by_day.items()}, last


def load_cache(path: Path) -> dict:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:  # pylint: disable=broad-except
        return {}


def cached_events(old: dict) -> set[Event]:
    return {
        (date.fromisoformat(e["date"]), e["type"], e.get("type_label") or e["type"])
        for e in old.get("events", [])
        if isinstance(e, dict) and "date" in e and "type" in e
    }


def collect(
    *,
    url: str,
    locality: str,
    months: int,
    history_months: int,
    today: date,
    old: dict,
    fetcher: Callable[[str, int, int], str] | None = None,
    clock: Callable[[], float] = time.monotonic,
) -> dict:
    """Fetch the month window, merge it with the cache and return the run result."""
    fetcher = fetcher or fetch
    old_events = cached_events(old)
    old_by_month: dict[tuple[int, int], set[Event]] = {}
    for ev in old_events:
        old_by_month.setdefault((ev[0].year, ev[0].month), set()).add(ev)
    done_past = set(old.get("months_complete", []))

    events: set[Event] = set()
    months_ok: list[str] = []
    months_empty: list[str] = []
    months_failed: list[str] = []
    months_cached: list[str] = []
    complete: set[str] = set()
    deadline = clock() + TIME_BUDGET_S
    first = add_months(today.year, today.month, -max(0, history_months))
    # Current month first (most important), then the future, then history (newest first).
    order = [add_months(today.year, today.month, i) for i in range(max(1, months))]
    order += [add_months(today.year, today.month, -i) for i in range(1, max(0, history_months) + 1)]
    for y, m in order:
        tag = month_tag(y, m)
        is_past = (y, m) < (today.year, today.month)
        if is_past and tag in done_past:
            events |= old_by_month.get((y, m), set())
            months_cached.append(tag)
            complete.add(tag)
            continue
        try:
            if clock() > deadline:
                raise RuntimeError("skipped (time budget)")
            present, evs = parse_month(fetcher(url, m, y), locality, y, m)
            if not present:
                raise RuntimeError("calendar module not found in page (layout changed?)")
            if not evs and old_by_month.get((y, m)) and is_past:
                # Web dropped an old month: keep what we saw before (history is immutable).
                evs = old_by_month[(y, m)]
            (months_ok if evs else months_empty).append(tag)
            events |= evs
            if is_past and evs:
                complete.add(tag)
        except Exception as exc:  # pylint: disable=broad-except
            months_failed.append(f"{tag}: {exc}")
            events |= old_by_month.get((y, m), set())

    # Past events the web no longer lists stay (within the history window).
    first_day = date(first[0], first[1], 1)
    events |= {ev for ev in old_events if first_day <= ev[0] < today}
    events = {ev for ev in events if ev[0] >= first_day}
    ordered = sorted(events, key=lambda e: (e[0], e[1]))
    future = [e for e in ordered if e[0] >= today]
    history, last = history_from(ordered, today)
    return {
        "events": ordered,
        "future": future,
        "history": history,
        "last_collection": last,
        "months_ok": sorted(months_ok),
        "months_empty": sorted(months_empty),
        "months_failed": months_failed,
        "months_cached": sorted(months_cached),
        "months_complete": sorted(complete),
    }


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Municipal waste calendar scraper (ICS + history).")
    ap.add_argument("--url", required=True, help="page with the communal_services month calendar")
    ap.add_argument("--locality", required=True, help="venue / part of the municipality")
    ap.add_argument("--months", type=int, default=DEFAULT_MONTHS, help="months ahead incl. current")
    ap.add_argument(
        "--history-months",
        type=int,
        default=DEFAULT_HISTORY_MONTHS,
        help="past months kept as collection history (0 = none)",
    )
    ap.add_argument("--output-dir", required=True)
    ap.add_argument("--prefix", default="odpady", help="output file name prefix")
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args(argv)

    out_dir = Path(a.output_dir)
    ics_path = out_dir / f"{a.prefix}.ics"
    cache_path = out_dir / f"{a.prefix}_cache.json"
    status_path = out_dir / f"{a.prefix}_status.json"
    now = datetime.now(UTC)
    today = date.today()
    old = load_cache(cache_path)

    run = collect(
        url=a.url,
        locality=a.locality,
        months=a.months,
        history_months=a.history_months,
        today=today,
        old=old,
    )
    events, future = run["events"], run["future"]
    month_start = today.replace(day=1)
    valid_to = max((e[0] for e in events), default=None)
    status = {
        "status": "ok"
        if future and not run["months_failed"]
        else ("partial" if future else "error"),
        "last_attempt": now.isoformat(),
        "last_success": now.isoformat() if future else old.get("generated_at"),
        "locality": a.locality,
        "events_count": len(future),
        "next_date": future[0][0].isoformat() if future else None,
        "valid_to": valid_to.isoformat() if valid_to else old.get("valid_to"),
        "months_with_data": [
            m for m in run["months_ok"] if m >= month_tag(today.year, today.month)
        ],
        "months_not_published": [
            m for m in run["months_empty"] if m >= month_tag(today.year, today.month)
        ],
        "months_failed": run["months_failed"],
        "history_from": min(run["history"], default=None),
        "history_count": len(run["history"]),
        "last_collection": run["last_collection"],
        "history": run["history"],
        "error": "" if future else "no future events parsed (not published yet or layout changed)",
        "parser_version": PARSER_VERSION,
    }
    if a.dry_run:
        print(json.dumps(status, ensure_ascii=False, indent=2))
        for e in future[:5]:
            print(e[0], e[2])
        return 0 if future else 1
    if future:
        atomic_write(
            ics_path, build_ics([e for e in events if e[0] >= month_start], a.locality, now)
        )
        atomic_write(
            cache_path,
            json.dumps(
                {
                    "schema_version": 3,
                    "locality": a.locality,
                    "generated_at": now.isoformat(),
                    "events_count": len(events),
                    "valid_to": status["valid_to"],
                    "months_complete": run["months_complete"],
                    "events": [
                        {"date": d.isoformat(), "type": k, "type_label": lbl}
                        for d, k, lbl in events
                    ],
                },
                ensure_ascii=False,
                indent=2,
            ),
        )
    atomic_write(status_path, json.dumps(status, ensure_ascii=False, indent=2))
    if not future:
        print("[odpady] refresh failed: " + status["error"], file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
