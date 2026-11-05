"""ČHMÚ CAP warnings (#27) and radar nowcast (#28) on SYNTHETIC fixtures only."""

from __future__ import annotations

import io
import math
import tarfile
from datetime import UTC, datetime, timedelta
from pathlib import Path

import numpy as np
import pytest
from homeassistant.core import HomeAssistant
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.homebrain.const import DOMAIN
from custom_components.homebrain.weather import geo, radar
from custom_components.homebrain.weather.providers import chmi_cap, openmeteo

FIX = Path(__file__).parent / "fixtures" / "weather"
CAP = (FIX / "chmi_cap_synthetic.xml").read_bytes()
NOW = datetime(2026, 10, 31, 18, 40, tzinfo=UTC)
# Public reference point (Brno city centre) - not anybody's home.
LAT, LON = 49.195, 16.608
LISTING = (
    '<a href="alert_cap_50_300902.xml">alert_cap_50_300902.xml</a>   30-Oct-2026 09:02   1\n'
    '<a href="alert_cap_50_311800.xml">alert_cap_50_311800.xml</a>   31-Oct-2026 18:00   1\n'
    '<a href="alert_cap_70_311200.xml">alert_cap_70_311200.xml</a>   31-Oct-2026 18:30   1\n'
)


# -- CAP -----------------------------------------------------------------------------------------
def test_cap_latest_file_ignores_other_products():
    assert chmi_cap.latest_file(LISTING) == ("alert_cap_50_311800.xml", "31-Oct-2026 18:00")
    assert chmi_cap.latest_file("<html></html>") is None


def test_cap_filters_orp_language_expiry_and_no_warning():
    brno = chmi_cap.parse_cap(CAP, "6203", NOW)
    assert [w["event"] for w in brno] == ["Silný vítr"]
    w = brno[0]
    assert w["level"] == 2 and w["level_label"] == "Oranžová" and w["category"] == "wind"
    assert w["onset"] == "2026-10-31T20:00:00+01:00"
    assert w["expires"] == "2026-11-01T12:00:00+01:00"
    assert w["instruction"].startswith("Upevnit") and w["region_filtered"]
    benesov = chmi_cap.parse_cap(CAP, "2101", NOW)
    assert [(w["event"], w["level_label"], w["category"]) for w in benesov] == [
        ("Náledí", "Žlutá", "snow")
    ]
    everywhere = chmi_cap.parse_cap(CAP, None, NOW)
    assert [w["event"] for w in everywhere] == ["Silný vítr", "Náledí"]
    # after expiry nothing is left
    assert chmi_cap.parse_cap(CAP, "6203", NOW + timedelta(days=1)) == []


def test_cap_cancel_and_test_messages_are_ignored():
    assert chmi_cap.parse_cap(CAP.replace(b"<msgType>Update", b"<msgType>Cancel"), None, NOW) == []
    assert chmi_cap.parse_cap(CAP.replace(b"<status>Actual", b"<status>Test"), None, NOW) == []


def test_orp_lookup_polygons_and_option():
    areas = geo.load_orp()
    assert len(areas) == 206
    hit = geo.find_orp(LAT, LON, areas)
    assert hit is not None and (hit.cisorp, hit.kraj, hit.method) == (
        "6203",
        "Jihomoravský kraj",
        "polygon",
    )
    assert geo.find_orp(50.087, 14.421, areas).cisorp == "1100"  # Praha (CAP code)
    assert geo.find_orp(47.0, 10.0, areas) is None  # outside Czechia
    assert geo.area_by_code("2101", areas).name == "Benešov"
    assert geo.KRAJ_NUTS[hit.kraj] == "CZ064"


def test_orp_lookup_synthetic_square():
    areas = [
        {
            "cisorp": "9999",
            "name": "Test",
            "kraj": None,
            "rings": [[[0, 0], [2, 0], [2, 2], [0, 2], [0, 0]]],
        }
    ]
    assert geo.find_orp(1, 1, areas).method == "polygon"
    assert geo.find_orp(2.01, 2.01, areas).method == "nearest"
    assert geo.find_orp(1, 3, areas) is None


# -- radar ---------------------------------------------------------------------------------------
def blob(size: int, cy: float, cx: float, sigma: float = 8, peak: float = 44) -> np.ndarray:
    yy, xx = np.mgrid[0:size, 0:size]
    f = peak * np.exp(-((yy - cy) ** 2 + (xx - cx) ** 2) / (2 * sigma**2))
    f = (np.floor(f / 4) * 4).astype(np.uint8)
    f[f < 4] = 0
    return f


def moving(speed_kmh: float, toward_deg: float, start_km: float = 40, n: int = 3):
    kpp = radar.km_per_px(LAT)
    v = speed_kmh / kpp / 12
    vy, vx = -v * math.cos(math.radians(toward_deg)), v * math.sin(math.radians(toward_deg))
    c = (radar.CROP_PX - 1) / 2
    y0, x0 = c - vy / v * start_km / kpp, c - vx / v * start_km / kpp
    frames = [blob(radar.CROP_PX, y0 + vy * k, x0 + vx * k) for k in range(n)]
    truth = None
    for t in range(0, 121):
        f = blob(radar.CROP_PX, y0 + vy * (n - 1 + t / 5), x0 + vx * (n - 1 + t / 5))
        if radar.disk_max(f, c, c, 3 / kpp) >= 18:
            truth = t
            break
    return frames, truth


def test_png_roundtrip_and_palette_mapping():
    field = np.zeros((radar.HEIGHT, radar.WIDTH), dtype=np.uint8)
    field[100:120, 200:260] = 32
    field[300, 400] = 60
    idx, palette = radar.decode_png(radar.encode_png(field))
    assert np.array_equal(radar.to_dbz(idx, palette), field)
    with pytest.raises(ValueError):
        radar.decode_png(b"not a png")


def test_whole_composite_scope_keeps_small_cores():
    field = np.zeros((radar.HEIGHT, radar.WIDTH), dtype=np.uint8)
    field[101, 301] = 52  # single-pixel convective core
    crop, whole = radar.decode_scopes(radar.encode_png(field), LAT, LON)
    assert crop.shape == (radar.CROP_PX, radar.CROP_PX)
    assert whole.shape == (radar.HEIGHT // 2, radar.WIDTH // 2)
    assert whole[50, 150] == 52 and int(whole.sum()) == 52
    row0, col0 = radar.crop_origin(LAT, LON)
    row, col = radar.lonlat_to_px(LAT, LON)
    assert abs(row0 + radar.CROP_PX / 2 - row) <= 0.5 and abs(col0 + radar.CROP_PX / 2 - col) <= 0.5


def test_crop_is_centred_on_home():
    field = np.zeros((radar.HEIGHT, radar.WIDTH), dtype=np.uint8)
    row, col = radar.lonlat_to_px(LAT, LON)
    field[int(round(row)), int(round(col))] = 40
    crop = radar.decode_frame(radar.encode_png(field), LAT, LON)
    c = radar.CROP_PX // 2
    assert crop[c, c] == 40 and crop.sum() == 40
    assert 0.8 < radar.km_per_px(LAT) < 1.0


@pytest.mark.parametrize("speed", [40, 60])
@pytest.mark.parametrize("toward", [0, 45, 90, 135, 200, 270])
def test_moving_blob_eta(speed, toward):
    frames, truth = moving(speed, toward)
    nc = radar.nowcast(frames, LAT)
    assert nc["status"] == "soon"
    assert abs(nc["eta_min"] - truth) <= 5, (nc, truth)
    assert abs(nc["motion"]["speed_kmh"] - speed) <= 0.15 * speed
    expected_from = (toward + 180) % 360
    diff = abs((nc["motion"]["from_deg"] - expected_from + 180) % 360 - 180)
    assert diff <= 10
    assert nc["confidence"] in ("medium", "high")


def test_slow_far_blob_is_dry_within_60_min():
    frames, truth = moving(20, 90)
    assert truth > 60
    assert radar.nowcast(frames, LAT)["status"] == "dry"


def test_rain_over_home_stops():
    c = (radar.CROP_PX - 1) / 2
    v = 50 / radar.km_per_px(LAT) / 12
    frames = [blob(radar.CROP_PX, c, c + v * (k - 2), sigma=6) for k in range(3)]
    nc = radar.nowcast(frames, LAT)
    assert nc["status"] == "stopping" and 5 <= nc["end_min"] <= 30


def test_noise_is_uncertain_not_confident():
    rng = np.random.default_rng(7)
    frames = [
        ((rng.random((radar.CROP_PX, radar.CROP_PX)) > 0.97) * 24).astype(np.uint8)
        for _ in range(3)
    ]
    nc = radar.nowcast(frames, LAT)
    assert not nc["motion"]["reliable"]
    assert nc["motion"]["speed_kmh"] is None
    assert nc["confidence"] in ("uncertain", "low") or nc["status"] in ("raining", "stopping")


def fct_tar(frames: list[tuple[int, np.ndarray]]) -> bytes:
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode="w") as tar:
        for lead, field in frames:
            full = np.zeros((radar.HEIGHT, radar.WIDTH), dtype=np.uint8)
            row, col = radar.lonlat_to_px(LAT, LON)
            r0, c0 = int(round(row)) - radar.CROP_PX // 2, int(round(col)) - radar.CROP_PX // 2
            full[r0 : r0 + radar.CROP_PX, c0 : c0 + radar.CROP_PX] = field
            data = radar.encode_png(full)
            info = tarfile.TarInfo(f"20261031.1835/pacz2gmaps3.fct_z_max.x.{lead}.png")
            info.size = len(data)
            tar.addfile(info, io.BytesIO(data))
    return buf.getvalue()


def test_chmi_extrapolation_is_primary_and_agreement_raises_confidence():
    frames, truth = moving(60, 90)
    c = (radar.CROP_PX - 1) / 2
    fct = radar.decode_fct_tar(
        fct_tar(
            [
                (lead, blob(radar.CROP_PX, c, c) if lead >= 20 else frames[0] * 0)
                for lead in range(10, 61, 10)
            ]
        ),
        LAT,
        LON,
    )
    assert [lead for lead, _ in fct] == [10, 20, 30, 40, 50, 60]
    nc = radar.nowcast(frames, LAT, fct=fct)
    assert nc["method"] == "chmi_fct+advection" and nc["eta_min"] == 20
    assert nc["confidence"] == "high"
    late = [(lead, f) for lead, f in fct]
    late = [(lead, f if lead >= 60 else f * 0) for lead, f in late]
    assert radar.nowcast(frames, LAT, fct=late)["confidence"] in ("medium", "low")


# -- integration: coordinator + WS + authenticated view ---------------------------------------
def composite(frame: np.ndarray) -> bytes:
    full = np.zeros((radar.HEIGHT, radar.WIDTH), dtype=np.uint8)
    row, col = radar.lonlat_to_px(LAT, LON)
    r0, c0 = int(round(row)) - radar.CROP_PX // 2, int(round(col)) - radar.CROP_PX // 2
    full[r0 : r0 + radar.CROP_PX, c0 : c0 + radar.CROP_PX] = frame
    return radar.encode_png(full)


async def test_manager_cap_radar_ws_and_view(
    hass: HomeAssistant, hass_ws_client, hass_client, aioclient_mock
):
    hass.config.latitude, hass.config.longitude = LAT, LON
    for url, name in (
        (openmeteo.hourly_url(LAT, LON), "openmeteo_hourly.json"),
        (openmeteo.daily_url(LAT, LON, str(hass.config.time_zone)), "openmeteo_daily.json"),
        (openmeteo.nowcast_url(LAT, LON), "openmeteo_nowcast.json"),
    ):
        aioclient_mock.get(url, text=(FIX / name).read_text(encoding="utf-8"))
    aioclient_mock.get(chmi_cap.BASE, text=LISTING)
    aioclient_mock.get(chmi_cap.BASE + "alert_cap_50_311800.xml", content=CAP)
    frames, truth = moving(60, 90, n=6)
    newest = datetime(2026, 10, 31, 18, 35, tzinfo=UTC)
    for i, when in enumerate(radar.frame_times(newest, 6)):
        aioclient_mock.get(radar.obs_url(when), content=composite(frames[i]))
    aioclient_mock.get(radar.fct_url(newest), status=404)
    assert await __import__("homeassistant.setup", fromlist=["x"]).async_setup_component(
        hass, "http", {}
    )
    entry = MockConfigEntry(domain=DOMAIN, data={}, options={})
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    manager = hass.data[DOMAIN]["weather"]
    await hass.async_add_executor_job(manager.store.open)
    manager._store_open = True
    await manager._resolve_area()  # async_start is off in tests (AUTOSTART)
    await manager.async_refresh(NOW)
    assert manager.area is not None and manager.area.cisorp == "6203"
    snap = manager.snapshot(NOW)
    assert [w["event"] for w in snap["warnings"]] == ["Silný vítr"]
    assert snap["location"]["area"]["method"] == "polygon"
    assert snap["nowcast"]["source"] == "radar:chmi"
    assert snap["nowcast"]["status"] == "soon" and abs(snap["nowcast"]["eta_min"] - truth) <= 5
    assert snap["radar"]["available"] and len(snap["radar"]["frames"]) == 6
    assert snap["radar"]["available_offsets"] == [-25, -20, -15, -10, -5, 0]
    statuses = {s["id"]: s["status"] for s in snap["sources"]}
    assert statuses["chmi:alerts"] == "fresh" and statuses["chmi:radar"] == "fresh"

    ws = await hass_ws_client(hass)
    await ws.send_json({"id": 1, "type": "homebrain/weather/alerts"})
    msg = await ws.receive_json()
    assert msg["success"] and msg["result"]["feed"] == "cap"
    assert msg["result"]["area"]["cisorp"] == "6203"
    assert msg["result"]["attribution"]["license"] == "CC-BY-4.0"

    client = await hass_client()
    frame_id = snap["radar"]["frames"][-1]["id"]
    resp = await client.get(f"/api/homebrain/weather/radar/{frame_id}")
    assert resp.status == 200 and resp.headers["Content-Type"] == "image/png"
    assert (await resp.read())[:4] == b"\x89PNG"
    assert (await client.get("/api/homebrain/weather/radar/obs-000000000000")).status == 404
    # Whole-country ("Česko" zoom) twin + bundled-basemap alignment.
    rb = snap["radar"]
    assert rb["cz_image_path"] == "/api/homebrain/weather/radar/cz-{id}" and rb["cz_factor"] == 2
    assert rb["origin_px"] == list(radar.crop_origin(LAT, LON))
    assert rb["composite_px"] == [radar.HEIGHT, radar.WIDTH]
    cz = await client.get(f"/api/homebrain/weather/radar/cz-{frame_id}")
    assert cz.status == 200 and (await cz.read())[:4] == b"\x89PNG"
    assert (await client.get("/api/homebrain/weather/radar/cz-fct-999")).status == 404
    await hass.config_entries.async_unload(entry.entry_id)
