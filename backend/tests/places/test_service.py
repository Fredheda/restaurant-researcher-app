import asyncio
from datetime import UTC, datetime, timedelta

import pytest

from app.places.models import LatLng
from app.places.service import SearchError, SearchService, search_key
from app.store.cache import CachedPlace, InMemoryPlaceCache, TimeoutCache
from tests.fakes import FakeFhrs, FakePlaces, gplace
from tests.store.test_cache import RaisingCache, SlowCache

T0 = datetime(2026, 11, 1, 12, 0, tzinfo=UTC)


class Clock:
    def __init__(self) -> None:
        self.now = T0

    def __call__(self) -> datetime:
        return self.now


def make(places=None, fhrs=None, cache=None, clock=None):
    places = places or FakePlaces()
    fhrs = fhrs or FakeFhrs()
    cache = cache if cache is not None else InMemoryPlaceCache()
    clock = clock or Clock()
    service = SearchService(places, fhrs, cache, clock=clock)
    return service, places, fhrs, cache, clock


async def test_search_returns_cards_and_saves_the_search() -> None:
    service, places, _, cache, _ = make(
        FakePlaces([gplace("p1", photo="places/p1/photos/a")])
    )
    result = await service.search("Best  Ramen", None, "alice")
    await service.drain()
    [card] = result.places
    assert card["id"] == "p1"
    assert card["name"] == "Place p1"
    assert card["type"] == "Ramen restaurant"
    assert card["neighbourhood"] == "Soho"
    assert card["priceTier"] == "££"
    assert card["photo"] == "https://photos.example/a"
    assert card["hygieneRating"] == 5
    assert card["overview"] == {
        "rating": 4.5,
        "reviewCount": 100,
        "address": "1 Street, London W1D 4SQ",
        "openStatus": "Open now",
        "reviewQuotes": [],
    }
    assert result.query == "Best  Ramen"
    stored = await cache.get_search_by_id(result.id, "alice")
    assert stored is not None and stored.place_ids == ("p1",)


def test_search_key_normalises_query_and_origin() -> None:
    assert search_key(" Best  RAMEN ", None) == search_key("best ramen", "")
    assert search_key("ramen", "Canary Wharf") != search_key("ramen", None)


async def test_repeat_search_within_24h_makes_no_google_call() -> None:
    service, places, fhrs, _, clock = make()
    first = await service.search("ramen", None, "alice")
    await service.drain()
    clock.now = T0 + timedelta(hours=23)
    second = await service.search("RAMEN", None, "bob")
    assert len(places.search_calls) == 1
    assert len(fhrs.calls) == 1
    assert second.id != first.id
    assert [c["id"] for c in second.places] == ["p1"]


async def test_cache_hit_still_gives_the_user_their_own_search_row() -> None:
    service, _, _, cache, _ = make()
    await service.search("ramen", None, "alice")
    await service.drain()
    second = await service.search("ramen", None, "bob")
    await service.drain()
    assert await cache.get_search_by_id(second.id, "bob") is not None
    assert await cache.get_search_by_id(second.id, "alice") is None


async def test_search_list_older_than_24h_calls_google_again() -> None:
    service, places, _, _, clock = make()
    await service.search("ramen", None, "alice")
    await service.drain()
    clock.now = T0 + timedelta(hours=25)
    await service.search("ramen", None, "alice")
    assert len(places.search_calls) == 2


async def test_place_rows_older_than_30_days_are_refreshed() -> None:
    cache = InMemoryPlaceCache()
    aged, recent = T0 - timedelta(days=31), T0 - timedelta(days=29)
    old = CachedPlace(gplace("old"), 1, aged, aged)
    new = CachedPlace(gplace("new"), 4, recent, recent)
    cache.places = {"old": old, "new": new}
    fhrs = FakeFhrs(rating=5)
    service, _, _, _, _ = make(FakePlaces([gplace("old"), gplace("new")]), fhrs, cache)
    result = await service.search("ramen", None, "alice")
    await service.drain()
    by_id = {c["id"]: c for c in result.places}
    assert fhrs.calls == ["Place old"]
    assert by_id["old"]["hygieneRating"] == 5
    assert by_id["new"]["hygieneRating"] == 4
    # Both rows now hold the Google data fetched just now.
    assert cache.places["old"].fetched_at == T0
    assert cache.places["new"].fetched_at == T0


async def test_stored_search_with_a_stale_place_calls_google() -> None:
    service, places, _, cache, clock = make()
    await service.search("ramen", None, "alice")
    await service.drain()
    stale = cache.places["p1"]
    aged = T0 - timedelta(days=31)
    cache.places["p1"] = CachedPlace(stale.place, 5, aged, aged)
    clock.now = T0 + timedelta(hours=1)
    await service.search("ramen", None, "alice")
    assert len(places.search_calls) == 2


async def test_hanging_cache_does_not_block_the_search() -> None:
    cache = TimeoutCache(SlowCache(), read_timeout_s=0.05, lookup_timeout_s=0.05)
    service, _, _, _, _ = make(cache=cache)
    loop = asyncio.get_running_loop()
    start = loop.time()
    result = await service.search("ramen", None, "alice")
    assert loop.time() - start < 1.5
    assert [c["id"] for c in result.places] == ["p1"]


async def test_cold_database_costs_one_read_timeout_not_two() -> None:
    cache = TimeoutCache(SlowCache(), read_timeout_s=0.2, lookup_timeout_s=0.2)
    service, *_ = make(cache=cache)
    loop = asyncio.get_running_loop()
    start = loop.time()
    await service.search("ramen", None, "alice")
    assert loop.time() - start < 0.35


async def test_long_origin_is_capped_before_it_is_stored() -> None:
    service, _, _, cache, _ = make()
    result = await service.search("ramen", "x" * 500, "alice", wait_for_save=True)
    stored = await cache.get_search_by_id(result.id, "alice")
    assert stored is not None and stored.origin is not None
    assert len(stored.origin) == 200


async def test_raising_cache_still_answers_and_save_failure_is_contained() -> None:
    cache = TimeoutCache(RaisingCache(), read_timeout_s=1, lookup_timeout_s=1)

    async def broken_save(search, places):
        raise ConnectionError("db down")

    cache.save = broken_save  # type: ignore[method-assign]
    service, _, _, _, _ = make(cache=cache)
    result = await service.search("ramen", None, "alice")
    await service.drain()
    assert [c["id"] for c in result.places] == ["p1"]


async def test_wait_for_save_persists_before_returning() -> None:
    service, _, _, cache, _ = make()
    result = await service.search("ramen", None, "alice", wait_for_save=True)
    assert await cache.get_search_by_id(result.id, "alice") is not None
    assert result.saved is True


async def test_wait_for_save_still_answers_when_save_fails() -> None:
    cache = InMemoryPlaceCache()

    async def broken_save(search, places):
        raise ConnectionError("db down")

    cache.save = broken_save  # type: ignore[method-assign]
    service, _, _, _, _ = make(cache=cache)
    result = await service.search("ramen", None, "alice", wait_for_save=True)
    assert result.places
    assert result.saved is False


async def test_ranking_rating_then_review_count_unrated_last() -> None:
    places = FakePlaces(
        [
            gplace("none", rating=None, reviews=500),
            gplace("a", rating=4.5, reviews=50),
            gplace("b", rating=4.8, reviews=20),
            gplace("c", rating=4.5, reviews=900),
            gplace("d", rating=4.0, reviews=30),
            gplace("e", rating=3.9, reviews=40),
        ]
    )
    service, *_ = make(places)
    result = await service.search("ramen", None, "alice")
    assert [c["id"] for c in result.places] == ["b", "c", "a", "d", "e", "none"]


async def test_few_reviews_dropped_when_five_remain() -> None:
    places = FakePlaces(
        [gplace("tiny", rating=5.0, reviews=3)]
        + [gplace(f"p{i}", rating=4.0, reviews=10 + i) for i in range(5)]
    )
    service, *_ = make(places)
    result = await service.search("ramen", None, "alice")
    ids = [c["id"] for c in result.places]
    assert "tiny" not in ids
    assert len(ids) == 5


async def test_few_reviews_kept_when_fewer_than_five_would_remain() -> None:
    places = FakePlaces(
        [gplace("tiny", rating=5.0, reviews=3)]
        + [gplace(f"p{i}", rating=4.0, reviews=100) for i in range(4)]
    )
    service, *_ = make(places)
    result = await service.search("ramen", None, "alice")
    assert result.places[0]["id"] == "tiny"
    assert len(result.places) == 5


async def test_minimal_place_renders_with_nulls() -> None:
    bare = gplace("bare", rating=None, reviews=None, open_now=None, postcode=None)
    service, *_ = make(FakePlaces([bare]))
    [card] = (await service.search("x", None, "alice")).places
    assert card["overview"]["rating"] is None
    assert card["overview"]["reviewCount"] is None
    assert card["overview"]["openStatus"] == ""
    assert "photo" not in card
    assert card["priceTier"] == "££"


async def test_zero_places_is_an_empty_result() -> None:
    service, *_ = make(FakePlaces([]))
    result = await service.search("nothing", None, "alice")
    assert result.places == []


async def test_hygiene_failure_leaves_the_badge_absent() -> None:
    service, *_ = make(fhrs=FakeFhrs(fail=True))
    [card] = (await service.search("ramen", None, "alice")).places
    assert "hygieneRating" not in card


async def test_failed_hygiene_lookup_is_retried_on_the_next_search() -> None:
    fhrs = FakeFhrs(fail=True)
    service, _, _, _, clock = make(fhrs=fhrs)
    await service.search("ramen", None, "alice")
    await service.drain()
    fhrs.fail = False
    clock.now = T0 + timedelta(hours=25)
    [card] = (await service.search("ramen", None, "alice")).places
    assert len(fhrs.calls) == 2
    assert card["hygieneRating"] == 5


async def test_hygiene_no_match_is_not_rated() -> None:
    service, *_ = make(fhrs=FakeFhrs(rating=None))
    [card] = (await service.search("ramen", None, "alice")).places
    assert card["hygieneRating"] is None


async def test_google_failure_raises_search_error() -> None:
    places = FakePlaces()
    places.fail = True
    service, *_ = make(places)
    with pytest.raises(SearchError):
        await service.search("ramen", None, "alice")


async def test_open_status_hidden_once_the_row_is_over_an_hour_old() -> None:
    service, _, _, _, clock = make()
    await service.search("ramen", None, "alice")
    await service.drain()
    clock.now = T0 + timedelta(hours=2)
    [card] = (await service.search("ramen", None, "alice")).places
    assert card["overview"]["openStatus"] == ""


async def test_photo_links_are_cached_for_an_hour() -> None:
    places = FakePlaces([gplace("p1", photo="places/p1/photos/a")])
    service, _, _, _, clock = make(places)
    await service.search("ramen", None, "alice")
    await service.drain()
    clock.now = T0 + timedelta(minutes=30)
    await service.search("ramen", None, "alice")
    assert len(places.photo_calls) == 1
    clock.now = T0 + timedelta(minutes=61)
    await service.search("ramen", None, "alice")
    assert len(places.photo_calls) == 2


async def test_lat_lng_origin_biases_the_search() -> None:
    service, places, *_ = make()
    await service.search("ramen", "51.505,-0.0235", "alice")
    await service.search("ramen", "Canary Wharf", "alice")
    assert places.search_calls[0][1] == LatLng(51.505, -0.0235)
    assert places.search_calls[1][1] is None


async def test_two_concurrent_identical_searches_both_succeed() -> None:
    places = FakePlaces([gplace("p1"), gplace("p2")])
    places.delay = 0.01
    service, _, _, cache, _ = make(places)
    a, b = await asyncio.gather(
        service.search("ramen", None, "alice"), service.search("ramen", None, "bob")
    )
    await service.drain()
    assert a.places and b.places and a.id != b.id
    assert sorted(cache.places) == ["p1", "p2"]


async def test_get_returns_only_the_owners_search() -> None:
    service, *_ = make()
    result = await service.search("ramen", None, "alice")
    await service.drain()
    assert await service.get(result.id, "bob") is None
    found = await service.get(result.id, "alice")
    assert found is not None and [c["id"] for c in found.places] == ["p1"]


async def test_get_reads_the_store_in_a_fresh_process() -> None:
    first, _, _, cache, clock = make()
    result = await first.search("ramen", None, "alice")
    await first.drain()
    fresh = SearchService(FakePlaces(), FakeFhrs(), cache, clock=clock)
    found = await fresh.get(result.id, "alice")
    assert found is not None and found.query == "ramen"
    assert [c["id"] for c in found.places] == ["p1"]
    assert await fresh.get("unknown", "alice") is None
