"""Delivery through configured existing HA services only; no provider credentials."""

from __future__ import annotations

import asyncio
import logging
from copy import deepcopy

_LOGGER = logging.getLogger(__name__)


async def deliver(hass, channel, config, message, context=None):
    """Return sent/skipped/failed and a safe reason (never log payloads or exceptions)."""
    if not config:
        _LOGGER.info("HomeBrain channel %s skipped: unconfigured", channel)
        return "skipped", "unconfigured"
    text, title = message["message"], message.get("title", "HomeBrain")
    if channel == "push":
        domain, service = config.split(".", 1)
        data = deepcopy(message.get("data", {}))
        data["actions"] = [{"action": "HOMEBRAIN_ACK_" + message["id"], "title": "Beru"}]
        data["tag"] = message["id"]
        if message["priority"] == "critical":
            data.update(
                {
                    "push": {"sound": {"name": "default", "critical": 1, "volume": 1}},
                    "ttl": 0,
                    "priority": "high",
                    "channel": "alarm_stream",
                }
            )
        payload = {"message": text, "title": title, "data": data}
    elif channel == "todo":
        domain, service = "todo", "add_item"
        payload = {"entity_id": config, "item": text}
    elif channel == "tts":
        domain, service = "tts", "speak"
        payload = {**config, "message": text}
    elif channel in ("telegram", "email"):
        if "entity_id" in config:
            domain, service = "notify", "send_message"
            payload = {"entity_id": config["entity_id"], "message": text, "title": title}
        else:
            domain, service = config["service"].split(".", 1)
            payload = {"message": text, "title": title}
            if config.get("target"):
                payload["target"] = config["target"]
    else:
        return "skipped", "unsupported"
    if not hass.services.has_service(domain, service):
        _LOGGER.info("HomeBrain channel %s skipped: service unavailable", channel)
        return "skipped", "service_unavailable"
    try:
        async with asyncio.timeout(10):
            await hass.services.async_call(domain, service, payload, blocking=True, context=context)
    except Exception:  # noqa: BLE001 - optional HA providers may raise arbitrary errors
        _LOGGER.warning("HomeBrain channel %s failed: service call rejected", channel)
        return "failed", "service_error"
    return "sent", "service_accepted"
