#!/usr/bin/env bash
set -euo pipefail

usage() {
  echo "Použití: scripts/package-release.sh <tag>  (např. v0.1.0 nebo v0.1.0-rc.1)" >&2
  exit 1
}

[[ $# -eq 1 ]] || usage

tag="$1"

if [[ ! "$tag" =~ ^v[0-9]+\.[0-9]+\.[0-9]+(-(rc|beta|alpha)\.[0-9]+)?$ ]]; then
  echo "Chyba: tag „${tag}“ neodpovídá formátu SemVer (vX.Y.Z nebo vX.Y.Z-rc.N / -beta.N / -alpha.N)." >&2
  exit 1
fi

tag_version="${tag#v}"
repo_root="$(cd "$(dirname "$0")/.." && pwd)"
manifest="${repo_root}/custom_components/homebrain/manifest.json"
panel_js="${repo_root}/custom_components/homebrain/frontend/homebrain-panel.js"
src="${repo_root}/custom_components/homebrain"
out_dir="${repo_root}/dist-release"
zip_path="${out_dir}/homebrain.zip"
sha_path="${out_dir}/homebrain.zip.sha256"

manifest_version="$(node -p "JSON.parse(require('fs').readFileSync('${manifest}','utf8')).version")"

if [[ "$manifest_version" != "$tag_version" ]]; then
  echo "manifest.json version ${manifest_version} != tag ${tag_version}" >&2
  exit 1
fi

if [[ ! -f "$panel_js" ]]; then
  echo "Chyba: chybí sestavený frontend (${panel_js}). Spusťte: pnpm build && pnpm build:integration" >&2
  exit 1
fi

rm -rf "$out_dir"
mkdir -p "$out_dir"

python3 - "$src" "$zip_path" <<'PY'
import os
import sys
import zipfile

src, out = sys.argv[1], sys.argv[2]
skip_dirs = {"__pycache__"}
entries: list[tuple[str, str]] = []

for root, dirs, files in os.walk(src):
    dirs[:] = sorted(d for d in dirs if d not in skip_dirs)
    for name in sorted(files):
        if name == ".DS_Store" or name.endswith(".pyc"):
            continue
        full = os.path.join(root, name)
        arcname = os.path.relpath(full, src)
        entries.append((arcname, full))

entries.sort(key=lambda item: item[0])

with zipfile.ZipFile(out, "w", compression=zipfile.ZIP_DEFLATED) as zf:
    for arcname, full in entries:
        zf.write(full, arcname)
PY

(
  cd "$out_dir"
  sha256sum "$(basename "$zip_path")" > "$(basename "$sha_path")"
)

echo "Vytvořeno: ${zip_path}"
python3 -m zipfile -l "$zip_path"
