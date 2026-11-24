"""Deposited documents of a simple-mode formation (SPEC-4001 EF-2, EF-3, EF-4; BR-APP-01).

A source is a formation-level `resources` row (null `chapter_id`) whose `metadata.role` says how it
feeds the programme. The upload itself stays the signed-URL flow of `uploads.create`; the existing
`resources.finalize` measures the real bytes and emits `resource/uploaded`.
"""

import json
import re
import unicodedata
import uuid
from datetime import timedelta
from typing import Any, cast
from urllib.parse import urlsplit

from learny.content.application.ports import storage_access
from learny.formation.application.ports import FormationDeps
from learny.formation.application.simple.create import require_simple_formation
from learny.formation.application.simple.status import read_simple_state
from learny.formation.domain import simple as rules
from learny.formation.infrastructure import queries
from learny.identity.domain.actor import Actor
from learny.platform.storage import create_upload_url, normalize_storage_file_name, resource_path
from learny.shared.errors import AppError
from learny.shared.locale_fr import content as content_texts
from learny.shared.locale_fr.details import (
    FORMATION_NOT_FOUND,
    SIMPLE_ANALYSIS_LOCKED,
    SIMPLE_TOO_MANY_SOURCES,
    SIMPLE_UPLOAD_UNSUPPORTED,
)
from learny.shared.locale_fr.simple import SOURCE_ROLE_LABELS
from learny.shared.time import to_iso

_STORAGE_UNSAFE = re.compile(r"[^A-Za-z0-9._-]+")


def storage_file_name(name: str) -> str:
    """EF-2 - nom de fichier stocké, réduit à l'ASCII : Storage refuse les clés accentuées.

    Le titre affiché garde le nom d'origine (`normalize_storage_file_name`) ; seule la clé de
    l'objet est translittérée, un fichier « Manuel de comptabilité générale.txt » devenant
    « Manuel-de-comptabilite-generale.txt ».
    """
    decomposed = unicodedata.normalize("NFKD", name)
    ascii_name = decomposed.encode("ascii", "ignore").decode("ascii")
    cleaned = _STORAGE_UNSAFE.sub("-", ascii_name).strip("-.")
    return cleaned or "document"


YOUTUBE_HOSTS = frozenset({"youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be"})
SIGNED_URL_TTL_SECONDS = 600
MAX_FILE_BYTES = 52_428_800
MAX_IMAGE_BYTES = 10_485_760

# EF-2 - declared types accepted in simple mode, with the stored resource kind and the extractor.
DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
SIMPLE_UPLOAD_MIMES: dict[str, tuple[str, str]] = {
    "application/pdf": ("pdf", "pdf"),
    "image/jpeg": ("image", "image"),
    "image/png": ("image", "image"),
    "image/webp": ("image", "image"),
    "image/heic": ("image", "image"),
    "text/plain": ("pdf", "document"),
    "text/markdown": ("pdf", "document"),
    DOCX_MIME: ("pdf", "document"),
}


def _strip_extension(name: str) -> str:
    dot = name.rfind(".")
    base = name[:dot] if dot > 0 else name
    return name if base == "" else base


def _analysis_locked(formation: dict[str, Any] | Any) -> bool:
    return str(formation.get("analysis_status") or "collecting") != "collecting"


def _assert_open(formation: Any, count: int) -> None:
    """EF-2, EF-4 - no new document and no role change once the analysis has started."""
    if _analysis_locked(formation):
        raise AppError("SIMPLE_ANALYSIS_LOCKED", SIMPLE_ANALYSIS_LOCKED, status=409)
    if count >= rules.MAX_SIMPLE_SOURCES:
        raise AppError("SIMPLE_TOO_MANY_SOURCES", SIMPLE_TOO_MANY_SOURCES, status=422)


def _declared_type(mime: str, size: int) -> tuple[str, str]:
    """EF-2 - the declared type and size, refused as the existing upload codes."""
    normalized = mime.split(";")[0].strip().lower()
    entry = SIMPLE_UPLOAD_MIMES.get(normalized)
    if entry is None:
        raise AppError("UNSUPPORTED_TYPE", SIMPLE_UPLOAD_UNSUPPORTED, status=422)
    kind, source_kind = entry
    limit = MAX_IMAGE_BYTES if kind == "image" else MAX_FILE_BYTES
    if size <= 0 or size > limit:
        raise AppError("UPLOAD_TOO_LARGE", content_texts.FILE_TOO_LARGE_GENERIC, status=422)
    return kind, source_kind


async def create_simple_upload(
    deps: FormationDeps,
    actor: Actor,
    formation_id: str,
    body: dict[str, Any],
    idempotency_key: str | None,
) -> dict[str, Any]:
    """EF-2 - reserves a file source and signs its upload URL."""
    declared = int(body["sizeBytes"])
    kind, source_kind = _declared_type(str(body["mime"]), declared)
    file_name = str(body["fileName"])
    now = deps.clock.now()
    reserved_until = to_iso(now + timedelta(seconds=SIGNED_URL_TTL_SECONDS))
    resource_id = str(uuid.uuid4())
    clean_name = normalize_storage_file_name(file_name)
    path = resource_path(actor.user_id, resource_id, storage_file_name(clean_name))
    access = storage_access(cast(Any, deps), actor.user_id)
    async with deps.db.user_tx(actor) as tx:
        formation = await require_simple_formation(tx, actor.user_id, formation_id)
        count = await queries.count_simple_sources(tx, formation_id)
        _assert_open(formation, count)
        requested = body.get("role")
        role = (
            str(requested) if requested is not None else rules.guess_role(name=file_name, is_first=count == 0)
        )
        metadata = {
            "role": role,
            "sourceKind": source_kind,
            "upload": {
                "declaredBytes": declared,
                "declaredMime": str(body["mime"]).split(";")[0].strip().lower(),
                "reservedUntil": reserved_until,
                "idempotencyKey": idempotency_key or "",
            },
        }
        created = await queries.insert_simple_resource(
            tx,
            resource_id=resource_id,
            user_id=actor.user_id,
            formation_id=formation_id,
            kind=kind,
            title=str(body.get("title") or _strip_extension(clean_name))[:200],
            path=path,
            url=None,
            mime=str(body["mime"]).split(";")[0].strip().lower(),
            # La taille déclarée reste dans `metadata.upload` : `resources.finalize` mesure l'objet
            # réel et c'est lui qui renseigne `size_bytes` (SPEC-206 ET-5, réessai idempotent).
            size_bytes=None,
            metadata=json.dumps(metadata, ensure_ascii=False),
        )
        if created is None:
            raise AppError("INTERNAL_ERROR", FORMATION_NOT_FOUND)
        signed = await create_upload_url(tx, cast(Any, deps).storage, deps.clock, access, "resources", path)
        return {
            "resourceId": resource_id,
            "uploadUrl": signed.url,
            "expiresAt": to_iso(signed.expires_at),
            "role": role,
        }


def _link_kind(url: str) -> str:
    host = (urlsplit(url).hostname or "").lower()
    return "youtube" if host in YOUTUBE_HOSTS else "web"


async def create_simple_link(
    deps: FormationDeps, actor: Actor, formation_id: str, body: dict[str, Any]
) -> dict[str, Any]:
    """EF-3 - a web page or a YouTube video source, with its guessed or requested role."""
    url = str(body["url"])
    kind = _link_kind(url)
    async with deps.db.user_tx(actor) as tx:
        formation = await require_simple_formation(tx, actor.user_id, formation_id)
        count = await queries.count_simple_sources(tx, formation_id)
        _assert_open(formation, count)
        requested = body.get("role")
        role = str(requested) if requested is not None else rules.guess_role(name=url, is_first=count == 0)
        title = (
            SOURCE_ROLE_LABELS.get(role, str(role))
            if kind == "youtube"
            else (urlsplit(url).hostname or url)[:200]
        )
        resource_id = str(uuid.uuid4())
        metadata = {"role": role, "sourceKind": kind}
        created = await queries.insert_simple_resource(
            tx,
            resource_id=resource_id,
            user_id=actor.user_id,
            formation_id=formation_id,
            kind=kind,
            title=title,
            path=None,
            url=url,
            mime="text/html" if kind == "web" else "video/youtube",
            size_bytes=0,
            metadata=json.dumps(metadata, ensure_ascii=False),
        )
        if created is None:
            raise AppError("INTERNAL_ERROR", FORMATION_NOT_FOUND)
        await tx.emit(
            "resource/uploaded",
            {
                "userId": actor.user_id,
                "resourceId": resource_id,
                "formationId": formation_id,
                "chapterId": None,
                "kind": kind,
            },
            event_id=f"resource-uploaded:{resource_id}",
        )
        return {
            "resourceId": resource_id,
            "kind": kind,
            "title": title,
            "status": "queued",
            "role": role,
        }


async def set_resource_role(
    deps: FormationDeps, actor: Actor, resource_id: str, body: dict[str, Any]
) -> dict[str, Any]:
    """EF-4 - `PATCH /resources/:rid/role`, refused once the analysis has started."""
    role = str(body["role"])
    now = deps.clock.now()
    async with deps.db.user_tx(actor) as tx:
        scope = await queries.read_resource_scope(tx, actor.user_id, resource_id)
        if scope is None:
            raise AppError("NOT_FOUND", FORMATION_NOT_FOUND)
        if str(scope.get("creation_mode")) != "simple":
            raise AppError("SIMPLE_NOT_SIMPLE", SIMPLE_ANALYSIS_LOCKED, status=409)
        if str(scope.get("analysis_status") or "collecting") != "collecting":
            raise AppError("SIMPLE_ANALYSIS_LOCKED", SIMPLE_ANALYSIS_LOCKED, status=409)
        updated = await queries.update_resource_role(tx, actor.user_id, resource_id, role, to_iso(now))
        if not updated:
            raise AppError("NOT_FOUND", FORMATION_NOT_FOUND)
        return {"resourceId": resource_id, "role": role}


__all__ = [
    "create_simple_link",
    "create_simple_upload",
    "read_simple_state",
    "set_resource_role",
]
