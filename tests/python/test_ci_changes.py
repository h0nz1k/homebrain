"""scripts/ci/changes.sh: which CI jobs a changed path triggers (rules in docs/ci.md).

Covers the dev-tooling routes only; the rest of the mapping is exercised by every CI run.
"""

from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[2]

pytestmark = pytest.mark.skipif(shutil.which("bash") is None, reason="changes.sh potřebuje bash")


def jobs(*paths: str) -> dict[str, str]:
    """Run changes.sh on ``paths`` and return its key=value output."""
    res = subprocess.run(
        ["bash", "scripts/ci/changes.sh"],
        input="".join(f"{p}\n" for p in paths),
        cwd=REPO,
        capture_output=True,
        text=True,
        check=True,
    )
    return dict(line.split("=", 1) for line in res.stdout.splitlines())


@pytest.mark.parametrize(
    "path",
    [
        ".githooks/pre-commit",
        ".githooks/_lib.sh",
        "scripts/install-hooks.sh",
        "scripts/codemap.py",
        "scripts/codemap-ts.mjs",
        "tests/python/test_githooks.py",
        "tests/python/test_codemap.py",
    ],
)
def test_dev_tooling_runs_python_job(path: str) -> None:
    out = jobs(path)
    assert out["python"] == "true"
    assert out["e2e"] == "false"


def test_docs_only_runs_nothing() -> None:
    assert jobs("docs/ci.md", "CLAUDE.md") == {
        "js": "false",
        "python": "false",
        "e2e": "false",
        "e2e_specs": "",
    }
