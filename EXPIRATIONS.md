# Expirations

| What | Expires | Rotate with |
|---|---|---|
| Easy Auth client secret (`restaurant-researcher-easyauth`) | 2 years from last `setup-easyauth.sh` run | `./scripts/setup-easyauth.sh` (idempotent, resets the secret) |

Image pulls use managed identity and builds use the live `az login`
session — no other stored credential exists to expire.
