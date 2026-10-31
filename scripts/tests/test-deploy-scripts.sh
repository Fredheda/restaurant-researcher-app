#!/usr/bin/env bash
# Offline tests for the deploy scripts, run against a fake `az` on PATH.
# The fake records every call (one line per call) and answers from variables:
#   FAKE_MISSING        comma list of repo:tag that `az acr repository show` reports missing
#   FAKE_FAIL_UPDATE    set to make `az containerapp update` fail
#   FAKE_IMAGE          image `az containerapp show ... image` prints (the running image)
#   FAKE_PROVISIONING   comma list of revision states, one per `revision show` call
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
case "$*" in
  "acr repository show"*)
    image=$(echo "$*" | sed -E 's/.*--image ([^ ]+).*/\1/')
    case ",${FAKE_MISSING:-}," in *",$image,"*) exit 1 ;; esac
    exit 0 ;;
  "acr build"*)
    echo "$PWD $(test -f frontend/Dockerfile && echo has-dockerfile)" >> "$FAKE_LOG.build-dir"
    exit 0 ;;
  "containerapp update"*)
    [ -n "${FAKE_FAIL_UPDATE:-}" ] && exit 1
    exit 0 ;;
  "containerapp show"*latestRevisionName*) echo "app--rev1"; exit 0 ;;
  "containerapp show"*ingress.fqdn*) echo "web.example.test"; exit 0 ;;
  "containerapp show"*image*) echo "${FAKE_IMAGE:-}"; exit 0 ;;
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
REPO=restaurant-researcher-web
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
check() { # check <name> <command...>
  local name=$1
  shift
  if "$@"; then pass "$name"; else fail "$name"; fi
}
not() { ! "$@"; }

run ./scripts/build-push.sh abc
check "build-push rejects a short SHA" test "$rc" -eq 1
check "build-push short SHA makes no az call" not called "acr"

run ./scripts/build-push.sh "$(echo "$SHA" | tr 'a-f' 'A-F')"
check "build-push rejects an uppercase SHA" test "$rc" -eq 1

run ./scripts/build-push.sh 2222222222222222222222222222222222222222
check "build-push rejects a SHA that is not a commit" test "$rc" -eq 1

run ./scripts/build-push.sh "$SHA"
check "build-push skips an image that exists" not called "acr build"
check "build-push skip exits 0" test "$rc" -eq 0

FAKE_MISSING="$REPO:$SHA" run ./scripts/build-push.sh "$SHA"
check "build-push builds a missing image" called "acr build"
check "build-push tags the SHA and latest" called "--image $REPO:latest --image $REPO:$SHA"
check "build-push builds from an archive, not the working tree" \
  bash -c "grep -q has-dockerfile '$LOG.build-dir' && ! grep -q '^$ROOT ' '$LOG.build-dir'"

run ./scripts/redeploy.sh abc
check "redeploy rejects a short SHA" test "$rc" -eq 2
check "redeploy short SHA changes nothing" not called "containerapp update"

FAKE_MISSING="$REPO:$SHA" run ./scripts/redeploy.sh "$SHA"
check "redeploy refuses a SHA with no image" test "$rc" -eq 1
check "redeploy without an image changes nothing" not called "containerapp update"

FAKE_IMAGE="acr.example/$REPO:$OLD" run ./scripts/redeploy.sh "$SHA"
check "redeploy rolls the app" called "containerapp update"
check "redeploy locks the new tag" called "--image $REPO:$SHA --delete-enabled false"
check "redeploy unlocks the replaced SHA tag" called "--image $REPO:$OLD --delete-enabled true"

FAKE_IMAGE="acr.example/$REPO:latest" run ./scripts/redeploy.sh "$SHA"
check "redeploy never unlocks latest" not called "--image $REPO:latest --delete-enabled true"

FAKE_IMAGE="acr.example/$REPO:$SHA" run ./scripts/redeploy.sh "$SHA"
check "redeploy never unlocks the tag it is already on" not called "--delete-enabled true"

FAKE_FAIL_UPDATE=1 FAKE_IMAGE="acr.example/$REPO:$OLD" run ./scripts/redeploy.sh "$SHA"
check "redeploy fails when the rollout fails" test "$rc" -ne 0
check "failed rollout changes no lock" not called "repository update"

run ./scripts/wait-healthy.sh 5 0
check "wait-healthy passes on Provisioned" test "$rc" -eq 0

FAKE_PROVISIONING=Provisioning,Failed run ./scripts/wait-healthy.sh 5 0
check "wait-healthy fails on Failed" test "$rc" -eq 1

FAKE_PROVISIONING=Provisioning run ./scripts/wait-healthy.sh 1 0
check "wait-healthy times out" test "$rc" -eq 1

[ "$failures" -eq 0 ] && echo "deploy script tests: all passed" || echo "deploy script tests: $failures failed"
exit "$failures"
