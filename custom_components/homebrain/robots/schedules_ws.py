"""WebSocket API of the Roboti cleaning schedules (admin only, module-gated)."""

from __future__ import annotations

from typing import Any

import voluptuous as vol
from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant

from ..const import DOMAIN
from .schedules import NOTIFY_OPTION, NOTIFY_RE, RobotScheduler, ScheduleError, valid_date
from .ws import _ROOMS, _SLOT, SETTINGS_SCHEMA, _robot_bindings

_ID = vol.All(str, vol.Match(r"^[a-f0-9]{8,32}$"))
_HM = vol.All(str, vol.Match(r"^([01]\d|2[0-3]):[0-5]\d$"))
_DATE = vol.All(str, vol.Match(r"^\d{4}-\d{2}-\d{2}$"))


def scheduler(hass: HomeAssistant) -> RobotScheduler | None:
    return hass.data.get(DOMAIN, {}).get("robot_scheduler")


def _ready(hass: HomeAssistant, connection: Any, msg: dict[str, Any]) -> RobotScheduler | None:
    if _robot_bindings(hass, connection, msg) is None:
        return None
    if (manager := scheduler(hass)) is None:
        connection.send_error(msg["id"], "not_ready", "Robot schedules are starting")
    return manager


@websocket_api.websocket_command({vol.Required("type"): "homebrain/robots/schedules/list"})
@websocket_api.require_admin
@websocket_api.async_response
async def websocket_schedules_list(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """Schedules (+ next run, last result, pending retry), global settings, run log."""
    if (manager := _ready(hass, connection, msg)) is None:
        return
    connection.send_result(msg["id"], await manager.async_overview())


@websocket_api.websocket_command(
    {
        vol.Required("type"): "homebrain/robots/schedules/save",
        vol.Required("schedule"): {
            vol.Optional("id"): vol.Any(None, _ID),
            vol.Required("name"): vol.All(str, vol.Length(min=1, max=80)),
            vol.Required("slot"): _SLOT,
            vol.Optional("preset_id"): vol.Any(None, _ID),
            vol.Optional("settings"): vol.Any(None, SETTINGS_SCHEMA),
            vol.Optional("rooms", default=list): _ROOMS,
            vol.Required("days"): vol.All(
                [vol.All(int, vol.Range(min=0, max=6))], vol.Length(min=1, max=7)
            ),
            vol.Required("time"): _HM,
            vol.Optional("enabled", default=True): bool,
            vol.Optional("paused_until"): vol.Any(None, _DATE),
        },
    }
)
@websocket_api.require_admin
@websocket_api.async_response
async def websocket_schedules_save(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """Create (no id) or replace a schedule; refuses times inside quiet hours."""
    if (manager := _ready(hass, connection, {**msg, "slot": msg["schedule"]["slot"]})) is None:
        return
    try:
        schedule = await manager.async_save(msg["schedule"])
    except ScheduleError as err:
        connection.send_error(msg["id"], err.code, str(err))
        return
    connection.send_result(msg["id"], {"schedule": schedule})


@websocket_api.websocket_command(
    {vol.Required("type"): "homebrain/robots/schedules/delete", vol.Required("schedule_id"): _ID}
)
@websocket_api.require_admin
@websocket_api.async_response
async def websocket_schedules_delete(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    if (manager := _ready(hass, connection, msg)) is None:
        return
    if not await manager.async_delete(msg["schedule_id"]):
        connection.send_error(msg["id"], "not_found", "Schedule not found")
        return
    connection.send_result(msg["id"], {"deleted": True})


@websocket_api.websocket_command(
    {
        vol.Required("type"): "homebrain/robots/schedules/pause",
        vol.Required("until"): vol.Any(None, _DATE),
    }
)
@websocket_api.require_admin
@websocket_api.async_response
async def websocket_schedules_pause(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """Global pause (vacation) until a date, inclusive; ``null`` resumes."""
    if (manager := _ready(hass, connection, msg)) is None:
        return
    if msg["until"] is not None and valid_date(msg["until"]) is None:
        connection.send_error(msg["id"], "invalid_format", "Invalid date")
        return
    try:
        settings = await manager.async_pause(msg["until"])
    except ScheduleError as err:
        connection.send_error(msg["id"], err.code, str(err))
        return
    connection.send_result(msg["id"], {"settings": settings})


@websocket_api.websocket_command(
    {
        vol.Required("type"): "homebrain/robots/schedules/settings",
        vol.Optional("quiet_start"): _HM,
        vol.Optional("quiet_end"): _HM,
        vol.Optional("notify_service"): vol.Any(None, vol.All(str, vol.Match(NOTIFY_RE))),
    }
)
@websocket_api.require_admin
@websocket_api.async_response
async def websocket_schedules_settings(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """Quiet hours (store) and the optional notify service (entry option)."""
    if (manager := _ready(hass, connection, msg)) is None:
        return
    data = await manager.async_data()
    start = msg.get("quiet_start", data["settings"]["quiet_start"])
    end = msg.get("quiet_end", data["settings"]["quiet_end"])
    settings = await manager.async_set_quiet(start, end)
    if "notify_service" in msg:
        service = msg["notify_service"]
        if service is not None and not hass.services.has_service("notify", service):
            connection.send_error(msg["id"], "not_found", "Notify service does not exist")
            return
        entry = hass.config_entries.async_entries(DOMAIN)[0]
        options = {k: v for k, v in entry.options.items() if k != NOTIFY_OPTION}
        if service:
            options[NOTIFY_OPTION] = service
        hass.config_entries.async_update_entry(entry, options=options)
    connection.send_result(
        msg["id"], {"settings": settings, "notify_service": manager.notify_service()}
    )


@websocket_api.websocket_command(
    {vol.Required("type"): "homebrain/robots/schedules/run_now", vol.Required("schedule_id"): _ID}
)
@websocket_api.require_admin
@websocket_api.async_response
async def websocket_schedules_run_now(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """Start a schedule right now (readiness check, same apply path, no retries)."""
    if (manager := _ready(hass, connection, msg)) is None:
        return
    try:
        result = await manager.async_run_now(msg["schedule_id"])
    except ScheduleError as err:
        connection.send_error(msg["id"], err.code, str(err))
        return
    connection.send_result(msg["id"], result)


SCHEDULE_COMMANDS = (
    websocket_schedules_list,
    websocket_schedules_save,
    websocket_schedules_delete,
    websocket_schedules_pause,
    websocket_schedules_settings,
    websocket_schedules_run_now,
)
