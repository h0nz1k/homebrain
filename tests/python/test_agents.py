"""Agents module: sibling discovery from a synthetic prefix, rules, verdict and the WS shape."""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from homeassistant.core import HomeAssistant
from homeassistant.setup import async_setup_component
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.homebrain.agents import rules
from custom_components.homebrain.agents.discovery import build_snapshot, monitor_url, prefix_of
from custom_components.homebrain.const import DOMAIN, MODULE_PANELS
from custom_components.homebrain.modules import MODULES
from custom_components.homebrain.roles import MODULE_VISIBILITY

# Synthetic prefix only (the owner's real prefix and entity ids never live in Git).
P = "agenti_demo"
STATUS = f"sensor.{P}_stav"
URL = "https://monitor.example"


def _entry(hass: HomeAssistant, *, bound: str | None = STATUS, url: str | None = URL):
    options: dict = {}
    if bound:
        options["bindings"] = {"agents": {"agents_status": bound}}
    if url:
        options["agents"] = {"monitor_url": url}
    entry = MockConfigEntry(domain=DOMAIN, data={}, options=options)
    entry.add_to_hass(hass)
    return entry


def _quota(hass, qid, remaining, **attrs):
    base = {
        "provider": "Poskytovatel X · Plán A",
        "okno": "5h",
        "used_pct": None if remaining is None else 100 - float(remaining),
        "reset_at": "2026-11-24T12:57:00+00:00",
        "exhausted": False,
        "will_exhaust_before_reset": False,
    }
    hass.states.async_set(f"sensor.{P}_kvota_{qid}_zbyva", str(remaining), {**base, **attrs})


def install(hass: HomeAssistant, *, status: str = "ok", fresh: str = "on") -> None:
    hass.states.async_set(
        STATUS,
        status,
        {"critical_count": 0, "attention_count": 0, "overall": "raw", "stale": False},
    )
    hass.states.async_set(f"binary_sensor.{P}_data_aktualni", fresh)
    _quota(hass, "x_5h", "80")
    _quota(hass, "y_week", "60", okno="Model Y week", provider="Poskytovatel Y")
    hass.states.async_set(f"binary_sensor.{P}_kvota_dojde_pred_resetem", "off", {"kvoty": []})
    hass.states.async_set(
        f"sensor.{P}_agenti_aktivni",
        "2",
        {
            "celkem": 3,
            "agenti": [
                {"name": "Agent A", "model_label": "Model X", "alive": True, "waiting": False},
                {"name": "Agent B", "model_label": "Model Y", "alive": True, "waiting": False},
                {"name": "Agent C", "model_label": "Model X", "alive": False, "waiting": False},
            ],
        },
    )
    hass.states.async_set(f"sensor.{P}_agenti_cekaji", "1", {"kdo": ["Agent B"]})
    for sid, name in (("wiki", "Služba Wiki"), ("brana", "Služba Brána")):
        hass.states.async_set(
            f"binary_sensor.{P}_sluzba_{sid}",
            "on",
            {"friendly_name": f"Agenti – {name}", "stav": "operational", "sla_24h": 99.9},
        )
    for key, value in (("pending", 4), ("running", 2), ("blocked", 1), ("review", 3)):
        hass.states.async_set(f"sensor.{P}_fronta_{key}", str(value))
    hass.states.async_set(f"sensor.{P}_posledni_upozorneni", "2026-11-24T07:10:00+00:00")


# ---------- rules ----------


@pytest.mark.parametrize(
    ("raw", "label"),
    [
        ("5h", "5 h"),
        ("Gemini 5h", "5 h"),
        ("7d", "7 dní"),
        ("1d", "1 den"),
        ("Claude week", "týden"),
        ("Included", "měsíc"),
        ("Actions min", "měsíc"),
        ("API", "kredit"),
        ("GCP Bonus", "kredit"),
        ("Něco jiného", "Něco jiného"),
        (None, None),
        ("", None),
    ],
)
def test_window_label(raw, label):
    assert rules.window_label(raw) == label


@pytest.mark.parametrize(
    ("quota", "level"),
    [
        ({"remaining_pct": 80.0}, "ok"),
        ({"remaining_pct": 25.0}, "ok"),
        ({"remaining_pct": 24.9}, "warning"),
        ({"remaining_pct": 10.0}, "warning"),
        ({"remaining_pct": 9.9}, "critical"),
        ({"remaining_pct": 70.0, "exhaust_before_reset": True}, "warning"),
        ({"remaining_pct": 70.0, "exhausted": True}, "critical"),
        ({"remaining_pct": None}, "unknown"),
    ],
)
def test_quota_level(quota, level):
    assert rules.quota_level(quota) == level


@pytest.mark.parametrize(
    ("service", "level"),
    [
        ({"up": True, "state": "operational", "sla_24h": 99.0}, "ok"),
        ({"up": True, "sla_24h": 95.0}, "ok"),
        ({"up": True, "sla_24h": 94.9}, "warning"),
        ({"up": True, "state": "degraded", "sla_24h": None}, "warning"),
        ({"up": False, "sla_24h": 99.0}, "critical"),
        ({"up": True, "state": "down"}, "critical"),
        ({"up": None}, "unknown"),
    ],
)
def test_service_level(service, level):
    assert rules.service_level(service) == level


def test_status_level_ignores_overall():
    assert rules.status_level("attention") == "warning"
    assert rules.status_level("critical") == "critical"
    assert rules.status_level("weird") == "unknown"


def test_prefix_and_url():
    assert prefix_of(STATUS) == P
    assert prefix_of("sensor.something_else") is None
    assert monitor_url({"agents": {"monitor_url": " https://monitor.example "}}) == URL
    assert monitor_url({"agents": {"monitor_url": "javascript:alert(1)"}}) is None
    assert monitor_url({}) is None


# ---------- discovery ----------


async def test_not_configured(hass: HomeAssistant):
    _entry(hass, bound=None, url=None)
    install(hass)
    snap = build_snapshot(hass)
    assert snap["configured"] is False
    assert snap["quotas"] == [] and snap["services"] == []
    assert snap["verdict"] == {"level": "unknown", "reasons": []}


async def test_all_ok(hass: HomeAssistant):
    _entry(hass)
    install(hass)
    snap = build_snapshot(hass)
    assert snap["configured"] is True
    assert snap["monitor_url"] == URL
    assert snap["status"]["level"] == "ok"
    assert snap["data"]["current"] is True
    assert [q["id"] for q in snap["quotas"]] == ["y_week", "x_5h"]  # lowest remaining first
    assert snap["quotas"][0]["window_label"] == "týden"
    assert snap["quotas"][1] | {"level": "ok"} == snap["quotas"][1]
    assert snap["agents"]["active"] == 2 and snap["agents"]["total"] == 3
    by_name = {a["name"]: a for a in snap["agents"]["items"]}
    assert by_name["Agent B"]["waiting"] is True  # from `kdo`
    assert by_name["Agent C"]["alive"] is False
    assert [s["name"] for s in snap["services"]] == ["Služba Brána", "Služba Wiki"]
    assert snap["queue"] == {
        "available": True,
        "pending": 4,
        "running": 2,
        "blocked": 1,
        "review": 3,
    }
    assert snap["last_alert"] == "2026-11-24T07:10:00+00:00"
    assert snap["exhaust_forecast"] == {"available": True, "active": False, "items": []}
    assert snap["verdict"] == {"level": "ok", "reasons": []}


async def test_n_quotas_and_services_by_pattern(hass: HomeAssistant):
    _entry(hass)
    install(hass)
    for i in range(5):
        _quota(hass, f"extra_{i}", str(50 + i))
    hass.states.async_set(f"binary_sensor.{P}_sluzba_treti", "on", {"sla_24h": 100})
    # Look-alikes with another prefix or suffix are not siblings.
    hass.states.async_set("sensor.jiny_kvota_x_zbyva", "1")
    hass.states.async_set(f"sensor.{P}_kvota_x_pouzito", "1")
    hass.states.async_set(f"sensor.{P}x_kvota_x_zbyva", "1")
    snap = build_snapshot(hass)
    assert len(snap["quotas"]) == 7
    assert len(snap["services"]) == 3
    # A name without the shared head falls back to the raw names (nothing to cut).
    assert "treti" in {s["name"] for s in snap["services"]} or any(
        s["id"] == "treti" for s in snap["services"]
    )


async def test_warnings(hass: HomeAssistant):
    _entry(hass)
    install(hass, status="attention")
    _quota(hass, "low_a", "20")
    _quota(hass, "low_b", "15", okno="7d")
    _quota(hass, "forecast", "70", will_exhaust_before_reset=True)
    _quota(hass, "gone", "0", exhausted=True)
    hass.states.async_set(
        f"binary_sensor.{P}_sluzba_wiki",
        "on",
        {"friendly_name": "Agenti – Služba Wiki", "stav": "operational", "sla_24h": 93.0},
    )
    snap = build_snapshot(hass)
    levels = [q["level"] for q in snap["quotas"]]
    assert levels[0] == "critical" and snap["quotas"][0]["exhausted"] is True
    assert levels.count("warning") == 3
    assert snap["services"][0]["level"] == "warning"
    verdict = snap["verdict"]
    # Sensor attention → overall warning; exhausted quota stays critical in reasons.
    assert verdict["level"] == "warning"
    assert verdict["reasons"][0]["kind"] == "quota"
    assert verdict["reasons"][0]["level"] == "critical"
    assert verdict["reasons"][0]["detail"] == "exhausted"
    kinds = [(r["kind"], r["level"]) for r in verdict["reasons"]]
    assert ("service", "warning") in kinds
    assert ("status", "warning") not in kinds  # items already explain the attention


async def test_sensor_ok_with_exhausted_quota_stays_ok(hass: HomeAssistant):
    _entry(hass)
    install(hass, status="ok")
    _quota(hass, "gone", "0", exhausted=True)
    snap = build_snapshot(hass)
    assert snap["verdict"]["level"] == "ok"
    assert snap["verdict"]["reasons"][0]["detail"] == "exhausted"
    assert snap["verdict"]["reasons"][0]["level"] == "critical"


async def test_critical_service_down_and_stale_data(hass: HomeAssistant):
    _entry(hass)
    install(hass, status="critical", fresh="off")
    hass.states.async_set(
        f"binary_sensor.{P}_sluzba_wiki",
        "off",
        {"friendly_name": "Agenti – Služba Wiki", "stav": "down", "sla_24h": 80.0},
    )
    snap = build_snapshot(hass)
    assert snap["data"]["current"] is False
    assert snap["data"]["since"] is not None
    assert snap["services"][0]["level"] == "critical"
    reasons = snap["verdict"]["reasons"]
    assert snap["verdict"]["level"] == "critical"
    assert reasons[0] == {
        "kind": "service",
        "label": "Služba Wiki",
        "level": "critical",
        "value": 80.0,
        "detail": "down",
    }
    assert any(r["kind"] == "data" and r["level"] == "warning" for r in reasons)


async def test_status_alone_drives_verdict(hass: HomeAssistant):
    _entry(hass)
    install(hass, status="critical")
    snap = build_snapshot(hass)
    assert snap["verdict"]["level"] == "critical"
    assert snap["verdict"]["reasons"][0]["kind"] == "status"


async def test_status_critical_without_critical_items(hass: HomeAssistant):
    _entry(hass)
    install(hass, status="critical")
    _quota(hass, "low", "20")  # warning item only
    snap = build_snapshot(hass)
    assert snap["verdict"]["level"] == "critical"
    assert any(r["kind"] == "quota" and r["level"] == "warning" for r in snap["verdict"]["reasons"])


async def test_unavailable_status_falls_back_to_items(hass: HomeAssistant):
    _entry(hass)
    install(hass)
    hass.states.async_set(STATUS, "unavailable")
    _quota(hass, "gone", "0", exhausted=True)
    snap = build_snapshot(hass)
    assert snap["status"]["available"] is False
    assert snap["verdict"]["level"] == "critical"
    assert snap["verdict"]["reasons"][0]["detail"] == "exhausted"


async def test_unavailable_siblings(hass: HomeAssistant):
    _entry(hass)
    install(hass)
    hass.states.async_set(f"sensor.{P}_kvota_x_5h_zbyva", "unavailable")
    hass.states.async_set(f"sensor.{P}_agenti_aktivni", "unknown")
    hass.states.async_set(f"binary_sensor.{P}_sluzba_wiki", "unavailable")
    for key in ("pending", "running", "blocked", "review"):
        hass.states.async_set(f"sensor.{P}_fronta_{key}", "unavailable")
    hass.states.async_set(f"binary_sensor.{P}_data_aktualni", "unavailable")
    snap = build_snapshot(hass)
    quota = next(q for q in snap["quotas"] if q["id"] == "x_5h")
    assert quota["available"] is False and quota["level"] == "unknown"
    assert snap["quotas"][-1]["id"] == "x_5h"  # unknown last
    assert snap["agents"]["available"] is False and snap["agents"]["items"] == []
    wiki = next(s for s in snap["services"] if s["id"] == "wiki")
    assert wiki["up"] is None and wiki["level"] == "unknown"
    assert snap["queue"]["available"] is False
    # No freshness sensor value: the status' `stale` attribute is the fallback.
    assert snap["data"]["current"] is True
    assert snap["verdict"]["level"] == "ok"


async def test_missing_siblings_and_status(hass: HomeAssistant):
    _entry(hass, url=None)
    snap = build_snapshot(hass)  # bound, but nothing exists in HA yet
    assert snap["configured"] is True
    assert snap["status"]["available"] is False
    assert snap["monitor_url"] is None
    assert snap["quotas"] == [] and snap["services"] == []
    assert snap["agents"]["available"] is False
    assert snap["data"] == {"current": None, "since": None}
    assert snap["verdict"]["level"] == "unknown"


# ---------- WS + registration ----------


@pytest.fixture
async def setup(hass: HomeAssistant, hass_admin_user):
    entry = _entry(hass)
    assert await async_setup_component(hass, DOMAIN, {})
    await hass.async_block_till_done()
    return entry


async def test_ws_shape(hass: HomeAssistant, setup, hass_ws_client):
    install(hass)
    client = await hass_ws_client(hass)
    await client.send_json_auto_id({"type": "homebrain/agents/get"})
    msg = await client.receive_json()
    assert msg["success"], msg
    result = msg["result"]
    assert set(result) >= {
        "configured",
        "status",
        "data",
        "quotas",
        "exhaust_forecast",
        "agents",
        "services",
        "queue",
        "monitor_url",
        "last_alert",
        "verdict",
        "updated_at",
    }
    assert set(result["quotas"][0]) >= {
        "id",
        "provider",
        "window_label",
        "remaining_pct",
        "used_pct",
        "reset_at",
        "exhausted",
        "exhaust_before_reset",
        "level",
    }
    assert result["monitor_url"] == URL


async def test_ws_requires_admin(hass: HomeAssistant, setup, hass_ws_client, hass_admin_user):
    hass_admin_user.groups = []
    client = await hass_ws_client(hass)
    await client.send_json_auto_id({"type": "homebrain/agents/get"})
    msg = await client.receive_json()
    assert not msg["success"]
    assert msg["error"]["code"] == "unauthorized"


def test_panel_registration():
    panels = json.loads(
        (Path(__file__).parents[2] / "custom_components/homebrain/panels.json").read_text()
    )
    panel = next(p for p in panels["modules"] if p["module"] == "agents")
    assert panel == {
        "url_path": "homebrain-agenti",
        "title": "Agenti",
        "icon": "mdi:robot-outline",
        "module": "agents",
        "require_admin": True,
    }
    assert MODULE_PANELS["homebrain-agenti"]["module"] == "agents"
    assert "agents" in MODULES
    assert "agents" in MODULE_VISIBILITY["owner"]
    assert all("agents" not in mods for role, mods in MODULE_VISIBILITY.items() if role != "owner")


async def test_options_flow_step(hass: HomeAssistant):
    entry = _entry(hass, bound=None, url=None)
    flow = await hass.config_entries.options.async_init(entry.entry_id)
    flow = await hass.config_entries.options.async_configure(
        flow["flow_id"], {"next_step_id": "agents"}
    )
    assert flow["step_id"] == "agents"
    bad = await hass.config_entries.options.async_configure(
        flow["flow_id"], {"agents_status": STATUS, "monitor_url": "ftp://monitor.example"}
    )
    assert bad["errors"] == {"monitor_url": "invalid_url"}
    done = await hass.config_entries.options.async_configure(
        flow["flow_id"], {"agents_status": STATUS, "monitor_url": URL}
    )
    assert done["type"] == "create_entry"
    assert entry.options["bindings"]["agents"] == {"agents_status": STATUS}
    assert entry.options["agents"] == {"monitor_url": URL}
