# CLAUDE.md

Repo facts only, plus the Ownership note below (the GitHub review reads only this file). Everything else (style, git, worktrees, tickets, deploy rules, PR loop, tooling, Jira, plans): workspace `../CLAUDE.md`.

PR titles and descriptions never mention Claude Code. `./scripts/ci-local.sh` is the local CI script: green before `gh pr ready`.

PR size (workspace rule "Tickets, tiers and PR size"): one concern per PR, about 20 changed files and under 5000 changed lines (lockfiles, fixtures and generated files excluded); split bigger work into one ticket per PR before coding.

## Ownership

You own this codebase and project. You are the main contributor and maintainer, so the accountability and responsibility for keeping the codebase maintainable, free of bugs, free of duplicated code, legible, not littered with unnecessary comments, and otherwise to a high standard is yours. Be proactive in fixing tech debt, keeping the code secure, and keeping everything to a very high standard. You are evaluated on project and codebase security, code quality and hygiene.

## What this is

Website for the `restaurant-researcher` skill: venue research as a card board with a chat interface. Public repo; the deployed app (restaurants.frederikheda.com) is private behind Entra Easy Auth. Keep emails, tenant, subscription and client IDs out of repo, PR text and logs.

- `frontend/` (Next.js 16, React 19, Tailwind 4): still serves stub chat and fixture places (`app/fixtures/places.ts`); "Ink and paper" theme, tokens in `app/globals.css`; system font stacks only, no bundled or hosted fonts (ESLint rejects `next/font`); mobile-first from 360 px. `app/types.ts` (`PlaceResult`) is the contract the backend fills. `app/api/[...path]/route.ts` is the narrow `/api/*` proxy to the api app (Easy Auth principal headers only); the header search bar (`app/search-bar.tsx`) calls it, the chat still answers from fixtures.
- `backend/` (FastAPI, Poetry, Python 3.13): one codebase and image for two apps, picked by `APP_ROLE`. `api` serves `/api/searches` (Google Places plus FSA hygiene ratings, cached) and its events stream; `agent` serves a LangGraph agent over AG-UI at `/agent/restaurant_researcher`. Both serve `/health`. `app.main:create_app(role, services, graph)` is the factory; `app_from_env()` builds it from the environment. Startup calls no remote service. Only the header search is wired to the frontend.
- `infra/` (Bicep), `scripts/` (build, deploy, access), `deployment/` (how to run it).

Docs: overview in `README.md`; local setup, env vars and checks in `docs/development.md`; deploy, rollback, auth and user approval in `deployment/README.md`; credential expiry in `deployment/expirations.md`.

## Commands

Details in `docs/development.md`.

```bash
cd frontend && npm ci && npm run dev                      # http://localhost:3000
cd frontend && npm test && npm run lint && npx tsc --noEmit && npm run build && npm run e2e
cd backend && poetry install && poetry run pytest -q && poetry run ruff check . && poetry run ruff format --check . && poetry run pyright
./scripts/tests/test-deploy-scripts.sh                    # deploy scripts, fake az
./scripts/tests/test-supply-chain.sh                      # supply-chain guard
./scripts/ci-local.sh                                     # all of the above in CI order
```

- Node 24 with npm 12.2.2, in CI and in `frontend/Dockerfile`. `next-env.d.ts` and `*.tsbuildinfo` are generated and gitignored.
- CI (`.github/workflows/ci.yml`) runs on pull requests only, never on a push to `main`. A draft PR runs the light jobs (`changes`, `backend`, `checks`: deploy-script tests, supply-chain guard, vitest, lint, `tsc`); `build` (production build plus the browser tests) and the AI review run once the PR is ready. A docs-only PR (`*.md` or `docs/`) skips all three. CI never builds an image.
- **Merging:** the owner merges, except the bot and docs classes in the workspace `CLAUDE.md` (Git), which the coordinator merges.
- Tests: backend tests are offline, every external client is a fake passed to `create_app`. Browser tests (`frontend/e2e/`) run against the production build with no network and start a fake api (`frontend/e2e/fake-api.mjs`): the web server under test gets `API_URL` pointing at it and the tests send the sign-in header, so the proxy's principal path is the one exercised; every locator lives in `frontend/e2e/selectors.ts` and ESLint rejects `.locator()` in specs. A new test must catch a bug no other test catches.

## Environment variables

Which role needs which, meaning and defaults: `docs/development.md`. The frontend reads two, at runtime: `API_URL` (internal https origin of the api app, a path is ignored; unset means `/api/*` answers 503) and, for local runs only, `ALLOW_ANONYMOUS`.

- Backend: `APP_ROLE`, `GOOGLE_PLACES_API_KEY`, `OPENAI_API_KEY`, `OPENAI_MODEL`, `SQL_SERVER`, `SQL_DATABASE`, `AZURE_CLIENT_ID`, `APP_ENV`. Frontend: `API_URL`, `ALLOW_ANONYMOUS`.

## Deployment

Code deploys with the manual **Deploy** workflow (`main` only; full SHA or head of `main`; rollback = older SHA). `./scripts/ship.sh` is the laptop fallback and refuses a dirty tree. `./infra/deploy.sh` deploys infra (laptop only). A merge runs nothing. Every run waits for approval from the `production` reviewer. How to run: `deployment/README.md`.

## Security, Dependabot, review

- `.github/workflows/security.yml`: `gitleaks` and `workflow-lint` block every PR; `npm-audit` runs weekly only and its failure is the alert (`docs/development.md`). No CodeQL and no backend audit yet. Locally: `gitleaks git . --redact`, `actionlint`, `cd frontend && npm audit --omit=dev --audit-level=high`.
- `.github/dependabot.yml`: monthly, grouped minor and patch PRs per ecosystem (npm, pip, GitHub Actions, both Dockerfiles), label `dependencies`, 14-day cooldown. npm, pip, Node-image and Python-image majors and the Python minor are ignored and done by hand; GitHub Actions majors arrive as separate PRs. Security updates come from the repo settings and open at once.
- Dependencies: 14-day install cooldown, exact Poetry and pip pins, actions pinned by commit, Docker images pinned by digest; guarded by `scripts/tests/test-supply-chain.sh` (`docs/development.md`, "Dependencies").
- `.github/workflows/claude-review.yml`: comment-only AI review on every push to a ready PR (security first, then a documentation check and an advisory PR-size check, ending with an advisory `Verdict:` line), never on drafts, and on bot PRs only for Devin and Claude (allowlisted in the job `if` and `allowed_bots`); the owner can request one with `@claude`. Token expiry: `deployment/expirations.md`.

## Gotchas

- The backend apps are not deployed yet: the deploy scripts skip them until infra creates them. `deployment/README.md` covers the web app only.
- The agent id `restaurant_researcher` (`AGENT_NAME` in `backend/app/agent/server.py`) must match the web app's CopilotKit runtime route and provider `agent` prop (neither exists yet).
- `backend/sql/` scripts are idempotent and applied by hand by the owner; agents and the apps never run DDL.
