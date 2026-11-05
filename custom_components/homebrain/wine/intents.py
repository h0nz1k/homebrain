"""Home Assistant Assist intents for wine voice write-off (WIN-014).

Sentences live in ``custom_sentences/cs/homebrain_wine.yaml`` (synced into the HA config by
:mod:`.sentences`). Flow: ``vypil jsem <víno> [ročník]`` → unique match is written off; an
ambiguous match is stored as pending and Assist asks "Myslíš první …, nebo druhé …?"; the
follow-up ``to první`` / ``ani jedno`` resolves the newest pending within 30 minutes.
"""

from __future__ import annotations

from typing import Any

from homeassistant.core import HomeAssistant
from homeassistant.helpers import intent

from . import voice as voice_mod
from .websocket import async_get_store

INTENT_CONSUME = "HomebrainWineConsumeText"
INTENT_CHOOSE = "HomebrainWineVoiceChoose"
INTENT_DISMISS = "HomebrainWineVoiceDismiss"
CARD_TITLE = "HomeBrain Vinotéka"
_ACTOR = {"type": "assist", "source": "voice"}


def _respond(intent_obj: intent.Intent, result: dict[str, Any]) -> intent.IntentResponse:
    response = intent_obj.create_response()
    speech = voice_mod.czech_response(result)
    response.async_set_speech(speech)
    response.async_set_card(CARD_TITLE, speech)
    return response


class HomebrainWineConsumeIntentHandler(intent.IntentHandler):
    """Parse free-text wine from Assist and write off via the wine store."""

    intent_type = INTENT_CONSUME
    description = "Odepíše láhev vína z vinotéky HomeBrain podle volného textu."

    async def async_handle(self, intent_obj: intent.Intent) -> intent.IntentResponse:
        hass = intent_obj.hass
        wine_slot = intent_obj.slots.get("wine") or intent_obj.slots.get("wine_query")
        text = str((wine_slot.get("value") if wine_slot else None) or "").strip()
        if not text:
            response = intent_obj.create_response()
            response.async_set_speech("Nerozumím, které víno máš na mysli.")
            return response
        op_id = voice_mod.new_voice_operation_id()
        store = await async_get_store(hass)
        result = await hass.async_add_executor_job(
            lambda: voice_mod.apply_voice_consume(store, text, op_id, actor=dict(_ACTOR))
        )
        return _respond(intent_obj, result)


class HomebrainWineVoiceChooseIntentHandler(intent.IntentHandler):
    """Follow-up after an ambiguous match: "to první", "to druhé" …"""

    intent_type = INTENT_CHOOSE
    description = "Vybere kandidáta z poslední nejednoznačné hlasové žádosti o odepsání vína."

    async def async_handle(self, intent_obj: intent.Intent) -> intent.IntentResponse:
        hass = intent_obj.hass
        slot = intent_obj.slots.get("wine_choice") or {}
        try:
            choice = int(slot.get("value"))
        except (TypeError, ValueError):
            choice = 0
        store = await async_get_store(hass)
        result = await hass.async_add_executor_job(
            lambda: voice_mod.choose_latest_pending(store, choice, actor=dict(_ACTOR))
        )
        return _respond(intent_obj, result)


class HomebrainWineVoiceDismissIntentHandler(intent.IntentHandler):
    """Follow-up "ani jedno": drop the newest pending request without writing off."""

    intent_type = INTENT_DISMISS
    description = "Zruší poslední nejednoznačnou hlasovou žádost o odepsání vína."

    async def async_handle(self, intent_obj: intent.Intent) -> intent.IntentResponse:
        hass = intent_obj.hass
        store = await async_get_store(hass)
        result = await hass.async_add_executor_job(
            lambda: voice_mod.choose_latest_pending(store, None, actor=dict(_ACTOR))
        )
        return _respond(intent_obj, result)


async def async_register_intents(hass: HomeAssistant) -> None:
    intent.async_register(hass, HomebrainWineConsumeIntentHandler())
    intent.async_register(hass, HomebrainWineVoiceChooseIntentHandler())
    intent.async_register(hass, HomebrainWineVoiceDismissIntentHandler())
