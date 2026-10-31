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
```

GitHub Actions (`.github/workflows/ci.yml`) runs the same checks in one `frontend` job on every pull request, and on nothing else: a merge to `main` starts no run. A docs-only pull request (only `*.md` files or files under `docs/`) skips that job.

`next-env.d.ts` and `*.tsbuildinfo` are generated and gitignored.

## Making a change

1. Work on a branch (in this workspace, in your own git worktree).
2. Run the four checks above.
3. Commit, push the branch and open a pull request. CI and the AI review (`.github/workflows/claude-review.yml`) run on the PR.
4. After the PR is merged, deploy: see [deployment/](../deployment/README.md).
