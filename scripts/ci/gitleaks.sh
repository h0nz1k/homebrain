#!/usr/bin/env bash
# Installs a checksum-verified gitleaks binary and scans git history.
# Usage: scripts/ci/gitleaks.sh [<rev-range>]   (no/empty range = full history, all refs)
set -euo pipefail
GITLEAKS_VERSION=${GITLEAKS_VERSION:-8.30.1}
tmp=${RUNNER_TEMP:-$(mktemp -d)}
archive="gitleaks_${GITLEAKS_VERSION}_linux_x64.tar.gz"
base="https://github.com/gitleaks/gitleaks/releases/download/v${GITLEAKS_VERSION}"
curl --fail --silent --show-error --location "$base/$archive" -o "$tmp/$archive"
curl --fail --silent --show-error --location "$base/gitleaks_${GITLEAKS_VERSION}_checksums.txt" -o "$tmp/checksums.txt"
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
