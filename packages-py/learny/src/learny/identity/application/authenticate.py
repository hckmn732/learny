"""Identity use cases: caller resolution, freshness and legal acceptance (SPEC-2101 step 2).

Port of the parts of `packages/http/src/session.ts` and `packages/services/src/legal/accept.ts` the
backend needs: Bearer first, then the session cookie, an invalid Bearer never falls back to the
cookie, `freshAuth` rechecks the Auth account for a Bearer token, and a mutation that requires the
current legal documents answers `LEGAL_ACCEPTANCE_REQUIRED` with the two expected versions.

The dependencies are structural protocols so this module stays in the application layer: the
concrete verifier and Auth client live in `infrastructure` and are injected through `Deps`.
"""

from collections.abc import Mapping
from contextlib import AbstractAsyncContextManager
from typing import Any, Protocol

from learny.identity.domain.actor import Actor, Transport
from learny.identity.infrastructure.supabase_cookies import access_token_from_cookies
from learny.shared.clock import Clock
from learny.shared.config import Settings
from learny.shared.errors import AppError, JwksUnavailable
from learny.shared.locale_fr.details import (
    LEGAL_ACCEPTANCE_REQUIRED,
    UNAUTHENTICATED,
)
from sqlalchemy import text

LATEST_LEGAL_ACCEPTANCE = text(
    """
    select version from public.legal_acceptances
    where user_id = cast(:user_id as uuid) and document = :document
    order by accepted_at desc
    limit 1
    """
)

# Routes that must keep working while a new version waits for acceptance (SPEC-806 ET-4).
LEGAL_EXEMPT_OPERATIONS = frozenset(
    {
        "auth.signIn",
        "auth.signUp",
        "me.export.request",
        "me.export.read",
        "me.deletion.schedule",
        "me.deletion.cancel",
        "me.legal.accept",
    }
)


class AuthUser(Protocol):
    """The Auth account fields the identity use cases read."""

    @property
    def id(self) -> str: ...

    @property
    def email(self) -> str | None: ...

    @property
    def email_confirmed(self) -> bool: ...


class TokenVerifier(Protocol):
    """Local verification of an access token (`JwtVerifier`)."""

    async def verify_token(self, token: str, transport: Transport = "bearer") -> Actor: ...


class AuthServer(Protocol):
    """The Auth account lookup used by the JWKS fallback and by `freshAuth`."""

    async def get_user(self, access_token: str) -> AuthUser | None: ...


class UserTransactions(Protocol):
    """The unit of work as these use cases see it: a user transaction, never the service role."""

    def user_tx(self, actor: Actor) -> AbstractAsyncContextManager[Any]: ...


class AuthDeps(Protocol):
    """The dependencies these use cases need; `learny.shared.deps.Deps` satisfies it."""

    @property
    def settings(self) -> Settings: ...

    @property
    def clock(self) -> Clock: ...

    @property
    def db(self) -> UserTransactions: ...

    @property
    def jwks(self) -> TokenVerifier: ...

    @property
    def gotrue(self) -> AuthServer: ...


def parse_cookie_header(header: str | None) -> dict[str, str]:
    """`a=1; b=2` becomes `{"a": "1", "b": "2"}`; malformed pairs are ignored."""
    cookies: dict[str, str] = {}
    if not header:
        return cookies
    for part in header.split(";"):
        name, separator, value = part.strip().partition("=")
        if separator and name:
            cookies[name] = value
    return cookies


def bearer_token(header: str | None) -> str | None:
    """The token of an `Authorization: Bearer <token>` header, or None."""
    if not header:
        return None
    scheme, _, token = header.partition(" ")
    if scheme.lower() != "bearer":
        return None
    stripped = token.strip()
    return stripped or None


async def authenticate(deps: AuthDeps, headers: Mapping[str, str]) -> Actor | None:
    """Resolves the caller; raises `UNAUTHENTICATED` for an invalid Bearer token."""
    token = bearer_token(headers.get("authorization"))
    if token is not None:
        return await _bearer_actor(deps, token)
    cookie_token = access_token_from_cookies(parse_cookie_header(headers.get("cookie")))
    if cookie_token is not None:
        return await _cookie_actor(deps, cookie_token)
    return None


async def _bearer_actor(deps: AuthDeps, token: str) -> Actor:
    """Local verification, with the `GET /auth/v1/user` fallback of ADR-1009 (CL-4)."""
    try:
        return await deps.jwks.verify_token(token, "bearer")
    except JwksUnavailable as unavailable:
        user = await deps.gotrue.get_user(token)
        if user is None:
            raise _unauthenticated() from unavailable
        return _actor_of(user, "bearer")


async def _cookie_actor(deps: AuthDeps, token: str) -> Actor | None:
    """A cookie session is validated by the Auth server, like `getUser()` in TypeScript.

    A refused cookie is an anonymous request, never an error: `supabaseSessionResolver` answers
    `null`, so a public route (the sign-out, CL-10) still runs and a protected one answers its own
    401. An invalid Bearer token, by contrast, never falls back (ET-3, CL-6).
    """
    user = await deps.gotrue.get_user(token)
    return None if user is None else _actor_of(user, "cookie")


async def assert_fresh(deps: AuthDeps, actor: Actor, headers: Mapping[str, str]) -> Actor:
    """`freshAuth`: a Bearer token is rechecked against the Auth account, a cookie is already fresh."""
    if actor.transport == "cookie":
        return actor
    token = bearer_token(headers.get("authorization"))
    if token is None:
        raise _unauthenticated()
    user = await deps.gotrue.get_user(token)
    if user is None or user.id != actor.user_id:
        raise _unauthenticated()
    return _actor_of(user, "bearer")


def is_legal_exempt(operation: str) -> bool:
    """The explicit exemptions of the server guard (SPEC-806 ET-4)."""
    return (
        operation in LEGAL_EXEMPT_OPERATIONS
        or operation.startswith("legal.")
        or operation.startswith("page.")
    )


async def assert_legal_acceptance(deps: AuthDeps, actor: Actor, operation: str) -> None:
    """422 `LEGAL_ACCEPTANCE_REQUIRED` when the current documents are not accepted yet."""
    if is_legal_exempt(operation):
        return
    async with deps.db.user_tx(actor) as tx:
        latest = {}
        for document in ("cgu", "privacy"):
            rows = (
                (
                    await tx.conn.execute(
                        LATEST_LEGAL_ACCEPTANCE, {"user_id": actor.user_id, "document": document}
                    )
                )
                .mappings()
                .all()
            )
            latest[document] = str(rows[0]["version"]) if rows else None
    expected = {
        "cgu": deps.settings.legal_cgu_version,
        "privacy": deps.settings.legal_privacy_version,
    }
    if latest != expected:
        raise required_acceptance(expected)


def required_acceptance(expected: Mapping[str, str]) -> AppError:
    """The refusal body carries both expected versions as `errors[]` entries."""
    return AppError(
        "LEGAL_ACCEPTANCE_REQUIRED",
        LEGAL_ACCEPTANCE_REQUIRED,
        errors=[
            {
                "code": "EXPECTED_VERSION",
                "path": "cguVersion",
                "message": expected["cgu"],
            },
            {
                "code": "EXPECTED_VERSION",
                "path": "privacyVersion",
                "message": expected["privacy"],
            },
        ],
    )


def _actor_of(user: AuthUser, transport: Transport) -> Actor:
    return Actor(
        user_id=user.id,
        email=user.email or "",
        email_confirmed=user.email_confirmed,
        transport=transport,
    )


def _unauthenticated() -> AppError:
    return AppError("UNAUTHENTICATED", UNAUTHENTICATED)
