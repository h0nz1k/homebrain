#!/usr/bin/env bash
# Points git at the versioned hooks in .githooks/ (pre-commit, pre-push). Idempotent; run once
# per clone. Note: core.hooksPath lives in the repo config, shared by all its worktrees.
# Bypass in an emergency only: git commit --no-verify / git push --no-verify (CI still checks).
set -euo pipefail
root=$(git rev-parse --show-toplevel)
cd "$root"
want=.githooks
current=$(git config --get core.hooksPath || true)
if [ "$current" = "$want" ]; then
  echo "install-hooks: už nastaveno (core.hooksPath=$want)"
else
  git config core.hooksPath "$want"
  echo "install-hooks: core.hooksPath ${current:-<výchozí>} → $want"
fi
chmod +x "$want/pre-commit" "$want/pre-push"
echo "install-hooks: aktivní hooky: pre-commit (staged: gitleaks, ruff, prettier, eslint), pre-push (dotčené testy proti origin/main)"
