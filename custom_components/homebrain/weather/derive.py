"""Derived quantities: pure functions shared by station and forecast paths."""

from __future__ import annotations

import math
from collections.abc import Sequence
from datetime import datetime
from typing import Any


def dew_point(t: float | None, rh: float | None) -> float | None:
    """Magnus formula (spec §4.2)."""
    if t is None or rh is None or rh <= 0:
        return None
    gamma = math.log(rh / 100) + 17.62 * t / (243.12 + t)
    return round(243.12 * gamma / (17.62 - gamma), 1)


def apparent_temperature(t: float | None, rh: float | None, wind: float | None) -> float | None:
    """Steadman/BoM apparent temperature, wind in m/s."""
    if t is None or rh is None:
        return None
    e = rh / 100 * 6.105 * math.exp(17.27 * t / (237.7 + t))
    return round(t + 0.33 * e - 0.70 * (wind or 0) - 4.0, 1)


G0 = 9.80665  # m/s²
RD = 287.05  # J/(kg·K), dry air
LAPSE = 0.0065  # K/m, standard atmosphere


def msl_pressure(
    p_station: float | None, elevation_m: float | None, t_c: float | None
) -> float | None:
    """Reduce station (absolute) pressure to mean sea level, hypsometric equation.

    p0 = p · exp(g·h / (Rd · T̄)), T̄ = mean temperature of the fictitious air column between
    the station and sea level, from the station temperature and the standard lapse rate
    (T̄ = T + 273.15 + 0.0065·h/2). Dry air (no virtual-temperature term): < 0.3 hPa at 364 m.
    Without a temperature the ISA column (15 °C at sea level) is assumed.
    """
    if p_station is None or elevation_m is None:
        return None
    t_k = (15.0 - LAPSE * elevation_m if t_c is None else t_c) + 273.15
    t_mean = t_k + LAPSE * elevation_m / 2
    return round(p_station * math.exp(G0 * elevation_m / (RD * t_mean)), 1)


def resolve_pressure(
    relative: float | None,
    absolute: float | None,
    elevation_m: float | None,
    t_c: float | None,
    *,
    same_hpa: float,
    msl_min_hpa: float,
    min_elevation_m: float,
) -> dict[str, Any]:
    """Pick the comparable MSL pressure (WEA-016) and explain where it came from.

    - absolute + elevation → hypsometric MSL (``derived``), also when the station sends a
      relative pressure (a constant station offset ignores temperature). A relative reading
      equal to the absolute one has no offset configured at all: flag ``relative_ignored``.
    - relative only, implausibly low for MSL at an elevated station → it *is* the absolute
      pressure (offset 0); reduce it too (``relative_as_absolute``).
    - otherwise the station's own relative pressure (``station``) or nothing.
    """
    out: dict[str, Any] = {
        "msl": None,
        "source": None,
        "absolute": absolute,
        "relative": relative,
        "relative_ignored": False,
        "elevation_m": elevation_m,
    }
    elevated = elevation_m is not None and elevation_m >= min_elevation_m
    if absolute is not None and elevation_m is not None:
        out["msl"] = msl_pressure(absolute, elevation_m, t_c)
        out["source"] = "derived"
        out["relative_ignored"] = relative is not None and abs(relative - absolute) < same_hpa
        return out
    if relative is not None and elevated and relative < msl_min_hpa:
        out["msl"] = msl_pressure(relative, elevation_m, t_c)
        out["source"] = "relative_as_absolute"
        out["relative_ignored"] = True
        return out
    if relative is not None and (absolute is None or abs(relative - absolute) >= same_hpa):
        out["msl"], out["source"] = relative, "station"
    else:
        out["relative_ignored"] = relative is not None
    return out


def pressure_tendency(delta_hpa: float | None) -> dict[str, object] | None:
    """Classify a 3 h pressure change into synoptic classes with an arrow."""
    if delta_hpa is None:
        return None
    size = abs(delta_hpa)
    if size < 0.1:
        cls, arrow = "steady", "→"
    elif size <= 1.5:
        cls, arrow = "slow", "↗" if delta_hpa > 0 else "↘"
    elif size <= 3.5:
        cls, arrow = "moderate", "↗" if delta_hpa > 0 else "↘"
    elif size <= 6:
        cls, arrow = "rapid", "↑" if delta_hpa > 0 else "↓"
    else:
        cls, arrow = "very_rapid", "↑" if delta_hpa > 0 else "↓"
    return {"delta_hpa": round(delta_hpa, 1), "class": cls, "arrow": arrow}


def rain_intensity(mm_h: float | None) -> str | None:
    if mm_h is None:
        return None
    if mm_h < 0.2:
        return "none"
    if mm_h < 2.5:
        return "light"
    if mm_h < 7.6:
        return "moderate"
    if mm_h < 50:
        return "heavy"
    return "violent"


def frost_risk(
    tmin: float | None, cloud: float | None, wind: float | None, td: float | None
) -> str | None:
    """Night frost risk from bias-corrected Tmin (spec §4.2)."""
    if tmin is None:
        return None
    if tmin <= 1:
        return "high"
    calm_clear = (cloud is not None and cloud < 30) and (wind is not None and wind < 2)
    if tmin <= 3 and calm_clear and (td is None or td <= 0):
        return "high"
    if tmin <= 4:
        return "medium"
    return "low"


def trend_per_hour(samples: Sequence[tuple[datetime, float]]) -> float | None:
    """Least-squares slope in units per hour; needs >= 20 min of data."""
    if len(samples) < 5:
        return None
    t0 = samples[0][0]
    xs = [(t - t0).total_seconds() / 3600 for t, _ in samples]
    if xs[-1] - xs[0] < 1 / 3:
        return None
    ys = [v for _, v in samples]
    mx, my = sum(xs) / len(xs), sum(ys) / len(ys)
    den = sum((x - mx) ** 2 for x in xs)
    if den == 0:
        return None
    return round(sum((x - mx) * (y - my) for x, y in zip(xs, ys, strict=True)) / den, 2)


def condition(
    t2m: float | None,
    cloud: float | None,
    precip: float | None,
    wmo_codes: Sequence[int] = (),
) -> str:
    """Condition derived from blended values, not by voting on icons (spec §4.4)."""
    codes = [code for code in wmo_codes if code is not None]
    if codes and sum(code >= 95 for code in codes) / len(codes) > 0.3:
        return "thunder"
    if precip is not None and precip >= 0.1:
        if t2m is not None and t2m <= 0.5:
            return "snow"
        return "heavy_rain" if precip >= 2.5 else "rain"
    if codes and sum(code in (45, 48) for code in codes) / len(codes) > 0.5:
        return "fog"
    if cloud is None:
        return "unknown"
    if cloud < 20:
        return "clear"
    if cloud < 60:
        return "partly"
    if cloud < 90:
        return "cloudy"
    return "overcast"
