"""Data horizon of the waste schedule (Odpady).

Waste sources publish a limited window (municipal schedules usually per calendar year). When the
window runs out the panel would silently show nothing or a stale "next pickup". The horizon is the
last known pickup overall and per waste type, computed from the records HomeBrain remembers
(``WasteHistory``), so the admin panel can show a calm notice before the data ends and an
optional repair issue can remind the admin shortly before.
"""

from __future__ import annotations

from collections.abc import Iterable, Mapping
from datetime import date, datetime
from typing import Any

from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers import issue_registry as ir
from homeassistant.util import dt as dt_util

from ..const import DOMAIN
from .history import _label, _valid_date, label_key

WARN_DAYS = 30
REPAIR_DAYS = 14
REPAIR_ISSUE_ID = "waste_data_horizon"


def compute_horizon(
    records: Iterable[Mapping[str, Any]], now: datetime, warn_days: int = WARN_DAYS
) -> dict[str, Any]:
    """Last known pickup overall and per type; days are counted in HA local time."""
    today = dt_util.as_local(now).date()
    latest: dict[str, tuple[str, str]] = {}  # label_key -> (date, label)
    for record in records:
        day, label = _valid_date(record.get("date")), _label(record.get("label"))
        if not day or not label or not (key := label_key(label)):
            continue
        if key not in latest or day > latest[key][0]:
            latest[key] = (day, label)

    def days_until(day: str) -> int:
        return (date.fromisoformat(day) - today).days

    types = [
        {"label": label, "last_date": day, "days_left": days_until(day)}
        for day, label in sorted(latest.values())
    ]
    if not types:
        return {
            "status": "empty",
            "last_date": None,
            "days_left": None,
            "warn_days": warn_days,
            "warning": False,
            "types": [],
        }
    last_date = types[-1]["last_date"]
    days_left = days_until(last_date)
    status = "ended" if days_left < 0 else "ending" if days_left < warn_days else "ok"
    return {
        "status": status,
        "last_date": last_date,
        "days_left": days_left,
        "warn_days": warn_days,
        "warning": status != "ok",
        "types": types,
    }


@callback
def async_update_horizon_issue(hass: HomeAssistant, horizon: Mapping[str, Any]) -> None:
    """Raise a repair issue when the schedule ends within ``REPAIR_DAYS``; clear it otherwise."""
    days_left = horizon.get("days_left")
    last_date = horizon.get("last_date")
    if days_left is None or last_date is None or days_left >= REPAIR_DAYS:
        ir.async_delete_issue(hass, DOMAIN, REPAIR_ISSUE_ID)
        return
    last = date.fromisoformat(last_date)
    ir.async_create_issue(
        hass,
        DOMAIN,
        REPAIR_ISSUE_ID,
        is_fixable=False,
        severity=ir.IssueSeverity.WARNING,
        translation_key=REPAIR_ISSUE_ID,
        translation_placeholders={
            "last_date": f"{last.day}. {last.month}. {last.year}",
            # Schedules are published per calendar year: ending in December = next year missing.
            "next_year": str(last.year + 1 if last.month == 12 else last.year),
        },
    )
