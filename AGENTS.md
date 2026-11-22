# AGENTS.md

Repo facts first, then the shared rules. A local session also reads the workspace `AGENTS.md` one level up.

PR titles and descriptions never mention Claude Code. `./scripts/ci-local.sh` is the local CI script: green before `gh pr ready`.

## What this is

Website for the `restaurant-researcher` skill: venue research as a card board with a chat interface. Public repo; the deployed app (restaurants.frederikheda.com) is private behind Entra Easy Auth. Keep emails, tenant, subscription and client IDs out of repo, PR text and logs.

- `frontend/` (Next.js 16, React 19, Tailwind 4): still serves stub chat and fixture places (`app/fixtures/places.ts`); "Ink and paper" theme, tokens in `app/globals.css`; system font stacks only, no bundled or hosted fonts (ESLint rejects `next/font`); mobile-first from 360 px. `app/types.ts` (`PlaceResult`) is the contract the backend fills. `app/api/[...path]/route.ts` is the narrow `/api/*` proxy to the api app (Easy Auth principal headers only); the header search bar (`app/search-bar.tsx`) calls it. `app/api/copilotkit/[[...slug]]/route.ts` is the CopilotKit runtime route to the agent app: POST only, four runtime methods, principal headers only, agent error text replaced; nothing in the UI calls it yet, the chat still answers from fixtures.
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

- Node 26 with npm 12.2.2, in CI and in `frontend/Dockerfile`. `next-env.d.ts` and `*.tsbuildinfo` are generated and gitignored.
- CI (`.github/workflows/ci.yml`) runs on pull requests only, never on a push to `main`. A draft PR runs the light jobs (`changes`, `backend`, `checks`: deploy-script tests, supply-chain guard, vitest, lint, `tsc`); `build` (production build plus the browser tests) and the AI review run once the PR is ready. A docs-only PR (`*.md` or `docs/`) skips all three. CI never builds an image.
- **Merging:** the owner merges, except the bot and docs classes in the workspace `AGENTS.md` (Git), which the coordinator merges.
- Tests: backend tests are offline, every external client is a fake passed to `create_app`. Browser tests (`frontend/e2e/`) run against the production build with no network and start a fake api and a fake agent (`frontend/e2e/fake-api.mjs`, `frontend/e2e/fake-agent.mjs`): the web server under test gets `API_URL` and `AGENT_URL` pointing at them and the tests send the sign-in header, so the principal path is the one exercised; every locator lives in `frontend/e2e/selectors.ts` and ESLint rejects `.locator()` in specs. A new test must catch a bug no other test catches.

## Environment variables

Which role needs which, meaning and defaults: `docs/development.md`. The frontend reads three, at runtime: `API_URL` (internal https origin of the api app, a path is ignored; unset means `/api/*` answers 503), `AGENT_URL` (the same for the agent app and `/api/copilotkit`) and, for local runs of the api proxy only, `ALLOW_ANONYMOUS`.

- Backend: `APP_ROLE`, `GOOGLE_PLACES_API_KEY`, `OPENAI_API_KEY`, `OPENAI_MODEL`, `SQL_SERVER`, `SQL_DATABASE`, `AZURE_CLIENT_ID`, `APP_ENV`. Frontend: `API_URL`, `AGENT_URL`, `ALLOW_ANONYMOUS`.

## Deployment

Code deploys with the manual **Deploy** workflow (`main` only; full SHA or head of `main`; rollback = older SHA). `./scripts/ship.sh` is the laptop fallback and refuses a dirty tree. `./infra/deploy.sh [sha]` deploys infra; it needs `GOOGLE_PLACES_API_KEY`, `OPENAI_API_KEY`, `SQL_SERVER` and `SQL_DATABASE` in the environment. A merge runs nothing. Every run waits for approval from the `production` reviewer. How to run: `deployment/README.md`.

## Security, Dependabot, review

- `.github/workflows/security.yml`: `gitleaks` and `workflow-lint` block every PR; `npm-audit` runs weekly (and by hand) through `scripts/audit-gate.mjs`, which accepts one advisory by owner decision, and its failure is the alert (`docs/development.md`). No CodeQL and no backend audit yet. Locally: `gitleaks git . --redact`, `actionlint`, `./scripts/tests/test-audit-gate.sh`.
- `.github/dependabot.yml`: monthly, grouped minor and patch PRs per ecosystem (npm, pip, GitHub Actions, both Dockerfiles), label `dependencies`, 14-day cooldown. npm, pip, Node-image and Python-image majors and the Python minor are ignored and done by hand; GitHub Actions majors arrive as separate PRs. Security updates come from the repo settings and open at once.
- Dependencies: 14-day install cooldown, exact Poetry and pip pins, actions pinned by commit, Docker images pinned by digest; guarded by `scripts/tests/test-supply-chain.sh` (`docs/development.md`, "Dependencies").
- `.github/workflows/claude-review.yml`: comment-only AI review on every push to a ready PR (security first, then a documentation check and an advisory PR-size check, ending with a `Verdict:` line; a run that posts none fails the job), never on drafts, and on bot PRs only for Devin and Claude (allowlisted in the job `if` and `allowed_bots`); the owner can request one with `@claude`. Token expiry: `deployment/expirations.md`.

## Gotchas

- The backend apps are not deployed yet: the deploy scripts skip them until the infra deploy creates them.
- The agent id `restaurant_researcher` (`AGENT_NAME` in `backend/app/agent/server.py`) must match the web app's CopilotKit runtime route (`AGENT_ID` in `frontend/app/agent.ts`) and provider `agent` prop (the route exists, the provider does not yet).
- `backend/sql/` scripts are idempotent and applied by hand by the owner; agents and the apps never run DDL.

Not yet enforced here: `scripts/rules/` and the CI job `rules` arrive with RR-64; the rules sentences in the shared block below describe that target.

<!-- shared:start -->
## Shared rules (identical in every repo; never edit here)

Copied from the owner's template. The `shared-block` rule fails CI when this block differs from it.

**Ownership.** You own this codebase: keep it maintainable, secure, free of bugs, duplicated code and needless comments. Fix tech debt you meet in the files you touch.

**Tickets.** Work only the ticket assigned to you; one ticket is one PR. Keep its Jira status true: `In Progress` on start and while the PR is open, `Done` only after merge and cleanup. Record decisions, steps and open questions on the ticket, not in chat. A question for the owner goes on the ticket as one exact question; keep working on what does not depend on it. Start every ticket or PR comment with your agent name in brackets, such as `[Claude Coding Agent]` or `[Devin Coding Agent]`.

**Git.** Work on a feature branch; never push to `main`, force-push, rebase or reset a shared branch, or delete a branch you did not create. Commit messages: 2 lines at most, no trailer. The owner alone reviews, approves and merges; hand over the PR URL and wait.

**Pull requests.** At most 25 changed files and 5000 changed lines (lockfiles, fixtures, generated files and `docs/` excluded); the `pr-size` rule fails a larger PR unless the owner set the label `size-override`. Open a draft first. Before asking for review run `scripts/ci-local.sh` until it passes, then wait for CI, the security checks and the automated review, and fix or answer every comment. A PR that changes what a user sees carries a screenshot or a short video when you cannot offer a local run.

**Tests first.** Write and run each behaviour's failing test before the code. Every test must catch a bug no other test catches; remove a test that does not. Never commit a test that only proves something was removed: show that evidence once in the PR description. A test of behaviour the code still has stays, also when it asserts that something is refused or not forwarded.

**Comments.** The default is no comment. Keep or add one only for a reason the code cannot show (a constraint, a security reason, a workaround with its source). When you edit a file, delete every comment in it that restates the code, narrates a change or points at a ticket, and every redundant test, in the same PR, in a separate commit; delete aggressively, git history keeps the rest. The `comment-count` rule fails a PR in which a file's comment count grows, unless the PR description has a line `Comments: <path>: <reason>` for that file.

**Specs and plans.** A non-trivial ticket has a spec in `docs/specs/` and a plan in `docs/plans/` (`YYYY-MM-DD-slug.md`, the plan uses the spec's slug). They merge as a docs-only PR before the code PR; the ticket description names both paths. Never move a merged spec or plan; the code PR sets `Status: done (PR #n)` in its header.

**Nothing sensitive in the repo.** No secret, key or `.env` file. No Azure resource id, subscription, tenant or client id, no host that is not public, and no open weakness in code, docs, specs or plans: those go on the ticket only.

**Dependencies.** Add or update only with the repo's package manager, inside the repo. Never pass a flag or variable that relaxes the 14-day release cooldown.

**Deploys and cloud changes.** Only on the owner's explicit yes for that one run, recorded on the ticket. Never approve a waiting deployment.

**Rules a machine checks.** `scripts/rules/run.sh` runs them, locally and in the CI job `rules`. Fix what a rule reports; never bypass or weaken a rule to pass. A correction from the owner becomes a new rule there, not a sentence here.

**Docs.** Every PR updates the docs it makes untrue. Edit `AGENTS.md`; `CLAUDE.md` only imports it.
<!-- shared:end -->
