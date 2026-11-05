"""Hlídání přezápisu – pure rule (thresholds from health.py constants)."""

from datetime import UTC, date, datetime, timedelta

from custom_components.homebrain.access.health import (
    ADULT_MAX_MONTHS,
    CHILD_MAX_MONTHS,
    entry_health,
    months_between,
    notification_text,
    reenroll_reasons,
)

NOW = datetime(2026, 11, 4, 12, 0, tzinfo=UTC)


def ev(kind, seconds_ago, user_id=None, **extra):
    return {
        "kind": kind,
        "time": (NOW - timedelta(seconds=seconds_ago)).isoformat(),
        "user_id": user_id,
        **extra,
    }


def test_months_between():
    assert months_between(date(2025, 1, 31), date(2025, 2, 28)) == 0
    assert months_between(date(2025, 1, 15), date(2026, 1, 15)) == 12
    assert months_between(date(2027, 1, 1), date(2026, 1, 1)) == 0


def test_retry_attribution_and_success_rate():
    history = [
        ev("rejected", 500),
        ev("rejected", 480),
        ev("recognized", 470, 1002),  # 3rd attempt
        ev("rejected", 300),
        ev("recognized", 200, 1002),  # rejection too old (100 s) – not counted
        ev("rejected", 100),
        ev("recognized", 90, 1001),  # someone else's retry
        ev("recognized", 10, 1002),
        ev("recognized", 20 * 86400, 1002),  # outside 14 days
    ]
    h = entry_health(1002, history, NOW)
    assert h == {
        "attempts": 5,
        "successes": 3,
        "success_rate": 0.6,
        "retries": 1,
        "worst_attempt": 3,
        "score_trend": None,
    }
    assert entry_health(1001, history, NOW)["retries"] == 1
    assert entry_health(5, history, NOW)["success_rate"] is None


def test_score_trend_optional():
    good = [ev("recognized", 1000 - i, 1, score=0.95) for i in range(5)]
    bad = [ev("recognized", 500 - i, 1, similarity="0.80") for i in range(5)]
    assert entry_health(1, good + bad, NOW)["score_trend"] == "falling"
    assert entry_health(1, good + good, NOW)["score_trend"] == "stable"


def test_reasons_age_child_vs_adult():
    fine = {"attempts": 0, "retries": 0, "success_rate": None}
    today = date(2026, 11, 4)
    child_old = (today - timedelta(days=31 * CHILD_MAX_MONTHS)).isoformat()
    assert reenroll_reasons(child_old, True, fine, today) == ["age"]
    assert reenroll_reasons(child_old, False, fine, today) == []
    adult_old = date(today.year - ADULT_MAX_MONTHS // 12, today.month, today.day).isoformat()
    assert reenroll_reasons(adult_old, False, fine, today) == ["age"]
    assert reenroll_reasons(None, True, fine, today) == []
    assert reenroll_reasons("garbage", True, fine, today) == []


def test_reasons_retries_and_rate():
    today = date(2026, 11, 4)
    assert reenroll_reasons(
        None, False, {"retries": 3, "attempts": 3, "success_rate": 1.0}, today
    ) == ["retries"]
    assert reenroll_reasons(
        None, False, {"retries": 2, "attempts": 5, "success_rate": 0.79}, today
    ) == ["success_rate"]
    assert (
        reenroll_reasons(None, False, {"retries": 0, "attempts": 4, "success_rate": 0.5}, today)
        == []
    )
    assert (
        reenroll_reasons(None, False, {"retries": 0, "attempts": 5, "success_rate": 0.8}, today)
        == []
    )


def test_notification_text_czech():
    text = notification_text("Tomáš", "palm", "left", ["age", "retries"])
    assert text.startswith("Doporučuji přezapsat levou dlaň (Tomáš): zápis je starý, často pozná")
