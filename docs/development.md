# Development

Run the frontend from `frontend/` and the backend from `backend/`. The frontend does not call the backend yet: chat and place data come from built-in fixtures in `frontend/app/fixtures/places.ts`, and it needs no environment variables.

## Prerequisites

- Node 24 with npm 12.2.2. The Docker image and CI both use these versions (`npm install -g npm@12.2.2`).
- For the backend: Python 3.13 and Poetry 2.

## Backend

One FastAPI codebase and image for two apps. `APP_ROLE=api` serves `/api/searches` (Google Places search with FSA hygiene ratings, cached) and its events stream; `APP_ROLE=agent` serves the LangGraph agent over AG-UI at `/agent/restaurant_researcher`. Both serve `/health`.

```bash
cd backend
poetry install
poetry run pytest -q && poetry run ruff check . && poetry run ruff format --check . && poetry run pyright
```

The tests are offline: Google, the FSA API, the database and the model are fakes passed to `create_app`.

To run an app locally, put the variables in your shell (never in the repo). `backend/app/config.py` reads them once at startup and stops with the missing name.

| Variable | Needed by | Meaning |
|---|---|---|
| `APP_ROLE` | both | `api` or `agent` |
| `GOOGLE_PLACES_API_KEY` | both | Places API (New) key; the agent runs the search in-process |
| `OPENAI_API_KEY` | agent | model key |
| `OPENAI_MODEL` | agent, optional | model name; the default is in `config.py` |
| `SQL_SERVER`, `SQL_DATABASE` | optional | Azure SQL cache and user store; unset means in memory |
| `AZURE_CLIENT_ID` | deployed only | managed identity for SQL; unset means `az login` |
| `APP_ENV` | optional | `local` accepts requests without the Easy Auth headers as a fixed dev user; refused when `SQL_SERVER` is set |

```bash
APP_ROLE=api APP_ENV=local GOOGLE_PLACES_API_KEY=... poetry run uvicorn app.main:app --port 8000
curl -s localhost:8000/api/searches -H 'content-type: application/json' -d '{"query":"best ramen near Soho"}'
```

With the in-memory store, a search the agent ran is not visible to a separate local api process.

The schema scripts in `backend/sql/` are idempotent and applied by hand by the owner before the first deploy; the apps never run DDL.

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

`./scripts/ci-local.sh` runs the deploy-script tests, the backend checks and all of the above in CI order (plus `actionlint` when installed) and stops at the first failure.

GitHub Actions (`.github/workflows/ci.yml`) runs the same checks on every pull request and on nothing else. Which jobs run on a draft, which once the PR is ready, and the docs-only skip: `CLAUDE.md`, "Commands".

`.github/workflows/security.yml` adds secret scanning and workflow linting on every pull request, plus a weekly dependency audit (`npm-audit`). If the weekly audit fails, open the run under Actions > Security, then bump the vulnerable dependency; there is no PR to block, so the failure is the alert.

`next-env.d.ts` and `*.tsbuildinfo` are generated and gitignored.

## Making a change

1. Work on a branch (in this workspace, in your own git worktree).
2. Run `./scripts/ci-local.sh` until it is green.
3. Commit, push the branch and open a draft pull request (`gh pr create --draft`). When it is green locally, run `gh pr ready`: the build and the AI review (`.github/workflows/claude-review.yml`) then run on the PR.
4. After the PR is merged, the owner deploys with the **Deploy** button: see [deployment/](../deployment/README.md).
