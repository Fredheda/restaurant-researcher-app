#!/usr/bin/env bash
# Ship a code change: build+push the image for the current commit, then roll
# the container app to it. The laptop fallback for the Deploy workflow. Refuses
# to run on a dirty tree so the deployed SHA is what you have checked out.
#
# Usage: ./scripts/ship.sh
set -euo pipefail
cd "$(dirname "$0")/.."

if [ -n "$(git status --porcelain)" ]; then
  echo "ERROR: working tree is dirty. Commit (or stash) your changes first." >&2
  git status --short >&2
  exit 1
fi

echo "==> Building and pushing image for $(git rev-parse --short HEAD)..."
./scripts/build-push.sh

echo "==> Rolling app to the new image..."
./scripts/redeploy.sh
