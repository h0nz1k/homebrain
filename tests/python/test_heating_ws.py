"""Topení WS: role matrix, kiosk subset, history resolution, import_history, seasons."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from unittest.mock import patch

import pytest
from heating_fake_plc import PASSWORD, USER, write_map
from homeassistant.core import HomeAssistant
from homeassistant.setup import async_setup_component
from pytest_homeassistant_custom_component.common import MockConfigEntry
from pytest_homeassistant_custom_component.components.recorder.common import (
    async_wait_recording_done,
)

from custom_components.homebrain.const import DOMAIN
from custom_components.homebrain.heating import poller as poller_mod


@pytest.fixture
def mock_recorder_before_hass(async_setup_recorder_instance) -> None:
    """Recorder tests: set the recorder up before ``hass`` (custom integrations need hass)."""


@pytest.fixture(autouse=True)
def no_autostart():
    with patch.object(poller_mod, "AUTOSTART", False):
        yield


async def _setup(hass: HomeAssistant, tmp_path) -> MockConfigEntry:
    entry = MockConfigEntry(
        domain=DOMAIN,
        options={
            "heating": {
                # never contacted (AUTOSTART off); documentation-range address
                "url": "http://plc.example",
                "username": USER,
                "password": PASSWORD,
                "map_path": write_map(tmp_path / "map.yaml"),
            }
        },
    )
    await hass.config.async_set_time_zone("UTC")
    entry.add_to_hass(hass)
    assert await async_setup_component(hass, DOMAIN, {})
    await hass.async_block_till_done()
    return entry


async def _call(client, payload: dict) -> dict:
    await client.send_json_auto_id(payload)
    msg = await client.receive_json()
    while msg["type"] == "event":
        msg = await client.receive_json()
    return msg


@pytest.mark.parametrize(
    ("role", "allowed"),
    [
        (None, {"get", "subscribe", "history", "seasons", "import_history"}),  # HA admin = owner
        ("adult", {"get", "subscribe", "history", "seasons"}),
        ("kiosk", {"get"}),
        ("child", set()),
    ],
)
async def test_role_matrix(
    hass: HomeAssistant, tmp_path, hass_ws_client, hass_admin_user, role, allowed
):
    entry = await _setup(hass, tmp_path)
    if role:
        hass_admin_user.groups = []
        hass.config_entries.async_update_entry(
            entry, options={**entry.options, "roles": {hass_admin_user.id: role}}
        )
    client = await hass_ws_client(hass)
    payloads = {
        "get": {},
        "subscribe": {},
        "history": {"range": "day", "keys": ["outdoor_temp"]},
        "seasons": {},
        "import_history": {"rows": []},
    }
    for name, extra in payloads.items():
        msg = await _call(client, {"type": f"homebrain/heating/{name}", **extra})
        code = None if msg["success"] else msg["error"]["code"]
        if name in allowed:
            assert code != "unauthorized", (role, name, code)
        else:
            assert code == "unauthorized", (role, name)
    if "get" in allowed:
        msg = await _call(client, {"type": "homebrain/heating/get"})
        result = msg["result"]
        assert result["source"] in {"ok", "auth", "unreachable", "unconfigured"}
        if role == "kiosk":
            assert "schedules" not in result and "curve" not in result
        else:
            assert "schedules" in result and "rooms" in result
        assert PASSWORD not in str(result)


async def test_subscribe_pushes_on_change(hass: HomeAssistant, tmp_path, hass_ws_client):
    await _setup(hass, tmp_path)
    poller = hass.data[DOMAIN]["heating"]
    client = await hass_ws_client(hass)
    await client.send_json_auto_id({"type": "homebrain/heating/subscribe"})
    msg = await client.receive_json()
    assert msg["success"]
    first = await client.receive_json()
    assert first["type"] == "event" and "activity" in first["event"]
    poller._source = "unreachable"  # noqa: SLF001
    poller._notify()  # noqa: SLF001
    pushed = await client.receive_json()
    assert pushed["event"]["source"] == "unreachable"


HOUR0 = datetime(2025, 1, 6, 0, 0, tzinfo=UTC)


def _rows(hours: int) -> list[dict]:
    rows = []
    for h in range(hours):
        ts = int((HOUR0 + timedelta(hours=h)).timestamp() * 1000)
        rows.append({"key": "outdoor_temp", "start": ts, "mean": -2.0, "min": -3.0, "max": -1.0})
        rows.append({"key": "compressor_runtime_h", "start": ts, "sum": 0.25})
        rows.append({"key": "compressor_starts", "start": ts, "sum": 1})
    return rows


async def _stats(hass: HomeAssistant, statistic_id: str) -> list[dict]:
    from homeassistant.components.recorder import get_instance
    from homeassistant.components.recorder.statistics import statistics_during_period

    raw = await get_instance(hass).async_add_executor_job(
        statistics_during_period,
        hass,
        HOUR0 - timedelta(days=1),
        None,
        {statistic_id},
        "hour",
        None,
        {"mean", "min", "max", "sum", "state", "change"},
    )
    return raw.get(statistic_id, [])


COUNTER_AMOUNTS = {
    "compressor_runtime_h": [0.25, 0.5, 0.0, 0.75, 0.25, 0.5],
    "compressor_starts": [1, 2, 0, 3, 1, 2],
    "energy_kwh": [1.5, 3.0, 0.0, 4.5, 1.5, 3.0],
}


def _counter_batches() -> list[list[dict]]:
    return [
        [
            {
                "key": key,
                "start": int((HOUR0 + timedelta(hours=h)).timestamp() * 1000),
                "sum": amounts[h],
            }
            for key, amounts in COUNTER_AMOUNTS.items()
            for h in range(offset, offset + 2)
        ]
        for offset in (0, 2, 4)
    ]


async def test_import_history_consecutive_counter_batches(
    recorder_mock, hass: HomeAssistant, tmp_path, hass_ws_client
):
    await _setup(hass, tmp_path)
    client = await hass_ws_client(hass)
    # No test-side recorder flushes or sleeps between requests or before reading.
    for batch in _counter_batches():
        msg = await _call(client, {"type": "homebrain/heating/import_history", "rows": batch})
        assert msg["success"], msg
        assert msg["result"]["imported"] == len(batch)

    for key, amounts in COUNTER_AMOUNTS.items():
        stats = await _stats(hass, f"sensor.heating_{key}")
        assert len(stats) == len(amounts)
        assert stats[-1]["sum"] == pytest.approx(sum(amounts))
        previous = 0.0
        for row, amount in zip(stats, amounts, strict=True):
            assert row["change"] >= 0
            change = row["sum"] - previous
            assert change >= 0
            assert change == pytest.approx(amount)
            previous = row["sum"]


async def test_import_history_counter_batch_reimport_idempotent(
    recorder_mock, hass: HomeAssistant, tmp_path, hass_ws_client
):
    await _setup(hass, tmp_path)
    client = await hass_ws_client(hass)
    batches = _counter_batches()
    for batch in batches:
        msg = await _call(client, {"type": "homebrain/heating/import_history", "rows": batch})
        assert msg["success"], msg
    before = {key: await _stats(hass, f"sensor.heating_{key}") for key in COUNTER_AMOUNTS}

    # Replay both the first batch (zero seed) and a middle batch with later rows present.
    for batch in batches[:2]:
        msg = await _call(client, {"type": "homebrain/heating/import_history", "rows": batch})
        assert msg["success"], msg
        for key in COUNTER_AMOUNTS:
            assert await _stats(hass, f"sensor.heating_{key}") == before[key]


async def test_import_history_idempotent_and_seasons(
    recorder_mock, hass: HomeAssistant, tmp_path, hass_ws_client
):
    await _setup(hass, tmp_path)
    client = await hass_ws_client(hass)
    rows = _rows(48)
    msg = await _call(client, {"type": "homebrain/heating/import_history", "rows": rows})
    assert msg["success"], msg
    assert msg["result"]["imported"] == len(rows)
    await async_wait_recording_done(hass)
    outdoor = await _stats(hass, "sensor.heating_outdoor_temp")
    runtime = await _stats(hass, "sensor.heating_compressor_runtime_h")
    assert len(outdoor) == 48 and outdoor[0]["mean"] == pytest.approx(-2.0)
    assert runtime[-1]["sum"] == pytest.approx(12.0)

    # Same batch again: no duplicates, identical sums.
    msg = await _call(client, {"type": "homebrain/heating/import_history", "rows": rows})
    assert msg["success"]
    await async_wait_recording_done(hass)
    assert await _stats(hass, "sensor.heating_outdoor_temp") == outdoor
    assert await _stats(hass, "sensor.heating_compressor_runtime_h") == runtime

    # Unknown keys and unaligned hours are reported, not imported.
    bad = [
        {"key": "nope", "start": rows[0]["start"], "mean": 1},
        {"key": "outdoor_temp", "start": rows[0]["start"] + 60_000, "mean": 1},
    ]
    msg = await _call(client, {"type": "homebrain/heating/import_history", "rows": bad})
    assert msg["result"]["imported"] == 0 and len(msg["result"]["rejected"]) == 2

    with patch(
        "custom_components.homebrain.heating.ws.dt_util.now",
        return_value=datetime(2025, 1, 8, 12, tzinfo=UTC),
    ):
        msg = await _call(client, {"type": "homebrain/heating/seasons"})
    assert msg["success"], msg
    season = msg["result"][0]
    assert season["season"] == "2024/25" and season["partial"] is True
    assert season["compressor_h"] == pytest.approx(12.0)
    assert season["starts"] == 48
    assert season["degree_days"] == pytest.approx(44.0)  # 2 days × (20 − (−2))
    assert season["outdoor_mean"] == pytest.approx(-2.0)

    msg = await _call(
        client,
        {"type": "homebrain/heating/history", "range": "all", "keys": ["outdoor_temp", "x"]},
    )
    assert msg["success"]
    assert msg["result"]["resolution"] == "day"
    series = {s["key"]: s for s in msg["result"]["series"]}
    assert set(series) == {"outdoor_temp"} and series["outdoor_temp"]["unit"] == "°C"
    assert series["outdoor_temp"]["points"][0][1:] == pytest.approx([-2.0, -3.0, -1.0])


@pytest.mark.parametrize(
    ("rng", "resolution"), [("day", "5min"), ("week", "hour"), ("month", "hour"), ("season", "day")]
)
async def test_history_resolution(
    recorder_mock, hass: HomeAssistant, tmp_path, hass_ws_client, rng, resolution
):
    await _setup(hass, tmp_path)
    client = await hass_ws_client(hass)
    msg = await _call(client, {"type": "homebrain/heating/history", "range": rng})
    assert msg["success"], msg
    assert msg["result"]["range"] == rng
    assert msg["result"]["resolution"] == resolution
    assert isinstance(msg["result"]["runs"], list)
