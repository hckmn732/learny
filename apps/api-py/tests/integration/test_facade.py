"""[SPEC-2003] The composed facade serves the contract and answers 404 otherwise."""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from learny.shared.config import Settings
from learny_api.main import create_app

pytestmark = pytest.mark.spec("SPEC-2003")

ROOT = Path(__file__).resolve().parents[4]


def build_app() -> tuple[FastAPI, TestClient]:
    settings = Settings(app_env="test")
    app = create_app(settings)

    @asynccontextmanager
    async def lifespan(_: FastAPI) -> AsyncIterator[None]:
        yield

    app.router.lifespan_context = lifespan
    return app, TestClient(app)


def test_the_contract_artefacts_are_loaded_from_the_repository() -> None:
    assert (ROOT / "api" / "errors.json").exists()
    assert (ROOT / "api" / "inventory.json").exists()
    app, _client = build_app()
    assert "health.get" in app.state.pipeline.handlers


def test_an_unknown_path_answers_the_default_404() -> None:
    _app, client = build_app()

    response = client.get("/api/v1/unknown")

    assert response.status_code == 404
