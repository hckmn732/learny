"""Thin GoTrue client (SPEC-2101 step 2, SPEC-202 ET-2).

No Supabase Python SDK (00-conventions section 5). Errors are translated by `map_gotrue_error`,
exactly.
"""

import re
from dataclasses import dataclass
from typing import Any

import httpx

from learny.shared.config import Settings
from learny.shared.errors import AppError
from learny.shared.locale_fr.details import (
    AUTH_UNAVAILABLE,
    EMAIL_NOT_CONFIRMED_SIGN_IN,
    INVALID_CREDENTIALS,
    RESEND_TOO_SOON,
    TOO_MANY_ATTEMPTS,
    WEAK_PASSWORD,
    WEAK_PASSWORD_HINT,
)

GOTRUE_TIMEOUT_SECONDS = 10.0
DEFAULT_RESEND_SECONDS = 60
_RETRY_AFTER = re.compile(r"after (\d+) seconds?", re.IGNORECASE)
_SIGNUPS_NOT_ALLOWED = re.compile(r"signups? not allowed", re.IGNORECASE)


@dataclass(frozen=True, slots=True)
class GoTrueUser:
    """The identity fields the backend reads from an Auth user."""

    id: str
    email: str | None
    email_confirmed: bool


@dataclass(frozen=True, slots=True)
class GoTrueSession:
    """A session answer of GoTrue, with the exact document the session cookie serialises.

    `document` keeps the GoTrue answer as parsed (insertion order preserved): `@supabase/ssr`
    stores `JSON.stringify(session)` in the cookie, so the bytes of this document are the bytes
    of the cookie value (see `learny.identity.infrastructure.auth_cookies`).
    """

    access_token: str
    refresh_token: str
    user: GoTrueUser
    document: dict[str, Any]


class GoTrueError(Exception):
    """A refusal of the Auth server, with its status and stable error code."""

    def __init__(self, status: int, code: str, message: str) -> None:
        super().__init__(f"{code or 'unknown'}: {message}")
        self.status = status
        self.code = code
        self.message = message


def _field(payload: Any, *names: str) -> str | None:
    if not isinstance(payload, dict):
        return None
    for name in names:
        value = payload.get(name)
        if isinstance(value, str) and value != "":
            return value
    return None


def parse_user(payload: Any) -> GoTrueUser:
    """Reads `{id, email, email_confirmed_at}` from a GoTrue user document."""
    if not isinstance(payload, dict) or not isinstance(payload.get("id"), str):
        raise GoTrueError(502, "invalid_response", "user document without an identifier")
    email = payload.get("email")
    return GoTrueUser(
        id=payload["id"],
        email=email if isinstance(email, str) else None,
        email_confirmed=payload.get("email_confirmed_at") is not None,
    )


def _user_from_signup(payload: Any) -> GoTrueUser | None:
    if isinstance(payload, dict) and isinstance(payload.get("user"), dict):
        return parse_user(payload["user"])
    return None


def session_of(payload: Any) -> GoTrueSession | None:
    """A session document of GoTrue (`/token`, `/verify`, or an auto-confirmed sign-up)."""
    if not isinstance(payload, dict):
        return None
    token = payload.get("access_token")
    refresh = payload.get("refresh_token")
    if not isinstance(token, str) or not isinstance(refresh, str):
        return None
    return GoTrueSession(
        access_token=token,
        refresh_token=refresh,
        user=parse_user(payload.get("user")),
        document=payload,
    )


class GoTrueClient:
    """Minimal async client of the Supabase Auth REST API."""

    def __init__(self, settings: Settings, client: httpx.AsyncClient | None = None) -> None:
        self._settings = settings
        self._client = client
        self._owned: httpx.AsyncClient | None = None

    @property
    def _http(self) -> httpx.AsyncClient:
        if self._client is not None:
            return self._client
        if self._owned is None:
            self._owned = httpx.AsyncClient(timeout=GOTRUE_TIMEOUT_SECONDS)
        return self._owned

    async def aclose(self) -> None:
        """Closes the client this instance created; an injected one stays owned by the caller."""
        if self._owned is not None:
            await self._owned.aclose()
            self._owned = None

    def _url(self, path: str) -> str:
        return f"{self._settings.supabase_url.rstrip('/')}{path}"

    def _headers(self, *, access_token: str | None = None, service: bool = False) -> dict[str, str]:
        key = self._settings.supabase_service_role_key if service else self._settings.supabase_anon_key
        headers = {"apikey": key, "content-type": "application/json"}
        if access_token is not None:
            headers["authorization"] = f"Bearer {access_token}"
        elif service:
            headers["authorization"] = f"Bearer {key}"
        return headers

    async def _send(
        self,
        method: str,
        path: str,
        *,
        access_token: str | None = None,
        service: bool = False,
        body: dict[str, Any] | None = None,
        params: dict[str, str] | None = None,
    ) -> Any:
        try:
            response = await self._http.request(
                method,
                self._url(path),
                headers=self._headers(access_token=access_token, service=service),
                json=body,
                params=params,
            )
        except httpx.HTTPError as error:
            raise GoTrueError(0, "network_error", str(error)) from error
        payload: Any = None
        if response.content:
            try:
                payload = response.json()
            except ValueError:
                payload = None
        if response.status_code >= 400:
            raise _error_of(response.status_code, payload)
        return payload

    async def sign_up(
        self, email: str, password: str, data: dict[str, Any]
    ) -> tuple[GoTrueUser | None, GoTrueSession | None]:
        """Creates an account; the caller maps `user_already_exists` to the same answer."""
        payload = await self._send(
            "POST", "/auth/v1/signup", body={"email": email, "password": password, "data": data}
        )
        return _user_from_signup(payload), session_of(payload)

    async def sign_in_with_password(self, email: str, password: str) -> GoTrueSession:
        """Password grant: the only endpoint returning an access and a refresh token."""
        payload = await self._send(
            "POST",
            "/auth/v1/token",
            params={"grant_type": "password"},
            body={"email": email, "password": password},
        )
        session = session_of(payload)
        if session is None:
            raise GoTrueError(502, "invalid_response", "session without tokens")
        return session

    async def sign_in_with_otp(
        self,
        email: str,
        *,
        create_user: bool,
        data: dict[str, Any] | None = None,
        redirect_to: str | None = None,
    ) -> None:
        """Magic link (`/otp`); `redirect_to` is a query parameter of the GoTrue endpoint."""
        body: dict[str, Any] = {"email": email, "create_user": create_user}
        if data is not None:
            body["data"] = data
        params = {"redirect_to": redirect_to} if redirect_to is not None else None
        await self._send("POST", "/auth/v1/otp", body=body, params=params)

    async def resend(self, email: str, *, kind: str, redirect_to: str | None = None) -> None:
        """Resends a confirmation (`signup`) or a magic link (`magiclink`)."""
        params = {"redirect_to": redirect_to} if redirect_to is not None else None
        body: dict[str, Any] = {"type": "signup" if kind == "signup" else "magiclink", "email": email}
        await self._send("POST", "/auth/v1/resend", body=body, params=params)

    async def sign_out(self, access_token: str) -> None:
        """Closes the session; GoTrue answers 204."""
        await self._send("POST", "/auth/v1/logout", access_token=access_token)

    async def verify_otp(self, token_hash: str, kind: str) -> GoTrueSession | None:
        """`/auth/v1/verify`: the token hash of an e-mailed link becomes a session, or nothing."""
        payload = await self._send("POST", "/auth/v1/verify", body={"token_hash": token_hash, "type": kind})
        return session_of(payload)

    async def get_user(self, access_token: str) -> GoTrueUser | None:
        """`GET /auth/v1/user`: the fallback of ADR-1009 and the freshness check of `freshAuth`."""
        try:
            payload = await self._send("GET", "/auth/v1/user", access_token=access_token)
        except GoTrueError:
            return None
        return parse_user(payload)

    async def admin_create_user(
        self,
        email: str,
        password: str | None = None,
        *,
        email_confirm: bool = True,
        user_metadata: dict[str, Any] | None = None,
    ) -> GoTrueUser:
        """Admin creation: the only way to create a confirmed account from the backend."""
        body: dict[str, Any] = {"email": email, "email_confirm": email_confirm}
        if password is not None:
            body["password"] = password
        if user_metadata is not None:
            body["user_metadata"] = user_metadata
        return parse_user(await self._send("POST", "/auth/v1/admin/users", service=True, body=body))

    async def admin_get_user(self, user_id: str) -> GoTrueUser:
        """Reads one account with the service role."""
        return parse_user(await self._send("GET", f"/auth/v1/admin/users/{user_id}", service=True))

    async def admin_magic_link_token(self, email: str) -> str:
        """`/admin/generate_link`: a single-use magic-link token hash, no e-mail sent."""
        payload = await self._send(
            "POST",
            "/auth/v1/admin/generate_link",
            service=True,
            body={"type": "magiclink", "email": email},
        )
        token = payload.get("hashed_token") if isinstance(payload, dict) else None
        if not isinstance(token, str) or token == "":
            properties = payload.get("properties") if isinstance(payload, dict) else None
            token = properties.get("hashed_token") if isinstance(properties, dict) else None
        if not isinstance(token, str) or token == "":
            raise GoTrueError(502, "generate_link_failed", "no hashed_token in the answer")
        return token

    async def admin_delete_user(self, user_id: str) -> None:
        """Deletes an account and its sessions (account deletion, SPEC-211)."""
        await self._send("DELETE", f"/auth/v1/admin/users/{user_id}", service=True)


def _error_of(status: int, payload: Any) -> GoTrueError:
    code = _field(payload, "error_code", "code") or ""
    message = _field(payload, "msg", "message", "error_description") or ""
    return GoTrueError(status, code, message)


def retry_after_from_message(message: str | None) -> int:
    """`... you can only request this after 37 seconds` becomes 37, bounded to 1..60."""
    match = _RETRY_AFTER.search(message or "")
    seconds = int(match.group(1)) if match is not None else DEFAULT_RESEND_SECONDS
    return min(max(1, seconds), DEFAULT_RESEND_SECONDS)


def map_gotrue_error(
    error: GoTrueError,
    *,
    silent_when_unknown_user: bool = False,
    silent_when_already_registered: bool = False,
) -> AppError | None:
    """Translates a GoTrue error; None means "answer as if it worked" (no enumeration)."""
    code = error.code
    if code == "invalid_credentials":
        return AppError("INVALID_CREDENTIALS", INVALID_CREDENTIALS)
    if code == "email_not_confirmed":
        return AppError("EMAIL_NOT_CONFIRMED", EMAIL_NOT_CONFIRMED_SIGN_IN)
    if code == "over_email_send_rate_limit" or _RETRY_AFTER.search(error.message):
        seconds = retry_after_from_message(error.message)
        return AppError("RESEND_TOO_SOON", RESEND_TOO_SOON.format(seconds=seconds), retry_after=seconds)
    if silent_when_unknown_user and (
        code in ("otp_disabled", "signup_disabled") or _SIGNUPS_NOT_ALLOWED.search(error.message)
    ):
        return None
    if silent_when_already_registered and code in ("user_already_exists", "email_exists"):
        return None
    if code == "weak_password":
        return AppError(
            "VALIDATION_FAILED",
            WEAK_PASSWORD,
            errors=[{"path": "body.password", "message": WEAK_PASSWORD_HINT}],
        )
    if code == "over_request_rate_limit" or error.status == 429:
        return AppError("RATE_LIMITED", TOO_MANY_ATTEMPTS, retry_after=DEFAULT_RESEND_SECONDS)
    return AppError("SERVICE_UNAVAILABLE", AUTH_UNAVAILABLE)
