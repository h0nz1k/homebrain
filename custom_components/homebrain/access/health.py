"""Hlídání přezápisu: pure health + re-enrol advice per sensor ID (no HA imports, unit-tested).

Children grow – a face changes within about a year and the palm vein pattern scales with the
hand – so old enrolments slowly stop matching. Signals:

* age of the enrolment (``enrolled_at`` label kept HA-side; never biometric data),
* "poznal až na N. pokus": ``rejected`` events followed within ``RETRY_WINDOW_S`` by a
  ``recognized`` event of the same ID are attributed to that ID as failed attempts,
* success rate over ``HEALTH_DAYS`` (attributed rejections only – a rejection nobody resolved
  cannot be attributed to anyone),
* optional ``score`` / ``similarity`` in ``esphome.biolock_recognized`` (not sent by the current
  firmware): a falling trend is reported, it does not trigger advice on its own.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import Any

CHILD_MAX_MONTHS = 9
ADULT_MAX_MONTHS = 24
RETRY_WINDOW_S = 60
HEALTH_DAYS = 14
RETRY_LIMIT = 3
MIN_ATTEMPTS = 5
MIN_SUCCESS_RATE = 0.8
SCORE_DROP = 0.05  # relative drop of the mean of the last 5 scores vs the 5 before

REASON_AGE = "age"
REASON_RETRIES = "retries"
REASON_SUCCESS = "success_rate"


def _dt(value: Any) -> datetime | None:
    if isinstance(value, datetime):
        return value
    try:
        return datetime.fromisoformat(str(value))
    except (TypeError, ValueError):
        return None


def months_between(start: date, end: date) -> int:
    """Whole months elapsed (2025-01-31 → 2025-02-28 is 0)."""
    months = (end.year - start.year) * 12 + end.month - start.month
    if end.day < start.day:
        months -= 1
    return max(0, months)


def entry_health(user_id: int, history: list[dict[str, Any]], now: datetime) -> dict[str, Any]:
    """Health of one ID from recognition history (oldest or newest first – it is sorted here)."""
    since = now - timedelta(days=HEALTH_DAYS)
    events = sorted(
        ((t, e) for e in history if (t := _dt(e.get("time"))) is not None and t >= since),
        key=lambda pair: pair[0],
    )
    successes = 0
    failures = 0
    retries = 0
    worst = 1
    scores: list[float] = []
    pending: list[datetime] = []  # unattributed rejections in the window
    for time, event in events:
        kind = event.get("kind")
        if kind == "rejected":
            pending.append(time)
            continue
        if kind != "recognized":
            continue
        window = [t for t in pending if (time - t).total_seconds() <= RETRY_WINDOW_S]
        pending = []
        if event.get("user_id") != user_id:
            continue
        successes += 1
        if window:
            failures += len(window)
            retries += 1
            worst = max(worst, len(window) + 1)
        for key in ("score", "similarity"):
            try:
                scores.append(float(event[key]))
                break
            except (KeyError, TypeError, ValueError):
                continue
    attempts = successes + failures
    trend = None
    if len(scores) >= 10:
        recent, before = sum(scores[-5:]) / 5, sum(scores[-10:-5]) / 5
        trend = "falling" if before > 0 and (before - recent) / before >= SCORE_DROP else "stable"
    return {
        "attempts": attempts,
        "successes": successes,
        "success_rate": round(successes / attempts, 3) if attempts else None,
        "retries": retries,
        "worst_attempt": worst if retries else None,
        "score_trend": trend,
    }


def reenroll_reasons(
    enrolled_at: str | None, child: bool, health: dict[str, Any], today: date
) -> list[str]:
    """Why to re-enrol this ID (empty = fine). Age needs a known ``enrolled_at``."""
    reasons: list[str] = []
    if enrolled_at:
        try:
            enrolled = date.fromisoformat(enrolled_at[:10])
        except ValueError:
            enrolled = None
        limit = CHILD_MAX_MONTHS if child else ADULT_MAX_MONTHS
        if enrolled and months_between(enrolled, today) >= limit:
            reasons.append(REASON_AGE)
    if health.get("retries", 0) >= RETRY_LIMIT:
        reasons.append(REASON_RETRIES)
    rate = health.get("success_rate")
    if rate is not None and health.get("attempts", 0) >= MIN_ATTEMPTS and rate < MIN_SUCCESS_RATE:
        reasons.append(REASON_SUCCESS)
    return reasons


REASON_CS = {
    REASON_AGE: "zápis je starý",
    REASON_RETRIES: "často pozná až na další pokus",
    REASON_SUCCESS: "nízká úspěšnost",
}


def notification_text(person: str, kind: str, hand: str | None, reasons: list[str]) -> str:
    what = (
        "obličej"
        if kind == "face"
        else {"right": "pravou dlaň", "left": "levou dlaň"}.get(hand or "", "dlaň")
    )
    why = ", ".join(REASON_CS[r] for r in reasons if r in REASON_CS)
    return (
        f"Doporučuji přezapsat {what} ({person}): {why}. "
        "HomeBrain → Přístup → Osoby → Přezapsat. "
        "Starý záznam se smaže až po úspěšném novém zápisu."
    )
