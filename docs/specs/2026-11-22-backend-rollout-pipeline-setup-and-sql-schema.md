# Backend rollout 3: pipeline setup script and the SQL schema script

- **Ticket:** RR-33 (sibling RR-32 defines the identity and app names; RR-36 is the live run)
- **Repo:** `restaurant-researcher-app`
- **Tier:** non-trivial
- **Status:** approved by the specialist, 2026-11-22
- **Parent:** `2026-11-01-backend-scaffold-and-fast-search.md` (decision 5), plan Task 14 part 1
- **Schematic:** `../plans/diagrams/2026-11-22-backend-rollout-pipeline-setup-and-sql-schema.mmd`

## TL;DR

- **Ships:** `setup-github-deploy.sh` (owner runs it once; owner decisions 610 yes, 611 A, 612 A of 2026-11-22) now also creates `id-restaurant-researcher-backend` with its `AcrPull`, creates a third identity for the new `Deploy infra` workflow (RR-32) with its federated credential (subject `environment:production`) and a custom role at the resource group limited to deployments and Container Apps (never role assignment or identity creation), and grants the deploy identity Managed Identity Operator on the backend identity. New `scripts/apply-schema.sh` runs `backend/sql/*.sql` in order through the backend's own Python environment, as the caller's `az login`, with `--dry-run`, `--check` and `--verify`. New `backend/sql/003_backend_identity.sql` creates the backend identity's database user with least-privilege rights. The owner sets the two API keys as environment secrets of `production` himself (names in the plan, values never in the repo).
- **Two PRs, one ticket each** (coordinator rule: one plan, one ticket, one PR): RR-33 is the setup script (identities, custom role, federated credential, its tests and README lines); RR-71 is the schema script, its Python runner, `003` and their tests. RR-71 is branched after RR-33 merges (same test file and README). About 170 hand-written lines plus about 200 lines of tests in total (the ticket says about 120; see Risks 5).
- **Owner actions:** merge only. Nothing runs here; the scripts run in RR-36, on the owner's laptop, after his explicit yes.
- **Live-run order differs from plan Task 15:** this setup script first (it creates the backend identity), then the `Deploy infra` workflow (RR-32), then this setup script again for the per-app roles, then the schema script (it only needs the backend identity, so it may also run before infra) (Risks 4).
- **Cost:** no new Azure resource. Role assignments and database users are free. A schema run wakes the serverless database: compute is billed from resume until 60 minutes after the last session (Cost estimate).

## Cost estimate

No new Azure resource. Role assignments, managed identities and database users have no charge.

One cost source: the serverless database. A paused serverless database bills no compute; the first connection resumes it (the first attempt can fail with error 40613 until it is online), and compute is billed per second while it is online. The auto-pause delay is 60 minutes by default and this shared database uses 60 (skill `deploying-azure-projects`), so one schema run keeps it online for about an hour after the script's connection closes, billed at least at the configured minimum vCores and memory. An open session also blocks auto-pause, so the runner always closes its connection. Running schema and `--verify` in the same hour costs one wake, and no extra if the database is awake anyway (the apps and other projects use it).

Sources: Microsoft Learn, "Serverless compute tier for Azure SQL Database" and "Serverless compute tier billing for Azure SQL Database" (pages returned by Microsoft Learn search on 2026-11-22), and the serverless FAQ for the 40613 behaviour. The billing page's worked example uses an illustrative $0.000145 per vCore-second, which gives about $0.26 for a floor of 0.5 vCore for 3,600 s (1,800 vCore-seconds). That is an illustration only. I could not confirm: the current West Europe unit price, this database's configured minimum vCores and memory, or whether the free offer (100,000 vCore-seconds per month, per a Q&A answer, not a pricing page) applies to it. No monthly figure is quoted; Cost Management shows the real one.

## Goal and non-goals

**Goal:** the owner can, in one command each, give the deploy identity every role it needs for the backend apps, and apply the idempotent SQL (schema plus the backend identity's grant) to the shared database with no stored credential and no new dependency.

**Non-goals:** running anything live (RR-36); Bicep, the apps and the `Deploy infra` workflow (RR-32; it uses the identity and the role this spec creates); the backend section of `deployment/README.md` (RR-34); a migrations table (files are idempotent; each run re-executes all of them); changing how the apps connect; any CI job that touches Azure or the database.

## Design

### 1. `scripts/setup-github-deploy.sh`

Already true after RR-31, so no code change for it: the loop over `APPS` grants `Container Apps Contributor` on the app's resource id for every app that exists and skips the rest (`app_exists`). That covers `ca-restaurant-researcher-api` and `ca-restaurant-researcher-agent` once infra creates them. The ticket text asks for it again; it is covered by tests here instead (Test strategy).

New (changed 2026-11-22, owner 610 and 611 A), in this order, each idempotent:

1. **Backend identity.** Create `id-restaurant-researcher-backend` in the shared resource group if it does not exist (`az identity create`, flags from Learn at plan time), then `AcrPull` on the registry for its principal via `ensure_role`. This work leaves `infra/main.bicep` (RR-32).
2. **Infra identity.** Create a third user-assigned identity (name in the plan) and its federated credential for this repo, subject from the repo's own OIDC setting (`actions/oidc/customization/sub`, as for the other two), `environment:production`. Store its client id as a repo secret next to the others (name in the plan).
3. **Custom role.** `az role definition create` at the resource group scope (assignable scope: that group), with only: start and read deployments; create and update Container Apps; read the managed environment and the registry; the right to attach the project's two existing identities to apps (`Managed Identity Operator` on those two identities, assigned separately by `ensure_role`). No role-assignment right, no identity create or federated-credential right, no data-plane right. The exact action list is the plan's, from Learn (RR-32 open question 12). Assign it to the infra identity at the resource group. An existing definition is updated, not duplicated.
4. **Deploy identity: `Managed Identity Operator` on `id-restaurant-researcher-backend`.** Updating an app that runs as that identity needs its `assign/action`, the same reason the acrpull grant exists. The identity now exists when the script reaches this line, so the skip logic for it is dropped; the apps keep theirs (`app_exists`, skipped until `Deploy infra` creates them).

Order of grants for the deploy identity (all by object id and principal type, via `ensure_role`): `AcrPush` on the registry; `Managed Identity Operator` on `id-restaurant-researcher-acrpull`; `Managed Identity Operator` on `id-restaurant-researcher-backend`; `Container Apps Contributor` on each existing app in `APPS` order. The build identity is unchanged. Header comment: name the three identities and the custom role. Re-running changes nothing and must be run again after `Deploy infra` creates the backend apps, or the next Deploy fails with an authorization error on them.

**Environment secrets: the owner's step, not the script's.** The script never reads or sets a key. The plan names the two secrets (`gh secret set <name> --env production -R Fredheda/restaurant-researcher-app`, value read from a hidden prompt) and the SQL names that go into workflow environment variables; the script prints a reminder line when a secret is missing (`gh secret list --env production`, names only).

### 2. `scripts/apply-schema.sh` and `backend/tools/apply_schema.py`

**Where the logic lives and why.** `apply-schema.sh` is a wrapper: `cd backend`, then `exec poetry run python -m tools.apply_schema "$@"`. The logic is Python in `backend/tools/` (not copied into the image, which copies `app/` only). Reasons: typed, linted and unit-tested by the backend's existing CI job (`ruff`, `pyright`, `pytest`), no BSD versus GNU `awk`/`sed` differences on macOS, and CRLF and GO edge cases are plain code. The wrapper keeps the entry point and the shellcheck gate the ticket asks for.

**How it runs SQL without a new dependency.**

| Option | Verdict |
|---|---|
| `mssql-python` 1.12.0 and `azure-identity` 1.27.0, both already pinned in `backend/poetry.lock`, via `poetry run` | Chosen. Same driver and passwordless path as the app (the image has no ODBC package, so `pyodbc` is not available there either). Nothing to install beyond the existing `poetry install` |
| `sqlcmd` (`sqlcmd` is installed through Homebrew on the owner's laptop, documented nowhere in the repo) | Rejected: unpinned, outside the 14-day cooldown and lockfiles, and it splits on `GO` itself, so the ticket's splitting test would test nothing |
| `az account get-access-token --resource https://database.windows.net/` plus `pyodbc` | Rejected: `pyodbc` is not locked and needs a system ODBC driver; `pip install` is forbidden |
| Portal query editor | Rejected: not scripted, not repeatable, not testable |

**Authentication: the caller's `az login`.** The runner connects with `mssql_python.connect(conn_str, autocommit=True, token_provider=AzureCliCredential())`, where `AzureCliCredential` comes from the locked `azure-identity`, and `conn_str` is `Server=<SQL_SERVER>;Database=<SQL_DATABASE>;Encrypt=yes;` (no `Authentication=`; the two are mutually exclusive). This uses the `az login` session and nothing else, so an exported `AZURE_CLIENT_ID` or service-principal variable cannot silently change who runs the DDL. Fallback, only if the installed `mssql_python.connect` has no `token_provider` parameter (the builder checks with `inspect.signature`, read-only): `Authentication=ActiveDirectoryDefault;` as `backend/app/store/database.py` does locally, with `AZURE_CLIENT_ID` and `AZURE_CLIENT_SECRET` removed from the process environment first. Autocommit is on: each batch commits alone, so a failure leaves earlier batches applied, which is safe because every file is idempotent.

**Environment.** `SQL_SERVER` and `SQL_DATABASE` (the backend's existing names, `docs/development.md`) from the caller's shell. No defaults and no `.env` reading. Unset gives exit 2 with the names of the missing variables. Only the database name is printed, never the server, a token or a connection string; driver messages have the server host replaced by `<server>` before printing (`app/store/cache.py` already treats driver messages as able to name the server).

**Interface.**

```
./scripts/apply-schema.sh [--dry-run | --check | --verify]
```

| Mode | Connection | What it does |
|---|---|---|
| none | yes, writes | Applies every batch of every file |
| `--dry-run` | none | Prints the ordered file names, one per line. No splitting, no env vars |
| `--check` | none | Splits every file and prints each batch under `-- <file> batch n/m`, verbatim, exactly what a real run would send. Fails on a bad file name or an unsupported `GO`, so it validates the real files. No env vars |
| `--verify` | yes, read only | First prints that the connection worked and the database it reached, then runs two fixed `SELECT` statements and prints the rows (below). Exits non-zero when the backend identity's three grants (`INSERT`, `SELECT`, `UPDATE` on schema `rr`) are missing (specialist edit 1): RR-36 uses it as a gate. Writes nothing |

**Who runs it.** The owner only (specialist edit 2). Agents never run this script, also not with `--verify`: it needs his `az login` and his firewall rule.

Two flags together, or an unknown one, exit 2. Exit codes: `0` success; `1` any failure (bad file name, unsupported `GO`, connect or SQL error); `2` usage or missing variables.

**File order and names.** Files matching `backend/sql/*.sql`, sorted by name (bytewise). A name must match `^\d{3}_[a-z0-9_]+\.sql$`; any other `.sql` file, an empty directory, or two files with the same three-digit prefix is refused (exit 1) so a stray `1_x.sql` cannot run in the wrong place. Non-`.sql` files are ignored.

**GO splitting.** A batch ends at a line that, after stripping whitespace, equals `GO` in any case. CRLF is handled. Supported: that, nothing else. Refused with exit 1, naming file and line: a line starting with `GO` followed by whitespace and anything (`GO 5` repeat count, `GO -- note`), because a count would repeat a batch and a trailing comment is a different tool's syntax. Not split: `-- GO`, `GOTO x`. Empty or whitespace-only batches are skipped; a final batch without a trailing `GO` still runs. Known limit: a line that is only `GO` inside a block comment or a string literal is still split (the tools it imitates do the same); the real files have none, and the guard test below keeps it that way for the existing files.

**Run behaviour.** Prints `Target database: <name>`, then `apply <file> batch n/m` before each batch, then `done: N batches in M files`. A batch that returns rows prints them tab-separated (used by `--verify`). On the first error it stops, prints `FAILED <file> batch n/m: <ExceptionClass>: <scrubbed message>` to stderr, closes the connection and exits 1. Later batches and files do not run. Re-running after a fix starts from the top; idempotence makes that safe. The connection is closed in a `finally`.

**Paused database.** `connect` is retried while the error text contains `40613` (database not currently available), up to 8 attempts, 15 s apart, logging `database is resuming, attempt n/8` (wait is a parameter, so tests use 0). Any other connect error, for example a firewall refusal (40615) or an expired `az login`, fails at once with its message. I could not confirm that `mssql-python` puts the number `40613` in its exception text; RR-36 shows it, and the owner's fallback is to re-run (idempotent) once the database is awake.

**Idempotence.** Every file guards its own statements (`IF ... IS NULL`, `IF NOT EXISTS`); `GRANT` on an existing grant is a no-op. A guard test (below) fails the build if a batch in `backend/sql/` has `CREATE` or `ALTER` without an `IF`. There is no applied-files table: a second run re-executes everything and changes nothing.

**Verification query (`--verify`, read only).** Two constants in the module, tested to start with `SELECT`:

1. Row counts of the tables in schema `rr`: `SELECT t.name AS table_name, SUM(p.rows) AS row_count FROM sys.tables t JOIN sys.partitions p ON p.object_id = t.object_id AND p.index_id IN (0, 1) WHERE t.schema_id = SCHEMA_ID('rr') GROUP BY t.name ORDER BY t.name` gives four rows (`places`, `search_results`, `searches`, `users`).
2. Rights on the schema: `SELECT pr.name, pe.permission_name, pe.state_desc FROM sys.database_permissions pe JOIN sys.database_principals pr ON pr.principal_id = pe.grantee_principal_id WHERE pe.class = 3 AND pe.major_id = SCHEMA_ID('rr') ORDER BY pr.name, pe.permission_name` gives `id-restaurant-researcher-backend` with `INSERT`, `SELECT`, `UPDATE`, all `GRANT`.

Neither query was run (no database access here); RR-36 is their first run.

### 3. The backend identity's database grant: `backend/sql/003_backend_identity.sql`

Decision: a repo file in `backend/sql/`, applied by `apply-schema.sh` after `001` and `002` (it needs schema `rr`, so it sorts last), not statements inside the script and not an untracked hand-typed snippet.

```sql
IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = N'id-restaurant-researcher-backend')
    CREATE USER [id-restaurant-researcher-backend] FROM EXTERNAL PROVIDER;
GO

GRANT SELECT, INSERT, UPDATE ON SCHEMA::rr TO [id-restaurant-researcher-backend];
GO
```

- **Who runs it:** the owner, from his laptop, signed in as the Microsoft Entra admin of the logical server (or a member of its admin group). Per Microsoft Learn ("Microsoft Entra authentication for Azure SQL"), the Entra admin must be the first identity to create Entra principals, and a user identity needs no extra Graph permission. A SQL-authenticated or server-admin login cannot run it. Agents and the apps never run it (CLAUDE.md: "agents and the apps never run DDL"); the script is a tool for the owner, the rule is unchanged.
- **Why a file:** the grant cannot be expressed in Bicep (skill `deploying-azure-projects`), so it is a hand-run step; a reviewed, versioned, idempotent file beats text in a ticket, runs through the same path as the schema, and `--verify` checks its result.
- **Why this scope:** the apps only `SELECT`, `INSERT` and `UPDATE` (`MERGE` and `INSERT` in `app/store/cache.py` and `users.py`; no `DELETE`). The database is shared with other projects, so the usual `db_datareader` and `db_datawriter` role grants from Microsoft's examples would also expose other projects' schemas; a schema-scoped grant on `rr` does not.
- **Name:** `CREATE USER ... FROM EXTERNAL PROVIDER` takes the identity's display name; Learn notes display names must be unique in the tenant or the statement fails. The name is the one RR-32 fixes. No object id is stored.
- **Needs the identity to exist:** the setup script creates it, so `003` can run right after the setup run, before or after `Deploy infra`. If the setup script has not run, `003` fails with the server's "cannot find the principal" error, after `001` and `002` applied cleanly. That is the intended stop; run the setup script, then run this script again.
- **Overlap with RR-24:** the parent spec lists the grant as owner step RR-24. This file is that step made repeatable; RR-24 should be closed or reduced to "run the script" (Risks 3).

### 4. Docs touched (acceptance criterion; the backend section is RR-34)

`deployment/README.md`: replace "Role grants for the backend identity wait for RR-33." with the new grant, and add `./scripts/apply-schema.sh` to the "what to run" table. `CLAUDE.md`: the `backend/sql/` gotcha names `./scripts/apply-schema.sh` and the Commands block gets its `--check` line. `docs/development.md`: the schema sentence links to the script. Each says the thing once and links.

## Test strategy (tests first, every test catches something no other test catches)

**`backend/tests/test_apply_schema.py`** (pytest, offline; the connection is a fake `connect` factory, as everywhere in this backend):

1. `split_batches`: `GO`, `go`, `  Go  `, CRLF all split; `-- GO` and `GOTO x` do not; `GO 5` and `GO -- x` raise naming file and line; empty batches skipped; last batch without `GO` kept.
2. `list_sql_files`: sorted order; bad name, duplicate prefix and empty directory refused; non-`.sql` files ignored.
3. Real files guard: `backend/sql/` splits cleanly and every batch containing `CREATE` or `ALTER` also contains `IF` (catches a non-idempotent file before the live run).
4. `run`: batches execute in order on an autocommit connection, which is closed; the first failing batch stops the run with file and batch number in stderr, later batches never execute, exit 1; the server host is absent from the printed message.
5. Retry: `40613` retried then succeeds; another error is not retried; gives up after 8; wait comes from the parameter.
6. `main`: `--dry-run` prints names only and never calls `connect` or needs the variables; `--check` prints every batch, no `connect`; a real run without `SQL_SERVER` exits 2; two flags exit 2; both verify queries start with `SELECT`; `--verify` prints the connection line and the database name first and exits 1 when the grants query returns fewer than the three grants (and 0 with all three).

**`scripts/tests/test-deploy-scripts.sh`** (fake `az` and a fake `poetry`; extend the fake `az` to answer `identity show` and `containerapp show --query id` with resource ids, and `FAKE_NO_IDENTITY` and `FAKE_BROKEN_IDENTITY` lists, in the style of `FAKE_ABSENT` and `FAKE_BROKEN`):

- Setup creates the backend identity when `identity show` says it is missing, and does not create it twice (`FAKE_NO_IDENTITY` and a second run); grants `AcrPull` to it; creates the infra identity and its federated credential with subject `environment:production`; creates the custom role once and updates it on a re-run; assigns it to the infra identity at the resource group.
- The custom role definition the fake `az` receives contains no `Microsoft.Authorization/roleAssignments`, no `Microsoft.ManagedIdentity/userAssignedIdentities/write` and no `federatedIdentityCredentials` action (the rule that makes the infra identity safe).
- Setup grants `Managed Identity Operator` with the backend identity's resource id as scope, once.
- Setup grants `Container Apps Contributor` on the api and agent resource ids and the web id when they exist; with `FAKE_ABSENT` for the backend apps it grants on the web app only (the case the ticket text lists is thus covered, as RR-31 left no assertion on roles).
- The identity lookup fails with another error than not-found: exit non-zero.
- The backend-identity grant comes after the acrpull grant and before the app grants.
- Wrapper: `apply-schema.sh --check` runs `poetry run python -m tools.apply_schema --check` from `backend/` (fake `poetry` records its working directory and arguments), passing flags through.

`ci-local.sh` and `ci.yml` need no change: the backend job runs `pytest`, `ruff` and `pyright`, and the `checks` job runs `test-deploy-scripts.sh`. The builder adds `tools` to `[tool.pyright] include` so the module is type-checked.

## Owner-runnable gates

Marked **offline** (no Azure, runs in the agent sandbox and on the laptop) or **laptop** (needs `az login` and the live database; the agent sandbox cannot do these; they belong to RR-36 and need the owner's explicit yes).

| # | Gate | Command (repo root unless stated) | Expected |
|---|---|---|---|
| 1 | offline | `cd backend && poetry run pytest tests/test_apply_schema.py -q` | all passed, none skipped |
| 2 | offline | `./scripts/tests/test-deploy-scripts.sh` | ends with `deploy script tests: all passed` |
| 3 | offline | `shellcheck -x -S warning scripts/*.sh scripts/lib/*.sh scripts/tests/*.sh` | no output, exit 0 |
| 4 | offline | `./scripts/apply-schema.sh --dry-run` | three lines: `001_rr_schema.sql`, `002_users.sql`, `003_backend_identity.sql` |
| 5 | offline | `./scripts/apply-schema.sh --check \| grep '^-- '` | `-- 001_rr_schema.sql batch 1/6` to `6/6`, `-- 002_users.sql batch 1/1`, `-- 003_backend_identity.sql batch 1/2` and `2/2` |
| 6 | offline | `./scripts/ci-local.sh` | ends with `ci-local: all checks passed` |
| 7 | laptop, RR-36, after the first setup run | `az login`, then `export SQL_SERVER=... SQL_DATABASE=...` (the backend's values, from your own `.env`), then `./scripts/apply-schema.sh` | `Target database: <name>`, 9 `apply` lines, `done: 9 batches in 3 files`, exit 0 |
| 8 | laptop, RR-36 | `./scripts/apply-schema.sh --verify` | four table rows with counts, three `GRANT` rows for the backend identity |
| 9 | laptop, RR-36 | run gate 7 again | same output, no error (idempotence) |
| 10 | laptop, RR-36 | `./scripts/setup-github-deploy.sh`, then `az role assignment list --all --assignee "$(az identity show -g rg-chatbot -n id-restaurant-researcher-gh-deploy --query principalId -o tsv)" --query "[].{role:roleDefinitionName, scope:scope}" -o table` | `Managed Identity Operator` on both identities, `Container Apps Contributor` on api, agent and web, `AcrPush` on the registry |

Gate 10 before `Deploy infra` runs shows the roles on both identities, the custom role and the infra identity, and no api or agent roles (skip lines for the two apps); that is correct. After `Deploy infra` and a second setup run the api and agent roles appear. The role list of the infra identity (`az role assignment list --assignee <infra identity principal id>`) shows only the custom role at the resource group, plus `Managed Identity Operator` on the two existing identities.

## Risks and open questions

1. **Owner, yes/no:** "Are you the Microsoft Entra admin of the shared SQL server, or a member of its admin group?" Without it `CREATE USER ... FROM EXTERNAL PROVIDER` fails (Learn). Not verifiable from here. If no, the owner or RR-36 must name who runs `003`.
2. **Owner, yes/no:** "Is your laptop's current public IP allowed on the SQL server firewall, or may RR-36 add it for the run and remove it after?" A refusal (40615) is not retried. Adding a rule is an Azure change that needs his approval. I could not check the current firewall.
3. **Specialist or coordinator:** put the backend identity grant in this PR as `003_backend_identity.sql` (recommended) and close RR-24 or reduce it to "run the script"? The ticket scope does not mention a grant file; without it the schema script cannot give the apps access, and the only alternative is hand-typed SQL.
4. **Coordinator:** with owner 610/611 the backend identity now exists after the first setup run, so `003` no longer needs infra first. RR-36 order: `setup-github-deploy.sh` (identities, role), the Deploy workflow (builds the images), `Deploy infra` (RR-32), `setup-github-deploy.sh` again (per-app roles), `apply-schema.sh` and `--verify`, the Deploy workflow again. The apps tolerate a missing grant for a short time (cache reads fall back to Google, parent decision 4). RR-36's text needs the fix.
13. **Specialist:** scope of the setup script grows (three identities, a custom role, a federated credential) and so does its test file; check the PR size limit (25 files, 5000 lines) at plan time and split the infra-identity part into its own PR if needed. The role's exact action list is decided in the plan (RR-32 question 12).
5. **Coordinator or specialist:** size and scope. The ticket says about 120 lines; this design is about 170 hand-written plus tests (Python module about 100, wrapper about 15, `003` about 10, setup script about 10, docs about 10), under the 400-line rule. `--verify` and `003` are additions to the ticket text; the plan's Task 15 gate said `--check` should count table rows, while the ticket defines `--check` as "prints what would run". This spec follows the ticket and moves the row counts to `--verify`. Decide whether to keep `--verify` or drop it and verify by hand.
6. **Builder, before coding:** confirm `mssql_python.connect` in 1.12.0 accepts `token_provider` (Context7 shows it on the main branch only); otherwise use the documented fallback. Also confirm `app/__init__.py` and importing `tools` stay light, and that pyright is happy with `tools` included.
7. **Builder, live (RR-36):** the `40613` text match and the two verify queries were not run against a database; first run is RR-36. A wrong match only costs one manual re-run; a wrong query is a one-line fix.
8. **Interruption mid-run (Ctrl-C):** the connection is closed in `finally`; any applied batch stays, and re-running is safe.
9. **Owner, no action needed:** the first `CREATE USER` also depends on a unique display name for the identity in the tenant; `id-restaurant-researcher-backend` is unique by construction.
10. **Not run here:** `shellcheck`, `ruff`, `pyright`, any live command. The shell and Python snippets are specified, not executed.

## Files touched

- Modify: `scripts/setup-github-deploy.sh`, `scripts/tests/test-deploy-scripts.sh`, `deployment/README.md`, `CLAUDE.md`, `docs/development.md`, `backend/pyproject.toml` (pyright `include`).
- Create: `scripts/apply-schema.sh`, `backend/tools/apply_schema.py`, `backend/tests/test_apply_schema.py`, `backend/sql/003_backend_identity.sql`.

## Mermaid schematic

`../plans/diagrams/2026-11-22-backend-rollout-pipeline-setup-and-sql-schema.mmd`: owner laptop, GitHub, Azure identity and RBAC, data. Green is new, amber changed, grey unchanged, as boxes and arrows, with a legend.
