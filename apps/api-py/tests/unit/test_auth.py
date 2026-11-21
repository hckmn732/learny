"""[SPEC-2101] Identity resolution from the request headers."""

import base64
import json

import pytest
from learny.identity.domain.actor import Actor
from learny.shared.errors import AppError
from learny_api.auth import authenticate, bearer_token, parse_cookie_header

pytestmark = pytest.mark.spec("SPEC-2101")

BASE = "sb-ref-auth-token"


def cookie_value(token: str) -> str:
    raw = json.dumps({"access_token": token}).encode()
    return "base64-" + base64.urlsafe_b64encode(raw).decode().rstrip("=")


class FakeVerifier:
    def __init__(self) -> None:
        self.calls: list[tuple[str, str]] = []

    def verify(self, token: str, transport: str = "bearer") -> Actor:
        self.calls.append((token, transport))
        if token == "invalid":
            raise AppError("UNAUTHENTICATED")
        return Actor(user_id="u-1", email="e@test", email_confirmed=True, transport=transport)  # type: ignore[arg-type]


def test_cookie_header_is_parsed() -> None:
    assert parse_cookie_header("a=1; b=2;broken") == {"a": "1", "b": "2"}
    assert parse_cookie_header(None) == {}


def test_bearer_extraction() -> None:
    assert bearer_token("Bearer abc") == "abc"
    assert bearer_token("bearer  abc ") == "abc"
    assert bearer_token("Basic abc") is None
    assert bearer_token("Bearer   ") is None
    assert bearer_token(None) is None


def test_bearer_wins_over_the_cookie() -> None:
    verifier = FakeVerifier()
    actor = authenticate(
        verifier,  # type: ignore[arg-type]
        {"authorization": "Bearer header-token", "cookie": f"{BASE}={cookie_value('cookie-token')}"},
    )
    assert actor is not None
    assert actor.transport == "bearer"
    assert verifier.calls == [("header-token", "bearer")]


def test_the_cookie_is_used_without_a_bearer() -> None:
    verifier = FakeVerifier()
    actor = authenticate(verifier, {"cookie": f"{BASE}={cookie_value('cookie-token')}"})  # type: ignore[arg-type]
    assert actor is not None
    assert actor.transport == "cookie"
    assert verifier.calls == [("cookie-token", "cookie")]


def test_an_anonymous_request_has_no_actor() -> None:
    verifier = FakeVerifier()
    assert authenticate(verifier, {}) is None  # type: ignore[arg-type]
    assert verifier.calls == []


def test_an_invalid_bearer_never_falls_back_to_the_cookie() -> None:
    verifier = FakeVerifier()
    with pytest.raises(AppError):
        authenticate(
            verifier,  # type: ignore[arg-type]
            {"authorization": "Bearer invalid", "cookie": f"{BASE}={cookie_value('cookie-token')}"},
        )
    assert verifier.calls == [("invalid", "bearer")]
