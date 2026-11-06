#!/usr/bin/env bash
# Roll every container app to the images built from a given commit.
# Usage: ./scripts/redeploy.sh [git-sha]   (defaults to current HEAD — the
# same commit ./scripts/build-push.sh tags). The SHA must be the full
# 40-character commit hash.
#
# Image-only: no Bicep re-run. SHA tags (not `latest`) so every deploy creates
# a distinct revision — rollback is `./scripts/redeploy.sh <old-sha>`.
#
# Order of work:
#   1. Refuse a malformed SHA. Skip apps that do not exist yet (logged), then
#      refuse unless every image the remaining apps need exists, so no app
#      changes when one image is missing.
#   2. Roll the apps in the APPS order (backends first, web last). A failure
#      stops there; earlier apps stay rolled (press Deploy again).
#   3. Lock each deployed tag (`acr purge` skips locked tags, so the image a
#      replica needs for its next cold start is never deleted) and unlock each
#      distinct SHA tag the apps ran before. Nothing is locked or unlocked if
#      a rollout fails.
set -euo pipefail
cd "$(dirname "$0")/.."
# shellcheck source=lib/images.sh
source scripts/lib/images.sh

SHA="${1:-$(git rev-parse HEAD)}"
if ! is_sha "$SHA"; then
  echo "ERROR: '$SHA' is not a full 40-character commit SHA." >&2
  exit 2
fi
echo "Deploying images for commit $SHA"

# Apps that exist now; the others have not been created by infra yet.
active=()
repos=()
for entry in "${APPS[@]}"; do
  IFS='|' read -r app repo <<<"$entry"
  if app_exists "$app"; then
    active+=("$entry")
    repos+=("$repo")
  else
    echo "Skipping $app: not created yet (infra/deploy.sh adds it)."
  fi
done
if [ "${#active[@]}" -eq 0 ]; then
  echo "ERROR: none of the container apps exist in $RG." >&2
  exit 1
fi
# Each repository once (bash 3.2 on macOS has no mapfile).
unique=()
while IFS= read -r repo; do unique+=("$repo"); done < <(printf '%s\n' "${repos[@]}" | sort -u)
repos=("${unique[@]}")

missing=0
for repo in "${repos[@]}"; do
  if ! image_exists "$repo" "$SHA"; then
    echo "ERROR: image $repo:$SHA is not in $ACR (build for this commit missing or unfinished)." >&2
    missing=1
  fi
done
[ "$missing" -eq 0 ] || exit 1

# The "<repo>:<tag>" each app runs now, read before anything changes.
replaced=()
for entry in "${active[@]}"; do
  IFS='|' read -r app repo <<<"$entry"
  current=$(az containerapp show -n "$app" -g "$RG" \
    --query "properties.template.containers[0].image" -o tsv)
  tag="${current##*:}"
  if is_sha "$tag" && [ "$tag" != "$SHA" ]; then
    replaced+=("$repo:$tag")
  fi
done

for entry in "${active[@]}"; do
  IFS='|' read -r app repo <<<"$entry"
  az containerapp update -n "$app" -g "$RG" \
    --image "$ACR.azurecr.io/$repo:$SHA" --output none
done

# After a full rollout every app runs $SHA, so no replaced tag is in use.
status=0
for repo in "${repos[@]}"; do
  lock_tag "$repo" "$SHA" || { echo "ERROR: could not lock $repo:$SHA" >&2; status=1; }
done
if [ "${#replaced[@]}" -gt 0 ]; then
  while IFS= read -r ref; do
    unlock_tag "${ref%%:*}" "${ref#*:}" || { echo "ERROR: could not unlock $ref" >&2; status=1; }
  done < <(printf '%s\n' "${replaced[@]}" | sort -u)
fi
if [ "$status" -ne 0 ]; then
  echo "The apps ARE rolled to $SHA; only the tag locking failed. Fix it with" >&2
  echo "az acr repository update --image <repo>:<tag> --delete-enabled false." >&2
  exit "$status"
fi

FQDN=$(az containerapp show -n ca-restaurant-researcher-web -g "$RG" \
  --query properties.configuration.ingress.fqdn -o tsv)
echo "Deployed. https://$FQDN"
