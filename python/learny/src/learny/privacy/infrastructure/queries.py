"""SQL of the privacy context (SPEC-2206).

The account page reads an export under the owner's RLS (`get_data_export`), while the creation and
the deletion schedule run with the owner role.
"""

import re
from dataclasses import dataclass
from datetime import datetime
from typing import Any

from sqlalchemy import text

from learny.shared.db.uow import Tx

PROFILE_TIMEZONE = text("select timezone from public.profiles where id = cast(:user_id as uuid)")
PROFILE_DELETION = text(
    "select id::text as id, email, timezone, deletion_requested_at, deletion_scheduled_for "
    "from public.profiles where id = cast(:user_id as uuid) for update"
)
INSERT_EXPORT = text(
    "insert into public.data_exports (user_id, status, requested_on, created_at) "
    "values (cast(:user_id as uuid), :status, cast(:requested_on as date), :created_at) "
    "returning id::text as id, user_id::text as user_id, status::text as status, storage_path, "
    "expires_at, size_bytes, error, requested_on::text as requested_on, created_at"
)
FIND_PENDING = text(
    "select id::text as id, user_id::text as user_id, status::text as status, storage_path, "
    "expires_at, size_bytes, error, requested_on::text as requested_on, created_at "
    "from public.data_exports "
    "where user_id = cast(:user_id as uuid) and status in ('queued', 'running') "
    "order by created_at desc, id desc limit 1"
)
COUNT_ON = text(
    "select count(*)::int as count from public.data_exports "
    "where user_id = cast(:user_id as uuid) and requested_on = cast(:requested_on as date)"
)
GET_EXPORT = text(
    "select id::text as id, user_id::text as user_id, status::text as status, storage_path, "
    "expires_at, size_bytes, error, requested_on::text as requested_on, created_at "
    "from public.data_exports "
    "where id = cast(:export_id as uuid) and user_id = cast(:user_id as uuid)"
)
SCHEDULE_DELETION = text(
    "update public.profiles set deletion_requested_at = :now, deletion_scheduled_for = :scheduled, "
    "updated_at = :now where id = cast(:user_id as uuid) and deletion_scheduled_for is null"
)
CANCEL_DELETION = text(
    "update public.profiles set deletion_requested_at = null, deletion_scheduled_for = null, "
    "updated_at = :now where id = cast(:user_id as uuid)"
)
ADVISORY_LOCK = text("select pg_advisory_xact_lock(hashtext(:user_id)::bigint)")


@dataclass(frozen=True, slots=True)
class DataExportRow:
    """One row of `data_exports` (data-model section 11)."""

    id: str
    user_id: str
    status: str
    storage_path: str | None
    expires_at: datetime | None
    size_bytes: int | None
    error: str | None
    requested_on: str | None
    created_at: datetime


@dataclass(frozen=True, slots=True)
class ProfileDeletionRow:
    """The profile fields the deletion need (EF-5, EF-6)."""

    id: str
    email: str
    timezone: str
    deletion_requested_at: datetime | None
    deletion_scheduled_for: datetime | None


def export_row(record: Any) -> DataExportRow:
    data = dict(record)
    return DataExportRow(
        id=str(data["id"]),
        user_id=str(data["user_id"]),
        status=str(data["status"]),
        storage_path=data["storage_path"],
        expires_at=data["expires_at"],
        size_bytes=None if data["size_bytes"] is None else int(data["size_bytes"]),
        error=data["error"],
        requested_on=data["requested_on"],
        created_at=data["created_at"],
    )


async def profile_timezone(tx: Tx, user_id: str) -> str | None:
    """`profileZone`: the time zone of the local civil day of the quota (EF-1)."""
    result = await tx.conn.execute(PROFILE_TIMEZONE, {"user_id": user_id})
    found = result.mappings().all()
    return None if not found else found[0]["timezone"]


async def lock_profile_for_deletion(tx: Tx, user_id: str) -> ProfileDeletionRow | None:
    """`select ... for update` of the deletion capture (EF-5, EF-7)."""
    result = await tx.conn.execute(PROFILE_DELETION, {"user_id": user_id})
    found = result.mappings().all()
    if not found:
        return None
    data = dict(found[0])
    return ProfileDeletionRow(
        id=str(data["id"]),
        email=str(data["email"]),
        timezone=str(data["timezone"] or "Europe/Paris"),
        deletion_requested_at=data["deletion_requested_at"],
        deletion_scheduled_for=data["deletion_scheduled_for"],
    )


async def lock_daily_quota(tx: Tx, user_id: str) -> None:
    """`pg_advisory_xact_lock(hashtext(userId))`: one job at a time per learner (CL-1)."""
    await tx.conn.execute(ADVISORY_LOCK, {"user_id": user_id})


async def find_pending_export(tx: Tx, user_id: str) -> DataExportRow | None:
    """The export still being produced, if any (one job at a time, CL-1)."""
    result = await tx.conn.execute(FIND_PENDING, {"user_id": user_id})
    found = result.mappings().all()
    return None if not found else export_row(found[0])


async def count_exports_on(tx: Tx, user_id: str, requested_on: str) -> int:
    """Exports of the owner created on one local civil day (EF-1)."""
    result = await tx.conn.execute(COUNT_ON, {"user_id": user_id, "requested_on": requested_on})
    return int(result.mappings().all()[0]["count"])


async def create_export(tx: Tx, user_id: str, requested_on: str, created_at: datetime) -> DataExportRow:
    """Creates the private export job of one learner (EF-1)."""
    result = await tx.conn.execute(
        INSERT_EXPORT,
        {
            "user_id": user_id,
            "status": "queued",
            "requested_on": requested_on,
            "created_at": created_at,
        },
    )
    found = result.mappings().all()
    return export_row(found[0])


async def get_export(tx: Tx, user_id: str, export_id: str) -> DataExportRow | None:
    """One export of the owner; another learner's identifier yields `None` under RLS (CL-5)."""
    result = await tx.conn.execute(GET_EXPORT, {"user_id": user_id, "export_id": export_id})
    found = result.mappings().all()
    return None if not found else export_row(found[0])


async def schedule_deletion(tx: Tx, user_id: str, now: datetime, scheduled_for: datetime) -> bool:
    """EF-5 - sets both columns once; a replay finds the deadline already set."""
    result = await tx.conn.execute(
        SCHEDULE_DELETION, {"user_id": user_id, "now": now, "scheduled": scheduled_for}
    )
    return result.rowcount > 0


async def cancel_deletion(tx: Tx, user_id: str, now: datetime) -> None:
    """EF-6 - clears both columns; without a pending request it still succeeds."""
    await tx.conn.execute(CANCEL_DELETION, {"user_id": user_id, "now": now})


# --- job queries (SPEC-211 EF-1, EF-4, EF-7, EF-8) ----------------------------------------------

LOAD_EXPORT = text(
    "select id::text as id, user_id::text as user_id, status::text as status, storage_path, "
    "expires_at, size_bytes, error, requested_on::text as requested_on, created_at "
    "from public.data_exports where id = cast(:export_id as uuid) limit 1"
)
START_EXPORT = text(
    "update public.data_exports set status = 'running', error = null where id = cast(:export_id as uuid)"
)
COMPLETE_EXPORT = text(
    "update public.data_exports set status = 'done', storage_path = :storage_path, "
    "size_bytes = :size_bytes, expires_at = :expires_at, error = null "
    "where id = cast(:export_id as uuid) and user_id = cast(:user_id as uuid) returning id"
)
FAIL_EXPORT = text(
    "update public.data_exports set status = 'failed', storage_path = null, expires_at = null, "
    "error = :error where id = cast(:export_id as uuid)"
)
PROFILE_FOR_JOB = text(
    "select timezone, tutor_tone::text as tutor_tone, email from public.profiles "
    "where id = cast(:user_id as uuid)"
)
LIST_EXPIRED_EXPORTS = text(
    "select id::text as id, user_id::text as user_id, status::text as status, storage_path, "
    "expires_at, size_bytes, error, requested_on::text as requested_on, created_at "
    "from public.data_exports where expires_at is not null and expires_at < :before "
    "order by expires_at limit :limit"
)
DELETE_EXPORT = text(
    "delete from public.data_exports where id = cast(:export_id as uuid) "
    "and user_id = cast(:user_id as uuid) returning id"
)
DUE_DELETIONS = text(
    "select id::text as id from public.profiles "
    "where deletion_scheduled_for is not null and deletion_scheduled_for <= :now "
    "order by deletion_scheduled_for, id limit :limit"
)
CAPTURE_DELETION = text(
    "select id::text as id, email, tutor_tone::text as tutor_tone, timezone, "
    "deletion_requested_at, deletion_scheduled_for from public.profiles "
    "where id = cast(:user_id as uuid) for update"
)
UPDATE_GROUPS = (
    text(
        "select g.id::text as id, g.formation_id::text as formation_id, "
        "(select gm.user_id::text from public.group_members gm "
        " where gm.group_id = g.id and gm.user_id <> cast(:user_id as uuid) "
        " and gm.left_at is null order by gm.joined_at, gm.user_id limit 1) as new_owner "
        "from public.groups g where g.owner_id = cast(:user_id as uuid) for update"
    ),
    text("delete from public.formations where id = cast(:formation_id as uuid)"),
    text("update public.groups set owner_id = cast(:owner_id as uuid) where id = cast(:group_id as uuid)"),
    text(
        "update public.group_members set role = 'owner' "
        "where group_id = cast(:group_id as uuid) and user_id = cast(:owner_id as uuid)"
    ),
    text(
        "update public.group_members set role = 'member' "
        "where group_id = cast(:group_id as uuid) and user_id = cast(:user_id as uuid)"
    ),
    text(
        "update public.formations set owner_id = cast(:owner_id as uuid) "
        "where id = cast(:formation_id as uuid)"
    ),
)
STORAGE_PATHS = (
    text(
        "select storage_path from public.resources "
        "where owner_id = cast(:user_id as uuid) and storage_path is not null"
    ),
    text(
        "select storage_path from public.data_exports "
        "where user_id = cast(:user_id as uuid) and storage_path is not null"
    ),
)
ANONYMISE_CALLS = text(
    "update public.ai_calls set user_id = null where user_id = cast(:user_id as uuid) "
    "returning id::text as id"
)
DELETE_PROFILE = text(
    "delete from public.profiles where id = cast(:user_id as uuid) returning id::text as id"
)
PERSONAL_TABLES = text(
    "select table_name, column_name from information_schema.columns "
    "where table_schema = 'public' and column_name in ('user_id', 'owner_id') "
    "and table_name <> 'profiles' order by table_name"
)

_SAFE_NAME = re.compile(r"^[a-z_]+$")


def safe_identifier(value: str) -> str:
    """Only a snake-case identifier from `information_schema` reaches the counting statement."""
    if _SAFE_NAME.match(value) is None:
        raise ValueError(f"unsafe identifier: {value}")
    return value


async def load_export(tx: Tx, export_id: str) -> DataExportRow | None:
    """`load` step: the job row, whatever its state."""
    result = await tx.conn.execute(LOAD_EXPORT, {"export_id": export_id})
    found = result.mappings().all()
    return None if not found else export_row(found[0])


async def start_export(tx: Tx, export_id: str) -> None:
    """`startDataExport`: marks the job running once its first step starts (EF-4)."""
    await tx.conn.execute(START_EXPORT, {"export_id": export_id})


async def complete_export(
    tx: Tx,
    user_id: str,
    export_id: str,
    storage_path: str,
    size_bytes: int,
    expires_at: datetime,
) -> bool:
    """`completeDataExport`: private path, size and seven-day expiration (EF-1)."""
    result = await tx.conn.execute(
        COMPLETE_EXPORT,
        {
            "user_id": user_id,
            "export_id": export_id,
            "storage_path": storage_path,
            "size_bytes": size_bytes,
            "expires_at": expires_at,
        },
    )
    return len(result.mappings().all()) > 0


async def fail_export(tx: Tx, export_id: str, error: str) -> None:
    """`failDataExport`: the row stays for audit, without a download path (EF-4)."""
    await tx.conn.execute(FAIL_EXPORT, {"export_id": export_id, "error": error[:2000]})


async def profile_for_job(tx: Tx, user_id: str) -> dict[str, Any] | None:
    """Time zone, tone and address of the owner, read with the owner role (EF-1, EF-7)."""
    result = await tx.conn.execute(PROFILE_FOR_JOB, {"user_id": user_id})
    found = result.mappings().all()
    return None if not found else dict(found[0])


async def list_expired_exports(tx: Tx, before: datetime, limit: int = 200) -> list[DataExportRow]:
    """EF-8 - exports expired for more than the grace period, oldest first."""
    result = await tx.conn.execute(LIST_EXPIRED_EXPORTS, {"before": before, "limit": limit})
    return [export_row(row) for row in result.mappings().all()]


async def delete_export(tx: Tx, user_id: str, export_id: str) -> bool:
    """EF-8 - removes one expired export row after its object was removed."""
    result = await tx.conn.execute(DELETE_EXPORT, {"user_id": user_id, "export_id": export_id})
    return result.rowcount > 0


async def due_deletions(tx: Tx, now: datetime, limit: int = 50) -> list[str]:
    """EF-7 - profiles whose scheduled deletion is due, oldest first, fifty per run."""
    result = await tx.conn.execute(DUE_DELETIONS, {"now": now, "limit": limit})
    return [str(row["id"]) for row in result.mappings().all()]


async def capture_deletion(tx: Tx, user_id: str) -> ProfileDeletionRow | None:
    """`capture` step: the profile locked for the whole deletion (EF-7)."""
    return await lock_profile_for_deletion(tx, user_id)


# --- collection of the archive under the learner's RLS (SPEC-211 EF-3, ET-3) ---------------------

COLLECT_SQL: dict[str, str] = {
    "profile": (
        "select id::text as id, email, first_name, last_name, course_language::text as course_language, "
        "tutor_tone::text as tutor_tone, timezone, onboarding_step::text as onboarding_step, "
        "onboarding_completed_at, terms_version, terms_accepted_at, created_at "
        "from public.profiles where id = cast(:user_id as uuid)"
    ),
    "study": (
        "select hours_per_day, study_days, preferred_slots::text[] as preferred_slots "
        "from public.study_preferences "
        "where user_id = cast(:user_id as uuid)"
    ),
    "notifications": (
        "select channel_email, channel_push, type_revision, type_validation, type_course, type_gap, "
        "type_planning, type_relaunch, quiet_start, quiet_end, weekend_quiet, max_per_day "
        "from public.notification_settings where user_id = cast(:user_id as uuid)"
    ),
    "automations": (
        "select key::text as key, enabled, params, updated_at from public.automation_settings "
        "where user_id = cast(:user_id as uuid) order by key"
    ),
    "formations": (
        "select id::text as id, group_id::text as group_id, title, description, "
        "objectives::text[] as objectives, status::text as status, exam_format, "
        "maintenance_mode::text as maintenance_mode, start_date, end_date, default_threshold, "
        "completed_at, created_at from public.formations order by created_at, id"
    ),
    "modules": (
        "select id::text as id, formation_id::text as formation_id, position, title, objectives, "
        "status::text as status, threshold, opened_at, validated_at from public.modules "
        "order by formation_id, position"
    ),
    "chapters": (
        "select id::text as id, module_id::text as module_id, formation_id::text as formation_id, "
        "position, title from public.chapters order by module_id, position"
    ),
    "notions": (
        "select id::text as id, formation_id::text as formation_id, module_id::text as module_id, "
        "chapter_id::text as chapter_id, label, short_definition, position from public.notions "
        "order by formation_id, position"
    ),
    "links": (
        "select id::text as id, formation_id::text as formation_id, "
        "from_notion_id::text as from_notion_id, to_notion_id::text as to_notion_id, "
        "kind::text as kind, rationale from public.notion_links order by formation_id, id"
    ),
    "courses": (
        "select id::text as id, formation_id::text as formation_id, module_id::text as module_id, "
        "version, status::text as status, created_at from public.courses "
        "where is_current order by module_id"
    ),
    "sections": (
        "select s.id::text as id, s.course_id::text as course_id, s.chapter_id::text as chapter_id, "
        "s.position, s.kind::text as kind, s.title, s.content_md, s.origin::text as origin "
        "from public.course_sections s join public.courses c on c.id = s.course_id "
        "where c.is_current and not s.reported order by c.module_id, s.chapter_id, s.position"
    ),
    "citations": (
        "select id::text as id, section_id::text as section_id, resource_id::text as resource_id, "
        "quote, label, media_kind::text as media_kind from public.citations "
        "order by section_id, created_at"
    ),
    "resources": (
        "select id::text as id, formation_id::text as formation_id, chapter_id::text as chapter_id, "
        "kind::text as kind, title, storage_path, mime, size_bytes, url, content_text, metadata, "
        "created_at from public.resources where deleted_at is null order by created_at, id"
    ),
    "attempts": (
        "select id::text as id, activity_id::text as activity_id, attempt_no, started_at, "
        "submitted_at, duration_ms, score, passed, per_notion, hints_used, created_at "
        "from public.attempts order by created_at, id"
    ),
    "answers": (
        "select a.id::text as id, a.attempt_id::text as attempt_id, "
        "a.brick_version_id::text as brick_version_id, a.position, a.response, a.is_correct, "
        "a.score, a.max_score, a.time_ms, a.feedback, a.answered_at from public.answers a "
        "join public.attempts t on t.id = a.attempt_id order by a.attempt_id, a.position"
    ),
    "states": (
        "select notion_id::text as notion_id, fsrs, due_at, mastery, first_seen_at, last_seen_at, "
        "success_count, gap_confused_with::text as gap_confused_with, gap_detected_at, "
        "gap_evidence, gap_cleared_at, suspended, in_review, revision "
        "from public.notion_states order by notion_id"
    ),
    "gaps": (
        "select id::text as id, notion_id::text as notion_id, kind::text as kind, "
        "nature::text as nature, evidence, created_at from public.gap_events "
        "order by created_at, id"
    ),
    "days": "select day::text as day, minutes, qualifying, sources from public.daily_activity order by day",
    "milestones": (
        "select id::text as id, formation_id::text as formation_id, key::text as key, "
        "ref_id::text as ref_id, achieved_at from public.milestones order by achieved_at, id"
    ),
    "conversations": (
        "select id::text as id, course_id::text as course_id, title, created_at, updated_at "
        "from public.tutor_conversations order by created_at, id"
    ),
    "messages": (
        "select m.id::text as id, m.conversation_id::text as conversation_id, m.role::text as role, "
        "m.content, m.sources, m.follow_ups, m.self_test, m.created_at from public.tutor_messages m "
        "join public.tutor_conversations c on c.id = m.conversation_id "
        "order by m.conversation_id, m.created_at, m.id"
    ),
}


async def collect_tables(tx: Tx, user_id: str) -> dict[str, list[dict[str, Any]]]:
    """Runs every read of the archive inside one transaction under the learner's RLS (ET-3)."""
    tables: dict[str, list[dict[str, Any]]] = {}
    for name, statement in COLLECT_SQL.items():
        result = await tx.conn.execute(text(statement), {"user_id": user_id})
        tables[name] = [dict(row) for row in result.mappings().all()]
    return tables
