"""Local JWT verification (SPEC-2101 step 2, ADR-2010).

Expiry is checked against the injected clock, never the system clock: PyJWT would read
`time.time()`, which the backend bans. A token is accepted with HS256 (`SUPABASE_JWT_SECRET`) or
with an asymmetric algorithm whose `kid` is present in the JWKS cache.
"""

import time
from collections.abc import Awaitable, Callable, Mapping
from dataclasses import dataclass, field
from typing import Any, cast

import jwt

from learny.identity.domain.actor import Actor, Transport
from learny.shared.clock import Clock
from learny.shared.config import Settings
from learny.shared.errors import AppError

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

    def verify(self, token: str, transport: Transport = "bearer") -> Actor:
        """Decodes and validates one token; raises `UNAUTHENTICATED` when it is not acceptable."""
        try:
            header = jwt.get_unverified_header(token)
        except jwt.PyJWTError as error:
            raise _unauthenticated() from error
        algorithm = str(header.get("alg", ""))
        key = self._key_for(algorithm, header)
        try:
            payload = jwt.decode(
                token,
                key,
                algorithms=[algorithm],
                audience=self._settings.supabase_jwt_audience,
                issuer=self._settings.supabase_jwt_issuer,
                options={"verify_exp": False, "verify_nbf": False, "verify_iat": False},
            )
        except jwt.PyJWTError as error:
            raise _unauthenticated() from error
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
            raise _unauthenticated()
        return cast("str | bytes", key)

    def _check_times(self, payload: Mapping[str, Any]) -> None:
        """`exp`, `nbf` and `iat` are compared with the injected clock, not the system clock."""
        now = self._clock.now().timestamp()
        expires = payload.get("exp")
        if not isinstance(expires, (int, float)) or expires <= now:
            raise _unauthenticated()
        not_before = payload.get("nbf")
        if isinstance(not_before, (int, float)) and not_before > now:
            raise _unauthenticated()
        issued_at = payload.get("iat")
        if isinstance(issued_at, (int, float)) and issued_at > now + 60:
            raise _unauthenticated()

    async def refresh_jwks(self) -> None:
        """Refetches the JWKS when the cache is older than ten minutes."""
        if self._jwks_fetcher is None:
            return
        monotonic = time.monotonic()
        if self._cache.fetched_at is not None and monotonic - self._cache.fetched_at < JWKS_TTL_SECONDS:
            return
        document = await self._jwks_fetcher()
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
    confirmed = payload.get("email_confirmed_at") is not None or payload.get("confirmed") is True
    return Actor(
        user_id=user_id,
        email=email if isinstance(email, str) else "",
        email_confirmed=confirmed,
        transport=transport,
    )


def _unauthenticated() -> AppError:
    return AppError("UNAUTHENTICATED")
