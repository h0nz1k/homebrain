"""Persistent bounded notification router. Local HA time governs quiet hours/digests."""

from __future__ import annotations

import asyncio
from copy import deepcopy
from datetime import datetime, timedelta
from uuid import uuid4

from homeassistant.core import callback
from homeassistant.helpers.event import async_track_time_interval
from homeassistant.helpers.storage import Store
from homeassistant.util import dt as dt_util

from .adapters import deliver
from .config import DEFAULT, OPTION, validate

LIMIT = 200
TTL = timedelta(days=7)


class Router:
    def __init__(self, hass, entry):
        self.hass = hass
        self.entry = entry
        self.store = Store(hass, 1, "homebrain.communication")
        self.state = {"audit": [], "queue": [], "pending": {}, "dedup": {}}
        self.lock = asyncio.Lock()
        self.stops = []

    @property
    def config(self):
        return validate(self.entry.options.get(OPTION, DEFAULT))

    async def start(self):
        # Validate before installing any handlers; invalid options isolate this module.
        _ = self.config
        saved = await self.store.async_load()
        if saved:
            self.state.update(saved)
        self.stops = [
            self.hass.bus.async_listen("mobile_app_notification_action", self._ack_event),
            async_track_time_interval(self.hass, self.tick, timedelta(seconds=30)),
        ]

    async def stop(self):
        for stop in self.stops:
            stop()
        self.stops.clear()
        async with self.lock:
            await self.save()

    async def save(self):
        await self.store.async_save(self.state)

    def snapshot(self):
        return deepcopy(list(reversed(self.state["audit"])))

    def audit(self, message, channel, status, reason="", now=None):
        self.state["audit"].append(
            {
                "id": uuid4().hex,
                "notification_id": message["id"],
                "recipient": message["recipient"],
                "message": message["message"],
                "title": message.get("title", "HomeBrain"),
                "priority": message["priority"],
                "at": (now or dt_util.utcnow()).isoformat(),
                "channel": channel,
                "status": status,
                "reason": reason,
                "ack": status == "acknowledged",
            }
        )
        self.state["audit"] = self.state["audit"][-LIMIT:]

    def quiet(self, person, now):
        start, end = person["quiet_start"], person["quiet_end"]
        clock = dt_util.as_local(now).strftime("%H:%M")
        if start == end:
            return False
        return start <= clock < end if start < end else clock >= start or clock < end

    def _prune(self, now):
        previous = len(self.state["dedup"])
        self.state["dedup"] = {
            key: stamp for key, stamp in self.state["dedup"].items() if stamp > now.timestamp()
        }
        return len(self.state["dedup"]) != previous

    async def notify(self, request, context=None):
        async with self.lock:
            now = dt_util.utcnow()
            config = self.config
            recipients = config["groups"].get(request["recipient"], [request["recipient"]])
            if not recipients or any(p not in config["people"] for p in recipients):
                raise ValueError("Unknown recipient")
            results = []
            self._prune(now)
            for recipient in dict.fromkeys(recipients):
                message = {
                    **deepcopy(request),
                    "id": uuid4().hex,
                    "recipient": recipient,
                    "created": now.isoformat(),
                }
                person = config["people"][recipient]
                key = f"{recipient}:{request['tag']}" if request.get("tag") else None
                if key and key in self.state["dedup"]:
                    self.audit(message, "router", "duplicate", now=now)
                    results.append({"id": message["id"], "status": "duplicate"})
                    continue
                queued = message["priority"] == "info" or (
                    message["priority"] != "critical" and self.quiet(person, now)
                )
                if queued and len(self.state["queue"]) >= LIMIT:
                    self.audit(message, "router", "failed", "queue_full", now)
                    results.append({"id": message["id"], "status": "failed"})
                    continue
                if key:
                    # Bounded dedup cache, including unique caller-supplied tags.
                    if len(self.state["dedup"]) >= 1000:
                        del self.state["dedup"][
                            min(self.state["dedup"], key=self.state["dedup"].get)
                        ]
                    self.state["dedup"][key] = now.timestamp() + config["dedup_seconds"]
                if queued:
                    if message["priority"] == "info":
                        local = dt_util.as_local(now)
                        hour, minute = map(int, config["digest_at"].split(":"))
                        due = local.replace(hour=hour, minute=minute, second=0, microsecond=0)
                        if due <= local:
                            due += timedelta(days=1)
                        message["due"] = due.isoformat()
                    self.state["queue"].append(message)
                    self.audit(message, "router", "queued", now=now)
                    status = "queued"
                else:
                    status = await self._send(message, person, now, context=context)
                results.append({"id": message["id"], "status": status})
            await self.save()
            return {"results": results}

    async def _send(self, message, person, now, *, context=None, escalation=False):
        if escalation:
            channels = [c for c in person["preferences"] if c in ("telegram", "email")]
        elif message.get("channel"):
            channels = [message["channel"]]
        else:
            channels = person["preferences"]
        for channel in channels:
            status, reason = await deliver(
                self.hass, channel, person["channels"].get(channel), message, context
            )
            self.audit(message, channel, status, reason, now)
            if status == "sent":
                if channel == "push":
                    escalate = message["priority"] in ("high", "critical")
                    if len(self.state["pending"]) >= LIMIT:
                        # Do not silently evict an existing unacknowledged alarm.
                        self.audit(message, "router", "failed", "pending_full", now)
                        if escalate:
                            await self._send(message, person, now, escalation=True)
                    else:
                        self.state["pending"][message["id"]] = {
                            "message": message,
                            "due": (now + timedelta(minutes=5)).isoformat() if escalate else None,
                            "expires": (now + TTL).isoformat(),
                        }
                return "sent"
        self.audit(message, "router", "failed", "no_channel", now)
        return "failed"

    @callback
    def _ack_event(self, event):
        action = event.data.get("action", "")
        if isinstance(action, str) and action.startswith("HOMEBRAIN_ACK_"):
            self.hass.async_create_task(self.ack(action.removeprefix("HOMEBRAIN_ACK_")))

    async def ack(self, notification_id):
        async with self.lock:
            pending = self.state["pending"].pop(notification_id, None)
            if pending:
                self.audit(pending["message"], "push", "acknowledged")
                await self.save()

    async def tick(self, _time=None):
        async with self.lock:
            now = dt_util.utcnow()
            config = self.config
            changed = self._prune(now)
            digest = {}
            for message in list(self.state["queue"]):
                person = config["people"].get(message["recipient"])
                expired = now - datetime.fromisoformat(message["created"]) > TTL
                if not person or expired:
                    changed = True
                    self.state["queue"].remove(message)
                    self.audit(
                        message, "router", "failed", "expired" if expired else "removed", now
                    )
                    continue
                if self.quiet(person, now):
                    continue
                if message["priority"] == "info":
                    if datetime.fromisoformat(message["due"]) <= now:
                        # Preserve an explicit override; never combine different endpoints.
                        digest.setdefault(
                            (message["recipient"], message.get("channel")), []
                        ).append(message)
                else:
                    changed = True
                    await self._send(message, person, now)
                    self.state["queue"].remove(message)
            batches = []
            for key, messages in digest.items():
                batch, size = [], 0
                for message in messages:
                    extra = len(message["message"]) + bool(batch)
                    if batch and size + extra > 4096:
                        batches.append((key, batch))
                        batch, size = [], 0
                    batch.append(message)
                    size += len(message["message"]) + (len(batch) > 1)
                batches.append((key, batch))
            for (recipient, forced), messages in batches:
                changed = True
                summary = {
                    "id": uuid4().hex,
                    "recipient": recipient,
                    "priority": "info",
                    "title": "Denní souhrn",
                    "message": "\n".join(m["message"] for m in messages),
                }
                person = config["people"][recipient]
                # Informational messages use Telegram/email for the daily digest by default.
                choices = [c for c in person["preferences"] if c in ("telegram", "email", "todo")]
                if forced:
                    summary["channel"] = forced
                status = await self._send(summary, {**person, "preferences": choices}, now)
                if status == "sent":
                    for message in messages:
                        self.state["queue"].remove(message)
                        self.audit(message, "router", "digested", summary["id"], now)
            for key, pending in list(self.state["pending"].items()):
                message = pending["message"]
                if pending.get("expires") and datetime.fromisoformat(pending["expires"]) <= now:
                    changed = True
                    self.audit(message, "router", "failed", "ack_expired", now)
                    del self.state["pending"][key]
                    continue
                if pending["due"] is None or datetime.fromisoformat(pending["due"]) > now:
                    continue
                person = config["people"].get(message["recipient"])
                if person and message["priority"] != "critical" and self.quiet(person, now):
                    continue
                changed = True
                if person:
                    await self._send(message, person, now, escalation=True)
                else:
                    self.audit(message, "router", "failed", "removed", now)
                del self.state["pending"][key]
            if changed:
                await self.save()
