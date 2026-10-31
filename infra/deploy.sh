#!/usr/bin/env bash
# Provision (or update) the Container Apps environment + frontend app from
# infra/main.bicep. Idempotent — re-run to roll config changes.
#
# Usage: ./infra/deploy.sh [image-tag]
#   image-tag defaults to the tag the app runs now, so an infra run never
#   rolls the app to an image that was not deployed (a Bicep run from a
#   checkout at a different commit would otherwise do that). On the very first
#   deploy there is no app yet: pass the tag explicitly.
set -euo pipefail
cd "$(dirname "$0")/.."

RG=rg-chatbot
if [ -n "${1:-}" ]; then
  TAG="$1"
else
  current=$(az containerapp show -n ca-restaurant-researcher-web -g "$RG" \
    --query "properties.template.containers[0].image" -o tsv 2>/dev/null || true)
  TAG="${current##*:}"
fi
[ -n "$TAG" ] || { echo "ERROR: could not resolve an image tag; pass one." >&2; exit 1; }

echo "Deploying image tag $TAG to resource group $RG..."
az deployment group create \
  --resource-group "$RG" \
  --template-file infra/main.bicep \
  --parameters imageTag="$TAG" \
  --query "properties.provisioningState" -o tsv

FQDN=$(az containerapp show -n ca-restaurant-researcher-web -g "$RG" \
  --query properties.configuration.ingress.fqdn -o tsv)
echo "Frontend: https://$FQDN"
