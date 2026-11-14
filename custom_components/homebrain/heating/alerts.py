"""Topení alert engine (pure evaluation + notification side effects)."""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Any, Callable, Literal

_LOGGER = logging.getLogger(__name__)

Severity = Literal["info", "warning", "critical"]
AlertId = str

NOTIFY_RATE_LIMIT = timedelta(minutes=30)
STARTUP_NOTIFY_SKIP_POLLS = 2

SOLAR_OFF_HOT_DEBOUNCE = timedelta(minutes=10)
SOLAR_OFF_HOT_CLEAR = timedelta(minutes=10)
SOLAR_STAGNATION_DEBOUNCE = timedelta(minutes=15)
SOLAR_PUMP_DEBOUNCE = timedelta(minutes=20)
PLC_UNREACHABLE_DEBOUNCE = timedelta(minutes=15)
HP_OFF_DEBOUNCE = timedelta(minutes=10)
HEATING_DISABLED_DEBOUNCE = timedelta(minutes=10)
HOUSE_COLD_DEBOUNCE = timedelta(minutes=60)
DHW_COLD_DEBOUNCE = timedelta(minutes=30)
DHW_COLD_ESCALATE = timedelta(hours=3)
FISH_COLD_DEBOUNCE = timedelta(minutes=60)
HDO_LONG_DEBOUNCE = timedelta(minutes=180)


@dataclass
class RuleState:
    pending_since: datetime | None = None
    active_since: datetime | None = None
    severity: Severity | None = None
    notified_severity: Severity | None = None
    last_notify_at: datetime | None = None
    clear_pending_since: datetime | None = None
    fault_streak: int = 0
    fault_clear_streak: int = 0
    snapshot: dict[str, Any] = field(default_factory=dict)


@dataclass
class AlertState:
    rules: dict[str, RuleState] = field(default_factory=dict)
    poll_count: int = 0

    def rule(self, rule_id: str) -> RuleState:
        return self.rules.setdefault(rule_id, RuleState())

    def as_dict(self) -> dict[str, Any]:
        out: dict[str, Any] = {"poll_count": self.poll_count, "rules": {}}
        for rid, st in self.rules.items():
            out["rules"][rid] = {
                "pending_since": _iso(st.pending_since),
                "active_since": _iso(st.active_since),
                "severity": st.severity,
                "notified_severity": st.notified_severity,
                "last_notify_at": _iso(st.last_notify_at),
                "clear_pending_since": _iso(st.clear_pending_since),
                "fault_streak": st.fault_streak,
                "fault_clear_streak": st.fault_clear_streak,
                "snapshot": dict(st.snapshot),
            }
        return out

    @classmethod
    def from_dict(cls, raw: Any) -> AlertState:
        if not isinstance(raw, dict):
            return cls()
        st = cls(poll_count=int(raw.get("poll_count") or 0))
        rules = raw.get("rules")
        if not isinstance(rules, dict):
            return st
        for rid, blob in rules.items():
            if not isinstance(blob, dict):
                continue
            r = st.rule(str(rid))
            r.pending_since = _parse_dt(blob.get("pending_since"))
            r.active_since = _parse_dt(blob.get("active_since"))
            sev = blob.get("severity")
            r.severity = sev if sev in ("info", "warning", "critical") else None
            nsev = blob.get("notified_severity")
            r.notified_severity = nsev if nsev in ("info", "warning", "critical") else None
            r.last_notify_at = _parse_dt(blob.get("last_notify_at"))
            r.clear_pending_since = _parse_dt(blob.get("clear_pending_since"))
            r.fault_streak = int(blob.get("fault_streak") or 0)
            r.fault_clear_streak = int(blob.get("fault_clear_streak") or 0)
            snap = blob.get("snapshot")
            r.snapshot = dict(snap) if isinstance(snap, dict) else {}
        return st


@dataclass(frozen=True)
class EvalContext:
    now: datetime
    values: dict[str, Any]
    mapped: set[str]
    activity: str
    source: str
    stale: bool
    updated_at: datetime | None
    faults_active: list[tuple[str, str]]
    project_changed: bool
    winter: bool | None


@dataclass(frozen=True)
class ActiveAlert:
    id: AlertId
    severity: Severity
    title: str
    body: str
    since: str
    value: str | None = None

    def as_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "severity": self.severity,
            "title": self.title,
            "body": self.body,
            "since": self.since,
            "value": self.value,
        }


def _iso(dt: datetime | None) -> str | None:
    return dt.isoformat() if dt else None


def _parse_dt(value: Any) -> datetime | None:
    if not isinstance(value, str):
        return None
    try:
        return datetime.fromisoformat(value)
    except ValueError:
        return None


def _debounced(
    st: RuleState,
    now: datetime,
    condition: bool,
    need: timedelta,
    *,
    clear: bool = False,
) -> bool:
    if clear:
        if condition:
            st.clear_pending_since = None
            return False
        if st.clear_pending_since is None:
            st.clear_pending_since = now
        return (now - st.clear_pending_since) >= need
    if not condition:
        st.pending_since = None
        return False
    if st.pending_since is None:
        st.pending_since = now
    return (now - st.pending_since) >= need


def _activate(st: RuleState, now: datetime, severity: Severity, snapshot: dict[str, Any]) -> None:
    if st.active_since is None:
        st.active_since = now
    st.severity = severity
    st.snapshot = snapshot
    st.clear_pending_since = None


def _deactivate(st: RuleState) -> None:
    st.pending_since = None
    st.active_since = None
    st.severity = None
    st.snapshot = {}
    st.clear_pending_since = None


def evaluate_alerts(ctx: EvalContext, state: AlertState) -> list[ActiveAlert]:
    """Return active alerts after updating rule state (mutates ``state``)."""
    state.poll_count += 1
    v = ctx.values.get
    active: list[ActiveAlert] = []

    def emit(rule_id: str, severity: Severity, title: str, body: str, value: str | None = None):
        st = state.rule(rule_id)
        _activate(st, ctx.now, severity, {"title": title, "body": body, "value": value})
        since = _iso(st.active_since) or ctx.now.isoformat()
        active.append(ActiveAlert(rule_id, severity, title, body, since, value))

    def clear_rule(rule_id: str) -> None:
        _deactivate(state.rule(rule_id))

    # --- solar_off_hot ---
    solar_en = v("extras.solar_enabled")
    solar_t = v("extras.solar_temp")
    tank_b = v("tank.bottom")
    if (
        solar_en is not None
        and solar_t is not None
        and "extras.solar_enabled" in ctx.mapped
        and "extras.solar_temp" in ctx.mapped
    ):
        threshold = max(60.0, (float(tank_b) if isinstance(tank_b, int | float) else 0) + 15)
        hot = solar_en is False and float(solar_t) >= threshold
        st = state.rule("solar_off_hot")
        if _debounced(st, ctx.now, hot, SOLAR_OFF_HOT_DEBOUNCE):
            sev: Severity = "critical" if float(solar_t) >= 100 else "warning"
            t = f"{float(solar_t):.0f}"
            emit(
                "solar_off_hot",
                sev,
                "Solár je vypnutý a kolektor je horký",
                f"Kolektor má {t} °C, ale solár je na regulaci vypnutý – teplo se neukládá "
                f"a kapalina se přehřívá. Zapněte solár na regulaci.",
                t,
            )
        elif st.active_since and _debounced(
            st,
            ctx.now,
            solar_en is True
            or (isinstance(solar_t, int | float) and float(solar_t) < 50),
            SOLAR_OFF_HOT_CLEAR,
            clear=True,
        ):
            clear_rule("solar_off_hot")
        elif not hot and not st.active_since:
            st.pending_since = None
    else:
        clear_rule("solar_off_hot")

    # --- solar_stagnation ---
    pump = v("extras.solar_pump")
    tank_top = v("tank.top")
    if solar_en is True and solar_t is not None and pump is False:
        cond = float(solar_t) >= 110
        st = state.rule("solar_stagnation")
        if _debounced(st, ctx.now, cond, SOLAR_STAGNATION_DEBOUNCE):
            t = f"{float(solar_t):.0f}"
            if isinstance(tank_top, int | float) and float(tank_top) >= 85:
                emit(
                    "solar_stagnation",
                    "info",
                    "Nádrž je nabitá, solár odstavil – v létě normální.",
                    "Čerpadlo solaru stojí, ačkoli je solár zapnutý.",
                    t,
                )
            else:
                emit(
                    "solar_stagnation",
                    "warning",
                    f"Solární kolektor stagnuje ({t} °C)",
                    "Čerpadlo solaru stojí, ačkoli je solár zapnutý.",
                    t,
                )
        elif st.active_since and isinstance(solar_t, int | float) and float(solar_t) < 95:
            clear_rule("solar_stagnation")
    else:
        if state.rule("solar_stagnation").active_since and (
            not isinstance(solar_t, int | float) or float(solar_t) < 95
        ):
            clear_rule("solar_stagnation")

    # --- solar_pump_not_running ---
    if (
        solar_en is True
        and pump is False
        and solar_t is not None
        and tank_b is not None
        and "extras.solar_pump" in ctx.mapped
    ):
        delta = float(solar_t) - float(tank_b)
        cond = delta >= 20
        st = state.rule("solar_pump_not_running")
        if _debounced(st, ctx.now, cond, SOLAR_PUMP_DEBOUNCE):
            emit(
                "solar_pump_not_running",
                "warning",
                "Čerpadlo solaru neběží",
                f"Kolektor je o {delta:.0f} °C teplejší než spodek nádrže, ale čerpadlo stojí.",
                f"{delta:.0f}",
            )
        elif st.active_since and (pump is True or delta < 10):
            clear_rule("solar_pump_not_running")
    else:
        clear_rule("solar_pump_not_running")

    # --- fault (2 consecutive polls) ---
    fault_cond = bool(ctx.faults_active) or v("faults.compressor_block") or v("faults.fatal")
    fst = state.rule("fault")
    if fault_cond:
        fst.fault_streak += 1
        fst.fault_clear_streak = 0
    else:
        fst.fault_clear_streak += 1
        fst.fault_streak = 0
    if fst.fault_streak >= 2 and fault_cond:
        labels = [label for _k, label in ctx.faults_active]
        if v("faults.compressor_block"):
            labels.append("Blokace kompresoru")
        if v("faults.fatal"):
            labels.append("Fatální chyba")
        body = ", ".join(labels) if labels else "Regulace hlásí poruchu."
        emit("fault", "critical", "Porucha tepelného čerpadla", body)
    elif fst.fault_clear_streak >= 2:
        clear_rule("fault")

    # --- plc_unreachable ---
    bad = ctx.source != "ok" or ctx.stale
    st = state.rule("plc_unreachable")
    if _debounced(st, ctx.now, bad, PLC_UNREACHABLE_DEBOUNCE):
        minutes = 0
        if ctx.updated_at:
            minutes = max(0, int((ctx.now - ctx.updated_at).total_seconds() // 60))
        emit(
            "plc_unreachable",
            "warning",
            "Regulace topení neodpovídá",
            f"Poslední data před {minutes} min.",
            str(minutes),
        )
    elif st.active_since and not bad:
        clear_rule("plc_unreachable")

    # --- project_changed ---
    if ctx.project_changed:
        emit(
            "project_changed",
            "warning",
            "Program regulace se změnil",
            "Ověřte mapu proměnných – hodnoty mohou být nesprávné.",
        )
    else:
        clear_rule("project_changed")

    # --- hp_off ---
    if ctx.activity == "off":
        st = state.rule("hp_off")
        if _debounced(st, ctx.now, True, HP_OFF_DEBOUNCE):
            sev = "warning" if ctx.winter else "info"
            emit(
                "hp_off",
                sev,
                "Tepelné čerpadlo je vypnuté",
                "Hlavní vypínač na regulaci je vypnutý.",
            )
    else:
        clear_rule("hp_off")

    # --- heating_disabled_winter ---
    if ctx.activity == "dhw_only":
        st = state.rule("heating_disabled_winter")
        if _debounced(st, ctx.now, ctx.winter is True, HEATING_DISABLED_DEBOUNCE):
            emit(
                "heating_disabled_winter",
                "warning",
                "Topení domu je vypnuté",
                "Je zima, ale okruh domu je na regulaci vypnutý.",
            )
    else:
        clear_rule("heating_disabled_winter")

    # --- house_cold ---
    ref = v("house.ref_temp")
    target = v("house.ref_target_effective") or v("house.ref_target")
    if isinstance(ref, int | float) and isinstance(target, int | float):
        st = state.rule("house_cold")
        cold = float(ref) <= float(target) - 1.5
        if _debounced(st, ctx.now, cold, HOUSE_COLD_DEBOUNCE):
            t, tgt = f"{float(ref):.1f}", f"{float(target):.1f}"
            emit("house_cold", "warning", "Doma je chladněji", f"{t} °C, cíl {tgt} °C.", t)
        elif st.active_since and float(ref) >= float(target) - 0.5:
            clear_rule("house_cold")

    # --- dhw_cold ---
    dhw_t = v("dhw.temp")
    dhw_tgt = v("dhw.target")
    dhw_h = v("dhw.hysteresis")
    if isinstance(dhw_t, int | float) and isinstance(dhw_tgt, int | float) and isinstance(dhw_h, int | float):
        lim = float(dhw_tgt) - float(dhw_h) - 3
        st = state.rule("dhw_cold")
        cold = float(dhw_t) < lim
        active_for = (ctx.now - st.active_since) if st.active_since else timedelta(0)
        if _debounced(st, ctx.now, cold, DHW_COLD_DEBOUNCE):
            sev = "warning" if active_for >= DHW_COLD_ESCALATE else "info"
            t = f"{float(dhw_t):.1f}"
            emit(
                "dhw_cold",
                sev,
                "Teplá voda je studená",
                f"{t} °C, dohřívá se pod {lim:.1f} °C.",
                t,
            )
        elif st.active_since and float(dhw_t) >= float(dhw_tgt) - float(dhw_h):
            clear_rule("dhw_cold")

    # --- fish_cold ---
    fish_t = v("extras.fish_temp")
    fish_tgt = v("extras.fish_target")
    fish_h = v("extras.fish_hysteresis")
    if fish_t is not None and "extras.fish_temp" in ctx.mapped:
        st = state.rule("fish_cold")
        below = False
        sev: Severity = "warning"
        if isinstance(fish_t, int | float) and float(fish_t) < 3:
            below, sev = True, "critical"
        elif (
            isinstance(fish_t, int | float)
            and isinstance(fish_tgt, int | float)
            and isinstance(fish_h, int | float)
            and float(fish_t) < float(fish_tgt) - float(fish_h) - 2
        ):
            below = True
        if _debounced(st, ctx.now, below, FISH_COLD_DEBOUNCE):
            t = f"{float(fish_t):.1f}" if isinstance(fish_t, int | float) else "?"
            tgt = f"{float(fish_tgt):.1f}" if isinstance(fish_tgt, int | float) else "?"
            emit("fish_cold", sev, "Rybárna chladne", f"Vzduch {t} °C, má držet {tgt} °C.", t)
        elif st.active_since and isinstance(fish_t, int | float) and isinstance(fish_tgt, int | float):
            if isinstance(fish_h, int | float) and float(fish_t) >= float(fish_tgt) - float(fish_h):
                clear_rule("fish_cold")

    # --- hdo_long ---
    hdo = v("mode.hdo_low_tariff")
    if hdo is not None and "mode.hdo_low_tariff" in ctx.mapped:
        st = state.rule("hdo_long")
        if _debounced(st, ctx.now, hdo is False, HDO_LONG_DEBOUNCE):
            emit(
                "hdo_long",
                "info",
                "Nízký tarif chybí přes 3 hodiny",
                "Kompresor je blokovaný HDO.",
            )
        elif st.active_since and hdo is True:
            clear_rule("hdo_long")

    order = {"critical": 0, "warning": 1, "info": 2}
    active.sort(key=lambda a: (order[a.severity], a.since))
    return active


@dataclass
class NotifyPlan:
    calls: list[dict[str, Any]] = field(default_factory=list)


def plan_notifications(
    *,
    state: AlertState,
    prev_active: dict[str, ActiveAlert],
    now_active: list[ActiveAlert],
    now: datetime,
    startup_skip: bool,
) -> NotifyPlan:
    """Decide ``homebrain.notify`` calls; updates ``notified_severity`` in ``state``."""
    plan = NotifyPlan()
    now_map = {a.id: a for a in now_active}
    for rule_id, alert in now_map.items():
        st = state.rule(rule_id)
        if alert.severity == "info":
            continue
        escalated = (
            st.notified_severity is not None
            and alert.severity == "critical"
            and st.notified_severity != "critical"
        )
        first = st.notified_severity is None and st.active_since is not None
        if not (first or escalated):
            continue
        if startup_skip and st.notified_severity is None:
            continue
        if st.last_notify_at and (now - st.last_notify_at) < NOTIFY_RATE_LIMIT and not escalated:
            continue
        priority = "critical" if alert.severity == "critical" else "high"
        plan.calls.append(
            {
                "title": alert.title,
                "message": alert.body,
                "priority": priority,
                "tag": f"heating.{rule_id}",
            }
        )
        st.notified_severity = alert.severity
        st.last_notify_at = now

    for rule_id, prev in prev_active.items():
        if rule_id in now_map:
            continue
        st = state.rule(rule_id)
        if st.notified_severity in ("warning", "critical"):
            plan.calls.append(
                {
                    "title": f"Vyřešeno: {prev.title}",
                    "message": prev.body,
                    "priority": "info",
                    "tag": f"heating.{rule_id}",
                }
            )
            st.notified_severity = None
            st.last_notify_at = now
    return plan


async def dispatch_notify(
    hass: Any,
    recipient: str | None,
    plans: list[dict[str, Any]],
    *,
    has_service: Callable[[], bool],
) -> None:
    if not recipient or not plans:
        return
    if not has_service():
        _LOGGER.debug("Topení: homebrain.notify není k dispozici, upozornění jen v UI")
        return
    from ..const import DOMAIN

    for call in plans:
        try:
            await hass.services.async_call(
                DOMAIN,
                "notify",
                {"recipient": recipient, **call},
                blocking=False,
            )
        except Exception:  # noqa: BLE001
            _LOGGER.debug("Topení: odeslání upozornění selhalo", exc_info=True)


def format_change_notify(label: str, old: Any, new: Any, key: str) -> str:
    from .changes import _fmt

    return (
        f"Na regulaci se změnilo: {label} {_fmt(old, key)} → {_fmt(new, key)}. "
        "Pokud jste to byli vy, nic nedělejte."
    )