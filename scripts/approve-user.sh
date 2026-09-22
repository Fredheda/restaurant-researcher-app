#!/usr/bin/env bash
# Approve a user for restaurant-researcher-app: invite them as an Entra B2B
# guest (if external) and assign them to the easyauth enterprise app.
#
# Usage: ./scripts/approve-user.sh person@example.com
set -euo pipefail

EMAIL="${1:?usage: approve-user.sh <email>}"
GRAPH="https://graph.microsoft.com/v1.0"

SP_OBJ=$(az ad sp list --display-name "restaurant-researcher-easyauth" --query "[0].id" -o tsv)
[ -n "$SP_OBJ" ] || { echo "ERROR: service principal 'restaurant-researcher-easyauth' not found" >&2; exit 1; }

FQDN=$(az containerapp show -n ca-restaurant-researcher-web -g rg-chatbot \
  --query properties.configuration.ingress.fqdn -o tsv)

USER_ID=$(az ad user list \
  --filter "mail eq '$EMAIL' or userPrincipalName eq '$EMAIL'" \
  --query "[0].id" -o tsv)

if [ -z "$USER_ID" ]; then
  echo "Inviting $EMAIL as a guest..."
  USER_ID=$(az rest --method POST --url "$GRAPH/invitations" \
    --headers "Content-Type=application/json" \
    --body "{\"invitedUserEmailAddress\": \"$EMAIL\", \"inviteRedirectUrl\": \"https://$FQDN\", \"sendInvitationMessage\": true}" \
    --query invitedUser.id -o tsv)
  echo "Guest invited (they'll get an email to accept)."
fi

echo "Assigning $EMAIL to the restaurant-researcher-app..."
az rest --method POST \
  --url "$GRAPH/servicePrincipals/$SP_OBJ/appRoleAssignedTo" \
  --headers "Content-Type=application/json" \
  --body "{\"principalId\": \"$USER_ID\", \"resourceId\": \"$SP_OBJ\", \"appRoleId\": \"00000000-0000-0000-0000-000000000000\"}" \
  --output none

echo "Done. $EMAIL can access https://$FQDN once they've accepted the invitation."
