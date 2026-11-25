"""The .githooks/pre-commit gate in a throwaway git repo with synthetic files."""

from __future__ import annotations

import os
import shutil
import subprocess
import sys
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[2]
CONFIGS = (".gitleaks.toml", "pyproject.toml", ".prettierrc.json", ".prettierignore")


def _ruff() -> str | None:
    venv_ruff = Path(sys.executable).with_name("ruff")
    return shutil.which("ruff") or (str(venv_ruff) if venv_ruff.is_file() else None)


def _missing_tool() -> str | None:
    if shutil.which("git") is None:
        return "git"
    if shutil.which("gitleaks") is None:
        return "gitleaks"
    if _ruff() is None:
        return "ruff"
    if not (REPO / "node_modules" / ".bin" / "prettier").exists():
        return "prettier (pnpm install)"
    return None


pytestmark = pytest.mark.skipif(
    _missing_tool() is not None, reason=f"pre-commit hook potřebuje nástroj: {_missing_tool()}"
)


@pytest.fixture
def repo(tmp_path: Path) -> Path:
    """Empty repo wired to this checkout's hooks, configs and node_modules."""
    shutil.copytree(REPO / ".githooks", tmp_path / ".githooks")
    for name in CONFIGS:
        shutil.copy(REPO / name, tmp_path / name)
    (tmp_path / "node_modules").symlink_to(REPO / "node_modules")
    (tmp_path / ".gitignore").write_text("node_modules\n")
    git = ["git", "-C", str(tmp_path)]
    subprocess.run([*git, "init", "-q"], check=True)
    subprocess.run([*git, "config", "user.name", "Test"], check=True)
    subprocess.run([*git, "config", "user.email", "test@example.com"], check=True)
    subprocess.run([*git, "config", "core.hooksPath", ".githooks"], check=True)
    return tmp_path


def commit(repo: Path, files: dict[str, str]) -> subprocess.CompletedProcess[str]:
    """Stage ``files`` and run ``git commit`` (hooks included); ruff comes via PATH."""
    for rel, text in files.items():
        (repo / rel).parent.mkdir(parents=True, exist_ok=True)
        (repo / rel).write_text(text)
    subprocess.run(["git", "-C", str(repo), "add", *files], check=True)
    env = {**os.environ, "PATH": f"{Path(_ruff()).parent}{os.pathsep}{os.environ['PATH']}"}
    return subprocess.run(
        ["git", "-C", str(repo), "commit", "-qm", "test"],
        capture_output=True,
        text=True,
        env=env,
        check=False,
    )


def test_clean_python_passes(repo: Path) -> None:
    res = commit(repo, {"demo/clean.py": '"""Demo."""\n\nVALUE = {"a": 1}\n'})
    assert res.returncode == 0, res.stderr
    assert "pre-commit: OK" in res.stderr


def test_unformatted_python_fails(repo: Path) -> None:
    res = commit(repo, {"demo/ugly.py": 'VALUE = {"a":1}\n'})
    assert res.returncode != 0
    assert "ruff format --check" in res.stderr
    assert "ruff format demo/ugly.py" in res.stderr


def test_partially_staged_file_is_judged_by_the_index(repo: Path) -> None:
    (repo / "demo").mkdir()
    (repo / "demo/mixed.py").write_text('VALUE = {"a": 1}\n')
    subprocess.run(["git", "-C", str(repo), "add", "demo/mixed.py"], check=True)
    (repo / "demo/mixed.py").write_text('VALUE = {"a": 1}\nOTHER={"b":2}\n')  # unstaged mess
    res = commit(repo, {})
    assert res.returncode == 0, res.stderr


def test_secret_fails(repo: Path) -> None:
    # Assembled at runtime so that gitleaks over this repository stays clean.
    token = ".".join(["ey" + "J" + "hbGciOiJIUzI1NiJ9", "ey" + "J" + "zdWIiOiJkZW1vIn0", "c" * 24])
    res = commit(repo, {"demo/config.py": f'TOKEN = "{token}"\n'})
    assert res.returncode != 0
    assert "gitleaks" in res.stderr
    assert token not in res.stderr  # --redact
