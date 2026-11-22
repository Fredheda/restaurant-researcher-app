#!/usr/bin/env bash
set -uo pipefail
cd "$(dirname "$0")/../.." || exit 1

gate=scripts/audit-gate.mjs
fixtures=scripts/tests/fixtures/audit
work=$(mktemp -d "${TMPDIR:-/tmp}/audit-gate.XXXXXX")
trap 'rm -rf "$work"' EXIT

failures=0
pass() { echo "PASS  $1"; }
fail() { echo "FAIL  $1"; failures=$((failures + 1)); }

expect_exit() {
  local name=$1 want=$2 file=$3 text=$4 out code
  out=$(node "$gate" "$file" 2>&1)
  code=$?
  if [ "$code" -ne "$want" ] || ! grep -qF -- "$text" <<<"$out"; then
    fail "$name (exit $code)"
    echo "$out" | sed 's/^/      /'
    return
  fi
  pass "$name"
}

write_mutated_report() {
  node -e 'const fs = require("fs"); const r = JSON.parse(fs.readFileSync(process.argv[1], "utf8")); '"$1"'; fs.writeFileSync(process.argv[2], JSON.stringify(r));' \
    "$fixtures/accepted.json" "$work/case.json"
}

extra='{ name: "lodash", severity: "SEV", via: [], effects: [], nodes: ["node_modules/lodash"] }'

expect_exit "accepts exactly the owner-approved exception" 0 "$fixtures/accepted.json" "audit-gate: ok"

write_mutated_report "r.vulnerabilities.lodash = ${extra/SEV/high}"
expect_exit "fails on another high advisory" 1 "$work/case.json" "unexpected high or critical advisory on lodash"

write_mutated_report "r.vulnerabilities.lodash = ${extra/SEV/critical}"
expect_exit "fails on a critical advisory" 1 "$work/case.json" "unexpected high or critical advisory on lodash"

write_mutated_report 'r.vulnerabilities.zod.via[0].url = "https://github.com/advisories/GHSA-0000-0000-0000"'
expect_exit "fails on another advisory against zod" 1 "$work/case.json" "zod: unexpected advisory"

write_mutated_report 'r.vulnerabilities.zod.nodes.push("node_modules/other/node_modules/zod")'
expect_exit "fails on the advisory at an extra path" 1 "$work/case.json" "zod: unexpected path"

write_mutated_report 'r.vulnerabilities.zod.nodes.pop()'
expect_exit "fails when a listed path is gone" 1 "$work/case.json" "exception no longer needed"

write_mutated_report 'r.vulnerabilities = {}'
expect_exit "fails when the advisory is fixed" 1 "$work/case.json" "exception no longer needed"

write_mutated_report 'r.vulnerabilities["@copilotkit/core"].via.push({ source: 1, name: "@copilotkit/core", url: "https://github.com/advisories/GHSA-1111-1111-1111", severity: "high" })'
expect_exit "fails on an advisory of its own on a listed package" 1 "$work/case.json" "@copilotkit/core: unexpected advisory"

write_mutated_report 'delete r.vulnerabilities["@copilotkit/web-inspector"]'
expect_exit "fails when a listed package is gone" 1 "$work/case.json" "exception no longer needed"

expect_exit "fails on an npm error document" 1 "$fixtures/npm-error.json" "error document"

: >"$work/empty.json"
expect_exit "fails on an empty file" 1 "$work/empty.json" "unreadable or not JSON"

echo '{"auditReportVersion":2}' >"$work/keys.json"
expect_exit "fails without vulnerabilities and metadata" 1 "$work/keys.json" "lacks vulnerabilities or metadata"

[ "$failures" -eq 0 ] || { echo "$failures check(s) failed"; exit 1; }
echo "all audit-gate checks passed"
