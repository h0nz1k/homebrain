"""WebSocket API of the Síť module (``homebrain/network/*``).

* ``get`` / ``topology`` / ``settings/*`` – admin only (devices, LAN map, guest password);
* ``summary`` – adults and the kitchen kiosk: status + headline, never a device list;
* ``guest_qr`` – every mapped role: SSID + QR payload (the password only travels inside it).
"""

from __future__ import annotations

import time
from collections.abc import Callable
from functools import wraps
from typing import Any, Final

import voluptuous as vol
from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant, callback
from homeassistant.exceptions import Unauthorized

from ..const import DOMAIN
from ..roles import NETWORK_QR_ROLES, NETWORK_SUMMARY_ROLES, entry_roles, resolve_role
from . import rules
from .discovery import FlapTracker, build_snapshot
from .enrich import enrich_snapshot
from .topology import build_topology
from .unifi_client import UnifiConfig
from .unifi_poller import UnifiPoller

CONF_NETWORK: Final = "network"
FLAPS_KEY: Final = "network_flaps"
UNIFI_KEY: Final = "network_unifi"
CONF_UNIFI: Final = "network_unifi"
SECURITY: Final = ("WPA", "WEP", "nopass")


def _entry(hass: HomeAssistant):
    entries = hass.config_entries.async_entries(DOMAIN)
    return entries[0] if entries else None


def network_options(hass: HomeAssistant) -> dict[str, Any]:
    entry = _entry(hass)
    raw = entry.options.get(CONF_NETWORK) if entry else None
    return dict(raw) if isinstance(raw, dict) else {}


def _escape(value: str) -> str:
    for ch in ("\\", ";", ",", ":", '"'):
        value = value.replace(ch, "\\" + ch)
    return value


def wifi_qr_payload(ssid: str, password: str | None, security: str = "WPA") -> str:
    """Standard ``WIFI:`` QR payload understood by Android and iOS cameras."""
    if security == "nopass" or not password:
        return f"WIFI:T:nopass;S:{_escape(ssid)};;"
    return f"WIFI:T:{security};S:{_escape(ssid)};P:{_escape(password)};;"


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


def _snapshot(hass: HomeAssistant) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    now = time.time()
    macs: dict[str, dict[str, str]] = {}
    snap = build_snapshot(
        hass, network_options(hass), hass.data.get(DOMAIN, {}).get(FLAPS_KEY), now, macs
    )
    poller: UnifiPoller | None = hass.data.get(DOMAIN, {}).get(UNIFI_KEY)
    if poller is not None:
        if (data := poller.current(now)) is not None:
            enrich_snapshot(snap, data, macs, poller.downs)
        snap["unifi"] = poller.status()
    else:
        snap["unifi"] = {"configured": False}
    return snap, rules.evaluate(snap, now)


def _unifi_public(hass: HomeAssistant) -> dict[str, Any]:
    """Connection state only – never the URL, account or password."""
    poller: UnifiPoller | None = hass.data.get(DOMAIN, {}).get(UNIFI_KEY)
    if poller is None:
        return {"configured": False}
    status = poller.status()
    return {"configured": True, "status": status["status"], "readonly": status["readonly"]}


@websocket_api.websocket_command({vol.Required("type"): "homebrain/network/get"})
@websocket_api.require_admin
@callback
def websocket_network_get(hass: HomeAssistant, connection: Any, msg: dict[str, Any]) -> None:
    snap, problems = _snapshot(hass)
    connection.send_result(
        msg["id"], {**snap, "problems": problems, "summary": rules.summary(snap, problems)}
    )


@websocket_api.websocket_command({vol.Required("type"): "homebrain/network/topology"})
@websocket_api.require_admin
@callback
def websocket_network_topology(hass: HomeAssistant, connection: Any, msg: dict[str, Any]) -> None:
    """Topology graph for the „Mapa“ tab – admin only (device names, structure of the LAN)."""
    snap, problems = _snapshot(hass)
    connection.send_result(msg["id"], build_topology(snap, problems, network_options(hass)))


@websocket_api.websocket_command({vol.Required("type"): "homebrain/network/summary"})
@_require(NETWORK_SUMMARY_ROLES)
@callback
def websocket_network_summary(hass: HomeAssistant, connection: Any, msg: dict[str, Any]) -> None:
    snap, problems = _snapshot(hass)
    connection.send_result(msg["id"], rules.summary(snap, problems))


@websocket_api.websocket_command({vol.Required("type"): "homebrain/network/guest_qr"})
@_require(NETWORK_QR_ROLES)
@callback
def websocket_network_guest_qr(hass: HomeAssistant, connection: Any, msg: dict[str, Any]) -> None:
    guest = network_options(hass).get("guest") or {}
    ssid = guest.get("ssid")
    if not ssid:
        connection.send_result(msg["id"], {"configured": False, "ssid": None, "qr_payload": None})
        return
    security = guest.get("security") or "WPA"
    connection.send_result(
        msg["id"],
        {
            "configured": True,
            "ssid": ssid,
            "open": security == "nopass" or not guest.get("password"),
            "qr_payload": wifi_qr_payload(ssid, guest.get("password"), security),
        },
    )


@websocket_api.websocket_command({vol.Required("type"): "homebrain/network/settings/get"})
@websocket_api.require_admin
@callback
def websocket_network_settings_get(
    hass: HomeAssistant, connection: Any, msg: dict[str, Any]
) -> None:
    opts = network_options(hass)
    connection.send_result(
        msg["id"],
        {
            "important": opts.get("important", []),
            "guest": opts.get("guest") or None,
            "gateway_label": opts.get("gateway_label"),
            "unifi": _unifi_public(hass),
        },
    )


IMPORTANT_SCHEMA = vol.All(
    [
        vol.Schema(
            {
                vol.Required("id"): vol.All(str, vol.Length(min=1, max=64)),
                vol.Optional("label"): vol.Any(None, vol.All(str, vol.Length(max=80))),
                vol.Optional("expected_floor_id"): vol.Any(None, vol.All(str, vol.Length(max=64))),
            }
        )
    ],
    vol.Length(max=50),
)
GUEST_SCHEMA = vol.Any(
    None,
    vol.Schema(
        {
            vol.Required("ssid"): vol.All(str, vol.Length(min=1, max=32)),
            vol.Optional("password"): vol.Any(None, vol.All(str, vol.Length(max=63))),
            vol.Optional("security", default="WPA"): vol.In(SECURITY),
        }
    ),
)


@websocket_api.websocket_command(
    {
        vol.Required("type"): "homebrain/network/settings/set",
        vol.Optional("important"): IMPORTANT_SCHEMA,
        vol.Optional("guest"): GUEST_SCHEMA,
        vol.Optional("gateway_label"): vol.Any(None, vol.All(str, vol.Length(max=40))),
    }
)
@websocket_api.require_admin
@callback
def websocket_network_settings_set(
    hass: HomeAssistant, connection: Any, msg: dict[str, Any]
) -> None:
    entry = _entry(hass)
    if entry is None:
        connection.send_error(msg["id"], "not_found", "HomeBrain is not configured")
        return
    opts = network_options(hass)
    if "important" in msg:
        opts["important"] = [
            {k: v for k, v in item.items() if v not in (None, "")} for item in msg["important"]
        ]
    if "gateway_label" in msg:
        if msg["gateway_label"]:
            opts["gateway_label"] = msg["gateway_label"].strip()
        else:
            opts.pop("gateway_label", None)
    if "guest" in msg:
        if msg["guest"] is None:
            opts.pop("guest", None)
        else:
            opts["guest"] = dict(msg["guest"])
    hass.config_entries.async_update_entry(entry, options={**entry.options, CONF_NETWORK: opts})
    connection.send_result(
        msg["id"],
        {
            "important": opts.get("important", []),
            "guest": opts.get("guest") or None,
            "gateway_label": opts.get("gateway_label"),
            "unifi": _unifi_public(hass),
        },
    )


COMMANDS: Final = (
    websocket_network_get,
    websocket_network_topology,
    websocket_network_summary,
    websocket_network_guest_qr,
    websocket_network_settings_get,
    websocket_network_settings_set,
)


async def async_setup(hass: HomeAssistant, entry: Any) -> None:
    """Start counting AP disconnects (flapping rule)."""
    data = hass.data.setdefault(DOMAIN, {})
    if FLAPS_KEY in data:
        return
    tracker = FlapTracker()
    data[FLAPS_KEY] = tracker
    entry.async_on_unload(tracker.async_listen(hass))
    await _async_start_unifi(hass, entry)

    async def _options_updated(hass: HomeAssistant, entry: Any) -> None:
        poller: UnifiPoller | None = hass.data.get(DOMAIN, {}).get(UNIFI_KEY)
        new = UnifiConfig.from_options(entry.options.get(CONF_UNIFI))
        if (poller.cfg if poller else None) == new:
            return
        await _async_stop_unifi(hass)
        await _async_start_unifi(hass, entry)

    entry.async_on_unload(entry.add_update_listener(_options_updated))


async def _async_start_unifi(hass: HomeAssistant, entry: Any) -> None:
    """Direct read-only UniFi polling (V2) – only when the owner configured an account."""
    cfg = UnifiConfig.from_options(entry.options.get(CONF_UNIFI))
    if cfg is None:
        return
    poller = UnifiPoller(hass, cfg)
    hass.data.setdefault(DOMAIN, {})[UNIFI_KEY] = poller
    await poller.async_start()


async def _async_stop_unifi(hass: HomeAssistant) -> None:
    poller: UnifiPoller | None = hass.data.get(DOMAIN, {}).pop(UNIFI_KEY, None)
    if poller is not None:
        await poller.async_stop()


async def async_unload(hass: HomeAssistant) -> None:
    hass.data.get(DOMAIN, {}).pop(FLAPS_KEY, None)
    await _async_stop_unifi(hass)
