"""Home Assistant services for wine voice write-off."""

from __future__ import annotations

import logging
from typing import Any

import voluptuous as vol
from homeassistant.core import HomeAssistant, ServiceCall
from homeassistant.helpers import config_validation as cv

from ..const import DOMAIN
from . import voice as voice_mod
from .websocket import async_get_store

_LOGGER = logging.getLogger(__name__)

SERVICE_CONSUME_TEXT = "wine_consume_text"

SCHEMA = vol.Schema(
    {
        vol.Required("text"): cv.string,
        vol.Optional("source_operation_id"): cv.string,
    }
)


async def async_setup_services(hass: HomeAssistant) -> None:
    """Register wine voice services (idempotent)."""
    if hass.services.has_service(DOMAIN, SERVICE_CONSUME_TEXT):
        return

    async def handle_consume(call: ServiceCall) -> dict[str, Any]:
        text = call.data["text"].strip()
        op_id = call.data.get("source_operation_id") or voice_mod.new_voice_operation_id()
        store = await async_get_store(hass)
        result = await hass.async_add_executor_job(
            lambda: voice_mod.apply_voice_consume(
                store,
                text,
                op_id,
                actor={"type": "assist", "source": "voice"},
            )
        )
        _LOGGER.debug("wine_consume_text status=%s", result.get("status"))
        return result

    hass.services.async_register(
        DOMAIN,
        SERVICE_CONSUME_TEXT,
        handle_consume,
        schema=SCHEMA,
        supports_response=True,
    )


async def async_unload_services(hass: HomeAssistant) -> None:
    if hass.services.has_service(DOMAIN, SERVICE_CONSUME_TEXT):
        hass.services.async_remove(DOMAIN, SERVICE_CONSUME_TEXT)
