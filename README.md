# restaurant-researcher-app

Website for the `restaurant-researcher` skill: venue research as a card board with a chat interface.

## Checks

From `frontend/`:

```bash
npm test
npm run lint
npx tsc --noEmit
npm run build
```

The same checks run in GitHub Actions (`.github/workflows/ci.yml`) on every pull request and every push to `main`, as two checks: `frontend-test` and `frontend-checks`.
