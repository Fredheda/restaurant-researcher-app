# CLAUDE.md

Repo-specific facts for Claude Code. The workspace `CLAUDE.md` (`../CLAUDE.md`) owns everything else: response style, git and worktrees, ways of working (tickets and tiers, production deploys, PR size, test first, the PR loop), tooling, Jira, specs and plans. Keep this file true.

PR titles and descriptions never mention Claude Code. `./scripts/ci-local.sh` is this repo's local CI script: green before `gh pr ready`.

## What this is

Website for the `restaurant-researcher` skill: venue research as a card board with a chat interface. Public repo; the deployed app (restaurants.frederikheda.com) is private behind Entra Easy Auth. Keep emails, tenant, subscription and client IDs out of the repo, PR text and logs.

- `frontend/` (Next.js 16, React 19, Tailwind 4): still serves stub chat and fixture places (`app/fixtures/places.ts`); "Ink and paper" theme, tokens in `app/globals.css`; mobile-first from 360 px. `app/types.ts` (`PlaceResult`) is the contract the backend fills.
- `backend/` (FastAPI, Poetry, Python 3.13): one codebase and image for two apps, picked by `APP_ROLE`. `api` serves `/api/searches` (Google Places plus FSA hygiene ratings, cached) and its events stream; `agent` serves a LangGraph agent over AG-UI at `/agent/restaurant_researcher`. Both serve `/health`. `app.main:create_app(role, services, graph)` is the factory; `app_from_env()` builds it from the environment. Startup calls no remote service. Not wired to the frontend yet.
- `infra/` (Bicep), `scripts/` (build, deploy, access), `deployment/` (how to run it).

Docs: overview in `README.md`; local setup, env vars and checks in `docs/development.md`; deploy, rollback, auth and user approval in `deployment/README.md`; credential expiry in `deployment/expirations.md`.

## Commands

Details in `docs/development.md`.

```bash
cd frontend && npm ci && npm run dev                      # http://localhost:3000
cd frontend && npm test && npm run lint && npx tsc --noEmit && npm run build && npm run e2e
cd backend && poetry install && poetry run pytest -q && poetry run ruff check . && poetry run ruff format --check . && poetry run pyright
./scripts/tests/test-deploy-scripts.sh                    # deploy scripts, fake az
./scripts/ci-local.sh                                     # all of the above in CI order
```

- Node 24 with npm 12.0.2, in CI and in `frontend/Dockerfile`. `next-env.d.ts` and `*.tsbuildinfo` are generated and gitignored.
- CI (`.github/workflows/ci.yml`) runs on pull requests only, never on a push to `main`. A draft PR runs the light jobs (`changes`, `backend`, `checks`: deploy-script tests, vitest, lint, `tsc`); `build` (production build plus the browser tests) and the AI review run once the PR is ready. A docs-only PR (`*.md` or `docs/`) skips all three. CI never builds an image.
- Tests: backend tests are offline, every external client is a fake passed to `create_app`. Browser tests (`frontend/e2e/`) run against the production build with no network; every locator lives in `frontend/e2e/selectors.ts` and ESLint rejects `.locator()` in specs. A new test must catch a bug no other test catches.

## Environment variables

Backend only; the frontend reads none. Which role needs which, meaning and defaults: `docs/development.md`.

- `APP_ROLE`, `GOOGLE_PLACES_API_KEY`, `OPENAI_API_KEY`, `OPENAI_MODEL`, `SQL_SERVER`, `SQL_DATABASE`, `AZURE_CLIENT_ID`, `APP_ENV`.

## Deployment

Code deploys with the manual **Deploy** workflow (`main` only, a full SHA or the head of `main`, rollback = an older SHA); `./scripts/ship.sh` is the laptop fallback and refuses a dirty tree; `./infra/deploy.sh` deploys infra (laptop only). A merge runs nothing. Every run waits in GitHub for the owner's approval (`production` requires him as reviewer). How to run, by what changed: `deployment/README.md`.

## Security, Dependabot, review

- `.github/workflows/security.yml`: `gitleaks` and `workflow-lint` block every PR; `npm-audit` runs weekly only and its failure is the alert (`docs/development.md`). No CodeQL and no backend audit yet. Locally: `gitleaks git . --redact`, `actionlint`, `cd frontend && npm audit --omit=dev --audit-level=high`.
- `.github/dependabot.yml`: monthly, grouped minor and patch PRs per ecosystem (npm, pip, GitHub Actions, both Dockerfiles), label `dependencies`, 14-day cooldown. npm, pip, Node-image and Python-image majors and the Python minor are ignored and done by hand; GitHub Actions majors arrive as separate PRs. Security updates come from the repo settings and open at once.
- `.github/workflows/claude-review.yml`: comment-only AI review on every push to a ready PR (security first, then a documentation check), never on drafts or Dependabot PRs; the owner can request one with `@claude`. Token expiry: `deployment/expirations.md`.

## Gotchas

- The backend apps are not deployed yet: the deploy scripts know them and skip them until infra creates them. `deployment/README.md` describes the web app; the backend apps get their own section when their infra lands.
- The agent id `restaurant_researcher` (`AGENT_NAME` in `backend/app/agent/server.py`) must be spelled the same in the web app's CopilotKit runtime route and provider `agent` prop once the frontend is wired; neither exists yet.
- `backend/sql/` schema scripts are idempotent and applied by hand by the owner; the apps never run DDL.
