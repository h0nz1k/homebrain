"""Owner's agent-monitoring template sensors → Agents snapshot (read-only, no service calls).

Only ``agents_status`` is bound (``sensor.<prefix>_stav``); every other entity is a sibling
with the same prefix, found by its suffix (contract: docs/requirements/agents.md). All
siblings are optional; an unavailable one marks its section ``available: false``.
"""

from __future__ import annotations

import re
from collections.abc import Mapping
from datetime import datetime
from typing import Any, Final

from homeassistant.core import HomeAssistant, State

from ..bindings import get_bindings
from ..const import DOMAIN
from . import rules

STATUS_SUFFIX: Final = "_stav"
QUEUE_KEYS: Final = ("pending", "running", "blocked", "review")
_MISSING: Final = {"unavailable", "unknown", "", None}
_QUOTA: Final = re.compile(r"_kvota_([a-z0-9_]+)_zbyva$")
_SERVICE: Final = re.compile(r"_sluzba_([a-z0-9_]+)$")
# „Agenti – HumanAgentWiki“: the shared head before the dash is dropped for display.
_NAME_SPLIT: Final = re.compile(r"\s+[–—-]\s+")


def _entry(hass: HomeAssistant):
    entries = hass.config_entries.async_entries(DOMAIN)
    return entries[0] if entries else None


def status_entity(hass: HomeAssistant) -> str | None:
    entry = _entry(hass)
    if entry is None:
        return None
    return get_bindings(entry).get("agents", {}).get(rules.BINDING_KEY)


def prefix_of(entity_id: str) -> str | None:
    """``sensor.<prefix>_stav`` → ``<prefix>``; any other id has no siblings."""
    object_id = entity_id.split(".", 1)[-1]
    if not object_id.endswith(STATUS_SUFFIX) or object_id == STATUS_SUFFIX:
        return None
    return object_id.removesuffix(STATUS_SUFFIX)


def monitor_url(options: Mapping[str, Any]) -> str | None:
    raw = (options.get(rules.OPTION) or {}).get(rules.MONITOR_URL)
    if isinstance(raw, str) and raw.strip().startswith(("http://", "https://")):
        return raw.strip()
    return None


def _ok(state: State | None) -> bool:
    return state is not None and state.state not in _MISSING


def _float(value: Any) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if number == number else None  # NaN


def _int(value: Any) -> int | None:
    number = _float(value)
    return None if number is None else int(round(number))


def _bool(value: Any) -> bool:
    if isinstance(value, str):
        return value.strip().lower() in ("true", "on", "1", "yes")
    return bool(value)


def _iso(value: Any) -> str | None:
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, str) and value.strip() and value not in _MISSING:
        return value.strip()
    return None


def _str_list(value: Any) -> list[str]:
    if isinstance(value, str):
        return [value] if value.strip() else []
    if isinstance(value, (list, tuple)):
        return [str(v) for v in value if v is not None and str(v).strip()]
    return []


def _siblings(
    hass: HomeAssistant, domain: str, prefix: str, pattern: re.Pattern
) -> list[tuple[State, str]]:
    """``(state, id)`` of every ``<domain>.<prefix>…`` entity whose rest matches ``pattern``."""
    head = f"{domain}.{prefix}"
    out = []
    for entity_id in sorted(hass.states.async_entity_ids(domain)):
        if not entity_id.startswith(head):
            continue
        if (m := pattern.match(entity_id[len(head) :])) and (state := hass.states.get(entity_id)):
            out.append((state, m.group(1)))
    return out


def _status(state: State | None) -> dict[str, Any]:
    if not _ok(state):
        return {"available": False, "level": "unknown", "critical": None, "attention": None}
    attrs = state.attributes
    raw = state.state if state.state in ("ok", "attention", "critical") else "unknown"
    return {
        "available": True,
        "level": raw,
        "critical": _int(attrs.get("critical_count")),
        "attention": _int(attrs.get("attention_count")),
        "stale": _bool(attrs.get("stale")) if "stale" in attrs else None,
    }


def _data(fresh: State | None, status: State | None, status_info: dict) -> dict[str, Any]:
    if _ok(fresh) and fresh.state in ("on", "off"):
        if fresh.state == "off":
            return {"current": False, "since": fresh.last_changed.isoformat()}
        updated = status.last_updated.isoformat() if _ok(status) else None
        return {"current": True, "since": updated}
    # No freshness sensor: the status' own `stale` flag is the fallback.
    if status_info.get("stale") is not None:
        current = not status_info["stale"]
        return {"current": current, "since": None}
    return {"current": None, "since": None}


def _quota(state: State, quota_id: str) -> dict[str, Any]:
    attrs = state.attributes if _ok(state) else {}
    raw_window = attrs.get("okno")
    quota = {
        "id": quota_id,
        "available": _ok(state),
        "provider": attrs.get("provider") if isinstance(attrs.get("provider"), str) else None,
        "window": raw_window if isinstance(raw_window, str) else None,
        "window_label": rules.window_label(raw_window),
        "remaining_pct": _float(state.state) if _ok(state) else None,
        "used_pct": _float(attrs.get("used_pct")),
        "reset_at": _iso(attrs.get("reset_at")),
        "exhausted": _bool(attrs.get("exhausted")),
        "exhaust_before_reset": _bool(attrs.get("will_exhaust_before_reset")),
    }
    quota["level"] = rules.quota_level(quota) if quota["available"] else "unknown"
    return quota


def _display_names(names: list[str]) -> list[str]:
    """Drop a head shared by all names („Agenti – X“, „Agenti – Y“ → „X“, „Y“)."""
    parts = [_NAME_SPLIT.split(n, maxsplit=1) for n in names]
    heads = {p[0] for p in parts if len(p) == 2}
    if len(heads) == 1 and all(len(p) == 2 for p in parts):
        return [p[1] for p in parts]
    return names


def _services(found: list[tuple[State, str]]) -> list[dict[str, Any]]:
    states = [state for state, _ in found]
    ids = [service_id for _, service_id in found]
    raw_names = [str(s.attributes.get("friendly_name") or "") for s in states]
    names = _display_names([n or i for n, i in zip(raw_names, ids, strict=True)])
    out = []
    for state, service_id, name in zip(states, ids, names, strict=True):
        available = _ok(state) and state.state in ("on", "off")
        stav = state.attributes.get("stav")
        service = {
            "id": service_id,
            "name": name,
            "available": available,
            "up": (state.state == "on") if available else None,
            "state": stav if isinstance(stav, str) else None,
            "sla_24h": _float(state.attributes.get("sla_24h")),
        }
        service["level"] = rules.service_level(service)
        out.append(service)
    return out


def _agents(active: State | None, waiting: State | None) -> dict[str, Any]:
    names = _str_list(waiting.attributes.get("kdo")) if _ok(waiting) else []
    items = []
    if _ok(active):
        for raw in active.attributes.get("agenti") or []:
            if not isinstance(raw, Mapping) or not raw.get("name"):
                continue
            name = str(raw["name"])
            items.append(
                {
                    "name": name,
                    "model": str(raw["model_label"]) if raw.get("model_label") else None,
                    "alive": _bool(raw.get("alive")),
                    "waiting": _bool(raw.get("waiting")) or name in names,
                }
            )
    return {
        "available": _ok(active),
        "active": _int(active.state) if _ok(active) else None,
        "total": _int(active.attributes.get("celkem")) if _ok(active) else None,
        "waiting": _int(waiting.state) if _ok(waiting) else None,
        "waiting_names": names,
        "items": items,
    }


def empty_snapshot(configured: bool) -> dict[str, Any]:
    return {
        "configured": configured,
        "status": {"available": False, "level": "unknown", "critical": None, "attention": None},
        "data": {"current": None, "since": None},
        "quotas": [],
        "exhaust_forecast": {"available": False, "active": None, "items": []},
        "agents": {
            "available": False,
            "active": None,
            "total": None,
            "waiting": None,
            "waiting_names": [],
            "items": [],
        },
        "services": [],
        "queue": {"available": False, **dict.fromkeys(QUEUE_KEYS)},
        "monitor_url": None,
        "last_alert": None,
        "verdict": {"level": "unknown", "reasons": []},
    }


def build_snapshot(hass: HomeAssistant) -> dict[str, Any]:
    """The whole Agents view from HA states (sync, in-memory only)."""
    entry = _entry(hass)
    status_id = status_entity(hass)
    if status_id is None:
        snap = empty_snapshot(False)
        snap["monitor_url"] = monitor_url(entry.options) if entry else None
        return snap
    snap = empty_snapshot(True)
    snap["monitor_url"] = monitor_url(entry.options) if entry else None
    status = hass.states.get(status_id)
    snap["status"] = _status(status)
    prefix = prefix_of(status_id)
    if prefix is None:
        snap["data"] = _data(None, status, snap["status"])
        snap["verdict"] = rules.verdict(snap)
        return snap

    def get(domain: str, suffix: str) -> State | None:
        return hass.states.get(f"{domain}.{prefix}_{suffix}")

    snap["data"] = _data(get("binary_sensor", "data_aktualni"), status, snap["status"])
    quotas = [_quota(state, qid) for state, qid in _siblings(hass, "sensor", prefix, _QUOTA)]
    quotas.sort(
        key=lambda q: (
            rules.level_sort_key(q["level"]),
            q["remaining_pct"] if q["remaining_pct"] is not None else 101,
            q["id"],
        )
    )
    snap["quotas"] = quotas
    forecast = get("binary_sensor", "kvota_dojde_pred_resetem")
    if _ok(forecast) and forecast.state in ("on", "off"):
        snap["exhaust_forecast"] = {
            "available": True,
            "active": forecast.state == "on",
            "items": _str_list(forecast.attributes.get("kvoty")),
        }
    snap["agents"] = _agents(get("sensor", "agenti_aktivni"), get("sensor", "agenti_cekaji"))
    services = _services(_siblings(hass, "binary_sensor", prefix, _SERVICE))
    services.sort(key=lambda s: (rules.level_sort_key(s["level"]), s["name"].casefold()))
    snap["services"] = services
    queue: dict[str, Any] = {}
    for key in QUEUE_KEYS:
        state = get("sensor", f"fronta_{key}")
        queue[key] = _int(state.state) if _ok(state) else None
    queue["available"] = any(queue[k] is not None for k in QUEUE_KEYS)
    snap["queue"] = queue
    alert = get("sensor", "posledni_upozorneni")
    snap["last_alert"] = alert.state if _ok(alert) else None
    snap["verdict"] = rules.verdict(snap)
    return snap
