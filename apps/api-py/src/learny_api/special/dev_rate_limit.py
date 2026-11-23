"""Development demonstrations of SPEC-208: rate-limit burst, origin guard and purge.

Port of `packages/services/src/security/demo.ts`. The burst consumes a synthetic bucket (never the
caller's one) and deletes it afterwards; the origin demonstration runs the real guard; the purge
inserts expired and recent rows, purges them in one transaction and removes what the purge kept.
"""

from datetime import datetime, timedelta
from typing import Any, Literal, cast

from learny.identity.public import purge_rows_in_tx
from learny.shared.errors import AppError
from learny.shared.ids import new_id
from sqlalchemy import text

from learny_api.guards.origin import OriginRequest, create_origin_guard
from learny_api.guards.rate_limit import (
    PROCESS_SECRET,
    RATE_PROFILES,
    PostgresRateLimiter,
    ProfileName,
    RateLimitRequest,
    bucket_key,
)
from learny_api.pipeline import Call

DEMO_APP_ORIGIN = "https://app.learny.example"
DAY_SECONDS = 24 * 3600
DELETE_BUCKET = text("delete from public.rate_limits where bucket = :bucket")
INSERT_IDEMPOTENCY_KEY = text(
    """
    insert into public.idempotency_keys
      (key, user_id, route, request_hash, status_code, created_at, completed_at)
    values (:key, cast(:user_id as uuid), '/api/v1/dev/sdd/demo', :hash, 201,
            cast(:at as timestamptz), cast(:at as timestamptz))
    """
)
INSERT_RATE_LIMIT = text(
    "insert into public.rate_limits (bucket, tokens, updated_at) "
    "values (:bucket, 5, cast(:at as timestamptz))"
)
DELETE_DEMO_BUCKETS = text("delete from public.rate_limits where bucket like :pattern")
DELETE_DEMO_KEYS = text("delete from public.idempotency_keys where key like :pattern")
FIRST_PROFILE = text("select id::text as id from public.profiles limit 1")


def _subject() -> tuple[str, str]:
    """A synthetic subject: a fresh identifier and an address drawn from it, never the caller's."""
    subject = new_id()
    digits = subject.replace("-", "")
    address = f"10.{int(digits[0:2], 16)}.{int(digits[2:4], 16)}.{int(digits[4:6], 16)}"
    return subject, address


async def burst(call: Call) -> dict[str, Any]:
    """`runBurst`: the capacity plus one consumptions of a fresh bucket, then its deletion."""
    body: Any = call.body
    profile = cast(ProfileName, str(body.profile))
    spec = RATE_PROFILES[profile]
    user_id, ip = _subject()
    secret = PROCESS_SECRET
    limiter = PostgresRateLimiter(call.deps.db, call.deps.clock, secret)
    key = bucket_key(profile, user_id, ip, secret)
    accepted = 0
    refused = 0
    remaining = int(spec.capacity)
    retry_after: int | None = None
    try:
        for _ in range(int(spec.capacity) + 1):
            decision = await limiter.consume(
                RateLimitRequest(
                    profile=profile,
                    user_id=user_id,
                    ip=ip,
                    route_id="dev.rateLimit.burst",
                )
            )
            if decision.allowed:
                accepted += 1
                remaining = decision.remaining
            else:
                refused += 1
                remaining = 0
                retry_after = decision.retry_after_sec
        return {
            "profile": profile,
            "limit": int(spec.capacity),
            "accepted": accepted,
            "refused": refused,
            "remaining": remaining,
            "retryAfterSeconds": retry_after,
        }
    finally:
        async with call.deps.db.service_tx() as tx:
            await tx.conn.execute(DELETE_BUCKET, {"bucket": key})


async def origin(call: Call) -> dict[str, Any]:
    """`runOriginDemo`: the real guard on a form mutation, from the app or a foreign origin."""
    body: Any = call.body
    mode = cast(Literal["same", "foreign"], str(body.mode))
    guard = create_origin_guard(DEMO_APP_ORIGIN)
    try:
        guard.check(
            OriginRequest(
                method="POST",
                pathname="/api/v1/formations",
                origin=DEMO_APP_ORIGIN if mode == "same" else "https://evil.example",
                sec_fetch_site=None,
                request_origin=DEMO_APP_ORIGIN,
            )
        )
        return {"status": 200, "code": None, "detail": None}
    except AppError as error:
        return {"status": 403, "code": error.code, "detail": error.detail}


async def purge_demo(call: Call) -> dict[str, Any]:
    """`runPurgeDemo`: expired rows are removed, recent ones survive, the demo rows are cleaned."""
    now: datetime = call.deps.clock.now()
    tag = new_id().replace("-", "")[:8]

    def at(age_seconds: int) -> datetime:
        return now - timedelta(seconds=age_seconds)

    async with call.deps.db.service_tx() as tx:
        owner = (await tx.conn.execute(FIRST_PROFILE)).mappings().first()
        user_id = None if owner is None else str(owner["id"])
        if user_id is not None:
            for name, age in (
                ("expired-1", DAY_SECONDS + 3600),
                ("expired-2", DAY_SECONDS + 1),
                ("recent-1", DAY_SECONDS - 60),
            ):
                await tx.conn.execute(
                    INSERT_IDEMPOTENCY_KEY,
                    {
                        "key": f"demo-{tag}-{name}",
                        "user_id": user_id,
                        "hash": "a" * 64,
                        "at": at(age),
                    },
                )
        for name, age in (
            ("expired-1", DAY_SECONDS + 7200),
            ("expired-2", DAY_SECONDS + 3600),
            ("expired-3", DAY_SECONDS + 1),
            ("recent-1", DAY_SECONDS - 60),
        ):
            await tx.conn.execute(
                INSERT_RATE_LIMIT,
                {"bucket": f"user:demo-{tag}:{name}", "at": at(age)},
            )
        removed = await purge_rows_in_tx(tx, now)
        await tx.conn.execute(DELETE_DEMO_BUCKETS, {"pattern": f"user:demo-{tag}:%"})
        await tx.conn.execute(DELETE_DEMO_KEYS, {"pattern": f"demo-{tag}-%"})
        return removed
