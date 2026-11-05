"""SQLite wine inventory store (port of donor wine-persistence-sqlite schema v1).

All methods are blocking and must run in the executor (``hass.async_add_executor_job``).
"""

from __future__ import annotations

import json
import logging
import secrets
import sqlite3
import threading
import unicodedata
import uuid
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

from .domain import (
    IDEMPOTENT_REPLAY,
    INVALID_FIELD,
    NO_CHANGE,
    SCHEMA_TOO_NEW,
    TARGET_NOT_FOUND,
    WineError,
    evaluate_consume,
    validate_fields,
    validate_quantity,
)

_LOGGER = logging.getLogger(__name__)

# v1 is the donor schema 1:1; v2 adds drink window + append-only triggers.
MIGRATION_V1_SQL = """
CREATE TABLE schema_migrations (
  version INTEGER PRIMARY KEY NOT NULL,
  applied_at TEXT NOT NULL
);
CREATE TABLE wines (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  producer TEXT NOT NULL,
  vintage INTEGER NULL,
  wine_type TEXT NOT NULL CHECK (wine_type IN ('still', 'sparkling', 'semi_sparkling', 'other')),
  color TEXT NOT NULL CHECK (color IN ('white', 'red', 'rose', 'orange', 'other')),
  grape_varieties_json TEXT NOT NULL,
  country TEXT NULL,
  region TEXT NULL,
  sweetness TEXT NULL,
  volume_ml INTEGER NOT NULL,
  alcohol_pct REAL NULL,
  quantity INTEGER NOT NULL CHECK (quantity >= 0),
  location_json TEXT NULL,
  acquired_on TEXT NULL,
  purchase_price REAL NULL,
  personal_rating REAL NULL CHECK (
    personal_rating IS NULL OR (personal_rating >= 0 AND personal_rating <= 5)
  ),
  personal_note TEXT NULL,
  status TEXT NOT NULL CHECK (status IN ('in_stock', 'reserved', 'consumed', 'archived')),
  image_json TEXT NULL,
  source_json TEXT NOT NULL,
  confidence TEXT NOT NULL CHECK (confidence IN ('verified', 'matched', 'inferred', 'manual')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE inventory_events (
  event_id TEXT PRIMARY KEY NOT NULL,
  wine_id TEXT NOT NULL REFERENCES wines(id),
  operation TEXT NOT NULL CHECK (
    operation IN ('stock_in', 'consume', 'correction', 'reserve', 'release')
  ),
  quantity_delta INTEGER NOT NULL,
  reason TEXT NOT NULL,
  source_operation_id TEXT NOT NULL UNIQUE,
  occurred_at TEXT NOT NULL,
  actor_json TEXT NULL
);
CREATE TABLE consume_idempotency (
  source_operation_id TEXT PRIMARY KEY NOT NULL,
  event_id TEXT NOT NULL UNIQUE REFERENCES inventory_events(event_id),
  request_fingerprint_json TEXT NOT NULL,
  wine_snapshot_json TEXT NOT NULL
);
"""
MIGRATION_V2_SQL = """
ALTER TABLE wines ADD COLUMN drink_window_json TEXT NULL;
CREATE INDEX inventory_events_wine ON inventory_events(wine_id, occurred_at);
CREATE TRIGGER inventory_events_no_update BEFORE UPDATE ON inventory_events
BEGIN SELECT RAISE(ABORT, 'inventory_events is append-only'); END;
CREATE TRIGGER inventory_events_no_delete BEFORE DELETE ON inventory_events
BEGIN SELECT RAISE(ABORT, 'inventory_events is append-only'); END;
"""
# v3: Znovín import/enrichment – product line + description, per-install secret, order
# fingerprints (HMAC of the order number; the number itself is never stored).
MIGRATION_V3_SQL = """
ALTER TABLE wines ADD COLUMN product_line TEXT NULL;
ALTER TABLE wines ADD COLUMN description TEXT NULL;
CREATE TABLE wine_meta (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);
CREATE TABLE import_orders (
  fingerprint TEXT PRIMARY KEY NOT NULL,
  vendor TEXT NOT NULL,
  imported_at TEXT NOT NULL,
  item_count INTEGER NOT NULL,
  bottles INTEGER NOT NULL,
  order_total REAL NULL
);
"""
# v4: Znovín naming (H1 title + label name + predicate) and price history (purchase lots
# from imports, e-shop price snapshots). Price never distinguishes wines; it only lives here.
MIGRATION_V4_SQL = """
ALTER TABLE wines ADD COLUMN label_name TEXT NULL;
ALTER TABLE wines ADD COLUMN predicate TEXT NULL;
CREATE TABLE price_points (
  id TEXT PRIMARY KEY NOT NULL,
  wine_id TEXT NOT NULL REFERENCES wines(id),
  kind TEXT NOT NULL CHECK (kind IN ('purchase', 'shop')),
  observed_on TEXT NOT NULL,
  unit_price REAL NOT NULL CHECK (unit_price >= 0),
  quantity INTEGER NULL,
  order_ref TEXT NULL,
  regular_price REAL NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX price_points_wine ON price_points(wine_id, kind, observed_on);
INSERT INTO price_points
  (id, wine_id, kind, observed_on, unit_price, quantity, order_ref, regular_price, created_at)
SELECT 'lot:' || e.source_operation_id, e.wine_id, 'purchase', substr(e.occurred_at, 1, 10),
  w.purchase_price, e.quantity_delta,
  CASE WHEN e.source_operation_id LIKE 'order:%'
    THEN substr(e.source_operation_id, 7, 8) ELSE NULL END,
  NULL, e.occurred_at
FROM inventory_events e JOIN wines w ON w.id = e.wine_id
WHERE e.operation = 'stock_in' AND e.quantity_delta > 0 AND w.purchase_price IS NOT NULL
  AND (e.source_operation_id LIKE 'order:%' OR e.source_operation_id LIKE 'import:%');
"""
# v5: manual add + universal lookup (#81) – EAN/GTIN of the bottle (lookup key, optional).
MIGRATION_V5_SQL = """
ALTER TABLE wines ADD COLUMN ean TEXT NULL;
CREATE INDEX wines_ean ON wines(ean);
"""
# v6: voice write-off (WIN-014) – ambiguous requests waiting for confirmation.
MIGRATION_V6_SQL = """
CREATE TABLE voice_pending (
  id TEXT PRIMARY KEY NOT NULL,
  raw_text TEXT NOT NULL,
  normalized_query TEXT NOT NULL,
  vintage INTEGER NULL,
  quantity INTEGER NOT NULL CHECK (quantity >= 1),
  candidates_json TEXT NOT NULL,
  source_operation_id TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);
CREATE INDEX voice_pending_created ON voice_pending(created_at);
"""
# v7: legal sugar category (EU 2019/33 Annex III) – residual sugar and total acidity in g/l
# from the e-shop/label. Additive only: the category itself is derived on read in the panel,
# the raw label term stays in ``sweetness``. Reversible via ``downgrade(conn, 6)``.
MIGRATION_V7_SQL = """
ALTER TABLE wines ADD COLUMN residual_sugar_gl REAL NULL;
ALTER TABLE wines ADD COLUMN acids_gl REAL NULL;
"""
# Down migrations (newest first when stepping back). SQLite >= 3.35 has DROP COLUMN.
DOWNGRADES = {
    7: """
ALTER TABLE wines DROP COLUMN acids_gl;
ALTER TABLE wines DROP COLUMN residual_sugar_gl;
""",
}
MIGRATIONS = {
    1: MIGRATION_V1_SQL,
    2: MIGRATION_V2_SQL,
    3: MIGRATION_V3_SQL,
    4: MIGRATION_V4_SQL,
    5: MIGRATION_V5_SQL,
    6: MIGRATION_V6_SQL,
    7: MIGRATION_V7_SQL,
}
CURRENT_SCHEMA_VERSION = 7

_WINE_COLUMNS = (
    "id, name, producer, vintage, wine_type, color, grape_varieties_json, country, region, "
    "sweetness, volume_ml, alcohol_pct, quantity, location_json, acquired_on, purchase_price, "
    "personal_rating, personal_note, status, image_json, source_json, confidence, created_at, "
    "updated_at, drink_window_json, product_line, description, label_name, predicate, ean, "
    "residual_sugar_gl, acids_gl"
)
_PRICE_COLUMNS = (
    "id, wine_id, kind, observed_on, unit_price, quantity, order_ref, regular_price, created_at"
)
_EVENT_COLUMNS = (
    "event_id, wine_id, operation, quantity_delta, reason, source_operation_id, occurred_at, "
    "actor_json"
)
_FIELD_TO_COLUMN = {
    "name": "name",
    "producer": "producer",
    "vintage": "vintage",
    "wineType": "wine_type",
    "color": "color",
    "grapeVarieties": "grape_varieties_json",
    "country": "country",
    "region": "region",
    "sweetness": "sweetness",
    "volumeMl": "volume_ml",
    "alcoholPct": "alcohol_pct",
    "location": "location_json",
    "acquiredOn": "acquired_on",
    "purchasePrice": "purchase_price",
    "personalRating": "personal_rating",
    "personalNote": "personal_note",
    "status": "status",
    "image": "image_json",
    "source": "source_json",
    "confidence": "confidence",
    "drinkWindow": "drink_window_json",
    "productLine": "product_line",
    "description": "description",
    "labelName": "label_name",
    "predicate": "predicate",
    "ean": "ean",
    "residualSugarGl": "residual_sugar_gl",
    "acidsGl": "acids_gl",
}
_JSON_FIELDS = {"grapeVarieties", "location", "image", "source", "drinkWindow"}
SORTS = ("name", "rating", "vintage", "id")


def _dump(value: Any) -> str | None:
    return None if value is None else json.dumps(value, sort_keys=True, ensure_ascii=False)


def _now() -> str:
    return datetime.now(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def fold(text: str | None) -> str:
    """Case- and diacritics-insensitive search key."""
    if not text:
        return ""
    norm = unicodedata.normalize("NFD", text.casefold())
    return "".join(ch for ch in norm if unicodedata.category(ch) != "Mn")


def schema_version(conn: sqlite3.Connection) -> int:
    row = conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='schema_migrations'"
    ).fetchone()
    if row is None:
        return 0
    return conn.execute("SELECT COALESCE(MAX(version), 0) FROM schema_migrations").fetchone()[0]


def migrate(conn: sqlite3.Connection, target: int = CURRENT_SCHEMA_VERSION) -> int:
    """Apply pending migrations. A DB one version newer is opened (forward compatible)."""
    version = schema_version(conn)
    if version > target + 1:
        raise WineError(SCHEMA_TOO_NEW)
    if version > target:
        _LOGGER.warning("Wine DB schema v%s is newer than supported v%s", version, target)
        return version
    for next_version in range(version + 1, target + 1):
        conn.executescript(
            "BEGIN;"
            + MIGRATIONS[next_version]
            + f"INSERT INTO schema_migrations(version, applied_at) VALUES ({next_version}, "
            + f"'{_now()}');COMMIT;"
        )
    return target


def downgrade(conn: sqlite3.Connection, target: int) -> int:
    """Revert migrations above ``target`` that have a down script (rollback to an older rc)."""
    version = schema_version(conn)
    for step in range(version, target, -1):
        if step not in DOWNGRADES:
            raise WineError(SCHEMA_TOO_NEW)
        conn.executescript(
            "BEGIN;"
            + DOWNGRADES[step]
            + f"DELETE FROM schema_migrations WHERE version = {step};COMMIT;"
        )
    return min(version, target)


class WineStore:
    """Blocking SQLite repository; guarded by a lock, one connection."""

    def __init__(self, path: Path | str) -> None:
        self._path = Path(path)
        self._lock = threading.RLock()
        self._conn: sqlite3.Connection | None = None

    def open(self) -> WineStore:
        self._path.parent.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(self._path, check_same_thread=False, isolation_level=None)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        conn.execute("PRAGMA journal_mode = WAL")
        migrate(conn)
        self._conn = conn
        return self

    def close(self) -> None:
        with self._lock:
            if self._conn is not None:
                self._conn.close()
                self._conn = None

    @property
    def conn(self) -> sqlite3.Connection:
        if self._conn is None:
            raise RuntimeError("store is not open")
        return self._conn

    # ---------- mapping ----------
    @staticmethod
    def _wine(row: sqlite3.Row) -> dict[str, Any]:
        def load(col: str) -> Any:
            return None if row[col] is None else json.loads(row[col])

        return {
            "id": row["id"],
            "name": row["name"],
            "producer": row["producer"],
            "vintage": row["vintage"],
            "wineType": row["wine_type"],
            "color": row["color"],
            "grapeVarieties": load("grape_varieties_json") or [],
            "country": row["country"],
            "region": row["region"],
            "sweetness": row["sweetness"],
            "volumeMl": row["volume_ml"],
            "alcoholPct": row["alcohol_pct"],
            "quantity": row["quantity"],
            "location": load("location_json"),
            "acquiredOn": row["acquired_on"],
            "purchasePrice": row["purchase_price"],
            "personalRating": row["personal_rating"],
            "personalNote": row["personal_note"],
            "status": row["status"],
            "image": load("image_json"),
            "source": load("source_json"),
            "confidence": row["confidence"],
            "createdAt": row["created_at"],
            "updatedAt": row["updated_at"],
            "drinkWindow": load("drink_window_json"),
            "productLine": row["product_line"],
            "description": row["description"],
            "labelName": row["label_name"],
            "predicate": row["predicate"],
            "ean": row["ean"],
            "residualSugarGl": row["residual_sugar_gl"],
            "acidsGl": row["acids_gl"],
        }

    @staticmethod
    def _event(row: sqlite3.Row) -> dict[str, Any]:
        event = {
            "eventId": row["event_id"],
            "wineId": row["wine_id"],
            "operation": row["operation"],
            "quantityDelta": row["quantity_delta"],
            "reason": row["reason"],
            "sourceOperationId": row["source_operation_id"],
            "occurredAt": row["occurred_at"],
        }
        if row["actor_json"]:
            event["actor"] = json.loads(row["actor_json"])
        return event

    def _get_row(self, wine_id: str) -> sqlite3.Row | None:
        return self.conn.execute(
            f"SELECT {_WINE_COLUMNS} FROM wines WHERE id = ?", (wine_id,)
        ).fetchone()

    # ---------- reads ----------
    def get(self, wine_id: str) -> dict[str, Any]:
        with self._lock:
            row = self._get_row(wine_id)
            if row is None:
                raise WineError(TARGET_NOT_FOUND)
            return self._wine(row)

    def list(self, query: dict[str, Any] | None = None) -> list[dict[str, Any]]:
        """Filter + deterministic sort (mirrors modules/wine filters/sort)."""
        q = query or {}
        with self._lock:
            wines = [self._wine(r) for r in self.conn.execute(f"SELECT {_WINE_COLUMNS} FROM wines")]
        search = fold(q.get("search"))
        if search:
            wines = [
                w
                for w in wines
                if search
                in fold(f"{w['name']} {w['labelName'] or ''} {w['producer']} {w['ean'] or ''}")
            ]
        if q.get("wineTypes"):
            wines = [w for w in wines if w["wineType"] in q["wineTypes"]]
        if q.get("colors"):
            wines = [w for w in wines if w["color"] in q["colors"]]
        if q.get("varieties"):
            wanted = {fold(v) for v in q["varieties"]}
            wines = [w for w in wines if wanted & {fold(g) for g in w["grapeVarieties"]}]
        if q.get("zones"):
            wines = [w for w in wines if w["location"] and w["location"]["zone"] in q["zones"]]
        if q.get("vintageFrom") is not None:
            wines = [w for w in wines if w["vintage"] and w["vintage"] >= q["vintageFrom"]]
        if q.get("vintageTo") is not None:
            wines = [w for w in wines if w["vintage"] and w["vintage"] <= q["vintageTo"]]
        if q.get("ratingMin") is not None:
            wines = [w for w in wines if (w["personalRating"] or 0) >= q["ratingMin"]]
        if q.get("inStockOnly"):
            wines = [w for w in wines if w["quantity"] > 0]
        sort = q.get("sort") or "name"
        if sort == "rating":
            wines.sort(key=lambda w: (-(w["personalRating"] or 0), w["id"]))
        elif sort == "vintage":
            wines.sort(key=lambda w: (-(w["vintage"] or 0), w["id"]))
        elif sort == "id":
            wines.sort(key=lambda w: w["id"])
        else:
            wines.sort(key=lambda w: (fold(w["name"]), w["id"]))
        return wines

    def find_by_ean(self, ean: str) -> list[dict[str, Any]]:
        with self._lock:
            rows = self.conn.execute(f"SELECT {_WINE_COLUMNS} FROM wines WHERE ean = ?", (ean,))
            return [self._wine(r) for r in rows]

    def events(self, wine_id: str | None = None, limit: int = 100) -> list[dict[str, Any]]:
        with self._lock:
            sql = f"SELECT {_EVENT_COLUMNS} FROM inventory_events"
            args: tuple[Any, ...] = ()
            if wine_id:
                sql += " WHERE wine_id = ?"
                args = (wine_id,)
            sql += " ORDER BY occurred_at DESC, rowid DESC LIMIT ?"
            return [self._event(r) for r in self.conn.execute(sql, (*args, limit))]

    # ---------- writes ----------
    def _replay(self, op_id: str, fingerprint: dict[str, Any]) -> dict[str, Any] | None:
        row = self.conn.execute(
            "SELECT event_id, request_fingerprint_json, wine_snapshot_json "
            "FROM consume_idempotency WHERE source_operation_id = ?",
            (op_id,),
        ).fetchone()
        if row is None:
            if self.conn.execute(
                "SELECT 1 FROM inventory_events WHERE source_operation_id = ?", (op_id,)
            ).fetchone():
                raise WineError(IDEMPOTENT_REPLAY)
            return None
        if json.loads(row["request_fingerprint_json"]) != fingerprint:
            raise WineError(IDEMPOTENT_REPLAY)
        event = self.conn.execute(
            f"SELECT {_EVENT_COLUMNS} FROM inventory_events WHERE event_id = ?",
            (row["event_id"],),
        ).fetchone()
        return {
            "wine": json.loads(row["wine_snapshot_json"]),
            "event": self._event(event),
            "replayed": True,
        }

    def _append_event(
        self,
        wine_id: str,
        operation: str,
        delta: int,
        reason: str,
        op_id: str,
        actor: dict[str, Any] | None,
        fingerprint: dict[str, Any],
        now: str,
    ) -> dict[str, Any]:
        event_id = uuid.uuid4().hex
        self.conn.execute(
            f"INSERT INTO inventory_events ({_EVENT_COLUMNS}) VALUES (?,?,?,?,?,?,?,?)",
            (event_id, wine_id, operation, delta, reason, op_id, now, _dump(actor)),
        )
        wine = self._wine(self._get_row(wine_id))
        self.conn.execute(
            "INSERT INTO consume_idempotency VALUES (?,?,?,?)",
            (op_id, event_id, _dump(fingerprint), _dump(wine)),
        )
        event = self._event(
            self.conn.execute(
                f"SELECT {_EVENT_COLUMNS} FROM inventory_events WHERE event_id = ?", (event_id,)
            ).fetchone()
        )
        return {"wine": wine, "event": event, "replayed": False}

    def _tx(self):
        store = self

        class _Tx:
            def __enter__(self):
                store._lock.acquire()
                store.conn.execute("BEGIN IMMEDIATE")

            def __exit__(self, exc_type, exc, tb):
                try:
                    store.conn.execute("COMMIT" if exc_type is None else "ROLLBACK")
                finally:
                    store._lock.release()
                return False

        return _Tx()

    @staticmethod
    def _op_id(value: Any) -> str:
        if not isinstance(value, str) or not 8 <= len(value) <= 128:
            raise WineError(INVALID_FIELD, "sourceOperationId")
        return value

    def create(
        self,
        data: dict[str, Any],
        source_operation_id: str,
        actor: dict[str, Any] | None = None,
        reason: str = "Naskladnění",
        operation_label: str = "create",
    ) -> dict[str, Any]:
        op_id = self._op_id(source_operation_id)
        fields = validate_fields(data, partial=False)
        quantity = validate_quantity(data.get("quantity", 0))
        fingerprint = {"op": operation_label, "fields": fields, "quantity": quantity}
        with self._tx():
            if (replay := self._replay(op_id, fingerprint)) is not None:
                return replay
            now = _now()
            wine_id = uuid.uuid4().hex
            if quantity == 0 and fields["status"] == "in_stock":
                fields["status"] = "consumed"
            cols = ["id", "quantity", "created_at", "updated_at"]
            vals: list[Any] = [wine_id, 0, now, now]
            for key, value in fields.items():
                cols.append(_FIELD_TO_COLUMN[key])
                vals.append(_dump(value) if key in _JSON_FIELDS else value)
            self.conn.execute(
                f"INSERT INTO wines ({', '.join(cols)}) VALUES ({', '.join('?' * len(cols))})",
                vals,
            )
            self.conn.execute("UPDATE wines SET quantity = ? WHERE id = ?", (quantity, wine_id))
            return self._append_event(
                wine_id, "stock_in", quantity, reason, op_id, actor, fingerprint, now
            )

    def update(self, wine_id: str, changes: dict[str, Any]) -> dict[str, Any]:
        if "quantity" in changes:
            # Quantity only changes through consume/correct (audited events).
            raise WineError(INVALID_FIELD, "quantity")
        fields = validate_fields(changes, partial=True)
        if not fields:
            raise WineError(NO_CHANGE)
        with self._tx():
            if self._get_row(wine_id) is None:
                raise WineError(TARGET_NOT_FOUND)
            sets = ", ".join(f"{_FIELD_TO_COLUMN[k]} = ?" for k in fields)
            vals = [_dump(v) if k in _JSON_FIELDS else v for k, v in fields.items()]
            self.conn.execute(
                f"UPDATE wines SET {sets}, updated_at = ? WHERE id = ?", (*vals, _now(), wine_id)
            )
            return self._wine(self._get_row(wine_id))

    def consume(
        self,
        wine_id: str,
        quantity: Any,
        confirmed: bool,
        source_operation_id: str,
        reason: str | None = None,
        actor: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        op_id = self._op_id(source_operation_id)
        fingerprint = {"op": "consume", "wineId": wine_id, "quantity": quantity}
        with self._tx():
            if (replay := self._replay(op_id, fingerprint)) is not None:
                return replay
            row = self._get_row(wine_id)
            evaluate_consume(
                0 if row is None else 1,
                None if row is None else row["quantity"],
                quantity,
                confirmed,
            )
            remaining = row["quantity"] - quantity
            status = "consumed" if remaining == 0 and row["status"] == "in_stock" else row["status"]
            now = _now()
            self.conn.execute(
                "UPDATE wines SET quantity = ?, status = ?, updated_at = ? WHERE id = ?",
                (remaining, status, now, wine_id),
            )
            return self._append_event(
                wine_id,
                "consume",
                -quantity,
                (reason or "Vypito")[:200],
                op_id,
                actor,
                fingerprint,
                now,
            )

    def correct(
        self,
        wine_id: str,
        quantity: Any,
        reason: str,
        source_operation_id: str,
        actor: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Set an absolute bottle count; the delta is recorded as a correction event."""
        op_id = self._op_id(source_operation_id)
        quantity = validate_quantity(quantity)
        if not isinstance(reason, str) or not reason.strip() or len(reason) > 200:
            raise WineError(INVALID_FIELD, "reason")
        fingerprint = {"op": "correction", "wineId": wine_id, "quantity": quantity}
        with self._tx():
            if (replay := self._replay(op_id, fingerprint)) is not None:
                return replay
            row = self._get_row(wine_id)
            if row is None:
                raise WineError(TARGET_NOT_FOUND)
            delta = quantity - row["quantity"]
            if delta == 0:
                raise WineError(NO_CHANGE)
            status = row["status"]
            if quantity == 0 and status == "in_stock":
                status = "consumed"
            elif quantity > 0 and status == "consumed":
                status = "in_stock"
            now = _now()
            self.conn.execute(
                "UPDATE wines SET quantity = ?, status = ?, updated_at = ? WHERE id = ?",
                (quantity, status, now, wine_id),
            )
            return self._append_event(
                wine_id, "correction", delta, reason.strip(), op_id, actor, fingerprint, now
            )

    def stock_in(
        self,
        wine_id: str,
        quantity: int,
        reason: str,
        source_operation_id: str,
        actor: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        op_id = self._op_id(source_operation_id)
        if not isinstance(quantity, int) or quantity < 1:
            raise WineError("INVALID_QUANTITY")
        fingerprint = {"op": "stock_in", "wineId": wine_id, "quantity": quantity}
        with self._tx():
            if (replay := self._replay(op_id, fingerprint)) is not None:
                return replay
            row = self._get_row(wine_id)
            if row is None:
                raise WineError(TARGET_NOT_FOUND)
            status = "in_stock" if row["status"] == "consumed" else row["status"]
            now = _now()
            self.conn.execute(
                "UPDATE wines SET quantity = quantity + ?, status = ?, updated_at = ? WHERE id = ?",
                (quantity, status, now, wine_id),
            )
            return self._append_event(
                wine_id, "stock_in", quantity, reason, op_id, actor, fingerprint, now
            )

    def operation_exists(self, source_operation_id: str) -> bool:
        with self._lock:
            return (
                self.conn.execute(
                    "SELECT 1 FROM inventory_events WHERE source_operation_id = ?",
                    (source_operation_id,),
                ).fetchone()
                is not None
            )

    # ---------- import/enrichment metadata ----------
    def secret(self) -> bytes:
        """Per-install random secret (HMAC key for order fingerprints)."""
        with self._lock:
            row = self.conn.execute("SELECT value FROM wine_meta WHERE key = 'secret'").fetchone()
            if row is None:
                value = secrets.token_hex(32)
                self.conn.execute(
                    "INSERT OR IGNORE INTO wine_meta(key, value) VALUES ('secret', ?)", (value,)
                )
                row = self.conn.execute(
                    "SELECT value FROM wine_meta WHERE key = 'secret'"
                ).fetchone()
            return bytes.fromhex(row["value"])

    def order_imported(self, fingerprint: str) -> bool:
        with self._lock:
            return (
                self.conn.execute(
                    "SELECT 1 FROM import_orders WHERE fingerprint = ?", (fingerprint,)
                ).fetchone()
                is not None
            )

    def record_order(
        self, fingerprint: str, vendor: str, item_count: int, bottles: int, total: float | None
    ) -> None:
        with self._lock:
            self.conn.execute(
                "INSERT OR IGNORE INTO import_orders VALUES (?, ?, ?, ?, ?, ?)",
                (fingerprint, vendor, _now(), item_count, bottles, total),
            )

    # ---------- price history ----------
    def add_price_point(
        self,
        wine_id: str,
        kind: str,
        unit_price: float,
        *,
        point_id: str,
        observed_on: str | None = None,
        quantity: int | None = None,
        order_ref: str | None = None,
        regular_price: float | None = None,
    ) -> bool:
        """Insert one price point; ``point_id`` makes it idempotent (False = already there)."""
        if kind not in ("purchase", "shop"):
            raise WineError(INVALID_FIELD, "kind")
        if isinstance(unit_price, bool) or not isinstance(unit_price, int | float):
            raise WineError(INVALID_FIELD, "unitPrice")
        if not 0 <= unit_price <= 1e7:
            raise WineError(INVALID_FIELD, "unitPrice")
        now = _now()
        with self._lock:
            if self._get_row(wine_id) is None:
                raise WineError(TARGET_NOT_FOUND)
            cur = self.conn.execute(
                f"INSERT OR IGNORE INTO price_points ({_PRICE_COLUMNS}) VALUES (?,?,?,?,?,?,?,?,?)",
                (
                    point_id,
                    wine_id,
                    kind,
                    observed_on or now[:10],
                    float(unit_price),
                    quantity,
                    order_ref,
                    regular_price,
                    now,
                ),
            )
            return cur.rowcount == 1

    def price_history(self, wine_id: str) -> dict[str, list[dict[str, Any]]]:
        """Purchase lots and e-shop snapshots, oldest first."""
        with self._lock:
            rows = self.conn.execute(
                f"SELECT {_PRICE_COLUMNS} FROM price_points WHERE wine_id = ? "
                "ORDER BY observed_on, created_at, rowid",
                (wine_id,),
            ).fetchall()
        out: dict[str, list[dict[str, Any]]] = {"purchases": [], "shop": []}
        for row in rows:
            point: dict[str, Any] = {"date": row["observed_on"], "unitPrice": row["unit_price"]}
            if row["kind"] == "purchase":
                point.update(quantity=row["quantity"], orderRef=row["order_ref"])
                out["purchases"].append(point)
            else:
                if row["regular_price"] is not None:
                    point["regularPrice"] = row["regular_price"]
                out["shop"].append(point)
        return out

    def meta_get(self, key: str) -> str | None:
        with self._lock:
            row = self.conn.execute("SELECT value FROM wine_meta WHERE key = ?", (key,)).fetchone()
            return None if row is None else row["value"]

    def meta_set(self, key: str, value: str) -> None:
        with self._lock:
            self.conn.execute(
                "INSERT INTO wine_meta(key, value) VALUES (?, ?) "
                "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                (key, value),
            )

    # ---------- voice pending queue ----------
    def _voice_pending_row(self, row: sqlite3.Row) -> dict[str, Any]:
        return {
            "id": row["id"],
            "rawText": row["raw_text"],
            "normalizedQuery": row["normalized_query"],
            "vintage": row["vintage"],
            "quantity": row["quantity"],
            "candidates": json.loads(row["candidates_json"]),
            "sourceOperationId": row["source_operation_id"],
            "createdAt": row["created_at"],
        }

    def voice_pending_add(
        self,
        raw_text: str,
        normalized_query: str,
        vintage: int | None,
        quantity: int,
        candidates: list[dict[str, Any]],
        source_operation_id: str,
    ) -> str:
        op_id = self._op_id(source_operation_id)
        pending_id = uuid.uuid4().hex
        now = _now()
        with self._tx():
            cur = self.conn.execute(
                "INSERT OR IGNORE INTO voice_pending "
                "(id, raw_text, normalized_query, vintage, quantity, candidates_json, "
                "source_operation_id, created_at) VALUES (?,?,?,?,?,?,?,?)",
                (
                    pending_id,
                    raw_text[:500],
                    normalized_query[:200],
                    vintage,
                    quantity,
                    _dump(candidates),
                    op_id,
                    now,
                ),
            )
        if cur.rowcount == 0:  # concurrent retry with the same operation id
            existing = self.voice_pending_by_op(op_id)
            if existing is not None:
                return existing["id"]
        return pending_id

    def voice_pending_list(self) -> list[dict[str, Any]]:
        with self._lock:
            rows = self.conn.execute(
                "SELECT id, raw_text, normalized_query, vintage, quantity, candidates_json, "
                "source_operation_id, created_at FROM voice_pending ORDER BY created_at, id"
            ).fetchall()
        return [self._voice_pending_row(r) for r in rows]

    def voice_pending_get(self, pending_id: str) -> dict[str, Any] | None:
        with self._lock:
            row = self.conn.execute(
                "SELECT id, raw_text, normalized_query, vintage, quantity, candidates_json, "
                "source_operation_id, created_at FROM voice_pending WHERE id = ?",
                (pending_id,),
            ).fetchone()
        return None if row is None else self._voice_pending_row(row)

    def voice_pending_by_op(self, source_operation_id: str) -> dict[str, Any] | None:
        try:
            op_id = self._op_id(source_operation_id)
        except WineError:
            return None
        with self._lock:
            row = self.conn.execute(
                "SELECT id, raw_text, normalized_query, vintage, quantity, candidates_json, "
                "source_operation_id, created_at FROM voice_pending WHERE source_operation_id = ?",
                (op_id,),
            ).fetchone()
        return None if row is None else self._voice_pending_row(row)

    def voice_pending_latest(self, max_age_s: int) -> dict[str, Any] | None:
        """Newest pending request created within ``max_age_s`` seconds, if any."""
        cutoff = (
            (datetime.now(UTC) - timedelta(seconds=max_age_s))
            .isoformat(timespec="milliseconds")
            .replace("+00:00", "Z")
        )
        with self._lock:
            row = self.conn.execute(
                "SELECT id, raw_text, normalized_query, vintage, quantity, candidates_json, "
                "source_operation_id, created_at FROM voice_pending WHERE created_at >= ? "
                "ORDER BY created_at DESC, id DESC LIMIT 1",
                (cutoff,),
            ).fetchone()
        return None if row is None else self._voice_pending_row(row)

    def voice_pending_delete(self, pending_id: str) -> None:
        with self._tx():
            self.conn.execute("DELETE FROM voice_pending WHERE id = ?", (pending_id,))

    def voice_replay_consume(self, source_operation_id: str) -> dict[str, Any] | None:
        """If this operation id already consumed wine, return a voice-shaped replay."""
        try:
            op_id = self._op_id(source_operation_id)
        except WineError:
            return None
        row = self.conn.execute(
            "SELECT event_id, request_fingerprint_json, wine_snapshot_json "
            "FROM consume_idempotency WHERE source_operation_id = ?",
            (op_id,),
        ).fetchone()
        if row is None:
            return None
        wine = json.loads(row["wine_snapshot_json"])
        event = self.conn.execute(
            f"SELECT {_EVENT_COLUMNS} FROM inventory_events WHERE event_id = ?",
            (row["event_id"],),
        ).fetchone()
        return {
            "status": "consumed",
            "wine": {
                "id": wine["id"],
                "name": wine["name"],
                "labelName": wine.get("labelName"),
                "vintage": wine.get("vintage"),
                "quantity": wine.get("quantity"),
            },
            "event": self._event(event),
            "replayed": True,
        }
