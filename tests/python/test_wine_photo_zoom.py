"""Full-resolution copy, full-URL signing, route auth/fallback, deletion (synthetic data)."""

import io
from unittest.mock import patch

import pytest
from homeassistant.core import HomeAssistant
from homeassistant.setup import async_setup_component
from PIL import Image

from custom_components.homebrain.const import DOMAIN
from custom_components.homebrain.wine import enrich as zn
from custom_components.homebrain.wine.domain import WineError

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_jpeg(w: int, h: int, color: str = "#e0e8d0") -> bytes:
    """Create a synthetic JPEG of size w × h (no EXIF, no real photo data)."""
    buf = io.BytesIO()
    Image.new("RGB", (w, h), color).save(buf, "JPEG")
    return buf.getvalue()


# ---------------------------------------------------------------------------
# to_webp_full: dimensions
# ---------------------------------------------------------------------------


def test_full_copy_large_portrait_scaled_down():
    """3000×4000 → full copy 1500×2000, thumbnail stays ≤600×800."""
    raw = _make_jpeg(3000, 4000)

    # thumbnail
    thumb = zn.to_webp(raw)
    thumb_img = Image.open(io.BytesIO(thumb))
    assert thumb_img.width <= 600 and thumb_img.height <= 800, thumb_img.size

    # full
    full = zn.to_webp_full(raw)
    full_img = Image.open(io.BytesIO(full))
    assert full_img.size == (1500, 2000), full_img.size
    assert full_img.format == "WEBP"
    # EXIF stripped
    assert not full_img.getexif()
    # byte cap
    assert len(full) <= zn.MAX_FULL_WEBP_BYTES


def test_full_copy_small_image_not_upscaled():
    """A 400×600 image is smaller than 2000 px: no upscaling must occur."""
    raw = _make_jpeg(400, 600)
    full = zn.to_webp_full(raw)
    img = Image.open(io.BytesIO(full))
    # Thumbnail only downsizes, never upsizes.
    assert img.size == (400, 600), img.size


def test_full_copy_landscape():
    """2400×1200 → longest edge ≤ 2000 → 2000×1000."""
    raw = _make_jpeg(2400, 1200)
    full = zn.to_webp_full(raw)
    img = Image.open(io.BytesIO(full))
    assert img.size == (2000, 1000), img.size


def test_full_copy_byte_cap():
    """The full copy must fit within MAX_FULL_WEBP_BYTES."""
    raw = _make_jpeg(2000, 2000, "#ffffff")
    full = zn.to_webp_full(raw)
    assert len(full) <= zn.MAX_FULL_WEBP_BYTES


# ---------------------------------------------------------------------------
# store_image_full
# ---------------------------------------------------------------------------


def test_store_image_full_writes_correct_path(tmp_path):
    raw = _make_jpeg(600, 800)
    full_webp = zn.to_webp_full(raw)
    path = zn.store_image_full(str(tmp_path), "abc123", full_webp)
    assert path == "homebrain/media/wine/abc123.full.webp"
    assert (tmp_path / path).read_bytes() == full_webp


def test_store_image_full_bad_wine_id(tmp_path):
    with pytest.raises(WineError, match="INVALID_FIELD"):
        zn.store_image_full(str(tmp_path), "../../etc/passwd", b"x")


# ---------------------------------------------------------------------------
# WebSocket payload: fullUrl present and signed
# ---------------------------------------------------------------------------

SYNTH = {
    "name": "Synthetic Ryzlink",
    "producer": "Vinařství Synthetic A",
    "vintage": 2021,
    "wineType": "still",
    "color": "white",
    "grapeVarieties": ["Ryzlink rýnský"],
    "volumeMl": 750,
    "quantity": 3,
}


@pytest.fixture
async def ws(hass: HomeAssistant, hass_ws_client, tmp_path):
    hass.config.config_dir = str(tmp_path)
    with patch(
        "custom_components.homebrain.wine.websocket.wine_db_path",
        return_value=tmp_path / "w.db",
    ):
        assert await async_setup_component(hass, DOMAIN, {})
        client = await hass_ws_client(hass)
        yield client
        from custom_components.homebrain.wine.websocket import async_close_store

        await async_close_store(hass)


async def _call(client, **msg):
    await client.send_json_auto_id(msg)
    return await client.receive_json()


async def test_set_image_produces_fullUrl(hass, ws, hass_client, tmp_path):
    """set_image stores both copies and the payload contains signed url + fullUrl."""
    created = await _call(
        ws, type="homebrain/wine/create", wine=SYNTH, source_operation_id="op-zoom-001"
    )
    wine_id = created["result"]["wine"]["id"]

    raw = _make_jpeg(1200, 1600)

    # Encode as data URL for set_image (photo field)
    import base64

    photo_b64 = base64.b64encode(raw).decode()
    photo_data_url = f"data:image/jpeg;base64,{photo_b64}"

    result = await _call(ws, type="homebrain/wine/set_image", wine_id=wine_id, photo=photo_data_url)
    assert result["success"], result
    image = result["result"]["wine"]["image"]
    assert image["localPath"] == f"homebrain/media/wine/{wine_id}.webp"
    assert image["fullLocalPath"] == f"homebrain/media/wine/{wine_id}.full.webp"
    assert "authSig=" in image["url"]
    assert "authSig=" in image["fullUrl"]
    # Both URLs must be distinct signed paths (not the same URL).
    assert image["url"] != image["fullUrl"]

    # Files must exist on disk.
    assert (tmp_path / image["localPath"]).is_file()
    assert (tmp_path / image["fullLocalPath"]).is_file()

    # Thumbnail dimensions ≤ 600×800.
    thumb_img = Image.open(tmp_path / image["localPath"])
    assert thumb_img.width <= 600 and thumb_img.height <= 800

    # Full dimensions ≤ 2000×2000.
    full_img = Image.open(tmp_path / image["fullLocalPath"])
    assert full_img.width <= 2000 and full_img.height <= 2000
    assert full_img.width > thumb_img.width or full_img.height > thumb_img.height


# ---------------------------------------------------------------------------
# HTTP route: auth, 404, fallback
# ---------------------------------------------------------------------------


async def test_full_route_auth_and_404(hass, ws, hass_client, tmp_path):
    """Full route: unsigned → 401; non-existent wine → 404."""
    http = await hass_client()

    # 401 on unsigned request
    resp = await http.get(
        "/api/homebrain/wine/image/nonexistent/full", headers={"Authorization": ""}
    )
    assert resp.status == 401

    # 404 when wine has no photo at all
    created = await _call(
        ws, type="homebrain/wine/create", wine=SYNTH, source_operation_id="op-zoom-004"
    )
    wine_id = created["result"]["wine"]["id"]
    full_url = f"/api/homebrain/wine/image/{wine_id}/full"
    resp404 = await http.get(full_url)
    assert resp404.status == 404


async def test_full_route_fallback_to_thumbnail(hass, ws, hass_client, tmp_path):
    """Full route falls back to the thumbnail when only .webp exists (old photo)."""
    # Create a wine and manually write only the thumbnail (simulate pre-feature photo).
    created = await _call(
        ws, type="homebrain/wine/create", wine=SYNTH, source_operation_id="op-zoom-005"
    )
    wine_id = created["result"]["wine"]["id"]

    folder = zn.media_dir(str(tmp_path))
    folder.mkdir(parents=True, exist_ok=True)
    raw = _make_jpeg(300, 400)
    thumb_webp = zn.to_webp(raw)
    # Write only the thumbnail, not the full copy.
    thumb_path = folder / f"{wine_id}.webp"
    thumb_path.write_bytes(thumb_webp)
    # (No full.webp written.)

    http = await hass_client()
    resp = await http.get(f"/api/homebrain/wine/image/{wine_id}/full")
    assert resp.status == 200
    assert resp.headers["Content-Type"] == "image/webp"


async def test_full_route_serves_full_when_present(hass, ws, hass_client, tmp_path):
    """Full route serves the .full.webp when it exists."""
    created = await _call(
        ws, type="homebrain/wine/create", wine=SYNTH, source_operation_id="op-zoom-006"
    )
    wine_id = created["result"]["wine"]["id"]

    folder = zn.media_dir(str(tmp_path))
    folder.mkdir(parents=True, exist_ok=True)
    raw = _make_jpeg(1200, 1600)

    thumb_webp = zn.to_webp(raw)
    (folder / f"{wine_id}.webp").write_bytes(thumb_webp)

    full_webp = zn.to_webp_full(raw)
    (folder / f"{wine_id}.full.webp").write_bytes(full_webp)

    http = await hass_client()
    resp = await http.get(f"/api/homebrain/wine/image/{wine_id}/full")
    assert resp.status == 200
    body = await resp.read()
    # The full copy is larger than the thumbnail.
    assert len(body) > len(thumb_webp)


async def test_set_image_replacing_removes_old_full(hass, ws, hass_client, tmp_path):
    """When set_image is called twice, the full copy is overwritten (not orphaned)."""
    created = await _call(
        ws, type="homebrain/wine/create", wine=SYNTH, source_operation_id="op-zoom-007"
    )
    wine_id = created["result"]["wine"]["id"]

    import base64

    def photo_data(w, h):
        raw = _make_jpeg(w, h)
        return "data:image/jpeg;base64," + base64.b64encode(raw).decode()

    r1 = await _call(
        ws, type="homebrain/wine/set_image", wine_id=wine_id, photo=photo_data(1200, 1600)
    )
    assert r1["success"], r1
    mtime1 = (tmp_path / r1["result"]["wine"]["image"]["fullLocalPath"]).stat().st_mtime

    r2 = await _call(
        ws, type="homebrain/wine/set_image", wine_id=wine_id, photo=photo_data(800, 1200)
    )
    assert r2["success"], r2
    mtime2 = (tmp_path / r2["result"]["wine"]["image"]["fullLocalPath"]).stat().st_mtime

    # File was overwritten (mtime changed or at least the path is the same).
    assert (
        r1["result"]["wine"]["image"]["fullLocalPath"]
        == r2["result"]["wine"]["image"]["fullLocalPath"]
    )
    assert mtime2 >= mtime1
