#!/usr/bin/env bash
# Maps a list of changed files (stdin, one path per line) to the CI jobs that must run.
# Prints key=value lines: js, python, e2e, e2e_specs (space-separated spec paths; empty = whole suite).
# Rules are documented in docs/ci.md — keep both in sync. Run from the repository root.
set -euo pipefail

js=false
python=false
e2e_full=false
declare -A specs=()

add_glob() {
  local s
  for s in "$@"; do
    [ -f "$s" ] && specs["$s"]=1
  done
  return 0
}

# Module change -> its own specs + specs that render it indirectly.
add_module() {
  local m=$1
  add_glob tests/e2e/"$m"*.spec.ts tests/e2e/shell.spec.ts
  case "$m" in
    # Signal producers feed the "Dnes" (today) dashboard and kiosk.
    energy | health | weather | wine | waste | today) add_glob tests/e2e/today*.spec.ts ;;
  esac
  case "$m" in
    energy | health | wine | today) add_glob tests/e2e/back-navigation.spec.ts ;;
  esac
  case "$m" in
    waste) add_glob tests/e2e/toast.spec.ts ;;
  esac
  # Unknown module without any own spec still gets the shell smoke test (added above).
  return 0
}

while IFS= read -r f || [ -n "$f" ]; do
  [ -z "$f" ] && continue

  # 1) Files that never need build/test (secret scan still runs).
  case "$f" in
    *.md | docs/* | .github/ISSUE_TEMPLATE/* | LICENSE | renovate.json) continue ;;
  esac
  case "$f" in
    apps/* | modules/* | packages/* | custom_components/* | tests/* | scripts/* | ha-test/*) ;;
    *.png | *.jpg | *.jpeg | *.gif | *.webp | *.svg | *.ico) continue ;;
  esac
  # Other workflows have their own triggers; they do not affect the CI suite.
  case "$f" in
    .github/workflows/nightly.yml | .github/workflows/release.yml) continue ;;
  esac

  # 2) Unit-level jobs.
  case "$f" in
    .github/workflows/ci.yml | scripts/ci/*)
      js=true
      python=true
      e2e_full=true
      continue
      ;;
    # Panel contract: generated into packages/ha-client and read by routing.spec.ts.
    custom_components/homebrain/panels.json)
      js=true
      python=true
      e2e_full=true
      continue
      ;;
    *.py | custom_components/* | tests/python/* | requirements-test.txt | pyproject.toml) python=true ;;
    *) js=true ;;
  esac

  # 3) End-to-end scope.
  case "$f" in
    *.test.ts | *.test.tsx | */__tests__/* | */vitest.config.ts | vitest.*.ts) ;; # unit tests only
    tests/e2e/*.spec.ts) add_glob "$f" ;;
    modules/*)
      m=${f#modules/}
      add_module "${m%%/*}"
      ;;
    scripts/waste/*) add_glob tests/e2e/waste*.spec.ts ;;
    apps/* | packages/* | tests/e2e/* | playwright.config.ts | package.json | pnpm-lock.yaml | pnpm-workspace.yaml | tsconfig*.json | .nvmrc)
      e2e_full=true
      ;;
  esac
done

e2e=false
e2e_specs=""
if [ "$e2e_full" = true ]; then
  e2e=true
elif [ "${#specs[@]}" -gt 0 ]; then
  e2e=true
  e2e_specs=$(printf '%s\n' "${!specs[@]}" | sort | tr '\n' ' ' | sed 's/ $//')
fi

printf 'js=%s\npython=%s\ne2e=%s\ne2e_specs=%s\n' "$js" "$python" "$e2e" "$e2e_specs"
