#!/usr/bin/env bash
# Offline tests for the deploy scripts, run against a fake `az` on PATH.
# The project ships two images (web, backend) to three apps (api and agent
# run the backend image, web runs the web image).
# The fake records every call (one line per call) and answers from variables:
#   FAKE_MISSING        comma list of repo:tag that `az acr repository show` reports missing
#   FAKE_FAIL_UPDATE    app name whose `az containerapp update` fails ("any" for all)
#   FAKE_IMAGES         comma list of app=image that `az containerapp show ... image` prints
#   FAKE_PROVISIONING   comma list of revision states, one per `revision show` call
#   FAKE_ABSENT         comma list of apps that do not exist (every containerapp call fails)
#   FAKE_BROKEN         comma list of apps whose containerapp calls fail with another error
#   FAKE_NO_IDENTITY    comma list of identities that do not exist until `identity create` runs
#   FAKE_BROKEN_IDENTITY comma list of identities whose `identity show` fails with another error
#   FAKE_ROLE_EXISTS    1 when the custom role definition already exists
#   FAKE_SECRETS        comma list of environment secret names `gh secret list` reports
#   FAKE_FAIL_DEPLOY    any value: `az deployment group create` fails
# A `deployment group create` call copies its `--parameters @file` to $FAKE_LOG.params
# (with the file's mode and path in .params-mode and .params-path) before answering.
#
# Usage: ./scripts/tests/test-deploy-scripts.sh
set -uo pipefail
cd "$(dirname "$0")/../.." || exit 1
ROOT=$PWD

tmp=$(mktemp -d "${TMPDIR:-/tmp}/rr-deploy-tests.XXXXXX")
trap 'rm -rf "$tmp"' EXIT
mkdir "$tmp/bin"
cat >"$tmp/bin/az" <<'EOF'
#!/usr/bin/env bash
echo "$*" >> "$FAKE_LOG"
app=$(echo "$*" | sed -nE 's/.* -n ([^ ]+).*/\1/p')
RG_ID=/subscriptions/sub-test/resourceGroups/rg-chatbot
in_list() { case ",$1," in *",$2,"*) return 0 ;; esac; return 1; }
case "$*" in
  "containerapp "*)
    case ",${FAKE_ABSENT:-}," in *",$app,"*) echo "ResourceNotFound" >&2; exit 3 ;; esac
    case ",${FAKE_BROKEN:-}," in *",$app,"*) echo "AuthorizationFailed" >&2; exit 4 ;; esac ;;
esac
case "$*" in
  "acr repository show"*)
    image=$(echo "$*" | sed -E 's/.*--image ([^ ]+).*/\1/')
    case ",${FAKE_MISSING:-}," in *",$image,"*) exit 1 ;; esac
    exit 0 ;;
  "acr build"*)
    echo "$PWD $(test -f frontend/Dockerfile && test -f backend/Dockerfile && echo has-dockerfiles)" >> "$FAKE_LOG.build-dir"
    exit 0 ;;
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
    [ -n "${FAKE_FAIL_UPDATE:-}" ] && [ "$app" = "$FAKE_FAIL_UPDATE" ] && exit 1
    exit 0 ;;
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
  "containerapp show"*ingress.fqdn*) echo "web.example.test"; exit 0 ;;
  "containerapp show"*image*)
    IFS=',' read -r -a pairs <<<"${FAKE_IMAGES:-}"
    for pair in "${pairs[@]}"; do
      [ "${pair%%=*}" = "$app" ] && echo "${pair#*=}"
    done
    exit 0 ;;
  "containerapp revision show"*)
    n=$(cat "$FAKE_LOG.n" 2>/dev/null || echo 0)
    IFS=',' read -r -a states <<<"${FAKE_PROVISIONING:-Provisioned}"
    last=$((${#states[@]} - 1))
    idx=$((n > last ? last : n))
    echo "${states[$idx]}"
    echo $((n + 1)) >"$FAKE_LOG.n"
    exit 0 ;;
esac
exit 0
EOF
chmod +x "$tmp/bin/az"
# Fake `gh`: records every call in $FAKE_LOG.gh; the OIDC subject prefix and a
# user lookup get fixed answers; a body given on stdin lands in $FAKE_LOG.gh-body.
cat >"$tmp/bin/gh" <<'EOF'
#!/usr/bin/env bash
echo "$*" >> "$FAKE_LOG.gh"
case "$*" in
  *"customization/sub"*) echo "repo:Fredheda@1/restaurant-researcher-app@2"; exit 0 ;;
  *" users/"*) echo 77542239; exit 0 ;;
  *"secret list"*)
    IFS=',' read -r -a names <<<"${FAKE_SECRETS:-}"
    for name in "${names[@]}"; do
      [ -z "$name" ] || printf '%s\t2026-11-22\n' "$name"
    done
    exit 0 ;;
  *"--input -"*) cat >> "$FAKE_LOG.gh-body"; exit 0 ;;
esac
exit 0
EOF
chmod +x "$tmp/bin/gh"
cat >"$tmp/bin/poetry" <<'EOF'
#!/usr/bin/env bash
echo "$PWD $*" >> "$FAKE_LOG.poetry"
EOF
chmod +x "$tmp/bin/poetry"

SHA=$(git rev-parse HEAD)
OLD=1111111111111111111111111111111111111111
OLDER=2222222222222222222222222222222222222222
WEB=restaurant-researcher-web
BACKEND=restaurant-researcher-backend
API_APP=ca-restaurant-researcher-api
AGENT_APP=ca-restaurant-researcher-agent
WEB_APP=ca-restaurant-researcher-web
REG=acr.example
failures=0
pass() { echo "PASS  $1"; }
fail() { echo "FAIL  $1"; failures=$((failures + 1)); }

# run <script> [args...]: runs with a fresh log; sets $rc and $LOG.
run() {
  LOG="$tmp/log.$RANDOM"
  : >"$LOG"
  rm -f "$LOG".*
  PATH="$tmp/bin:$PATH" FAKE_LOG="$LOG" "$@" >"$LOG.out" 2>&1
  rc=$?
}
printed() { grep -q -- "$1" "$LOG.out"; }
called() { grep -q -- "$1" "$LOG"; }
count() { grep -c -- "$1" "$LOG"; }
gh_called() { grep -q -- "$1" "$LOG.gh"; }
gh_body_has() { grep -q -- "$1" "$LOG.gh-body"; }
check() {
  local name=$1
  shift
  if "$@"; then pass "$name"; else fail "$name"; fi
}
not() { ! "$@"; }
at() { grep -n -- "$1" "$LOG" | head -1 | cut -d: -f1; }
before() { local a b; a=$(at "$1"); b=$(at "$2"); [ -n "$a" ] && [ -n "$b" ] && [ "$a" -lt "$b" ]; }

ALL_OLD="$API_APP=$REG/$BACKEND:$OLD,$AGENT_APP=$REG/$BACKEND:$OLD,$WEB_APP=$REG/$WEB:$OLD"

# --- build-push -----------------------------------------------------------

run ./scripts/build-push.sh abc
check "build-push rejects a short SHA" test "$rc" -eq 1
check "build-push short SHA makes no az call" not called "acr"

run ./scripts/build-push.sh "$(echo "$SHA" | tr 'a-f' 'A-F')"
check "build-push rejects an uppercase SHA" test "$rc" -eq 1

run ./scripts/build-push.sh "$OLDER"
check "build-push rejects a SHA that is not a commit" test "$rc" -eq 1

run ./scripts/build-push.sh "$SHA"
check "build-push skips images that exist" not called "acr build"
check "build-push skip exits 0" test "$rc" -eq 0

FAKE_MISSING="$WEB:$SHA,$BACKEND:$SHA" run ./scripts/build-push.sh "$SHA"
check "build-push builds each image exactly once" test "$(count "acr build")" -eq 2
check "build-push tags the web SHA and latest" called "--image $WEB:latest --image $WEB:$SHA"
check "build-push tags the backend SHA and latest" called "--image $BACKEND:latest --image $BACKEND:$SHA"
check "build-push builds the backend from backend/" called "--file backend/Dockerfile --image $BACKEND:latest --image $BACKEND:$SHA backend"
check "build-push builds from an archive, not the working tree" \
  bash -c "grep -q has-dockerfiles '$LOG.build-dir' && ! grep -q '^$ROOT ' '$LOG.build-dir'"

FAKE_MISSING="$BACKEND:$SHA" run ./scripts/build-push.sh "$SHA"
check "build-push builds only the missing image" test "$(count "acr build")" -eq 1
check "build-push skips the web image that exists" not called "acr build.*--image $WEB:$SHA"

# --- redeploy -------------------------------------------------------------

run ./scripts/redeploy.sh abc
check "redeploy rejects a short SHA" test "$rc" -eq 2
check "redeploy short SHA changes nothing" not called "containerapp update"

FAKE_MISSING="$BACKEND:$SHA" FAKE_IMAGES="$ALL_OLD" run ./scripts/redeploy.sh "$SHA"
check "redeploy refuses unless every image exists" test "$rc" -eq 1
check "redeploy with a missing image changes nothing" not called "containerapp update"

FAKE_IMAGES="$ALL_OLD" run ./scripts/redeploy.sh "$SHA"
check "redeploy rolls all three apps" test "$(count "containerapp update")" -eq 3
check "redeploy points api at the backend image" called "update -n $API_APP -g rg-chatbot --image acrchatbotfredheda.azurecr.io/$BACKEND:$SHA"
check "redeploy points agent at the backend image" called "update -n $AGENT_APP -g rg-chatbot --image acrchatbotfredheda.azurecr.io/$BACKEND:$SHA"
check "redeploy points web at the web image" called "update -n $WEB_APP -g rg-chatbot --image acrchatbotfredheda.azurecr.io/$WEB:$SHA"
check "redeploy rolls api before agent" before "update -n $API_APP" "update -n $AGENT_APP"
check "redeploy rolls web last" before "update -n $AGENT_APP" "update -n $WEB_APP"
check "redeploy locks each new tag once" test "$(count "$SHA --delete-enabled false")" -eq 2
check "redeploy unlocks the replaced backend tag once" test "$(count "$BACKEND:$OLD --delete-enabled true")" -eq 1
check "redeploy unlocks the replaced web tag" called "$WEB:$OLD --delete-enabled true"

FAKE_IMAGES="$API_APP=$REG/$BACKEND:$OLD,$AGENT_APP=$REG/$BACKEND:$OLDER,$WEB_APP=$REG/$WEB:$OLD" \
  run ./scripts/redeploy.sh "$SHA"
check "redeploy unlocks every distinct replaced tag" \
  bash -c "grep -q -- '$BACKEND:$OLD --delete-enabled true' '$LOG' && grep -q -- '$BACKEND:$OLDER --delete-enabled true' '$LOG'"

FAKE_IMAGES="$API_APP=$REG/$BACKEND:latest,$AGENT_APP=$REG/$BACKEND:latest,$WEB_APP=$REG/$WEB:latest" \
  run ./scripts/redeploy.sh "$SHA"
check "redeploy never unlocks latest" not called ":latest --delete-enabled true"

FAKE_IMAGES="$API_APP=$REG/$BACKEND:$SHA,$AGENT_APP=$REG/$BACKEND:$SHA,$WEB_APP=$REG/$WEB:$SHA" \
  run ./scripts/redeploy.sh "$SHA"
check "redeploy never unlocks the tag it is already on" not called "--delete-enabled true"

FAKE_IMAGES="$API_APP=,$AGENT_APP=,$WEB_APP=$REG/$WEB:$OLD" run ./scripts/redeploy.sh "$SHA"
check "redeploy handles a backend app with no image yet" test "$rc" -eq 0

FAKE_FAIL_UPDATE="$AGENT_APP" FAKE_IMAGES="$ALL_OLD" run ./scripts/redeploy.sh "$SHA"
check "redeploy fails when a rollout fails" test "$rc" -ne 0
check "failed rollout changes no lock" not called "repository update"
check "failed rollout leaves the web app untouched" not called "update -n $WEB_APP"

BACKEND_ABSENT="$API_APP,$AGENT_APP"
FAKE_ABSENT="$BACKEND_ABSENT" FAKE_MISSING="$BACKEND:$SHA" FAKE_IMAGES="$WEB_APP=$REG/$WEB:$OLD" \
  run ./scripts/redeploy.sh "$SHA"
check "redeploy skips apps that do not exist yet" test "$rc" -eq 0
check "redeploy rolls only the web app then" test "$(count "containerapp update")" -eq 1
check "redeploy does not require the image of a skipped app" not called "$BACKEND:$SHA --delete-enabled"
check "redeploy still locks the web tag" called "$WEB:$SHA --delete-enabled false"
check "redeploy still unlocks the replaced web tag" called "$WEB:$OLD --delete-enabled true"

FAKE_ABSENT="$BACKEND_ABSENT" FAKE_MISSING="$WEB:$SHA" run ./scripts/redeploy.sh "$SHA"
check "redeploy still refuses a missing image of an existing app" test "$rc" -eq 1
check "that refusal changes nothing" not called "containerapp update"

FAKE_ABSENT="$API_APP,$AGENT_APP,$WEB_APP" run ./scripts/redeploy.sh "$SHA"
check "redeploy fails when no app exists" test "$rc" -ne 0

FAKE_BROKEN="$WEB_APP" run ./scripts/redeploy.sh "$SHA"
check "redeploy fails on an az error, not skipping the app" test "$rc" -ne 0
check "that failure changes nothing" not called "containerapp update"

# --- wait-healthy ---------------------------------------------------------

FAKE_BROKEN="$WEB_APP" run ./scripts/wait-healthy.sh 5 0
check "wait-healthy fails on an az error, not skipping the app" test "$rc" -ne 0

FAKE_ABSENT="$BACKEND_ABSENT" run ./scripts/wait-healthy.sh 5 0
check "wait-healthy skips apps that do not exist yet" test "$rc" -eq 0
check "wait-healthy still checks the web app" called "revision show -n $WEB_APP"


run ./scripts/wait-healthy.sh 5 0
check "wait-healthy passes on Provisioned" test "$rc" -eq 0
check "wait-healthy checks all three apps" \
  bash -c "grep -q -- 'revision show -n $API_APP' '$LOG' && grep -q -- 'revision show -n $AGENT_APP' '$LOG' && grep -q -- 'revision show -n $WEB_APP' '$LOG'"

FAKE_PROVISIONING=Provisioning,Failed run ./scripts/wait-healthy.sh 5 0
check "wait-healthy fails on Failed" test "$rc" -eq 1

FAKE_PROVISIONING=Provisioning run ./scripts/wait-healthy.sh 1 0
check "wait-healthy times out" test "$rc" -eq 1

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
  check "$wf has exactly one job" test "$(sed -n '/^jobs:/,$p' "$wf" | grep -cE '^  [a-z][a-z0-9_-]*:$')" -eq 1
done

check "Deploy infra exists" test -f "$INFRA_WF"
check "Deploy infra logs in as the infra identity" grep -qF 'CLIENT_ID: ${{ secrets.AZURE_INFRA_CLIENT_ID }}' "$INFRA_WF"
check "Deploy infra uses no build or deploy identity" not grep -qE 'AZURE_(BUILD|DEPLOY)_CLIENT_ID' "$INFRA_WF"
check "Deploy infra validates the commit before it logs in" wf_before "$INFRA_WF" 'Validate the commit' 'ci-azure-login.sh'
check "Deploy infra installs a pinned Bicep before it deploys" wf_before "$INFRA_WF" 'az bicep install --version v' 'infra/deploy.sh'
check "Deploy infra logs in before it deploys" wf_before "$INFRA_WF" 'ci-azure-login.sh' 'infra/deploy.sh'
check "Deploy infra checks the Bicep binary's hash before it logs in" wf_before "$INFRA_WF" 'sha256sum --check --strict' 'ci-azure-login.sh'
check "Deploy infra waits for healthy apps after it deploys" wf_before "$INFRA_WF" 'infra/deploy.sh' 'wait-healthy.sh'
for var in GOOGLE_PLACES_API_KEY OPENAI_API_KEY SQL_SERVER SQL_DATABASE; do
  check "Deploy infra takes $var from the environment's secrets" \
    grep -qF "$var: \${{ secrets.$var }}" "$INFRA_WF"
done

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
MARK_G=marker-google
MARK_O=marker-openai
export GOOGLE_PLACES_API_KEY=$MARK_G OPENAI_API_KEY=$MARK_O SQL_SERVER=sql.example.test SQL_DATABASE=db1

for var in GOOGLE_PLACES_API_KEY OPENAI_API_KEY SQL_SERVER SQL_DATABASE; do
  FAKE_IMAGES="$ALL_OLD" run env "$var=" ./infra/deploy.sh "$SHA"
  check "deploy.sh stops when $var is empty" test "$rc" -eq 2
  check "deploy.sh names $var" printed "$var"
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
check "deploy.sh prints the tags it will use" printed "web=$OLD api=$OLDER agent=$THIRD"

FAKE_ABSENT="$API_APP" FAKE_IMAGES="$ALL_OLD" run ./infra/deploy.sh
check "deploy.sh without an argument stops when an app does not exist" test "$rc" -eq 1
check "that stop names the app" printed "$API_APP"
check "that stop deploys nothing" not called "deployment group"

FAKE_IMAGES="$ALL_OLD" run ./infra/deploy.sh "$SHA"
check "no az argument carries a key" not grep -q -e "$MARK_G" -e "$MARK_O" "$LOG"
check "no output carries a key" not grep -q -e "$MARK_G" -e "$MARK_O" "$LOG.out"
check "the key file holds both keys under their parameter names" \
  python3 -c 'import json, sys
p = json.load(open(sys.argv[1]))["parameters"]
assert p["googlePlacesKey"]["value"] == sys.argv[2] and p["openaiApiKey"]["value"] == sys.argv[3]' \
  "$LOG.params" "$MARK_G" "$MARK_O"
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
check "setup restricts production to main" gh_body_has '"custom_branch_policies": true'
check "setup adds the main branch policy" gh_called "deployment-branch-policies -f name=main -f type=branch"
check "setup makes the repo owner the required reviewer" gh_body_has '"reviewers": \[{"type": "User", "id": 77542239}\]'
check "setup lets the owner approve his own run" gh_body_has '"prevent_self_review": false'
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

run ./scripts/apply-schema.sh --check
check "apply-schema runs the module from backend/ and passes the flags on" \
  grep -qx "$ROOT/backend run python -m tools.apply_schema --check" "$LOG.poetry"

[ "$failures" -eq 0 ] && echo "deploy script tests: all passed" || echo "deploy script tests: $failures failed"
exit "$failures"
