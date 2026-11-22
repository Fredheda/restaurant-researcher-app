# Plan: Bicep for the api and agent apps, `infra/deploy.sh`

- Ticket: RR-32
- Repo: `restaurant-researcher-app`
- Tier: non-trivial
- Spec: `docs/specs/2026-11-22-backend-rollout-bicep-api-agent-apps.md` (the binding rules of the specialist, 2026-11-22, win where the spec is stale)
- Related: `docs/specs/2026-11-22-backend-rollout-pipeline-setup-and-sql-schema.md` (RR-33); the `Deploy infra` workflow of the same spec is RR-70, plan `plans/2026-11-22-backend-rollout-deploy-infra-workflow.md`
- Needs merged first: RR-33 (setup script: both app identities with their `AcrPull`, the infra identity and its custom role). RR-70 needs this plan merged first, not the other way round.
- Status: draft
- Date: 2026-11-22
- Diagram: `diagrams/2026-11-22-backend-rollout-bicep-api-agent-apps.mmd`

## TL;DR

- Ships one PR: `infra/main.bicep` (api and agent apps, web `API_URL` and `AGENT_URL`, both identities and the Container Apps environment as `existing`: the file creates Container Apps only, no role, identity or environment resource), `infra/deploy.sh` (env-only inputs, per-app tags, key file, no registry check), tests, docs. No `.github/` file; the `Deploy infra` workflow is RR-70.
- Nothing is deployed by this PR. RR-36 runs the apps' first deploy, each step on the owner's explicit yes and his approval in GitHub.
- Owner actions: merge (owner-only: behaviour); before RR-36, run the RR-33 setup script once and set four secrets of the `production` environment (`GOOGLE_PLACES_API_KEY`, `OPENAI_API_KEY`, `SQL_SERVER`, `SQL_DATABASE`). RR-33 must have merged first.
- Specialist actions (read-only, outside the sandbox, masked output on the ticket): gate 1 `az bicep build` before the PR is marked ready; gate 4 `what-if` after the owner's first setup run.
- Cost: no new meter besides two scale-to-zero Container Apps. Light (20 visits per month) and medium (100): 0 USD while the subscription's monthly free grant has room, at most 0.18 and 0.88 USD for the backend apps if it has none. Heavy (600): 1.51 USD with the full grant (it is the whole project's overage, all caused by the backend apps), 9.14 USD for the whole project with no grant.
- About 450 changed lines in 6 files; needs RR-33 merged first; RR-70 follows this PR.

## Scope and the RR-70 split

One concern: the infra definition and its script (`infra/main.bicep`, `infra/deploy.sh`, `scripts/tests/test-deploy-scripts.sh`, `deployment/README.md`, `CLAUDE.md`, `docs/development.md`). It touches nothing under `.github/`, so it is not held up by the rule that `ci.yml` / `claude-review.yml` / `.github` stories never run in parallel. The specialist's gates 1 and 4 apply to it. About 450 changed lines, 6 files: far under the size limit (25 files, 5000 lines).

The `Deploy infra` workflow (`.github/workflows/deploy-infra.yml`, its guard tests and its doc lines) is RR-70, a separate plan and PR: a different risk class (it logs in to Azure with OIDC and reads production secrets), owner merge, and it must be serialised against the other `.github` stories. RR-70 merges after this PR; its doc edits take this plan's results as their anchors (task 5.2, 5.3 and 5.4 below).

## Dependencies and order

- RR-33 merges first. It creates `id-restaurant-researcher-backend` with `AcrPull`, makes sure `id-restaurant-researcher-acrpull` and its `AcrPull` exist (create-if-missing), creates the infra identity, its custom role, and the repo secret `AZURE_INFRA_CLIENT_ID` (the secret is used by the RR-70 workflow; RR-33's plan must match that name).
- This PR after RR-33, then RR-70. Both are safe to merge before any live run: they deploy nothing.
- Live run order (RR-36, spec "First rollout"; each step needs the owner's yes, each workflow run his approval in GitHub):
  1. Owner runs `./scripts/setup-github-deploy.sh` (identities, custom role, federated credentials, environment) and sets the four environment secrets.
  2. **Deploy** for SHA X: builds both images, rolls the web app, skips the missing backend apps.
  3. **Deploy infra** for SHA X (the RR-70 workflow, which runs this PR's `infra/deploy.sh`): creates the api and agent apps and changes the web app's env; the images exist because step 2 built them (`deploy.sh` does not check the registry: a tag without an image fails the new revision while the running one keeps serving).
  4. Owner re-runs `setup-github-deploy.sh`: the deploy identity gets its roles on the new apps.
  5. Owner runs `apply-schema.sh` and `--verify` (it needs only the backend identity, so it may run before step 3).
  6. **Deploy** for SHA X again: rolls all three apps and locks the tags.
  7. `./scripts/wait-healthy.sh` (the workflows run it too).
- Read-only gates by the specialist, on the PR branch, outside the sandbox: gate 1 `az bicep build` (no login) before this PR is marked ready; gate 4 `what-if` (needs `az login` and the backend identity, so after step 1) before the first run of step 3. Output masked (every GUID replaced) and pasted on the ticket.
- This PR touches no `.github/` file, so it is not serialised against `ci.yml`, `claude-review.yml` or other `.github` stories; RR-70 is.

## Cost estimate

Source: Azure Retail Prices API (`https://prices.azure.com/api/retail/prices`), fetched 2026-11-22; region westeurope, Consumption, USD, effective 2022-06-01, values rounded to 6 decimals. Free grant: `https://azure.microsoft.com/pricing/details/container-apps/`, fetched 2026-11-22.

| Meter | Rate (USD) |
|---|---|
| vCPU, active | 0.000034 per second |
| vCPU, idle | 0.000004 per second |
| Memory, active | 0.000004 per GiB-second |
| Memory, idle | 0.000004 per GiB-second |
| Requests | 0.56 per million |
| Free grant, per subscription per month | 180,000 vCPU-seconds, 360,000 GiB-seconds, 2 million requests |

- The grant is per subscription and shared by every Container App in it, including other projects. What is left for this project is unknown: both cases below are shown.
- Apps scale to zero (`minReplicas: 0`), so idle rates do not apply. Only requests from outside the environment are billable: web to api and agent are internal, so the backend apps add no request charge.
- Per replica 0.25 vCPU and 0.5 GiB: each active replica-second is 0.25 vCPU-seconds and 0.5 GiB-seconds.
- Assumption (spec, not measured): one visit keeps web, api and agent replicas active about 10, 8 and 6 minutes: 24 replica-minutes (1,440 replica-seconds) for the project, 14 (840) for the two new apps.

| Level | Visits per month | Project replica-s | Project vCPU-s | Project GiB-s | Requests from outside | Project, no grant | Project, full grant | New apps only, no grant |
|---|---|---|---|---|---|---|---|---|
| Light | 20 | 28,800 | 7,200 | 14,400 | 4,000 | 0.30 USD | 0 | 0.18 USD |
| Medium | 100 | 144,000 | 36,000 | 72,000 | 20,000 | 1.52 USD | 0 | 0.88 USD |
| Heavy | 600 | 864,000 | 216,000 | 432,000 | 120,000 | 9.14 USD | 1.51 USD | 5.29 USD |

Arithmetic (USD): project, no grant: light 7,200 x 0.000034 + 14,400 x 0.000004 + 0.004 x 0.56 = 0.2448 + 0.0576 + 0.00224 = 0.30464; medium 1.224 + 0.288 + 0.0112 = 1.5232; heavy 7.344 + 1.728 + 0.0672 = 9.1392. Heavy with the full grant: (216,000 - 180,000) x 0.000034 + (432,000 - 360,000) x 0.000004 = 1.224 + 0.288 = 1.512; requests (120,000) stay inside the 2 million. The web app alone at heavy use is 90,000 vCPU-seconds, inside the grant, so the 1.512 overage is caused by the backend apps. New apps only (840 s per visit = 210 vCPU-s and 420 GiB-s): light 4,200 x 0.000034 + 8,400 x 0.000004 = 0.1764; medium 21,000 and 42,000: 0.882; heavy 126,000 and 252,000: 5.292.

No other meter: identities and role assignments cost nothing (the `Deploy infra` workflow is costed in the RR-70 plan). No EUR conversion is sourced; the amounts stay in USD.

## Schematic

`docs/plans/diagrams/2026-11-22-backend-rollout-bicep-api-agent-apps.mmd` (Mermaid `flowchart TB`: GitHub, repo scripts, Azure identity and RBAC, web app, backend apps, data; green new, amber changed, grey unchanged on boxes and arrows, legend node). The workflow that runs `deploy.sh` appears as one grey box (RR-70).

## What was verified, and what was not

Verified from Microsoft Learn (2026-11-22):

- `existing` syntax: `resource x 'Type@version' existing = { name: ... }`; the resource is not deployed again; a missing one fails with `NotFound` (Learn, "Reference existing resources in Bicep"). Properties (`.id`, `.properties.clientId`) are read through the symbolic name.
- A resource loop (`[for app in backendApps: {...}]`) is referenced with an integer index (`backend[0].properties...`); referencing the collection without an index is error BCP144 (Learn, "Iterative loops in Bicep", BCP144).
- Container app template fields: `configuration.ingress.{external,targetPort,transport,allowInsecure}`, `configuration.secrets[].{name,value}` (value is a sensitive field, "Pass in as a secure parameter"), `configuration.registries[]`, `template.containers[].env[].{name,value,secretRef}` (Learn, `Microsoft.App/containerApps` template reference, pages for 2022-10-01 and the latest).
- Internal FQDN form `<APP_NAME>.internal.<ENVIRONMENT_UNIQUE_ID>.<REGION>.azurecontainerapps.io`, read with `properties.configuration.ingress.fqdn`; apps in one environment reach each other by FQDN and traffic never leaves the environment; for https between apps the caller must handle certificate verification because the name may not match the certificate (Learn, "Communicate between container apps", "Custom domain with TLS/SSL").
- JSON parameter file format (`$schema`, `contentVersion`, `parameters.<name>.value`); the CLI takes a parameter file first and `KEY=VALUE` overrides after it; a parameter file in the file must contain only parameters the template defines (Learn, "Create a parameters file for Bicep deployment", "Deploy Bicep files with the Azure CLI"). `az deployment group create --help` (local, read-only) confirms the `@{path}` syntax, in-order evaluation, "file first, then KEY=VALUE".
- Registry data plane: in registries using RBAC-only mode, `AcrPull`, `AcrPush` grant pull; `Reader`/`Contributor` do not grant repository data-plane access in ABAC mode (Learn, ACR roles overview). The specialist therefore removed the image check from `deploy.sh`: the infra identity gets no `AcrPull` (the registry is shared; the role would read every project's images).
- `az bicep install --version vX.Y.Z` installs a pinned Bicep CLI (Learn, "Bicep CLI commands"; `az bicep install` reference). `deploy.sh` runs no `az bicep` command itself: `az deployment group create` compiles `main.bicep` with the Bicep binary Azure CLI installs when it needs one, unpinned. The pin therefore lives in the workflow that runs `deploy.sh` (RR-70), not here.

Not verified (compile happens in gate 1, by the specialist; the sandbox has no Bicep CLI and no network):

- That the whole `main.bicep` compiles: the `concat(...)` of an array with a ternary that yields `[]`, the object-in-array one-line syntax, `backend[0]` read inside another resource's `env`, `json('0.25')` unchanged from the old file.
- That `Microsoft.App/containerApps@2025-01-01` exposes every property above (the version is the one the file already uses; Learn pages fetched were for older and the latest versions).
- That the web app's `customDomains[].certificateId`, built from the `existing` environment's `.id` (`'${environment.id}/managedCertificates/mc-cae-restaurant-restaurants-fred-8760'`), is accepted exactly as when the file declared the environment: `existing` returns the same resource id (Learn, "Reference existing resources in Bicep"), so the string is unchanged, but the PUT of the web app with the binding was not run, and the managed certificate resource is not declared or read in the file. `what-if` shows whether the binding changes (gate 4).
- That ARM accepts the web app PUT without a `secrets` block while keeping the Easy Auth secret (the spec's reasoning; `what-if` cannot show secrets; evidence is RR-36's before/after name list).
- That `what-if` accepts `@file` plus `KEY=VALUE` the same way as `create` (same parameter handling per `--help`, not run).
- TLS verification of `https://<app>.internal...` from Node (RR-36 gate, spec open question 2).

Everything else below was exercised offline in a scratch copy of current `main` of the repo (`test-deploy-scripts.sh`, `shellcheck`), including mutation checks (a role assignment and a created identity added to the Bicep file, a secure param given a default): each is caught by the guard tests below. The scratch copy was based on the pilot worktree at commit `249a9b0`; RR-33 changes `test-deploy-scripts.sh` (fake `az`, new cases) before this plan runs, so re-run the red and green steps after rebasing the worktree on `origin/main` and re-read each anchor before an Edit.

## Rules for the executor

- Worktree per agent, from `origin/main`, never the main checkout. No `.env` is read or needed. Edit only with Edit and Write, no `sed`, no heredocs.
- New code carries no comment except a constraint, a security reason or a workaround with its source. The PR ends with a separate cleanup commit that deletes comments restating code or narrating history in every file it edits (list in task 6). The PR description carries a `Comments: <what and why>` line.
- Commit messages: two lines at most, no trailer. Repo docs contain placeholders only: no resource ids, no non-public hosts, no open weaknesses.
- Tests never touch the network or Azure. Run `auditing-branch-changes` before `gh pr create`; put its result in the PR-ready hand-over and on the ticket. Open a draft PR first, `gh pr ready` only after the draft's own CI run ends, then `gh pr checks --watch` (poll no faster than every 60 seconds).
- Gate legend: **offline** = runs in the sandbox, no login; **az login** = specialist or owner only.

---

# Tasks: Bicep, `deploy.sh`, tests, docs

### Task 0: preconditions and worktree

- [ ] **0.1** Check RR-33 merged and fetch.

```bash
git -C <workspace>/restaurant-researcher-app fetch origin
git -C <workspace>/restaurant-researcher-app show origin/main:scripts/setup-github-deploy.sh | grep -c -E 'id-restaurant-researcher-backend|AZURE_INFRA_CLIENT_ID'
```

Expected: a number of 2 or more. If it prints `0`, stop: RR-33 is not merged; report to the coordinator.

- [ ] **0.2** Create the worktree.

```bash
git -C <workspace>/restaurant-researcher-app worktree add ../.worktrees/restaurant-researcher-app-rr32-infra -b rr-32-infra-api-agent-apps origin/main
cd <workspace>/.worktrees/restaurant-researcher-app-rr32-infra
git status --short --branch
```

Expected: `## rr-32-infra-api-agent-apps...origin/main`, nothing else.

- [ ] **0.3** Check RR-33's script makes both app identities and the secret name used here (the binding rule: both identities and their `AcrPull` are created by the setup script).

```bash
grep -n -E 'PULL_ID|BACKEND_ID|id-restaurant-researcher-(acrpull|backend)|AZURE_INFRA_CLIENT_ID' scripts/setup-github-deploy.sh
```

Expected: `ensure_identity` (or equivalent) lines for both `id-restaurant-researcher-acrpull` and `id-restaurant-researcher-backend`, an `AcrPull` grant for each, and `gh secret set AZURE_INFRA_CLIENT_ID`. If the acrpull identity or its `AcrPull` is only referenced, not created, or the secret has another name, stop and report to the coordinator (the Bicep file will refer to both as `existing`; a fresh environment would fail).

- [ ] **0.4** Baseline.

```bash
./scripts/tests/test-deploy-scripts.sh | tail -1
```

Expected: `deploy script tests: all passed`.

### Task 1: failing tests for `infra/deploy.sh` (red)

Edit `scripts/tests/test-deploy-scripts.sh`. Re-read the file first; the anchors below are from `main` before RR-33.

- [ ] **1.1** Edit 1, document the new fake variable and capture (anchor: the `FAKE_BROKEN` line in the header).

old:

```
#   FAKE_BROKEN         comma list of apps whose containerapp calls fail with another error
```

new:

```
#   FAKE_BROKEN         comma list of apps whose containerapp calls fail with another error
#   FAKE_FAIL_DEPLOY    any value: `az deployment group create` fails
# A `deployment group create` call copies its `--parameters @file` to $FAKE_LOG.params
# (with the file's mode and path in .params-mode and .params-path) before answering.
```

- [ ] **1.2** Edit 2, the fake `az` answers `deployment group create` (anchor: the `containerapp update` case inside the fake's heredoc).

old:

```
  "containerapp update"*)
    [ "${FAKE_FAIL_UPDATE:-}" = any ] && exit 1
```

new:

```
  "deployment group create"*)
    file=$(echo "$*" | sed -nE 's/.*--parameters @([^ ]+).*/\1/p')
    if [ -n "$file" ]; then
      cp "$file" "$FAKE_LOG.params"
      python3 -c 'import os, sys; print(oct(os.stat(sys.argv[1]).st_mode & 0o777))' "$file" >"$FAKE_LOG.params-mode"
      echo "$file" >"$FAKE_LOG.params-path"
    fi
    [ -n "${FAKE_FAIL_DEPLOY:-}" ] && exit 1
    echo Succeeded
    exit 0 ;;
  "containerapp update"*)
    [ "${FAKE_FAIL_UPDATE:-}" = any ] && exit 1
```

- [ ] **1.3** Edit 3, `run` keeps the script's output and clears the new files (anchor: the `run()` function; add `out_has` after `called`).

old:

```
  rm -f "$LOG.build-dir" "$LOG.n" "$LOG.gh" "$LOG.gh-body"
  PATH="$tmp/bin:$PATH" FAKE_LOG="$LOG" "$@" >/dev/null 2>&1
  rc=$?
}
called() { grep -q -- "$1" "$LOG"; }
```

new:

```
  rm -f "$LOG.build-dir" "$LOG.n" "$LOG.gh" "$LOG.gh-body" "$LOG.params" "$LOG.params-mode" "$LOG.params-path"
  PATH="$tmp/bin:$PATH" FAKE_LOG="$LOG" "$@" >"$LOG.out" 2>&1
  rc=$?
}
called() { grep -q -- "$1" "$LOG"; }
out_has() { grep -q -- "$1" "$LOG.out"; }
```

- [ ] **1.4** Edit 4, the `deploy.sh` cases (anchor: the line `run ./scripts/setup-github-deploy.sh` followed by `check "setup exits 0 against the fakes"`; insert the new section before it).

old:

```
run ./scripts/setup-github-deploy.sh
check "setup exits 0 against the fakes" test "$rc" -eq 0
```

new:

```
# --- infra/deploy.sh ------------------------------------------------------

THIRD=3333333333333333333333333333333333333333
KEY_G=gkey-0123456789abcdef
KEY_O=okey-0123456789abcdef
export GOOGLE_PLACES_API_KEY=$KEY_G OPENAI_API_KEY=$KEY_O SQL_SERVER=sql.example.test SQL_DATABASE=db1

for var in GOOGLE_PLACES_API_KEY OPENAI_API_KEY SQL_SERVER SQL_DATABASE; do
  FAKE_IMAGES="$ALL_OLD" run env "$var=" ./infra/deploy.sh "$SHA"
  check "deploy.sh stops when $var is empty" test "$rc" -eq 2
  check "deploy.sh names $var" out_has "$var"
  check "deploy.sh without $var calls no az" test ! -s "$LOG"
done

run ./infra/deploy.sh abc
check "deploy.sh rejects a tag that is not a full SHA" test "$rc" -eq 2
check "that rejection deploys nothing" not called "deployment group"

FAKE_IMAGES="$ALL_OLD" run ./infra/deploy.sh "$SHA"
check "deploy.sh succeeds with an argument tag" test "$rc" -eq 0
check "deploy.sh puts the argument tag on all three apps" \
  called "webImageTag=$SHA apiImageTag=$SHA agentImageTag=$SHA"
check "deploy.sh passes the SQL names" called "sqlServer=sql.example.test sqlDatabase=db1"
check "deploy.sh makes no registry call" not called "acr "

FAKE_IMAGES="$WEB_APP=$REG/$WEB:$OLD,$API_APP=$REG/$BACKEND:$OLDER,$AGENT_APP=$REG/$BACKEND:$THIRD" \
  run ./infra/deploy.sh
check "deploy.sh without an argument keeps each app's current tag" \
  called "webImageTag=$OLD apiImageTag=$OLDER agentImageTag=$THIRD"
check "deploy.sh prints the tags it will use" out_has "web=$OLD api=$OLDER agent=$THIRD"

FAKE_ABSENT="$API_APP" FAKE_IMAGES="$ALL_OLD" run ./infra/deploy.sh
check "deploy.sh without an argument stops when an app does not exist" test "$rc" -eq 1
check "that stop names the app" out_has "$API_APP"
check "that stop deploys nothing" not called "deployment group"

FAKE_IMAGES="$ALL_OLD" run ./infra/deploy.sh "$SHA"
check "no az argument carries a key" not grep -q -e "$KEY_G" -e "$KEY_O" "$LOG"
check "no output carries a key" not grep -q -e "$KEY_G" -e "$KEY_O" "$LOG.out"
check "the key file holds both keys under their parameter names" \
  python3 -c 'import json, sys
p = json.load(open(sys.argv[1]))["parameters"]
assert p["googlePlacesKey"]["value"] == sys.argv[2] and p["openaiApiKey"]["value"] == sys.argv[3]' \
  "$LOG.params" "$KEY_G" "$KEY_O"
check "the key file is private to the owner" grep -qx 0o600 "$LOG.params-mode"

GOOGLE_PLACES_API_KEY='a"b\c' FAKE_IMAGES="$ALL_OLD" run ./infra/deploy.sh "$SHA"
check "a key with a quote and a backslash survives in the key file" \
  python3 -c 'import json, sys
assert json.load(open(sys.argv[1]))["parameters"]["googlePlacesKey"]["value"] == "a\"b\\c"' "$LOG.params"

FAKE_FAIL_DEPLOY=1 FAKE_IMAGES="$ALL_OLD" run ./infra/deploy.sh "$SHA"
check "deploy.sh fails when the deployment fails" test "$rc" -ne 0
check "a failed deployment still removes the key file" test ! -e "$(cat "$LOG.params-path")"

run ./scripts/setup-github-deploy.sh
check "setup exits 0 against the fakes" test "$rc" -eq 0
```

(If RR-33 changed the lines after `run ./scripts/setup-github-deploy.sh`, keep them; only insert the new block before that line.)

- [ ] **1.5** Run, expect red. Offline.

```bash
./scripts/tests/test-deploy-scripts.sh 2>&1 | grep -c '^FAIL'
./scripts/tests/test-deploy-scripts.sh 2>&1 | tail -1
```

Expected: `24` and `deploy script tests: 24 failed` (the old `deploy.sh` ignores the new variables, accepts any tag, passes `imageTag=`, writes no key file; `deploy.sh makes no registry call` and the failed-deployment cleanup check pass already and guard against regressions: the old script made no registry call, and the failed-deployment check passes vacuously while no key file exists). Python tracebacks and `cat: ...params-path: No such file` lines in the output are expected while red. Every pre-existing check still prints `PASS` (if RR-33's count differs, the pre-existing checks must all pass and only `deploy.sh` checks fail).

### Task 2: `infra/deploy.sh` (green)

- [ ] **2.1** Replace the whole file `infra/deploy.sh` with (Write; keep mode `755`):

```bash
#!/usr/bin/env bash
# Provision (or update) the Container Apps environment + the web, api and agent
# apps from infra/main.bicep. Idempotent — re-run to roll config changes.
#
# Usage: ./infra/deploy.sh [image-tag]
#   image-tag defaults to the tag each app runs now, so an infra run never
#   rolls an app to an image that was not deployed (a Bicep run from a
#   checkout at a different commit would otherwise do that). On the very first
#   deploy there are no apps yet: pass the tag explicitly, after Deploy built
#   its images. The script does not check the registry: a tag without an image
#   fails the new revision while the running one keeps serving.
#
# Reads GOOGLE_PLACES_API_KEY, OPENAI_API_KEY, SQL_SERVER and SQL_DATABASE from
# the environment only. The keys reach az through a private temp file, never
# the command line.
set -euo pipefail
cd "$(dirname "$0")/.."
# shellcheck source=../scripts/lib/images.sh
source scripts/lib/images.sh

for var in GOOGLE_PLACES_API_KEY OPENAI_API_KEY SQL_SERVER SQL_DATABASE; do
  if [ -z "${!var:-}" ]; then
    echo "ERROR: $var is not set." >&2
    exit 2
  fi
done

tag_arg="${1:-}"
if [ -n "$tag_arg" ] && ! is_sha "$tag_arg"; then
  echo "ERROR: the image tag must be a full 40-character commit SHA." >&2
  exit 2
fi

IFS='|' read -r api_app _ <<<"${APPS[0]}"
IFS='|' read -r agent_app _ <<<"${APPS[1]}"
IFS='|' read -r web_app _ <<<"${APPS[2]}"

tag_of() {
  if [ -n "$tag_arg" ]; then
    echo "$tag_arg"
    return
  fi
  if ! app_exists "$1"; then
    echo "ERROR: $1 does not exist yet; pass the image tag." >&2
    exit 1
  fi
  local image
  image=$(az containerapp show -n "$1" -g "$RG" \
    --query "properties.template.containers[0].image" -o tsv)
  echo "${image##*:}"
}

web_tag=$(tag_of "$web_app")
api_tag=$(tag_of "$api_app")
agent_tag=$(tag_of "$agent_app")
for tag in "$web_tag" "$api_tag" "$agent_tag"; do
  [ -n "$tag" ] || { echo "ERROR: could not resolve an image tag; pass one." >&2; exit 1; }
done

keys_file=$(mktemp "${TMPDIR:-/tmp}/rr-infra-keys.XXXXXX")
trap 'rm -f "$keys_file"' EXIT
python3 -c '
import json, os
print(json.dumps({
    "$schema": "https://schema.management.azure.com/schemas/2019-04-01/deploymentParameters.json#",
    "contentVersion": "1.0.0.0",
    "parameters": {
        "googlePlacesKey": {"value": os.environ["GOOGLE_PLACES_API_KEY"]},
        "openaiApiKey": {"value": os.environ["OPENAI_API_KEY"]},
    },
}))' >"$keys_file"

echo "Deploying to resource group $RG: web=$web_tag api=$api_tag agent=$agent_tag"
az deployment group create \
  --resource-group "$RG" \
  --template-file infra/main.bicep \
  --parameters "@$keys_file" \
    webImageTag="$web_tag" apiImageTag="$api_tag" agentImageTag="$agent_tag" \
    sqlServer="$SQL_SERVER" sqlDatabase="$SQL_DATABASE" \
  --query "properties.provisioningState" -o tsv
```

Design notes: the script sources `scripts/lib/images.sh` (removes the duplicated `RG=rg-chatbot`); the app list order there (api, agent, web) is the only place app names live, and the per-app tag test above fails if the order is ever mixed up. The web FQDN line is dropped on purpose (open question 5). There is no image check and no registry call (specialist decision: the infra identity gets no `AcrPull`, and the shared registry would let that role read every project's images); a SHA whose image was never built fails the new revision while the running revision keeps serving, and the docs say "run Deploy for the SHA first". The script runs no `az bicep` command, so it carries no Bicep pin (the pin is in the RR-70 workflow). `mktemp` creates the file mode `600`; the test asserts it. The trap runs on every exit path, including `set -e` failures.

- [ ] **2.2** Run. Offline.

```bash
chmod +x infra/deploy.sh
bash -n infra/deploy.sh && shellcheck -x -S warning infra/deploy.sh && echo shell ok
./scripts/tests/test-deploy-scripts.sh 2>&1 | grep -v '^PASS'
```

Expected: `shell ok`, then `deploy script tests: all passed` (no `FAIL` lines; at this point no Bicep guard exists yet). The scratch run on bash 3.2 (macOS) and the CI shell (bash 5) both pass; the script uses no bash-4 feature.

- [ ] **2.3** Commit.

```bash
git add infra/deploy.sh scripts/tests/test-deploy-scripts.sh
git commit -m "Make infra/deploy.sh env-only with per-app tags" -m "The keys reach az through a private temp file, never the command line."
```

(Commit message: two lines, no trailer.)

### Task 3: failing guards for `infra/main.bicep` (red)

- [ ] **3.1** Insert the Bicep guards in `scripts/tests/test-deploy-scripts.sh` directly before the `# --- infra/deploy.sh ---` heading added in 1.4.

old:

```
# --- infra/deploy.sh ------------------------------------------------------

THIRD=3333333333333333333333333333333333333333
```

new:

```
# --- infra/main.bicep -----------------------------------------------------
# The identity that deploys this file cannot write roles, identities or the
# environment, and a deployment re-submits every resource in the file.

BICEP=infra/main.bicep
created_resources() { grep -E "^resource .*$1" "$BICEP" | grep -v ' existing = '; }
secure_params_with_default() { grep -A1 '^@secure()' "$BICEP" | grep -E '^param .* = '; }
resource_block() { sed -n "/^resource $1 /,/^}/p" "$BICEP"; }
web_declares_secrets() { resource_block frontend | grep -q 'secrets:'; }
backends_are_internal() { resource_block backend | grep -q 'external: false'; }

check "main.bicep declares no role assignment" not grep -q 'Microsoft\.Authorization' "$BICEP"
check "main.bicep creates no identity" test -z "$(created_resources 'Microsoft\.ManagedIdentity/')"
check "main.bicep creates no managed environment" test -z "$(created_resources 'Microsoft\.App/managedEnvironments')"
check "main.bicep refers to both app identities and the environment as existing" \
  test "$(grep -cE '^resource .* existing = ' "$BICEP")" -eq 3
check "main.bicep has exactly two secure params" test "$(grep -c '^@secure()' "$BICEP")" -eq 2
check "the secure params have no default" test -z "$(secure_params_with_default)"
check "the web app declares no secrets block" not web_declares_secrets
check "the backend apps have internal ingress" backends_are_internal

# --- infra/deploy.sh ------------------------------------------------------

THIRD=3333333333333333333333333333333333333333
```

Why each guard catches a bug no other test catches: role, identity or environment resource (the infra identity cannot write them; a deployment re-submits every resource, so one left in the file fails the whole run with an authorization error; the file may create or change Container Apps only); `existing` count of three (the two identities and the environment; a dropped or renamed reference silently changes who the apps run as or where they run); two secure params (a third secret parameter, or a lost `@secure()`, leaks a key into deployment history); no default (a default overwrites working keys on any direct `az deployment` call); no web `secrets` (ARM treats the array as the complete list and drops the Easy Auth secret); internal ingress (an `external: true` slip exposes the backend).

- [ ] **3.2** Run, expect red. Offline.

```bash
./scripts/tests/test-deploy-scripts.sh 2>&1 | grep '^FAIL'
./scripts/tests/test-deploy-scripts.sh 2>&1 | tail -1
```

Expected:

```
FAIL  main.bicep declares no role assignment
FAIL  main.bicep creates no identity
FAIL  main.bicep creates no managed environment
FAIL  main.bicep refers to both app identities and the environment as existing
FAIL  main.bicep has exactly two secure params
FAIL  the backend apps have internal ingress
deploy script tests: 6 failed
```

`the secure params have no default` and `the web app declares no secrets block` pass now (the current file has neither); they are regression guards, shown to fail under mutation in the scratch run.

### Task 4: `infra/main.bicep` (green)

- [ ] **4.1** Replace the whole file `infra/main.bicep` with the text below (Write). This removes the `acr` existing reference, the `acrPullRoleId` variable, the `identity` and `acrPull` resources, the `dependsOn`, the created `environment` resource (now `existing`), and the `frontendFqdn` output (nothing reads it any more: `deploy.sh` no longer prints the FQDN). The title lines at the top, the `Deploy with` line and the `customDomains` history are the old ones, kept for the cleanup commit in task 6; the constraint comments (what the file may create, secure params, no web `secrets`) are new.

```bicep
// The web, api and agent Container Apps of restaurant-researcher-app, in the
// existing rg-chatbot resource group.
//
// Only Container Apps are created here: the identity that deploys this file
// cannot write identities, role assignments or the environment.
// scripts/setup-github-deploy.sh creates both app identities and their
// AcrPull grants; this file refers to them and to the environment as existing.
//
// Easy Auth is intentionally NOT here — per-user role assignment can't be
// expressed in Bicep, so it stays in scripts/setup-easyauth.sh +
// scripts/approve-user.sh.
//
// Deploy with infra/deploy.sh.

@description('Region for all resources. Defaults to the resource group location.')
param location string = resourceGroup().location

@description('Existing Azure Container Registry name.')
param acrName string = 'acrchatbotfredheda'

@description('Container Apps environment name.')
param environmentName string = 'cae-restaurant-researcher'

@description('Frontend (Next.js) container app name.')
param frontendAppName string = 'ca-restaurant-researcher-web'

@description('Api container app name.')
param apiAppName string = 'ca-restaurant-researcher-api'

@description('Agent container app name.')
param agentAppName string = 'ca-restaurant-researcher-agent'

@description('Existing user-assigned managed identity the web app pulls images as.')
param pullIdentityName string = 'id-restaurant-researcher-acrpull'

@description('Existing user-assigned managed identity the api and agent apps run as.')
param backendIdentityName string = 'id-restaurant-researcher-backend'

@description('Web image tag (a git commit SHA).')
param webImageTag string

@description('Api image tag (a git commit SHA).')
param apiImageTag string

@description('Agent image tag (a git commit SHA).')
param agentImageTag string

@description('Fully qualified host name of the Azure SQL server.')
param sqlServer string

@description('Database name on that server.')
param sqlDatabase string

// No default: an app's secrets are replaced on every deploy, so a default
// would overwrite a working key without an error.
@description('Google Places API key.')
@secure()
param googlePlacesKey string

@description('OpenAI API key.')
@secure()
param openaiApiKey string

var loginServer = '${acrName}.azurecr.io'

var backendApps = [
  { name: apiAppName, role: 'api', tag: apiImageTag }
  { name: agentAppName, role: 'agent', tag: agentImageTag }
]

resource pullIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' existing = {
  name: pullIdentityName
}

resource backendIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' existing = {
  name: backendIdentityName
}

resource environment 'Microsoft.App/managedEnvironments@2025-01-01' existing = {
  name: environmentName
}

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

resource frontend 'Microsoft.App/containerApps@2025-01-01' = {
  name: frontendAppName
  location: location
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${pullIdentity.id}': {}
    }
  }
  properties: {
    environmentId: environment.id
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        external: true
        targetPort: 3000
        transport: 'auto'
        // ARM's PUT on this Container App treats the whole `ingress` object
        // as authoritative, so any redeploy that omits customDomains wipes
        // the binding. restaurants.frederikheda.com was originally bound
        // imperatively (outside Bicep, via `az containerapp hostname bind`);
        // declaring it here makes every future deploy preserve it instead
        // of resetting it.
        customDomains: [
          {
            name: 'restaurants.frederikheda.com'
            bindingType: 'SniEnabled'
            certificateId: '${environment.id}/managedCertificates/mc-cae-restaurant-restaurants-fred-8760'
          }
        ]
      }
      // No `secrets` block: ARM treats it as the complete list, so declaring
      // one drops the Easy Auth secret that setup-easyauth.sh stores.
      registries: [
        {
          server: loginServer
          identity: pullIdentity.id
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'restaurant-researcher-web'
          image: '${loginServer}/restaurant-researcher-web:${webImageTag}'
          resources: {
            cpu: json('0.25')
            memory: '0.5Gi'
          }
          env: [
            { name: 'API_URL', value: 'https://${backend[0].properties.configuration.ingress.fqdn}' }
            { name: 'AGENT_URL', value: 'https://${backend[1].properties.configuration.ingress.fqdn}' }
          ]
        }
      ]
      scale: {
        minReplicas: 0
        maxReplicas: 1
      }
    }
  }
}
```

The exact edit relative to the old file, for the reviewer and for `what-if`:

- Removed: `resource acr ... existing`, `var acrPullRoleId`, `resource identity ...` (a created identity), `resource acrPull 'Microsoft.Authorization/roleAssignments@2022-04-01'`, `dependsOn: [ acrPull ]` on the web app, `output frontendFqdn`.
- Changed: `environment` becomes an `existing` reference (`name: environmentName` only; no `location`, no `properties`). `environment.id` is used unchanged by the apps' `environmentId` and by the web app's `customDomains[].certificateId` string; the file creates or changes Container Apps only.
- Added: `pullIdentity` (the old `identity`, now `existing`), `backendIdentity` (`existing`), the `backend` loop, web `env`.
- Renamed: param `identityName` -> `pullIdentityName`, `imageTag` -> `webImageTag`.
- What `what-if` must show for the removed pair (gate 4): nothing. In incremental mode, resources missing from the file are left alone, and the identity and its role assignment stay in Azure (RR-33 treats them as its own). The pull identity appears as `existing`: no entry, or `NoChange`. No `- Delete`. If it shows `Delete` for the identity or role assignment, stop: the deployment mode is not incremental.
- The managed environment: not listed, or `NoChange`, never `Modify` or `Create` (the file only references it). Any line under the web app's `ingress.customDomains` (the binding, its `certificateId`) is a failure of this gate: stop and do not deploy.
- Web app `~ Modify`: only `properties.template.containers[0].env` (and the renamed image parameter changes nothing: the tag is the one it runs).

- [ ] **4.2** Run. Offline.

```bash
./scripts/tests/test-deploy-scripts.sh 2>&1 | grep -v '^PASS'
```

Expected: `deploy script tests: all passed`.

- [ ] **4.3** Gate 2, keys only as names. Offline.

```bash
grep -n -i -E 'key|secret|password' infra/main.bicep
git grep -n -E 'AIza[0-9A-Za-z_-]{20}|sk-[0-9A-Za-z_-]{20}' -- infra scripts deployment || echo none
```

Expected for the first command: every hit is a comment line (the secure-param comment, the no-secrets comment, the `Easy Auth` header), an `@description('Google Places API key.')` or `@description('OpenAI API key.')` line, `param googlePlacesKey string` / `param openaiApiKey string`, a secret `name: 'google-places-key'` or `'openai-api-key'` with `value: googlePlacesKey` / `value: openaiApiKey` (the `secrets` concat lines), or a `secretRef: 'google-places-key'` / `'openai-api-key'` env line. A literal that looks like a key, or an `'unset'` default, fails. Second command: `none`.

- [ ] **4.4** Commit.

```bash
git add infra/main.bicep scripts/tests/test-deploy-scripts.sh
git commit -m "Add the api and agent apps to the Bicep file" -m "Both app identities are referenced as existing; the file creates no role or identity."
```

### Task 5: docs

Re-read each file first (RR-33 edits `deployment/README.md` and `CLAUDE.md`); the anchors below are text from `main` before RR-33. Where an anchor moved, edit the same sentence.

- [ ] **5.1** `deployment/README.md`, "What is running" paragraph (the part after "with no Log Analytics.").

old:

```
It holds one app today, `ca-restaurant-researcher-web` (external ingress, `minReplicas: 0` / `maxReplicas: 1`, `0.25` CPU / `0.5Gi` memory). The backend apps `ca-restaurant-researcher-api` and `-agent` are added by infra later; the scripts skip them until they exist. Images live in the shared `acrchatbotfredheda` registry and are pulled via `id-restaurant-researcher-acrpull` (passwordless, managed identity).
```

new:

```
The environment holds only the web, api and agent apps. Every app scales to zero (`minReplicas: 0` / `maxReplicas: 1`, `0.25` CPU / `0.5Gi` memory).

| App | Ingress | Runs as | Image |
|---|---|---|---|
| `ca-restaurant-researcher-web` | external, port 3000 | `id-restaurant-researcher-acrpull` | `restaurant-researcher-web` |
| `ca-restaurant-researcher-api` | internal, port 8000 | `id-restaurant-researcher-backend` | `restaurant-researcher-backend` (`APP_ROLE=api`) |
| `ca-restaurant-researcher-agent` | internal, port 8000 | `id-restaurant-researcher-backend` | `restaurant-researcher-backend` (`APP_ROLE=agent`) |

The api and agent apps are created by the first infra run; until then the scripts skip them. The web app reaches them through `API_URL` and `AGENT_URL`, their internal https origins, which `infra/main.bicep` sets. Both backend apps hold the Google Places key as an app secret and the agent app also holds the OpenAI key; the web app declares no secret (its Easy Auth secret is set by `setup-easyauth.sh`). `setup-github-deploy.sh` creates both identities and their `AcrPull` grants; the Bicep file only refers to them and to the environment, and creates Container Apps only. Images live in the shared `acrchatbotfredheda` registry and are pulled without a password, as the app's managed identity.
```

- [ ] **5.2** `deployment/README.md`, "What to run" table, infra row.

old:

```
| Infra (`infra/main.bicep`) | `./infra/deploy.sh [image-tag]` from a laptop; the tag defaults to the one the app runs now, so pass the deployed SHA only to change it |
```

new:

```
| Infra (`infra/main.bicep`) | `./infra/deploy.sh [sha]` with the four variables set (see Infra deploy); each app keeps the tag it runs now unless you pass a SHA |
```

- [ ] **5.3** `deployment/README.md`, replace the last section (old placeholder text) with:

old:

```
## When the backend agent is added

This file needs a second section for that Container App, as `deploying-azure-projects` recommends for a second deployable. Do not leave this file describing only the frontend once the backend lands. See the Future Work section of the frontend-scaffolding spec.
```

new:

```
## Infra deploy

`./infra/deploy.sh [sha]` applies `infra/main.bicep`. It reads `GOOGLE_PLACES_API_KEY`, `OPENAI_API_KEY`, `SQL_SERVER` and `SQL_DATABASE` from the environment only, and stops naming a variable that is missing. The keys reach `az` through a private temp file that is removed on exit, never the command line. It prints the three tags it will use. It does not check the registry: a tag whose image does not exist fails the new revision, and the running revision keeps serving.

Without an argument each app keeps the tag it runs now. With a full SHA all three apps get that tag; the first run needs it, because the api and agent apps do not exist yet to read a tag from. Run **Deploy** for that SHA first, so the images exist.

First rollout, in order: `setup-github-deploy.sh` (identities), **Deploy** (builds the images), the infra deploy (creates the api and agent apps), `setup-github-deploy.sh` again (the deploy identity's roles on the new apps), **Deploy** again (rolls all three apps and locks the tags).
```

- [ ] **5.4** `CLAUDE.md`, Deployment section.

old:

```
`./infra/deploy.sh` deploys infra (laptop only).
```

new:

```
`./infra/deploy.sh [sha]` deploys infra; it needs `GOOGLE_PLACES_API_KEY`, `OPENAI_API_KEY`, `SQL_SERVER` and `SQL_DATABASE` in the environment.
```

The Gotchas line "The backend apps are not deployed yet" stays true until RR-36 and is not edited here.

- [ ] **5.5** `docs/development.md`, two sentences in the web variables table.

`API_URL` row: replace the tail `which the proxy turns into 502), set by the backend rollout |` with ``which the proxy turns into 502), set by `infra/main.bicep` |``.

`AGENT_URL` row: replace `the agent's internal **https** address, set by the backend rollout.` with ``the agent's internal **https** address, set by `infra/main.bicep`.``

- [ ] **5.6** `README.md`: no edit (it names `infra/` as "Bicep template and deploy script"; still true). `infra/main.bicep` header comment: already rewritten in 4.1.

- [ ] **5.7** Check docs for placeholders and no ids.

```bash
git grep -n -i -E '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|\.internal\.' -- deployment CLAUDE.md docs README.md infra || echo none
git grep -n 'The environment holds only the web, api and agent apps.' -- deployment/README.md
```

Expected: `none`, then one hit in `deployment/README.md`. Commit.

```bash
git add deployment/README.md CLAUDE.md docs/development.md
git commit -m "Document the api and agent apps and the infra deploy" -m "deployment/README.md, CLAUDE.md and docs/development.md follow infra/main.bicep."
```

### Task 6: cleanup commit (comments of the edited files)

Separate final commit. Delete comments that restate code or narrate history; keep a constraint, a security reason, a workaround.

- [ ] **6.1** `infra/main.bicep`. Delete: the two opening title lines and the bare `//` after them (they restate the resource names); the final `//` and `// Deploy with infra/deploy.sh.` (restates the file name); replace the six-line `customDomains` comment (history of how the binding was made) with its two-line constraint. Kept: the identities paragraph (security reason), the Easy Auth paragraph (why it is not here), the secure-param default comment, the no-`secrets` comment.

Edit 1, old:

```
// The web, api and agent Container Apps of restaurant-researcher-app, in the
// existing rg-chatbot resource group.
//
// Only Container Apps are created here: the identity that deploys this file
```

new:

```
// Only Container Apps are created here: the identity that deploys this file
```

Edit 2, old:

```
// scripts/approve-user.sh.
//
// Deploy with infra/deploy.sh.

```

new:

```
// scripts/approve-user.sh.

```

Edit 3, old:

```
        // ARM's PUT on this Container App treats the whole `ingress` object
        // as authoritative, so any redeploy that omits customDomains wipes
        // the binding. restaurants.frederikheda.com was originally bound
        // imperatively (outside Bicep, via `az containerapp hostname bind`);
        // declaring it here makes every future deploy preserve it instead
        // of resetting it.
```

new:

```
        // ARM treats `ingress` as authoritative: a deploy that omits
        // customDomains wipes the binding.
```

Comment lines in the file: 19 before the PR, 14 after (three constraint comments added, nine lines deleted).

- [ ] **6.2** `infra/deploy.sh`. Replace the header (it restates the file name and the idempotence) with the constraint and the security reason only.

old:

```
# Provision (or update) the Container Apps environment + the web, api and agent
# apps from infra/main.bicep. Idempotent — re-run to roll config changes.
#
# Usage: ./infra/deploy.sh [image-tag]
#   image-tag defaults to the tag each app runs now, so an infra run never
#   rolls an app to an image that was not deployed (a Bicep run from a
#   checkout at a different commit would otherwise do that). On the very first
#   deploy there are no apps yet: pass the tag explicitly, after Deploy built
#   its images. The script does not check the registry: a tag without an image
#   fails the new revision while the running one keeps serving.
#
# Reads GOOGLE_PLACES_API_KEY, OPENAI_API_KEY, SQL_SERVER and SQL_DATABASE from
# the environment only. The keys reach az through a private temp file, never
# the command line.
```

new:

```
# Usage: ./infra/deploy.sh [image-tag]
#   Without a tag each app keeps the tag it runs now: a Bicep run from a
#   checkout at a different commit must not roll an app to an image that was
#   not deployed. The first run, with no apps yet, needs the tag.
#   No registry check (the infra identity cannot read images): a tag without
#   an image fails the new revision while the running one keeps serving.
# The keys reach az through a private temp file, never the command line.
```

- [ ] **6.3** `scripts/tests/test-deploy-scripts.sh`. Delete `# check <name> <command...>` (restates the function signature) and `# Before the backend apps exist, Deploy keeps working for the web app alone.` (restates the next tests' names). Kept: the fake's variable list and its params-capture note (the fake's contract), `# Fake gh: ...`, the `an az failure other than "not found"` reason, and the Bicep guard's two-line reason (security).

- [ ] **6.4** `deployment/README.md`. Delete the parenthetical in the first paragraph ``(see the frontend-scaffolding spec and plan under `docs/restaurant-researcher-app/` in the author's workspace notes, not in this repo)`` (points outside the repo), and, if still present after RR-33, the sentence ` Role grants for the backend identity wait for RR-33.` (ticket pointer). The first paragraph's "frontend only in this phase" stays true until RR-36 and is edited then.

- [ ] **6.5** `CLAUDE.md`, `docs/development.md`: no restating comments (markdown prose); nothing to delete.

- [ ] **6.6** Count and commit.

```bash
for f in infra/main.bicep infra/deploy.sh scripts/tests/test-deploy-scripts.sh; do
  echo "$f before $(git show origin/main:$f | grep -cE '^[[:space:]]*(//|#)') after $(grep -cE '^[[:space:]]*(//|#)' $f)"
done
./scripts/tests/test-deploy-scripts.sh | tail -1
git add -A && git commit -m "Remove comments that restate the code" -m "infra/main.bicep, infra/deploy.sh, the deploy tests and deployment/README.md."
```

Expected: the counts do not grow for `infra/main.bicep` and `infra/deploy.sh`; the test file grows by a few lines (the fake's contract, the Bicep guard reason): that goes into the `Comments:` line. Tests print `deploy script tests: all passed`.

### Task 7: gates and PR

| # | Gate | Needs | Command | Expected |
|---|---|---|---|---|
| 1 | Compile | specialist, `az` Bicep CLI, no login | `az bicep build --file infra/main.bicep --stdout > /dev/null && echo build ok` | `build ok`; warnings listed and judged, errors fail |
| 2 | Keys only as names | offline | task 4.3 commands, plus `gitleaks git . --redact` | as in 4.3; gitleaks reports no leaks |
| 3 | Shell checks and offline tests | offline | `bash -n infra/deploy.sh && shellcheck -x -S warning infra/deploy.sh && ./scripts/tests/test-deploy-scripts.sh && ./scripts/ci-local.sh` | all green |
| 4 | `what-if` | specialist, `az login`, after the owner's first setup run | below | below |

Gate 4 (read-only, creates nothing; run from the repo root of the PR branch):

```bash
TAG=$(az containerapp show -n ca-restaurant-researcher-web -g rg-chatbot --query "properties.template.containers[0].image" -o tsv); TAG=${TAG##*:}
az deployment group what-if -g rg-chatbot -f infra/main.bicep \
  -p webImageTag="$TAG" apiImageTag="$TAG" agentImageTag="$TAG" \
     googlePlacesKey=unset openaiApiKey=unset \
     sqlServer=example.invalid sqlDatabase=example \
  --result-format FullResourcePayloads \
  | sed -E 's/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/<id>/g'
```

Expected, under the resource group: `+ Create` `ca-restaurant-researcher-api` and `ca-restaurant-researcher-agent` (`external: false`, `targetPort: 8000`, `minReplicas: 0`, `maxReplicas: 1`); `~ Modify` `ca-restaurant-researcher-web` with exactly one changed item, `properties.template.containers[0].env` (`API_URL`, `AGENT_URL`; values may show as computed); the environment and both identities `NoChange` or unlisted; no `Microsoft.Authorization`, no identity creation, no `- Delete`, no line about `ingress`, `customDomains` or `secrets` under the web app (Container Apps read-only noise such as `latestRevisionName` is acceptable). Precondition: the RR-33 setup run created both identities and the environment `cae-restaurant-researcher` exists, else an `existing` reference fails with `NotFound`. The placeholders `unset`, `example.invalid`, `example` exist only for this command; what-if never prints secret values and never connects to SQL. Image existence is checked neither by `what-if` nor by `deploy.sh` (specialist decision). The specialist or owner confirms it before the run starts:

```bash
az acr repository show -n acrchatbotfredheda --image restaurant-researcher-backend:$TAG -o none && echo image ok
```

Expected `image ok` once **Deploy** has built that SHA; otherwise the new revision fails to pull while the running revision keeps serving.

- [ ] **7.1** Gates 2 and 3 offline; gate 1 by the specialist (request via the coordinator); paste masked outputs on the ticket. Gate 4 waits for step 1 of the live order.
- [ ] **7.2** Run `auditing-branch-changes`; push; open a draft PR.

```bash
git push -u origin rr-32-infra-api-agent-apps
gh pr create --draft --title "Add the api and agent apps to the Bicep file and make deploy.sh env-only" --body-file "$TMPDIR/rr32-body.md"
```

PR description (write `$TMPDIR/rr32-body.md` with Write): what ships (list), "Nothing is deployed", gates 1 to 3 results, gate 4 pending, the open questions that concern the owner (5 and 7 to 9 below), and the line:

```
Comments: main.bicep 19 -> 14 lines (stale header and binding history deleted; constraint comments for identities, no default on secrets and no web secrets block added); deploy.sh keeps 9 comment lines (the shebang counts) but they now state only constraints: the tag default, the missing registry check, the key file; test-deploy-scripts.sh gains the fake's contract (3 lines) and the Bicep guard's security reason (2 lines) and loses 2.
```

Check the numbers against the 6.6 output before writing the line. After the draft's CI ends: `gh pr ready`, `gh pr checks --watch`, confirm every expected job ran, hand the PR URL and the audit result to the coordinator.

---

## Open questions

Closed by the specialist's approval (2026-11-22): the earlier question 1 (registry read for the infra identity). The image check is removed from `deploy.sh`; the infra identity gets no `AcrPull`. The earlier questions 2 to 4 (custom role actions, empty SHA input, shared queue) concern the workflow and the infra identity's rights and moved to the RR-70 plan. One touches this PR's script: the reads `deploy.sh` and the Bicep file make (`containerapp show`, the `existing` identity and environment references) are the actions of RR-70 question 1. It does not block merging this PR; it blocks RR-36's first run. The empty SHA input (keep each app's tag) is as approved.

A. **Environment bootstrap.** With the environment as an `existing` reference, no file in the repo creates `cae-restaurant-researcher` any more; the existing one is adopted unchanged. A fresh resource group needs a one-off `az containerapp env create` (or a separate Bicep file for the environment, deployed by a login that may write it). Not needed for the live rollout. Decides: specialist (note in `deployment/README.md` if wanted).
B. **Custom domain certificate.** `customDomains[].certificateId` is built from `environment.id` as before; the managed certificate is not declared. Whether the PUT with `existing` behaves identically is verified by gate 4 and the RR-36 before/after domain list, not before. Decides: specialist at gate 4.

5. **Web FQDN not printed.** The spec says "print the web FQDN as today". In a public repo, run logs are public and the default FQDN carries the environment's unique id (the backend hosts share it), so the script prints names and states only; the custom domain is in the README. Decides: specialist.
6. **RR-33 must create-if-missing the acrpull identity and its `AcrPull`** (checked in task 0.3); today only the old Bicep file creates them. Decides: RR-33 author.
7. **Api gets only `google-places-key`** (spec question 1, unchanged; `config.py` makes the OpenAI key optional for `api`). The agent gets both. Decides: specialist at approval; the owner is told in the PR.
8. **TLS to the internal https FQDN** (spec question 2): not verified; RR-36's gate finds out; the fallback `allowInsecure: true` needs the owner.
9. **`az bicep build` in `ci-local.sh` / CI** (spec question 8): separate ticket if wanted; needs the Bicep CLI in CI.

## Self-check against the spec and the binding rules

| Requirement | Where |
|---|---|
| No `Microsoft.Authorization`, no identity resource without `existing` in `main.bicep`; both identities `existing`; acrPull pair removed with exact edit and what-if result | 4.1 (exact edit list, what-if), guards 3.1 (three of them, mutation-checked) |
| Two `@secure()` params, no default; `az bicep build` needs none; what-if passes `unset` | 4.1, 3.1 guard, gate 4 |
| Backend apps: internal, 8000, 0 to 1, 0.25 CPU 0.5Gi, secrets per role, env incl. `AZURE_CLIENT_ID` expression, `SQL_*` | 4.1 |
| Web: only `env` changes, `customDomains` kept, no `secrets` block | 4.1 and guard |
| `deploy.sh`: env only, names a missing variable, JSON key file via `python3 -c`, mode 600, trap, never on the command line, per-app tags; no image check and no registry call (specialist approval, test `deploy.sh makes no registry call`) | 2.1, tests 1.4 |
| Environment, both identities `existing`; the file creates Container Apps only (no `Microsoft.Authorization`, no identity, no managedEnvironments resource without `existing`); what-if shows the environment `NoChange` or unlisted | 3.1 (guards), 4.1, gate 4 |
| Sentence "The environment holds only the web, api and agent apps." in `deployment/README.md`, nothing about why | 5.1 |
| Live run order, RR-33 first, gates 1 and 4 by the specialist, masked output | Dependencies, 7 |
| Workflow, its guard tests, its secrets, the before/after evidence for the web app's secrets (RR-36), never-parallel rule for `.github` | RR-70 plan |
| Cost with the sourced numbers, both grant cases | Cost estimate |
| Docs listed as exact text; no ids or hosts | 5, 5.7 |
| Comments rule, cleanup commit lists, `Comments:` line | 6, PR text |
| PR size and the workflow split | Scope and the RR-70 split |
| Learn-verified versus unverified Bicep facts | "What was verified, and what was not" |
| Spec deviations (flagged, not hidden) | Open questions 5 to 9, A and B; the spec's "FQDN printed" and "image check before change"; the spec's "environment declared" |
