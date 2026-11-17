#!/usr/bin/env bash
# Guards the supply-chain rules of this repo:
#   1. a 14-day install cooldown for npm and Poetry, with no exclusions;
#   2. no pip or pipx install from a version range;
#   3. every GitHub Action pinned by commit, with its version as a comment.
# To bump Poetry: change the version in .github/workflows/ci.yml and
# backend/Dockerfile together (the "one Poetry version" check fails when they differ).
#
# Usage: ./scripts/tests/test-supply-chain.sh
set -uo pipefail
cd "$(dirname "$0")/../.." || exit 1

failures=0
pass() { echo "PASS  $1"; }
fail() { echo "FAIL  $1"; failures=$((failures + 1)); }
check() { # check <name> <command...>
  local name=$1
  shift
  if "$@"; then pass "$name"; else fail "$name"; fi
}
# none <command...>: passes when the command prints nothing; prints offenders.
none() {
  local out
  out=$("$@")
  [ -z "$out" ] && return 0
  echo "$out" | sed 's/^/      /'
  return 1
}

# 1. Cooldown beside every manifest.
manifests_without_cooldown() {
  local f dir
  git ls-files '*package.json' | while IFS= read -r f; do
    dir=$(dirname "$f")
    grep -qx 'min-release-age=14' "$dir/.npmrc" 2>/dev/null || echo "$dir/.npmrc"
  done
  git ls-files '*pyproject.toml' | while IFS= read -r f; do
    dir=$(dirname "$f")
    { grep -qx '\[solver\]' "$dir/poetry.toml" 2>/dev/null &&
      grep -qx 'min-release-age = 14' "$dir/poetry.toml" 2>/dev/null; } || echo "$dir/poetry.toml"
  done
}
cooldown_exclusions() {
  git ls-files '*.npmrc' '*poetry.toml' | while IFS= read -r f; do
    grep -Hn 'min-release-age-exclude' "$f"
  done
}
check "every package.json and pyproject.toml has the 14-day cooldown" none manifests_without_cooldown
check "no cooldown exclusion is committed" none cooldown_exclusions

# 2. No install from a version range.
INSTALL_SOURCES=".github/workflows scripts/ci-local.sh backend/Dockerfile frontend/Dockerfile"
loose_installs() {
  # shellcheck disable=SC2086
  grep -rnE '(pip|pipx) install' $INSTALL_SOURCES |
    grep -vE '(pip|pipx) install( --[a-z-]+)* [A-Za-z0-9_.-]+==[0-9][0-9A-Za-z.]*([[:space:]]|$)'
}
poetry_pins() {
  grep -rhoE 'poetry==[0-9][0-9.]*' .github/workflows backend/Dockerfile | sort -u
}
npx_yes() {
  grep -rnE 'npx[[:space:]]+(-y|--yes)' .github/workflows scripts/ci-local.sh
}
check "pip and pipx install only exact versions" none loose_installs
check "CI and the Dockerfile install one Poetry version" test "$(poetry_pins | wc -l | tr -d ' ')" = 1
check "no npx -y" none npx_yes

# 3. Actions pinned by commit.
unpinned_actions() {
  grep -rnE '^[[:space:]]*(-[[:space:]]+)?uses:' .github/workflows |
    grep -vE 'uses:[[:space:]]+\./' |
    grep -vE 'uses:[[:space:]]+[A-Za-z0-9_./-]+@[0-9a-f]{40}[[:space:]]+#[[:space:]]+v[0-9]'
}
check "every action is pinned by commit with its version" none unpinned_actions

if [ "$failures" -gt 0 ]; then
  echo "test-supply-chain: $failures failed"
  exit 1
fi
echo "test-supply-chain: all checks passed"
