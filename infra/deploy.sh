#!/usr/bin/env bash
# Provision (or update) the Container Apps environment + frontend app from
# infra/main.bicep. Idempotent — re-run to roll config changes.
#
# Usage: ./infra/deploy.sh [image-tag]
#   image-tag defaults to the current git HEAD SHA.
set -euo pipefail
cd "$(dirname "$0")/.."

RG=rg-chatbot
TAG="${1:-$(git rev-parse HEAD)}"
[ -n "$TAG" ] || { echo "ERROR: could not resolve an image tag" >&2; exit 1; }

echo "Deploying image tag $TAG to resource group $RG..."
az deployment group create \
  --resource-group "$RG" \
  --template-file infra/main.bicep \
  --parameters imageTag="$TAG" \
  --query "properties.provisioningState" -o tsv

FQDN=$(az containerapp show -n ca-restaurant-researcher-web -g "$RG" \
  --query properties.configuration.ingress.fqdn -o tsv)
echo "Frontend: https://$FQDN"
