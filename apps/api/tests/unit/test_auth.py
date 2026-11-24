"""[SPEC-2101] The facade forwards the request headers to the identity use case."""

import pytest
from learny.identity.domain.actor import Actor
from learny_api.auth import resolve_actor

pytestmark = pytest.mark.spec("SPEC-2101")


class FakeDeps:
    """Only the fields `authenticate` reads; `resolve_actor` must not need anything else."""

    def __init__(self) -> None:
        self.resolved = Actor(
            user_id="11111111-1111-4111-8111-111111111111",
            email="a@test",
            email_confirmed=True,
            transport="bearer",
        )
        self.headers: dict[str, str] = {}
        self.jwks = self
        self.gotrue = self

    async def verify_token(self, token: str, transport: str = "bearer") -> Actor:
        return self.resolved

    async def get_user(self, access_token: str) -> None:
        return None


async def test_resolves_the_caller_from_the_headers() -> None:
    deps = FakeDeps()
    actor = await resolve_actor(deps, {"authorization": "Bearer token"})  # type: ignore[arg-type]
    assert actor is deps.resolved


async def test_an_anonymous_request_has_no_actor() -> None:
    deps = FakeDeps()
    assert await resolve_actor(deps, {}) is None  # type: ignore[arg-type]
