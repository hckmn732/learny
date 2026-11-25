"""Ingestion of a note, a PDF or a remote source (SPEC-509 EF-1 to EF-5, SPEC-510).

The five durable stages (load, extract, chunk, embed, finalize) each re-read the persisted state of
the resource and skip work that is already done, and the finalization replaces the previous passages
in one transaction, so a failure never leaves a partial set. A duplicate delivery finds the
completed marker and does nothing; a transient provider outage leaves the resource `processing` for
the next attempt (CL-3); a permanent extraction failure ends in `failed` with a readable code
(BR-APP-07).

The stage seam (`StepRunner`) is the one the worker wires in SPEC-2207. It is not a generic step
engine: every stage below decides from the database row whether it has work left.
"""

import json
import uuid
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from datetime import timedelta
from typing import Any, Protocol, TypeVar

from learny.content.application.ports import ContentDeps
from learny.content.domain.chunk import TextChunk, chunk_text
from learny.content.domain.embeddings import (
    EMBEDDING_MODEL,
    EmbeddingClient,
    embed_texts,
    to_vector_literal,
)
from learny.content.domain.errors import IngestionError
from learny.content.infrastructure import ingestion_queries as sql
from learny.content.infrastructure.extract import (
    DEFAULT_PDF_LIMITS,
    IMAGE_LIMITS,
    ExtractedContent,
    ImageResourceInput,
    PdfLimits,
    WebFetcher,
    YoutubeProvider,
    create_llm_vision_reader,
    extract_image_document,
    extract_note,
    extract_pdf,
    extract_web_document,
    extract_youtube,
    youtube_content,
)
from learny.content.infrastructure.files import ReadFile, ReadFileInput, supabase_file_reader
from learny.platform.embeddings import default_embedder, mode_of
from learny.shared.db.uow import Tx
from learny.shared.errors import AppError
from learny.shared.locale_fr import content as texts
from learny.shared.time import to_iso

INGESTION_EVENT_CLAIM_STALE_MS = 60_000
CHUNK_INSERT_BATCH = 50
SUPPORTED_KINDS = frozenset({"note", "pdf", "web", "youtube", "image"})

T = TypeVar("T")


@dataclass(frozen=True, slots=True)
class UploadPdfInput:
    user_id: str
    resource_id: str
    data: bytes


UploadPdf = Callable[[UploadPdfInput], Awaitable[str | None]]


class StepRunner(Protocol):
    """The durable step seam; the default runs the action immediately."""

    async def run(self, name: str, action: Callable[[], Awaitable[T]]) -> T: ...


class DirectSteps:
    """Runs every stage in order; used by a direct service call and by the tests."""

    async def run(self, name: str, action: Callable[[], Awaitable[T]]) -> T:
        _ = name
        return await action()


@dataclass(frozen=True, slots=True)
class IngestionPorts:
    """Everything that leaves the process: Storage, embeddings, network and the vision model."""

    read_file: ReadFile
    embedder: EmbeddingClient
    upload_pdf: UploadPdf
    mode: str = "mock"
    limits: PdfLimits = DEFAULT_PDF_LIMITS
    fetch_web: WebFetcher | None = None
    youtube: YoutubeProvider | None = None


@dataclass(frozen=True, slots=True)
class LoadedResource:
    id: str
    owner_id: str
    formation_id: str
    chapter_id: str | None
    kind: str
    title: str
    content_text: str | None
    storage_path: str | None
    url: str | None
    mime: str | None
    size_bytes: float | None
    status: str
    error_code: str | None
    metadata: dict[str, Any] = field(default_factory=dict)
    deleted: bool = False
    chunk_count: int = 0

    @property
    def ingestion(self) -> dict[str, Any]:
        marker = self.metadata.get("ingestion")
        return dict(marker) if isinstance(marker, dict) else {}


async def _no_upload(_input: UploadPdfInput) -> str | None:
    return None


def default_ports(deps: ContentDeps) -> IngestionPorts:
    """Production adapters selected from the settings; a test substitutes the whole bundle."""
    mode = mode_of(deps.settings)
    return IngestionPorts(
        read_file=supabase_file_reader(deps.settings),
        embedder=default_embedder(deps.settings),
        upload_pdf=_no_upload,
        mode=mode,
    )


def _source_missing() -> IngestionError:
    return IngestionError("RESOURCE_FILE_MISSING", texts.RESOURCE_FILE_MISSING)


def _too_large(limit_bytes: int) -> IngestionError:
    return IngestionError("PDF_TOO_LARGE", texts.PDF_EXTRACT_TOO_LARGE.format(limit=limit_bytes // 1_048_576))


def _image_too_large() -> IngestionError:
    return IngestionError(
        "IMAGE_TOO_LARGE", texts.IMAGE_TOO_LARGE.format(limit=IMAGE_LIMITS["max_bytes"] // 1_048_576)
    )


def _safe_message(error: IngestionError) -> str:
    return " ".join(error.detail.split()).strip()[:1000] if error.detail else ""


def _loaded(row: dict[str, Any]) -> LoadedResource:
    metadata = row.get("metadata")
    return LoadedResource(
        id=str(row["id"]),
        owner_id=str(row["owner_id"]),
        formation_id=str(row["formation_id"]),
        chapter_id=str(row["chapter_id"]) if row.get("chapter_id") is not None else None,
        kind=str(row["kind"]),
        title=str(row["title"]),
        content_text=row.get("content_text"),
        storage_path=row.get("storage_path"),
        url=row.get("url"),
        mime=row.get("mime"),
        size_bytes=float(row["size_bytes"]) if row.get("size_bytes") is not None else None,
        status=str(row["status"]),
        error_code=row.get("error_code"),
        metadata=dict(metadata) if isinstance(metadata, dict) else {},
        deleted=row.get("deleted_at") is not None,
        chunk_count=int(row.get("chunk_count") or 0),
    )


async def _one(deps: ContentDeps, statement: Any, params: dict[str, Any]) -> dict[str, Any] | None:
    async with deps.db.service_tx() as tx:
        result = await tx.conn.execute(statement, params)
        rows = [dict(item) for item in result.mappings().all()]
    return rows[0] if rows else None


async def _execute(deps: ContentDeps, statement: Any, params: dict[str, Any]) -> None:
    """Runs a writing statement that returns no row."""
    async with deps.db.service_tx() as tx:
        await tx.conn.execute(statement, params)


async def select_resource(
    deps: ContentDeps, resource_id: str, *, for_update: bool = False
) -> LoadedResource | None:
    """The resource row, optionally locked; `None` when it does not exist."""
    statement = sql.SELECT_RESOURCE_FOR_UPDATE if for_update else sql.SELECT_RESOURCE
    row = await _one(deps, statement, {"id": resource_id})
    return None if row is None else _loaded(row)


async def _mark_processing(deps: ContentDeps, resource_id: str) -> LoadedResource | None:
    patch = json.dumps({"startedAt": to_iso(deps.clock.now())})
    row = await _one(deps, sql.MARK_PROCESSING, {"id": resource_id, "patch": patch})
    return None if row is None else _loaded(row)


def _content_hash(content: ExtractedContent, kind: str) -> str:
    import hashlib

    return hashlib.sha256(kind.encode() + b"\0" + content.text.encode()).hexdigest()


async def _extract(
    deps: ContentDeps, ports: IngestionPorts, resource: LoadedResource
) -> tuple[ExtractedContent, str | None]:
    if resource.kind == "note":
        return extract_note(resource.content_text), None
    if resource.kind == "web":
        if resource.url is None:
            raise IngestionError("RESOURCE_URL_MISSING", texts.RESOURCE_URL_MISSING)
        document = await extract_web_document(resource.url, fetcher=ports.fetch_web)
        return document.content, None
    if resource.kind == "youtube":
        if resource.url is None:
            raise IngestionError("RESOURCE_URL_MISSING", texts.RESOURCE_YOUTUBE_URL_MISSING)
        extraction = await extract_youtube(resource.url, provider=ports.youtube, mode=ports.mode)
        return youtube_content(extraction), None
    if resource.kind == "image":
        if resource.storage_path is None:
            raise _source_missing()
        if resource.size_bytes is not None and resource.size_bytes > IMAGE_LIMITS["max_bytes"]:
            raise _image_too_large()
        try:
            data = await ports.read_file(
                ReadFileInput(
                    owner_id=resource.owner_id,
                    resource_id=resource.id,
                    storage_path=resource.storage_path,
                    max_bytes=IMAGE_LIMITS["max_bytes"],
                )
            )
        except IngestionError as error:
            if error.code == "PDF_TOO_LARGE":
                raise _image_too_large() from error
            raise
        if data is None or len(data) == 0:
            raise _source_missing()
        reader = create_llm_vision_reader(deps.llm, resource.owner_id, ports.mode)
        image_document = await extract_image_document(
            ImageResourceInput(bytes=data, mime=resource.mime or "", title=resource.title),
            reader=reader,
        )
        return image_document.content, None
    if resource.kind != "pdf":
        raise IngestionError("RESOURCE_UNSUPPORTED", texts.RESOURCE_UNSUPPORTED.format(kind=resource.kind))
    if resource.metadata.get("sourceKind") == "document":
        # SPEC-4001 EF-2 - a DOCX, TXT or Markdown source is read as one text document.
        from learny.content.infrastructure.extract import extract_document

        if resource.storage_path is None:
            raise _source_missing()
        raw = await ports.read_file(
            ReadFileInput(
                owner_id=resource.owner_id,
                resource_id=resource.id,
                storage_path=resource.storage_path,
                max_bytes=ports.limits.max_bytes,
            )
        )
        if raw is None or len(raw) == 0:
            raise _source_missing()
        return extract_document(raw, resource.mime or "text/plain"), None
    if resource.storage_path is None:
        raise _source_missing()
    if resource.size_bytes is not None and resource.size_bytes > ports.limits.max_bytes:
        raise _too_large(ports.limits.max_bytes)
    data = await ports.read_file(
        ReadFileInput(
            owner_id=resource.owner_id,
            resource_id=resource.id,
            storage_path=resource.storage_path,
            max_bytes=ports.limits.max_bytes,
        )
    )
    if data is None or len(data) == 0:
        raise _source_missing()
    content = extract_pdf(data, ports.limits)
    file_id = await ports.upload_pdf(
        UploadPdfInput(user_id=resource.owner_id, resource_id=resource.id, data=data)
    )
    return content, file_id


def _image_input(data: bytes, mime: str | None, title: str) -> Any:
    from learny.content.infrastructure.extract import ImageResourceInput

    return ImageResourceInput(bytes=data, mime=mime or "", title=title)


async def _finalize(
    deps: ContentDeps,
    ports: IngestionPorts,
    resource: LoadedResource,
    content: ExtractedContent,
    chunks: list[TextChunk],
    embeddings: list[list[float]],
    anthropic_file_id: str | None,
) -> tuple[str, int, int]:
    content_hash = _content_hash(content, resource.kind)
    async with deps.db.service_tx() as tx:
        locked = await _locked(tx, resource.id)
        if locked is None or locked.deleted:
            return "skipped", 0, 0
        if (
            locked.status == "ready"
            and str(locked.ingestion.get("contentHash") or "") == content_hash
            and locked.chunk_count == len(chunks)
        ):
            return "ready", locked.chunk_count, len(embeddings)

        now = deps.clock.now()
        await tx.conn.execute(sql.DELETE_CHUNKS, {"id": resource.id})
        for offset in range(0, len(chunks), CHUNK_INSERT_BATCH):
            batch = chunks[offset : offset + CHUNK_INSERT_BATCH]
            rows: list[dict[str, Any]] = []
            for index, chunk in enumerate(batch):
                embedding = embeddings[offset + index]
                rows.append(
                    {
                        "resource_id": resource.id,
                        "owner_id": resource.owner_id,
                        "formation_id": resource.formation_id,
                        "chapter_id": resource.chapter_id,
                        "position": chunk.position,
                        "text": chunk.text,
                        "location": json.dumps(chunk.location, ensure_ascii=False),
                        "token_count": chunk.token_count,
                        "embedding": to_vector_literal(embedding),
                        "created_at": to_iso(now),
                    }
                )
            await tx.conn.execute(sql.INSERT_CHUNK, rows)

        ingestion = dict(locked.ingestion)
        ingestion.update(
            {
                "contentHash": content_hash,
                "completedAt": to_iso(now),
                "chunkCount": len(chunks),
                "embeddingModel": EMBEDDING_MODEL,
                "embeddingDim": len(embeddings[0]) if embeddings else 0,
                "contentOrigin": content.content_origin or "source",
            }
        )
        for key in ("failedAt", "failedEventClaimedAt", "failedEventEmittedAt"):
            ingestion.pop(key, None)
        if content.vision is None:
            for key in ("visionModel", "visionProvider", "visionTask"):
                ingestion.pop(key, None)
        else:
            ingestion["visionModel"] = content.vision.model_id
            ingestion["visionProvider"] = content.vision.provider
            ingestion["visionTask"] = content.vision.task
        next_title = (content.title or "").strip()
        title = locked.title if next_title == "" else next_title[:200]
        metadata = dict(locked.metadata)
        metadata.update(content.metadata)
        if content.pages is not None:
            metadata["pages"] = content.pages
        if anthropic_file_id is not None:
            metadata["anthropicFileId"] = anthropic_file_id
        metadata["ingestion"] = ingestion
        await tx.conn.execute(
            sql.UPDATE_READY,
            {
                "id": resource.id,
                "title": title,
                "metadata": json.dumps(metadata, ensure_ascii=False),
            },
        )
        return "ready", len(chunks), len(embeddings)


async def _locked(tx: Tx, resource_id: str) -> LoadedResource | None:
    result = await tx.conn.execute(sql.SELECT_RESOURCE_FOR_UPDATE, {"id": resource_id})
    rows = [dict(item) for item in result.mappings().all()]
    return None if not rows else _loaded(rows[0])


async def _claim_event(deps: ContentDeps, resource_id: str, kind: str) -> bool:
    emitted_field = "readyEventEmittedAt" if kind == "ready" else "failedEventEmittedAt"
    claimed_field = "readyEventClaimedAt" if kind == "ready" else "failedEventClaimedAt"
    current = await _one(deps, sql.SELECT_EVENT_EMITTED, {"id": resource_id, "emitted": emitted_field})
    if current is not None and current.get("emitted") is True:
        return False
    now = deps.clock.now()
    stale_before = to_iso(now - timedelta(milliseconds=INGESTION_EVENT_CLAIM_STALE_MS))
    row = await _one(
        deps,
        sql.CLAIM_EVENT,
        {
            "id": resource_id,
            "path": f"{{ingestion,{claimed_field}}}",
            "now": to_iso(now),
            "emitted": emitted_field,
            "claimed": claimed_field,
            "stale_before": stale_before,
        },
    )
    return row is not None


async def _mark_event_emitted(deps: ContentDeps, resource_id: str, kind: str) -> None:
    emitted_field = "readyEventEmittedAt" if kind == "ready" else "failedEventEmittedAt"
    await _execute(
        deps,
        sql.MARK_EVENT_EMITTED,
        {
            "id": resource_id,
            "path": f"{{ingestion,{emitted_field}}}",
            "now": to_iso(deps.clock.now()),
        },
    )


async def _clear_event_claim(deps: ContentDeps, resource_id: str, kind: str) -> None:
    claimed_field = "readyEventClaimedAt" if kind == "ready" else "failedEventClaimedAt"
    await _execute(
        deps,
        sql.CLEAR_EVENT_CLAIM,
        {"id": resource_id, "path": f"{{ingestion,{claimed_field}}}"},
    )


async def _publish(deps: ContentDeps, resource: LoadedResource, kind: str) -> None:
    if not await _claim_event(deps, resource.id, kind):
        return
    try:
        if kind == "ready":
            payload = {
                "userId": resource.owner_id,
                "resourceId": resource.id,
                "chunkCount": resource.chunk_count,
            }
            document = "resource/ready"
            event_id = f"resource-ready:{resource.id}"
        else:
            payload = {
                "userId": resource.owner_id,
                "resourceId": resource.id,
                "errorCode": resource.error_code or "EXTRACTION_FAILED",
            }
            document = "resource/failed"
            event_id = f"resource-failed:{resource.id}"
        async with deps.db.service_tx() as tx:
            await tx.emit(document, payload, event_id=event_id, user_id=resource.owner_id)
    except Exception:
        await _clear_event_claim(deps, resource.id, kind)
        raise
    await _mark_event_emitted(deps, resource.id, kind)


async def _publish_ready(deps: ContentDeps, resource_id: str) -> None:
    fresh = await select_resource(deps, resource_id)
    if fresh is None or fresh.deleted or fresh.status != "ready":
        return
    await _publish(deps, fresh, "ready")


async def _publish_failed(deps: ContentDeps, resource_id: str) -> None:
    fresh = await select_resource(deps, resource_id)
    if fresh is None or fresh.deleted or fresh.status != "failed":
        return
    await _publish(deps, fresh, "failed")


async def _mark_failed(deps: ContentDeps, resource: LoadedResource, error: IngestionError) -> bool:
    row = await _one(
        deps,
        sql.MARK_FAILED,
        {
            "id": resource.id,
            "code": error.code,
            "message": _safe_message(error),
            "patch": json.dumps({"failedAt": to_iso(deps.clock.now())}),
        },
    )
    return row is not None


async def fail_after_last_attempt(deps: ContentDeps, resource_id: str, code: str, message: str) -> None:
    """The worker gave up on a transient failure: the resource ends in `failed`, readable by the
    learner, instead of staying `processing` forever (QA 2026-11-25)."""
    loaded = await select_resource(deps, resource_id)
    if loaded is None or loaded.deleted or loaded.status in ("ready", "failed"):
        return
    if await _mark_failed(deps, loaded, IngestionError(code, message)):
        await _publish_failed(deps, resource_id)


# A resource untouched this long, with no job left to finish it, is stuck: the hourly sweep marks it
# `failed` so the learner can retry instead of waiting forever (QA 2026-11-25).
STALE_RESOURCE_AFTER = timedelta(hours=2)
STALE_SWEEP_LIMIT = 50


async def fail_stale_resources(deps: ContentDeps, *, limit: int = STALE_SWEEP_LIMIT) -> int:
    """Marks `failed` the resources stuck in `queued`/`processing`; returns how many."""
    before = to_iso(deps.clock.now() - STALE_RESOURCE_AFTER)
    async with deps.db.service_tx() as tx:
        result = await tx.conn.execute(
            sql.SELECT_STALE_RESOURCES,
            {"before": before, "kinds": sorted(SUPPORTED_KINDS), "limit": limit},
        )
        stale = [str(row["id"]) for row in result.mappings().all()]
    for resource_id in stale:
        await fail_after_last_attempt(deps, resource_id, "RESOURCE_GIVEN_UP", texts.RESOURCE_GIVEN_UP)
    if stale:
        _warn(deps, "stale resources failed", component="ingestion", outcome="failed", code=str(len(stale)))
    return len(stale)


def _skipped(resource_id: str) -> dict[str, Any]:
    return {
        "resourceId": resource_id,
        "outcome": "skipped",
        "chunkCount": 0,
        "embeddingCount": 0,
        "errorCode": None,
        "errorMessage": None,
    }


def _failed(resource_id: str, error: IngestionError) -> dict[str, Any]:
    return {
        "resourceId": resource_id,
        "outcome": "failed",
        "chunkCount": 0,
        "embeddingCount": 0,
        "errorCode": error.code,
        "errorMessage": error.detail,
    }


def _info(deps: ContentDeps, message: str, **fields: Any) -> None:
    try:
        deps.logger.info(message, **fields)
    except Exception:  # logging never changes the business outcome
        return


def _warn(deps: ContentDeps, message: str, **fields: Any) -> None:
    try:
        deps.logger.warning(message, **fields)
    except Exception:  # logging never changes the business outcome
        return


async def _process(
    deps: ContentDeps,
    resource_id: str,
    ports: IngestionPorts,
    step: StepRunner,
) -> dict[str, Any]:
    loaded = await step.run("load-resource", lambda: select_resource(deps, resource_id))
    if loaded is None or loaded.deleted:
        return _skipped(resource_id)
    if loaded.kind not in SUPPORTED_KINDS:
        _info(
            deps,
            "resource kind left for its own ingestion",
            component="ingestion",
            operation=loaded.kind,
            outcome="skipped",
        )
        return _skipped(resource_id)

    if (
        loaded.status == "ready"
        and loaded.chunk_count > 0
        and loaded.ingestion.get("completedAt") is not None
    ):
        await step.run("publish-ready", lambda: _publish_ready(deps, resource_id))
        return {
            "resourceId": resource_id,
            "outcome": "ready",
            "chunkCount": loaded.chunk_count,
            "embeddingCount": loaded.chunk_count,
            "errorCode": None,
            "errorMessage": None,
        }

    processing = await step.run("mark-processing", lambda: _mark_processing(deps, resource_id))
    if processing is None:
        return _skipped(resource_id)

    try:
        extracted, anthropic_file_id = await step.run("extract", lambda: _extract(deps, ports, processing))
        chunks = await step.run(
            "chunk",
            lambda: _constant(chunk_text(extracted.text, list(extracted.locations))),
        )
        embeddings = await step.run(
            "embed",
            lambda: embed_texts(ports.embedder, [chunk.text for chunk in chunks]),
        )
        outcome, chunk_count, embedding_count = await step.run(
            "finalize",
            lambda: _finalize(deps, ports, processing, extracted, chunks, embeddings, anthropic_file_id),
        )
        if outcome == "skipped":
            return _skipped(resource_id)
        await step.run("publish-ready", lambda: _publish_ready(deps, resource_id))
        _info(
            deps,
            "resource ready",
            component="ingestion",
            operation=processing.kind,
            outcome="ready",
            code=str(chunk_count),
        )
        return {
            "resourceId": resource_id,
            "outcome": "ready",
            "chunkCount": chunk_count,
            "embeddingCount": embedding_count,
            "errorCode": None,
            "errorMessage": None,
        }
    except IngestionError as failure:
        if not failure.permanent:
            _warn(
                deps,
                "resource processing deferred",
                component="ingestion",
                operation=processing.kind,
                outcome="retry",
                code=failure.code,
            )
            raise

        failure_value = failure

        async def mark_failed_step() -> bool:
            return await _mark_failed(deps, processing, failure_value)

        marked = await step.run("mark-failed", mark_failed_step)
        if marked:
            await step.run("publish-failed", lambda: _publish_failed(deps, resource_id))
        _warn(
            deps,
            "resource failed",
            component="ingestion",
            operation=processing.kind,
            outcome="failed",
            code=failure.code,
        )
        return _failed(resource_id, failure)
    except AppError as error:
        _warn(
            deps,
            "resource processing deferred",
            component="ingestion",
            operation=processing.kind,
            outcome="retry",
            code=error.code,
        )
        raise


async def _constant[T](value: T) -> T:
    return value


async def process_resource(
    deps: ContentDeps,
    resource_id: str,
    *,
    ports: IngestionPorts | None = None,
    step: StepRunner | None = None,
) -> dict[str, Any]:
    """ET-1, ET-4: processes one owned contribution and returns its validated outcome."""
    try:
        uuid.UUID(resource_id)
    except (ValueError, AttributeError, TypeError) as error:
        raise AppError("VALIDATION_FAILED", texts.INGESTION_INVALID_RESOURCE_ID) from error
    chosen = ports if ports is not None else default_ports(deps)
    runner = step if step is not None else DirectSteps()
    return await _process(deps, resource_id, chosen, runner)


__all__ = [
    "CHUNK_INSERT_BATCH",
    "INGESTION_EVENT_CLAIM_STALE_MS",
    "DirectSteps",
    "IngestionPorts",
    "LoadedResource",
    "StepRunner",
    "UploadPdf",
    "UploadPdfInput",
    "default_ports",
    "fail_stale_resources",
    "process_resource",
    "select_resource",
]
