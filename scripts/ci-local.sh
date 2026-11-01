#!/usr/bin/env bash
# Run every check .github/workflows/ci.yml runs, in the same order, and stop at
# the first failure. Run it green before `gh pr ready`.
#
# Usage: ./scripts/ci-local.sh
set -euo pipefail
cd "$(dirname "$0")/.."

./scripts/tests/test-deploy-scripts.sh

cd frontend

# CI installs npm 12.0.2 on Node 24 (see frontend/Dockerfile).
echo "node $(node -v), npm $(npm -v) (CI: Node 24, npm 12.0.2)"

npm ci --prefer-offline
npm test
npm run lint
npx tsc --noEmit
npm run build
# Browser tests against the production build; installs Chromium if missing.
npx playwright install chromium
npm run e2e

# security.yml's workflow-lint blocks PRs too; run it when actionlint is installed.
if command -v actionlint >/dev/null 2>&1; then
  (cd .. && actionlint)
else
  echo "actionlint not installed: skipped (CI runs it in security.yml)"
fi

echo "ci-local: all checks passed"
