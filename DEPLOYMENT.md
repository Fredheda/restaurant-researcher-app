# Deployment

Live at [restaurants.frederikheda.com](https://restaurants.frederikheda.com) —
frontend only this phase, serving stub chat/data (see the frontend-scaffolding
spec/plan under the workspace-root `docs/restaurant-researcher-app/`).

Infra: `cae-restaurant-researcher` Container Apps environment in the shared
`rg-chatbot` resource group (westeurope), no Log Analytics. One app,
`ca-restaurant-researcher-web` (external ingress, `minReplicas: 0` /
`maxReplicas: 1`, `0.25` CPU / `0.5Gi` mem), image in the shared
`acrchatbotfredheda` registry, pulled via `id-restaurant-researcher-acrpull`
(passwordless, managed identity).

- Provision/update infra: `./infra/deploy.sh [image-tag]`
- Ship a code change: `./scripts/ship.sh` (refuses a dirty tree)
- Build+push only: `./scripts/build-push.sh`
- Roll to an already-pushed image (incl. rollback): `./scripts/redeploy.sh [sha]`
- Approve a new user: `./scripts/approve-user.sh <email>`

Auth: Entra Easy Auth (`restaurant-researcher-easyauth` app registration),
`appRoleAssignmentRequired=true`. Approved: `frederik.a.heda@gmail.com`.

Scales to zero — first request after idle takes ~15-40s.

**When the backend agent is added** (see the Future Work section of the
frontend-scaffolding spec), this file gets a second section for that
Container App, per `deploying-azure-projects`'s note on extending
`DEPLOYMENT.md` for a second deployable — don't leave this file describing
only the frontend once that lands.
