# Backend rollout 2: Bicep for the api and agent apps, and `infra/deploy.sh`

- Ticket: RR-32 (origin: Task 13 of `plans/2026-11-01-backend-scaffold-and-fast-search.md`, spec `specs/2026-11-01-backend-scaffold-and-fast-search.md`)
- Repo: `restaurant-researcher-app`
- Tier: non-trivial (new Azure resources, secrets)
- Status: approved by the specialist, 2026-11-22
- Diagram: `../plans/diagrams/2026-11-22-backend-rollout-bicep-api-agent-apps.mmd`

## TL;DR

- Ships two PRs, one ticket each: this ticket (RR-32) is the Bicep, `infra/deploy.sh`, their tests and docs; RR-70 is the `Deploy infra` workflow below. The first PR: `infra/main.bicep` gains the api and agent apps (running as the backend identity, which now already exists) and the web app's `API_URL` and `AGENT_URL`; `infra/deploy.sh` gains the keys and per-app tags; a new workflow `.github/workflows/deploy-infra.yml` runs `infra/deploy.sh` in GitHub. Tests for `deploy.sh` and doc updates ride along.
- Owner decisions 610 yes, 611 A, 612 A (2026-11-22, RR-36): identities and their role grants leave the Bicep file and move into the setup script (RR-33); infra runs as the workflow `Deploy infra` with its own identity, under the `production` approval; the two API keys are GitHub environment secrets of `production`. No agent holds an Azure login.
- Nothing is deployed by this PR. Running `Deploy infra` is RR-36 and needs the owner's explicit yes for that run, plus his approval in GitHub.
- Owner actions: merge (owner-only: it touches `.github/`). Before RR-36 the owner runs the RR-33 setup script once and sets the two keys and the SQL server and database names as environment secrets (names in the plan); RR-33 must have merged.
- Web app: still no `secrets` block, `ingress.customDomains` still declared, still `maxReplicas: 1`.
- Cost: new identity free; three apps scale to zero; about 0 EUR at light and medium use because the subscription's monthly free grant covers it; heavy use may exceed the grant by a computed amount whose price is not confirmed (below).
- Read-only gates `az bicep build` and `what-if` are run by the specialist on the PR branch (the agent sandbox has no `az login`); `what-if` waits for the owner's first setup-script run. Grep and offline tests run in the sandbox.

## Cost estimate (new resources only)

Sources: Microsoft Learn "Billing in Azure Container Apps" (fetched 2026-11-22). Per-unit prices live only on `azure.microsoft.com/pricing/details/container-apps/`; that page was not fetched for this draft, so no price is given: **price not confirmed, ask for one pricing-page fetch.**

Billing model (Learn): consumption plan charges vCPU-seconds, GiB-seconds and HTTP requests. A revision scaled to zero replicas costs nothing. Free each calendar month per subscription: first 180,000 vCPU-seconds, first 360,000 GiB-seconds, first 2 million requests. Only requests from outside the Container Apps environment are billable, so web-to-api and web-to-agent calls are free of request charges; health probes are not billable. Idle rates apply only when `minReplicas` is above zero, which is not the case here.

New resources in this PR: two Container Apps (`ca-restaurant-researcher-api`, `-agent`). The backend identity, the infra identity, the custom role and the role assignments are created by the setup script (RR-33); an identity has no meter (stated in the ticket brief, not re-checked) and a role assignment is free. No Log Analytics, no new environment, no new registry. The existing environment and web app are unchanged. The new workflow runs on a GitHub-hosted runner (free on a public repo).

Per replica: 0.25 vCPU and 0.5 GiB, so each active replica-second is 0.25 vCPU-seconds and 0.5 GiB-seconds. The grant is shared by every app in the subscription, so what is left for this project is unknown; the free grant equals 720,000 active replica-seconds (200 replica-hours) for the whole subscription.

Assumption (mine, not measured): one visit keeps web, api and agent replicas active about 10, 8 and 6 minutes (24 replica-minutes, 1,440 replica-seconds) because a replica stays up after its last request (the scale-down cooldown, default to be confirmed).

| Level | Visits per month | Replica-seconds | vCPU-seconds | GiB-seconds | Requests from outside | Over the free grant, if this project were the only user |
|---|---|---|---|---|---|---|
| Light | 20 | 28,800 | 7,200 | 14,400 | about 4,000 | none |
| Medium | 100 | 144,000 | 36,000 | 72,000 | about 20,000 | none |
| Heavy | 600 | 864,000 | 216,000 | 432,000 | about 120,000 | 36,000 vCPU-seconds and 72,000 GiB-seconds, price not confirmed |

The web app's share is already running today; the backend apps add about 14 of the 24 replica-minutes per visit (a bit over half). Other projects' apps in the subscription draw on the same grant: Cost Management shows the real remainder. The existing `chatbot-budget` alert covers the resource group.

## Goal and non-goals

Goal: after RR-36 runs the `Deploy infra` workflow, the environment holds the api and agent apps (internal only), the web app reaches them through `API_URL` and `AGENT_URL`, and the web app's Easy Auth secret and custom domain are untouched.

Non-goals: running any deploy (RR-36); creating identities, the custom role and role grants, and the SQL grant (RR-33); owner's `.env` (RR-23, RR-24), whose key values now also go into GitHub environment secrets; the Deploy workflow, `redeploy.sh`, `images.sh` (already handle the three apps and skip missing ones); Blob container, `tfl-mcp-key`, health probes, `OPENAI_MODEL` (default in `config.py`), `APP_ENV` (default `production`); a durable checkpointer.

## Design

### Facts from the repo that bind the design

- One backend image `restaurant-researcher-backend`, started with `APP_ROLE=api` or `agent`; `EXPOSE 8000`, uvicorn on 8000, `/health` on both. Image repository names and app names come from `scripts/lib/images.sh`.
- Env var names the backend reads (`backend/app/config.py`): `APP_ROLE`, `GOOGLE_PLACES_API_KEY` (both roles), `OPENAI_API_KEY` (required by `agent`, optional for `api`), `OPENAI_MODEL`, `SQL_SERVER`, `SQL_DATABASE`, `AZURE_CLIENT_ID`, `APP_ENV`. `SQL_SERVER` is passed as `Server=<value>` in the connection string, so it is the server's full host name. If `SQL_SERVER` is set, `SQL_DATABASE` is required.
- The web app reads `API_URL` and `AGENT_URL` at runtime as an origin (a path is ignored); a value that is not http(s) answers 503. Deployed values must be the internal **https** origin: with `allowInsecure` off, an http call is answered with a redirect that the proxy turns into 502 (`docs/development.md`).
- The web app keeps `maxReplicas: 1`: the CopilotKit runtime holds threads in memory; ingress ends a request after 240 s (`deployment/README.md`).

### Resources, one by one

The managed environment is an `existing` reference too (specialist, 2026-11-22: the infra identity gets no `managedEnvironments/write`), so the file creates or changes only Container Apps; a guard test asserts that. All new resources use the file's existing API version for container apps and environments (`2025-01-01`); Learn also lists `2025-07-01` and `2026-01-01`, which this PR does not need (one concern per PR).

**Backend identity (changed 2026-11-22, owner 610 and 611 A).** The file does not create it: `resource backendIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@<the file's identity API version>' existing = { name: backendIdentityName }` (param `backendIdentityName`, value `id-restaurant-researcher-backend`). The identity and its `AcrPull` role assignment on the registry are created by the setup script (RR-33), which runs before the first infra run, so the `existing` reference and the apps' image pull both work at once (the first-pull race of the earlier design is gone). The infra identity must never assign roles or create identities, so nothing of that kind may stay in this file. The existing `id-restaurant-researcher-acrpull` stays attached to the web app only; whether its creation also moves into the setup script is open question 11. The backend identity is the Entra principal for SQL: its client id goes into `AZURE_CLIENT_ID`; the SQL `CREATE USER ... FROM EXTERNAL PROVIDER` grant is a manual script (RR-33), not Bicep.

**Api and agent apps.** One loop over two entries gives both apps the same shape, so they cannot drift:

```bicep
var backendApps = [
  { name: apiAppName, role: 'api', tag: apiImageTag }
  { name: agentAppName, role: 'agent', tag: agentImageTag }
]

resource backend 'Microsoft.App/containerApps@2025-01-01' = [for app in backendApps: {
  name: app.name
  location: location
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${backendIdentity.id}': {}
    }
  }
  properties: {
    environmentId: environment.id
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        external: false
        targetPort: 8000
        transport: 'auto'
        allowInsecure: false
      }
      registries: [
        {
          server: loginServer
          identity: backendIdentity.id
        }
      ]
      secrets: concat(
        [{ name: 'google-places-key', value: googlePlacesKey }],
        app.role == 'agent' ? [{ name: 'openai-api-key', value: openaiApiKey }] : []
      )
    }
    template: {
      containers: [
        {
          name: 'restaurant-researcher-${app.role}'
          image: '${loginServer}/restaurant-researcher-backend:${app.tag}'
          resources: {
            cpu: json('0.25')
            memory: '0.5Gi'
          }
          env: concat(
            [
              { name: 'APP_ROLE', value: app.role }
              { name: 'GOOGLE_PLACES_API_KEY', secretRef: 'google-places-key' }
              { name: 'SQL_SERVER', value: sqlServer }
              { name: 'SQL_DATABASE', value: sqlDatabase }
              { name: 'AZURE_CLIENT_ID', value: backendIdentity.properties.clientId }
            ],
            app.role == 'agent' ? [{ name: 'OPENAI_API_KEY', secretRef: 'openai-api-key' }] : []
          )
        }
      ]
      scale: {
        minReplicas: 0
        maxReplicas: 1
      }
    }
  }
}]
```

Notes on this shape:

- Internal ingress (`external: false`), `allowInsecure: false` written out although it is the default, so a reader sees the https-only intent.
- Scale `0` to `1`, `0.25` CPU, `0.5Gi`: settled defaults. `maxReplicas: 1` also suits the agent: its in-memory checkpointer would lose a thread on a second replica.
- The api app gets only the `google-places-key` secret: `config.py` makes `OPENAI_API_KEY` optional for `api`, and a key an app never reads should not be in it. This differs from the ticket text (both secrets on both apps); see open question 1.
- `AZURE_CLIENT_ID`, `SQL_SERVER` and `SQL_DATABASE` are not secrets. `AZURE_CLIENT_ID` is a Bicep expression, so no id appears in the repo. `sqlServer` and `sqlDatabase` are required params with no default (the owner's names, RR-23).
- No `OPENAI_MODEL` and no `APP_ENV`: both have safe defaults in `config.py`.
- The container name suffix is the role, so revision and log output tell the apps apart.

**Params.** Replaced: `imageTag` becomes `webImageTag`. Added: `apiAppName` (`ca-restaurant-researcher-api`), `agentAppName` (`ca-restaurant-researcher-agent`), `backendIdentityName`, `apiImageTag`, `agentImageTag`, `sqlServer`, `sqlDatabase`, and

```bicep
@secure()
param googlePlacesKey string
@secure()
param openaiApiKey string
```

There is no default (specialist edit 1): with a default such as `'unset'`, any direct `az deployment group create` that forgets the keys would overwrite working keys without an error, because the `secrets` block of an app is replaced on every deploy. Container Apps rejects empty secret values, so the placeholder exists only where a command needs a value: `az bicep build` needs none, and the `what-if` command in the gates passes `googlePlacesKey=unset openaiApiKey=unset` itself. `infra/deploy.sh` refuses to run when either key is missing (below).

**Web app.** Two changes, nothing else:

```bicep
env: [
  { name: 'API_URL', value: 'https://${backend[0].properties.configuration.ingress.fqdn}' }
  { name: 'AGENT_URL', value: 'https://${backend[1].properties.configuration.ingress.fqdn}' }
]
```

- The FQDN comes from the backend apps' own `ingress.fqdn` (for an internal app Learn documents the form `<app>.internal.<environment id>.<region>.azurecontainerapps.io`). The web app is a different resource from the apps it points at, so there is no self-reference problem (the gotcha in `deploying-azure-projects` is about an app naming itself). The reference also makes Bicep deploy the backends before the web app, so a failed backend deploy leaves the web app unchanged.
- Order `backend[0]` is the api, `backend[1]` the agent; `backendApps` is the only place that fixes it.
- Declared and kept: `ingress.customDomains` (with its `certificateId`), `registries`, `identity`. Not declared: `configuration.secrets`.
- The env change makes a new web revision (template scope). That is expected; the image tag stays the one the web app runs now.

**Why no `secrets` block on the web app.** `setup-easyauth.sh` stores the Entra client secret as an app secret and points the app's auth config at it. ARM treats a declared `secrets` array as the complete list, so declaring any would drop the Easy Auth secret and break sign-in until `setup-easyauth.sh` is re-run (it resets the secret). The web app needs no secret of its own (`API_URL` and `AGENT_URL` are not secrets), so the block stays absent, as it is in today's file. `Microsoft.App/containerApps/authConfigs` is a child resource that Bicep does not declare, so a Bicep run leaves it alone.

What `what-if` cannot show: Container Apps never returns secret values on read, so `what-if` shows no secret change either way. The evidence that the web app's secrets survive a run is the name list before and after RR-36's run (gates, below), plus an Easy Auth sign-in; see open question 4.

### `infra/deploy.sh`

Usage: `./infra/deploy.sh [image-tag]`.

1. Source `scripts/lib/images.sh` for `RG`, `app_exists`, `is_sha` and the image repository names (removes the duplicated `RG=rg-chatbot`).
2. Require `GOOGLE_PLACES_API_KEY`, `OPENAI_API_KEY`, `SQL_SERVER`, `SQL_DATABASE` in the environment. A missing or empty one stops the script naming the variable (name only, never a value). A key containing `"` or `\` is refused, because it goes into a JSON file (step 5). The script reads the environment only and sources no file (specialist: the earlier "source `./.env`" edit is withdrawn; the script runs in the workflow, not on a laptop): all four values come from the `production` environment secrets (owner 612 A for the keys; the SQL server and database names are secrets too, because the run logs of a public repo are public and GitHub masks secrets in them). No `set -x`; no key is echoed or put in the `az` command line.
3. Tag per app. With an argument, the argument (must pass `is_sha`) is the tag for all three apps. Without one, each app keeps the tag it runs now (`az containerapp show ... containers[0].image`, tag after the last `:`), which an infra run must not change. An app that does not exist and has no argument stops the script naming the app: on first deploy the owner passes the SHA that the Deploy workflow built.
4. No registry image check (specialist, 2026-11-22): the infra identity gets no `AcrPull` because the registry is shared and that role reads every project's images. A wrong or unbuilt SHA makes the deployment fail while the running revision keeps serving; the docs say to run the Deploy workflow for the SHA first.
5. Write the two keys to a private temp file (`mktemp`, mode 600, removed by `trap ... EXIT`) as `{"googlePlacesKey":{"value":"..."}, ...}`, built with `python3 -c` from the environment so no quoting rule is needed (specialist decision; the "refuse a key containing `"` or `\`" rule in step 2 then falls away), and pass it as `--parameters @file`, followed by the non-secret `KEY=VALUE` params. This keeps the keys out of `ps` output and shell history. `az deployment group create` output is reduced with `--query properties.provisioningState -o tsv`, as today.
6. Print the web FQDN as today. Do not print the backend FQDNs.

### `Deploy infra` workflow (`.github/workflows/deploy-infra.yml`, new, owner merge)

Same shape as `deploy.yml`: `workflow_dispatch` with an optional full-SHA input (empty = head of `main`), `if: github.ref == 'refs/heads/main'`, `environment: production` (the owner's approval on every run), `concurrency` with `cancel-in-progress: false`, `permissions: id-token: write` on the job only, `persist-credentials: false` on checkout; SHA validated before any Azure login; login through `scripts/ci-azure-login.sh` as the infra identity (RR-33 creates it and its federated credential, subject `environment:production`). It runs `infra/deploy.sh <sha>` with `GOOGLE_PLACES_API_KEY` and `OPENAI_API_KEY` from the environment secrets and `SQL_SERVER` and `SQL_DATABASE` from the workflow's environment, then `scripts/wait-healthy.sh`. Output is names and states only (the script never prints keys). Tests: the existing workflow guard tests extend to this file (no `azure/login`, secrets only as secrets, `id-token: write` on the job). Never in parallel with another `ci.yml` or `claude-review.yml` story (RR-63, RR-64, RR-65): it adds a file under `.github/workflows/` and the guard tests.

First rollout, in order (RR-36, each step with the owner's yes, each workflow run waiting for his approval in GitHub): the owner runs `setup-github-deploy.sh` once (RR-33: identities, custom role, federated credentials, environment) and sets the two environment secrets; the Deploy workflow for SHA X (builds both images, rolls the web app, skips the missing backend apps); `Deploy infra` for SHA X (creates the apps; the check that the images exist passes); `setup-github-deploy.sh` re-run so the deploy identity gets its roles on the new apps; the owner runs `apply-schema.sh` and `--verify` (its `003` needs only the backend identity, which exists since the setup run, so the schema may also run before `Deploy infra`); the Deploy workflow again for SHA X (rolls all three apps, locks tags); `wait-healthy.sh`.

### Failure modes and gotchas (from the skills and Learn)

- The `AcrPull` assignment of the backend identity is created by the setup script, which runs well before `Deploy infra`; if the first pull of a new app still fails (a role can take a minute to propagate), re-run `Deploy infra` (idempotent).
- The deploy identity needs `Managed Identity Operator` on the **backend** identity as well as Container Apps Contributor on both new apps, or the Deploy workflow's `az containerapp update` fails with an authorization error (`deployment/README.md`, "Role grants for the backend identity wait for RR-33"). That is RR-33's work and must be done before RR-36's first Deploy of the backend apps (this PR may merge earlier: it deploys nothing).
- The infra identity may not assign roles or create identities: a Bicep resource of those types makes the workflow fail with an authorization error. `what-if` (gate 4) shows none today; a guard test greps `main.bicep` for `Microsoft.Authorization` and `userAssignedIdentities` without `existing`.
- Image tag trap: a run without an argument keeps each app on its current tag; a run with a stale argument rolls all apps back. The script prints the three tags it will use before deploying.
- Container Apps ingress is authoritative per PUT: the web app's `customDomains` stays in the file; the backend apps have no imperative ingress state.
- After a deploy, the old revision can answer briefly. Re-check after a short wait before judging a gate.
- A cold backend takes tens of seconds to start; the web proxy must not be judged broken on the first call (the `deploying-agent-projects` cold-start note).
- The agent app's AG-UI stream and the 240 s ingress limit: no Bicep setting changes it; the web app's error line covers longer runs.
- TLS inside the environment: Learn warns that for https between apps the certificate name may not match the app's internal host name, and the caller must handle verification. The web app's Node `fetch` verifies certificates. Not verified for `<app>.internal.<domain>`; RR-36 has a gate for it (open question 2).
- Failed searches degrade rather than crash when SQL is unreachable (scaffold spec, decision 4: cache read times out after 1 s and the service goes to Google). Not re-verified here; the SQL grant (RR-33) is a manual step after the apps exist.

### Tests and docs in the same PR

- Offline tests first in `scripts/tests/test-deploy-scripts.sh` (fake `az`): missing key stops with the variable name and no `az deployment` call; a key containing a quote is refused; no output or recorded `az` argument contains the key values; the per-app current-tag default; an argument tag applies to all three apps; a missing app without an argument stops naming it; a missing image stops before `deployment group create`; the parameters file is removed on exit.
- Docs: `infra/main.bicep` header comment (it still says "Frontend-only this phase"), `deployment/README.md` (the "What is running" paragraph and the "When the backend agent is added" section: apps, identity, secrets, internal-only, `deploy.sh` usage and key handling, first-deploy order), `CLAUDE.md` Deployment line and the "backend apps are not deployed yet" gotcha stays true until RR-36 (edit then), `docs/development.md` sentence on `API_URL`/`AGENT_URL` "set by the backend rollout" stays.

## Owner-runnable gates (all read-only)

Run from the repo root of the PR branch. The specialist runs gates 1 and 4 (read-only) on the PR branch outside the sandbox and pastes the masked output on the ticket, so the owner does not have to (specialist edit 4); the agent sandbox has no Azure session and cannot download the Bicep CLI. Gate 1 (`az bicep build`) needs nothing else and runs before the PR is marked ready. Gate 4 (`what-if`) needs read access to the resource group and can only run after the owner's first setup-script run (the backend identity must exist). Gates 2 and 3 run offline. Mask subscription, tenant and client ids (any GUID) before pasting output on the ticket.

1. Compile (no login).

```bash
az bicep build --file infra/main.bicep --stdout > /dev/null && echo build ok
```

Expected: `build ok`; warnings are listed and judged, errors fail.

2. Keys appear only as names (no login).

```bash
grep -n -i -E 'key|secret|password' infra/main.bicep
```

Expected: every hit is one of: a `param googlePlacesKey` or `param openaiApiKey` line; `@secure()` is not matched; a secret `name: 'google-places-key'` or `'openai-api-key'`; a `value: googlePlacesKey` or `value: openaiApiKey` line inside `secrets`; a `secretRef:` line; the `'unset'` default; a comment. Anything else (a literal that looks like a key) fails.

```bash
git grep -n -E 'AIza[0-9A-Za-z_-]{20}|sk-[0-9A-Za-z_-]{20}' -- infra scripts deployment || echo none
gitleaks git . --redact
```

Expected: `none`; gitleaks reports no leaks.

3. Shell checks and offline tests (no login).

```bash
bash -n infra/deploy.sh && shellcheck -x -S warning infra/deploy.sh && ./scripts/tests/test-deploy-scripts.sh && ./scripts/ci-local.sh
```

Expected: all green.

4. `what-if` (needs `az login`; read-only, creates nothing).

```bash
TAG=$(az containerapp show -n ca-restaurant-researcher-web -g rg-chatbot --query "properties.template.containers[0].image" -o tsv); TAG=${TAG##*:}
az deployment group what-if -g rg-chatbot -f infra/main.bicep \
  -p webImageTag="$TAG" apiImageTag="$TAG" agentImageTag="$TAG" \
     googlePlacesKey=unset openaiApiKey=unset \
     sqlServer=example.invalid sqlDatabase=example \
  --result-format FullResourcePayloads \
  | sed -E 's/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/<id>/g'
```

(`example.invalid` and `example` stand in for the owner's SQL names; what-if does not connect to SQL. The keys are placeholders passed by the command itself; `what-if` never prints secret values.) Expected, under the resource group:

- Precondition: the setup script (RR-33) has created `id-restaurant-researcher-backend` and its `AcrPull`; otherwise the `existing` reference fails the what-if.
- `+ Create`: `ca-restaurant-researcher-api`; `ca-restaurant-researcher-agent`, each with `external: false`, `targetPort: 8000`, `minReplicas: 0`, `maxReplicas: 1`. No `Microsoft.Authorization/roleAssignments` and no identity creation.
- `~ Modify`: `ca-restaurant-researcher-web` only, with exactly one added item, `properties.template.containers[0].env` (`API_URL`, `AGENT_URL`; the values may show as computed until the backends exist).
- No line mentioning `ingress`, `customDomains` or `secrets` under the web app; no `- Delete`; the environment, acrpull identity and its role show `NoChange` or are not listed. Noise that Container Apps adds on every what-if (read-only properties such as `latestRevisionName`) is acceptable if it is clearly not one of these.

Image existence is not checked by `what-if` or by `infra/deploy.sh`: run the Deploy workflow for the SHA first (it builds missing images), then `Deploy infra` for the same SHA.

Acceptance on the ticket: gates 1 to 3 green and `ci-local` green before the PR is marked ready; gate 4 and its masked output follow after the owner's first setup-script run (before the owner merges, if the order allows; otherwise before the first `Deploy infra`).

### For RR-36 (not run by this PR; each needs the owner's yes)

Before: `az containerapp secret list -n ca-restaurant-researcher-web -g rg-chatbot --query "[].name" -o tsv` and `az containerapp ingress show -n ca-restaurant-researcher-web -g rg-chatbot --query "customDomains[].name" -o tsv` (names only; never `--show-values`). After the run: the same two lists are identical; Easy Auth sign-in works; `az containerapp show` for api and agent prints `external: false`; the web app's env shows `API_URL` and `AGENT_URL` with `https://` and `.internal.`; from inside the web app (`az containerapp exec`) an https request to `API_URL` with certificate verification on returns the api `/health` (this is the TLS gate); the api and agent FQDNs fail from the laptop. **SQL proof (specialist edit 3):** a broken SQL path is silent by design (cache reads fall back to Google), so after one signed-in search the owner runs `./scripts/apply-schema.sh --verify` and the row counts in `rr.searches` and `rr.users` are above zero (the same line goes into the RR-34 run-order table).

## Risks and open questions

1. **Api app gets only `google-places-key` (ticket: both secrets).** Least privilege, and `config.py` agrees. Decides: specialist at approval; the owner is told in the PR. If kept as the ticket says, the loop adds `openai-api-key` to both.
2. **TLS to the internal https FQDN.** Whether Node accepts the certificate served for `<app>.internal.<domain>` is not verified; Learn only warns that names may not match. The RR-36 gate finds out. If it fails, the fallback is a design change that needs the owner: "Allow `allowInsecure: true` on the api and agent apps, so the web app calls them over http inside the environment (traffic stays in the environment; the repo docs now say https)?" Decides: owner; recommendation: wait for the gate result, no change now.
3. **Resolved (specialist, 2026-11-22):** `infra/deploy.sh` reads the environment only and names a missing variable; the workflow supplies the values from environment secrets, and the script is no longer run from a laptop.
4. **Proof that web secrets survive.** `what-if` cannot show secrets, so the proof is the before/after secret-name list in RR-36. Question for the owner: "Do you accept the RR-36 before/after secret-name list and a working sign-in as the evidence that the web app's Easy Auth secret is intact, in place of the ticket's what-if wording?" Recommendation: Yes.
5. **`imageTag` renamed to `webImageTag`** and two new tag params: any caller of `main.bicep` other than `deploy.sh` breaks. I found none in the repo. Decides: repo worker.
6. **Key file on disk** (mode 600, removed on exit) instead of `KEY=VALUE` on the command line. Alternatives: a `.bicepparam` file with `readEnvironmentVariable` (az CLI behaviour with extra inline params not verified). Decides: specialist.
7. **Role assignment race** on first pull (see gotchas); accepted, handled by re-running. Decides: repo worker, noted on RR-36.
8. **`az bicep build` is not in `ci-local.sh`.** Adding it needs the Bicep CLI in CI, a separate concern. Decides: coordinator (new ticket if wanted).
9. **Cost price missing.** Question for the owner: "May a worker fetch the Azure Container Apps pricing page once, to put per-unit prices in this estimate?" Recommendation: Yes, only if you expect heavy use; light and medium use stay inside the free grant.
10. **Merge and run order.** RR-33 (setup script: backend and infra identities, custom role, roles; schema script with the backend identity's SQL grant) must be merged before RR-36 and its setup script runs before the first infra run (order in "First rollout" above); RR-32 can merge first because it deploys nothing. Decides: coordinator.
11. **The web app's `id-restaurant-researcher-acrpull` and its `AcrPull`.** The file creates them today. Owner 610/611 say identities and role grants leave the file; moving the existing pair means a one-time adoption (the identity already exists, so the setup script must create-if-missing, and Bicep must reference it as `existing`) and changes the web app's resource wiring. Recommendation: move it in the same PR, so the file holds no role or identity resource and the infra identity needs no role-assignment right at all; the cost is more `what-if` evidence. Decides: specialist.
12. **Exact rights of the custom role** (RR-33 plan): deployments, Container Apps, the managed environment (read, and write if the file changes it), `Managed Identity Operator` on the two existing identities (for attaching them), read on the registry. Listed in the RR-33 plan from Learn; this spec only requires "no role assignment, no identity creation". Decides: specialist.

## Files touched (one PR, about 150 hand-written lines of Bicep and shell, plus tests and docs)

| File | Change | About lines |
|---|---|---|
| `infra/main.bicep` | params, backend identity reference, backend app loop, web `env`, header comment (and, if question 11 is yes, the acrpull identity and role removed) | +85 |
| `.github/workflows/deploy-infra.yml` | new `Deploy infra` workflow (owner merge) | +60 |
| `infra/deploy.sh` | env checks, per-app tags, image check, key file | +40 net |
| `scripts/tests/test-deploy-scripts.sh` | `deploy.sh` cases against the fake `az` (written first) | +50 |
| `deployment/README.md` | backend section, first-deploy order, key handling | +20, minus stale text |
| `docs/development.md`, `CLAUDE.md` | only if a statement becomes wrong (checked at implementation) | few |

Not touched: `scripts/lib/images.sh`, `redeploy.sh`, `build-push.sh`, `wait-healthy.sh`, `setup-github-deploy.sh` (RR-33), workflows, frontend, backend.

## Schematic

`../plans/diagrams/2026-11-22-backend-rollout-bicep-api-agent-apps.mmd` (Mermaid `flowchart TB`: green new, amber changed, grey unchanged, with legend).
