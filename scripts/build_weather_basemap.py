#!/usr/bin/env python3
"""Build the bundled radar basemap (modules/weather/src/views/basemap.data.ts).

The basemap is drawn under the ČHMÚ radar inside HomeBrain, so the browser never asks a
third-party tile server for map tiles (no location leak, works offline). Every coordinate
is pre-projected into the ČHMÚ composite pixel grid (680x460 px, EPSG:3857, bounds from
radar.py). Then the client only needs the crop origin from the authenticated snapshot.

Sources (download once, not committed):
* ORP boundaries: custom_components/homebrain/weather/data/orp.json
  (ČÚZK RÚIAN, CC BY 4.0, already bundled for the warning filter).
* Natural Earth 10m (public domain), https://github.com/nvkelso/natural-earth-vector/geojson:
  ne_10m_admin_0_boundary_lines_land, ne_10m_admin_1_states_provinces_lines,
  ne_10m_rivers_lake_centerlines, ne_10m_rivers_europe, ne_10m_lakes, ne_10m_roads,
  ne_10m_urban_areas.
* Places: GeoNames cities5000 (CC BY 4.0), https://download.geonames.org/export/dump/.

usage: build_weather_basemap.py <dir with the downloaded files>
"""

from __future__ import annotations

import json
import math
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "modules/weather/src/views/basemap.data.ts"
ORP = ROOT / "custom_components/homebrain/weather/data/orp.json"
WIDTH, HEIGHT = 680, 460
WEST, EAST, SOUTH, NORTH = 11.267, 19.624, 48.047, 51.458
KM_PX = (EAST - WEST) / WIDTH * 111.32 * math.cos(math.radians(49.8))
# Czech exonyms for the large foreign cities that show up at the ČR zoom.
EXONYMS = {
    "Prague": "Praha",
    "Vienna": "Vídeň",
    "Munich": "Mnichov",
    "Dresden": "Drážďany",
    "Wroclaw": "Vratislav",
    "Wrocław": "Vratislav",
    "Regensburg": "Řezno",
    "Linz": "Linec",
    "Passau": "Pasov",
    "Katowice": "Katovice",
    "Nuremberg": "Norimberk",
    "Leipzig": "Lipsko",
    "Kraków": "Krakov",
}


def merc_y(lat: float) -> float:
    return math.log(math.tan(math.pi / 4 + math.radians(lat) / 2))


def px(lon: float, lat: float) -> tuple[float, float]:
    x = (lon - WEST) / (EAST - WEST) * WIDTH
    y = (merc_y(NORTH) - merc_y(lat)) / (merc_y(NORTH) - merc_y(SOUTH)) * HEIGHT
    return x, y


def dp(points: list[tuple[float, float]], tol: float) -> list[tuple[float, float]]:
    """Douglas-Peucker in pixel space."""
    if len(points) < 3:
        return points
    (x0, y0), (x1, y1) = points[0], points[-1]
    dx, dy = x1 - x0, y1 - y0
    norm = math.hypot(dx, dy) or 1e-9
    best, idx = -1.0, 0
    for i in range(1, len(points) - 1):
        x, y = points[i]
        d = (
            abs(dy * x - dx * y + x1 * y0 - y1 * x0) / norm
            if norm > 1e-9
            else math.hypot(x - x0, y - y0)
        )
        if d > best:
            best, idx = d, i
    if best <= tol:
        return [points[0], points[-1]]
    return dp(points[: idx + 1], tol)[:-1] + dp(points[idx:], tol)


PAD = 8.0


def inside(p: tuple[float, float]) -> bool:
    return -PAD <= p[0] <= WIDTH + PAD and -PAD <= p[1] <= HEIGHT + PAD


def clip_runs(points: list[tuple[float, float]]) -> list[list[tuple[float, float]]]:
    """Split a line into runs that stay inside the (padded) composite."""
    runs, cur = [], []
    for p in points:
        if inside(p):
            cur.append(p)
        else:
            if len(cur) > 1:
                runs.append(cur)
            cur = []
    if len(cur) > 1:
        runs.append(cur)
    return runs


def path(lines: list[list[tuple[float, float]]], tol: float, closed: bool = False) -> str:
    out = []
    for line in lines:
        for run in clip_runs(line):
            pts = dp(run, tol)
            if len(pts) < 2:
                continue
            seg = "M" + "L".join(f"{x:.1f} {y:.1f}" for x, y in pts)
            out.append(seg + ("Z" if closed and run is line else ""))
    return "".join(out).replace(".0 ", " ").replace(".0L", "L").replace(".0M", "M")


def geo_lines(fc: dict, keep=lambda props: True) -> list[list[tuple[float, float]]]:
    lines = []
    for feat in fc["features"]:
        if not keep(feat.get("properties") or {}):
            continue
        geom = feat.get("geometry") or {}
        coords = geom.get("coordinates") or []
        parts = {
            "LineString": [coords],
            "MultiLineString": coords,
            "Polygon": coords,
            "MultiPolygon": [r for poly in coords for r in poly],
        }.get(geom.get("type"), [])
        for part in parts:
            lines.append([px(lon, lat) for lon, lat, *_ in part])
    return lines


def _area(ring: list[tuple[float, float]]) -> float:
    return (
        abs(
            sum(
                x1 * y2 - x2 * y1
                for (x1, y1), (x2, y2) in zip(ring, ring[1:] + ring[:1], strict=True)
            )
        )
        / 2
    )


def _in_ring(x: float, y: float, ring: list[tuple[float, float]]) -> bool:
    inside_ = False
    for (x1, y1), (x2, y2) in zip(ring, ring[1:] + ring[:1], strict=True):
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
            inside_ = not inside_
    return inside_


# Statutory cities whose districts GeoNames lists as separate places (Stodůlky, Židenice ...).
CITY_ORP = {"Hlavní město Praha": "Praha", "Brno": "Brno", "Ostrava": "Ostrava", "Plzeň": "Plzeň"}


def places(src: Path) -> list[list]:
    orp = json.loads(ORP.read_text())["orp"]
    city_rings = [
        (CITY_ORP[o["name"]], [px(lon, lat) for lon, lat in ring])
        for o in orp
        if o["name"] in CITY_ORP
        for ring in o["rings"]
    ]
    with zipfile.ZipFile(src / "cities5000.zip") as z:
        rows = [r.split("\t") for r in z.read("cities5000.txt").decode().splitlines()]
    cands = []
    for r in rows:
        lat, lon, cc, pop, code = float(r[4]), float(r[5]), r[8], int(r[14] or 0), r[7]
        if code in {"PPLX", "PPLH", "PPLQ", "PPLW"}:
            continue
        if cc != "CZ" and pop < 250_000:  # neighbours: only big cities (Drážďany, Vídeň ...)
            continue
        x, y = px(lon, lat)
        name = EXONYMS.get(r[1], r[1])
        if any(name != city and _in_ring(x, y, ring) for city, ring in city_rings):
            continue
        if 4 <= x <= WIDTH - 4 and 4 <= y <= HEIGHT - 4:
            cands.append((pop, name, x, y, cc))
    cands.sort(reverse=True)
    kept: list[tuple[int, str, float, float, str]] = []
    for pop, name, x, y, cc in cands:
        # Drop city districts / suburbs (GeoNames lists Žižkov, Židenice ... as PPL).
        if any(math.hypot(x - kx, y - ky) * KM_PX < 7 for _, _, kx, ky, _ in kept):
            continue
        kept.append((pop, name, x, y, cc))

    def rank(pop: int, cc: str) -> int:
        if cc != "CZ":  # Czech towns win label collisions over foreign ones
            return 1 if pop >= 400_000 else 2
        return 0 if pop >= 90_000 else 1 if pop >= 18_000 else 2

    # Order = label priority: Czech first, then by population.
    kept.sort(key=lambda k: (k[4] != "CZ", -k[0]))
    return [[name, round(x, 1), round(y, 1), rank(pop, cc)] for pop, name, x, y, cc in kept]


def main(src: Path) -> None:
    load = lambda name: json.loads((src / f"{name}.geojson").read_text())  # noqa: E731
    orp = json.loads(ORP.read_text())
    orp_lines = [[px(lon, lat) for lon, lat in ring] for o in orp["orp"] for ring in o["rings"]]
    cz_lines = geo_lines(load("ne_10m_admin_0_boundary_lines_land"))
    kraje = geo_lines(
        load("ne_10m_admin_1_states_provinces_lines"),
        lambda p: p.get("ADM0_A3") in {"CZE"},
    )
    rivers = geo_lines(
        load("ne_10m_rivers_lake_centerlines"), lambda p: (p.get("scalerank") or 99) <= 9
    ) + geo_lines(load("ne_10m_rivers_europe"), lambda p: (p.get("scalerank") or 99) <= 10)
    minor_rivers = geo_lines(
        load("ne_10m_rivers_lake_centerlines"), lambda p: (p.get("scalerank") or 99) > 9
    ) + geo_lines(load("ne_10m_rivers_europe"), lambda p: (p.get("scalerank") or 99) > 10)
    lakes = geo_lines(load("ne_10m_lakes"))
    roads_fc = load("ne_10m_roads")
    motorways = geo_lines(roads_fc, lambda p: p.get("expressway") == 1)
    roads = geo_lines(
        roads_fc,
        lambda p: (
            p.get("expressway") != 1
            and (
                p.get("type") in {"Major Highway", "Secondary Highway"}
                or (p.get("type") == "Road" and (p.get("scalerank") or 99) <= 6)
            )
        ),
    )
    # Built-up areas >= ~2.5 km2 only (tiny villages would just add bytes).
    urban = [r for r in geo_lines(load("ne_10m_urban_areas")) if _area(r) >= 4.0]
    data = {
        "w": WIDTH,
        "h": HEIGHT,
        "orp": path(orp_lines, 0.6),
        "kraje": path(kraje, 0.25),
        "border": path(cz_lines, 0.2),
        "rivers": path(rivers, 0.3),
        "lakes": path(lakes, 0.3),
        "minorRivers": path(minor_rivers, 0.45),
        "roads": path(roads, 0.5),
        "motorways": path(motorways, 0.4),
        "urban": path(urban, 0.8, closed=True),
        "places": places(src),
    }
    body = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    OUT.write_text(
        "// Generated by scripts/build_weather_basemap.py - do not edit.\n"
        "// ČÚZK RÚIAN (CC BY 4.0), Natural Earth (public domain), GeoNames (CC BY 4.0).\n"
        "// Coordinates are ČHMÚ radar composite pixels (680x460, EPSG:3857).\n"
        "export interface Basemap {\n  w: number;\n  h: number;\n  orp: string;\n  kraje: string;\n"
        "  border: string;\n  rivers: string;\n  lakes: string;\n"
        "  minorRivers?: string;\n  roads?: string;\n  motorways?: string;\n  urban?: string;\n"
        "  /** [name, x, y, rank 0 = city >= 90k, 1 = town >= 18k, 2 = town >= 5k] */\n"
        "  places: [string, number, number, number][];\n}\n"
        f"export const BASEMAP: Basemap = {body};\n"
    )
    print(OUT, OUT.stat().st_size, {k: len(v) for k, v in data.items() if not isinstance(v, int)})


if __name__ == "__main__":
    main(Path(sys.argv[1]))
