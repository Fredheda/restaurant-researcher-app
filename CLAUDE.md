# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> This repo lives inside a multi-repo workspace with its own root `CLAUDE.md`
> (`../CLAUDE.md`, one level up) covering workspace-wide conventions — where
> specs/plans go, the git rule, shared MCP/skill usage. Keep that file's
> per-project facts about this repo in sync whenever they drift from what's
> true here.

**Git:** you may run git freely up to a commit, and push a feature branch and
open a PR. Ask first for `pull`, `fetch`, `rebase`, `reset`, force-push, or
anything on `main`. Reviewing and merging PRs is the user's alone — hand over
the PR URL. Commit messages are 2 lines at most, with no `Co-Authored-By`
trailer. Full rule in the root `CLAUDE.md` linked above.

**Response style:** use the `caveman` skill for responses in this repo —
invoke it before replying, not just when asked.

## What this is

Website for the `restaurant-researcher` skill: venue research as a card board
with a chat interface. Frontend only for now (Next.js 16, React 19, Tailwind 4),
serving stub chat and place data. Deployed to Azure Container Apps at
restaurants.frederikheda.com — see `DEPLOYMENT.md`.

## Commands

Run from `frontend/` unless noted.

| Task | Command |
|------|---------|
| Dev server | `npm run dev` |
| Tests (vitest, jsdom) | `npm test` |
| Lint | `npm run lint` |
| Type-check | `npx tsc --noEmit` |
| Production build | `npm run build` |
| Deploy code (from repo root) | `./scripts/ship.sh` (refuses a dirty tree) |
| Deploy infra (from repo root) | `./infra/deploy.sh` |

The Docker image installs with npm 12.0.2 on Node 24; CI does the same
(`.github/workflows/ci.yml`), running the tests and the lint, type-check and
build checks on every pull request and every push to `main`.

`.github/workflows/claude-review.yml` posts an AI security-first review when a
PR is opened and on every push to it; the repo owner can also request one by
commenting `@claude`. It is comment-only and authenticates with the
`CLAUDE_CODE_OAUTH_TOKEN` repo secret, which expires about 2027-10-24: renew
with `claude setup-token`, then `gh secret set CLAUDE_CODE_OAUTH_TOKEN`. If
subscription auth is refused, switch the action input to `anthropic_api_key`.

`next-env.d.ts` and `*.tsbuildinfo` are generated and gitignored.
