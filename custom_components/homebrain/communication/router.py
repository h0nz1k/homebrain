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
        self.state = {"audit": [], "queue": [], "pending": {}, "dedup": {}, "digest_skipped": {}}
        self.lock = asyncio.Lock()
        self.tick_lock = asyncio.Lock()
        self.inflight = set()
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
            self.state["pending"] = {
                key: value
                for key, value in self.state["pending"].items()
                if value["message"]["priority"] in ("high", "critical")
            }
        self.stops = [
            self.hass.bus.async_listen("mobile_app_notification_action", self._ack_event),
            async_track_time_interval(self.hass, self.tick, timedelta(seconds=30)),
        ]

    async def stop(self):
        for stop in self.stops:
            stop()
        self.stops.clear()
        async with self.lock:
            await self.save(immediate=True)

    async def save(self, *, immediate=False):
        if immediate:
            await self.store.async_save(deepcopy(self.state))
        else:
            self.store.async_delay_save(lambda: deepcopy(self.state), 5)

    def snapshot(self):
        return [
            {
                **deepcopy(row),
                "pending_ack": row["notification_id"] in self.state["pending"]
                and row["channel"] == "push"
                and row["status"] == "sent",
            }
            for row in reversed(self.state["audit"])
        ]

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

    def _remember(self, message, now):
        if not message.get("tag"):
            return
        key = f"{message['recipient']}:{message['tag']}"
        if len(self.state["dedup"]) >= 1000:
            del self.state["dedup"][min(self.state["dedup"], key=self.state["dedup"].get)]
        self.state["dedup"][key] = now.timestamp() + self.config["dedup_seconds"]

    def _digest_due(self, now):
        local = dt_util.as_local(now)
        hour, minute = map(int, self.config["digest_at"].split(":"))
        return (
            (local + timedelta(days=1))
            .replace(hour=hour, minute=minute, second=0, microsecond=0)
            .isoformat()
        )

    async def notify(self, request, context=None):
        config = self.config
        recipients = config["groups"].get(request["recipient"], [request["recipient"]])
        if not recipients or any(p not in config["people"] for p in recipients):
            raise ValueError("Unknown recipient")
        results = await asyncio.gather(
            *(
                self._notify_person(request, recipient, config["people"][recipient], context)
                for recipient in dict.fromkeys(recipients)
            )
        )
        return {"results": results}

    async def _notify_person(self, request, recipient, person, context):
        now = dt_util.utcnow()
        message = {
            **deepcopy(request),
            "id": uuid4().hex,
            "recipient": recipient,
            "created": now.isoformat(),
        }
        key = (recipient, request.get("tag"))
        async with self.lock:
            self._prune(now)
            duplicate = request.get("tag") and (
                f"{recipient}:{request['tag']}" in self.state["dedup"]
                or key in self.inflight
                or any(
                    m["recipient"] == recipient and m.get("tag") == request["tag"]
                    for m in self.state["queue"]
                )
            )
            queued = message["priority"] == "info" or (
                message["priority"] != "critical" and self.quiet(person, now)
            )
            if duplicate:
                self.audit(message, "router", "duplicate", now=now)
                status = "duplicate"
            elif queued:
                if len(self.state["queue"]) >= LIMIT:
                    self.audit(message, "router", "failed", "queue_full", now)
                    status = "failed"
                else:
                    if message["priority"] == "info":
                        local = dt_util.as_local(now)
                        hour, minute = map(int, self.config["digest_at"].split(":"))
                        due = local.replace(hour=hour, minute=minute, second=0, microsecond=0)
                        message["due"] = (
                            due if due > local else due + timedelta(days=1)
                        ).isoformat()
                    self.state["queue"].append(message)
                    self.audit(message, "router", "queued", now=now)
                    status = "queued"
            else:
                self.inflight.add(key)
                status = None
            await self.save()
        if status is None:
            try:
                status = await self._send(message, person, now, context=context)
                if status == "sent":
                    self._remember(message, dt_util.utcnow())
            finally:
                self.inflight.discard(key)
                await self.save()
        return {"id": message["id"], "status": status}

    async def _send(self, message, person, now, *, context=None, escalation=False, digest=False):
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
            now = dt_util.utcnow()
            if not digest:
                self.audit(message, channel, status, reason, now)
            if status == "sent":
                if digest:
                    self.audit(message, channel, status, reason, now)
                if channel == "push" and message["priority"] in ("high", "critical"):
                    if len(self.state["pending"]) >= LIMIT:
                        # Do not silently evict an existing unacknowledged alarm.
                        self.audit(message, "router", "failed", "pending_full", now)
                        await self._send(message, person, now, escalation=True)
                    else:
                        self.state["pending"][message["id"]] = {
                            "message": message,
                            "due": (now + timedelta(minutes=5)).isoformat(),
                            "expires": (now + TTL).isoformat(),
                        }
                        async with self.lock:
                            await self.save(immediate=True)
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
            message = (
                pending["message"]
                if pending
                else next(
                    (
                        row
                        for row in reversed(self.state["audit"])
                        if row["notification_id"] == notification_id
                        and row["channel"] == "push"
                        and row["status"] == "sent"
                    ),
                    None,
                )
            )
            if message and not any(
                row["notification_id"] == notification_id and row["ack"]
                for row in self.state["audit"]
            ):
                self.audit({**message, "id": notification_id}, "push", "acknowledged")
                await self.save(immediate=bool(pending))

    async def tick(self, _time=None):
        async with self.tick_lock:
            now = dt_util.utcnow()
            config = self.config
            changed = self._prune(now)
            digest = {}
            deliveries = []
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
                    deliveries.append(self._flush_message(message, person, now))
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
                deliveries.append(self._digest(recipient, forced, messages, config, now))
            for key, pending in list(self.state["pending"].items()):
                message = pending["message"]
                if pending.get("expires") and datetime.fromisoformat(pending["expires"]) <= now:
                    changed = True
                    self.audit(message, "router", "failed", "ack_expired", now)
                    del self.state["pending"][key]
                    async with self.lock:
                        await self.save(immediate=True)
                    continue
                if pending["due"] is None or datetime.fromisoformat(pending["due"]) > now:
                    continue
                person = config["people"].get(message["recipient"])
                if person and message["priority"] != "critical" and self.quiet(person, now):
                    continue
                changed = True
                deliveries.append(self._escalate(key, pending, person, now))
            if deliveries:
                await asyncio.gather(*deliveries)
            if changed:
                await self.save()

    async def _flush_message(self, message, person, now):
        if await self._send(message, person, now) == "sent":
            self._remember(message, dt_util.utcnow())
        self.state["queue"].remove(message)

    async def _escalate(self, key, pending, person, now):
        # An acknowledgement may arrive while another delivery is completing.
        if key not in self.state["pending"]:
            return
        message = pending["message"]
        if person:
            await self._send(message, person, now, escalation=True)
        else:
            self.audit(message, "router", "failed", "removed", now)
        self.state["pending"].pop(key, None)
        async with self.lock:
            await self.save(immediate=True)

    async def _digest(self, recipient, forced, messages, config, now):
        summary = {
            "id": uuid4().hex,
            "recipient": recipient,
            "priority": "info",
            "title": "Denní souhrn",
            "message": "\n".join(m["message"] for m in messages),
        }
        person = config["people"][recipient]
        choices = [
            c
            for c in person["preferences"]
            if c in ("telegram", "email", "todo") and person["channels"].get(c)
        ]
        if forced:
            summary["channel"] = forced
        if (forced and not person["channels"].get(forced)) or (not forced and not choices):
            day = dt_util.as_local(now).date().isoformat()
            if self.state["digest_skipped"].get(recipient) != day:
                self.audit(summary, "router", "skipped", "no_digest_channel", now)
                self.state["digest_skipped"] = {
                    key: value
                    for key, value in self.state["digest_skipped"].items()
                    if key in config["people"]
                }
                self.state["digest_skipped"][recipient] = day
            for message in messages:
                message["due"] = self._digest_due(now)
            return
        status = await self._send(summary, {**person, "preferences": choices}, now, digest=True)
        if status == "sent":
            for message in messages:
                self.state["queue"].remove(message)
                self._remember(message, dt_util.utcnow())
        else:
            for message in messages:
                attempt = message.get("digest_attempt", 0)
                delays = (5, 30, 120)
                message["due"] = (
                    (now + timedelta(minutes=delays[attempt])).isoformat()
                    if attempt < len(delays)
                    else self._digest_due(now)
                )
                message["digest_attempt"] = attempt + 1 if attempt < len(delays) else 0
