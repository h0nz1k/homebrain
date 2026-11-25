# shellcheck shell=bash
# Shared helpers of the git hooks (.githooks/pre-commit, .githooks/pre-push). Sourced, not run.
# Tools are looked up deterministically; a missing tool is an error with a hint, never a skip.

hb_root=$(git rev-parse --show-toplevel)
cd "$hb_root" || exit 1
# Main checkout of this repo (worktrees share its .venv).
hb_main=$(cd "$(git rev-parse --git-common-dir)/.." && pwd)
hb_failed=()

hb_say() { printf '%s\n' "$*" >&2; }

# Run heavy (CPU/RAM) work through the shared `heavy` queue when the host has one.
hb_heavy() {
  if command -v heavy >/dev/null 2>&1; then heavy "$@"; else "$@"; fi
}

hb_missing() { # $1 = tool, $2 = how to get it
  hb_say "✗ chybí nástroj '$1' – $2"
  hb_say "  (brána nic nepřeskakuje; nouzově git commit/push --no-verify)"
  exit 1
}

# ruff: PATH, then .venv of this checkout or of the main checkout.
hb_ruff() {
  local c
  for c in "$(command -v ruff 2>/dev/null)" "$hb_root/.venv/bin/ruff" "$hb_main/.venv/bin/ruff"; do
    if [ -n "$c" ] && [ -x "$c" ]; then
      printf '%s' "$c"
      return 0
    fi
  done
  hb_missing ruff "nainstalujte: pip install -r requirements-test.txt (obsahuje ruff)"
}

# Node tools from the workspace devDependencies (prettier, eslint, tsc, vitest).
hb_node_bin() {
  local c="$hb_root/node_modules/.bin/$1"
  [ -x "$c" ] || hb_missing "$1" "spusťte pnpm install --frozen-lockfile"
  printf '%s' "$c"
}

hb_gitleaks() {
  command -v gitleaks >/dev/null 2>&1 ||
    hb_missing gitleaks "nainstalujte gitleaks 8.30.1 (https://github.com/gitleaks/gitleaks/releases)"
  printf '%s' "$(command -v gitleaks)"
}

# Record a failed check: $1 = what failed, $2 = how to fix it.
hb_fail() {
  hb_failed+=("$1"$'\n'"    oprava: $2")
}

# Print the verdict; returns the hook's exit code.
hb_verdict() { # $1 = hook name, $2 = start (seconds)
  local took=$((SECONDS - $2)) f
  if [ ${#hb_failed[@]} -eq 0 ]; then
    hb_say "$1: OK (${took} s)"
    return 0
  fi
  hb_say ""
  hb_say "$1: SELHALO (${took} s)"
  for f in "${hb_failed[@]}"; do hb_say "  ✗ $f"; done
  hb_say "  Jen v nouzi: --no-verify (CI to stejně chytí)."
  return 1
}
