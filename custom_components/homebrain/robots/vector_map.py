"""Vector floor plan from a Roborock raw map blob (read-only, no robot commands).

The core Roborock integration only exposes a rendered PNG and room *bounding boxes*.
Room shapes live in the raw map blob (``MapContent.raw_api_response``): every pixel of the
IMAGE block carries a type byte, and for room pixels ``type & 7 == 7`` with the room
(segment) number in ``type >> 3``. This module parses just the blocks the panel needs –
without the optional ``vacuum-map-parser-roborock`` dependency – and turns the room masks
into simplified polygons in map coordinates (1 pixel = 50 map units, y grows upwards).

Everything here is pure Python and deterministic so it can be unit-tested with invented
synthetic maps (never commit real floor plans).
"""

from __future__ import annotations

import gzip
import hashlib
import math
import struct
from dataclasses import dataclass, field
from typing import Any, Final

from .topology import TOPOLOGY_VERSION, build_topology

PIXEL_UNITS: Final = 50  # map units per image pixel (vacuum_map_parser_roborock._image_to_map)
MAP_OUTSIDE: Final = 0x00
MAP_WALL: Final = 0x01
MAP_SCAN: Final = 0x07
MAP_INSIDE: Final = 0xFF

BLOCK_CHARGER: Final = 1
BLOCK_IMAGE: Final = 2
BLOCK_PATH: Final = 3
BLOCK_ROBOT_POSITION: Final = 8
BLOCK_NO_GO_AREAS: Final = 9
BLOCK_VIRTUAL_WALLS: Final = 10
BLOCK_NO_MOPPING_AREAS: Final = 12

MIN_RING_AREA_PX: Final = 6.0  # drop specks/holes smaller than this (pixels²)
SIMPLIFY_PX: Final = 0.9  # Douglas-Peucker tolerance for room outlines (pixels)
PATH_SIMPLIFY_UNITS: Final = 12.0
MAX_PATH_POINTS: Final = 1500
MAX_ROOMS: Final = 64
USE_TOPOLOGY: Final = True  # shared-arc partition (topology.py); False = legacy per-room traces
MAX_IMAGE_PIXELS: Final = 4_000_000
MIN_WALL_PX: Final = 8  # wall components with fewer pixels are furniture specks / noise
MIN_ISOLATED_WALL_PX: Final = 24  # … and loose components below this with no wall nearby
WALL_NEIGHBOUR_PX: Final = 3  # "nearby" for the rule above (Chebyshev distance)
MAX_FURNITURE_PX: Final = 240  # blobs inside a single room below this are furniture …
FURNITURE_UNKNOWN_SHARE: Final = 0.3  # … even if up to this share of their rim is not a room
MIN_LOOSE_WALL_PX: Final = 8.0  # strokes with two free ends shorter than this are noise
WALL_SIMPLIFY_PX: Final = 1.0
WALL_SPUR_PX: Final = 2.5  # thinning spurs shorter than this are dropped
WALL_SNAP_DEG: Final = 8.0  # segments within this of the map axes are snapped onto them
WALL_MERGE_PX: Final = 1.1  # parallel runs closer than this are one wall
WALL_CHAMFER_PX: Final = 4.5  # short off-axis bits between two axis runs are pixel corners
WALL_JOG_PX: Final = 1.6  # axis steps shorter than this between parallel runs are pixel noise
WALL_UNIFY_GAP_PX: Final = 3.0  # collinear runs of different strokes this close share a line
WALL_JOINT_REACH_PX: Final = 5.0  # corner intersections farther than this become a jog
MIN_WALL_LINE_PX: Final = 3.0  # loose dashes shorter than this are noise
MIN_WALL_LOOP_PX: Final = 16.0  # closed loops with a shorter perimeter are furniture boxes
WALL_NEAR_ROOM_PX: Final = 2  # a wall must hug a room (Chebyshev distance in pixels) …
WALL_NEAR_ROOM_SHARE: Final = 0.3  # … for at least this share of its pixels
MAX_WALL_LINES: Final = 600
ROOM_SIMPLIFY_PX: Final = 1.2  # room fills are straightened afterwards, see rectilinear()
MIN_ROOM_HOLE_PX: Final = 600  # holes in a fill below ~1.5 m² (furniture shadows) are filled
WALL_WEIGHT: Final = 8.0  # walls win when a room edge and a wall are unified to one line
ROOM_SMOOTH_PASSES: Final = 2
ROOM_GROW_STEPS: Final = 2  # rooms absorb unsegmented seams up to this many pixels wide
MIN_ROOM_ISLAND_PX: Final = 24  # detached room pieces smaller than this are dropped …
ROOM_ISLAND_SHARE: Final = 0.04  # … unless they are at least this share of the main body


class MapParseError(ValueError):
    """The blob is not a Roborock v1 map we understand."""


@dataclass
class ImageBlock:
    top: int
    left: int
    width: int
    height: int
    data: bytes


@dataclass
class RawMap:
    image: ImageBlock | None = None
    charger: tuple[int, int, int | None] | None = None
    robot: tuple[int, int, int | None] | None = None
    path: list[tuple[int, int]] = field(default_factory=list)
    no_go: list[list[int]] = field(default_factory=list)
    no_mop: list[list[int]] = field(default_factory=list)
    virtual_walls: list[list[int]] = field(default_factory=list)


def _u16(buf: bytes, at: int) -> int:
    return struct.unpack_from("<H", buf, at)[0]


def _i16(buf: bytes, at: int) -> int:
    return struct.unpack_from("<h", buf, at)[0]


def _u32(buf: bytes, at: int) -> int:
    return struct.unpack_from("<I", buf, at)[0]


def _position(data: bytes) -> tuple[int, int, int | None]:
    x, y = _u32(data, 0), _u32(data, 4)
    angle = None
    if len(data) >= 12:
        angle = _u32(data, 8)
        if angle > 0xFF:
            angle = (angle & 0xFF) - 256
    return x, y, angle


def parse_raw_map(blob: bytes) -> RawMap:
    """Parse the blocks of a Roborock v1 map blob (``rr`` header, little endian)."""
    if not isinstance(blob, (bytes, bytearray)) or len(blob) < 0x14:
        raise MapParseError("empty map")
    raw = bytes(blob)
    if raw[:2] == b"\x1f\x8b":
        try:
            raw = gzip.decompress(raw)
        except (OSError, EOFError) as err:
            raise MapParseError("bad gzip") from err
    if raw[:2] != b"rr":
        raise MapParseError("not a Roborock v1 map")
    result = RawMap()
    pos = _u16(raw, 0x02)
    try:
        while pos + 8 <= len(raw):
            block_type = _u16(raw, pos)
            header_len = _u16(raw, pos + 2)
            data_len = _u32(raw, pos + 4)
            if header_len < 8 or pos + header_len + data_len > len(raw):
                raise MapParseError("truncated block")
            header = raw[pos : pos + header_len]
            data = raw[pos + header_len : pos + header_len + data_len]
            if block_type == BLOCK_IMAGE:
                top = struct.unpack_from("<i", header, header_len - 16)[0]
                left = struct.unpack_from("<i", header, header_len - 12)[0]
                height = struct.unpack_from("<i", header, header_len - 8)[0]
                width = struct.unpack_from("<i", header, header_len - 4)[0]
                if width < 0 or height < 0 or width * height > MAX_IMAGE_PIXELS:
                    raise MapParseError("bad image size")
                if width * height > len(data):
                    raise MapParseError("image data too short")
                result.image = ImageBlock(top, left, width, height, data)
            elif block_type == BLOCK_CHARGER:
                result.charger = _position(data)
            elif block_type == BLOCK_ROBOT_POSITION:
                result.robot = _position(data)
            elif block_type == BLOCK_PATH:
                count = _u32(header, 0x04) // 4
                result.path = [(_u16(data, i * 4), _u16(data, i * 4 + 2)) for i in range(count)]
            elif block_type in (BLOCK_NO_GO_AREAS, BLOCK_NO_MOPPING_AREAS):
                areas = [
                    [_u16(data, start + k * 2) for k in range(8)]
                    for start in range(0, _u16(header, 0x08) * 16, 16)
                    if start + 16 <= len(data)
                ]
                (result.no_go if block_type == BLOCK_NO_GO_AREAS else result.no_mop).extend(areas)
            elif block_type == BLOCK_VIRTUAL_WALLS:
                result.virtual_walls = [
                    [_u16(data, start + k * 2) for k in range(4)]
                    for start in range(0, _u16(header, 0x08) * 8, 8)
                    if start + 8 <= len(data)
                ]
            # Unknown blocks are skipped; the header's byte 2 is the header length.
            pos += header_len + data_len
    except struct.error as err:
        raise MapParseError("truncated header") from err
    return result


# --- room masks -> polygons -------------------------------------------------------------


def room_number(pixel: int) -> int:
    """Room/segment number of a pixel type byte, or 0 for non-room pixels."""
    if pixel in (MAP_INSIDE, MAP_SCAN) or pixel & 0x07 != 7:
        return 0
    return pixel >> 3


def _floor(pixel: int) -> int:
    """Floor slab = rooms + unsegmented floor + walls (walls show as gaps between rooms)."""
    if pixel in (MAP_OUTSIDE, MAP_SCAN):
        return 0
    return 1 if pixel in (MAP_INSIDE, MAP_WALL) or pixel & 0x07 in (0, 1, 7) else 0


def label_grid(image: ImageBlock, labeler: Any = room_number) -> list[int]:
    """Row-major labels (row 0 = bottom row, as in the blob)."""
    table = [labeler(value) for value in range(256)]
    return [table[value] for value in image.data[: image.width * image.height]]


def trace_rings(
    labels: list[int], width: int, height: int
) -> dict[int, list[list[tuple[int, int]]]]:
    """Closed boundary rings per label on the pixel-corner grid.

    Outer rings run counter-clockwise (interior on the left, positive area), holes clockwise.
    """
    edges: dict[int, dict[tuple[int, int], list[tuple[int, int]]]] = {}

    def add(label: int, a: tuple[int, int], b: tuple[int, int]) -> None:
        edges.setdefault(label, {}).setdefault(a, []).append(b)

    for y in range(height):
        row = y * width
        for x in range(width):
            label = labels[row + x]
            if not label:
                continue
            if y == 0 or labels[row - width + x] != label:
                add(label, (x, y), (x + 1, y))
            if x == width - 1 or labels[row + x + 1] != label:
                add(label, (x + 1, y), (x + 1, y + 1))
            if y == height - 1 or labels[row + width + x] != label:
                add(label, (x + 1, y + 1), (x, y + 1))
            if x == 0 or labels[row + x - 1] != label:
                add(label, (x, y + 1), (x, y))

    rings: dict[int, list[list[tuple[int, int]]]] = {}
    for label, graph in edges.items():
        while graph:
            start = next(iter(graph))
            ring = [start]
            prev = start
            current = _pop_edge(graph, start, None)
            while current != start:
                ring.append(current)
                nxt = _pop_edge(graph, current, (current[0] - prev[0], current[1] - prev[1]))
                prev, current = current, nxt
            rings.setdefault(label, []).append(ring)
    return rings


def _pop_edge(
    graph: dict[tuple[int, int], list[tuple[int, int]]],
    at: tuple[int, int],
    heading: tuple[int, int] | None,
) -> tuple[int, int]:
    outs = graph[at]
    index = 0
    if heading is not None and len(outs) > 1:
        # Saddle vertex: turn left so diagonal-touching pixels become separate rings.
        hx, hy = heading
        for i, (nx, ny) in enumerate(outs):
            dx, dy = nx - at[0], ny - at[1]
            if hx * dy - hy * dx > 0:
                index = i
                break
    target = outs.pop(index)
    if not outs:
        del graph[at]
    return target


def ring_area(ring: list[tuple[float, float]]) -> float:
    total = 0.0
    for i, (x0, y0) in enumerate(ring):
        x1, y1 = ring[(i + 1) % len(ring)]
        total += x0 * y1 - x1 * y0
    return total / 2


def _dp(points: list[tuple[float, float]], tolerance: float) -> list[tuple[float, float]]:
    if len(points) < 3:
        return points
    keep = [False] * len(points)
    keep[0] = keep[-1] = True
    stack = [(0, len(points) - 1)]
    while stack:
        first, last = stack.pop()
        ax, ay = points[first]
        bx, by = points[last]
        dx, dy = bx - ax, by - ay
        norm = math.hypot(dx, dy)
        best, best_dist = -1, tolerance
        for i in range(first + 1, last):
            px, py = points[i]
            if norm:
                dist = abs(dy * px - dx * py + bx * ay - by * ax) / norm
            else:
                dist = math.hypot(px - ax, py - ay)
            if dist > best_dist:
                best, best_dist = i, dist
        if best >= 0:
            keep[best] = True
            stack.extend(((first, best), (best, last)))
    return [point for point, kept in zip(points, keep, strict=True) if kept]


def simplify_ring(ring: list[tuple[float, float]], tolerance: float) -> list[tuple[float, float]]:
    """Douglas-Peucker for a closed ring (split at the two mutually farthest vertices)."""
    if len(ring) <= 4:
        return list(ring)
    first = ring[0]
    far = max(
        range(len(ring)), key=lambda i: (ring[i][0] - first[0]) ** 2 + (ring[i][1] - first[1]) ** 2
    )
    part1 = _dp(ring[: far + 1], tolerance)
    part2 = _dp([*ring[far:], first], tolerance)
    result = part1[:-1] + part2[:-1]
    return result if len(result) >= 3 else list(ring)


def polygons_from_labels(
    labels: list[int],
    width: int,
    height: int,
    tolerance: float = SIMPLIFY_PX,
    min_area: float = MIN_RING_AREA_PX,
    min_hole: float = MIN_RING_AREA_PX,
) -> dict[int, list[list[tuple[float, float]]]]:
    """Simplified rings per label in pixel coordinates; outer rings first (largest first).

    Rings below ``min_area`` and holes below ``min_hole`` (pixels²) are dropped.
    """
    result: dict[int, list[list[tuple[float, float]]]] = {}
    for label, rings in trace_rings(labels, width, height).items():
        kept = []
        for ring in rings:
            area = ring_area(ring)
            if abs(area) < (min_area if area > 0 else max(min_area, min_hole)):
                continue
            simple = simplify_ring([(float(x), float(y)) for x, y in ring], tolerance)
            if len(simple) >= 3:
                kept.append((area, simple))
        kept.sort(key=lambda item: (item[0] < 0, -abs(item[0])))
        if kept and kept[0][0] > 0:
            result[label] = [ring for _, ring in kept]
    return result


# --- wall layer -> single centre-line polylines ----------------------------------------

Pixel = tuple[int, int]

_N8: Final = ((0, 1), (1, 1), (1, 0), (1, -1), (0, -1), (-1, -1), (-1, 0), (-1, 1))


def is_wall(pixel: int) -> bool:
    """Wall pixel: ``MAP_WALL`` (0x01) or a v2 obstacle byte with ``type & 7 == 1``."""
    return pixel & 0x07 == 1


def wall_pixels(image: ImageBlock) -> set[Pixel]:
    width = image.width
    data = image.data[: width * image.height]
    return {(i % width, i // width) for i, value in enumerate(data) if value & 0x07 == 1}


def _components(pixels: set[Pixel]) -> list[set[Pixel]]:
    """8-connected components."""
    left = set(pixels)
    out: list[set[Pixel]] = []
    while left:
        seed = left.pop()
        comp = {seed}
        stack = [seed]
        while stack:
            x, y = stack.pop()
            for dx, dy in _N8:
                nb = (x + dx, y + dy)
                if nb in left:
                    left.remove(nb)
                    comp.add(nb)
                    stack.append(nb)
        out.append(comp)
    return out


def thin(pixels: set[Pixel]) -> set[Pixel]:
    """Zhang-Suen thinning: 2-3 px wall bands become a 1 px centre line."""
    pts = set(pixels)
    changed = True
    while changed:
        changed = False
        for step in (0, 1):
            remove = []
            for x, y in pts:
                n = [(x + dx, y + dy) in pts for dx, dy in _N8]  # P2..P9, clockwise from up
                count = sum(n)
                if count < 2 or count > 6:
                    continue
                if sum(1 for i in range(8) if not n[i] and n[(i + 1) % 8]) != 1:
                    continue
                p2, _p3, p4, _p5, p6, _p7, p8, _p9 = n
                if step == 0 and ((p2 and p4 and p6) or (p4 and p6 and p8)):
                    continue
                if step == 1 and ((p2 and p4 and p8) or (p2 and p6 and p8)):
                    continue
                remove.append((x, y))
            if remove:
                changed = True
                pts.difference_update(remove)
    return pts


def _pixel_graph(pixels: set[Pixel]) -> dict[Pixel, set[Pixel]]:
    """8-neighbour graph without redundant diagonals (a shared 4-neighbour wins)."""
    graph: dict[Pixel, set[Pixel]] = {p: set() for p in pixels}
    for x, y in pixels:
        for dx, dy in _N8:
            nb = (x + dx, y + dy)
            if nb not in pixels:
                continue
            if dx and dy and ((x + dx, y) in pixels or (x, y + dy) in pixels):
                continue
            graph[(x, y)].add(nb)
    return graph


def trace_chains(graph: dict[Any, set[Any]]) -> list[list[Any]]:
    """Split an undirected graph into polylines between junctions/ends (+ closed loops)."""
    seen: set[frozenset[Any]] = set()
    chains: list[list[Any]] = []

    def walk(start: Any, nxt: Any) -> list[Any]:
        chain = [start]
        prev, cur = start, nxt
        seen.add(frozenset((prev, cur)))
        while True:
            chain.append(cur)
            if len(graph[cur]) != 2 or cur == start:
                return chain
            following = next((n for n in graph[cur] if n != prev), None)
            if following is None or frozenset((cur, following)) in seen:
                return chain
            seen.add(frozenset((cur, following)))
            prev, cur = cur, following

    for node in sorted(graph, key=lambda p: (len(graph[p]) == 2, p)):
        for nb in sorted(graph[node]):
            if frozenset((node, nb)) not in seen:
                chains.append(walk(node, nb))
    return chains


def _length(points: list[tuple[float, float]]) -> float:
    return sum(math.dist(a, b) for a, b in zip(points, points[1:], strict=False))


def _near(pixel: Pixel, room: set[Pixel], reach: int) -> bool:
    x, y = pixel
    return any(
        (x + dx, y + dy) in room
        for dx in range(-reach, reach + 1)
        for dy in range(-reach, reach + 1)
    )


def bridge_gaps(pixels: set[Pixel]) -> set[Pixel]:
    """Close 1 px gaps and pinholes in the wall layer (sensor dropouts), never door gaps.

    A pixel becomes wall when its left+right or upper+lower neighbours are walls (diagonal
    pairs would fill the inner corners of T/L joints); a 2 px gap stays open.
    """
    out = set(pixels)
    candidates = {(x + dx, y + dy) for x, y in pixels for dx, dy in _N8} - pixels
    for x, y in candidates:
        for dx, dy in ((1, 0), (0, 1)):
            if (x + dx, y + dy) in pixels and (x - dx, y - dy) in pixels:
                out.add((x, y))
                break
    return out


def _is_furniture(comp: set[Pixel], rooms: Any) -> bool:
    """Small blob whose surroundings are (almost) all one room: furniture, not a wall."""
    if len(comp) >= MAX_FURNITURE_PX:
        return False
    found: dict[int, int] = {}
    for x, y in comp:
        for dx, dy in _N8:
            nb = (x + dx, y + dy)
            if nb in comp:
                continue
            label = rooms.get(nb, 0) if isinstance(rooms, dict) else int(nb in rooms)
            found[label] = found.get(label, 0) + 1
    total = sum(found.values()) or 1
    labels = [label for label in found if label]
    return len(labels) == 1 and found.get(0, 0) <= FURNITURE_UNKNOWN_SHARE * total


def dominant_angle(lines: list[list[tuple[float, float]]], min_len: float = 3.0) -> float:
    """Map rotation (radians in [0, pi/2)) from a length-weighted histogram of wall directions."""
    bins = [0.0] * 90
    segs: list[tuple[float, float]] = []
    for line in lines:
        for a, b in zip(line, line[1:], strict=False):
            length = math.dist(a, b)
            if length < min_len:
                continue
            deg = math.degrees(math.atan2(b[1] - a[1], b[0] - a[0])) % 90.0
            segs.append((deg, length))
            bins[int(deg) % 90] += length
    if not segs:
        return 0.0
    smooth = [sum(bins[(i + k) % 90] for k in range(-2, 3)) for i in range(90)]
    peak = max(range(90), key=lambda i: smooth[i]) + 0.5
    # Refine: length-weighted median (period 90°) of the directions near the peak; a median
    # ignores the 1-3° tilt of pixel-staircase walls that a mean would average in.
    near = sorted(
        ((deg - peak + 45.0) % 90.0 - 45.0, length)
        for deg, length in segs
        if abs((deg - peak + 45.0) % 90.0 - 45.0) <= 5.0
    )
    half, acc, median = sum(length for _, length in near) / 2, 0.0, 0.0
    for diff, length in near:
        acc += length
        median = diff
        if acc >= half:
            break
    mean = (peak + median) % 90.0

    def support(angle: float) -> float:
        return sum(length for deg, length in segs if abs((deg - angle + 45.0) % 90.0 - 45.0) <= 3.0)

    # Roborock aligns most maps with the walls: prefer exact axes when they explain the walls
    # about as well (cut corners of pixel staircases tilt a few segments by 1-3°).
    if support(0.0) >= 0.8 * support(mean):
        return 0.0
    if mean > 89.0 or mean < 1.0:
        mean = 0.0  # axis-aligned map: keep exact integer pixel geometry
    return math.radians(mean)


@dataclass
class _Line:
    axis: int | None  # 0 = along the map rotation, 1 = perpendicular, None = free direction
    off: float  # offset along the axis normal (axis lines only)
    a: tuple[float, float]
    b: tuple[float, float]
    length: float


class _Axes:
    def __init__(self, theta: float) -> None:
        self.u = ((math.cos(theta), math.sin(theta)), (-math.sin(theta), math.cos(theta)))

    def dot(self, axis: int, p: tuple[float, float]) -> float:
        ux, uy = self.u[axis]
        return p[0] * ux + p[1] * uy

    def normal_off(self, axis: int, p: tuple[float, float]) -> float:
        return self.dot(1 - axis, p)

    def point(self, axis: int, along: float, off: float) -> tuple[float, float]:
        (ux, uy), (nx, ny) = self.u[axis], self.u[1 - axis]
        return (along * ux + off * nx, along * uy + off * ny)


def _classify(a: tuple[float, float], b: tuple[float, float], axes: _Axes, tol: float) -> _Line:
    length = math.dist(a, b)
    ux, uy = axes.u[0]
    ang = math.atan2(b[1] - a[1], b[0] - a[0]) - math.atan2(uy, ux)
    ang %= math.pi
    axis = None
    if ang < tol or ang > math.pi - tol:
        axis = 0
    elif abs(ang - math.pi / 2) < tol:
        axis = 1
    mid = ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)
    off = axes.normal_off(axis, mid) if axis is not None else 0.0
    return _Line(axis, off, a, b, length)


def _merge_runs(lines: list[_Line], merge: float, chamfer: float) -> list[_Line]:
    """Merge collinear neighbours; drop short free chamfers between two axis lines."""
    out: list[_Line] = []
    i = 0
    while i < len(lines):
        line = lines[i]
        if (
            line.axis is None
            and line.length < chamfer
            and out
            and out[-1].axis is not None
            and i + 1 < len(lines)
            and lines[i + 1].axis is not None
        ):
            i += 1
            continue
        nxt = lines[i + 1] if i + 1 < len(lines) else None
        if (
            line.axis is not None
            and line.length < WALL_JOG_PX
            and out
            and nxt is not None
            and out[-1].axis is not None
            and out[-1].axis == nxt.axis != line.axis
            and abs(out[-1].off - nxt.off) <= merge
        ):
            i += 1  # 1 px staircase step between two runs of one wall
            continue
        prev = out[-1] if out else None
        if (
            prev is not None
            and line.axis is not None
            and prev.axis == line.axis
            and abs(prev.off - line.off) <= merge
        ):
            total = prev.length + line.length
            prev.off = (prev.off * prev.length + line.off * line.length) / total
            prev.b = line.b
            prev.length = total
        else:
            out.append(_Line(line.axis, line.off, line.a, line.b, line.length))
        i += 1
    return out


def _project(line: _Line, p: tuple[float, float], axes: _Axes) -> tuple[float, float]:
    if line.axis is not None:
        return axes.point(line.axis, axes.dot(line.axis, p), line.off)
    (ax, ay), (bx, by) = line.a, line.b
    dx, dy = bx - ax, by - ay
    norm = dx * dx + dy * dy
    if not norm:
        return line.a
    t = ((p[0] - ax) * dx + (p[1] - ay) * dy) / norm
    return (ax + t * dx, ay + t * dy)


def _direction(line: _Line, axes: _Axes) -> tuple[tuple[float, float], tuple[float, float]]:
    """(point, direction) of the infinite line."""
    if line.axis is not None:
        return axes.point(line.axis, 0.0, line.off), axes.u[line.axis]
    return line.a, (line.b[0] - line.a[0], line.b[1] - line.a[1])


def _joint(
    l1: _Line, l2: _Line, v: tuple[float, float], axes: _Axes, reach: float
) -> list[tuple[float, float]]:
    """Vertices where line ``l1`` hands over to ``l2`` around the original vertex ``v``."""
    if not (l1.axis is not None and l1.axis == l2.axis):
        (p, d), (q, e) = _direction(l1, axes), _direction(l2, axes)
        den = d[0] * e[1] - d[1] * e[0]
        if abs(den) > 1e-9:
            t = ((q[0] - p[0]) * e[1] - (q[1] - p[1]) * e[0]) / den
            hit = (p[0] + t * d[0], p[1] + t * d[1])
            if math.dist(hit, v) <= reach:
                return [hit]
    return [_project(l1, v, axes), _project(l2, v, axes)]


def _dedupe(points: list[tuple[float, float]], eps: float = 0.05) -> list[tuple[float, float]]:
    out: list[tuple[float, float]] = []
    for p in points:
        if not out or math.dist(out[-1], p) > eps:
            out.append(p)
    return out


def _unify_offsets(
    all_lines: list[list[_Line]], axes: _Axes, merge: float, gap: float, weights: list[float]
) -> None:
    """Snap collinear runs of different polylines (both sides of a T-junction) to one offset."""
    for axis in (0, 1):
        weight = {
            id(line): w for lines, w in zip(all_lines, weights, strict=True) for line in lines
        }
        items = [line for lines in all_lines for line in lines if line.axis == axis]
        items.sort(key=lambda line: line.off)
        spans = {
            id(line): sorted((axes.dot(axis, line.a), axes.dot(axis, line.b))) for line in items
        }
        parent = list(range(len(items)))

        def find(i: int, parent: list[int] = parent) -> int:
            while parent[i] != i:
                parent[i] = parent[parent[i]]
                i = parent[i]
            return i

        for i, li in enumerate(items):
            si = spans[id(li)]
            for j in range(i + 1, len(items)):
                lj = items[j]
                if lj.off - li.off > merge:
                    break
                sj = spans[id(lj)]
                if sj[0] - si[1] <= gap and si[0] - sj[1] <= gap:
                    parent[find(i)] = find(j)
        groups: dict[int, list[_Line]] = {}
        for i, line in enumerate(items):
            groups.setdefault(find(i), []).append(line)
        for group in groups.values():
            if len(group) < 2:
                continue
            total = sum(line.length * weight[id(line)] for line in group) or 1.0
            off = sum(line.off * line.length * weight[id(line)] for line in group) / total
            for line in group:
                line.off = off


def rectilinear(
    polylines: list[list[tuple[float, float]]],
    theta: float | None = None,
    snap_deg: float = WALL_SNAP_DEG,
    merge: float = WALL_MERGE_PX,
    weights: list[float] | None = None,
) -> list[list[tuple[float, float]]]:
    """Snap wall segments within ``snap_deg`` of the map axes onto them, merge collinear runs.

    Corners become exact intersections, so pixel staircases of slightly rotated or diagonal
    walls turn into straight strokes; genuinely diagonal walls (outside the snap window) keep
    their direction. Closed polylines (first == last point) stay closed. Collinear runs of
    different polylines are unified (length x ``weights`` mean), so room edges lying next to a
    wall centre line (weight 1 vs. walls' higher weight) land exactly under the wall. Output
    keeps the input order; a polyline that degenerates comes back as ``[]``.
    """
    axes = _Axes(dominant_angle(polylines) if theta is None else theta)
    tol = math.radians(snap_deg)
    parsed: list[tuple[list[_Line], bool, list[tuple[float, float]]]] = []
    kept_weights: list[float] = []
    for index, line in enumerate(polylines):
        closed = len(line) > 3 and math.dist(line[0], line[-1]) < 1e-6
        segs = [_classify(a, b, axes, tol) for a, b in zip(line, line[1:], strict=False)]
        segs = [seg for seg in segs if seg.length > 1e-9]
        if not segs:
            parsed.append(([], closed, line))
            kept_weights.append(0.0)
            continue
        runs = _merge_runs(segs, merge, WALL_CHAMFER_PX)
        if closed and len(runs) > 1:
            first, last = runs[0], runs[-1]
            if first.axis is not None and first.axis == last.axis:
                if abs(first.off - last.off) <= merge:
                    total = first.length + last.length
                    first.off = (first.off * first.length + last.off * last.length) / total
                    first.a, first.length = last.a, total
                    runs.pop()
        parsed.append((runs, closed, line))
        kept_weights.append(weights[index] if weights else 1.0)
    _unify_offsets([runs for runs, _, _ in parsed], axes, merge, WALL_UNIFY_GAP_PX, kept_weights)
    out: list[list[tuple[float, float]]] = []
    for runs, closed, line in parsed:
        pts: list[tuple[float, float]] = []
        if not runs:
            out.append([])
            continue
        if closed and len(runs) > 2:
            for i, cur in enumerate(runs):
                nxt = runs[(i + 1) % len(runs)]
                pts.extend(_joint(cur, nxt, cur.b, axes, WALL_JOINT_REACH_PX))
            pts = _dedupe(pts)
            out.append([*pts, pts[0]] if len(pts) >= 3 else [])
            continue
        pts.append(_project(runs[0], line[0], axes))
        for cur, nxt in zip(runs, runs[1:], strict=False):
            pts.extend(_joint(cur, nxt, cur.b, axes, WALL_JOINT_REACH_PX))
        pts.append(_project(runs[-1], line[-1], axes))
        pts = _dedupe(pts)
        out.append(pts if len(pts) >= 2 else [])
    return out


def filter_walls(
    pixels: set[Pixel],
    rooms: set[Pixel] | dict[Pixel, int] | None = None,
    min_pixels: int = MIN_WALL_PX,
) -> set[Pixel]:
    """Real wall pixels: 1 px dropouts bridged; specks, furniture and far scans dropped.

    Shared by the vector walls and the raster base layer, so both show the same walls.
    """
    pixels = bridge_gaps(pixels)
    candidates: list[set[Pixel]] = []
    for comp in _components(pixels):
        if len(comp) < min_pixels:
            continue
        if rooms is not None:
            near = sum(1 for px in comp if _near(px, rooms, WALL_NEAR_ROOM_PX))
            if near < WALL_NEAR_ROOM_SHARE * len(comp):
                continue
            if _is_furniture(comp, rooms):
                continue  # free-standing blob inside one room = furniture / obstacle
        candidates.append(comp)
    kept: set[Pixel] = set()
    for comp in candidates:
        if len(comp) < MIN_ISOLATED_WALL_PX:
            others = [c for c in candidates if c is not comp]
            if not any(_near(px, other, WALL_NEIGHBOUR_PX) for other in others for px in comp):
                continue  # short loose fragment
        kept |= comp
    return kept


def wall_polylines(
    pixels: set[Pixel],
    tolerance: float = WALL_SIMPLIFY_PX,
    min_pixels: int = MIN_WALL_PX,
    rooms: set[Pixel] | dict[Pixel, int] | None = None,
    theta: float | None = None,
    straighten: bool = True,
) -> list[list[tuple[float, float]]]:
    """Wall pixels -> straight centre-line polylines in pixel coordinates (pixel centres).

    Pipeline: bridge 1 px dropouts, drop specks, furniture outlines (a small blob surrounded
    by a single room) and walls far from every room (scans through windows), thin the bands
    to one centre line, trace chains between junctions, Douglas-Peucker, then snap the
    segments onto the dominant map axes (``rectilinear``) so walls render as straight strokes.
    """
    kept = filter_walls(pixels, rooms, min_pixels)
    skeleton = thin(kept)
    graph = _pixel_graph(skeleton)
    lines: list[list[tuple[float, float]]] = []
    for chain in trace_chains(graph):
        points = [(x + 0.5, y + 0.5) for x, y in chain]
        free_start, free_end = len(graph[chain[0]]) == 1, len(graph[chain[-1]]) == 1
        junction = len(graph[chain[0]]) > 2 or len(graph[chain[-1]]) > 2
        if (free_start or free_end) and junction and _length(points) < WALL_SPUR_PX:
            continue  # thinning spur
        if len(points) < 2:
            continue
        closed = chain[0] == chain[-1]
        if _length(points) < (MIN_WALL_LOOP_PX if closed else MIN_WALL_LINE_PX):
            continue
        if free_start and free_end and _length(points) < MIN_LOOSE_WALL_PX:
            continue  # isolated short stroke
        if closed and len(points) > 4:
            ring = simplify_ring(points[:-1], tolerance)
            lines.append([*ring, ring[0]])
        else:
            lines.append(_dp(points, tolerance))
    if straighten:
        lines = [line for line in rectilinear(lines, theta) if line]
    lines.sort(key=_length, reverse=True)
    return lines[:MAX_WALL_LINES]


def room_dividers(
    labels: list[int], width: int, height: int, tolerance: float = SIMPLIFY_PX
) -> list[list[tuple[float, float]]]:
    """Shared borders of two different rooms, each drawn once (pixel-corner coordinates)."""
    graph: dict[Pixel, set[Pixel]] = {}

    def edge(a: Pixel, b: Pixel) -> None:
        graph.setdefault(a, set()).add(b)
        graph.setdefault(b, set()).add(a)

    for y in range(height):
        row = y * width
        for x in range(width):
            label = labels[row + x]
            if not label:
                continue
            right = labels[row + x + 1] if x + 1 < width else 0
            up = labels[row + width + x] if y + 1 < height else 0
            if right and right != label:
                edge((x + 1, y), (x + 1, y + 1))
            if up and up != label:
                edge((x, y + 1), (x + 1, y + 1))
    lines = []
    for chain in trace_chains(graph):
        points = [(float(x), float(y)) for x, y in chain]
        if _length(points) >= 2:
            lines.append(_dp(points, tolerance))
    return lines[:MAX_WALL_LINES]


# --- public builder ----------------------------------------------------------------------


def image_digest(image: ImageBlock | None) -> str | None:
    if image is None:
        return None
    digest = hashlib.sha1(usedforsecurity=False)
    digest.update(struct.pack("<iiii", image.top, image.left, image.width, image.height))
    digest.update(image.data[: image.width * image.height])
    return digest.hexdigest()[:16]


def _flat(ring: list[tuple[float, float]], image: ImageBlock) -> list[int]:
    """Pixel coordinates -> flat map units (also for open polylines)."""
    out: list[int] = []
    for x, y in ring:
        out.extend((round((x + image.left) * PIXEL_UNITS), round((y + image.top) * PIXEL_UNITS)))
    return out


def grow_rooms(image: ImageBlock, labels: list[int], steps: int = ROOM_GROW_STEPS) -> list[int]:
    """Room fills that meet the walls: rooms absorb thin unsegmented/obstacle seams next to them.

    Rooms grow (4-neighbour, ``steps`` pixels) only into non-wall floor pixels (unsegmented
    floor, obstacle/carpet bytes), never into walls or unknown space, so a fill can not spill
    over a wall. Small detached islands of a room (scan bleed behind a wall) are dropped.
    """
    width, height = image.width, image.height
    data = image.data[: width * height]
    out = list(labels)
    growable = [
        not label and value not in (MAP_OUTSIDE, MAP_SCAN) and value & 0x07 != 1
        for label, value in zip(labels, data, strict=True)
    ]
    for _ in range(steps):
        updates: list[tuple[int, int]] = []
        for i, ok in enumerate(growable):
            if not ok or out[i]:
                continue
            x, y = i % width, i // width
            best = 0
            for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
                if 0 <= nx < width and 0 <= ny < height:
                    label = out[ny * width + nx]
                    if label and (not best or label < best):
                        best = label
            if best:
                updates.append((i, best))
        if not updates:
            break
        for i, label in updates:
            out[i] = label
    # Smooth 1 px notches and spikes of the fill edges (majority of the 8 neighbours wins);
    # wall pixels never change and never vote, so a fill can not cross a wall.
    for _ in range(ROOM_SMOOTH_PASSES):
        changes: list[tuple[int, int]] = []
        for i, label in enumerate(out):
            if not (label or growable[i]):
                continue
            x, y = i % width, i // width
            if (
                0 < x < width - 1
                and 0 < y < height - 1
                and (out[i - 1] == out[i + 1] == out[i - width] == out[i + width] == label)
            ):
                continue  # interior pixel: nothing to smooth
            votes: dict[int, int] = {}
            for dx, dy in _N8:
                nx, ny = x + dx, y + dy
                nb = out[ny * width + nx] if 0 <= nx < width and 0 <= ny < height else 0
                votes[nb] = votes.get(nb, 0) + 1
            winner, count = max(votes.items(), key=lambda item: (item[1], -item[0]))
            if count >= 6 and winner != label and (winner or not labels[i]):
                changes.append((i, winner))
        for i, label in changes:
            out[i] = label
    # Clip: keep each room's main body (+ big parts), drop small detached islands.
    pieces: dict[int, list[list[int]]] = {}
    seen = [False] * len(out)
    for start, label in enumerate(out):
        if not label or seen[start]:
            continue
        seen[start] = True
        stack, piece = [start], []
        while stack:
            i = stack.pop()
            piece.append(i)
            x, y = i % width, i // width
            for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
                j = ny * width + nx
                if 0 <= nx < width and 0 <= ny < height and not seen[j] and out[j] == label:
                    seen[j] = True
                    stack.append(j)
        pieces.setdefault(label, []).append(piece)
    for parts in pieces.values():
        largest = max(len(part) for part in parts)
        for part in parts:
            if len(part) < largest and len(part) < max(
                MIN_ROOM_ISLAND_PX, ROOM_ISLAND_SHARE * largest
            ):
                for i in part:
                    out[i] = 0
    return out


def floor_labels(image: ImageBlock, fills: list[int]) -> list[int]:
    """Floor slab = room fills + walls hugging them + unsegmented floor enclosed by walls.

    Unsegmented scan area reachable from the map border without crossing a wall is bleed
    (lidar through windows/doors) and is left out, so the slab never pokes past the walls.
    """
    width, height = image.width, image.height
    data = image.data[: width * height]
    wall = [value & 0x07 == 1 for value in data]
    outside = [False] * len(data)
    stack = [
        i
        for i in range(len(data))
        if (i % width in (0, width - 1) or i // width in (0, height - 1)) and not wall[i]
    ]
    for i in stack:
        outside[i] = True
    while stack:
        i = stack.pop()
        x, y = i % width, i // width
        for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
            j = ny * width + nx
            if 0 <= nx < width and 0 <= ny < height and not outside[j] and not wall[j]:
                if not fills[j]:
                    outside[j] = True
                    stack.append(j)
    labels = [0] * len(data)
    for i, value in enumerate(data):
        if fills[i]:
            labels[i] = 1
        elif wall[i]:
            x, y = i % width, i // width
            near = any(
                fills[ny * width + nx]
                for nx in range(max(0, x - 2), min(width, x + 3))
                for ny in range(max(0, y - 2), min(height, y + 3))
            )
            labels[i] = int(near)
        elif not outside[i] and _floor(value):
            labels[i] = 1
    return labels


def _closed(ring: list[tuple[float, float]]) -> list[tuple[float, float]]:
    return [*ring, ring[0]]


def build_geometry(image: ImageBlock) -> dict[str, Any]:
    """Static part of the vector map (rooms, floor, walls); cache it by ``image_digest``.

    Walls, room fills and the floor slab are straightened together (``rectilinear``) with
    one map rotation, so fills end under the wall strokes instead of beside/past them.
    """
    width, height = image.width, image.height
    room_labels = label_grid(image)
    fills = grow_rooms(image, room_labels)
    fill_map = {(i % width, i // width): label for i, label in enumerate(fills) if label}
    counts: dict[int, int] = {}
    for label in room_labels:
        if label:
            counts[label] = counts.get(label, 0) + 1
    if USE_TOPOLOGY:
        return _topology_geometry(image, fills, counts)
    walls = wall_polylines(wall_pixels(image), rooms=fill_map, straighten=False)
    theta = dominant_angle(walls)
    rooms_px = polygons_from_labels(
        fills, width, height, tolerance=ROOM_SIMPLIFY_PX, min_hole=MIN_ROOM_HOLE_PX
    )
    room_ids = sorted(rooms_px)[:MAX_ROOMS]
    floor_rings = polygons_from_labels(
        floor_labels(image, fills), width, height, tolerance=1.2, min_hole=MIN_ROOM_HOLE_PX
    ).get(1, [])
    room_rings = [(room_id, ring) for room_id in room_ids for ring in rooms_px[room_id]]
    shapes = [*walls, *(_closed(r) for _, r in room_rings), *(_closed(r) for r in floor_rings)]
    weights = [WALL_WEIGHT] * len(walls) + [1.0] * (len(room_rings) + len(floor_rings))
    straight = rectilinear(shapes, theta, weights=weights)
    straight_walls = [line for line in straight[: len(walls)] if line]
    snapped_rooms = straight[len(walls) : len(walls) + len(room_rings)]
    snapped_floor = straight[len(walls) + len(room_rings) :]

    def ring_of(snapped: list[tuple[float, float]], raw: list[tuple[float, float]]):
        ring = snapped[:-1] if len(snapped) >= 4 else raw
        return ring if ring_area(ring) * ring_area(raw) > 0 else raw

    polygons: dict[int, list[list[int]]] = {}
    for (room_id, raw), snapped in zip(room_rings, snapped_rooms, strict=True):
        polygons.setdefault(room_id, []).append(_flat(ring_of(snapped, raw), image))
    rooms = [
        {
            "id": room_id,
            "polygons": polygons[room_id],
            # Unstraightened fill outline: matches the raster base layer pixel for pixel
            # (hit areas / selection tint in raster mode).
            "outline": [_flat(ring, image) for ring in rooms_px[room_id]],
            "area_m2": round(counts.get(room_id, 0) * (PIXEL_UNITS / 1000) ** 2, 1),
        }
        for room_id in room_ids
    ]
    xs = [image.left, image.left + width]
    ys = [image.top, image.top + height]
    return {
        "bounds": [
            xs[0] * PIXEL_UNITS,
            ys[0] * PIXEL_UNITS,
            xs[1] * PIXEL_UNITS,
            ys[1] * PIXEL_UNITS,
        ],
        "rooms": rooms,
        "floor": [
            _flat(ring_of(snapped, raw), image)
            for raw, snapped in zip(floor_rings, snapped_floor, strict=True)
        ],
        "walls": [_flat(line, image) for line in straight_walls[:MAX_WALL_LINES]],
        "dividers": [_flat(line, image) for line in room_dividers(fills, width, height)],
    }


def _topology_geometry(
    image: ImageBlock, fills: list[int], counts: dict[int, int]
) -> dict[str, Any]:
    """Rooms, floor outline, walls and dividers from ONE planar partition (shared arcs).

    The selected-room fill, the walls and the dividers are the same arcs, so they always
    line up; ``outline`` equals ``polygons`` (no second, unstraightened fill any more).
    """
    topo = build_topology(fills, image.width, image.height, floor=floor_labels(image, fills))
    room_ids = [room_id for room_id in sorted(topo.rooms) if topo.rooms[room_id]][:MAX_ROOMS]
    rooms = []
    for room_id in room_ids:
        polygons = [_flat(ring, image) for ring in topo.rooms[room_id]]
        rooms.append(
            {
                "id": room_id,
                "polygons": polygons,
                "outline": polygons,
                "area_m2": round(counts.get(room_id, 0) * (PIXEL_UNITS / 1000) ** 2, 1),
            }
        )
    return {
        "bounds": [
            image.left * PIXEL_UNITS,
            image.top * PIXEL_UNITS,
            (image.left + image.width) * PIXEL_UNITS,
            (image.top + image.height) * PIXEL_UNITS,
        ],
        "rooms": rooms,
        "floor": [_flat(ring, image) for ring in topo.floor],
        "walls": [_flat(line, image) for line in topo.walls][:MAX_WALL_LINES],
        "dividers": [_flat(line, image) for line in topo.dividers],
        "topology": TOPOLOGY_VERSION,
    }


def _thin_path(points: list[tuple[int, int]]) -> list[int]:
    tail = [(float(x), float(y)) for x, y in points if x or y]
    simple = _dp(tail, PATH_SIMPLIFY_UNITS) if len(tail) > 2 else tail
    simple = simple[-MAX_PATH_POINTS:]
    return [round(value) for point in simple for value in point]


def dynamic_layer(parsed: RawMap) -> dict[str, Any]:
    """Robot, dock, recent path, no-go zones and virtual walls (cheap, every refresh)."""

    def pose(value: tuple[int, int, int | None] | None) -> dict[str, Any] | None:
        if value is None or not (value[0] or value[1]):
            return None
        return {"x": value[0], "y": value[1], "a": value[2]}

    return {
        "robot": pose(parsed.robot),
        "dock": pose(parsed.charger),
        "path": _thin_path(parsed.path),
        "no_go": parsed.no_go,
        "no_mop": parsed.no_mop,
        "virtual_walls": parsed.virtual_walls,
    }


def build_vector_map(
    blob: bytes, geometry_cache: dict[str, dict[str, Any]] | None = None
) -> dict[str, Any]:
    """Full vector map payload for the panel. Raises ``MapParseError`` on bad input."""
    parsed = parse_raw_map(blob)
    if parsed.image is None or not parsed.image.width or not parsed.image.height:
        raise MapParseError("map has no image block")
    # The geometry version is part of the digest: a new algorithm rebuilds cached drawings.
    digest = f"{image_digest(parsed.image) or ''}t{TOPOLOGY_VERSION}"
    geometry = geometry_cache.get(digest) if geometry_cache is not None else None
    if geometry is None:
        geometry = build_geometry(parsed.image)
        if not geometry["rooms"]:
            raise MapParseError("map has no rooms")
        if geometry_cache is not None:
            geometry_cache.clear()  # one floor plan per map entity is enough
            geometry_cache[digest] = geometry
    return {"digest": digest, **geometry, **dynamic_layer(parsed)}
