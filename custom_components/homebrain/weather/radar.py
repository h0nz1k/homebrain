"""ČHMÚ radar composite (CZRAD MAX_Z PNG, CC BY 4.0): decode, crop around home, nowcast.

Everything here is pure (numpy + stdlib) and CPU-bound: call it from an executor.

* Composite: ``pacz2gmaps3.z_max3d.YYYYMMDD.HHMM.0.png`` every 5 min, 680x460 px palette PNG
  in EPSG:3857, bounds lon 11.267-19.624, lat 48.047-51.458 (ČHMÚ radar_popis_cz.pdf).
* Colours map to the ČHMÚ dBZ scale (4 dBZ classes, 4-60 dBZ); we map by RGB, not by palette
  index, so a palette reshuffle does not break decoding.
* Nowcast: motion vector from phase correlation of the last 2-3 frames, semi-Lagrangian
  extrapolation of the latest frame 0-60 min, max dBZ within radius r around home.
"""

from __future__ import annotations

import io
import math
import struct
import tarfile
import zlib
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any

import numpy as np

BASE = "https://opendata.chmi.cz/meteorology/weather/radar/composite"
WIDTH, HEIGHT = 680, 460
WEST, EAST, SOUTH, NORTH = 11.267, 19.624, 48.047, 51.458
STEP_MIN = 5
CROP_PX = 160  # ~140 km window (enough upstream for 60 min at ~65 km/h)
CZ_FACTOR = 2  # whole-composite "Česko" view: 2x2 max-pooled (340x230 px, ~1.8 km/px)
LOOP_FRAMES = 24

# ČHMÚ reflectivity legend: RGB -> lower bound of the 4 dBZ class.
DBZ_COLOURS: dict[tuple[int, int, int], int] = {
    (56, 0, 112): 4,
    (48, 0, 168): 8,
    (0, 0, 252): 12,
    (0, 108, 192): 16,
    (0, 160, 0): 20,
    (0, 188, 0): 24,
    (52, 216, 0): 28,
    (156, 220, 0): 32,
    (224, 220, 0): 36,
    (252, 176, 0): 40,
    (252, 132, 0): 44,
    (252, 88, 0): 48,
    (252, 0, 0): 52,
    (160, 0, 0): 56,
    (252, 252, 252): 60,
}
_CLASS_RGB = sorted(((v, k) for k, v in DBZ_COLOURS.items()))


def obs_url(when: datetime) -> str:
    return f"{BASE}/maxz/png/pacz2gmaps3.z_max3d.{when:%Y%m%d.%H%M}.0.png"


def fct_url(when: datetime) -> str:
    return f"{BASE}/fct_maxz/png/pacz2gmaps3.fct_z_max.{when:%Y%m%d.%H%M}.ft60s10.tar"


def floor_step(now: datetime) -> datetime:
    return now.replace(minute=now.minute - now.minute % STEP_MIN, second=0, microsecond=0)


# -- PNG ---------------------------------------------------------------------------------------
def decode_png(data: bytes) -> tuple[np.ndarray, list[tuple[int, int, int]]]:
    """8-bit palette PNG -> (index array HxW, palette). Non-interlaced only."""
    if data[:8] != b"\x89PNG\r\n\x1a\n":
        raise ValueError("not a PNG")
    pos, idat, palette = 8, [], []
    width = height = 0
    while pos < len(data):
        (length, ctype) = struct.unpack(">I4s", data[pos : pos + 8])
        chunk = data[pos + 8 : pos + 8 + length]
        if ctype == b"IHDR":
            width, height, depth, colour, _, _, interlace = struct.unpack(">IIBBBBB", chunk)
            if depth != 8 or colour not in (0, 3) or interlace:
                raise ValueError(f"unsupported PNG depth={depth} colour={colour}")
        elif ctype == b"PLTE":
            palette = [(chunk[i], chunk[i + 1], chunk[i + 2]) for i in range(0, length, 3)]
        elif ctype == b"IDAT":
            idat.append(chunk)
        elif ctype == b"IEND":
            break
        pos += 12 + length
    raw = np.frombuffer(zlib.decompress(b"".join(idat)), dtype=np.uint8)
    rows = raw.reshape(height, width + 1)
    out = np.zeros((height, width), dtype=np.uint8)
    prev = np.zeros(width, dtype=np.int32)
    for y in range(height):
        ftype, line = rows[y, 0], rows[y, 1:].astype(np.int32)
        if ftype == 0:
            cur = line
        elif ftype == 1:
            cur = np.cumsum(line) & 0xFF
        elif ftype == 2:
            cur = (line + prev) & 0xFF
        else:
            cur = np.zeros(width, dtype=np.int32)
            left = 0
            for x in range(width):
                up = int(prev[x])
                if ftype == 3:
                    val = line[x] + ((left + up) >> 1)
                else:  # Paeth
                    ul = int(prev[x - 1]) if x else 0
                    p = left + up - ul
                    pa, pb, pc = abs(p - left), abs(p - up), abs(p - ul)
                    pred = left if pa <= pb and pa <= pc else up if pb <= pc else ul
                    val = line[x] + pred
                left = int(val) & 0xFF
                cur[x] = left
        out[y] = cur
        prev = cur
    if not palette:  # greyscale: identity palette
        palette = [(i, i, i) for i in range(256)]
    return out, palette


def encode_png(dbz: np.ndarray) -> bytes:
    """dBZ class field (0 = no echo) -> small palette PNG with the ČHMÚ colours."""
    lut = np.zeros(256, dtype=np.uint8)
    palette = [(0, 0, 0)]
    for i, (lo, rgb) in enumerate(_CLASS_RGB, start=1):
        palette.append(rgb)
        lut[lo] = i
    idx = lut[np.clip(dbz, 0, 255).astype(np.uint8)]
    h, w = idx.shape
    raw = b"".join(b"\x00" + idx[y].tobytes() for y in range(h))

    def chunk(ctype: bytes, payload: bytes) -> bytes:
        body = ctype + payload
        return struct.pack(">I", len(payload)) + body + struct.pack(">I", zlib.crc32(body))

    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 3, 0, 0, 0))
        + chunk(b"PLTE", b"".join(bytes(c) for c in palette))
        + chunk(b"tRNS", bytes([0] + [210] * (len(palette) - 1)))
        + chunk(b"IDAT", zlib.compress(raw, 9))
        + chunk(b"IEND", b"")
    )


def to_dbz(index: np.ndarray, palette: list[tuple[int, int, int]]) -> np.ndarray:
    lut = np.zeros(256, dtype=np.uint8)
    for i, rgb in enumerate(palette):
        lut[i] = DBZ_COLOURS.get((rgb[0], rgb[1], rgb[2]), 0)
    return lut[index]


# -- geometry ----------------------------------------------------------------------------------
def _merc_y(lat: float) -> float:
    return math.log(math.tan(math.pi / 4 + math.radians(lat) / 2))


def lonlat_to_px(lat: float, lon: float) -> tuple[float, float]:
    """Fractional (row, col) of a WGS84 point in the composite grid."""
    col = (lon - WEST) / (EAST - WEST) * WIDTH
    row = (_merc_y(NORTH) - _merc_y(lat)) / (_merc_y(NORTH) - _merc_y(SOUTH)) * HEIGHT
    return row, col


def km_per_px(lat: float) -> float:
    return (EAST - WEST) / WIDTH * 111.32 * math.cos(math.radians(lat))


def in_coverage(lat: float, lon: float) -> bool:
    return WEST + 0.3 < lon < EAST - 0.3 and SOUTH + 0.2 < lat < NORTH - 0.2


def crop(field: np.ndarray, lat: float, lon: float, size: int = CROP_PX) -> np.ndarray:
    """size x size window centred on home (zero padded at the composite edge)."""
    row, col = lonlat_to_px(lat, lon)
    r0, c0 = int(round(row)) - size // 2, int(round(col)) - size // 2
    out = np.zeros((size, size), dtype=field.dtype)
    rs, cs = max(r0, 0), max(c0, 0)
    re_, ce = min(r0 + size, field.shape[0]), min(c0 + size, field.shape[1])
    if rs < re_ and cs < ce:
        out[rs - r0 : re_ - r0, cs - c0 : ce - c0] = field[rs:re_, cs:ce]
    return out


def downsample_max(field: np.ndarray, factor: int = CZ_FACTOR) -> np.ndarray:
    """Max-pool so small convective cores survive the coarser whole-country view."""
    h, w = field.shape[0] // factor * factor, field.shape[1] // factor * factor
    return field[:h, :w].reshape(h // factor, factor, w // factor, factor).max(axis=(1, 3))


def decode_frame(data: bytes, lat: float, lon: float) -> np.ndarray:
    index, palette = decode_png(data)
    return crop(to_dbz(index, palette), lat, lon)


def decode_scopes(data: bytes, lat: float, lon: float) -> tuple[np.ndarray, np.ndarray]:
    """(crop around home, max-pooled whole composite) from one composite PNG."""
    index, palette = decode_png(data)
    field = to_dbz(index, palette)
    return crop(field, lat, lon), downsample_max(field)


def crop_origin(lat: float, lon: float, size: int = CROP_PX) -> tuple[int, int]:
    """Top-left (row, col) of the home crop in composite pixels (for the bundled basemap)."""
    row, col = lonlat_to_px(lat, lon)
    return int(round(row)) - size // 2, int(round(col)) - size // 2


def decode_fct_tar(
    data: bytes, lat: float, lon: float, cz: list[tuple[int, np.ndarray]] | None = None
) -> list[tuple[int, np.ndarray]]:
    """ČHMÚ extrapolation tar (ft60s10) -> [(lead_min, crop)] sorted by lead.

    When ``cz`` is a list it is filled with the max-pooled whole-composite frames too.
    """
    out = []
    with tarfile.open(fileobj=io.BytesIO(data)) as tar:
        for member in tar.getmembers():
            if not member.isfile() or not member.name.endswith(".png"):
                continue
            try:
                lead = int(member.name.rsplit(".", 2)[-2])
            except ValueError:
                continue
            fh = tar.extractfile(member)
            if fh is not None:
                local, whole = decode_scopes(fh.read(), lat, lon)
                out.append((lead, local))
                if cz is not None:
                    cz.append((lead, whole))
    if cz is not None:
        cz.sort(key=lambda item: item[0])
    return sorted(out, key=lambda item: item[0])


# -- motion + nowcast --------------------------------------------------------------------------
@dataclass
class Motion:
    dy: float  # px per step (down = +)
    dx: float  # px per step (east = +)
    quality: float  # 0..1
    reliable: bool


def _tukey(n: int, alpha: float = 0.3) -> np.ndarray:
    """Flat-top window: tapers only the outer edges, so the centre is not biased."""
    x = np.linspace(0, 1, n)
    w = np.ones(n)
    edge = x < alpha / 2
    w[edge] = 0.5 * (1 + np.cos(2 * np.pi / alpha * (x[edge] - alpha / 2)))
    edge = x > 1 - alpha / 2
    w[edge] = 0.5 * (1 + np.cos(2 * np.pi / alpha * (x[edge] - 1 + alpha / 2)))
    return w


def _phase_shift(a: np.ndarray, b: np.ndarray) -> tuple[float, float, float]:
    """Shift (dy, dx) that maps a onto b, plus a peak-sharpness score."""
    win = np.outer(np.hanning(a.shape[0]), np.hanning(a.shape[1]))
    fa, fb = np.fft.fft2(a * win), np.fft.fft2(b * win)
    cross = fb * np.conj(fa)
    cross /= np.abs(cross) + 1e-9
    corr = np.fft.ifft2(cross).real
    # light smoothing makes the peak robust to class quantisation
    corr = (
        corr
        + np.roll(corr, 1, 0)
        + np.roll(corr, -1, 0)
        + np.roll(corr, 1, 1)
        + np.roll(corr, -1, 1)
    ) / 5
    py, px = np.unravel_index(int(np.argmax(corr)), corr.shape)
    peak = float(corr[py, px])
    h, w = corr.shape

    def sub(c_m: float, c_0: float, c_p: float) -> float:
        den = c_m - 2 * c_0 + c_p
        return 0.0 if abs(den) < 1e-12 else 0.5 * (c_m - c_p) / den

    sy = sub(corr[(py - 1) % h, px], peak, corr[(py + 1) % h, px])
    sx = sub(corr[py, (px - 1) % w], peak, corr[py, (px + 1) % w])
    dy = py + sy if py <= h // 2 else py + sy - h
    dx = px + sx if px <= w // 2 else px + sx - w
    score = peak / (float(np.std(corr)) * 10 + 1e-9)
    return float(dy), float(dx), min(1.0, score)


def _shifted(a: np.ndarray, sy: float, sx: float) -> np.ndarray:
    """Bilinear translation: out(y, x) = a(y - sy, x - sx) (wraps; callers ignore edges)."""
    iy, ix = math.floor(sy), math.floor(sx)
    fy, fx = sy - iy, sx - ix
    base = np.roll(a, (iy, ix), axis=(0, 1))
    down = np.roll(base, 1, axis=0)
    return (
        base * (1 - fy) * (1 - fx)
        + down * fy * (1 - fx)
        + np.roll(base, 1, axis=1) * (1 - fy) * fx
        + np.roll(down, 1, axis=1) * fy * fx
    )


def _refine(a: np.ndarray, b: np.ndarray, dy: float, dx: float) -> tuple[float, float]:
    """Sub-pixel refinement: minimise SSD on a 0.25 px grid around the coarse shift."""
    m = int(abs(dy) + abs(dx)) + 3
    if 2 * m >= min(a.shape) - 8:
        return dy, dx
    inner = (slice(m, -m), slice(m, -m))
    target = b[inner]
    best = (float("inf"), dy, dx)
    cy, cx = round(dy * 4) / 4, round(dx * 4) / 4
    for oy in np.arange(-1.25, 1.26, 0.25):
        for ox in np.arange(-1.25, 1.26, 0.25):
            err = float(((_shifted(a, cy + oy, cx + ox)[inner] - target) ** 2).sum())
            if err < best[0]:
                best = (err, cy + oy, cx + ox)
    return best[1], best[2]


def estimate_motion(frames: list[np.ndarray], min_rain_px: int = 40) -> Motion:
    """Average shift over consecutive pairs of the last 2-3 frames (5-min steps)."""
    shifts = []
    for a, b in zip(frames[-3:-1], frames[-2:], strict=False):
        if int((a >= 12).sum()) < min_rain_px or int((b >= 12).sum()) < min_rain_px:
            continue
        fa = np.clip(a.astype(np.float32) - 8, 0, None)
        fb = np.clip(b.astype(np.float32) - 8, 0, None)
        shifts.append(_phase_shift(fa, fb))
    if not shifts:
        return Motion(0.0, 0.0, 0.0, False)
    dy = float(np.mean([s[0] for s in shifts]))
    dx = float(np.mean([s[1] for s in shifts]))
    # refine over the longest available gap (10 min with 3 frames halves the error)
    gap = 2 if len(frames) >= 3 and len(shifts) == 2 else 1
    fa = np.clip(frames[-1 - gap].astype(np.float32) - 8, 0, None)
    fb = np.clip(frames[-1].astype(np.float32) - 8, 0, None)
    ry, rx = _refine(fa, fb, dy * gap, dx * gap)
    dy, dx = ry / gap, rx / gap
    quality = float(np.mean([s[2] for s in shifts]))
    consistent = (
        len(shifts) == 1
        or math.hypot(shifts[0][0] - shifts[-1][0], shifts[0][1] - shifts[-1][1]) <= 2.0
    )
    if len(shifts) > 1 and not consistent:
        quality *= 0.4
    fast = math.hypot(dy, dx) > 12  # > ~130 km/h: almost certainly a bad match
    reliable = quality >= 0.25 and consistent and not fast
    return Motion(dy, dx, quality, reliable)


def disk_max(field: np.ndarray, cy: float, cx: float, radius_px: float) -> int:
    h, w = field.shape
    y0, y1 = max(int(cy - radius_px) - 1, 0), min(int(cy + radius_px) + 2, h)
    x0, x1 = max(int(cx - radius_px) - 1, 0), min(int(cx + radius_px) + 2, w)
    if y0 >= y1 or x0 >= x1:
        return 0
    yy, xx = np.mgrid[y0:y1, x0:x1]
    mask = (yy - cy) ** 2 + (xx - cx) ** 2 <= radius_px**2
    vals = field[y0:y1, x0:x1][mask]
    return int(vals.max()) if vals.size else 0


def advect_profile(
    field: np.ndarray, motion: Motion, radius_px: float, horizon_min: int = 60
) -> list[tuple[int, int]]:
    """[(lead_min, max dBZ in disk)] for the latest frame advected by the motion vector.

    Semi-Lagrangian backward look-up: what reaches home after t minutes is upstream now.
    """
    c = (field.shape[0] - 1) / 2
    out = []
    for lead in range(0, horizon_min + 1, STEP_MIN):
        k = lead / STEP_MIN
        out.append((lead, disk_max(field, c - motion.dy * k, c - motion.dx * k, radius_px)))
    return out


def fct_profile(fct: list[tuple[int, np.ndarray]], latest: np.ndarray, radius_px: float):
    c = (latest.shape[0] - 1) / 2
    return [(0, disk_max(latest, c, c, radius_px))] + [
        (lead, disk_max(frame, c, c, radius_px)) for lead, frame in fct
    ]


def first(profile: list[tuple[int, int]], pred) -> int | None:
    return next((lead for lead, v in profile if pred(v)), None)


def nowcast(
    frames: list[np.ndarray],
    lat: float,
    *,
    radius_km: float = 3.0,
    rain_dbz: int = 12,
    soon_dbz: int = 18,
    fct: list[tuple[int, np.ndarray]] | None = None,
) -> dict[str, Any]:
    """Radar nowcast for the crop centre (home). ``frames`` oldest -> newest, 5 min apart."""
    if not frames:
        return {"status": "unknown", "eta_min": None, "end_min": None, "confidence": None}
    latest = frames[-1]
    radius_px = max(radius_km / km_per_px(lat), 1.0)
    motion = estimate_motion(frames)
    own = advect_profile(latest, motion, radius_px)
    chmi = fct_profile(fct, latest, radius_px) if fct else None
    now_dbz = own[0][1]
    raining = now_dbz >= rain_dbz
    kmh = math.hypot(motion.dx, motion.dy) * km_per_px(lat) * 60 / STEP_MIN
    # direction the echoes come FROM (meteorological convention, 0 = north)
    from_deg = (math.degrees(math.atan2(-motion.dx, motion.dy)) + 360) % 360

    def eta(profile):
        return first(profile, lambda v: v >= soon_dbz)

    def end(profile):
        return first(profile[1:], lambda v: v < rain_dbz)

    own_eta, own_end = (None, end(own)) if raining else (eta(own), None)
    fct_eta = fct_end = None
    if chmi:
        fct_eta, fct_end = (None, end(chmi)) if raining else (eta(chmi), None)
    # Primary: ČHMÚ extrapolation when present (it uses the full composite), own advection
    # otherwise; agreement between the two raises confidence.
    pick_eta = fct_eta if chmi else own_eta
    pick_end = fct_end if chmi else own_end
    if chmi:
        a, b = (own_end, fct_end) if raining else (own_eta, fct_eta)
        agree = (a is None and b is None) or (a is not None and b is not None and abs(a - b) <= 15)
        confidence = "high" if agree and motion.reliable else "medium" if agree else "low"
    else:
        confidence = (
            "medium"
            if motion.reliable and motion.quality >= 0.5
            else "low"
            if motion.reliable
            else "uncertain"
        )
    if not motion.reliable and not chmi and not raining and own_eta not in (None, 0):
        confidence = "uncertain"
    if not chmi and not motion.reliable and int((latest >= rain_dbz).sum()) < 40:
        # No echoes anywhere in the ~140 km window: "dry" is safe without a motion vector.
        confidence = "medium"
    if raining:
        status = "stopping" if pick_end is not None else "raining"
    elif pick_eta is not None:
        status = "soon"
    else:
        status = "dry"
    peak = max(v for _, v in (chmi or own))
    return {
        "status": status,
        "eta_min": pick_eta,
        "end_min": pick_end,
        "now_dbz": now_dbz,
        "peak_dbz": peak,
        "confidence": confidence,
        "method": "chmi_fct+advection" if chmi else "advection",
        "motion": {
            "speed_kmh": round(kmh) if motion.reliable else None,
            "from_deg": round(from_deg) if motion.reliable and kmh >= 3 else None,
            "quality": round(motion.quality, 2),
            "reliable": motion.reliable,
        },
        "profile": [{"lead_min": lead, "dbz": v} for lead, v in (chmi or own)],
        "radius_km": radius_km,
        "thresholds_dbz": [rain_dbz, soon_dbz],
    }


def dbz_to_mmh(dbz: float) -> float:
    """Marshall-Palmer Z = 200 R^1.6."""
    return round((10 ** (dbz / 10) / 200) ** (1 / 1.6), 1) if dbz > 0 else 0.0


def frame_times(latest: datetime, count: int) -> list[datetime]:
    return [latest - timedelta(minutes=STEP_MIN * i) for i in range(count)][::-1]
