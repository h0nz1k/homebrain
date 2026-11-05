"""SQLite recipe store (``/config/homebrain/recipes.db``), versioned reversible migrations.

All methods are blocking and must run in the executor (``hass.async_add_executor_job``).
"""

from __future__ import annotations

import json
import logging
import re
import sqlite3
import threading
import unicodedata
import uuid
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

_LOGGER = logging.getLogger(__name__)

NOT_FOUND = "TARGET_NOT_FOUND"
INVALID_FIELD = "INVALID_FIELD"
SCHEMA_TOO_NEW = "SCHEMA_TOO_NEW"


class RecipeError(Exception):
    def __init__(self, code: str, field: str | None = None) -> None:
        super().__init__(code if field is None else f"{code}:{field}")
        self.code = code
        self.field = field


MIGRATION_V1_SQL = """
CREATE TABLE schema_migrations (
  version INTEGER PRIMARY KEY NOT NULL,
  applied_at TEXT NOT NULL
);
CREATE TABLE recipes (
  id TEXT PRIMARY KEY NOT NULL,
  title TEXT NOT NULL,
  title_fold TEXT NOT NULL,
  description TEXT NULL,
  servings INTEGER NULL CHECK (servings IS NULL OR servings BETWEEN 1 AND 999),
  prep_s INTEGER NULL,
  cook_s INTEGER NULL,
  total_s INTEGER NULL,
  source_url TEXT NULL,
  source_name TEXT NULL,
  youtube_id TEXT NULL,
  photo_json TEXT NULL,
  favourite INTEGER NOT NULL DEFAULT 0 CHECK (favourite IN (0, 1)),
  rating INTEGER NULL CHECK (rating IS NULL OR rating BETWEEN 1 AND 5),
  last_cooked_at TEXT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE ingredients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  recipe_id TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  grp TEXT NULL,
  qty REAL NULL CHECK (qty IS NULL OR qty >= 0),
  qty_max REAL NULL,
  unit TEXT NULL,
  name TEXT NOT NULL,
  note TEXT NULL,
  countable INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE steps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  recipe_id TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  grp TEXT NULL,
  text TEXT NOT NULL,
  timer_s INTEGER NULL CHECK (timer_s IS NULL OR timer_s > 0),
  video_ts INTEGER NULL CHECK (video_ts IS NULL OR video_ts >= 0),
  airfryer_json TEXT NULL
);
CREATE TABLE tags (
  recipe_id TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  tag TEXT NOT NULL,
  PRIMARY KEY (recipe_id, tag)
);
CREATE TABLE settings (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);
CREATE INDEX ingredients_recipe ON ingredients(recipe_id, position);
CREATE INDEX steps_recipe ON steps(recipe_id, position);
CREATE INDEX tags_tag ON tags(tag);
"""
# v2: personal notes + lookup by source URL (re-import of the same page = update).
MIGRATION_V2_SQL = """
ALTER TABLE recipes ADD COLUMN notes TEXT NULL;
CREATE INDEX recipes_source ON recipes(source_url);
"""
# v3: server-side cooking timers (survive HA restart, shared by every device).
MIGRATION_V3_SQL = """
CREATE TABLE timers (
  id TEXT PRIMARY KEY NOT NULL,
  label TEXT NOT NULL,
  recipe_id TEXT NULL,
  step_index INTEGER NULL,
  duration_ms INTEGER NOT NULL,
  ends_at INTEGER NULL,
  paused_remaining_ms INTEGER NULL,
  acknowledged INTEGER NOT NULL DEFAULT 0,
  fired INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
"""
MIGRATIONS = {1: MIGRATION_V1_SQL, 2: MIGRATION_V2_SQL, 3: MIGRATION_V3_SQL}
DOWNGRADES = {
    3: "DROP TABLE timers;",
    2: """
DROP INDEX recipes_source;
ALTER TABLE recipes DROP COLUMN notes;
""",
    1: """
DROP TABLE tags; DROP TABLE steps; DROP TABLE ingredients; DROP TABLE settings;
DROP TABLE recipes;
""",
}
CURRENT_SCHEMA_VERSION = 3

AIRFRYER_METHOD_MAX = 40
_YT = re.compile(r"^[A-Za-z0-9_-]{11}$")
_ID = re.compile(r"^[0-9a-f]{32}$")


def _now() -> str:
    return datetime.now(UTC).isoformat(timespec="seconds").replace("+00:00", "Z")


def fold(text: str | None) -> str:
    """Case- and diacritics-insensitive search key."""
    norm = unicodedata.normalize("NFD", (text or "").casefold())
    return "".join(ch for ch in norm if unicodedata.category(ch) != "Mn")


def schema_version(conn: sqlite3.Connection) -> int:
    row = conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='schema_migrations'"
    ).fetchone()
    if row is None:
        return 0
    return conn.execute("SELECT COALESCE(MAX(version), 0) FROM schema_migrations").fetchone()[0]


def migrate(conn: sqlite3.Connection, target: int = CURRENT_SCHEMA_VERSION) -> int:
    """Apply pending migrations; one version newer is tolerated (forward compatible)."""
    version = schema_version(conn)
    if version > target + 1:
        raise RecipeError(SCHEMA_TOO_NEW)
    if version > target:
        _LOGGER.warning("Recipes DB schema v%s is newer than supported v%s", version, target)
        return version
    for step in range(version + 1, target + 1):
        conn.executescript(
            "BEGIN;"
            + MIGRATIONS[step]
            + f"INSERT INTO schema_migrations(version, applied_at) VALUES ({step}, '{_now()}');"
            + "COMMIT;"
        )
    return target


def downgrade(conn: sqlite3.Connection, target: int) -> int:
    """Revert migrations above ``target`` (rollback to an older release)."""
    version = schema_version(conn)
    for step in range(version, target, -1):
        tail = (
            "DROP TABLE schema_migrations;"
            if step == 1
            else f"DELETE FROM schema_migrations WHERE version = {step};"
        )
        conn.executescript("BEGIN;" + DOWNGRADES[step] + tail + "COMMIT;")
    return min(version, target)


# ---------- validation ----------
def _str(value: Any, field: str, max_len: int, required: bool = False) -> str | None:
    if value is None or (isinstance(value, str) and not value.strip()):
        if required:
            raise RecipeError(INVALID_FIELD, field)
        return None
    if not isinstance(value, str) or len(value) > max_len:
        raise RecipeError(INVALID_FIELD, field)
    return value.strip()


def _int(value: Any, field: str, lo: int, hi: int) -> int | None:
    if value is None:
        return None
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not lo <= value <= hi:
        raise RecipeError(INVALID_FIELD, field)
    return int(value)


def _num(value: Any, field: str) -> float | None:
    if value is None:
        return None
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not 0 <= value <= 100000:
        raise RecipeError(INVALID_FIELD, field)
    return float(value)


def validate_airfryer(value: Any) -> dict[str, Any] | None:
    """Per-step airfryer action ``{temperature °C, minutes, method?}``."""
    if value is None:
        return None
    if not isinstance(value, dict):
        raise RecipeError(INVALID_FIELD, "airfryer")
    out = {
        "temperature": _int(value.get("temperature"), "airfryer.temperature", 40, 230),
        "minutes": _int(value.get("minutes"), "airfryer.minutes", 1, 120),
        "method": _str(value.get("method"), "airfryer.method", AIRFRYER_METHOD_MAX),
    }
    if out["temperature"] is None or out["minutes"] is None:
        raise RecipeError(INVALID_FIELD, "airfryer")
    return out


def validate_recipe(data: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(data, dict):
        raise RecipeError(INVALID_FIELD, "recipe")
    youtube = _str(data.get("youtubeId"), "youtubeId", 11)
    if youtube and not _YT.match(youtube):
        raise RecipeError(INVALID_FIELD, "youtubeId")
    source = _str(data.get("sourceUrl"), "sourceUrl", 500)
    if source and not re.match(r"^https?://", source):
        raise RecipeError(INVALID_FIELD, "sourceUrl")
    ingredients = []
    for i, item in enumerate(data.get("ingredients") or []):
        if not isinstance(item, dict):
            raise RecipeError(INVALID_FIELD, f"ingredients.{i}")
        unit = _str(item.get("unit"), f"ingredients.{i}.unit", 20)
        qty = _num(item.get("qty"), f"ingredients.{i}.qty")
        ingredients.append(
            {
                "group": _str(item.get("group"), f"ingredients.{i}.group", 60),
                "qty": qty,
                "qtyMax": _num(item.get("qtyMax"), f"ingredients.{i}.qtyMax"),
                "unit": unit,
                "name": _str(item.get("name"), f"ingredients.{i}.name", 200, required=True),
                "note": _str(item.get("note"), f"ingredients.{i}.note", 200),
                "countable": bool(item.get("countable", False)),
            }
        )
    steps = []
    for i, item in enumerate(data.get("steps") or []):
        if not isinstance(item, dict):
            raise RecipeError(INVALID_FIELD, f"steps.{i}")
        steps.append(
            {
                "group": _str(item.get("group"), f"steps.{i}.group", 60),
                "text": _str(item.get("text"), f"steps.{i}.text", 2000, required=True),
                "timerSeconds": _int(
                    item.get("timerSeconds"), f"steps.{i}.timerSeconds", 1, 172800
                ),
                "videoTs": _int(item.get("videoTs"), f"steps.{i}.videoTs", 0, 86400),
                "airfryer": validate_airfryer(item.get("airfryer")),
            }
        )
    if len(ingredients) > 150 or len(steps) > 100:
        raise RecipeError(INVALID_FIELD, "size")
    tags = []
    for tag in data.get("tags") or []:
        tag = _str(tag, "tags", 30)
        if tag and tag.lower() not in tags:
            tags.append(tag.lower())
    return {
        "title": _str(data.get("title"), "title", 200, required=True),
        "description": _str(data.get("description"), "description", 2000),
        "notes": _str(data.get("notes"), "notes", 4000),
        "servings": _int(data.get("servings"), "servings", 1, 999),
        "prepSeconds": _int(data.get("prepSeconds"), "prepSeconds", 0, 604800),
        "cookSeconds": _int(data.get("cookSeconds"), "cookSeconds", 0, 604800),
        "totalSeconds": _int(data.get("totalSeconds"), "totalSeconds", 0, 604800),
        "sourceUrl": source,
        "sourceName": _str(data.get("sourceName"), "sourceName", 100),
        "youtubeId": youtube,
        "ingredients": ingredients,
        "steps": steps,
        "tags": tags[:12],
    }


class RecipeStore:
    """Blocking SQLite repository; one connection guarded by a lock."""

    def __init__(self, path: Path | str) -> None:
        self._path = Path(path)
        self._lock = threading.RLock()
        self._conn: sqlite3.Connection | None = None

    def open(self) -> RecipeStore:
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
    def _summary(self, row: sqlite3.Row, tags: list[str]) -> dict[str, Any]:
        return {
            "id": row["id"],
            "title": row["title"],
            "description": row["description"],
            "servings": row["servings"],
            "prepSeconds": row["prep_s"],
            "cookSeconds": row["cook_s"],
            "totalSeconds": row["total_s"],
            "sourceUrl": row["source_url"],
            "sourceName": row["source_name"],
            "youtubeId": row["youtube_id"],
            "photo": json.loads(row["photo_json"]) if row["photo_json"] else None,
            "favourite": bool(row["favourite"]),
            "rating": row["rating"],
            "lastCookedAt": row["last_cooked_at"],
            "notes": row["notes"],
            "tags": tags,
            "createdAt": row["created_at"],
            "updatedAt": row["updated_at"],
        }

    def _tags_for(self, ids: list[str]) -> dict[str, list[str]]:
        out: dict[str, list[str]] = {i: [] for i in ids}
        if not ids:
            return out
        marks = ",".join("?" * len(ids))
        for row in self.conn.execute(
            f"SELECT recipe_id, tag FROM tags WHERE recipe_id IN ({marks}) ORDER BY tag", ids
        ):
            out[row["recipe_id"]].append(row["tag"])
        return out

    def get(self, recipe_id: str) -> dict[str, Any]:
        with self._lock:
            row = self.conn.execute("SELECT * FROM recipes WHERE id = ?", (recipe_id,)).fetchone()
            if row is None:
                raise RecipeError(NOT_FOUND)
            recipe = self._summary(row, self._tags_for([recipe_id])[recipe_id])
            recipe["ingredients"] = [
                {
                    "group": r["grp"],
                    "qty": r["qty"],
                    "qtyMax": r["qty_max"],
                    "unit": r["unit"],
                    "name": r["name"],
                    "note": r["note"],
                    "countable": bool(r["countable"]),
                }
                for r in self.conn.execute(
                    "SELECT * FROM ingredients WHERE recipe_id = ? ORDER BY position", (recipe_id,)
                )
            ]
            recipe["steps"] = [
                {
                    "group": r["grp"],
                    "text": r["text"],
                    "timerSeconds": r["timer_s"],
                    "videoTs": r["video_ts"],
                    "airfryer": json.loads(r["airfryer_json"]) if r["airfryer_json"] else None,
                }
                for r in self.conn.execute(
                    "SELECT * FROM steps WHERE recipe_id = ? ORDER BY position", (recipe_id,)
                )
            ]
            return recipe

    def list(self, query: dict[str, Any] | None = None) -> list[dict[str, Any]]:
        query = query or {}
        sql = "SELECT r.* FROM recipes r"
        where: list[str] = []
        args: list[Any] = []
        if tag := query.get("tag"):
            where.append("EXISTS (SELECT 1 FROM tags t WHERE t.recipe_id = r.id AND t.tag = ?)")
            args.append(str(tag).lower())
        if query.get("favourite"):
            where.append("r.favourite = 1")
        if search := fold(query.get("search")).strip():
            # Title, tag or ingredient name (folded, diacritics-insensitive).
            where.append(
                "(r.title_fold LIKE ? OR EXISTS (SELECT 1 FROM ingredients i WHERE "
                "i.recipe_id = r.id AND fold(i.name) LIKE ?) OR EXISTS (SELECT 1 FROM tags t "
                "WHERE t.recipe_id = r.id AND fold(t.tag) LIKE ?))"
            )
            args.extend([f"%{search}%"] * 3)
        if where:
            sql += " WHERE " + " AND ".join(where)
        sql += " ORDER BY r.favourite DESC, COALESCE(r.last_cooked_at, '') DESC, r.title_fold"
        with self._lock:
            self.conn.create_function("fold", 1, fold, deterministic=True)
            rows = self.conn.execute(sql, args).fetchall()
            tags = self._tags_for([r["id"] for r in rows])
            counts = dict(
                self.conn.execute(
                    "SELECT recipe_id, COUNT(*) FROM ingredients GROUP BY recipe_id"
                ).fetchall()
            )
            out = []
            for row in rows:
                item = self._summary(row, tags[row["id"]])
                item["ingredientCount"] = counts.get(row["id"], 0)
                out.append(item)
            return out

    def tags(self) -> list[dict[str, Any]]:
        with self._lock:
            return [
                {"tag": r[0], "count": r[1]}
                for r in self.conn.execute(
                    "SELECT tag, COUNT(*) FROM tags GROUP BY tag ORDER BY COUNT(*) DESC, tag"
                )
            ]

    def find_by_source(self, url: str) -> str | None:
        with self._lock:
            row = self.conn.execute(
                "SELECT id FROM recipes WHERE source_url = ? LIMIT 1", (url,)
            ).fetchone()
            return row[0] if row else None

    # ---------- writes ----------
    def _write_children(self, recipe_id: str, data: dict[str, Any]) -> None:
        conn = self.conn
        conn.execute("DELETE FROM ingredients WHERE recipe_id = ?", (recipe_id,))
        conn.execute("DELETE FROM steps WHERE recipe_id = ?", (recipe_id,))
        conn.execute("DELETE FROM tags WHERE recipe_id = ?", (recipe_id,))
        conn.executemany(
            "INSERT INTO ingredients (recipe_id, position, grp, qty, qty_max, unit, name, note, "
            "countable) VALUES (?,?,?,?,?,?,?,?,?)",
            [
                (
                    recipe_id,
                    i,
                    it["group"],
                    it["qty"],
                    it["qtyMax"],
                    it["unit"],
                    it["name"],
                    it["note"],
                    int(it["countable"]),
                )
                for i, it in enumerate(data["ingredients"])
            ],
        )
        conn.executemany(
            "INSERT INTO steps (recipe_id, position, grp, text, timer_s, video_ts, airfryer_json) "
            "VALUES (?,?,?,?,?,?,?)",
            [
                (
                    recipe_id,
                    i,
                    st["group"],
                    st["text"],
                    st["timerSeconds"],
                    st["videoTs"],
                    json.dumps(st["airfryer"], sort_keys=True) if st["airfryer"] else None,
                )
                for i, st in enumerate(data["steps"])
            ],
        )
        conn.executemany(
            "INSERT INTO tags (recipe_id, tag) VALUES (?, ?)",
            [(recipe_id, tag) for tag in data["tags"]],
        )

    def create(self, recipe: dict[str, Any]) -> dict[str, Any]:
        data = validate_recipe(recipe)
        recipe_id = uuid.uuid4().hex
        now = _now()
        with self._lock:
            self.conn.execute("BEGIN")
            try:
                self.conn.execute(
                    "INSERT INTO recipes (id, title, title_fold, description, notes, servings, "
                    "prep_s, cook_s, total_s, source_url, source_name, youtube_id, created_at, "
                    "updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                    (
                        recipe_id,
                        data["title"],
                        fold(data["title"]),
                        data["description"],
                        data["notes"],
                        data["servings"],
                        data["prepSeconds"],
                        data["cookSeconds"],
                        data["totalSeconds"],
                        data["sourceUrl"],
                        data["sourceName"],
                        data["youtubeId"],
                        now,
                        now,
                    ),
                )
                self._write_children(recipe_id, data)
                self.conn.execute("COMMIT")
            except Exception:
                self.conn.execute("ROLLBACK")
                raise
        return self.get(recipe_id)

    def update(self, recipe_id: str, recipe: dict[str, Any]) -> dict[str, Any]:
        data = validate_recipe(recipe)
        with self._lock:
            self.get(recipe_id)
            self.conn.execute("BEGIN")
            try:
                self.conn.execute(
                    "UPDATE recipes SET title=?, title_fold=?, description=?, notes=?, servings=?, "
                    "prep_s=?, cook_s=?, total_s=?, source_url=?, source_name=?, youtube_id=?, "
                    "updated_at=? WHERE id=?",
                    (
                        data["title"],
                        fold(data["title"]),
                        data["description"],
                        data["notes"],
                        data["servings"],
                        data["prepSeconds"],
                        data["cookSeconds"],
                        data["totalSeconds"],
                        data["sourceUrl"],
                        data["sourceName"],
                        data["youtubeId"],
                        _now(),
                        recipe_id,
                    ),
                )
                self._write_children(recipe_id, data)
                self.conn.execute("COMMIT")
            except Exception:
                self.conn.execute("ROLLBACK")
                raise
        return self.get(recipe_id)

    def patch(self, recipe_id: str, changes: dict[str, Any]) -> dict[str, Any]:
        """Small user-level edits: favourite, rating, cooked now, photo."""
        sets: list[str] = []
        args: list[Any] = []
        if "favourite" in changes:
            sets.append("favourite = ?")
            args.append(1 if changes["favourite"] else 0)
        if "rating" in changes:
            sets.append("rating = ?")
            args.append(_int(changes["rating"], "rating", 1, 5))
        if changes.get("cooked"):
            sets.append("last_cooked_at = ?")
            args.append(_now())
        if "photo" in changes:
            sets.append("photo_json = ?")
            args.append(json.dumps(changes["photo"], sort_keys=True) if changes["photo"] else None)
        if not sets:
            raise RecipeError(INVALID_FIELD, "changes")
        with self._lock:
            cur = self.conn.execute(
                f"UPDATE recipes SET {', '.join(sets)} WHERE id = ?", (*args, recipe_id)
            )
            if cur.rowcount == 0:
                raise RecipeError(NOT_FOUND)
        return self.get(recipe_id)

    def delete(self, recipe_id: str) -> dict[str, Any]:
        with self._lock:
            recipe = self.get(recipe_id)
            self.conn.execute("DELETE FROM recipes WHERE id = ?", (recipe_id,))
        return recipe

    # ---------- settings ----------
    def setting(self, key: str) -> str | None:
        with self._lock:
            row = self.conn.execute("SELECT value FROM settings WHERE key = ?", (key,)).fetchone()
            return row[0] if row else None

    def set_setting(self, key: str, value: str | None) -> None:
        with self._lock:
            if value is None:
                self.conn.execute("DELETE FROM settings WHERE key = ?", (key,))
            else:
                self.conn.execute(
                    "INSERT INTO settings (key, value) VALUES (?, ?) "
                    "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                    (key, value),
                )

    # ---------- timers ----------
    _TIMER_COLS = (
        "id",
        "label",
        "recipe_id",
        "step_index",
        "duration_ms",
        "ends_at",
        "paused_remaining_ms",
        "acknowledged",
        "fired",
    )

    def timers(self) -> list[dict[str, Any]]:
        with self._lock:
            rows = self.conn.execute(
                f"SELECT {', '.join(self._TIMER_COLS)} FROM timers ORDER BY created_at, id"
            ).fetchall()
        return [
            {**dict(row), "acknowledged": bool(row["acknowledged"]), "fired": bool(row["fired"])}
            for row in rows
        ]

    def save_timer(self, timer: dict[str, Any]) -> None:
        values = [timer.get(c) for c in self._TIMER_COLS]
        values[7] = int(bool(timer.get("acknowledged")))
        values[8] = int(bool(timer.get("fired")))
        cols = ", ".join(self._TIMER_COLS)
        updates = ", ".join(f"{c} = excluded.{c}" for c in self._TIMER_COLS[1:])
        with self._lock:
            self.conn.execute(
                f"INSERT INTO timers ({cols}, created_at) VALUES ({', '.join('?' * 10)}) "
                f"ON CONFLICT(id) DO UPDATE SET {updates}",
                (*values, _now()),
            )

    def delete_timer(self, timer_id: str) -> bool:
        with self._lock:
            return self.conn.execute("DELETE FROM timers WHERE id = ?", (timer_id,)).rowcount > 0


def is_recipe_id(value: str) -> bool:
    return bool(_ID.match(value or ""))
