"""SQLite store /config/homebrain/weather.db with forward-only migrations.

All methods are blocking; callers run them in the executor.
"""

from __future__ import annotations

import sqlite3
from collections.abc import Iterable
from datetime import datetime, timedelta
from pathlib import Path

from .const import ARCHIVE_RETENTION_D, OBS_RETENTION_D, PREV_RETENTION_D

MIGRATIONS: dict[int, tuple[str, ...]] = {
    1: (
        "CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)",
        "CREATE TABLE IF NOT EXISTS obs_hourly (valid_at TEXT NOT NULL, var TEXT NOT NULL,"
        " value REAL, qc TEXT NOT NULL DEFAULT 'ok', n INTEGER NOT NULL DEFAULT 0,"
        " PRIMARY KEY (valid_at, var))",
        "CREATE TABLE IF NOT EXISTS fc_archive (source TEXT NOT NULL, issued_at TEXT NOT NULL,"
        " valid_at TEXT NOT NULL, lead_h INTEGER NOT NULL, var TEXT NOT NULL, value REAL,"
        " PRIMARY KEY (source, issued_at, valid_at, var))",
        "CREATE INDEX IF NOT EXISTS fc_archive_valid ON fc_archive (valid_at, var)",
        "CREATE TABLE IF NOT EXISTS bias_state (source TEXT NOT NULL, var TEXT NOT NULL,"
        " lead_bucket TEXT NOT NULL, b REAL NOT NULL, mae REAL NOT NULL, n INTEGER NOT NULL,"
        " updated_at TEXT NOT NULL, PRIMARY KEY (source, var, lead_bucket))",
    ),
    # Issue #131 B: Open-Meteo Previous Runs (lead = day × 24 h) and verification results.
    2: (
        "CREATE TABLE IF NOT EXISTS fc_prev (source TEXT NOT NULL, valid_at TEXT NOT NULL,"
        " day INTEGER NOT NULL, var TEXT NOT NULL, value REAL,"
        " PRIMARY KEY (source, valid_at, day, var))",
        "CREATE INDEX IF NOT EXISTS fc_prev_valid ON fc_prev (valid_at, var)",
    ),
}
SCHEMA_VERSION = max(MIGRATIONS)


class WeatherStore:
    """Thin synchronous wrapper around one SQLite connection."""

    def __init__(self, path: Path) -> None:
        self.path = path
        self._conn: sqlite3.Connection | None = None

    @property
    def conn(self) -> sqlite3.Connection:
        if self._conn is None:
            raise RuntimeError("store is closed")
        return self._conn

    def open(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._conn = sqlite3.connect(self.path, check_same_thread=False)
        self.migrate()

    def close(self) -> None:
        if self._conn is not None:
            self._conn.close()
            self._conn = None

    def schema_version(self) -> int:
        try:
            row = self.conn.execute("SELECT value FROM meta WHERE key='schema_version'").fetchone()
        except sqlite3.OperationalError:
            return 0
        return int(row[0]) if row else 0

    def migrate(self) -> None:
        current = self.schema_version()
        with self.conn:
            for version in sorted(v for v in MIGRATIONS if v > current):
                for statement in MIGRATIONS[version]:
                    self.conn.execute(statement)
                self.conn.execute(
                    "INSERT OR REPLACE INTO meta (key, value) VALUES ('schema_version', ?)",
                    (str(version),),
                )

    def has_issue(self, source: str, issued_at: str) -> bool:
        row = self.conn.execute(
            "SELECT 1 FROM fc_archive WHERE source=? AND issued_at=? LIMIT 1", (source, issued_at)
        ).fetchone()
        return row is not None

    def issued_sources(self, issued_at: str) -> set[str]:
        rows = self.conn.execute(
            "SELECT DISTINCT source FROM fc_archive WHERE issued_at=?", (issued_at,)
        ).fetchall()
        return {row[0] for row in rows}

    def archive(self, rows: Iterable[tuple[str, str, str, int, str, float]]) -> None:
        with self.conn:
            self.conn.executemany(
                "INSERT OR IGNORE INTO fc_archive (source, issued_at, valid_at, lead_h, var, value)"
                " VALUES (?, ?, ?, ?, ?, ?)",
                rows,
            )

    def forecasts_for(self, valid_at: str, var: str) -> list[tuple[str, int, float]]:
        return self.conn.execute(
            "SELECT source, lead_h, value FROM fc_archive WHERE valid_at=? AND var=?"
            " AND value IS NOT NULL",
            (valid_at, var),
        ).fetchall()

    def put_obs(self, valid_at: str, var: str, value: float, qc: str, n: int) -> None:
        with self.conn:
            self.conn.execute(
                "INSERT OR REPLACE INTO obs_hourly (valid_at, var, value, qc, n)"
                " VALUES (?, ?, ?, ?, ?)",
                (valid_at, var, value, qc, n),
            )

    def obs_since(self, since: str) -> list[tuple[str, str, float]]:
        return self.conn.execute(
            "SELECT valid_at, var, value FROM obs_hourly WHERE valid_at>=? ORDER BY valid_at",
            (since,),
        ).fetchall()

    def load_bias(self) -> dict[tuple[str, str, str], dict[str, float]]:
        rows = self.conn.execute("SELECT source, var, lead_bucket, b, mae, n FROM bias_state")
        return {(s, v, lb): {"b": b, "mae": mae, "n": n} for s, v, lb, b, mae, n in rows}

    def put_bias(self, items: dict[tuple[str, str, str], dict[str, float]], now: str) -> None:
        with self.conn:
            self.conn.executemany(
                "INSERT OR REPLACE INTO bias_state (source, var, lead_bucket, b, mae, n,"
                " updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
                [
                    (s, v, lb, st["b"], st["mae"], int(st["n"]), now)
                    for (s, v, lb), st in items.items()
                ],
            )

    def put_obs_many(self, var: str, values: dict[str, float], qc: str = "ok") -> None:
        with self.conn:
            self.conn.executemany(
                "INSERT OR REPLACE INTO obs_hourly (valid_at, var, value, qc, n)"
                " VALUES (?, ?, ?, ?, 1)",
                [(valid_at, var, value, qc) for valid_at, value in values.items()],
            )

    def has_obs(self, var: str, since: str) -> bool:
        row = self.conn.execute(
            "SELECT 1 FROM obs_hourly WHERE var=? AND valid_at>=? LIMIT 1", (var, since)
        ).fetchone()
        return row is not None

    def put_prev(self, rows: Iterable[tuple[str, str, int, str, float]]) -> None:
        with self.conn:
            self.conn.executemany(
                "INSERT OR REPLACE INTO fc_prev (source, valid_at, day, var, value)"
                " VALUES (?, ?, ?, ?, ?)",
                rows,
            )

    def prev_dates(self, since: str) -> set[str]:
        """UTC dates (YYYY-MM-DD) that already have Previous Runs rows."""
        rows = self.conn.execute(
            "SELECT DISTINCT substr(valid_at, 1, 10) FROM fc_prev WHERE valid_at>=?", (since,)
        ).fetchall()
        return {row[0] for row in rows}

    def precip_pairs(self, since: str) -> list[tuple[str, float, str, float, float, float | None]]:
        """(source, lead_h, valid_at, forecast mm, observed mm, pop 0..1 | None).

        Own archive (all issues, leads 1-72 h; blend PoP = the *raw* pre-calibration value)
        plus Previous Runs (lead = day × 24 h), each joined to the station's hourly rain.
        """
        own = self.conn.execute(
            "SELECT f.source, f.lead_h, f.valid_at, f.value, o.value, p.value"
            " FROM fc_archive f JOIN obs_hourly o ON o.valid_at=f.valid_at AND o.var='precip'"
            " LEFT JOIN fc_archive p ON p.source=f.source AND p.issued_at=f.issued_at"
            " AND p.valid_at=f.valid_at"
            " AND p.var=(CASE WHEN f.source='blend' THEN 'pop_raw' ELSE 'pop' END)"
            " WHERE f.var='precip' AND f.valid_at>=? AND f.value IS NOT NULL"
            " AND o.value IS NOT NULL",
            (since,),
        ).fetchall()
        prev = self.conn.execute(
            "SELECT f.source, f.day * 24, f.valid_at, f.value, o.value, NULL"
            " FROM fc_prev f JOIN obs_hourly o ON o.valid_at=f.valid_at AND o.var='precip'"
            " WHERE f.var='precip' AND f.valid_at>=? AND f.value IS NOT NULL"
            " AND o.value IS NOT NULL",
            (since,),
        ).fetchall()
        return [*own, *prev]

    def get_meta(self, key: str) -> str | None:
        row = self.conn.execute("SELECT value FROM meta WHERE key=?", (key,)).fetchone()
        return row[0] if row else None

    def put_meta(self, key: str, value: str) -> None:
        with self.conn:
            self.conn.execute(
                "INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)", (key, value)
            )

    def prune(self, now: datetime) -> None:
        with self.conn:
            self.conn.execute(
                "DELETE FROM fc_archive WHERE valid_at<?",
                (_iso(now - timedelta(days=ARCHIVE_RETENTION_D)),),
            )
            self.conn.execute(
                "DELETE FROM obs_hourly WHERE valid_at<?",
                (_iso(now - timedelta(days=OBS_RETENTION_D)),),
            )
            self.conn.execute(
                "DELETE FROM fc_prev WHERE valid_at<?",
                (_iso(now - timedelta(days=PREV_RETENTION_D)),),
            )


def _iso(value: datetime) -> str:
    return value.isoformat().replace("+00:00", "Z")
