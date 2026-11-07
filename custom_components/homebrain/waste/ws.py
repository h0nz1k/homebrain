"""WebSocket API of the waste module."""

from datetime import timedelta
from typing import Any

import voluptuous as vol
from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant
from homeassistant.util import dt as dt_util

from ..const import DOMAIN
from ..roles import require_dnes_access
from .horizon import WARN_DAYS, compute_horizon

# Opening the panel re-reads the sources when the last pass is older than this.
STALE_AFTER = timedelta(minutes=30)


@websocket_api.websocket_command(
    {
        vol.Required("type"): "homebrain/waste/history",
        vol.Optional("warn_days", default=WARN_DAYS): vol.All(int, vol.Range(min=1, max=366)),
    }
)
@require_dnes_access
@websocket_api.async_response
async def websocket_waste_history(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """Observed collections up to today (oldest first) + the data horizon of the schedule.

    Every mapped role (Odpady is open to the family, ADR-0002 §3.1) gets the history.
    ``horizon`` = last known pickup overall and per type (incl. future ones), so the admin panel
    can warn before the published schedule runs out (``warn_days``, default 30); it is an admin
    task („Co s tím“), so non-admins get ``None``.
    """
    manager = hass.data.get(DOMAIN, {}).get("waste_history")
    if manager is None:
        connection.send_error(msg["id"], "not_found", "HomeBrain is not configured")
        return
    if manager.last_refresh is None or dt_util.utcnow() - manager.last_refresh > STALE_AFTER:
        await manager.async_refresh()
    events = manager.store.history(dt_util.now().date())
    connection.send_result(
        msg["id"],
        {
            "events": events,
            "since": events[0]["date"] if events else None,
            "updated_at": manager.last_refresh.isoformat() if manager.last_refresh else None,
            "horizon": (
                compute_horizon(manager.store.records(), dt_util.now(), msg["warn_days"])
                if connection.user is not None and connection.user.is_admin
                else None
            ),
        },
    )
