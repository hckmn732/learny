"""Local JWT verification (SPEC-2101 step 2, ADR-2010, ADR-1009).

Expiry is checked against the injected clock, never the system clock: PyJWT would read
`time.time()`, which the backend bans. A token is accepted with HS256 (`SUPABASE_JWT_SECRET`) or
with an asymmetric algorithm whose `kid` is present in the JWKS cache. When the JWKS cannot be
consulted (`JwksUnavailable`), the caller falls back to `GET /auth/v1/user`, exactly like ADR-1009.
"""

import time
from collections.abc import Awaitable, Callable, Mapping
from dataclasses import dataclass, field
from typing import Any, cast

import jwt

from learny.identity.domain.actor import Actor, Transport
from learny.shared.clock import Clock
from learny.shared.config import Settings
from learny.shared.errors import AppError, JwksUnavailable

ASYMMETRIC_ALGORITHMS = ("RS256", "ES256", "EdDSA")
JWKS_TTL_SECONDS = 600

JwksFetcher = Callable[[], Awaitable[Mapping[str, Any]]]


@dataclass
class _JwksCache:
    keys: dict[str, Any] = field(default_factory=dict)
    fetched_at: float | None = None


class JwtVerifier:
    """Verifies a Supabase access token and turns it into an `Actor`."""

    def __init__(
        self,
        settings: Settings,
        clock: Clock,
        jwks_fetcher: JwksFetcher | None = None,
    ) -> None:
        self._settings = settings
        self._clock = clock
        self._jwks_fetcher = jwks_fetcher
        self._cache = _JwksCache()

    async def verify_token(self, token: str, transport: Transport = "bearer") -> Actor:
        """Async entry point: refetches the JWKS on an unknown `kid`, then verifies synchronously."""
        header = self.peek_header(token)
        algorithm = str(header.get("alg", ""))
        if algorithm in ASYMMETRIC_ALGORITHMS and header.get("kid") not in self._cache.keys:
            await self.refresh_jwks(force=True)
        return self.verify(token, transport)

    def peek_header(self, token: str) -> Mapping[str, Any]:
        """Unverified JOSE header; a malformed token is simply unauthenticated."""
        try:
            return jwt.get_unverified_header(token)
        except jwt.PyJWTError as error:
            raise _unauthenticated() from error

    def verify(self, token: str, transport: Transport = "bearer") -> Actor:
        """Decodes and validates one token; raises `UNAUTHENTICATED` when it is not acceptable.

        The issuer is checked only when the token carries an `iss` claim. Supabase Cloud stamps it;
        the self-hosted GoTrue of the Coolify stack (v2.197, no `GOTRUE_JWT_ISSUER` support) omits it,
        so requiring it would refuse every session of that deployment while adding no security: the
        token is still signed with `SUPABASE_JWT_SECRET` and checked for audience and expiry.
        """
        header = self.peek_header(token)
        algorithm = str(header.get("alg", ""))
        key = self._key_for(algorithm, header)
        try:
            payload = jwt.decode(
                token,
                key,
                algorithms=[algorithm],
                audience=self._settings.supabase_jwt_audience,
                options={
                    "verify_exp": False,
                    "verify_nbf": False,
                    "verify_iat": False,
                    "verify_iss": False,
                },
            )
        except jwt.PyJWTError as error:
            raise _unauthenticated() from error
        claimed_issuer = payload.get("iss")
        if claimed_issuer is not None and claimed_issuer != self._settings.supabase_jwt_issuer:
            raise _unauthenticated()
        self._check_times(payload)
        return _actor_from_claims(payload, transport)

    def _key_for(self, algorithm: str, header: Mapping[str, Any]) -> str | bytes:
        if algorithm == "HS256":
            return self._settings.supabase_jwt_secret
        if algorithm not in ASYMMETRIC_ALGORITHMS:
            raise _unauthenticated()
        kid = header.get("kid")
        if not isinstance(kid, str):
            raise _unauthenticated()
        key = self._cache.keys.get(kid)
        if key is None:
            # The cache was refreshed already (see `verify_token`): the token is not signed by this
            # key set, unless no key set can be consulted at all.
            if self._jwks_fetcher is None or not self._cache.keys:
                raise JwksUnavailable("the JWKS can not be consulted")
            raise _unauthenticated()
        return cast("str | bytes", key)

    def _check_times(self, payload: Mapping[str, Any]) -> None:
        """`exp` and `nbf` are compared with the injected clock, not the system clock.

        `iat` is deliberately not validated: `jose.jwtVerify` only checks `exp` and `nbf` unless
        `maxTokenAge` is requested, and Supabase mints `iat` from the Auth server clock. Rejecting a
        future `iat` would refuse every valid session whenever the injected clock lags behind the
        Auth server (ADR-2008, SPEC-2101, CA-2).
        """
        now = self._clock.now().timestamp()
        expires = payload.get("exp")
        if not isinstance(expires, (int, float)) or expires <= now:
            raise _unauthenticated()
        not_before = payload.get("nbf")
        if isinstance(not_before, (int, float)) and not_before > now:
            raise _unauthenticated()

    async def refresh_jwks(self, *, force: bool = False) -> None:
        """Refetches the key set when it is older than ten minutes, or when `force` is set."""
        if self._jwks_fetcher is None:
            raise JwksUnavailable("no JWKS fetcher configured")
        monotonic = time.monotonic()
        fresh = self._cache.fetched_at is not None and monotonic - self._cache.fetched_at < JWKS_TTL_SECONDS
        if fresh and not force:
            return
        try:
            document = await self._jwks_fetcher()
        except Exception as error:
            raise JwksUnavailable("the JWKS endpoint is unavailable") from error
        keys: dict[str, Any] = {}
        for entry in document.get("keys", []):
            kid = entry.get("kid")
            if not isinstance(kid, str):
                continue
            keys[kid] = jwt.PyJWK(entry, algorithm=entry.get("alg")).key
        self._cache.keys = keys
        self._cache.fetched_at = monotonic


def _actor_from_claims(payload: Mapping[str, Any], transport: Transport) -> Actor:
    user_id = payload.get("sub")
    if not isinstance(user_id, str) or user_id == "":
        raise _unauthenticated()
    email = payload.get("email")
    # `identityFromClaims` of a Supabase access token carries no
    # `email_confirmed_at` when the account is confirmed, so an absent claim means confirmed. A
    # token the Auth server signed exists only for an account it created; confirmation is enforced
    # at sign-in (`EMAIL_NOT_CONFIRMED`) and rechecked by `assert_fresh` (ADR-2008 parity).
    confirmed = payload.get("email_confirmed_at") is not False
    return Actor(
        user_id=user_id,
        email=email if isinstance(email, str) else "",
        email_confirmed=confirmed,
        transport=transport,
    )


def _unauthenticated() -> AppError:
    return AppError("UNAUTHENTICATED")
