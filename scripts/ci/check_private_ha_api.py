#!/usr/bin/env python3
"""CI guard (#27): no new private Home Assistant API usage in the integration.

Fails on, outside ``scripts/ci/private_ha_api_allowlist.txt``:

* ``hass.data["<foreign key>"]`` (also ``.get/.setdefault/.pop``) – any string key other
  than our own ``"homebrain"``, or a key constant imported from ``homeassistant.*``;
* ``from homeassistant.components.<x>.const import …`` / ``import …const`` – component
  ``const`` modules are internal; import from the component package instead.

Allowlist lines: ``<path>:<rule>:<detail>`` (``#`` comments). Usage:
``python scripts/ci/check_private_ha_api.py [root]`` – exit 1 with one line per finding.
"""

from __future__ import annotations

import ast
import re
import sys
from pathlib import Path

OWN_KEYS = {"homebrain"}
OWN_NAMES = {"DOMAIN"}
DATA_METHODS = {"get", "setdefault", "pop", "__getitem__", "__contains__"}
CONST_IMPORT = re.compile(r"^homeassistant\.components\.[a-z0-9_]+\.const$")
ALLOWLIST = Path(__file__).with_name("private_ha_api_allowlist.txt")
SCAN = "custom_components/homebrain"


def _is_hass_data(node: ast.AST) -> bool:
    if not (isinstance(node, ast.Attribute) and node.attr == "data"):
        return False
    owner = node.value
    return (isinstance(owner, ast.Name) and owner.id == "hass") or (
        isinstance(owner, ast.Attribute) and owner.attr == "hass"
    )


def _key_name(key: ast.AST, ha_names: set[str]) -> str | None:
    """Foreign key description, ``None`` when the key is ours or not statically known."""
    if isinstance(key, ast.Constant) and isinstance(key.value, str):
        return None if key.value in OWN_KEYS else key.value
    if isinstance(key, ast.Name) and key.id not in OWN_NAMES and key.id in ha_names:
        return key.id
    return None


def check_source(source: str, path: str) -> list[tuple[str, str, str, int]]:
    """``(path, rule, detail, line)`` findings for one file."""
    tree = ast.parse(source, filename=path)
    findings: list[tuple[str, str, str, int]] = []
    ha_names: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.ImportFrom) and (node.module or "").startswith("homeassistant"):
            ha_names.update(alias.asname or alias.name for alias in node.names)
            if CONST_IMPORT.match(node.module or ""):
                findings.append((path, "import", node.module or "", node.lineno))
        elif isinstance(node, ast.Import):
            for alias in node.names:
                if CONST_IMPORT.match(alias.name):
                    findings.append((path, "import", alias.name, node.lineno))
    for node in ast.walk(tree):
        key = None
        if isinstance(node, ast.Subscript) and _is_hass_data(node.value):
            key = node.slice
        elif (
            isinstance(node, ast.Call)
            and isinstance(node.func, ast.Attribute)
            and node.func.attr in DATA_METHODS
            and _is_hass_data(node.func.value)
            and node.args
        ):
            key = node.args[0]
        elif isinstance(node, ast.Compare) and any(_is_hass_data(c) for c in node.comparators):
            key = node.left
        if key is not None and (name := _key_name(key, ha_names)) is not None:
            findings.append((path, "hass-data", name, node.lineno))
    return findings


def load_allowlist(path: Path = ALLOWLIST) -> set[tuple[str, str, str]]:
    entries = set()
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.split("#", 1)[0].strip()
        if line:
            file, rule, detail = line.split(":", 2)
            entries.add((file, rule, detail))
    return entries


def check_tree(root: Path) -> list[str]:
    allow = load_allowlist()
    out = []
    for file in sorted((root / SCAN).rglob("*.py")):
        rel = file.relative_to(root).as_posix()
        for path, rule, detail, line in check_source(file.read_text(encoding="utf-8"), rel):
            if (path, rule, detail) not in allow:
                out.append(f"{path}:{line}: private HA API ({rule}: {detail})")
    return out


def main(argv: list[str]) -> int:
    root = Path(argv[1]) if len(argv) > 1 else Path(__file__).resolve().parents[2]
    findings = check_tree(root)
    for finding in findings:
        print(finding)
    if findings:
        print(
            f"{len(findings)} private Home Assistant API use(s); use the public API or "
            "document the exception in scripts/ci/private_ha_api_allowlist.txt (#27)."
        )
        return 1
    print("private HA API guard: OK")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
