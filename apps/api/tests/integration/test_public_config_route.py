"""[SPEC-009] `GET /api/v1/config/public` through the composed facade (ADR-4007)."""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from learny.shared.config import Settings
from learny_api.main import create_app

pytestmark = pytest.mark.spec("SPEC-009")


def test_the_public_configuration_is_served_without_authentication() -> None:
    settings = Settings(
        app_env="test",
        supabase_url="https://project.supabase.co",
        supabase_anon_key="anon-test-only",
        next_public_app_url="https://learny.example",
        app_encryption_key="MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=",
    )
    app = create_app(settings)

    @asynccontextmanager
    async def lifespan(_: FastAPI) -> AsyncIterator[None]:
        yield

    app.router.lifespan_context = lifespan

    response = TestClient(app).get("/api/v1/config/public")

    assert response.status_code == 200
    body = response.json()
    assert body["supabaseUrl"] == "https://project.supabase.co"
    assert body["supabaseAnonKey"] == "anon-test-only"
    assert body["webUrl"] == "https://learny.example"
    assert body["vapidPublicKey"] == settings.vapid_public_key
    assert body["stripePublishableKey"] is None
