"""Czech ingredient lines and cooking durations (pure functions, no HA imports).

* ``parse_ingredient("2 lžíce hladké mouky")`` -> qty 2, unit ``lžíce``, name ``hladké mouky``
* ``detect_durations("Pečeme 20 minut, pak půl hodiny odpočívá")`` -> 1200 s, 1800 s
* ``parse_iso_duration("PT1H30M")`` -> 5400 (schema.org ``prepTime``/``cookTime``)
"""

from __future__ import annotations

import re
import unicodedata
from typing import Any

# Canonical unit -> accepted spellings (lower-case, Czech inflections, common abbreviations).
UNIT_ALIASES: dict[str, tuple[str, ...]] = {
    "g": ("g", "gr", "gramů", "gramu", "gram", "gramy"),
    "dkg": ("dkg", "dag", "deka"),
    "kg": ("kg", "kila", "kilo", "kilogram", "kilogramy", "kilogramů"),
    "ml": ("ml", "mililitr", "mililitrů", "mililitry"),
    "dl": ("dl", "decilitr", "decilitry", "decilitrů"),
    "l": ("l", "litr", "litry", "litrů", "litru"),
    "lžíce": ("lžíce", "lžic", "lžící", "lžíci", "lž", "pl", "polévková lžíce", "polévkové lžíce"),
    "lžička": ("lžička", "lžičky", "lžiček", "lžičku", "čl", "kávová lžička", "kávové lžičky"),
    "hrnek": ("hrnek", "hrnky", "hrnků", "hrnku", "hrnečky", "hrneček", "šálek", "šálky"),
    "ks": ("ks", "kus", "kusy", "kusů", "kusu"),
    "špetka": ("špetka", "špetku", "špetky", "špetek"),
    "stroužek": ("stroužek", "stroužky", "stroužků"),
    "plátek": ("plátek", "plátky", "plátků"),
    "balení": ("balení", "bal", "balíček", "balíčky", "balíčku"),
    "hrst": ("hrst", "hrsti", "hrstí"),
}
_ALIAS_TO_UNIT = {alias: unit for unit, aliases in UNIT_ALIASES.items() for alias in aliases}
# Longest first so "polévková lžíce" wins over "lžíce", "dkg" over "g".
_ALIASES_SORTED = sorted(_ALIAS_TO_UNIT, key=len, reverse=True)
# Units counted in whole pieces (scaling rounds them to integers in the UI).
COUNTABLE_UNITS = frozenset({"ks", "stroužek", "plátek", "balení"})

_FRACTIONS = {"½": 0.5, "⅓": 1 / 3, "⅔": 2 / 3, "¼": 0.25, "¾": 0.75, "⅛": 0.125}
_WORD_QTY = {"půl": 0.5, "pul": 0.5, "čtvrt": 0.25, "jeden": 1, "jedna": 1, "dva": 2, "dvě": 2}
_NUM = r"\d+(?:[.,]\d+)?"
_QTY_RE = re.compile(
    rf"^\s*(?P<a>{_NUM}\s*/\s*\d+|{_NUM}(?:\s*[½⅓⅔¼¾⅛])?|[½⅓⅔¼¾⅛])"
    rf"(?:\s*[-–]\s*(?P<b>{_NUM}))?\s*"
)


def _number(token: str) -> float | None:
    token = token.strip().replace(",", ".")
    if not token:
        return None
    if token in _FRACTIONS:
        return _FRACTIONS[token]
    if token[-1] in _FRACTIONS:
        whole = token[:-1].strip()
        return (float(whole) if whole else 0) + _FRACTIONS[token[-1]]
    if "/" in token:
        num, den = (p.strip() for p in token.split("/", 1))
        try:
            return float(num) / float(den) if float(den) else None
        except ValueError:
            return None
    try:
        return float(token)
    except ValueError:
        return None


def _match_unit(text: str) -> tuple[str | None, str]:
    """Leading unit alias (word boundary, optional trailing dot) -> (unit, rest)."""
    low = text.lower()
    for alias in _ALIASES_SORTED:
        if low.startswith(alias):
            rest = text[len(alias) :]
            if rest[:1] == ".":
                rest = rest[1:]
            if rest == "" or not rest[0].isalnum():
                return _ALIAS_TO_UNIT[alias], rest.strip()
    return None, text


def _clean(text: str) -> str:
    text = unicodedata.normalize("NFC", text or "")
    text = re.sub(r"\s+", " ", text.replace("\xa0", " ")).strip()
    return text.strip(" -–•*·")


def parse_ingredient(line: str) -> dict[str, Any]:
    """Split one free-text ingredient line into qty / unit / name / note.

    Handles quantity-first lines (``500 g mouky``, ``1,5 l mléka``, ``½ lžičky soli``,
    ``2–3 stroužky česneku``), word quantities (``půl hrnku``, ``špetka soli``) and the
    name-first style (``hladká mouka 500 g``). Parentheses and text after the first comma
    become the note. Unknown formats keep the whole text as the name.
    """
    text = _clean(line)
    result: dict[str, Any] = {"qty": None, "qtyMax": None, "unit": None, "name": text, "note": None}
    if not text:
        return result
    note_parts: list[str] = []
    for match in re.findall(r"\(([^)]*)\)", text):
        if match.strip():
            note_parts.append(match.strip())
    text = re.sub(r"\s*\([^)]*\)", "", text).strip()

    qty = qty_max = None
    rest = text
    if m := _QTY_RE.match(text):
        qty = _number(m.group("a"))
        qty_max = _number(m.group("b")) if m.group("b") else None
        rest = text[m.end() :]
    else:
        first, _, tail = text.partition(" ")
        if first.lower() in _WORD_QTY and tail:
            qty, rest = float(_WORD_QTY[first.lower()]), tail
    unit, rest = _match_unit(rest)
    if qty is None and unit is None:
        # Name-first: "hladká mouka 500 g" / "sůl – špetka".
        if m := re.search(rf"[\s,–-]+({_NUM})\s*([^\d\s,]+\.?)?\s*$", text):
            tail_unit, tail_rest = _match_unit(m.group(2) or "")
            if not tail_rest:
                qty, unit = _number(m.group(1)), tail_unit
                rest = text[: m.start()].strip(" ,–-")
        elif m := re.search(r"[\s,–-]+(špetka|špetku|trochu|dle chuti)\s*$", text, re.I):
            unit = "špetka" if m.group(1).lower().startswith("špet") else None
            if unit is None:
                note_parts.append(m.group(1))
            rest = text[: m.start()].strip(" ,–-")
    if unit == "špetka" and qty is None:
        qty = 1.0
    name, _, note = rest.partition(",")
    if note.strip():
        note_parts.insert(0, note.strip())
    name = name.strip(" ,:;–-")
    if not name:
        name = text
    result.update(
        qty=qty,
        qtyMax=qty_max,
        unit=unit,
        name=name,
        note="; ".join(note_parts) or None,
    )
    return result


def is_countable(unit: str | None, qty: float | None) -> bool:
    return qty is not None and (unit is None or unit in COUNTABLE_UNITS)


def is_group_header(line: str) -> str | None:
    """``Na těsto:`` / ``NÁPLŇ`` -> group name; quantities never form a header."""
    text = _clean(line)
    if not text or len(text) > 40 or re.search(r"\d", text):
        return None
    if text.endswith(":"):
        return text[:-1].strip() or None
    return None


# ---------- durations ----------
_ISO_RE = re.compile(
    r"^P(?:(?P<d>\d+(?:[.,]\d+)?)D)?(?:T(?:(?P<h>\d+(?:[.,]\d+)?)H)?"
    r"(?:(?P<m>\d+(?:[.,]\d+)?)M)?(?:(?P<s>\d+(?:[.,]\d+)?)S)?)?$",
    re.I,
)


def parse_iso_duration(value: Any) -> int | None:
    """ISO 8601 duration (``PT1H30M``, ``P0DT0H20M``, ``PT90M``) -> seconds; else None."""
    if not isinstance(value, str):
        return None
    m = _ISO_RE.match(value.strip())
    if not m or not any(m.groupdict().values()):
        return None
    parts = {k: float((v or "0").replace(",", ".")) for k, v in m.groupdict().items()}
    total = parts["d"] * 86400 + parts["h"] * 3600 + parts["m"] * 60 + parts["s"]
    return int(round(total)) or None


_UNIT_SECONDS = (
    (r"hod(?:in(?:y|u|a)?|\.)?|h(?![a-zá-ž])", 3600),
    (r"min(?:ut(?:y|u|a)?|\.)?(?![a-zá-ž])", 60),
    # No bare "s": "3 s cibulí" is a preposition, not seconds.
    (r"(?:sek(?:und(?:y|u|a)?|\.)?|vteřin(?:y|u|a)?)(?![a-zá-ž])", 1),
)
_DUR_NUM = rf"(?P<n>{_NUM})(?:\s*[-–]\s*(?P<n2>{_NUM}))?"
_DURATION_RES = [
    (re.compile(rf"(?<![\d,.]){_DUR_NUM}\s*(?:{pattern})", re.I), seconds)
    for pattern, seconds in _UNIT_SECONDS
]
_PHRASES = (
    (re.compile(r"\bhodinu\s+a\s+půl\b", re.I), 5400),
    (re.compile(r"\bpůl\s*hodiny\b|\bpůlhodin[uy]\b", re.I), 1800),
    (re.compile(r"\bčtvrt\s*hodiny\b|\bčtvrthodin[uy]\b", re.I), 900),
    (re.compile(r"\btři\s*čtvrtě\s*hodiny\b", re.I), 2700),
    (re.compile(r"(?<![\d,.]\s)\b(?:jednu\s+)?hodinu\b", re.I), 3600),
    (re.compile(r"\bpůl\s*minuty\b", re.I), 30),
)


def detect_durations(text: str) -> list[dict[str, Any]]:
    """All durations mentioned in a step, in text order.

    ``{"seconds", "label", "start", "end"}``; ranges (``20–25 minut``) use the LOWER
    bound (check early, add time) and keep ``maxSeconds``.
    """
    found: list[dict[str, Any]] = []
    taken: list[tuple[int, int]] = []

    def free(a: int, b: int) -> bool:
        return all(b <= s or a >= e for s, e in taken)

    for regex, seconds in _PHRASES:
        for m in regex.finditer(text or ""):
            if free(m.start(), m.end()):
                taken.append((m.start(), m.end()))
                found.append(
                    {"seconds": seconds, "label": m.group(0), "start": m.start(), "end": m.end()}
                )
    for regex, unit_s in _DURATION_RES:
        for m in regex.finditer(text or ""):
            if not free(m.start(), m.end()):
                continue
            low = float(m.group("n").replace(",", "."))
            high = float(m.group("n2").replace(",", ".")) if m.group("n2") else None
            seconds = int(round(low * unit_s))
            if seconds <= 0 or seconds > 48 * 3600:
                continue
            item = {"seconds": seconds, "label": m.group(0), "start": m.start(), "end": m.end()}
            if high is not None and high > low:
                item["maxSeconds"] = int(round(high * unit_s))
            taken.append((m.start(), m.end()))
            found.append(item)
    found.sort(key=lambda d: d["start"])
    return found


def first_duration(text: str) -> int | None:
    durations = detect_durations(text)
    return durations[0]["seconds"] if durations else None
