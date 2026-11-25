"""scripts/codemap.py on a synthetic git tree: docs, signatures, imports, views, determinism."""

from __future__ import annotations

import importlib.util
import json
import shutil
import subprocess
import sys
import textwrap
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[2]
_spec = importlib.util.spec_from_file_location("hb_codemap", REPO / "scripts" / "codemap.py")
codemap = importlib.util.module_from_spec(_spec)
sys.modules["hb_codemap"] = codemap  # dataclasses look the module up
_spec.loader.exec_module(codemap)

PY_TREE = {
    "custom_components/demo/__init__.py": '"""Demo integration."""\n',
    "custom_components/demo/const.py": '"""Shared constants."""\n\nDOMAIN = "demo"\n',
    "custom_components/demo/tariff/__init__.py": "",
    "custom_components/demo/tariff/store.py": '''
        """Price store for one day."""


        class PriceStore:
            """Holds hourly prices."""

            def get(self, hour: int) -> float:
                """Return the price for an hour."""
                return 1.0

            def _hidden(self) -> None:
                pass
        ''',
    "custom_components/demo/tariff/advisor.py": '''
        """Compute advice from prices.

        Longer text that the map does not show.
        """

        from datetime import datetime

        from custom_components.demo import tariff

        from ..const import DOMAIN
        from .store import PriceStore


        class Advisor(PriceStore):
            """Holds state for one tariff."""

            def advise(self, now: datetime) -> str:
                """Return the advice for now.

                Details.
                """
                return DOMAIN

            def bare(self, x: int = 1, *args, **kw) -> None:
                pass


        async def fetch(hass, *, limit: int | None = None) -> list[str]:
            return [str(tariff)]


        def _private() -> None:
            """Not part of the map."""
        ''',
    "scripts/tool.py": "import custom_components.demo.const\n",
    "tests/python/test_demo.py": '"""A test."""\n',
}


def _write_tree(root: Path, files: dict[str, str]) -> None:
    for rel, text in files.items():
        path = root / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(textwrap.dedent(text).lstrip("\n"), encoding="utf-8")
    subprocess.run(["git", "init", "-q"], cwd=root, check=True)
    subprocess.run(["git", "add", "-A"], cwd=root, check=True)


@pytest.fixture
def tree(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    _write_tree(tmp_path, PY_TREE)
    monkeypatch.chdir(tmp_path)
    return tmp_path


def run(capsys: pytest.CaptureFixture[str], root: Path, *args: str) -> str:
    assert codemap.main(["--root", str(root), *args]) == 0
    return capsys.readouterr().out


def test_python_outline(tree: Path, capsys: pytest.CaptureFixture[str]) -> None:
    out = run(capsys, tree, "custom_components/demo/tariff/advisor.py")
    assert out == (
        "custom_components/demo/tariff/advisor.py — Compute advice from prices.\n"
        "  deps: custom_components/demo/const.py, custom_components/demo/tariff/__init__.py, "
        "custom_components/demo/tariff/store.py\n"
        "  class Advisor(PriceStore) — Holds state for one tariff.\n"
        "    advise(self, now: datetime) -> str — Return the advice for now.\n"
        "    bare(self, x: int=1, *args, **kw) -> None —\n"
        "  async fetch(hass, *, limit: int | None=None) -> list[str] —\n"
    )


def test_scope_excludes_tests_by_default(tree: Path, capsys: pytest.CaptureFixture[str]) -> None:
    out = run(capsys, tree, "--deps-only")
    assert "tests/python/test_demo.py" not in out
    assert "scripts/tool.py\n  deps: custom_components/demo/const.py\n" in out
    assert "tests/python/test_demo.py" in run(capsys, tree, "--deps-only", "--include-tests")


def test_rdeps_transitive(tree: Path, capsys: pytest.CaptureFixture[str]) -> None:
    out = run(capsys, tree, "--rdeps", "custom_components/demo/tariff/store.py")
    assert out == (
        "rdeps custom_components/demo/tariff/store.py (hloubka 1): 1 souborů\n"
        "  [1] custom_components/demo/tariff/advisor.py\n"
    )
    data = json.loads(
        run(
            capsys,
            tree,
            "--rdeps",
            "custom_components/demo/const.py",
            "--depth",
            "3",
            "--format",
            "json",
        )
    )
    assert data["rdeps"] == [
        {
            "path": "custom_components/demo/tariff/advisor.py",
            "depth": 1,
            "via": "custom_components/demo/const.py",
        },
        {"path": "scripts/tool.py", "depth": 1, "via": "custom_components/demo/const.py"},
    ]


def test_missing_docs(tree: Path, capsys: pytest.CaptureFixture[str]) -> None:
    out = run(capsys, tree, "--missing-docs")
    assert "custom_components/demo/tariff/advisor.py: Advisor.bare, fetch\n" in out
    assert "custom_components/demo/tariff/__init__.py: (modul)\n" in out
    assert "scripts/tool.py: (modul)\n" in out
    assert "  custom_components/demo/tariff  3/9\n" in out
    data = json.loads(run(capsys, tree, "--missing-docs", "--format", "json"))
    assert data["summary"]["custom_components/demo/tariff"] == [3, 9]


def test_max_chars_says_what_was_cut(tree: Path, capsys: pytest.CaptureFixture[str]) -> None:
    out = run(capsys, tree, "--max-chars", "300")
    assert len(out) <= 300
    assert out.startswith("custom_components/demo/__init__.py — Demo integration.\n")
    assert "… zkráceno (--max-chars 300): vynecháno 4 z 6 bloků" in out


def test_deterministic(tree: Path, capsys: pytest.CaptureFixture[str]) -> None:
    for args in ((), ("--format", "json"), ("--missing-docs",)):
        assert run(capsys, tree, *args) == run(capsys, tree, *args)


def test_unknown_path_is_an_error(tree: Path, capsys: pytest.CaptureFixture[str]) -> None:
    assert codemap.main(["--root", str(tree), "custom_components/nothing"]) == 2
    assert "nejsou zdrojové soubory" in capsys.readouterr().err


TS_TREE = {
    "packages/lib/package.json": '{"name": "@demo/lib"}\n',
    "packages/lib/src/index.ts": """
        /** Shared helpers of the demo workspace. */

        import { helper } from './inner.js';

        /** Add two numbers. */
        export function add(a: number, b: number): number {
          return helper(a) + b;
        }

        export interface Options {
          verbose: boolean;
        }

        export class Counter {
          /** Bump the counter. */
          bump(by = 1): number {
            return by;
          }
          private secret(): void {}
        }

        export const double = (n: number): number => n * 2;
        export * from './inner.js';
        """,
    "packages/lib/src/inner.ts": "export const helper = (n: number) => n;\n",
    "modules/app/src/main.ts": """
        import { add } from '@demo/lib';
        import { util } from './util.js';

        /** Entry point. */
        export const run = () => add(util, 1);
        """,
    "modules/app/src/util.ts": "export const util = 1;\n",
    "modules/app/src/data.gen.ts": "export const DATA = 1;\n",
}


def _ts_available() -> bool:
    return shutil.which("node") is not None and (REPO / "node_modules" / "typescript").is_dir()


@pytest.mark.skipif(
    not _ts_available(), reason="TS část potřebuje node a devDependency typescript (pnpm install)"
)
def test_typescript_outline_and_imports(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    _write_tree(tmp_path, TS_TREE)
    monkeypatch.chdir(tmp_path)
    out = run(capsys, tmp_path, "packages/lib/src/index.ts")
    assert out == (
        "packages/lib/src/index.ts — Shared helpers of the demo workspace.\n"
        "  deps: packages/lib/src/inner.ts\n"
        "  add(a: number, b: number): number — Add two numbers.\n"
        "  interface Options —\n"
        "  class Counter —\n"
        "    bump(by = 1): number — Bump the counter.\n"
        "  double(n: number): number —\n"
        "  export * from './inner.js'\n"
    )
    app = run(capsys, tmp_path, "--deps-only", "modules/app")
    assert "data.gen.ts" not in app
    assert "modules/app/src/main.ts\n  deps: modules/app/src/util.ts, packages/lib\n" in app
    rd = run(capsys, tmp_path, "--rdeps", "packages/lib/src/index.ts")
    assert rd.splitlines()[1:] == ["  [1] modules/app/src/main.ts"]
