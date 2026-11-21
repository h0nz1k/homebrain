"""Hlídání domu (#128): registry selection, WS read API, local owner actions, restart, no writes.

Synthetic registry entries only (``demo_*``); the permission matrix itself is covered for every
command in ``test_kiosk_panel.py``.
"""

from datetime import timedelta

import pytest
from homeassistant.const import EVENT_CALL_SERVICE
from homeassistant.core import HomeAssistant
from homeassistant.helpers import area_registry as ar
from homeassistant.helpers import device_registry as dr
from homeassistant.helpers import entity_registry as er
from homeassistant.setup import async_setup_component
from homeassistant.util import dt as dt_util
from pytest_homeassistant_custom_component.common import MockConfigEntry, async_fire_time_changed

from custom_components.homebrain.anomaly.learn import EntityBaseline
from custom_components.homebrain.anomaly.manager import AnomalyWatch, build_metas, get_watch
from custom_components.homebrain.const import DOMAIN

DEMO = "demo_watch"


def _device(hass: HomeAssistant, entry: MockConfigEntry, slug: str, name: str) -> str:
    return (
        dr.async_get(hass)
        .async_get_or_create(config_entry_id=entry.entry_id, identifiers={(DEMO, slug)}, name=name)
        .id
    )


def _entity(hass, entry, domain, slug, device_id, **kw) -> str:
    return (
        er.async_get(hass)
        .async_get_or_create(
            domain,
            DEMO,
            slug,
            config_entry=entry,
            device_id=device_id,
            suggested_object_id=f"demo_{slug}",
            **kw,
        )
        .entity_id
    )


@pytest.fixture
async def house(hass: HomeAssistant, hass_admin_user):
    """HomeBrain + a synthetic cellar climate sensor (temperature + humidity) and a door."""
    source = MockConfigEntry(domain=DEMO, data={})
    source.add_to_hass(hass)
    cellar = _device(hass, source, "cellar", "Čidlo ve sklepě")
    door = _device(hass, source, "door", "Vstupní dveře")
    # Synthetic room: the panel says „Ve sklepě …“ (locative built in the copy layer).
    room = ar.async_get(hass).async_create("Sklep")
    dr.async_get(hass).async_update_device(cellar, area_id=room.id)
    ids = {
        "temp": _entity(
            hass, source, "sensor", "cellar_temperature", cellar, original_name="Teplota"
        ),
        "hum": _entity(hass, source, "sensor", "cellar_humidity", cellar, original_name="Vlhkost"),
        "door": _entity(hass, source, "binary_sensor", "front_door", door, original_name="Dveře"),
        # never watched: diagnostic, disabled, media player, no device
        "rssi": _entity(
            hass,
            source,
            "sensor",
            "cellar_rssi",
            cellar,
            entity_category=er.EntityCategory.DIAGNOSTIC,
        ),
        "off": _entity(
            hass, source, "sensor", "cellar_off", cellar, disabled_by=er.RegistryEntryDisabler.USER
        ),
        "tv": _entity(hass, source, "media_player", "tv", door),
        "loose": _entity(hass, source, "sensor", "loose", None),
    }
    attrs = {
        "state_class": "measurement",
        "unit_of_measurement": "°C",
        "device_class": "temperature",
    }
    hass.states.async_set(ids["temp"], "14.0", attrs)
    hass.states.async_set(
        ids["hum"], "70", {**attrs, "unit_of_measurement": "%", "device_class": "humidity"}
    )
    hass.states.async_set(ids["door"], "off", {"device_class": "door"})
    hass.states.async_set(ids["rssi"], "-70", {"state_class": "measurement"})
    hass.states.async_set(ids["tv"], "off")
    hass.states.async_set(ids["loose"], "1", {"state_class": "measurement"})

    entry = MockConfigEntry(domain=DOMAIN, data={}, options={})
    entry.add_to_hass(hass)
    assert await async_setup_component(hass, DOMAIN, {})
    await hass.async_block_till_done()
    watch = get_watch(hass)
    assert watch is not None
    watch._rebuild()
    learnt = {
        eid: EntityBaseline(
            eid,
            watch.engine.metas[eid].device_id,
            21.0,
            periodic=True,
            p50_interval=timedelta(minutes=10),
            p95_interval=timedelta(minutes=10),
        )
        for eid in (ids["temp"], ids["hum"])
    }
    watch.engine.set_baselines(learnt)
    watch.learned_at = dt_util.now()
    return {"entry": entry, "watch": watch, "ids": ids, "cellar": cellar}


async def _call(client, **msg):
    await client.send_json_auto_id(msg)
    return await client.receive_json()


async def test_registry_selection(hass: HomeAssistant, house):
    ids = house["ids"]
    metas = {m.entity_id: m for m in build_metas(hass)}
    assert set(metas) == {ids["temp"], ids["hum"], ids["door"]}
    assert metas[ids["temp"]].kind == "numeric"
    assert metas[ids["temp"]].device_class == "temperature"
    assert metas[ids["door"]].kind == "discrete"
    assert metas[ids["hum"]].device_name == "Čidlo ve sklepě"
    assert metas[ids["hum"]].integration == DEMO
    assert metas[ids["hum"]].area == "Sklep" and metas[ids["door"]].area is None


@pytest.mark.parametrize("with_selector", [False, True])
async def test_utility_meter_only_expects_reports_during_active_tariff(hass, house, with_selector):
    watch = house["watch"]
    registry = er.async_get(hass)
    entry = MockConfigEntry(domain="utility_meter", data={})
    entry.add_to_hass(hass)
    device = _device(hass, entry, "tariff", "Demo měřič")
    eid = registry.async_get_or_create(
        "sensor",
        "utility_meter",
        f"{entry.entry_id}_offpeak" if with_selector else "demo_meter_nt",
        config_entry=entry if with_selector else None,
        device_id=device,
        suggested_object_id="demo_meter_renamed" if with_selector else "demo_meter_nt",
    ).entity_id
    hass.states.async_set(eid, "1", {"tariff": "offpeak"} if with_selector else {})
    if with_selector:
        selector = registry.async_get_or_create(
            "select",
            "utility_meter",
            entry.entry_id,
            config_entry=entry,
            suggested_object_id="demo_tariff_renamed",
        ).entity_id
        hass.states.async_set(selector, "peak")
    await hass.async_block_till_done()
    async_fire_time_changed(hass, dt_util.utcnow() + timedelta(seconds=30))
    await hass.async_block_till_done()
    watch.engine.set_baselines(
        {eid: EntityBaseline(eid, device, 21, periodic=True, p95_interval=timedelta(minutes=10))}
    )

    assert not watch.evaluate(dt_util.now() + timedelta(hours=8)).reports
    assert watch.engine.quiet(eid, dt_util.now() + timedelta(hours=8)) is None
    if with_selector:
        hass.states.async_set(selector, "offpeak")
        start = hass.states.get(selector).last_changed
        assert not watch.evaluate(start + timedelta(minutes=29)).reports
        (report,) = watch.evaluate(start + timedelta(minutes=30)).reports
        assert report.findings[0].detector == "silent"
        assert report.findings[0].detail["expected_since"] == start.isoformat()
        hass.states.async_set(selector, "peak")
        assert not watch.evaluate(start + timedelta(minutes=31)).reports


async def test_list_summary_ack_mute_and_no_ha_writes(
    hass: HomeAssistant, house, hass_ws_client, hass_admin_user
):
    calls = []
    hass.bus.async_listen(EVENT_CALL_SERVICE, calls.append)
    watch: AnomalyWatch = house["watch"]
    ids = house["ids"]
    # Only the humidity goes quiet; the temperature of the same sensor keeps reporting.
    later = dt_util.now() + timedelta(hours=3)
    hass.states.async_set(
        ids["temp"], "14.1", {"state_class": "measurement", "device_class": "temperature"}
    )
    watch.engine.touch(ids["temp"], later)
    watch.evaluate(later)

    client = await hass_ws_client(hass)
    msg = await _call(client, type="homebrain/anomaly/list")
    assert msg["success"], msg
    data = msg["result"]
    (report,) = data["reports"]
    assert report["key"] == f"device:{house['cellar']}"
    assert report["tier"] == "suspicion" and report["hidden"] is None
    assert report["devices"][0]["name"] == "Čidlo ve sklepě"
    assert report["devices"][0]["area"] == "Sklep"
    (finding,) = report["findings"]
    assert finding["detector"] == "silent" and finding["device_class"] == "humidity"
    assert finding["entity_id"] == ids["hum"]
    # outage times are anchored to the last report („od posledního hlášení“)
    last = dt_util.parse_datetime(finding["detail"]["last"])
    assert later - last >= timedelta(hours=3) - timedelta(seconds=5)
    assert report["earliest"]["confirmed"] == (last + timedelta(hours=6)).isoformat()
    # the copy layer can tell that the same device still sends its temperature
    assert [r["device_class"] for r in report["reporting"]] == ["temperature"]
    assert data["counts"] == {"observation": 0, "suspicion": 1, "confirmed": 0}
    assert data["watched"]["devices"] == 1 and data["watched"]["entities"] == 2
    assert len(data["health"]) == 24 and data["health"][-1] == "suspicion"

    # Kiosk summary: same report, no entity or device ids anywhere.
    summary = (await _call(client, type="homebrain/anomaly/summary"))["result"]
    text = str(summary)
    assert ids["hum"] not in text and house["cellar"] not in text
    assert summary["reports"][0]["tier"] == "suspicion"
    assert summary["reports"][0]["devices"] == [
        {"name": "Čidlo ve sklepě", "area": "Sklep", "monitored": 2}
    ]

    # „To je v pořádku“ hides this occurrence and widens the humidity limits.
    key = report["key"]
    assert (await _call(client, type="homebrain/anomaly/ack", key=key, kind="ok"))["success"]
    assert watch.engine.tolerance[ids["hum"]] == 1.5
    data = (await _call(client, type="homebrain/anomaly/list"))["result"]
    assert data["reports"][0]["hidden"] == "acked" and data["counts"]["suspicion"] == 0
    summary = (await _call(client, type="homebrain/anomaly/summary"))["result"]
    assert summary["reports"] == []

    # Escalating beyond the acknowledged tier shows it again.
    watch.evaluate(later + timedelta(hours=7))
    data = (await _call(client, type="homebrain/anomaly/list"))["result"]
    assert data["reports"][0]["tier"] == "confirmed" and data["reports"][0]["hidden"] is None

    # Ztlumit na 7 dní / zrušit ztlumení.
    muted = await _call(client, type="homebrain/anomaly/mute", key=key)
    assert muted["success"]
    data = (await _call(client, type="homebrain/anomaly/list"))["result"]
    assert data["reports"][0]["hidden"] == "muted" and data["reports"][0]["muted_until"]
    assert (await _call(client, type="homebrain/anomaly/unmute", key=key))["result"]["ok"]

    # Unknown report: a clean error, not a crash.
    gone = await _call(client, type="homebrain/anomaly/ack", key="device:none", kind="resolved")
    assert gone["error"]["code"] == "not_found"

    await hass.async_block_till_done()
    assert calls == []  # phase 1: never a service call (no notification, no device command)


async def test_resolved_shows_again_if_it_persists(hass: HomeAssistant, house):
    watch: AnomalyWatch = house["watch"]
    later = dt_util.now() + timedelta(hours=7)
    watch.evaluate(later)
    (report,) = watch.snapshot.reports
    assert watch.acknowledge(report.key, "resolved")
    watch.evaluate(later + timedelta(minutes=30))
    assert watch.hidden(watch.snapshot.reports[0], watch.snapshot.now) == "acked"
    watch.evaluate(later + timedelta(hours=2, minutes=5))
    assert watch.hidden(watch.snapshot.reports[0], watch.snapshot.now) is None


async def test_state_survives_restart(hass: HomeAssistant, house):
    """Open findings, acknowledgements and baselines come back from the Store."""
    watch: AnomalyWatch = house["watch"]
    later = dt_util.now() + timedelta(hours=3)
    watch.evaluate(later)
    (report,) = watch.snapshot.reports
    watch.acknowledge(report.key, "ok")
    await watch.async_stop()

    again = AnomalyWatch(hass)
    await again.async_start()
    try:
        assert set(again.engine.baselines) == set(watch.engine.baselines)
        assert again.acks.keys() == {report.key}
        restored = again.engine.active[f"silent:{house['ids']['hum']}"]
        assert restored.since == report.findings[0].since
        assert restored.detail["last"] == report.findings[0].detail["last"]
    finally:
        await again.async_stop()


async def test_learning_reads_the_recorder_in_batches(hass: HomeAssistant, house, monkeypatch):
    """Learning runs in the recorder executor and never blocks; without a recorder it is a no-op."""
    watch: AnomalyWatch = house["watch"]
    assert "recorder" not in hass.config.components
    assert await watch.async_learn() == 0

    seen: list[int] = []

    def fake(_hass, metas, *_args):
        seen.append(len(metas))
        return {m.entity_id: EntityBaseline(m.entity_id, m.device_id, 10.0) for m in metas}

    class _Recorder:
        async def async_add_executor_job(self, func, *args):
            return func(*args)

    monkeypatch.setattr(
        "custom_components.homebrain.anomaly.manager._fetch_and_learn", fake, raising=True
    )
    monkeypatch.setattr("homeassistant.components.recorder.get_instance", lambda _hass: _Recorder())
    hass.config.components.add("recorder")
    try:
        monkeypatch.setattr("custom_components.homebrain.anomaly.manager.LEARN_BATCH", 2)
        assert await watch.async_learn() == 3
    finally:
        hass.config.components.remove("recorder")
    assert seen == [2, 1]
    assert watch.learned_at is not None and len(watch.first_seen) == 3
