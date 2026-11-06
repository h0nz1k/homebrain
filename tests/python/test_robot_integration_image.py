"""Base layer from the Roborock integration's own map PNG (synthetic fixtures only).

The fixtures paint an invented floor plan the way vacuum-map-parser does (k×k blocks, flat
room colours, slate walls, path/robot/charger/carpet on top). Real map images are private
floor plans and never land in the repository.
"""

import io
from types import SimpleNamespace
from unittest.mock import patch

import pytest
from homeassistant.core import HomeAssistant
from test_robot_map import LEGEND, PLAN, _centroid, _FakeComponent, _png_pixels, _to_png, make_blob

from custom_components.homebrain.robots import map_source
from custom_components.homebrain.robots.integration_image import (
    ImageMismatchError,
    block_scale,
    calibration_origin,
    integration_layers,
)
from custom_components.homebrain.robots.map_source import VectorMapCache
from custom_components.homebrain.robots.raster_map import PALETTES, raster_bounds, render_png
from custom_components.homebrain.robots.vector_map import build_vector_map, parse_raw_map

COLOURS = {
    "#": (93, 109, 126, 255),
    "_": (223, 223, 223, 255),
    "A": (240, 178, 122, 255),
    "B": (133, 193, 233, 255),
    "C": (217, 136, 128, 255),
    ".": (0, 0, 0, 0),
}
PATH = (147, 194, 238, 255)
CARPET = (169, 247, 169, 255)
LEFT, TOP = 200, 100  # make_blob defaults (map pixels)


def integration_png(grid=PLAN, scale=4, overlays=True, colours=COLOURS) -> bytes:
    """Invented integration image: top-down rows, ``scale`` px per map pixel."""
    from PIL import Image, ImageDraw  # noqa: PLC0415

    h, w = len(grid), len(grid[0])
    img = Image.new("RGBA", (w * scale, h * scale), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    for r, row in enumerate(grid):
        for c, ch in enumerate(row):
            x, y = c * scale, r * scale
            colour = colours[ch]
            if overlays and ch == "B" and (r + c) % 2:
                colour = CARPET  # carpet dither inside the kitchen
            draw.rectangle([x, y, x + scale - 1, y + scale - 1], fill=colour)
    if overlays:
        # Cleaning path through the living room, robot icon on the floor edge, charger.
        draw.line([(1.5 * scale, 2.5 * scale), (5.5 * scale, 2.5 * scale)], fill=PATH, width=3)
        draw.line([(2.5 * scale, 2.5 * scale), (2.5 * scale, 8.5 * scale)], fill=PATH, width=3)
        cx, cy, rad = 1.5 * scale, 5.5 * scale, 1.4 * scale
        draw.ellipse([cx - rad, cy - rad, cx + rad, cy + rad], fill=(255, 255, 255, 255))
        draw.ellipse([cx - 2, cy - 2, cx + 2, cy + 2], fill=(127, 127, 127, 255))
        draw.rectangle([3 * scale, 7 * scale, 3 * scale + 2, 7 * scale + 2], fill=(0, 0, 0, 255))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


PLAN_HEIGHT = len(PLAN)


def _calibration(scale=4, height=PLAN_HEIGHT, left=LEFT, top=TOP):
    pts = []
    for x, y in ((25_000, 25_000), (20_000, 20_000), (30_000, 20_000)):
        pts.append(
            {
                "vacuum": {"x": x, "y": y},
                "map": {"x": (x / 50 - left) * scale, "y": (height - 1 - (y / 50 - top)) * scale},
            }
        )
    return pts


def _layers(png=None, calibration=None):
    image = parse_raw_map(make_blob(PLAN, LEGEND)).image
    return integration_layers(
        png or integration_png(), image.width, image.height, image.left, image.top, calibration
    )


def _cell(layers, raw: bytes, col: int, row_top_down: int) -> int:
    """Value of a PLAN cell in a cropped layer (data orientation: row 0 = lowest y)."""
    x = LEFT + col - layers.left
    y = TOP + (len(PLAN) - 1 - row_top_down) - layers.top
    return raw[y * layers.width + x]


def test_recolour_keeps_the_plan_and_drops_path_robot_and_carpet():
    layers = _layers(calibration=_calibration())
    assert layers.source == "integration"
    for r, row in enumerate(PLAN):
        for c, ch in enumerate(row):
            floor = _cell(layers, layers.floor, c, r)
            wall = _cell(layers, layers.walls, c, r)
            if ch == "#":
                assert wall == 1 and floor == 1, (r, c)
            elif ch in "ABC_":
                # Path, robot icon, black speck and carpet dither are floor again.
                assert floor == 1 and wall == 0, (r, c)
    # The 1-pixel hole in the bath (C) is filled like in the raw-data raster.
    assert _cell(layers, layers.floor, 6, 8) == 1
    # Rooms touch only through walls here → no seams, but neighbours get distinct tones.
    assert sum(layers.seams) == 0
    assert _cell(layers, layers.tones, 1, 1) != _cell(layers, layers.tones, 8, 1)


@pytest.mark.parametrize("theme", ["light", "dark"])
def test_recoloured_base_aligns_with_the_vector_overlays(theme):
    blob = make_blob(PLAN, LEGEND)
    vector = build_vector_map(blob)
    layers = _layers()
    bounds = raster_bounds(layers)
    img, size = _png_pixels(render_png(layers, theme))
    floor = PALETTES[theme]["floor"]
    for room in vector["rooms"]:
        cx, cy = _centroid(room["outline"][0])
        r, _g, b, a = img.getpixel(_to_png(bounds, size, cx, cy))
        assert a == 255 and max(abs(r - floor[0]), abs(b - floor[2])) < 40
    walls, _ = _png_pixels(render_png(layers, theme, layer="walls"))
    top_wall = ((LEFT + 5.5) * 50, (TOP + len(PLAN) - 0.5) * 50)
    assert walls.getpixel(_to_png(bounds, size, *top_wall))[3] > 200
    # No trace of the original palette survives (path blue, room orange).
    colours = {px[:3] for px in img.get_flattened_data() if px[3] == 255}
    assert PATH[:3] not in colours and COLOURS["A"][:3] not in colours


def test_scale_and_calibration_checks():
    assert block_scale((56, 44), 14, 11) == 4
    with pytest.raises(ImageMismatchError):
        block_scale((57, 44), 14, 11)
    with pytest.raises(ImageMismatchError):
        block_scale((56, 33), 14, 11)
    assert calibration_origin(_calibration(), 4, len(PLAN)) == pytest.approx((LEFT, TOP))
    assert calibration_origin(None, 4, 11) is None
    assert calibration_origin([{"vacuum": {}}], 4, 11) is None
    with pytest.raises(ImageMismatchError, match="calibration"):
        _layers(calibration=_calibration(left=LEFT + 3))
    # A different block size works the same way (scale is read from the image size).
    assert _layers(png=integration_png(scale=2)).floor == _layers(png=integration_png()).floor


def test_foreign_palette_is_rejected():
    odd = {k: (v[0] // 2 + 1, v[1] // 3 + 7, v[2] // 2 + 3, v[3]) for k, v in COLOURS.items()}
    odd["."] = COLOURS["."]
    # Every pixel is "a room colour", walls included → no walls recognised, but the
    # stray share check must still trip on speckled palettes.
    from PIL import Image  # noqa: PLC0415

    noisy = Image.open(io.BytesIO(integration_png(colours=odd, overlays=False))).convert("RGBA")
    for x in range(0, noisy.width, 2):
        for y in range(0, noisy.height, 2):
            if noisy.getpixel((x, y))[3]:
                noisy.putpixel((x, y), ((x * 37) % 256, (y * 91) % 256, (x * y) % 256, 255))
    buf = io.BytesIO()
    noisy.save(buf, format="PNG")
    with pytest.raises(ImageMismatchError):
        _layers(png=buf.getvalue())


def _entity(blob, png, calibration=None):
    async def async_image():
        if isinstance(png, Exception):
            raise png
        return png

    map_data = SimpleNamespace(calibration=lambda: calibration) if calibration else None
    content = SimpleNamespace(raw_api_response=blob, map_data=map_data)
    return SimpleNamespace(
        platform=SimpleNamespace(platform_name="roborock"),
        _map_content=content,
        async_image=async_image,
        content_type="image/png",
    )


async def test_cache_prefers_the_integration_image_and_falls_back(hass: HomeAssistant):
    blob = make_blob(PLAN, LEGEND)
    hass.data["image"] = _FakeComponent(
        {
            "image.ok": _entity(blob, integration_png(), _calibration()),
            "image.wrong_size": _entity(blob, integration_png(grid=[r + "#" for r in PLAN])),
            "image.shifted": _entity(blob, integration_png(), _calibration(top=TOP - 4)),
            "image.broken": _entity(blob, b"not a png"),
            "image.raises": _entity(blob, RuntimeError("map flag not found")),
        }
    )
    cache = VectorMapCache(hass)
    with patch.object(map_source, "lib_version", return_value="7.12.0"):
        results = {k: await cache.async_get(k) for k in hass.data["image"].entities}
    sources = {k: v["map"]["raster"]["source"] for k, v in results.items()}
    assert sources == {
        "image.ok": "integration",
        "image.wrong_size": "map_data",
        "image.shifted": "map_data",
        "image.broken": "map_data",
        "image.raises": "map_data",
    }
    # Same floor plan, same overlays: only the base layer source differs.
    assert results["image.ok"]["map"]["rooms"] == results["image.broken"]["map"]["rooms"]
    png = await cache.async_png("image.ok", results["image.ok"]["map"]["digest"], "dark")
    assert png and png.startswith(b"\x89PNG")


def test_map_palettes_match_the_ui_tokens():
    """``PALETTES`` are the ``--hb-map-*`` tokens of the shared UI (one palette for all)."""
    import re  # noqa: PLC0415
    from pathlib import Path  # noqa: PLC0415

    css = (Path(__file__).parents[2] / "packages/ui/src/tokens.css").read_text()
    light_at = css.index("[data-theme='light']")
    for theme, part in (("dark", css[:light_at]), ("light", css[light_at:])):
        tokens = {
            name: tuple(int(value[i : i + 2], 16) for i in (0, 2, 4))
            for name, value in re.findall(r"--hb-map-([a-z0-9]+):\s*#([0-9a-f]{6})", part)
        }
        assert tokens == PALETTES[theme], theme
