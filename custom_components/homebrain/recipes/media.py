"""Recipe photos: downloaded from the recipe page, re-encoded to WebP, stored locally.

Files: ``/config/homebrain/recipes/media/<recipe_id>.webp`` (≤ 1600 px) and
``<recipe_id>-thumb.webp`` (≤ 480 px). EXIF/ICC metadata is dropped by re-encoding.
"""

from __future__ import annotations

import io
from pathlib import Path

from .store import RecipeError, is_recipe_id

FULL_PX = 1600
THUMB_PX = 480
MAX_INPUT_BYTES = 8_000_000
MAX_PIXELS = 40_000_000
VARIANTS = ("full", "thumb")


def media_dir(config_path: str) -> Path:
    return Path(config_path) / "homebrain" / "recipes" / "media"


def photo_path(config_path: str, recipe_id: str, variant: str) -> Path:
    if not is_recipe_id(recipe_id) or variant not in VARIANTS:
        raise RecipeError("INVALID_FIELD", "photo")
    suffix = "" if variant == "full" else "-thumb"
    return media_dir(config_path) / f"{recipe_id}{suffix}.webp"


def to_webp_pair(data: bytes) -> tuple[bytes, bytes, tuple[int, int]]:
    """JPEG/PNG/WebP bytes -> (full WebP, thumb WebP, full size)."""
    from PIL import Image, ImageOps, UnidentifiedImageError  # noqa: PLC0415 - HA ships Pillow

    if len(data) > MAX_INPUT_BYTES:
        raise RecipeError("PHOTO_TOO_LARGE")
    try:
        with Image.open(io.BytesIO(data)) as img:
            if img.format not in {"JPEG", "PNG", "WEBP"}:
                raise RecipeError("PHOTO_INVALID")
            if img.width * img.height > MAX_PIXELS:
                raise RecipeError("PHOTO_TOO_LARGE")
            clean = ImageOps.exif_transpose(img).convert("RGB")
    except (UnidentifiedImageError, OSError) as err:
        raise RecipeError("PHOTO_INVALID") from err
    full = clean.copy()
    full.thumbnail((FULL_PX, FULL_PX))
    thumb = clean.copy()
    thumb.thumbnail((THUMB_PX, THUMB_PX))
    out_full, out_thumb = io.BytesIO(), io.BytesIO()
    full.save(out_full, "WEBP", quality=80, method=4)
    thumb.save(out_thumb, "WEBP", quality=74, method=4)
    return out_full.getvalue(), out_thumb.getvalue(), full.size


def store_photo(config_path: str, recipe_id: str, data: bytes) -> dict:
    """Blocking: encode + atomically write both variants; returns the ``photo`` record."""
    full, thumb, (width, height) = to_webp_pair(data)
    folder = media_dir(config_path)
    folder.mkdir(parents=True, exist_ok=True)
    for variant, payload in (("full", full), ("thumb", thumb)):
        target = photo_path(config_path, recipe_id, variant)
        tmp = target.with_suffix(".tmp")
        tmp.write_bytes(payload)
        tmp.replace(target)
    return {"width": width, "height": height, "bytes": len(full)}


def delete_photo(config_path: str, recipe_id: str) -> None:
    for variant in VARIANTS:
        path = photo_path(config_path, recipe_id, variant)
        path.unlink(missing_ok=True)
