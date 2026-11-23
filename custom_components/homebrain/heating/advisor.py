"""Daily, read-only advice from Home Assistant's hourly long-term statistics."""

from __future__ import annotations

import asyncio
import logging
from bisect import bisect_left
from collections.abc import Callable
from dataclasses import dataclass
from datetime import date, datetime, timedelta, tzinfo
from math import isfinite, sqrt
from statistics import mean
from typing import Any

from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers.event import async_call_later, async_track_time_change
from homeassistant.util import dt as dt_util

from ..const import DOMAIN
from .entities import unique_id
from .model import season_of

_LOGGER = logging.getLogger(__name__)

DATA_KEY = "heating_advisor"
OUTDOOR = "outdoor.temp"
COMPRESSOR = "compressor_runtime_h"
CIRCUIT = "house_circuit_runtime_h"
REF = "house.ref_temp"
TARGET = "house.ref_target"
EFFECTIVE_TARGET = "house.ref_target_effective"
HYSTERESIS = "house.hysteresis"
ATTIC = "house.attic_temp"
POINTS = tuple((f"p{i}", f"curve.p{i}_outdoor", f"curve.p{i}_water") for i in range(1, 5))
CURVE_KEYS = tuple(key for _, outdoor, water in POINTS for key in (outdoor, water))
HOURS_REQUIRED = 20
COUNTER_LEAD_DAYS = 92
CURVE_DAYS = 7
MIN_CURVE_DAYS = 5
CURVE_WINDOW_DAYS = 21
CURVE_OUTDOOR_MAX = 8.0
LOW_DUTY_PCT = 25.0
HIGH_DUTY_PCT = 80.0
DEFAULT_HYSTERESIS = 0.2
COLD_DEFICIT = 0.3
MIN_TARGET_RISE = 0.1
COLD_HOURS_PER_DAY = 6
COLD_DAYS_FOR_INCREASE = 3
TARGET_RECOVERY_HOURS = 3
TARGET_RECOVERY = timedelta(hours=TARGET_RECOVERY_HOURS)
RETRY_DELAY = timedelta(minutes=15)
MIN_MEDIUM_R2 = 0.2
LOOKBACK_YEARS = 3
DESIGN_TEMP = -12.0
ATTIC_COMFORT = 20.0

type Row = dict[str, Any]
type Days = dict[date, dict[float, Row]]
type Stats = dict[str, Days]


@dataclass(frozen=True)
class AdvisorOptions:
    lookback_years: int = LOOKBACK_YEARS
    thermal_kw: float | None = None
    design_temp: float = DESIGN_TEMP
    attic_comfort: float = ATTIC_COMFORT
    curve_outdoor_max: float = CURVE_OUTDOOR_MAX
    low_duty_pct: float = LOW_DUTY_PCT
    high_duty_pct: float = HIGH_DUTY_PCT

    @classmethod
    def from_options(cls, raw: dict[str, Any]) -> AdvisorOptions:
        years = _number(raw.get("advisor_lookback_years"))
        thermal = _number(raw.get("advisor_thermal_kw"))
        design = _number(raw.get("advisor_design_temp"))
        attic = _number(raw.get("advisor_attic_comfort"))
        return cls(
            max(1, min(LOOKBACK_YEARS, int(years))) if years is not None else LOOKBACK_YEARS,
            thermal if thermal is not None and thermal > 0 else None,
            design if design is not None else DESIGN_TEMP,
            attic if attic is not None else ATTIC_COMFORT,
        )


def _number(value: Any) -> float | None:
    if isinstance(value, (int, float)) and not isinstance(value, bool) and isfinite(value):
        return float(value)
    return None


def group_hourly(rows: dict[str, list[Row]], zone: tzinfo) -> Stats:
    grouped: Stats = {}
    for key, series in rows.items():
        days = grouped[key] = {}
        for row in series:
            ts = row["start"]
            day = datetime.fromtimestamp(ts, zone).date()
            days.setdefault(day, {})[ts] = row
    return grouped


def _measurements(rows: dict[float, Row], field: str) -> dict[float, float]:
    return {ts: value for ts, row in rows.items() if (value := _number(row.get(field))) is not None}


def counter_days(days: Days) -> Callable[[date], float | None]:
    """Daily counter increase from the running sum at local-day boundaries.

    Imported statistics contain rows only for hours in which the counter
    changed, so a missing hour means no change. A day without rows counts as
    zero when the counter is known both before and after it. Resets and
    increases above 24 h make the day unusable.
    """
    ends = sorted(
        (day, sums[max(sums)]) for day, rows in days.items() if (sums := _measurements(rows, "sum"))
    )
    dates = [day for day, _ in ends]

    def change(day: date) -> float | None:
        i = bisect_left(dates, day)
        if i == 0 or i == len(dates):
            return None
        before = ends[i - 1][1]
        total = ends[i][1] - before if dates[i] == day else 0.0
        return total if 0 <= total <= 24 else None

    return change


def model_days(stats: Stats) -> list[tuple[date, float, float]]:
    rows = []
    compressor = counter_days(stats.get(COMPRESSOR, {}))
    for day, outdoor in stats.get(OUTDOOR, {}).items():
        means = _measurements(outdoor, "mean")
        runtime = compressor(day)
        if len(means) >= HOURS_REQUIRED and runtime is not None:
            rows.append((day, mean(means.values()), runtime))
    return rows


@dataclass
class _Fit:
    n: int = 0
    sx: float = 0
    sy: float = 0
    sxx: float = 0
    sxy: float = 0
    syy: float = 0

    def add(self, x: float, y: float) -> None:
        self.n += 1
        self.sx += x
        self.sy += y
        self.sxx += x * x
        self.sxy += x * y
        self.syy += y * y

    def line(self) -> tuple[float, float, float, float | None, float] | None:
        """Slope, intercept, R², slope standard error, and SSE relative to zero."""
        if self.n < 2:
            return None
        xx = self.sxx - self.sx**2 / self.n
        xy = self.sxy - self.sx * self.sy / self.n
        yy = self.syy - self.sy**2 / self.n
        if xx <= 0 or xy >= 0 or yy <= 0:
            return None
        slope = xy / xx
        intercept = (self.sy - slope * self.sx) / self.n
        sse = max(0.0, yy - slope * xy)
        se = sqrt(sse / ((self.n - 2) * xx)) if self.n > 2 else None
        return slope, intercept, 1 - sse / yy, se, sse - self.syy


def fit_model(
    days: list[tuple[date, float, float]], options: AdvisorOptions, incomplete: int = 0
) -> Row:
    # Try each split between outdoor temperatures. A split is admissible when
    # the cold-side fit crosses zero between the last included and first excluded
    # temperature. Rank fits by squared error with a zero prediction on the warm side.
    ordered = sorted(days, key=lambda row: row[1])
    fit = _Fit()
    best = None
    used = 0
    for i, (_, outdoor, runtime) in enumerate(ordered, 1):
        fit.add(outdoor, runtime)
        next_outdoor = ordered[i][1] if i < len(ordered) else float("inf")
        if next_outdoor == outdoor or (line := fit.line()) is None:
            continue
        slope, intercept, _, _, error = line
        if outdoor < -intercept / slope <= next_outdoor and (best is None or error < best[-1]):
            best, used = line, i

    result = {
        "slope_h_per_k": None,
        "balance_temp": None,
        "r2": None,
        "days": used,
        "days_incomplete": incomplete,
        "heat_loss_wk_low": None,
        "heat_loss_wk_high": None,
        "design_loss_kw_low": None,
        "design_loss_kw_high": None,
        "thermal_kw": options.thermal_kw,
        "design_temp": options.design_temp,
        "confidence": "low",
        "seasons": [],
    }
    if best is None:
        return result

    slope, intercept, r2, se, _ = best
    balance = -intercept / slope
    seasons: dict[str, _Fit] = {}
    for day, outdoor, runtime in ordered[:used]:
        seasons.setdefault(season_of(day), _Fit()).add(outdoor, runtime)
    season_slopes = []
    for name, season in sorted(seasons.items(), reverse=True):
        line = season.line()
        season_slopes.append(
            {"season": name, "slope_h_per_k": -line[0] if line else None, "days": season.n}
        )
    confidence = "low"
    if used > 60 and r2 >= 0.4:
        confidence = "high"
    elif used >= 20 and r2 >= MIN_MEDIUM_R2:
        confidence = "medium"
    result.update(
        slope_h_per_k=-slope,
        balance_temp=balance,
        r2=r2,
        confidence=confidence,
        seasons=season_slopes,
    )
    if options.thermal_kw is not None and se is not None:
        low = max(0.0, -slope - se) * options.thermal_kw / 24
        high = (-slope + se) * options.thermal_kw / 24
        design_delta = max(0.0, balance - options.design_temp)
        result.update(
            heat_loss_wk_low=low * 1000,
            heat_loss_wk_high=high * 1000,
            design_loss_kw_low=low * design_delta,
            design_loss_kw_high=high * design_delta,
        )
    return result


@dataclass(frozen=True)
class CurveDay:
    outdoor: float
    circuit: float
    ref: float
    target: float
    cold_hours: int
    attic: float | None
    points: dict[str, float]
    hysteresis: float


def _recovery_hours(stats: Stats) -> set[float]:
    targets = {}
    for key in (TARGET, EFFECTIVE_TARGET):
        for rows in stats.get(key, {}).values():
            targets.update(_measurements(rows, "mean"))
    recovering = set()
    until = 0.0
    previous = None
    for ts, target in sorted(targets.items()):
        if previous is not None:
            last_ts, last_target = previous
            if (
                ts - last_ts == timedelta(hours=1).total_seconds()
                and round(target - last_target, 8) >= MIN_TARGET_RISE
            ):
                until = ts + TARGET_RECOVERY.total_seconds()
        if ts < until:
            recovering.add(ts)
        previous = ts, target
    return recovering


def curve_days(
    stats: Stats,
    *,
    has_attic: bool,
    options: AdvisorOptions | None = None,
    missing_attic: set[date] | None = None,
) -> dict[date, CurveDay]:
    result = {}
    options = options or AdvisorOptions()
    recovering = _recovery_hours(stats)
    circuits = counter_days(stats.get(CIRCUIT, {}))
    for day, rows in stats.get(OUTDOOR, {}).items():
        outdoor = _measurements(rows, "mean")
        if (
            len(outdoor) < HOURS_REQUIRED
            or (outdoor_mean := mean(outdoor.values())) >= options.curve_outdoor_max
        ):
            continue

        def daily(key: str, day: date = day) -> dict[float, Row]:
            return stats.get(key, {}).get(day, {})

        ref = _measurements(daily(REF), "mean")
        target = _measurements(daily(TARGET), "mean") | _measurements(
            daily(EFFECTIVE_TARGET), "mean"
        )
        attic = _measurements(daily(ATTIC), "min")
        paired = ref.keys() & target.keys()
        comparable = paired - recovering
        hysteresis = [
            value for value in _measurements(daily(HYSTERESIS), "mean").values() if value > 0
        ]
        circuit = circuits(day)
        points = {
            key: {
                ts: value
                for ts, row in daily(key).items()
                if (value := _number(row.get("mean"))) is not None
                and _number(row.get("min")) is not None
                and _number(row.get("max")) is not None
            }
            for key in CURVE_KEYS
        }
        if (
            circuit is None
            or len(paired) < HOURS_REQUIRED
            or len(comparable) < HOURS_REQUIRED - TARGET_RECOVERY_HOURS
            or any(len(series) < HOURS_REQUIRED for series in points.values())
        ):
            continue
        if has_attic and len(attic) < HOURS_REQUIRED:
            if missing_attic is not None:
                missing_attic.add(day)
            continue
        result[day] = CurveDay(
            outdoor_mean,
            circuit,
            mean(ref[ts] for ts in comparable),
            mean(target[ts] for ts in comparable),
            sum(round(target[ts] - ref[ts], 8) > COLD_DEFICIT for ts in comparable),
            min(attic.values()) if has_attic else None,
            {key: series[max(series)] for key, series in points.items()},
            mean(hysteresis) if hysteresis else DEFAULT_HYSTERESIS,
        )
    return result


@dataclass(frozen=True)
class PointDay:
    changed: bool
    first: tuple[float, float]
    last: tuple[float, float]


type Variation = dict[str, dict[date, PointDay]]


def curve_variation(stats: Stats) -> Variation:
    result: Variation = {key: {} for key in CURVE_KEYS}
    for key, days in result.items():
        for day, rows in stats.get(key, {}).items():
            lows = _measurements(rows, "min")
            highs = _measurements(rows, "max")
            hours = lows.keys() & highs.keys()
            if hours:
                first, last = min(hours), max(hours)
                days[day] = PointDay(
                    min(lows[ts] for ts in hours) != max(highs[ts] for ts in hours),
                    (lows[first], highs[first]),
                    (lows[last], highs[last]),
                )
    return result


def _last_change(variation: Variation, start: date) -> date | None:
    changed = []
    for days in variation.values():
        previous = None
        for day, point in sorted(days.items()):
            low, high = point.first
            new_setting = previous is not None and (low > previous[1] or high < previous[0])
            if day >= start and (point.changed or new_setting):
                changed.append(day)
            previous = point.last
    return max(changed, default=None)


def _covering_points(days: list[CurveDay]) -> list[Row]:
    values = days[-1].points
    # Neighboring points define the interpolation segment. Outside the curve,
    # only the end point applies. At a breakpoint use that point alone.
    points = sorted(
        ((values[outdoor], name) for name, outdoor, _ in POINTS), key=lambda point: point[0]
    )
    selected = set()
    for day in days:
        lower = max((point for point in points if point[0] <= day.outdoor), default=points[0])
        upper = min((point for point in points if point[0] >= day.outdoor), default=points[-1])
        selected.update((lower[0], upper[0]))
    return [{"id": name, "outdoor_c": temp} for temp, name in points if temp in selected]


def _days_text(days: int) -> str:
    unit = "den" if days == 1 else "dny" if 2 <= days <= 4 else "dní"
    return f"{days} {unit}"


def _assess_curve(
    days: dict[date, CurveDay],
    variation: Variation,
    options: AdvisorOptions,
    today: date,
    missing_attic: set[date],
) -> Row:
    first = today - timedelta(days=CURVE_WINDOW_DAYS)
    dates = sorted(day for day in days if first <= day < today)[-CURVE_DAYS:]
    latest = [days[day] for day in dates]
    n = len(latest)
    duty = mean(day.circuit for day in latest) / 24 * 100 if n else None
    ref = mean(day.ref for day in latest) if n else None
    target = mean(day.target for day in latest) if n else None
    attic = min((day.attic for day in latest if day.attic is not None), default=None)
    missing = max(0, MIN_CURVE_DAYS - n)
    cold = f"s průměrnou venkovní teplotou pod {options.curve_outdoor_max:g} °C"
    result = {
        "status": "insufficient_data",
        "days_used": n,
        "days_missing": missing,
        "circuit_duty_pct": duty,
        "ref_mean": ref,
        "ref_target": target,
        "attic_min": attic,
        "point": [],
        "step_c": None,
        "text": f"Za posledních {CURVE_WINDOW_DAYS} dní chybí ještě {_days_text(missing)} "
        f"s úplnými údaji a {cold}.",
    }
    if missing and any(first <= day < today for day in missing_attic):
        result["text"] += " V některých chladných dnech chybí údaje z čidla v podkroví."
    observed = {
        key: {day: row for day, row in rows.items() if day <= today}
        for key, rows in variation.items()
    }
    change = _last_change(observed, first) if dates else None
    waiting = CURVE_DAYS - sum(change is not None and day > change for day in dates)
    if change is not None and waiting > 0:
        result.update(
            status="recent_change",
            days_missing=waiting,
            text=f"Čerstvá změna křivky. Vyhodnotím ji za {_days_text(waiting)} "
            f"s úplnými údaji a {cold}.",
        )
    elif n >= MIN_CURVE_DAYS:
        assert duty is not None and ref is not None and target is not None
        delta = round(ref - target, 8)
        reserve = mean(day.hysteresis for day in latest)
        higher = sum(
            day.cold_hours > COLD_HOURS_PER_DAY for day in latest
        ) >= COLD_DAYS_FOR_INCREASE or (duty > options.high_duty_pct and delta < -reserve)
        lower = (
            delta >= reserve
            and duty < options.low_duty_pct
            and (attic is None or attic >= options.attic_comfort)
        )
        if higher or lower:
            points = _covering_points(latest)
            names = [
                f"{p['id']} (venku {p['outdoor_c']:+g}\u00a0°C)".replace(".", ",").replace("-", "−")
                for p in points
            ]
            what = f"v bodě křivky {names[0]}"
            if len(names) > 1:
                what = f"v bodech křivky {', '.join(names[:-1])} a {names[-1]}"
            verb = "zvýšit" if higher else "snížit"
            result.update(
                status="suggest_higher" if higher else "suggest_lower",
                point=points,
                step_c=1,
                text=f"Zkuste {verb} teplotu vody {what} o 1\u00a0°C. "
                "Pár dní sledujte referenční místnost"
                f"{' a podkroví' if attic is not None else ''}. Změnu můžete kdykoli vrátit.",
            )
        else:
            result.update(status="ok", text="Topnou křivku teď doporučuji ponechat.")
    return result


def assess_curve(
    days: dict[date, CurveDay],
    variation: Variation,
    options: AdvisorOptions,
    today: date,
    missing_attic: set[date] | None = None,
) -> Row:
    missing_attic = missing_attic or set()
    result = _assess_curve(days, variation, options, today, missing_attic)
    if result["status"] in ("suggest_higher", "suggest_lower"):
        # Re-evaluate the previous completed window so retries and restarts
        # cannot count the same day's evidence as a second confirmation.
        previous = _assess_curve(days, variation, options, today - timedelta(days=1), missing_attic)
        if (previous["status"], previous["point"]) != (result["status"], result["point"]):
            result.update(
                status="ok",
                point=[],
                step_c=None,
                text="Topnou křivku zatím ponechte. Návrh musí potvrdit další den.",
            )
    return result


def _read_advisor(
    hass: HomeAssistant, now: datetime, ids: dict[str, str], options: AdvisorOptions
) -> Row:
    from homeassistant.components.recorder.statistics import statistics_during_period

    today = now.date()
    zone = dt_util.get_default_time_zone()
    first_year = today.year - (today.month < 7) - options.lookback_years + 1
    start = date(first_year, 7, 1)

    def read(keys: tuple[str, ...], first: date, end: datetime, types: set[str]) -> Stats:
        selected = {key: ids[key] for key in keys if key in ids}
        if not selected:
            return {}
        rows = statistics_during_period(
            hass,
            dt_util.start_of_local_day(first),
            end,
            set(selected.values()),
            "hour",
            {"temperature": "°C", "duration": "h"},
            types,
        )
        return group_hourly({key: rows.get(sid, []) for key, sid in selected.items()}, zone)

    end = dt_util.start_of_local_day(today)
    # Imported counter rows are sparse. Earlier rows give the first day its
    # starting sum; a summer without compressor runs has no rows at all.
    history = read((OUTDOOR,), start, end, {"mean"}) | read(
        (COMPRESSOR,), start - timedelta(days=COUNTER_LEAD_DAYS), end, {"sum"}
    )
    model = model_days(history)
    curve: dict[date, CurveDay] = {}
    variation: Variation = {}
    missing_attic: set[date] = set()
    curve_keys = (OUTDOOR, CIRCUIT, REF, *CURVE_KEYS)
    if all(key in ids for key in curve_keys) and (EFFECTIVE_TARGET in ids or TARGET in ids):
        # One extra day for confirmation and one for the preceding curve settings/target.
        first = today - timedelta(days=CURVE_WINDOW_DAYS + 2)
        stats = read(
            (*curve_keys, TARGET, EFFECTIVE_TARGET, HYSTERESIS, ATTIC),
            first,
            now,
            {"mean", "sum", "min", "max"},
        )
        curve = curve_days(
            stats, has_attic=ATTIC in ids, options=options, missing_attic=missing_attic
        )
        variation = curve_variation(stats)

    return {
        "model": fit_model(model, options, (today - start).days - len(model)),
        "curve": assess_curve(curve, variation, options, today, missing_attic),
        "computed_at": now.isoformat(),
    }


class HeatingAdvisor:
    def __init__(
        self, hass: HomeAssistant, options: AdvisorOptions, entity_keys: list[str]
    ) -> None:
        self.hass = hass
        self.options = options
        self._entity_keys = frozenset(entity_keys)
        self.result: Row | None = None
        self._task: asyncio.Task | None = None
        self._cancel_retry: Callable[[], None] | None = None
        self._cancel_timer: Callable[[], None] | None = None

    @callback
    def start(self) -> None:
        # Give Recorder time to compile the last hourly row of yesterday.
        self._cancel_timer = async_track_time_change(
            self.hass, self._schedule, hour=0, minute=20, second=0
        )
        self._schedule(dt_util.now())

    @callback
    def _schedule(self, now: datetime, *, retry: bool = False) -> None:
        if self._cancel_retry is not None:
            self._cancel_retry()
            self._cancel_retry = None
        if self._task is None or self._task.done():
            self._task = self.hass.async_create_background_task(
                self._refresh(now, retry=retry), "homebrain_heating_advisor"
            )

    @callback
    def _retry(self, now: datetime) -> None:
        self._cancel_retry = None
        self._schedule(dt_util.as_local(now), retry=True)

    async def _refresh(self, now: datetime, *, retry: bool = False) -> None:
        from homeassistant.components.recorder import get_instance

        try:
            registry = er.async_get(self.hass)
            ids = {
                key: entity_id
                for key in (
                    OUTDOOR,
                    COMPRESSOR,
                    CIRCUIT,
                    REF,
                    TARGET,
                    EFFECTIVE_TARGET,
                    HYSTERESIS,
                    ATTIC,
                    *CURVE_KEYS,
                )
                if (key in self._entity_keys or key in (OUTDOOR, COMPRESSOR))
                and (entity_id := registry.async_get_entity_id("sensor", DOMAIN, unique_id(key)))
                and (entry := registry.async_get(entity_id))
                and not entry.disabled
            }
            for key in (OUTDOOR, COMPRESSOR):
                if registry.async_get_entity_id("sensor", DOMAIN, unique_id(key)) is None:
                    ids[key] = f"sensor.{unique_id(key)}"
            if "recorder" not in self.hass.config.components:
                self.result = {
                    "model": fit_model([], self.options),
                    "curve": assess_curve({}, {}, self.options, now.date()),
                    "computed_at": now.isoformat(),
                }
                return
            self.result = await get_instance(self.hass).async_add_executor_job(
                _read_advisor, self.hass, now, ids, self.options
            )
        except Exception:  # noqa: BLE001 - keep the heating module available
            self.result = None
            if not retry:
                self._cancel_retry = async_call_later(self.hass, RETRY_DELAY, self._retry)
            _LOGGER.exception("Topení: advisor statistics could not be read")

    async def stop(self) -> None:
        if self._cancel_retry is not None:
            self._cancel_retry()
            self._cancel_retry = None
        if self._cancel_timer is not None:
            self._cancel_timer()
        if self._task is not None:
            self._task.cancel()
            await asyncio.gather(self._task, return_exceptions=True)
