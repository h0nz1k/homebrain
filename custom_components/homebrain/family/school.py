"""Daily school website import and role-scoped snapshots from HA Store."""

from __future__ import annotations

import asyncio
import logging
from collections.abc import Callable
from datetime import date, timedelta
from typing import Any
from urllib.parse import unquote, urlsplit

import voluptuous as vol
from homeassistant.components import websocket_api
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HassJob, HomeAssistant, callback
from homeassistant.helpers.event import async_track_point_in_time
from homeassistant.helpers.storage import Store
from homeassistant.util import dt as dt_util

from ..const import DOMAIN
from ..wine.domain import WineError
from ..wine.safe_fetch import SafeFetcher, check_public_url, create_session
from .school_parse import menu_links, menu_weeks, parse_bells, parse_events, parse_menu
from .ws_common import _role, _visible_kids, family_options

_LOGGER = logging.getLogger(__name__)
DEFAULT_REMINDER = 3
URL_FIELDS = {
    "lunch": "menu_url",
    "events": "events_url",
    "dates": "dates_url",
    # Bell schedule page („Časový rozvrh vyučování“); feeds the timetable, not this snapshot.
    "bells": "bells_url",
}
SNAPSHOT_KINDS = ("lunch", "events", "dates")


def school_url(raw: str) -> str:
    if not raw.strip():
        return ""
    try:
        return check_public_url(raw)
    except (ValueError, WineError) as err:
        raise vol.Invalid("Zadejte veřejnou adresu HTTPS.") from err


SCHOOL_SETTINGS = vol.Schema(
    {
        **{
            vol.Optional(field, default=""): vol.All(str, school_url)
            for field in URL_FIELDS.values()
        },
        vol.Optional("reminder_days", default=DEFAULT_REMINDER): vol.All(
            int, vol.Range(min=0, max=365)
        ),
    }
)


def _decode(body: bytes) -> str:
    # Older school sites sometimes publish in Windows-1250.
    try:
        return body.decode("utf-8-sig")
    except UnicodeDecodeError:
        return body.decode("cp1250", errors="replace")


def _window(kind: str, rows: Any, today: date) -> Any:
    if kind == "bells":
        return rows
    if kind == "lunch":
        start = today - timedelta(days=today.weekday())
        end = start + timedelta(days=11)
    elif kind == "events":
        start, end = today, today + timedelta(days=60)
    else:
        start = today
        try:
            end = today.replace(year=today.year + 1)
        except ValueError:
            end = today.replace(year=today.year + 1, day=28)
    return sorted(
        (
            row
            for row in rows
            if (row.get("end_date") or row["date"]) >= start.isoformat()
            and row["date"] <= end.isoformat()
        ),
        key=lambda row: row["date"],
    )


def school_snapshot(
    options: dict,
    cached: dict,
    today: date,
    role: str,
    kids: list[dict],
    *,
    reminders_only: bool = False,
) -> dict:
    sources = {
        kind: cached.get(kind, {})
        for kind in SNAPSHOT_KINDS
        if options.get(URL_FIELDS[kind]) and (role != "child" or kind != "dates")
    }
    matched = {
        kind: source
        for kind, source in sources.items()
        if source.get("url") == options[URL_FIELDS[kind]]
    }
    stamps = [source["updated_at"] for source in matched.values() if source.get("updated_at")]
    allowed = role != "child" or bool(kids)
    result: dict[str, Any] = {
        "enabled": bool(sources) and allowed,
        "updated_at": min(stamps, default=None) if allowed else None,
        "lunch": [],
        "events": [],
        "dates": [],
    }
    if not result["enabled"]:
        return result
    for kind, source in matched.items():
        rows = _window(kind, source.get("rows", []), today)
        if kind == "events":
            for row in rows:
                ids = [
                    kid["id"]
                    for kid in kids
                    if row["grades"] is None or kid.get("grade") in row["grades"]
                ]
                if ids or role in ("owner", "adult"):
                    result[kind].append(
                        {
                            **{
                                field: row[field]
                                for field in ("date", "end_date", "title", "grades")
                            },
                            "person_ids": ids,
                        }
                    )
        elif kind == "dates":
            if role not in ("owner", "adult", "kiosk"):
                continue
            end = today + timedelta(days=options.get("reminder_days", DEFAULT_REMINDER))
            result[kind] = [
                {"date": row["date"], "title": row["title"]}
                for row in rows
                if not (reminders_only or role == "kiosk")
                or today.isoformat() <= row["date"] <= end.isoformat()
            ]
        else:
            result[kind] = rows
    return result


class SchoolImport:
    def __init__(self, hass: HomeAssistant, entry: ConfigEntry) -> None:
        self.hass = hass
        self.entry = entry
        self.store = Store(hass, 1, f"{DOMAIN}.family_school", private=True)
        self.data: dict = {}
        self._lock = asyncio.Lock()
        self._cancel_daily: Callable[[], None] | None = None

    def options(self) -> dict:
        return family_options(self.hass).get("school") or {}

    async def async_setup(self) -> None:
        self.data = await self.store.async_load() or {}
        self.entry.async_on_unload(self._stop_daily)
        self.entry.async_on_unload(self.entry.add_update_listener(self._options_updated))
        self._urls = self._configured_urls()
        self._schedule_daily()
        self.start()

    @callback
    def _stop_daily(self) -> None:
        if self._cancel_daily:
            self._cancel_daily()
            self._cancel_daily = None

    @callback
    def _schedule_daily(self) -> None:
        if not any(self._urls):
            return
        now = dt_util.now()
        run_at = now.replace(hour=4, minute=30, second=0, microsecond=0)
        if run_at <= now:
            run_at += timedelta(days=1)
        self._cancel_daily = async_track_point_in_time(
            self.hass,
            HassJob(self._daily, "homebrain school refresh", cancel_on_shutdown=True),
            run_at,
        )

    @callback
    def _daily(self, _now) -> None:
        self._cancel_daily = None
        self._schedule_daily()
        self.start()

    def _configured_urls(self) -> tuple:
        options = self.options()
        return tuple(options.get(field) or "" for field in URL_FIELDS.values())

    async def _options_updated(self, _hass, _entry) -> None:
        urls = self._configured_urls()
        if urls != self._urls:
            self._urls = urls
            self._stop_daily()
            self._schedule_daily()
            self.start()

    @callback
    def start(self) -> None:
        if any(self._configured_urls()) or self.data:
            self.entry.async_create_background_task(
                self.hass, self.refresh(), "homebrain_family_school"
            )

    async def _menu(self, fetcher, html, base, today, old_rows):
        weeks = menu_weeks(today)
        candidates = await self.hass.async_add_executor_job(menu_links, html, base, weeks)
        downloads: dict[str, tuple[bytes, str] | None] = {}
        rows = old_rows
        parsed = set()
        for week, links in candidates.items():
            for href, dated_link in links:
                try:
                    if href not in downloads:
                        downloads[href] = None
                        body, _, content_type = await fetcher.get(href, "pdf")
                        downloads[href] = body, content_type
                    if (download := downloads[href]) is None:
                        continue
                    body, content_type = download
                    if (
                        not dated_link
                        and content_type != "application/pdf"
                        and not unquote(urlsplit(href).path).lower().endswith(".pdf")
                    ):
                        continue
                    covered, menu = await self.hass.async_add_executor_job(
                        parse_menu, body, week, dated_link
                    )
                except (WineError, ValueError, OSError):
                    continue
                if covered:
                    week_end = week + timedelta(days=5)
                    rows = [
                        row
                        for row in rows
                        if not week.isoformat() <= row["date"] < week_end.isoformat()
                    ] + menu
                    parsed.add(week)
                    break
        if not parsed:
            raise ValueError("No current school PDF could be read")
        retained = any(
            week.isoformat() <= row["date"] < (week + timedelta(days=5)).isoformat()
            for week in set(weeks) - parsed
            for row in rows
        )
        return rows, retained

    async def refresh(self) -> None:
        async with self._lock:
            options = self.options()
            urls = self._configured_urls()
            today = dt_util.now().date()
            next_data = {}
            for kind, field in URL_FIELDS.items():
                url = options.get(field)
                old = self.data.get(kind, {})
                if url and old.get("url") == url:
                    next_data[kind] = {**old, "rows": _window(kind, old["rows"], today)}
            if any(urls):
                # The connector receives an already initialised HA SSL context via create_session.
                async with create_session(allow_cookies=False) as session:
                    fetcher = SafeFetcher(session, user_agent="HomeBrain")
                    for kind, field in URL_FIELDS.items():
                        if not (url := options.get(field)):
                            continue
                        try:
                            async with asyncio.timeout(60):
                                body, base, _ = await fetcher.get(url)
                                html = _decode(body)
                                retained = False
                                if kind == "lunch":
                                    rows, retained = await self._menu(
                                        fetcher,
                                        html,
                                        base,
                                        today,
                                        next_data.get(kind, {}).get("rows", []),
                                    )
                                elif kind == "bells":
                                    rows = await self.hass.async_add_executor_job(parse_bells, html)
                                else:
                                    rows = await self.hass.async_add_executor_job(
                                        parse_events, html, today, kind == "dates"
                                    )
                        except (WineError, TimeoutError, ValueError, OSError):
                            _LOGGER.debug("School refresh failed for %s", kind)
                            continue
                        next_data[kind] = {
                            "url": url,
                            "updated_at": (
                                next_data[kind]["updated_at"]
                                if retained
                                else dt_util.now().isoformat()
                            ),
                            "rows": _window(kind, rows, today),
                        }
            if urls == self._configured_urls() and next_data != self.data:
                await self.store.async_save(next_data)
                self.data = next_data


@websocket_api.websocket_command(
    {
        vol.Required("type"): "homebrain/family/school",
        vol.Optional("reminders_only", default=False): bool,
    }
)
@callback
def websocket_school(hass, connection, msg) -> None:
    role = _role(hass, connection)
    school = hass.data.get(DOMAIN, {}).get("family_school")
    kids = (
        _visible_kids(hass, connection, role) if school and any(school._configured_urls()) else []
    )
    connection.send_result(
        msg["id"],
        school_snapshot(
            school.options() if school else {},
            school.data if school else {},
            dt_util.now().date(),
            role,
            kids,
            reminders_only=msg.get("reminders_only", False),
        ),
    )
