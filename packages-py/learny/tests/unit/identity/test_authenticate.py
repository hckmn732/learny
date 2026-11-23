"""[SPEC-2101] Caller resolution, freshness and legal acceptance (ADR-2010, ADR-1009)."""

import base64
import json
from collections.abc import AsyncIterator, Mapping, Sequence
from contextlib import asynccontextmanager
from dataclasses import dataclass
from typing import Any

import pytest
from learny.identity.application.authenticate import (
    assert_fresh,
    assert_legal_acceptance,
    authenticate,
    bearer_token,
    is_legal_exempt,
    parse_cookie_header,
)
from learny.identity.domain.actor import Actor, Transport
from learny.identity.infrastructure.gotrue import GoTrueUser
from learny.shared.clock import FixedClock
from learny.shared.config import Settings
from learny.shared.errors import AppError, JwksUnavailable
from learny.shared.time import parse_iso

pytestmark = pytest.mark.spec("SPEC-2101")

BASE = "sb-ref-auth-token"
FIXED = parse_iso("2026-11-11T12:20:00Z")
USER = "11111111-1111-4111-8111-111111111111"


def cookie_value(token: str) -> str:
    raw = json.dumps({"access_token": token}).encode()
    return "base64-" + base64.urlsafe_b64encode(raw).decode().rstrip("=")


class FakeVerifier:
    """Stands in for `JwtVerifier`: records the calls and replays one outcome."""

    def __init__(self, error: Exception | None = None) -> None:
        self.calls: list[tuple[str, str]] = []
        self._error = error

    async def verify_token(self, token: str, transport: Transport = "bearer") -> Actor:
        self.calls.append((token, transport))
        if self._error is not None:
            raise self._error
        if token == "invalid":
            raise AppError("UNAUTHENTICATED")
        return Actor(
            user_id=USER, email="session@test.learny.test", email_confirmed=True, transport=transport
        )


class FakeAuthServer:
    """Stands in for the GoTrue client: only `get_user` is needed here."""

    def __init__(self, users: Mapping[str, GoTrueUser] | None = None) -> None:
        self.users = dict(users or {})
        self.calls: list[str] = []

    async def get_user(self, access_token: str) -> GoTrueUser | None:
        self.calls.append(access_token)
        return self.users.get(access_token)


class FakeResult:
    def __init__(self, rows: Sequence[Mapping[str, Any]]) -> None:
        self._rows = list(rows)

    def mappings(self) -> "FakeResult":
        return self

    def all(self) -> list[Mapping[str, Any]]:
        return self._rows


class FakeConnection:
    def __init__(self, versions: Mapping[str, str | None]) -> None:
        self._versions = dict(versions)

    async def execute(self, statement: Any, parameters: Any = None) -> FakeResult:
        version = self._versions.get(parameters["document"])
        return FakeResult([] if version is None else [{"version": version}])


class FakeDatabase:
    def __init__(self, versions: Mapping[str, str | None] | None = None) -> None:
        self.versions = dict(versions or {"cgu": "2026-11-11", "privacy": "2026-11-11"})
        self.opened = 0

    @asynccontextmanager
    async def user_tx(self, actor: Actor) -> AsyncIterator[Any]:
        self.opened += 1
        yield type("FakeTx", (), {"conn": FakeConnection(self.versions)})()


@dataclass
class FakeDeps:
    settings: Settings
    clock: FixedClock
    db: FakeDatabase
    jwks: FakeVerifier
    gotrue: FakeAuthServer


def deps(
    verifier: FakeVerifier | None = None,
    server: FakeAuthServer | None = None,
    database: FakeDatabase | None = None,
) -> FakeDeps:
    return FakeDeps(
        settings=Settings(app_env="test", supabase_jwt_secret="x" * 40),
        clock=FixedClock(FIXED),
        db=database or FakeDatabase(),
        jwks=verifier or FakeVerifier(),
        gotrue=server or FakeAuthServer(),
    )


def test_cookie_header_is_parsed() -> None:
    assert parse_cookie_header("a=1; b=2;broken") == {"a": "1", "b": "2"}
    assert parse_cookie_header(None) == {}


def test_bearer_extraction() -> None:
    assert bearer_token("Bearer abc") == "abc"
    assert bearer_token("bearer  abc ") == "abc"
    assert bearer_token("Basic abc") is None
    assert bearer_token("Bearer   ") is None
    assert bearer_token(None) is None


async def test_bearer_wins_over_the_cookie() -> None:
    verifier = FakeVerifier()
    resolved = await authenticate(
        deps(verifier),
        {"authorization": "Bearer header-token", "cookie": f"{BASE}={cookie_value('cookie-token')}"},
    )
    assert resolved is not None
    assert resolved.transport == "bearer"
    assert verifier.calls == [("header-token", "bearer")]


async def test_the_cookie_is_validated_by_the_auth_server() -> None:
    server = FakeAuthServer({"cookie-token": GoTrueUser(id=USER, email="a@test", email_confirmed=True)})
    resolved = await authenticate(deps(server=server), {"cookie": f"{BASE}={cookie_value('cookie-token')}"})
    assert resolved is not None
    assert resolved.transport == "cookie"
    assert resolved.user_id == USER
    assert server.calls == ["cookie-token"]


async def test_an_anonymous_request_has_no_actor() -> None:
    verifier = FakeVerifier()
    assert await authenticate(deps(verifier), {}) is None
    assert verifier.calls == []


async def test_an_invalid_bearer_never_falls_back_to_the_cookie() -> None:
    verifier = FakeVerifier()
    with pytest.raises(AppError, match="UNAUTHENTICATED"):
        await authenticate(
            deps(verifier),
            {"authorization": "Bearer invalid", "cookie": f"{BASE}={cookie_value('cookie-token')}"},
        )
    assert verifier.calls == [("invalid", "bearer")]


async def test_a_cookie_refused_by_the_auth_server_is_anonymous() -> None:
    # `supabaseSessionResolver` answers `null` on a refused session: a public route still runs
    # (the sign-out of CL-10) and a protected one answers its own 401.
    assert await authenticate(deps(), {"cookie": f"{BASE}={cookie_value('stale-token')}"}) is None


async def test_an_unavailable_jwks_falls_back_to_the_auth_server() -> None:
    verifier = FakeVerifier(JwksUnavailable("down"))
    server = FakeAuthServer({"ok-token": GoTrueUser(id=USER, email="a@test", email_confirmed=True)})
    resolved = await authenticate(deps(verifier, server), {"authorization": "Bearer ok-token"})
    assert resolved is not None
    assert resolved.transport == "bearer"
    assert server.calls == ["ok-token"]


async def test_the_fallback_refuses_an_unknown_token() -> None:
    verifier = FakeVerifier(JwksUnavailable("down"))
    with pytest.raises(AppError, match="UNAUTHENTICATED"):
        await authenticate(deps(verifier), {"authorization": "Bearer unknown-token"})


async def test_a_cookie_session_is_already_fresh() -> None:
    actor = Actor(user_id=USER, email="a@test", email_confirmed=True, transport="cookie")
    server = FakeAuthServer()
    assert await assert_fresh(deps(server=server), actor, {}) is actor
    assert server.calls == []


async def test_fresh_auth_rechecks_a_bearer_token() -> None:
    actor = Actor(user_id=USER, email="a@test", email_confirmed=True, transport="bearer")
    server = FakeAuthServer({"tok": GoTrueUser(id=USER, email="a@test", email_confirmed=True)})
    fresh = await assert_fresh(deps(server=server), actor, {"authorization": "Bearer tok"})
    assert fresh.transport == "bearer"
    assert server.calls == ["tok"]


async def test_fresh_auth_refuses_a_revoked_token() -> None:
    actor = Actor(user_id=USER, email="a@test", email_confirmed=True, transport="bearer")
    with pytest.raises(AppError, match="UNAUTHENTICATED"):
        await assert_fresh(deps(), actor, {"authorization": "Bearer revoked"})


async def test_fresh_auth_refuses_another_account() -> None:
    actor = Actor(user_id=USER, email="a@test", email_confirmed=True, transport="bearer")
    other = GoTrueUser(id="22222222-2222-4222-8222-222222222222", email="b@test", email_confirmed=True)
    with pytest.raises(AppError, match="UNAUTHENTICATED"):
        await assert_fresh(
            deps(server=FakeAuthServer({"tok": other})), actor, {"authorization": "Bearer tok"}
        )


async def test_fresh_auth_needs_a_bearer_token() -> None:
    actor = Actor(user_id=USER, email="a@test", email_confirmed=True, transport="bearer")
    with pytest.raises(AppError, match="UNAUTHENTICATED"):
        await assert_fresh(deps(), actor, {})


def test_legal_exemptions() -> None:
    assert is_legal_exempt("me.export.request") is True
    assert is_legal_exempt("legal.accept") is True
    assert is_legal_exempt("page.home") is True
    assert is_legal_exempt("formations.create") is False


async def test_acceptance_passes_when_the_current_versions_are_accepted() -> None:
    actor = Actor(user_id=USER, email="a@test", email_confirmed=True, transport="bearer")
    database = FakeDatabase()
    await assert_legal_acceptance(deps(database=database), actor, "formations.create")
    assert database.opened == 1


async def test_acceptance_is_refused_with_the_expected_versions() -> None:
    actor = Actor(user_id=USER, email="a@test", email_confirmed=True, transport="bearer")
    database = FakeDatabase({"cgu": "2025-01-01", "privacy": "2026-11-11"})
    with pytest.raises(AppError, match="LEGAL_ACCEPTANCE_REQUIRED") as caught:
        await assert_legal_acceptance(deps(database=database), actor, "formations.create")
    errors = caught.value.extra["errors"]
    assert [entry["path"] for entry in errors] == ["cguVersion", "privacyVersion"]
    assert [entry["message"] for entry in errors] == ["2026-11-11", "2026-11-11"]
    assert all(entry["code"] == "EXPECTED_VERSION" for entry in errors)


async def test_acceptance_is_skipped_for_an_exempt_operation() -> None:
    actor = Actor(user_id=USER, email="a@test", email_confirmed=True, transport="bearer")
    database = FakeDatabase({"cgu": "2025-01-01", "privacy": "2025-01-01"})
    await assert_legal_acceptance(deps(database=database), actor, "me.export.request")
    assert database.opened == 0
