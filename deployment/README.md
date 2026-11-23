# Deployment

The app is served at restaurants.frederikheda.com, behind Entra Easy Auth. Until the first infra deploy creates the api and agent apps it is frontend only: the chat and the seeded cards are stub data, and the header search calls the backend through `/api/*`, which answers "unavailable".

## What is running

Infra: the `cae-restaurant-researcher` Container Apps environment in the shared `rg-chatbot` resource group (westeurope), with no Log Analytics. The environment holds only the web, api and agent apps (the last two once infra creates them). Every app scales to zero (`minReplicas: 0` / `maxReplicas: 1`, `0.25` CPU / `0.5Gi` memory).

| App | Ingress | Runs as | Image |
|---|---|---|---|
| `ca-restaurant-researcher-web` | external, port 3000 | `id-restaurant-researcher-acrpull` | `restaurant-researcher-web` |
| `ca-restaurant-researcher-api` | internal, port 8000 | `id-restaurant-researcher-backend` | `restaurant-researcher-backend` (`APP_ROLE=api`) |
| `ca-restaurant-researcher-agent` | internal, port 8000 | `id-restaurant-researcher-backend` | `restaurant-researcher-backend` (`APP_ROLE=agent`) |

The api and agent apps are created by the first infra run; until then the scripts skip them. The web app reaches them through `API_URL` and `AGENT_URL`, their internal https origins, which `infra/main.bicep` sets. Both backend apps hold the Google Places key as an app secret and the agent app also holds the OpenAI key; the web app declares no secret (its Easy Auth secret is set by `setup-easyauth.sh`). `setup-github-deploy.sh` creates both identities and their `AcrPull` grants; the Bicep file only refers to them and to the environment, and creates Container Apps only. Images live in the shared `acrchatbotfredheda` registry and are pulled without a password, as the app's managed identity.

The app scales to zero, so the first request after idle takes about 15-40 seconds. Once the assistant is wired to the agent app, it keeps conversations in the web app's memory, so after idle a conversation starts fresh, and the web app must stay at one replica: a second replica would answer a thread it does not hold with 404. Ingress ends a request after 240 seconds, so a longer agent run ends as an error in the chat.

## What to run, by what changed

| What changed | Run (from the repo root) |
|---|---|
| Code | The **Deploy** workflow on GitHub (below); `./scripts/ship.sh` is the laptop fallback (builds, pushes, rolls the app; refuses a dirty tree) |
| Infra (`infra/main.bicep`) | The **Deploy infra** workflow on GitHub (see Infra deploy); each app keeps the tag it runs now unless you pass a SHA |
| Only build and push an image | `./scripts/build-push.sh [sha]` (skips an image that exists) |
| Roll to an already-pushed image, including a rollback | `./scripts/redeploy.sh [sha]` |
| Approve a new user | `./scripts/approve-user.sh <email>` |
| Auth setup or secret rotation | `./scripts/setup-easyauth.sh` (idempotent, resets the secret) |

## Deploy button

Code reaches production only when the owner presses **Deploy** (Actions tab, or `gh workflow run deploy.yml --ref main`); infra changes only through **Deploy infra** (see Infra deploy). It builds the two images (web, backend; `scripts/lib/images.sh`) for the chosen commit if they do not exist, rolls the apps that exist (backend apps first, web last; an app infra has not created yet is skipped with a logged line), and waits until each new revision is provisioned. Leave the SHA empty for the head of `main`, or give a full 40-character SHA on `main`; rollback is the same button with an older SHA. CI never builds an image, and a merge to `main` runs nothing.

The run stops at `waiting` until the owner approves it: Actions, the run, **Review deployments**, approve. The owner is the only required reviewer of `production`, and admins cannot bypass it. An agent never approves a waiting deployment. `gh run watch` keeps polling while the run waits; run it again after the approval.

The federated credentials trust the OIDC subject GitHub reports for this repo (`gh api repos/Fredheda/restaurant-researcher-app/actions/oidc/customization/sub`), which for repos created recently embeds the owner and repo IDs; the setup script reads it and replaces a stale credential. Re-run the setup script if the repo is renamed or recreated.

One-time setup, run by the owner: `./scripts/setup-github-deploy.sh` (the build, deploy and infra identities with federated credentials, the web and backend app identities with `AcrPull`, the infra identity's custom role, the `production` environment restricted to `main` with the owner as required reviewer, five repo secrets) and `./scripts/setup-acr-purge.sh` (dry run first; `--create` adds the weekly purge of old SHA tags of this project's repositories). The deploy identity gets its role per app only for apps that exist, so re-run `setup-github-deploy.sh` after infra creates the backend apps, or the next Deploy fails with an authorization error on them.

The infra identity runs the infra deploy under a custom role, `Restaurant Researcher Infra Deployer`, at the resource group scope. `INFRA_ROLE_ACTIONS` in `scripts/setup-github-deploy.sh` lists its actions explicitly: deployments, Container Apps read and write, the environment join and a few reads. It has no wildcard, nothing under `Microsoft.Authorization`, no identity or federated-credential write, no delete and no `listSecrets`, and no registry role; attaching the web pull and backend identities is a separate `Managed Identity Operator` assignment each. If an infra run fails with an authorization error naming an action, add exactly that line to the list, merge, and run `./scripts/setup-github-deploy.sh` again: it updates the role. A new role definition can need a minute before the run succeeds.

Limits: the registry is in legacy permission mode, so pushes cannot be scoped per repository (the deploy identity's `AcrPush` also allows pushing, and the build identity can push registry-wide). Each Deploy of a new commit runs two billed ACR builds, one per image, even while the backend apps do not exist yet. `redeploy.sh` rolls apps one at a time: a failure part-way leaves mixed versions until Deploy is pressed again, and a failure while locking tags leaves locks to fix by hand (the script prints the command).

## Auth

Entra Easy Auth, using the `restaurant-researcher-easyauth` app registration with `appRoleAssignmentRequired=true`. Only users assigned to the app can sign in. The approved users are the ones assigned in Entra (list them in the portal or with `az`); the table above shows how to add one.

The Easy Auth client secret expires; see [expirations.md](expirations.md).

## Infra deploy

Production infra changes when the owner starts **Deploy infra** (Actions tab, or `gh workflow run deploy-infra.yml --ref main`); it runs `infra/deploy.sh [sha]`, which applies `infra/main.bicep`. It reads `GOOGLE_PLACES_API_KEY`, `OPENAI_API_KEY`, `SQL_SERVER` and `SQL_DATABASE` from the environment only, and stops naming a variable that is missing. The keys reach `az` through a private temp file that is removed on exit, never the command line. It prints the three tags it will use. It does not check the registry: a tag whose image does not exist fails the new revision, and the running revision keeps serving.

Without an argument each app keeps the tag it runs now. With a full SHA all three apps get that tag; the first run needs it, because the api and agent apps do not exist yet to read a tag from. Run **Deploy** for that SHA first, so the images exist.

First rollout, in order: `setup-github-deploy.sh` (identities), **Deploy** (builds the images), the infra deploy (creates the api and agent apps), `setup-github-deploy.sh` again (the deploy identity's roles on the new apps), **Deploy** again (rolls all three apps and locks the tags).

The workflow installs a pinned Bicep CLI first (`az bicep install --version`, in `deploy-infra.yml`; to move it, pin a Bicep release at least 14 days old and change that one line). The workflow checks the installed binary against the SHA-256 of that release's `bicep-linux-x64` asset before it logs in; that hash changes with the version, so change it together with the version. It logs in as its own identity (repo secret `AZURE_INFRA_CLIENT_ID`, set by `setup-github-deploy.sh`), which can start deployments and change this project's Container Apps but cannot assign roles or create identities. The run waits for the owner's approval in the `production` environment, like **Deploy**, and only starts from `main`. It reads four secrets of the `production` environment, set by the owner with `gh secret set <name> --env production -R Fredheda/restaurant-researcher-app` (the value comes from a hidden prompt): `GOOGLE_PLACES_API_KEY`, `OPENAI_API_KEY`, `SQL_SERVER`, `SQL_DATABASE`. The SQL names are secrets so that public run logs mask them. `setup-github-deploy.sh` never sets these four; it prints the names that are still missing. Leave the SHA empty to keep each app's tag; give a full SHA on `main` for the first run. **Deploy** and **Deploy infra** share one queue; GitHub keeps only the newest waiting run per queue, so start the second after the first has finished.
