"""Day-ahead spot prices for Energie „Srovnání nabídek“: OTE-CR + CNB EUR/CZK.

Sources (public, no key):
- OTE-CR chart data of the day-ahead market, one JSON per delivery day:
  ``https://www.ote-cr.cz/pw-data/chart-data/01?language=cs&report_date=YYYY-MM-DD``
  (the old ``/cs/kratkodobe-trhy/elektrina/denni-trh/@@chart-data`` URL redirects here).
  Since 2025-10-01 the line ``15min cena (EUR/MWh)`` has 92/96/100 quarter-hours, before that
  ``Cena (EUR/MWh)`` has 23/24/25 hours. Periods run from local midnight (Europe/Prague).
- CNB daily fixing, one text file per year:
  ``https://www.cnb.cz/cs/financni-trhy/devizovy-trh/kurzy-devizoveho-trhu/kurzy-devizoveho-trhu/rok.txt?rok=YYYY``

Recorder long-term statistics are hourly, so quarter-hour prices are averaged per hour. The cache
(HA Store ``homebrain.energy_spot``) keeps hourly EUR/MWh per UTC hour and the CNB rates.
"""

from __future__ import annotations

import asyncio
import json
import time
from collections.abc import Awaitable, Callable, Mapping
from datetime import UTC, date, datetime, timedelta, tzinfo
from typing import Any, Final

from homeassistant.core import HomeAssistant
from homeassistant.helpers.storage import Store

OTE_URL: Final = "https://www.ote-cr.cz/pw-data/chart-data/01?language=cs&report_date={day}"
CNB_URL: Final = (
    "https://www.cnb.cz/cs/financni-trhy/devizovy-trh/kurzy-devizoveho-trhu/"
    "kurzy-devizoveho-trhu/rok.txt?rok={year}"
)
STORE_KEY: Final = "homebrain.energy_spot"
REQUEST_DELAY_S: Final = 1.0  # polite: at most one OTE request per second
RETRY_FAILED_S: Final = 6 * 3600
RATES_TTL_S: Final = 6 * 3600
SAVE_EVERY: Final = 20

Fetch = Callable[[str], Awaitable[str]]


class SpotParseError(ValueError):
    """The OTE reply does not have the expected shape."""


def ote_url(day: date) -> str:
    return OTE_URL.format(day=day.isoformat())


def _midnight(day: date, tz: tzinfo) -> datetime:
    return datetime(day.year, day.month, day.day, tzinfo=tz).astimezone(UTC)


def _price_line(data: Mapping[str, Any]) -> list[Any] | None:
    lines = (data.get("data") or {}).get("dataLine") or []
    by_title = {str(line.get("title", "")): line for line in lines if isinstance(line, dict)}
    for title, line in by_title.items():
        if title.startswith("15min cena"):
            return line.get("point") or []
    for title, line in by_title.items():
        if title.startswith("Cena") and "EUR" in title:
            return line.get("point") or []
    return None


def parse_ote_chart(data: Mapping[str, Any], day: date, tz: tzinfo) -> list[tuple[float, float]]:
    """Hourly (UTC hour start timestamp, mean EUR/MWh) for one delivery day; [] = no data."""
    points = _price_line(data)
    if not points:
        return []
    try:
        values = [float(p["y"]) for p in sorted(points, key=lambda p: int(p["x"]))]
    except (KeyError, TypeError, ValueError) as err:
        raise SpotParseError("bad point") from err
    start = _midnight(day, tz)
    day_s = (_midnight(day + timedelta(days=1), tz) - start).total_seconds()
    hours = round(day_s / 3600)
    if len(values) == hours * 4:
        per_hour = 4
    elif len(values) == hours:
        per_hour = 1
    else:
        raise SpotParseError(f"{len(values)} periods on a {hours} h day")
    out = []
    for h in range(hours):
        chunk = values[h * per_hour : (h + 1) * per_hour]
        out.append((start.timestamp() + h * 3600, round(sum(chunk) / per_hour, 4)))
    return out


def parse_cnb_year(text: str) -> dict[str, float]:
    """``{ISO date: CZK per 1 EUR}`` from the CNB yearly fixing file."""
    lines = [line for line in text.splitlines() if line.strip()]
    if not lines:
        return {}
    header = lines[0].split("|")
    try:
        col = header.index("1 EUR")
    except ValueError:
        return {}
    out: dict[str, float] = {}
    for line in lines[1:]:
        cells = line.split("|")
        try:
            d = datetime.strptime(cells[0], "%d.%m.%Y").date()
            out[d.isoformat()] = float(cells[col].replace(",", "."))
        except (ValueError, IndexError):
            continue
    return out


def rate_on(rates: Mapping[str, float], day: date) -> float | None:
    """Fixing valid on ``day`` = the last one published on or before it (weekends, holidays)."""
    key = day.isoformat()
    best = None
    for d in rates:
        if d <= key and (best is None or d > best):
            best = d
    return rates[best] if best is not None else None


def czk_hours(
    hours: Mapping[str, float], rates: Mapping[str, float], tz: tzinfo
) -> dict[float, float]:
    """``{UTC hour timestamp: CZK/MWh}``; hours without a known rate are skipped."""
    out: dict[float, float] = {}
    sorted_rates = dict(sorted(rates.items()))
    cache: dict[date, float | None] = {}
    for key, eur in hours.items():
        ts = float(key)
        day = datetime.fromtimestamp(ts, tz).date()
        if day not in cache:
            cache[day] = rate_on(sorted_rates, day)
        rate = cache[day]
        if rate is not None:
            out[ts] = round(eur * rate, 4)
    return out


class SpotManager:
    """Cached OTE/CNB backfill with a polite request rate (one background job at a time)."""

    def __init__(self, hass: HomeAssistant, fetch: Fetch, delay: float = REQUEST_DELAY_S) -> None:
        self._hass = hass
        self._fetch = fetch
        self._delay = delay
        self._store: Store[dict[str, Any]] = Store(hass, 1, STORE_KEY)
        self._data: dict[str, Any] = {"hours": {}, "days": [], "failed": {}, "rates": {}}
        self._rates_at: dict[int, float] = {}
        self._loaded = False
        self._task: asyncio.Task[None] | None = None
        self._progress = {"done": 0, "total": 0}
        self.last_error: str | None = None

    async def async_load(self) -> None:
        if self._loaded:
            return
        stored = await self._store.async_load()
        if isinstance(stored, dict):
            for key in self._data:
                if isinstance(stored.get(key), type(self._data[key])):
                    self._data[key] = stored[key]
        self._loaded = True

    def missing_days(self, start: date, end: date) -> list[date]:
        """Days in [start, end) not cached yet (failed ones only after the retry delay)."""
        have = set(self._data["days"])
        now = time.time()
        out = []
        d = start
        while d < end:
            key = d.isoformat()
            failed_at = self._data["failed"].get(key)
            if key not in have and (failed_at is None or now - failed_at > RETRY_FAILED_S):
                out.append(d)
            d += timedelta(days=1)
        return out

    @property
    def running(self) -> bool:
        return self._task is not None and not self._task.done()

    def status(self) -> dict[str, Any]:
        return {
            "days": len(self._data["days"]),
            "failed": len(self._data["failed"]),
            "running": self.running,
            "done": self._progress["done"],
            "total": self._progress["total"],
            "first_day": min(self._data["days"]) if self._data["days"] else None,
            "last_day": max(self._data["days"]) if self._data["days"] else None,
        }

    def czk_prices(self, tz: tzinfo) -> dict[float, float]:
        return czk_hours(self._data["hours"], self._data["rates"], tz)

    def start_backfill(self, start: date, end: date, tz: tzinfo) -> bool:
        """Start the background backfill when days are missing; True if a job runs."""
        if self.running:
            return True
        if not self.missing_days(start, end):
            return False
        self._task = self._hass.async_create_background_task(
            self.async_backfill(start, end, tz), "homebrain_energy_spot_backfill"
        )
        return True

    async def _rates(self, years: set[int]) -> None:
        now = time.time()
        for year in sorted(years):
            if now - self._rates_at.get(year, 0) < RATES_TTL_S:
                continue
            try:
                text = await self._fetch(CNB_URL.format(year=year))
            except Exception as err:  # noqa: BLE001 - network errors are reported, not raised
                self.last_error = f"cnb: {type(err).__name__}"
                continue
            self._data["rates"].update(parse_cnb_year(text))
            self._rates_at[year] = now

    async def async_backfill(self, start: date, end: date, tz: tzinfo) -> None:
        await self.async_load()
        days = self.missing_days(start, end)
        self._progress = {"done": 0, "total": len(days)}
        if not days:
            return
        await self._rates({d.year for d in days} | {(d - timedelta(days=7)).year for d in days})
        have = set(self._data["days"])
        for i, day in enumerate(days):
            if i and self._delay:
                await asyncio.sleep(self._delay)
            key = day.isoformat()
            try:
                hours = parse_ote_chart(json.loads(await self._fetch(ote_url(day))), day, tz)
            except Exception as err:  # noqa: BLE001 - one bad day must not stop the backfill
                self._data["failed"][key] = time.time()
                self.last_error = f"ote {key}: {type(err).__name__}"
                hours = None
            if hours:
                for ts, eur in hours:
                    self._data["hours"][str(int(ts))] = eur
                have.add(key)
                self._data["failed"].pop(key, None)
            self._progress["done"] = i + 1
            if (i + 1) % SAVE_EVERY == 0:
                self._data["days"] = sorted(have)
                await self._store.async_save(self._data)
        self._data["days"] = sorted(have)
        await self._store.async_save(self._data)


def http_fetch(hass: HomeAssistant) -> Fetch:
    """aiohttp GET via HA's shared session (20 s timeout, identifying User-Agent)."""
    from aiohttp import ClientTimeout  # noqa: PLC0415
    from homeassistant.helpers.aiohttp_client import async_get_clientsession  # noqa: PLC0415

    async def fetch(url: str) -> str:
        session = async_get_clientsession(hass)
        async with session.get(
            url,
            timeout=ClientTimeout(total=20),
            headers={"User-Agent": "HomeBrain (Home Assistant integration)"},
        ) as resp:
            resp.raise_for_status()
            return await resp.text()

    return fetch
