import asyncio

import pytest
from httpx import ASGITransport, AsyncClient

from app.api.routes import keepalive_stream
from app.main import create_app
from app.places.service import SearchService
from app.services import Services
from app.store.cache import InMemoryPlaceCache
from app.store.users import InMemoryUserStore
from tests.fakes import FakeFhrs, FakePlaces, gplace

ALICE = {"x-ms-client-principal-id": "alice-oid", "x-ms-client-principal-name": "A"}
BOB = {"x-ms-client-principal-id": "bob-oid"}


class Harness:
    def __init__(self, sse_max_s: float = 0.1) -> None:
        self.places = FakePlaces([gplace("p1"), gplace("p2", rating=4.9)])
        self.search = SearchService(self.places, FakeFhrs(), InMemoryPlaceCache())
        self.users = InMemoryUserStore()
        self.services = Services(
            search=self.search,
            users=self.users,
            keepalive_s=0.02,
            sse_max_s=sse_max_s,
        )
        self.app = create_app("api", self.services)

    def client(self) -> AsyncClient:
        return AsyncClient(transport=ASGITransport(app=self.app), base_url="http://t")


@pytest.fixture
def h() -> Harness:
    return Harness()


async def test_post_search_returns_ranked_cards(h: Harness) -> None:
    async with h.client() as c:
        r = await c.post("/api/searches", json={"query": "ramen"}, headers=ALICE)
    assert r.status_code == 200
    body = r.json()
    assert body["query"] == "ramen"
    assert [p["id"] for p in body["places"]] == ["p2", "p1"]
    assert isinstance(body["id"], str) and body["id"]


@pytest.mark.parametrize(
    "payload",
    [
        {"query": ""},
        {"query": "   "},
        {"query": "x" * 301},
        {},
        {"query": 5},
        {"query": "ramen", "origin": "y" * 201},
    ],
)
async def test_invalid_input_is_422_and_google_is_not_called(
    h: Harness, payload: dict
) -> None:
    async with h.client() as c:
        r = await c.post("/api/searches", json=payload, headers=ALICE)
    assert r.status_code == 422
    assert set(r.json()) == {"error"}
    assert len(r.json()["error"]) < 120
    assert h.places.search_calls == []


async def test_google_failure_is_502_without_upstream_detail(h: Harness) -> None:
    h.places.fail = True
    async with h.client() as c:
        r = await c.post("/api/searches", json={"query": "ramen"}, headers=ALICE)
    assert r.status_code == 502
    assert r.json() == {"error": "search unavailable"}


async def test_get_search_for_its_owner_only(h: Harness) -> None:
    async with h.client() as c:
        sid = (
            await c.post("/api/searches", json={"query": "ramen"}, headers=ALICE)
        ).json()["id"]
        mine = await c.get(f"/api/searches/{sid}", headers=ALICE)
        theirs = await c.get(f"/api/searches/{sid}", headers=BOB)
        unknown = await c.get("/api/searches/nope", headers=ALICE)
        events = await c.get(f"/api/searches/{sid}/events", headers=BOB)
    assert mine.status_code == 200 and mine.json()["id"] == sid
    assert theirs.status_code == 404
    assert unknown.status_code == 404
    assert events.status_code == 404


@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("POST", "/api/searches"),
        ("GET", "/api/searches/x"),
        ("GET", "/api/searches/x/events"),
    ],
)
async def test_missing_principal_is_401(h: Harness, method: str, path: str) -> None:
    async with h.client() as c:
        r = await c.request(method, path, json={"query": "ramen"})
        health = await c.get("/health")
    assert r.status_code == 401
    assert health.status_code == 200
    assert h.places.search_calls == []


async def test_principal_is_touched_once_per_day(h: Harness) -> None:
    async with h.client() as c:
        await c.post("/api/searches", json={"query": "ramen"}, headers=ALICE)
        await c.get("/api/searches/nope", headers=ALICE)
    await h.services.drain()
    assert h.users.writes == 1
    assert h.users.rows["alice-oid"].display_name == "A"


async def test_events_stream_sends_keepalives_then_closes(h: Harness) -> None:
    async with h.client() as c:
        sid = (
            await c.post("/api/searches", json={"query": "ramen"}, headers=ALICE)
        ).json()["id"]
        r = await c.get(f"/api/searches/{sid}/events", headers=ALICE)
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("text/event-stream")
    assert r.headers["cache-control"] == "no-cache"
    assert r.text.count(": keep-alive") >= 2


async def test_keepalive_stream_first_comment_is_immediate_and_stops_on_disconnect() -> (
    None
):
    disconnected = False

    async def is_disconnected() -> bool:
        return disconnected

    stream = keepalive_stream(is_disconnected, interval_s=0.05, max_s=10)
    loop = asyncio.get_running_loop()
    start = loop.time()
    assert await anext(stream) == ": keep-alive\n\n"
    assert await anext(stream) == ": keep-alive\n\n"
    assert loop.time() - start < 0.1 + 0.05
    disconnected = True
    with pytest.raises(StopAsyncIteration):
        await anext(stream)


async def test_api_routes_are_not_mounted_on_the_agent_role(h: Harness) -> None:
    app = create_app("agent", h.services)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as c:
        r = await c.post("/api/searches", json={"query": "ramen"}, headers=ALICE)
    assert r.status_code == 404
