"""Extract dates, events and lunch from public Czech school publications."""

from __future__ import annotations

import re
import unicodedata
from datetime import date, timedelta
from html.parser import HTMLParser
from io import BytesIO
from urllib.parse import parse_qs, unquote, urljoin, urlsplit

_CELL = "\x00"

ALLERGENS = (
    "lepek",
    "korýši",
    "vejce",
    "ryby",
    "arašídy",
    "sója",
    "mléko",
    "ořechy",
    "celer",
    "hořčice",
    "sezam",
    "oxid siřičitý",
    "vlčí bob",
    "měkkýši",
)
WEEKDAYS = r"pondeli|utery|streda|ctvrtek|patek|po|ut|st|ct|pa"
DAY = r"(?<![\d.])\d{1,2}\s*\.\s*\d{1,2}\s*\.(?:\s*\d{4}(?!\d))?(?!\d)"
ISO_DAY = r"(?<!\d)\d{4}-\d{2}-\d{2}(?!\d)"
DATE = rf"(?:{ISO_DAY}|{DAY})"
SPAN = re.compile(
    rf"(?:(?P<short>\d{{1,2}}\s*\.)\s*(?:[-–—]|až|az)\s*)?"
    rf"(?P<start>{DATE})(?:\s*(?:[-–—]|až|az|do)\s*(?P<end>{DATE}))?",
    re.I,
)
GRADE_LIST = r"[1-9]\s*\.?(?:\s*(?:až|az|[-–—]|,|/|a|i)\s*[1-9]\s*\.?)*"
GRADES = re.compile(rf"(?<!\w)({GRADE_LIST})\s*(?:trid\w*\b|rocnik\w*\b|tr\.|roc\.)")
CLASSES = re.compile(r"(?<![\w.])([1-9])\s*\.\s*[abc]\b(?!\s*[1-9])", re.I)
ALLERGEN_CODES = re.compile(
    r"\(\s*(?:alergeny\s*[: ]\s*)?(\d{1,2}(?:\s*[,;/+ ]\s*\d{1,2})*)\s*\)"
    r"|\b(?:obsahuje\s+)?(?:alergeny|al\.)\s*:?\s*(\d{1,2}(?:\s*[,;/+ ]\s*\d{1,2})*)",
    re.I,
)


def plain(value: str) -> str:
    return "".join(
        c for c in unicodedata.normalize("NFD", value.casefold()) if not unicodedata.combining(c)
    )


def compact(value: str) -> str:
    return " ".join(value.split())


def _day(raw: str, near: date, school_year: int | None = None) -> date:
    if "-" in raw:
        return date.fromisoformat(raw)
    day, month, year = (re.sub(r"\s+", "", raw) + ".").split(".")[:3]
    if year:
        return date(int(year), int(month), int(day))
    if school_year is not None:
        return date(school_year + (int(month) < 9), int(month), int(day))
    choices = []
    for candidate in (near.year, near.year + 1, near.year - 1):
        try:
            choices.append(date(candidate, int(month), int(day)))
        except ValueError:
            continue
    if not choices:
        raise ValueError("Invalid school date")
    return min(choices, key=lambda value: abs(value - near))


def _span(match: re.Match, near: date, school_year: int | None = None) -> tuple[date, date | None]:
    first = _day(match["start"], near, school_year)
    if match["short"]:
        start = first.replace(day=int(match["short"].split(".")[0]))
        if start > first:
            raise ValueError("Invalid school date range")
        return start, first
    if not match["end"]:
        return first, None
    last = _day(match["end"], first)
    if last < first:
        raise ValueError("Invalid school date range")
    return first, last


class SchoolHTML(HTMLParser):
    """Keep text together within table rows, list items and individual content blocks."""

    _SKIP = {"script", "style", "nav", "aside", "footer", "template", "header"}
    _GROUP = {"tr", "li", "dt", "dd"}
    _HEADINGS = {"h1", "h2", "h3", "h4", "h5", "h6"}
    _BREAK = {"article", "p", "div", "main", "section", "br", "hr"} | _HEADINGS
    _MAIN = re.compile(r"(?:^|[-_])main$|^main[-_]content$", re.I)
    _SIDEBAR = re.compile(r"(?:^|[-_])sidebar(?:$|[-_])", re.I)

    def __init__(self, html: str) -> None:
        super().__init__()
        self.rows: list[tuple[str, str]] = []
        self.links: list[tuple[str, str]] = []
        self._main_rows: list[tuple[str, str]] = []
        self._main_links: list[tuple[str, str]] = []
        self._has_main = False
        self._main_depth = 0
        self._main_tag = ""
        self._pending: list[str] = []
        self._skip: list[str] = []
        self._group: list[str] = []
        self._heading = ""
        self._anchor: tuple[str, list[str]] | None = None
        self.feed(html)
        self.close()
        self._flush()
        if self._has_main:
            self.rows = self._main_rows
            self.links = self._main_links

    def _flush(self, tag: str = "") -> None:
        if row := compact("".join(self._pending)):
            (self._main_rows if self._main_depth else self.rows).append((tag, row))
        self._pending.clear()

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        markers = (attrs.get("id") or "").split() + (attrs.get("class") or "").split()
        role = attrs.get("role")
        if self._skip:
            # Count nested elements with the same tag as the skipped container.
            if tag == self._skip[-1]:
                self._skip.append(tag)
            return
        if (
            tag in self._SKIP
            or (
                tag in {"div", "section"}
                and any(self._SIDEBAR.search(marker) for marker in markers)
            )
            or role in {"navigation", "complementary", "contentinfo"}
        ):
            self._flush(self._heading)
            self._skip.append(tag)
            return
        if self._main_depth:
            if tag == self._main_tag:
                self._main_depth += 1
        elif (
            tag == "main"
            or role == "main"
            or (tag in {"div", "section"} and any(self._MAIN.search(marker) for marker in markers))
        ):
            self._flush()
            self._has_main = True
            self._main_depth, self._main_tag = 1, tag
        if tag in self._GROUP:
            if not self._group:
                self._flush()
            self._group.append(tag)
        if tag in self._BREAK and not self._group and self._anchor is None:
            self._flush()
        elif tag in {"td", "th"}:
            self._pending.append(_CELL)
        elif tag in self._BREAK:
            self._pending.append(" ")
        if tag in self._HEADINGS and not self._group:
            self._heading = tag
        if tag == "a" and (href := attrs.get("href")):
            self._anchor = (href, [])

    def handle_endtag(self, tag):
        if self._skip:
            if tag == self._skip[-1]:
                self._skip.pop()
            return
        if tag == "a" and self._anchor:
            href, parts = self._anchor
            links = self._main_links if self._main_depth else self.links
            links.append((href, compact("".join(parts))))
            self._anchor = None
        if self._group and tag == self._group[-1]:
            self._group.pop()
            if not self._group:
                self._flush(tag)
        elif tag in self._BREAK:
            if self._group:
                self._pending.append(" ")
            else:
                self._flush(self._heading)
        if tag == self._heading:
            self._heading = ""
        if tag == self._main_tag and self._main_depth:
            if self._main_depth == 1:
                self._flush()
            self._main_depth -= 1

    def handle_data(self, data):
        if not self._skip:
            self._pending.append(data)
            if self._anchor:
                self._anchor[1].append(data)


def grades_from_text(text: str) -> list[int] | None:
    text = plain(text)
    if re.search(r"\b(?:cela skol\w*|celoskol\w*|vsichni)\b", text):
        return None
    grades = {int(match[1]) for match in CLASSES.finditer(text)}
    for match in GRADES.finditer(text):
        group = match[1]
        grades.update(int(value) for value in re.findall(r"[1-9]", group))
        for lower, upper in re.findall(r"([1-9])\s*\.?\s*(?:az|[-–—])\s*([1-9])", group):
            grades.update(range(int(lower), int(upper) + 1))
    return sorted(grades) or None


def parse_events(html: str, near: date, important: bool = False) -> list[dict]:
    events = []
    school_year = near.year - (near.month < 9)
    section = ""
    # A standalone date heading can be followed by a separate paragraph for the title.
    pending = None
    for tag, raw in SchoolHTML(html).rows:
        row = raw.replace(_CELL, " ").strip()
        if plain(row).startswith("posledni aktualizace"):
            pending = None
            continue
        if tag in SchoolHTML._HEADINGS:
            section = row if tag == "h2" and not SPAN.search(row) else ""
        match = SPAN.search(row)
        if match:
            prefix = re.sub(
                rf"^(?:{WEEKDAYS})(?:\.\s*|\s+|$)", "", plain(row[: match.start()]).strip()
            )
            content = f"{row[: match.start()] if prefix else ''} {row[match.end() :]}"
            # Preserve explicit titles and descriptions when the source uses table columns.
            cells = [compact(cell).strip(" :–—-|,") for cell in raw.split(_CELL)]
            if len(cells) > 1:
                content = _CELL.join(
                    SPAN.sub("", cell, count=1) if SPAN.search(cell) else cell for cell in cells
                )
            parts = [part.strip(" :–—-|,") for part in content.split(_CELL)]
            parts = [
                part for part in parts if part and plain(part).strip(".") not in WEEKDAYS.split("|")
            ]
            title = compact(parts[0]) if parts else ""
            description = compact(" ".join(parts[1:]))
            if important and tag == "li" and not title:
                title = section
                pending = None
                if not title:
                    continue
            try:
                first, last = _span(match, near, school_year)
            except ValueError:
                pending = None
                continue
            pending = (first, last)
        else:
            title = row if pending else ""
            description = ""
            # Some lists put the audience on a new line after the name.
            if not pending and events and re.match(r"^(?:pro\s+)?[1-9]\b", plain(row)):
                if grades := grades_from_text(row):
                    events[-1]["grades"] = sorted(set((events[-1]["grades"] or []) + grades))
        if title and pending:
            first, last = pending
            events.append(
                {
                    "date": first.isoformat(),
                    "end_date": last.isoformat() if last else None,
                    "title": title[:400],
                    "grades": grades_from_text(f"{title} {description}"),
                    "description": description[:800],
                }
            )
            pending = None
    return list(
        {
            (row["date"], row["end_date"], row["title"], row["description"]): row for row in events
        }.values()
    )


def menu_weeks(today: date) -> list[date]:
    monday = today - timedelta(days=today.weekday())
    return [monday, monday + timedelta(days=7)] if today.weekday() >= 3 else [monday]


def menu_links(html: str, base: str, weeks: list[date]) -> dict[date, list[tuple[str, bool]]]:
    """Prefer dated links and limit inspection of undated links in document order."""
    links = SchoolHTML(html).links
    result: dict[date, list[tuple[str, bool]]] = {week: [] for week in weeks}
    undated = []
    for href, label in links:
        try:
            target = urlsplit(href)
            path = unquote(target.path)
            pdf_path = path.lower().endswith(".pdf")
            download = path.lower().endswith("/download.php") and "file" in parse_qs(target.query)
            if not pdf_path and not download:
                continue
            url = urljoin(base, href)
            hint = SPAN.search(label)
            if pdf_path:
                hint = hint or SPAN.search(path)
            elif hint and not (hint["short"] or hint["end"]):
                hint = None
            iso_week = re.search(r"(?<!\d)(\d{4})[-_ ]?W(\d{2})(?!\d)", f"{label} {path}", re.I)
            if hint:
                first, last = _span(hint, weeks[0])
            elif iso_week and pdf_path:
                first, last = date.fromisocalendar(int(iso_week[1]), int(iso_week[2]), 1), None
            else:
                undated.append((url, False))
                continue
        except ValueError:
            continue
        for week in weeks:
            if first <= week + timedelta(days=6) and (last or first) >= week:
                result[week].append((url, week <= first < week + timedelta(days=5)))
    return {week: list(dict.fromkeys(urls or undated))[:4] for week, urls in result.items()}


_LUNCH = re.compile(r"^(?:obed(?:\s*1)?|hlavni jidlo)(?:\s*[:–-]\s*|\s+|$)")
_SOUP = re.compile(r"^polevka\s*(?:[:–-]\s*|\s+|$)")
_SIDE = re.compile(r"^(?:priloha|salat)\s*[:–-]\s*")
_SKIP_MEAL = re.compile(
    r"^(?:(?:odpoledni )?svacina\b|presnidav\.|snidane\b|napoj\b|vecere\b|obed\s*[2-9]\b)"
)
_CLOSED = re.compile(r"^(?:statni\s+)?(?:svatek|prazdniny|reditelske volno|nevari se|bez obeda)\b")
_MENU_FOOTER = re.compile(r"^(?:seznam alergen|zmena jidelnicku|dobrou chut)")
_MEAL_BREAK = re.compile(
    r"(?<!odpoledn[ií] )(?=(?:pol[eé]vka|ob[eě]d(?: \d)?|(?:odpoledn[ií] )?sva[cč]ina|"
    r"p[rř][eé]sn[ií]d[aá]v\.|p[rř][ií]loha|sal[aá]t)\s*:)",
    re.I,
)
_MEAL_LABELS = (("soup", _SOUP), ("main", _LUNCH), ("side", _SIDE))
_TRAILING_MEAL = re.compile(
    r"(?P<meal>ob[eě]d|p[rř]esn[ií]d[aá]v\.|sva[cč]ina)(?=\s*(?:obsahuje\s+alergeny|$))",
    re.I,
)


def _without_allergens(line: str, allergens: set[int]) -> str:
    for match in ALLERGEN_CODES.finditer(line):
        allergens.update(int(code) for code in re.findall(r"\d+", match[0]))
    return compact(ALLERGEN_CODES.sub("", line)).strip(" ,;–—-")


def _menu_row(day: date, soup: str, main: str, sides: list[str], allergens: set[int]) -> dict:
    return {
        "date": day.isoformat(),
        "soup": soup,
        "main": main,
        "sides": sides,
        "allergens": [ALLERGENS[num - 1] for num in sorted(allergens) if 1 <= num <= 14],
    }


def _trailing_lunch(lines: list[str], day: date) -> dict | None:
    # Some PDFs emit each meal's comma-separated items before its label, then its allergens.
    parts = []
    for index, line in enumerate(lines):
        if ALLERGEN_CODES.fullmatch(line):
            continue
        label = _TRAILING_MEAL.search(line)
        if not label:
            parts.append(line)
            continue
        if plain(label["meal"]) == "obed":
            allergens: set[int] = set()
            parts.append(line[: label.start()])
            dishes = _without_allergens(" ".join(parts), allergens)
            _without_allergens(line[label.end() :], allergens)
            for following in lines[index + 1 :]:
                if not ALLERGEN_CODES.match(following):
                    break
                _without_allergens(following, allergens)
            items = [item for raw in dishes.split(",") if (item := raw.strip())]
            if len(items) >= 2:
                soup, main, *sides = items
                return _menu_row(day, soup, main, sides, allergens)
            if items:
                return _menu_row(day, "", items[0], [], allergens)
            return None
        parts.clear()
    return None


def _lunch(lines: list[str], day: date) -> dict | None:
    if any(_CLOSED.match(plain(line)) for line in lines):
        return None
    if any((label := _TRAILING_MEAL.search(line)) and label.start() for line in lines):
        return _trailing_lunch(lines, day)
    soup = main = ""
    sides: list[str] = []
    allergens: set[int] = set()
    skip = False
    pending = None
    for line in (part.strip() for raw in lines for part in _MEAL_BREAK.split(raw)):
        key = plain(line)
        if _MENU_FOOTER.match(key):
            break
        if _SKIP_MEAL.match(key):
            pending, skip = None, True
            continue
        for kind, pattern in _MEAL_LABELS:
            if label := pattern.match(key):
                pending, skip = kind, False
                break
        if skip or line.strip(" –—-") == "":
            continue
        text = line[label.end() :] if label else line
        if not label and re.match(r"^(?:\d|tyden|jidelnicek)", key):
            continue
        text = _without_allergens(text, allergens)
        if not text:
            continue
        if pending == "soup":
            soup = text
        elif pending == "main" or (not main and pending is None):
            main = text
        else:
            sides.append(text)
        pending = None
    if not main:
        return None
    return _menu_row(day, soup, main, sides, allergens)


def _pdf_text(pdf: bytes) -> str:
    from pypdf import PdfReader
    from pypdf.errors import PyPdfError

    try:
        reader = PdfReader(BytesIO(pdf))
        if reader.is_encrypted or len(reader.pages) > 12:
            raise ValueError("Unsupported school PDF")
        return "\n".join(page.extract_text() for page in reader.pages)
    except (PyPdfError, KeyError, IndexError, TypeError) as err:
        raise ValueError("Unreadable school PDF") from err


def parse_menu(pdf: bytes, week: date, dated_link: bool = False) -> tuple[set[date], list[dict]]:
    text = _pdf_text(pdf)
    days: dict[date, list[str]] = {}
    current = None
    # A range or a dated link identifies the week for menus whose day headings are just weekdays.
    weekday_base = week if dated_link else None
    for raw in text.splitlines():
        line = compact(raw)
        if not line:
            continue
        heading = re.match(rf"^({WEEKDAYS})(?:\s|[.:]|$)", plain(line))
        match = SPAN.search(line)
        if match and (
            not line[: match.start()].strip() or heading or match["end"] or match["short"]
        ):
            try:
                first, last = _span(match, week)
            except ValueError:
                current = None
                continue
            if last and not heading:
                weekday_base = first - timedelta(days=first.weekday())
                current = None
                continue
            current = first
            days.setdefault(current, [])
            line = line[match.end() :].strip(" :–-")
        elif heading:
            offset = next(
                i
                for i, names in enumerate(
                    ("po pondeli", "ut utery", "st streda", "ct ctvrtek", "pa patek")
                )
                if heading[1] in names.split()
            )
            current = weekday_base + timedelta(days=offset) if weekday_base else None
            if current:
                days.setdefault(current, [])
            line = line[heading.end() :].strip(" :–-")
        if current and line:
            days[current].append(line)
    kept = {day for day in days if week <= day < week + timedelta(days=5)}
    return kept, [row for day in sorted(kept) if (row := _lunch(days[day], day))]
