# Expirations

| What | Expires | Rotate with |
|---|---|---|
| Easy Auth client secret (`restaurant-researcher-easyauth`) | 2 years from last `setup-easyauth.sh` run | `./scripts/setup-easyauth.sh` (idempotent, resets the secret) |
| `CLAUDE_CODE_OAUTH_TOKEN` repo secret (used by `.github/workflows/claude-review.yml`) | about 2027-10-24 | `claude setup-token`, then `gh secret set CLAUDE_CODE_OAUTH_TOKEN`. If subscription auth is refused, switch the action input to `anthropic_api_key`. |

Image pulls use managed identity and builds use the live `az login` session, so no other stored credential exists to expire.
