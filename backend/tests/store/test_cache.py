import asyncio
import logging
from datetime import UTC, datetime, timedelta

import pytest

from app.places.models import GooglePlace
from app.store.cache import (
    CachedPlace,
    InMemoryPlaceCache,
    StoredSearch,
    TimeoutCache,
)

T0 = datetime(2026, 11, 1, 12, 0, tzinfo=UTC)


class Clock:
    def __init__(self, now: datetime = T0) -> None:
        self.now = now

    def __call__(self) -> datetime:
        return self.now


def place(pid: str, name: str = "Koya") -> CachedPlace:
    google = GooglePlace(
        id=pid,
        name=name,
        address="",
        postcode=None,
        neighbourhood=None,
        lat=None,
        lng=None,
        rating=4.5,
        review_count=100,
        price_tier="££",
        open_now=True,
        photo_ref=None,
        type_label=None,
        types=(),
    )
    return CachedPlace(
        place=google, hygiene_rating=5, fetched_at=T0, hygiene_checked_at=T0
    )


def search(sid: str, user: str = "u1", key: str = "ramen|", at: datetime = T0):
    return StoredSearch(
        id=sid,
        user_id=user,
        query="ramen",
        origin=None,
        key=key,
        created_at=at,
        place_ids=("p1", "p2"),
    )


async def test_get_search_honours_max_age() -> None:
    cache = InMemoryPlaceCache()
    await cache.save(search("s1", at=T0 - timedelta(hours=25)), [])
    assert await cache.get_search("ramen|", timedelta(hours=24), now=T0) is None
    await cache.save(search("s2", at=T0 - timedelta(hours=1)), [])
    found = await cache.get_search("ramen|", timedelta(hours=24), now=T0)
    assert found is not None and found.id == "s2"


async def test_get_search_is_shared_across_users() -> None:
    cache = InMemoryPlaceCache()
    await cache.save(search("s1", user="alice"), [])
    found = await cache.get_search("ramen|", timedelta(hours=24), now=T0)
    assert found is not None and found.user_id == "alice"


async def test_get_search_by_id_only_for_its_owner() -> None:
    cache = InMemoryPlaceCache()
    await cache.save(search("s1", user="alice"), [])
    assert await cache.get_search_by_id("s1", "bob") is None
    found = await cache.get_search_by_id("s1", "alice")
    assert found is not None and found.place_ids == ("p1", "p2")


async def test_save_same_place_twice_keeps_one_row() -> None:
    cache = InMemoryPlaceCache()
    await cache.save(search("s1"), [place("p1", "Old")])
    await cache.save(search("s2"), [place("p1", "New")])
    assert len(cache.places) == 1
    assert cache.places["p1"].place.name == "New"


async def test_get_places_omits_unknown_ids() -> None:
    cache = InMemoryPlaceCache()
    await cache.save(search("s1"), [place("p1")])
    found = await cache.get_places(["p1", "nope"])
    assert list(found) == ["p1"]


class SlowCache(InMemoryPlaceCache):
    async def get_places(self, ids):
        await asyncio.sleep(5)
        return {}

    async def get_search(self, key, max_age, now=None):
        await asyncio.sleep(5)
        return None

    async def get_search_by_id(self, search_id, user_id):
        await asyncio.sleep(5)
        return None


class RaisingCache(InMemoryPlaceCache):
    async def get_places(self, ids):
        raise ConnectionError("db at host secret-server down")

    async def get_search(self, key, max_age, now=None):
        raise ConnectionError("db at host secret-server down")

    async def get_search_by_id(self, search_id, user_id):
        raise ConnectionError("db at host secret-server down")


async def test_timeout_cache_returns_empty_when_inner_hangs() -> None:
    cache = TimeoutCache(SlowCache(), read_timeout_s=0.05, lookup_timeout_s=0.05)
    loop = asyncio.get_running_loop()
    start = loop.time()
    assert await cache.get_places(["p1"]) == {}
    assert await cache.get_search("k", timedelta(hours=1)) is None
    assert await cache.get_search_by_id("s1", "u1") is None
    assert loop.time() - start < 1


async def test_timeout_cache_logs_only_the_exception_class(
    caplog: pytest.LogCaptureFixture,
) -> None:
    cache = TimeoutCache(RaisingCache(), read_timeout_s=1, lookup_timeout_s=1)
    with caplog.at_level(logging.WARNING):
        assert await cache.get_places(["p1"]) == {}
        assert await cache.get_search("k", timedelta(hours=1)) is None
        assert await cache.get_search_by_id("s1", "u1") is None
    assert "ConnectionError" in caplog.text
    assert "secret-server" not in caplog.text


async def test_timeout_cache_passes_results_through() -> None:
    inner = InMemoryPlaceCache()
    cache = TimeoutCache(inner, read_timeout_s=1, lookup_timeout_s=1)
    await cache.save(search("s1"), [place("p1")])
    assert list(await cache.get_places(["p1"])) == ["p1"]
    assert await cache.get_search_by_id("s1", "u1") is not None
