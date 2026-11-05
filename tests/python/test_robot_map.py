"""Roboti phase B: vector map from raw Roborock blobs (synthetic, invented floor plans only)."""

import gzip
import math
import struct
from types import SimpleNamespace
from unittest.mock import patch

import pytest
from homeassistant.core import HomeAssistant
from homeassistant.setup import async_setup_component
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.homebrain.const import DOMAIN
from custom_components.homebrain.robots import map_source
from custom_components.homebrain.robots.map_source import (
    REASON_NO_DATA,
    REASON_NO_ENTITY,
    REASON_NOT_ROBOROCK,
    REASON_PARSE_FAILED,
    REASON_UNSUPPORTED_HA,
    REASON_UNSUPPORTED_LIB,
    VectorMapCache,
    raw_map_blob,
    version_guard,
)
from custom_components.homebrain.robots.raster_map import (
    CROP_MARGIN,
    PALETTES,
    SCALE,
    raster_bounds,
    raster_layers,
    render_png,
)
from custom_components.homebrain.robots.vector_map import (
    MapParseError,
    build_vector_map,
    dominant_angle,
    is_wall,
    parse_raw_map,
    polygons_from_labels,
    rectilinear,
    ring_area,
    room_dividers,
    room_number,
    simplify_ring,
    thin,
    trace_rings,
    wall_polylines,
)

ROOM = lambda n: (n << 3) | 7  # noqa: E731 - pixel type byte of room/segment n


def _block(block_type: int, header_extra: bytes, data: bytes) -> bytes:
    header_len = 8 + len(header_extra)
    return struct.pack("<HHI", block_type, header_len, len(data)) + header_extra + data


def make_blob(
    grid: list[str],
    legend: dict[str, int],
    *,
    top: int = 100,
    left: int = 200,
    robot: tuple[int, int, int] | None = (10_300, 5_300, 90),
    charger: tuple[int, int] | None = (10_100, 5_100),
    path: list[tuple[int, int]] | None = None,
    no_go: list[list[int]] | None = None,
) -> bytes:
    """Invented map: ``grid`` rows are top-down strings, ``legend`` maps chars to pixel types."""
    height, width = len(grid), len(grid[0])
    pixels = bytearray()
    for row in reversed(grid):  # the blob stores the bottom row first
        pixels.extend(legend[ch] for ch in row)
    blocks = [_block(2, struct.pack("<iiii", top, left, height, width), bytes(pixels))]
    if charger:
        blocks.append(_block(1, b"", struct.pack("<II", *charger)))
    if robot:
        blocks.append(_block(8, b"", struct.pack("<III", *robot)))
    if path:
        data = b"".join(struct.pack("<HH", *p) for p in path)
        blocks.append(_block(3, struct.pack("<III", len(path), 4, 0), data))
    if no_go:
        data = b"".join(struct.pack("<8H", *area) for area in no_go)
        blocks.append(_block(9, struct.pack("<H", len(no_go)) + b"\0\0", data))
    header = b"rr" + struct.pack("<H", 0x14) + bytes(0x10)
    return header + b"".join(blocks)


LEGEND = {".": 0x00, "#": 0x01, "_": 0xFF, "A": ROOM(16), "B": ROOM(17), "C": ROOM(18)}
# L-shaped living room (A), a kitchen with a diagonal wall (B), a small bath (C) with a hole.
PLAN = [
    "##############",
    "#AAAAAA#BBBBB#",
    "#AAAAAA#BBBBB#",
    "#AAAAAA#BBBB_#",
    "#AAAAAA#BBB__#",
    "#AAAAAA#BB___#",
    "#AAA#######__#",
    "#AAA#CCCCC#__#",
    "#AAA#C.CCC#__#",
    "#AAA#CCCCC#__#",
    "##############",
]


def test_room_number_decoding():
    assert room_number(ROOM(16)) == 16
    assert room_number(0xFF) == 0 and room_number(0x07) == 0 and room_number(0x01) == 0


def _scaled(plan: list[str], k: int) -> list[str]:
    """Each character → k×k pixels (the shared-arc partition needs real-world sizes)."""
    return [row for row in ("".join(ch * k for ch in line) for line in plan) for _ in range(k)]


def test_build_vector_map_rooms_are_real_shapes_in_map_units():
    vector = build_vector_map(make_blob(_scaled(PLAN, 4), LEGEND))
    rooms = {room["id"]: room for room in vector["rooms"]}
    assert sorted(rooms) == [16, 17, 18]
    living = rooms[16]["polygons"][0]
    # The L shape keeps its 6 corners (a bounding box would have 4).
    assert len(living) // 2 == 6
    xs, ys = living[0::2], living[1::2]
    # Pixel corners -> map units: (px + left) * 50; walls belong to the slab, so the fill
    # reaches the outer face of the wall and meets its neighbours in the wall middle.
    assert 200 * 50 <= min(xs) <= 202 * 50  # inside the (4 px thick) outer wall
    assert max(xs) == pytest.approx((4 * 7 + 2 + 200) * 50, abs=60)
    assert ring_area(list(zip(xs, ys, strict=True))) > 0  # outer ring is counter-clockwise
    # The 1-char hole in the bath is an enclosed pocket below MIN_POCKET_PX: filled.
    assert len(rooms[18]["polygons"]) == 1
    assert rooms[18]["outline"] == rooms[18]["polygons"]  # one geometry for fill + selection
    assert rooms[16]["area_m2"] == pytest.approx((6 * 5 + 3 * 4) * 16 * 0.0025, abs=0.1)
    assert vector["digest"].endswith("t2")
    assert vector["floor"] and vector["bounds"] == [200 * 50, 100 * 50, 256 * 50, 144 * 50]


def test_staircase_is_simplified():
    labels = [0] * 400
    for y in range(20):
        for x in range(20):
            if x <= y:
                labels[y * 20 + x] = 1
    raw = trace_rings(labels, 20, 20)[1][0]
    simple = polygons_from_labels(labels, 20, 20)[1][0]
    assert len(raw) > 40
    assert len(simple) <= 6  # a triangle (+ maybe one corner step)


def test_diagonal_touching_pixels_become_separate_rings():
    labels = [1, 0, 0, 1]  # 2x2 checker: two pixels touching only at a corner
    rings = trace_rings(labels, 2, 2)[1]
    assert len(rings) == 2 and all(len(ring) == 4 for ring in rings)


def test_simplify_keeps_rectangle():
    ring = [(0.0, 0.0), (5.0, 0.0), (10.0, 0.0), (10.0, 5.0), (10.0, 10.0), (0.0, 10.0)]
    assert sorted(simplify_ring(ring, 0.5)) == [(0.0, 0.0), (0.0, 10.0), (10.0, 0.0), (10.0, 10.0)]


def test_dynamic_layer_robot_dock_path_nogo_and_gzip():
    path = [(10_100 + i * 10, 5_100) for i in range(30)] + [
        (10_400, 5_100 + i * 10) for i in range(30)
    ]
    blob = make_blob(PLAN, LEGEND, path=path, no_go=[[1, 2, 3, 4, 5, 6, 7, 8]])
    vector = build_vector_map(gzip.compress(blob))
    assert vector["robot"] == {"x": 10_300, "y": 5_300, "a": 90}
    assert vector["dock"] == {"x": 10_100, "y": 5_100, "a": None}
    # Straight runs collapse to their corners.
    assert vector["path"] == [10_100, 5_100, 10_400, 5_100, 10_400, 5_390]
    assert vector["no_go"] == [[1, 2, 3, 4, 5, 6, 7, 8]]


def test_geometry_cache_is_reused_and_rebuilt_on_change():
    cache: dict = {}
    first = build_vector_map(make_blob(PLAN, LEGEND), cache)
    with patch("custom_components.homebrain.robots.vector_map.build_geometry") as build:
        again = build_vector_map(make_blob(PLAN, LEGEND, robot=(10_500, 5_500, 0)), cache)
        build.assert_not_called()
    assert again["rooms"] == first["rooms"] and again["robot"]["x"] == 10_500
    changed = [*PLAN[:-2], "#AAA#CCCCCC_C#", PLAN[-1]]
    assert build_vector_map(make_blob(changed, LEGEND), cache)["digest"] != first["digest"]
    assert len(cache) == 1


@pytest.mark.parametrize(
    "blob",
    [b"", b"xx" + bytes(40), b"rr\x14\x00" + bytes(16) + struct.pack("<HHI", 2, 24, 999)],
)
def test_bad_blobs_raise_parse_error(blob):
    with pytest.raises(MapParseError):
        build_vector_map(blob)


def test_map_without_rooms_is_an_error():
    with pytest.raises(MapParseError):
        build_vector_map(make_blob(["####", "#__#", "####"], LEGEND))
    assert parse_raw_map(make_blob(["#"], LEGEND)).image.width == 1


def test_version_guard():
    assert version_guard("2026.10.4", "7.12.0") is None
    assert version_guard("2025.12.0", "7.1.0") is None
    assert version_guard("2027.1.0", "7.12.0") == REASON_UNSUPPORTED_HA
    assert version_guard("2025.6.1", "7.12.0") == REASON_UNSUPPORTED_HA
    assert version_guard("dev", "7.12.0") == REASON_UNSUPPORTED_HA
    assert version_guard("2026.10.4", "8.0.0") == REASON_UNSUPPORTED_LIB
    assert version_guard("2026.10.4", None) == REASON_UNSUPPORTED_LIB


class _FakeComponent:
    def __init__(self, entities):
        self.entities = entities

    def get_entity(self, entity_id):
        return self.entities.get(entity_id)


def _entity(platform: str, blob):
    content = SimpleNamespace(raw_api_response=blob, map_data=None)
    return SimpleNamespace(platform=SimpleNamespace(platform_name=platform), _map_content=content)


async def test_raw_map_blob_reads_only_the_roborock_entity(hass: HomeAssistant):
    blob = make_blob(PLAN, LEGEND)
    hass.data["image"] = _FakeComponent(
        {
            "image.robot_map": _entity("roborock", blob),
            "image.other": _entity("generic", blob),
            "image.empty": _entity("roborock", None),
        }
    )
    assert raw_map_blob(hass, "image.robot_map") == (blob, None)
    assert raw_map_blob(hass, "image.other") == (None, REASON_NOT_ROBOROCK)
    assert raw_map_blob(hass, "image.empty") == (None, REASON_NO_DATA)
    assert raw_map_blob(hass, "image.missing") == (None, REASON_NO_ENTITY)
    del hass.data["image"]
    assert raw_map_blob(hass, "image.robot_map") == (None, REASON_NO_ENTITY)


async def test_cache_falls_back_on_version_and_parse_errors(hass: HomeAssistant):
    hass.data["image"] = _FakeComponent(
        {
            "image.ok": _entity("roborock", make_blob(PLAN, LEGEND)),
            "image.bad": _entity("roborock", b"rr"),
        }
    )
    cache = VectorMapCache(hass)
    with patch.object(map_source, "lib_version", return_value="7.12.0"):
        ok = await cache.async_get("image.ok")
        bad = await cache.async_get("image.bad")
    assert ok["available"] and [r["id"] for r in ok["map"]["rooms"]] == [16, 17, 18]
    assert bad == {"available": False, "reason": REASON_PARSE_FAILED}
    with patch.object(map_source, "lib_version", return_value=None):
        assert await cache.async_get("image.ok") == {
            "available": False,
            "reason": REASON_UNSUPPORTED_LIB,
        }
    with (
        patch.object(map_source, "lib_version", return_value="7.12.0"),
        patch.object(map_source, "HA_VERSION", "2030.1.0"),
    ):
        assert (await cache.async_get("image.ok"))["reason"] == REASON_UNSUPPORTED_HA


async def test_ws_robots_map(hass: HomeAssistant, hass_ws_client):
    entry = MockConfigEntry(
        domain=DOMAIN,
        options={
            "bindings": {
                "robots": {
                    "robot1_vacuum": "vacuum.robot_a",
                    "robot1_map_image": "image.robot_a_map",
                    "robot2_vacuum": "vacuum.robot_b",
                }
            }
        },
    )
    entry.add_to_hass(hass)
    assert await async_setup_component(hass, DOMAIN, {})
    await hass.async_block_till_done()
    hass.data["image"] = _FakeComponent(
        {"image.robot_a_map": _entity("roborock", make_blob(PLAN, LEGEND))}
    )
    client = await hass_ws_client(hass)
    with patch.object(map_source, "lib_version", return_value="7.12.0"):
        await client.send_json({"id": 1, "type": "homebrain/robots/map", "slot": 1})
        first = await client.receive_json()
        await client.send_json({"id": 2, "type": "homebrain/robots/map", "slot": 2})
        second = await client.receive_json()
        await client.send_json({"id": 3, "type": "homebrain/robots/map", "slot": 4})
        invalid = await client.receive_json()
    assert first["success"] and first["result"]["available"] is True
    assert first["result"]["map"]["robot"]["a"] == 90
    assert second["result"] == {"available": False, "reason": "no_map_entity"}
    assert not invalid["success"]


# --- wall layer -------------------------------------------------------------------------


def _pixels(grid: list[str], ch: str = "#") -> set[tuple[int, int]]:
    """Pixel set of ``ch`` in a top-down grid, y growing upwards as in the blob."""
    height = len(grid)
    return {
        (x, height - 1 - row)
        for row, line in enumerate(grid)
        for x, c in enumerate(line)
        if c == ch
    }


def test_wall_pixel_types():
    assert is_wall(0x01)
    assert is_wall(0x89)  # v2 obstacle byte with type & 7 == 1
    assert not is_wall(0x00)
    assert not is_wall(0xFF)
    assert not is_wall(ROOM(16))


def test_thick_wall_band_becomes_one_centre_line():
    band = ["#" * 20] * 3  # 3 px thick straight wall
    lines = wall_polylines(_pixels(band))
    assert len(lines) == 1
    line = lines[0]
    assert len(line) == 2  # Douglas-Peucker: a straight wall is one segment
    assert {round(y, 1) for _, y in line} == {1.5}  # the middle row, not the two band edges
    assert abs(line[0][0] - line[1][0]) >= 15


def test_thinning_keeps_one_pixel_lines_untouched():
    line = _pixels(["#" * 12])
    assert thin(line) == line


def test_room_outline_walls_are_one_closed_loop_and_partition_is_single():
    grid = [
        "#############",
        "#.....#.....#",
        "#.....#.....#",
        "#.....#.....#",
        "#...........#",
        "#...........#",
        "#.....#.....#",
        "#.....#.....#",
        "#.....#.....#",
        "#############",
    ]
    lines = wall_polylines(_pixels(grid))
    total = sum(len(line) for line in lines)
    assert total <= 16  # rectangle corners + T-junction stubs, not a pixel staircase
    assert all(len(line) >= 2 for line in lines)
    xs_inner = [
        line
        for line in lines
        if all(abs(x - 6.5) < 0.01 for x, _ in line)  # the partition at column 6
    ]
    assert len(xs_inner) == 2  # one stroke above and one below the door gap, never doubled


def test_wall_specks_and_far_walls_are_dropped():
    grid = [
        ".##...##########################..",
        "..................................",
        "..................................",
        "..................................",
        "....##########################....",
        "..................................",
    ]
    walls = _pixels(grid)
    assert len(wall_polylines(walls)) == 2  # 2 px speck dropped
    room = _pixels(["." * 34] * 5 + ["....AAAAAAAAAAAAAAAAAAAAAAAAAA...."], "A")
    lines = wall_polylines(walls, rooms=room)
    assert len(lines) == 1  # only the wall hugging the room survives
    assert {round(y, 1) for _, y in lines[0]} == {1.5}


def test_room_dividers_are_drawn_once():
    labels = [16, 16, 17, 17] * 3  # 4×3, room 16 left, room 17 right
    lines = room_dividers(labels, 4, 3)
    assert lines == [[(2.0, 0.0), (2.0, 3.0)]] or lines == [[(2.0, 3.0), (2.0, 0.0)]]


def test_vector_map_has_walls_and_dividers_in_map_units():
    result = build_vector_map(make_blob(_scaled(PLAN, 4), LEGEND))
    assert result["walls"], "outer walls = the floor outline of the shared-arc partition"
    for line in result["walls"]:
        assert len(line) >= 4 and len(line) % 2 == 0
    xs = [v for line in result["walls"] for v in line[0::2]]
    assert min(xs) == pytest.approx(200 * 50, abs=110)  # inside the leftmost (4 px) wall
    assert isinstance(result["dividers"], list)


# --- synthetic real-map problems (invented geometry, never real floor plans) -------------


def _segments(flat: list[int]) -> list[tuple[tuple[int, int], tuple[int, int]]]:
    pts = list(zip(flat[0::2], flat[1::2], strict=True))
    return list(zip(pts, pts[1:], strict=False))


def _rotated_plan(deg: float, w: int = 64, h: int = 46) -> list[str]:
    """A 2 px walled rectangle room rotated by ``deg`` (pixel staircase walls)."""
    cos, sin = math.cos(math.radians(deg)), math.sin(math.radians(deg))
    rows = []
    for row in range(h):
        line = ""
        for x in range(w):
            px, py = x + 0.5 - w / 2, (h - 1 - row) + 0.5 - h / 2
            u, v = px * cos + py * sin, -px * sin + py * cos
            if abs(u) < 22 and abs(v) < 13:
                line += "A"
            elif abs(u) < 24 and abs(v) < 15:
                line += "#"
            else:
                line += "."
        rows.append(line)
    return rows


def test_rotated_map_walls_snap_to_the_map_axes():
    blob = make_blob(_rotated_plan(12.0), LEGEND, robot=None, charger=None)
    walls = build_vector_map(blob)["walls"]
    assert len(walls) == 1, "one closed outline, no fragments"
    segs = [s for s in _segments(walls[0]) if math.dist(*s) > 3 * 50]
    assert len(segs) == 4, "four straight walls, not a staircase"
    for a, b in segs:
        deg = math.degrees(math.atan2(b[1] - a[1], b[0] - a[0])) % 90
        assert deg == pytest.approx(12.0, abs=1.0)


def test_jagged_axis_walls_become_straight_lines():
    rows = ["." * 40]
    rows.append("." + "#" * 38 + ".")
    for i in range(20):
        jitter = "#" if i % 3 else ".#"  # 1 px bumps on the left wall
        inner = "A" * (37 - len(jitter) + 1)
        rows.append("." + jitter + inner[: 38 - len(jitter) - 1] + "##"[:1] + ".")
    rows.append("." + "#" * 38 + ".")
    rows.append("." * 40)
    width = max(len(r) for r in rows)
    rows = [r.ljust(width, ".") for r in rows]
    walls = build_vector_map(make_blob(rows, LEGEND, robot=None, charger=None))["walls"]
    for line in walls:
        for (x0, y0), (x1, y1) in _segments(line):
            assert x0 == x1 or y0 == y1, "every wall segment is axis aligned"
    assert sum(len(line) // 2 for line in walls) <= 8


def test_furniture_and_loose_fragments_are_not_walls():
    rows = ["#" * 40]
    for i in range(24):
        line = "#" + "A" * 38 + "#"
        if i in (5, 6, 7):  # 3x3 table leg cluster inside the room
            line = line[:10] + "###" + line[13:]
        if i == 15:  # loose 6 px dash in the middle of the room
            line = line[:20] + "######" + line[26:]
        rows.append(line)
    rows.append("#" * 40)
    walls = build_vector_map(make_blob(rows, LEGEND, robot=None, charger=None))["walls"]
    assert len(walls) == 1 and len(walls[0]) // 2 == 5  # just the closed outline


def test_room_fill_stays_inside_the_walls_and_obstacles_leave_no_holes():
    legend = {**LEGEND, "o": 0x08}  # obstacle/carpet byte inside the room
    rows = ["#" * 30]
    for i in range(16):
        line = "#" + "A" * 28 + "#"
        if 6 <= i <= 9:
            line = line[:12] + "oooo" + line[16:]
        rows.append(line)
    rows.append("#" * 30)
    vector = build_vector_map(make_blob(rows, legend, robot=None, charger=None))
    (room,) = vector["rooms"]
    assert len(room["polygons"]) == 1, "the obstacle shadow is filled, not a hole"
    walls = [v for line in vector["walls"] for v in line]
    room_xs, wall_xs = room["polygons"][0][0::2], walls[0::2]
    room_ys, wall_ys = room["polygons"][0][1::2], walls[1::2]
    assert min(room_xs) >= min(wall_xs) - 1 and max(room_xs) <= max(wall_xs) + 1
    assert min(room_ys) >= min(wall_ys) - 1 and max(room_ys) <= max(wall_ys) + 1


def test_dominant_angle_and_rectilinear_snap():
    theta = math.radians(5)
    c, s = math.cos(theta), math.sin(theta)
    wobbly = [(0.0, 0.0), (20 * c, 20 * s + 0.4), (20 * c - 10 * s, 20 * s + 10 * c)]
    assert math.degrees(dominant_angle([wobbly])) == pytest.approx(5, abs=1.5)
    (line,) = rectilinear([[(0.0, 0.0), (10.0, 0.6), (20.0, 0.0), (20.0, 10.0)]], theta=0.0)
    assert line == [(0.0, 0.3), (20.0, 0.3), (20.0, 10.0)]


# --- raster base layer -------------------------------------------------------------------


def _png_pixels(png: bytes):
    import io  # noqa: PLC0415

    from PIL import Image  # noqa: PLC0415

    img = Image.open(io.BytesIO(png))
    return img.convert("RGBA"), img.size


def _to_png(bounds, size, x, y):
    """Map units -> PNG pixel (the same transform the panel uses for the <image>)."""
    x0, y0, x1, y1 = bounds
    return (
        int((x - x0) / (x1 - x0) * size[0]),
        int((y1 - y) / (y1 - y0) * size[1]),
    )


def _centroid(flat):
    pts = list(zip(flat[0::2], flat[1::2], strict=True))
    area = cx = cy = 0.0
    for (ax, ay), (bx, by) in zip(pts, pts[1:] + pts[:1], strict=True):
        cross = ax * by - bx * ay
        area += cross
        cx += (ax + bx) * cross
        cy += (ay + by) * cross
    return cx / (3 * area), cy / (3 * area)


@pytest.mark.parametrize("theme", ["light", "dark"])
def test_raster_base_layer_aligns_with_vector_overlays(theme):
    blob = make_blob(PLAN, LEGEND)
    vector = build_vector_map(blob)
    layers = raster_layers(parse_raw_map(blob).image)
    bounds = raster_bounds(layers)
    img, size = _png_pixels(render_png(layers, theme))
    assert size == (layers.width * SCALE, layers.height * SCALE)
    palette = PALETTES[theme]
    for room in vector["rooms"]:
        # The overlay hit area (outline) sits on the room's floor pixels of the bitmap.
        for ring in room["outline"]:
            cx, cy = _centroid(ring)
            r, g, b, a = img.getpixel(_to_png(bounds, size, cx, cy))
            assert a == 255
            assert max(abs(r - palette["floor"][0]), abs(b - palette["floor"][2])) < 40
    # A wall pixel of the plan (middle of the top wall, map units) is painted on the
    # separate wall layer at the same transform; the wall layer is transparent elsewhere.
    walls, wall_size = _png_pixels(render_png(layers, theme, layer="walls"))
    assert wall_size == size
    corner = ((200 + 5.5) * 50, (100 + len(PLAN) - 0.5) * 50)
    r, g, b, a = walls.getpixel(_to_png(bounds, size, *corner))
    assert a > 200 and abs(r - palette["wall"][0]) < 40
    for room in vector["rooms"]:
        cx, cy = _centroid(room["outline"][0])
        assert walls.getpixel(_to_png(bounds, size, cx, cy))[3] == 0
    # Unknown space outside the walls stays transparent.
    assert img.getpixel((0, 0))[3] == 0


def test_raster_crop_and_room_seams():
    blob = make_blob(PLAN, LEGEND)
    image = parse_raw_map(blob).image
    layers = raster_layers(image)
    margin = 2 * CROP_MARGIN
    assert layers.width <= image.width + margin and layers.height <= image.height + margin
    assert raster_bounds(layers)[0] <= 200 * 50 and raster_bounds(layers)[3] >= 111 * 50
    # Rooms A and B touch through the wall only, A/C share the wall too: no seams there.
    assert sum(layers.walls) > 0 and sum(layers.floor) > sum(layers.walls)


def test_raster_rejects_unknown_theme():
    layers = raster_layers(parse_raw_map(make_blob(PLAN, LEGEND)).image)
    with pytest.raises(ValueError):
        render_png(layers, "neon")


async def test_robot_map_image_view(hass: HomeAssistant, hass_client, hass_ws_client):
    entry = MockConfigEntry(
        domain=DOMAIN,
        options={
            "bindings": {
                "robots": {
                    "robot1_vacuum": "vacuum.robot_a",
                    "robot1_map_image": "image.robot_a_map",
                }
            }
        },
    )
    entry.add_to_hass(hass)
    assert await async_setup_component(hass, DOMAIN, {})
    await hass.async_block_till_done()
    hass.data["image"] = _FakeComponent(
        {"image.robot_a_map": _entity("roborock", make_blob(PLAN, LEGEND))}
    )
    ws = await hass_ws_client(hass)
    with patch.object(map_source, "lib_version", return_value="7.12.0"):
        await ws.send_json({"id": 1, "type": "homebrain/robots/map", "slot": 1})
        msg = await ws.receive_json()
    raster = msg["result"]["map"]["raster"]
    digest = msg["result"]["map"]["digest"]
    assert raster["path"] == f"/api/homebrain/robots/map/1/{digest}/{{theme}}.png"
    client = await hass_client()
    url = raster["path"].format(theme="dark")
    response = await client.get(url)
    assert response.status == 200
    assert response.headers["Content-Type"] == "image/png"
    assert (await response.read())[:8] == b"\x89PNG\r\n\x1a\n"
    walls = await client.get(raster["path"].format(theme="dark-walls"))
    assert walls.status == 200 and walls.headers["ETag"] != response.headers["ETag"]
    assert (await client.get(raster["path"].format(theme="dark-roof"))).status == 404
    etag = response.headers["ETag"]
    again = await client.get(url, headers={"If-None-Match": etag})
    assert again.status == 304
    assert (await client.get(raster["path"].format(theme="neon"))).status == 404
    assert (await client.get(f"/api/homebrain/robots/map/1/{'0' * 16}/dark.png")).status == 404
    assert (await client.get(f"/api/homebrain/robots/map/2/{digest}/dark.png")).status == 404
