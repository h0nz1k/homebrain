"""Vectorise binary map masks into smooth, straight-edged anti-aliased coverage.

The Roborock grid is 5 cm per pixel, so walls and floor edges arrive as pixel stairs and
1 px wobble. Blurring them only rounds the stairs off ("melted" walls). Instead every
mask is traced along the pixel edges into closed loops, simplified (Douglas–Peucker),
snapped to the dominant 0°/90° axes and filled again at a supersampled resolution. The
result is a mask with straight walls and clean diagonals, downsampled to anti-aliased
coverage. Pure NumPy + Pillow (both ship with Home Assistant).
"""

from __future__ import annotations

import math
from typing import Any, Final

Point = tuple[float, float]

SNAP_DEG: Final = 12.0  # segments this close to 0°/90° become exactly axis-aligned
SUPERSAMPLE: Final = 3


def close_mask(np: Any, mask: Any, steps: int = 1) -> Any:
    """Binary closing with a 3×3 cross (bridges 1 px gaps in dotted walls)."""
    out = mask.astype(bool)
    for _ in range(steps):
        out = _dilate(np, out)
    for _ in range(steps):
        out = _erode(np, out)
    return out | mask.astype(bool)


def open_mask(np: Any, mask: Any, steps: int = 1) -> Any:
    """Binary opening with a 3×3 cross (drops spurs and specks up to ``2·steps`` px)."""
    out = mask.astype(bool)
    for _ in range(steps):
        out = _erode(np, out)
    for _ in range(steps):
        out = _dilate(np, out)
    return out


def _shift(np: Any, mask: Any, dy: int, dx: int, fill: bool) -> Any:
    out = np.full(mask.shape, fill, dtype=bool)
    h, w = mask.shape
    out[max(dy, 0) : h + min(dy, 0), max(dx, 0) : w + min(dx, 0)] = mask[
        max(-dy, 0) : h + min(-dy, 0), max(-dx, 0) : w + min(-dx, 0)
    ]
    return out


def _dilate(np: Any, mask: Any) -> Any:
    out = mask.copy()
    for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        out |= _shift(np, mask, dy, dx, False)
    return out


def _erode(np: Any, mask: Any) -> Any:
    out = mask.copy()
    for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        out &= _shift(np, mask, dy, dx, True)
    return out


def trace(np: Any, mask: Any) -> list[list[Point]]:
    """Closed loops along pixel edges (corner coordinates), inside on the left.

    Outer boundaries come out counter-clockwise in image coordinates (positive signed
    area with y down), holes clockwise. Diagonal-only contacts are split (4-connected).
    """
    m = np.pad(mask.astype(bool), 1)
    nxt: dict[tuple[int, int], list[tuple[int, int]]] = {}

    def add(edges: Any, d: tuple[int, int, int, int]) -> None:
        ys, xs = np.nonzero(edges)
        for y, x in zip((ys - 1).tolist(), (xs - 1).tolist(), strict=True):
            a = (x + d[0], y + d[1])
            nxt.setdefault(a, []).append((x + d[2], y + d[3]))

    inside = m[1:-1, 1:-1]
    # Edge directions keep the inside on the left when walking (image coords, y down).
    add(np.pad(inside & ~m[:-2, 1:-1], 1), (1, 0, 0, 0))  # top edge: right → left
    add(np.pad(inside & ~m[2:, 1:-1], 1), (0, 1, 1, 1))  # bottom edge: left → right
    add(np.pad(inside & ~m[1:-1, :-2], 1), (0, 0, 0, 1))  # left edge: down
    add(np.pad(inside & ~m[1:-1, 2:], 1), (1, 1, 1, 0))  # right edge: up
    loops: list[list[Point]] = []
    while nxt:
        start = next(iter(nxt))
        loop = [start]
        prev = start
        cur = _pop(nxt, start, None)
        while cur != start:
            loop.append(cur)
            nprev = cur
            cur = _pop(nxt, cur, (cur[0] - prev[0], cur[1] - prev[1]))
            prev = nprev
        loops.append([(float(x), float(y)) for x, y in loop])
    return loops


def _pop(
    nxt: dict[tuple[int, int], list[tuple[int, int]]],
    at: tuple[int, int],
    heading: tuple[int, int] | None,
) -> tuple[int, int]:
    options = nxt[at]
    pick = 0
    if heading is not None and len(options) > 1:
        # Pinch vertex: turn towards the inside (left) so 4-connected parts stay apart.
        hx, hy = heading
        for i, (x, y) in enumerate(options):
            dx, dy = x - at[0], y - at[1]
            if hx * dy - hy * dx < 0:  # left turn in y-down coordinates
                pick = i
    target = options.pop(pick)
    if not options:
        del nxt[at]
    return target


def area(loop: list[Point]) -> float:
    """Signed area (positive = counter-clockwise on screen = outer boundary)."""
    s = 0.0
    for (x0, y0), (x1, y1) in zip(loop, loop[1:] + loop[:1], strict=True):
        s += x0 * y1 - x1 * y0
    return -s / 2.0


def _dp(points: list[Point], tol: float) -> list[Point]:
    if len(points) < 3:
        return points
    keep = [False] * len(points)
    keep[0] = keep[-1] = True
    stack = [(0, len(points) - 1)]
    while stack:
        a, b = stack.pop()
        (x0, y0), (x1, y1) = points[a], points[b]
        dx, dy = x1 - x0, y1 - y0
        norm = math.hypot(dx, dy) or 1.0
        best, idx = -1.0, -1
        for i in range(a + 1, b):
            px, py = points[i]
            d = abs(dy * (px - x0) - dx * (py - y0)) / norm
            if d > best:
                best, idx = d, i
        if idx > 0 and best > tol:
            keep[idx] = True
            stack += [(a, idx), (idx, b)]
    return [p for p, k in zip(points, keep, strict=True) if k]


def simplify(loop: list[Point], tol: float) -> list[Point]:
    """Douglas–Peucker on a closed loop, split at its two most distant corners."""
    if len(loop) < 5:
        return loop
    corners = [
        q
        for p, q, r in zip(loop[-1:] + loop[:-1], loop, loop[1:] + loop[:1], strict=True)
        if (q[0] - p[0]) * (r[1] - q[1]) != (q[1] - p[1]) * (r[0] - q[0])
    ]
    pts = corners if len(corners) >= 4 else loop
    start = min(range(len(pts)), key=lambda i: (pts[i][0] + pts[i][1], pts[i][0]))
    pts = pts[start:] + pts[:start]  # anchor DP on a convex corner (always kept)
    first = pts[0]
    far = max(
        range(len(pts)), key=lambda i: (pts[i][0] - first[0]) ** 2 + (pts[i][1] - first[1]) ** 2
    )
    a = _dp(pts[: far + 1], tol)
    b = _dp([*pts[far:], first], tol)
    return a[:-1] + b[:-1]


def snap(loop: list[Point], deg: float = SNAP_DEG) -> list[Point]:
    """Make near-horizontal/vertical segments exactly axis-aligned."""
    pts = [list(p) for p in loop]
    n = len(pts)
    if n < 3:
        return loop
    lim = math.tan(math.radians(deg))
    for i in range(n):
        p, q = pts[i], pts[(i + 1) % n]
        dx, dy = q[0] - p[0], q[1] - p[1]
        if abs(dy) <= lim * abs(dx):
            p[1] = q[1] = (p[1] + q[1]) / 2
        elif abs(dx) <= lim * abs(dy):
            p[0] = q[0] = (p[0] + q[0]) / 2
    return [(p[0], p[1]) for p in pts]


def vector_coverage(
    np: Any,
    image_cls: Any,
    draw_cls: Any,
    mask: Any,
    scale: int,
    tol: float = 0.9,
    stroke: float = 0.0,
    min_area: float = 0.0,
) -> Any:
    """Mask (rows × cols, image orientation) → float32 coverage at ``scale`` px per cell.

    Loops are simplified with ``tol`` (map pixels), snapped, filled largest-first (holes
    cut out), optionally outlined with a ``stroke`` (map pixels, centred on the outline),
    and supersampled for anti-aliasing. Loops smaller than ``min_area`` are dropped.
    """
    height, width = mask.shape
    ss = scale * SUPERSAMPLE
    canvas = image_cls.new("L", (width * ss, height * ss), 0)
    draw = draw_cls.Draw(canvas)
    shapes = []
    for loop in trace(np, mask):
        a = area(loop)
        if abs(a) < min_area:
            continue
        shapes.append((abs(a), a > 0, snap(simplify(loop, tol))))
    shapes.sort(key=lambda s: -s[0])
    for _, outer, pts in shapes:
        if len(pts) < 3:
            continue
        xy = [(x * ss, y * ss) for x, y in pts]
        draw.polygon(xy, fill=255 if outer else 0)
    if stroke > 0:
        width_px = max(1, round(stroke * ss))
        for _, _, pts in shapes:
            if len(pts) >= 3:
                xy = [(x * ss, y * ss) for x, y in pts]
                draw.line([*xy, xy[0], xy[1]], fill=255, width=width_px, joint="curve")
    small = canvas.resize((width * scale, height * scale), image_cls.Resampling.BOX)
    return np.asarray(small, dtype=np.float32) / 255.0
