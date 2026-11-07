"""Energie invoices: ČEZ Prodej parser, generic fallback, PDF text and comparison math."""

import json
import os
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

import pytest

from custom_components.homebrain.energy.compare import Tariff
from custom_components.homebrain.energy.invoices.compare import (
    compare_invoice,
    estimate_cost,
    tariff_check,
)
from custom_components.homebrain.energy.invoices.parser import (
    InvoiceError,
    parse_invoice_text,
    pdf_text,
    sanitize_fields,
)

FIXTURES = Path(__file__).parent / "fixtures" / "energy_invoices"
PRAGUE = ZoneInfo("Europe/Prague")


def synthetic_text() -> str:
    return (FIXTURES / "cez_synthetic.txt").read_text(encoding="utf-8")


def minimal_pdf(lines: list[str]) -> bytes:
    """Tiny one-page PDF (Courier, ASCII) with one text line per row – no extra deps."""
    rows = []
    y = 800
    for line in lines:
        safe = line.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
        rows.append(f"BT /F1 6 Tf 20 {y} Td ({safe}) Tj ET")
        y -= 9
    stream = "\n".join(rows).encode("latin-1")
    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 1191 842] "
        b"/Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>",
        b"<< /Length " + str(len(stream)).encode() + b" >>\nstream\n" + stream + b"\nendstream",
    ]
    out = b"%PDF-1.4\n"
    offsets = []
    for i, body in enumerate(objects, 1):
        offsets.append(len(out))
        out += f"{i} 0 obj\n".encode() + body + b"\nendobj\n"
    xref = len(out)
    out += f"xref\n0 {len(objects) + 1}\n0000000000 65535 f \n".encode()
    out += "".join(f"{o:010d} 00000 n \n" for o in offsets).encode()
    out += f"trailer << /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF".encode()
    return out


def test_cez_parser_reads_every_field_of_the_synthetic_invoice():
    res = parse_invoice_text(synthetic_text())
    f = res["fields"]
    assert res["parser"] == "cez_prodej"
    assert res["missing"] == []
    assert f["supplier"] == "ČEZ Prodej"
    assert f["distributor"] == "EG.D"
    assert f["rate"] == "D45D"
    assert f["breaker"] == "3x25A"
    assert f["product"] == "Elektřina - klesající na 2 roky"
    assert f["period"] == ["2026-09-01", "2026-09-30"]
    assert f["issued"] == "2026-10-06"
    assert f["due"] == "2026-10-20"
    assert f["meter"] == {"vt": [10000, 10120], "nt": [50000, 50480]}
    assert f["kwh"] == {"vt": 120, "nt": 480, "total": 600}
    assert f["commodity_czk_per_mwh_excl_vat"] == {"vt": 3000.0, "nt": 2800.0}
    assert f["fixed_monthly_excl_vat"] == {
        "stala_platba": 150.0,
        "jistic": 500.0,
        "nesitova_infrastruktura": 12.87,
    }
    assert f["distribution_czk_per_mwh_excl_vat"] == {
        "vt": 800.0,
        "nt": 250.0,
        "systemove_sluzby": 164.24,
        "dan": 28.3,
    }
    assert f["poze_czk_per_month_excl_vat"] == 0.0
    assert f["poze_waived_czk"] == 400.0
    assert f["total_excl_vat"] == 2698.39
    assert f["vat"] == 566.66
    assert f["vat_rate"] == 21
    assert f["total_incl_vat"] == 3265.05
    assert f["avg_incl_vat"] == {"vt": 4.83, "nt": 3.92}
    assert f["fixed_monthly_incl_vat"] == 802.07
    assert f["history"] == [
        {"month": "2026-08", "vt": 100, "nt": 400, "total": 500, "czk": 2783.0},
        {"month": "2026-07", "vt": 90, "nt": 380, "total": 470, "czk": 2662.0},
    ]
    assert f["contract_end"] == "2027-01-31"
    assert all(res["confidence"][k] == "high" for k in res["confidence"])


def test_parser_never_keeps_personal_identifiers():
    dumped = json.dumps(parse_invoice_text(synthetic_text()), ensure_ascii=False)
    for ident in ("0011112222", "5550001111", "9990001111", "859182400000000017", "10000001 "):
        assert ident not in dumped
    assert "Ukázková" not in dumped and "Vzorová" not in dumped and "example.com" not in dumped


def test_avg_prices_fall_back_to_the_payment_overview():
    text = synthetic_text().replace("Vaše průměrná cena za 1 kWh", "Cena")
    f = parse_invoice_text(text)["fields"]
    assert f["avg_incl_vat"] == {"vt": 4.83, "nt": 3.92}  # 579.72/120, 1883.27/480


def test_unknown_supplier_uses_generic_extraction_with_low_confidence():
    text = (
        "Faktura za dodávku elektřiny\n"
        "Zúčtovací období: 1. 3. 2026 – 31. 3. 2026\n"
        "Spotřeba celkem 412,5 kWh\n"
        "Celkem bez DPH 1 900,00 Kč\n"
        "Celkem k úhradě s DPH 2 299,00 Kč\n"
    )
    res = parse_invoice_text(text)
    assert res["parser"] == "generic"
    f = res["fields"]
    assert f["period"] == ["2026-03-01", "2026-03-31"]
    assert f["kwh"]["total"] == 412.5
    assert f["total_incl_vat"] == 2299.0
    assert f["total_excl_vat"] == 1900.0
    assert res["confidence"]["period"] == "low"
    assert "avg_incl_vat" in res["missing"]


def test_empty_text_is_all_missing():
    res = parse_invoice_text("")
    assert res["parser"] == "generic"
    assert "period" in res["missing"] and "total_incl_vat" in res["missing"]


def test_pdf_text_reads_a_real_pdf_and_rejects_garbage():
    pdf = minimal_pdf(["Zuctovaci obdobi: 1. 3. 2026 - 31. 3. 2026", "Celkem s DPH 2 299,00 Kc"])
    text = pdf_text(pdf)
    assert "1. 3. 2026" in text
    assert parse_invoice_text(text)["fields"]["total_incl_vat"] == 2299.0
    with pytest.raises(InvoiceError):
        pdf_text(b"not a pdf")
    with pytest.raises(InvoiceError):
        pdf_text(b"%PDF-1.4 broken")


def test_sanitize_fields_keeps_known_keys_and_numbers_only():
    clean = sanitize_fields(
        {
            "period": ["2026-09-01", "2026-09-30"],
            "kwh": {"vt": "120", "nt": 480, "total": None, "bogus": 1},
            "total_incl_vat": "3 265,05",
            "evil": "x",
            "rate": "D45D<script>",
        }
    )
    assert clean["period"] == ["2026-09-01", "2026-09-30"]
    assert clean["kwh"] == {"vt": 120.0, "nt": 480.0, "total": None}
    assert clean["total_incl_vat"] == 3265.05
    assert "evil" not in clean
    assert clean["rate"] == "D45Dscript"
    with pytest.raises(InvoiceError):
        sanitize_fields({"period": ["2026-13-01", "x"]})


def hourly(start: datetime, end: datetime, kwh: float) -> list[tuple[float, float]]:
    out, t = [], start
    while t < end:
        out.append((t.timestamp(), kwh))
        t += timedelta(hours=1)
    return out


def test_estimate_cost_uses_hdo_split_and_prorated_fee():
    start = datetime(2026, 9, 1, tzinfo=PRAGUE)
    end = datetime(2026, 10, 1, tzinfo=PRAGUE)
    rows = hourly(start, end, 1.0)
    tariff = Tariff(vt=5.0, nt=4.0, fixed_monthly=900.0, schedule=[(0, 360)])
    # 30 days × (6 NT h × 4 + 18 VT h × 5) + one full month fee
    assert estimate_cost(rows, start, end, PRAGUE, tariff) == pytest.approx(30 * (24 + 90) + 900)
    assert estimate_cost(rows[48:], start, end, PRAGUE, tariff) is None  # not covered
    assert estimate_cost(rows, start, end, PRAGUE, Tariff(None, None, None, None)) is None


def test_compare_invoice_without_import_explains_and_uses_invoice_kwh():
    fields = parse_invoice_text(synthetic_text())["fields"]
    res = compare_invoice(
        fields,
        sums={"import": None, "house": 900.0, "pv": 420.0, "export": None},
        firsts={"import": "2026-11-01"},
        estimate=None,
    )
    assert res["grid"] == {
        "invoice": 600.0,
        "measured": None,
        "diff": None,
        "pct": None,
        "status": "missing",
        "measured_since": "2026-11-01",
    }
    assert res["self_consumption"] == {"kwh": 300.0, "basis": "house_minus_invoice"}
    assert res["house"] == 900.0 and res["pv"] == 420.0
    assert res["cost"] == {"invoice": 3265.05, "estimate": None, "diff": None, "pct": None}


def test_compare_invoice_with_import_flags_differences():
    fields = parse_invoice_text(synthetic_text())["fields"]
    ok = compare_invoice(fields, {"import": 606.0, "house": 900.0}, {}, estimate=3200.0)
    assert ok["grid"]["status"] == "ok" and ok["grid"]["pct"] == 1.0
    assert ok["self_consumption"] == {"kwh": 294.0, "basis": "house_minus_import"}
    assert ok["cost"] == {"invoice": 3265.05, "estimate": 3200.0, "diff": -65.05, "pct": -2.0}
    off = compare_invoice(fields, {"import": 660.0}, {}, estimate=None)
    assert off["grid"]["status"] == "diff" and off["grid"]["pct"] == 10.0


def test_tariff_check_detects_mismatch():
    fields = parse_invoice_text(synthetic_text())["fields"]
    same = tariff_check(fields, {"vt": 4.83, "nt": 3.92, "fixed_monthly": 802.07})
    assert same["mismatch"] is False
    diff = tariff_check(fields, {"vt": 4.5, "nt": 3.92, "fixed_monthly": None})
    assert diff["mismatch"] is True
    assert diff["items"]["vt"] == {"invoice": 4.83, "current": 4.5, "differs": True}
    assert diff["items"]["fixed_monthly"] == {"invoice": 802.07, "current": None, "differs": True}
    assert diff["items"]["nt"]["differs"] is False


REAL = Path(os.environ.get("HB_REAL_INVOICE_DIR", "/nonexistent"))


@pytest.mark.skipif(not (REAL / "faktura-2026-11.pdf").is_file(), reason="owner-only sample")
def test_real_invoice_matches_ground_truth():  # pragma: no cover - local only, never in CI
    truth = json.loads((REAL / "faktura-2026-11.json").read_text(encoding="utf-8"))
    res = parse_invoice_text(pdf_text((REAL / "faktura-2026-11.pdf").read_bytes()))
    f = res["fields"]
    assert res["parser"] == "cez_prodej" and res["missing"] == []
    for key, value in truth.items():
        if key == "contract":
            assert f["contract_end"] == "2027-03-04"
            continue
        assert f[key] == value, key
