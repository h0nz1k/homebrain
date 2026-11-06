"""Read the raw Roborock map blob from the core integration's runtime (read-only).

The blob is not public API: ``image.<robot>_map`` is a ``RoborockMap`` entity whose
``_map_content`` property returns python-roborock's ``MapContent`` with
``raw_api_response`` (bytes). We only *read* that attribute – no cloud call, no robot
command. Because it is internal, access is version-guarded and every failure becomes a
``reason`` string so the panel falls back to the PNG image.
"""

from __future__ import annotations

import asyncio
import logging
from functools import partial
from importlib import metadata
from typing import Any, Final

from homeassistant.const import __version__ as HA_VERSION
from homeassistant.core import HomeAssistant

from .integration_image import integration_layers
from .raster_map import LAYERS, THEMES, RasterLayers, raster_bounds, raster_layers, render_png
from .vector_map import MapParseError, build_vector_map, parse_raw_map

# ``{theme}`` = ``light`` | ``dark`` (base layer) or ``light-walls`` | ``dark-walls``.
RASTER_PATH: Final = "/api/homebrain/robots/map/{slot}/{digest}/{{theme}}.png"

_LOGGER = logging.getLogger(__name__)

# Tested against HA 2026.10 (python-roborock 7.12, vacuum-map-parser-roborock 0.1.5).
# Outside these windows the internal attribute may have moved, so we do not touch it.
HA_MIN: Final = (2025, 12)
HA_MAX: Final = (2026, 12)
ROBOROCK_LIB_MAJORS: Final = frozenset({7})
PARSE_TIMEOUT: Final = 20

REASON_UNSUPPORTED_HA: Final = "unsupported_ha"
REASON_UNSUPPORTED_LIB: Final = "unsupported_library"
REASON_NO_ENTITY: Final = "no_map_entity"
REASON_NOT_ROBOROCK: Final = "not_roborock"
REASON_NO_DATA: Final = "no_map_data"
REASON_PARSE_FAILED: Final = "parse_failed"


def _version_tuple(value: str) -> tuple[int, int] | None:
    parts = value.split(".")
    try:
        return int(parts[0]), int(parts[1])
    except (IndexError, ValueError):
        return None


def lib_version() -> str | None:
    """Installed python-roborock version (None when the integration is not installed).

    Reads package metadata from disk: blocking, so never call it on the event loop
    (``VectorMapCache`` resolves it once in the executor and caches it).
    """
    try:
        return metadata.version("python-roborock")
    except metadata.PackageNotFoundError:
        return None


def version_guard(ha_version: str = HA_VERSION, roborock_version: str | None = None) -> str | None:
    """``None`` when the internal API is known to work, else a fallback reason."""
    ha = _version_tuple(ha_version)
    if ha is None or not HA_MIN <= ha <= HA_MAX:
        return REASON_UNSUPPORTED_HA
    lib = _version_tuple(roborock_version or "")
    if lib is None or lib[0] not in ROBOROCK_LIB_MAJORS:
        return REASON_UNSUPPORTED_LIB
    return None


def raw_map_blob(hass: HomeAssistant, image_entity_id: str) -> tuple[bytes | None, str | None]:
    """``(blob, None)`` or ``(None, reason)`` for a bound ``image.*`` map entity."""
    component = hass.data.get("image")
    get_entity = getattr(component, "get_entity", None)
    entity = get_entity(image_entity_id) if callable(get_entity) else None
    if entity is None:
        return None, REASON_NO_ENTITY
    platform = getattr(getattr(entity, "platform", None), "platform_name", None)
    if platform != "roborock":
        return None, REASON_NOT_ROBOROCK
    try:
        content = getattr(entity, "_map_content", None)
    except Exception:  # noqa: BLE001 - internal property may raise on missing maps
        content = None
    blob = getattr(content, "raw_api_response", None)
    if not isinstance(blob, (bytes, bytearray)) or not blob:
        return None, REASON_NO_DATA
    return bytes(blob), None


async def integration_image(
    hass: HomeAssistant, image_entity_id: str
) -> tuple[bytes | None, list[dict[str, Any]] | None]:
    """The PNG the Roborock integration renders (public ``async_image``) + calibration.

    Calibration (``MapData.calibration()``, map units → image pixels) is optional: it only
    cross-checks the offset that the raw map header already gives.
    """
    component = hass.data.get("image")
    get_entity = getattr(component, "get_entity", None)
    entity = get_entity(image_entity_id) if callable(get_entity) else None
    if entity is None:
        return None, None
    try:
        png = await entity.async_image()
    except Exception:  # noqa: BLE001 - map flag missing, cloud hiccup: use the raw data
        _LOGGER.debug("No integration image for %s", image_entity_id, exc_info=True)
        return None, None
    calibration = None
    try:
        map_data = getattr(getattr(entity, "_map_content", None), "map_data", None)
        points = map_data.calibration() if map_data is not None else None
        if isinstance(points, list):
            calibration = points
    except Exception:  # noqa: BLE001 - optional cross-check only
        calibration = None
    return (bytes(png) if isinstance(png, (bytes, bytearray)) and png else None), calibration


def _base_layers(
    blob: bytes, png: bytes | None, calibration: list[dict[str, Any]] | None
) -> RasterLayers:
    """Recoloured integration image when it matches the raw map, else the raw-data raster."""
    image = parse_raw_map(blob).image
    if image is None:  # pragma: no cover - build_vector_map already raised
        raise MapParseError("map has no image block")
    if png:
        try:
            return integration_layers(
                png, image.width, image.height, image.left, image.top, calibration
            )
        except (MapParseError, OSError, ValueError) as err:
            _LOGGER.debug("Integration map image not usable, rendering raw data: %s", err)
    return raster_layers(image)


def _build(
    blob: bytes,
    geometry: dict[str, dict[str, Any]],
    layers: dict[str, RasterLayers],
    png: bytes | None = None,
    calibration: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Vector payload + raster layers of the same floor plan (executor job)."""
    vector = build_vector_map(blob, geometry)
    digest = vector["digest"]
    if digest not in layers:
        base = _base_layers(blob, png, calibration)
        layers.clear()  # one floor plan per map entity
        layers[digest] = base
    vector["raster"] = {
        "bounds": raster_bounds(layers[digest]),
        "themes": list(THEMES),
        "layers": list(LAYERS),
        "source": layers[digest].source,
    }
    return vector


class VectorMapCache:
    """Per-entity geometry cache: polygons are rebuilt only when the floor plan changes.

    The raster base layer (PNG per theme) is rendered lazily from the same parsed image
    and cached per floor-plan digest, so overlays and bitmap always share one transform.
    """

    def __init__(self, hass: HomeAssistant) -> None:
        self.hass = hass
        self._geometry: dict[str, dict[str, dict[str, Any]]] = {}
        self._layers: dict[str, dict[str, RasterLayers]] = {}
        self._png: dict[str, dict[tuple[str, str], bytes]] = {}
        self._locks: dict[str, asyncio.Lock] = {}
        # Resolved once per cache (= per HA run) off the event loop; see ``_lib_version``.
        self._lib: tuple[str | None] | None = None

    async def async_png(self, image_entity_id: str, digest: str, theme: str) -> bytes | None:
        """Cached raster layer (``dark`` / ``dark-walls`` …); ``None`` when unknown/stale."""
        layers = self._layers.get(image_entity_id, {}).get(digest)
        name, _, layer = theme.partition("-")
        layer = layer or LAYERS[0]
        if layers is None or name not in THEMES or layer not in LAYERS:
            return None
        cache = self._png.setdefault(image_entity_id, {})
        if (png := cache.get((digest, theme))) is None:
            png = await self.hass.async_add_executor_job(
                partial(render_png, layers, name, layer=layer)
            )
            for key in [key for key in cache if key[0] != digest]:
                del cache[key]
            cache[(digest, theme)] = png
        return png

    async def _lib_version(self) -> str | None:
        """python-roborock version, read in the executor on first use and then cached.

        ``importlib.metadata.version`` does file I/O; calling it on the event loop made HA
        log a blocking-call warning on every map request.
        """
        if self._lib is None:
            self._lib = (await self.hass.async_add_executor_job(lib_version),)
        return self._lib[0]

    async def async_get(self, image_entity_id: str) -> dict[str, Any]:
        """``{available: True, map: {...}}`` or ``{available: False, reason}``."""
        if reason := version_guard(HA_VERSION, await self._lib_version()):
            return {"available": False, "reason": reason}
        blob, reason = raw_map_blob(self.hass, image_entity_id)
        if blob is None:
            return {"available": False, "reason": reason}
        lock = self._locks.setdefault(image_entity_id, asyncio.Lock())
        geometry = self._geometry.setdefault(image_entity_id, {})
        layers = self._layers.setdefault(image_entity_id, {})
        async with lock:
            # In-memory bytes of the entity (no cloud call); only used for a new floor plan.
            png, calibration = await integration_image(self.hass, image_entity_id)
            try:
                async with asyncio.timeout(PARSE_TIMEOUT):
                    vector = await self.hass.async_add_executor_job(
                        _build, blob, geometry, layers, png, calibration
                    )
            except (MapParseError, TimeoutError) as err:
                _LOGGER.debug("Vector map for %s unavailable: %s", image_entity_id, err)
                return {"available": False, "reason": REASON_PARSE_FAILED}
            except Exception:  # noqa: BLE001 - never break the panel, fall back to PNG
                _LOGGER.exception("Unexpected vector map failure for %s", image_entity_id)
                return {"available": False, "reason": REASON_PARSE_FAILED}
        return {"available": True, "map": vector}
