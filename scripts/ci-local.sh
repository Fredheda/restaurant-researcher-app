#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

./scripts/tests/test-deploy-scripts.sh
./scripts/tests/test-supply-chain.sh
./scripts/tests/test-audit-gate.sh

if [ -f backend/pyproject.toml ]; then
  (
    cd backend
    poetry install --no-interaction --no-ansi
    poetry run pytest -q
    poetry run ruff check .
    poetry run ruff format --check .
    poetry run pyright
  )
else
  echo "backend: no pyproject.toml, skipped"
fi

cd frontend

echo "node $(node -v), npm $(npm -v) (CI: Node 26, npm 12.2.2)"

npm ci --prefer-offline
npm test
npm run lint
npx tsc --noEmit
npm run build
npx playwright install chromium
npm run e2e

if command -v actionlint >/dev/null 2>&1; then
  (cd .. && actionlint)
else
  echo "actionlint not installed: skipped (CI runs it in security.yml)"
fi

echo "ci-local: all checks passed"
