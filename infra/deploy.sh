#!/usr/bin/env bash
# Usage: ./infra/deploy.sh [image-tag]
#   Without a tag each app keeps the tag it runs now: a Bicep run from a
#   checkout at a different commit must not roll an app to an image that was
#   not deployed. The first run, with no apps yet, needs the tag.
#   No registry check (the infra identity cannot read images): a tag without
#   an image fails the new revision while the running one keeps serving.
# The keys reach az through a private temp file, never the command line.
set -euo pipefail
cd "$(dirname "$0")/.."
# shellcheck source=../scripts/lib/images.sh
source scripts/lib/images.sh

for var in GOOGLE_PLACES_API_KEY OPENAI_API_KEY SQL_SERVER SQL_DATABASE; do
  if [ -z "${!var:-}" ]; then
    echo "ERROR: $var is not set." >&2
    exit 2
  fi
done

tag_arg="${1:-}"
if [ -n "$tag_arg" ] && ! is_sha "$tag_arg"; then
  echo "ERROR: the image tag must be a full 40-character commit SHA." >&2
  exit 2
fi

IFS='|' read -r api_app _ <<<"${APPS[0]}"
IFS='|' read -r agent_app _ <<<"${APPS[1]}"
IFS='|' read -r web_app _ <<<"${APPS[2]}"

tag_of() {
  if [ -n "$tag_arg" ]; then
    echo "$tag_arg"
    return
  fi
  if ! app_exists "$1"; then
    echo "ERROR: $1 does not exist yet; pass the image tag." >&2
    exit 1
  fi
  local image
  image=$(az containerapp show -n "$1" -g "$RG" \
    --query "properties.template.containers[0].image" -o tsv)
  echo "${image##*:}"
}

web_tag=$(tag_of "$web_app")
api_tag=$(tag_of "$api_app")
agent_tag=$(tag_of "$agent_app")
for tag in "$web_tag" "$api_tag" "$agent_tag"; do
  [ -n "$tag" ] || { echo "ERROR: could not resolve an image tag; pass one." >&2; exit 1; }
done

keys_file=$(mktemp "${TMPDIR:-/tmp}/rr-infra-keys.XXXXXX")
trap 'rm -f "$keys_file"' EXIT
python3 -c '
import json, os
print(json.dumps({
    "$schema": "https://schema.management.azure.com/schemas/2019-04-01/deploymentParameters.json#",
    "contentVersion": "1.0.0.0",
    "parameters": {
        "googlePlacesKey": {"value": os.environ["GOOGLE_PLACES_API_KEY"]},
        "openaiApiKey": {"value": os.environ["OPENAI_API_KEY"]},
    },
}))' >"$keys_file"

echo "Deploying to resource group $RG: web=$web_tag api=$api_tag agent=$agent_tag"
az deployment group create \
  --resource-group "$RG" \
  --template-file infra/main.bicep \
  --parameters "@$keys_file" \
    webImageTag="$web_tag" apiImageTag="$api_tag" agentImageTag="$agent_tag" \
    sqlServer="$SQL_SERVER" sqlDatabase="$SQL_DATABASE" \
  --query "properties.provisioningState" -o tsv
