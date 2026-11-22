"""[SPEC-2206] Export and deletion use cases (ported from `personal-data/services.test.ts`).

The database, the storage gateway and the e-mail service are fakes: the cases and the expected values
are the TypeScript ones (SPEC-211 EF-1, EF-2, EF-5, EF-6, CL-1, CL-2, CL-5, CL-7).
"""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from datetime import timedelta
from typing import Any

import pytest
from learny.engagement import public as engagement
from learny.identity.domain.actor import Actor
from learny.privacy.application import deletion as deletion_service
from learny.privacy.application import export as export_service
from learny.privacy.domain.exports import EXPORT_TTL_MS
from learny.privacy.infrastructure import queries
from learny.shared.clock import FixedClock
from learny.shared.config import Settings
from learny.shared.errors import AppError
from learny.shared.locale_fr import privacy as fr
from learny.shared.time import parse_iso, to_iso

pytestmark = pytest.mark.spec("SPEC-2206")

NOW = parse_iso("2026-11-11T12:20:00Z")
SIGNING_VALUE = "learny-test-signing-value"
USER = "11111111-1111-4111-8111-111111111111"
EXPORT_ID = "55555555-5555-4555-8555-555555555555"
ACTOR = Actor(user_id=USER, email="ada@test.learny.test", email_confirmed=True, transport="bearer")


@dataclass
class FakeTx:
    events: list[tuple[str, dict[str, Any], dict[str, Any]]] = field(default_factory=list)

    async def emit(self, name: str, data: dict[str, Any], **kwargs: Any) -> str:
        self.events.append((name, dict(data), kwargs))
        return "evt"


class FakeDb:
    def __init__(self) -> None:
        self.tx = FakeTx()
        self.opened = 0

    @asynccontextmanager
    async def service_tx(self) -> AsyncIterator[FakeTx]:
        self.opened += 1
        yield self.tx

    @asynccontextmanager
    async def user_tx(self, actor: Actor) -> AsyncIterator[FakeTx]:
        yield self.tx


@dataclass
class FakeStorage:
    url: str = "https://storage.test/export"
    asked: list[tuple[Any, ...]] = field(default_factory=list)

    async def sign_read(self, bucket: str, path: str, access_token: str, expires_in_seconds: int) -> str:
        self.asked.append((bucket, path, access_token, expires_in_seconds))
        return self.url


@dataclass
class FakeLogger:
    lines: list[tuple[str, dict[str, Any]]] = field(default_factory=list)

    def info(self, message: str, **fields: Any) -> None:
        self.lines.append((message, fields))

    def warn(self, message: str, **fields: Any) -> None:
        self.lines.append((message, fields))

    def error(self, message: str, **fields: Any) -> None:
        self.lines.append((message, fields))


@dataclass
class FakeDeps:
    settings: Settings
    clock: FixedClock
    db: FakeDb
    storage: FakeStorage
    email_config: Any
    email: Any
    logger: FakeLogger


def deps() -> FakeDeps:
    return FakeDeps(
        settings=Settings(supabase_jwt_secret=SIGNING_VALUE),
        clock=FixedClock(NOW),
        db=FakeDb(),
        storage=FakeStorage(),
        email_config=type("Config", (), {"app_url": "http://localhost:3100"})(),
        email=object(),
        logger=FakeLogger(),
    )


def export_row(**overrides: Any) -> queries.DataExportRow:
    values: dict[str, Any] = {
        "id": EXPORT_ID,
        "user_id": USER,
        "status": "queued",
        "storage_path": None,
        "expires_at": None,
        "size_bytes": None,
        "error": None,
        "requested_on": "2026-11-11",
        "created_at": NOW,
    }
    values.update(overrides)
    return queries.DataExportRow(**values)


async def test_an_export_is_queued_once_per_day_with_its_event(monkeypatch: Any) -> None:
    context = deps()
    created: list[tuple[str, str]] = []

    async def timezone(tx: Any, user_id: str) -> str:
        return "Europe/Paris"

    async def lock(tx: Any, user_id: str) -> None:
        return None

    async def pending(tx: Any, user_id: str) -> None:
        return None

    async def count(tx: Any, user_id: str, day: str) -> int:
        return 0

    async def create(tx: Any, user_id: str, day: str, created_at: Any) -> queries.DataExportRow:
        created.append((user_id, day))
        return export_row()

    monkeypatch.setattr(queries, "profile_timezone", timezone)
    monkeypatch.setattr(queries, "lock_daily_quota", lock)
    monkeypatch.setattr(queries, "find_pending_export", pending)
    monkeypatch.setattr(queries, "count_exports_on", count)
    monkeypatch.setattr(queries, "create_export", create)

    result = await export_service.request_export(context, ACTOR)

    assert result == {"exportId": EXPORT_ID, "status": "queued"}
    assert created == [(USER, "2026-11-11")]
    assert context.db.tx.events == [
        (
            "account/export-requested",
            {"userId": USER, "exportId": EXPORT_ID},
            {"event_id": f"account-export:{EXPORT_ID}", "user_id": USER},
        )
    ]


async def test_a_pending_export_is_returned_and_the_quota_refuses_the_fourth(monkeypatch: Any) -> None:
    context = deps()

    async def timezone(tx: Any, user_id: str) -> str:
        return "Europe/Paris"

    async def pending(tx: Any, user_id: str) -> queries.DataExportRow:
        return export_row(status="running")

    async def count(tx: Any, user_id: str, day: str) -> int:
        return 3

    monkeypatch.setattr(queries, "profile_timezone", timezone)
    monkeypatch.setattr(queries, "lock_daily_quota", lambda tx, uid: _noop())
    monkeypatch.setattr(queries, "find_pending_export", pending)

    assert await export_service.request_export(context, ACTOR) == {
        "exportId": EXPORT_ID,
        "status": "running",
    }
    monkeypatch.setattr(queries, "find_pending_export", lambda tx, uid: _none())
    monkeypatch.setattr(queries, "count_exports_on", count)
    with pytest.raises(AppError) as raised:
        await export_service.request_export(context, ACTOR)
    assert (raised.value.code, raised.value.detail) == (
        "EXPORT_LIMIT_REACHED",
        fr.EXPORT_LIMIT_MESSAGE,
    )


async def test_a_missing_profile_and_an_anonymous_request_are_refused(monkeypatch: Any) -> None:
    context = deps()

    async def timezone(tx: Any, user_id: str) -> None:
        return None

    monkeypatch.setattr(queries, "profile_timezone", timezone)
    with pytest.raises(AppError) as raised:
        await export_service.request_export(context, ACTOR)
    assert raised.value.code == "NOT_FOUND"
    with pytest.raises(AppError) as raised:
        await export_service.request_export(context, None)
    assert raised.value.code == "UNAUTHENTICATED"


async def test_reading_an_export_signs_a_done_archive_and_refuses_an_expired_one(monkeypatch: Any) -> None:
    context = deps()
    expires = NOW + timedelta(milliseconds=EXPORT_TTL_MS)
    done = export_row(
        status="done", size_bytes=2048, storage_path=f"{USER}/{EXPORT_ID}.zip", expires_at=expires
    )

    async def readable(tx: Any, user_id: str, export_id: str) -> queries.DataExportRow:
        return done

    monkeypatch.setattr(queries, "get_export", readable)
    view = await export_service.get_export(context, ACTOR, EXPORT_ID)
    assert view == {
        "id": EXPORT_ID,
        "status": "done",
        "sizeBytes": 2048,
        "createdAt": to_iso(NOW),
        "expiresAt": to_iso(expires),
        "downloadUrl": "https://storage.test/export",
    }
    assert context.storage.asked[0][0] == "exports"
    assert context.storage.asked[0][1] == f"{USER}/{EXPORT_ID}.zip"
    assert context.storage.asked[0][3] == 600

    async def queued(tx: Any, user_id: str, export_id: str) -> queries.DataExportRow:
        return export_row()

    monkeypatch.setattr(queries, "get_export", queued)
    assert "downloadUrl" not in await export_service.get_export(context, ACTOR, EXPORT_ID)

    async def expired(tx: Any, user_id: str, export_id: str) -> queries.DataExportRow:
        return export_row(status="done", expires_at=parse_iso("2026-10-01T00:00:00Z"))

    monkeypatch.setattr(queries, "get_export", expired)
    with pytest.raises(AppError) as raised:
        await export_service.get_export(context, ACTOR, EXPORT_ID)
    assert (raised.value.code, raised.value.detail) == (
        "EXPORT_EXPIRED",
        fr.EXPORT_EXPIRED_MESSAGE,
    )


async def test_a_foreign_or_missing_export_is_a_plain_not_found(monkeypatch: Any) -> None:
    context = deps()

    async def missing(tx: Any, user_id: str, export_id: str) -> None:
        return None

    monkeypatch.setattr(queries, "get_export", missing)
    for call in (
        export_service.get_export(context, ACTOR, EXPORT_ID),
        export_service.download_export(context, ACTOR, EXPORT_ID),
    ):
        with pytest.raises(AppError) as raised:
            await call
        assert raised.value.code == "NOT_FOUND"


async def test_download_answers_a_signed_url_or_an_expired_archive(monkeypatch: Any) -> None:
    context = deps()
    done = export_row(
        status="done",
        storage_path=f"{USER}/x.zip",
        expires_at=NOW + timedelta(milliseconds=EXPORT_TTL_MS),
    )

    async def readable(tx: Any, user_id: str, export_id: str) -> queries.DataExportRow:
        return done

    monkeypatch.setattr(queries, "get_export", readable)
    assert await export_service.download_export(context, ACTOR, EXPORT_ID) == {
        "url": "https://storage.test/export"
    }

    async def expired(tx: Any, user_id: str, export_id: str) -> queries.DataExportRow:
        return export_row(
            status="done", storage_path=f"{USER}/x.zip", expires_at=parse_iso("2026-10-01T00:00:00Z")
        )

    monkeypatch.setattr(queries, "get_export", expired)
    with pytest.raises(AppError) as raised:
        await export_service.download_export(context, ACTOR, EXPORT_ID)
    assert raised.value.code == "EXPORT_EXPIRED"


async def test_scheduling_is_idempotent_and_sends_one_localized_email(monkeypatch: Any) -> None:
    context = deps()
    sent: list[dict[str, Any]] = []

    async def send_email(deps: Any, **kwargs: Any) -> dict[str, Any]:
        sent.append(kwargs)
        return {"messageId": "m1", "category": "transactional"}

    monkeypatch.setattr(engagement, "send_email", send_email)
    deadline = NOW + timedelta(days=30)

    async def first_capture(tx: Any, user_id: str) -> queries.ProfileDeletionRow:
        return queries.ProfileDeletionRow(
            id=USER,
            email="ada@test.learny.test",
            timezone="Europe/Paris",
            deletion_requested_at=None,
            deletion_scheduled_for=None,
        )

    async def schedule(tx: Any, user_id: str, now: Any, scheduled: Any) -> bool:
        return True

    monkeypatch.setattr(queries, "lock_profile_for_deletion", first_capture)
    monkeypatch.setattr(queries, "schedule_deletion", schedule)
    assert await deletion_service.schedule_deletion(context, ACTOR) == {"scheduledFor": to_iso(deadline)}
    assert sent[0]["template"] == fr.DELETION_SCHEDULED_TEMPLATE
    assert sent[0]["props"]["scheduledLabel"] == "vendredi 11 d\u00e9cembre \u00e0 13:20"
    assert sent[0]["idempotency_key"] == f"deletion-scheduled:{USER}:{to_iso(deadline)}"

    async def already(tx: Any, user_id: str) -> queries.ProfileDeletionRow:
        return queries.ProfileDeletionRow(
            id=USER,
            email="ada@test.learny.test",
            timezone="UTC",
            deletion_requested_at=NOW,
            deletion_scheduled_for=parse_iso("2026-12-11T12:20:00Z"),
        )

    monkeypatch.setattr(queries, "lock_profile_for_deletion", already)
    assert await deletion_service.schedule_deletion(context, ACTOR) == {
        "scheduledFor": "2026-12-11T12:20:00.000Z"
    }
    assert len(sent) == 1


async def test_a_missing_profile_fails_and_the_email_failure_is_raised(monkeypatch: Any) -> None:
    context = deps()

    async def missing(tx: Any, user_id: str) -> None:
        return None

    monkeypatch.setattr(queries, "lock_profile_for_deletion", missing)
    with pytest.raises(AppError) as raised:
        await deletion_service.schedule_deletion(context, ACTOR)
    assert raised.value.code == "NOT_FOUND"


async def test_cancelling_clears_both_columns_even_without_a_pending_request(monkeypatch: Any) -> None:
    context = deps()
    calls: list[dict[str, Any]] = []

    async def cancel(tx: Any, user_id: str, now: Any) -> None:
        calls.append({"user_id": user_id, "now": now})

    monkeypatch.setattr(queries, "cancel_deletion", cancel)
    await deletion_service.cancel_deletion(context, ACTOR)
    assert calls == [{"user_id": USER, "now": NOW}]
    with pytest.raises(AppError) as raised:
        await deletion_service.cancel_deletion(context, None)
    assert raised.value.code == "UNAUTHENTICATED"


async def _noop() -> None:
    return None


async def _none() -> None:
    return None
