"""Energie invoices: HTTP upload (admin only), private storage, WS list/save/delete/compare."""

from pathlib import Path

import pytest
from aiohttp import FormData
from homeassistant.core import HomeAssistant
from homeassistant.setup import async_setup_component
from pytest_homeassistant_custom_component.common import MockConfigEntry
from test_energy_invoice_parser import minimal_pdf

from custom_components.homebrain.const import DOMAIN
from custom_components.homebrain.energy.invoices.api import invoice_dir

FIXTURE = Path(__file__).parent / "fixtures" / "energy_invoices" / "cez_synthetic.txt"
SYNTHETIC = FIXTURE.read_text(encoding="utf-8")


@pytest.fixture
async def setup(hass: HomeAssistant, hass_admin_user):
    entry = MockConfigEntry(
        domain=DOMAIN,
        data={},
        options={
            "bindings": {
                "energy": {
                    "energy_tariff_price_vt": "input_number.demo_price_vt",
                    "energy_tariff_price_nt": "input_number.demo_price_nt",
                    "energy_tariff_fixed_monthly": "input_number.demo_fixed",
                }
            }
        },
    )
    entry.add_to_hass(hass)
    assert await async_setup_component(hass, DOMAIN, {})
    await hass.async_block_till_done()
    hass.states.async_set("input_number.demo_price_vt", "4.5")
    hass.states.async_set("input_number.demo_price_nt", "3.92")
    hass.states.async_set("input_number.demo_fixed", "802.07")
    return entry


def _form(data: bytes, name: str = "faktura.pdf") -> FormData:
    form = FormData()
    form.add_field("file", data, filename=name, content_type="application/octet-stream")
    return form


async def _upload(hass, hass_client, data: bytes):
    client = await hass_client()
    return await client.post("/api/homebrain/energy/invoices", data=_form(data))


async def test_upload_parses_pdf_stores_privately_and_lists(
    hass: HomeAssistant, setup, hass_client, hass_ws_client, monkeypatch
):
    monkeypatch.setattr(
        "custom_components.homebrain.energy.invoices.api.pdf_text", lambda data: SYNTHETIC
    )
    resp = await _upload(hass, hass_client, minimal_pdf(["x"]))
    assert resp.status == 201
    record = await resp.json()
    assert record["parser"] == "cez_prodej" and record["status"] == "draft"
    assert record["fields"]["total_incl_vat"] == 3265.05
    assert "file" not in record
    stored = invoice_dir(hass.config.config_dir) / f"{record['id']}.pdf"
    assert stored.is_file() and "www" not in stored.parts
    assert stored.stat().st_mode & 0o077 == 0

    ws = await hass_ws_client(hass)
    await ws.send_json_auto_id({"type": "homebrain/energy/invoices/list"})
    reply = await ws.receive_json()
    assert reply["success"]
    assert [r["id"] for r in reply["result"]["invoices"]] == [record["id"]]
    assert reply["result"]["can_edit"] is True
    assert reply["result"]["tariff"]["values"] == {"vt": 4.5, "nt": 3.92, "fixed_monthly": 802.07}

    # tariff check without recorder statistics (no energy series bound)
    await ws.send_json_auto_id(
        {"type": "homebrain/energy/invoices/compare", "invoice_id": record["id"]}
    )
    reply = await ws.receive_json()
    assert reply["result"]["status"] == "unconfigured"
    assert reply["result"]["tariff"]["mismatch"] is True
    assert reply["result"]["tariff"]["items"]["vt"]["invoice"] == 4.83
    assert reply["result"]["tariff"]["entities"]["vt"] == "input_number.demo_price_vt"

    fields = {**record["fields"], "total_incl_vat": "3 300,00"}
    await ws.send_json_auto_id(
        {"type": "homebrain/energy/invoices/save", "invoice_id": record["id"], "fields": fields}
    )
    reply = await ws.receive_json()
    assert reply["success"] and reply["result"]["status"] == "confirmed"
    assert reply["result"]["fields"]["total_incl_vat"] == 3300.0

    await ws.send_json_auto_id(
        {"type": "homebrain/energy/invoices/delete", "invoice_id": record["id"]}
    )
    assert (await ws.receive_json())["success"]
    assert not stored.exists()


async def test_photo_is_stored_for_the_manual_form(hass: HomeAssistant, setup, hass_client):
    resp = await _upload(hass, hass_client, b"\xff\xd8\xff\xe0" + b"0" * 64)
    assert resp.status == 201
    record = await resp.json()
    assert record["kind"] == "image" and record["warnings"] == ["image_manual"]
    assert "period" in record["missing"]


async def test_rejects_unknown_types_and_oversize(hass: HomeAssistant, setup, hass_client):
    assert (await _upload(hass, hass_client, b"hello")).status == 415
    big = b"%PDF-1.4\n" + b"0" * (5 * 1024 * 1024 + 10)
    assert (await _upload(hass, hass_client, big)).status == 413


async def test_scanned_pdf_without_text_layer_falls_back_to_manual(
    hass: HomeAssistant, setup, hass_client
):
    resp = await _upload(hass, hass_client, minimal_pdf([]))
    assert resp.status == 201
    record = await resp.json()
    assert record["parser"] == "generic" and record["warnings"] == ["no_text_layer"]


@pytest.mark.parametrize("role", ["adult", "kiosk", None])
async def test_non_admin_cannot_upload_or_edit(
    hass: HomeAssistant, setup, hass_client, hass_ws_client, hass_admin_user, role
):
    hass_admin_user.groups = []
    if role:
        hass.config_entries.async_update_entry(
            setup, options={**setup.options, "roles": {hass_admin_user.id: role}}
        )
    resp = await _upload(hass, hass_client, minimal_pdf(["x"]))
    assert resp.status == 403
    client = await hass_client()
    assert (await client.get("/api/homebrain/energy/invoices/0123456789abcdef/file")).status == 403
    ws = await hass_ws_client(hass)
    await ws.send_json_auto_id(
        {"type": "homebrain/energy/invoices/save", "invoice_id": "x", "fields": {}}
    )
    assert (await ws.receive_json())["error"]["code"] == "unauthorized"
    await ws.send_json_auto_id({"type": "homebrain/energy/invoices/list"})
    reply = await ws.receive_json()
    if role == "adult":  # adults read the summary
        assert reply["success"] and reply["result"]["can_edit"] is False
    else:
        assert reply["error"]["code"] == "unauthorized"


async def test_anonymous_upload_is_401(hass: HomeAssistant, setup, hass_client_no_auth):
    client = await hass_client_no_auth()
    resp = await client.post("/api/homebrain/energy/invoices", data=_form(b"%PDF-1.4"))
    assert resp.status == 401
