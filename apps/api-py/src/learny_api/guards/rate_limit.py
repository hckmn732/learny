"""Token-bucket rate limiter on PostgreSQL (SPEC-2101 step 3, ADR-0213, ADR-0042).

One atomic statement refills the bucket linearly (capped at its capacity) and takes a token; the
clock is injected, so tests are deterministic. A database failure refuses the request (503): a
request is never accepted without control. `RATE_LIMIT_MODE=off` installs the no-op limiter of the
QA stack and is refused in production.
"""

import hmac
import math
import secrets
from collections.abc import Mapping
from dataclasses import dataclass
from typing import Literal, Protocol

from learny.shared.clock import Clock
from learny.shared.config import Settings
from learny.shared.db.uow import Database
from learny.shared.errors import AppError
from learny.shared.locale_fr.details import SERVICE_UNAVAILABLE
from learny.shared.time import to_iso
from sqlalchemy import text

UNKNOWN_IP = "unknown"
ProfileName = Literal["default", "ai", "auth"]


@dataclass(frozen=True, slots=True)
class RateProfileSpec:
    """Capacity, refill and key of one profile (ADR-0213)."""

    capacity: float
    seconds_per_token: float
    refill_per_second: float
    key: Literal["user", "ip"]


# 120/min per learner, 20/min for the AI routes, 10 per address for authentication.
RATE_PROFILES: Mapping[ProfileName, RateProfileSpec] = {
    "default": RateProfileSpec(capacity=120, seconds_per_token=0.5, refill_per_second=2, key="user"),
    "ai": RateProfileSpec(capacity=20, seconds_per_token=3, refill_per_second=1 / 3, key="user"),
    "auth": RateProfileSpec(capacity=10, seconds_per_token=6, refill_per_second=1 / 6, key="ip"),
}

# Outside production, without `RATE_LIMIT_IP_SECRET`, each process draws its own secret: buckets of
# addresses are then only comparable inside that process, which is all a local run needs.
PROCESS_SECRET = secrets.token_hex(32)


def hash_ip(secret: str, ip: str) -> str:
    """First 32 hexadecimal characters of HMAC-SHA256(secret, ip): no address stored in clear."""
    digest = hmac.new(secret.encode("utf-8"), ip.encode("utf-8"), "sha256").hexdigest()
    return digest[:32]


def bucket_key(
    profile: ProfileName,
    user_id: str | None,
    ip: str | None,
    ip_secret: str,
) -> str:
    """`user:<uuid>:<profile>` or `ip:<hash>:<profile>`; an unknown address shares one bucket."""
    if RATE_PROFILES[profile].key == "user" and user_id is not None:
        return f"user:{user_id}:{profile}"
    hashed = UNKNOWN_IP if ip is None or ip == "" else hash_ip(ip_secret, ip)
    return f"ip:{hashed}:{profile}"


def refilled_tokens(spec: RateProfileSpec, tokens: float, elapsed_seconds: float) -> float:
    """Tokens held after `elapsed_seconds` without consumption (linear, never above the cap)."""
    return min(spec.capacity, tokens + max(0.0, elapsed_seconds) * spec.refill_per_second)


def retry_after_seconds(spec: RateProfileSpec, tokens: float) -> int:
    """Seconds until one whole token is available (at least 1)."""
    return max(1, math.ceil((1 - tokens) * spec.seconds_per_token))


@dataclass(frozen=True, slots=True)
class RateLimitRequest:
    """One consumption: the profile of the route and the subject of the bucket."""

    profile: ProfileName
    user_id: str | None
    ip: str | None
    route_id: str


@dataclass(frozen=True, slots=True)
class RateLimitDecision:
    """`limit` is 0 when nothing is limited (no `ratelimit-*` header is sent then)."""

    allowed: bool
    limit: int
    remaining: int
    retry_after_sec: int | None


class RateLimiter(Protocol):
    """What the request pipeline calls; both the Postgres and the no-op limiter implement it."""

    async def consume(self, request: RateLimitRequest) -> RateLimitDecision: ...


def _four_decimals(value: float) -> str:
    """Column precision is 4 decimals; the limiter sends `toFixed(4)` literals too."""
    return f"{value:.4f}"


# The refill expression is shared by the `set` and the `where` clauses of the upsert: the token is
# only taken when a whole one is available, so two concurrent consumptions never lose a decrement.
_REFILL = (
    "least(cast(:capacity as numeric), public.rate_limits.tokens"
    " + greatest(0, extract(epoch from (cast(:now as timestamptz) - public.rate_limits.updated_at)))"
    " / cast(:seconds as numeric))"
)
TAKE_TOKEN_SQL = (
    "insert into public.rate_limits (bucket, tokens, updated_at) "
    "values (:bucket, cast(:capacity as numeric) - 1, cast(:now as timestamptz)) "
    "on conflict (bucket) do update "
    "set tokens = greatest(0, " + _REFILL + " - 1), updated_at = cast(:now as timestamptz) "
    "where " + _REFILL + " >= 1 - cast(:epsilon as numeric) "
    "returning tokens::text as tokens"
)
TAKE_TOKEN = text(TAKE_TOKEN_SQL)
BUCKET_STATE = text(
    """
    select tokens::text as tokens,
           extract(epoch from (cast(:now as timestamptz) - updated_at))::text as elapsed
    from public.rate_limits where bucket = :bucket
    """
)


class PostgresRateLimiter:
    """Consumes on the owner role: `rate_limits` has no policy for learners (SPEC-208 ET-4)."""

    def __init__(self, db: Database, clock: Clock, ip_secret: str) -> None:
        self._db = db
        self._clock = clock
        self._ip_secret = ip_secret

    async def consume(self, request: RateLimitRequest) -> RateLimitDecision:
        spec = RATE_PROFILES[request.profile]
        bucket = bucket_key(request.profile, request.user_id, request.ip, self._ip_secret)
        now = to_iso(self._clock.now())
        parameters = {
            "bucket": bucket,
            "capacity": _four_decimals(spec.capacity),
            "seconds": _four_decimals(spec.seconds_per_token),
            "now": now,
            # A token counts as due within 0.0001 of a whole one (column precision).
            "epsilon": "0.0001",
        }
        try:
            async with self._db.service_tx() as tx:
                taken = (await tx.conn.execute(TAKE_TOKEN, parameters)).mappings().all()
                if taken:
                    return RateLimitDecision(
                        allowed=True,
                        limit=int(spec.capacity),
                        remaining=math.floor(float(taken[0]["tokens"])),
                        retry_after_sec=None,
                    )
                state = (await tx.conn.execute(BUCKET_STATE, parameters)).mappings().all()
        except Exception as error:
            raise AppError("SERVICE_UNAVAILABLE", SERVICE_UNAVAILABLE) from error
        current = state[0] if state else None
        tokens = refilled_tokens(
            spec,
            float(current["tokens"]) if current is not None else 0.0,
            float(current["elapsed"]) if current is not None else 0.0,
        )
        return RateLimitDecision(
            allowed=False,
            limit=int(spec.capacity),
            remaining=0,
            retry_after_sec=retry_after_seconds(spec, tokens),
        )


@dataclass(frozen=True, slots=True)
class NoopRateLimiter:
    """QA only (`RATE_LIMIT_MODE=off`): with a frozen clock the buckets never refill."""

    async def consume(self, request: RateLimitRequest) -> RateLimitDecision:
        return RateLimitDecision(allowed=True, limit=0, remaining=0, retry_after_sec=None)


def create_rate_limiter(settings: Settings, db: Database, clock: Clock) -> RateLimiter:
    """Builds the limiter of the pipeline; refuses the no-op mode in production."""
    if settings.rate_limit_mode == "off":
        if settings.is_production:
            raise RuntimeError("RATE_LIMIT_MODE=off is refused in production")
        return NoopRateLimiter()
    return PostgresRateLimiter(db, clock, settings.rate_limit_ip_secret or PROCESS_SECRET)
