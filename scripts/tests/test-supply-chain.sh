#!/usr/bin/env bash
# Guards the supply-chain rules of this repo:
#   1. a 14-day install cooldown for npm and Poetry, with no exclusions;
#   2. no pip, pipx or az bicep install from a version range;
#   3. every GitHub Action pinned by commit, with its version as a comment;
#   4. every Docker image pinned by digest, one digest per base image;
#   5. one Node major in frontend/Dockerfile, every CI setup-node and @types/node.
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
loose_bicep_installs() {
  # shellcheck disable=SC2086
  grep -rnE 'az bicep (install|upgrade)' $INSTALL_SOURCES infra |
    grep -vE 'az bicep install --version v[0-9]+\.[0-9]+\.[0-9]+([[:space:]]|$)'
}
check "pip and pipx install only exact versions" none loose_installs
check "Bicep is installed only with an exact version, never upgraded" none loose_bicep_installs
check "CI and the Dockerfile install one Poetry version" test "$(poetry_pins | wc -l | tr -d ' ')" = 1
check "no npx -y" none npx_yes

# 3. Actions pinned by commit.
unpinned_actions() {
  grep -rnE '^[[:space:]]*(-[[:space:]]+)?uses:' .github/workflows |
    grep -vE 'uses:[[:space:]]+\./' |
    grep -vE 'uses:[[:space:]]+[A-Za-z0-9_./-]+@[0-9a-f]{40}[[:space:]]+#[[:space:]]+v[0-9]'
}
check "every action is pinned by commit with its version" none unpinned_actions

# 4. Docker images pinned by digest.
unpinned_images() {
  grep -nE '^FROM[[:space:]]' backend/Dockerfile frontend/Dockerfile |
    grep -vE '@sha256:[0-9a-f]{64}'
  grep -rnE 'docker run' .github/workflows |
    grep -vE '@sha256:[0-9a-f]{64}'
}
split_digests() {
  # prints each base image that is used with more than one digest
  grep -hoE '^FROM[[:space:]]+[^[:space:]@]+@sha256:[0-9a-f]{64}' backend/Dockerfile frontend/Dockerfile |
    awk '{ print $2 }' | sort -u | awk -F@ '{ count[$1]++ } END { for (i in count) if (count[i] > 1) print i }'
}
check "every image reference carries its digest" none unpinned_images
check "one digest per base image" none split_digests

# 5. One Node major everywhere.
node_majors() {
  grep -hoE '^FROM[[:space:]]+node:[0-9]+' frontend/Dockerfile | grep -oE '[0-9]+$'
  grep -rhoE 'node-version:[[:space:]]*[0-9]+' .github/workflows | grep -oE '[0-9]+$'
  grep -oE '"@types/node":[[:space:]]*"\^[0-9]+' frontend/package.json | grep -oE '[0-9]+$'
}
split_node_majors() {
  local majors
  majors=$(node_majors | sort -u)
  [ "$(echo "$majors" | wc -l)" -gt 1 ] && echo "Node majors:" $majors
}
check "one Node major in the image, CI and @types/node" none split_node_majors

if [ "$failures" -gt 0 ]; then
  echo "test-supply-chain: $failures failed"
  exit 1
fi
echo "test-supply-chain: all checks passed"
