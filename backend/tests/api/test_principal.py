import pytest
from fastapi import HTTPException
from starlette.datastructures import Headers

from app.api.principal import DEV_PRINCIPAL, principal_from_headers
from app.config import ConfigError, load_settings
from app.store.users import Principal


def test_reads_the_three_easy_auth_headers() -> None:
    headers = Headers(
        {
            "x-ms-client-principal-id": "oid-1",
            "x-ms-client-principal-name": "someone",
            "x-ms-client-principal-idp": "aad",
        }
    )
    assert principal_from_headers(headers, local=False) == Principal(
        "oid-1", "someone", "aad"
    )


@pytest.mark.parametrize("value", [None, "", "   "])
def test_missing_or_blank_id_is_401(value: str | None) -> None:
    headers = Headers({} if value is None else {"x-ms-client-principal-id": value})
    with pytest.raises(HTTPException) as info:
        principal_from_headers(headers, local=False)
    assert info.value.status_code == 401


def test_overlong_id_is_401() -> None:
    headers = Headers({"x-ms-client-principal-id": "x" * 65})
    with pytest.raises(HTTPException):
        principal_from_headers(headers, local=False)


def test_local_mode_uses_the_dev_principal_when_headers_are_absent() -> None:
    assert principal_from_headers(Headers({}), local=True) == DEV_PRINCIPAL


def test_local_mode_with_sql_server_is_refused() -> None:
    env = {"GOOGLE_PLACES_API_KEY": "k", "APP_ENV": "local", "SQL_SERVER": "s"}
    with pytest.raises(ConfigError, match="APP_ENV=local"):
        load_settings(env, "api")
