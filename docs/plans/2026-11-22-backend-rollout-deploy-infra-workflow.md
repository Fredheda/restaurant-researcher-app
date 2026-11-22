# Plan: `Deploy infra` workflow (`.github/workflows/deploy-infra.yml`)

- Ticket: RR-70
- Repo: `restaurant-researcher-app`
- Tier: non-trivial
- Spec: `docs/specs/2026-11-22-backend-rollout-bicep-api-agent-apps.md` (the RR-32 spec, section "`Deploy infra` workflow"; the binding rules of the specialist, 2026-11-22, win where the spec is stale)
- Related: `specs/2026-11-22-backend-rollout-pipeline-setup-and-sql-schema.md` (RR-33), plan `plans/2026-11-22-backend-rollout-bicep-api-agent-apps.md` (RR-32)
- Needs merged first: RR-32 (the `infra/deploy.sh` this workflow runs, its docs and the test file sections this plan extends) and RR-33 (setup script: infra identity, its custom role and federated credential, repo secret `AZURE_INFRA_CLIENT_ID`)
- Status: done (PR #68)
- Date: 2026-11-22
- Diagram: `diagrams/2026-11-22-backend-rollout-deploy-infra-workflow.mmd`

## TL;DR

- Ships one PR: `.github/workflows/deploy-infra.yml` (`Deploy infra`: `workflow_dispatch` only, `main` only, `production` environment, own identity, a pinned Bicep CLI install, runs `infra/deploy.sh` then `scripts/wait-healthy.sh`), guard tests for it and for `deploy.yml`, a supply-chain test that pins `az bicep install`, and the doc edits that name it.
- Nothing is deployed by this PR. RR-36 runs the workflow, each run on the owner's explicit yes and his approval in GitHub.
- Owner actions: merge (owner-only: it touches `.github/` and logs in to Azure); before RR-36 set four secrets of the `production` environment (`GOOGLE_PLACES_API_KEY`, `OPENAI_API_KEY`, `SQL_SERVER`, `SQL_DATABASE`) and run the RR-33 setup script once (it sets `AZURE_INFRA_CLIENT_ID`).
- Adds a file under `.github/workflows/`: never run in parallel with another `ci.yml`, `claude-review.yml` or `.github` story (RR-63, RR-64, RR-65); the coordinator sequences it.
- Needs RR-32 (PR with `infra/deploy.sh`) and RR-33 merged first; about 140 changed lines in 5 files, far under the size limit.
- Cost: no new meter. Workflow minutes are free on a public repo; the apps it deploys are costed in the RR-32 plan.
- Blocker for the first run, not for the merge: open question 1 (the exact actions of the infra identity's custom role, 13 in RR-33's current plan). Open item 4: confirm the Bicep release date before the PR is marked ready.

## Dependencies and order

- RR-33 merges first. It creates the infra identity, its custom role and federated credential (subject `environment:production`), and the repo secret `AZURE_INFRA_CLIENT_ID`. Order dependency on its role: after the specialist's approval the role has 13 actions: `registries/read` was removed (the infra identity gets no registry rights, so `deploy.sh` has no image check) and `managedEnvironments/managedCertificates/read` was added (the file refers to the environment and its certificate id as `existing`). The first run needs that version of the role; RR-33's plan and this one must name the same action list (open question 1). This plan uses exactly that secret name; the existing client-id secrets are `AZURE_BUILD_CLIENT_ID` and `AZURE_DEPLOY_CLIENT_ID` (repo secrets set by `setup-github-deploy.sh`), so `AZURE_INFRA_CLIENT_ID` follows the pattern. RR-33's plan must match this name.
- RR-32 merges before this PR: it adds `infra/deploy.sh` with the four environment variables this workflow supplies, the `# --- infra/main.bicep ---` section of `scripts/tests/test-deploy-scripts.sh` that task 1 anchors on, and the `deployment/README.md` / `CLAUDE.md` text that task 3 replaces. Both are safe to merge before any live run: they deploy nothing.
- Live run order (RR-36, spec "First rollout"; each step needs the owner's yes, each workflow run his approval in GitHub):
  1. Owner runs `./scripts/setup-github-deploy.sh` (identities, custom role, federated credentials, environment) and sets the four environment secrets.
  2. **Deploy** for SHA X: builds both images, rolls the web app, skips the missing backend apps.
  3. **Deploy infra** for SHA X (this workflow): creates the api and agent apps and changes the web app's env; the images exist because step 2 built them (`deploy.sh` does not check the registry: a tag without an image fails the new revision while the running one keeps serving).
  4. Owner re-runs `setup-github-deploy.sh`: the deploy identity gets its roles on the new apps.
  5. Owner runs `apply-schema.sh` and `--verify` (it needs only the backend identity, so it may run before step 3).
  6. **Deploy** for SHA X again: rolls all three apps and locks the tags.
  7. `./scripts/wait-healthy.sh` (the workflows run it too).
- Gate 4 `what-if` of the RR-32 plan (specialist, read-only) must have passed before step 3.
- Never in parallel with other `ci.yml`, `claude-review.yml` or `.github` stories.

## Cost estimate

No new meter. The workflow runs on a GitHub-hosted runner, which is free on a public repo. The identity, its role and its federated credential (RR-33) have no meter. The Container Apps it deploys are costed in the RR-32 plan (Azure Retail Prices API, fetched 2026-11-22); none of those numbers are repeated here.

## Schematic

`docs/plans/diagrams/2026-11-22-backend-rollout-deploy-infra-workflow.mmd` (Mermaid `flowchart TB`: GitHub, repo scripts, Azure identity and RBAC, Azure resources; green new, amber changed, grey unchanged on boxes and arrows, legend node).

## What was verified, and what was not

Verified: the code below was exercised offline in a scratch copy of current `main` of the repo (the pilot worktree at commit `249a9b0`): `test-deploy-scripts.sh`, `test-supply-chain.sh`, `actionlint` on the workflow, including mutation checks (an `id-token: write` at workflow level, a `push:` trigger and a `--version latest` Bicep install are each caught by the guard or supply-chain test). The `deploy.yml` lines of the guard loop pass today. The `Deploy` workflow's shape (dispatch, `main` only, `production` environment, one queue, `id-token: write` on the job only, no git token on disk, validation before any Azure step, login through `scripts/ci-azure-login.sh`) was read in place and copied. RR-33 changes `test-deploy-scripts.sh` before this plan runs, so re-run the red and green steps after rebasing the worktree on `origin/main` and re-read each anchor before an Edit.

Verified from Microsoft Learn (2026-11-22): `az bicep install --version v0.37.4` installs a specific Bicep CLI version, "default to the latest if not specified" (Learn, "Bicep CLI commands" and the `az bicep install` reference); Azure CLI "automatically installs the Bicep CLI when a command is executed that needs it" and keeps it self-contained, not on the PATH (Learn, "Install Bicep tools"). So `az deployment group create` in `deploy.sh` compiles `main.bicep` with whatever Bicep CLI az has or downloads; the pin step installs a fixed one first. `deploy.sh` runs no `az bicep` command itself.

Pinned version: `v0.49.2`. Source: the GitHub releases API of `Azure/bicep` (`https://api.github.com/repos/Azure/bicep/releases`), fetched 2026-11-22 through a summarising fetch tool, not the raw JSON: `v0.49.2`, `published_at` 2026-11-06T19:41:01Z, not a prerelease, not a draft (16 days old on 2026-11-22; the 14-day cooldown line is 2026-11-08); the release before it, `v0.48.1`, 2026-10-05. The date is therefore confirmed once, second-hand: task 0.2 re-reads it with `gh api` before the PR is marked ready, and a different result makes the version an explicit open item (open question 4).

Not verified: the OIDC login of the infra identity (needs RR-33's federated credential and a live run, RR-36); that the infra identity's custom role covers every call the workflow makes (open question 1); that `az deployment group create` uses the version `az bicep install --version` placed in the runner's Azure CLI folder instead of fetching a newer one (Learn says Azure CLI installs Bicep when needed, not that an installed older version is never replaced; the pin step is the documented lever, the first run's `az bicep version` line in the log is the evidence); that the Azure CLI on `ubuntu-latest` supports `--version` for `az bicep install` (Learn documents it; not run); how GitHub treats two runs in the shared queue beyond the documented "newest pending run replaces an older pending one" (open question 3).

## Rules for the executor

- Worktree per agent, from `origin/main`, never the main checkout. No `.env` is read or needed. Edit only with Edit and Write, no `sed`, no heredocs.
- New code carries no comment except a constraint, a security reason or a workaround with its source. The PR ends with a separate cleanup commit that deletes comments restating code or narrating history in every file it edits (task 4). The PR description carries a `Comments: <what and why>` line.
- Commit messages: two lines at most, no trailer. Repo docs contain placeholders only: no resource ids, no non-public hosts, no open weaknesses.
- Tests never touch the network or Azure. Run `auditing-branch-changes` before `gh pr create`; put its result in the PR-ready hand-over and on the ticket. Open a draft PR first, `gh pr ready` only after the draft's own CI run ends, then `gh pr checks --watch` (poll no faster than every 60 seconds).
- Gate legend: **offline** = runs in the sandbox, no login; **az login** = specialist or owner only.

---

### Task 0: worktree

- [ ] **0.1**

```bash
git -C <workspace>/restaurant-researcher-app fetch origin
git -C <workspace>/restaurant-researcher-app worktree add ../.worktrees/restaurant-researcher-app-rr70-workflow -b rr-70-deploy-infra-workflow origin/main
cd <workspace>/.worktrees/restaurant-researcher-app-rr70-workflow
grep -c 'infra/main.bicep' scripts/tests/test-deploy-scripts.sh
```

Expected: `1` or more (the RR-32 PR is in). If it prints `0`, stop: RR-32 is not merged; report to the coordinator. Check the coordinator has sequenced this story against RR-63, RR-64, RR-65 (no other `.github` story running).

- [ ] **0.2** Confirm the Bicep release to pin (read-only, a public API; poll no faster than 60 seconds).

```bash
gh api repos/Azure/bicep/releases/tags/v0.49.2 --jq '{tag: .tag_name, published: .published_at, prerelease: .prerelease}'
```

Expected: `"tag":"v0.49.2"`, `published` on or before 2026-11-08 for a PR opened before 2026-11-22 (at least 14 days before the day the PR is marked ready), `"prerelease":false`. If the date differs or the call fails, do not guess: put the version on the ticket as an open item (open question 4) and ask the coordinator. A newer release at least 14 days old may be pinned instead; then change `v0.49.2` in tasks 1.1 and 2.1 and in 3.2 consistently.

### Task 1: failing guard tests (red)

- [ ] **1.1** Insert the workflow guards in `scripts/tests/test-deploy-scripts.sh`, before the `# --- infra/main.bicep ---` heading.

old:

```
# --- infra/main.bicep -----------------------------------------------------
# The identity that deploys this file cannot write roles, identities or the
```

new:

```
# --- deploy workflows -----------------------------------------------------

INFRA_WF=.github/workflows/deploy-infra.yml
wf_line() { grep -n -- "$2" "$1" | head -1 | cut -d: -f1; }
wf_before() { local a b; a=$(wf_line "$1" "$2"); b=$(wf_line "$1" "$3"); [ -n "$a" ] && [ -n "$b" ] && [ "$a" -lt "$b" ]; }
id_token_outside_job() { grep -E 'id-token:' "$1" | grep -vE '^ {6}id-token: write$'; }
secret_not_assigned_to_env() { grep -E 'secrets\.' "$1" | grep -vE '^ +[A-Z_]+: \$\{\{ secrets\.[A-Z_]+ \}\}$'; }
workflow_triggers() { sed -n '/^on:/,/^[a-z]/p' "$1" | grep -E '^  [a-z_]+:'; }

for wf in .github/workflows/deploy.yml "$INFRA_WF"; do
  check "$wf starts only by hand" test "$(workflow_triggers "$wf")" = '  workflow_dispatch:'
  check "$wf runs only from main" grep -qxF "    if: github.ref == 'refs/heads/main'" "$wf"
  check "$wf waits for the production environment" grep -qx '    environment: production' "$wf"
  check "$wf never cancels a running deploy" grep -qx '  cancel-in-progress: false' "$wf"
  check "$wf keeps the git token off disk" grep -q 'persist-credentials: false' "$wf"
  check "$wf asks for id-token only in the job's permissions" test -z "$(id_token_outside_job "$wf")"
  check "$wf uses no azure/login action" not grep -qE 'uses:[[:space:]]+azure/login' "$wf"
  check "$wf reads secrets only into env variables" test -z "$(secret_not_assigned_to_env "$wf")"
done

check "Deploy infra exists" test -f "$INFRA_WF"
check "Deploy infra logs in as the infra identity" grep -qF 'CLIENT_ID: ${{ secrets.AZURE_INFRA_CLIENT_ID }}' "$INFRA_WF"
check "Deploy infra uses no build or deploy identity" not grep -qE 'AZURE_(BUILD|DEPLOY)_CLIENT_ID' "$INFRA_WF"
check "Deploy infra validates the commit before it logs in" wf_before "$INFRA_WF" 'Validate the commit' 'ci-azure-login.sh'
check "Deploy infra installs a pinned Bicep before it deploys" wf_before "$INFRA_WF" 'az bicep install --version v' 'infra/deploy.sh'
check "Deploy infra logs in before it deploys" wf_before "$INFRA_WF" 'ci-azure-login.sh' 'infra/deploy.sh'
check "Deploy infra waits for healthy apps after it deploys" wf_before "$INFRA_WF" 'infra/deploy.sh' 'wait-healthy.sh'
for var in GOOGLE_PLACES_API_KEY OPENAI_API_KEY SQL_SERVER SQL_DATABASE; do
  check "Deploy infra takes $var from the environment's secrets" \
    grep -qF "$var: \${{ secrets.$var }}" "$INFRA_WF"
done

# --- infra/main.bicep -----------------------------------------------------
# The identity that deploys this file cannot write roles, identities or the
```

The loop applies the shared rules to the existing `deploy.yml` too (it passes today: checked in the scratch run), so the two workflows cannot drift apart. Pinned actions and digests are already covered for every workflow file by `scripts/tests/test-supply-chain.sh` (`grep -r .github/workflows`), so the new file is checked there with no change. Each check catches a bug no other catches: a workflow that starts on a pull request, push or schedule (an automatic run would reach the `production` secrets without the owner's dispatch), runs from a branch, skips the approval, cancels a running infra deploy, leaves the git token on disk, grants `id-token` for the whole workflow, uses a third-party login action, echoes a secret inline, logs in as the wrong identity, deploys before validating, deploys without installing the pinned Bicep first, or forgets a value.

- [ ] **1.2** Add the Bicep pin check to `scripts/tests/test-supply-chain.sh`. It guards the rule "any `az bicep install` carries an exact version and Bicep is never upgraded" for every file that can run it (the same sources as the pip/pipx check, plus `infra`). Two edits.

Edit 1, old:

```
check "pip and pipx install only exact versions" none loose_installs
```

new:

```
loose_bicep_installs() {
  # shellcheck disable=SC2086
  grep -rnE 'az bicep (install|upgrade)' $INSTALL_SOURCES infra |
    grep -vE 'az bicep install --version v[0-9]+\.[0-9]+\.[0-9]+([[:space:]]|$)'
}
check "pip and pipx install only exact versions" none loose_installs
check "Bicep is installed only with an exact version, never upgraded" none loose_bicep_installs
```

Edit 2, the header comment of the file: old `#   2. no pip or pipx install from a version range;` new `#   2. no pip, pipx or az bicep install from a version range;`.

- [ ] **1.3** Run, expect red. Offline.

```bash
./scripts/tests/test-deploy-scripts.sh 2>&1 | grep '^FAIL'
./scripts/tests/test-deploy-scripts.sh 2>&1 | tail -1
./scripts/tests/test-supply-chain.sh | tail -1
```

Expected: 15 `FAIL` lines, all of `.github/workflows/deploy-infra.yml` or `Deploy infra`, then `deploy script tests: 15 failed`. The `deploy.yml` lines pass, including `starts only by hand`. (The checks that assert an absence pass vacuously while the file is missing.) `test-supply-chain: all checks passed`: the new check has nothing to flag yet; it is proved in task 2.2 by a mutation.

### Task 2: the workflow (green)

- [ ] **2.1** Create `.github/workflows/deploy-infra.yml` (Write):

```yaml
name: Deploy infra

on:
  workflow_dispatch:
    inputs:
      sha:
        description: Full commit SHA to put on all three apps (empty = each app keeps the tag it runs now)
        required: false
        default: ""

concurrency:
  group: deploy-production
  cancel-in-progress: false

permissions:
  contents: read

jobs:
  deploy-infra:
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    timeout-minutes: 20
    environment: production
    permissions:
      id-token: write
      contents: read
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          fetch-depth: 0
          persist-credentials: false

      - name: Validate the commit
        env:
          INPUT_SHA: ${{ inputs.sha }}
        run: |
          sha="$(echo "$INPUT_SHA" | tr -d '[:space:]')"
          if [ -n "$sha" ]; then
            if ! echo "$sha" | grep -Eq '^[0-9a-f]{40}$'; then
              echo "::error::'$sha' is not a full 40-character commit SHA."
              exit 1
            fi
            if ! git merge-base --is-ancestor "$sha" origin/main; then
              echo "::error::$sha is not on main; only merged commits can be deployed."
              exit 1
            fi
          fi
          echo "SHA=$sha" >> "$GITHUB_ENV"

      - name: Install the pinned Bicep CLI
        run: az bicep install --version v0.49.2

      - name: Log in to Azure
        env:
          AZURE_TENANT_ID: ${{ secrets.AZURE_TENANT_ID }}
          AZURE_SUBSCRIPTION_ID: ${{ secrets.AZURE_SUBSCRIPTION_ID }}
          CLIENT_ID: ${{ secrets.AZURE_INFRA_CLIENT_ID }}
        run: ./scripts/ci-azure-login.sh "$CLIENT_ID"

      - name: Deploy infra
        env:
          GOOGLE_PLACES_API_KEY: ${{ secrets.GOOGLE_PLACES_API_KEY }}
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
          SQL_SERVER: ${{ secrets.SQL_SERVER }}
          SQL_DATABASE: ${{ secrets.SQL_DATABASE }}
        run: ./infra/deploy.sh ${SHA:+"$SHA"}

      - name: Wait for the new revisions
        run: ./scripts/wait-healthy.sh
```

Notes (kept out of the file): the `Deploy` workflow's shape is copied (dispatch, `main` only, `production` environment, one queue, `id-token: write` on the job only, no git token on disk, validation before any Azure step, login through `scripts/ci-azure-login.sh`, no third-party login action). Differences: the identity secret `AZURE_INFRA_CLIENT_ID`; an empty SHA input means "each app keeps its tag" (open question 2, approved), so the validation runs only when a SHA is given; a step installs a pinned Bicep CLI before anything deploys, because `az deployment group create` compiles `main.bicep` with the Bicep binary Azure CLI installs when it needs one, unpinned (open question 4 for the version); `infra/main.bicep` and `deploy.sh` come from the run's checkout (head of `main`) and the SHA only names the image tag; the four values are `production` environment secrets (a secret is masked in public run logs, a variable is not). The infra identity needs repo secrets `AZURE_TENANT_ID` and `AZURE_SUBSCRIPTION_ID` that already exist.

- [ ] **2.2** Run. Offline.

```bash
./scripts/tests/test-deploy-scripts.sh 2>&1 | grep -v '^PASS'
./scripts/tests/test-supply-chain.sh | tail -1
actionlint .github/workflows/deploy-infra.yml && echo actionlint ok
```

Expected: `deploy script tests: all passed`; `test-supply-chain: all checks passed`; `actionlint ok`.

- [ ] **2.3** Prove the pin check catches a loose install. Edit `.github/workflows/deploy-infra.yml`: change `az bicep install --version v0.49.2` to `az bicep install --version latest`. Run:

```bash
./scripts/tests/test-supply-chain.sh | grep -v '^PASS'
./scripts/tests/test-deploy-scripts.sh 2>&1 | grep -E '^FAIL|failed'
```

Expected: `.github/workflows/deploy-infra.yml:<line>:        run: az bicep install --version latest`, `FAIL  Bicep is installed only with an exact version, never upgraded`, `test-supply-chain: 1 failed`; and from the other script `FAIL  Deploy infra installs a pinned Bicep before it deploys`, `deploy script tests: 1 failed`. Edit the line back to `--version v0.49.2` and re-run both: all passed. (Same proof for the triggers guard: add a line `  push:` under `on:`; expected `FAIL  .github/workflows/deploy-infra.yml starts only by hand`; remove it again.)

- [ ] **2.4** Commit.

```bash
git add .github/workflows/deploy-infra.yml scripts/tests/test-deploy-scripts.sh scripts/tests/test-supply-chain.sh
git commit -m "Add the Deploy infra workflow" -m "Own identity, production approval, main only, pinned Bicep; guard tests cover both deploy workflows."
```

### Task 3: docs

Both doc files below are also edited by the RR-32 plan, which lands first. The anchors here are the RR-32 plan's results (its tasks 5.2, 5.3 and 5.4), so re-read each file before an Edit; RR-33 may also have edited them. This plan edits only the lines named here: the infra row of the "What to run" table, the first sentence of "Infra deploy" plus one appended paragraph, and the infra sentence of the `CLAUDE.md` Deployment section.

- [ ] **3.1** `deployment/README.md`, infra row (replaces the RR-32 PR's row).

old:

```
| Infra (`infra/main.bicep`) | `./infra/deploy.sh [sha]` with the four variables set (see Infra deploy); each app keeps the tag it runs now unless you pass a SHA |
```

new:

```
| Infra (`infra/main.bicep`) | The **Deploy infra** workflow on GitHub (see Infra deploy); each app keeps the tag it runs now unless you pass a SHA |
```

- [ ] **3.2** `deployment/README.md`, extend "Infra deploy": replace its first sentence and add a button paragraph.

old:

```
`./infra/deploy.sh [sha]` applies `infra/main.bicep`. It reads
```

new:

```
Production infra changes when the owner starts **Deploy infra** (Actions tab, or `gh workflow run deploy-infra.yml --ref main`); it runs `infra/deploy.sh [sha]`, which applies `infra/main.bicep`. It reads
```

and append after the "First rollout, in order" paragraph:

```
The workflow installs a pinned Bicep CLI first (`az bicep install --version`, in `deploy-infra.yml`; to move it, pin a Bicep release at least 14 days old and change that one line). It logs in as its own identity (repo secret `AZURE_INFRA_CLIENT_ID`, set by `setup-github-deploy.sh`), which can start deployments and change this project's Container Apps but cannot assign roles or create identities. The run waits for the owner's approval in the `production` environment, like **Deploy**, and only starts from `main`. It reads four secrets of the `production` environment, set by the owner with `gh secret set <name> --env production -R Fredheda/restaurant-researcher-app` (the value comes from a hidden prompt): `GOOGLE_PLACES_API_KEY`, `OPENAI_API_KEY`, `SQL_SERVER`, `SQL_DATABASE`. The SQL names are secrets so that public run logs mask them. Leave the SHA empty to keep each app's tag; give a full SHA on `main` for the first run. **Deploy** and **Deploy infra** share one queue; GitHub keeps only the newest waiting run per queue, so start the second after the first has finished.
```

- [ ] **3.3** `CLAUDE.md` Deployment section (replaces the RR-32 PR's sentence).

old:

```
`./infra/deploy.sh [sha]` deploys infra; it needs `GOOGLE_PLACES_API_KEY`, `OPENAI_API_KEY`, `SQL_SERVER` and `SQL_DATABASE` in the environment.
```

new:

```
Infra deploys with the manual **Deploy infra** workflow (same `main`-only and approval rules; own identity; the four values `GOOGLE_PLACES_API_KEY`, `OPENAI_API_KEY`, `SQL_SERVER`, `SQL_DATABASE` are `production` environment secrets), which runs `./infra/deploy.sh [sha]`.
```

- [ ] **3.4** `docs/development.md`, `README.md`: no edit.
- [ ] **3.5** Commit.

```bash
git add deployment/README.md CLAUDE.md
git commit -m "Document the Deploy infra workflow" -m "Secrets, approval and the shared queue are in deployment/README.md."
```

### Task 4: cleanup commit

- [ ] **4.1** The workflow file carries no comment. In `scripts/tests/test-deploy-scripts.sh` and `deployment/README.md`, delete comments or sentences that restate the code if any were added by RR-33 or earlier work in lines this PR touched (re-read both files); expect none to delete beyond the RR-32 PR's cleanup. If nothing changed, make no cleanup commit and say so on the ticket ("comment cleanup: nothing to delete").
- [ ] **4.2** Count: `git show origin/main:scripts/tests/test-deploy-scripts.sh | grep -cE '^[[:space:]]*(//|#)'` against the working file; this PR adds zero comment lines to it (the guard section has none); `scripts/tests/test-supply-chain.sh` gains one `# shellcheck disable=SC2086` directive (the same unquoted-sources workaround its pip check already carries) and one edited header line. The PR description carries `Comments: none added in the workflow or the guard tests; test-supply-chain.sh +1 shellcheck directive (same workaround as the existing pip check)`.

### Task 5: gates and PR

| # | Gate | Needs | Command | Expected |
|---|---|---|---|---|
| 1 | Workflow lint | offline | `actionlint` | no output |
| 2 | Guard and supply-chain tests | offline | `./scripts/tests/test-deploy-scripts.sh && ./scripts/tests/test-supply-chain.sh` | all passed |
| 3 | Whole local CI | offline | `./scripts/ci-local.sh` | `ci-local: all checks passed` |
| 3b | Bicep release date | read-only, public API | `gh api repos/Azure/bicep/releases/tags/v0.49.2 --jq .published_at` | a date on or before 2026-11-08 (14 days before the day the PR is marked ready, or older); else open question 4 |
| 4 | Secrets present before the first run | owner, GitHub | `gh secret list --env production -R Fredheda/restaurant-researcher-app` and `gh secret list -R Fredheda/restaurant-researcher-app` | environment: `GOOGLE_PLACES_API_KEY`, `OPENAI_API_KEY`, `SQL_SERVER`, `SQL_DATABASE`; repo: `AZURE_INFRA_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID` (names only; never print a value) |
| 5 | First run | RR-36, owner's yes and approval | `gh workflow run deploy-infra.yml --ref main -f sha=<X>` (a bare command, no `cd`, no chain) | waits for approval; then steps green; `wait-healthy` prints each app Provisioned |

- [ ] **5.1** Gates 1 to 3 offline. Gate 4 is the owner's, listed in the owner table. Gate 5 is RR-36 (not run by this PR), with the before/after evidence from the spec: before and after the run, `az containerapp secret list -n ca-restaurant-researcher-web -g rg-chatbot --query "[].name" -o tsv` and `az containerapp ingress show -n ca-restaurant-researcher-web -g rg-chatbot --query "customDomains[].name" -o tsv` give identical lists (names only, never `--show-values`); Easy Auth sign-in works; api and agent show `external: false`; the web env shows `API_URL` and `AGENT_URL` with `https://` and `.internal.`; from inside the web app, an https request to `API_URL` with certificate verification on returns the api `/health` (the TLS gate); the api and agent hosts fail from a laptop; after one signed-in search `./scripts/apply-schema.sh --verify` shows row counts above zero in `rr.searches` and `rr.users`.
- [ ] **5.2** `auditing-branch-changes`; push; draft PR; ready after the draft's CI ends; `gh pr checks --watch` (60 seconds or slower); hand over. PR description: what ships, "Nothing is deployed", the secrets the owner must set (names only), open questions 1 and 4 for the owner, the Bicep pin (version, date, source) and the line from task 4.2.

---

## Open questions

Closed by the specialist's approval (2026-11-22): the earlier question 1 (registry read for the infra identity). The image check is removed from `deploy.sh`; no `AcrPull` for the infra identity (the registry is shared and the role would read every project's images). A wrong SHA fails the deployment while the running revision keeps serving; the docs say "run Deploy for the SHA first".

1. **Custom role actions for RR-33 (13 in its current plan).** The workflow's script and the Bicep file need reads and writes: deployments, Container Apps write, `Microsoft.App/containerApps/read` and `.../revisions/read` (`app_exists`, tag lookup, `wait-healthy`), `Microsoft.App/managedEnvironments/read`, `Microsoft.App/managedEnvironments/managedCertificates/read` (the custom domain's `certificateId` is built from the `existing` environment), `Microsoft.ManagedIdentity/userAssignedIdentities/read` (the `existing` references and `properties.clientId`), and `Managed Identity Operator` on both identities (attaching them). No registry action. RR-33's plan lists the exact set from Learn; confirm its 13 cover these. Blocks the first run, not the merge. Decides: specialist.
2. **Empty SHA input: approved as written.** The binding rule said "empty = head of main" like `deploy.yml`. This plan makes an empty input mean "each app keeps its current tag", because `deploy.sh` does not lock tags (`redeploy.sh` does): an infra run that moves tags to head of `main` leaves the new tag unlocked for the weekly `acr purge` and the old one locked. Rolling tags stays the **Deploy** workflow's job.
3. **Shared queue `deploy-production`: kept (specialist).** One queue serialises infra and Deploy. GitHub keeps only the newest pending run per queue, so a second dispatch while one waits for approval cancels the first waiting run; that replacement is visible in the Actions tab, whereas two runs racing on tags would be silent. A separate group is rejected.
4. **Bicep version pin: confirm the release date.** `v0.49.2` is pinned on the strength of one second-hand read of the GitHub releases API (published 2026-11-06, 16 days before the plan date; the 14-day line was 2026-11-08). Task 0.2 re-reads it with `gh api`. If that fails or shows a later date, the version stays an explicit open item and the PR is not marked ready. Decides: specialist.

## Self-check against the spec and the binding rules

| Requirement | Where |
|---|---|
| Workflow shape of `deploy.yml`: dispatch with optional full-SHA input, `if: github.ref == 'refs/heads/main'`, `production` environment, concurrency without cancel, `id-token: write` on the job only, no git token on disk, SHA validated before any Azure login | 2.1, guards 1.1 |
| Login via `scripts/ci-azure-login.sh` with the infra identity's client id secret `AZURE_INFRA_CLIENT_ID` (name RR-33 must match), then `infra/deploy.sh`, then `scripts/wait-healthy.sh` | 2.1, guards 1.1, Dependencies |
| The four values as `production` environment secrets (SQL names too: public run logs mask secrets) | 2.1, 3.2, guards 1.1 |
| Guard tests extended to the new workflow, incl. no `pull_request`/`push`/`schedule` trigger (only `workflow_dispatch`) | 1.1 (applied to both workflows) and `test-supply-chain.sh` (every workflow) |
| Bicep CLI pinned (`az bicep install --version vX.Y.Z`, at least 14 days old, source and date stated), with a supply-chain test, red/green by mutation | 1.2, 2.1, 2.3, Verified section, open question 4 |
| Shared `deploy-production` queue kept; RR-33 role of 13 actions as an order dependency | 2.1, Dependencies, open questions 1 and 3 |
| Never parallel with other `ci.yml` / `claude-review.yml` / `.github` stories | TL;DR, Dependencies, 0.1 |
| RR-32 and RR-33 merge first; live run order; no deploy in this PR | header, Dependencies |
| Docs as exact text, split from the RR-32 plan's edits of the same files, anchors against its result | Task 3 |
| Comments rule, cleanup commit, `Comments:` line | Task 4, 5.2 |
| Gates, owner-runnable, marked by who runs them | Task 5 |
| Spec deviations flagged, not hidden | Open questions 2 (empty SHA, approved) and 3 (shared queue, kept) |
