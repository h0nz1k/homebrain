"""WebSocket API ``homebrain/access/*`` (Přístup – BioLock). Admin only.

Talks to the ESPHome device ``biolock`` (BioLock firmware, ``esphome/common.yaml``)
through its HA actions ``esphome.biolock_*`` and listens to its events
``esphome.biolock_{users,enrolled,enroll_retry,deleted,recognized,rejected,audit}``. Only a fixed
allowlist of actions/entities can be reached from the panel.

The manager keeps the user list in sync with enrolments/deletions made OUTSIDE the panel (HA
scripts, automations), so the panel never needs a manual re-list after a successful enrolment.
"""

from __future__ import annotations

import re
from collections import deque
from datetime import datetime
from pathlib import Path
from typing import Any

import voluptuous as vol
from homeassistant.components import websocket_api
from homeassistant.core import CALLBACK_TYPE, Event, HomeAssistant, callback
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers import device_registry as dr
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers.storage import Store
from homeassistant.util import dt as dt_util

from ..const import DOMAIN
from .health import entry_health, notification_text, reenroll_reasons
from .store import AccessError, LabelStore, UserListAssembler, fold, modality, parse_users_page

DEVICE = "biolock"
EVENT_PREFIX = f"esphome.{DEVICE}_"
EVENT_KINDS = ("users", "enrolled", "enroll_retry", "deleted", "recognized", "rejected", "audit")
# Access log (Historie): recognitions + enrolment results + deletions + lockouts (audit action).
HISTORY_KINDS = ("recognized", "rejected", "enrolled", "deleted", "lockout")
HISTORY_MAX = 50  # shown in the panel
HISTORY_PAGE = 200  # homebrain/access/history page size cap
HISTORY_KEEP = 500  # kept for the 14-day health window
_MANAGER_KEY = "access_manager"

# Panel action -> (domain, service, entity_id or None). ESPHome actions take their own fields.
ENTITIES = {
    "biometric": "switch.biolock_biometricke_odemykani",
    "service_mode": "switch.biolock_servisni_rezim",
    "recognition_action": "select.biolock_akce_pri_rozpoznani",
}
RECOGNITION_OPTIONS = ("Odemknout", "Otevřít západku")
NAME = vol.All(str, vol.Strip, vol.Length(min=1, max=20))
USER_ID = vol.All(vol.Coerce(int), vol.Range(min=1, max=2000))
# Firmware >= biolock-firmware#8 accepts an enrolment timeout; older builds lack the field.
TIMEOUT_S = vol.All(vol.Coerce(int), vol.Range(min=5, max=60))
ACTIONS: dict[str, vol.Schema] = {
    "enroll_face": vol.Schema(
        {
            vol.Required("name"): NAME,
            vol.Optional("admin", default=False): bool,
            vol.Optional("timeout_s"): TIMEOUT_S,
        }
    ),
    "enroll_palm": vol.Schema({vol.Required("name"): NAME, vol.Optional("timeout_s"): TIMEOUT_S}),
    "cancel_enroll": vol.Schema({}),
    "list_users": vol.Schema({}),
    "set_user_allowed": vol.Schema(
        {vol.Required("user_id"): USER_ID, vol.Required("allowed"): bool}
    ),
    "delete_user": vol.Schema({vol.Required("user_id"): USER_ID}),
    "reset_lockout": vol.Schema({}),
    "biometric": vol.Schema({vol.Required("on"): bool}),
    "service_mode": vol.Schema({vol.Required("on"): bool}),
    "recognition_action": vol.Schema({vol.Required("option"): vol.In(RECOGNITION_OPTIONS)}),
}


def labels_path(hass: HomeAssistant) -> Path:
    """Labels live in /config/homebrain/, never in the repo or /www."""
    return Path(hass.config.path("homebrain", "access.json"))


def _event_payload(kind: str, data: dict[str, Any]) -> dict[str, Any]:
    """Normalise the string-typed ESPHome event data for the panel."""
    out: dict[str, Any] = {}
    for key in (
        "type",
        "type_requested",
        "name",
        "reason",
        "reason_text",
        "decision",
        "liveness",
        "action",
    ):
        if key in data:
            out[key] = str(data[key])
    for key in ("ok", "admin", "rollback", "counted"):
        if key in data:
            out[key] = str(data[key]).lower() == "true"
    if "user_id" in data:
        try:
            out["user_id"] = int(data["user_id"])
        except (TypeError, ValueError):
            out["user_id"] = 0
    for key in ("score", "similarity"):
        if key in data:
            try:
                out["score"] = float(data[key])
            except (TypeError, ValueError):
                pass
            break
    for key in ("rolled_back_id", "attempts", "attempt", "remaining_s"):
        if key in data:
            try:
                out[key] = int(data[key])
            except (TypeError, ValueError):
                pass
    if "delayed_s" in data:
        out["delayed_s"] = data["delayed_s"]
    if kind in ("recognized", "deleted", "enrolled") and out.get("user_id"):
        try:
            out.setdefault("type", modality(out["user_id"]))
        except AccessError:
            pass
    return out


class AccessManager:
    """Event listener + caches (user list, last 50 recognitions) + panel subscribers."""

    def __init__(self, hass: HomeAssistant) -> None:
        self.hass = hass
        self.labels = LabelStore(labels_path(hass))
        self.users: list[dict[str, Any]] | None = None
        self.listed_at: str | None = None
        self.incomplete = False
        self.history: deque[dict[str, Any]] = deque(maxlen=HISTORY_KEEP)
        self._assembler = UserListAssembler()
        self._subscribers: set[Any] = set()
        self._unsubs: list[CALLBACK_TYPE] = []
        self._store: Store = Store(hass, 1, f"{DOMAIN}.access_history")
        self._loaded = False
        self._pending_incomplete = False

    async def async_start(self) -> None:
        if self._unsubs:
            return
        for kind in EVENT_KINDS:
            self._unsubs.append(
                self.hass.bus.async_listen(f"{EVENT_PREFIX}{kind}", self._make_handler(kind))
            )
        await self.async_load()

    async def async_load(self) -> None:
        if self._loaded:
            return
        self._loaded = True
        stored = await self._store.async_load()
        if isinstance(stored, dict) and isinstance(stored.get("history"), list):
            for item in stored["history"][-HISTORY_KEEP:]:
                if isinstance(item, dict):
                    self.history.append(item)

    async def async_stop(self) -> None:
        for unsub in self._unsubs:
            unsub()
        self._unsubs.clear()
        self._subscribers.clear()

    def subscribe(self, send: Any) -> CALLBACK_TYPE:
        self._subscribers.add(send)

        @callback
        def _unsub() -> None:
            self._subscribers.discard(send)

        return _unsub

    @callback
    def _push(self, message: dict[str, Any]) -> None:
        for send in list(self._subscribers):
            send(message)

    def _make_handler(self, kind: str):
        @callback
        def _handle(event: Event) -> None:
            self.handle_event(kind, dict(event.data), event.time_fired)

        return _handle

    @callback
    def handle_event(self, kind: str, data: dict[str, Any], fired: datetime | None = None) -> None:
        time = (fired or dt_util.utcnow()).isoformat()
        if kind == "users":
            users = self._assembler.add(parse_users_page(data))
            if str(data.get("page", "1")) == "1":
                self._pending_incomplete = False
            if str(data.get("incomplete", "")).lower() == "true":
                self._pending_incomplete = True
            if users is None:
                return
            self.incomplete = self._pending_incomplete
            self.users = users
            self.listed_at = time
            self._push(
                {"event": "users", "users": users, "listed_at": time, "incomplete": self.incomplete}
            )
            self.hass.async_create_task(self.async_publish_meta())
            return
        payload = _event_payload(kind, data)
        if kind == "audit":
            # Only the lockout is new information; unlocks/denials come as recognized/rejected.
            if payload.get("action") != "lockout":
                return
            kind = "lockout"
        if kind == "enrolled" and payload.get("ok") and payload.get("user_id"):
            self.hass.async_create_task(self._stamp(payload["user_id"]))
            self._upsert_user(payload, time)
        if kind == "deleted" and payload.get("ok") and payload.get("user_id"):
            self.hass.async_create_task(self._forget(payload["user_id"]))
            if self.users is not None:
                self.users = [u for u in self.users if u["id"] != payload["user_id"]]
                self._push_users(time)
        if kind in HISTORY_KINDS:
            self.history.append({"kind": kind, "time": time, **payload})
            self._store.async_delay_save(lambda: {"history": list(self.history)}, 5)
        self._push({"event": kind, "time": time, "data": payload})

        if kind in HISTORY_KINDS:
            self.hass.async_create_task(self.async_publish_meta())

    @callback
    def _upsert_user(self, payload: dict[str, Any], time: str) -> None:
        """A successful enrolment (panel, HA script or automation) shows up without a re-list."""
        if self.users is None:
            return  # never listed since start: the panel lists on load
        uid = payload["user_id"]
        try:
            kind = modality(uid)
        except AccessError:
            return
        user = {"id": uid, "type": kind, "name": str(payload.get("name") or "")[:20], "allowed": True}
        self.users = sorted([u for u in self.users if u["id"] != uid] + [user], key=lambda u: u["id"])
        self._push_users(time)

    @callback
    def _push_users(self, time: str) -> None:
        self.listed_at = time
        self._push(
            {"event": "users", "users": self.users, "listed_at": time, "incomplete": self.incomplete}
        )

    def history_page(self, before: str | None, limit: int) -> list[dict[str, Any]]:
        """Newest first, strictly older than ``before`` (ISO time) – paging for Historie."""
        items = list(reversed(self.history))
        if before:
            items = [h for h in items if str(h.get("time", "")) < before]
        return items[:limit]

    async def _forget(self, user_id: int) -> None:
        await self.hass.async_add_executor_job(self.labels.forget, user_id)
        await self.async_publish_meta()

    async def _stamp(self, user_id: int) -> None:
        today = dt_util.now().date().isoformat()
        await self.hass.async_add_executor_job(self.labels.stamp_enrolled, user_id, today)
        await self.async_publish_meta()

    def compute_meta(self, doc: dict[str, Any]) -> dict[str, Any]:
        """Labels + per-ID health and re-enrol advice for the IDs currently in the sensor."""
        now = dt_util.utcnow()
        today = dt_util.now().date()
        history = list(self.history)
        health: dict[str, Any] = {}
        advice: dict[str, list[str]] = {}
        for user in self.users or []:
            uid = user["id"]
            label = doc["labels"].get(str(uid), {})
            person = label.get("person") or user["name"]
            child = doc["people"].get(fold(person), {}).get("child", False)
            health[str(uid)] = entry_health(uid, history, now)
            reasons = reenroll_reasons(label.get("enrolled_at"), child, health[str(uid)], today)
            if reasons:
                advice[str(uid)] = reasons
        return {
            "labels": doc["labels"],
            "people": doc["people"],
            "settings": doc["settings"],
            "health": health,
            "advice": advice,
        }

    async def async_publish_meta(self) -> dict[str, Any]:
        doc = await self.hass.async_add_executor_job(self.labels.load_all)
        meta = self.compute_meta(doc)
        self._push({"event": "meta", **meta})
        await self._notify(doc, meta)
        return meta

    async def _notify(self, doc: dict[str, Any], meta: dict[str, Any]) -> None:
        """One persistent notification per ID when the advice first appears (setting on)."""
        if not doc["settings"].get("notify_reenroll", True):
            return
        fresh = [int(uid) for uid in meta["advice"] if int(uid) not in doc["notified"]]
        if not fresh:
            return
        for uid in fresh:
            user = next((u for u in self.users or [] if u["id"] == uid), None)
            if user is None:
                continue
            label = doc["labels"].get(str(uid), {})
            await self.hass.services.async_call(
                "persistent_notification",
                "create",
                {
                    "title": "BioLock: doporučeno přezapsat",
                    "message": notification_text(
                        label.get("person") or user["name"],
                        user["type"],
                        label.get("hand"),
                        meta["advice"][str(uid)],
                    ),
                    "notification_id": f"homebrain_access_reenroll_{uid}",
                },
                blocking=False,
            )
        await self.hass.async_add_executor_job(self.labels.mark_notified, fresh)

    async def async_state(self) -> dict[str, Any]:
        await self.async_load()
        doc = await self.hass.async_add_executor_job(self.labels.load_all)
        return {
            "users": self.users,
            "listed_at": self.listed_at,
            "incomplete": self.incomplete,
            **self.compute_meta(doc),
            "history": list(reversed(self.history))[:HISTORY_MAX],
            "entities": {**resolve_lock_entities(self.hass), **ENTITIES},
        }

    async def async_set_label(self, user_id: int, hand: str | None, person: str | None) -> dict:
        labels = await self.hass.async_add_executor_job(self.labels.set, user_id, hand, person)
        await self.async_publish_meta()
        return labels

    async def async_command(self, action: str, data: dict[str, Any]) -> None:
        if action in ("biometric", "service_mode"):
            service = "turn_on" if data["on"] else "turn_off"
            await self.hass.services.async_call(
                "switch", service, {"entity_id": ENTITIES[action]}, blocking=True
            )
            return
        if action == "recognition_action":
            await self.hass.services.async_call(
                "select",
                "select_option",
                {"entity_id": ENTITIES[action], "option": data["option"]},
                blocking=True,
            )
            return
        service = f"{DEVICE}_{action}"
        if not self.hass.services.has_service("esphome", service):
            raise AccessError("device_unavailable")
        if "timeout_s" in data and "timeout_s" not in _service_fields(self.hass, service):
            data = {k: v for k, v in data.items() if k != "timeout_s"}
        await self.hass.services.async_call("esphome", service, data, blocking=True)


_LOCK_MAKER = re.compile(r"nuki|smart ?lock", re.IGNORECASE)


def resolve_lock_entities(hass: HomeAssistant) -> dict[str, str]:
    """Find the smart lock (not the BioLock BLE proxy) and its sibling entities.

    Picks the first ``lock`` entity whose device maker/model looks like a Nuki and that does not
    belong to the BioLock ESPHome device, then the battery sensor / critical-battery binary sensor
    and the lock-action ``event`` entity of the same device. Explicit panel bindings still win.
    """
    ent_reg = er.async_get(hass)
    dev_reg = dr.async_get(hass)
    found: dict[str, str] = {}
    for entry in sorted(ent_reg.entities.values(), key=lambda e: e.entity_id):
        if entry.domain != "lock" or entry.platform == "esphome" or entry.disabled_by:
            continue
        device = dev_reg.async_get(entry.device_id) if entry.device_id else None
        maker = f"{getattr(device, 'manufacturer', '') or ''} {getattr(device, 'model', '') or ''}"
        if device is None or not _LOCK_MAKER.search(maker):
            continue
        found["lock"] = entry.entity_id
        for sibling in er.async_entries_for_device(ent_reg, device.id):
            dclass = sibling.device_class or sibling.original_device_class
            if sibling.domain == "sensor" and dclass == "battery":
                found.setdefault("lockBattery", sibling.entity_id)
            elif sibling.domain == "binary_sensor" and dclass == "battery":
                found.setdefault("lockBatteryCritical", sibling.entity_id)
            elif sibling.domain == "event":
                found.setdefault("lockAction", sibling.entity_id)
        break
    return found


def _service_fields(hass: HomeAssistant, service: str) -> set[str]:
    """Field names an ESPHome action declares (older firmware has no ``timeout_s``)."""
    svc = hass.services.async_services_for_domain("esphome").get(service)
    schema = getattr(getattr(svc, "schema", None), "schema", None)
    return {str(key) for key in schema} if isinstance(schema, dict) else set()


async def async_get_manager(hass: HomeAssistant) -> AccessManager:
    data = hass.data.setdefault(DOMAIN, {})
    if (manager := data.get(_MANAGER_KEY)) is None:
        manager = data[_MANAGER_KEY] = AccessManager(hass)
        await manager.async_start()
    return manager


async def async_stop(hass: HomeAssistant) -> None:
    if (manager := hass.data.get(DOMAIN, {}).pop(_MANAGER_KEY, None)) is not None:
        await manager.async_stop()


@websocket_api.websocket_command({vol.Required("type"): "homebrain/access/state"})
@websocket_api.require_admin
@websocket_api.async_response
async def ws_state(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict
) -> None:
    manager = await async_get_manager(hass)
    connection.send_result(msg["id"], await manager.async_state())


@websocket_api.websocket_command({vol.Required("type"): "homebrain/access/subscribe"})
@websocket_api.require_admin
@websocket_api.async_response
async def ws_subscribe(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict
) -> None:
    manager = await async_get_manager(hass)

    @callback
    def _send(message: dict[str, Any]) -> None:
        connection.send_message(websocket_api.event_message(msg["id"], message))

    connection.subscriptions[msg["id"]] = manager.subscribe(_send)
    connection.send_result(msg["id"])


@websocket_api.websocket_command(
    {
        vol.Required("type"): "homebrain/access/command",
        vol.Required("action"): vol.In(tuple(ACTIONS)),
        vol.Optional("data", default={}): dict,
    }
)
@websocket_api.require_admin
@websocket_api.async_response
async def ws_command(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict
) -> None:
    try:
        data = ACTIONS[msg["action"]](msg["data"])
    except vol.Invalid as err:
        connection.send_error(msg["id"], "invalid_format", str(err))
        return
    manager = await async_get_manager(hass)
    try:
        await manager.async_command(msg["action"], data)
    except AccessError as err:
        connection.send_error(msg["id"], err.code, err.code)
        return
    except (HomeAssistantError, vol.Invalid) as err:
        connection.send_error(msg["id"], "service_failed", str(err))
        return
    connection.send_result(msg["id"], {"ok": True})


@websocket_api.websocket_command(
    {
        vol.Required("type"): "homebrain/access/label",
        vol.Required("user_id"): USER_ID,
        vol.Optional("hand"): vol.Any(None, str),
        vol.Optional("person"): vol.Any(None, str),
    }
)
@websocket_api.require_admin
@websocket_api.async_response
async def ws_label(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict
) -> None:
    manager = await async_get_manager(hass)
    try:
        labels = await manager.async_set_label(msg["user_id"], msg.get("hand"), msg.get("person"))
    except AccessError as err:
        connection.send_error(msg["id"], err.code, err.code)
        return
    connection.send_result(msg["id"], {"labels": labels})


@websocket_api.websocket_command(
    {
        vol.Required("type"): "homebrain/access/person",
        vol.Required("person"): vol.All(str, vol.Length(min=1, max=40)),
        vol.Required("child"): bool,
    }
)
@websocket_api.require_admin
@websocket_api.async_response
async def ws_person(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict
) -> None:
    manager = await async_get_manager(hass)
    try:
        await hass.async_add_executor_job(manager.labels.set_person, msg["person"], msg["child"])
    except AccessError as err:
        connection.send_error(msg["id"], err.code, err.code)
        return
    connection.send_result(msg["id"], await manager.async_publish_meta())


@websocket_api.websocket_command(
    {vol.Required("type"): "homebrain/access/settings", vol.Required("notify_reenroll"): bool}
)
@websocket_api.require_admin
@websocket_api.async_response
async def ws_settings(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict
) -> None:
    manager = await async_get_manager(hass)
    await hass.async_add_executor_job(
        lambda: manager.labels.set_settings(notify_reenroll=msg["notify_reenroll"])
    )
    connection.send_result(msg["id"], await manager.async_publish_meta())


@websocket_api.websocket_command(
    {
        vol.Required("type"): "homebrain/access/history",
        vol.Optional("before"): vol.Any(None, str),
        vol.Optional("limit", default=100): vol.All(vol.Coerce(int), vol.Range(min=1, max=HISTORY_PAGE)),
    }
)
@websocket_api.require_admin
@websocket_api.async_response
async def ws_history(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict
) -> None:
    manager = await async_get_manager(hass)
    await manager.async_load()
    items = manager.history_page(msg.get("before"), msg["limit"])
    connection.send_result(msg["id"], {"items": items, "more": len(items) == msg["limit"]})


def async_register(hass: HomeAssistant) -> None:
    for handler in (
        ws_state,
        ws_subscribe,
        ws_command,
        ws_label,
        ws_person,
        ws_settings,
        ws_history,
    ):
        websocket_api.async_register_command(hass, handler)
