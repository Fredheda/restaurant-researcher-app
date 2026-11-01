"""FastAPI app factory. `APP_ROLE` picks which routes are mounted:
`api` serves `/api/*`, `agent` serves the AG-UI endpoint. Both serve
`/health`. Startup calls no remote service, so an outage of Google, OpenAI
or the database cannot crash-loop an app.
"""

import os

import httpx
from fastapi import FastAPI
from langgraph.graph.state import CompiledStateGraph

from app.agent.graph import build_graph, openai_model
from app.agent.server import mount_agent
from app.api.routes import mount_api
from app.config import Role, Settings, load_settings, role_from_env
from app.places.fhrs import HttpFhrsClient
from app.places.google import HttpGooglePlacesClient
from app.places.service import SearchService
from app.services import Services
from app.store.cache import InMemoryPlaceCache, PlaceCache, SqlPlaceCache, TimeoutCache
from app.store.database import make_connect
from app.store.users import InMemoryUserStore, SqlUserStore, UserStore

GOOGLE_TIMEOUT_S = 5.0
FHRS_TIMEOUT_S = 1.0
# The fast path never waits longer than this for the database.
CACHE_READ_TIMEOUT_S = 1.0
# Reading a search back by id may wait for a paused database to resume.
CACHE_LOOKUP_TIMEOUT_S = 20.0


def build_services(settings: Settings) -> Services:
    cache: PlaceCache
    users: UserStore
    if settings.sql_server and settings.sql_database:
        connect = make_connect(
            settings.sql_server, settings.sql_database, settings.azure_client_id
        )
        cache = TimeoutCache(
            SqlPlaceCache(connect), CACHE_READ_TIMEOUT_S, CACHE_LOOKUP_TIMEOUT_S
        )
        users = SqlUserStore(connect)
    else:
        cache = InMemoryPlaceCache()
        users = InMemoryUserStore()
    places = HttpGooglePlacesClient(
        settings.google_places_api_key, httpx.AsyncClient(timeout=GOOGLE_TIMEOUT_S)
    )
    fhrs = HttpFhrsClient(httpx.AsyncClient(timeout=FHRS_TIMEOUT_S))
    return Services(
        search=SearchService(places, fhrs, cache),
        users=users,
        local=settings.app_env == "local",
    )


def create_app(
    role: Role,
    services: Services | None = None,
    graph: CompiledStateGraph | None = None,
) -> FastAPI:
    app = FastAPI(title=f"restaurant-researcher-{role}")

    @app.get("/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    if services is not None and role == "api":
        mount_api(app, services)
    if services is not None and graph is not None and role == "agent":
        mount_agent(app, graph, services)

    return app


def app_from_env() -> FastAPI:
    settings = load_settings(os.environ, role_from_env(os.environ))
    services = build_services(settings)
    graph = None
    if settings.role == "agent" and settings.openai_api_key:
        model = openai_model(settings.openai_api_key, settings.openai_model)
        graph = build_graph(model, services.search)
    return create_app(settings.role, services, graph)


if os.getenv("APP_ROLE"):
    app = app_from_env()
