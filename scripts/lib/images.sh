# shellcheck shell=bash disable=SC2034
# Shared by build-push.sh, redeploy.sh, wait-healthy.sh, setup-acr-purge.sh
# and setup-github-deploy.sh: the one list of images and container apps, so
# building, deploying, locking and purging can never disagree about what this
# project ships. Sourced, not executed.

ACR=acrchatbotfredheda
RG=rg-chatbot

# "<acr repository>|<dockerfile>|<build context>": each image is built once.
IMAGES=(
  "restaurant-researcher-web|frontend/Dockerfile|frontend"
  "restaurant-researcher-backend|backend/Dockerfile|backend"
)

# "<container app>|<acr repository it runs>", in rollout order. One backend
# image serves two apps (APP_ROLE picks the routes). The web app is rolled
# last, so it never calls a backend older than itself.
APPS=(
  "ca-restaurant-researcher-api|restaurant-researcher-backend"
  "ca-restaurant-researcher-agent|restaurant-researcher-backend"
  "ca-restaurant-researcher-web|restaurant-researcher-web"
)

# True for a full 40-character lowercase hex git SHA, the only tag the
# deploy pipeline builds, deploys, locks or purges.
is_sha() {
  [[ "$1" =~ ^[0-9a-f]{40}$ ]]
}

# True if the container app exists. An app that infra/deploy.sh has not
# created yet is skipped by redeploy.sh and wait-healthy.sh, so the Deploy
# button keeps working while the backend apps are still being rolled out.
app_exists() {
  az containerapp show -n "$1" -g "$RG" --query name -o none >/dev/null 2>&1
}

# True if <repo>:<tag> exists in the registry.
image_exists() {
  az acr repository show -n "$ACR" --image "$1:$2" -o none >/dev/null 2>&1
}

# Protect a deployed tag from `acr purge` (it can still be re-pushed).
lock_tag() {
  az acr repository update -n "$ACR" --image "$1:$2" \
    --delete-enabled false --write-enabled true --output none
}

# Make a tag purgeable again once no app runs it.
unlock_tag() {
  az acr repository update -n "$ACR" --image "$1:$2" \
    --delete-enabled true --write-enabled true --output none
}
