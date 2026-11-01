"""FastAPI app factory. `APP_ROLE` picks which routers are mounted."""

import os

from fastapi import FastAPI

from app.api.routes import mount_api
from app.config import Role, role_from_env
from app.services import Services


def build_services() -> Services:
    raise NotImplementedError("wired in Task 8")


def create_app(role: Role, services: Services | None = None) -> FastAPI:
    app = FastAPI(title=f"restaurant-researcher-{role}")

    @app.get("/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    if services is not None and role == "api":
        mount_api(app, services)

    return app


if os.getenv("APP_ROLE"):
    app = create_app(role_from_env(os.environ), build_services())
