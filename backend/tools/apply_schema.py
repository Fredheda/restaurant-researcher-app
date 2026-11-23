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
