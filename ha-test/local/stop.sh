#!/usr/bin/env bash
# Zastavení lokálního testovacího HA (Refs #8).
set -euo pipefail
runtime_dir="${HB_HA_DIR:-${TMPDIR:-/tmp}/homebrain-ha}"
if [[ -f "$runtime_dir/hass.pid" ]]; then
  pid="$(cat "$runtime_dir/hass.pid")"
  if kill -0 "$pid" 2>/dev/null; then
    kill "$pid"
    for ((attempt = 0; attempt < 60; attempt++)); do
      if ! kill -0 "$pid" 2>/dev/null || [[ "$(ps -o stat= -p "$pid")" == Z* ]]; then
        rm -f "$runtime_dir/hass.pid"
        echo 'Testovací HA je zastaven.'
        exit 0
      fi
      sleep 1
    done
    echo 'Testovací HA se nezastavil do 60 sekund.' >&2
    exit 1
  fi
  rm -f "$runtime_dir/hass.pid"
fi
