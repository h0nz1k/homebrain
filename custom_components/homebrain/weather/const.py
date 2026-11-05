"""Weather sources, models and tuning constants."""

from dataclasses import dataclass


@dataclass(frozen=True)
class ModelInfo:
    """Open-Meteo model metadata used for blending and attribution."""

    id: str
    label: str
    detail: str
    provider: str
    horizon_h: int


OM_MODELS: tuple[ModelInfo, ...] = (
    ModelInfo("chmi_aladin_cz_1km", "ALADIN", "ČHMÚ · 1 km", "ČHMÚ", 72),
    ModelInfo("icon_d2", "ICON-D2", "DWD · 2 km", "DWD", 48),
    ModelInfo("geosphere_arome_austria", "AROME-AT", "GeoSphere · 2,5 km", "GeoSphere Austria", 60),
    ModelInfo("icon_eu", "ICON-EU", "DWD · 7 km", "DWD", 120),
    ModelInfo("ecmwf_ifs", "ECMWF IFS", "ECMWF · 9 km", "ECMWF", 360),
    ModelInfo("ecmwf_aifs025_single", "ECMWF AIFS", "ECMWF · 25 km", "ECMWF", 360),
    ModelInfo("gfs_seamless", "GFS", "NOAA · 13 km", "NOAA", 384),
    ModelInfo("ukmo_seamless", "UKMO", "Met Office · 2–10 km", "Met Office", 168),
)
MODEL_BY_ID = {model.id: model for model in OM_MODELS}
METNO = ModelInfo("metno", "met.no", "MET Norway · z HA", "MET Norway", 216)

# Ten variables keep one multi-model request at the cheapest fractional call weight.
OM_HOURLY_VARS: dict[str, str] = {
    "temperature_2m": "t2m",
    "dew_point_2m": "td2m",
    "precipitation": "precip",
    "precipitation_probability": "pop",
    "wind_speed_10m": "wind",
    "wind_gusts_10m": "gust",
    "wind_direction_10m": "wind_dir",
    "pressure_msl": "msl",
    "cloud_cover": "cloud",
    "weather_code": "wmo",
}
OM_DAILY_MODELS: dict[str, tuple[str, float]] = {
    "ecmwf_ifs": ("ECMWF IFS", 0.4),
    "ecmwf_aifs025_single": ("ECMWF AIFS", 0.25),
    "icon_seamless": ("ICON", 0.2),
    "gfs_seamless": ("GFS", 0.15),
}
OM_DAILY_VARS: dict[str, str] = {
    "temperature_2m_max": "tmax",
    "temperature_2m_min": "tmin",
    "precipitation_sum": "precip",
    "precipitation_probability_max": "pop",
    "wind_speed_10m_max": "wind",
    "wind_gusts_10m_max": "gust",
    "weather_code": "wmo",
}

# Prior weights until verification has enough pairs (spec §4.4).
PRIOR_SHORT = {
    "chmi_aladin_cz_1km": 0.25,
    "icon_d2": 0.25,
    "geosphere_arome_austria": 0.15,
    "icon_eu": 0.1,
    "ecmwf_ifs": 0.15,
    "ukmo_seamless": 0.1,
    "ecmwf_aifs025_single": 0.05,
    "gfs_seamless": 0.05,
    "metno": 0.05,
}
PRIOR_LONG = {
    "ecmwf_ifs": 0.35,
    "ecmwf_aifs025_single": 0.2,
    "icon_eu": 0.15,
    "gfs_seamless": 0.1,
    "ukmo_seamless": 0.1,
    "metno": 0.1,
}
TAPER_H = 6
WEIGHT_FLOOR = 0.05
WEIGHT_CAP = 0.5
MIN_VERIFIED_PAIRS = 48

BIAS_W = 0.07
BIAS_MIN_N = 7
BIAS_SHRINK = 10
BIAS_CLAMP_C = 4.0
LEAD_BUCKETS = (6, 12, 24, 48, 72, 120)
ARCHIVE_EVERY_H = 6
ARCHIVE_MAX_LEAD_H = 72
ARCHIVE_RETENTION_D = 60
OBS_RETENTION_D = 730

INTERVALS_S = {
    "om_hourly": 3600,
    "om_daily": 3 * 3600,
    "om_nowcast": 15 * 60,
    "chmi_alerts": 10 * 60,  # undocumented alerts.json: fallback only when CAP fails
    "chmi_cap": 10 * 60,
    "chmi_radar": 5 * 60,
    "metno": 30 * 60,
}
BACKOFF_S = (60, 120, 300, 900, 3600)
STATION_STALE_S = 10 * 60
TICK_S = 60

RAIN_RATE_MM_H = 0.2

ATTRIBUTION = {
    "open_meteo": {
        "label": "Open-Meteo.com",
        "license": "CC-BY-4.0",
        "text": "Data: Open-Meteo.com (CC BY 4.0), modely ČHMÚ, DWD, GeoSphere Austria, "
        "ECMWF, NOAA, Met Office",
        "url": "https://open-meteo.com/",
    },
    "metno": {
        "label": "MET Norway",
        "license": "CC-BY-4.0",
        "text": "Data: MET Norway (CC BY 4.0)",
        "url": "https://api.met.no/",
    },
    "chmi": {
        "label": "ČHMÚ",
        "license": "CC-BY-4.0",
        "text": "Výstrahy a radar: ČHMÚ, opendata.chmi.cz (CC BY 4.0)",
        "url": "https://www.chmi.cz/",
    },
}

# Radar nowcast defaults (issue #28; values from ha-chmu-meteogram): radius around home and
# reflectivity thresholds "prší" / "bude pršet". Overridable via options["weather"].
RADAR_RADIUS_KM = 3.0
RADAR_RAIN_DBZ = 12
RADAR_SOON_DBZ = 18
RADAR_MAX_AGE_MIN = 20
