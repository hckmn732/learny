"""Contributions of a chapter: creation, upload, finalization, read URL, rename, retry, deletion.

Port of `packages/services/src/resources/{create-resource,create-upload,finalize,read,rename,retry,
delete,queries,limits}.ts` (SPEC-206, SPEC-607). One transaction per command, one deterministic
event in the outbox, the same `AppError` codes and the same French details.
"""

import hashlib
import json
import uuid
from datetime import timedelta
from typing import Any, NoReturn
from urllib.parse import urlsplit

from learny.content.application.ports import ContentDeps, storage_access
from learny.content.domain import limits
from learny.content.infrastructure import queries
from learny.content.infrastructure.detect import detect_upload
from learny.content.infrastructure.objects import SupabaseObjectReader
from learny.identity.domain.actor import Actor
from learny.platform.storage import (
    create_read_url,
    create_upload_url,
    normalize_storage_file_name,
    resource_path,
)
from learny.shared.db.uow import Tx
from learny.shared.errors import AppError
from learny.shared.locale_fr import content as texts
from learny.shared.time import to_iso

YOUTUBE_HOSTS = frozenset({"youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be"})
SIGNED_URL_TTL_SECONDS = 600
DISCARDING_CODES = frozenset({"UPLOAD_TOO_LARGE", "UNSUPPORTED_TYPE", "QUOTA_EXCEEDED"})
LIMIT_TRIGGER_MESSAGES: dict[str, tuple[str, str]] = {
    "resource_pdf_limit": ("UPLOAD_TOO_LARGE", texts.LIMIT_PDF),
    "resource_image_limit": ("UPLOAD_TOO_LARGE", texts.LIMIT_IMAGE),
    "chapter_resource_limit": ("QUOTA_EXCEEDED", texts.LIMIT_CHAPTER),
    "storage_quota_exceeded": ("QUOTA_EXCEEDED", texts.LIMIT_STORAGE),
}
LIMIT_CONSTRAINTS = ("resources_pdf_size", "resources_image_size", "resources_pdf_pages")


def uploaded_event_id(resource_id: str) -> str:
    """Stable identifier of the single `resource/uploaded` emission of a resource."""
    return f"resource-uploaded:{resource_id}"


def uploaded_payload(
    user_id: str, resource_id: str, formation_id: str, chapter_id: str | None, kind: str
) -> dict[str, Any]:
    """Payload of `resource/uploaded` (`api/events.schema.json`)."""
    return {
        "userId": user_id,
        "resourceId": resource_id,
        "formationId": formation_id,
        "chapterId": chapter_id,
        "kind": kind,
    }


def translate_limit_error(error: BaseException) -> BaseException:
    """Defence in depth: the trigger messages become the business codes of the service."""
    message = str(error)
    for trigger, (code, detail) in LIMIT_TRIGGER_MESSAGES.items():
        if trigger in message:
            return AppError(code, detail)
    if any(name in message for name in LIMIT_CONSTRAINTS):
        return AppError("UPLOAD_TOO_LARGE", texts.FILE_TOO_LARGE_GENERIC)
    return error


async def deny_or_missing(deps: ContentDeps, table: str, identifier: str) -> NoReturn:
    """`NOT_FOUND` for an unknown identifier, `FORBIDDEN` for another owner's one (EF-6)."""
    async with deps.db.service_tx() as tx:
        present = await queries.exists_for_any_owner(tx, table, identifier)
    subject = texts.SUBJECT_RESOURCE if table == "resources" else texts.SUBJECT_CHAPTER
    if present:
        raise AppError("FORBIDDEN", texts.FORBIDDEN_NOT_OWNED.format(subject=subject))
    raise AppError("NOT_FOUND", texts.NOT_FOUND_SUBJECT.format(subject=subject))


def _iso(value: Any) -> str:
    """An instant read from the database as a canonical ISO string."""
    return value if isinstance(value, str) else to_iso(value)


def _strip_extension(name: str) -> str:
    dot = name.rfind(".")
    base = name[:dot] if dot > 0 else name
    return name if base == "" else base


def _metadata(row: dict[str, Any]) -> dict[str, Any]:
    value = row.get("metadata")
    return dict(value) if isinstance(value, dict) else {}


def _upload_of(row: dict[str, Any]) -> dict[str, Any]:
    upload = _metadata(row).get("upload")
    return dict(upload) if isinstance(upload, dict) else {}


def _stored_name(row: dict[str, Any]) -> str | None:
    path = row.get("storage_path")
    if not isinstance(path, str):
        return None
    parts = path.split("/")
    return parts[2] if len(parts) > 2 else None


def _parse_web_url(value: str) -> Any:
    parsed = urlsplit(value)
    if parsed.scheme not in ("http", "https") or parsed.hostname is None:
        raise AppError("VALIDATION_FAILED", texts.YOUTUBE_URL_INVALID)
    return parsed


async def _assert_chapter_capacity(tx: Tx, user_id: str, chapter_id: str) -> None:
    """The chapter bound of a contribution that adds no byte (EF-6, CL-3)."""
    limits.assert_capacity(
        limits.Capacity(
            chapter_count=await queries.chapter_resource_count(tx, user_id, chapter_id),
            used_bytes=0,
            added_bytes=0,
        )
    )


async def create_resource(
    deps: ContentDeps, actor: Actor, chapter_id: str, body: dict[str, Any]
) -> dict[str, Any]:
    """EF-3: a note, a web page or a YouTube video, created `queued`."""
    kind = str(body["kind"])
    title: str
    content_text: str | None = None
    url: str | None = None
    if kind == "note":
        limits.assert_note_text(str(body["text"]))
        title = str(body["title"])
        content_text = str(body["text"])
    else:
        parsed = _parse_web_url(str(body["url"]))
        if kind == "youtube" and str(parsed.hostname or "").lower() not in YOUTUBE_HOSTS:
            raise AppError(
                "VALIDATION_FAILED",
                texts.YOUTUBE_URL_INVALID,
                errors=[{"path": "body.url", "message": texts.YOUTUBE_URL_EXPECTED}],
            )
        title = str(body.get("title") or str(parsed.hostname)[:200])
        url = parsed.geturl()

    try:
        async with deps.db.user_tx(actor) as tx:
            await queries.lock_owner(tx, actor.user_id)
            chapter = await queries.select_chapter_formation(tx, chapter_id)
            if chapter is None:
                await deny_or_missing(deps, "chapters", chapter_id)
            formation_id = str(chapter["formation_id"])
            await queries.release_expired_reservations(tx, actor.user_id, to_iso(deps.clock.now()))
            await _assert_chapter_capacity(tx, actor.user_id, chapter_id)
            resource_id = await queries.insert_text_resource(
                tx,
                user_id=actor.user_id,
                formation_id=formation_id,
                chapter_id=chapter_id,
                kind=kind,
                title=title,
                content_text=content_text,
                url=url,
            )
            await tx.emit(
                "resource/uploaded",
                uploaded_payload(actor.user_id, resource_id, formation_id, chapter_id, kind),
                event_id=uploaded_event_id(resource_id),
            )
            return {"id": resource_id, "kind": kind, "status": "queued", "title": title}
    except AppError:
        raise
    except Exception as error:
        raise translate_limit_error(error) from None


async def create_upload(
    deps: ContentDeps,
    actor: Actor,
    chapter_id: str,
    body: dict[str, Any],
    idempotency_key: str | None,
) -> dict[str, Any]:
    """EF-1: reserves a file contribution and signs its upload URL."""
    key = idempotency_key or ""
    declared = int(body["sizeBytes"])
    kind = limits.assert_declared_upload(str(body["mime"]), declared)
    resource_id = str(uuid.uuid4())
    file_name = str(body["fileName"])
    path = resource_path(actor.user_id, resource_id, file_name)
    clean_name = normalize_storage_file_name(file_name)
    now = deps.clock.now()
    reserved_until = to_iso(now + timedelta(seconds=SIGNED_URL_TTL_SECONDS))
    access = storage_access(deps, actor.user_id)
    try:
        async with deps.db.user_tx(actor) as tx:
            await queries.lock_owner(tx, actor.user_id)
            chapter = await queries.select_chapter_formation(tx, chapter_id)
            if chapter is None:
                await deny_or_missing(deps, "chapters", chapter_id)
            formation_id = str(chapter["formation_id"])
            replayed = await queries.find_by_idempotency_key(tx, actor.user_id, key)
            if replayed is not None:
                return await _replay_upload(
                    deps, tx, access, replayed, body, chapter_id, clean_name, reserved_until
                )
            await queries.release_expired_reservations(tx, actor.user_id, to_iso(now))
            limits.assert_capacity(
                limits.Capacity(
                    chapter_count=await queries.chapter_resource_count(tx, actor.user_id, chapter_id),
                    used_bytes=await queries.used_bytes(tx, actor.user_id, to_iso(now)),
                    added_bytes=declared,
                )
            )
            metadata = {
                "upload": {
                    "declaredBytes": declared,
                    "declaredMime": limits.normalize_mime(str(body["mime"])),
                    "reservedUntil": reserved_until,
                    "idempotencyKey": key,
                }
            }
            await queries.insert_upload_resource(
                tx,
                resource_id=resource_id,
                user_id=actor.user_id,
                formation_id=formation_id,
                chapter_id=chapter_id,
                kind=kind,
                title=str(body.get("title") or _strip_extension(clean_name)),
                path=path,
                metadata=json.dumps(metadata, ensure_ascii=False),
            )
            signed = await create_upload_url(tx, deps.storage, deps.clock, access, "resources", path)
            return {
                "resourceId": resource_id,
                "uploadUrl": signed.url,
                "expiresAt": to_iso(signed.expires_at),
            }
    except AppError:
        raise
    except Exception as error:
        raise translate_limit_error(error) from None


async def _replay_upload(
    deps: ContentDeps,
    tx: Tx,
    access: Any,
    existing: dict[str, Any],
    body: dict[str, Any],
    chapter_id: str,
    clean_name: str,
    reserved_until: str,
) -> dict[str, Any]:
    """The same key and the same request return the same resource with a fresh URL (ET-4)."""
    upload = _upload_of(existing)
    same = (
        existing.get("chapter_id") == chapter_id
        and upload.get("declaredBytes") == int(body["sizeBytes"])
        and upload.get("declaredMime") == limits.normalize_mime(str(body["mime"]))
        and _stored_name(existing) == clean_name
    )
    if not same or existing.get("storage_path") is None:
        raise AppError("IDEMPOTENCY_KEY_REUSED", texts.IDEMPOTENCY_KEY_REUSED)
    if existing.get("size_bytes") is not None:
        raise AppError("CONFLICT", texts.UPLOAD_ALREADY_FINALIZED)
    metadata = _metadata(existing)
    refreshed = dict(metadata)
    refreshed["upload"] = {**upload, "reservedUntil": reserved_until}
    await queries.update_upload_reservation(
        tx, str(existing["id"]), json.dumps(refreshed, ensure_ascii=False)
    )
    signed = await create_upload_url(
        tx, deps.storage, deps.clock, access, "resources", str(existing["storage_path"])
    )
    return {
        "resourceId": existing["id"],
        "uploadUrl": signed.url,
        "expiresAt": to_iso(signed.expires_at),
    }


def _reader(deps: ContentDeps) -> SupabaseObjectReader:
    """The object reader of the `resources` bucket, as the caller."""
    return SupabaseObjectReader(deps.settings.supabase_url, deps.settings.supabase_anon_key)


async def _emit_uploaded_once(tx: Tx, actor: Actor, row: dict[str, Any], now: str) -> None:
    """Sends `resource/uploaded` once per resource, the claim living on the row (CL-4, ET-5)."""
    if _upload_of(row).get("eventEmittedAt") is not None:
        return
    await tx.emit(
        "resource/uploaded",
        uploaded_payload(
            actor.user_id,
            str(row["id"]),
            str(row["formation_id"]),
            row.get("chapter_id"),
            str(row["kind"]),
        ),
        event_id=uploaded_event_id(str(row["id"])),
    )
    await queries.mark_uploaded_event(tx, str(row["id"]), actor.user_id, now)


def _finalized_dto(row: dict[str, Any]) -> dict[str, Any]:
    kind = row.get("kind")
    if kind not in ("pdf", "image"):
        raise AppError("CONFLICT", texts.NOT_A_FILE_RESOURCE)
    pages = _metadata(row).get("pages")
    return {
        "id": row["id"],
        "kind": kind,
        "status": row["status"],
        "mime": row.get("mime") or "",
        "sizeBytes": int(row.get("size_bytes") or 0),
        "pages": int(pages) if isinstance(pages, int) else None,
    }


async def finalize_upload(deps: ContentDeps, actor: Actor, resource_id: str) -> dict[str, Any]:
    """EF-2: finalizes a contribution from the bytes that were really uploaded."""
    access = storage_access(deps, actor.user_id)
    reader = _reader(deps)
    async with deps.db.user_tx(actor) as tx:
        row = await queries.select_resource(tx, resource_id)
    if row is None:
        await deny_or_missing(deps, "resources", resource_id)
    if row.get("deleted_at") is not None:
        raise AppError("NOT_FOUND", texts.UPLOAD_EXPIRED)
    kind = row.get("kind")
    if kind not in ("pdf", "image"):
        raise AppError("CONFLICT", texts.NOT_A_FILE_RESOURCE)
    path = row.get("storage_path")
    if not isinstance(path, str) or not _upload_of(row):
        raise AppError("CONFLICT", texts.NOT_A_FILE_RESOURCE)

    # ET-5: a second call returns the same state, unless the object changed since.
    if row.get("size_bytes") is not None:
        current = await reader.info(path, access.access_token)
        stored = _upload_of(row)
        if current is None or current.etag != stored.get("etag") or current.size != row["size_bytes"]:
            raise AppError("CONFLICT", texts.FILE_CHANGED_SINCE_FINALIZE)
        async with deps.db.user_tx(actor) as tx:
            await _emit_uploaded_once(tx, actor, row, to_iso(deps.clock.now()))
        return _finalized_dto(row)

    async def discard(error: BaseException) -> NoReturn:
        if isinstance(error, AppError) and error.code in DISCARDING_CODES:
            now = to_iso(deps.clock.now())
            async with deps.db.user_tx(actor) as tx:
                await queries.discard_resource(tx, str(row["id"]), now)
            await _remove_blob(deps, actor, str(row["id"]), path)
        raise error

    info = await reader.info(path, access.access_token)
    if info is None or info.size == 0:
        raise AppError("UPLOAD_INCOMPLETE", texts.UPLOAD_NOT_RECEIVED)
    declared = int(_upload_of(row).get("declaredBytes") or 0)
    if info.size < declared:
        raise AppError(
            "UPLOAD_INCOMPLETE",
            texts.UPLOAD_INCOMPLETE.format(received=info.size, declared=declared),
        )
    try:
        limits.assert_file_size(str(kind), info.size)
        content = await reader.read(path, access.access_token, limits.size_limit_bytes(str(kind)))
        if content is None:
            raise AppError("UPLOAD_INCOMPLETE", texts.UPLOAD_VANISHED)
        if len(content.data) != info.size:
            raise AppError("CONFLICT", texts.FILE_CHANGED_WHILE_READING)
        measured = detect_upload(content.data, str(kind))
        digest = hashlib.sha256(content.data).hexdigest()
        etag = content.etag
    except AppError as error:
        await discard(error)

    now = deps.clock.now()
    try:
        async with deps.db.user_tx(actor) as tx:
            await queries.lock_owner(tx, actor.user_id)
            locked = await queries.select_resource_for_update(tx, resource_id)
            if locked is None or locked.get("deleted_at") is not None:
                raise AppError("NOT_FOUND", texts.UPLOAD_EXPIRED_ON_FINALIZE)
            if locked.get("size_bytes") is not None:
                await _emit_uploaded_once(tx, actor, locked, to_iso(now))
                return _finalized_dto(locked)
            await queries.release_expired_reservations(tx, actor.user_id, to_iso(now), resource_id)
            chapter_id = locked.get("chapter_id")
            if chapter_id is not None:
                limits.assert_capacity(
                    limits.Capacity(
                        chapter_count=await queries.chapter_resource_count(
                            tx, actor.user_id, str(chapter_id), resource_id
                        ),
                        used_bytes=await queries.used_bytes(tx, actor.user_id, to_iso(now), resource_id),
                        added_bytes=info.size,
                    )
                )
            metadata = _metadata(locked)
            merged = dict(metadata)
            if measured.pages is not None:
                merged["pages"] = measured.pages
            merged["upload"] = {
                **_upload_of(locked),
                "finalizedAt": to_iso(now),
                "sha256": digest,
                "etag": etag,
            }
            updated = await queries.update_finalized_file(
                tx,
                resource_id=resource_id,
                user_id=actor.user_id,
                mime=measured.mime,
                size_bytes=info.size,
                metadata=json.dumps(merged, ensure_ascii=False),
            )
            if updated is None:
                raise AppError("CONFLICT", texts.UPLOAD_MODIFIED_CONCURRENTLY)
            await _emit_uploaded_once(tx, actor, updated, to_iso(now))
            return _finalized_dto(updated)
    except AppError:
        raise
    except Exception as error:
        raise translate_limit_error(error) from None


async def _remove_blob(deps: ContentDeps, actor: Actor, resource_id: str, path: str) -> bool:
    """Removes the blob of a refused upload; a failure leaves it pending (ET-6, CL-8)."""
    access = storage_access(deps, actor.user_id)
    try:
        await deps.storage.remove("resources", path, access.access_token)
    except AppError as error:
        deps.logger.warning(
            "blob removal deferred",
            component="content",
            operation="resource.blob-removal",
            outcome="deferred",
            code=error.code,
        )
        return False
    return True


async def get_signed_read_url(deps: ContentDeps, actor: Actor, resource_id: str) -> dict[str, Any]:
    """EF-4: a ten-minute read URL of a finalized file, signed after the row proved ownership."""
    async with deps.db.user_tx(actor) as tx:
        row = await queries.select_resource(tx, resource_id)
        if row is None:
            await deny_or_missing(deps, "resources", resource_id)
        if (
            row.get("deleted_at") is not None
            or row.get("storage_path") is None
            or row.get("size_bytes") is None
            or row.get("kind") not in ("pdf", "image")
        ):
            raise AppError("NOT_FOUND", texts.NO_FILE_FOR_RESOURCE)
        signed = await create_read_url(
            tx,
            deps.storage,
            deps.clock,
            storage_access(deps, actor.user_id),
            "resources",
            str(row["storage_path"]),
        )
        return {"url": signed.url, "expiresAt": to_iso(signed.expires_at)}


async def rename_resource(
    deps: ContentDeps, actor: Actor, resource_id: str, body: dict[str, Any]
) -> dict[str, Any]:
    """BR-APP-10: renames a contribution, guarding on the version the screen displayed (CL-2)."""
    async with deps.db.user_tx(actor) as tx:
        row = await queries.one(
            tx,
            queries.SELECT_RENAME_FOR_UPDATE,
            {"id": resource_id, "user_id": actor.user_id},
        )
        if row is None:
            raise AppError("NOT_FOUND", texts.RESOURCE_NOT_FOUND)
        current = {
            "id": row["id"],
            "title": row["title"],
            "status": row["status"],
            "updatedAt": _iso(row["updated_at"]),
        }
        expected = body.get("expectedUpdatedAt")
        if expected is not None and expected != current["updatedAt"]:
            raise AppError(
                "CONFLICT",
                texts.RESOURCE_CHANGED_SINCE_READ,
                errors=[
                    {
                        "path": "body.expectedUpdatedAt",
                        "message": texts.VERSION_CURRENT.format(version=current["updatedAt"]),
                    }
                ],
            )
        if body["title"] == row["title"]:
            return current
        updated = await queries.one(
            tx,
            queries.UPDATE_RENAME,
            {
                "id": resource_id,
                "user_id": actor.user_id,
                "title": body["title"],
                "now": to_iso(deps.clock.now()),
            },
        )
        if updated is None:
            raise AppError("CONFLICT", texts.RESOURCE_MODIFIED_CONCURRENTLY)
        return {
            "id": updated["id"],
            "title": updated["title"],
            "status": updated["status"],
            "updatedAt": _iso(updated["updated_at"]),
        }


def _retry_dto(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": row["id"],
        "status": row["status"],
        "errorCode": row.get("error_code"),
        "errorMessage": row.get("error_message"),
        "updatedAt": _iso(row["updated_at"]),
    }


async def retry_resource(deps: ContentDeps, actor: Actor, resource_id: str) -> dict[str, Any]:
    """BR-APP-07: moves `failed` back to `queued` and enqueues a fresh ingestion event."""
    async with deps.db.user_tx(actor) as tx:
        row = await queries.one(tx, queries.SELECT_RETRY, {"id": resource_id, "user_id": actor.user_id})
        if row is None:
            raise AppError("NOT_FOUND", texts.RESOURCE_NOT_FOUND)
        if row["status"] != "failed":
            return _retry_dto(row)
        retry = int((_metadata(row).get("ingestion") or {}).get("attempts") or 0) + 1
        updated = await queries.one(
            tx,
            queries.UPDATE_RETRY,
            {
                "id": resource_id,
                "user_id": actor.user_id,
                "now": to_iso(deps.clock.now()),
            },
        )
        if updated is None:
            fresh = await queries.one(
                tx,
                queries.SELECT_RETRY_CURRENT,
                {"id": resource_id, "user_id": actor.user_id},
            )
            if fresh is None:
                raise AppError("NOT_FOUND", texts.RESOURCE_NOT_FOUND)
            return _retry_dto(fresh)
        await tx.emit(
            "resource/uploaded",
            uploaded_payload(
                actor.user_id,
                str(updated["id"]),
                str(updated["formation_id"]),
                updated.get("chapter_id"),
                str(updated["kind"]),
            ),
            event_id=f"{uploaded_event_id(str(updated['id']))}:retry-{retry}",
        )
        return _retry_dto(updated)


async def delete_resource(deps: ContentDeps, actor: Actor, resource_id: str) -> None:
    """EF-5: soft-deletes a contribution and keeps the history of its citations."""
    async with deps.db.user_tx(actor) as tx:
        row = await queries.select_resource(tx, resource_id)
    if row is None:
        await deny_or_missing(deps, "resources", resource_id)
    now = to_iso(deps.clock.now())
    async with deps.db.service_tx() as tx:
        await queries.lock_owner(tx, actor.user_id)
        await queries.execute(
            tx,
            queries.SOFT_DELETE_RESOURCE,
            {"id": resource_id, "user_id": actor.user_id, "now": now},
        )
        await queries.execute(
            tx,
            queries.RELABEL_CITATIONS,
            {"id": resource_id, "user_id": actor.user_id, "label": texts.DELETED_SOURCE_LABEL},
        )
    path = row.get("storage_path")
    pending = isinstance(path, str) and _upload_of(row).get("blobRemovedAt") is None
    if pending and isinstance(path, str):
        await _remove_blob(deps, actor, resource_id, path)
