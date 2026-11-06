"""Roboti: per-robot default cleaning setup + named presets, and „apply, then start“.

Storage: one versioned ``homeassistant.helpers.storage.Store``
(``.storage/homebrain.robot_presets``)::

    {"robots": {"<slot>": {"defaults": Settings | None, "presets": [Preset, ...]}}}

Settings = ``{mode, fan, water, route, passes}`` (every field optional except passes);
Preset = Settings + ``{id, name, rooms}``. Preset ids are stable random hex strings, so
later features (schedules) can reference a preset by id and survive renames.

Start applies the effective settings (defaults ← preset ← explicit) through select /
vacuum services on the robot's OWN bound entities only, waits until HA reports each new
value (short timeout, avoids starting with the old suction/water), then starts:
``vacuum.send_command app_segment_clean [{segments, repeat}]`` for rooms, else
``vacuum.start``. Options a model does not expose are skipped and reported back.
"""

from __future__ import annotations

import asyncio
import logging
import re
import uuid
from collections.abc import Callable, Mapping
from typing import Any, Final

from homeassistant.core import HomeAssistant, State
from homeassistant.helpers.storage import Store

from ..const import DOMAIN
from .config import ROBOT_SLOTS, clean_text

_LOGGER = logging.getLogger(__name__)

STORAGE_KEY: Final = f"{DOMAIN}.robot_presets"
STORAGE_VERSION: Final = 1
STORAGE_MINOR_VERSION: Final = 1
MAX_PRESETS: Final = 12
MAX_ROOMS: Final = 64
MAX_PASSES: Final = 3
VERIFY_TIMEOUT: Final = 6.0
VERIFY_STEP: Final = 0.25

MODES: Final = ("vacuum", "mop", "both")
# Roborock ``select.*_cleaning_mode`` options per HomeBrain mode.
MODE_OPTION: Final = {"vacuum": "vacuum", "mop": "mop", "both": "vac_and_mop"}
# Never applied from a preset: app-only modes the integration cannot configure, and
# „suction off“ / „no water“ (vacuum-only and mop-only are chosen through the mode).
BLOCKED_OPTIONS: Final = frozenset({"custom", "custom_water_flow", "off"})
SETTING_KEYS: Final = ("mode", "fan", "water", "route", "passes")
_OPTION_RE: Final = re.compile(r"^[a-z0-9_]{1,32}$")

# Every service the start command may call; targets are the slot's bound entities only.
ALLOWED_SERVICES: Final = frozenset(
    {
        ("select", "select_option"),
        ("vacuum", "set_fan_speed"),
        ("vacuum", "send_command"),
        ("vacuum", "start"),
    }
)


class PresetError(Exception):
    """Validation / apply failure with a WS error code."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


# --- validation -------------------------------------------------------------------------


def _option(value: Any) -> str | None:
    return value if isinstance(value, str) and _OPTION_RE.match(value) else None


def clean_settings(raw: Any) -> dict[str, Any]:
    """Validated settings; unknown/invalid values become ``None`` (= keep robot as is)."""
    raw = raw if isinstance(raw, Mapping) else {}
    mode = raw.get("mode")
    passes = raw.get("passes", 1)
    if isinstance(passes, bool) or not isinstance(passes, int):
        passes = 1
    return {
        "mode": mode if mode in MODES else None,
        "fan": _option(raw.get("fan")),
        "water": _option(raw.get("water")),
        "route": _option(raw.get("route")),
        "passes": min(MAX_PASSES, max(1, passes)),
    }


def clean_rooms(raw: Any) -> list[int]:
    """Ordered, de-duplicated segment ids (non-negative ints)."""
    rooms: list[int] = []
    for item in raw if isinstance(raw, list) else []:
        if isinstance(item, bool) or not isinstance(item, int) or item < 0 or item in rooms:
            continue
        rooms.append(item)
    return rooms[:MAX_ROOMS]


def clean_preset(raw: Any) -> dict[str, Any] | None:
    """A stored preset or ``None`` when it has no usable id/name."""
    if not isinstance(raw, Mapping):
        return None
    preset_id = raw.get("id")
    name = clean_text(raw.get("name"))
    if not isinstance(preset_id, str) or not re.match(r"^[a-f0-9]{8,32}$", preset_id) or not name:
        return None
    return {
        "id": preset_id,
        "name": name,
        "rooms": clean_rooms(raw.get("rooms")),
        **clean_settings(raw),
    }


def normalize_data(data: Any) -> dict[str, Any]:
    """Drop anything malformed (hand-edited file, older layout) instead of failing setup."""
    robots_raw = data.get("robots") if isinstance(data, Mapping) else None
    robots: dict[str, Any] = {}
    for slot in ROBOT_SLOTS:
        entry = robots_raw.get(str(slot)) if isinstance(robots_raw, Mapping) else None
        if not isinstance(entry, Mapping):
            continue
        defaults = entry.get("defaults")
        presets: list[dict[str, Any]] = []
        raw_presets = entry.get("presets")
        for item in raw_presets if isinstance(raw_presets, list) else []:
            preset = clean_preset(item)
            if preset and all(p["id"] != preset["id"] for p in presets):
                presets.append(preset)
        robots[str(slot)] = {
            "defaults": clean_settings(defaults) if isinstance(defaults, Mapping) else None,
            "presets": presets[:MAX_PRESETS],
        }
    return {"robots": robots}


def migrate_data(old_major: int, old_minor: int, data: Any) -> dict[str, Any]:
    """Storage migration hook: add a branch per future version, then normalise."""
    if old_major > STORAGE_VERSION:
        raise NotImplementedError(f"robot presets storage v{old_major} is newer than supported")
    # v1.0 → v1.1: same layout; normalisation fills missing keys (``passes`` etc.).
    return normalize_data(data)


class _VersionedStore(Store[dict[str, Any]]):
    async def _async_migrate_func(
        self, old_major_version: int, old_minor_version: int, old_data: Any
    ) -> dict[str, Any]:
        return migrate_data(old_major_version, old_minor_version, old_data)


class PresetStore:
    """Defaults + presets per robot slot, persisted in HA storage."""

    def __init__(self, hass: HomeAssistant) -> None:
        self._store = _VersionedStore(
            hass, STORAGE_VERSION, STORAGE_KEY, minor_version=STORAGE_MINOR_VERSION
        )
        self._data: dict[str, Any] | None = None
        self._lock = asyncio.Lock()

    async def _async_data(self) -> dict[str, Any]:
        if self._data is None:
            self._data = normalize_data(await self._store.async_load() or {})
        return self._data

    def _robot(self, data: dict[str, Any], slot: int) -> dict[str, Any]:
        return data["robots"].setdefault(str(slot), {"defaults": None, "presets": []})

    async def async_list(self) -> dict[str, Any]:
        data = await self._async_data()
        return {
            slot: {"defaults": value["defaults"], "presets": list(value["presets"])}
            for slot, value in data["robots"].items()
        }

    async def async_get_defaults(self, slot: int) -> dict[str, Any] | None:
        data = await self._async_data()
        return data["robots"].get(str(slot), {}).get("defaults")

    async def async_set_defaults(self, slot: int, raw: Any) -> dict[str, Any] | None:
        async with self._lock:
            data = await self._async_data()
            defaults = clean_settings(raw) if raw is not None else None
            self._robot(data, slot)["defaults"] = defaults
            await self._store.async_save(data)
            return defaults

    async def async_get_preset(self, slot: int, preset_id: str) -> dict[str, Any] | None:
        data = await self._async_data()
        presets = data["robots"].get(str(slot), {}).get("presets", [])
        return next((p for p in presets if p["id"] == preset_id), None)

    async def async_save_preset(self, slot: int, raw: Mapping[str, Any]) -> dict[str, Any]:
        async with self._lock:
            data = await self._async_data()
            robot = self._robot(data, slot)
            preset_id = raw.get("id") or uuid.uuid4().hex[:12]
            preset = clean_preset({**raw, "id": preset_id})
            if preset is None:
                raise PresetError("invalid_format", "Preset needs a name")
            others = [p for p in robot["presets"] if p["id"] != preset_id]
            if raw.get("id") and len(others) == len(robot["presets"]):
                raise PresetError("not_found", "Preset not found")
            if any(p["name"].casefold() == preset["name"].casefold() for p in others):
                raise PresetError("duplicate_name", "A preset with this name exists")
            if len(others) >= MAX_PRESETS:
                raise PresetError("too_many", f"At most {MAX_PRESETS} presets per robot")
            index = next((i for i, p in enumerate(robot["presets"]) if p["id"] == preset_id), None)
            if index is None:
                robot["presets"].append(preset)
            else:
                robot["presets"][index] = preset
            await self._store.async_save(data)
            return preset

    async def async_delete_preset(self, slot: int, preset_id: str) -> bool:
        async with self._lock:
            data = await self._async_data()
            robot = self._robot(data, slot)
            kept = [p for p in robot["presets"] if p["id"] != preset_id]
            if len(kept) == len(robot["presets"]):
                return False
            robot["presets"] = kept
            await self._store.async_save(data)
            return True


# --- apply + start ----------------------------------------------------------------------


def effective_settings(*layers: Mapping[str, Any] | None) -> dict[str, Any]:
    """Later layers override earlier ones; ``None`` fields never override."""
    result: dict[str, Any] = {key: None for key in SETTING_KEYS}
    result["passes"] = 1
    for layer in layers:
        for key in SETTING_KEYS:
            if layer and layer.get(key) is not None:
                result[key] = layer[key]
    return result


def _options(state: State | None, attr: str = "options") -> list[str]:
    value = state.attributes.get(attr) if state else None
    return [v for v in value if isinstance(v, str)] if isinstance(value, list) else []


def build_plan(
    bindings: Mapping[str, str],
    slot: int,
    get_state: Callable[[str], State | None],
    settings: Mapping[str, Any],
    rooms: list[int],
) -> tuple[list[dict[str, Any]], list[str]]:
    """Service steps in apply order (mode → suction → water → route → start) + skipped fields.

    A step only appears when the value differs from the robot's current one. Each step
    carries ``verify = (entity, attribute|None, value)`` used to wait for HA's new state.
    """
    vacuum = bindings.get(f"robot{slot}_vacuum")
    if not vacuum:
        raise PresetError("not_found", "Robot is not configured")
    steps: list[dict[str, Any]] = []
    skipped: list[str] = []

    def select_step(field: str, suffix: str, option: str | None) -> None:
        if option is None:
            return
        entity = bindings.get(f"robot{slot}_{suffix}")
        state = get_state(entity) if entity else None
        if not entity or option in BLOCKED_OPTIONS or option not in _options(state):
            skipped.append(field)
            return
        if state is not None and state.state != option:
            steps.append(
                {
                    "domain": "select",
                    "service": "select_option",
                    "entity_id": entity,
                    "data": {"option": option},
                    "field": field,
                    "verify": (entity, None, option),
                }
            )

    mode = settings.get("mode")
    select_step("mode", "cleaning_mode", MODE_OPTION[mode] if mode else None)
    mode_entity = bindings.get(f"robot{slot}_cleaning_mode")
    mode_state = get_state(mode_entity) if mode_entity else None
    current_mode = next(
        (m for m, o in MODE_OPTION.items() if mode_state and mode_state.state == o), None
    )
    run_mode = mode if mode and "mode" not in skipped else current_mode
    fan = settings.get("fan")
    if fan is not None:
        vac_state = get_state(vacuum)
        if run_mode == "mop":
            pass  # mop-only run: suction is irrelevant (robot lifts / turns the fan off itself)
        elif fan in BLOCKED_OPTIONS or fan not in _options(vac_state, "fan_speed_list"):
            skipped.append("fan")
        elif vac_state is not None and vac_state.attributes.get("fan_speed") != fan:
            steps.append(
                {
                    "domain": "vacuum",
                    "service": "set_fan_speed",
                    "entity_id": vacuum,
                    "data": {"fan_speed": fan},
                    "field": "fan",
                    "verify": (vacuum, "fan_speed", fan),
                }
            )
    # Water and mop route only matter when the run mops (unknown current mode = apply).
    if run_mode in ("mop", "both", None):
        select_step("water", "mop_intensity", settings.get("water"))
        select_step("route", "mop_mode", settings.get("route"))
    passes = int(settings.get("passes") or 1)
    if rooms:
        steps.append(
            {
                "domain": "vacuum",
                "service": "send_command",
                "entity_id": vacuum,
                "data": {
                    "command": "app_segment_clean",
                    "params": [{"segments": list(rooms), "repeat": passes}],
                },
                "field": "start",
                "verify": None,
            }
        )
    else:
        if passes > 1:
            skipped.append("passes")  # whole-home start has no repeat parameter
        steps.append(
            {
                "domain": "vacuum",
                "service": "start",
                "entity_id": vacuum,
                "data": {},
                "field": "start",
                "verify": None,
            }
        )
    return steps, skipped


def check_allowlist(steps: list[dict[str, Any]], bindings: Mapping[str, str], slot: int) -> None:
    """Refuse any service or target outside the robot's own bound entities."""
    own = {
        bindings.get(f"robot{slot}_{suffix}")
        for suffix in ("vacuum", "cleaning_mode", "mop_intensity", "mop_mode")
    } - {None}
    for step in steps:
        service = (step["domain"], step["service"])
        if service not in ALLOWED_SERVICES or step["entity_id"] not in own:
            raise PresetError("not_allowed", f"{step['domain']}.{step['service']} not allowed")


def _reached(hass: HomeAssistant, verify: tuple[str, str | None, Any]) -> bool:
    entity, attr, value = verify
    state = hass.states.get(entity)
    if state is None:
        return False
    return (state.attributes.get(attr) if attr else state.state) == value


async def async_apply_and_start(
    hass: HomeAssistant,
    bindings: Mapping[str, str],
    slot: int,
    settings: Mapping[str, Any],
    rooms: list[int],
    verify_timeout: float | None = None,
) -> dict[str, Any]:
    """Apply settings, wait for each new value, then start. Raises :class:`PresetError`."""
    vacuum = bindings.get(f"robot{slot}_vacuum")
    state = hass.states.get(vacuum) if vacuum else None
    if state is None or state.state in ("unavailable", "unknown"):
        raise PresetError("unavailable", "Robot is unavailable")
    steps, skipped = build_plan(bindings, slot, hass.states.get, settings, rooms)
    check_allowlist(steps, bindings, slot)
    timeout = VERIFY_TIMEOUT if verify_timeout is None else verify_timeout
    applied: list[str] = []
    unconfirmed: list[str] = []
    for step in steps:
        await hass.services.async_call(
            step["domain"],
            step["service"],
            step["data"],
            target={"entity_id": step["entity_id"]},
            blocking=True,
        )
        if step["verify"]:
            loop = asyncio.get_running_loop()
            deadline = loop.time() + timeout
            while not _reached(hass, step["verify"]):
                if loop.time() >= deadline:
                    current = hass.states.get(step["verify"][0])
                    if (
                        current is not None
                        and step["verify"][1] is None
                        and current.state
                        in (
                            "unknown",
                            "unavailable",
                        )
                    ):
                        # Some models never report this select (state stays unknown):
                        # the command was accepted, nothing contradicts it → go on.
                        unconfirmed.append(step["field"])
                        break
                    raise PresetError(
                        "apply_timeout", f"Robot did not confirm {step['field']} in time"
                    )
                await asyncio.sleep(VERIFY_STEP)
        applied.append(step["field"])
    return {"started": True, "applied": applied, "skipped": skipped, "unconfirmed": unconfirmed}
