"""WebSocket API of Energie „Srovnání nabídek“.

Offers + regulated components live in the HA Store ``homebrain.energy_offers``. Read and compare:
HA admins and adults (Energie detail role); add/edit/delete: HA admins only. Kiosk gets nothing.
"""

from __future__ import annotations

import secrets
from datetime import timedelta
from typing import Any, Final

import voluptuous as vol
from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant
from homeassistant.helpers.storage import Store
from homeassistant.util import dt as dt_util

from ...const import DOMAIN
from ..compare import statistic_ids
from .calc import compare_offers, month_windows
from .model import (
    MAX_OFFERS,
    OfferError,
    latest_confirmed_invoice,
    regulated_defaults,
    regulated_from_invoice,
    sanitize_offer,
    sanitize_regulated,
)
from .spot import SpotManager, http_fetch

STORE_KEY: Final = "homebrain.energy_offers"
DATA_KEY: Final = "energy_offers"
SPOT_KEY: Final = "energy_spot"
SPOT_SENSOR: Final = "energy_spot_price_electricity"


class OfferStore:
    def __init__(self, hass: HomeAssistant) -> None:
        self._store: Store[dict[str, Any]] = Store(hass, 1, STORE_KEY)
        self._data: dict[str, Any] | None = None

    async def async_get(self) -> dict[str, Any]:
        if self._data is None:
            stored = await self._store.async_load()
            self._data = stored if isinstance(stored, dict) else {}
            self._data.setdefault("offers", [])
            self._data.setdefault("regulated", None)
        return self._data

    async def async_save(self) -> None:
        if self._data is not None:
            await self._store.async_save(self._data)


def _offer_store(hass: HomeAssistant) -> OfferStore:
    data = hass.data.setdefault(DOMAIN, {})
    if DATA_KEY not in data:
        data[DATA_KEY] = OfferStore(hass)
    return data[DATA_KEY]


def spot_manager(hass: HomeAssistant) -> SpotManager:
    data = hass.data.setdefault(DOMAIN, {})
    if SPOT_KEY not in data:
        data[SPOT_KEY] = SpotManager(hass, http_fetch(hass))
    return data[SPOT_KEY]


async def _regulated(hass: HomeAssistant, stored: dict[str, Any] | None) -> dict[str, Any]:
    """Saved regulated prices, else the latest confirmed invoice, else the Energie helpers."""
    if stored:
        return stored
    from ..invoices.api import _bindings, get_store  # noqa: PLC0415 - avoid import cycle
    from ..ws import _number  # noqa: PLC0415

    b = _bindings(hass)
    base = regulated_defaults(
        {
            "dist_vt": _number(hass, b.get("energy_spot_distribution_vt")),
            "dist_nt": _number(hass, b.get("energy_spot_distribution_nt")),
            "fixed": _number(hass, b.get("energy_spot_fixed_monthly")),
        }
    )
    invoice = latest_confirmed_invoice(await get_store(hass).async_list())
    return regulated_from_invoice(invoice["fields"], base) if invoice else base


async def _payload(hass: HomeAssistant, connection: Any) -> dict[str, Any]:
    from ..invoices.api import _bindings, current_tariff  # noqa: PLC0415

    data = await _offer_store(hass).async_get()
    return {
        "offers": data["offers"],
        "regulated": await _regulated(hass, data["regulated"]),
        "can_edit": bool(connection.user and connection.user.is_admin),
        "tariff": current_tariff(hass, _bindings(hass)),
    }


def _detail(func: Any) -> Any:
    from ..ws import _require_energy  # noqa: PLC0415

    return _require_energy(func)


@websocket_api.websocket_command({vol.Required("type"): "homebrain/energy/offers/get"})
@_detail
@websocket_api.async_response
async def ws_get(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    connection.send_result(msg["id"], await _payload(hass, connection))


@websocket_api.websocket_command(
    {
        vol.Required("type"): "homebrain/energy/offers/save",
        vol.Optional("offer"): dict,
        vol.Optional("regulated"): dict,
    }
)
@websocket_api.require_admin
@websocket_api.async_response
async def ws_save(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    store = _offer_store(hass)
    data = await store.async_get()
    try:
        offer = sanitize_offer(msg["offer"]) if "offer" in msg else None
        regulated = sanitize_regulated(msg["regulated"]) if "regulated" in msg else None
    except OfferError as err:
        connection.send_error(msg["id"], err.code, "invalid offer")
        return
    if offer is not None:
        offers = [o for o in data["offers"] if o["id"] != offer["id"]]
        if len(offers) == len(data["offers"]):
            if len(offers) >= MAX_OFFERS:
                connection.send_error(msg["id"], "too_many", "too many offers")
                return
            offer["id"] = secrets.token_hex(6) if not msg["offer"].get("id") else offer["id"]
            offers.append(offer)
        else:
            offers = [offer if o["id"] == offer["id"] else o for o in data["offers"]]
        data["offers"] = offers
    if regulated is not None:
        data["regulated"] = regulated
    await store.async_save()
    connection.send_result(msg["id"], await _payload(hass, connection))


@websocket_api.websocket_command(
    {vol.Required("type"): "homebrain/energy/offers/delete", vol.Required("offer_id"): str}
)
@websocket_api.require_admin
@websocket_api.async_response
async def ws_delete(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    store = _offer_store(hass)
    data = await store.async_get()
    data["offers"] = [o for o in data["offers"] if o["id"] != msg["offer_id"]]
    await store.async_save()
    connection.send_result(msg["id"], await _payload(hass, connection))


async def _spot_from_statistics(
    hass: HomeAssistant, statistic_id: str, start: Any
) -> dict[float, float]:
    """Fallback: hourly mean of a bound HA spot-price sensor (Kč/kWh -> Kč/MWh)."""
    from homeassistant.components.recorder import get_instance  # noqa: PLC0415
    from homeassistant.components.recorder.statistics import (  # noqa: PLC0415
        statistics_during_period,
    )

    raw = await get_instance(hass).async_add_executor_job(
        statistics_during_period, hass, start, None, {statistic_id}, "hour", None, {"mean"}
    )
    rows = [
        (float(r["start"]), float(r["mean"]))
        for r in raw.get(statistic_id) or []
        if r.get("start") is not None and r.get("mean") is not None
    ]
    if not rows:
        return {}
    values = sorted(abs(v) for _, v in rows)
    scale = 1.0 if values[len(values) // 2] > 100 else 1000.0  # already per MWh vs per kWh
    return {t: round(v * scale, 4) for t, v in rows}


@websocket_api.websocket_command({vol.Required("type"): "homebrain/energy/offers/compare"})
@_detail
@websocket_api.async_response
async def ws_compare(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    from ..invoices.api import _bindings  # noqa: PLC0415
    from ..ws import _hourly_rows, _tariff  # noqa: PLC0415

    bindings = _bindings(hass)
    ids = {k: v for k, v in statistic_ids(bindings).items() if k in ("import", "export")}
    if "import" not in ids:
        connection.send_result(msg["id"], {"status": "unconfigured"})
        return
    if "recorder" not in hass.config.components:
        connection.send_result(msg["id"], {"status": "unsupported"})
        return
    data = await _offer_store(hass).async_get()
    tz = dt_util.get_time_zone(hass.config.time_zone) or dt_util.get_default_time_zone()
    now = dt_util.now(tz)
    start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    for _ in range(12):
        start = (start - timedelta(days=1)).replace(day=1)
    rows = await _hourly_rows(hass, ids, dt_util.as_utc(start))
    needs_spot = any(o["kind"] == "spot" or o["export"]["mode"] == "spot" for o in data["offers"])
    spot: dict[float, float] = {}
    spot_info: dict[str, Any] = {"needed": needs_spot, "source": None}
    if needs_spot:
        manager = spot_manager(hass)
        await manager.async_load()
        first = min((t for t, v in rows.get("import", []) if v is not None), default=None)
        windows = month_windows(now, tz, first) if first is not None else []
        if windows:
            begin = dt_util.utc_from_timestamp(windows[0][1]).astimezone(tz).date()
            manager.start_backfill(begin, now.date(), tz)
        spot = manager.czk_prices(tz)
        spot_info.update(manager.status(), source="ote" if spot else None)
        if bindings.get(SPOT_SENSOR):
            fallback = await _spot_from_statistics(
                hass, bindings[SPOT_SENSOR], dt_util.as_utc(start)
            )
            added = {t: v for t, v in fallback.items() if t not in spot}
            if added:
                spot.update(added)
                spot_info["source"] = "ote+ha" if spot_info["source"] else "ha"
                spot_info["ha_hours"] = len(added)
    result = compare_offers(
        imports=rows.get("import", []),
        exports=rows.get("export", []),
        spot=spot,
        current=_tariff(hass, bindings),
        regulated=await _regulated(hass, data["regulated"]),
        offers=data["offers"],
        now=now,
        tz=tz,
    )
    connection.send_result(msg["id"], {**result, "spot": spot_info})


COMMANDS = (ws_get, ws_save, ws_delete, ws_compare)
