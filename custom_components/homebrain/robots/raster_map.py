"""Theme-styled raster base layer of a Roborock map (floor, room seams, walls) as PNG.

The panel draws the floor plan as this bitmap and puts its vector overlays (room hit
areas, labels, path, robot, dock, no-go zones) on top. The bitmap is rendered from the
same parsed IMAGE block as the vector map, so the transform is exact by construction:
PNG column ``c`` / row ``r`` at ``scale`` covers map units
``x = (left + c / scale) * 50`` and ``y = (top + height - r / scale) * 50`` – i.e. the
PNG fills the payload's ``bounds`` with y flipped (map y grows up, image rows go down).

Rendering: every layer is a binary pixel mask that is upsampled (bilinear), slightly
blurred and re-thresholded with a soft ramp, which turns the 5 cm pixel stairs into
smooth anti-aliased contours. Pillow and NumPy ship with Home Assistant; both are only
imported when a PNG is actually rendered.
"""

from __future__ import annotations

import io
from dataclasses import dataclass
from typing import Any, Final

from .contours import close_mask, open_mask, vector_coverage
from .vector_map import (
    PIXEL_UNITS,
    ImageBlock,
    MapParseError,
    _components,
    filter_walls,
    floor_labels,
    grow_rooms,
    label_grid,
    wall_pixels,
)

SCALE: Final = 4  # output pixels per map pixel (5 cm → 1.25 cm)
MAX_OUTPUT_PIXELS: Final = 6_000_000
THEMES: Final = ("light", "dark")
CROP_MARGIN: Final = 6  # map pixels kept around the floor (soft edges, drop shadow)
WALL_WIDTH: Final = 0.8  # map pixels (≈5.5 cm), uniform for the whole outline
SEAM_WIDTH: Final = 0.4  # per room side → ~0.7 px divider between two rooms
MAX_HOLE_PX: Final = 400  # enclosed holes in the slab below ~1 m² are drawn as floor
MIN_RASTER_WALL_PX: Final = 30  # loose wall specks / pillars below this are not drawn
LAYER_BASE: Final = "base"
LAYER_WALLS: Final = "walls"
LAYERS: Final = (LAYER_BASE, LAYER_WALLS)
MIN_HOLE_PX: Final = 1500  # enclosed voids below ~3.7 m² are drawn as plain floor
HOLE_ALPHA: Final = {"light": 0.4, "dark": 0.35}
SHADOW_ALPHA: Final = {"light": 0.16, "dark": 0.5}

# Calm, neutral palettes = the ``--hb-map-*`` tokens of packages/ui/src/tokens.css (a test
# keeps them in sync; no per-room colours: vision and owner read tints as status).
# RGB 0–255; alpha comes from the layer coverage.
PALETTES: Final[dict[str, dict[str, tuple[int, int, int]]]] = {
    "dark": {
        "floor": (44, 50, 61),
        "tone2": (53, 60, 73),
        "tone3": (37, 43, 54),
        "drop": (0, 0, 0),
        "shade": (20, 24, 31),
        "rim": (86, 95, 110),
        "seam": (98, 107, 122),
        "wall": (146, 157, 175),
    },
    "light": {
        "floor": (255, 255, 255),
        "tone2": (237, 241, 248),
        "tone3": (227, 233, 242),
        "drop": (40, 52, 74),
        "shade": (196, 204, 216),
        "rim": (178, 187, 201),
        "seam": (200, 207, 219),
        "wall": (98, 108, 125),
    },
}


@dataclass(frozen=True)
class RasterLayers:
    """Pixel masks (row-major, data orientation: row 0 = lowest map y)."""

    width: int
    height: int
    left: int  # map pixel offset of the crop (map units = (left + x) * 50)
    top: int
    floor: bytes  # 0/1 floor slab (rooms, enclosed floor, small holes filled)
    walls: bytes  # 0/1 real walls
    seams: bytes  # 0/1 border between two rooms
    tones: bytes  # 0 = unsegmented floor, 1..3 = room tone (neighbouring rooms differ)
    # ``integration`` = recoloured image.* PNG of the Roborock integration,
    # ``map_data`` = rendered from the raw map blob (fallback).
    source: str = "map_data"


def _fill_small_holes(mask: bytearray, width: int, height: int, limit: int) -> None:
    """Holes in the slab (furniture shadows, unscanned spots) below ``limit`` px are floor."""
    seen = bytearray(width * height)
    for start in range(width * height):
        if mask[start] or seen[start]:
            continue
        seen[start] = 1
        stack, piece, border = [start], [], False
        while stack:
            i = stack.pop()
            piece.append(i)
            x, y = i % width, i // width
            if x in (0, width - 1) or y in (0, height - 1):
                border = True
            for j in (i - 1 if x else -1, i + 1 if x + 1 < width else -1, i - width, i + width):
                if 0 <= j < width * height and not mask[j] and not seen[j]:
                    seen[j] = 1
                    stack.append(j)
        if not border and len(piece) < limit:
            for i in piece:
                mask[i] = 1


def _room_tones(fills: list[int], width: int) -> dict[int, int]:
    """Greedy 3-colouring of the room adjacency graph (subtle neutral tones, not status)."""
    neighbours: dict[int, set[int]] = {}
    for i, label in enumerate(fills):
        if not label:
            continue
        neighbours.setdefault(label, set())
        for j in (i + 1 if (i + 1) % width else -1, i + width, i + 2 * width, i + 2):
            if 0 <= j < len(fills) and fills[j] and fills[j] != label:
                neighbours[label].add(fills[j])
                neighbours.setdefault(fills[j], set()).add(label)
    tones: dict[int, int] = {}
    for label in sorted(neighbours, key=lambda n: (-len(neighbours[n]), n)):
        used = {tones.get(n) for n in neighbours[label]}
        tones[label] = next((t for t in (1, 2, 3) if t not in used), 1 + label % 3)
    return tones


def raster_layers(image: ImageBlock) -> RasterLayers:
    """Floor slab, real walls, room seams and tones of one map (pure Python, per digest)."""
    width, height = image.width, image.height
    if not width or not height:
        raise MapParseError("map has no image block")
    fills = grow_rooms(image, label_grid(image))
    fill_map = {(i % width, i // width): label for i, label in enumerate(fills) if label}
    if not fill_map:
        raise MapParseError("map has no rooms")
    walls = filter_walls(wall_pixels(image), rooms=fill_map)
    walls = set().union(*(c for c in _components(walls) if len(c) >= MIN_RASTER_WALL_PX))
    slab = floor_labels(image, fills)
    wall_mask = bytearray(width * height)
    for x, y in walls:
        wall_mask[y * width + x] = 1
    seams = bytearray(width * height)
    for i, label in enumerate(fills):
        if not label:
            continue
        x = i % width
        right = fills[i + 1] if x + 1 < width else 0
        up = fills[i + width] if i + width < len(fills) else 0
        if right and right != label:
            seams[i] = seams[i + 1] = 1
        if up and up != label:
            seams[i] = seams[i + width] = 1
    # Walls only count where they hug the slab (floor_labels): far scan lines through windows
    # would otherwise widen the bitmap past the drawn floor plan.
    floor = bytearray(1 if slab[i] or fills[i] else 0 for i in range(len(fills)))
    for i, value in enumerate(wall_mask):
        if value and not floor[i]:
            wall_mask[i] = 0
    _fill_small_holes(floor, width, height, MAX_HOLE_PX)
    tone_of = _room_tones(fills, width)
    tones = bytearray(tone_of.get(label, 0) if label else 0 for label in fills)
    # Crop to the drawn floor (+margin): real maps carry a lot of empty scan space.
    used = [i for i in range(width * height) if floor[i]]
    xs = [i % width for i in used]
    # The margin may reach past the image (walls on its border): pad with empty pixels.
    x0, x1 = min(xs) - CROP_MARGIN, max(xs) + 1 + CROP_MARGIN
    y0, y1 = used[0] // width - CROP_MARGIN, used[-1] // width + 1 + CROP_MARGIN

    def crop(raw: bytearray) -> bytes:
        out = bytearray()
        for y in range(y0, y1):
            row = bytearray(x1 - x0)
            if 0 <= y < height:
                a, b = max(0, x0), min(width, x1)
                row[a - x0 : b - x0] = raw[y * width + a : y * width + b]
            out += row
        return bytes(out)

    return RasterLayers(
        x1 - x0,
        y1 - y0,
        image.left + x0,
        image.top + y0,
        crop(floor),
        crop(wall_mask),
        crop(seams),
        crop(tones),
    )


def render_png(
    layers: RasterLayers, theme: str, scale: int = SCALE, layer: str = LAYER_BASE
) -> bytes:
    """Anti-aliased RGBA PNG of the floor plan in the given theme (``light``/``dark``).

    ``layer`` ``base`` = floor slab, room tones, seams, rim and shadow; ``walls`` = the
    walls alone on transparency. The panel stacks base → selection/trail → walls → robot,
    so a selection tint or the trail never paints over a wall.
    """
    import numpy as np  # noqa: PLC0415 - HA ships NumPy; keep module import cheap
    from PIL import Image, ImageDraw, ImageFilter  # noqa: PLC0415 - HA ships Pillow

    if theme not in PALETTES or layer not in LAYERS:
        raise ValueError(theme)
    width, height = layers.width, layers.height
    while scale > 1 and width * height * scale * scale > MAX_OUTPUT_PIXELS:
        scale -= 1
    out_w, out_h = width * scale, height * scale

    def mask(raw: bytes) -> Any:
        return np.flipud(np.frombuffer(raw, dtype=np.uint8).reshape(height, width))

    def blurred(raw: Any, sigma_px: float) -> Any:
        """Gaussian-blurred coverage at output resolution (sigma in map pixels)."""
        img = Image.fromarray((np.clip(raw, 0, 1) * 255).astype(np.uint8), "L")
        if img.size != (out_w, out_h):
            img = img.resize((out_w, out_h), Image.Resampling.BILINEAR)
        if sigma_px > 0:
            img = img.filter(ImageFilter.GaussianBlur(sigma_px * scale))
        return np.asarray(img, dtype=np.float32) / 255.0

    def vector(raw: Any, **kw: Any) -> Any:
        """Pixel mask → straight, snapped, anti-aliased shape (see contours.py)."""
        return vector_coverage(np, Image, ImageDraw, raw > 0, scale, **kw)

    floor_raw = mask(layers.floor) > 0
    # The scan's own wall pixels are noisy (furniture edges, spurs, dotted runs), so the
    # plan is drawn from the floor slab and the room layer instead: one cleaned slab
    # (gaps bridged, spurs < ~20 cm removed), a uniform wall band along its outline and
    # thin seams between rooms – all vectorised (straight, snapped, anti-aliased).
    closed = close_mask(np, floor_raw, 3)
    slab = open_mask(np, closed, 3)
    if slab.sum() < 0.9 * closed.sum():  # tiny plans (tests, closets): keep thin parts
        slab = closed
    # Enclosed holes (islands, furniture the robot never mapped) stay floor with a quiet
    # obstacle tint; only the true outline gets the wall band.
    holes = _enclosed(np, ~slab)
    holes = holes & ~_small_parts(np, holes, MIN_HOLE_PX)  # furniture specks → floor
    floor_a = vector(slab | holes, tol=2.0, min_area=40)
    hole_a = vector(open_mask(np, holes), tol=1.6, min_area=12) * floor_a
    wall_a = np.clip(floor_a - _inset(np, Image, floor_a, scale, WALL_WIDTH), 0, 1)
    # Rooms (tones 1..3, neighbours differ) partition the whole slab; each region is a
    # clean polygon and the dividers are where two of them meet (one straight line).
    parts = _partition(np, mask(layers.tones), slab)
    rooms = {tone: vector(parts == tone, tol=1.8, min_area=30) for tone in (1, 2, 3)}
    seam_a = np.zeros_like(floor_a)
    for tone, cov in rooms.items():
        other = np.maximum.reduce([c for t, c in rooms.items() if t != tone])
        near = _grow(np, Image, other, scale, 0.6)
        seam_a = np.maximum(seam_a, (cov - _inset(np, Image, cov, scale, SEAM_WIDTH)) * near)
    seam_a = np.clip(seam_a, 0, 1) * floor_a * (1 - wall_a) * 0.9
    rim_a = np.zeros_like(floor_a)
    shade_a = np.clip(blurred(wall_a, 1.0) * 0.9, 0, 1) * (1 - wall_a) * 0.25

    pal = {k: np.array(v, dtype=np.float32) / 255.0 for k, v in PALETTES[theme].items()}
    if layer == LAYER_WALLS:
        walls = np.dstack([np.broadcast_to(pal["wall"], (out_h, out_w, 3)), wall_a])
        return _png(Image, np, walls)
    rgb = np.empty((out_h, out_w, 3), dtype=np.float32)
    rgb[:] = pal["floor"]

    def over(color: Any, alpha: Any) -> None:
        rgb[:] = rgb * (1 - alpha[..., None]) + color * alpha[..., None]

    for tone in (2, 3):
        over(pal[f"tone{tone}"], rooms[tone] * floor_a)
    over(pal["shade"], shade_a)
    over(pal["shade"], hole_a * HOLE_ALPHA[theme])
    over(pal["seam"], seam_a)
    over(pal["rim"], rim_a)
    # Soft drop shadow under the slab (lifts it off the card in both themes).
    shift = max(1, round(scale * 1.2))
    shadow = np.zeros_like(floor_a)
    shadow[shift:] = blurred(floor_a, 2.6)[:-shift]
    shadow_a = shadow * SHADOW_ALPHA[theme]
    alpha = floor_a + shadow_a * (1 - floor_a)
    safe = np.where(alpha > 0, alpha, 1)
    rgb = (rgb * floor_a[..., None] + pal["drop"] * (shadow_a * (1 - floor_a))[..., None]) / safe[
        ..., None
    ]
    return _png(Image, np, np.dstack([rgb, alpha]))


def _edge(np: Any, mask: Any) -> Any:
    """Pixels of ``mask`` that touch a non-mask pixel (4-neighbourhood)."""
    inner = mask.copy()
    inner[1:, :] &= mask[:-1, :]
    inner[:-1, :] &= mask[1:, :]
    inner[:, 1:] &= mask[:, :-1]
    inner[:, :-1] &= mask[:, 1:]
    return mask & ~inner


def _inset(np: Any, image_cls: Any, coverage: Any, scale: int, width: float = 0.9) -> Any:
    """Coverage shrunk by ``width`` map pixels (min filter), for outlines along the edge."""
    from PIL import ImageFilter  # noqa: PLC0415

    size = max(3, round(width * scale * 2) | 1)
    img = image_cls.fromarray((coverage * 255).astype(np.uint8), "L")
    return np.asarray(img.filter(ImageFilter.MinFilter(size)), dtype=np.float32) / 255.0


def _grow(np: Any, image_cls: Any, coverage: Any, scale: int, width: float) -> Any:
    """Coverage grown by ``width`` map pixels (max filter)."""
    from PIL import ImageFilter  # noqa: PLC0415

    size = max(3, round(width * scale * 2) | 1)
    img = image_cls.fromarray((np.clip(coverage, 0, 1) * 255).astype(np.uint8), "L")
    return np.asarray(img.filter(ImageFilter.MaxFilter(size)), dtype=np.float32) / 255.0


def _small_parts(np: Any, mask: Any, limit: int) -> Any:
    """4-connected components of ``mask`` with fewer than ``limit`` pixels."""
    ys, xs = np.nonzero(mask)
    pixels = set(zip(xs.tolist(), ys.tolist(), strict=True))
    small = np.zeros_like(mask)
    for component in _components(pixels):
        if len(component) < limit:
            for x, y in component:
                small[y, x] = True
    return small


def _enclosed(np: Any, outside: Any) -> Any:
    """Parts of ``outside`` that do not touch the image border (holes in the slab)."""
    reach = np.zeros_like(outside)
    reach[0, :], reach[-1, :], reach[:, 0], reach[:, -1] = (
        outside[0, :],
        outside[-1, :],
        outside[:, 0],
        outside[:, -1],
    )
    while True:
        grown = reach.copy()
        grown[1:, :] |= reach[:-1, :]
        grown[:-1, :] |= reach[1:, :]
        grown[:, 1:] |= reach[:, :-1]
        grown[:, :-1] |= reach[:, 1:]
        grown &= outside
        if (grown == reach).all():
            return outside & ~reach
        reach = grown


def _partition(np: Any, tones: Any, slab: Any, steps: int = 60) -> Any:
    """Room tone per slab pixel: grow the tones into unassigned floor, then smooth."""
    lab = np.where(slab, tones, 0).astype(np.int16)
    if not lab.any():
        return lab
    for _ in range(steps):
        todo = slab & (lab == 0)
        if not todo.any():
            break
        best = np.zeros_like(lab)
        for axis, step in ((0, 1), (0, -1), (1, 1), (1, -1)):
            near = np.roll(lab, step, axis=axis)
            best = np.where(best == 0, near, best)
        lab = np.where(todo, best, lab)
    for _ in range(2):  # 3×3 majority: removes ragged single-pixel teeth along dividers
        votes = [np.zeros(lab.shape, dtype=np.int16) for _ in range(4)]
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                near = np.roll(np.roll(lab, dy, axis=0), dx, axis=1)
                for tone in (1, 2, 3):
                    votes[tone] += near == tone
        win = np.argmax(np.stack(votes[1:]), axis=0) + 1
        strong = np.max(np.stack(votes[1:]), axis=0) >= 5
        lab = np.where(slab & strong, win, lab)
    return lab


def _png(image_cls: Any, np: Any, rgba: Any) -> bytes:
    pixels = (np.clip(rgba, 0, 1) * 255 + 0.5).astype(np.uint8)
    buffer = io.BytesIO()
    image_cls.fromarray(pixels, "RGBA").save(buffer, format="PNG", optimize=True)
    return buffer.getvalue()


def raster_bounds(layers: RasterLayers) -> list[int]:
    """Placement of the PNG in map units ``[x0, y0, x1, y1]`` (y grows up; PNG row 0 = y1)."""
    return [
        layers.left * PIXEL_UNITS,
        layers.top * PIXEL_UNITS,
        (layers.left + layers.width) * PIXEL_UNITS,
        (layers.top + layers.height) * PIXEL_UNITS,
    ]
