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
#
# Usage: ./scripts/tests/test-deploy-scripts.sh
set -uo pipefail
cd "$(dirname "$0")/../.." || exit 1
ROOT=$PWD

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
mkdir "$tmp/bin"
cat >"$tmp/bin/az" <<'EOF'
#!/usr/bin/env bash
echo "$*" >> "$FAKE_LOG"
app=$(echo "$*" | sed -nE 's/.* -n ([^ ]+).*/\1/p')
case "$*" in
  "containerapp "*)
    case ",${FAKE_ABSENT:-}," in *",$app,"*) echo "ResourceNotFound" >&2; exit 3 ;; esac ;;
esac
case "$*" in
  "acr repository show"*)
    image=$(echo "$*" | sed -E 's/.*--image ([^ ]+).*/\1/')
    case ",${FAKE_MISSING:-}," in *",$image,"*) exit 1 ;; esac
    exit 0 ;;
  "acr build"*)
    echo "$PWD $(test -f frontend/Dockerfile && test -f backend/Dockerfile && echo has-dockerfiles)" >> "$FAKE_LOG.build-dir"
    exit 0 ;;
  "containerapp update"*)
    [ "${FAKE_FAIL_UPDATE:-}" = any ] && exit 1
    [ -n "${FAKE_FAIL_UPDATE:-}" ] && [ "$app" = "$FAKE_FAIL_UPDATE" ] && exit 1
    exit 0 ;;
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
  rm -f "$LOG.build-dir" "$LOG.n"
  PATH="$tmp/bin:$PATH" FAKE_LOG="$LOG" "$@" >/dev/null 2>&1
  rc=$?
}
called() { grep -q -- "$1" "$LOG"; }
count() { grep -c -- "$1" "$LOG"; }
check() { # check <name> <command...>
  local name=$1
  shift
  if "$@"; then pass "$name"; else fail "$name"; fi
}
not() { ! "$@"; }
# line number of the first log line matching a pattern (0 if none)
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

# Before the backend apps exist, Deploy keeps working for the web app alone.
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

# --- wait-healthy ---------------------------------------------------------

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

[ "$failures" -eq 0 ] && echo "deploy script tests: all passed" || echo "deploy script tests: $failures failed"
exit "$failures"
