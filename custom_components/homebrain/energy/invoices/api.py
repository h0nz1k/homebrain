"""Energie invoices: private file store, HTTP upload view and WS commands.

Files live under ``<config>/homebrain/invoices/<id>.<ext>`` (never ``www``), the index in the HA
Store ``homebrain.energy_invoices``. Upload/edit/delete: HA admins only. Adults (Energie detail
role) read the list and the comparison; kiosk and other roles get nothing.
"""

from __future__ import annotations

import secrets
from collections.abc import Callable
from datetime import datetime, timedelta
from functools import wraps
from http import HTTPStatus
from pathlib import Path
from typing import Any, Final

import voluptuous as vol
from aiohttp import web
from homeassistant.components import websocket_api
from homeassistant.components.http import HomeAssistantView
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import Unauthorized
from homeassistant.helpers.storage import Store
from homeassistant.util import dt as dt_util

from ...bindings import get_bindings
from ...const import DOMAIN
from ...roles import ENERGY_DETAIL_ROLES, entry_roles, resolve_role
from ..compare import _Series, statistic_ids
from .compare import compare_invoice, estimate_cost, tariff_check
from .parser import MAX_PDF_BYTES, InvoiceError, parse_invoice_text, pdf_text, sanitize_fields

UPLOAD_URL: Final = "/api/homebrain/energy/invoices"
FILE_URL: Final = "/api/homebrain/energy/invoices/{invoice_id}/file"
STORE_KEY: Final = "homebrain.energy_invoices"
MAX_INVOICES: Final = 120
IMAGE_MAGIC: Final = {
    b"\xff\xd8\xff": ("jpg", "image/jpeg"),
    b"\x89PNG\r\n\x1a\n": ("png", "image/png"),
}
DATA_KEY: Final = "energy_invoices"


def invoice_dir(config_dir: str) -> Path:
    return Path(config_dir) / "homebrain" / "invoices"


def _sniff(data: bytes) -> tuple[str, str, str] | None:
    """(kind, ext, mime) from magic bytes; never trust the client's filename/type."""
    if data.startswith(b"%PDF"):
        return "pdf", "pdf", "application/pdf"
    for magic, (ext, mime) in IMAGE_MAGIC.items():
        if data.startswith(magic):
            return "image", ext, mime
    if data[4:12] in (b"ftypheic", b"ftypheix", b"ftypmif1") or (
        data.startswith(b"RIFF") and data[8:12] == b"WEBP"
    ):
        ext = "webp" if data.startswith(b"RIFF") else "heic"
        return "image", ext, f"image/{ext}"
    return None


def _is_id(value: str) -> bool:
    return len(value) == 16 and all(c in "0123456789abcdef" for c in value)


class InvoiceStore:
    """Invoice index (HA Store) + files on disk."""

    def __init__(self, hass: HomeAssistant) -> None:
        self.hass = hass
        self._store: Store[dict[str, Any]] = Store(hass, 1, STORE_KEY, private=True)
        self._data: dict[str, Any] | None = None

    async def _load(self) -> dict[str, Any]:
        if self._data is None:
            self._data = await self._store.async_load() or {"invoices": []}
        return self._data

    async def async_list(self) -> list[dict[str, Any]]:
        data = await self._load()
        return sorted(
            data["invoices"],
            key=lambda r: ((r.get("fields") or {}).get("period") or [""])[0] or "",
            reverse=True,
        )

    async def async_get(self, invoice_id: str) -> dict[str, Any] | None:
        return next((r for r in (await self._load())["invoices"] if r["id"] == invoice_id), None)

    async def async_add(self, data: bytes) -> dict[str, Any]:
        sniff = _sniff(data)
        if sniff is None:
            raise InvoiceError("unsupported_type")
        kind, ext, mime = sniff
        index = await self._load()
        if len(index["invoices"]) >= MAX_INVOICES:
            raise InvoiceError("too_many")
        if kind == "pdf":
            text = await self.hass.async_add_executor_job(pdf_text, data)
            parsed = parse_invoice_text(text)
            if not text.strip():
                parsed["warnings"] = ["no_text_layer"]
        else:
            parsed = parse_invoice_text("")
            parsed["warnings"] = ["image_manual"]
        invoice_id = secrets.token_hex(8)
        path = invoice_dir(self.hass.config.config_dir) / f"{invoice_id}.{ext}"
        await self.hass.async_add_executor_job(_write_private, path, data)
        record = {
            "id": invoice_id,
            "uploaded_at": dt_util.utcnow().isoformat(),
            "kind": kind,
            "mime": mime,
            "size": len(data),
            "file": path.name,
            "status": "draft",
            "parser": parsed["parser"],
            "fields": parsed["fields"],
            "confidence": parsed["confidence"],
            "missing": parsed["missing"],
            "warnings": parsed.get("warnings", []),
        }
        index["invoices"].append(record)
        await self._store.async_save(index)
        return record

    async def async_save(self, invoice_id: str, fields: dict[str, Any]) -> dict[str, Any]:
        record = await self.async_get(invoice_id)
        if record is None:
            raise InvoiceError("not_found")
        record["fields"] = sanitize_fields(fields)
        record["status"] = "confirmed"
        record["updated_at"] = dt_util.utcnow().isoformat()
        await self._store.async_save(await self._load())
        return record

    async def async_delete(self, invoice_id: str) -> bool:
        data = await self._load()
        record = await self.async_get(invoice_id)
        if record is None:
            return False
        data["invoices"].remove(record)
        await self._store.async_save(data)
        path = invoice_dir(self.hass.config.config_dir) / record["file"]
        await self.hass.async_add_executor_job(lambda: path.unlink(missing_ok=True))
        return True


def _write_private(path: Path, data: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    path.write_bytes(data)
    path.chmod(0o600)


def get_store(hass: HomeAssistant) -> InvoiceStore:
    data = hass.data.setdefault(DOMAIN, {})
    if DATA_KEY not in data:
        data[DATA_KEY] = InvoiceStore(hass)
    return data[DATA_KEY]


def public(record: dict[str, Any]) -> dict[str, Any]:
    """Record without the on-disk file name."""
    return {k: v for k, v in record.items() if k != "file"}


class InvoiceUploadView(HomeAssistantView):
    """``POST`` multipart ``file`` (PDF with a text layer, or a photo/scan); admin only."""

    url = UPLOAD_URL
    name = "api:homebrain:energy:invoices"
    requires_auth = True

    async def post(self, request: web.Request) -> web.Response:
        hass: HomeAssistant = request.app["hass"]
        user = request.get("hass_user")
        if user is None or not user.is_admin:
            return self.json_message("admin only", HTTPStatus.FORBIDDEN)
        if (request.content_length or 0) > MAX_PDF_BYTES + 64 * 1024:
            return self.json_message("too_large", HTTPStatus.REQUEST_ENTITY_TOO_LARGE)
        try:
            reader = await request.multipart()
            part = await reader.next()
            while part is not None and getattr(part, "name", None) != "file":
                part = await reader.next()
            if part is None:
                return self.json_message("missing_file", HTTPStatus.BAD_REQUEST)
            data = bytearray()
            while chunk := await part.read_chunk(64 * 1024):  # type: ignore[union-attr]
                data.extend(chunk)
                if len(data) > MAX_PDF_BYTES:
                    return self.json_message("too_large", HTTPStatus.REQUEST_ENTITY_TOO_LARGE)
        except (ValueError, AssertionError, KeyError):
            return self.json_message("bad_request", HTTPStatus.BAD_REQUEST)
        try:
            record = await get_store(hass).async_add(bytes(data))
        except InvoiceError as err:
            status = (
                HTTPStatus.UNSUPPORTED_MEDIA_TYPE
                if err.code in ("unsupported_type", "not_pdf")
                else HTTPStatus.UNPROCESSABLE_ENTITY
            )
            return self.json_message(err.code, status)
        return self.json(public(record), HTTPStatus.CREATED)


class InvoiceFileView(HomeAssistantView):
    """The original upload (admin only, private cache headers)."""

    url = FILE_URL
    name = "api:homebrain:energy:invoices:file"
    requires_auth = True

    async def get(self, request: web.Request, invoice_id: str) -> web.StreamResponse:
        hass: HomeAssistant = request.app["hass"]
        user = request.get("hass_user")
        if user is None or not user.is_admin:
            return web.Response(status=HTTPStatus.FORBIDDEN)
        record = await get_store(hass).async_get(invoice_id) if _is_id(invoice_id) else None
        if record is None:
            return web.Response(status=HTTPStatus.NOT_FOUND)
        path = invoice_dir(hass.config.config_dir) / record["file"]
        if not await hass.async_add_executor_job(path.is_file):
            return web.Response(status=HTTPStatus.NOT_FOUND)
        return web.FileResponse(
            path,
            headers={
                "Content-Type": record["mime"],
                "Cache-Control": "private, no-store",
                "X-Content-Type-Options": "nosniff",
            },
        )


def _require_detail(func: Callable[..., Any]) -> Callable[..., Any]:
    @wraps(func)
    def with_role(hass: HomeAssistant, connection: Any, msg: dict[str, Any]) -> Any:
        role = resolve_role(connection.user, entry_roles(hass))
        if role != "owner" and role not in ENERGY_DETAIL_ROLES:
            raise Unauthorized
        return func(hass, connection, msg)

    return with_role


def _bindings(hass: HomeAssistant) -> dict[str, str]:
    entries = hass.config_entries.async_entries(DOMAIN)
    return get_bindings(entries[0]).get("energy", {}) if entries else {}


TARIFF_KEYS: Final = {
    "vt": "energy_tariff_price_vt",
    "nt": "energy_tariff_price_nt",
    "fixed_monthly": "energy_tariff_fixed_monthly",
}


def current_tariff(hass: HomeAssistant, bindings: dict[str, str]) -> dict[str, Any]:
    from ..ws import _number  # noqa: PLC0415 - avoid an import cycle at module load

    return {
        "values": {k: _number(hass, bindings.get(b)) for k, b in TARIFF_KEYS.items()},
        "entities": {k: bindings.get(b) or None for k, b in TARIFF_KEYS.items()},
    }


@websocket_api.websocket_command({vol.Required("type"): "homebrain/energy/invoices/list"})
@_require_detail
@websocket_api.async_response
async def ws_list(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    records = await get_store(hass).async_list()
    connection.send_result(
        msg["id"],
        {
            "invoices": [public(r) for r in records],
            "can_edit": bool(connection.user and connection.user.is_admin),
            "tariff": current_tariff(hass, _bindings(hass)),
        },
    )


@websocket_api.websocket_command(
    {
        vol.Required("type"): "homebrain/energy/invoices/save",
        vol.Required("invoice_id"): str,
        vol.Required("fields"): dict,
    }
)
@websocket_api.require_admin
@websocket_api.async_response
async def ws_save(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    try:
        record = await get_store(hass).async_save(msg["invoice_id"], msg["fields"])
    except InvoiceError as err:
        connection.send_error(msg["id"], err.code, err.code)
        return
    connection.send_result(msg["id"], public(record))


@websocket_api.websocket_command(
    {vol.Required("type"): "homebrain/energy/invoices/delete", vol.Required("invoice_id"): str}
)
@websocket_api.require_admin
@websocket_api.async_response
async def ws_delete(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    if not await get_store(hass).async_delete(msg["invoice_id"]):
        connection.send_error(msg["id"], "not_found", "invoice not found")
        return
    connection.send_result(msg["id"], {"deleted": msg["invoice_id"]})


@websocket_api.websocket_command(
    {vol.Required("type"): "homebrain/energy/invoices/compare", vol.Required("invoice_id"): str}
)
@_require_detail
@websocket_api.async_response
async def ws_compare(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    record = await get_store(hass).async_get(msg["invoice_id"])
    if record is None:
        connection.send_error(msg["id"], "not_found", "invoice not found")
        return
    fields = record["fields"]
    bindings = _bindings(hass)
    tariff_now = current_tariff(hass, bindings)
    result: dict[str, Any] = {
        "invoice_id": record["id"],
        "tariff": {**tariff_check(fields, tariff_now["values"]), **tariff_now},
    }
    period = fields.get("period")
    ids = statistic_ids(bindings)
    if not period or not ids or "recorder" not in hass.config.components:
        reason = "no_period" if not period else "unconfigured" if not ids else "unsupported"
        connection.send_result(msg["id"], {**result, "status": reason})
        return
    from ..ws import _hourly_rows, _tariff  # noqa: PLC0415 - shared recorder helpers

    tz = dt_util.get_time_zone(hass.config.time_zone) or dt_util.get_default_time_zone()
    start = datetime.fromisoformat(period[0]).replace(tzinfo=tz)
    end = datetime.fromisoformat(period[1]).replace(tzinfo=tz) + timedelta(days=1)
    rows = await _hourly_rows(hass, ids, dt_util.as_utc(start - timedelta(days=1)))
    sums: dict[str, float | None] = {}
    firsts: dict[str, str | None] = {}
    for key in ("import", "house", "pv", "export"):
        series = _Series(rows.get(key, []))
        sums[key] = series.sum(start, end) if key in rows else None
        firsts[key] = (
            datetime.fromtimestamp(series.first, tz).date().isoformat() if series.first else None
        )
    estimate = estimate_cost(rows.get("import", []), start, end, tz, _tariff(hass, bindings))
    result.update(compare_invoice(fields, sums, firsts, estimate))
    connection.send_result(msg["id"], {**result, "status": "ok"})


COMMANDS = (ws_list, ws_save, ws_delete, ws_compare)
VIEWS = (InvoiceUploadView, InvoiceFileView)
