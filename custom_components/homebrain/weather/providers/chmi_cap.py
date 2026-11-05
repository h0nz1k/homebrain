"""ČHMÚ warnings from the documented open-data CAP feed (opendata.chmi.cz, CC BY 4.0).

Directory listing -> newest ``alert_cap_50_*.xml`` (XOCZ50 = weather warnings for ORP).
Each ``<info>`` (language cs) lists the affected ORP as ``CISORP`` geocodes; we keep only infos
whose geocodes contain the home ORP. "Žádná výstraha" infos and cancellations are dropped.
"""

from __future__ import annotations

import re
import xml.etree.ElementTree as ET
from datetime import datetime
from typing import Any

BASE = "https://opendata.chmi.cz/meteorology/weather/alerts/cap/"
NS = {"c": "urn:oasis:names:tc:emergency:cap:1.2"}
_ROW = re.compile(r'href="(alert_cap_50_\d{6}\.xml)">[^<]*</a>\s+(\d{2}-\w{3}-\d{4} \d{2}:\d{2})')

# level: 1 žlutá, 2 oranžová, 3 červená, 4 fialová (ČHMÚ colour scale)
LEVEL_LABEL_CS = {1: "Žlutá", 2: "Oranžová", 3: "Červená", 4: "Fialová"}
_AWARENESS_COLOUR = {"yellow": 1, "orange": 2, "red": 3}
_SEVERITY_LEVEL = {"Minor": 1, "Moderate": 1, "Severe": 2, "Extreme": 3}
_TYPE_CATEGORY = {
    "wind": "wind",
    "snow-ice": "snow",
    "thunderstorm": "thunderstorm",
    "fog": "fog",
    "high-temperature": "heat",
    "low-temperature": "cold",
    "coastalevent": "other",
    "forest-fire": "fire",
    "avalanches": "other",
    "rain": "rain",
    "flooding": "flood",
    "rain-flood": "flood",
}


def latest_file(listing_html: str) -> tuple[str, str] | None:
    """Return (file name, listing mtime) of the newest XOCZ50 CAP file."""
    rows = []
    for name, stamp in _ROW.findall(listing_html):
        try:
            rows.append((datetime.strptime(stamp, "%d-%b-%Y %H:%M"), name, stamp))
        except ValueError:
            continue
    if not rows:
        return None
    _, name, stamp = max(rows)
    return name, stamp


def _text(info: ET.Element, tag: str) -> str:
    el = info.find(f"c:{tag}", NS)
    return (el.text or "").strip() if el is not None and el.text else ""


def _time(value: str) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def _level(info: ET.Element, params: dict[str, str]) -> int:
    severity = _text(info, "severity")
    if severity == "Extreme" and _text(info, "certainty") == "Observed":
        return 4  # fialová: jev již nastal / probíhá
    awareness = params.get("awareness_level", "")
    parts = [p.strip().lower() for p in awareness.split(";")]
    if len(parts) >= 2 and parts[1] in _AWARENESS_COLOUR:
        return _AWARENESS_COLOUR[parts[1]]
    return _SEVERITY_LEVEL.get(severity, 1)


def _category(params: dict[str, str], event: str) -> str:
    raw = params.get("awareness_type", "")
    key = raw.split(";")[-1].strip().lower().replace(" ", "-") if raw else ""
    if key in _TYPE_CATEGORY:
        return _TYPE_CATEGORY[key]
    low = event.lower()
    for needle, cat in (
        ("bouř", "thunderstorm"),
        ("vítr", "wind"),
        ("sněh", "snow"),
        ("náled", "ice"),
        ("mráz", "cold"),
        ("tepl", "heat"),
        ("déšť", "rain"),
        ("srážk", "rain"),
        ("povod", "flood"),
        ("požár", "fire"),
        ("mlh", "fog"),
    ):
        if needle in low:
            return cat
    return "other"


def parse_cap(xml_text: str | bytes, cisorp: str | None, now: datetime) -> list[dict[str, Any]]:
    """Active warnings for one ORP (or for the whole country when ``cisorp`` is None)."""
    root = ET.fromstring(xml_text)
    if (root.findtext("c:status", default="", namespaces=NS) or "") != "Actual":
        return []
    if (root.findtext("c:msgType", default="", namespaces=NS) or "") == "Cancel":
        return []
    warnings: dict[str, dict[str, Any]] = {}
    for info in root.findall("c:info", NS):
        if _text(info, "language").lower() not in ("cs", "cs-cz"):
            continue
        event = _text(info, "event")
        if not event or event.startswith("Žádná") or _text(info, "responseType") == "None":
            continue
        if _text(info, "certainty") == "Unlikely":
            continue
        areas = []
        for area in info.findall("c:area", NS):
            codes = [
                (g.findtext("c:value", default="", namespaces=NS) or "").strip()
                for g in area.findall("c:geocode", NS)
                if (g.findtext("c:valueName", default="", namespaces=NS) or "") == "CISORP"
            ]
            areas.append((area.findtext("c:areaDesc", default="", namespaces=NS) or "", codes))
        if cisorp and not any(cisorp in codes for _, codes in areas):
            continue
        params = {
            (p.findtext("c:valueName", default="", namespaces=NS) or ""): (
                p.findtext("c:value", default="", namespaces=NS) or ""
            )
            for p in info.findall("c:parameter", NS)
        }
        onset = _time(_text(info, "onset")) or _time(_text(info, "effective"))
        expires = _time(_text(info, "expires")) or _time(params.get("eventEndingTime", ""))
        if expires is not None and expires <= now:
            continue
        level = _level(info, params)
        category = _category(params, event)
        key = f"{category}|{event}|{onset.isoformat() if onset else ''}"
        prev = warnings.get(key)
        if prev and prev["level"] >= level:
            continue
        warnings[key] = {
            "id": key,
            "category": category,
            "event": event,
            "level": level,
            "level_label": LEVEL_LABEL_CS[level],
            "severity": _text(info, "severity"),
            "certainty": _text(info, "certainty"),
            "urgency": _text(info, "urgency"),
            "headline": _text(info, "headline"),
            "description": _text(info, "description"),
            "instruction": _text(info, "instruction"),
            "onset": onset.isoformat() if onset else None,
            "expires": expires.isoformat() if expires else None,
            "region_filtered": bool(cisorp),
            "source": "chmi:cap",
        }
    return sorted(warnings.values(), key=lambda w: (-w["level"], w["onset"] or ""))
