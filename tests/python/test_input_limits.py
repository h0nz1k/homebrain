"""Input size limits for the CPU-heavy decoders (#28, synthetic data only)."""

import io
import struct
import zlib

import numpy as np
import pytest
from PIL import Image

from custom_components.homebrain.robots import integration_image
from custom_components.homebrain.robots.vector_map import MapParseError
from custom_components.homebrain.weather import radar


def _png(width: int, height: int, body: bytes) -> bytes:
    def chunk(ctype: bytes, payload: bytes) -> bytes:
        crc = zlib.crc32(ctype + payload) & 0xFFFFFFFF
        return struct.pack(">I", len(payload)) + ctype + payload + struct.pack(">I", crc)

    ihdr = struct.pack(">IIBBBBB", width, height, 8, 0, 0, 0, 0)
    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", ihdr)
        + chunk(b"IDAT", zlib.compress(body))
        + chunk(b"IEND", b"")
    )


def test_radar_png_roundtrip_still_works():
    field = np.zeros((4, 5), dtype=np.uint8)
    field[1, 2] = 40
    index, _palette = radar.decode_png(radar.encode_png(field))
    assert index.shape == (4, 5)


def test_radar_png_rejects_huge_header():
    with pytest.raises(ValueError, match="exceeds"):
        radar.decode_png(_png(radar.MAX_PNG_SIDE + 1, 1, b"\x00" * 10))


def test_radar_png_rejects_decompression_bomb():
    # 2x2 header, but the body inflates to 4 MB: refused without inflating it all.
    with pytest.raises(ValueError, match="header"):
        radar.decode_png(_png(2, 2, b"\x00" * 4_000_000))


def test_integration_image_pixel_cap(monkeypatch):
    monkeypatch.setattr(integration_image, "MAX_PIXELS", 100)
    buf = io.BytesIO()
    Image.new("RGBA", (20, 20)).save(buf, format="PNG")
    with pytest.raises(MapParseError, match="too large"):
        integration_image._labels(buf.getvalue(), 20, 20)
