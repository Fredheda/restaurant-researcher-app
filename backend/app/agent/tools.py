"""Backend tools of the agent. Both call the same `SearchService` as the
api app. The signed-in user's id reaches a tool through
`config["configurable"]["principal_id"]`, set per request by the AG-UI
endpoint from the Easy Auth header, never from anything the model or the
browser sends in the run body.
"""

import json
from typing import Any

from langchain_core.runnables import RunnableConfig
from langchain_core.tools import BaseTool, tool

from app.places.service import SearchError, SearchService

UNAVAILABLE = "The search is unavailable right now. Ask the person to try again."


def _principal_id(config: RunnableConfig) -> str:
    principal_id = (config.get("configurable") or {}).get("principal_id")
    if not principal_id:
        # The endpoint refuses runs without a principal; this guards misuse.
        raise RuntimeError("search_places called without a signed-in user")
    return principal_id


def _summary(card: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": card["id"],
        "name": card["name"],
        "rating": card["overview"]["rating"],
        "price": card["priceTier"],
        "area": card["neighbourhood"],
    }


def make_tools(service: SearchService) -> list[BaseTool]:
    @tool
    async def search_places(
        query: str, config: RunnableConfig, origin: str | None = None
    ) -> str:
        """Search London restaurants, bars and cafes on Google Places.

        Args:
            query: What the person asked for, e.g. "best ramen near Soho".
            origin: Optional "lat,lng" to search around.
        """
        query = query.strip()[:300]
        if not query:
            return "The query is empty. Ask the person what they want."
        try:
            result = await service.search(
                query, origin, _principal_id(config), wait_for_save=True
            )
        except SearchError:
            return UNAVAILABLE
        return json.dumps(
            {
                "search_id": result.id,
                "places": [_summary(card) for card in result.places],
            },
            ensure_ascii=False,
        )

    @tool
    async def get_place(place_id: str) -> str:
        """Get one place's card (rating, reviews, address, open status,
        price, food hygiene rating) by its id from a search result.

        Args:
            place_id: The place id from search_places.
        """
        card = await service.place(place_id)
        if card is None:
            return f"Place {place_id[:100]} not found. Search first."
        return json.dumps(card, ensure_ascii=False)

    return [search_places, get_place]
