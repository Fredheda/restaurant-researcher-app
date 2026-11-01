"""REST and SSE routes of the `api` role.

- `POST /api/searches` `{query, origin?}` returns `{id, query, places}`.
- `GET /api/searches/{id}` returns the same body to the user who ran it.
- `GET /api/searches/{id}/events` is the progress stream for later phases;
  for now it only sends keep-alive comments, then closes after
  `sse_max_s` (the browser's EventSource reconnects).
"""

import asyncio
from collections.abc import AsyncIterator, Awaitable, Callable
from typing import Annotated

from fastapi import APIRouter, Depends, FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, StringConstraints

from app.api.principal import principal_from_headers
from app.places.service import SearchError
from app.services import Services
from app.store.users import Principal

Query = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=300)
]
Origin = Annotated[str, StringConstraints(strip_whitespace=True, max_length=200)]

KEEPALIVE = ": keep-alive\n\n"


class SearchRequest(BaseModel):
    query: Query
    origin: Origin | None = None


async def keepalive_stream(
    is_disconnected: Callable[[], Awaitable[bool]], interval_s: float, max_s: float
) -> AsyncIterator[str]:
    """One comment at once (so proxies flush the headers), then one every
    `interval_s`, until the client goes or `max_s` passes."""
    loop = asyncio.get_running_loop()
    deadline = loop.time() + max_s
    yield KEEPALIVE
    while loop.time() < deadline:
        await asyncio.sleep(interval_s)
        if await is_disconnected():
            return
        yield KEEPALIVE


def _validation_error(_: Request, error: Exception) -> JSONResponse:
    errors = error.errors() if isinstance(error, RequestValidationError) else []
    field = str(errors[0]["loc"][-1]) if errors else "body"
    return JSONResponse({"error": f"invalid {field}"[:100]}, status_code=422)


def mount_api(app: FastAPI, services: Services) -> None:
    # async: FastAPI runs a sync dependency in a thread, where the
    # background touch could not be scheduled.
    async def current_principal(request: Request) -> Principal:
        principal = principal_from_headers(request.headers, services.local)
        services.touch(principal)
        return principal

    router = APIRouter(prefix="/api", dependencies=[])
    signed_in = Depends(current_principal)

    @router.post("/searches")
    async def create_search(body: SearchRequest, principal: Principal = signed_in):
        try:
            result = await services.search.search(
                body.query, body.origin or None, principal.id
            )
        except SearchError:
            return JSONResponse({"error": "search unavailable"}, status_code=502)
        return result.to_json()

    @router.get("/searches/{search_id}")
    async def get_search(search_id: str, principal: Principal = signed_in):
        result = await services.search.get(search_id, principal.id)
        if result is None:
            return JSONResponse({"error": "not found"}, status_code=404)
        return result.to_json()

    @router.get("/searches/{search_id}/events")
    async def search_events(
        search_id: str, request: Request, principal: Principal = signed_in
    ):
        if await services.search.get(search_id, principal.id) is None:
            return JSONResponse({"error": "not found"}, status_code=404)
        return StreamingResponse(
            keepalive_stream(
                request.is_disconnected, services.keepalive_s, services.sse_max_s
            ),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )

    app.include_router(router)
    app.add_exception_handler(RequestValidationError, _validation_error)
