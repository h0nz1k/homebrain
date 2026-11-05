"""ČHMÚ warnings from the public alerts.json feed (CC BY 4.0)."""

from __future__ import annotations

from datetime import datetime
from typing import Any

URL = "https://vystrahy-cr.chmi.cz/data/alerts.json"

# ČHMÚ maps CAP severity to the colour scale used in its own UI.
SEVERITY_LEVEL = {"Minor": 1, "Moderate": 2, "Severe": 3, "Extreme": 4}
LEVEL_LABEL_CS = {1: "Žlutá", 2: "Oranžová", 3: "Červená", 4: "Fialová"}


def _cs(value: Any) -> str:
    if isinstance(value, dict):
        return str(value.get("cz") or "").strip()
    return str(value or "").strip()


def _parse_time(value: Any) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None


def parse_alerts(
    payload: dict[str, Any], region: str | None, now: datetime
) -> list[dict[str, Any]]:
    """Return active warnings; with a region code (e.g. 'CZ020') keep only that kraj."""
    warnings: dict[str, dict[str, Any]] = {}
    for group in payload.get("phenomenon_groups") or []:
        category = str(group.get("alternative_phenomenon_category") or "")
        for area_group in group.get("area_groups") or []:
            area_ids = [str(area.get("id", "")) for area in area_group.get("areas") or []]
            if region and not any(area_id.endswith(f":{region}") for area_id in area_ids):
                continue
            for alert in area_group.get("single_alerts") or []:
                if not alert.get("phenomenon") or alert.get("is_cancellation"):
                    continue
                level = SEVERITY_LEVEL.get(str(alert.get("severity")), 1)
                onset = _parse_time(alert.get("t_from"))
                expires = _parse_time(alert.get("t_to"))
                if expires is not None and expires <= now:
                    continue
                name = _cs((alert.get("parameters") or {}).get("phenomenon_name")) or _cs(
                    alert.get("headline")
                )
                key = f"{category}|{alert.get('phenomenon')}|{alert.get('t_from')}"
                warnings[key] = {
                    "id": key,
                    "category": category,
                    "event": name or str(alert.get("phenomenon")),
                    "level": level,
                    "level_label": LEVEL_LABEL_CS[level],
                    "severity": alert.get("severity"),
                    "headline": _cs(alert.get("headline")),
                    "description": _cs(alert.get("description")),
                    "instruction": _cs(alert.get("instruction")),
                    "onset": onset.isoformat() if onset else None,
                    "expires": expires.isoformat() if expires else None,
                    "region_filtered": bool(region),
                }
    return sorted(warnings.values(), key=lambda item: (-item["level"], item["onset"] or ""))
