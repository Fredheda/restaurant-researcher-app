"""FastAPI app factory. `APP_ROLE` picks which routers are mounted."""

import os

from fastapi import FastAPI
from langgraph.graph.state import CompiledStateGraph

from app.agent.server import mount_agent
from app.api.routes import mount_api
from app.config import Role, role_from_env
from app.services import Services


def build_services() -> Services:
    raise NotImplementedError("wired in Task 8")


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


if os.getenv("APP_ROLE"):
    app = create_app(role_from_env(os.environ), build_services())
