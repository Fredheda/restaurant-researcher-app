# Backend rollout 3: pipeline setup script (plan)

- **Ticket:** RR-33
- **Repo:** `restaurant-researcher-app`
- **Tier:** non-trivial
- **Spec:** `docs/specs/2026-11-22-backend-rollout-pipeline-setup-and-sql-schema.md` (sibling RR-32: `docs/specs/2026-11-22-backend-rollout-bicep-api-agent-apps.md`)
- **Status:** draft
- **Date:** 2026-11-22
- **Schematic:** `diagrams/2026-11-22-backend-rollout-pipeline-setup-and-sql-schema.mmd`
- **Sibling plan:** RR-71, `2026-11-22-backend-rollout-sql-schema-script.md` (the schema script, its own PR). It is branched from `main` after this PR merged, because both edit `scripts/tests/test-deploy-scripts.sh` and `deployment/README.md`. This plan merges first and needs nothing from RR-71.

## TL;DR

- Ships `setup-github-deploy.sh` that creates, if missing, the infra, backend and web pull identities (all with their grants), a custom role for the infra identity with an explicit 13-action list (no wildcard, nothing under `Microsoft.Authorization`, no identity or federated-credential write, no delete, no `listSecrets`), the infra federated credential (`environment:production`) and the `AZURE_INFRA_CLIENT_ID` repo secret.
- One PR, 3 files (`scripts/setup-github-deploy.sh`, `scripts/tests/test-deploy-scripts.sh`, `deployment/README.md`), about 250 changed lines. Security-sensitive RBAC, so the owner reviews it on its own.
- Tests first; every test is offline (fake `az` and fake `gh`). Nothing here touches Azure or GitHub settings.
- Owner actions: merge; later (RR-36, only after his explicit yes) run the setup script and set the four `production` environment secrets himself (`GOOGLE_PLACES_API_KEY`, `OPENAI_API_KEY`, `SQL_SERVER`, `SQL_DATABASE`). The script never reads or sets a key.
- Cost: no new metered resource (below).
- Deviation from the spec: the spec bundled the schema script into this ticket; it is now RR-71. Specialist edits of 2026-11-22 (RR-33 comment 12103) are applied: the infra identity gets no `AcrPull` (the registry is shared), the managed-certificate read replaces the registry read (still 13 actions), six negative assertions on the role, a 3-line script header.

## Cost estimate

No new Azure resource. Identities, role definitions and role assignments have no charge. The serverless SQL wake of the schema script belongs to RR-71.

## Architecture schematic

`diagrams/2026-11-22-backend-rollout-pipeline-setup-and-sql-schema.mmd` (Mermaid `flowchart TB`: owner laptop, GitHub, Azure identity and RBAC; green new, amber changed, grey unchanged, as boxes and arrows, with a legend).

## Facts that bind the code (checked 2026-11-22)

Microsoft Learn pages used (all fetched or searched through the Learn tools on 2026-11-22):

| Fact | Page |
|---|---|
| `az role definition create/update --role-definition` takes a JSON file; update uses the same JSON shape (`Name`, `IsCustom`, `Description`, `Actions`, `NotActions`, `AssignableScopes`); a role is listed by `az role definition list --name ... --custom-role-only true` | `azure/role-based-access-control/custom-roles-cli` |
| `az role definition list` flags `--name`, `--custom-role-only`, `--scope` | `cli/azure/role/definition` |
| `az identity create --name --resource-group --location`; `az role assignment create --assignee-object-id --assignee-principal-type ServicePrincipal --role --scope` | `azure/openshift/howto-deploy-configure-application-with-workload-identity` |
| `Microsoft.Resources/deployments/read`, `.../write`, `.../validate/action`, `.../operations/read`, `.../operationstatuses/read`, `Microsoft.Resources/subscriptions/resourceGroups/read` | `azure/role-based-access-control/permissions/management-and-governance#microsoftresources` |
| `Microsoft.App/containerApps/read`, `/write`, `/revisions/read`, `Microsoft.App/managedEnvironments/read`, `/join/action` (join: "Allows to create a Container App in a Managed Environment") | `azure/role-based-access-control/permissions/compute#microsoftapp` |
| `Microsoft.ManagedIdentity/userAssignedIdentities/read`; `.../assign/action` is the right to attach an identity and belongs to Managed Identity Operator; `.../write` creates identities; `.../federatedIdentityCredentials/write` adds credentials | `azure/role-based-access-control/permissions/identity#microsoftmanagedidentity`, `azure/role-based-access-control/built-in-roles/identity#managed-identity-operator` |
| `Microsoft.App/managedEnvironments/managedCertificates/read` (the web app's custom domain uses a managed certificate of the environment; string from the specialist's decision; the resource type is documented, the permissions-page row was not seen, so gate L2 checks the string) | `azure/templates/microsoft.app/managedenvironments/managedcertificates` |
| Attaching a user-assigned identity to a resource needs write on the resource plus `.../userAssignedIdentities/*/assign/action` on the identity | `entra/identity/managed-identities-azure-resources/managed-identities-faq` |
| The built-in Container Apps Contributor holds `Microsoft.App/containerApps/*/action`, which includes `listSecrets` (secret values in plain text); the custom role therefore lists no `listSecrets` | `azure/container-apps/manage-secrets` |

What the existing `ensure_role` helper does (read in `scripts/setup-github-deploy.sh`): `az role assignment create --assignee-object-id <id> --assignee-principal-type ServicePrincipal --role <name> --scope <scope>`; it relies on the CLI returning the existing assignment when an identical one exists (that is how the current re-runs are already idempotent) and takes a role by display name, so the custom role is assigned by its name.

Not verified live (no `az login` here): that the CLI accepts the generated JSON, that a freshly created role can be assigned at once (definition propagation can need a re-run), the real wording of the `ResourceNotFound` error from `az identity show` (the script matches `ResourceNotFound`, `was not found`, `could not be found`; the existing `app_exists` uses the first and third), and the output format of `gh secret list` (assumed tab separated, name first).

### Adding a missing action after the first live run

Hard rule: the role has no wildcard. A `Deploy infra` run that lacks a right fails with an authorization error that names the action (`Microsoft.X/.../write` and the scope). Then: (1) copy the exact action string; (2) add one line to `INFRA_ROLE_ACTIONS` in `scripts/setup-github-deploy.sh`; (3) run `./scripts/tests/test-deploy-scripts.sh` (it refuses a wildcard, anything under `Microsoft.Authorization`, an identity write, a federated-credential action, an action ending in `/delete`, `listSecrets` and `assign/action`); (4) PR, owner merges; (5) the owner runs `./scripts/setup-github-deploy.sh` (it updates the role definition; re-assigning is a no-op), waits a minute and re-runs the workflow. The same text goes into `deployment/README.md` (Task 1.4).

## Decisions made in this plan

1. **Own PR and ticket** (the spec bundled the schema script, now RR-71): the infra identity and its role are a security change the owner reviews on its own.
2. **Five identities** are ensured by one loop: gh-build, gh-deploy, gh-infra, acrpull (web), backend. Create if missing, leave an existing one alone. `ensure_identity` now stops on any lookup error that is not not-found (the old code treated every failure as missing).
3. **Names:** infra identity `id-restaurant-researcher-gh-infra`; repo secret `AZURE_INFRA_CLIENT_ID` (RR-32's workflow must read this name; see open question 1); custom role `Restaurant Researcher Infra Deployer`; backend identity `id-restaurant-researcher-backend` (RR-32 `backendIdentityName`); web pull identity `id-restaurant-researcher-acrpull` (unchanged).
4. **Role actions (13, no wildcard):** deployments read, write, validate, operations read, operationstatuses read; resource group read; Container Apps read, write, revisions read; managed environment read, join, managed certificates read; identity read. Not in it: anything under `Microsoft.Authorization`, identity write, federated-credential actions, any `/delete`, `assign/action` (separate `Managed Identity Operator` assignment per identity), `listSecrets`, data actions, `managedEnvironments/write` (the environment becomes an `existing` reference in RR-32's `main.bicep`). The infra identity gets no `AcrPull` (the registry is shared); the 13 actions are the specialist's list of 2026-11-22.
5. **Role file** is generated by the script into a `mktemp` file (mode 600) removed by an `EXIT` trap; create or update is decided by `az role definition list ... --query "length(@)"`.
6. **Secrets reminder:** after the environment exists the script runs `gh secret list --env production` (names only) and prints `environment secret missing: <NAME>` with the `gh secret set` command for each of the four names not present. It never calls `gh secret set` for them.
7. **Commit and PR text rules** (workspace `AGENTS.md`, repo `AGENTS.md` shared block; repo `CLAUDE.md` only imports `AGENTS.md`, so repo facts are edited in `AGENTS.md`): commit messages two lines at most, no trailer of any kind; PR titles and descriptions never mention Claude Code; the PR description carries one `Comments: <path>: <reason>` line per file whose comment count grows.
8. **Base moved:** the pilot checkout this plan was verified against (HEAD `0b8a322`) has `AGENTS.md` as the repo facts file and no `scripts/rules/` yet. Before starting, run `ls scripts/rules` on `origin/main`: if `run.sh` exists, run it with `./scripts/ci-local.sh` (it includes it) and fix what it reports; the `comment-count` rule decides which `Comments:` lines are needed.

## Setup

- [ ] Re-read the ticket comments on RR-33 and the sibling RR-32 spec for name changes (`backendIdentityName`, the infra secret name).
- [ ] Create the worktree (branch `rr-33-setup-script`, slug `rr33-setup`):

```bash
git -C <workspace>/restaurant-researcher-app fetch origin
git -C <workspace>/restaurant-researcher-app worktree add ../.worktrees/restaurant-researcher-app-<slug> -b <branch> origin/main
```

Expected: `Preparing worktree (new branch '<branch>')` and `HEAD is now at <sha> ...`.

- [ ] In the worktree: this PR runs shell tests only; `cd backend && poetry install --no-interaction --no-ansi` and `cd ../frontend && npm ci --prefer-offline` are needed only for `./scripts/ci-local.sh` at the end (needs Node 26, see `AGENTS.md`).
- [ ] Before every `gh pr create` run the `auditing-branch-changes` skill and put its result into the PR-ready message and the ticket comment.

Files: `scripts/setup-github-deploy.sh`, `scripts/tests/test-deploy-scripts.sh`, `deployment/README.md` (3 files, about 250 changed lines).

## Task 1.1: tests first (fake `az` and `gh`, new setup assertions)

All edits are in `scripts/tests/test-deploy-scripts.sh`. Use the Edit tool; each `old` text occurs once.

- [ ] **Edit 1.1.a** (header lists the new switches; this is the one place the fake's switches are documented)

old:
```
#   FAKE_BROKEN         comma list of apps whose containerapp calls fail with another error
#
# Usage
```
new:
```
#   FAKE_BROKEN         comma list of apps whose containerapp calls fail with another error
#   FAKE_NO_IDENTITY    comma list of identities that do not exist until `identity create` runs
#   FAKE_BROKEN_IDENTITY comma list of identities whose `identity show` fails with another error
#   FAKE_ROLE_EXISTS    1 when the custom role definition already exists
#   FAKE_SECRETS        comma list of environment secret names `gh secret list` reports
#
# Usage
```

- [ ] **Edit 1.1.b** (helpers at the top of the fake `az`)

old:
```
echo "$*" >> "$FAKE_LOG"
app=$(echo "$*" | sed -nE 's/.* -n ([^ ]+).*/\1/p')
case "$*" in
  "containerapp "*)
```
new:
```
echo "$*" >> "$FAKE_LOG"
app=$(echo "$*" | sed -nE 's/.* -n ([^ ]+).*/\1/p')
RG_ID=/subscriptions/sub-test/resourceGroups/rg-chatbot
in_list() { case ",$1," in *",$2,"*) return 0 ;; esac; return 1; }
case "$*" in
  "containerapp "*)
```

- [ ] **Edit 1.1.c** (new answers of the fake `az`)

old:
```
  "containerapp show"*latestRevisionName*) echo "$app--rev1"; exit 0 ;;
```
new:
```
  "account show"*"--query tenantId"*) echo "tenant-test"; exit 0 ;;
  "account show"*"--query id"*) echo "sub-test"; exit 0 ;;
  "acr show"*"--query id"*) echo "$RG_ID/providers/Microsoft.ContainerRegistry/registries/acr.example"; exit 0 ;;
  "identity create"*) echo "$app" >> "$FAKE_LOG.created"; exit 0 ;;
  "identity show"*)
    if in_list "${FAKE_BROKEN_IDENTITY:-}" "$app"; then echo "AuthorizationFailed" >&2; exit 4; fi
    if in_list "${FAKE_NO_IDENTITY:-}" "$app" && ! grep -qx "$app" "$FAKE_LOG.created" 2>/dev/null; then
      echo "(ResourceNotFound) The Resource was not found." >&2
      exit 3
    fi
    case "$*" in
      *"--query principalId"*) echo "pid-$app" ;;
      *"--query clientId"*) echo "cid-$app" ;;
      *"--query id"*) echo "$RG_ID/providers/Microsoft.ManagedIdentity/userAssignedIdentities/$app" ;;
    esac
    exit 0 ;;
  "role definition list"*)
    if [ "${FAKE_ROLE_EXISTS:-}" = 1 ]; then echo 1; else echo 0; fi
    exit 0 ;;
  "role definition create"*|"role definition update"*)
    file=$(echo "$*" | sed -E 's/.*--role-definition ([^ ]+).*/\1/')
    echo "$file" > "$FAKE_LOG.roledef-path"
    cp "$file" "$FAKE_LOG.roledef-$3"
    exit 0 ;;
  "containerapp show"*"--query id"*) echo "$RG_ID/providers/Microsoft.App/containerApps/$app"; exit 0 ;;
  "containerapp show"*latestRevisionName*) echo "$app--rev1"; exit 0 ;;
```

- [ ] **Edit 1.1.d** (fake `gh` answers `secret list`)

old:
```
  *" users/"*) echo 77542239; exit 0 ;;
```
new:
```
  *" users/"*) echo 77542239; exit 0 ;;
  *"secret list"*)
    IFS=',' read -r -a names <<<"${FAKE_SECRETS:-}"
    for name in "${names[@]}"; do
      [ -z "$name" ] || printf '%s\t2026-11-22\n' "$name"
    done
    exit 0 ;;
```

- [ ] **Edit 1.1.e** (`run` keeps the script's output and clears every per-run file)

old:
```
  rm -f "$LOG.build-dir" "$LOG.n" "$LOG.gh" "$LOG.gh-body"
  PATH="$tmp/bin:$PATH" FAKE_LOG="$LOG" "$@" >/dev/null 2>&1
  rc=$?
}
```
new:
```
  rm -f "$LOG".*
  PATH="$tmp/bin:$PATH" FAKE_LOG="$LOG" "$@" >"$LOG.out" 2>&1
  rc=$?
}
printed() { grep -q -- "$1" "$LOG.out"; }
```

- [ ] **Edit 1.1.f** (the new setup tests, appended after the existing setup checks)

old:
```
check "setup lets no admin bypass the gate" gh_body_has '"can_admins_bypass": false'
```
new:
```
check "setup lets no admin bypass the gate" gh_body_has '"can_admins_bypass": false'

DEPLOY_ID=id-restaurant-researcher-gh-deploy
INFRA_ID=id-restaurant-researcher-gh-infra
PULL_ID=id-restaurant-researcher-acrpull
BACKEND_ID=id-restaurant-researcher-backend
INFRA_ROLE="Restaurant Researcher Infra Deployer"
RG_SCOPE=/subscriptions/sub-test/resourceGroups/rg-chatbot
ACR_SCOPE=$RG_SCOPE/providers/Microsoft.ContainerRegistry/registries/acr.example
identity_scope() { echo "$RG_SCOPE/providers/Microsoft.ManagedIdentity/userAssignedIdentities/$1"; }
app_scope() { echo "$RG_SCOPE/providers/Microsoft.App/containerApps/$1"; }
granted() { called "assignee-object-id pid-$1 --assignee-principal-type ServicePrincipal --role $2 --scope $3 -o none"; }
grant_count() { count "--role $1 --scope $2 -o none"; }
roledef_has() { grep -q -F -- "$1" "$LOG.roledef-create"; }
roledef_lacks() { test -s "$LOG.roledef-create" && ! grep -q -i -F -- "$1" "$LOG.roledef-create"; }
roledef_file_removed() { local path; path=$(cat "$LOG.roledef-path") && [ -n "$path" ] && [ ! -e "$path" ]; }

run ./scripts/setup-github-deploy.sh
check "setup creates no identity that already exists" not called "identity create"
check "setup grants AcrPull to the backend identity" granted "$BACKEND_ID" AcrPull "$ACR_SCOPE"
check "setup grants AcrPull to the web app's pull identity" granted "$PULL_ID" AcrPull "$ACR_SCOPE"
check "setup trusts the production environment for the infra identity" \
  called "federated-credential create -g rg-chatbot --identity-name $INFRA_ID --name github-production --issuer https://token.actions.githubusercontent.com --subject repo:Fredheda@1/restaurant-researcher-app@2:environment:production"
check "setup stores the infra client id as a repo secret" \
  gh_called "secret set AZURE_INFRA_CLIENT_ID --body cid-$INFRA_ID -R Fredheda/restaurant-researcher-app"
check "setup creates the custom role" called "role definition create"
check "setup does not update a role it just created" not called "role definition update"
check "the custom role is assignable in the resource group only" \
  roledef_has "\"AssignableScopes\": [\"$RG_SCOPE\"]"
check "the custom role has no wildcard" roledef_lacks "*"
check "the custom role has nothing under Microsoft.Authorization" roledef_lacks "Microsoft.Authorization"
check "the custom role cannot write identities" roledef_lacks "userAssignedIdentities/write"
check "the custom role cannot touch federated credentials" roledef_lacks "federatedIdentityCredentials"
check "the custom role cannot delete anything" roledef_lacks '/delete"'
check "the custom role cannot read secret values" roledef_lacks "listSecrets"
check "the custom role does not attach identities (separate assignment)" roledef_lacks "assign/action"
check "the custom role has no data actions" roledef_has "\"DataActions\": []"
check "the custom role keeps deployments, apps and the environment join" \
  bash -c "for a in Microsoft.Resources/deployments/write Microsoft.App/containerApps/write Microsoft.App/managedEnvironments/join/action Microsoft.App/managedEnvironments/managedCertificates/read Microsoft.ManagedIdentity/userAssignedIdentities/read; do grep -q -F \"\$a\" '$LOG.roledef-create' || exit 1; done"
check "setup removes the role definition file" roledef_file_removed
check "setup assigns the custom role to the infra identity at the resource group" \
  granted "$INFRA_ID" "$INFRA_ROLE" "$RG_SCOPE"
check "infra identity operates the web pull identity" \
  granted "$INFRA_ID" "Managed Identity Operator" "$(identity_scope "$PULL_ID")"
check "infra identity operates the backend identity" \
  granted "$INFRA_ID" "Managed Identity Operator" "$(identity_scope "$BACKEND_ID")"
check "deploy identity operates the web pull identity" \
  granted "$DEPLOY_ID" "Managed Identity Operator" "$(identity_scope "$PULL_ID")"
check "deploy identity operates the backend identity" \
  granted "$DEPLOY_ID" "Managed Identity Operator" "$(identity_scope "$BACKEND_ID")"
check "the backend identity is operated by exactly the deploy and infra identities" \
  test "$(grant_count "Managed Identity Operator" "$(identity_scope "$BACKEND_ID")")" -eq 2
for app in "$API_APP" "$AGENT_APP" "$WEB_APP"; do
  check "deploy identity manages $app" granted "$DEPLOY_ID" "Container Apps Contributor" "$(app_scope "$app")"
done
check "infra identity gets no Container Apps Contributor" \
  not granted "$INFRA_ID" "Container Apps Contributor" "$(app_scope "$API_APP")"
check "backend AcrPull comes before the deploy identity's backend operator grant" \
  before "pid-$BACKEND_ID .*--role AcrPull" "pid-$DEPLOY_ID .*Managed Identity Operator --scope .*$BACKEND_ID"
check "the deploy identity's backend operator grant comes before the app grants" \
  before "pid-$DEPLOY_ID .*Managed Identity Operator --scope .*$BACKEND_ID" "pid-$DEPLOY_ID .*Container Apps Contributor"

FAKE_ABSENT="$BACKEND_ABSENT" run ./scripts/setup-github-deploy.sh
check "setup skips the app roles of backend apps that do not exist yet" test "$rc" -eq 0
check "setup then grants Container Apps Contributor on the web app only" \
  test "$(count "--role Container Apps Contributor")" -eq 1
check "setup still grants the backend identity roles then" granted "$DEPLOY_ID" "Managed Identity Operator" "$(identity_scope "$BACKEND_ID")"

FAKE_NO_IDENTITY="$BACKEND_ID,$PULL_ID,$INFRA_ID" run ./scripts/setup-github-deploy.sh
check "setup creates a missing backend identity once" test "$(count "identity create -g rg-chatbot -n $BACKEND_ID")" -eq 1
check "setup creates a missing web pull identity once" test "$(count "identity create -g rg-chatbot -n $PULL_ID")" -eq 1
check "setup creates a missing infra identity once" test "$(count "identity create -g rg-chatbot -n $INFRA_ID")" -eq 1
check "setup creates only the identities that are missing" test "$(count "identity create")" -eq 3
check "setup grants the identity it just created" granted "$BACKEND_ID" AcrPull "$ACR_SCOPE"

FAKE_ROLE_EXISTS=1 run ./scripts/setup-github-deploy.sh
check "setup updates the custom role that exists" called "role definition update"
check "setup does not create a second custom role" not called "role definition create"

FAKE_BROKEN_IDENTITY="$BACKEND_ID" run ./scripts/setup-github-deploy.sh
check "setup stops when an identity lookup fails for another reason" test "$rc" -ne 0
check "that failure creates no identity" not called "identity create"

FAKE_SECRETS="OPENAI_API_KEY,SQL_SERVER" run ./scripts/setup-github-deploy.sh
check "setup names the missing environment secrets" \
  bash -c "grep -q 'environment secret missing: GOOGLE_PLACES_API_KEY' '$LOG.out' && grep -q 'environment secret missing: SQL_DATABASE' '$LOG.out'"
check "setup does not name an environment secret that is set" not printed "missing: OPENAI_API_KEY"
check "setup never sets a key or a SQL name" \
  bash -c "! grep -q -E 'secret set (GOOGLE_PLACES_API_KEY|OPENAI_API_KEY|SQL_SERVER|SQL_DATABASE)' '$LOG.gh'"

FAKE_SECRETS="GOOGLE_PLACES_API_KEY,OPENAI_API_KEY,SQL_SERVER,SQL_DATABASE" run ./scripts/setup-github-deploy.sh
check "setup stays quiet when all four environment secrets exist" not printed "environment secret missing"
```

- [ ] **Run the red check** (from the PR 1 worktree root):

```bash
./scripts/tests/test-deploy-scripts.sh > "$TMPDIR/pr1-red.txt" 2>&1; echo rc=$?; grep -c '^FAIL' "$TMPDIR/pr1-red.txt"; grep '^FAIL' "$TMPDIR/pr1-red.txt" | head -5; tail -1 "$TMPDIR/pr1-red.txt"
```

Expected (verified in a scratch copy of current `main`): `rc=32`, `32`, first FAIL lines `FAIL  setup grants AcrPull to the backend identity`, `FAIL  setup grants AcrPull to the web app's pull identity`, `FAIL  setup trusts the production environment for the infra identity`, ..., last line `deploy script tests: 32 failed`. The 70 older checks still pass.

- [ ] Commit (tests only): `git add scripts/tests/test-deploy-scripts.sh && git commit -m "Test the setup script's identities, custom role and secret reminder"`

## Task 1.2: the setup script

All edits are in `scripts/setup-github-deploy.sh`. The new header is 3 comment lines (the old one was 23 lines of per-step narration and constraints); the constraints it listed (AcrPush also allows pushing, per-app Container Apps Contributor and the re-run, how to add a role action, no keys set by the script, stale-subject replacement) are in `deployment/README.md` (Task 1.4 and the existing "Limits" paragraph).

- [ ] **Edit 1.2.a** (header)

old:
```
# One-time (idempotent) setup so GitHub Actions can build and deploy this
# project with no stored secrets, using OpenID Connect (workload identity
# federation).
#
# What it does:
#   1. Creates two user-assigned managed identities in rg-chatbot:
#        id-restaurant-researcher-gh-build   pushes images (the build step of
#                                            the manual "Deploy" workflow)
#        id-restaurant-researcher-gh-deploy  rolls the container app (the
#                                            deploy step of the same workflow)
#   2. Grants each only what it needs:
#        build:  AcrPush + Container Registry Tasks Contributor on the registry
#        deploy: AcrPush on the registry (to lock/unlock deployed tags — note
#                that this also lets it push images; the registry is in
#                legacy permission mode, which cannot scope pushes by
#                repository), Container Apps Contributor on each app that
#                exists (an app not created yet is skipped; re-run after
#                infra/deploy.sh adds it), and Managed Identity Operator on
#                the app's AcrPull identity (updating an app that uses it
#                needs assign/action)
#   3. Adds one federated credential to each identity (subject taken from the
#      repo's OIDC settings; a credential with a stale subject is replaced),
#      both trusting only the job that runs in the `production` environment
#      (the Deploy workflow logs in twice, as build and then as deploy).
#   4. Creates the `production` GitHub environment, restricted to jobs running
#      on the main branch (a branch author cannot edit their way around it)
#      and gated by the repo owner as required reviewer (every deploy waits
#      for his approval in GitHub), and stores the Azure IDs the workflows
#      read as repo SECRETS:
#      AZURE_TENANT_ID, AZURE_SUBSCRIPTION_ID, AZURE_BUILD_CLIENT_ID,
#      AZURE_DEPLOY_CLIENT_ID. They are identifiers, not credentials; a secret
#      is used so GitHub masks the value in run logs.
#
# Needs the signed-in user to be able to create identities, assign roles, and
# administer the GitHub repo. Auth is the live `az login` and `gh auth`
# sessions; nothing secret is written anywhere. Federated credentials do not
# expire.
```
new:
```
# One-time (idempotent) setup of the identities, roles, federated credentials,
# `production` environment and repo secrets the workflows use. Needs the owner's
# `az login` and `gh auth`; what it grants and why: deployment/README.md.
```

- [ ] **Edit 1.2.b** (constants, the explicit action list, helpers)

old:
```
BUILD_ID=id-restaurant-researcher-gh-build
DEPLOY_ID=id-restaurant-researcher-gh-deploy
PULL_ID=id-restaurant-researcher-acrpull
ISSUER=https://token.actions.githubusercontent.com

TENANT_ID=$(az account show --query tenantId -o tsv)
SUBSCRIPTION_ID=$(az account show --query id -o tsv)
echo "Subscription $SUBSCRIPTION_ID, repo $GH_REPO"

ensure_identity() {
  local name=$1
  if az identity show -g "$RG" -n "$name" -o none 2>/dev/null; then
    echo "identity $name: exists" >&2
  else
    az identity create -g "$RG" -n "$name" -l "$LOCATION" -o none
    echo "identity $name: created" >&2
  fi
}
```
new:
```
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
```

- [ ] **Edit 1.2.c** (identities and grants, in the order the tests expect)

old:
```
ensure_identity "$BUILD_ID"
ensure_identity "$DEPLOY_ID"
BUILD_PRINCIPAL=$(az identity show -g "$RG" -n "$BUILD_ID" --query principalId -o tsv)
BUILD_CLIENT=$(az identity show -g "$RG" -n "$BUILD_ID" --query clientId -o tsv)
DEPLOY_PRINCIPAL=$(az identity show -g "$RG" -n "$DEPLOY_ID" --query principalId -o tsv)
DEPLOY_CLIENT=$(az identity show -g "$RG" -n "$DEPLOY_ID" --query clientId -o tsv)

ACR_ID=$(az acr show -n "$ACR" --query id -o tsv)
PULL_ID_RESOURCE=$(az identity show -g "$RG" -n "$PULL_ID" --query id -o tsv)

ensure_role "$BUILD_PRINCIPAL" "AcrPush" "$ACR_ID"
ensure_role "$BUILD_PRINCIPAL" "Container Registry Tasks Contributor" "$ACR_ID"

ensure_role "$DEPLOY_PRINCIPAL" "AcrPush" "$ACR_ID"
ensure_role "$DEPLOY_PRINCIPAL" "Managed Identity Operator" "$PULL_ID_RESOURCE"
for entry in
```
new:
```
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
for entry in
```

- [ ] **Edit 1.2.d** (skip message names the workflow)

old:
```
    echo "app $app: not created yet, skipped (re-run after infra/deploy.sh)"
```
new:
```
    echo "app $app: not created yet, skipped (re-run after Deploy infra)"
```

- [ ] **Edit 1.2.e** (federated credential for the infra identity)

old:
```
ensure_federated_credential "$DEPLOY_ID" github-production "$SUBJECT"
```
new:
```
ensure_federated_credential "$DEPLOY_ID" github-production "$SUBJECT"
ensure_federated_credential "$INFRA_ID" github-production "$SUBJECT"
```

- [ ] **Edit 1.2.f** (infra client id secret and the missing-secrets reminder)

old:
```
gh secret set AZURE_DEPLOY_CLIENT_ID --body "$DEPLOY_CLIENT" -R "$GH_REPO"
echo "repo secrets: set"
echo "Done. Re-running changes nothing."
```
new:
```
gh secret set AZURE_DEPLOY_CLIENT_ID --body "$DEPLOY_CLIENT" -R "$GH_REPO"
gh secret set AZURE_INFRA_CLIENT_ID --body "$INFRA_CLIENT" -R "$GH_REPO"
echo "repo secrets: set"
report_missing_environment_secrets
echo "Done. Re-running changes nothing."
```

- [ ] **Run green** (PR 1 worktree root):

```bash
./scripts/tests/test-deploy-scripts.sh | tail -1
./scripts/tests/test-deploy-scripts.sh | grep -c '^PASS'
shellcheck -x -S warning scripts/*.sh scripts/lib/*.sh scripts/tests/*.sh; echo shellcheck=$?
```

Expected: `deploy script tests: all passed`, `102`, `shellcheck=0` (no output before it). Verified in a scratch copy (103 with the RR-71 wrapper check).

- [ ] **Mutation check** (proves the six negatives bite; revert afterwards): add the six lines `Microsoft.Authorization/roleAssignments/write`, `Microsoft.App/*`, `Microsoft.ManagedIdentity/userAssignedIdentities/write`, `Microsoft.ManagedIdentity/userAssignedIdentities/federatedIdentityCredentials/write`, `Microsoft.App/containerApps/delete`, `Microsoft.App/containerApps/listSecrets/action` inside `INFRA_ROLE_ACTIONS`, run the test script, expect exactly `FAIL  the custom role has no wildcard`, `...has nothing under Microsoft.Authorization`, `...cannot write identities`, `...cannot touch federated credentials`, `...cannot delete anything`, `...cannot read secret values`, then remove the six lines and re-run to green. (Done in the scratch copy.) Do not commit the mutation.
- [ ] Commit: `git add scripts/setup-github-deploy.sh && git commit -m "Create the backend and infra identities and the infra custom role in setup"`

## Task 1.3: owner-runnable gates (offline)

| # | Gate | Command (worktree root) | Expected |
|---|---|---|---|
| 1 | offline | `./scripts/tests/test-deploy-scripts.sh \| tail -1` | `deploy script tests: all passed` |
| 2 | offline | `shellcheck -x -S warning scripts/*.sh scripts/lib/*.sh scripts/tests/*.sh` | no output, exit 0 |
| 3 | offline | `grep -c -F '*' <(sed -n '/^INFRA_ROLE_ACTIONS=(/,/^)/p' scripts/setup-github-deploy.sh)` | `0` (no wildcard in the list) |
| 4 | offline | `./scripts/ci-local.sh` | ends with `ci-local: all checks passed` |

## Task 1.4: docs (acceptance criterion)

- [ ] **Edit 1.4.a** in `deployment/README.md`

old:
```
`./scripts/setup-github-deploy.sh` (two identities with federated credentials, the `production` environment restricted to `main` with the owner as required reviewer, four repo secrets)
```
new:
```
`./scripts/setup-github-deploy.sh` (the build, deploy and infra identities with federated credentials, the web and backend app identities with `AcrPull`, the infra identity's custom role, the `production` environment restricted to `main` with the owner as required reviewer, five repo secrets)
```

- [ ] **Edit 1.4.b** in `deployment/README.md`

old:
```
 Role grants for the backend identity wait for RR-33.
```
new:
```


The infra identity runs the infra deploy under a custom role, `Restaurant Researcher Infra Deployer`, at the resource group scope. `INFRA_ROLE_ACTIONS` in `scripts/setup-github-deploy.sh` lists its actions explicitly: deployments, Container Apps read and write, the environment join and a few reads. It has no wildcard, nothing under `Microsoft.Authorization`, no identity or federated-credential write, no delete and no `listSecrets`, and no registry role; attaching the web pull and backend identities is a separate `Managed Identity Operator` assignment each. If an infra run fails with an authorization error naming an action, add exactly that line to the list, merge, and run `./scripts/setup-github-deploy.sh` again: it updates the role. A new role definition can need a minute before the run succeeds.

The infra workflow reads four environment secrets of `production` that the owner sets himself, the value typed at the hidden prompt of `gh secret set <NAME> --env production -R Fredheda/restaurant-researcher-app`: `GOOGLE_PLACES_API_KEY`, `OPENAI_API_KEY`, `SQL_SERVER`, `SQL_DATABASE` (the SQL names are secrets because the run logs of a public repo are public). The setup script never sets them; it prints the names that are still missing.
```

`AGENTS.md` (repo facts; `CLAUDE.md` only imports it) and `docs/development.md` need no change in this PR: they do not name the identities or the setup script's grants. Verify with `grep -n "setup-github-deploy\|identit" AGENTS.md docs/development.md README.md` and re-read each hit (checked on the pilot HEAD: no hit); if one is now wrong, fix it in this commit. RR-71 later edits other lines of `deployment/README.md` (the "What to run" table) and of `AGENTS.md` and `docs/development.md`; this plan edits only the "One-time setup" paragraph and the text after it.

- [ ] Commit: `git add deployment/README.md && git commit -m "Document the infra role, the new identities and the environment secrets"`

## Task 1.5: owner and specialist gates (laptop; need `az login`; RR-36 only after the owner's explicit yes; agents never run these)

| # | Gate | Command | Expected |
|---|---|---|---|
| L1 | laptop, specialist read-only | `az role definition list --name "Restaurant Researcher Infra Deployer" --custom-role-only true --scope "/subscriptions/$(az account show --query id -o tsv)/resourceGroups/rg-chatbot" --query "[0].permissions[0]" -o json` (run after L3) | 13 `actions`, no `*`, empty `notActions`, `dataActions`, `notDataActions` |
| L2 | laptop, specialist read-only, before the owner merges | none that touches Azure: review the diff of `INFRA_ROLE_ACTIONS` against the Learn pages in "Facts that bind the code" | each of the 13 strings appears on the cited page (the managed-certificate read is the one not seen on a permissions page here) |
| L3 | laptop, owner, RR-36 | `./scripts/setup-github-deploy.sh` | `identity ...: created` for the three new identities (or `exists`), `custom role Restaurant Researcher Infra Deployer: created`, ends with `repo secrets: set`, then one `environment secret missing: <NAME>` line per secret not set yet, then `Done. Re-running changes nothing.` |
| L4 | laptop, owner | run L3 again | same output with `exists`/`updated`, no error (idempotence) |
| L5 | laptop, owner | `az role assignment list --all --assignee "$(az identity show -g rg-chatbot -n id-restaurant-researcher-gh-infra --query principalId -o tsv)" --query "[].{role:roleDefinitionName, scope:scope}" -o table` | exactly three rows: the custom role at the resource group, `Managed Identity Operator` on the pull identity, `Managed Identity Operator` on the backend identity. Mask GUIDs before pasting on the ticket |
| L6 | laptop, owner | `az role assignment list --all --assignee "$(az identity show -g rg-chatbot -n id-restaurant-researcher-gh-deploy --query principalId -o tsv)" --query "[].{role:roleDefinitionName, scope:scope}" -o table` | `AcrPush` on the registry, `Managed Identity Operator` on both identities, `Container Apps Contributor` on each existing app (api and agent appear after Deploy infra and a second setup run) |
| L7 | laptop, owner | set the four secrets: `gh secret set GOOGLE_PLACES_API_KEY --env production -R Fredheda/restaurant-researcher-app`, then the same for `OPENAI_API_KEY`, `SQL_SERVER`, `SQL_DATABASE` (paste at the hidden prompt; nothing echoes) | then L3 prints no `environment secret missing` line |

## Task 1.6: cleanup commit (separate, last)

Comments the PR leaves behind in the files it edits and what stays:

- `scripts/setup-github-deploy.sh`: stays: the 3-line header, the security comment above `INFRA_ROLE_ACTIONS`, the `ensure_role` comment (Entra replication), the OIDC subject comment, the "stale subject" comment, the environment-gate comment, `# shellcheck source=lib/images.sh`, the `# Usage:` line. Nothing restates code; no deletion needed.
- `scripts/tests/test-deploy-scripts.sh`: delete the three comments that restate the code or the test name; stays: the header (documents the fake's switches), the `run` comment (it states the `$rc`/`$LOG` side effect), the fake-`gh` comment, the `# --- section ---` dividers.

- [ ] **Edit 1.6.a**

old:
```
# line number of the first log line matching a pattern (0 if none)
at() {
```
new:
```
at() {
```

- [ ] **Edit 1.6.b**

old:
```
# Before the backend apps exist, Deploy keeps working for the web app alone.
BACKEND_ABSENT=
```
new:
```
BACKEND_ABSENT=
```

- [ ] **Edit 1.6.c**

old:
```
# An az failure other than "not found" must never look like a missing app.
FAKE_BROKEN="$WEB_APP" run ./scripts/redeploy.sh "$SHA"
```
new:
```
FAKE_BROKEN="$WEB_APP" run ./scripts/redeploy.sh "$SHA"
```

- [ ] Re-run gates 1 and 2, then commit: `git add scripts/tests/test-deploy-scripts.sh && git commit -m "Remove comments that restate the test code"`

## Task 1.7: hand-over

- [ ] Run `auditing-branch-changes`; run `./scripts/ci-local.sh` (green); push the branch (never `main`); open a draft PR with `gh pr create --draft`; wait for the draft's own CI run; `gh pr ready`; `gh pr checks --watch` (poll no faster than every 60 to 120 s); fix every automated review comment in one batched push.
- [ ] PR description (terse, no tool mentions):

```
Setup script now creates, if missing, the infra, backend and web pull identities with their grants, a custom role for the infra identity with an explicit 13-action list (no wildcard, nothing under Microsoft.Authorization, no identity or federated-credential write, no delete, no listSecrets), the infra federated credential (environment:production) and the AZURE_INFRA_CLIENT_ID secret. It lists missing production environment secrets and never sets them.

Tests: fake az and gh; failing run first (32 red), now 102 green; six negative assertions on the role definition the fake receives (wildcard, Microsoft.Authorization, identity write, federated credential, delete, listSecrets); shellcheck clean.
Docs: deployment/README.md (identities, role, how to add an action, the four environment secrets).
Comments: scripts/tests/test-deploy-scripts.sh: +4 documenting the new fake switches, -3 restating comments removed (net +1). scripts/setup-github-deploy.sh shrinks (header rewritten shorter, 56 to 26 comment lines, including a 4-line security reason above INFRA_ROLE_ACTIONS).
Branch audit: <result>
Not run here: any live az or gh command (RR-36, owner's yes).
```

- [ ] Hand the URL to the coordinator by `SendMessage`; ticket comment; wait. Never merge. After the owner merges: remove the worktree (`git worktree remove`, never `--force`), delete the local and remote branch (verify), `git switch main` and `git pull --ff-only` in the main checkout, ticket per the coordinator. RR-71 may start only after this merge.

---

## Self-check against the spec

| Spec item | Where in this plan |
|---|---|
| Backend identity create-if-missing, `AcrPull` (spec 1.1, specialist: also the web pull identity) | Tasks 1.1 and 1.2 (loop, `ensure_role` for both) |
| Infra identity, federated credential from the repo's OIDC subject `environment:production`, secret | Edit 1.2.e and 1.2.f; tests "trusts the production environment..." and "stores the infra client id" |
| Custom role at the resource group, explicit list, negatives asserted on what the fake receives (specialist: six) | Edit 1.2.b; tests with `roledef_lacks` (wildcard, `Microsoft.Authorization`, identity write, federated credential, `/delete`, `listSecrets`) plus `assign/action` and data actions |
| Managed Identity Operator separate per app identity (deploy and infra) | Edit 1.2.c; tests "operates the ... identity" and the exactly-two count |
| Container Apps Contributor per existing app, skip absent | existing loop; tests for all three apps and the `FAKE_ABSENT` case |
| Lookup failure other than not-found exits non-zero | `ensure_identity`; test with `FAKE_BROKEN_IDENTITY` |
| Order: backend `AcrPull` before the deploy identity's backend grant before app grants | two `before` tests |
| Four secrets named, never read or set; reminder lists missing names | `report_missing_environment_secrets`; three tests; README text; owner commands in L7 |
| How the owner adds a missing action | section "Adding a missing action" and README |
| Docs (README; the spec said `CLAUDE.md`, which now only imports `AGENTS.md`) | Task 1.4 |
| Gates with offline versus laptop marks | Tasks 1.3 and 1.5 |
| Spec text now wrong: "two secrets" (TL;DR), one PR with the schema script, "deploy skip logic dropped" | Decision 1; the spec should be corrected in the docs PR or left as history |

## Open questions and risks

Closed by the specialist (RR-33 comment 12103): the infra identity gets no `AcrPull` (the registry is shared); `managedEnvironments/write` is not needed because the environment becomes an `existing` reference in RR-32's `main.bicep`. RR-32 must therefore not run its image-existence data-plane check as the infra identity (or must do it another way); that is RR-32's to settle.

1. **Coordinator: secret name.** RR-32's `Deploy infra` workflow must read the client id from `AZURE_INFRA_CLIENT_ID` (chosen here, "next to the others"); the RR-32 spec does not name it.
2. **README wording before RR-32 merges.** This PR's README names the infra workflow before it exists if this PR merges first; harmless but briefly ahead of the code. Alternative: merge RR-32 first.
3. **Coordinator: order.** This PR merges before RR-71 starts (shared test file and README). RR-36's run order is in the spec (Risks 4).
4. **Not verified (no `az login`):** the generated role JSON accepted by the CLI; role-definition propagation before the assignment (re-run if it fails); the `ResourceNotFound` wording of `az identity show`; `gh secret list` output format. The whole shell suite was run in a scratch copy of current `main` with system `shellcheck`; `./scripts/ci-local.sh` was not run (the executor runs it).
