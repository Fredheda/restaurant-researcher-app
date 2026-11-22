# Backend rollout: the SQL schema script (plan)

- **Ticket:** RR-71
- **Repo:** `restaurant-researcher-app`
- **Tier:** non-trivial
- **Spec:** `docs/specs/2026-11-22-backend-rollout-pipeline-setup-and-sql-schema.md` (the RR-33 spec; this plan covers its section 2 and 3, the setup script is RR-33's plan `2026-11-22-backend-rollout-pipeline-setup-and-sql-schema.md`)
- **Status:** approved by the specialist, 2026-11-22
- **Date:** 2026-11-22
- **Schematic:** `diagrams/2026-11-22-backend-rollout-sql-schema-script.mmd`
- **Order:** branched from `main` after RR-33 (PR 1, the setup script) has merged. Both PRs edit `scripts/tests/test-deploy-scripts.sh` and `deployment/README.md`, and this PR's anchors below are written against RR-33's result. The owner alone runs the script; agents never do (except the offline `--dry-run` and `--check`).

## TL;DR

- Ships `scripts/apply-schema.sh` (wrapper) and `backend/tools/apply_schema.py`: applies `backend/sql/*.sql` in order, split on `GO`, through the backend's own Python environment as the owner's `az login`, with `--dry-run`, `--check` and `--verify`; plus `backend/sql/003_backend_identity.sql`, the backend identity's database user with schema-scoped rights.
- One PR, 10 files, about 700 changed lines (650 of them the module and its tests). Tests first: 33 offline pytest cases with a fake `connect` factory, one wrapper check in the deploy-script tests.
- No new dependency: `mssql-python` and `azure-identity` are already locked. Nothing here connects to a database; the real connection path is first exercised by the owner in RR-36.
- Owner actions: merge; later (RR-36, only after his explicit yes) run `./scripts/apply-schema.sh` and `--verify` from his laptop.
- Needs the RR-33 setup script to have run before the schema script does (it creates the backend identity that `003` refers to).
- Cost: no new metered resource; the one cost is the serverless SQL wake (below, prices unconfirmed).

## Cost estimate

No new Azure resource. Database users have no charge.

One cost: a schema run wakes the serverless database. Compute is billed per second while it is online and for the auto-pause delay after the last session; this shared database uses 60 minutes (spec, from the `deploying-azure-projects` skill), so one run keeps it online about an hour. Learn's billing page uses an illustrative $0.000145 per vCore-second; at a 0.5 vCore floor that is 1,800 vCore-seconds, about $0.26 per wake. At 1, 4 and 20 wakes a month that illustration gives about $0.26, $1.04 and $5.20, an upper bound that is zero when the database is awake anyway (the apps and other projects use it). **Unconfirmed:** the West Europe unit price, this database's minimum vCores, and whether the free offer (100,000 vCore-seconds a month, from a Q&A answer, not a pricing page) applies. Cost Management shows the real figure. Source: spec "Cost estimate" (Microsoft Learn, "Serverless compute tier billing for Azure SQL Database", fetched 2026-11-22).

## Architecture schematic

`diagrams/2026-11-22-backend-rollout-sql-schema-script.mmd` (Mermaid `flowchart TB`: owner laptop, Azure identity, data; green new, amber changed, grey unchanged, as boxes and arrows, with a legend).

## Decisions and facts that bind the code (checked 2026-11-22)

1. **Own PR and ticket** (the spec said one PR with the setup script): database tooling, no RBAC, reviewed separately from RR-33.
2. **SQL token path:** `mssql_python` 1.12.0 `connect` has no `token_provider` (checked with `inspect.signature` and a grep of the installed package: no hit). The runner gets the token from the locked `azure-identity` (`AzureCliCredential`, the `az login` session only, no environment credentials) and passes it as the ODBC access-token attribute 1256 through `attrs_before`, the same attribute the library sets itself for `Authentication=` connections (`mssql_python/connection.py`). `azure-identity` is a locked transitive dependency of `mssql-python`; no new dependency, no lock change.
3. **`--verify`** runs three read-only `SELECT`s: `SELECT DB_NAME()` (the database it reached), the table row counts, the schema rights. Exit 1 unless `INSERT`, `SELECT`, `UPDATE` on schema `rr` are `GRANT` for the backend identity.
4. **Commit and PR text rules** (workspace `AGENTS.md`, repo `AGENTS.md` shared block; repo `CLAUDE.md` only imports `AGENTS.md`, so repo facts are edited in `AGENTS.md`): commit messages two lines at most, no trailer of any kind; PR titles and descriptions never mention Claude Code; the PR description carries one `Comments: <path>: <reason>` line per file whose comment count grows.
5. **Base moved:** the pilot checkout this plan was verified against (HEAD `0b8a322`) has `AGENTS.md` as the repo facts file and no `scripts/rules/` yet. Before starting, run `ls scripts/rules` on `origin/main`: if `run.sh` exists, run it with `./scripts/ci-local.sh` (it includes it) and fix what it reports; the `comment-count` rule decides which `Comments:` lines are needed.
6. **Not verified live (no `az login`, no database):** `open_connection` with the access-token attribute; that the driver message contains `40613`; the two verify queries and `SELECT DB_NAME()`; the first `CREATE USER ... FROM EXTERNAL PROVIDER`. `CREATE USER ... FROM EXTERNAL PROVIDER` per Microsoft Learn ("Microsoft Entra authentication for Azure SQL") needs the Entra admin of the server to be the first to create Entra principals.

## Setup

- [ ] Confirm RR-33 (PR 1) has merged and the main checkout is on `main` with the merge pulled. This plan's edits to `scripts/tests/test-deploy-scripts.sh` anchor on lines RR-33 adds.
- [ ] Re-read the ticket comments on RR-71 and the RR-33 spec for name changes (`id-restaurant-researcher-backend`).
- [ ] Create the worktree (branch `rr-71-apply-schema`, slug `rr71-schema`):

```bash
git -C <workspace>/restaurant-researcher-app fetch origin
git -C <workspace>/restaurant-researcher-app worktree add ../.worktrees/restaurant-researcher-app-<slug> -b <branch> origin/main
```

Expected: `Preparing worktree (new branch '<branch>')` and `HEAD is now at <sha> ...`.

- [ ] In the worktree: `cd backend && poetry install --no-interaction --no-ansi`, and `cd ../frontend && npm ci --prefer-offline` only when running `./scripts/ci-local.sh` at the end (needs Node 26, see `AGENTS.md`).
- [ ] Before every `gh pr create` run the `auditing-branch-changes` skill and put its result into the PR-ready message and the ticket comment.

Files (10): `backend/tools/__init__.py` (empty), `backend/tools/apply_schema.py`, `backend/tests/test_apply_schema.py`, `backend/sql/003_backend_identity.sql`, `scripts/apply-schema.sh`, `backend/pyproject.toml`, `scripts/tests/test-deploy-scripts.sh`, `deployment/README.md`, `AGENTS.md`, `docs/development.md`. About 700 changed lines (650 of them the Python module and its tests).

## Task 1.1: tests first (Python)

- [ ] **Write** `backend/tests/test_apply_schema.py`

```python
import io
import re
from pathlib import Path
from typing import Any

import pytest

from tools import apply_schema
from tools.apply_schema import (
    BACKEND_IDENTITY,
    DATABASE_NAME_QUERY,
    SCHEMA_GRANTS_QUERY,
    SQL_DIR,
    TABLE_COUNTS_QUERY,
    SchemaError,
    connect_with_retry,
    list_sql_files,
    main,
    scrub,
    split_batches,
)

SERVER = "example-server.database.windows.net"
ENV = {"SQL_SERVER": SERVER, "SQL_DATABASE": "appdb"}
FULL_GRANTS = [
    (BACKEND_IDENTITY, "INSERT", "GRANT"),
    (BACKEND_IDENTITY, "SELECT", "GRANT"),
    (BACKEND_IDENTITY, "UPDATE", "GRANT"),
]


class FakeCursor:
    def __init__(self, conn: "FakeConnection") -> None:
        self.conn = conn
        self.description: list[tuple[str]] | None = None
        self.rows: list[tuple[Any, ...]] = []

    def execute(self, sql: str) -> None:
        self.conn.executed.append(sql)
        if self.conn.fail_on is not None and self.conn.fail_on in sql:
            raise RuntimeError(f"cannot reach {SERVER}: boom")
        if sql == DATABASE_NAME_QUERY:
            self.description, self.rows = [("name",)], [("appdb",)]
        elif sql == TABLE_COUNTS_QUERY:
            self.description, self.rows = (
                [("table_name",), ("row_count",)],
                [("users", 2)],
            )
        elif sql == SCHEMA_GRANTS_QUERY:
            self.description = [("name",), ("permission_name",), ("state_desc",)]
            self.rows = self.conn.grants
        else:
            self.description, self.rows = None, []

    def fetchall(self) -> list[tuple[Any, ...]]:
        return self.rows

    def close(self) -> None:
        pass


class FakeConnection:
    def __init__(
        self,
        fail_on: str | None = None,
        grants: list[tuple[str, str, str]] | None = None,
    ) -> None:
        self.fail_on = fail_on
        self.grants = FULL_GRANTS if grants is None else grants
        self.executed: list[str] = []
        self.closed = False

    def cursor(self) -> FakeCursor:
        return FakeCursor(self)

    def close(self) -> None:
        self.closed = True


class Run:
    def __init__(
        self,
        argv: list[str],
        env: dict[str, str],
        conn: FakeConnection | None = None,
        sql_dir: Path = SQL_DIR,
    ) -> None:
        self.conn = conn or FakeConnection()
        self.conn_strs: list[str] = []
        self.out = io.StringIO()
        self.err = io.StringIO()

        def connect(conn_str: str) -> FakeConnection:
            self.conn_strs.append(conn_str)
            return self.conn

        self.code = main(
            argv,
            env=env,
            connect=connect,
            sql_dir=sql_dir,
            sleep=lambda _: None,
            wait=0,
            out=self.out,
            err=self.err,
        )


def write_sql(directory: Path, files: dict[str, str]) -> Path:
    for name, text in files.items():
        (directory / name).write_text(text, encoding="utf-8")
    return directory


@pytest.mark.parametrize(
    "text",
    [
        "SELECT 1\nGO\nSELECT 2",
        "SELECT 1\ngo\nSELECT 2",
        "SELECT 1\n  Go  \nSELECT 2",
        "SELECT 1\r\nGO\r\nSELECT 2\r\n",
    ],
)
def test_go_in_any_case_and_crlf_splits(text: str) -> None:
    assert split_batches(text, "x.sql") == ["SELECT 1", "SELECT 2"]


def test_comment_and_goto_do_not_split() -> None:
    text = "SELECT 1\n-- GO\nGOTO done\nSELECT 2"
    assert split_batches(text, "x.sql") == [text]


@pytest.mark.parametrize("line", ["GO 5", "GO -- note"])
def test_go_with_an_argument_is_refused_naming_file_and_line(line: str) -> None:
    with pytest.raises(SchemaError, match=r"x\.sql line 3"):
        split_batches(f"SELECT 1\nGO\n{line}\nSELECT 2", "x.sql")


def test_empty_batches_are_skipped_and_the_last_batch_without_go_runs() -> None:
    assert split_batches("GO\n\n  \nGO\nSELECT 1\nGO\nSELECT 2", "x.sql") == [
        "SELECT 1",
        "SELECT 2",
    ]


def test_files_are_sorted_and_non_sql_files_ignored(tmp_path: Path) -> None:
    write_sql(
        tmp_path, {"002_b.sql": "", "001_a.sql": "", "notes.md": "", "010_c.sql": ""}
    )
    assert [p.name for p in list_sql_files(tmp_path)] == [
        "001_a.sql",
        "002_b.sql",
        "010_c.sql",
    ]


@pytest.mark.parametrize(
    "names",
    [["1_x.sql"], ["001_X.sql"], ["001_a.sql", "001_b.sql"], []],
)
def test_bad_name_duplicate_prefix_and_empty_directory_are_refused(
    tmp_path: Path, names: list[str]
) -> None:
    write_sql(tmp_path, {name: "" for name in names})
    with pytest.raises(SchemaError):
        list_sql_files(tmp_path)


def test_real_files_split_and_every_create_or_alter_batch_is_guarded() -> None:
    plan = apply_schema.load_plan(SQL_DIR)
    assert plan
    for name, batches in plan:
        for batch in batches:
            code = re.sub(r"--[^\n]*", "", batch)
            if re.search(r"\b(CREATE|ALTER)\b", code, re.IGNORECASE):
                assert re.search(r"\bIF\b", code, re.IGNORECASE), (
                    f"{name}: unguarded DDL"
                )


def test_run_applies_batches_in_order_on_one_connection_and_closes_it(
    tmp_path: Path,
) -> None:
    write_sql(
        tmp_path, {"002_b.sql": "SELECT 3", "001_a.sql": "SELECT 1\nGO\nSELECT 2"}
    )
    run = Run([], ENV, sql_dir=tmp_path)
    assert run.code == 0
    assert run.conn.executed == ["SELECT 1", "SELECT 2", "SELECT 3"]
    assert run.conn.closed
    assert run.conn_strs == [f"Server={SERVER};Database=appdb;Encrypt=yes;"]
    assert run.out.getvalue().splitlines() == [
        "Target database: appdb",
        "apply 001_a.sql batch 1/2",
        "apply 001_a.sql batch 2/2",
        "apply 002_b.sql batch 1/1",
        "done: 3 batches in 2 files",
    ]


def test_first_failing_batch_stops_the_run_and_hides_the_server(tmp_path: Path) -> None:
    write_sql(
        tmp_path,
        {"001_a.sql": "SELECT 1\nGO\nBOOM\nGO\nSELECT 3", "002_b.sql": "SELECT 4"},
    )
    run = Run([], ENV, conn=FakeConnection(fail_on="BOOM"), sql_dir=tmp_path)
    assert run.code == 1
    assert run.conn.executed == ["SELECT 1", "BOOM"]
    assert run.conn.closed
    assert (
        "FAILED 001_a.sql batch 2/3: RuntimeError: cannot reach <server>: boom"
        in run.err.getvalue()
    )
    assert SERVER not in run.err.getvalue() + run.out.getvalue()


def test_unsupported_go_stops_before_any_connection(tmp_path: Path) -> None:
    write_sql(tmp_path, {"001_a.sql": "SELECT 1\nGO 2"})
    run = Run([], ENV, sql_dir=tmp_path)
    assert run.code == 1
    assert run.conn_strs == []
    assert "001_a.sql line 2" in run.err.getvalue()


class Flaky:
    def __init__(self, failures: list[str]) -> None:
        self.failures = failures
        self.calls = 0

    def __call__(self, conn_str: str) -> str:
        self.calls += 1
        if self.failures:
            raise RuntimeError(self.failures.pop(0))
        return "connection"


def test_resuming_database_is_retried_with_the_given_wait() -> None:
    waits: list[float] = []
    lines: list[str] = []
    flaky = Flaky(["error 40613 (not available)", "error 40613 (not available)"])
    assert (
        connect_with_retry(flaky, "cs", lines.append, waits.append, 7.5) == "connection"
    )
    assert flaky.calls == 3
    assert waits == [7.5, 7.5]
    assert lines == [
        "database is resuming, attempt 1/8",
        "database is resuming, attempt 2/8",
    ]


def test_other_connect_errors_are_not_retried() -> None:
    flaky = Flaky(["error 40615 (firewall)"])
    with pytest.raises(RuntimeError, match="40615"):
        connect_with_retry(flaky, "cs", print, lambda _: None, 0)
    assert flaky.calls == 1


def test_retry_gives_up_after_eight_attempts() -> None:
    flaky = Flaky(["40613"] * 20)
    with pytest.raises(RuntimeError, match="40613"):
        connect_with_retry(flaky, "cs", print, lambda _: None, 0)
    assert flaky.calls == 8


def test_failed_connect_exits_1_with_a_scrubbed_message(tmp_path: Path) -> None:
    write_sql(tmp_path, {"001_a.sql": "SELECT 1"})
    err = io.StringIO()

    def connect(conn_str: str) -> Any:
        raise RuntimeError(f"login to {SERVER} failed")

    code = main(
        [], env=ENV, connect=connect, sql_dir=tmp_path, out=io.StringIO(), err=err
    )
    assert code == 1
    assert err.getvalue() == "FAILED connect: RuntimeError: login to <server> failed\n"


def test_scrub_replaces_the_host_inside_a_server_value() -> None:
    assert (
        scrub(f"x tcp:{SERVER},1433 y {SERVER}", f"tcp:{SERVER},1433")
        == "x <server> y <server>"
    )


def test_dry_run_prints_names_only_without_variables_or_connection() -> None:
    run = Run(["--dry-run"], {})
    assert run.code == 0
    assert run.out.getvalue().splitlines() == [
        "001_rr_schema.sql",
        "002_users.sql",
        "003_backend_identity.sql",
    ]
    assert run.conn_strs == []


def test_check_prints_every_batch_without_variables_or_connection() -> None:
    run = Run(["--check"], {})
    assert run.code == 0
    headers = [
        line for line in run.out.getvalue().splitlines() if line.startswith("-- 0")
    ]
    assert headers[0] == "-- 001_rr_schema.sql batch 1/6"
    assert headers[-1] == "-- 003_backend_identity.sql batch 2/2"
    assert len(headers) == 9
    assert run.conn_strs == []


@pytest.mark.parametrize("argv", [[], ["--verify"]])
def test_missing_variables_exit_2_naming_them(argv: list[str]) -> None:
    run = Run(argv, {"SQL_DATABASE": "appdb"})
    assert run.code == 2
    assert "SQL_SERVER" in run.err.getvalue()
    assert "SQL_DATABASE" not in run.err.getvalue()
    assert run.conn_strs == []


@pytest.mark.parametrize("argv", [["--check", "--verify"], ["--nope"]])
def test_two_flags_or_an_unknown_flag_exit_2(argv: list[str]) -> None:
    assert Run(argv, ENV).code == 2


def test_verify_queries_are_read_only() -> None:
    for query in (DATABASE_NAME_QUERY, TABLE_COUNTS_QUERY, SCHEMA_GRANTS_QUERY):
        assert query.startswith("SELECT")


def test_verify_prints_the_connection_first_and_passes_with_all_three_grants() -> None:
    run = Run(["--verify"], ENV)
    lines = run.out.getvalue().splitlines()
    assert run.code == 0
    assert lines[0] == "Connected. Database reached: appdb"
    assert f"{BACKEND_IDENTITY}\tSELECT\tGRANT" in lines
    assert run.conn.executed == [
        DATABASE_NAME_QUERY,
        TABLE_COUNTS_QUERY,
        SCHEMA_GRANTS_QUERY,
    ]
    assert run.conn.closed


@pytest.mark.parametrize(
    "grants",
    [
        FULL_GRANTS[:2],
        [
            (BACKEND_IDENTITY, "INSERT", "GRANT"),
            (BACKEND_IDENTITY, "SELECT", "GRANT"),
            (BACKEND_IDENTITY, "UPDATE", "DENY"),
        ],
        [
            ("someone-else", "INSERT", "GRANT"),
            ("someone-else", "SELECT", "GRANT"),
            ("someone-else", "UPDATE", "GRANT"),
        ],
    ],
)
def test_verify_fails_when_a_grant_is_missing_denied_or_belongs_to_another_user(
    grants: list[tuple[str, str, str]],
) -> None:
    run = Run(["--verify"], ENV, conn=FakeConnection(grants=grants))
    assert run.code == 1
    assert "MISSING grants for" in run.err.getvalue()
```

- [ ] Run red:

```bash
cd backend && poetry run pytest tests/test_apply_schema.py -q
```

Expected (verified in a scratch copy): `ModuleNotFoundError: No module named 'tools'` at collection, `1 error in 0.10s`, exit 2.

- [ ] Commit (tests only): `git add backend/tests/test_apply_schema.py && git commit -m "Test the schema runner: GO splitting, file order, retry, verify"`

## Task 1.2: the module, `003` and the pyright include

- [ ] **Write** `backend/tools/__init__.py` with empty content.

- [ ] **Write** `backend/sql/003_backend_identity.sql`

```sql
IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = N'id-restaurant-researcher-backend')
    CREATE USER [id-restaurant-researcher-backend] FROM EXTERNAL PROVIDER;
GO

GRANT SELECT, INSERT, UPDATE ON SCHEMA::rr TO [id-restaurant-researcher-backend];
GO
```

- [ ] **Write** `backend/tools/apply_schema.py`

```python
import argparse
import os
import re
import struct
import sys
import time
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Any, TextIO

SQL_DIR = Path(__file__).resolve().parent.parent / "sql"
FILE_NAME = re.compile(r"^\d{3}_[a-z0-9_]+\.sql$")
GO_LINE = re.compile(r"^\s*go\s*$", re.IGNORECASE)
GO_WITH_ARGUMENT = re.compile(r"^\s*go\s+\S", re.IGNORECASE)

SQL_SCOPE = "https://database.windows.net/.default"
SQL_COPT_SS_ACCESS_TOKEN = 1256
DATABASE_RESUMING = "40613"
CONNECT_ATTEMPTS = 8
CONNECT_WAIT_SECONDS = 15.0

BACKEND_IDENTITY = "id-restaurant-researcher-backend"
REQUIRED_PERMISSIONS = frozenset({"INSERT", "SELECT", "UPDATE"})

DATABASE_NAME_QUERY = "SELECT DB_NAME()"
TABLE_COUNTS_QUERY = (
    "SELECT t.name AS table_name, SUM(p.rows) AS row_count "
    "FROM sys.tables t JOIN sys.partitions p "
    "ON p.object_id = t.object_id AND p.index_id IN (0, 1) "
    "WHERE t.schema_id = SCHEMA_ID('rr') GROUP BY t.name ORDER BY t.name"
)
SCHEMA_GRANTS_QUERY = (
    "SELECT pr.name, pe.permission_name, pe.state_desc "
    "FROM sys.database_permissions pe JOIN sys.database_principals pr "
    "ON pr.principal_id = pe.grantee_principal_id "
    "WHERE pe.class = 3 AND pe.major_id = SCHEMA_ID('rr') "
    "ORDER BY pr.name, pe.permission_name"
)

Connect = Callable[[str], Any]
Plan = list[tuple[str, list[str]]]


class SchemaError(Exception):
    pass


@dataclass(frozen=True)
class Settings:
    server: str
    database: str


def list_sql_files(directory: Path) -> list[Path]:
    files = sorted(p for p in directory.iterdir() if p.suffix == ".sql")
    if not files:
        raise SchemaError(f"no .sql files in {directory.name}/")
    prefixes: dict[str, str] = {}
    for path in files:
        if not FILE_NAME.match(path.name):
            raise SchemaError(f"bad file name {path.name}: expected NNN_name.sql")
        prefix = path.name[:3]
        if prefix in prefixes:
            raise SchemaError(
                f"{path.name} and {prefixes[prefix]} share the prefix {prefix}"
            )
        prefixes[prefix] = path.name
    return files


def split_batches(text: str, name: str) -> list[str]:
    batches: list[str] = []
    current: list[str] = []

    def flush() -> None:
        batch = "\n".join(current).strip()
        if batch:
            batches.append(batch)
        current.clear()

    for number, line in enumerate(text.splitlines(), start=1):
        if GO_LINE.match(line):
            flush()
        elif GO_WITH_ARGUMENT.match(line):
            raise SchemaError(
                f"{name} line {number}: GO with an argument is not supported"
            )
        else:
            current.append(line)
    flush()
    return batches


def load_plan(directory: Path) -> Plan:
    return [
        (path.name, split_batches(path.read_text(encoding="utf-8"), path.name))
        for path in list_sql_files(directory)
    ]


def scrub(message: str, server: str) -> str:
    host = server.removeprefix("tcp:").split(",")[0]
    for name in sorted({server, host}, key=len, reverse=True):
        if name:
            message = message.replace(name, "<server>")
    return message


def open_connection(conn_str: str) -> Any:
    import mssql_python  # imported here so tests never load the driver
    from azure.identity import AzureCliCredential

    token = AzureCliCredential().get_token(SQL_SCOPE).token.encode("UTF-16-LE")
    token_struct = struct.pack(f"<I{len(token)}s", len(token), token)
    return mssql_python.connect(
        conn_str,
        autocommit=True,
        attrs_before={SQL_COPT_SS_ACCESS_TOKEN: token_struct},
    )


def connect_with_retry(
    connect: Connect,
    conn_str: str,
    say: Callable[[str], None],
    sleep: Callable[[float], None],
    wait: float,
) -> Any:
    for attempt in range(1, CONNECT_ATTEMPTS):
        try:
            return connect(conn_str)
        except Exception as exc:
            if DATABASE_RESUMING not in str(exc):
                raise
            say(f"database is resuming, attempt {attempt}/{CONNECT_ATTEMPTS}")
            sleep(wait)
    return connect(conn_str)


def execute(conn: Any, sql: str) -> tuple[list[str], list[tuple[Any, ...]]] | None:
    cursor = conn.cursor()
    try:
        cursor.execute(sql)
        if cursor.description is None:
            return None
        columns = [column[0] for column in cursor.description]
        return columns, [tuple(row) for row in cursor.fetchall()]
    finally:
        cursor.close()


def print_rows(result: tuple[list[str], list[tuple[Any, ...]]], out: TextIO) -> None:
    columns, rows = result
    print("\t".join(columns), file=out)
    for row in rows:
        print("\t".join(str(value) for value in row), file=out)


def apply_plan(
    conn: Any, plan: Plan, settings: Settings, out: TextIO, err: TextIO
) -> int:
    total = 0
    for name, batches in plan:
        for number, batch in enumerate(batches, start=1):
            print(f"apply {name} batch {number}/{len(batches)}", file=out)
            try:
                result = execute(conn, batch)
            except Exception as exc:
                message = scrub(str(exc), settings.server)
                print(
                    f"FAILED {name} batch {number}/{len(batches)}: "
                    f"{type(exc).__name__}: {message}",
                    file=err,
                )
                return 1
            if result is not None:
                print_rows(result, out)
            total += 1
    print(f"done: {total} batches in {len(plan)} files", file=out)
    return 0


def verify(conn: Any, out: TextIO, err: TextIO) -> int:
    database = execute(conn, DATABASE_NAME_QUERY)
    name = database[1][0][0] if database else "unknown"
    print(f"Connected. Database reached: {name}", file=out)
    counts = execute(conn, TABLE_COUNTS_QUERY)
    grants = execute(conn, SCHEMA_GRANTS_QUERY)
    for result in (counts, grants):
        if result is not None:
            print_rows(result, out)
    granted = {
        row[1]
        for row in (grants[1] if grants else [])
        if row[0] == BACKEND_IDENTITY and row[2] == "GRANT"
    }
    missing = sorted(REQUIRED_PERMISSIONS - granted)
    if missing:
        print(f"MISSING grants for {BACKEND_IDENTITY}: {', '.join(missing)}", file=err)
        return 1
    return 0


def read_settings(env: Mapping[str, str]) -> Settings | list[str]:
    missing = [key for key in ("SQL_SERVER", "SQL_DATABASE") if not env.get(key)]
    if missing:
        return missing
    return Settings(server=env["SQL_SERVER"], database=env["SQL_DATABASE"])


def parse_mode(argv: Sequence[str]) -> str | None:
    parser = argparse.ArgumentParser(prog="apply-schema.sh")
    group = parser.add_mutually_exclusive_group()
    for flag in ("dry-run", "check", "verify"):
        group.add_argument(f"--{flag}", dest="mode", action="store_const", const=flag)
    try:
        return parser.parse_args(argv).mode or "apply"
    except SystemExit:
        return None


def main(
    argv: Sequence[str],
    env: Mapping[str, str] = os.environ,
    connect: Connect = open_connection,
    sql_dir: Path = SQL_DIR,
    sleep: Callable[[float], None] = time.sleep,
    wait: float = CONNECT_WAIT_SECONDS,
    out: TextIO = sys.stdout,
    err: TextIO = sys.stderr,
) -> int:
    mode = parse_mode(argv)
    if mode is None:
        return 2

    try:
        plan = load_plan(sql_dir)
    except SchemaError as exc:
        print(f"ERROR: {exc}", file=err)
        return 1

    if mode == "dry-run":
        for name, _ in plan:
            print(name, file=out)
        return 0
    if mode == "check":
        for name, batches in plan:
            for number, batch in enumerate(batches, start=1):
                print(f"-- {name} batch {number}/{len(batches)}", file=out)
                print(batch, file=out)
        return 0

    settings = read_settings(env)
    if isinstance(settings, list):
        print(f"ERROR: set {', '.join(settings)} in the environment", file=err)
        return 2
    if mode == "apply":
        print(f"Target database: {settings.database}", file=out)

    conn_str = f"Server={settings.server};Database={settings.database};Encrypt=yes;"
    try:
        conn = connect_with_retry(
            connect, conn_str, lambda line: print(line, file=out), sleep, wait
        )
    except Exception as exc:
        message = scrub(str(exc), settings.server)
        print(f"FAILED connect: {type(exc).__name__}: {message}", file=err)
        return 1
    try:
        if mode == "verify":
            return verify(conn, out, err)
        return apply_plan(conn, plan, settings, out, err)
    finally:
        conn.close()


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
```

- [ ] **Edit** `backend/pyproject.toml`

old:
```
include = ["app", "tests"]
```
new:
```
include = ["app", "tests", "tools"]
```

- [ ] Run green and the backend gates:

```bash
cd backend
poetry run pytest tests/test_apply_schema.py -q
poetry run pytest -q
poetry run ruff check . && poetry run ruff format --check .
poetry run pyright
```

Expected (verified in a scratch copy with the repo's pinned tools): `33 passed`; full run `164 passed` (131 older + 33 new, warnings about pytest-asyncio loop scope are pre-existing); `All checks passed!`; `41 files already formatted`; `0 errors, 0 warnings, 0 informations`.

- [ ] Offline command checks (no database, no login):

```bash
cd backend
poetry run python -m tools.apply_schema --dry-run
poetry run python -m tools.apply_schema --check | grep '^-- [0-9]'
env -u SQL_SERVER -u SQL_DATABASE poetry run python -m tools.apply_schema; echo rc=$?
poetry run python -m tools.apply_schema --check --verify; echo rc=$?
```

Expected: three names (`001_rr_schema.sql`, `002_users.sql`, `003_backend_identity.sql`); nine header lines `-- 001_rr_schema.sql batch 1/6` to `-- 003_backend_identity.sql batch 2/2`; `ERROR: set SQL_SERVER, SQL_DATABASE in the environment` then `rc=2`; an argparse `not allowed with argument --check` message and `rc=2`. (All four verified.) Never run it without `--dry-run` or `--check` in the agent session: the unflagged and `--verify` forms try to open a connection with the caller's `az login`.

- [ ] Commit: `git add backend && git commit -m "Add the schema runner and the backend identity's database user"`

## Task 1.3: the shell wrapper and its test

- [ ] **Edit** `scripts/tests/test-deploy-scripts.sh` (fake `poetry`, after the fake `gh`)

old:
```
chmod +x "$tmp/bin/gh"
```
new:
```
chmod +x "$tmp/bin/gh"
cat >"$tmp/bin/poetry" <<'EOF'
#!/usr/bin/env bash
echo "$PWD $*" >> "$FAKE_LOG.poetry"
EOF
chmod +x "$tmp/bin/poetry"
```

- [ ] **Edit** `scripts/tests/test-deploy-scripts.sh` (the wrapper check, after RR-33's last setup check)

old:
```
check "setup stays quiet when all four environment secrets exist" not printed "environment secret missing"
```
new:
```
check "setup stays quiet when all four environment secrets exist" not printed "environment secret missing"

# --- apply-schema ---------------------------------------------------------

run ./scripts/apply-schema.sh --check
check "apply-schema runs the module from backend/ and passes the flags on" \
  grep -qx "$ROOT/backend run python -m tools.apply_schema --check" "$LOG.poetry"
```

- [ ] Run red: `./scripts/tests/test-deploy-scripts.sh | grep -E 'FAIL|failed'`. Expected: `FAIL  apply-schema runs the module from backend/ and passes the flags on` and `deploy script tests: 1 failed` (the script does not exist yet).

- [ ] **Write** `scripts/apply-schema.sh`

```bash
#!/usr/bin/env bash
# Owner only: needs the caller's `az login`, SQL_SERVER and SQL_DATABASE in the
# shell, and the caller's IP on the SQL server firewall. Agents never run it.
#
# Usage: ./scripts/apply-schema.sh [--dry-run | --check | --verify]
set -euo pipefail
cd "$(dirname "$0")/../backend"
exec poetry run python -m tools.apply_schema "$@"
```

- [ ] Make it executable and record the mode: `chmod +x scripts/apply-schema.sh && git add --chmod=+x scripts/apply-schema.sh`
- [ ] Run green: `./scripts/tests/test-deploy-scripts.sh | tail -1` (expected `deploy script tests: all passed`, 103 PASS lines: RR-33's 102 plus this check) and `shellcheck -x -S warning scripts/*.sh scripts/lib/*.sh scripts/tests/*.sh` (no output).
- [ ] Commit: `git add scripts && git commit -m "Add apply-schema.sh, a wrapper around the schema runner"`

## Task 1.4: docs (acceptance criterion)

- [ ] **Edit** `deployment/README.md` (table row; the table is unchanged by RR-33, whose README edits are in the "One-time setup" paragraph and the paragraphs after it)

old:
```
| Approve a new user | `./scripts/approve-user.sh <email>` |
```
new:
```
| Approve a new user | `./scripts/approve-user.sh <email>` |
| SQL schema and the backend identity's database user (owner only; needs `az login`, `SQL_SERVER` and `SQL_DATABASE` in the shell, and your IP on the SQL server firewall) | `./scripts/apply-schema.sh` (idempotent, re-run freely); `--dry-run` lists the files and `--check` prints the batches, both offline; `--verify` is read only and fails when the backend identity lacks its rights on schema `rr` |
```

- [ ] **Edit** `AGENTS.md` (Commands block)

old:
```
./scripts/tests/test-supply-chain.sh                      # supply-chain guard
```
new:
```
./scripts/tests/test-supply-chain.sh                      # supply-chain guard
./scripts/apply-schema.sh --check                         # SQL batches, offline
```

- [ ] **Edit** `AGENTS.md` (gotcha)

old:
```
- `backend/sql/` scripts are idempotent and applied by hand by the owner; agents and the apps never run DDL.
```
new:
```
- `backend/sql/` scripts are idempotent and applied by the owner with `./scripts/apply-schema.sh` (his `az login`; `--verify` checks the backend identity's rights); agents and the apps never run DDL or that script, except `--dry-run` and `--check`, which are offline.
```

- [ ] **Edit** `docs/development.md`

old:
```
The schema scripts in `backend/sql/` are idempotent and applied by hand by the owner before the first deploy; the apps never run DDL.
```
new:
```
The schema scripts in `backend/sql/` are idempotent and applied by the owner before the first deploy with `./scripts/apply-schema.sh`: it needs `az login`, `SQL_SERVER` and `SQL_DATABASE` in the shell and the caller's IP on the SQL server firewall; `--dry-run` and `--check` need none of them, and `--verify` only reads. `003_backend_identity.sql` needs the signed-in user to be the server's Microsoft Entra admin. The apps never run DDL.
```

- [ ] Re-read `README.md`, `AGENTS.md` and `docs/development.md` for other statements about applying the schema (`grep -n -i "sql/\|by hand\|schema" README.md AGENTS.md docs/development.md deployment/README.md`) and fix any that are now wrong. Do not touch the shared block of `AGENTS.md` (between `<!-- shared:start -->` and `<!-- shared:end -->`).
- [ ] Commit: `git add deployment/README.md AGENTS.md docs/development.md && git commit -m "Document apply-schema.sh"`

## Task 1.5: owner-runnable gates

Marked **offline** (no Azure, runs in the agent sandbox and on the laptop) or **laptop** (needs `az login` and the live database; owner only, RR-36, needs his explicit yes; the agent sandbox cannot and must not run these).

| # | Gate | Command | Expected |
|---|---|---|---|
| 1 | offline | `cd backend && poetry run pytest tests/test_apply_schema.py -q` | `33 passed` |
| 2 | offline | `./scripts/tests/test-deploy-scripts.sh \| tail -1` | `deploy script tests: all passed` |
| 3 | offline | `shellcheck -x -S warning scripts/*.sh scripts/lib/*.sh scripts/tests/*.sh` | no output, exit 0 |
| 4 | offline | `./scripts/apply-schema.sh --dry-run` | `001_rr_schema.sql`, `002_users.sql`, `003_backend_identity.sql` |
| 5 | offline | `./scripts/apply-schema.sh --check \| grep '^-- [0-9]'` | `-- 001_rr_schema.sql batch 1/6` to `6/6`, `-- 002_users.sql batch 1/1`, `-- 003_backend_identity.sql batch 1/2` and `2/2` (the spec's `grep '^-- '` also matches SQL comment lines) |
| 6 | offline | `./scripts/ci-local.sh` | ends with `ci-local: all checks passed` |
| 7 | laptop, RR-36, owner only, after the setup script ran | `az login`, then `export SQL_SERVER=... SQL_DATABASE=...` (your own values), then `./scripts/apply-schema.sh` | `Target database: <name>`, nine `apply` lines, `done: 9 batches in 3 files`, exit 0. If it prints `database is resuming, attempt n/8`, wait; a `40615` firewall error needs your IP allowed first (an Azure change that needs your approval) |
| 8 | laptop, RR-36, owner only | `./scripts/apply-schema.sh --verify` | `Connected. Database reached: <name>`, four table rows (`places`, `search_results`, `searches`, `users`) with counts, three `GRANT` rows for `id-restaurant-researcher-backend` (`INSERT`, `SELECT`, `UPDATE`), exit 0; exit 1 and `MISSING grants for ...` otherwise |
| 9 | laptop, RR-36, owner only | gate 7 again | same output, no error (idempotence) |

Gate 7 needs the signed-in user to be the server's Microsoft Entra admin (or in its admin group): `CREATE USER ... FROM EXTERNAL PROVIDER` fails otherwise, after `001` and `002` applied cleanly. If the setup script has not run, `003` fails with "cannot find the principal"; run the setup script, then this script again.

## Task 1.6: cleanup commit (separate, last)

- `backend/tools/apply_schema.py`: one comment (`# imported here so tests never load the driver`, a constraint). Nothing to delete.
- `backend/tests/test_apply_schema.py`, `backend/sql/003_backend_identity.sql`, `backend/pyproject.toml`: no comments.
- `scripts/apply-schema.sh`: header states constraints only.
- `scripts/tests/test-deploy-scripts.sh`: RR-33 (PR 1) already removed the restating comments; verify with `grep -n '^ *#' scripts/tests/test-deploy-scripts.sh` that only the header, the `run` comment, the fake-`gh` comment and the `# --- ... ---` dividers (now including `# --- apply-schema ---`) remain. Nothing to delete.
- [ ] If the grep shows anything else, delete it with Edit in a commit `Remove comments that restate the code`; otherwise state "cleanup commit: nothing left to delete" in the PR description.

## Task 1.7: hand-over

- [ ] `auditing-branch-changes`, `./scripts/ci-local.sh` green, push, draft PR, wait for the draft's CI, `gh pr ready`, watch, fix review comments in one batched push, hand the URL to the coordinator, wait.
- [ ] PR description:

```
Adds scripts/apply-schema.sh (wrapper) and backend/tools/apply_schema.py: applies backend/sql/*.sql in order, split on GO, as the caller's az login, with --dry-run, --check and --verify (read only; exit 1 when the backend identity lacks INSERT, SELECT, UPDATE on schema rr). Adds 003_backend_identity.sql (database user for the backend identity, schema-scoped rights). Owner runs it; agents never do.

Tests: 33 offline pytest cases with a fake connect factory (red first: no module), one wrapper check in the deploy-script tests (red first: no script). ruff, pyright, shellcheck clean.
Docs: deployment/README.md, AGENTS.md, docs/development.md.
Comments: backend/tools/apply_schema.py: 1, a constraint (driver import deferred so tests never load it). scripts/apply-schema.sh: 3-line header stating who may run it and what it needs. scripts/tests/test-deploy-scripts.sh: +1 section divider (the fake poetry's shebang also counts).
Branch audit: <result>
Not run here: the real connection (token path via attrs_before, the 40613 text match, the two verify queries); first live run is RR-36.
```

- [ ] After the owner merges: worktree removed, branches deleted, main checkout on `main` with `git pull --ff-only`, ticket updated.

---

## Self-check against the spec

| Spec item | Where in this plan |
|---|---|
| `apply-schema.sh` modes, exit codes, GO rules, file rules, retry, scrub, verify | Tasks 1.1 and 1.2 (33 tests) |
| `003` file | Task 1.2; guard test over the real files |
| pyright include | Task 1.2 |
| Wrapper test with a fake `poetry` | Task 1.3 |
| Docs (README, AGENTS.md, development.md; the spec said `CLAUDE.md`, which now only imports `AGENTS.md`) | Task 1.4 |
| Gates with offline versus laptop marks | Task 1.5 |
| Spec text now wrong: `token_provider`, gate 5 grep, one PR | Decisions 1 and 2 and the gate 5 note; the spec should be corrected in the docs PR or left as history |

## Open questions and risks

1. **Owner (RR-36):** Entra admin of the SQL server? Laptop IP on the firewall (an Azure change needing his approval)? As in the spec.
2. **Coordinator:** this PR must start after RR-33 (PR 1) merged; RR-36's run order is setup script, Deploy workflow, `Deploy infra`, setup script again, then this script and `--verify` (the spec's Risks 4).
3. **Not verified (no `az login`, no database):** `open_connection` with the access-token attribute (the library sets the same attribute itself for `Authentication=` connections, so the path exists, but this exact call was not run); that the driver message contains `40613`; the two verify queries and `SELECT DB_NAME()`; the first `CREATE USER ... FROM EXTERNAL PROVIDER`. Every Python check and the whole shell suite were run in a scratch copy of current `main` with the repo's pinned `pytest`, `ruff`, `pyright` and system `shellcheck`; `./scripts/ci-local.sh` and `poetry install` were not run (the executor runs them).
4. **Spec-listed but dropped:** the spec's "no `--check` line count of tables" is moved to `--verify`, as the spec itself says.
