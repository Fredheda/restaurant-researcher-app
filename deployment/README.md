# Deployment

The app is served at restaurants.frederikheda.com, behind Entra Easy Auth. It is frontend only in this phase, serving stub chat and place data (see the frontend-scaffolding spec and plan under the workspace-root `docs/restaurant-researcher-app/`).

## What is running

Infra: the `cae-restaurant-researcher` Container Apps environment in the shared `rg-chatbot` resource group (westeurope), with no Log Analytics. It holds one app, `ca-restaurant-researcher-web` (external ingress, `minReplicas: 0` / `maxReplicas: 1`, `0.25` CPU / `0.5Gi` memory). The image lives in the shared `acrchatbotfredheda` registry and is pulled via `id-restaurant-researcher-acrpull` (passwordless, managed identity).

The app scales to zero, so the first request after idle takes about 15-40 seconds.

## What to run, by what changed

| What changed | Run (from the repo root) |
|---|---|
| Code | `./scripts/ship.sh` (builds, pushes, rolls the app; refuses a dirty tree) |
| Infra (`infra/main.bicep`) | `./infra/deploy.sh [image-tag]` |
| Only build and push an image | `./scripts/build-push.sh` |
| Roll to an already-pushed image, including a rollback | `./scripts/redeploy.sh [sha]` |
| Approve a new user | `./scripts/approve-user.sh <email>` |
| Auth setup or secret rotation | `./scripts/setup-easyauth.sh` (idempotent, resets the secret) |

There is no deploy workflow on GitHub for this repo: deploys run from a laptop. CI (`.github/workflows/ci.yml`) only tests, lints, type-checks and builds.

## Auth

Entra Easy Auth, using the `restaurant-researcher-easyauth` app registration with `appRoleAssignmentRequired=true`. Only users assigned to the app can sign in. Approved: `frederik.a.heda@gmail.com`.

The Easy Auth client secret expires; see [expirations.md](expirations.md).

## When the backend agent is added

This file needs a second section for that Container App, as `deploying-azure-projects` recommends for a second deployable. Do not leave this file describing only the frontend once the backend lands. See the Future Work section of the frontend-scaffolding spec.
