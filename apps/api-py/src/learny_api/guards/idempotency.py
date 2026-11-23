"""Idempotent POST (SPEC-2101 step 3, SPEC-201 ET-4, ADR-0120, ADR-0219).

Port of `packages/http/src/idempotency.ts` and of the idempotency repositories of
`packages/db/src/repositories/idempotency.ts`. The reservation is committed before the service runs,
so a concurrent request with the same key sees it (409 while in progress). A success or a 4xx is
kept for replays during 24 h; a 5xx or an exception releases the reservation so the client can retry.
"""

import hashlib
import json
import re
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any, Literal

from learny.shared.clock import Clock
from learny.shared.db.uow import Database
from learny.shared.errors import AppError
from learny.shared.jsonx import canonical
from learny.shared.locale_fr.details import (
    IDEMPOTENCY_IN_PROGRESS,
    IDEMPOTENCY_KEY_NOT_FOUND,
    IDEMPOTENCY_KEY_REQUIRED,
    IDEMPOTENCY_KEY_REUSED,
    IDEMPOTENCY_RESERVATION_NOT_FOUND,
)
from sqlalchemy import text

IDEMPOTENCY_KEY_HEADER = "idempotency-key"
IDEMPOTENCY_VALIDITY = timedelta(hours=24)
KEY_PATTERN = re.compile(r"^[A-Za-z0-9_-]{8,128}$")
ROUTE_MAX_LENGTH = 300
METHOD_MAX_LENGTH = 20

INSERT_KEY = text(
    """
    insert into public.idempotency_keys (user_id, key, route, request_hash, status_code, created_at)
    values (cast(:user_id as uuid), :key, :route, :request_hash, 0, cast(:created_at as timestamptz))
    on conflict (user_id, key) do nothing
    returning user_id::text as user_id, key, route, request_hash, status_code, response,
              created_at, completed_at
    """
)
SELECT_KEY = text(
    """
    select user_id::text as user_id, key, route, request_hash, status_code, response,
           created_at, completed_at
    from public.idempotency_keys where user_id = cast(:user_id as uuid) and key = :key
    """
)
DELETE_EXPIRED_KEY = text(
    """
    delete from public.idempotency_keys
    where user_id = cast(:user_id as uuid) and key = :key
      and created_at < cast(:threshold as timestamptz)
    returning key
    """
)
COMPLETE_KEY = text(
    """
    update public.idempotency_keys
    set status_code = :status_code, response = cast(:response as jsonb),
        completed_at = cast(:completed_at as timestamptz)
    where user_id = cast(:user_id as uuid) and key = :key and status_code = 0
    returning user_id::text as user_id, key, route, request_hash, status_code, response,
              created_at, completed_at
    """
)
RELEASE_KEY = text(
    """
    delete from public.idempotency_keys
    where user_id = cast(:user_id as uuid) and key = :key and status_code = 0
    returning key
    """
)


@dataclass(frozen=True, slots=True)
class IdempotencyRecord:
    """One row of `idempotency_keys` (`status_code` 0 means still in progress)."""

    user_id: str
    key: str
    route: str
    request_hash: str
    status_code: int
    response: Any
    created_at: datetime
    completed_at: datetime | None


@dataclass(frozen=True, slots=True)
class IdempotencyStart:
    """Either the reservation is ours, or the original answer is replayed."""

    state: Literal["reserved", "replayed"]
    status_code: int | None = None
    response: Any = None


def read_idempotency_key(header: str | None) -> str:
    """The key of the `Idempotency-Key` header; 400 when absent or malformed."""
    if header is None or KEY_PATTERN.match(header) is None:
        raise AppError("IDEMPOTENCY_KEY_REQUIRED", IDEMPOTENCY_KEY_REQUIRED)
    return header


def compute_request_hash(
    method: str,
    route: str,
    params: Any = None,
    body: Any = None,
) -> str:
    """SHA-256 of the method, the route template, the canonical parameters and body."""
    normalized_method = method.strip().upper()
    normalized_route = route.strip()
    if normalized_method == "" or normalized_route == "":
        raise AppError("VALIDATION_FAILED")
    if len(normalized_route) > ROUTE_MAX_LENGTH:
        raise AppError("VALIDATION_FAILED")
    try:
        canonical_params = canonical({} if params is None else params).decode("utf-8")
        canonical_body = canonical(None if body is None else body).decode("utf-8")
    except ValueError as error:
        # `canonicalJson` refuses a value JSON cannot represent (non-finite number, unknown type).
        raise AppError("VALIDATION_FAILED") from error
    payload = "\n".join((normalized_method, normalized_route, canonical_params, canonical_body))
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def _identifier(value: str) -> str:
    try:
        uuid.UUID(value)
    except (ValueError, AttributeError, TypeError) as error:
        raise AppError("VALIDATION_FAILED") from error
    return value


def _record(row: Any) -> IdempotencyRecord:
    return IdempotencyRecord(
        user_id=str(row["user_id"]),
        key=str(row["key"]),
        route=str(row["route"]),
        request_hash=str(row["request_hash"]),
        status_code=int(row["status_code"]),
        response=row["response"],
        created_at=row["created_at"],
        completed_at=row["completed_at"],
    )


class IdempotencyStore:
    """Opens one service transaction per call, like `serviceDb().transaction` in TypeScript."""

    def __init__(self, db: Database, clock: Clock) -> None:
        self._db = db
        self._clock = clock

    async def begin(
        self,
        user_id: str,
        key: str,
        method: str,
        route: str,
        params: Any = None,
        body: Any = None,
    ) -> IdempotencyStart:
        """Reserves the key, or replays the stored answer; 422 when reused, 409 while running."""
        owner = _identifier(user_id)
        identifier = read_idempotency_key(key)
        request_hash = compute_request_hash(method, route, params, body)
        now = self._clock.now()
        threshold = now - IDEMPOTENCY_VALIDITY
        try:
            async with self._db.service_tx() as tx:
                for _ in range(2):
                    reserved = (
                        (
                            await tx.conn.execute(
                                INSERT_KEY,
                                {
                                    "user_id": owner,
                                    "key": identifier,
                                    "route": route.strip(),
                                    "request_hash": request_hash,
                                    "created_at": now,
                                },
                            )
                        )
                        .mappings()
                        .all()
                    )
                    if reserved:
                        return IdempotencyStart(state="reserved")
                    existing = (
                        (await tx.conn.execute(SELECT_KEY, {"user_id": owner, "key": identifier}))
                        .mappings()
                        .all()
                    )
                    if not existing:
                        continue
                    record = _record(existing[0])
                    if record.created_at < threshold:
                        await tx.conn.execute(
                            DELETE_EXPIRED_KEY,
                            {"user_id": owner, "key": identifier, "threshold": threshold},
                        )
                        continue
                    if record.route != route.strip() or record.request_hash != request_hash:
                        raise AppError("IDEMPOTENCY_KEY_REUSED", IDEMPOTENCY_KEY_REUSED, status=422)
                    if record.status_code == 0 or record.completed_at is None:
                        raise AppError(
                            "IDEMPOTENCY_IN_PROGRESS",
                            IDEMPOTENCY_IN_PROGRESS,
                            status=409,
                            retry_after=1,
                        )
                    return IdempotencyStart(
                        state="replayed",
                        status_code=record.status_code,
                        response=record.response,
                    )
        except AppError:
            raise
        except Exception as error:
            raise AppError("INTERNAL_ERROR") from error
        raise AppError("INTERNAL_ERROR", IDEMPOTENCY_RESERVATION_NOT_FOUND)

    async def finish(self, user_id: str, key: str, status_code: int, response: Any) -> None:
        """Stores the original answer and its status; a success or a 4xx is final."""
        owner = _identifier(user_id)
        identifier = read_idempotency_key(key)
        if not 200 <= status_code <= 499:
            raise AppError("VALIDATION_FAILED")
        async with self._db.service_tx() as tx:
            updated = (
                (
                    await tx.conn.execute(
                        COMPLETE_KEY,
                        {
                            "user_id": owner,
                            "key": identifier,
                            "status_code": status_code,
                            "response": json.dumps(response, ensure_ascii=False),
                            "completed_at": self._clock.now(),
                        },
                    )
                )
                .mappings()
                .all()
            )
        if not updated:
            raise AppError("NOT_FOUND", IDEMPOTENCY_KEY_NOT_FOUND)

    async def release(self, user_id: str, key: str) -> bool:
        """A 5xx or an exception removes the reservation, allowing a fresh attempt."""
        owner = _identifier(user_id)
        identifier = read_idempotency_key(key)
        async with self._db.service_tx() as tx:
            deleted = (
                (await tx.conn.execute(RELEASE_KEY, {"user_id": owner, "key": identifier})).mappings().all()
            )
        return bool(deleted)
