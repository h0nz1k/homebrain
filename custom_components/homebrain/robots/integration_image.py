"""Base layer from the map PNG that the official Roborock integration renders (``image.*``).

The integration draws its map with vacuum-map-parser-roborock: every map pixel becomes a
``k × k`` block (``MAP_SCALE = 4`` in HA), rooms get flat palette colours, walls are slate
grey and the path, robot and charger are painted on top. HomeBrain reads that finished
image through the public ``ImageEntity.async_image()`` and only *recolours* it:

1. sample the centre of every block → one label per map pixel (outside / wall / room
   colour / carpet / unknown overlay pixel),
2. paint the overlay pixels (path, robot, charger, carpet dither) back with the
   neighbouring room, because the panel draws those live as vector layers,
3. hand the masks to :func:`raster_map.render_png`, which smooths them and paints them
   in the HomeBrain light/dark palette.

Coordinates: the image block of the raw map (``left``/``top``/``width``/``height`` in map
pixels, y up) is exactly the PNG with rows flipped. When the integration exposes its
calibration (``MapData.calibration()``: map units → image pixels) we derive the offset
from it and refuse the image if it disagrees with the raw map header by more than one map
pixel – then the panel keeps the raster rendered from the raw map data.
"""

from __future__ import annotations

import io
from collections.abc import Sequence
from typing import Any, Final

from .raster_map import (
    CROP_MARGIN,
    MAX_HOLE_PX,
    MIN_RASTER_WALL_PX,
    RasterLayers,
    _fill_small_holes,
    _room_tones,
)
from .vector_map import PIXEL_UNITS, MapParseError, _components

# vacuum-map-parser-base default palette (HA does not let users change it).
WALL_COLOURS: Final = frozenset({(93, 109, 126), (100, 196, 254)})
SCAN_COLOURS: Final = frozenset({(223, 223, 223), (32, 115, 185), (19, 87, 148)})
CARPET_COLOURS: Final = frozenset({(169, 247, 169)})
# Painted on top of the floor plan: path, goto/predicted path, robot, charger, text.
OVERLAY_COLOURS: Final = frozenset(
    {
        (147, 194, 238),
        (0, 255, 0),
        (255, 255, 0),
        (255, 255, 255),
        (127, 127, 127),
        (0, 0, 0),
        (102, 254, 218),
        (51, 127, 109),
    }
)
MIN_ROOM_COLOUR_PX: Final = 6  # rarer opaque colours are blends/specks → repainted
MAX_STRAY_SHARE: Final = 0.08  # more unrecognised opaque pixels → not the default palette
WALL_REACH_PX: Final = 3  # walls further than this from any room are scan lines (windows)
MAX_INPAINT_STEPS: Final = 40
MAX_SCALE: Final = 8

L_UNKNOWN: Final = -1
L_CARPET: Final = -2  # floor, room unknown
L_OUTSIDE: Final = 0
L_WALL: Final = 1
L_SCAN: Final = 2  # unsegmented floor
L_ROOM0: Final = 3  # first room colour


class ImageMismatchError(MapParseError):
    """The integration image does not match the raw map (size, calibration or palette)."""


def block_scale(png_size: tuple[int, int], width: int, height: int) -> int:
    """Pixels per map pixel of the integration PNG (``k`` for a ``k·w × k·h`` image)."""
    w, h = png_size
    if width <= 0 or height <= 0 or w % width or h % height:
        raise ImageMismatchError(f"image {w}x{h} is not a multiple of the map {width}x{height}")
    scale = w // width
    if scale != h // height or not 1 <= scale <= MAX_SCALE:
        raise ImageMismatchError(f"unsupported image scale {w}x{h} for {width}x{height}")
    return scale


def calibration_origin(
    calibration: Sequence[dict[str, dict[str, float]]] | None, scale: int, height: int
) -> tuple[float, float] | None:
    """Map-pixel ``(left, top)`` of the image implied by the integration's calibration.

    vacuum-map-parser maps a point ``(x, y)`` in map units to image pixels as
    ``((x/50 - left)·k, (height - 1 - (y/50 - top))·k)``; the three calibration points
    let us solve for ``left``/``top`` without importing the parser.
    """
    if not calibration:
        return None
    lefts, tops = [], []
    for point in calibration:
        try:
            vx, vy = float(point["vacuum"]["x"]), float(point["vacuum"]["y"])
            mx, my = float(point["map"]["x"]), float(point["map"]["y"])
        except (KeyError, TypeError, ValueError):
            return None
        lefts.append(vx / PIXEL_UNITS - mx / scale)
        tops.append(vy / PIXEL_UNITS - (height - 1 - my / scale))
    return sum(lefts) / len(lefts), sum(tops) / len(tops)


def _labels(png: bytes, width: int, height: int) -> tuple[Any, int, float]:
    """Map-pixel labels in IMAGE orientation (row 0 = top), block scale, stray share.

    ``stray`` = share of opaque pixels whose colour is neither ours nor a room colour
    (blends, a foreign palette); a high value means the image is not what we expect.
    """
    import numpy as np  # noqa: PLC0415 - HA ships NumPy; keep module import cheap
    from PIL import Image  # noqa: PLC0415 - HA ships Pillow

    with Image.open(io.BytesIO(png)) as img:
        scale = block_scale(img.size, width, height)
        rgba = np.asarray(img.convert("RGBA"))
    half = scale // 2
    px = rgba[half::scale, half::scale][:height, :width]
    rgb = px[..., :3].astype(np.int32)
    key = (rgb[..., 0] << 16) | (rgb[..., 1] << 8) | rgb[..., 2]
    opaque = px[..., 3] >= 250

    def keys(colours: frozenset[tuple[int, int, int]]) -> list[int]:
        return [(r << 16) | (g << 8) | b for r, g, b in colours]

    labels = np.full((height, width), L_UNKNOWN, dtype=np.int16)
    labels[px[..., 3] < 8] = L_OUTSIDE
    labels[opaque & np.isin(key, keys(WALL_COLOURS))] = L_WALL
    labels[opaque & np.isin(key, keys(SCAN_COLOURS))] = L_SCAN
    labels[opaque & np.isin(key, keys(CARPET_COLOURS))] = L_CARPET
    special = keys(WALL_COLOURS | SCAN_COLOURS | CARPET_COLOURS | OVERLAY_COLOURS)
    candidates = opaque & ~np.isin(key, special)
    values, counts = np.unique(key[candidates], return_counts=True)
    room_keys = [int(v) for v, c in zip(values, counts, strict=True) if c >= MIN_ROOM_COLOUR_PX]
    for index, value in enumerate(sorted(room_keys)):
        labels[candidates & (key == value)] = L_ROOM0 + index
    stray = candidates & (labels == L_UNKNOWN)
    return labels, scale, float(stray.sum()) / max(1, int(opaque.sum()))


def _inpaint(labels: Any) -> Any:
    """Repaint overlay pixels with a neighbouring floor label (rooms first, then walls).

    The outside never grows into overlay pixels: the robot/charger icons often sit on
    the floor edge and would otherwise leave a bite in the outline.
    """
    import numpy as np  # noqa: PLC0415

    lab = labels.copy()
    for _ in range(MAX_INPAINT_STEPS):
        todo = (lab == L_UNKNOWN) | (lab == L_CARPET)
        if not todo.any():
            break
        best = np.full(lab.shape, L_UNKNOWN, dtype=np.int16)
        for axis, step in ((0, 1), (0, -1), (1, 1), (1, -1)):
            near = np.roll(lab, step, axis=axis)
            # np.roll wraps around; the outermost row/column must not see the other side.
            edge = [slice(None)] * 2
            edge[axis] = slice(0, 1) if step == 1 else slice(-1, None)
            near[tuple(edge)] = L_UNKNOWN
            room = near >= L_SCAN
            best = np.where((best < L_SCAN) & room, near, best)
            fallback = (best == L_UNKNOWN) & (near == L_WALL) & (lab == L_UNKNOWN)
            best = np.where(fallback, near, best)
        lab = np.where(todo & (best != L_UNKNOWN), best, lab)
    lab[lab == L_CARPET] = L_SCAN
    lab[lab == L_UNKNOWN] = L_OUTSIDE
    return lab


def _drop_specks(walls: Any) -> Any:
    """Remove 8-connected wall components smaller than ``MIN_RASTER_WALL_PX``."""
    import numpy as np  # noqa: PLC0415

    height, width = walls.shape
    ys, xs = np.nonzero(walls)
    pixels = set(zip(xs.tolist(), ys.tolist(), strict=True))
    keep = np.zeros_like(walls)
    for component in _components(pixels):
        if len(component) >= MIN_RASTER_WALL_PX:
            for x, y in component:
                keep[y, x] = True
    return keep


def integration_layers(
    png: bytes,
    width: int,
    height: int,
    left: int,
    top: int,
    calibration: Sequence[dict[str, dict[str, float]]] | None = None,
) -> RasterLayers:
    """Floor/wall/seam/tone masks recovered from the integration PNG (data orientation)."""
    import numpy as np  # noqa: PLC0415

    labels, scale, stray = _labels(png, width, height)
    origin = calibration_origin(calibration, scale, height)
    if origin and (abs(origin[0] - left) > 1 or abs(origin[1] - top) > 1):
        raise ImageMismatchError(f"calibration origin {origin} != map header {(left, top)}")
    if stray > MAX_STRAY_SHARE or not (labels >= L_ROOM0).any():
        raise ImageMismatchError("integration image palette not recognised")
    lab = np.flipud(_inpaint(labels))  # data orientation: row 0 = lowest map y
    rooms = lab >= L_SCAN
    near = rooms.copy()
    for _ in range(WALL_REACH_PX):
        grown = near.copy()
        grown[1:] |= near[:-1]
        grown[:-1] |= near[1:]
        grown[:, 1:] |= near[:, :-1]
        grown[:, :-1] |= near[:, 1:]
        near = grown
    walls = (lab == L_WALL) & near
    # Wall specks (table legs, scan noise) become floor; solid blocks (furniture, closed
    # areas) keep only their outline so they read as objects, not as massive walls.
    walls = _drop_specks(walls)
    core = walls.copy()
    for axis, step in ((0, 1), (0, -1), (1, 1), (1, -1)):
        core &= np.roll(walls, step, axis=axis)
    core &= np.roll(np.roll(walls, 1, 0), 1, 1) & np.roll(np.roll(walls, -1, 0), -1, 1)
    core &= np.roll(np.roll(walls, 1, 0), -1, 1) & np.roll(np.roll(walls, -1, 0), 1, 1)
    solid = core.copy()
    for _ in range(1):  # keep 1 px outline + the core's direct neighbours as wall
        solid = solid & np.roll(core, 1, 0) & np.roll(core, -1, 0)
    walls = walls & ~solid
    floor = bytearray((rooms | walls).astype(np.uint8).tobytes())
    _fill_small_holes(floor, width, height, MAX_HOLE_PX)
    floor_arr = np.frombuffer(bytes(floor), dtype=np.uint8).reshape(height, width)
    room_lab = np.where(lab >= L_ROOM0, lab - L_ROOM0 + 1, 0).astype(np.int32)
    seams = np.zeros_like(rooms)
    right = (room_lab[:, :-1] > 0) & (room_lab[:, 1:] > 0) & (room_lab[:, :-1] != room_lab[:, 1:])
    seams[:, :-1] |= right
    seams[:, 1:] |= right
    up = (room_lab[:-1] > 0) & (room_lab[1:] > 0) & (room_lab[:-1] != room_lab[1:])
    seams[:-1] |= up
    seams[1:] |= up
    fills = [int(v) for v in room_lab.ravel()]
    tone_of = _room_tones(fills, width)
    tones = np.vectorize(lambda v: tone_of.get(int(v), 0) if v else 0, otypes=[np.uint8])(room_lab)
    ys, xs = np.nonzero(floor_arr)
    if not len(xs):
        raise ImageMismatchError("integration image has no floor")
    x0, x1 = int(xs.min()) - CROP_MARGIN, int(xs.max()) + 1 + CROP_MARGIN
    y0, y1 = int(ys.min()) - CROP_MARGIN, int(ys.max()) + 1 + CROP_MARGIN

    def crop(arr: Any) -> bytes:
        out = np.zeros((y1 - y0, x1 - x0), dtype=np.uint8)
        a, b = max(0, x0), min(width, x1)
        c, d = max(0, y0), min(height, y1)
        out[c - y0 : d - y0, a - x0 : b - x0] = arr[c:d, a:b]
        return out.tobytes()

    return RasterLayers(
        x1 - x0,
        y1 - y0,
        left + x0,
        top + y0,
        crop(floor_arr),
        crop(walls.astype(np.uint8)),
        crop((seams & ~walls).astype(np.uint8)),
        crop(tones),
        source="integration",
    )
