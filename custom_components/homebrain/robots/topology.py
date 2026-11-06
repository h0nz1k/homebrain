"""Planar room topology: one shared set of boundary arcs for fills, walls and dividers.

Room polygons traced one room at a time never quite meet: every room simplifies its own
copy of a shared edge, so neighbours end up with slivers or overlaps and the selection fill
does not match the walls. Here the label grid (one segment id per map pixel, 0 = not a
room) becomes a *planar partition* instead (the TopoJSON / mapshaper idea):

1. clean the labels: tiny islands and enclosed pockets join their surroundings, a 3×3
   majority filter removes one-pixel bumps,
2. trace every boundary between two labels exactly once as an *arc* that runs between
   junction nodes (pixel corners where three labels meet),
3. simplify each arc once (corner points → Douglas–Peucker, endpoints fixed) and snap
   near-axis segments onto the map axes (shared nodes move for every arc together),
4. assemble rooms, the floor outline (arcs with "outside" on one side) and the dividers
   (arcs between two rooms) from the same arcs.

Rooms therefore tile without gaps, the selected-room fill is the very polygon that the
walls outline, and the whole drawing is regenerated from the raw labels whenever the map
digest changes. Pure Python, deterministic, unit-tested with synthetic maps only.
"""

from __future__ import annotations

import math
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from itertools import accumulate
from operator import sub
from typing import Final

Point = tuple[float, float]
Vertex = tuple[int, int]

TOPOLOGY_VERSION: Final = 2  # bump when the geometry changes → cached drawings rebuild
MIN_REGION_PX: Final = 40  # detached room pieces below ~0.1 m² join their neighbour
MIN_POCKET_PX: Final = 2000  # enclosed unscanned pockets below ~5 m² (islands, beds) are floor
SMOOTH_PASSES: Final = 2
SMOOTH_MAJORITY: Final = 6  # of 9 in the 3×3 window: spurs/specks go, convex corners stay
SIMPLIFY_PX: Final = 2.0  # ~10 cm: pixel stairs and lidar jitter go, real jogs stay
DIVIDER_PX: Final = 3.5  # room-room seams are segmentation, not walls: straighten harder
CLOSE_PX: Final = 4  # slab closing radius: notches/door gaps below ~40 cm are filled
OPEN_PX: Final = 3  # slab opening radius: tabs/spikes below ~30 cm are cut
CHAMFER_PX: Final = 12.0  # short diagonals between an axis run and its perpendicular → corner
JOG_PX: Final = 5.0  # steps ≤ 25 cm between two parallel axis runs → one straight run
JOG_MAX_PX: Final = 8.0  # steps ≤ 40 cm go too when the shorter side is a stub …
JOG_LINE_PX: Final = 40.0  # … of at most 2 m (a real 40 cm wall offset stays)
DIAG_TOL_DEG: Final = 12.0  # diagonals within this of 45° are real (bay, chamfered hall)
DIAG_MAX_PX: Final = 25.0  # other diagonals up to 1.25 m are staircase residue → corner
DIVIDER_DIAG_PX: Final = 60.0  # room-room seams are segmentation: diagonals up to 3 m → corner
DIVIDER_JOG_PX: Final = 14.0  # … and steps/tabs up to 70 cm on a seam are flattened
SNAP_DEG: Final = 14.0
AXIS_DEG: Final = 1.0  # rotations below this are treated as an axis-aligned map
COLLINEAR_PX: Final = 0.2


@dataclass
class Arc:
    """Boundary chain between two labels; ``left`` is the label on the left of p0→p1."""

    points: list[Point]
    left: int
    right: int
    start: int  # node ids (shared by every arc that ends there)
    end: int


@dataclass
class Topology:
    arcs: list[Arc] = field(default_factory=list)
    rooms: dict[int, list[list[Point]]] = field(default_factory=dict)
    floor: list[list[Point]] = field(default_factory=list)
    walls: list[list[Point]] = field(default_factory=list)
    dividers: list[list[Point]] = field(default_factory=list)
    theta: float = 0.0


# ---------------------------------------------------------------------------- labels


def _neighbours(i: int, width: int, height: int) -> list[int]:
    x, y = i % width, i // width
    out = []
    if x > 0:
        out.append(i - 1)
    if x < width - 1:
        out.append(i + 1)
    if y > 0:
        out.append(i - width)
    if y < height - 1:
        out.append(i + width)
    return out


def components(labels: list[int], width: int, height: int) -> list[tuple[int, list[int], bool]]:
    """4-connected ``(label, pixels, touches_border)`` regions in scan order.

    Row runs + union-find: a few thousand runs instead of a per-pixel flood fill.
    """
    runs: list[tuple[int, int, int, int]] = []  # (y, x0, x1, label)
    parent: list[int] = []

    def find(a: int) -> int:
        while parent[a] != a:
            parent[a] = parent[parent[a]]
            a = parent[a]
        return a

    prev: list[int] = []
    for y in range(height):
        row = labels[y * width : (y + 1) * width]
        cur: list[int] = []
        x0 = 0
        for x in range(1, width + 1):
            if x == width or row[x] != row[x0]:
                cur.append(len(runs))
                parent.append(len(runs))
                runs.append((y, x0, x, row[x0]))
                x0 = x
        i = j = 0
        while i < len(prev) and j < len(cur):
            _, a0, a1, la = runs[prev[i]]
            _, b0, b1, lb = runs[cur[j]]
            if la == lb and a0 < b1 and b0 < a1:
                ra, rb = find(prev[i]), find(cur[j])
                if ra != rb:
                    parent[max(ra, rb)] = min(ra, rb)
            if a1 <= b1:
                i += 1
            else:
                j += 1
        prev = cur
    groups: dict[int, list[int]] = defaultdict(list)
    for rid in range(len(runs)):
        groups[find(rid)].append(rid)
    out: list[tuple[int, list[int], bool]] = []
    for root in sorted(groups):
        pixels: list[int] = []
        border = False
        for rid in groups[root]:
            y, x0, x1, _ = runs[rid]
            pixels.extend(range(y * width + x0, y * width + x1))
            border = border or y in (0, height - 1) or x0 == 0 or x1 == width
        out.append((runs[root][3], pixels, border))
    return out


def absorb_small_regions(
    labels: list[int],
    width: int,
    height: int,
    min_region: int = MIN_REGION_PX,
    min_pocket: int = MIN_POCKET_PX,
) -> list[int]:
    """Specks of a room (not its main body) and small enclosed pockets join their surroundings."""
    out = list(labels)
    regions = components(out, width, height)
    largest: dict[int, int] = {}
    for label, pixels, _ in regions:
        largest[label] = max(largest.get(label, 0), len(pixels))
    for label, pixels, border in regions:
        if label == 0:
            if border or len(pixels) >= min_pocket:
                continue
        elif len(pixels) >= min_region or len(pixels) == largest[label]:
            continue
        around: Counter[int] = Counter()
        for i in pixels:
            for j in _neighbours(i, width, height):
                if out[j] != label:
                    around[out[j]] += 1
        if label == 0:  # a pocket inside the floor becomes room, never stays a hole
            around.pop(0, None)
        if around:
            new = around.most_common(1)[0][0]
            for i in pixels:
                out[i] = new
    return out


def smooth_labels(
    labels: list[int], width: int, height: int, passes: int = SMOOTH_PASSES
) -> list[int]:
    """3×3 majority filter on boundary pixels (outside the grid counts as label 0).

    A pixel whose four neighbours all share its label keeps ≥ 5 of 9 votes, so only
    4-boundary pixels (and labelled pixels on the grid edge) are candidates.
    """
    cur = list(labels)
    for _ in range(passes):
        cand: set[int] = set()
        for y in range(height):
            base = y * width
            row = cur[base : base + width]
            for x, (a, b) in enumerate(zip(row, row[1:], strict=False)):
                if a != b:
                    cand.add(base + x)
                    cand.add(base + x + 1)
            if y + 1 < height:
                below = cur[base + width : base + 2 * width]
                for x, (a, b) in enumerate(zip(row, below, strict=True)):
                    if a != b:
                        cand.add(base + x)
                        cand.add(base + width + x)
        for x in range(width):
            cand.update(i for i in (x, (height - 1) * width + x) if cur[i])
        for y in range(height):
            cand.update(i for i in (y * width, y * width + width - 1) if cur[i])
        nxt = list(cur)
        changed = False
        for i in sorted(cand):
            label = cur[i]
            x, y = i % width, i // width
            votes: Counter[int] = Counter()
            for dy in (-1, 0, 1):
                yy = y + dy
                for dx in (-1, 0, 1):
                    xx = x + dx
                    inside = 0 <= xx < width and 0 <= yy < height
                    votes[cur[yy * width + xx] if inside else 0] += 1
            best, count = votes.most_common(1)[0]
            if best != label and count >= SMOOTH_MAJORITY:
                nxt[i] = best
                changed = True
        cur = nxt
        if not changed:
            break
    return cur


_TO_BITS: Final = bytes.maketrans(b"\x00\x01", b"01")
_FROM_BITS: Final = bytes.maketrans(b"01", b"\x00\x01")


def _sweep(mask: bytearray, width: int, height: int, r: int, grow: bool) -> bytearray:
    """Square dilation (``grow``) or erosion with radius ``r``; rows as bit integers.

    Outside the grid counts as "no change": erosion never eats the grid border
    (erosion = complement of the dilated complement, whose outside is empty).
    """
    if r <= 0 or not width:
        return bytearray(mask)
    full = (1 << width) - 1
    rows = [
        int(bytes(mask[y * width : (y + 1) * width]).translate(_TO_BITS)[::-1], 2)
        for y in range(height)
    ]
    if not grow:
        rows = [~v & full for v in rows]
    horiz = []
    for v in rows:
        acc = v
        for k in range(1, r + 1):
            acc |= (v << k) | (v >> k)
        horiz.append(acc & full)
    out = bytearray(width * height)
    for y in range(height):
        acc = 0
        for v in horiz[max(0, y - r) : y + r + 1]:
            acc |= v
        if not grow:
            acc = ~acc & full
        out[y * width : (y + 1) * width] = (
            format(acc, f"0{width}b")[::-1].encode().translate(_FROM_BITS)
        )
    return out


def partition_floor(
    labels: list[int],
    floor: list[int] | None,
    width: int,
    height: int,
    close_r: int = CLOSE_PX,
    open_r: int = OPEN_PX,
) -> list[int]:
    """Every floor pixel belongs to its nearest room: walls/seams become shared boundaries.

    The slab (rooms + walls + enclosed floor) is closed (notches, door gaps) and opened
    (tabs, spikes) first, so the outline loses features smaller than ~2·r pixels.
    """
    pad = max(close_r, open_r) + 1  # empty margin: closing must not glue the slab to the edge
    pw, ph = width + 2 * pad, height + 2 * pad
    padded = bytearray(pw * ph)
    src = bytes(
        1 if label or f else 0 for label, f in zip(labels, floor or [0] * len(labels), strict=True)
    )
    for y in range(height):
        row = (y + pad) * pw + pad
        padded[row : row + width] = src[y * width : (y + 1) * width]
    padded = _sweep(_sweep(padded, pw, ph, close_r, True), pw, ph, close_r, False)
    padded = _sweep(_sweep(padded, pw, ph, open_r, False), pw, ph, open_r, True)
    slab = bytearray(width * height)
    for y in range(height):
        row = (y + pad) * pw + pad
        slab[y * width : (y + 1) * width] = padded[row : row + width]
    out = [label if slab[i] else 0 for i, label in enumerate(labels)]
    frontier = [i for i, label in enumerate(out) if label]
    while frontier:  # multi-source BFS = discrete Voronoi of the rooms inside the slab
        nxt = []
        for i in frontier:
            label, x = out[i], i % width
            for j in (
                i - 1 if x else -1,
                i + 1 if x < width - 1 else -1,
                i - width,
                i + width if i + width < len(out) else -1,
            ):
                if j >= 0 and slab[j] and not out[j]:
                    out[j] = label
                    nxt.append(j)
        frontier = nxt
    return out


# ------------------------------------------------------------------------------ arcs


def trace_arcs(labels: list[int], width: int, height: int) -> tuple[list[Arc], dict[int, Vertex]]:
    """Every label boundary exactly once, split at junctions (pixel-corner lattice)."""

    def lab(x: int, y: int) -> int:
        return labels[y * width + x] if 0 <= x < width and 0 <= y < height else 0

    adj: dict[Vertex, list[Vertex]] = defaultdict(list)
    left_of: dict[tuple[Vertex, Vertex], int] = {}

    def add(p: Vertex, q: Vertex, left: int, right: int) -> None:
        adj[p].append(q)
        adj[q].append(p)
        left_of[(p, q)] = left
        left_of[(q, p)] = right

    for y in range(height + 1):  # horizontal edges (x,y)→(x+1,y): above is on the left
        for x in range(width):
            above, below = lab(x, y), lab(x, y - 1)
            if above != below:
                add((x, y), (x + 1, y), above, below)
    for x in range(width + 1):  # vertical edges (x,y)→(x,y+1): x-1 is on the left
        for y in range(height):
            west, east = lab(x - 1, y), lab(x, y)
            if west != east:
                add((x, y), (x, y + 1), west, east)

    node_ids: dict[Vertex, int] = {}
    for v in sorted(adj):
        if len(adj[v]) != 2:
            node_ids[v] = len(node_ids)
    visited: set[tuple[Vertex, Vertex]] = set()
    arcs: list[Arc] = []

    def key(p: Vertex, q: Vertex) -> tuple[Vertex, Vertex]:
        return (p, q) if p <= q else (q, p)

    def walk(start: Vertex, first: Vertex) -> None:
        pts = [start, first]
        visited.add(key(start, first))
        prev, cur = start, first
        while cur not in node_ids:
            a, b = adj[cur]
            nxt = b if a == prev else a
            visited.add(key(cur, nxt))
            pts.append(nxt)
            prev, cur = cur, nxt
        arcs.append(
            Arc(
                points=[(float(x), float(y)) for x, y in pts],
                left=left_of[(pts[0], pts[1])],
                right=left_of[(pts[1], pts[0])],
                start=node_ids[pts[0]],
                end=node_ids[pts[-1]],
            )
        )

    for v in sorted(node_ids):
        for q in sorted(adj[v]):
            if key(v, q) not in visited:
                walk(v, q)
    for v in sorted(adj):  # closed loops without a junction: their min corner is the node
        for q in sorted(adj[v]):
            if key(v, q) not in visited:
                node_ids[v] = len(node_ids)
                walk(v, q)
    nodes = {nid: v for v, nid in node_ids.items()}
    return arcs, nodes


# ------------------------------------------------------------------------ simplify


def _dp(points: list[Point], tolerance: float) -> list[Point]:
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
            dist = (
                abs(dy * px - dx * py + bx * ay - by * ax) / norm
                if norm
                else math.hypot(px - ax, py - ay)
            )
            if dist > best_dist:
                best, best_dist = i, dist
        if best >= 0:
            keep[best] = True
            stack.extend(((first, best), (best, last)))
    return [p for p, kept in zip(points, keep, strict=True) if kept]


def _corners(points: list[Point]) -> list[Point]:
    """Pixel staircase → its corner points (endpoints kept)."""
    out = [points[0]]
    for i in range(1, len(points) - 1):
        (ax, ay), (bx, by), (cx, cy) = points[i - 1], points[i], points[i + 1]
        if (bx - ax, by - ay) != (cx - bx, cy - by):
            out.append(points[i])
    out.append(points[-1])
    return out


def simplify_arc(points: list[Point], tolerance: float = SIMPLIFY_PX) -> list[Point]:
    pts = _corners(points)
    if pts[0] == pts[-1] and len(pts) > 4:  # closed loop: split at the farthest corner
        first = pts[0]
        far = max(range(len(pts)), key=lambda i: math.dist(pts[i], first))
        ring = _dp(pts[: far + 1], tolerance)[:-1] + _dp(pts[far:], tolerance)[:-1]
        # The loop's own start is an arbitrary lattice corner, often in the middle of a
        # wall: restart at a real corner (kept by both halves) and simplify once more.
        k = len(_dp(pts[: far + 1], tolerance)) - 1
        ring = ring[k:] + ring[:k]
        ring.append(ring[0])
        far = max(range(len(ring)), key=lambda i: math.dist(ring[i], ring[0]))
        return _dp(ring[: far + 1], tolerance)[:-1] + _dp(ring[far:], tolerance)
    return _dp(pts, tolerance)


def grid_angle(labels: list[int], width: int, height: int, blur: int = 2) -> float:
    """Map rotation in [0, π/2) from gradients of the blurred floor mask (4φ circular mean).

    Chords of pixel staircases (and Sobel on the hard 0/1 mask) are biased towards the
    axes; a box blur first makes the gradient direction follow the true edge.
    """
    span = 2 * blur + 1
    full = span * span
    zeros = [0] * blur
    horiz = []
    for y in range(height):  # box sums (zero outside = clipped window), C-level loops
        acc = list(
            accumulate(
                [*zeros, *(1 if v else 0 for v in labels[y * width : (y + 1) * width]), *zeros],
                initial=0,
            )
        )
        horiz.append(list(map(sub, acc[span:], acc[:-span])))
    pad_rows = [[0] * width] * blur
    cols = []
    for col in zip(*pad_rows, *horiz, *pad_rows, strict=True):
        acc = list(accumulate(col, initial=0))
        cols.append(list(map(sub, acc[span:], acc[:-span])))
    mask = [v for row in zip(*cols, strict=True) for v in row] if cols else []

    def m(x: int, y: int) -> int:
        return mask[y * width + x] if 0 <= x < width and 0 <= y < height else 0

    samples: list[tuple[float, float]] = []
    bins = [0.0] * 90
    for i, value in enumerate(mask):
        if value in (0, full):
            continue  # flat area: no gradient
        x, y = i % width, i // width
        gx = (m(x + 1, y - 1) + 2 * m(x + 1, y) + m(x + 1, y + 1)) - (
            m(x - 1, y - 1) + 2 * m(x - 1, y) + m(x - 1, y + 1)
        )
        gy = (m(x - 1, y + 1) + 2 * m(x, y + 1) + m(x + 1, y + 1)) - (
            m(x - 1, y - 1) + 2 * m(x, y - 1) + m(x + 1, y - 1)
        )
        mag2 = float(gx * gx + gy * gy)
        if mag2:
            deg = math.degrees(math.atan2(gy, gx)) % 90.0
            samples.append((deg, mag2))
            bins[round(deg) % 90] += mag2
    if not samples:
        return 0.0
    # Peak of the direction histogram (diagonal walls must not drag the mean), then the
    # weighted circular mean of the samples within ±6° of it.
    peak = max(range(90), key=lambda d: sum(bins[(d + k) % 90] for k in (-2, -1, 0, 1, 2)))
    num = den = 0.0
    for deg, weight in samples:
        off = (deg - peak + 45.0) % 90.0 - 45.0
        if abs(off) <= 6.0:
            num += off * weight
            den += weight
    return math.radians((peak + num / den) % 90.0) if den else math.radians(peak)


def _rot(p: Point, c: float, s: float) -> Point:
    return (p[0] * c - p[1] * s, p[0] * s + p[1] * c)


def orthogonalize(
    arcs: list[Arc], theta: float, snap_deg: float = SNAP_DEG, *, junctions: bool = True
) -> None:
    """Snap near-axis segments onto the (rotated) map axes; shared nodes move together."""
    c, s = math.cos(-theta), math.sin(-theta)
    node_xy: dict[int, Point] = {}
    inner: list[list[Point]] = []
    for arc in arcs:
        pts = [_rot(p, c, s) for p in arc.points]
        node_xy.setdefault(arc.start, pts[0])
        node_xy.setdefault(arc.end, pts[-1])
        inner.append(pts)
    tol = math.tan(math.radians(snap_deg))

    def ref(ai: int, k: int, n: int) -> tuple[str, int, int]:
        arc = arcs[ai]
        if k == 0:
            return ("n", arc.start, 0)
        if k == n - 1:
            return ("n", arc.end, 0)
        return ("a", ai, k)

    def get(r: tuple[str, int, int]) -> Point:
        return node_xy[r[1]] if r[0] == "n" else inner[r[1]][r[2]]

    # Union-find per axis: the endpoints of every near-vertical segment share one x, of
    # every near-horizontal one y (length-weighted mean). Exact, unlike iterative
    # averaging, whose leftovers (0.1° tilts) defeat the corner and jog rules below.
    groups: list[dict[tuple[str, int, int], tuple[str, int, int]]] = [{}, {}]

    def find(g: dict, r: tuple[str, int, int]) -> tuple[str, int, int]:
        g.setdefault(r, r)
        while g[r] != r:
            g[r] = g[g[r]]
            r = g[r]
        return r

    for ai, pts in enumerate(inner):
        n = len(pts)
        for k in range(n - 1):
            r1, r2 = ref(ai, k, n), ref(ai, k + 1, n)
            (x1, y1), (x2, y2) = get(r1), get(r2)
            dx, dy = abs(x2 - x1), abs(y2 - y1)
            if not (dx or dy):
                continue
            axis = 1 if dy <= dx * tol else 0 if dx <= dy * tol else -1
            if axis >= 0:
                g = groups[axis]
                ra, rb = find(g, r1), find(g, r2)
                if ra != rb:
                    g[rb] = ra
    for axis, g in enumerate(groups):
        acc: dict[tuple[str, int, int], list[float]] = defaultdict(lambda: [0.0, 0.0])
        members: dict[tuple[str, int, int], list[tuple[str, int, int]]] = defaultdict(list)
        for r in list(g):
            root = find(g, r)
            members[root].append(r)
            acc[root][0] += get(r)[axis]
            acc[root][1] += 1.0
        for root, rs in members.items():
            value = acc[root][0] / acc[root][1]
            for r in rs:
                p = _set(get(r), axis, value)
                if r[0] == "n":
                    node_xy[r[1]] = p
                else:
                    inner[r[1]][r[2]] = p
    c2, s2 = math.cos(theta), math.sin(theta)
    for ai, arc in enumerate(arcs):
        pts = inner[ai]
        pts[0], pts[-1] = node_xy[arc.start], node_xy[arc.end]
        inner[ai] = regularize(_drop_collinear(pts))
    if junctions:
        regularize_junctions(arcs, inner)
    for ai, arc in enumerate(arcs):
        arc.points = _drop_collinear([_rot(p, c2, s2) for p in inner[ai]])


Ref = tuple[int, int]  # (-1, node id) or (arc index, point index)


def regularize_junctions(arcs: list[Arc], inner: list[list[Point]], max_steps: int = 400) -> None:
    """Axis-frame clean-up across junction nodes (``inner`` = arc points, edited in place).

    ``regularize`` only sees one arc with fixed ends, so a step or chamfer that sits on a
    node (an outline that jumps 10 cm exactly where a divider meets it) survives. Here the
    whole arc graph is one vertex set; nodes are shared by every arc that ends there:

    * a short axis segment (≤ ``JOG_PX``) between two perpendicular lines is collapsed by
      moving the shorter *line* (all collinear segments through that vertex, across
      nodes) onto the longer one. Perpendicular attachments only change length; a move
      that would flip one, bend a diagonal or fold two lines onto each other is skipped;
    * a short diagonal at a node between a horizontal and a vertical run becomes a corner.
    """

    def ref(ai: int, k: int) -> Ref:
        arc = arcs[ai]
        if k == 0:
            return (-1, arc.start)
        if k == len(inner[ai]) - 1:
            return (-1, arc.end)
        return (ai, k)

    def node_xy() -> dict[int, Point]:
        out: dict[int, Point] = {}
        for ai, arc in enumerate(arcs):
            out[arc.start], out[arc.end] = inner[ai][0], inner[ai][-1]
        return out

    for _ in range(max_steps):
        nodes = node_xy()

        def get(r: Ref, nodes: dict[int, Point] = nodes) -> Point:
            return nodes[r[1]] if r[0] < 0 else inner[r[0]][r[1]]

        adj: dict[Ref, list[Ref]] = defaultdict(list)
        segs: list[tuple[float, Ref, Ref]] = []
        seams: set[frozenset[Ref]] = set()
        for ai, pts in enumerate(inner):
            for k in range(len(pts) - 1):
                r1, r2 = ref(ai, k), ref(ai, k + 1)
                if r1 == r2:
                    continue
                if arcs[ai].left and arcs[ai].right:
                    seams.add(frozenset((r1, r2)))
                adj[r1].append(r2)
                adj[r2].append(r1)
                segs.append((math.dist(pts[k], pts[k + 1]), r1, r2))
        segs.sort()
        moved = False
        for length, b, c in segs:
            if length < 1e-6:
                continue
            pb, pc = get(b), get(c)
            kind = _kind(pb, pc)
            if kind == "d":
                ang = math.degrees(math.atan2(abs(pc[1] - pb[1]), abs(pc[0] - pb[0])))
                seam = frozenset((b, c)) in seams
                odd = (seam and length <= DIVIDER_DIAG_PX) or (
                    abs(ang - 45.0) > DIAG_TOL_DEG and length <= DIAG_MAX_PX
                )
                if (length <= CHAMFER_PX or odd) and _corner(
                    inner, adj, get, b, c, need=1 if odd else 2
                ):
                    moved = True
                    break
                continue
            if length > max(JOG_MAX_PX, DIVIDER_JOG_PX):
                continue
            if _collapse(inner, adj, get, b, c, kind, nodes, length, seams):
                moved = True
                break
        _clean_arcs(inner)
        if not moved:
            return


def _line(
    adj: dict[Ref, list[Ref]], get: object, start: Ref, kind: str, skip: Ref
) -> tuple[set[Ref], float, float, float, set[frozenset[Ref]]]:
    """Vertices on the straight ``kind`` line through ``start`` (+ its length and extent)."""
    axis = 0 if kind == "h" else 1  # coordinate that varies along the line
    seen, stack, length = {start}, [start], 0.0
    edges: set[frozenset[Ref]] = set()
    lo = hi = get(start)[axis]  # type: ignore[operator]
    while stack:
        u = stack.pop()
        pu = get(u)  # type: ignore[operator]
        for w in adj[u]:
            if w == skip and u == start:
                continue
            pw = get(w)  # type: ignore[operator]
            if _kind(pu, pw) != kind:
                continue
            edges.add(frozenset((u, w)))
            if w in seen:
                continue
            seen.add(w)
            stack.append(w)
            length += math.dist(pu, pw)
            lo, hi = min(lo, pw[axis]), max(hi, pw[axis])
    return seen, length, lo, hi, edges


def _collapse(
    inner: list[list[Point]],
    adj: dict[Ref, list[Ref]],
    get: object,
    b: Ref,
    c: Ref,
    kind: str,
    nodes: dict[int, Point],
    step: float,
    seams: set[frozenset[Ref]],
) -> bool:
    perp = "h" if kind == "v" else "v"
    axis = 1 if kind == "v" else 0  # coordinate that the move changes
    lb = _line(adj, get, b, perp, c)
    lc = _line(adj, get, c, perp, b)
    if not lb[1] or not lc[1]:
        return False
    seam = frozenset((b, c)) in seams
    if step > JOG_MAX_PX and not seam:
        return False
    if step > JOG_PX and not seam and min(lb[1], lc[1]) > JOG_LINE_PX:
        return False
    x0 = get(b)[1 - axis]  # type: ignore[operator]
    eps = 1e-6
    b_side = (lb[2] < x0 - eps, lb[3] > x0 + eps)
    c_side = (lc[2] < x0 - eps, lc[3] > x0 + eps)
    if (b_side[0] and c_side[0]) or (b_side[1] and c_side[1]):
        return False  # both lines on the same side: collapsing would fold them together
    for mover, target in ((lb, lc), (lc, lb)) if lb[1] <= lc[1] else ((lc, lb), (lb, lc)):
        value = get(next(iter(target[0])))[axis]  # type: ignore[operator]
        if step > JOG_MAX_PX and not (
            mover[4] <= seams and _closing(adj, get, mover[0], axis, value, kind) >= 2
        ):
            continue  # a big step only flattens a tab on a seam (both arms vanish)
        if _can_move(adj, get, mover[0], axis, value, kind):
            for r in mover[0]:
                p = get(r)  # type: ignore[operator]
                q = _set(p, axis, value)
                if r[0] < 0:
                    nodes[r[1]] = q
                    for pts in inner:
                        if pts[0] == p:
                            pts[0] = q
                        if pts[-1] == p:
                            pts[-1] = q
                else:
                    inner[r[0]][r[1]] = q
            return True
    return False


def _closing(
    adj: dict[Ref, list[Ref]], get: object, line: set[Ref], axis: int, value: float, kind: str
) -> int:
    """How many perpendicular attachments of ``line`` shrink to zero when it moves."""
    count = 0
    for u in line:
        pu = get(u)  # type: ignore[operator]
        for w in adj[u]:
            pw = get(w)  # type: ignore[operator]
            if w not in line and _kind(pu, pw) == kind and abs(pw[axis] - value) < 1e-6:
                count += 1
    return count


def _can_move(
    adj: dict[Ref, list[Ref]], get: object, line: set[Ref], axis: int, value: float, kind: str
) -> bool:
    for u in line:
        pu = get(u)  # type: ignore[operator]
        for w in adj[u]:
            if w in line:
                continue
            pw = get(w)  # type: ignore[operator]
            k = _kind(pu, pw)
            if k == "d":
                return False
            if k == kind:
                before, after = pw[axis] - pu[axis], pw[axis] - value
                if before * after < 0:
                    return False
    return True


def _corner(
    inner: list[list[Point]], adj: dict[Ref, list[Ref]], get: object, b: Ref, c: Ref, need: int
) -> bool:
    """Diagonal b–c → axis corner; ``need`` = how many of the two adjacent runs must continue
    straight into the corner (2 = classic chamfer, 1 = staircase residue, best kept)."""
    pb, pc = get(b), get(c)  # type: ignore[operator]

    def continues(r: Ref, other: Ref, kind: str, corner: Point) -> bool:
        p = get(r)  # type: ignore[operator]
        for w in adj[r]:
            if w == other:
                continue
            q = get(w)  # type: ignore[operator]
            if _kind(p, q) == kind and (
                (q[0] - p[0]) * (corner[0] - p[0]) + (q[1] - p[1]) * (corner[1] - p[1]) < 0
            ):
                return True
        return False

    options = []
    for corner, kb, kc in (((pc[0], pb[1]), "h", "v"), ((pb[0], pc[1]), "v", "h")):
        score = continues(b, c, kb, corner) + continues(c, b, kc, corner)
        options.append((score, corner))
    score, corner = max(options, key=lambda o: o[0])
    if score < need:
        return False
    for pts in inner:
        for k in range(len(pts) - 1):
            if (pts[k], pts[k + 1]) in ((pb, pc), (pc, pb)):
                pts.insert(k + 1, corner)
                return True
    return False


def _clean_arcs(inner: list[list[Point]]) -> None:
    for ai, pts in enumerate(inner):
        out = [pts[0]]
        for p in pts[1:-1]:
            if math.dist(p, out[-1]) > 1e-6 and math.dist(p, pts[-1]) > 1e-6:
                out.append(p)
        out.append(pts[-1])
        out = _drop_collinear(out) if len(out) > 2 else out
        k = 1
        while k < len(out) - 1:  # zero-area spikes (a → b → back over a) left by moves
            a, b, c = out[k - 1], out[k], out[k + 1]
            cross = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
            if abs(cross) < 1e-6 and not _between(a, b, c):
                del out[k]
                k = max(1, k - 1)
            else:
                k += 1
        inner[ai] = out


def _kind(a: Point, b: Point, eps: float = 1e-6) -> str:
    if abs(a[1] - b[1]) < eps:
        return "h"
    if abs(a[0] - b[0]) < eps:
        return "v"
    return "d"


def regularize(points: list[Point]) -> list[Point]:
    """Axis-frame clean-up of one arc (endpoints are shared nodes and never move).

    * a short diagonal between a horizontal and a vertical run becomes a sharp corner,
    * a short step between two parallel runs is flattened onto the run that is anchored
      at a node (or the longer one).
    """
    pts = list(points)
    for _ in range(4):
        changed = False
        i = 1
        while i < len(pts) - 2:
            a, b, c, d = pts[i - 1], pts[i], pts[i + 1], pts[i + 2]
            k1, k2, k3 = _kind(a, b), _kind(b, c), _kind(c, d)
            if k2 == "d" and math.dist(b, c) <= CHAMFER_PX and {k1, k3} == {"h", "v"}:
                corner = (c[0], b[1]) if k1 == "h" else (b[0], c[1])
                pts[i : i + 2] = [corner]
                changed = True
                continue
            if k1 == k3 and k1 in "hv" and k2 != k1 and math.dist(b, c) <= JOG_PX:
                axis = 1 if k1 == "h" else 0
                anchor_left = i - 1 == 0
                anchor_right = i + 2 == len(pts) - 1
                if anchor_left and anchor_right:
                    i += 1
                    continue
                keep_left = anchor_left or (not anchor_right and math.dist(a, b) >= math.dist(c, d))
                if keep_left:  # b, c go; d moves onto a's line
                    pts[i : i + 3] = [_set(d, axis, a[axis])]
                else:  # b, c go; a moves onto d's line
                    pts[i - 1 : i + 2] = [_set(a, axis, d[axis])]
                changed = True
                continue
            i += 1
        pts = _drop_collinear(pts) if len(pts) > 2 else pts
        if not changed:
            break
    return pts


def _set(p: Point, axis: int, value: float) -> Point:
    return (value, p[1]) if axis == 0 else (p[0], value)


def _drop_collinear(points: list[Point], eps: float = COLLINEAR_PX) -> list[Point]:
    out = [points[0]]
    for i in range(1, len(points) - 1):
        a, b, c = out[-1], points[i], points[i + 1]
        if math.dist(a, b) < 1e-6:
            continue
        norm = math.dist(a, c)
        cross = abs((c[0] - a[0]) * (b[1] - a[1]) - (c[1] - a[1]) * (b[0] - a[0]))
        if norm and cross / norm < eps and _between(a, b, c):
            continue
        out.append(b)
    out.append(points[-1])
    return out


def _between(a: Point, b: Point, c: Point) -> bool:
    return (b[0] - a[0]) * (c[0] - b[0]) + (b[1] - a[1]) * (c[1] - b[1]) >= 0


# -------------------------------------------------------------------------- rings


def ring_area(ring: list[Point]) -> float:
    return 0.5 * sum(
        ring[i][0] * ring[(i + 1) % len(ring)][1] - ring[(i + 1) % len(ring)][0] * ring[i][1]
        for i in range(len(ring))
    )


def _chain(arcs: list[Arc], items: list[tuple[int, bool]]) -> list[list[Point]]:
    """Directed arcs (index, reversed) → closed rings (first point not repeated)."""
    by_start: dict[int, list[int]] = defaultdict(list)
    ends: list[tuple[int, int, list[Point]]] = []
    for idx, (ai, rev) in enumerate(items):
        arc = arcs[ai]
        pts = list(reversed(arc.points)) if rev else arc.points
        a, b = (arc.end, arc.start) if rev else (arc.start, arc.end)
        ends.append((a, b, pts))
        by_start[a].append(idx)
    used = [False] * len(items)
    rings: list[list[Point]] = []
    for idx in range(len(items)):
        if used[idx]:
            continue
        used[idx] = True
        first, cur, pts = ends[idx]
        ring = list(pts)
        guard = 0
        while cur != first and guard <= len(items):
            guard += 1
            nxt = next((j for j in by_start[cur] if not used[j]), None)
            if nxt is None:
                break
            used[nxt] = True
            ring.extend(p for p in ends[nxt][2][1:] if p != ring[-1])
            cur = ends[nxt][1]
        while len(ring) > 1 and ring[0] == ring[-1]:
            ring.pop()
        if len(ring) >= 3:
            rings.append(ring)
    return rings


def assemble(arcs: list[Arc]) -> tuple[dict[int, list[list[Point]]], list[list[Point]]]:
    """Room rings per label + floor outline rings (all labels ≠ 0 together)."""
    per_room: dict[int, list[tuple[int, bool]]] = defaultdict(list)
    floor: list[tuple[int, bool]] = []
    for ai, arc in enumerate(arcs):
        if arc.left:
            per_room[arc.left].append((ai, False))
        if arc.right:
            per_room[arc.right].append((ai, True))
        if arc.left and not arc.right:
            floor.append((ai, False))
        elif arc.right and not arc.left:
            floor.append((ai, True))
    rooms = {label: _chain(arcs, items) for label, items in sorted(per_room.items())}
    return rooms, _chain(arcs, floor)


def build_topology(
    labels: list[int],
    width: int,
    height: int,
    *,
    floor: list[int] | None = None,
    simplify: float = SIMPLIFY_PX,
    snap: bool = True,
) -> Topology:
    """Planar partition of a label grid (row 0 = bottom row, lattice = pixel corners).

    ``floor`` (optional, same grid) marks non-room floor such as walls and seams; those
    pixels are shared out to the nearest room so neighbours meet in the middle of a wall.
    """
    clean = partition_floor(labels, floor, width, height)
    clean = absorb_small_regions(clean, width, height)
    clean = smooth_labels(clean, width, height)
    clean = absorb_small_regions(clean, width, height)
    arcs, _ = trace_arcs(clean, width, height)
    raw = [list(a.points) for a in arcs]
    # Measured on the input: the square morphology kernel biases rotated shapes to the axes.
    theta = grid_angle(labels, width, height) if snap else 0.0
    for arc in arcs:
        tol = max(simplify, DIVIDER_PX) if arc.left and arc.right else simplify
        arc.points = simplify_arc(arc.points, tol)
    if snap:
        if min(theta, math.pi / 2 - theta) < math.radians(AXIS_DEG):
            theta = 0.0  # Roborock maps are axis-aligned; sub-degree tilt is estimator noise
    simplified = [list(a.points) for a in arcs]
    raw_rooms, _ = assemble(
        [Arc(p, a.left, a.right, a.start, a.end) for p, a in zip(raw, arcs, strict=True)]
    )

    def broken(rooms: dict[int, list[list[Point]]]) -> bool:
        return any(
            len(rooms.get(label, [])) != len(rings)
            or any(
                ring_area(r) * ring_area(q) <= 0 for r, q in zip(rooms[label], rings, strict=False)
            )
            for label, rings in raw_rooms.items()
        )

    # Guard: a step that flips or collapses a ring falls back one stage (no junction
    # clean-up → no snapping → the raw pixel stairs).
    stages = [True, False] if snap else []
    for junctions in stages:
        for arc, pts in zip(arcs, simplified, strict=True):
            arc.points = list(pts)
        orthogonalize(arcs, theta, junctions=junctions)
        rooms, floor = assemble(arcs)
        if not broken(rooms):
            break
    else:
        rooms, floor = assemble(arcs)
        if broken(rooms):
            for arc, pts in zip(arcs, raw, strict=True):
                arc.points = _corners(pts)
            rooms, floor = assemble(arcs)
    return Topology(
        arcs=arcs,
        rooms=rooms,
        floor=floor,
        walls=[[*ring, ring[0]] for ring in floor],
        dividers=[a.points for a in arcs if a.left and a.right],
        theta=theta,
    )
