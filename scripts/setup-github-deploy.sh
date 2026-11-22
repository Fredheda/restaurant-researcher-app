#!/usr/bin/env bash
# One-time (idempotent) setup of the identities, roles, federated credentials,
# `production` environment and repo secrets the workflows use. Needs the owner's
# `az login` and `gh auth`; what it grants and why: deployment/README.md.
#
# Usage: ./scripts/setup-github-deploy.sh
set -euo pipefail
cd "$(dirname "$0")/.."
# shellcheck source=lib/images.sh
source scripts/lib/images.sh

GH_REPO=Fredheda/restaurant-researcher-app
LOCATION=westeurope
BUILD_ID=id-restaurant-researcher-gh-build
DEPLOY_ID=id-restaurant-researcher-gh-deploy
INFRA_ID=id-restaurant-researcher-gh-infra
PULL_ID=id-restaurant-researcher-acrpull
BACKEND_ID=id-restaurant-researcher-backend
ISSUER=https://token.actions.githubusercontent.com
INFRA_ROLE="Restaurant Researcher Infra Deployer"
INFRA_ROLE_DESCRIPTION="Runs the Deploy infra workflow: deployments and Container Apps in this resource group, no role assignment, no identity creation."
ENVIRONMENT_SECRETS=(GOOGLE_PLACES_API_KEY OPENAI_API_KEY SQL_SERVER SQL_DATABASE)

# Explicit list, no wildcard: a compromised infra run must not be able to grant
# itself access, create identities or add federated credentials, so nothing
# under Microsoft.Authorization and no identity write belongs here. Attaching
# the app identities is a separate Managed Identity Operator assignment each.
INFRA_ROLE_ACTIONS=(
  Microsoft.Resources/deployments/read
  Microsoft.Resources/deployments/write
  Microsoft.Resources/deployments/validate/action
  Microsoft.Resources/deployments/operations/read
  Microsoft.Resources/deployments/operationstatuses/read
  Microsoft.Resources/subscriptions/resourceGroups/read
  Microsoft.App/containerApps/read
  Microsoft.App/containerApps/write
  Microsoft.App/containerApps/revisions/read
  Microsoft.App/managedEnvironments/read
  Microsoft.App/managedEnvironments/join/action
  Microsoft.App/managedEnvironments/managedCertificates/read
  Microsoft.ManagedIdentity/userAssignedIdentities/read
)

TENANT_ID=$(az account show --query tenantId -o tsv)
SUBSCRIPTION_ID=$(az account show --query id -o tsv)
RG_SCOPE=/subscriptions/$SUBSCRIPTION_ID/resourceGroups/$RG
echo "Subscription $SUBSCRIPTION_ID, repo $GH_REPO"

ROLE_FILE=$(mktemp "${TMPDIR:-/tmp}/rr-infra-role.XXXXXX")
trap 'rm -f "$ROLE_FILE"' EXIT

ensure_identity() {
  local name=$1 err
  if err=$(az identity show -g "$RG" -n "$name" -o none 2>&1 >/dev/null); then
    echo "identity $name: exists" >&2
    return
  fi
  case "$err" in
    *ResourceNotFound*|*"was not found"*|*"could not be found"*) ;;
    *)
      echo "ERROR: could not look up identity $name: $err" >&2
      exit 1
      ;;
  esac
  az identity create -g "$RG" -n "$name" -l "$LOCATION" -o none
  echo "identity $name: created" >&2
}

identity_field() {
  az identity show -g "$RG" -n "$1" --query "$2" -o tsv
}

role_definition_json() {
  local action separator=""
  printf '{\n  "Name": "%s",\n  "IsCustom": true,\n  "Description": "%s",\n  "Actions": [\n' \
    "$INFRA_ROLE" "$INFRA_ROLE_DESCRIPTION"
  for action in "${INFRA_ROLE_ACTIONS[@]}"; do
    printf '%s    "%s"' "$separator" "$action"
    separator=$',\n'
  done
  printf '\n  ],\n  "NotActions": [],\n  "DataActions": [],\n  "NotDataActions": [],\n  "AssignableScopes": ["%s"]\n}\n' \
    "$RG_SCOPE"
}

ensure_infra_role() {
  local existing
  role_definition_json >"$ROLE_FILE"
  existing=$(az role definition list --name "$INFRA_ROLE" --custom-role-only true \
    --scope "$RG_SCOPE" --query "length(@)" -o tsv)
  if [ "$existing" -gt 0 ]; then
    az role definition update --role-definition "$ROLE_FILE" -o none
    echo "custom role $INFRA_ROLE: updated"
  else
    az role definition create --role-definition "$ROLE_FILE" -o none
    echo "custom role $INFRA_ROLE: created"
  fi
}

report_missing_environment_secrets() {
  local listing present name
  if ! listing=$(gh secret list --env production -R "$GH_REPO"); then
    echo "WARNING: could not list the production environment secrets." >&2
    return
  fi
  present=$(cut -f1 <<<"$listing")
  for name in "${ENVIRONMENT_SECRETS[@]}"; do
    if ! grep -qx "$name" <<<"$present"; then
      echo "environment secret missing: $name (set it yourself: gh secret set $name --env production -R $GH_REPO)"
    fi
  done
}

# Role assignment by object id + principal type, so a just-created identity
# does not have to wait for Entra replication before the lookup succeeds.
ensure_role() {
  local principal=$1 role=$2 scope=$3
  az role assignment create --assignee-object-id "$principal" \
    --assignee-principal-type ServicePrincipal \
    --role "$role" --scope "$scope" -o none
  echo "role '$role' on ${scope##*/}: ensured"
}

ensure_federated_credential() {
  local identity=$1 name=$2 subject=$3 current
  if current=$(az identity federated-credential show -g "$RG" --identity-name "$identity" \
    --name "$name" --query subject -o tsv 2>/dev/null); then
    if [ "$current" = "$subject" ]; then
      echo "federated credential $identity/$name: exists"
      return
    fi
    # A credential with another subject can never match the job's token.
    az identity federated-credential delete -g "$RG" --identity-name "$identity" \
      --name "$name" --yes -o none
    echo "federated credential $identity/$name: replaced (was $current)"
  fi
  az identity federated-credential create -g "$RG" --identity-name "$identity" \
    --name "$name" --issuer "$ISSUER" --subject "$subject" \
    --audiences api://AzureADTokenExchange -o none
  echo "federated credential $identity/$name: created ($subject)"
}

for identity in "$BUILD_ID" "$DEPLOY_ID" "$INFRA_ID" "$PULL_ID" "$BACKEND_ID"; do
  ensure_identity "$identity"
done
BUILD_PRINCIPAL=$(identity_field "$BUILD_ID" principalId)
BUILD_CLIENT=$(identity_field "$BUILD_ID" clientId)
DEPLOY_PRINCIPAL=$(identity_field "$DEPLOY_ID" principalId)
DEPLOY_CLIENT=$(identity_field "$DEPLOY_ID" clientId)
INFRA_PRINCIPAL=$(identity_field "$INFRA_ID" principalId)
INFRA_CLIENT=$(identity_field "$INFRA_ID" clientId)
PULL_PRINCIPAL=$(identity_field "$PULL_ID" principalId)
BACKEND_PRINCIPAL=$(identity_field "$BACKEND_ID" principalId)

ACR_ID=$(az acr show -n "$ACR" --query id -o tsv)
PULL_ID_RESOURCE=$(identity_field "$PULL_ID" id)
BACKEND_ID_RESOURCE=$(identity_field "$BACKEND_ID" id)

ensure_role "$BUILD_PRINCIPAL" "AcrPush" "$ACR_ID"
ensure_role "$BUILD_PRINCIPAL" "Container Registry Tasks Contributor" "$ACR_ID"

ensure_role "$PULL_PRINCIPAL" "AcrPull" "$ACR_ID"
ensure_role "$BACKEND_PRINCIPAL" "AcrPull" "$ACR_ID"

ensure_infra_role
ensure_role "$INFRA_PRINCIPAL" "$INFRA_ROLE" "$RG_SCOPE"
ensure_role "$INFRA_PRINCIPAL" "Managed Identity Operator" "$PULL_ID_RESOURCE"
ensure_role "$INFRA_PRINCIPAL" "Managed Identity Operator" "$BACKEND_ID_RESOURCE"

ensure_role "$DEPLOY_PRINCIPAL" "AcrPush" "$ACR_ID"
ensure_role "$DEPLOY_PRINCIPAL" "Managed Identity Operator" "$PULL_ID_RESOURCE"
ensure_role "$DEPLOY_PRINCIPAL" "Managed Identity Operator" "$BACKEND_ID_RESOURCE"
for entry in "${APPS[@]}"; do
  IFS='|' read -r app _ <<<"$entry"
  if ! app_exists "$app"; then
    echo "app $app: not created yet, skipped (re-run after Deploy infra)"
    continue
  fi
  app_id=$(az containerapp show -n "$app" -g "$RG" --query id -o tsv)
  ensure_role "$DEPLOY_PRINCIPAL" "Container Apps Contributor" "$app_id"
done

# The subject prefix of the job's OIDC token depends on the repo: new repos use
# an immutable form that embeds the owner and repo IDs
# (repo:<owner>@<id>/<repo>@<id>), older ones repo:<owner>/<repo>. Ask GitHub
# which one this repo uses, or the federated credential will never match.
SUB_PREFIX=$(gh api "repos/$GH_REPO/actions/oidc/customization/sub" --jq .sub_claim_prefix)
if [ -z "$SUB_PREFIX" ] || [ "$SUB_PREFIX" = null ]; then
  echo "ERROR: GitHub returned no sub_claim_prefix for $GH_REPO." >&2
  exit 1
fi
SUBJECT="$SUB_PREFIX:environment:production"
echo "OIDC subject: $SUBJECT"

ensure_federated_credential "$BUILD_ID" github-production "$SUBJECT"
ensure_federated_credential "$DEPLOY_ID" github-production "$SUBJECT"
ensure_federated_credential "$INFRA_ID" github-production "$SUBJECT"

# The identities trust any job that runs in the `production` environment,
# whatever branch it runs on, and the `main`-only check inside deploy.yml is in
# a file any branch author can edit. So the environment itself only admits
# jobs from main: GitHub enforces this outside the workflow file. The repo
# owner is its required reviewer, so every deploy waits for his approval in
# GitHub (the run shows `waiting`) and no admin can bypass that. Required
# reviewers need a public repo on the Free plan; if GitHub refuses, the script
# stops here (set -e) before any secret is stored.
OWNER_ID=$(gh api "users/${GH_REPO%%/*}" --jq .id)
gh api -X PUT "repos/$GH_REPO/environments/production" --input - \
  --jq '"environment " + .name + ": ensured"' <<EOF
{
  "deployment_branch_policy": {"protected_branches": false, "custom_branch_policies": true},
  "reviewers": [{"type": "User", "id": $OWNER_ID}],
  "prevent_self_review": false,
  "can_admins_bypass": false
}
EOF
policies=$(gh api "repos/$GH_REPO/environments/production/deployment-branch-policies" \
  --jq '.branch_policies[].name')
if grep -qx main <<<"$policies"; then
  echo "environment production: branch policy main exists"
else
  gh api -X POST "repos/$GH_REPO/environments/production/deployment-branch-policies" \
    -f name=main -f type=branch --silent
  echo "environment production: branch policy main created"
fi
while IFS= read -r other; do
  if [ -n "$other" ] && [ "$other" != main ]; then
    echo "WARNING: environment production also admits branch '$other'; remove it in Settings > Environments unless intended." >&2
  fi
done <<<"$policies"
gh secret set AZURE_TENANT_ID --body "$TENANT_ID" -R "$GH_REPO"
gh secret set AZURE_SUBSCRIPTION_ID --body "$SUBSCRIPTION_ID" -R "$GH_REPO"
gh secret set AZURE_BUILD_CLIENT_ID --body "$BUILD_CLIENT" -R "$GH_REPO"
gh secret set AZURE_DEPLOY_CLIENT_ID --body "$DEPLOY_CLIENT" -R "$GH_REPO"
gh secret set AZURE_INFRA_CLIENT_ID --body "$INFRA_CLIENT" -R "$GH_REPO"
echo "repo secrets: set"
report_missing_environment_secrets
echo "Done. Re-running changes nothing."
