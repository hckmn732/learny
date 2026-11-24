"""[SPEC-2101] Idempotency: request hash, reservation, replay and release (ADR-0120)."""

import json
from collections.abc import AsyncIterator, Mapping, Sequence
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from datetime import timedelta
from typing import Any, cast

import pytest
from learny.shared.clock import FixedClock
from learny.shared.db.uow import Database
from learny.shared.errors import AppError
from learny.shared.time import parse_iso
from learny_api.guards.idempotency import (
    IDEMPOTENCY_VALIDITY,
    IdempotencyStore,
    compute_request_hash,
    read_idempotency_key,
)

pytestmark = pytest.mark.spec("SPEC-2101")

USER = "11111111-1111-4111-8111-111111111111"
KEY = "export-2026-11-11"
FIXED = parse_iso("2026-11-11T12:20:00Z")


class FakeResult:
    def __init__(self, rows: Sequence[Mapping[str, Any]]) -> None:
        self._rows = list(rows)

    def mappings(self) -> "FakeResult":
        return self

    def all(self) -> list[Mapping[str, Any]]:
        return self._rows


class FakeConnection:
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


def store(*outcomes: Any) -> tuple[IdempotencyStore, FakeDatabase]:
    fake = FakeDatabase(conn=FakeConnection(outcomes))
    return IdempotencyStore(cast(Database, fake), FixedClock(FIXED)), fake


def row(
    *,
    route: str = "/api/v1/formations/:id/exports",
    request_hash: str = "a" * 64,
    status_code: int = 0,
    completed_at: Any = None,
    created_at: Any = None,
    response: Any = None,
) -> dict[str, Any]:
    return {
        "user_id": USER,
        "key": KEY,
        "route": route,
        "request_hash": request_hash,
        "status_code": status_code,
        "response": response,
        "created_at": created_at or FIXED,
        "completed_at": completed_at,
    }


def test_reads_a_valid_key() -> None:
    assert read_idempotency_key("export-2026-11-11") == "export-2026-11-11"
    assert read_idempotency_key("A_b-12345") == "A_b-12345"


@pytest.mark.parametrize(
    "header", [None, "", "court", "x" * 129, "cl\u00e9-avec-accent", "cl\u00e9 avec espace"]
)
def test_refuses_an_absent_or_malformed_key(header: str | None) -> None:
    with pytest.raises(AppError, match="IDEMPOTENCY_KEY_REQUIRED"):
        read_idempotency_key(header)


def test_request_hash_is_stable_canonical_and_covers_the_whole_request() -> None:
    base: dict[str, Any] = {
        "method": "post",
        "route": "/api/v1/formations/:id/exports",
        "params": {"id": "f1", "page": 2},
        "body": {"title": "Tresorerie", "tags": ["b", "a"], "nested": {"z": 1, "a": 2}},
    }
    first = compute_request_hash(**base)
    assert len(first) == 64
    assert all(character in "0123456789abcdef" for character in first)
    reordered = compute_request_hash(
        method="POST",
        route=base["route"],
        params={"page": 2, "id": "f1"},
        body={"nested": {"a": 2, "z": 1}, "tags": ["b", "a"], "title": "Tresorerie"},
    )
    assert reordered == first
    assert compute_request_hash(**{**base, "route": "/api/v1/other"}) != first
    assert compute_request_hash(**{**base, "method": "PUT"}) != first
    assert compute_request_hash(**{**base, "params": {"id": "f1", "page": 3}}) != first
    assert compute_request_hash(**{**base, "body": {**base["body"], "title": "Budget"}}) != first
    # Arrays keep their order: a different order is a different body.
    assert compute_request_hash(**{**base, "body": {**base["body"], "tags": ["a", "b"]}}) != first


def test_request_hash_refuses_an_empty_method() -> None:
    with pytest.raises(AppError, match="VALIDATION_FAILED"):
        compute_request_hash(method="", route="/api/v1/x")


def test_request_hash_refuses_a_route_over_300_characters() -> None:
    with pytest.raises(AppError, match="VALIDATION_FAILED"):
        compute_request_hash(method="POST", route="/" + "x" * 300)


def test_request_hash_refuses_a_non_finite_number() -> None:
    with pytest.raises(AppError, match="VALIDATION_FAILED"):
        compute_request_hash(method="POST", route="/api/v1/x", body=float("inf"))


def test_request_hash_treats_no_parameters_as_an_empty_object() -> None:
    assert compute_request_hash("POST", "/api/v1/x") == compute_request_hash("POST", "/api/v1/x", {}, None)


async def test_reserves_the_key_when_free() -> None:
    repository, fake = store([row()])
    started = await repository.begin(USER, KEY, "POST", "/api/v1/formations/:id/exports", {}, {})
    assert started.state == "reserved"
    assert fake.opened == 1
    parameters = fake.conn.calls[0][1]
    assert parameters["key"] == KEY
    assert parameters["created_at"] == FIXED
    assert len(parameters["request_hash"]) == 64


async def test_replays_the_stored_answer() -> None:
    completed = FIXED + timedelta(minutes=1)
    request_hash = compute_request_hash("POST", "/api/v1/formations/:id/exports", {}, {})
    stored = row(
        request_hash=request_hash,
        status_code=201,
        completed_at=completed,
        response={"id": "export-1"},
    )
    repository, _ = store([], [stored])
    started = await repository.begin(USER, KEY, "POST", "/api/v1/formations/:id/exports", {}, {})
    assert started.state == "replayed"
    assert started.status_code == 201
    assert started.response == {"id": "export-1"}


async def test_refuses_a_reuse_for_another_request() -> None:
    request_hash = compute_request_hash("POST", "/api/v1/formations/:id/exports", {}, {})
    stored = row(request_hash="b" * 64, status_code=201, completed_at=FIXED)
    repository, _ = store([], [stored])
    assert request_hash != stored["request_hash"]
    with pytest.raises(AppError, match="IDEMPOTENCY_KEY_REUSED") as caught:
        await repository.begin(USER, KEY, "POST", "/api/v1/formations/:id/exports", {}, {})
    assert caught.value.status == 422


async def test_refuses_while_the_first_request_runs() -> None:
    request_hash = compute_request_hash("POST", "/api/v1/formations/:id/exports", {}, {})
    stored = row(request_hash=request_hash, status_code=0, completed_at=None)
    repository, _ = store([], [stored])
    with pytest.raises(AppError, match="IDEMPOTENCY_IN_PROGRESS") as caught:
        await repository.begin(USER, KEY, "POST", "/api/v1/formations/:id/exports", {}, {})
    assert caught.value.status == 409
    assert caught.value.retry_after == 1


async def test_reuses_a_key_after_the_validity_window() -> None:
    request_hash = compute_request_hash("POST", "/api/v1/formations/:id/exports", {}, {})
    stale = row(
        request_hash=request_hash,
        status_code=201,
        completed_at=FIXED - IDEMPOTENCY_VALIDITY - timedelta(minutes=1),
        created_at=FIXED - IDEMPOTENCY_VALIDITY - timedelta(minutes=1),
    )
    repository, _ = store([], [stale], [{"key": KEY}], [row(request_hash=request_hash)])
    started = await repository.begin(USER, KEY, "POST", "/api/v1/formations/:id/exports", {}, {})
    assert started.state == "reserved"


async def test_finish_stores_the_answer() -> None:
    repository, fake = store([row(status_code=201, completed_at=FIXED)])
    await repository.finish(USER, KEY, 201, {"id": "export-1"})
    parameters = fake.conn.calls[0][1]
    assert parameters["status_code"] == 201
    assert json.loads(parameters["response"]) == {"id": "export-1"}
    assert parameters["completed_at"] == FIXED


async def test_finish_refuses_an_unknown_reservation() -> None:
    repository, _ = store([])
    with pytest.raises(AppError, match="NOT_FOUND"):
        await repository.finish(USER, KEY, 201, {"id": "export-1"})


@pytest.mark.parametrize("status_code", [199, 500])
async def test_finish_refuses_a_status_outside_the_contract(status_code: int) -> None:
    repository, _ = store([])
    with pytest.raises(AppError, match="VALIDATION_FAILED"):
        await repository.finish(USER, KEY, status_code, {})


async def test_release_removes_the_reservation() -> None:
    repository, fake = store([{"key": KEY}])
    assert await repository.release(USER, KEY) is True
    assert fake.conn.calls[0][1] == {"user_id": USER, "key": KEY}


async def test_release_reports_an_absent_reservation() -> None:
    repository, _ = store([])
    assert await repository.release(USER, KEY) is False


async def test_a_malformed_user_is_refused_before_the_database() -> None:
    repository, fake = store([])
    with pytest.raises(AppError, match="VALIDATION_FAILED"):
        await repository.begin("not-a-uuid", KEY, "POST", "/api/v1/x", {}, {})
    assert fake.opened == 0
