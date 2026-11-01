# Development

Run everything from `frontend/` unless noted. There is no backend yet, and no environment variables are needed: chat and place data come from built-in fixtures in `frontend/app/fixtures/places.ts`.

## Prerequisites

- Node 24 with npm 12.0.2. The Docker image and CI both use these versions (`npm install -g npm@12.0.2`).

## Install and run

```bash
cd frontend
npm ci
npm run dev        # http://localhost:3000
```

Try asking for a place by name in the chat panel (for example "Fogo de Chão", defined in `frontend/app/fixtures/places.ts`). Names are matched without accents or punctuation. Anything not in the fixtures gets a "couldn't find that place" reply.

## Checks

```bash
npm test               # vitest, jsdom
npm run lint
npx tsc --noEmit
npm run build
npm run e2e            # Playwright (Chromium) against the production build; run `npm run build` first
```

A 360 px browser test (`e2e/mobile.spec.ts`) guards the phone layout.

The browser tests (`frontend/e2e/`) serve `.next/standalone` laid out as the Docker image does and need no network. First run: `npx playwright install chromium`. A failed run leaves a report in `frontend/playwright-report/`.

`./scripts/ci-local.sh` runs all of them in CI order (plus `actionlint` when installed) and stops at the first failure.

GitHub Actions (`.github/workflows/ci.yml`) runs the same checks on every pull request. A draft pull request runs only the light job (`checks`: tests, lint, type-check); the `build` job (build plus browser tests) and the AI review start when the PR is marked ready (`gh pr ready`). A docs-only pull request (only `*.md` files or files under `docs/`) skips both jobs. A merge to `main` starts no run.

`.github/workflows/security.yml` adds secret scanning and workflow linting on every pull request, plus a weekly dependency audit (`npm-audit`). If the weekly audit fails, open the run under Actions > Security, then bump the vulnerable dependency; there is no PR to block, so the failure is the alert.

`next-env.d.ts` and `*.tsbuildinfo` are generated and gitignored.

## Making a change

1. Work on a branch (in this workspace, in your own git worktree).
2. Run `./scripts/ci-local.sh` until it is green.
3. Commit, push the branch and open a draft pull request (`gh pr create --draft`). When it is green locally, run `gh pr ready`: the build and the AI review (`.github/workflows/claude-review.yml`) then run on the PR.
4. After the PR is merged, the owner deploys with the **Deploy** button: see [deployment/](../deployment/README.md).
