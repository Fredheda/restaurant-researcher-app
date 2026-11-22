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
