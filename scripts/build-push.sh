#!/usr/bin/env bash
# Build the frontend image natively on linux/amd64 with ACR Tasks and push
# :latest + :<git-sha>. Auth: the caller's live `az login` session.
#
# NOTE: az acr build builds the WORKING TREE, not the committed SHA — run
# with a clean tree so the :<git-sha> tag is honest (ship.sh enforces this).
#
# Usage: ./scripts/build-push.sh
set -euo pipefail
cd "$(dirname "$0")/.."

ACR=acrchatbotfredheda
SHA=$(git rev-parse HEAD)

az acr build --registry "$ACR" --file frontend/Dockerfile \
  --image restaurant-researcher-web:latest --image "restaurant-researcher-web:$SHA" frontend

echo "Pushed restaurant-researcher-web at $SHA"
