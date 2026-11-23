"""[SPEC-2207] The auth routes answer the recorded `Set-Cookie` headers, byte for byte.

`api/oracles/vectors/auth-cookies.json` was recorded from `@learny/api` (Hono) serving these
requests through `@supabase/ssr` 0.12.7, whose GoTrue answers are the `gotrue` member of each case.
The facade is built with a fake Auth client replaying those answers, so this test compares the
Python writer with the real library and never with itself. The recorded account does not exist in
`auth.users`, so the first verification performs no write and the destination is a fresh account.
"""

import json
from dataclasses import replace
from pathlib import Path
from typing import Any

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from learny.identity.public import GoTrueError, GoTrueSession, GoTrueUser
from learny.shared.config import Settings
from learny.shared.deps import build_deps
from learny.shared.errors import JwksUnavailable, load_catalog
from learny_api import (
    handlers,  # noqa: F401 - registers the @handler roles
    pipeline,
)
from learny_api.main import create_app

pytestmark = pytest.mark.spec("SPEC-2207")

ROOT = Path(__file__).resolve().parents[5]
VECTORS = json.loads((ROOT / "api" / "oracles" / "vectors" / "auth-cookies.json").read_text("utf-8"))
CATALOG = load_catalog(ROOT / "api" / "errors.json")
CASES = VECTORS["cases"]
USER_ID = "11111111-1111-4111-8111-111111111111"
USER_EMAIL = "alex@test.learny.test"


class FakeJwks:
    """No key set: the identity resolution falls back to the Auth client, as in production."""

    async def verify_token(self, token: str, transport: str = "bearer") -> Any:
        raise JwksUnavailable()


class FakeGoTrue:
    """The Auth endpoints of one recorded case: it replays `gotrue` and records what it received."""

    def __init__(self, document: Any, error: Any = None) -> None:
        self.document = document
        self.error = error
        self.calls: list[tuple[str, dict[str, Any]]] = []

    def _session(self, document: Any) -> GoTrueSession:
        return GoTrueSession(
            access_token=document["access_token"],
            refresh_token=document["refresh_token"],
            user=GoTrueUser(
                id=document["user"]["id"],
                email=document["user"]["email"],
                email_confirmed=True,
            ),
            document=document,
        )

    async def sign_up(
        self, email: str, password: str, data: dict[str, Any]
    ) -> tuple[GoTrueUser | None, GoTrueSession | None]:
        self.calls.append(("sign_up", {"email": email, "data": data}))
        if self.document is None:
            return None, None
        user = GoTrueUser(
            id=self.document["user"]["id"],
            email=self.document["user"]["email"],
            email_confirmed=True,
        )
        return user, None

    async def sign_in_with_password(self, email: str, password: str) -> GoTrueSession:
        self.calls.append(("sign_in_with_password", {"email": email}))
        if email != "long@test.learny.test" and self.document is not None:
            return self._session(self.document)
        if self.document is not None:
            return self._session(self.document)
        raise GoTrueError(400, "invalid_credentials", "Invalid login credentials")

    async def sign_in_with_otp(
        self,
        email: str,
        *,
        create_user: bool,
        data: dict[str, Any] | None = None,
        redirect_to: str | None = None,
    ) -> None:
        self.calls.append(("sign_in_with_otp", {"email": email, "create_user": create_user, "data": data}))

    async def resend(self, email: str, *, kind: str, redirect_to: str | None = None) -> None:
        self.calls.append(("resend", {"email": email, "kind": kind}))

    async def sign_out(self, access_token: str) -> None:
        self.calls.append(("sign_out", {"access_token": access_token}))

    async def verify_otp(self, token_hash: str, kind: str) -> GoTrueSession | None:
        self.calls.append(("verify_otp", {"token_hash": token_hash, "kind": kind}))
        if self.error is not None:
            raise GoTrueError(self.error["status"], self.error["code"], self.error["message"])
        return None if self.document is None else self._session(self.document)

    async def get_user(self, access_token: str) -> GoTrueUser | None:
        self.calls.append(("get_user", {"access_token": access_token}))
        return GoTrueUser(id=USER_ID, email=USER_EMAIL, email_confirmed=True)


def settings_for() -> Settings:
    return Settings(
        app_env="test",
        next_public_app_url=VECTORS["publicAppUrl"],
        supabase_url=VECTORS["supabaseUrl"],
        supabase_anon_key="fake-anon-key",
        rate_limit_mode="off",
        database_url="postgresql://postgres:postgres@127.0.0.1:54322/postgres",
    )


def build_app(document: Any, error: Any = None) -> tuple[FastAPI, TestClient, FakeGoTrue]:
    settings = settings_for()
    auth = FakeGoTrue(document, error)
    deps = replace(
        build_deps(settings),
        gotrue=auth,  # type: ignore[arg-type]
        jwks=FakeJwks(),  # type: ignore[arg-type]
    )
    context = pipeline.build_context(deps, settings, CATALOG)
    app = create_app(
        settings,
        context=context,
    )
    # The recorded requests reached the API on this origin, so `Secure` is left out as it was.
    return app, TestClient(app, base_url=VECTORS["publicAppUrl"]), auth


def request_headers(case: dict[str, Any]) -> dict[str, str]:
    headers = {"origin": VECTORS["publicAppUrl"]}
    if case.get("cookie") is not None:
        headers["cookie"] = case["cookie"]
    return headers


@pytest.mark.parametrize("case", CASES, ids=[case["name"] for case in CASES])
def test_the_recorded_cookies_are_written_byte_for_byte(case: dict[str, Any]) -> None:
    _app, client, _auth = build_app(case["gotrue"], case.get("gotrue_error"))
    response = client.request(
        case["method"],
        case["path"],
        json=case["body"],
        headers=request_headers(case),
        follow_redirects=False,
    )

    assert response.status_code == case["status"]
    assert response.headers.get_list("set-cookie") == case["set_cookie"]
    assert response.text == case["response_body"]
    if case.get("location") is not None:
        assert response.headers["location"] == case["location"]


def test_sign_in_refuses_a_wrong_password_without_moving_the_cookies() -> None:
    _app, client, _auth = build_app(None)
    response = client.post(
        "/api/v1/auth/sign-in",
        json={"email": "alex@test.learny.test", "password": "wrong-password"},
        headers=request_headers({"name": "wrong-password"}),
    )

    assert response.status_code == 401
    assert response.json()["code"] == "INVALID_CREDENTIALS"
    assert response.headers.get_list("set-cookie") == []


def test_sign_out_revokes_the_session_it_was_given() -> None:
    case = next(case for case in CASES if case["name"] == "sign-out-removal")
    _app, client, auth = build_app(None)
    response = client.post(case["path"], json=case["body"], headers=request_headers(case))

    assert response.status_code == 204
    assert ("sign_out", {"access_token": "fake-access-token"}) in auth.calls


def test_the_magic_link_carries_the_callback_and_creates_no_account_in_sign_in_mode() -> None:
    _app, client, auth = build_app(None)
    client.post(
        "/api/v1/auth/magic-link",
        json={"email": "alex@test.learny.test", "mode": "sign-in"},
        headers=request_headers({"name": "magic-link"}),
    )

    assert auth.calls == [
        (
            "sign_in_with_otp",
            {"email": "alex@test.learny.test", "create_user": False, "data": None},
        )
    ]
