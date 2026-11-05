"""Server-side cooking timers (minutky) for Recepty.

Timers live in ``recipes.db`` (table ``timers``), so they survive an HA restart and every
device (kitchen tablet, phone, desktop) sees the same list through the
``homebrain/recipes/timers/subscribe`` WebSocket subscription.

On expiry the manager fires ``homebrain_recipe_timer_done`` (recipe steps, kept for existing
automations) and ``homebrain_timer_finished`` (``{name, timer_id, recipe_id}`` – every kitchen
timer incl. free „Minutky“ such as the egg timer) once, creates an HA persistent notification
(dismissed again on ack/cancel) and, when the
owner configured notify targets (Recepty settings, default none), sends
``⏰ Minutka: <krok> – hotovo`` through ``notify.<target>``. A timer that expired while HA
was down fires right after the restart (once – ``fired`` is persisted).
"""

from __future__ import annotations

import json
import logging
import re
import uuid
from collections.abc import Callable
from datetime import datetime
from typing import Any

from homeassistant.components import persistent_notification
from homeassistant.core import CALLBACK_TYPE, HomeAssistant, callback
from homeassistant.helpers.event import async_track_point_in_utc_time
from homeassistant.util import dt as dt_util

from .store import RecipeStore

_LOGGER = logging.getLogger(__name__)

EVENT_TIMER_DONE = "homebrain_recipe_timer_done"
EVENT_TIMER_FINISHED = "homebrain_timer_finished"
SETTING_TIMER_NOTIFY = "timer_notify_targets"
NOTIFY_TARGET_RE = re.compile(r"^[a-z0-9_]{1,80}$")
MAX_TIMERS = 20
MAX_SECONDS = 24 * 3600
LABEL_MAX = 120
OPS = ("pause", "resume", "add_time", "ack")


class TimerError(Exception):
    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


def now_ms() -> int:
    return int(dt_util.utcnow().timestamp() * 1000)


def notify_message(label: str) -> str:
    return f"⏰ Minutka: {label} – hotovo"


def notification_id(timer_id: str) -> str:
    return f"homebrain_timer_{timer_id}"


def parse_targets(raw: str | None) -> list[str]:
    try:
        value = json.loads(raw) if raw else []
    except ValueError:
        return []
    if not isinstance(value, list):
        return []
    return [t for t in value if isinstance(t, str) and NOTIFY_TARGET_RE.match(t)]


def public(timer: dict[str, Any]) -> dict[str, Any]:
    """camelCase view for the panel (same shape as the frontend ``Timer``)."""
    return {
        "id": timer["id"],
        "label": timer["label"],
        "recipeId": timer.get("recipe_id"),
        "stepIndex": timer.get("step_index"),
        "durationMs": timer["duration_ms"],
        "endsAt": timer.get("ends_at"),
        "pausedRemainingMs": timer.get("paused_remaining_ms"),
        "acknowledged": bool(timer.get("acknowledged")),
    }


class RecipeTimers:
    """Owns the timer rows, the expiry callbacks and the WS subscribers."""

    def __init__(self, hass: HomeAssistant, store: RecipeStore) -> None:
        self.hass = hass
        self.store = store
        self._timers: dict[str, dict[str, Any]] = {}
        self._unsub: dict[str, CALLBACK_TYPE] = {}
        self._listeners: set[Callable[[dict[str, Any]], None]] = set()

    # ---------- lifecycle ----------
    async def async_load(self) -> None:
        """Restore persisted timers; expired-while-down timers fire now (once)."""
        rows = await self.hass.async_add_executor_job(self.store.timers)
        self._timers = {row["id"]: row for row in rows}
        for timer in list(self._timers.values()):
            self._schedule(timer)

    @callback
    def async_stop(self) -> None:
        for unsub in self._unsub.values():
            unsub()
        self._unsub.clear()
        self._listeners.clear()

    # ---------- queries ----------
    def snapshot(self) -> dict[str, Any]:
        return {"timers": [public(t) for t in self._timers.values()], "serverNow": now_ms()}

    @callback
    def async_listen(self, listener: Callable[[dict[str, Any]], None]) -> CALLBACK_TYPE:
        self._listeners.add(listener)

        @callback
        def remove() -> None:
            self._listeners.discard(listener)

        return remove

    # ---------- commands ----------
    async def async_start(
        self,
        label: str,
        seconds: int,
        recipe_id: str | None = None,
        step_index: int | None = None,
    ) -> dict[str, Any]:
        if not 1 <= seconds <= MAX_SECONDS:
            raise TimerError("INVALID_FIELD")
        if len(self._timers) >= MAX_TIMERS:
            raise TimerError("TOO_MANY_TIMERS")
        if recipe_id is not None and step_index is not None:
            # One timer per recipe step: a second device starting it joins the running one.
            for timer in self._timers.values():
                if timer["recipe_id"] == recipe_id and timer["step_index"] == step_index:
                    self._publish()  # drop the caller's optimistic duplicate
                    return public(timer)
        duration = seconds * 1000
        timer = {
            "id": uuid.uuid4().hex,
            "label": label.strip()[:LABEL_MAX] or "Minutka",
            "recipe_id": recipe_id,
            "step_index": step_index,
            "duration_ms": duration,
            "ends_at": now_ms() + duration,
            "paused_remaining_ms": None,
            "acknowledged": False,
            "fired": False,
        }
        await self._save(timer)
        return public(timer)

    async def async_update(self, timer_id: str, op: str, seconds: int = 60) -> dict[str, Any]:
        if (timer := self._timers.get(timer_id)) is None:
            raise TimerError("TARGET_NOT_FOUND")
        timer = dict(timer)
        now = now_ms()
        if op == "pause" and timer["ends_at"] is not None and timer["ends_at"] > now:
            timer.update(paused_remaining_ms=timer["ends_at"] - now, ends_at=None)
        elif op == "resume" and timer["ends_at"] is None:
            timer.update(
                ends_at=now + (timer["paused_remaining_ms"] or 0), paused_remaining_ms=None
            )
        elif op == "add_time":
            if not 1 <= seconds <= 3600:
                raise TimerError("INVALID_FIELD")
            add = seconds * 1000
            timer.update(duration_ms=timer["duration_ms"] + add, acknowledged=False, fired=False)
            if timer["ends_at"] is not None:
                timer["ends_at"] = max(timer["ends_at"], now) + add
            else:
                timer["paused_remaining_ms"] = (timer["paused_remaining_ms"] or 0) + add
        elif op == "ack":
            timer["acknowledged"] = True
        await self._save(timer)
        if op in ("ack", "add_time"):
            self._dismiss(timer_id)
        return public(timer)

    async def async_cancel(self, timer_id: str) -> bool:
        if self._timers.pop(timer_id, None) is None:
            return False
        if (unsub := self._unsub.pop(timer_id, None)) is not None:
            unsub()
        await self.hass.async_add_executor_job(self.store.delete_timer, timer_id)
        self._dismiss(timer_id)
        self._publish()
        return True

    @callback
    def _dismiss(self, timer_id: str) -> None:
        if "persistent_notification" in self.hass.config.components:
            persistent_notification.async_dismiss(self.hass, notification_id(timer_id))

    # ---------- internals ----------
    async def _save(self, timer: dict[str, Any]) -> None:
        await self.hass.async_add_executor_job(self.store.save_timer, timer)
        self._timers[timer["id"]] = timer
        self._schedule(timer)
        self._publish()

    @callback
    def _publish(self) -> None:
        payload = self.snapshot()
        for listener in list(self._listeners):
            listener(payload)

    @callback
    def _schedule(self, timer: dict[str, Any]) -> None:
        if (unsub := self._unsub.pop(timer["id"], None)) is not None:
            unsub()
        if timer["fired"] or timer["ends_at"] is None:
            return
        if timer["ends_at"] <= now_ms():
            self.hass.async_create_task(self._async_fire(timer["id"]))
            return
        when = dt_util.utc_from_timestamp(timer["ends_at"] / 1000)

        @callback
        def _due(_now: datetime) -> None:
            self._unsub.pop(timer["id"], None)
            self.hass.async_create_task(self._async_fire(timer["id"]))

        self._unsub[timer["id"]] = async_track_point_in_utc_time(self.hass, _due, when)

    async def _async_fire(self, timer_id: str) -> None:
        timer = self._timers.get(timer_id)
        if timer is None or timer["fired"] or timer["ends_at"] is None:
            return
        timer = {**timer, "fired": True}
        await self.hass.async_add_executor_job(self.store.save_timer, timer)
        self._timers[timer_id] = timer
        self._publish()
        self.hass.bus.async_fire(
            EVENT_TIMER_DONE,
            {
                "timer_id": timer_id,
                "label": timer["label"],
                "recipe_id": timer["recipe_id"],
                "step_index": timer["step_index"],
            },
        )
        self.hass.bus.async_fire(
            EVENT_TIMER_FINISHED,
            {"name": timer["label"], "timer_id": timer_id, "recipe_id": timer["recipe_id"]},
        )
        if "persistent_notification" in self.hass.config.components:
            persistent_notification.async_create(
                self.hass,
                f"⏰ {timer['label']} – hotovo",
                title="Minutka doběhla",
                notification_id=notification_id(timer_id),
            )
        raw = await self.hass.async_add_executor_job(self.store.setting, SETTING_TIMER_NOTIFY)
        for target in parse_targets(raw):
            if not self.hass.services.has_service("notify", target):
                _LOGGER.warning("Recepty: notify.%s for timers does not exist", target)
                continue
            try:
                await self.hass.services.async_call(
                    "notify",
                    target,
                    {"title": "Recepty", "message": notify_message(timer["label"])},
                    blocking=False,
                )
            except Exception:  # noqa: BLE001 - one broken target must not stop the others
                _LOGGER.exception("Recepty: notify.%s failed", target)
