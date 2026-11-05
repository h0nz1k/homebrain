"""Offline lookup: home coordinates -> ORP (CISORP code) using bundled public polygons.

The polygons (data/orp.json) are simplified RÚIAN boundaries of all 206 ORP joined with the
ČSÚ CISORP code list (both CC BY 4.0). Lookup runs locally, so the home location never leaves
Home Assistant. ČHMÚ CAP warnings carry CISORP geocodes but no polygons.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Any

DATA = Path(__file__).parent / "data" / "orp.json"


@dataclass(frozen=True)
class OrpArea:
    cisorp: str
    name: str
    kraj: str | None
    method: str  # "polygon" | "nearest" | "option"


@lru_cache(maxsize=1)
def load_orp(path: str = str(DATA)) -> list[dict[str, Any]]:
    """Blocking file read: call from an executor."""
    return json.loads(Path(path).read_text(encoding="utf-8"))["orp"]


def _in_ring(lon: float, lat: float, ring: list[list[float]]) -> bool:
    inside = False
    j = len(ring) - 1
    for i, (xi, yi) in enumerate(ring):
        xj, yj = ring[j]
        if (yi > lat) != (yj > lat) and lon < (xj - xi) * (lat - yi) / ((yj - yi) or 1e-12) + xi:
            inside = not inside
        j = i
    return inside


def find_orp(lat: float, lon: float, areas: list[dict[str, Any]]) -> OrpArea | None:
    """Point-in-polygon (even-odd over all rings); nearest vertex within ~5 km as fallback."""
    for area in areas:
        if sum(_in_ring(lon, lat, ring) for ring in area["rings"]) % 2 == 1:
            return OrpArea(area["cisorp"], area["name"], area.get("kraj"), "polygon")
    best: tuple[float, dict[str, Any]] | None = None
    for area in areas:
        for ring in area["rings"]:
            for x, y in ring:
                d = ((x - lon) * 0.64) ** 2 + (y - lat) ** 2
                if best is None or d < best[0]:
                    best = (d, area)
    if best is not None and best[0] ** 0.5 < 0.045:  # simplified borders: allow ~5 km
        area = best[1]
        return OrpArea(area["cisorp"], area["name"], area.get("kraj"), "nearest")
    return None


def area_by_code(code: str, areas: list[dict[str, Any]]) -> OrpArea | None:
    for area in areas:
        if area["cisorp"] == code:
            return OrpArea(area["cisorp"], area["name"], area.get("kraj"), "option")
    return None


# NUTS3 codes used by the alerts.json fallback feed (kraj level).
KRAJ_NUTS = {
    "Hlavní město Praha": "CZ010",
    "Středočeský kraj": "CZ020",
    "Jihočeský kraj": "CZ031",
    "Plzeňský kraj": "CZ032",
    "Karlovarský kraj": "CZ041",
    "Ústecký kraj": "CZ042",
    "Liberecký kraj": "CZ051",
    "Královéhradecký kraj": "CZ052",
    "Pardubický kraj": "CZ053",
    "Kraj Vysočina": "CZ063",
    "Jihomoravský kraj": "CZ064",
    "Olomoucký kraj": "CZ071",
    "Zlínský kraj": "CZ072",
    "Moravskoslezský kraj": "CZ080",
}
