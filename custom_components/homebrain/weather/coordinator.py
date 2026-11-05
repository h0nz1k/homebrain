"""Weather manager: schedules fetchers, samples the station, learns bias, builds snapshots."""

from __future__ import annotations

import asyncio
import logging
from collections import deque
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.helpers.event import async_track_time_interval
from homeassistant.util import dt as dt_util

from ..bindings import get_bindings
from . import geo, radar
from .blend import applied_bias, blend_daily, blend_hourly, lead_bucket, update_bias
from .const import (
    ARCHIVE_EVERY_H,
    ARCHIVE_MAX_LEAD_H,
    ATTRIBUTION,
    INTERVALS_S,
    METNO,
    MIN_VERIFIED_PAIRS,
    OM_DAILY_MODELS,
    OM_MODELS,
    RADAR_MAX_AGE_MIN,
    RADAR_RADIUS_KM,
    RADAR_RAIN_DBZ,
    RADAR_SOON_DBZ,
    RAIN_RATE_MM_H,
    TICK_S,
)
from .derive import (
    apparent_temperature,
    dew_point,
    pressure_tendency,
    rain_intensity,
    trend_per_hour,
)
from .fetch import USER_AGENT, FetchError, SourceState, fetch_bytes, fetch_json
from .providers import chmi_alerts, chmi_cap, openmeteo
from .providers.metno_ha import async_get_metno
from .station import FORECAST_KEY, read_station
from .store import WeatherStore

_LOGGER = logging.getLogger(__name__)
SCHEMA_VERSION = 1


def iso(value: datetime) -> str:
    return dt_util.as_utc(value).isoformat().replace("+00:00", "Z")


class WeatherManager:
    """One instance per config entry."""

    def __init__(self, hass: HomeAssistant, entry: ConfigEntry, version: str) -> None:
        self.hass = hass
        self.entry = entry
        self.user_agent = USER_AGENT.format(version=version)
        self.states = {key: SourceState(key, interval) for key, interval in INTERVALS_S.items()}
        self.store = WeatherStore(Path(hass.config.path("homebrain", "weather.db")))
        self.bias: dict[tuple[str, str, str], dict[str, float]] = {}
        self.samples: deque[tuple[datetime, dict[str, Any]]] = deque(maxlen=4 * 60)
        self.hour_samples: dict[datetime, list[float]] = {}
        self.observed: dict[str, float] = {}
        self.extremes: dict[str, Any] = {}
        self._unsub: Any = None
        self._task: asyncio.Task | None = None
        self._store_open = False
        self.area: geo.OrpArea | None = None
        self.cap_validators: dict[str, str] = {}
        self.radar_frames: dict[datetime, Any] = {}
        self.radar_fct: list[tuple[int, Any]] = []
        # Whole-composite ("Česko" zoom) twins of radar_frames / radar_fct.
        self.radar_cz: dict[datetime, Any] = {}
        self.radar_fct_cz: list[tuple[int, Any]] = []
        self.radar_fct_base: datetime | None = None
        self.radar_nowcast: dict[str, Any] | None = None
        self._png_cache: dict[str, bytes] = {}

    # -- lifecycle -----------------------------------------------------------------
    async def async_start(self) -> None:
        await self._resolve_area()
        await self.hass.async_add_executor_job(self.store.open)
        self._store_open = True
        self.bias = await self.hass.async_add_executor_job(self.store.load_bias)
        since = iso(dt_util.utcnow() - timedelta(hours=13))
        for valid_at, var, value in await self.hass.async_add_executor_job(
            self.store.obs_since, since
        ):
            if var == "t2m":
                self.observed[valid_at] = value
        self._unsub = async_track_time_interval(
            self.hass, self._tick, timedelta(seconds=TICK_S), cancel_on_shutdown=True
        )
        self._tick(dt_util.utcnow())

    async def async_stop(self) -> None:
        if self._unsub:
            self._unsub()
            self._unsub = None
        if self._task and not self._task.done():
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        if self._store_open:
            await self.hass.async_add_executor_job(self.store.close)
            self._store_open = False

    @callback
    def _tick(self, now: datetime) -> None:
        if self._task and not self._task.done():
            return
        self._task = self.entry.async_create_background_task(
            self.hass, self.async_refresh(), "homebrain_weather_refresh"
        )

    # -- config ----------------------------------------------------------------------
    @property
    def bindings(self) -> dict[str, str]:
        return get_bindings(self.entry).get("weather", {})

    @property
    def options(self) -> dict[str, Any]:
        return self.entry.options.get("weather") or {}

    @property
    def region(self) -> str | None:
        """Kraj (NUTS3) for the alerts.json fallback: explicit option, else from the ORP."""
        value = self.options.get("chmi_region")
        if value:
            return str(value)
        return geo.KRAJ_NUTS.get(self.area.kraj or "") if self.area else None

    async def _resolve_area(self) -> None:
        """Home ORP from HA's home coordinates (zone.home) via bundled polygons; an explicit
        ``options.weather.chmi_orp`` (CISORP code) wins. Nothing location-specific in Git."""
        try:
            areas = await self.hass.async_add_executor_job(geo.load_orp)
        except (OSError, ValueError) as err:
            _LOGGER.warning("ORP polygons unavailable: %s", err)
            return
        code = self.options.get("chmi_orp")
        self.area = geo.area_by_code(str(code), areas) if code else None
        if self.area is None:
            self.area = geo.find_orp(self.hass.config.latitude, self.hass.config.longitude, areas)

    # -- refresh ---------------------------------------------------------------------
    async def async_refresh(self, now: datetime | None = None) -> None:
        now = now or dt_util.utcnow()
        self._sample_station(now)
        await self._finalize_hours(now)
        session = async_get_clientsession(self.hass)
        lat, lon = self.hass.config.latitude, self.hass.config.longitude
        tz = str(self.hass.config.time_zone or "UTC")
        urls = {
            "om_hourly": openmeteo.hourly_url(lat, lon),
            "om_daily": openmeteo.daily_url(lat, lon, tz),
            "om_nowcast": openmeteo.nowcast_url(lat, lon),
        }
        for key, url in urls.items():
            state = self.states[key]
            if not state.due(now):
                continue
            try:
                payload = await fetch_json(session, url, user_agent=self.user_agent, state=state)
                state.succeed(now, self._parse(key, payload))
            except FetchError as err:
                _LOGGER.debug("Weather source %s failed: %s", key, err)
                state.fail(now, err)
        await self._refresh_cap(session, now)
        await self._refresh_radar(session, now)
        await self._refresh_metno(now)
        if self.states["om_hourly"].fetched_at == now:
            await self._archive(now)

    def _parse(self, key: str, payload: Any) -> Any:
        if key == "om_hourly":
            return openmeteo.parse_hourly(payload)
        if key == "om_daily":
            return openmeteo.parse_daily(payload)
        if key == "om_nowcast":
            return openmeteo.parse_nowcast(payload)
        return payload  # alerts are filtered at snapshot time (region may change)

    async def _refresh_cap(self, session: Any, now: datetime) -> None:
        """CAP (documented open data) first; undocumented alerts.json only as fallback."""
        state = self.states["chmi_cap"]
        if state.due(now):
            try:
                listing = await fetch_bytes(session, chmi_cap.BASE, user_agent=self.user_agent)
                latest = chmi_cap.latest_file((listing or b"").decode("utf-8", "replace"))
                if latest is None:
                    raise FetchError("no CAP file in listing")
                data = state.data
                if data is None or state.extra.get("file") != latest:
                    xml = await fetch_bytes(
                        session,
                        chmi_cap.BASE + latest[0],
                        user_agent=self.user_agent,
                        validators=self.cap_validators,
                        timeout_s=60,
                    )
                    if xml is not None or data is None:
                        cisorp = self.area.cisorp if self.area else None
                        data = await self.hass.async_add_executor_job(
                            chmi_cap.parse_cap, xml or b"", cisorp, now
                        )
                    state.extra["file"] = latest
                state.succeed(now, data)
            except Exception as err:  # noqa: BLE001 - provider isolation (WEA-010)
                _LOGGER.debug("ČHMÚ CAP failed: %s", err)
                state.fail(now, err)
        fallback = self.states["chmi_alerts"]
        if state.status(now) == "fresh" or not fallback.due(now):
            return
        try:
            payload = await fetch_json(
                session, chmi_alerts.URL, user_agent=self.user_agent, state=fallback
            )
            fallback.succeed(now, payload)
        except Exception as err:  # noqa: BLE001
            fallback.fail(now, err)

    async def _refresh_radar(self, session: Any, now: datetime) -> None:
        """Latest MAX_Z composites (5 min) + ČHMÚ extrapolation, cropped around home."""
        lat, lon = self.hass.config.latitude, self.hass.config.longitude
        state = self.states["chmi_radar"]
        if not radar.in_coverage(lat, lon) or not state.due(now):
            return
        try:
            newest = radar.floor_step(now - timedelta(minutes=1))
            want = 6 if not self.radar_frames else 3
            got_newest: datetime | None = None
            for attempt in range(2):  # the newest file may not be published yet
                for when in reversed(radar.frame_times(newest, want)):
                    if when in self.radar_frames:
                        got_newest = got_newest or when
                        continue
                    try:
                        body = await fetch_bytes(
                            session, radar.obs_url(when), user_agent=self.user_agent
                        )
                    except FetchError as err:
                        if err.status == 404 and got_newest is None and attempt == 0:
                            break
                        continue
                    (
                        self.radar_frames[when],
                        self.radar_cz[when],
                    ) = await self.hass.async_add_executor_job(radar.decode_scopes, body, lat, lon)
                    got_newest = got_newest or when
                if got_newest is not None:
                    break
                newest -= timedelta(minutes=radar.STEP_MIN)
            if got_newest is None:
                raise FetchError("no radar frame available")
            for old in sorted(self.radar_frames)[: -radar.LOOP_FRAMES]:
                del self.radar_frames[old]
                self.radar_cz.pop(old, None)
            latest = max(self.radar_frames)
            if self.radar_fct_base != latest:
                try:
                    tar = await fetch_bytes(
                        session, radar.fct_url(latest), user_agent=self.user_agent
                    )
                    fct_cz: list[tuple[int, Any]] = []
                    self.radar_fct = await self.hass.async_add_executor_job(
                        radar.decode_fct_tar, tar, lat, lon, fct_cz
                    )
                    self.radar_fct_cz = fct_cz
                    self.radar_fct_base = latest
                except Exception as err:  # noqa: BLE001 - extrapolation is optional
                    _LOGGER.debug("ČHMÚ fct_maxz failed: %s", err)
                    self.radar_fct, self.radar_fct_cz, self.radar_fct_base = [], [], None
            frames = self._contiguous_frames()
            self.radar_nowcast = await self.hass.async_add_executor_job(
                lambda: radar.nowcast(
                    frames,
                    lat,
                    radius_km=float(self.options.get("radar_radius_km", RADAR_RADIUS_KM)),
                    rain_dbz=int(self.options.get("radar_rain_dbz", RADAR_RAIN_DBZ)),
                    soon_dbz=int(self.options.get("radar_soon_dbz", RADAR_SOON_DBZ)),
                    fct=self.radar_fct or None,
                )
            )
            self.radar_nowcast["at"] = iso(latest)
            self._png_cache.clear()
            state.succeed(now, {"latest": iso(latest)})
        except Exception as err:  # noqa: BLE001 - provider isolation (WEA-010)
            _LOGGER.debug("ČHMÚ radar failed: %s", err)
            state.fail(now, err)

    def _contiguous_frames(self) -> list[Any]:
        """Newest frames with exact 5-min spacing (motion needs equal steps)."""
        times = sorted(self.radar_frames, reverse=True)
        out = [times[0]]
        for when in times[1:3]:
            if out[-1] - when != timedelta(minutes=radar.STEP_MIN):
                break
            out.append(when)
        return [self.radar_frames[t] for t in reversed(out)]

    def radar_png(self, frame_id: str) -> bytes | None:
        """PNG of one cached frame (``[cz-]obs-YYYYmmddHHMM`` or ``[cz-]fct-<lead>``).

        The ``cz-`` prefix selects the max-pooled whole-composite frame. Executor only.
        """
        if frame_id in self._png_cache:
            return self._png_cache[frame_id]
        field = None
        whole = frame_id.startswith("cz-")
        kind, _, key = frame_id.removeprefix("cz-").partition("-")
        if kind == "obs":
            for when, frame in (self.radar_cz if whole else self.radar_frames).items():
                if when.strftime("%Y%m%d%H%M") == key:
                    field = frame
        elif kind == "fct":
            fct = self.radar_fct_cz if whole else self.radar_fct
            field = next((f for lead, f in fct if str(lead) == key), None)
        if field is None:
            return None
        png = radar.encode_png(field)
        self._png_cache[frame_id] = png
        return png

    def radar_block(self, now: datetime) -> dict[str, Any]:
        lat, lon = self.hass.config.latitude, self.hass.config.longitude
        frames = [
            {"id": f"obs-{t:%Y%m%d%H%M}", "t": iso(t), "kind": "obs"}
            for t in sorted(self.radar_frames)
        ]
        if self.radar_fct_base is not None:
            frames += [
                {
                    "id": f"fct-{lead}",
                    "t": iso(self.radar_fct_base + timedelta(minutes=lead)),
                    "kind": "fct",
                }
                for lead, _ in self.radar_fct
            ]
        latest = max(self.radar_frames) if self.radar_frames else None
        for f in frames:
            f["offset_min"] = (
                round(
                    (datetime.fromisoformat(f["t"].replace("Z", "+00:00")) - latest).total_seconds()
                    / 60
                )
                if latest
                else 0
            )
        return {
            "available": bool(frames) and self.states["chmi_radar"].status(now) != "unavailable",
            "frames": frames,
            "available_offsets": [f["offset_min"] for f in frames],
            "latest": iso(latest) if latest else None,
            "image_path": "/api/homebrain/weather/radar/{id}",
            "size_px": radar.CROP_PX,
            "km_per_px": round(radar.km_per_px(lat), 3),
            "radius_km": float(self.options.get("radar_radius_km", RADAR_RADIUS_KM)),
            "legend_dbz": sorted(radar.DBZ_COLOURS.values()),
            # Bundled-basemap geometry (composite px). Same precision as the crop itself,
            # only ever sent over the authenticated WS.
            "origin_px": list(radar.crop_origin(lat, lon)),
            "home_px": [round(v, 1) for v in radar.lonlat_to_px(lat, lon)],
            "composite_px": [radar.HEIGHT, radar.WIDTH],
            "cz_factor": radar.CZ_FACTOR,
            "cz_image_path": "/api/homebrain/weather/radar/cz-{id}",
        }

    def alerts_block(self, now: datetime) -> dict[str, Any]:
        cap_ok = self.states["chmi_cap"].data is not None
        return {
            "area": None
            if self.area is None
            else {
                "cisorp": self.area.cisorp,
                "name": self.area.name,
                "kraj": self.area.kraj,
                "method": self.area.method,
            },
            "feed": "cap" if cap_ok else "alerts_json" if self.region else None,
            "warnings": self._warnings(now),
            "attribution": ATTRIBUTION["chmi"],
        }

    async def _refresh_metno(self, now: datetime) -> None:
        state = self.states["metno"]
        entity_id = self.bindings.get(FORECAST_KEY)
        if not entity_id or not state.due(now):
            return
        try:
            state.succeed(now, await async_get_metno(self.hass, entity_id))
        except Exception as err:  # noqa: BLE001 - provider isolation (WEA-010)
            state.fail(now, err)

    # -- station sampling, hourly obs and bias learning ------------------------------
    def _sample_station(self, now: datetime) -> None:
        station = read_station(self.hass, self.bindings, now)
        values = {k: v["v"] for k, v in station["values"].items() if v["v"] is not None}
        if not values:
            return
        self.samples.append((now, values))
        if (t2m := values.get("t2m")) is not None and "stale" not in station["values"]["t2m"]["qc"]:
            hour = (now + timedelta(minutes=30)).replace(minute=0, second=0, microsecond=0)
            self.hour_samples.setdefault(hour, []).append(t2m)
            day = dt_util.as_local(now).date().isoformat()
            ext = self.extremes
            if ext.get("day") != day:
                ext.clear()
                ext.update({"day": day, "max": (t2m, now), "min": (t2m, now)})
            if t2m > ext["max"][0]:
                ext["max"] = (t2m, now)
            if t2m < ext["min"][0]:
                ext["min"] = (t2m, now)

    async def _finalize_hours(self, now: datetime) -> None:
        cutoff = now - timedelta(minutes=30)
        for hour in sorted(h for h in self.hour_samples if h <= cutoff):
            values = self.hour_samples.pop(hour)
            if len(values) < 3:
                continue
            mean = sum(values) / len(values)
            await self.async_learn(iso(hour), mean, len(values))

    async def async_learn(self, valid_at: str, observed: float, n: int = 1) -> None:
        """Store an hourly observation and update decaying-average bias per source/lead."""
        self.observed[valid_at] = round(observed, 2)
        await self.hass.async_add_executor_job(
            self.store.put_obs, valid_at, "t2m", observed, "ok", n
        )
        rows = await self.hass.async_add_executor_job(self.store.forecasts_for, valid_at, "t2m")
        changed = {}
        for source, lead_h, value in rows:
            key = (source, "t2m", lead_bucket(lead_h))
            self.bias[key] = changed[key] = update_bias(self.bias.get(key), value - observed)
        if changed:
            await self.hass.async_add_executor_job(
                self.store.put_bias, changed, iso(dt_util.utcnow())
            )
        for old in [k for k in self.observed if k < iso(dt_util.utcnow() - timedelta(hours=13))]:
            self.observed.pop(old, None)

    async def _archive(self, now: datetime) -> None:
        issued = now.replace(
            hour=now.hour - now.hour % ARCHIVE_EVERY_H, minute=0, second=0, microsecond=0
        )
        issued_s = iso(issued)
        # Per source, not just "blend": a source that arrives later than the others within the
        # same 6 h issue (retry after a failure, slower provider) must still be archived.
        done = await self.hass.async_add_executor_job(self.store.issued_sources, issued_s)
        series, _horizons = self._series()
        if "blend" in done and done >= set(series):
            return
        rows = []
        for source, points in {**series, "blend": self._blend(now)[0]}.items():
            if source in done:
                continue
            for point in points:
                valid = datetime.fromisoformat(point["t"].replace("Z", "+00:00"))
                lead = round((valid - issued).total_seconds() / 3600)
                if 1 <= lead <= ARCHIVE_MAX_LEAD_H and point.get("t2m") is not None:
                    rows.append((source, issued_s, point["t"], lead, "t2m", point["t2m"]))
        await self.hass.async_add_executor_job(self.store.archive, rows)
        await self.hass.async_add_executor_job(self.store.prune, now)

    # -- snapshot --------------------------------------------------------------------
    def _series(self) -> tuple[dict[str, list[dict[str, Any]]], dict[str, int]]:
        series: dict[str, list[dict[str, Any]]] = {}
        horizons: dict[str, int] = {}
        for model_id, parsed in (self.states["om_hourly"].data or {}).items():
            if parsed["status"] != "unavailable":
                series[model_id] = parsed["points"]
                horizons[model_id] = next(m.horizon_h for m in OM_MODELS if m.id == model_id)
        if self.states["metno"].data:
            series[METNO.id] = self.states["metno"].data
            horizons[METNO.id] = METNO.horizon_h
        return series, horizons

    def _blend(self, now: datetime) -> tuple[list[dict[str, Any]], dict[str, Any]]:
        series, horizons = self._series()
        return blend_hourly(series, horizons, self.bias, now), series

    def snapshot(self, now: datetime | None = None) -> dict[str, Any]:
        now = now or dt_util.utcnow()
        station = read_station(self.hass, self.bindings, now)
        hourly, series = self._blend(now)
        start = now.replace(minute=0, second=0, microsecond=0)
        end = start + timedelta(hours=48)
        models = []
        for model in (*OM_MODELS, METNO):
            points = series.get(model.id)
            if not points:
                continue
            bucket_bias = {
                lb: applied_bias(self.bias.get((model.id, "t2m", lb)))
                for lb in ("0-6", "6-12", "12-24", "24-48", "48-72")
            }
            trimmed = []
            for p in points:
                when = datetime.fromisoformat(p["t"].replace("Z", "+00:00"))
                if not start <= when <= end:
                    continue
                lead = max((when - now).total_seconds() / 3600, 0)
                corr = bucket_bias.get(lead_bucket(lead), 0.0)
                trimmed.append(
                    {
                        "t": p["t"],
                        "t2m": None if p.get("t2m") is None else round(p["t2m"] - corr, 1),
                        "t2m_raw": p.get("t2m"),
                        "precip": p.get("precip"),
                        "wind": p.get("wind"),
                        "msl": p.get("msl"),
                    }
                )
            weight_now = next(
                (
                    c["weight"]
                    for c in (hourly[0]["contributors"] if hourly else [])
                    if c["source"] == model.id
                ),
                0.0,
            )
            models.append(
                {
                    "id": model.id,
                    "label": model.label,
                    "detail": model.detail,
                    "weight": weight_now,
                    "corrected": any(bucket_bias.values()),
                    "points": trimmed,
                }
            )
        return {
            "schema_version": SCHEMA_VERSION,
            "generated_at": iso(now),
            "location": {
                "elevation_m": self.hass.config.elevation,
                "region": self.region,
                "area": self.alerts_block(now)["area"],
            },
            "station": self._station_block(station, now),
            "current": self._current(station, hourly),
            "nowcast": self._nowcast(station, now),
            "hourly": hourly,
            "observed": [{"t": t, "t2m": v} for t, v in sorted(self.observed.items())],
            "models": models,
            "daily": blend_daily(self.states["om_daily"].data or {}),
            "warnings": self._warnings(now),
            "radar": self.radar_block(now),
            "verification": self._verification(),
            "sources": self._sources(station, now),
            "attribution": list(ATTRIBUTION.values()),
        }

    def _station_block(self, station: dict[str, Any], now: datetime) -> dict[str, Any]:
        t_samples = [
            (t, v["t2m"]) for t, v in self.samples if "t2m" in v and t >= now - timedelta(hours=1)
        ]
        p_old = [
            (t, v["msl"]) for t, v in self.samples if "msl" in v and t <= now - timedelta(hours=3)
        ]
        msl = station["values"].get("msl", {}).get("v")
        delta = msl - p_old[-1][1] if msl is not None and p_old else None
        ext = self.extremes
        return {
            **station,
            "derived": {
                "temp_trend_c_h": trend_per_hour(t_samples),
                "pressure_tendency": pressure_tendency(delta),
                "today_max": {"v": ext["max"][0], "at": iso(ext["max"][1])} if ext else None,
                "today_min": {"v": ext["min"][0], "at": iso(ext["min"][1])} if ext else None,
            },
        }

    def _current(self, station: dict[str, Any], hourly: list[dict[str, Any]]) -> dict[str, Any]:
        """Station first (primary truth); blend fills only what the station lacks."""
        sv = {k: v["v"] for k, v in station["values"].items()}
        first = hourly[0] if hourly else {}
        out: dict[str, Any] = {"provenance": {}}
        for key in ("t2m", "rh", "td2m", "wind", "gust", "wind_dir", "msl"):
            if sv.get(key) is not None:
                out[key], out["provenance"][key] = sv[key], "station"
            elif first.get(key) is not None:
                out[key], out["provenance"][key] = first[key], "blend"
            else:
                out[key] = None
        if out.get("td2m") is None:
            out["td2m"] = dew_point(out.get("t2m"), out.get("rh"))
            out["provenance"]["td2m"] = "derived"
        out["feels_like"] = sv.get("feels_like")
        out["provenance"]["feels_like"] = "station"
        if out["feels_like"] is None:
            out["feels_like"] = apparent_temperature(out.get("t2m"), out.get("rh"), out.get("wind"))
            out["provenance"]["feels_like"] = "derived"
        out["rain_today"] = sv.get("rain_today")
        out["condition"] = first.get("condition", "unknown")
        return out

    def _nowcast(self, station: dict[str, Any], now: datetime) -> dict[str, Any]:
        sv = {k: v["v"] for k, v in station["values"].items()}
        rate = sv.get("rain_rate")
        slots = [
            s
            for s in (self.states["om_nowcast"].data or [])
            if datetime.fromisoformat(s["t"].replace("Z", "+00:00")) >= now - timedelta(minutes=15)
        ]
        rad = self._radar_now(now)
        radar_extra = (
            {
                "confidence": rad["confidence"],
                "motion": rad["motion"],
                "radar_profile": rad["profile"],
                "radar_method": rad["method"],
            }
            if rad
            else {}
        )
        if sv.get("raining") or (rate is not None and rate > RAIN_RATE_MM_H):
            # Station has precedence for "now"; radar only adds when it should stop.
            stopping = rad is not None and rad["status"] == "stopping"
            return {
                "status": "stopping" if stopping else "raining",
                "eta_min": 0,
                "end_min": rad["end_min"] if stopping else None,
                "rate_mm_h": rate,
                "intensity": rain_intensity(rate),
                "source": "station+radar" if stopping else "station",
                "slots": slots,
                **radar_extra,
            }
        if rad is not None:
            station_dry = station["status"] == "fresh" and sv.get("rain_rate") is not None
            status, eta = rad["status"], rad["eta_min"]
            if status in ("raining", "stopping") and station_dry:
                # Echo overhead but the gauge is dry (virga / just starting): "any minute".
                status, eta = "soon", 0
            peak = rad.get("peak_dbz") or 0
            return {
                "status": status,
                "eta_min": 0 if status in ("raining", "stopping") else eta,
                "end_min": rad["end_min"] if status == "stopping" else None,
                "rate_mm_h": radar.dbz_to_mmh(peak) if status != "dry" else None,
                "intensity": rain_intensity(radar.dbz_to_mmh(peak)) if status != "dry" else None,
                "source": "radar:chmi",
                "slots": slots,
                **radar_extra,
            }
        if not slots:
            return {"status": "unknown", "eta_min": None, "source": None, "slots": []}
        for slot in slots:
            if slot["mmh"] is not None and slot["mmh"] >= RAIN_RATE_MM_H:
                when = datetime.fromisoformat(slot["t"].replace("Z", "+00:00"))
                peak = max(s["mmh"] or 0 for s in slots)
                return {
                    "status": "soon",
                    "eta_min": max(0, round((when - now).total_seconds() / 60)),
                    "rate_mm_h": peak,
                    "intensity": rain_intensity(peak),
                    "source": "om:icon_d2",
                    "slots": slots,
                }
        return {"status": "dry", "eta_min": None, "source": "om:icon_d2", "slots": slots}

    def _warnings(self, now: datetime) -> list[dict[str, Any]]:
        cap = self.states["chmi_cap"]
        if cap.data is not None and cap.status(now) != "unavailable":
            out = []
            for w in cap.data:
                expires = w.get("expires")
                if expires and datetime.fromisoformat(expires) <= now:
                    continue
                out.append({**w, "area": self.area.name if self.area else None})
            return out
        payload = self.states["chmi_alerts"].data
        return chmi_alerts.parse_alerts(payload, self.region, now) if payload else []

    def _radar_now(self, now: datetime) -> dict[str, Any] | None:
        nc = self.radar_nowcast
        if not nc or not nc.get("at") or nc.get("status") == "unknown":
            return None
        age = (now - datetime.fromisoformat(nc["at"].replace("Z", "+00:00"))).total_seconds()
        return nc if age <= RADAR_MAX_AGE_MIN * 60 else None

    def _verification(self) -> list[dict[str, Any]]:
        rows = []
        for source in [m.id for m in OM_MODELS] + [METNO.id, "blend"]:
            stats = [self.bias.get((source, "t2m", lb)) for lb in ("0-6", "6-12", "12-24")]
            stats = [s for s in stats if s]
            n = sum(s["n"] for s in stats)
            if not n:
                continue
            rows.append(
                {
                    "source": source,
                    "var": "t2m",
                    "lead": "0-24",
                    "n": n,
                    "mae": round(sum(s["mae"] * s["n"] for s in stats) / n, 2),
                    "bias": round(sum(s["b"] * s["n"] for s in stats) / n, 2),
                    "enough": n >= MIN_VERIFIED_PAIRS,
                }
            )
        return sorted(rows, key=lambda r: r["mae"])

    def _sources(self, station: dict[str, Any], now: datetime) -> list[dict[str, Any]]:
        out = [
            {
                "id": "station",
                "label": "Stanice",
                "detail": "měření",
                "provider": "lokální",
                "license": "local",
                "status": station["status"],
                "fetched_at": station["updated_at"],
                "age_s": None,
            }
        ]
        hourly_state = self.states["om_hourly"]
        for model in OM_MODELS:
            parsed = (hourly_state.data or {}).get(model.id)
            status = hourly_state.status(now)
            if parsed and status == "fresh":
                status = parsed["status"]
            out.append(
                self._meta(
                    f"om:{model.id}",
                    model.label,
                    model.detail,
                    "open_meteo",
                    hourly_state,
                    now,
                    status,
                    model.horizon_h,
                )
            )
        if self.bindings.get(FORECAST_KEY):
            out.append(
                self._meta("metno", METNO.label, METNO.detail, "metno", self.states["metno"], now)
            )
        out.append(
            self._meta(
                "om:daily",
                "10 dní",
                " · ".join(v[0] for v in OM_DAILY_MODELS.values()),
                "open_meteo",
                self.states["om_daily"],
                now,
            )
        )
        out.append(
            self._meta(
                "om:nowcast",
                "Nowcast srážek",
                "ICON-D2 · 15 min",
                "open_meteo",
                self.states["om_nowcast"],
                now,
            )
        )
        cap = self.states["chmi_cap"]
        use_cap = cap.data is not None or self.states["chmi_alerts"].data is None
        where = (
            f"ORP {self.area.name}"
            if self.area and use_cap
            else f"kraj {self.region}"
            if self.region
            else "celá ČR (ORP nenalezeno)"
        )
        out.append(
            self._meta(
                "chmi:alerts",
                "ČHMÚ výstrahy",
                f"{'CAP' if use_cap else 'alerts.json (záloha)'} · {where}",
                "chmi",
                cap if use_cap else self.states["chmi_alerts"],
                now,
            )
        )
        if radar.in_coverage(self.hass.config.latitude, self.hass.config.longitude):
            out.append(
                self._meta(
                    "chmi:radar",
                    "ČHMÚ radar",
                    "MAX_Z 5 min + extrapolace 60 min",
                    "chmi",
                    self.states["chmi_radar"],
                    now,
                )
            )
        return out

    def _meta(
        self,
        sid: str,
        label: str,
        detail: str,
        attribution: str,
        state: SourceState,
        now: datetime,
        status: str | None = None,
        horizon: int | None = None,
    ) -> dict[str, Any]:
        return {
            "id": sid,
            "label": label,
            "detail": detail,
            "provider": ATTRIBUTION[attribution]["label"],
            "license": ATTRIBUTION[attribution]["license"],
            "status": status or state.status(now),
            "fetched_at": iso(state.fetched_at) if state.fetched_at else None,
            "age_s": state.age_s(now),
            "horizon_h": horizon,
            "error": state.last_error,
        }
