"""Egg-timer calibration script: fits yolk temperatures to the reference app times."""

import importlib.util
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
FIXTURE = ROOT / "tests" / "fixtures" / "egg-timer" / "observations.json"
_spec = importlib.util.spec_from_file_location(
    "fit_egg_timer", ROOT / "scripts" / "fit_egg_timer.py"
)
fit_egg_timer = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(fit_egg_timer)


def _observations():
    return json.loads(FIXTURE.read_text(encoding="utf-8"))["observations"]


def test_williams_textbook_values():
    assert abs(fit_egg_timer.williams_minutes(57, 4, 100, 63) - 4.5) < 0.1
    assert abs(fit_egg_timer.williams_minutes(58, 5, 99, 77) - 7.96) < 0.05
    assert fit_egg_timer.williams_minutes(58, 70, 99, 66) == 0


YOLK = {"namekko": 63.2, "nahnilicko": 68.1, "natvrdo": 81.9}


def test_fit_reproduces_reference_times_within_5_s():
    result = fit_egg_timer.fit(_observations())
    for doneness, yolk in YOLK.items():
        assert abs(result["yolkC"][doneness] - yolk) < 0.3, result["yolkC"]
    assert abs(result["perExtraEggS"] - 20) < 2
    assert result["countFitted"] is True
    assert len(result["rows"]) == 9
    assert all(abs(r["error_s"]) <= 5 for r in result["rows"])
    assert result["quailSeconds"] == {"namekko": 140, "nahnilicko": 180}


def test_shipped_constants_match_fixture():
    """eggs.ts EGG_MODEL must stay on the fitted constants."""
    source = (ROOT / "modules/recipes/src/domain/eggs.ts").read_text(encoding="utf-8")
    assert "namekko: { label: 'Naměkko', yolkC: 63.2, calibrated: true }" in source
    assert "nahnilicko: { label: 'Nahniličko', yolkC: 68.1, calibrated: true }" in source
    assert "natvrdo: { label: 'Natvrdo', yolkC: 81.9, calibrated: true }" in source
    assert "massG: { S: 48.1, M: 58, L: 70.9, XL: 76.9 }" in source
    assert "perExtraEggS: 20," in source
    for obs in _observations():
        if obs["kind"] == "chicken":
            assert abs(fit_egg_timer.predict(obs, YOLK[obs["doneness"]]) - obs["seconds"]) <= 5


def test_single_count_keeps_default_per_egg():
    rows = [o for o in _observations() if o["count"] == 3]
    result = fit_egg_timer.fit(rows)
    assert result["countFitted"] is False and result["perExtraEggS"] == 20


def test_cli_prints_table(capsys):
    assert fit_egg_timer.main([str(FIXTURE)]) == 0
    out = capsys.readouterr().out
    assert "RMSE" in out and '"namekko"' in out
