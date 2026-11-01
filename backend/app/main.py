"""FastAPI app factory. `APP_ROLE` picks which routers are mounted."""

import os

from fastapi import FastAPI

from app.config import Role, role_from_env
from app.services import Services


def create_app(role: Role, services: Services | None = None) -> FastAPI:
    app = FastAPI(title=f"restaurant-researcher-{role}")

    @app.get("/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    return app


def build_services() -> Services:
    return Services()


if os.getenv("APP_ROLE"):
    app = create_app(role_from_env(os.environ), build_services())
