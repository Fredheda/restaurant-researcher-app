# Frontend F6b-1: react-core, scoped zod config, audit gate

Ticket: RR-65 (umbrella RR-62, RR-43). Repo: `restaurant-researcher-app`. Tier: non-trivial, specialist approval.
Spec: `docs/specs/2026-11-22-frontend-f6b-copilotkit-client.md`. Status: done (PR #61).
Diagram source: `docs/plans/diagrams/2026-11-22-frontend-f6b1-react-core-audit-gate.mmd`.

## TL;DR

- One PR. Adds `@copilotkit/react-core` 1.85.0 (installed, unused here), replaces the global zod 4 override with two scoped overrides, adds `scripts/audit-gate.mjs` and its offline test, and switches the weekly `npm-audit` job to the gate.
- The gate accepts exactly GHSA-mrhx-c7xc-m3w5 on the two zod 3.25.76 paths and five named packages, fails on any other high or critical, fails when the exception is no longer needed, and fails closed on non-JSON, an npm error document, an empty file or a report without `vulnerabilities` and `metadata`.
- The accepted advisory and its owner decision live on the ticket (RR-62); repo text states only what the gate accepts, that it expires, and how to remove it. F6b-2 carries the test that keeps the condition true.
- Touches `ci.yml` and `security.yml` (owner merge). Never in parallel with RR-63 or RR-64.
- Owner actions: merge the PR; later dismiss the GitHub zod alert with a reason (his action in the UI).
- Cost: none. Estimated size: 12 files (one lockfile, one fixture folder), under 400 changed lines without lockfile and fixtures.

## Cost

None. No Azure resource, no paid API. The audit job runs weekly on a GitHub-hosted runner.

## Facts the plan rests on (checked 2026-11-22)

- Recorded audit of the scoped config (scratch copy of the repo's manifest and lockfile, `react-core` 1.85.0 added, scoped overrides, `npm install --package-lock-only`, `npm audit --omit=dev --json`): exit 1, report keys `auditReportVersion`, `vulnerabilities`, `metadata`; 13 findings (6 low, 1 moderate, 6 high). The six high entries are `zod` (advisory `https://github.com/advisories/GHSA-mrhx-c7xc-m3w5`, `nodes` exactly `node_modules/@a2ui/web_core/node_modules/zod` and `node_modules/@copilotkit/a2ui-renderer/node_modules/zod`) and its five propagated packages: `@a2ui/web_core`, `@copilotkit/a2ui-renderer`, `@copilotkit/core`, `@copilotkit/react-core`, `@copilotkit/web-inspector`.
- `npm audit --json` with no lockfile answers `{"error":{"code":"ENOLOCK",...}}` and exits 1: a real npm error document, used as a fixture.
- No file in `frontend/` imports `zod`, so removing the direct dependency breaks no import.
- The `checks` job has `setup-node` before the last steps; `scripts/ci-local.sh` runs from the repo root.
- Existing guard `scripts/tests/test-supply-chain.sh` does not mention zod or overrides, so it needs no change.

## File map

| File | Change |
|---|---|
| `scripts/tests/fixtures/audit/accepted.json` | new: trimmed recorded audit (six high, one moderate, one low entry, metadata) |
| `scripts/tests/fixtures/audit/npm-error.json` | new: recorded npm error document |
| `scripts/tests/test-audit-gate.sh` | new: offline gate tests |
| `scripts/audit-gate.mjs` | new: the gate |
| `frontend/package.json`, `frontend/package-lock.json` | react-core added, `zod` dependency and global override removed, scoped overrides added |
| `.github/workflows/security.yml` | weekly job runs the gate |
| `.github/workflows/ci.yml` | `checks` job runs the gate test |
| `scripts/ci-local.sh` | runs the gate test |
| `docs/development.md`, `CLAUDE.md` | overrides and audit text |

## Tasks

Work in the standing pilot worktree, one branch: `git fetch origin`, then `git switch -c rr-65-react-core-audit-gate --no-track origin/main`. Bare single commands, one per call.

### Task 1: fixtures and the failing test (red)

- [ ] Create `scripts/tests/fixtures/audit/npm-error.json`:

```json
{
  "error": {
    "code": "ENOLOCK",
    "summary": "This command requires an existing lockfile.",
    "detail": "Try creating one first with: npm i --package-lock-only\nOriginal error: loadVirtual requires existing package-lock.json file"
  }
}
```

- [ ] Create `scripts/tests/fixtures/audit/accepted.json`:

```json
{
  "auditReportVersion": 2,
  "vulnerabilities": {
    "@a2ui/web_core": {
      "name": "@a2ui/web_core",
      "severity": "high",
      "isDirect": false,
      "via": ["zod"],
      "effects": ["@copilotkit/a2ui-renderer", "@copilotkit/core", "@copilotkit/react-core"],
      "range": "*",
      "nodes": ["node_modules/@a2ui/web_core"],
      "fixAvailable": { "name": "@copilotkit/react-core", "version": "1.54.1", "isSemVerMajor": true }
    },
    "@copilotkit/a2ui-renderer": {
      "name": "@copilotkit/a2ui-renderer",
      "severity": "high",
      "isDirect": false,
      "via": ["@a2ui/web_core", "zod"],
      "effects": ["@copilotkit/react-core"],
      "range": "*",
      "nodes": ["node_modules/@copilotkit/a2ui-renderer"],
      "fixAvailable": { "name": "@copilotkit/react-core", "version": "1.54.1", "isSemVerMajor": true }
    },
    "@copilotkit/core": {
      "name": "@copilotkit/core",
      "severity": "high",
      "isDirect": false,
      "via": ["@a2ui/web_core"],
      "effects": ["@copilotkit/react-core", "@copilotkit/web-inspector"],
      "range": "1.84.2-canary.1793807121 - 2.0.0-rc.42",
      "nodes": ["node_modules/@copilotkit/core"],
      "fixAvailable": { "name": "@copilotkit/react-core", "version": "1.54.1", "isSemVerMajor": true }
    },
    "@copilotkit/react-core": {
      "name": "@copilotkit/react-core",
      "severity": "high",
      "isDirect": true,
      "via": ["@a2ui/web_core", "@copilotkit/a2ui-renderer", "@copilotkit/core", "@copilotkit/web-inspector", "katex", "streamdown"],
      "effects": [],
      "range": "<=0.0.0-tyler-v2-x-fixes-20260123210508 || 1.51.3-next.0 - 1.51.3-next.5 || 1.55.0-next.7 - 2.0.0-rc.42",
      "nodes": ["node_modules/@copilotkit/react-core"],
      "fixAvailable": { "name": "@copilotkit/react-core", "version": "1.54.1", "isSemVerMajor": true }
    },
    "@copilotkit/web-inspector": {
      "name": "@copilotkit/web-inspector",
      "severity": "high",
      "isDirect": false,
      "via": ["@copilotkit/core"],
      "effects": ["@copilotkit/react-core"],
      "range": "1.57.2 || 1.84.2-canary.1793807121 - 2.0.0-rc.42",
      "nodes": ["node_modules/@copilotkit/web-inspector"],
      "fixAvailable": { "name": "@copilotkit/react-core", "version": "1.54.1", "isSemVerMajor": true }
    },
    "zod": {
      "name": "zod",
      "severity": "high",
      "isDirect": false,
      "via": [
        {
          "source": 1243066,
          "name": "zod",
          "dependency": "zod",
          "title": "Zod can exhaust memory while validating oversized constrained collections",
          "url": "https://github.com/advisories/GHSA-mrhx-c7xc-m3w5",
          "severity": "high",
          "cwe": ["CWE-770"],
          "cvss": { "score": 7.5, "vectorString": "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:H" },
          "range": "<4.6.6"
        }
      ],
      "effects": ["@a2ui/web_core", "@copilotkit/a2ui-renderer"],
      "range": "<4.6.6",
      "nodes": [
        "node_modules/@a2ui/web_core/node_modules/zod",
        "node_modules/@copilotkit/a2ui-renderer/node_modules/zod"
      ],
      "fixAvailable": { "name": "@copilotkit/react-core", "version": "1.54.1", "isSemVerMajor": true }
    },
    "katex": {
      "name": "katex",
      "severity": "low",
      "isDirect": false,
      "via": [
        {
          "source": 1241206,
          "name": "katex",
          "dependency": "katex",
          "title": "KaTeX: Existing prototype pollution can bypass trust restrictions",
          "severity": "low",
          "range": "<0.16.50"
        }
      ],
      "effects": [],
      "range": "<0.16.50",
      "nodes": ["node_modules/katex"],
      "fixAvailable": true
    },
    "@hono/node-server": {
      "name": "@hono/node-server",
      "severity": "moderate",
      "isDirect": false,
      "via": [
        {
          "source": 1243661,
          "name": "@hono/node-server",
          "dependency": "@hono/node-server",
          "title": "@hono/node-server: serveStatic decodes the request path a second time",
          "severity": "moderate",
          "range": "<2.0.0"
        }
      ],
      "effects": [],
      "range": "<2.0.0",
      "nodes": ["node_modules/@hono/node-server"],
      "fixAvailable": true
    }
  },
  "metadata": {
    "vulnerabilities": { "info": 0, "low": 6, "moderate": 1, "high": 6, "critical": 0, "total": 13 },
    "dependencies": { "prod": 1171, "dev": 489, "optional": 147, "peer": 17, "peerOptional": 0, "total": 1707 }
  }
}
```

- [ ] Create `scripts/tests/test-audit-gate.sh` and make it executable (`chmod +x`):

```bash
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
```

- [ ] Run (expect red: the gate does not exist, so every case fails with a "Cannot find module" message instead of the expected text; 12 FAIL lines and `12 check(s) failed`):

```bash
./scripts/tests/test-audit-gate.sh
```

- [ ] Commit tests first, then push the branch and open the draft so the red state is on the draft's CI (the `checks` job runs the test only after Task 4; the red run is local until then, and the PR description quotes the local output): `git add scripts/tests` then `git commit -m "Audit gate: fixtures and failing tests"` (two bare calls).

### Task 2: the gate (green)

- [ ] Create `scripts/audit-gate.mjs`:

```js
import { readFileSync } from "node:fs";

const ADVISORY = "https://github.com/advisories/GHSA-mrhx-c7xc-m3w5";
const ZOD_PATHS = [
  "node_modules/@a2ui/web_core/node_modules/zod",
  "node_modules/@copilotkit/a2ui-renderer/node_modules/zod",
];
const PROPAGATED = [
  "@a2ui/web_core",
  "@copilotkit/a2ui-renderer",
  "@copilotkit/core",
  "@copilotkit/react-core",
  "@copilotkit/web-inspector",
];
const BLOCKING = new Set(["high", "critical"]);
const STALE = "exception no longer needed: remove it from scripts/audit-gate.mjs";

const isObject = (value) => typeof value === "object" && value !== null && !Array.isArray(value);

const stop = (problems) => {
  for (const problem of problems) console.error(`audit-gate: ${problem}`);
  process.exit(1);
};

let report;
try {
  report = JSON.parse(readFileSync(process.argv[2], "utf8"));
} catch {
  stop(["audit input is unreadable or not JSON"]);
}
if (!isObject(report)) stop(["audit input is not a JSON object"]);
if ("error" in report) stop(["audit returned an error document (registry or network failure)"]);
if (!isObject(report.vulnerabilities) || !isObject(report.metadata)) {
  stop(["audit report lacks vulnerabilities or metadata"]);
}

const entries = report.vulnerabilities;
const blocking = Object.keys(entries).filter((name) => BLOCKING.has(entries[name]?.severity));
const accepted = new Set(["zod", ...PROPAGATED]);
const problems = blocking
  .filter((name) => !accepted.has(name))
  .map((name) => `unexpected high or critical advisory on ${name}`);

const advisories = Array.isArray(entries.zod?.via) ? entries.zod.via.filter(isObject) : [];
const nodes = Array.isArray(entries.zod?.nodes) ? entries.zod.nodes : [];
for (const advisory of advisories) {
  if (advisory.url !== ADVISORY) problems.push(`zod: unexpected advisory ${advisory.url}`);
}
for (const path of nodes) {
  if (!ZOD_PATHS.includes(path)) problems.push(`zod: unexpected path ${path}`);
}
for (const name of PROPAGATED) {
  const via = Array.isArray(entries[name]?.via) ? entries[name].via : [];
  for (const advisory of via.filter(isObject)) {
    if (BLOCKING.has(advisory.severity)) problems.push(`${name}: unexpected advisory ${advisory.url}`);
  }
}

const stale =
  !blocking.includes("zod") ||
  !advisories.some((advisory) => advisory.url === ADVISORY) ||
  !ZOD_PATHS.every((path) => nodes.includes(path)) ||
  !PROPAGATED.every((name) => blocking.includes(name));
if (stale) problems.push(STALE);

if (problems.length > 0) stop(problems);
console.log(`audit-gate: ok (accepted ${ADVISORY} on ${ZOD_PATHS.length} paths)`);
```

- [ ] Run, expect 12 PASS and `all audit-gate checks passed`:

```bash
./scripts/tests/test-audit-gate.sh
```

- [ ] Planted bugs, each must turn at least one case red, then revert: drop `critical` from `BLOCKING`; delete the `STALE` check for `PROPAGATED`; compare only the package names and not `ZOD_PATHS`; return exit 0 on an `error` key; delete the loop over `PROPAGATED` advisories.
- [ ] Commit: `git add scripts/audit-gate.mjs` then `git commit -m "Audit gate: accept one advisory on named paths, fail closed"`.

### Task 3: dependencies (the scoped zod config)

- [ ] Edit `frontend/package.json`: in `dependencies` add `"@copilotkit/react-core": "1.85.0",` after `"@ag-ui/client": "1.0.2",` and delete the line `"zod": "4.6.7"` (and the comma after `"react-dom": "19.3.1"`); replace the `overrides` block with:

```json
  "overrides": {
    "iconv-lite": "0.7.3",
    "@copilotkit/runtime": {
      "zod": "4.6.7"
    },
    "@a2ui/web_core": {
      "zod": "3.25.76"
    },
    "undici": "6.29.1",
    "graphql-scalars": "2.0.1"
  }
```

- [ ] Resolve and install (the 14-day cooldown applies, no flags):

```bash
npm install
```

Run it with `frontend/` as the working directory. Expect no error; `package-lock.json` changes.

- [ ] Check the tree: `npm ls zod --omit=dev --all` shows `zod@4.6.7` under `@copilotkit/runtime` and `zod@3.25.76` only under `@a2ui/web_core` and `@copilotkit/a2ui-renderer`.
- [ ] Real-behaviour check of the gate on the real tree: `npm audit --omit=dev --json > "$TMPDIR/audit.json"` (exit 1 is expected), then `node ../scripts/audit-gate.mjs "$TMPDIR/audit.json"` prints `audit-gate: ok (...)` and exits 0. A bare call each, no pipe. If it fails, the lockfile resolved differently from the recording: stop and report the printed problems (do not widen the gate).
- [ ] Run `npm test`, `npm run lint`, `npx tsc --noEmit`, `npm run build`: all green (react-core is installed and unused; a Chromium e2e run is on CI).
- [ ] Commit: `git add frontend/package.json frontend/package-lock.json` then `git commit -m "Add react-core with scoped zod overrides"`.

### Task 4: workflows and local script

- [ ] `.github/workflows/security.yml`: in `on:` add `workflow_dispatch:` after `pull_request:`; change the `npm-audit` job's `if: github.event_name == 'schedule'` to `if: github.event_name != 'pull_request'` (the PR-only `workflow-lint` job keeps its `if`); replace the last step of the `npm-audit` job, `      - run: npm audit --omit=dev --audit-level=high`, with:

```yaml
      - name: Audit
        run: |
          npm audit --omit=dev --json > "$RUNNER_TEMP/audit.json" || true
          node ../scripts/audit-gate.mjs "$RUNNER_TEMP/audit.json"
```

  The `|| true` covers only `npm audit`'s exit code (it exits 1 whenever it finds anything); the gate decides, and it fails on every unreadable or incomplete report.
- [ ] `.github/workflows/ci.yml`: after the last step of the `checks` job (`      - run: npx tsc --noEmit`) add:

```yaml
      - name: Audit gate tests
        working-directory: .
        run: ./scripts/tests/test-audit-gate.sh
```

- [ ] `scripts/ci-local.sh`: after the line `./scripts/tests/test-supply-chain.sh` add `./scripts/tests/test-audit-gate.sh`.
- [ ] Run `actionlint` from the repo root (installed? if not, CI runs it) and `./scripts/tests/test-supply-chain.sh`, `./scripts/tests/test-audit-gate.sh`: green.
- [ ] Commit: `git add .github scripts/ci-local.sh` then `git commit -m "Run the audit gate weekly and its tests in CI"`.

### Task 5: docs

- [ ] `docs/development.md`, the `CopilotKit overrides` bullet in "Dependencies": replace the whole bullet with:

```markdown
- **CopilotKit overrides:** `frontend/package.json` pins `zod` 4.6.7 under `@copilotkit/runtime` and 3.25.76 under `@a2ui/web_core`, `undici` to 6.29.1 (a pulled-in 5.29.0 has many advisories fixed in 6.x) and `graphql-scalars` to 2.0.1 (GHSA-x8rm-f576-gq67). Remove an entry when CopilotKit's own ranges clear the advisory: delete it, run `npm install`, then the audit check below.
- **Accepted advisory:** `scripts/audit-gate.mjs` accepts GHSA-mrhx-c7xc-m3w5 (zod below 4.6.6) on `node_modules/@a2ui/web_core/node_modules/zod` and `node_modules/@copilotkit/a2ui-renderer/node_modules/zod`, and on the five packages it propagates to, by owner decision. It fails on any other high or critical advisory, including one on a propagated package, and fails when the exception is no longer needed: then delete the constants in the script and this bullet.
- **Audit check:** `npm audit --omit=dev --json > /tmp/audit.json; node scripts/audit-gate.mjs /tmp/audit.json` from `frontend/`'s parent (`./scripts/tests/test-audit-gate.sh` tests the gate offline).
```

- [ ] `docs/development.md`, the weekly audit sentence (line starting "`.github/workflows/security.yml` adds secret scanning"): replace `If the weekly audit fails, open the run under Actions > Security, then bump the vulnerable dependency; there is no PR to block, so the failure is the alert.` with `The weekly audit runs `scripts/audit-gate.mjs`. If it fails, open the run under Actions > Security: bump the vulnerable dependency, or, when it says the exception is no longer needed, remove the exception; there is no PR to block, so the failure is the alert.`
- [ ] `CLAUDE.md`, the `security.yml` bullet: replace `\`npm-audit\` runs weekly only and its failure is the alert (\`docs/development.md\`)` with `\`npm-audit\` runs weekly only through \`scripts/audit-gate.mjs\` (one accepted advisory, \`docs/development.md\`) and its failure is the alert`, and `cd frontend && npm audit --omit=dev --audit-level=high` with `./scripts/tests/test-audit-gate.sh`.
- [ ] Review every other doc this change touches (`README.md`, `deployment/README.md`, `AGENTS.md` if present on `main` by then) for the old `--audit-level=high` command and `zod` override text; fix or report none.
- [ ] Commit: `git add docs CLAUDE.md` then `git commit -m "Document the accepted advisory and the audit gate"`.

### Task 6: cleanup commit (PAIR-46, separate commit)

In every file the PR edits, delete comments that restate code, narrate history or point at tickets; keep only a constraint, a security reason or a workaround with its source; target at least 70 percent fewer comment lines per file.

- [ ] `.github/workflows/security.yml`: delete the header comment block (the two paragraphs before `on:`), the `concurrency` comment, the `Blocks the PR` comments, the `PRs scan only the commits they add` comment and the `Weekly only` comment. Keep: `# Runs the pinned gitleaks image directly: the gitleaks action needs a license key for organization repos.` (constraint), `# Match frontend/Dockerfile.` (constraint). The `# v7.0.1`-style pin comments stay (the supply-chain guard requires them).
- [ ] `.github/workflows/ci.yml`: delete the header paragraph (lines 3 to 9), the `Light:` and `Heavy:` job comments and the Playwright comment. Keep: `# Match frontend/Dockerfile.`, `# The checkout is the PR merge commit; its first parent is the base tip.` (explains `HEAD^1`) and the pin comments.
- [ ] `scripts/ci-local.sh`: delete the header comment's first paragraph and the comments above the backend block, the `CI installs npm` line, the browser line and the `security.yml's workflow-lint` line; keep `# Usage: ./scripts/ci-local.sh`.
- [ ] `docs/development.md`, `CLAUDE.md`: say each thing once; cut stale text found while editing (report anything larger than ten lines to the coordinator as its own ticket).
- [ ] Redundant tests: none removed (no test file edited); say so in the PR.
- [ ] Verify nothing else broke: `./scripts/tests/test-supply-chain.sh`, `./scripts/tests/test-audit-gate.sh`, `actionlint`. Commit: `git add -A` is not used; add the named files, `git commit -m "Remove comments that restate the code"`.

### Task 7: audit, draft PR, CI, hand-over

- [ ] Run skill `auditing-branch-changes`; fix findings.
- [ ] `./scripts/ci-local.sh` green (Chromium e2e does not run in the sandbox: say so; CI runs it).
- [ ] `git push -u origin rr-65-react-core-audit-gate` (own call, main checkout as working directory), then `gh pr create --draft --head rr-65-react-core-audit-gate --base main --title "Add react-core with an audit gate for one accepted advisory" --body-file <file>`; body: what and why, `Comments: kept the gitleaks license constraint, the Dockerfile match note, the HEAD^1 note and the action pin comments; every other comment in the edited files removed`, no mention of Claude Code, a link to the ticket RR-65, no deploy note (no behaviour change).
- [ ] After the draft's own CI run has finished: `gh pr ready`, `gh pr checks <n> --watch --interval 60 --fail-fast` as a background task, confirm every job ran, fix every review comment in one batched push.
- [ ] Hand over the PR URL to the coordinator; comment on RR-65 and RR-62; ticket to `In Progress` while open, `Done` after the owner's merge and cleanup. Owner action after the merge: dismiss the GitHub zod alert in the UI as tolerable risk, reason text from RR-62 (his decision).

## Owner-runnable gates

- After merge: `gh workflow run security.yml --ref main -R Fredheda/restaurant-researcher-app` (bare call), then `gh run watch` on that run: job `npm-audit` must be green and print `audit-gate: ok`. The Monday run repeats it.
- Locally, from the repo root: `./scripts/tests/test-audit-gate.sh` prints 12 PASS lines.

## Self-check against the spec

- Gate fails closed: tests for non-JSON (empty file), `error` key (real ENOLOCK document), missing `vulnerabilities` and `metadata`; the job writes the audit to a file and ignores only `npm audit`'s exit code. Covered.
- Exception names advisory, packages and exact paths; fewer or extra paths and packages fail. Covered.
- Tests offline, recorded JSON, never `npm` or the registry. Covered.
- Specialist edits: an advisory of its own on a propagated package fails (case 8, planted bug); `workflow_dispatch` added. Covered.
- Required edit 2 (no third-party requests, inspector off, browser assertion) belongs to F6b-2; `react-core` is unused here.
- `react-core` brings `@copilotkit/web-inspector`: unused in this PR, so no inspector code runs.
- Not in this PR: provider, chat, stub removal, seeded card, a2ui-off test (F6b-2).

## Open points for the reviewers

1. The red state of Task 1 is local only (the CI `checks` step arrives in Task 4); the PR description quotes the output.
2. `docs/development.md` sentence order: the `Audit check` bullet uses `/tmp/audit.json`; fine for a laptop, no secret in it.
