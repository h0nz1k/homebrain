"""Parse owner-provided CSV/JSON exports into validated wine records (no PII stored)."""

from __future__ import annotations

import base64
import binascii
import csv
import hashlib
import io
import json
from datetime import date
from typing import Any

from .domain import WineError, validate_fields, validate_quantity
from .importers import znovin
from .store import WineStore, fold

MAX_IMPORT_BYTES = 2_000_000
MAX_IMPORT_ROWS = 5000

_COLOR_ALIASES = {
    "bile": "white",
    "bila": "white",
    "white": "white",
    "cervene": "red",
    "cervena": "red",
    "red": "red",
    "ruzove": "rose",
    "ruzova": "rose",
    "rose": "rose",
    "oranzove": "orange",
    "oranzova": "orange",
    "orange": "orange",
    "jine": "other",
    "other": "other",
}
_TYPE_ALIASES = {
    "": "still",
    "tiche": "still",
    "still": "still",
    "sumive": "sparkling",
    "sparkling": "sparkling",
    "perlive": "semi_sparkling",
    "semi_sparkling": "semi_sparkling",
    "jine": "other",
    "other": "other",
}
_CSV_ALIASES = {
    "nazev": "name",
    "vyrobce": "producer",
    "vinarstvi": "producer",
    "rocnik": "vintage",
    "typ": "wineType",
    "barva": "color",
    "odruda": "grapeVarieties",
    "odrudy": "grapeVarieties",
    "zeme": "country",
    "oblast": "region",
    "sladkost": "sweetness",
    "obsahcukru": "sweetness",
    "zbytkovycukr": "residualSugarGl",
    "cukr": "residualSugarGl",
    "kyseliny": "acidsGl",
    "objem": "volumeMl",
    "alkohol": "alcoholPct",
    "mnozstvi": "quantity",
    "pocet": "quantity",
    "zona": "zone",
    "police": "shelf",
    "pozice": "position",
    "hodnoceni": "personalRating",
    "poznamka": "personalNote",
    "porizeno": "acquiredOn",
    "cena": "purchasePrice",
    "pitiod": "drinkFrom",
    "pitido": "drinkTo",
}
# Fields never imported (runtime identity, order/PII-adjacent data).
_DROP = {"id", "createdAt", "updatedAt", "quantity", "status", "confidence"}


def _num(value: str, cast):
    value = value.strip().replace(",", ".") if isinstance(value, str) else value
    if value in ("", None):
        return None
    try:
        result = cast(float(value)) if cast is int else cast(value)
    except ValueError as err:
        raise WineError("INVALID_FIELD", "number") from err
    if cast is int and float(value) != result:
        raise WineError("INVALID_FIELD", "number")
    return result


def _from_csv_row(row: dict[str, str]) -> dict[str, Any]:
    clean = {}
    for key, value in row.items():
        if key is None:
            continue
        name = _CSV_ALIASES.get(fold(key).replace(" ", "").replace("_", ""), key.strip())
        clean[name] = (value or "").strip()
    color = _COLOR_ALIASES.get(fold(clean.get("color", "")))
    wine_type = _TYPE_ALIASES.get(fold(clean.get("wineType", "")))
    grapes = [g.strip() for g in clean.get("grapeVarieties", "").replace("|", ";").split(";")]
    zone = clean.get("zone") or None
    record: dict[str, Any] = {
        "name": clean.get("name"),
        "producer": clean.get("producer"),
        "vintage": _num(clean.get("vintage", ""), int),
        "wineType": wine_type or clean.get("wineType"),
        "color": color or clean.get("color"),
        "grapeVarieties": [g for g in grapes if g],
        "country": clean.get("country") or None,
        "region": clean.get("region") or None,
        "sweetness": clean.get("sweetness") or None,
        "residualSugarGl": _num(clean.get("residualSugarGl", "").removesuffix("g/l"), float),
        "acidsGl": _num(clean.get("acidsGl", "").removesuffix("g/l"), float),
        "volumeMl": _num(clean.get("volumeMl", ""), int) or 750,
        "alcoholPct": _num(clean.get("alcoholPct", ""), float),
        "location": (
            {
                "zone": zone,
                "shelf": clean.get("shelf") or None,
                "position": clean.get("position") or None,
            }
            if zone
            else None
        ),
        "acquiredOn": clean.get("acquiredOn") or None,
        "purchasePrice": _num(clean.get("purchasePrice", ""), float),
        "personalRating": _num(clean.get("personalRating", ""), float),
        "personalNote": clean.get("personalNote") or None,
        "quantity": _num(clean.get("quantity", ""), int) or 0,
    }
    drink_from = _num(clean.get("drinkFrom", ""), int)
    drink_to = _num(clean.get("drinkTo", ""), int)
    if drink_from or drink_to:
        record["drinkWindow"] = {"from": drink_from, "to": drink_to}
    if clean.get("externalProductId"):
        record["source"] = {
            "provider": "order-import",
            "externalProductId": clean["externalProductId"],
        }
    return record


def parse_import(content: str, fmt: str) -> list[dict[str, Any]]:
    """Return raw records (dicts) from CSV or JSON text."""
    if len(content.encode()) > MAX_IMPORT_BYTES:
        raise WineError("IMPORT_TOO_LARGE")
    if fmt == "json":
        try:
            data = json.loads(content)
        except json.JSONDecodeError as err:
            raise WineError("IMPORT_PARSE_ERROR") from err
        if isinstance(data, dict):
            data = data.get("wines", data.get("items"))
        if not isinstance(data, list) or not all(isinstance(i, dict) for i in data):
            raise WineError("IMPORT_PARSE_ERROR")
        rows = data
    elif fmt == "csv":
        sample = content[:4096]
        try:
            dialect = csv.Sniffer().sniff(sample, delimiters=",;\t")
        except csv.Error:
            dialect = csv.excel
        rows = []
        for row in csv.DictReader(io.StringIO(content), dialect=dialect):
            try:
                rows.append(_from_csv_row(row))
            except WineError as err:
                rows.append({"__error__": err})
    else:
        raise WineError("INVALID_FIELD", "format")
    if len(rows) > MAX_IMPORT_ROWS:
        raise WineError("IMPORT_TOO_LARGE")
    return rows


def _identity(fields: dict[str, Any]) -> tuple:
    ext = (fields.get("source") or {}).get("externalProductId")
    if ext:
        return ("ext", ext)
    return (
        "key",
        fold(fields["name"]),
        fold(fields["producer"]),
        fields.get("vintage"),
        fields.get("volumeMl"),
    )


def run_import(
    store: WineStore, content: str, fmt: str, dry_run: bool, actor: dict[str, Any] | None
) -> dict[str, Any]:
    """Plan (dry_run) or apply an import. Idempotent per file content + row."""
    rows = parse_import(content, fmt)
    digest = hashlib.sha256(content.encode()).hexdigest()[:16]
    existing = {_identity(w): w for w in store.list({"sort": "id"})}
    plan: list[dict[str, Any]] = []
    errors: list[dict[str, Any]] = []
    for index, raw in enumerate(rows, start=1):
        if "__error__" in raw:
            err = raw["__error__"]
            errors.append({"row": index, "code": err.code, "field": err.field})
            continue
        payload = {k: v for k, v in raw.items() if k not in _DROP}
        payload.setdefault("source", {"provider": "order-import"})
        if isinstance(payload["source"], dict):
            payload["source"] = {**payload["source"], "provider": "order-import"}
        try:
            fields = validate_fields(payload, partial=False)
            quantity = validate_quantity(raw.get("quantity", 0))
        except WineError as err:
            errors.append({"row": index, "code": err.code, "field": err.field})
            continue
        op_id = f"import:{digest}:{index}"
        match = existing.get(_identity(fields))
        if store.operation_exists(op_id):
            action = "already_imported"
        elif match is not None:
            action = "stock_in" if quantity > 0 else "skip"
        else:
            action = "create"
        plan.append(
            {
                "row": index,
                "action": action,
                "name": fields["name"],
                "vintage": fields["vintage"],
                "quantity": quantity,
                "wineId": match["id"] if match else None,
                "_payload": (payload, quantity),
                "_op": op_id,
            }
        )
        if action == "create":
            existing[_identity(fields)] = {"id": None}
    if not dry_run:
        for item in plan:
            payload, quantity = item["_payload"]
            if item["action"] == "create":
                result = store.create(
                    {**payload, "quantity": quantity},
                    item["_op"],
                    actor,
                    reason="Import",
                    operation_label="import",
                )
                item["wineId"] = result["wine"]["id"]
            elif item["action"] == "stock_in":
                store.stock_in(item["wineId"], quantity, "Import", item["_op"], actor)
            if item["action"] in ("create", "stock_in") and quantity > 0:
                _add_lot(
                    store,
                    item["wineId"],
                    item["_op"],
                    payload.get("purchasePrice"),
                    quantity,
                    payload.get("acquiredOn") or date.today().isoformat(),
                )
    summary: dict[str, int] = {}
    for item in plan:
        summary[item["action"]] = summary.get(item["action"], 0) + 1
        item.pop("_payload")
        item.pop("_op")
    return {
        "dryRun": dry_run,
        "rows": len(rows),
        "summary": summary,
        "plan": plan,
        "errors": errors,
    }


def order_text(content: str, fmt: str) -> str:
    """Decode a pasted order text or a base64 PDF (bounded) into plain text."""
    if fmt == "text":
        if len(content) > znovin.MAX_TEXT_CHARS:
            raise WineError("IMPORT_TOO_LARGE")
        return content
    if len(content) > znovin.MAX_PDF_BYTES * 4 // 3 + 8:
        raise WineError("IMPORT_TOO_LARGE")
    try:
        data = base64.b64decode(content.split(",", 1)[-1], validate=True)
    except (binascii.Error, ValueError) as err:
        raise WineError("IMPORT_PARSE_ERROR", "pdf") from err
    return znovin.pdf_to_text(data)


def _order_payload(item: znovin.DraftLine, today: str) -> dict[str, Any]:
    return {
        "name": item.name[:200],
        "labelName": item.label_name,
        "predicate": item.predicate,
        "producer": znovin.PRODUCER,
        "vintage": item.vintage,
        "wineType": item.wine_type,
        "color": item.color,
        "grapeVarieties": [item.variety] if item.variety else [],
        "country": "Česká republika",
        "sweetness": item.sweetness,
        "volumeMl": round(item.volume_l * 1000),
        "purchasePrice": item.unit_price,
        "acquiredOn": today,
        "productLine": item.line,
        "source": {
            "provider": "order-import",
            "externalProductId": item.catalogue_code,
            "batch": item.batch,
        },
        "confidence": "inferred",
    }


def _order_match(
    wines: list[dict[str, Any]],
    code: str | None,
    batch: str | None,
    name: str,
    vintage: int | None,
) -> dict[str, Any] | None:
    """Wine identity: catalogue code (Z/K) + batch (when both known) + vintage, else
    name + vintage. The price is never part of the identity."""
    for wine in wines:
        src = wine.get("source") or {}
        if code:
            other = src.get("batch")
            if (
                src.get("externalProductId") == code
                and wine.get("vintage") == vintage
                and (not batch or not other or other == batch)
            ):
                return wine
        elif not src.get("externalProductId") and wine.get("vintage") == vintage:
            if fold(wine.get("name")) == fold(name):
                return wine
    return None


def _add_lot(
    store: WineStore,
    wine_id: str,
    op_id: str,
    unit_price: float | None,
    quantity: int,
    day: str,
    order_ref: str | None = None,
) -> None:
    """One purchase lot per imported line (same wine at another price = another lot)."""
    if isinstance(unit_price, bool) or not isinstance(unit_price, int | float):
        return
    store.add_price_point(
        wine_id,
        "purchase",
        unit_price,
        point_id=f"lot:{op_id}",
        observed_on=day,
        quantity=quantity,
        order_ref=order_ref,
    )


def run_order_import(
    store: WineStore,
    content: str,
    fmt: str,
    dry_run: bool,
    actor: dict[str, Any] | None,
) -> dict[str, Any]:
    """Znovín order (PDF/text): preview with arithmetic check, or apply idempotently.

    Wines are merged by catalogue code + vintage; every line becomes one stock-in with
    ``sourceOperationId = order:<fingerprint>:<line>`` so a repeated import is a no-op.
    """
    draft = znovin.parse_order_text(order_text(content, fmt))
    order = draft.public()
    if not draft.recognized:
        return {
            "dryRun": dry_run,
            "rows": 0,
            "summary": {},
            "plan": [],
            "errors": [{"row": 0, "code": "IMPORT_UNRECOGNISED"}],
            "order": order,
        }
    fingerprint = znovin.order_fingerprint(store.secret(), draft)
    already = store.order_imported(fingerprint)
    order["alreadyImported"] = already
    if not dry_run and not already and not draft.check_ok:
        raise WineError("IMPORT_CHECK_FAILED")
    known: list[dict[str, Any]] = store.list({"sort": "id"})
    today = date.today().isoformat()
    plan: list[dict[str, Any]] = []
    errors: list[dict[str, Any]] = []
    for item in draft.lines:
        if not item.quantity:
            errors.append({"row": item.index, "code": "INVALID_QUANTITY", "field": "quantity"})
            continue
        op_id = f"order:{fingerprint[:32]}:{item.index}"
        match = _order_match(known, item.catalogue_code, item.batch, item.name, item.vintage)
        if already or store.operation_exists(op_id):
            action = "already_imported"
        else:
            action = "stock_in" if match else "create"
        plan.append(
            {
                "row": item.index,
                "action": action,
                "name": item.name,
                "vintage": item.vintage,
                "quantity": item.quantity,
                "orderUnits": item.order_units,
                "packSize": item.pack_size,
                "packLabel": item.pack_label,
                "issues": list(item.issues),
                "wineId": match["id"] if match and match.get("id") else None,
                "catalogueCode": item.catalogue_code,
                "unitPrice": item.unit_price,
                "lineTotal": item.line_total,
                "_item": item,
                "_op": op_id,
                "_line": match.get("_line") if match else None,
            }
        )
        if action == "create":
            known.append(
                {
                    "id": None,
                    "name": item.name,
                    "vintage": item.vintage,
                    "source": {"externalProductId": item.catalogue_code, "batch": item.batch},
                    "_line": item.index,
                }
            )
    if not dry_run:
        created: dict[int, str] = {}
        for row in plan:
            item = row["_item"]
            if row["action"] == "create":
                result = store.create(
                    {**_order_payload(item, today), "quantity": item.quantity},
                    row["_op"],
                    actor,
                    reason="Import objednávky",
                    operation_label="order-import",
                )
                row["wineId"] = result["wine"]["id"]
                created[item.index] = result["wine"]["id"]
                _add_lot(
                    store,
                    row["wineId"],
                    row["_op"],
                    item.unit_price,
                    item.quantity,
                    today,
                    fingerprint[:8],
                )
            elif row["action"] == "stock_in":
                wine_id = row["wineId"] or created[row["_line"]]
                store.stock_in(wine_id, item.quantity, "Import objednávky", row["_op"], actor)
                row["wineId"] = wine_id
                if item.unit_price is not None:
                    store.update(wine_id, {"purchasePrice": item.unit_price})
                _add_lot(
                    store,
                    wine_id,
                    row["_op"],
                    item.unit_price,
                    item.quantity,
                    today,
                    fingerprint[:8],
                )
        if not already:
            store.record_order(
                fingerprint,
                draft.vendor or "znovin",
                len(draft.lines),
                draft.bottles(),
                draft.order_total,
            )
    summary: dict[str, int] = {}
    for row in plan:
        summary[row["action"]] = summary.get(row["action"], 0) + 1
        row.pop("_item")
        row.pop("_op")
        row.pop("_line")
    return {
        "dryRun": dry_run,
        "rows": len(draft.lines),
        "summary": summary,
        "plan": plan,
        "errors": errors,
        "order": order,
    }
