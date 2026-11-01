# Deployment

The app is served at restaurants.frederikheda.com, behind Entra Easy Auth. It is frontend only in this phase, serving stub chat and place data (see the frontend-scaffolding spec and plan under `docs/restaurant-researcher-app/` in the author's workspace notes, not in this repo).

## What is running

Infra: the `cae-restaurant-researcher` Container Apps environment in the shared `rg-chatbot` resource group (westeurope), with no Log Analytics. It holds one app today, `ca-restaurant-researcher-web` (external ingress, `minReplicas: 0` / `maxReplicas: 1`, `0.25` CPU / `0.5Gi` memory). The backend apps `ca-restaurant-researcher-api` and `-agent` are added by infra later; the scripts skip them until they exist. Images live in the shared `acrchatbotfredheda` registry and are pulled via `id-restaurant-researcher-acrpull` (passwordless, managed identity).

The app scales to zero, so the first request after idle takes about 15-40 seconds.

## What to run, by what changed

| What changed | Run (from the repo root) |
|---|---|
| Code | The **Deploy** workflow on GitHub (below); `./scripts/ship.sh` is the laptop fallback (builds, pushes, rolls the app; refuses a dirty tree) |
| Infra (`infra/main.bicep`) | `./infra/deploy.sh [image-tag]` from a laptop; the tag defaults to the one the app runs now, so pass the deployed SHA only to change it |
| Only build and push an image | `./scripts/build-push.sh [sha]` (skips an image that exists) |
| Roll to an already-pushed image, including a rollback | `./scripts/redeploy.sh [sha]` |
| Approve a new user | `./scripts/approve-user.sh <email>` |
| Auth setup or secret rotation | `./scripts/setup-easyauth.sh` (idempotent, resets the secret) |

## Deploy button

Production changes only when the owner presses **Deploy** (Actions tab, or `gh workflow run deploy.yml --ref main`). It builds the two images (web, backend; `scripts/lib/images.sh`) for the chosen commit if they do not exist, rolls the apps that exist (backend apps first, web last; an app infra has not created yet is skipped with a logged line), and waits until each new revision is provisioned. Leave the SHA empty for the head of `main`, or give a full 40-character SHA on `main`; rollback is the same button with an older SHA. CI never builds an image, and a merge to `main` runs nothing.

The federated credentials trust the OIDC subject GitHub reports for this repo (`gh api repos/Fredheda/restaurant-researcher-app/actions/oidc/customization/sub`), which for repos created recently embeds the owner and repo IDs; the setup script reads it and replaces a stale credential. Re-run the setup script if the repo is renamed or recreated.

One-time setup, run by the owner: `./scripts/setup-github-deploy.sh` (two identities with federated credentials, the `production` environment restricted to `main`, four repo secrets) and `./scripts/setup-acr-purge.sh` (dry run first; `--create` adds the weekly purge of old SHA tags of this project's repositories).

Limits: the registry is in legacy permission mode, so pushes cannot be scoped per repository (the deploy identity's `AcrPush` also allows pushing, and the build identity can push registry-wide). Each Deploy of a new commit runs two billed ACR builds, one per image, even while the backend apps do not exist yet. `redeploy.sh` rolls apps one at a time: a failure part-way leaves mixed versions until Deploy is pressed again, and a failure while locking tags leaves locks to fix by hand (the script prints the command).

## Auth

Entra Easy Auth, using the `restaurant-researcher-easyauth` app registration with `appRoleAssignmentRequired=true`. Only users assigned to the app can sign in. The approved users are the ones assigned in Entra (list them in the portal or with `az`); the table above shows how to add one.

The Easy Auth client secret expires; see [expirations.md](expirations.md).

## When the backend agent is added

This file needs a second section for that Container App, as `deploying-azure-projects` recommends for a second deployable. Do not leave this file describing only the frontend once the backend lands. See the Future Work section of the frontend-scaffolding spec.
