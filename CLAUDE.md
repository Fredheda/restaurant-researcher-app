# CLAUDE.md

This repo lives inside a multi-repo workspace. The workspace `CLAUDE.md` (`../CLAUDE.md`) owns the git rules, worktrees, and the whole PR loop ("Ways of working"); follow it. Only repo-specific facts are below.

- PR titles and descriptions must not mention Claude Code or link the Claude session.
## Response style

Use the `caveman` skill. Talk terse at all times, with or without the skill: chat, Jira comments, GitHub PR and issue text, commits, specs, plans, docs. Short plain sentences, no filler. Keep code, commands and error strings exact. Security warnings and irreversible-action confirmations stay in full clear sentences. Details: workspace `CLAUDE.md`, "Response style".

## What this is

Website for the `restaurant-researcher` skill: venue research as a card board with a chat interface. Frontend only for now (Next.js 16, React 19, Tailwind 4), serving stub chat and place data from fixtures. The `PlaceResult` type in `frontend/app/types.ts` is the contract the future agent fills.

## Commands

Run the app and the checks (`npm test`, `npm run lint`, `npx tsc --noEmit`, `npm run build`, `npm run e2e`) from `frontend/`; see `docs/development.md`. Every locator for the browser tests lives in `frontend/e2e/selectors.ts`; ESLint rejects `.locator()` in specs. A browser test must catch a bug no other test catches. Code deploys with the manual **Deploy** workflow (see `deployment/README.md`); `./scripts/ship.sh` is the laptop fallback and `./infra/deploy.sh` deploys infra (laptop only).

The Docker image and CI both install with npm 12.0.2 on Node 24. `ci.yml` runs on pull requests only (nothing runs on a merge to `main`); a docs-only PR (`*.md` or `docs/`) skips its jobs, and a draft PR skips the `build` job (production build plus the browser tests). Run `./scripts/ci-local.sh` (every `ci.yml` check, in CI order) green before `gh pr ready`. `next-env.d.ts` and `*.tsbuildinfo` are generated and gitignored.

## Gotchas

- `.github/workflows/claude-review.yml` posts a comment-only AI review on every push to a ready (non-draft) PR (security first, plus a documentation check); the owner can request one by commenting `@claude`.
- Security checks live in `.github/workflows/security.yml` (jobs and schedule are in its header comment; failure handling in `docs/development.md`). `gitleaks` and `workflow-lint` block a PR; `npm-audit` is weekly only. There is no CodeQL job: code scanning is unavailable on a private repo on the free plan. Run locally: `gitleaks git . --redact`, `actionlint`, `cd frontend && npm audit --omit=dev --audit-level=high`.
- Dependabot is configured in `.github/dependabot.yml` (monthly, grouped; npm and Node majors are done by hand, GitHub Actions majors arrive as separate PRs). Security updates are immediate and come from the repo settings, not from that file.
- The repo is public to read, but the deployed app is private (Entra Easy Auth). No license is granted, all rights reserved, so there is no `LICENSE` file; do not add one. Keep emails, tenant, subscription and client IDs out of the repo, PR text and logs.
- When the backend agent lands, extend `deployment/README.md` with a second section for that Container App.

## Where to look

- Local dev and checks: `docs/development.md`
- Deployment, rollback, user approval: `deployment/README.md`
- Credential expiry and rotation: `deployment/expirations.md`
