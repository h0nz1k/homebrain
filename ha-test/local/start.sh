#!/usr/bin/env bash
# Lokální testovací HA bez Dockeru (Refs #8).
set -euo pipefail
repo_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
runtime_dir="${HB_HA_DIR:-${TMPDIR:-/tmp}/homebrain-ha}"
venv_dir="${HB_HA_VENV:-$runtime_dir/venv}"
port="${HB_HA_PORT:-8123}"
if [[ $# -gt 1 || ( $# -eq 1 && "$1" != --reset ) ]]; then
  echo 'Použití: start.sh [--reset]' >&2
  exit 1
fi
if [[ -f "$runtime_dir/hass.pid" ]] && kill -0 "$(cat "$runtime_dir/hass.pid")" 2>/dev/null; then
  echo 'Testovací HA už běží. Nejprve spusťte stop.sh.' >&2
  exit 1
fi
uv_bin="${HB_UV:-$(command -v uv || true)}"
pip_install() {
  if [[ -n "$uv_bin" ]]; then
    "$uv_bin" pip install --python "$venv_dir/bin/python" "$@"
  else
    "$venv_dir/bin/python" -m pip install "$@"
  fi
}
if [[ ! -x "$venv_dir/bin/hass" ]]; then
  if [[ -n "$uv_bin" ]]; then
    "$uv_bin" venv --python 3.14 "$venv_dir"
  else
    python3 -m venv "$venv_dir"
  fi
  pip_install homeassistant==2026.10.4
fi
# assist_pipeline (natahují ho služby light/climate/…) potřebuje nativní balíčky bez
# wheelů pro Python 3.14. Bez nich padá WS `get_services` a frontend HA zůstane na
# „Načítání…“. Na hostu bez kompilátoru C++ použijeme `zig c++` z PyPI balíčku ziglang.
native_reqs=(pymicro-vad==1.0.1 pyspeex-noise==1.0.2)
if ! "$venv_dir/bin/python" -c 'import pymicro_vad, pyspeex_noise' 2>/dev/null; then
  if ! command -v c++ >/dev/null; then
    zig_dir="$runtime_dir/zig"
    if [[ ! -x "$zig_dir/venv/bin/python" ]]; then
      python3 -m venv "$zig_dir/venv"
      "$zig_dir/venv/bin/python" -m pip install --quiet ziglang
    fi
    mkdir -p "$zig_dir/bin"
    for tool in c++:c++ g++:c++ cc:cc gcc:cc; do
      # zig ld nezná --exclude-libs (setuptools ho přidává při linkování).
      cat >"$zig_dir/bin/${tool%%:*}" <<EOF
#!/bin/sh
for a; do shift; case "\$a" in -Wl,--exclude-libs*) ;; *) set -- "\$@" "\$a";; esac; done
exec "$zig_dir/venv/bin/python" -m ziglang ${tool#*:} "\$@"
EOF
      chmod +x "$zig_dir/bin/${tool%%:*}"
    done
    PATH="$zig_dir/bin:$PATH" pip_install "${native_reqs[@]}"
  else
    pip_install "${native_reqs[@]}"
  fi
fi
if [[ "${1:-}" == --reset ]]; then
  if [[ "$runtime_dir" != /* || "$runtime_dir" == / ]]; then
    echo 'HB_HA_DIR musí být absolutní cesta k testovacímu adresáři.' >&2
    exit 1
  fi
  rm -rf -- "$runtime_dir/config"
fi
mkdir -p "$runtime_dir/config/custom_components" "$runtime_dir/config/.storage"
cp "$repo_dir/ha-test/local/configuration.yaml" "$runtime_dir/config/configuration.yaml"
ln -sfn "$repo_dir/custom_components/homebrain" "$runtime_dir/config/custom_components/homebrain"
"$venv_dir/bin/python" - "$runtime_dir/config/.storage/http" "$port" <<'PY'
import json
from datetime import datetime, timezone
from pathlib import Path
import sys

from homeassistant.components.http.config import HTTP_STORAGE_SCHEMA

path = Path(sys.argv[1])
if not path.exists():
    stable = dict(HTTP_STORAGE_SCHEMA({
        "server_host": ["127.0.0.1"],
        "server_port": int(sys.argv[2]),
        "cors_allowed_origins": ["https://cast.home-assistant.io"],
        "login_attempts_threshold": -1,
        "ip_ban_enabled": True,
        "ssl_profile": "modern",
        "use_x_frame_options": True,
    }))
    stable.update(created_at=datetime.now(timezone.utc).isoformat(), error=None, error_message=None)
    path.write_text(json.dumps({
        "version": 2, "minor_version": 2, "key": "http",
        "data": {"stable": stable, "pending": None, "yaml_migration_done": True},
    }))
    path.chmod(0o600)
else:
    data = json.loads(path.read_text())["data"]
    if (data["stable"].get("server_host") != ["127.0.0.1"]
            or data["stable"].get("server_port") != int(sys.argv[2])
            or data.get("pending") is not None):
        sys.exit("HTTP konfigurace neodpovídá lokálnímu portu; použijte --reset.")
PY
nohup "$venv_dir/bin/hass" -c "$runtime_dir/config" >"$runtime_dir/hass.log" 2>&1 </dev/null &
echo "$!" > "$runtime_dir/hass.pid"
deadline=$((SECONDS + 300))
until curl --silent --fail "http://127.0.0.1:$port/api/onboarding" >/dev/null; do
  if ! kill -0 "$(cat "$runtime_dir/hass.pid")" 2>/dev/null || (( SECONDS >= deadline )); then
    echo 'Testovací HA se do 300 sekund nespustil. Poslední záznamy:' >&2
    tail -n 80 "$runtime_dir/hass.log" >&2
    exit 1
  fi
  sleep 2
done
echo "Testovací HA je připraven na http://127.0.0.1:$port."
