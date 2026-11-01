import pytest
from httpx import ASGITransport, AsyncClient

from app.config import ConfigError, Role, load_settings, role_from_env
from app.main import create_app

API_ENV = {"GOOGLE_PLACES_API_KEY": "g-key"}
AGENT_ENV = {"OPENAI_API_KEY": "o-key"}


@pytest.mark.parametrize("role", ["api", "agent"])
async def test_health_is_ok_for_both_roles(role: Role) -> None:
    app = create_app(role)
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://t"
    ) as client:
        response = await client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_api_role_requires_google_key() -> None:
    with pytest.raises(ConfigError, match="GOOGLE_PLACES_API_KEY"):
        load_settings({}, "api")


def test_agent_role_requires_openai_key() -> None:
    with pytest.raises(ConfigError, match="OPENAI_API_KEY"):
        load_settings({}, "agent")


def test_settings_load_for_each_role() -> None:
    assert load_settings(API_ENV, "api").google_places_api_key == "g-key"
    assert load_settings(AGENT_ENV, "agent").openai_api_key == "o-key"


def test_unknown_role_is_rejected() -> None:
    with pytest.raises(ConfigError, match="APP_ROLE"):
        load_settings(API_ENV, "worker")
    with pytest.raises(ConfigError, match="APP_ROLE"):
        role_from_env({"APP_ROLE": "worker"})


def test_role_from_env_reads_app_role() -> None:
    assert role_from_env({"APP_ROLE": "agent"}) == "agent"
