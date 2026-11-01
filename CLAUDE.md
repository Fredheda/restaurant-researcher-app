# CLAUDE.md

This repo lives inside a multi-repo workspace. The workspace `CLAUDE.md` (`../CLAUDE.md`) owns the git rules, worktrees, and the whole PR loop ("Ways of working"); follow it. Only repo-specific facts are below.

- PR titles and descriptions must not mention Claude Code or link the Claude session.
## Response style

Use the `caveman` skill. Talk terse at all times, with or without the skill: chat, Jira comments, GitHub PR and issue text, commits, specs, plans, docs. Short plain sentences, no filler. Keep code, commands and error strings exact. Security warnings and irreversible-action confirmations stay in full clear sentences. Details: workspace `CLAUDE.md`, "Response style".

## What this is

Website for the `restaurant-researcher` skill: venue research as a card board with a chat interface. The frontend (Next.js 16, React 19, Tailwind 4) still serves stub chat and fixture places, in the "Ink and paper" theme (design tokens in `frontend/app/globals.css`; mobile-first, works from 360 px). The `PlaceResult` type in `frontend/app/types.ts` is the contract the backend fills. `backend/` (FastAPI, Poetry, Python 3.13) is one codebase and image for two apps, picked by `APP_ROLE`: `api` (search REST and SSE) and `agent` (LangGraph over AG-UI); it is not deployed or wired to the frontend yet.

## Commands

Run the frontend checks (`npm test`, `npm run lint`, `npx tsc --noEmit`, `npm run build`, `npm run e2e`) from `frontend/` and the backend checks (`poetry run pytest -q`, `ruff check`, `ruff format --check`, `pyright`) from `backend/`; see `docs/development.md`. The backend tests are offline: every external client is a fake passed to `create_app`. Every locator for the browser tests lives in `frontend/e2e/selectors.ts`; ESLint rejects `.locator()` in specs. A browser test must catch a bug no other test catches. Code deploys with the manual **Deploy** workflow (see `deployment/README.md`); `./scripts/ship.sh` is the laptop fallback and `./infra/deploy.sh` deploys infra (laptop only). Every deploy waits in GitHub for the owner's approval (`production` requires him as reviewer). Run one only on the owner's explicit yes for that specific deploy, and never approve a waiting deployment. Rule: workspace `CLAUDE.md`, "Deploy only on the owner's explicit yes for that deploy".

The Docker image and CI both install with npm 12.0.2 on Node 24. `ci.yml` runs on pull requests only (nothing runs on a merge to `main`); a docs-only PR (`*.md` or `docs/`) skips its jobs, and a draft PR skips the `build` job (production build plus the browser tests). Run `./scripts/ci-local.sh` (every `ci.yml` check, in CI order) green before `gh pr ready`. `next-env.d.ts` and `*.tsbuildinfo` are generated and gitignored.

## Gotchas

- `.github/workflows/claude-review.yml` posts a comment-only AI review on every push to a ready (non-draft) PR (security first, plus a documentation check); the owner can request one by commenting `@claude`.
- Security checks live in `.github/workflows/security.yml` (jobs and schedule are in its header comment; failure handling in `docs/development.md`). `gitleaks` and `workflow-lint` block a PR; `npm-audit` is weekly only. There is no CodeQL job yet (it was left out while the repo was private; code scanning is free on public repos). Run locally: `gitleaks git . --redact`, `actionlint`, `cd frontend && npm audit --omit=dev --audit-level=high`.
- Dependabot is configured in `.github/dependabot.yml` (monthly, grouped; npm, pip, Node and Python-image majors and the Python minor are done by hand, GitHub Actions majors arrive as separate PRs). Security updates are immediate and come from the repo settings, not from that file.
- The repo is public; the deployed app is private (Entra Easy Auth). Keep emails, tenant, subscription and client IDs out of the repo, PR text and logs.
- `deployment/README.md` describes only the web app. The backend apps get their own section when their infra and deploy scripts land (RR-9, PR C).

## Where to look

- Local dev and checks: `docs/development.md`
- Deployment, rollback, user approval: `deployment/README.md`
- Credential expiry and rotation: `deployment/expirations.md`
