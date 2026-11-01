#!/usr/bin/env bash
# Lock ca-restaurant-researcher-web behind Entra Easy Auth so ONLY approved
# users can reach it. Idempotent — safe to re-run (rotates the client secret
# each run; see the 2-year expiry note in deployment/expirations.md).
#
# Usage: ./scripts/setup-easyauth.sh
set -euo pipefail
cd "$(dirname "$0")/.."

RG=rg-chatbot
WEB_APP=ca-restaurant-researcher-web
APP_NAME=restaurant-researcher-easyauth

FQDN=$(az containerapp show -n "$WEB_APP" -g "$RG" \
  --query properties.configuration.ingress.fqdn -o tsv)
CUSTOM_DOMAIN=restaurants.frederikheda.com
TENANT_ID=$(az account show --query tenantId -o tsv)
REDIRECT_URIS="https://$FQDN/.auth/login/aad/callback https://$CUSTOM_DOMAIN/.auth/login/aad/callback"
echo "Frontend FQDN: $FQDN"
echo "Custom domain: $CUSTOM_DOMAIN"

APP_ID=$(az ad app list --display-name "$APP_NAME" --query "[0].appId" -o tsv)
if [ -z "$APP_ID" ]; then
  echo "Creating app registration '$APP_NAME'..."
  APP_ID=$(az ad app create \
    --display-name "$APP_NAME" \
    --sign-in-audience AzureADMyOrg \
    --web-redirect-uris $REDIRECT_URIS \
    --enable-id-token-issuance true \
    --query appId -o tsv)
else
  echo "Reusing existing app registration '$APP_NAME' ($APP_ID); ensuring redirect URI..."
  az ad app update --id "$APP_ID" \
    --web-redirect-uris $REDIRECT_URIS \
    --enable-id-token-issuance true --output none
fi
echo "APP_ID=$APP_ID"

CLIENT_SECRET=$(az ad app credential reset --id "$APP_ID" \
  --display-name easyauth --years 2 --query password -o tsv)
[ -n "$CLIENT_SECRET" ] && echo "client secret generated (hidden)"

if [ -z "$(az ad sp list --filter "appId eq '$APP_ID'" --query "[0].id" -o tsv)" ]; then
  az ad sp create --id "$APP_ID" --output none
  echo "service principal created"
  sleep 15
else
  echo "service principal already exists"
fi

az containerapp auth microsoft update \
  --name "$WEB_APP" --resource-group "$RG" \
  --client-id "$APP_ID" --client-secret "$CLIENT_SECRET" \
  --issuer "https://login.microsoftonline.com/$TENANT_ID/v2.0" \
  --yes --output none
echo "microsoft identity provider configured"

az containerapp auth update \
  --name "$WEB_APP" --resource-group "$RG" \
  --enabled true --action RedirectToLoginPage \
  --redirect-provider azureactivedirectory --require-https true --output none
echo "easy auth enabled (unauthenticated -> RedirectToLoginPage)"

SP_OBJ=$(az ad sp show --id "$APP_ID" --query id -o tsv)
az ad sp update --id "$APP_ID" --set appRoleAssignmentRequired=true
echo "appRoleAssignmentRequired=true"

ME=$(az ad signed-in-user show --query id -o tsv)
az rest --method POST \
  --url "https://graph.microsoft.com/v1.0/servicePrincipals/$SP_OBJ/appRoleAssignedTo" \
  --headers "Content-Type=application/json" \
  --body "{\"principalId\": \"$ME\", \"resourceId\": \"$SP_OBJ\", \"appRoleId\": \"00000000-0000-0000-0000-000000000000\"}" \
  --output none 2>/dev/null \
  && echo "signed-in owner assigned" \
  || echo "signed-in owner already assigned (ok, or is a different account — run approve-user.sh <email> next)"

echo
echo "DONE. Only assigned users can reach https://$FQDN or https://$CUSTOM_DOMAIN"
echo "Add more users with: ./scripts/approve-user.sh <email>"
