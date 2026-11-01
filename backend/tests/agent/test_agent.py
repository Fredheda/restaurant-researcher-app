import asyncio
import json
from typing import Any

import pytest
from httpx import ASGITransport, AsyncClient

from app.agent.graph import SYSTEM_PROMPT, build_graph
from app.agent.server import AGENT_NAME, AGENT_PATH
from app.main import create_app
from app.places.service import SearchService
from app.services import Services
from app.store.cache import InMemoryPlaceCache
from app.store.users import InMemoryUserStore
from tests.agent.scripted_model import Call, ScriptedChatModel
from tests.fakes import FakeFhrs, FakePlaces, gplace

ALICE = {"x-ms-client-principal-id": "alice-oid"}

FRONTEND_TOOLS = [
    {
        "name": "show_places",
        "description": "Show a search on the board.",
        "parameters": {
            "type": "object",
            "properties": {"search_id": {"type": "string"}},
            "required": ["search_id"],
        },
    },
    {
        "name": "open_place",
        "description": "Open a place's details.",
        "parameters": {
            "type": "object",
            "properties": {"place_id": {"type": "string"}},
            "required": ["place_id"],
        },
    },
]


def run_input(text: str = "best ramen near Soho") -> dict[str, Any]:
    return {
        "threadId": "thread-1",
        "runId": "run-1",
        "state": {},
        "messages": [{"id": "m1", "role": "user", "content": text}],
        "tools": FRONTEND_TOOLS,
        "context": [],
        "forwardedProps": {},
    }


class SlowSaveCache(InMemoryPlaceCache):
    """Saves take a moment, as SQL does, so a test can tell a save the tool
    awaited from one still running in the background."""

    async def save(self, search, places) -> None:
        await asyncio.sleep(0.2)
        await super().save(search, places)


class Harness:
    def __init__(self, script: list) -> None:
        self.places = FakePlaces([gplace("p1"), gplace("p2", rating=4.9)])
        self.cache = SlowSaveCache()
        self.search = SearchService(self.places, FakeFhrs(), self.cache)
        self.services = Services(search=self.search, users=InMemoryUserStore())
        self.model = ScriptedChatModel(script=script)
        self.graph = build_graph(self.model, self.search)
        self.app = create_app("agent", self.services, graph=self.graph)

    async def run(self, headers: dict[str, str] | None = ALICE, text: str = "ramen"):
        async with AsyncClient(
            transport=ASGITransport(app=self.app), base_url="http://t"
        ) as c:
            r = await c.post(
                AGENT_PATH,
                json=run_input(text),
                headers={**(headers or {}), "accept": "text/event-stream"},
            )
        return r


def events(response) -> list[dict[str, Any]]:
    return [
        json.loads(line[len("data: ") :])
        for line in response.text.splitlines()
        if line.startswith("data: ")
    ]


def types(evs: list[dict[str, Any]]) -> list[str]:
    return [e["type"] for e in evs]


def test_agent_id_is_the_shared_constant() -> None:
    assert AGENT_NAME == "restaurant_researcher"
    assert AGENT_PATH == "/agent/restaurant_researcher"


def test_system_prompt_names_the_frontend_tools() -> None:
    for name in ("search_places", "get_place", "show_places", "open_place"):
        assert name in SYSTEM_PROMPT


async def test_text_run_streams_started_text_finished() -> None:
    h = Harness(["Hello there, ask me for food."])
    r = await h.run()
    assert r.status_code == 200
    ts = types(events(r))
    assert ts[0] == "RUN_STARTED"
    assert ts[-1] == "RUN_FINISHED"
    assert "TEXT_MESSAGE_CONTENT" in ts
    text = "".join(e["delta"] for e in events(r) if e["type"] == "TEXT_MESSAGE_CONTENT")
    assert text == "Hello there, ask me for food."


async def test_search_places_result_carries_the_search_id() -> None:
    h = Harness([Call("search_places", {"query": "best ramen"}), "Here you go."])
    evs = events(await h.run())
    results = [e for e in evs if e["type"] == "TOOL_CALL_RESULT"]
    assert results, types(evs)
    payload = json.loads(results[0]["content"])
    search_id = payload["search_id"]
    assert [p["id"] for p in payload["places"]] == ["p2", "p1"]
    assert set(payload["places"][0]) == {"id", "name", "rating", "price", "area"}
    # Saved before the tool returned: the api app reads it from the store.
    stored = await h.cache.get_search_by_id(search_id, "alice-oid")
    assert stored is not None
    assert types(evs)[-1] == "RUN_FINISHED"


async def test_bound_tools_include_backend_and_frontend_tools() -> None:
    h = Harness(["ok"])
    await h.run()
    assert {"search_places", "get_place", "show_places", "open_place"} <= set(
        h.model.log["tools"]
    )


async def test_search_failure_ends_with_a_message_and_run_finished() -> None:
    h = Harness([Call("search_places", {"query": "ramen"}), "Search is down."])
    h.places.fail = True
    evs = events(await h.run())
    result = next(e for e in evs if e["type"] == "TOOL_CALL_RESULT")
    assert "unavailable" in result["content"]
    assert types(evs)[-1] == "RUN_FINISHED"
    assert "RUN_ERROR" not in types(evs)


async def test_get_place_returns_a_card_from_an_earlier_search() -> None:
    h = Harness(
        [
            Call("search_places", {"query": "ramen"}),
            Call("get_place", {"place_id": "p1"}),
            "ok",
        ]
    )
    evs = events(await h.run())
    results = [e for e in evs if e["type"] == "TOOL_CALL_RESULT"]
    card = json.loads(results[1]["content"])
    assert card["id"] == "p1" and card["name"] == "Place p1"


async def test_get_place_unknown_id_is_a_plain_message() -> None:
    h = Harness([Call("get_place", {"place_id": "nope"}), "ok"])
    evs = events(await h.run())
    result = next(e for e in evs if e["type"] == "TOOL_CALL_RESULT")
    assert "not found" in result["content"]


async def test_run_without_principal_is_401() -> None:
    h = Harness(["never"])
    r = await h.run(headers=None)
    assert r.status_code == 401
    assert h.model.log["turn"] == 0


async def test_search_runs_as_the_signed_in_user() -> None:
    h = Harness([Call("search_places", {"query": "ramen"}), "ok"])
    evs = events(await h.run(headers={"x-ms-client-principal-id": "bob-oid"}))
    payload = json.loads(
        next(e for e in evs if e["type"] == "TOOL_CALL_RESULT")["content"]
    )
    assert await h.cache.get_search_by_id(payload["search_id"], "bob-oid") is not None
    assert await h.cache.get_search_by_id(payload["search_id"], "alice-oid") is None


@pytest.mark.parametrize("role", ["api"])
async def test_agent_is_not_mounted_on_the_api_role(role) -> None:
    h = Harness(["ok"])
    app = create_app(role, h.services, graph=h.graph)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as c:
        r = await c.post(AGENT_PATH, json=run_input(), headers=ALICE)
    assert r.status_code == 404
