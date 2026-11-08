#!/usr/bin/env bash
# Installs a checksum-verified gitleaks binary and scans git history.
# Usage: scripts/ci/gitleaks.sh [<rev-range>]   (no/empty range = full history, all refs)
set -euo pipefail
GITLEAKS_VERSION=${GITLEAKS_VERSION:-8.30.1}
tmp=${RUNNER_TEMP:-$(mktemp -d)}
archive="gitleaks_${GITLEAKS_VERSION}_linux_x64.tar.gz"
base="https://github.com/gitleaks/gitleaks/releases/download/v${GITLEAKS_VERSION}"
# github.com/.../releases/download sometimes returns 502/504 for long stretches while the REST API
# asset endpoint keeps working, so: short retry on the release URL, then fall back to the API.
# Integrity is unaffected: the archive is still verified against the published checksums.
curl_opts=(--fail --silent --show-error --location --retry 3 --retry-delay 3 --retry-all-errors --connect-timeout 20)
auth=()
if [ -n "${GH_TOKEN:-}" ]; then auth=(-H "Authorization: Bearer $GH_TOKEN"); fi
release_json=""
fetch() { # fetch <asset-name> <dest>
  if curl "${curl_opts[@]}" "$base/$1" -o "$2"; then return 0; fi
  echo "gitleaks: release download of $1 failed, falling back to the REST API" >&2
  if [ -z "$release_json" ]; then
    release_json=$(curl "${curl_opts[@]}" "${auth[@]}" \
      "https://api.github.com/repos/gitleaks/gitleaks/releases/tags/v${GITLEAKS_VERSION}")
  fi
  local id
  id=$(printf '%s' "$release_json" | python3 -c 'import json,sys; n=sys.argv[1]; print(next(a["id"] for a in json.load(sys.stdin)["assets"] if a["name"]==n))' "$1")
  curl "${curl_opts[@]}" "${auth[@]}" -H "Accept: application/octet-stream" \
    "https://api.github.com/repos/gitleaks/gitleaks/releases/assets/$id" -o "$2"
}
fetch "$archive" "$tmp/$archive"
fetch "gitleaks_${GITLEAKS_VERSION}_checksums.txt" "$tmp/checksums.txt"
(cd "$tmp" && grep " $archive\$" checksums.txt | sha256sum --check --strict)
mkdir -p "$tmp/gitleaks-bin"
tar -xzf "$tmp/$archive" -C "$tmp/gitleaks-bin" gitleaks
range=${1:-}
if [ -n "$range" ]; then
  echo "gitleaks: scanning $range"
  "$tmp/gitleaks-bin/gitleaks" git --config .gitleaks.toml --redact --log-opts="$range" .
else
  echo "gitleaks: scanning full history (--all)"
  "$tmp/gitleaks-bin/gitleaks" git --config .gitleaks.toml --redact --log-opts="--all" .
fi
