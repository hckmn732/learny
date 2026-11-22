"""Demonstrations of SPEC-211 (EF-9): the real export, the schedule/cancel flow and a J+30 deletion.

Port of `packages/services/src/personal-data/demo.ts`. The demonstration only bypasses the
three-exports-a-day limit (it creates its own row); every other step is the production use case.
"""

from contextlib import suppress
from dataclasses import replace
from datetime import datetime, timedelta
from typing import Any

from learny.platform.storage import mint_user_access_token
from learny.privacy import public as privacy
from learny.privacy.domain.deletion import DELETION_DELAY_DAYS
from learny.shared.errors import AppError
from learny.shared.ids import new_id
from learny.shared.locale_fr import dev_personal_data as fixture
from learny.shared.locale_fr import privacy as fr
from learny.shared.locale_fr.details import UNAUTHENTICATED
from learny.shared.time import to_iso
from sqlalchemy import text

from learny_api.dev_demos.support import emails_for
from learny_api.pipeline import Call

SELECT_FORMATION = text(
    "select id::text as id from public.formations "
    "where owner_id = cast(:user_id as uuid) and title = :title limit 1"
)
INSERT_FORMATION = text(
    "insert into public.formations (owner_id, title, description, objectives, status) "
    "values (cast(:user_id as uuid), :title, :description, "
    "'{operational}'::public.formation_objective[], 'active') returning id::text as id"
)
INSERT_MODULE = text(
    "insert into public.modules (formation_id, position, title, status) "
    "values (cast(:formation_id as uuid), 1, :title, 'open') returning id::text as id"
)
INSERT_CHAPTER = text(
    "insert into public.chapters (module_id, formation_id, position, title) "
    "values (cast(:module_id as uuid), cast(:formation_id as uuid), 1, :title) "
    "returning id::text as id"
)
INSERT_NOTION = text(
    "insert into public.notions "
    "(formation_id, module_id, chapter_id, label, short_definition, position) "
    "values (cast(:formation_id as uuid), cast(:module_id as uuid), cast(:chapter_id as uuid), "
    ":label, :definition, 1)"
)
INSERT_COURSE = text(
    "insert into public.courses (owner_id, formation_id, module_id, version, status) "
    "values (cast(:user_id as uuid), cast(:formation_id as uuid), cast(:module_id as uuid), 1, "
    "'ready') returning id::text as id"
)
INSERT_SECTION = text(
    "insert into public.course_sections "
    "(course_id, owner_id, chapter_id, position, kind, anchor, title, content_md, origin) "
    "values (cast(:course_id as uuid), cast(:user_id as uuid), cast(:chapter_id as uuid), "
    ":position, 'text', :anchor, :title, :content, 'tutor')"
)
INSERT_RESOURCE = text(
    "insert into public.resources "
    "(owner_id, formation_id, chapter_id, kind, title, content_text, metadata) "
    "values (cast(:user_id as uuid), cast(:formation_id as uuid), cast(:chapter_id as uuid), "
    "'note', :title, :content, cast(:metadata as jsonb))"
)
INSERT_EXPORT = text(
    "insert into public.data_exports (user_id, status, requested_on, created_at) "
    "values (cast(:user_id as uuid), 'queued', "
    "(select (cast(:created_at as timestamptz) at time zone p.timezone)::date "
    "from public.profiles p where p.id = cast(:user_id as uuid)), "
    "cast(:created_at as timestamptz)) returning id::text as id"
)
SELECT_EXPORT = text(
    "select id::text as id, status::text as status, size_bytes, created_at, expires_at "
    "from public.data_exports where id = cast(:export_id as uuid)"
)
SELECT_PROFILE = text("select email, timezone from public.profiles where id = cast(:user_id as uuid)")
SCHEDULE_THROWAWAY = text(
    "update public.profiles "
    "set deletion_requested_at = cast(:now as timestamptz), "
    "deletion_scheduled_for = cast(:scheduled_for as timestamptz) "
    "where id = cast(:user_id as uuid)"
)


class _FixedClock:
    """`{ now: () => later }`: the demonstration looks at the account on the deadline."""

    def __init__(self, instant: datetime) -> None:
        self._instant = instant

    def now(self) -> datetime:
        return self._instant


class _GotrueAdmin(privacy.AccountAdmin):
    """The Auth admin of the facade, injected so the suite never reaches GoTrue."""

    def __init__(self, gotrue: Any) -> None:
        self._gotrue = gotrue

    async def delete_user(self, user_id: str) -> None:
        try:
            await self._gotrue.admin_delete_user(user_id)
        except Exception:  # the throwaway account is already gone
            return

    async def exists(self, user_id: str) -> bool:
        try:
            await self._gotrue.admin_get_user(user_id)
        except Exception:
            return False
        return True


def _user_id(call: Call) -> str:
    if call.actor is None or call.user_id is None:
        raise AppError("UNAUTHENTICATED", UNAUTHENTICATED)
    return call.user_id


def _storage_configured(deps: Any) -> bool:
    settings = getattr(deps, "settings", None)
    if settings is None:
        return False
    return bool(getattr(settings, "supabase_url", "") and getattr(settings, "supabase_service_role_key", ""))


def _deletion_ports(deps: Any, user_id: str) -> privacy.DeletionJobDeps:
    """The deletion ports of the demonstration: the facade Auth admin, best-effort storage."""

    async def remove(bucket: Any, path: str) -> None:
        if not _storage_configured(deps):
            return
        token = mint_user_access_token(user_id, deps.settings.supabase_jwt_secret, deps.clock)
        try:
            await deps.storage.remove(bucket, path, token)
        except AppError:
            return

    return privacy.DeletionJobDeps(remove_object=remove, admin=_GotrueAdmin(deps.gotrue))


def _export_ports() -> privacy.ExportJobDeps:
    """Local demonstration without Supabase Storage: the tree and the size stay real."""

    async def read(path: str) -> bytes | None:
        return None

    async def upload(bucket: Any, path: str, archive: Any) -> None:
        return

    return privacy.ExportJobDeps(read_object=read, upload_archive=upload)


async def seed_demo_data(deps: Any, user_id: str) -> None:
    """Creates the deterministic demo programme of one learner, once (idempotent by title)."""
    async with deps.db.service_tx() as tx:
        existing = (
            (await tx.conn.execute(SELECT_FORMATION, {"user_id": user_id, "title": fixture.DEMO_TITLE}))
            .mappings()
            .first()
        )
        if existing is not None:
            return
        formation = (
            (
                await tx.conn.execute(
                    INSERT_FORMATION,
                    {
                        "user_id": user_id,
                        "title": fixture.DEMO_TITLE,
                        "description": fixture.DEMO_DESCRIPTION,
                    },
                )
            )
            .mappings()
            .first()
        )
        if formation is None:  # pragma: no cover - the insert either answers or raises
            raise AppError("INTERNAL_ERROR")
        formation_id = str(formation["id"])
        module = (
            (
                await tx.conn.execute(
                    INSERT_MODULE,
                    {"formation_id": formation_id, "title": fixture.DEMO_MODULE_TITLE},
                )
            )
            .mappings()
            .first()
        )
        if module is None:  # pragma: no cover
            raise AppError("INTERNAL_ERROR")
        module_id = str(module["id"])
        chapter = (
            (
                await tx.conn.execute(
                    INSERT_CHAPTER,
                    {
                        "module_id": module_id,
                        "formation_id": formation_id,
                        "title": fixture.DEMO_CHAPTER_TITLE,
                    },
                )
            )
            .mappings()
            .first()
        )
        if chapter is None:  # pragma: no cover
            raise AppError("INTERNAL_ERROR")
        chapter_id = str(chapter["id"])
        await tx.conn.execute(
            INSERT_NOTION,
            {
                "formation_id": formation_id,
                "module_id": module_id,
                "chapter_id": chapter_id,
                "label": fixture.DEMO_NOTION_LABEL,
                "definition": fixture.DEMO_NOTION_DEFINITION,
            },
        )
        course = (
            (
                await tx.conn.execute(
                    INSERT_COURSE,
                    {
                        "user_id": user_id,
                        "formation_id": formation_id,
                        "module_id": module_id,
                    },
                )
            )
            .mappings()
            .first()
        )
        if course is None:  # pragma: no cover
            raise AppError("INTERNAL_ERROR")
        course_id = str(course["id"])
        for position, (anchor, title, content) in enumerate(
            (
                (
                    fixture.DEMO_SECTION_1_ANCHOR,
                    fixture.DEMO_SECTION_1_TITLE,
                    fixture.DEMO_SECTION_1_CONTENT,
                ),
                (
                    fixture.DEMO_SECTION_2_ANCHOR,
                    fixture.DEMO_SECTION_2_TITLE,
                    fixture.DEMO_SECTION_2_CONTENT,
                ),
            ),
            start=1,
        ):
            await tx.conn.execute(
                INSERT_SECTION,
                {
                    "course_id": course_id,
                    "user_id": user_id,
                    "chapter_id": chapter_id,
                    "position": position,
                    "anchor": anchor,
                    "title": title,
                    "content": content,
                },
            )
        await tx.conn.execute(
            INSERT_RESOURCE,
            {
                "user_id": user_id,
                "formation_id": formation_id,
                "chapter_id": chapter_id,
                "title": fixture.DEMO_RESOURCE_TITLE,
                "content": fixture.DEMO_RESOURCE_TEXT,
                "metadata": fixture.DEMO_RESOURCE_METADATA,
            },
        )


async def _profile(call: Call, user_id: str) -> Any:
    async with call.deps.db.service_tx() as tx:
        row = (await tx.conn.execute(SELECT_PROFILE, {"user_id": user_id})).mappings().first()
    return row


async def schedule(call: Call) -> dict[str, Any]:
    """EF-9 - schedules the deletion through the real service."""
    user_id = _user_id(call)
    result = await privacy.schedule_deletion(call.deps, call.actor)
    profile = await _profile(call, user_id)
    email = None if profile is None else str(profile["email"])
    return {"scheduledFor": result["scheduledFor"], "emails": emails_for(call.deps, email)}


async def cancel(call: Call) -> dict[str, Any]:
    """EF-9 - cancels the deletion through the real service."""
    user_id = _user_id(call)
    await privacy.cancel_deletion(call.deps, call.actor)
    profile = await _profile(call, user_id)
    email = None if profile is None else str(profile["email"])
    return {"scheduledFor": None, "emails": emails_for(call.deps, email)}


async def execute(call: Call) -> dict[str, Any]:
    """EF-9, CA-4 - complete deletion of a throwaway account at J+30 with the remaining rows."""
    user_id = _user_id(call)
    now = call.deps.clock.now()
    email = f"{fixture.THROWAWAY_EMAIL_PREFIX}{user_id[:8]}-{new_id()[:8]}{fixture.THROWAWAY_EMAIL_DOMAIN}"
    password = f"{fixture.THROWAWAY_PASSWORD_PREFIX}{user_id}-{int(now.timestamp() * 1000)}"
    try:
        created = await call.deps.gotrue.admin_create_user(email, password, email_confirm=True)
    except Exception:
        raise AppError("SERVICE_UNAVAILABLE", fixture.THROWAWAY_NOT_CREATED) from None
    throwaway = created.id
    ports = _deletion_ports(call.deps, throwaway)
    try:
        await seed_demo_data(call.deps, throwaway)
        scheduled_for = now + timedelta(days=DELETION_DELAY_DAYS)
        async with call.deps.db.service_tx() as tx:
            await tx.conn.execute(
                SCHEDULE_THROWAWAY,
                {"user_id": throwaway, "now": now, "scheduled_for": scheduled_for},
            )
        later = replace(call.deps, clock=_FixedClock(scheduled_for))
        outcome = await privacy.run_account_deletion(later, throwaway, job=ports)
    finally:
        # Never leave a throwaway account behind if a step failed before the Auth deletion.
        with suppress(Exception):
            if await ports.admin.exists(throwaway):
                await call.deps.gotrue.admin_delete_user(throwaway)
    return {
        "scheduledFor": to_iso(scheduled_for),
        "tables": [{"table": row.table, "remaining": row.remaining} for row in outcome.tables],
        "authStatus": outcome.auth_status,
        "emails": emails_for(call.deps, email),
    }


async def run_export(call: Call) -> dict[str, Any]:
    """EF-9 - one complete export of the demo dataset, with the produced tree."""
    user_id = _user_id(call)
    await seed_demo_data(call.deps, user_id)
    started = call.deps.clock.now()
    async with call.deps.db.service_tx() as tx:
        created = (
            (await tx.conn.execute(INSERT_EXPORT, {"user_id": user_id, "created_at": started}))
            .mappings()
            .first()
        )
    if created is None:  # pragma: no cover - the insert either answers or raises
        raise AppError("INTERNAL_ERROR", fixture.EXPORT_NOT_CREATED)
    export_id = str(created["id"])
    ports = None if _storage_configured(call.deps) else _export_ports()
    outcome = await privacy.run_data_export(call.deps, user_id, export_id, ports)
    async with call.deps.db.service_tx() as tx:
        stored = (await tx.conn.execute(SELECT_EXPORT, {"export_id": export_id})).mappings().first()
    if stored is None:
        raise AppError("NOT_FOUND", fr.EXPORT_NOT_FOUND)
    profile = await _profile(call, user_id)
    email = None if profile is None else str(profile["email"])
    elapsed = call.deps.clock.now() - started
    return {
        "export": {
            "id": str(stored["id"]),
            "status": str(stored["status"]),
            "sizeBytes": stored["size_bytes"],
            "createdAt": to_iso(stored["created_at"]),
            "expiresAt": None if stored["expires_at"] is None else to_iso(stored["expires_at"]),
        },
        "tree": list(outcome.entries),
        "durationMs": max(0, int(elapsed.total_seconds() * 1000)),
        "emails": emails_for(call.deps, email),
    }
