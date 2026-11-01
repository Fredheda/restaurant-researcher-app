"""Environment settings, read once at startup.

A missing variable fails fast with its name, so a misconfigured container
app stops at boot instead of failing on the first request.
"""

from collections.abc import Mapping
from dataclasses import dataclass
from typing import Literal

Role = Literal["api", "agent"]
ROLES: tuple[Role, ...] = ("api", "agent")

DEFAULT_OPENAI_MODEL = "gpt-5.6-luna"


class ConfigError(RuntimeError):
    """A required environment variable is missing or invalid."""


@dataclass(frozen=True)
class Settings:
    role: Role
    google_places_api_key: str
    openai_api_key: str | None
    openai_model: str
    sql_server: str | None
    sql_database: str | None
    azure_client_id: str | None
    app_env: str


def role_from_env(env: Mapping[str, str]) -> Role:
    role = env.get("APP_ROLE", "")
    if role not in ROLES:
        raise ConfigError(f"APP_ROLE must be one of {', '.join(ROLES)}; got {role!r}")
    return role  # type: ignore[return-value]


def _required(env: Mapping[str, str], name: str) -> str:
    value = env.get(name, "").strip()
    if not value:
        raise ConfigError(f"{name} is required")
    return value


def load_settings(env: Mapping[str, str], role: str) -> Settings:
    if role not in ROLES:
        raise ConfigError(f"APP_ROLE must be one of {', '.join(ROLES)}; got {role!r}")
    # The agent runs the same search service as the api (its search_places
    # tool), so both roles need the Places key; only the agent needs OpenAI.
    openai_key = (
        _required(env, "OPENAI_API_KEY")
        if role == "agent"
        else env.get("OPENAI_API_KEY")
    )
    google_key = _required(env, "GOOGLE_PLACES_API_KEY")
    sql_server = env.get("SQL_SERVER") or None
    sql_database = env.get("SQL_DATABASE") or None
    app_env = env.get("APP_ENV") or "production"
    if app_env == "local" and sql_server:
        raise ConfigError("APP_ENV=local is refused when SQL_SERVER is set")
    if sql_server and not sql_database:
        raise ConfigError("SQL_DATABASE is required when SQL_SERVER is set")
    return Settings(
        role=role,  # type: ignore[arg-type]
        google_places_api_key=google_key,
        openai_api_key=openai_key or None,
        openai_model=env.get("OPENAI_MODEL") or DEFAULT_OPENAI_MODEL,
        sql_server=sql_server,
        sql_database=sql_database,
        azure_client_id=env.get("AZURE_CLIENT_ID") or None,
        app_env=app_env,
    )
