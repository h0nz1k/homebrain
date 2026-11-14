"""Topení alerts, change log, notifications (synthetic series)."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, MagicMock

import pytest

from custom_components.homebrain.const import DOMAIN
from custom_components.homebrain.heating.alerts import (
    ActiveAlert,
    AlertState,
    EvalContext,
    dispatch_notify,
    evaluate_alerts,
    plan_notifications,
)
from custom_components.homebrain.heating.changes import ChangeLog
from custom_components.homebrain.heating.model import derive_activity


def _ctx(
    now: datetime,
    *,
    values: dict,
    mapped: set[str] | None = None,
    source: str = "ok",
    stale: bool = False,
    project_changed: bool = False,
) -> EvalContext:
    mapped = mapped or set(values)
    winter = values.get("mode.winter")
    activity = derive_activity(values, any_fault=bool(values.get("faults.fatal")))
    return EvalContext(
        now=now,
        values=values,
        mapped=mapped,
        activity=activity,
        source=source,
        stale=stale,
        updated_at=now,
        faults_active=[],
        project_changed=project_changed,
        winter=winter if isinstance(winter, bool) else None,
    )


def test_solar_off_hot_debounce_escalation_clear():
    t0 = datetime(2026, 11, 14, 7, 0, tzinfo=UTC)
    state = AlertState()
    mapped = {"extras.solar_enabled", "extras.solar_temp", "tank.bottom", "mode.winter"}
    base = {
        "extras.solar_enabled": False,
        "extras.solar_pump": False,
        "mode.winter": True,
        "tank.bottom": 39.0,
    }
    active: list[ActiveAlert] = []
    for minute, temp in ((0, 20), (5, 55), (10, 90), (15, 95), (20, 110)):
        now = t0 + timedelta(minutes=minute)
        base["extras.solar_temp"] = temp
        active = evaluate_alerts(_ctx(now, values=base, mapped=mapped), state)
    assert any(a.id == "solar_off_hot" and a.severity == "critical" for a in active)
    base["extras.solar_enabled"] = True
    base["extras.solar_pump"] = True
    base["extras.solar_temp"] = 135
    for minute in (30, 35, 50, 55):
        now = t0 + timedelta(minutes=minute)
        base["extras.solar_temp"] = {30: 135, 35: 80, 50: 48, 55: 44}[minute]
        active = evaluate_alerts(_ctx(now, values=base, mapped=mapped), state)
    assert not any(a.id == "solar_off_hot" for a in active)


def test_incident_replay_notify_three_calls():
    """Synthetic 5-min series: solar off hot → enable → clear; 3 notify calls."""
    t0 = datetime(2026, 11, 14, 7, 0, tzinfo=UTC)
    state = AlertState()
    mapped = {"extras.solar_enabled", "extras.solar_temp", "tank.bottom"}
    values = {
        "extras.solar_enabled": False,
        "extras.solar_temp": 20.0,
        "tank.bottom": 39.0,
        "mode.winter": True,
    }
    calls: list[dict] = []
    prev: dict[str, ActiveAlert] = {}

    def step(offset_min: int, **patch):
        nonlocal values, prev
        values = {**values, **patch}
        now = t0 + timedelta(minutes=offset_min)
        active = evaluate_alerts(_ctx(now, values=values, mapped=mapped), state)
        plan = plan_notifications(
            state=state,
            prev_active=prev,
            now_active=active,
            now=now,
            startup_skip=state.poll_count <= 2,
        )
        calls.extend(plan.calls)
        prev = {a.id: a for a in active}

    for m in range(0, 55, 5):
        temp = min(140, 20 + m * 3)
        step(m, **{"extras.solar_temp": float(temp)})
    step(60, **{"extras.solar_enabled": True, "extras.solar_pump": True, "extras.solar_temp": 135.0})
    for m, temp in ((70, 80.0), (80, 60.0), (90, 44.0)):
        step(m, **{"extras.solar_temp": temp})
    tags = [c["tag"] for c in calls]
    assert tags.count("heating.solar_off_hot") == 3
    priorities = [c["priority"] for c in calls if c["tag"] == "heating.solar_off_hot"]
    assert priorities == ["high", "critical", "info"]


@pytest.mark.asyncio
async def test_dispatch_notify_silent_without_service():
    hass = MagicMock()
    hass.services.has_service.return_value = False
    await dispatch_notify(hass, "owner", [{"title": "t", "message": "m"}], has_service=hass.services.has_service)
    hass.services.async_call.assert_not_called()


@pytest.mark.asyncio
async def test_dispatch_notify_with_recipient():
    hass = MagicMock()
    hass.services.has_service.return_value = True
    hass.services.async_call = AsyncMock()
    await dispatch_notify(
        hass,
        "owner",
        [{"title": "a", "message": "b", "priority": "high", "tag": "heating.x"}],
        has_service=lambda: True,
    )
    hass.services.async_call.assert_awaited_once()
    assert hass.services.async_call.call_args[0][0:2] == (DOMAIN, "notify")


def test_change_log_baseline_and_late():
    log = ChangeLog()
    now = datetime(2026, 3, 1, 8, 0, tzinfo=UTC)
    v1 = {"extras.solar_enabled": True, "mode.main_switch": True}
    assert log.detect(now, v1, set(v1), [], late=False) == []
    assert log.baselined is True
    v2 = {**v1, "extras.solar_enabled": False}
    late = log.detect(now + timedelta(hours=1), v2, set(v2), [], late=True)
    assert len(late) == 1 and late[0].late is True


def test_restore_does_not_renotify():
    t0 = datetime(2026, 1, 1, 10, 0, tzinfo=UTC)
    state = AlertState.from_dict(
        {
            "poll_count": 5,
            "rules": {
                "hp_off": {
                    "active_since": (t0 - timedelta(hours=1)).isoformat(),
                    "severity": "warning",
                    "notified_severity": "warning",
                    "last_notify_at": (t0 - timedelta(hours=1)).isoformat(),
                }
            },
        }
    )
    values = {"mode.main_switch": False, "mode.winter": True, "heat_pump.compressor_on": False}
    active = evaluate_alerts(
        _ctx(t0, values=values, mapped=set(values)),
        state,
    )
    plan = plan_notifications(
        state=state,
        prev_active={},
        now_active=active,
        now=t0,
        startup_skip=False,
    )
    assert plan.calls == []