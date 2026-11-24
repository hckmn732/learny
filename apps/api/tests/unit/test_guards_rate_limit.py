"""[SPEC-2101] Postgres token-bucket limiter (SPEC-208, ADR-0213)."""

from collections.abc import AsyncIterator, Mapping, Sequence
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from typing import Any, cast

import pytest
from learny.shared.clock import FixedClock
from learny.shared.config import Settings
from learny.shared.db.uow import Database
from learny.shared.errors import AppError
from learny.shared.time import parse_iso
from learny_api.guards.rate_limit import (
    RATE_PROFILES,
    UNKNOWN_IP,
    NoopRateLimiter,
    PostgresRateLimiter,
    RateLimitDecision,
    RateLimitRequest,
    bucket_key,
    create_rate_limiter,
    hash_ip,
    refilled_tokens,
    retry_after_seconds,
)

pytestmark = pytest.mark.spec("SPEC-2101")

SECRET = "x" * 40
USER = "11111111-1111-4111-8111-111111111111"
FIXED = parse_iso("2026-11-11T12:20:00Z")


class FakeResult:
    def __init__(self, rows: Sequence[Mapping[str, Any]]) -> None:
        self._rows = list(rows)

    def mappings(self) -> "FakeResult":
        return self

    def all(self) -> list[Mapping[str, Any]]:
        return self._rows


class FakeConnection:
    """Records the statements and replays the prepared outcomes, one per `execute`."""

    def __init__(self, outcomes: Sequence[Any]) -> None:
        self._outcomes = list(outcomes)
        self.calls: list[tuple[Any, Mapping[str, Any]]] = []

    async def execute(self, statement: Any, parameters: Any = None) -> FakeResult:
        self.calls.append((statement, parameters or {}))
        outcome = self._outcomes.pop(0)
        if isinstance(outcome, Exception):
            raise outcome
        return FakeResult(outcome)


@dataclass
class FakeTx:
    conn: FakeConnection


@dataclass
class FakeDatabase:
    conn: FakeConnection
    opened: int = field(default=0)

    @asynccontextmanager
    async def service_tx(self) -> AsyncIterator[FakeTx]:
        self.opened += 1
        yield FakeTx(self.conn)


def database(*outcomes: Any) -> FakeDatabase:
    return FakeDatabase(conn=FakeConnection(outcomes))


def limiter(fake: FakeDatabase) -> PostgresRateLimiter:
    return PostgresRateLimiter(cast(Database, fake), FixedClock(FIXED), SECRET)


@pytest.mark.parametrize(
    ("profile", "capacity", "seconds", "key"),
    [("default", 120, 0.5, "user"), ("ai", 20, 3, "user"), ("auth", 10, 6, "ip")],
)
def test_declares_the_profiles_of_adr_0213(profile: str, capacity: int, seconds: float, key: str) -> None:
    spec = RATE_PROFILES[cast(Any, profile)]
    assert spec.capacity == capacity
    assert spec.seconds_per_token == seconds
    assert spec.key == key


def test_declares_the_fractional_refill_rates() -> None:
    assert RATE_PROFILES["ai"].refill_per_second == pytest.approx(1 / 3)
    assert RATE_PROFILES["auth"].refill_per_second == pytest.approx(1 / 6)
    assert RATE_PROFILES["default"].refill_per_second == 2


def test_refills_linearly_and_never_above_the_capacity() -> None:
    spec = RATE_PROFILES["default"]
    assert refilled_tokens(spec, 0, 30) == 60
    assert refilled_tokens(spec, 0, 1) == 2
    assert refilled_tokens(spec, 100, 30) == 120
    assert refilled_tokens(spec, 0, 3600) == 120
    assert refilled_tokens(spec, 5, 0) == 5


def test_ignores_a_clock_that_went_backwards() -> None:
    assert refilled_tokens(RATE_PROFILES["default"], 7, -50) == 7


@pytest.mark.parametrize(
    ("profile", "tokens", "seconds"),
    [
        ("default", 0, 1),
        ("default", 0.4, 1),
        ("ai", 0, 3),
        ("ai", 0.5, 2),
        ("auth", 0, 6),
        ("auth", 0.5, 3),
        ("auth", 0.999, 1),
    ],
)
def test_retry_after_of_a_refused_profile(profile: str, tokens: float, seconds: int) -> None:
    assert retry_after_seconds(RATE_PROFILES[cast(Any, profile)], tokens) == seconds


def test_hashes_an_address_with_a_secret() -> None:
    hashed = hash_ip(SECRET, "203.0.113.9")
    assert len(hashed) == 32
    assert all(character in "0123456789abcdef" for character in hashed)
    assert hashed == hash_ip(SECRET, "203.0.113.9")
    assert hashed != hash_ip(SECRET, "203.0.113.10")
    assert hashed != hash_ip("y" * 40, "203.0.113.9")
    assert "203" not in hashed


def test_keys_a_bucket_by_learner_or_by_address() -> None:
    assert bucket_key("default", USER, "203.0.113.9", SECRET) == f"user:{USER}:default"
    assert bucket_key("ai", USER, None, SECRET) == f"user:{USER}:ai"
    # The authentication profile is per address even for a signed-in learner.
    assert bucket_key("auth", USER, "203.0.113.9", SECRET) == (f"ip:{hash_ip(SECRET, '203.0.113.9')}:auth")


def test_falls_back_to_the_address_and_to_the_shared_bucket() -> None:
    assert bucket_key("default", None, "203.0.113.9", SECRET) == (
        f"ip:{hash_ip(SECRET, '203.0.113.9')}:default"
    )
    assert bucket_key("auth", None, None, SECRET) == f"ip:{UNKNOWN_IP}:auth"
    assert bucket_key("auth", None, "", SECRET) == "ip:unknown:auth"


def test_keeps_one_bucket_per_profile_for_the_same_learner() -> None:
    keys = {bucket_key(cast(Any, profile), USER, None, SECRET) for profile in ("default", "ai")}
    assert len(keys) == 2


async def test_consumes_a_token_and_returns_the_whole_remaining() -> None:
    fake = database([{"tokens": "119.0000"}])
    decision = await limiter(fake).consume(
        RateLimitRequest(profile="default", user_id=USER, ip=None, route_id="GET /x")
    )
    assert decision == RateLimitDecision(allowed=True, limit=120, remaining=119, retry_after_sec=None)
    assert len(fake.conn.calls) == 1
    parameters = fake.conn.calls[0][1]
    assert parameters["bucket"] == f"user:{USER}:default"
    assert parameters["now"] == "2026-11-11T12:20:00.000Z"
    assert parameters["capacity"] == "120.0000"
    assert fake.opened == 1


async def test_refuses_without_a_token_and_computes_the_delay() -> None:
    fake = database([], [{"tokens": "0.5", "elapsed": "0"}])
    decision = await limiter(fake).consume(
        RateLimitRequest(profile="default", user_id=None, ip="203.0.113.9", route_id="POST /x")
    )
    assert decision.allowed is False
    assert decision.remaining == 0
    assert decision.retry_after_sec == 1
    assert decision.limit == 120
    assert len(fake.conn.calls) == 2
    # The refusal state is read on the same bucket, keyed by the hashed address.
    assert fake.conn.calls[1][1]["bucket"] == f"ip:{hash_ip(SECRET, '203.0.113.9')}:default"


async def test_refuses_a_request_when_the_database_is_unavailable() -> None:
    fake = database(RuntimeError("connection lost"))
    with pytest.raises(AppError, match="SERVICE_UNAVAILABLE"):
        await limiter(fake).consume(
            RateLimitRequest(profile="ai", user_id=USER, ip=None, route_id="POST /ai")
        )


async def test_uses_the_owner_role_for_the_table_without_policy() -> None:
    fake = database([{"tokens": "9.0000"}])
    decision = await limiter(fake).consume(
        RateLimitRequest(profile="auth", user_id=None, ip="198.51.100.7", route_id="POST /auth")
    )
    assert decision.limit == 10
    assert decision.remaining == 9
    assert fake.opened == 1


async def test_noop_limiter_never_refuses() -> None:
    decision = await NoopRateLimiter().consume(
        RateLimitRequest(profile="default", user_id=USER, ip=None, route_id="GET /x")
    )
    assert decision.allowed is True
    assert decision.limit == 0
    assert decision.retry_after_sec is None


def test_factory_installs_the_noop_only_outside_production() -> None:
    fake = database()
    noop = create_rate_limiter(
        Settings(app_env="local", rate_limit_mode="off"), cast(Database, fake), FixedClock(FIXED)
    )
    assert isinstance(noop, NoopRateLimiter)
    with pytest.raises(RuntimeError, match="refused in production"):
        create_rate_limiter(
            Settings(app_env="production", rate_limit_mode="off"),
            cast(Database, fake),
            FixedClock(FIXED),
        )


def test_factory_uses_the_configured_ip_secret() -> None:
    fake = database()
    created = create_rate_limiter(
        Settings(rate_limit_mode="on", rate_limit_ip_secret=SECRET),
        cast(Database, fake),
        FixedClock(FIXED),
    )
    assert isinstance(created, PostgresRateLimiter)
