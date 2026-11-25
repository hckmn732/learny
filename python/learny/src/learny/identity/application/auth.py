"""Authentication requests (SPEC-202, ET-4, ADR-0121).

The use cases are HTTP-free: the handler passes the request-scoped values (public origin, the
`Secure` flag, the presented cookies) and a sink that appends one `Set-Cookie` header, and receives
the answer body.

`finalize_first_verification` is the only part that reads `auth.users` and writes with the owner
role: the legal acceptances, the terms pair and the time zone given at sign-up are recorded once,
under the profile lock, and the `user/signed-up` event is written in the same transaction.
"""

from collections.abc import Callable, Mapping
from contextlib import AbstractAsyncContextManager
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any, Protocol
from urllib.parse import urlencode

from learny.identity.domain.destination import (
    is_safe_next_path,
    resolve_post_auth_destination,
)
from learny.identity.infrastructure import auth_cookies, queries
from learny.identity.infrastructure.gotrue import (
    GoTrueError,
    GoTrueSession,
    map_gotrue_error,
)
from learny.shared.clock import Clock
from learny.shared.config import Settings
from learny.shared.errors import AppError
from learny.shared.locale_fr.details import AUTH_UNAVAILABLE
from learny.shared.time import is_supported_time_zone, parse_iso, to_iso

NEXT_COOKIE = "lr-next"
ONBOARDED_COOKIE = "learny_ob"
NEXT_COOKIE_MAX_AGE = 3600
CALLBACK_PATH = "/api/v1/auth/callback"
INVALID_LINK_DESTINATION = "/connexion?erreur=lien-invalide"
SIGNUP_EVENT = "user/signed-up"

CookieSink = Callable[[str], None]


class AuthTransactions(Protocol):
    """The unit of work as the auth use cases see it: the owner role for the first verification."""

    def service_tx(self) -> AbstractAsyncContextManager[Any]: ...


class AuthServer(Protocol):
    """The Auth endpoints the requests use (`GoTrueClient` satisfies it)."""

    async def sign_up(
        self, email: str, password: str, data: dict[str, Any]
    ) -> tuple[Any, GoTrueSession | None]: ...

    async def sign_in_with_password(self, email: str, password: str) -> GoTrueSession: ...

    async def sign_in_with_otp(
        self,
        email: str,
        *,
        create_user: bool,
        data: dict[str, Any] | None = None,
        redirect_to: str | None = None,
    ) -> None: ...

    async def resend(self, email: str, *, kind: str, redirect_to: str | None = None) -> None: ...

    async def sign_out(self, access_token: str) -> None: ...

    async def verify_otp(self, token_hash: str, kind: str) -> GoTrueSession | None: ...

    async def admin_get_user(self, user_id: str) -> Any: ...

    async def admin_magic_link_token(self, email: str) -> str: ...


# Marker of a web session opened from the mobile application: the end of the onboarding sends
# the browser back to the application. Readable by the page (no HttpOnly), one hour.
FROM_APP_COOKIE = "lr-from-app"
FROM_APP_MAX_AGE = 3600


def from_app_cookie(secure: bool) -> str:
    """The short-lived marker cookie written by the callback of a mobile hand-off."""
    header = f"{FROM_APP_COOKIE}=1; Max-Age={FROM_APP_MAX_AGE}; Path=/; SameSite=Lax"
    return f"{header}; Secure" if secure else header


async def web_handoff_url(deps: "AuthDeps", app_url: str, user_id: str) -> str:
    """A single-use link that opens the web session of the authenticated mobile user.

    The token is minted with the service role for the caller's own account only (the route
    requires the caller's access token), is never e-mailed, and is consumed by the callback.
    """
    user = await deps.gotrue.admin_get_user(user_id)
    email = getattr(user, "email", None)
    if not email:
        raise GoTrueError(404, "user_not_found", "no e-mail on the account")
    token_hash = await deps.gotrue.admin_magic_link_token(str(email))
    query = urlencode({"token_hash": token_hash, "type": "magiclink", "app": "1"})
    return f"{app_url.rstrip('/')}{CALLBACK_PATH}?{query}"


class AuthDeps(Protocol):
    """What the auth use cases need; `learny.shared.deps.Deps` satisfies it."""

    @property
    def settings(self) -> Settings: ...

    @property
    def clock(self) -> Clock: ...

    @property
    def db(self) -> AuthTransactions: ...

    @property
    def gotrue(self) -> AuthServer: ...

    @property
    def logger(self) -> Any: ...


@dataclass(frozen=True, slots=True)
class AuthRequest:
    """The request-scoped values of one authentication call."""

    app_url: str
    secure: bool
    cookies: Mapping[str, str] = field(default_factory=dict)


def callback_url(app_url: str) -> str:
    """`callbackUrl`: the route GoTrue redirects the e-mailed link to."""
    return f"{app_url.rstrip('/')}{CALLBACK_PATH}"


def signup_metadata(deps: AuthDeps, method: str, timezone: str | None) -> dict[str, Any]:
    """`signupMetadata`: the document the first verification reads back from `auth.users`."""
    signup: dict[str, Any] = {
        "termsAcceptedAt": to_iso(deps.clock.now()),
        "cguVersion": deps.settings.legal_cgu_version,
        "privacyVersion": deps.settings.legal_privacy_version,
        "method": method,
    }
    if timezone is not None:
        signup["timezone"] = timezone
    return {"signup": signup}


def _key(deps: AuthDeps) -> str:
    return auth_cookies.storage_key(deps.settings.supabase_url)


def _write_session(deps: AuthDeps, request: AuthRequest, session: GoTrueSession, emit: CookieSink) -> None:
    """The `setItem` of the storage adapter: the exact bytes of the session cookie."""
    for header in auth_cookies.session_cookies(
        _key(deps),
        session.document,
        existing=request.cookies.keys(),
        secure=request.secure,
    ):
        emit(header)


def expire_cookie(request: AuthRequest, name: str, emit: CookieSink) -> None:
    """`expireCookie`: one of our own cookies, emptied, with the session attributes."""
    emit(auth_cookies.serialize(name, "", max_age=0, secure=request.secure))


async def request_magic_link(
    deps: AuthDeps, request: AuthRequest, body: Mapping[str, Any], emit: CookieSink
) -> None:
    """EF-1, EF-2 - the magic link never creates an account in sign-in mode."""
    email = str(body["email"])
    sign_up_mode = body.get("mode") == "sign-up"
    try:
        await deps.gotrue.sign_in_with_otp(
            email,
            create_user=sign_up_mode,
            data=signup_metadata(deps, "magic_link", _timezone(body)) if sign_up_mode else None,
            redirect_to=callback_url(request.app_url),
        )
    except GoTrueError as error:
        mapped = map_gotrue_error(error, silent_when_unknown_user=not sign_up_mode)
        if mapped is None:
            deps.logger.info("magic link requested for an unknown address", outcome="silent")
            return
        raise mapped from error
    # The e-mailed link cannot carry `next` (fixed template): it travels in a short-lived cookie.
    next_path = body.get("next")
    if next_path is not None and is_safe_next_path(str(next_path)):
        emit(
            auth_cookies.serialize(
                NEXT_COOKIE, str(next_path), max_age=NEXT_COOKIE_MAX_AGE, secure=request.secure
            )
        )


async def sign_up(
    deps: AuthDeps, request: AuthRequest, body: Mapping[str, Any], emit: CookieSink
) -> dict[str, Any]:
    """EF-3 - password sign-up; an address already registered gets the same answer (ET-8)."""
    session: GoTrueSession | None = None
    try:
        _user, session = await deps.gotrue.sign_up(
            str(body["email"]),
            str(body["password"]),
            signup_metadata(deps, "password", _timezone(body)),
        )
    except GoTrueError as error:
        mapped = map_gotrue_error(error, silent_when_already_registered=True)
        if mapped is not None:
            raise mapped from error
    if session is not None:
        _write_session(deps, request, session, emit)
    return {"status": "confirmation_sent"}


async def sign_in(
    deps: AuthDeps, request: AuthRequest, body: Mapping[str, Any], emit: CookieSink
) -> dict[str, Any]:
    """EF-4 - password sign-in; the session cookies come from the grant, then the destination."""
    try:
        session = await deps.gotrue.sign_in_with_password(str(body["email"]), str(body["password"]))
    except GoTrueError as error:
        mapped = map_gotrue_error(error)
        raise (mapped if mapped is not None else AppError("SERVICE_UNAVAILABLE", AUTH_UNAVAILABLE)) from error
    _write_session(deps, request, session, emit)
    await finalize_first_verification(deps, session.user.id, "password")
    profile = await load_destination_profile(deps, session.user.id)
    next_path = body.get("next")
    return {
        "destination": resolve_post_auth_destination(profile, None if next_path is None else str(next_path))
    }


async def resend_link(deps: AuthDeps, request: AuthRequest, body: Mapping[str, Any]) -> None:
    """EF-5 - resend; GoTrue refuses a second sending within 60 s (`max_frequency`)."""
    email = str(body["email"])
    redirect_to = callback_url(request.app_url)
    try:
        if body["kind"] == "signup":
            await deps.gotrue.resend(email, kind="signup", redirect_to=redirect_to)
        else:
            await deps.gotrue.sign_in_with_otp(email, create_user=False, redirect_to=redirect_to)
    except GoTrueError as error:
        mapped = map_gotrue_error(error, silent_when_unknown_user=True)
        if mapped is not None:
            raise mapped from error


async def sign_out(deps: AuthDeps, request: AuthRequest, access_token: str | None, emit: CookieSink) -> None:
    """EF-7, CL-10 - closes the session; without a session only our own cookies are expired."""
    revoked = False
    if access_token is not None:
        try:
            await deps.gotrue.sign_out(access_token)
            revoked = True
        except GoTrueError as error:
            deps.logger.warn("sign-out without a valid session", outcome="ignored", error=str(error))
    key = _key(deps)
    presented = list(request.cookies)
    if revoked:
        for name in (key, f"{key}-user"):
            for header in auth_cookies.removed_session_cookies(name, presented, secure=request.secure):
                emit(header)
    expire_cookie(request, ONBOARDED_COOKIE, emit)
    expire_cookie(request, NEXT_COOKIE, emit)


async def complete_verification(
    deps: AuthDeps,
    request: AuthRequest,
    *,
    token_hash: str,
    kind: str,
    next_path: str | None,
    next_cookie: str | None,
    emit: CookieSink,
) -> str:
    """EF-6 - verifies the e-mailed link and answers the path to redirect to (CL-1, CL-2)."""
    destination = INVALID_LINK_DESTINATION
    try:
        session = await deps.gotrue.verify_otp(token_hash, kind)
        if session is not None:
            _write_session(deps, request, session, emit)
            await finalize_first_verification(deps, session.user.id, "magic_link")
            profile = await load_destination_profile(deps, session.user.id)
            candidate = next_path if next_path is not None else next_cookie
            destination = resolve_post_auth_destination(profile, candidate if candidate is not None else None)
    except GoTrueError as error:
        deps.logger.warn("verification failed", code="SERVICE_UNAVAILABLE", error=str(error))
        destination = INVALID_LINK_DESTINATION
    expire_cookie(request, NEXT_COOKIE, emit)
    return destination


async def load_destination_profile(deps: AuthDeps, user_id: str) -> dict[str, Any]:
    """`loadDestinationProfile`: a missing profile row is a fresh account."""
    async with deps.db.service_tx() as tx:
        return await queries.read_destination_profile(tx, user_id)


async def finalize_first_verification(deps: AuthDeps, user_id: str, fallback_method: str) -> bool:
    """`finalizeFirstVerification`: idempotent under the profile lock, one event per account."""
    async with deps.db.service_tx() as tx:
        await queries.lock_profile(tx, user_id)
        if await queries.count_legal_acceptances(tx, user_id) > 0:
            return False
        signup = read_signup(await queries.read_signup_metadata(tx, user_id))
        if signup is None:
            return False
        accepted_at = signup["acceptedAt"]
        await queries.insert_legal_acceptance(tx, user_id, "cgu", signup["cguVersion"], accepted_at)
        await queries.insert_legal_acceptance(tx, user_id, "privacy", signup["privacyVersion"], accepted_at)
        time_zone = await _known_timezone(tx, signup.get("timezone"))
        await queries.update_terms_and_timezone(
            tx,
            user_id,
            f"cgu:{signup['cguVersion']};privacy:{signup['privacyVersion']}",
            accepted_at,
            time_zone,
        )
        await tx.emit(
            SIGNUP_EVENT,
            {
                "userId": user_id,
                "method": signup["method"],
                "signedUpAt": to_iso(deps.clock.now()),
            },
            event_id=f"user-signed-up:{user_id}",
            user_id=user_id,
        )
    return True


async def _known_timezone(tx: Any, candidate: Any) -> str | None:
    """The time zone of the sign-up is kept only when IANA knows it."""
    if not isinstance(candidate, str) or not is_supported_time_zone(candidate):
        return None
    if not await queries.time_zone_is_known(tx, candidate):
        return None
    return candidate


def read_signup(metadata: Any) -> dict[str, Any] | None:
    """`readSignup`: the document `signup_metadata` wrote, with the fallbacks of the source."""
    if not isinstance(metadata, Mapping):
        return None
    signup = metadata.get("signup")
    if not isinstance(signup, Mapping):
        return None
    accepted = signup.get("termsAcceptedAt")
    if not isinstance(accepted, str):
        return None
    try:
        accepted_at = parse_iso(accepted)
    except ValueError:
        return None
    return {
        "acceptedAt": accepted_at.astimezone(UTC),
        "cguVersion": str(signup.get("cguVersion") or ""),
        "privacyVersion": str(signup.get("privacyVersion") or ""),
        "method": "password" if signup.get("method") == "password" else "magic_link",
        "timezone": signup.get("timezone"),
    }


def _timezone(body: Mapping[str, Any]) -> str | None:
    value = body.get("timezone")
    return None if value is None else str(value)


def _now(deps: AuthDeps) -> datetime:
    return deps.clock.now()
