from app.config import load_settings
from app.main import build_services
from app.store.cache import InMemoryPlaceCache, SqlPlaceCache, TimeoutCache
from app.store.users import InMemoryUserStore, SqlUserStore

BASE = {"GOOGLE_PLACES_API_KEY": "g-key"}


def test_without_sql_server_the_stores_are_in_memory() -> None:
    services = build_services(load_settings({**BASE, "APP_ENV": "local"}, "api"))
    assert isinstance(services.search.cache, InMemoryPlaceCache)
    assert isinstance(services.users, InMemoryUserStore)
    assert services.local is True


def test_with_sql_server_the_stores_are_sql_behind_timeouts() -> None:
    env = {**BASE, "SQL_SERVER": "srv", "SQL_DATABASE": "db"}
    services = build_services(load_settings(env, "api"))
    cache = services.search.cache
    assert isinstance(cache, TimeoutCache)
    assert isinstance(cache.inner, SqlPlaceCache)
    assert isinstance(services.users, SqlUserStore)
    assert services.local is False
