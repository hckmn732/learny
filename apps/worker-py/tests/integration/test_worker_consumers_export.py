"""[SPEC-2207] Personal-data export consumed by the real worker: one archive, once.

`account/export-requested` reaches `privacy.run_data_export` through the dispatcher and the runner.
The storage ports are in memory (no network); a replayed event creates no second archive and no
second notification.
"""

from pathlib import Path
from typing import Any

import pytest
from factories.db_support import rolled_back
from factories.identity_support import FIXED, create_user
from learny.platform.storage import StorageBucket
from learny.privacy.application import export_job
from learny.privacy.application.export_job import ExportJobDeps
from learny.shared.db.uow import Database, Tx
from sqlalchemy import text
from support.jobs import count, delivery, emit_event, harness

pytestmark = pytest.mark.spec("SPEC-2207")

INSERT_EXPORT = text(
    "insert into public.data_exports (user_id, status, requested_on, created_at) "
    "values (cast(:user as uuid), 'queued', :day, :created) returning id::text as id"
)
READ_EXPORT = text(
    "select status::text as status, storage_path, size_bytes, expires_at "
    "from public.data_exports where id = cast(:id as uuid)"
)


class InMemoryExports:
    """Storage double of the export job: it records the archive it receives."""

    def __init__(self) -> None:
        self.uploads: list[tuple[StorageBucket, str]] = []

    async def read_object(self, _path: str) -> bytes | None:
        return None

    async def upload_archive(self, bucket: StorageBucket, path: str, archive: Path) -> None:
        del archive
        self.uploads.append((bucket, path))

    def ports(self) -> ExportJobDeps:
        return ExportJobDeps(read_object=self.read_object, upload_archive=self.upload_archive)


async def test_an_export_request_runs_the_export_job_once(
    database: Database, monkeypatch: pytest.MonkeyPatch
) -> None:
    storage = InMemoryExports()

    async def ports(_deps: Any) -> ExportJobDeps:
        return storage.ports()

    monkeypatch.setattr(export_job, "_default_ports", ports)

    async def run(tx: Tx) -> dict[str, Any]:
        user = await create_user(tx.conn, "Fanny")
        export = (
            await tx.conn.execute(INSERT_EXPORT, {"user": user, "day": FIXED.date(), "created": FIXED})
        ).scalar_one()
        event_id = await emit_event(
            tx,
            "account/export-requested",
            {"userId": user, "exportId": export},
            f"export-requested:{export}",
        )
        worker = harness(tx, ("privacy.run_data_export",))

        first = await worker.drain()
        row = dict((await tx.conn.execute(READ_EXPORT, {"id": export})).mappings().one())
        state = await delivery(tx, event_id, "privacy.run_data_export")
        uploads_after_first = len(storage.uploads)

        second = await worker.drain()
        notifications = await count(
            tx,
            "select count(*)::int from public.notifications where dedupe_key = :key",
            key=f"export:{export}",
        )
        return {
            "first": first,
            "row": row,
            "state": state,
            "uploads": uploads_after_first,
            "second": second,
            "notifications": notifications,
            "user": user,
        }

    result = await rolled_back(database, run)

    assert result["first"][1] == 1
    assert result["row"]["status"] == "done"
    assert result["row"]["storage_path"] is not None
    assert result["row"]["size_bytes"] > 0
    assert result["row"]["expires_at"] is not None
    assert result["uploads"] == 1
    assert result["state"] is not None
    assert result["state"]["status"] == "done"
    assert result["second"][1] == 0
    assert result["notifications"] == 1
