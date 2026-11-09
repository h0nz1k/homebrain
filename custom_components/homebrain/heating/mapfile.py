"""Private heating variable map (YAML, never in the repo).

``/config/homebrain/heating_map.yaml`` maps contract keys (``keys.KEYS``) to PLC page +
variable. ``var`` is either an address (``X264``, ``R6509.3`` – any name format on the
page matches) or a full WebMaker name (``__X264_REAL_04.1f``). Optional per key:
``invert`` (bool flags with 0 = active) and ``scale`` (multiplier). Unknown keys are
ignored with a warning, so a newer map keeps working with an older HomeBrain.
See ``docs/modules/heating-map.example.yaml``.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import yaml

from .keys import KEYS

_LOGGER = logging.getLogger(__name__)


class MapError(ValueError):
    """The file is not a usable map at all (wrong structure / invalid YAML)."""


@dataclass(frozen=True)
class VarSpec:
    page: int
    var: str
    invert: bool = False
    scale: float | None = None


@dataclass(frozen=True)
class FaultSpec:
    key: str
    label: str
    var: VarSpec


@dataclass(frozen=True)
class ScheduleSpec:
    key: str
    label: str
    page: int
    slots: tuple[tuple[str, str], ...] = ()
    days: dict[int, tuple[tuple[str, str], ...]] = field(default_factory=dict)


@dataclass
class HeatingMap:
    keys: dict[str, VarSpec] = field(default_factory=dict)
    faults: list[FaultSpec] = field(default_factory=list)
    schedules: list[ScheduleSpec] = field(default_factory=list)
    pages: dict[int, int] = field(default_factory=dict)  # page -> poll interval (s)
    ucid: dict[int, str] = field(default_factory=dict)
    kwh_per_run_hour: float | None = None
    warnings: list[str] = field(default_factory=list)

    def needed_pages(self) -> set[int]:
        pages = {spec.page for spec in self.keys.values()}
        pages |= {fault.var.page for fault in self.faults}
        pages |= {sched.page for sched in self.schedules}
        return pages


def _var(raw: Any, where: str) -> VarSpec:
    if not isinstance(raw, dict):
        raise ValueError(f"{where}: expected a mapping")
    page, var = raw.get("page"), raw.get("var")
    if isinstance(page, bool) or not isinstance(page, int) or page < 0:
        raise ValueError(f"{where}: 'page' must be a page number")
    if not isinstance(var, str) or not var.strip():
        raise ValueError(f"{where}: 'var' is required")
    scale = raw.get("scale")
    if scale is not None and (isinstance(scale, bool) or not isinstance(scale, int | float)):
        raise ValueError(f"{where}: 'scale' must be a number")
    return VarSpec(page, var.strip(), bool(raw.get("invert", False)), scale)


def _slots(raw: Any, where: str) -> tuple[tuple[str, str], ...]:
    if not isinstance(raw, list):
        raise ValueError(f"{where}: expected a list of [on, off] pairs")
    out = []
    for pair in raw:
        if not (
            isinstance(pair, list) and len(pair) == 2 and all(isinstance(v, str) for v in pair)
        ):
            raise ValueError(f"{where}: expected [on_var, off_var]")
        out.append((pair[0], pair[1]))
    return tuple(out)


def _int_map(raw: Any, name: str, warnings: list[str]) -> dict[int, Any]:
    if raw is None:
        return {}
    if not isinstance(raw, dict):
        warnings.append(f"'{name}' ignored: expected a mapping")
        return {}
    out = {}
    for page, value in raw.items():
        try:
            out[int(page)] = value
        except (TypeError, ValueError):
            warnings.append(f"'{name}.{page}' ignored: not a page number")
    return out


def parse_map(text: str) -> HeatingMap:
    """Validate a map; structural problems raise :class:`MapError`, bad entries only warn."""
    try:
        raw = yaml.safe_load(text) or {}
    except yaml.YAMLError as err:
        raise MapError(f"invalid YAML: {type(err).__name__}") from None
    if not isinstance(raw, dict):
        raise MapError("the map must be a mapping")
    keys = raw.get("keys") or {}
    if not isinstance(keys, dict):
        raise MapError("'keys' must be a mapping")
    hmap = HeatingMap()
    warn = hmap.warnings
    for key, value in keys.items():
        if key not in KEYS:
            warn.append(f"unknown key '{key}' ignored")
            continue
        try:
            hmap.keys[key] = _var(value, f"keys.{key}")
        except ValueError as err:
            warn.append(str(err))
    for i, item in enumerate(raw.get("faults") or []):
        try:
            if not isinstance(item, dict) or not isinstance(item.get("key"), str):
                raise ValueError(f"faults[{i}]: 'key' is required")
            hmap.faults.append(
                FaultSpec(
                    item["key"], str(item.get("label") or item["key"]), _var(item, f"faults[{i}]")
                )
            )
        except ValueError as err:
            warn.append(str(err))
    for i, item in enumerate(raw.get("schedules") or []):
        try:
            if not isinstance(item, dict) or not isinstance(item.get("key"), str):
                raise ValueError(f"schedules[{i}]: 'key' is required")
            page = item.get("page")
            if isinstance(page, bool) or not isinstance(page, int):
                raise ValueError(f"schedules[{i}]: 'page' must be a page number")
            days = {
                int(day): _slots(slots, f"schedules[{i}].days.{day}")
                for day, slots in (item.get("days") or {}).items()
            }
            hmap.schedules.append(
                ScheduleSpec(
                    item["key"],
                    str(item.get("label") or item["key"]),
                    page,
                    _slots(item.get("slots") or [], f"schedules[{i}].slots"),
                    days,
                )
            )
        except (ValueError, TypeError) as err:
            warn.append(str(err))
    for page, seconds in _int_map(raw.get("pages"), "pages", warn).items():
        if isinstance(seconds, int) and not isinstance(seconds, bool) and seconds >= 15:
            hmap.pages[page] = seconds
        else:
            warn.append(f"'pages.{page}' ignored: interval must be ≥ 15 s")
    hmap.ucid = {page: str(v) for page, v in _int_map(raw.get("ucid"), "ucid", warn).items()}
    kwh = raw.get("kwh_per_run_hour")
    if isinstance(kwh, int | float) and not isinstance(kwh, bool) and kwh > 0:
        hmap.kwh_per_run_hour = float(kwh)
    return hmap


def load_map_file(path: str) -> HeatingMap | None:
    """Blocking: read + parse (run in the executor). ``None`` when the file is missing."""
    file = Path(path)
    if not file.is_file():
        return None
    hmap = parse_map(file.read_text(encoding="utf-8"))
    for warning in hmap.warnings:
        _LOGGER.warning("Topení map: %s", warning)
    return hmap
