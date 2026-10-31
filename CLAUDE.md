# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

This repo lives inside a multi-repo workspace with its own root `CLAUDE.md` (`../CLAUDE.md`) covering workspace-wide conventions: where specs and plans go, the git rules, shared MCP and skill usage. Keep that file's facts about this repo in sync when they drift.

## Working rules

- **Git:** run git freely up to a commit; push a feature branch and open a PR. `fetch` and `pull` are fine (default to `pull --ff-only`). Ask first for `rebase`, `reset`, force-push, deleting branches, or anything on `main`. Reviewing and merging PRs is the user's alone; hand over the PR URL.
- **Worktrees:** other Claude sessions share the workspace. Work in your own worktree, never the main checkout: `git worktree add ../.worktrees/<repo>-<slug> -b <branch> origin/main`. Remove it after the PR merges. Details in the root `CLAUDE.md`, "Parallel sessions".
- Commit messages: 2 lines at most, no `Co-Authored-By` trailer. PR titles and descriptions must not mention Claude Code or link the Claude session.
- After opening a PR, wait for CI (`gh pr checks --watch`), then read every automated review comment (the inline comments via `gh api repos/<owner>/<repo>/pulls/<n>/comments` and the summary via `gh pr view <n> --comments`) and address all of them before handing over the PR URL. Fix each finding with a new commit and push, or reply on the PR with the reason when you disagree. Never hand over a PR with an unaddressed review comment. When a ticket's wording conflicts with a finding, fix the finding and tell the owner.
- **Response style:** keep replies terse. Short plain sentences, no filler or pleasantries, no restating the question, no narration around tool calls. Code, commands and error messages stay exact. Write commits, PR text, docs and tickets in normal prose.

## What this is

Website for the `restaurant-researcher` skill: venue research as a card board with a chat interface. Frontend only for now (Next.js 16, React 19, Tailwind 4), serving stub chat and place data from fixtures. The `PlaceResult` type in `frontend/app/types.ts` is the contract the future agent fills.

## Commands

Run from `frontend/`:

```bash
npm run dev            # dev server
npm test               # vitest, jsdom
npm run lint
npx tsc --noEmit
npm run build
```

From the repo root: `./scripts/ship.sh` deploys code (refuses a dirty tree); `./infra/deploy.sh` deploys infra.

The Docker image and CI both install with npm 12.0.2 on Node 24. `next-env.d.ts` and `*.tsbuildinfo` are generated and gitignored.

## Gotchas

- `.github/workflows/claude-review.yml` posts a comment-only AI review (security first, plus a check that affected docs were updated and are not stale) on every PR push; the owner can request one by commenting `@claude`. Its `CLAUDE_CODE_OAUTH_TOKEN` secret expires about 2027-10-24 (renewal steps in `deployment/expirations.md`).
- The deployed app is private (Entra Easy Auth). Do not put its URL in the README.
- When the backend agent lands, extend `deployment/README.md` with a second section for that Container App.

## Where to look

- Local dev and checks: `docs/development.md`
- Deployment, rollback, user approval: `deployment/README.md`
- Credential expiry and rotation: `deployment/expirations.md`
