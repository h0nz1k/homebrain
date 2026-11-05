#!/usr/bin/env bash
# CI gate (first steps of the `js` job). Decides which heavy work runs and what gitleaks scans.
# Outputs (GITHUB_OUTPUT): js, python, e2e, e2e_specs, reused, scan_range (empty = full history).
# See docs/ci.md for the rules.
#
# Env: EVENT_NAME, DRAFT, PR_NUMBER, PR_BASE_SHA, PR_HEAD_SHA (pull_request); BEFORE, AFTER (push);
#      REPO, GH_TOKEN (reuse check). Requires full git history (fetch-depth: 0).
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
zero=0000000000000000000000000000000000000000

emit() {
  echo "$1=$2"
  if [ -n "${GITHUB_OUTPUT:-}" ]; then echo "$1=$2" >>"$GITHUB_OUTPUT"; fi
}

skip_all() {
  emit js false
  emit python false
  emit e2e false
  emit e2e_specs ""
}

from_files() { # $1 = newline-separated file list
  local line
  while IFS= read -r line; do
    emit "${line%%=*}" "${line#*=}"
  done < <(printf '%s\n' "$1" | bash "$here/changes.sh")
}

# Push to main: was exactly this tree (on exactly this base) already green in the PR's CI run?
reuse_ok() {
  local pr head head_repo want_tree run job
  [ -n "${GH_TOKEN:-}" ] && [ -n "${REPO:-}" ] || return 1
  pr=$(gh api "repos/$REPO/commits/$AFTER/pulls" --jq \
    "[.[] | select(.merged_at != null and .merge_commit_sha == \"$AFTER\" and .base.ref == \"main\")][0]
     | select(. != null) | \"\(.number) \(.head.sha) \(.head.repo.full_name)\"") || return 1
  [ -n "$pr" ] || {
    echo "reuse: no merged PR for $AFTER"
    return 1
  }
  read -r _ head head_repo <<<"$pr"
  echo "reuse: PR #${pr%% *}, head $head ($head_repo)"
  [ "$head_repo" = "$REPO" ] || {
    echo "reuse: fork PR, not trusted"
    return 1
  }
  want_tree=$(git rev-parse "$AFTER^{tree}")
  for run in $(gh api "repos/$REPO/actions/workflows/ci.yml/runs?head_sha=$head&event=pull_request&status=success&per_page=10" \
    --jq '.workflow_runs[].id'); do
    job=$(gh api "repos/$REPO/actions/runs/$run/jobs" --jq '.jobs[] | select(.name == "js") | .id' | head -n1)
    [ -n "$job" ] || continue
    # curl, not `gh api`: gh refuses to print logs containing terminal escape sequences.
    if curl -fsSL -H "Authorization: Bearer $GH_TOKEN" "https://api.github.com/repos/$REPO/actions/jobs/$job/logs" 2>/dev/null |
      grep -qE "HB_TESTED tree=$want_tree base=$BEFORE( |\$|\r)"; then
      echo "reuse: run $run tested tree $want_tree on base $BEFORE -> skipping duplicate suite"
      return 0
    fi
  done
  echo "reuse: no green PR run with tree $want_tree on base $BEFORE"
  return 1
}

case "${EVENT_NAME:-}" in
  pull_request)
    emit scan_range "$PR_BASE_SHA..$PR_HEAD_SHA"
    emit reused false
    # The payload's draft flag can be stale: a push racing `gh pr ready` gets a run with draft=true,
    # and concurrency may cancel the ready_for_review run. Ask for the live state instead.
    if [ -n "${PR_NUMBER:-}" ] && [ -n "${GH_TOKEN:-}" ] &&
      live=$(gh api "repos/$REPO/pulls/$PR_NUMBER" --jq .draft 2>/dev/null) && [ -n "$live" ]; then
      [ "$live" != "$DRAFT" ] && echo "draft: payload=$DRAFT live=$live -> using live state"
      DRAFT=$live
    fi
    if [ "${DRAFT:-false}" = true ]; then
      echo "Draft PR: secret scan only (mark ready for review to run the suite)."
      skip_all
      exit 0
    fi
    # Checkout is the PR merge commit (first parent = base). Read back by reuse_ok on merge.
    echo "HB_TESTED tree=$(git rev-parse 'HEAD^{tree}') base=$(git rev-parse HEAD^1)"
    from_files "$(git diff --name-only HEAD^1 HEAD)"
    ;;
  push)
    if [ -n "${BEFORE:-}" ] && [ "$BEFORE" != "$zero" ] && git cat-file -e "$BEFORE^{commit}" 2>/dev/null; then
      emit scan_range "$BEFORE..$AFTER"
      files=$(git diff --name-only "$BEFORE" "$AFTER")
      if printf '%s\n' "$files" | grep -qE '^(\.github/|scripts/ci/)'; then
        echo "reuse: CI definition changed, running everything"
        emit reused false
      elif reuse_ok; then
        emit reused true
        skip_all
        exit 0
      else
        emit reused false
      fi
      from_files "$files"
    else
      emit scan_range ""
      emit reused false
      from_files "$(git ls-files)"
    fi
    ;;
  *)
    emit scan_range ""
    emit reused false
    from_files "$(git ls-files)"
    ;;
esac
