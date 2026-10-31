# CLAUDE.md

This repo lives inside a multi-repo workspace. The workspace `CLAUDE.md` (`../CLAUDE.md`) owns the git rules, worktrees, and the whole PR loop ("Ways of working"); follow it. Only repo-specific facts are below.

- PR titles and descriptions must not mention Claude Code or link the Claude session.
- **Response style:** keep replies terse. Short plain sentences, no filler or pleasantries, no restating the question, no narration around tool calls. Code, commands and error messages stay exact. Write commits, PR text, docs and tickets in normal prose.

## What this is

Website for the `restaurant-researcher` skill: venue research as a card board with a chat interface. Frontend only for now (Next.js 16, React 19, Tailwind 4), serving stub chat and place data from fixtures. The `PlaceResult` type in `frontend/app/types.ts` is the contract the future agent fills.

## Commands

Run the app and the four checks (`npm test`, `npm run lint`, `npx tsc --noEmit`, `npm run build`) from `frontend/`; see `docs/development.md`. From the repo root, `./scripts/ship.sh` deploys code (refuses a dirty tree) and `./infra/deploy.sh` deploys infra.

The Docker image and CI both install with npm 12.0.2 on Node 24. CI runs on pull requests only (nothing runs on a merge to `main`); a docs-only PR (`*.md` or `docs/`) skips the `frontend` job. `next-env.d.ts` and `*.tsbuildinfo` are generated and gitignored.

## Gotchas

- `.github/workflows/claude-review.yml` posts a comment-only AI review on every PR push (security first, plus a documentation check); the owner can request one by commenting `@claude`.
- `.github/workflows/security.yml` runs `gitleaks` (blocking; PR commits only, whole history weekly) and `workflow-lint` (blocking; actionlint) on pull requests, and `npm-audit` (high severity, production dependencies) on the weekly schedule only, where it fails visibly. Nothing runs on a merge to `main`. There is no CodeQL job: code scanning is unavailable on a private repo on the free plan. Run locally: `gitleaks git . --redact`, `actionlint`, `cd frontend && npm audit --omit=dev --audit-level=high`.
- The deployed app is private (Entra Easy Auth). Do not put its URL in the README.
- When the backend agent lands, extend `deployment/README.md` with a second section for that Container App.

## Where to look

- Local dev and checks: `docs/development.md`
- Deployment, rollback, user approval: `deployment/README.md`
- Credential expiry and rotation: `deployment/expirations.md`
