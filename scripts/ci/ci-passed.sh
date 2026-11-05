#!/usr/bin/env bash
# Release helper: did the CI push run for $SHA actually verify the code (tests ran or a verified
# PR result was reused)? Prints tested=true|false (also to GITHUB_OUTPUT). Never fails the job:
# anything unexpected -> tested=false -> release runs the tests itself.
# Env: REPO, SHA, GH_TOKEN. WAIT_SECONDS (default 180) polls while that CI run is still running.
set -uo pipefail
wait_s=${WAIT_SECONDS:-180}
result=false
deadline=$((SECONDS + wait_s))
while :; do
  run=$(gh api "repos/$REPO/actions/workflows/ci.yml/runs?head_sha=$SHA&event=push&per_page=1" \
    --jq '.workflow_runs[0] | select(. != null) | "\(.id) \(.status) \(.conclusion)"' 2>/dev/null)
  read -r id status conclusion <<<"$run"
  echo "CI push run for $SHA: ${run:-none}"
  if [ "${status:-}" = completed ] || [ -z "$run" ] || [ "$SECONDS" -ge "$deadline" ]; then break; fi
  sleep 20
done
if [ "${status:-}" = completed ] && [ "${conclusion:-}" = success ]; then
  # Step names are defined in .github/workflows/ci.yml.
  # shellcheck disable=SC2016 # jq program, not shell
  ok=$(gh api "repos/$REPO/actions/runs/$id/jobs" --jq '
    [.jobs[] | .steps[]? | select(.conclusion == "success") | .name] as $s
    | if ($s | index("Reuse verified PR result")) != null then "true"
      elif ($s | index("Unit tests (vitest)")) != null and ($s | index("Python tests (pytest)")) != null then "true"
      else "false" end' 2>/dev/null)
  [ "$ok" = true ] && result=true
fi
echo "tested=$result"
if [ -n "${GITHUB_OUTPUT:-}" ]; then echo "tested=$result" >>"$GITHUB_OUTPUT"; fi
