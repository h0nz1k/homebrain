"""Unit conversion to SI (°C, m/s, hPa, mm, mm/h) from HA unit_of_measurement."""

from __future__ import annotations

from typing import Any


def _num(value: Any) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if number == number else None  # NaN guard


def to_celsius(value: Any, unit: str | None) -> float | None:
    v = _num(value)
    if v is None:
        return None
    return round((v - 32) * 5 / 9, 2) if unit in ("°F", "F") else v


def to_ms(value: Any, unit: str | None) -> float | None:
    v = _num(value)
    if v is None:
        return None
    factor = {"km/h": 1 / 3.6, "mph": 0.44704, "kn": 0.514444, "ft/s": 0.3048}.get(unit or "m/s", 1)
    return round(v * factor, 2)


def to_hpa(value: Any, unit: str | None) -> float | None:
    v = _num(value)
    if v is None:
        return None
    factor = {"inHg": 33.8639, "mmHg": 1.33322, "kPa": 10, "Pa": 0.01, "psi": 68.9476}.get(
        unit or "hPa", 1
    )
    return round(v * factor, 1)


def to_mm(value: Any, unit: str | None) -> float | None:
    v = _num(value)
    if v is None:
        return None
    base = (unit or "mm").split("/")[0]
    return round(v * (25.4 if base == "in" else 10 if base == "cm" else 1), 2)


def convert(value: Any, unit: str | None, kind: str) -> float | None:
    if kind == "temp":
        return to_celsius(value, unit)
    if kind == "speed":
        return to_ms(value, unit)
    if kind == "pressure":
        return to_hpa(value, unit)
    if kind in ("precip", "rate"):
        return to_mm(value, unit)
    return _num(value)
