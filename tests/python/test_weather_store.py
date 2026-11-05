"""SQLite store schema, migrations and retention."""

from datetime import UTC, datetime

from custom_components.homebrain.weather.store import SCHEMA_VERSION, WeatherStore


def test_migrate_archive_bias_and_prune(tmp_path):
    store = WeatherStore(tmp_path / "homebrain" / "weather.db")
    store.open()
    assert store.schema_version() == SCHEMA_VERSION
    store.migrate()  # idempotent
    store.archive(
        [
            ("ecmwf_ifs", "2026-10-31T12:00:00Z", "2026-10-31T15:00:00Z", 3, "t2m", 9.5),
            ("ecmwf_ifs", "2026-10-31T12:00:00Z", "2026-10-31T15:00:00Z", 3, "t2m", 99),
        ]
    )
    assert store.has_issue("ecmwf_ifs", "2026-10-31T12:00:00Z")
    assert "ecmwf_ifs" in store.issued_sources("2026-10-31T12:00:00Z")
    assert store.issued_sources("2026-10-31T18:00:00Z") == set()
    assert store.forecasts_for("2026-10-31T15:00:00Z", "t2m") == [("ecmwf_ifs", 3, 9.5)]
    store.put_bias({("ecmwf_ifs", "t2m", "0-6"): {"b": 0.5, "mae": 0.7, "n": 3}}, "now")
    assert store.load_bias()[("ecmwf_ifs", "t2m", "0-6")]["n"] == 3
    store.put_obs("2020-01-01T00:00:00Z", "t2m", 1.0, "ok", 10)
    store.prune(datetime(2026, 10, 31, tzinfo=UTC))
    assert store.obs_since("2000-01-01") == []
    store.close()
    reopened = WeatherStore(tmp_path / "homebrain" / "weather.db")
    reopened.open()
    assert reopened.load_bias()
    reopened.close()
