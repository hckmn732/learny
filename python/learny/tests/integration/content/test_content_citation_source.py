"""[SPEC-2203] Controlled citation link: deleted label, signed page fragment and web anchor.

The same citation rows and the same expected URLs, on the local stack. The Storage gateway is a fake
that records its calls: no socket is opened.
"""

from typing import Any

import pytest
from factories.course_support import (
    content_deps,
    create_citation,
    create_course,
    create_resource,
    create_section,
    seed_learner,
)
from factories.db_support import rolled_back
from factories.identity_support import actor_for, create_user
from learny.content.application import citations as citations_service
from learny.shared.config import Settings
from learny.shared.db.uow import Database, Tx
from learny.shared.errors import AppError
from learny.shared.locale_fr import content as texts
from learny_api.generated.models import CourseCitationsSourceOutput
from sqlalchemy import text

pytestmark = pytest.mark.spec("SPEC-2203")


class SigningStorage:
    """The Storage gateway of the cases: it answers or raises what the case decides."""

    def __init__(self, url: str = "https://storage.test/guide.pdf", error: AppError | None = None) -> None:
        self.url = url
        self.error = error
        self.calls: list[str] = []

    async def sign_upload(self, *args: Any, **kwargs: Any) -> str:
        raise AssertionError("upload is not used here")

    async def sign_read(self, bucket: str, path: str, token: str, expires: int) -> str:
        self.calls.append(path)
        if self.error is not None:
            raise self.error
        return self.url

    async def remove(self, *args: Any, **kwargs: Any) -> None:
        raise AssertionError("remove is not used here")

    async def list(self, *args: Any, **kwargs: Any) -> list[Any]:
        raise AssertionError("list is not used here")


def signing_deps(tx: Tx, storage: SigningStorage) -> Any:
    return content_deps(tx, storage=storage, settings=Settings(supabase_jwt_secret="b" * 48))


async def seed_citation(
    tx: Tx,
    *,
    media_kind: str = "pdf",
    location: Any = None,
    resource: dict[str, Any] | None = None,
    file_name: str = "guide.pdf",
) -> dict[str, Any]:
    """One citation, and the resource row its location points at."""
    seeded = await seed_learner(tx, "Alice", chapters=1)
    course_id = await create_course(
        tx,
        owner_id=seeded["user"],
        formation_id=seeded["formation"],
        module_id=seeded["module"],
    )
    section_id = await create_section(
        tx,
        course_id=course_id,
        owner_id=seeded["user"],
        chapter_id=seeded["chapter"],
        origin="tutor",
    )
    resource_id: str | None = None
    path = f"{seeded['user']}/{seeded['formation']}/{file_name}"
    options: dict[str, Any] = {
        "kind": "pdf",
        "title": "Guide",
        "status": "ready",
        "storage_path": path,
        "size_bytes": 5,
        "mime": "application/pdf",
    }
    options.update(resource or {})
    if options.pop("absent", False) is False:
        resource_id = await create_resource(
            tx,
            owner_id=seeded["user"],
            formation_id=seeded["formation"],
            chapter_id=seeded["chapter"],
            **options,
        )
    citation_id = await create_citation(
        tx,
        section_id=section_id,
        owner_id=seeded["user"],
        media_kind=media_kind,
        location={"page": 4} if location is None else location,
        resource_id=resource_id,
    )
    seeded["citation"] = citation_id
    seeded["resource"] = resource_id
    seeded["storage_path"] = path
    return seeded


async def source(tx: Tx, user_id: str, citation_id: str, storage: SigningStorage) -> Any:
    return await citations_service.get_citation_source(
        signing_deps(tx, storage), actor_for(user_id), citation_id
    )


async def test_an_invalid_citation_identifier_is_refused(database: Database) -> None:
    async def run(tx: Tx) -> Any:
        return await source(tx, "11111111-1111-4111-8111-111111111111", "pas-un-uuid", SigningStorage())

    with pytest.raises(AppError) as error:
        await rolled_back(database, run)
    assert error.value.code == "VALIDATION_FAILED"
    assert error.value.detail == texts.INVALID_CITATION_ID


async def test_a_missing_or_foreign_citation_is_not_found(database: Database) -> None:
    async def run(tx: Tx) -> Any:
        seeded = await seed_citation(tx)
        bob = await create_user(tx.conn, "Bob")
        return await source(tx, bob, seeded["citation"], SigningStorage())

    with pytest.raises(AppError) as error:
        await rolled_back(database, run)
    assert error.value.code == "NOT_FOUND"
    assert error.value.detail == texts.CITATION_NOT_FOUND


@pytest.mark.parametrize(
    "options",
    [
        {"absent": True},
        {"status": "queued"},
    ],
)
async def test_a_deleted_or_unready_resource_gives_the_deleted_label(
    database: Database, options: dict[str, Any]
) -> None:
    async def run(tx: Tx) -> Any:
        seeded = await seed_citation(tx, resource=dict(options))
        storage = SigningStorage()
        result = await source(tx, seeded["user"], seeded["citation"], storage)
        return result, storage.calls

    result, calls = await rolled_back(database, run)
    assert CourseCitationsSourceOutput.model_validate(result).deleted is True
    assert result["deleted"] is True
    assert result["url"] is None
    assert result["page"] is None
    assert result["startSec"] is None
    assert result["anchor"] is None
    assert calls == []


async def test_a_removed_resource_gives_the_deleted_label(database: Database) -> None:
    async def run(tx: Tx) -> Any:
        seeded = await seed_citation(tx)
        await tx.conn.execute(
            text(
                "update public.resources set deleted_at = cast(:now as timestamptz)"
                " where id = cast(:id as uuid)"
            ),
            {"now": "2026-11-11T12:20:00.000Z", "id": seeded["resource"]},
        )
        storage = SigningStorage()
        result = await source(tx, seeded["user"], seeded["citation"], storage)
        return result, storage.calls

    result, calls = await rolled_back(database, run)
    assert result["deleted"] is True
    assert result["url"] is None
    assert calls == []


async def test_a_foreign_resource_gives_the_deleted_label(database: Database) -> None:
    async def run(tx: Tx) -> Any:
        seeded = await seed_citation(tx, resource={"absent": True})
        bob = await create_user(tx.conn, "Bob")
        resource_id = await create_resource(
            tx,
            owner_id=bob,
            formation_id=seeded["formation"],
            chapter_id=seeded["chapter"],
            kind="pdf",
            status="ready",
            storage_path=f"{bob}/{seeded['formation']}/guide.pdf",
            size_bytes=5,
            mime="application/pdf",
        )
        await tx.conn.execute(
            text(
                "update public.citations set resource_id = cast(:resource as uuid)"
                " where id = cast(:id as uuid)"
            ),
            {"resource": resource_id, "id": seeded["citation"]},
        )
        storage = SigningStorage()
        result = await source(tx, seeded["user"], seeded["citation"], storage)
        return result, storage.calls

    result, calls = await rolled_back(database, run)
    assert result["deleted"] is True
    assert result["url"] is None
    assert calls == []


async def test_a_pdf_is_signed_with_the_page_fragment(database: Database) -> None:
    async def run(tx: Tx) -> Any:
        seeded = await seed_citation(tx)
        storage = SigningStorage()
        result = await source(tx, seeded["user"], seeded["citation"], storage)
        return result, storage.calls, seeded["storage_path"]

    result, calls, storage_path = await rolled_back(database, run)
    assert CourseCitationsSourceOutput.model_validate(result).url == ("https://storage.test/guide.pdf#page=4")
    assert result["citationId"]
    assert result["mediaKind"] == "pdf"
    assert result["deleted"] is False
    assert result["url"] == "https://storage.test/guide.pdf#page=4"
    assert result["page"] == 4
    assert result["startSec"] is None
    assert result["anchor"] is None
    assert calls == [storage_path]


async def test_an_image_is_signed_without_page_and_keeps_an_existing_fragment(
    database: Database,
) -> None:
    async def run(tx: Tx) -> Any:
        seeded = await seed_citation(
            tx,
            media_kind="image",
            location={"page": "2"},
            resource={"kind": "image", "mime": "image/png"},
            file_name="schema.png",
        )
        storage = SigningStorage("https://storage.test/schema.png#zoom")
        return await source(tx, seeded["user"], seeded["citation"], storage)

    result = await rolled_back(database, run)
    assert result["url"] == "https://storage.test/schema.png#zoom"
    assert result["page"] == 2


async def test_a_file_that_is_no_longer_signable_gives_the_deleted_label(database: Database) -> None:
    async def run(tx: Tx) -> Any:
        seeded = await seed_citation(tx)
        storage = SigningStorage(error=AppError("NOT_FOUND", texts.NO_FILE_FOR_RESOURCE))
        return await source(tx, seeded["user"], seeded["citation"], storage)

    result = await rolled_back(database, run)
    assert result["deleted"] is True
    assert result["url"] is None
    assert result["page"] is None


async def test_another_signature_error_is_propagated(database: Database) -> None:
    async def run(tx: Tx) -> Any:
        seeded = await seed_citation(tx)
        storage = SigningStorage(error=AppError("SERVICE_UNAVAILABLE", texts.INGESTION_STORAGE_UNAVAILABLE))
        return await source(tx, seeded["user"], seeded["citation"], storage)

    with pytest.raises(AppError) as error:
        await rolled_back(database, run)
    assert error.value.code == "SERVICE_UNAVAILABLE"


async def test_a_web_source_carries_its_anchor(database: Database) -> None:
    async def run(tx: Tx) -> Any:
        seeded = await seed_citation(
            tx,
            media_kind="web",
            location={"anchor": "cle-40", "startSec": 12, "page": 4},
            resource={"kind": "web", "url": "https://doc.test/comptabilite"},
        )
        return await source(tx, seeded["user"], seeded["citation"], SigningStorage())

    result = await rolled_back(database, run)
    assert result["url"] == "https://doc.test/comptabilite#cle-40"
    assert result["page"] is None
    assert result["startSec"] == 12
    assert result["anchor"] == "cle-40"


async def test_a_video_source_carries_its_minute_and_ignores_an_anchor(database: Database) -> None:
    async def run(tx: Tx) -> Any:
        seeded = await seed_citation(
            tx,
            media_kind="video",
            location={"startSec": "42"},
            resource={"kind": "youtube", "url": "https://youtu.be/abc"},
        )
        return await source(tx, seeded["user"], seeded["citation"], SigningStorage())

    result = await rolled_back(database, run)
    assert result["url"] == "https://youtu.be/abc#t=42"
    assert result["startSec"] == 42
    assert result["anchor"] is None


async def test_a_web_source_without_anchor_or_minute_keeps_a_bare_url(database: Database) -> None:
    async def run(tx: Tx) -> Any:
        seeded = await seed_citation(
            tx,
            media_kind="web",
            location=None,
            resource={"kind": "web", "url": "https://doc.test/x"},
        )
        return await source(tx, seeded["user"], seeded["citation"], SigningStorage())

    result = await rolled_back(database, run)
    assert result["url"] == "https://doc.test/x"
    assert result["startSec"] is None
    assert result["anchor"] is None


async def test_a_source_without_link_has_no_url(database: Database) -> None:
    async def run(tx: Tx) -> Any:
        seeded = await seed_citation(
            tx,
            media_kind="note",
            location={"page": "x"},
            resource={
                "kind": "note",
                "url": None,
                "storage_path": None,
                "size_bytes": None,
                "content_text": "Note de synthese.",
            },
        )
        return await source(tx, seeded["user"], seeded["citation"], SigningStorage())

    result = await rolled_back(database, run)
    assert result["url"] is None
    assert result["page"] is None
    assert result["startSec"] is None
    assert result["anchor"] is None
