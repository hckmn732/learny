"""[SPEC-2206] Export and deletion against the local stack (SPEC-211 CA-1 to CA-5).

Real Postgres (RLS, cascades, constraints), the real export job and the real nightly deletion.
Storage and Auth are injected: the archive is captured in memory, the Auth admin deletes the real
`auth.users` row, and the e-mails stay in the memory outbox. The clock is frozen at
2026-11-11T12:20:00Z and only advanced explicitly (ADR-0047).
"""

from dataclasses import dataclass
from datetime import timedelta
from pathlib import Path
from typing import Any

import pytest
from factories.db_support import rolled_back
from factories.engagement_deps import EngagementTransactions, engagement_deps
from factories.identity_support import FIXED, actor_for, create_user
from learny.privacy.application.deletion import cancel_deletion, schedule_deletion
from learny.privacy.application.deletion_job import DeletionJobDeps, run_account_deletion
from learny.privacy.application.export import download_export, get_export, request_export
from learny.privacy.application.export_job import ExportJobDeps, run_data_export
from learny.privacy.application.purge import PurgeDeps, purge_exports
from learny.privacy.domain.exports import EXPORT_PURGE_GRACE_MS, EXPORT_TTL_MS
from learny.privacy.infrastructure import queries
from learny.shared.clock import FixedClock
from learny.shared.config import Settings
from learny.shared.db.uow import Database
from learny.shared.errors import AppError
from learny.shared.locale_fr import privacy as fr
from sqlalchemy import text

pytestmark = pytest.mark.spec("SPEC-2206")

DAY = timedelta(days=1)
SIGNING_VALUE = "learny-test-signing-value"


@dataclass
class PrivacyTestDeps:
    """The bundle the privacy use cases see; it also satisfies the mail ports of `engagement`."""

    settings: Any
    clock: FixedClock
    db: EngagementTransactions
    storage: "FakeStorage"
    email_config: Any
    email: Any
    logger: Any


class FakeStorage:
    def __init__(self) -> None:
        self.asked: list[tuple[str, str, int]] = []

    async def sign_read(self, bucket: str, path: str, access_token: str, expires_in_seconds: int) -> str:
        self.asked.append((bucket, path, expires_in_seconds))
        return "https://storage.test/signed?token=test"


def deps(tx: Any, now: Any = FIXED) -> PrivacyTestDeps:
    base = engagement_deps(tx, now=now)
    return PrivacyTestDeps(
        settings=Settings(
            app_env="test",
            supabase_jwt_secret=SIGNING_VALUE,
        ),
        clock=FixedClock(now),
        db=base.db,
        storage=FakeStorage(),
        email_config=base.email_config,
        email=base.email,
        logger=base.logger,
    )


def export_ports(started: dict[str, int]) -> ExportJobDeps:
    async def read_object(storage_path: str) -> bytes | None:
        return None

    async def upload_archive(bucket: Any, storage_path: str, archive: Path) -> None:
        started["size"] = archive.stat().st_size if archive.exists() else -1
        started["path"] = storage_path

    return ExportJobDeps(read_object=read_object, upload_archive=upload_archive)


async def export_row(tx: Any, export_id: str) -> dict[str, Any]:
    result = await tx.conn.execute(
        text(
            "select status::text as status, size_bytes, storage_path, expires_at, error "
            "from public.data_exports where id = cast(:id as uuid)"
        ),
        {"id": export_id},
    )
    return dict(result.mappings().one())


async def test_an_export_is_queued_then_downloadable_only_for_its_owner(database: Database) -> None:
    async def run(tx: Any) -> None:
        alice = await create_user(tx.conn, "Alice", timezone="Europe/Paris")
        bob = await create_user(tx.conn, "Bob", timezone="Europe/Paris")
        bundle = deps(tx)

        accepted = await request_export(bundle, actor_for(alice))
        assert accepted["status"] == "queued"
        replay = await request_export(bundle, actor_for(alice))
        assert replay["exportId"] == accepted["exportId"]

        ports = export_ports({})
        outcome = await run_data_export(bundle, alice, accepted["exportId"], ports)
        assert outcome.status == "done"
        assert outcome.size_bytes is not None and outcome.size_bytes > 0
        stored = await export_row(tx, accepted["exportId"])
        assert stored["status"] == "done"
        assert stored["storage_path"].startswith(f"{alice}/")
        assert stored["expires_at"] is not None

        view = await get_export(bundle, actor_for(alice), accepted["exportId"])
        assert view["status"] == "done"
        assert view["downloadUrl"].startswith("https://storage.test/signed")
        assert bundle.storage.asked[0][2] == 600
        assert (await download_export(bundle, actor_for(alice), accepted["exportId"]))["url"]

        # CL-5 - another learner sees a plain 404, under the owner's row-level security.
        for call in (
            get_export(bundle, actor_for(bob), accepted["exportId"]),
            download_export(bundle, actor_for(bob), accepted["exportId"]),
        ):
            with pytest.raises(AppError) as raised:
                await call
            assert raised.value.code == "NOT_FOUND"

        # CL-4 - after seven days the archive is expired and the route answers 410.
        late = deps(tx, FIXED + 8 * DAY)
        late.storage = bundle.storage
        with pytest.raises(AppError) as raised:
            await get_export(late, actor_for(alice), accepted["exportId"])
        assert raised.value.code == "EXPORT_EXPIRED"

        # EF-8 - the purge removes the object and the row once expired for more than 24 h.
        removed: list[tuple[str, str]] = []

        async def remove_object(bucket: str, path: str) -> None:
            removed.append((bucket, path))

        after = deps(tx, FIXED + 10 * DAY)
        outcome_purge = await purge_exports(after, PurgeDeps(remove_object=remove_object))
        assert outcome_purge.rows >= 1
        assert ("exports", stored["storage_path"]) in removed
        with pytest.raises(Exception):
            await export_row(tx, accepted["exportId"])

    await rolled_back(database, run)


async def test_three_exports_per_local_day_then_the_limit(database: Database) -> None:
    async def run(tx: Any) -> None:
        user = await create_user(tx.conn, "Limite", timezone="Europe/Paris")
        bundle = deps(tx)
        for _ in range(3):
            accepted = await request_export(bundle, actor_for(user))
            await run_data_export(bundle, user, accepted["exportId"], export_ports({}))
        with pytest.raises(AppError) as raised:
            await request_export(bundle, actor_for(user))
        assert (raised.value.code, raised.value.detail) == (
            "EXPORT_LIMIT_REACHED",
            fr.EXPORT_LIMIT_MESSAGE,
        )
        next_day = deps(tx, FIXED + DAY)
        assert (await request_export(next_day, actor_for(user)))["status"] == "queued"

    await rolled_back(database, run)


async def test_scheduling_and_cancelling_a_deletion_are_idempotent(database: Database) -> None:
    async def run(tx: Any) -> None:
        user = await create_user(tx.conn, "Suppression", timezone="Europe/Paris")
        bundle = deps(tx)

        first = await schedule_deletion(bundle, actor_for(user))
        assert first["scheduledFor"] == (FIXED + 30 * DAY).isoformat(timespec="milliseconds").replace(
            "+00:00", "Z"
        )
        second = await schedule_deletion(bundle, actor_for(user))
        assert second == first
        emails = [
            entry for entry in bundle.email.entries() if entry.message.to == "id-suppression@test.learny.test"
        ]
        assert len(emails) == 1
        assert fr.DELETION_SCHEDULED_TEMPLATE in str(emails[0].message.tags)

        await cancel_deletion(bundle, actor_for(user))
        await cancel_deletion(bundle, actor_for(user))
        columns = await tx.conn.execute(
            text(
                "select deletion_requested_at, deletion_scheduled_for from public.profiles "
                "where id = cast(:user as uuid)"
            ),
            {"user": user},
        )
        data = dict(columns.mappings().one())
        assert data["deletion_requested_at"] is None
        assert data["deletion_scheduled_for"] is None

    await rolled_back(database, run)


async def test_an_account_is_deleted_only_once_due_and_after_a_cancellation_nothing_happens(
    database: Database,
) -> None:
    async def run(tx: Any) -> None:
        user = await create_user(tx.conn, "Echeance", timezone="Europe/Paris")
        bundle = deps(tx)
        await schedule_deletion(bundle, actor_for(user))

        async def remove_object(bucket: str, path: str) -> None:
            return None

        class Admin:
            def __init__(self) -> None:
                self.deleted = False

            async def delete_user(self, user_id: str) -> None:
                self.deleted = True
                await tx.conn.execute(
                    text("delete from auth.users where id = cast(:id as uuid)"), {"id": user_id}
                )

            async def exists(self, user_id: str) -> bool:
                result = await tx.conn.execute(
                    text("select exists (select 1 from auth.users where id = cast(:id as uuid))"),
                    {"id": user_id},
                )
                return bool(result.scalar_one())

        admin = Admin()
        ports = DeletionJobDeps(remove_object=remove_object, admin=admin)

        early = await run_account_deletion(bundle, user, ports)
        assert early.deleted is False
        assert admin.deleted is False

        await cancel_deletion(bundle, actor_for(user))
        cancelled = await run_account_deletion(deps(tx, FIXED + 31 * DAY), user, ports)
        assert cancelled.deleted is False
        still = await tx.conn.execute(
            text("select exists (select 1 from public.profiles where id = cast(:id as uuid)) as present"),
            {"id": user},
        )
        assert still.scalar_one() is True

        await schedule_deletion(bundle, actor_for(user))
        due = await run_account_deletion(deps(tx, FIXED + 31 * DAY), user, ports)
        assert due.deleted is True
        assert due.auth_status == fr.AUTH_DELETED
        assert admin.deleted is True
        profile = await tx.conn.execute(
            text("select exists (select 1 from public.profiles where id = cast(:id as uuid)) as present"),
            {"id": user},
        )
        assert profile.scalar_one() is False

    await rolled_back(database, run)


async def test_the_purge_keeps_a_recent_expiration(database: Database) -> None:
    async def run(tx: Any) -> None:
        user = await create_user(tx.conn, "Purge", timezone="Europe/Paris")
        bundle = deps(tx)
        accepted = await request_export(bundle, actor_for(user))
        await run_data_export(bundle, user, accepted["exportId"], export_ports({}))
        # Not expired yet, and expired for less than the one-day grace period: nothing is removed.
        removed: list[tuple[str, str]] = []

        async def remove_object(bucket: str, path: str) -> None:
            removed.append((bucket, path))

        assert (await purge_exports(bundle, PurgeDeps(remove_object=remove_object))).rows == 0
        assert removed == []
        just_expired = deps(tx, FIXED + timedelta(milliseconds=EXPORT_TTL_MS))
        assert (await purge_exports(just_expired, PurgeDeps(remove_object=remove_object))).rows == 0
        after_grace = deps(tx, FIXED + timedelta(milliseconds=EXPORT_TTL_MS + EXPORT_PURGE_GRACE_MS + 1000))
        assert (await purge_exports(after_grace, PurgeDeps(remove_object=remove_object))).rows == 1
        assert removed and removed[0][0] == "exports"

    await rolled_back(database, run)


async def test_the_queries_read_under_the_owner_row_level_security(database: Database) -> None:
    async def run(tx: Any) -> None:
        alice = await create_user(tx.conn, "Rls", timezone="Europe/Paris")
        bob = await create_user(tx.conn, "Rls2", timezone="Europe/Paris")
        created = await queries.create_export(tx, alice, "2026-11-11", FIXED)
        assert created.user_id == alice
        async with queries_tx(tx, bob) as foreign:
            assert await queries.get_export(foreign, bob, created.id) is None
        async with queries_tx(tx, alice) as mine:
            assert (await queries.get_export(mine, alice, created.id)).id == created.id

    await rolled_back(database, run)


def queries_tx(tx: Any, user_id: str) -> Any:
    """A transaction under the learner's claims, as the pipeline builds it."""
    from contextlib import asynccontextmanager

    from factories.identity_support import SET_CLAIMS
    from learny.shared.db.uow import Tx, claims_json

    @asynccontextmanager
    async def open_tx() -> Any:
        conn = tx.conn
        await conn.execute(text("savepoint owner_read"))
        await conn.execute(SET_CLAIMS, {"claims": claims_json(actor_for(user_id)), "sub": user_id})
        await conn.execute(text("set local role authenticated"))
        try:
            yield Tx(conn=conn, actor=actor_for(user_id))
        except Exception:
            await conn.execute(text("reset role"))
            await conn.execute(text("rollback to savepoint owner_read"))
            raise
        await conn.execute(text("reset role"))
        await conn.execute(text("release savepoint owner_read"))

    return open_tx()
