"""WebSocket API of Hlídání domu (``homebrain/anomaly/*``).

* ``list`` – owner (HA admin) and adults: every open report with entities, timelines and the
  watched devices;
* ``summary`` – what the Dnes card needs (titles, tiers, times); the kitchen kiosk receives no
  entity or device ids, while owners and adults also receive excluded device details;
* ``ack`` / ``mute`` / ``unmute`` – owner and adults; they change only HomeBrain's own Store.
* ``exclude`` / ``include`` – HA admins only; permanently change which devices HomeBrain watches.
  Nothing here calls a Home Assistant service or sends a notification (phase 1).
"""

from __future__ import annotations

import hashlib
import time
from collections.abc import Callable
from datetime import datetime, timedelta
from functools import wraps
from typing import Any, Final

import voluptuous as vol
from homeassistant.components import websocket_api
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, callback
from homeassistant.exceptions import Unauthorized
from homeassistant.helpers.start import async_at_started
from homeassistant.util import dt as dt_util

from ..const import DOMAIN
from ..roles import ANOMALY_ROLES, ANOMALY_SUMMARY_ROLES, entry_roles, resolve_role
from .manager import ACK_OK, ACK_RESOLVED, AnomalyWatch, get_watch
from .model import TIER_KEYS, Finding, Report

KEY: Final = "anomaly"
BAND_CACHE_S: Final = 300
MAX_BANDS: Final = 6
_BAND_CACHE: Final = "anomaly_bands"
KEY_SCHEMA = vol.All(str, vol.Length(min=1, max=300))


def _require(roles: frozenset[str]) -> Callable:
    def decorator(func: Callable) -> Callable:
        @wraps(func)
        def wrapper(hass: HomeAssistant, connection: Any, msg: dict[str, Any]) -> Any:
            role = resolve_role(connection.user, entry_roles(hass))
            if role != "owner" and role not in roles:
                raise Unauthorized
            return func(hass, connection, msg)

        return wrapper

    return decorator


def _iso(ts: datetime | None) -> str | None:
    return ts.isoformat() if ts else None


def _finding(watch: AnomalyWatch, f: Finding, private: bool) -> dict[str, Any]:
    meta = watch.engine.metas.get(f.entity_id)
    out: dict[str, Any] = {
        "detector": f.detector,
        "tier": TIER_KEYS[f.tier],
        "since": _iso(f.since),
        "name": meta.name if meta else f.entity_id,
        "device_class": meta.device_class if meta else None,
        "domain": meta.domain if meta else f.entity_id.split(".", 1)[0],
        "unit": meta.unit if meta else None,
        "detail": {k: v for k, v in f.detail.items() if k not in ("lo", "hi")},
    }
    if private:
        out["entity_id"] = f.entity_id
    return out


def report_payload(
    watch: AnomalyWatch, r: Report, now: datetime, private: bool = True
) -> dict[str, Any]:
    """One report as the panel sees it; ``private=False`` strips entity and device ids."""
    metas = watch.engine.metas
    names: dict[str, str] = {}
    areas: dict[str, str | None] = {}
    for d in r.device_ids:
        m = next((m for m in metas.values() if m.device_id == d), None)
        names[d] = m.device_name if m else d
        areas[d] = m.area if m else None
    entities = []
    for eid in r.entities:
        m = metas.get(eid)
        item: dict[str, Any] = {
            "name": m.name if m else eid,
            "device_class": m.device_class if m else None,
        }
        if private:
            item["entity_id"] = eid
        entities.append(item)
    out: dict[str, Any] = {
        "key": r.key,
        "scope": r.scope,
        "tier": TIER_KEYS[r.tier],
        "since": _iso(r.since),
        "reached": {k: _iso(v) for k, v in r.reached.items()},
        "earliest": {k: _iso(v) for k, v in r.earliest.items()},
        "integration": r.integration,
        "devices": [
            {
                "name": names[d],
                "area": areas[d],
                "monitored": len(watch.engine.device_entities(d)),
                **({"id": d} if private else {}),
            }
            for d in r.device_ids
        ],
        "entities": entities,
        "entity_count": max(len(r.entities), watch.engine.peak_entities(r.key)),
        "findings": [_finding(watch, f, private) for f in r.findings],
        "reporting": watch.reporting_siblings(r, now),
        "hidden": watch.hidden(r, now),
    }
    if private:
        ack = watch.acks.get(r.key)
        out["ack"] = ack.get("kind") if ack else None
        out["muted_until"] = _iso(watch.mutes.get(r.key))
    else:
        # Stable, but without device ids (the kiosk only uses it as a React key).
        out["key"] = f"{r.scope}:{hashlib.sha256(r.key.encode()).hexdigest()[:12]}"
    return out


def _counts(reports: list[dict[str, Any]]) -> dict[str, int]:
    counts = {"observation": 0, "suspicion": 0, "confirmed": 0}
    for r in reports:
        if r["hidden"] is None:
            counts[r["tier"]] += 1
    return counts


def payload(watch: AnomalyWatch, private: bool, *, show_exclusions: bool = False) -> dict[str, Any]:
    now = watch.snapshot.now
    reports = [report_payload(watch, r, now, private) for r in watch.snapshot.reports]
    out: dict[str, Any] = {
        "now": now.isoformat(),
        "ready": watch.learned_at is not None,
        "learning": watch.learning,
        "learned_at": _iso(watch.learned_at),
        "watched": watch.watched(),
        "counts": _counts(reports),
        "reports": reports if private else [r for r in reports if r["hidden"] is None],
    }
    if private:
        out["health"] = watch.health_strip(now)
        out["devices"] = watch.devices()
        out["resolved_7d"] = len(watch.engine.resolved)
    if private or show_exclusions:
        out["excluded_devices"] = watch.excluded_devices()
    return out


async def _bands(hass: HomeAssistant, watch: AnomalyWatch, data: dict[str, Any]) -> None:
    """Today's 5-minute means + usual hourly range for baseline reports (recorder, read only)."""
    wanted: list[tuple[dict[str, Any], str]] = []
    for r in data["reports"]:
        top = r["findings"][0] if r["findings"] else None
        if top and top["detector"] == "baseline" and top.get("entity_id"):
            wanted.append((r, top["entity_id"]))
    wanted = wanted[:MAX_BANDS]
    if not wanted:
        return
    now = watch.snapshot.now
    midnight = dt_util.start_of_local_day(now)
    cache: dict[str, tuple[float, list[list[float]]]] = hass.data[DOMAIN].setdefault(
        _BAND_CACHE, {}
    )
    stale = [
        eid for _, eid in wanted if time.monotonic() - cache.get(eid, (0.0, []))[0] > BAND_CACHE_S
    ]
    if stale and "recorder" in hass.config.components:
        from homeassistant.components.recorder import get_instance  # noqa: PLC0415
        from homeassistant.components.recorder.statistics import (  # noqa: PLC0415
            statistics_during_period,
        )

        stats = await get_instance(hass).async_add_executor_job(
            statistics_during_period, hass, midnight, None, set(stale), "5minute", None, {"mean"}
        )
        for eid in stale:
            rows = []
            for row in stats.get(eid) or []:
                if row.get("mean") is None:
                    continue
                start = row["start"]
                ts = start if isinstance(start, datetime) else dt_util.utc_from_timestamp(start)
                minute = (ts - midnight) / timedelta(minutes=1) + 2.5  # bucket centre
                rows.append([round(minute, 1), round(float(row["mean"]), 2)])
            cache[eid] = (time.monotonic(), rows)
    for r, eid in wanted:
        base = watch.engine.baselines.get(eid)
        r["band"] = {
            "unit": r["findings"][0].get("unit"),
            "usual": [None if h is None else [h.lo, h.hi] for h in (base.hourly if base else [])],
            "today": cache.get(eid, (0, []))[1],
        }


def _watch_or_error(hass: HomeAssistant, connection: Any, msg: dict[str, Any]):
    watch = get_watch(hass)
    if watch is None:
        connection.send_error(msg["id"], "not_ready", "Hlídání domu se ještě spouští")
    return watch


@websocket_api.websocket_command({vol.Required("type"): "homebrain/anomaly/list"})
@_require(ANOMALY_ROLES)
@websocket_api.async_response
async def websocket_anomaly_list(hass: HomeAssistant, connection: Any, msg: dict[str, Any]) -> None:
    if (watch := _watch_or_error(hass, connection, msg)) is None:
        return
    snapshot = watch.snapshot
    data = payload(watch, private=True)
    await _bands(hass, watch, data)
    if watch.snapshot is not snapshot:
        # An exclusion may have closed reports while the recorder job was running.
        data = payload(watch, private=True)
    connection.send_result(msg["id"], data)


@websocket_api.websocket_command({vol.Required("type"): "homebrain/anomaly/summary"})
@_require(ANOMALY_SUMMARY_ROLES)
@callback
def websocket_anomaly_summary(hass: HomeAssistant, connection: Any, msg: dict[str, Any]) -> None:
    if (watch := _watch_or_error(hass, connection, msg)) is None:
        return
    role = resolve_role(connection.user, entry_roles(hass))
    connection.send_result(
        msg["id"], payload(watch, private=False, show_exclusions=role in {"owner", "adult"})
    )


@websocket_api.websocket_command(
    {
        vol.Required("type"): "homebrain/anomaly/ack",
        vol.Required("key"): KEY_SCHEMA,
        vol.Required("kind"): vol.In([ACK_RESOLVED, ACK_OK]),
    }
)
@_require(ANOMALY_ROLES)
@callback
def websocket_anomaly_ack(hass: HomeAssistant, connection: Any, msg: dict[str, Any]) -> None:
    if (watch := _watch_or_error(hass, connection, msg)) is None:
        return
    if not watch.acknowledge(msg["key"], msg["kind"]):
        connection.send_error(msg["id"], "not_found", "Hlášení už není otevřené")
        return
    connection.send_result(msg["id"], {"ok": True})


@websocket_api.websocket_command(
    {
        vol.Required("type"): "homebrain/anomaly/mute",
        vol.Required("key"): KEY_SCHEMA,
        vol.Optional("days", default=7): vol.All(int, vol.Range(min=1, max=30)),
    }
)
@_require(ANOMALY_ROLES)
@callback
def websocket_anomaly_mute(hass: HomeAssistant, connection: Any, msg: dict[str, Any]) -> None:
    if (watch := _watch_or_error(hass, connection, msg)) is None:
        return
    until = watch.mute(msg["key"], msg["days"])
    connection.send_result(msg["id"], {"ok": True, "until": until.isoformat()})


@websocket_api.websocket_command(
    {vol.Required("type"): "homebrain/anomaly/unmute", vol.Required("key"): KEY_SCHEMA}
)
@_require(ANOMALY_ROLES)
@callback
def websocket_anomaly_unmute(hass: HomeAssistant, connection: Any, msg: dict[str, Any]) -> None:
    if (watch := _watch_or_error(hass, connection, msg)) is None:
        return
    connection.send_result(msg["id"], {"ok": watch.unmute(msg["key"])})


@websocket_api.websocket_command(
    {vol.Required("type"): "homebrain/anomaly/exclude", vol.Required("device_id"): KEY_SCHEMA}
)
@websocket_api.require_admin
@callback
def websocket_anomaly_exclude(hass: HomeAssistant, connection: Any, msg: dict[str, Any]) -> None:
    if (watch := _watch_or_error(hass, connection, msg)) is None:
        return
    if not watch.exclude(msg["device_id"]):
        connection.send_error(msg["id"], "not_found", "Zařízení už se nesleduje")
        return
    connection.send_result(msg["id"], {"ok": True})


@websocket_api.websocket_command(
    {vol.Required("type"): "homebrain/anomaly/include", vol.Required("device_id"): KEY_SCHEMA}
)
@websocket_api.require_admin
@callback
def websocket_anomaly_include(hass: HomeAssistant, connection: Any, msg: dict[str, Any]) -> None:
    if (watch := _watch_or_error(hass, connection, msg)) is None:
        return
    connection.send_result(msg["id"], {"ok": watch.include(msg["device_id"])})


COMMANDS: Final = (
    websocket_anomaly_list,
    websocket_anomaly_summary,
    websocket_anomaly_ack,
    websocket_anomaly_mute,
    websocket_anomaly_unmute,
    websocket_anomaly_exclude,
    websocket_anomaly_include,
)


async def async_setup(hass: HomeAssistant, entry: ConfigEntry) -> None:
    """Start watching once HA has started (recorder and every integration are up)."""
    data = hass.data.setdefault(DOMAIN, {})
    if KEY in data:
        return
    watch = AnomalyWatch(hass)
    data[KEY] = watch

    async def _start(_hass: HomeAssistant) -> None:
        await watch.async_start()

    entry.async_on_unload(async_at_started(hass, _start))


async def async_unload(hass: HomeAssistant) -> None:
    if (watch := hass.data.get(DOMAIN, {}).pop(KEY, None)) is not None:
        await watch.async_stop()
    hass.data.get(DOMAIN, {}).pop(_BAND_CACHE, None)
