"""[SPEC-2203] Signed upload: reservation, idempotent replay and quota refusal under RLS.

Ported from the `create-upload` part of `packages/services/src/resources/upload.test.ts` (SPEC-206
EF-1, EF-6, ET-4, ET-5, ET-7, CL-1 to CL-3, BR-APP-02): the same declared bounds, the same business
codes and the same stored reservation, on the local stack. The Storage gateway is a fake that
records its calls: no socket is opened.
"""

from datetime import timedelta
from typing import Any

import pytest
from factories.course_support import content_deps, seed_learner
from factories.db_support import rolled_back
from factories.identity_support import FIXED, actor_for
from learny.content.application import resources as resources_service
from learny.shared.config import Settings
from learny.shared.db.uow import Database, Tx
from learny.shared.errors import AppError
from learny.shared.locale_fr import content as texts
from learny.shared.time import to_iso
from learny_api.generated.models import UploadsCreateOutput
from sqlalchemy import text

pytestmark = pytest.mark.spec("SPEC-2203")

MEGABYTE = 1024 * 1024
UPLOAD_KEY = "upload-key-0001"
RESERVED_UNTIL = to_iso(FIXED + timedelta(seconds=600))
PDF_BODY = {
    "mime": "application/pdf",
    "sizeBytes": 5,
    "fileName": "Guide.pdf",
    "title": "Guide FI",
}


class UploadStorage:
    """The Storage gateway of the cases: it signs and records, never opens a socket."""

    def __init__(self) -> None:
        self.calls: list[dict[str, Any]] = []

    async def sign_upload(self, bucket: str, path: str, token: str, expires: int) -> str:
        self.calls.append({"bucket": bucket, "path": path, "expires": expires})
        return f"https://storage.test/upload/{path}"

    async def sign_read(self, *args: Any, **kwargs: Any) -> str:
        raise AssertionError("read is not used here")

    async def remove(self, *args: Any, **kwargs: Any) -> None:
        raise AssertionError("remove is not used here")

    async def list(self, *args: Any, **kwargs: Any) -> list[Any]:
        raise AssertionError("list is not used here")


def upload_deps(tx: Tx, storage: UploadStorage) -> Any:
    return content_deps(tx, storage=storage, settings=Settings(supabase_jwt_secret="b" * 48))


async def create_upload(
    tx: Tx,
    user_id: str,
    chapter_id: str,
    storage: UploadStorage,
    body: dict[str, Any],
    key: str = UPLOAD_KEY,
) -> Any:
    return await resources_service.create_upload(
        upload_deps(tx, storage), actor_for(user_id), chapter_id, body, key
    )


async def stored_row(tx: Tx, resource_id: str) -> Any:
    result = await tx.conn.execute(
        text(
            "select status, kind, title, storage_path, metadata, size_bytes, origin"
            " from public.resources where id = cast(:id as uuid)"
        ),
        {"id": resource_id},
    )
    return result.mappings().one()


async def test_a_signed_upload_reserves_a_queued_resource(database: Database) -> None:
    async def run(tx: Tx) -> Any:
        seeded = await seed_learner(tx, "Alice", chapters=1)
        storage = UploadStorage()
        created = await create_upload(tx, seeded["user"], seeded["chapter"], storage, PDF_BODY)
        return created, await stored_row(tx, created["resourceId"]), storage.calls, seeded["user"]

    created, row, calls, user_id = await rolled_back(database, run)
    parsed = UploadsCreateOutput.model_validate(created)
    assert parsed.resourceId
    assert created["uploadUrl"] == f"https://storage.test/upload/{row['storage_path']}"
    assert created["expiresAt"] == RESERVED_UNTIL
    assert row["status"] == "queued"
    assert row["kind"] == "pdf"
    assert row["title"] == "Guide FI"
    assert row["origin"] == "learner"
    assert row["size_bytes"] is None
    assert row["storage_path"] == f"{user_id}/{created['resourceId']}/Guide.pdf"
    assert row["metadata"]["upload"] == {
        "declaredBytes": 5,
        "declaredMime": "application/pdf",
        "reservedUntil": RESERVED_UNTIL,
        "idempotencyKey": UPLOAD_KEY,
    }
    assert calls == [{"bucket": "resources", "path": row["storage_path"], "expires": 600}]


async def test_the_same_key_and_request_replay_the_same_resource(database: Database) -> None:
    async def run(tx: Tx) -> Any:
        seeded = await seed_learner(tx, "Alice", chapters=1)
        storage = UploadStorage()
        first = await create_upload(tx, seeded["user"], seeded["chapter"], storage, PDF_BODY)
        second = await create_upload(tx, seeded["user"], seeded["chapter"], storage, PDF_BODY)
        total = await tx.conn.execute(
            text("select count(*) from public.resources where owner_id = cast(:owner as uuid)"),
            {"owner": seeded["user"]},
        )
        return first, second, storage.calls, int(total.scalar_one())

    first, second, calls, total = await rolled_back(database, run)
    assert second["resourceId"] == first["resourceId"]
    assert second["uploadUrl"] == first["uploadUrl"]
    assert total == 1
    assert len(calls) == 2


async def test_the_same_key_with_a_different_size_is_refused(database: Database) -> None:
    async def run(tx: Tx) -> Any:
        seeded = await seed_learner(tx, "Alice", chapters=1)
        storage = UploadStorage()
        await create_upload(tx, seeded["user"], seeded["chapter"], storage, PDF_BODY)
        return await create_upload(
            tx,
            seeded["user"],
            seeded["chapter"],
            storage,
            {**PDF_BODY, "sizeBytes": 6},
        )

    with pytest.raises(AppError) as error:
        await rolled_back(database, run)
    assert error.value.code == "IDEMPOTENCY_KEY_REUSED"
    assert error.value.detail == texts.IDEMPOTENCY_KEY_REUSED


async def test_a_full_chapter_is_refused(database: Database) -> None:
    async def run(tx: Tx) -> Any:
        seeded = await seed_learner(tx, "Alice", chapters=1)
        await tx.conn.execute(
            text(
                """
                insert into public.resources (
                  owner_id, formation_id, chapter_id, kind, title, content_text, status, metadata
                )
                select cast(:owner as uuid), cast(:formation as uuid), cast(:chapter as uuid),
                       'note', 'Note ' || index, 'Contenu', 'ready', '{}'::jsonb
                  from generate_series(1, 100) as index
                """
            ),
            {
                "owner": seeded["user"],
                "formation": seeded["formation"],
                "chapter": seeded["chapter"],
            },
        )
        storage = UploadStorage()
        return await create_upload(tx, seeded["user"], seeded["chapter"], storage, PDF_BODY)

    with pytest.raises(AppError) as error:
        await rolled_back(database, run)
    assert error.value.code == "QUOTA_EXCEEDED"


async def test_the_declared_type_is_refused_before_any_write(database: Database) -> None:
    async def run(tx: Tx) -> Any:
        seeded = await seed_learner(tx, "Alice", chapters=1)
        storage = UploadStorage()
        return await create_upload(
            tx,
            seeded["user"],
            seeded["chapter"],
            storage,
            {"mime": "video/mp4", "sizeBytes": 10**12, "fileName": "film.mp4"},
        )

    with pytest.raises(AppError) as error:
        await rolled_back(database, run)
    assert error.value.code == "UNSUPPORTED_TYPE"


async def test_a_pdf_beyond_fifty_megabytes_is_refused(database: Database) -> None:
    async def run(tx: Tx) -> Any:
        seeded = await seed_learner(tx, "Alice", chapters=1)
        return await create_upload(
            tx,
            seeded["user"],
            seeded["chapter"],
            UploadStorage(),
            {**PDF_BODY, "sizeBytes": 50 * MEGABYTE + 1},
        )

    with pytest.raises(AppError) as error:
        await rolled_back(database, run)
    assert error.value.code == "UPLOAD_TOO_LARGE"


async def test_a_missing_chapter_is_not_found(database: Database) -> None:
    async def run(tx: Tx) -> Any:
        seeded = await seed_learner(tx, "Alice", chapters=1)
        return await create_upload(
            tx,
            seeded["user"],
            "99999999-9999-4999-8999-999999999999",
            UploadStorage(),
            PDF_BODY,
        )

    with pytest.raises(AppError) as error:
        await rolled_back(database, run)
    assert error.value.code == "NOT_FOUND"
    assert error.value.detail == texts.NOT_FOUND_SUBJECT.format(subject=texts.SUBJECT_CHAPTER)


async def test_the_title_defaults_to_the_file_name_without_extension(database: Database) -> None:
    async def run(tx: Tx) -> Any:
        seeded = await seed_learner(tx, "Alice", chapters=1)
        created = await create_upload(
            tx,
            seeded["user"],
            seeded["chapter"],
            UploadStorage(),
            {"mime": "image/png", "sizeBytes": 12, "fileName": "Rapport final.png"},
        )
        return await stored_row(tx, created["resourceId"])

    row = await rolled_back(database, run)
    assert row["title"] == "Rapport final"
    assert row["kind"] == "image"
