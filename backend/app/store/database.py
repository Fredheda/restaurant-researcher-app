"""Passwordless Azure SQL connections with `mssql-python` (no ODBC package).

Deployed, `AZURE_CLIENT_ID` names the app's user-assigned identity and
`ActiveDirectoryMSI` is used; locally, `ActiveDirectoryDefault` picks up
`az login`.
"""

from collections.abc import Callable
from typing import Any

Connect = Callable[[], Any]


def connection_string(server: str, database: str, client_id: str | None) -> str:
    if client_id:
        auth = f"Authentication=ActiveDirectoryMSI;Uid={client_id};"
    else:
        auth = "Authentication=ActiveDirectoryDefault;"
    return f"Server={server};Database={database};{auth}Encrypt=yes;"


def make_connect(server: str, database: str, client_id: str | None) -> Connect:
    conn_str = connection_string(server, database, client_id)

    def connect() -> Any:
        import mssql_python  # imported here so tests never load the driver

        return mssql_python.connect(conn_str)

    return connect
