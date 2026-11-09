"""``homebrain/heating/*`` WebSocket commands (read-only phase 0).

Roles: HA admins (owner) and adults read everything; the kiosk tablet gets ``get`` as a
reduced subset (Dnes signals); children/guests nothing. ``import_history`` is admin-only.
"""

from __future__ import annotations

from datetime import UTC, date, datetime, timedelta
from typing import Any, Final

import voluptuous as vol
from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant, callback
from homeassistant.exceptions import Unauthorized
from homeassistant.helpers import entity_registry as er
from homeassistant.util import dt as dt_util

from ..const import DOMAIN
from ..roles import HEATING_DETAIL_ROLES, HEATING_GET_ROLES, entry_roles, resolve_role
from .entities import TOTAL_KEYS, unique_id
from .keys import COUNTER_KEYS, key_from_object_id, object_id, spec_of
from .model import compute_seasons, empty_payload, kiosk_subset
from .poller import BINDING_ENERGY, DATA_KEY, HeatingPoller

# range → (lookback, recorder period, contract resolution)
RANGES: Final = {
    "day": (timedelta(days=1), "5minute", "5min"),
    "week": (timedelta(days=7), "hour", "hour"),
    "month": (timedelta(days=31), "hour", "hour"),
    "season": (None, "day", "day"),
    "all": (timedelta(days=366 * 20), "day", "day"),
}
DEFAULT_KEYS: Final = (
    "outdoor_temp",
    "tank_top",
    "tank_bottom",
    "house_ref_temp",
    "heat_pump_condenser_out",
)
MAX_IMPORT_ROWS: Final = 20000
_HOUR_MS: Final = 3_600_000
_UNIT_CLASS: Final = {
    "temperature": "temperature",
    "energy": "energy",
    "duration": "duration",
    "pressure": "pressure",
}


def _poller(hass: HomeAssistant) -> HeatingPoller | None:
    return hass.data.get(DOMAIN, {}).get(DATA_KEY)


def _role(hass: HomeAssistant, connection: Any) -> str:
    return resolve_role(connection.user, entry_roles(hass))


def _require(hass: HomeAssistant, connection: Any, roles: frozenset[str]) -> str:
    role = _role(hass, connection)
    if role != "owner" and role not in roles:
        raise Unauthorized
    return role


def _payload(hass: HomeAssistant) -> dict[str, Any]:
    poller = _poller(hass)
    return poller.payload() if poller else empty_payload("unconfigured", dt_util.utcnow())


def _statistic_id(hass: HomeAssistant, key: str) -> str | None:
    spec = spec_of(key)
    if spec is None or spec.kind != "num":
        return None
    return er.async_get(hass).async_get_entity_id("sensor", DOMAIN, unique_id(key))


@websocket_api.websocket_command({vol.Required("type"): "homebrain/heating/get"})
@callback
def websocket_heating_get(hass: HomeAssistant, connection: Any, msg: dict[str, Any]) -> None:
    role = _require(hass, connection, HEATING_GET_ROLES)
    payload = _payload(hass)
    connection.send_result(msg["id"], kiosk_subset(payload) if role == "kiosk" else payload)


@websocket_api.websocket_command({vol.Required("type"): "homebrain/heating/subscribe"})
@callback
def websocket_heating_subscribe(hass: HomeAssistant, connection: Any, msg: dict[str, Any]) -> None:
    """Push the ``get`` payload now and whenever it changes (``updated_at`` alone is ignored)."""
    _require(hass, connection, HEATING_DETAIL_ROLES)
    last: dict[str, Any] = {}

    @callback
    def push() -> None:
        payload = _payload(hass)
        comparable = {k: v for k, v in payload.items() if k != "updated_at"}
        if comparable == last.get("p"):
            return
        last["p"] = comparable
        connection.send_message(websocket_api.event_message(msg["id"], payload))

    poller = _poller(hass)
    connection.subscriptions[msg["id"]] = poller.add_listener(push) if poller else (lambda: None)
    connection.send_result(msg["id"])
    push()


async def _recorder_job(hass: HomeAssistant, func: Any, *args: Any) -> Any:
    from homeassistant.components.recorder import get_instance

    return await get_instance(hass).async_add_executor_job(func, *args)


def _season_start(now: datetime) -> datetime:
    year = now.year if now.month >= 7 else now.year - 1
    return dt_util.start_of_local_day(date(year, 7, 1))


async def _stats(
    hass: HomeAssistant, ids: set[str], start: datetime, period: str, types: set[str]
) -> dict[str, list[dict[str, Any]]]:
    if not ids or "recorder" not in hass.config.components:
        return {}
    from homeassistant.components.recorder.statistics import statistics_during_period

    return await _recorder_job(
        hass, statistics_during_period, hass, start, None, ids, period, None, types
    )


async def _runs(hass: HomeAssistant, start: datetime, end: datetime) -> list[list[int]]:
    entity_id = er.async_get(hass).async_get_entity_id(
        "binary_sensor", DOMAIN, unique_id("heat_pump.compressor_on")
    )
    if entity_id is None or "recorder" not in hass.config.components:
        return []
    from homeassistant.components.recorder.history import state_changes_during_period

    states = (
        await _recorder_job(hass, state_changes_during_period, hass, start, end, entity_id, True)
    ).get(entity_id, [])
    runs: list[list[int]] = []
    since: datetime | None = None
    for state in states:
        if state.state == "on" and since is None:
            since = max(state.last_changed, start)
        elif state.state != "on" and since is not None:
            runs.append([int(since.timestamp() * 1000), int(state.last_changed.timestamp() * 1000)])
            since = None
    if since is not None:
        runs.append([int(since.timestamp() * 1000), int(end.timestamp() * 1000)])
    return runs


def _ms(start: Any) -> int:
    if isinstance(start, datetime):
        return int(start.timestamp() * 1000)
    return int(float(start) * 1000)


@websocket_api.websocket_command(
    {
        vol.Required("type"): "homebrain/heating/history",
        vol.Optional("range", default="day"): vol.In(list(RANGES)),
        vol.Optional("keys"): vol.All([vol.All(str, vol.Length(max=64))], vol.Length(max=30)),
    }
)
@websocket_api.async_response
async def websocket_heating_history(
    hass: HomeAssistant, connection: Any, msg: dict[str, Any]
) -> None:
    _require(hass, connection, HEATING_DETAIL_ROLES)
    rng = msg["range"]
    lookback, period, resolution = RANGES[rng]
    now = dt_util.utcnow()
    start = now - lookback if lookback else _season_start(dt_util.now())
    wanted: dict[str, str] = {}
    for oid in msg.get("keys") or DEFAULT_KEYS:
        key = key_from_object_id(oid)
        if key and (sid := _statistic_id(hass, key)):
            wanted[sid] = key
    raw = await _stats(hass, set(wanted), start, period, {"mean", "min", "max", "change"})
    series = []
    for sid, key in wanted.items():
        rows = raw.get(sid, [])
        counter = key in TOTAL_KEYS
        points = [
            [_ms(r["start"]), r.get("change"), None, None]
            if counter
            else [_ms(r["start"]), r.get("mean"), r.get("min"), r.get("max")]
            for r in rows
        ]
        series.append({"key": object_id(key), "unit": spec_of(key).unit, "points": points})
    runs = await _runs(hass, start, now) if rng in ("day", "week") else []
    connection.send_result(
        msg["id"],
        {
            "range": rng,
            "resolution": resolution,
            "series": series,
            "runs": runs,
            "annotations": [],
        },
    )


@websocket_api.websocket_command({vol.Required("type"): "homebrain/heating/seasons"})
@websocket_api.async_response
async def websocket_heating_seasons(
    hass: HomeAssistant, connection: Any, msg: dict[str, Any]
) -> None:
    _require(hass, connection, HEATING_DETAIL_ROLES)
    poller = _poller(hass)
    ids = {
        "runtime_h": _statistic_id(hass, "compressor_runtime_h"),
        "starts": _statistic_id(hass, "compressor_starts"),
        "outdoor_mean": _statistic_id(hass, "outdoor.temp"),
    }
    energy_id = poller._bindings().get(BINDING_ENERGY) if poller else None  # noqa: SLF001
    if energy_id:
        ids["energy_kwh"] = energy_id
    now = dt_util.now()
    start = now - RANGES["all"][0]
    raw = await _stats(hass, {i for i in ids.values() if i}, start, "day", {"mean", "change"})
    days: dict[date, dict[str, Any]] = {}
    for field, sid in ids.items():
        for row in raw.get(sid or "", []):
            day = dt_util.as_local(datetime.fromtimestamp(_ms(row["start"]) / 1000, UTC)).date()
            value = row.get("mean") if field == "outdoor_mean" else row.get("change")
            days.setdefault(day, {"date": day})[field] = value
    kwh = poller.map.kwh_per_run_hour if poller and poller.map else None
    connection.send_result(
        msg["id"],
        compute_seasons(
            sorted(days.values(), key=lambda d: d["date"]), today=now.date(), kwh_per_run_hour=kwh
        ),
    )


_ROW = vol.Schema(
    {
        vol.Required("key"): vol.All(str, vol.Length(max=64)),
        vol.Required("start"): vol.Any(int, str),
        vol.Optional("mean"): vol.Any(None, vol.Coerce(float)),
        vol.Optional("min"): vol.Any(None, vol.Coerce(float)),
        vol.Optional("max"): vol.Any(None, vol.Coerce(float)),
        vol.Optional("sum"): vol.Any(None, vol.Coerce(float)),
    }
)


def _start_ms(value: Any) -> int | None:
    if isinstance(value, int):
        return value
    parsed = dt_util.parse_datetime(value)
    if parsed is None or parsed.tzinfo is None:
        return None
    return int(parsed.timestamp() * 1000)


@websocket_api.websocket_command(
    {
        vol.Required("type"): "homebrain/heating/import_history",
        vol.Required("rows"): vol.All([_ROW], vol.Length(max=MAX_IMPORT_ROWS)),
    }
)
@websocket_api.require_admin
@websocket_api.async_response
async def websocket_heating_import_history(
    hass: HomeAssistant, connection: Any, msg: dict[str, Any]
) -> None:
    """Hourly rows → ``async_import_statistics`` into this integration's sensors (idempotent).

    Measurements: ``mean`` (+ ``min``/``max``). Counters (``compressor_runtime_h``,
    ``compressor_starts``, ``energy_kwh``): ``sum`` = amount in that hour; the running total
    continues from the statistics stored before the batch, so re-importing a batch is a no-op.
    Send batches oldest first. Recorder writes are committed before acknowledgement, so
    consecutive batches are safe back-to-back without a client-side delay.
    """
    rejected: list[dict[str, Any]] = []
    grouped: dict[str, dict[int, dict[str, Any]]] = {}
    for i, row in enumerate(msg["rows"]):
        key = key_from_object_id(row["key"])
        sid = _statistic_id(hass, key) if key else None
        start = _start_ms(row["start"])
        counter = key in COUNTER_KEYS
        if sid is None:
            reason = "unknown_key"
        elif start is None or start % _HOUR_MS:
            reason = "start_not_hour"
        elif counter and (row.get("sum") is None or row["sum"] < 0):
            reason = "sum_required"
        elif not counter and row.get("mean") is None:
            reason = "mean_required"
        else:
            grouped.setdefault(key, {})[start] = row
            continue
        if len(rejected) < 50:
            rejected.append({"index": i, "reason": reason})
    if grouped and "recorder" not in hass.config.components:
        connection.send_error(msg["id"], "not_supported", "Recorder is not running")
        return
    from homeassistant.components.recorder import get_instance
    from homeassistant.components.recorder.models import StatisticMeanType
    from homeassistant.components.recorder.statistics import (
        async_import_statistics,
        statistics_during_period,
    )

    if grouped:
        await get_instance(hass).async_block_till_done()
    counts: dict[str, int] = {}
    for key, by_start in grouped.items():
        sid = _statistic_id(hass, key)
        spec = spec_of(key)
        counter = key in COUNTER_KEYS
        starts = sorted(by_start)
        stats: list[dict[str, Any]] = []
        if counter:
            first = datetime.fromtimestamp(starts[0] / 1000, UTC)
            before = await _recorder_job(
                hass,
                statistics_during_period,
                hass,
                datetime.min.replace(tzinfo=UTC),
                first,
                {sid},
                "hour",
                None,
                {"sum"},
            )
            # The end is exclusive: replaying this batch must not seed from its own rows.
            previous = before.get(sid, [])
            total = float(previous[-1]["sum"] or 0.0) if previous else 0.0
            for ms in starts:
                total += by_start[ms]["sum"]
                stats.append(
                    {"start": datetime.fromtimestamp(ms / 1000, UTC), "sum": total, "state": total}
                )
        else:
            for ms in starts:
                row = by_start[ms]
                mean = row["mean"]
                stats.append(
                    {
                        "start": datetime.fromtimestamp(ms / 1000, UTC),
                        "mean": mean,
                        "min": mean if row.get("min") is None else row["min"],
                        "max": mean if row.get("max") is None else row["max"],
                    }
                )
        async_import_statistics(
            hass,
            {
                "source": "recorder",
                "statistic_id": sid,
                "name": None,
                "unit_of_measurement": spec.unit,
                "unit_class": _UNIT_CLASS.get(spec.device_class or ""),
                "has_sum": counter,
                "mean_type": StatisticMeanType.NONE if counter else StatisticMeanType.ARITHMETIC,
            },
            stats,
        )
        counts[object_id(key)] = len(stats)
    if grouped:
        await get_instance(hass).async_block_till_done()
    connection.send_result(
        msg["id"],
        {"imported": sum(counts.values()), "keys": counts, "rejected": rejected},
    )


COMMANDS: Final = (
    websocket_heating_get,
    websocket_heating_subscribe,
    websocket_heating_history,
    websocket_heating_seasons,
    websocket_heating_import_history,
)
