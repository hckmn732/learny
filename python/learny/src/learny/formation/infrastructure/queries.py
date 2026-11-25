"""SQL of the formation context (SPEC-2201).

`${x}` placeholders become bound `:x` parameters and nothing here reads the clock.
"""

import json
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from datetime import datetime
from typing import Any

from sqlalchemy import text

from learny.shared.db.uow import Tx

# --------------------------------------------------------------------------------------------------
# cadrage: reads and projection (cadrage/state.ts, cadrage/get.ts)
# --------------------------------------------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class CadrageFormationRow:
    """`FormationRow` of `cadrage/state.ts`."""

    id: str
    title: str
    status: str
    cadrage_profile: Any
    objectives: list[str]
    course_language: str


@dataclass(frozen=True, slots=True)
class CadrageMessageRow:
    """`MessageRow` of `cadrage/state.ts`."""

    id: str
    role: str
    content: str
    question_key: str | None
    suggestions: Any
    position: int
    created_at: datetime


READ_CADRAGE_FORMATION = text(
    """
    select id::text as id,
           title,
           status::text as status,
           cadrage_profile,
           objectives::text[] as objectives,
           course_language::text as course_language
      from public.formations
     where id = cast(:formation_id as uuid)
       and owner_id = cast(:user_id as uuid)
     limit 1
    """
)

READ_CADRAGE_MESSAGES = text(
    """
    select id::text as id,
           role::text as role,
           content,
           question_key::text as question_key,
           suggestions,
           position,
           created_at
      from public.cadrage_messages
     where formation_id = cast(:formation_id as uuid)
     order by position asc
    """
)

NEXT_MESSAGE_POSITION = text(
    """
    select coalesce(max(position), 0) + 1 as next
      from public.cadrage_messages
     where formation_id = cast(:formation_id as uuid)
    """
)

CADRAGE_COMPLETED_EVENT = text(
    """
    select true as present
      from public.event_outbox
     where event_id = cast(:event_id as text)
     limit 1
    """
)

UPSERT_CADRAGE_PROFILE = text(
    """
    update public.formations
       set cadrage_profile = cast(:profile as jsonb),
           objectives = cast(:objectives as public.formation_objective[]),
           updated_at = cast(:now as timestamptz)
     where id = cast(:formation_id as uuid)
    """
)

UPDATE_CADRAGE_OBJECTIVES = text(
    """
    update public.formations
       set objectives = cast(:objectives as public.formation_objective[]),
           cadrage_profile = cast(:profile as jsonb),
           updated_at = cast(:now as timestamptz)
     where id = cast(:formation_id as uuid)
       and owner_id = cast(:user_id as uuid)
    """
)

INSERT_CADRAGE_MESSAGE = text(
    """
    insert into public.cadrage_messages (
      formation_id, user_id, role, content, question_key, suggestions, position, created_at
    )
    values (
      cast(:formation_id as uuid),
      cast(:user_id as uuid),
      cast(:role as public.message_role),
      :content,
      cast(:question_key as public.cadrage_key),
      cast(:suggestions as jsonb),
      :position,
      cast(:now as timestamptz)
    )
    returning id::text as id
    """
)

INSERT_LEARNER_MESSAGE = text(
    """
    insert into public.cadrage_messages (
      formation_id, user_id, role, content, question_key, suggestions, position, created_at
    )
    values (
      cast(:formation_id as uuid),
      cast(:user_id as uuid),
      'learner',
      :content,
      null,
      null,
      :position,
      cast(:now as timestamptz)
    )
    """
)

READ_TUTOR_PROFILE = text(
    """
    select tutor_tone::text as tutor_tone, course_language::text as course_language
      from public.profiles
     where id = cast(:user_id as uuid)
     limit 1
    """
)


def row_of(found: Any) -> dict[str, Any]:
    """A plain mapping: SQLAlchemy returns `RowMapping`, which a dataclass cannot index cheaply."""
    return dict(found)


def _cadrage_formation(found: Any) -> CadrageFormationRow:
    row = row_of(found)
    return CadrageFormationRow(
        id=str(row["id"]),
        title=str(row["title"]),
        status=str(row["status"]),
        cadrage_profile=row["cadrage_profile"],
        objectives=[str(item) for item in row["objectives"]],
        course_language=str(row["course_language"]),
    )


async def read_cadrage_formation(tx: Tx, user_id: str, formation_id: str) -> CadrageFormationRow | None:
    """CL-1 - the owner-scoped read: another owner is indistinguishable from a missing row."""
    result = await tx.conn.execute(READ_CADRAGE_FORMATION, {"user_id": user_id, "formation_id": formation_id})
    found = result.mappings().all()
    return None if not found else _cadrage_formation(row_of(found[0]))


async def read_cadrage_messages(tx: Tx, formation_id: str) -> list[CadrageMessageRow]:
    """The conversation in display order."""
    result = await tx.conn.execute(READ_CADRAGE_MESSAGES, {"formation_id": formation_id})
    return [
        CadrageMessageRow(
            id=str(row["id"]),
            role=str(row["role"]),
            content=str(row["content"]),
            question_key=None if row["question_key"] is None else str(row["question_key"]),
            suggestions=row["suggestions"],
            position=int(row["position"]),
            created_at=row["created_at"],
        )
        for row in (row_of(item) for item in result.mappings().all())
    ]


async def next_message_position(tx: Tx, formation_id: str) -> int:
    """ST/ET-2 - one more position; the unique constraint protects a concurrent insert."""
    result = await tx.conn.execute(NEXT_MESSAGE_POSITION, {"formation_id": formation_id})
    found = result.mappings().all()
    return 1 if not found else int(row_of(found[0])["next"])


async def cadrage_completed(tx: Tx, formation_id: str) -> bool:
    """A conclusion already requested keeps the profile frozen (deterministic outbox id)."""
    result = await tx.conn.execute(CADRAGE_COMPLETED_EVENT, {"event_id": f"cadrage-completed:{formation_id}"})
    return len(result.mappings().all()) > 0


async def update_cadrage_profile(
    tx: Tx,
    formation_id: str,
    profile: Mapping[str, Any],
    objectives: Sequence[str],
    now: datetime,
) -> None:
    """`persistTutorTurn`: the profile is only written through `applyTutorTurn`."""
    await tx.conn.execute(
        UPSERT_CADRAGE_PROFILE,
        {
            "formation_id": formation_id,
            "profile": json.dumps(profile, ensure_ascii=False),
            "objectives": list(objectives),
            "now": now,
        },
    )


async def complete_cadrage_profile(
    tx: Tx,
    user_id: str,
    formation_id: str,
    profile: Mapping[str, Any],
    objectives: Sequence[str],
    now: datetime,
) -> None:
    """`completeCadrage`: the conclusion freezes the profile and the objectives."""
    await tx.conn.execute(
        UPDATE_CADRAGE_OBJECTIVES,
        {
            "user_id": user_id,
            "formation_id": formation_id,
            "profile": json.dumps(profile, ensure_ascii=False),
            "objectives": list(objectives),
            "now": now,
        },
    )


async def insert_cadrage_message(
    tx: Tx,
    formation_id: str,
    user_id: str,
    *,
    role: str,
    content: str,
    question_key: str | None,
    suggestions: str | None,
    position: int,
    now: datetime,
) -> str:
    """One message, tutor or learner; a tutor turn may carry its question key and suggestions."""
    result = await tx.conn.execute(
        INSERT_CADRAGE_MESSAGE,
        {
            "formation_id": formation_id,
            "user_id": user_id,
            "role": role,
            "content": content,
            "question_key": question_key,
            "suggestions": suggestions,
            "position": position,
            "now": now,
        },
    )
    return str(row_of(result.mappings().all()[0])["id"])


async def insert_learner_message(
    tx: Tx, formation_id: str, user_id: str, content: str, position: int, now: datetime
) -> None:
    """The learner answer is committed before the model is called (SPEC-604 ET-2)."""
    await tx.conn.execute(
        INSERT_LEARNER_MESSAGE,
        {
            "formation_id": formation_id,
            "user_id": user_id,
            "content": content,
            "position": position,
            "now": now,
        },
    )


async def read_tutor_profile(tx: Tx, user_id: str) -> Mapping[str, Any]:
    """`readTutorProfile`: the tone and the course language of one learner."""
    result = await tx.conn.execute(READ_TUTOR_PROFILE, {"user_id": user_id})
    found = result.mappings().all()
    if not found:
        from learny.shared.errors import AppError
        from learny.shared.locale_fr.details import PROFILE_NOT_FOUND

        raise AppError("NOT_FOUND", PROFILE_NOT_FOUND)
    return row_of(found[0])


# --------------------------------------------------------------------------------------------------
# formations: creation, list, title, management transitions (cadrage/create.ts, formations/*.ts)
# --------------------------------------------------------------------------------------------------

READ_OWNER_ACCOUNTS = text(
    """
    select tutor_tone::text as tone, course_language::text as course_language
      from public.profiles
     where id = cast(:user_id as uuid)
     limit 1
    """
)

READ_USED_ACCENTS = text(
    """
    select accent_color::text as accent_color
      from public.formations
     where owner_id = cast(:user_id as uuid)
       and status in ('cadrage', 'programme_proposed', 'active', 'paused')
    """
)

INSERT_FORMATION = text(
    """
    insert into public.formations (
      owner_id, title, status, course_language, monogram, accent_color, cadrage_profile,
      created_at, updated_at
    )
    values (
      cast(:user_id as uuid),
      :title,
      'cadrage',
      cast(:course_language as public.course_language),
      :monogram,
      cast(:accent as public.formation_accent),
      cast(:profile as jsonb),
      cast(:now as timestamptz),
      cast(:now as timestamptz)
    )
    returning id::text as id,
              title,
              status::text as status,
              cadrage_profile,
              objectives::text[] as objectives,
              course_language::text as course_language
    """
)

LIST_OWNED_FORMATIONS = text(
    """
    select f.id::text as id, f.title, f.status::text as status,
           f.creation_mode::text as creation_mode,
           sa.status::text as simple_status
      from public.formations f
      left join public.simple_analyses sa on sa.formation_id = f.id
     where f.owner_id = cast(:user_id as uuid)
     order by f.created_at desc
    """
)

UPDATE_FORMATION_TITLE = text(
    """
    update public.formations
       set title = :title,
           monogram = :monogram,
           updated_at = cast(:now as timestamptz)
     where id = cast(:formation_id as uuid)
       and owner_id = cast(:user_id as uuid)
    returning id::text as id, title, status::text as status,
              creation_mode::text as creation_mode
    """
)

LOCK_FORMATION_TRANSITIONS = text(
    """
    select pg_advisory_xact_lock(hashtextextended('formations:' || cast(:user_id as text), 0))
    """
)

READ_PROFILE_FOR_UPDATE = text(
    """
    select current_formation_id::text as current_formation_id, timezone
      from public.profiles
     where id = cast(:user_id as uuid)
    """
)

READ_FORMATION_FOR_UPDATE = text(
    """
    select f.id::text as id,
           f.title,
           f.monogram,
           f.accent_color::text as accent_color,
           f.status::text as status,
           f.last_opened_at,
           f.paused_at,
           f.updated_at,
           f.created_at
      from public.formations f
     where f.id = cast(:formation_id as uuid)
       and f.owner_id = cast(:user_id as uuid)
     for update
    """
)

READ_MANAGED_ROWS = text(
    """
    select f.id::text as id,
           f.title,
           f.monogram,
           f.accent_color::text as accent_color,
           f.status::text as status,
           f.last_opened_at,
           f.created_at,
           (select count(*)::int from public.modules m where m.formation_id = f.id) as module_count,
           (
             select count(*)::int
             from public.module_progress mp
             join public.modules m on m.id = mp.module_id
             where mp.user_id = cast(:user_id as uuid)
               and m.formation_id = f.id
               and mp.status = 'validated'
           ) as validated_count,
           (
             select min(m.position)::int
             from public.modules m
             where m.formation_id = f.id
               and m.status = 'open'
           ) as open_position
      from public.formations f
     where f.owner_id = cast(:user_id as uuid)
       and f.status in ('active', 'paused')
    """
)

PAUSE_FORMATION = text(
    """
    update public.formations
       set status = 'paused',
           paused_at = cast(:now as timestamptz),
           updated_at = cast(:now as timestamptz)
     where id = cast(:formation_id as uuid)
       and owner_id = cast(:user_id as uuid)
    """
)

ARCHIVE_FORMATION = text(
    """
    update public.formations
       set status = 'archived',
           paused_at = null,
           updated_at = cast(:now as timestamptz)
     where id = cast(:formation_id as uuid)
       and owner_id = cast(:user_id as uuid)
    """
)

RESUME_FORMATION = text(
    """
    update public.formations
       set status = 'active',
           paused_at = null,
           updated_at = cast(:now as timestamptz)
     where id = cast(:formation_id as uuid)
       and owner_id = cast(:user_id as uuid)
    """
)

CANCEL_FUTURE_SLOTS = text(
    """
    update public.schedule_slots
       set status = 'cancelled',
           updated_at = cast(:now as timestamptz)
     where user_id = cast(:user_id as uuid)
       and formation_id = cast(:formation_id as uuid)
       and status = 'planned'
       and starts_at >= cast(:now as timestamptz)
    """
)

READ_FALLBACK_FORMATION = text(
    """
    select f.id::text as id
      from public.formations f
     where f.owner_id = cast(:user_id as uuid)
       and f.status = 'active'
       and f.id <> cast(:formation_id as uuid)
     order by coalesce(f.last_opened_at, f.created_at) desc, f.created_at desc, f.id desc
     limit 1
    """
)

FALLBACK_CURRENT_FORMATION = text(
    """
    update public.profiles
       set current_formation_id = cast(:fallback as uuid)
     where id = cast(:user_id as uuid)
       and current_formation_id = cast(:formation_id as uuid)
    """
)

READ_ACTIVE_FORMATION_IDS = text(
    """
    select f.id::text as id
      from public.formations f
     where f.owner_id = cast(:user_id as uuid)
       and f.status = 'active'
       and f.id <> cast(:formation_id as uuid)
    """
)

SELECT_CURRENT_STATUS = text(
    """
    select f.status::text as status
      from public.formations f
     where f.id = cast(:formation_id as uuid)
       and f.owner_id = cast(:user_id as uuid)
    """
)

SET_CURRENT_FORMATION = text(
    """
    update public.profiles
       set current_formation_id = cast(:formation_id as uuid)
     where id = cast(:user_id as uuid)
    """
)

SET_CURRENT_FORMATION_IF_NULL = text(
    """
    update public.profiles
       set current_formation_id = cast(:formation_id as uuid)
     where id = cast(:user_id as uuid)
       and current_formation_id is null
    """
)


async def read_owner_account(tx: Tx, user_id: str) -> Mapping[str, Any] | None:
    """The tone and the course language of the owner, or `None` when the profile is missing."""
    result = await tx.conn.execute(READ_OWNER_ACCOUNTS, {"user_id": user_id})
    found = result.mappings().all()
    return None if not found else row_of(found[0])


async def read_used_accents(tx: Tx, user_id: str) -> list[str]:
    """`nextAccent`: the accents already taken by a live formation of the owner."""
    result = await tx.conn.execute(READ_USED_ACCENTS, {"user_id": user_id})
    return [str(row_of(item)["accent_color"]) for item in result.mappings().all()]


async def insert_formation(
    tx: Tx,
    user_id: str,
    *,
    title: str,
    course_language: str,
    monogram: str,
    accent: str,
    profile: Mapping[str, Any],
    now: datetime,
) -> CadrageFormationRow | None:
    """Creation of the formation, before the tutor is called (SPEC-604 EF-4)."""
    result = await tx.conn.execute(
        INSERT_FORMATION,
        {
            "user_id": user_id,
            "title": title,
            "course_language": course_language,
            "monogram": monogram,
            "accent": accent,
            "profile": json.dumps(profile, ensure_ascii=False),
            "now": now,
        },
    )
    found = result.mappings().all()
    return None if not found else _cadrage_formation(row_of(found[0]))


async def list_owned_formations(tx: Tx, user_id: str) -> list[Mapping[str, Any]]:
    """`listFormations`: the owner's formations, most recent first."""
    result = await tx.conn.execute(LIST_OWNED_FORMATIONS, {"user_id": user_id})
    return [row_of(item) for item in result.mappings().all()]


async def update_formation_title(
    tx: Tx, user_id: str, formation_id: str, title: str, monogram: str, now: datetime
) -> Mapping[str, Any] | None:
    """`updateFormationTitle`: the monogram is derived from the new title (ADR-0162)."""
    result = await tx.conn.execute(
        UPDATE_FORMATION_TITLE,
        {
            "user_id": user_id,
            "formation_id": formation_id,
            "title": title,
            "monogram": monogram,
            "now": now,
        },
    )
    found = result.mappings().all()
    return None if not found else row_of(found[0])


async def lock_formation_transitions(tx: Tx, user_id: str) -> None:
    """ET-3 - serialises every transition of one learner (pause, resume, archive, current)."""
    await tx.conn.execute(LOCK_FORMATION_TRANSITIONS, {"user_id": user_id})


async def read_profile_for_update(tx: Tx, user_id: str) -> Mapping[str, Any] | None:
    """The profile row the transitions read (current formation, time zone)."""
    result = await tx.conn.execute(READ_PROFILE_FOR_UPDATE, {"user_id": user_id})
    found = result.mappings().all()
    return None if not found else row_of(found[0])


async def read_formation_for_update(tx: Tx, user_id: str, formation_id: str) -> Mapping[str, Any] | None:
    """ET-1, CL-1 - owner-scoped `for update` read; a foreign formation is `NOT_FOUND`."""
    result = await tx.conn.execute(
        READ_FORMATION_FOR_UPDATE, {"user_id": user_id, "formation_id": formation_id}
    )
    found = result.mappings().all()
    return None if not found else row_of(found[0])


async def read_managed_rows(tx: Tx, user_id: str) -> list[Mapping[str, Any]]:
    """The active and paused formations of the owner, with their progress counters."""
    result = await tx.conn.execute(READ_MANAGED_ROWS, {"user_id": user_id})
    return [row_of(item) for item in result.mappings().all()]


async def pause_formation(tx: Tx, user_id: str, formation_id: str, now: datetime) -> None:
    """One transition of the pause."""
    await tx.conn.execute(PAUSE_FORMATION, {"user_id": user_id, "formation_id": formation_id, "now": now})


async def archive_formation(tx: Tx, user_id: str, formation_id: str, now: datetime) -> None:
    """One transition of the archive."""
    await tx.conn.execute(ARCHIVE_FORMATION, {"user_id": user_id, "formation_id": formation_id, "now": now})


async def resume_formation(tx: Tx, user_id: str, formation_id: str, now: datetime) -> None:
    """One transition of the resume: the formation becomes active and loses its pause date."""
    await tx.conn.execute(RESUME_FORMATION, {"user_id": user_id, "formation_id": formation_id, "now": now})


async def cancel_future_slots(tx: Tx, user_id: str, formation_id: str, now: datetime) -> None:
    """ADR-0016 - a pause freezes every future planned slot; started slots stay readable."""
    await tx.conn.execute(CANCEL_FUTURE_SLOTS, {"user_id": user_id, "formation_id": formation_id, "now": now})


async def fallback_current_formation(tx: Tx, user_id: str, formation_id: str) -> None:
    """CL-5 - the current formation becomes the last active one consulted, or null."""
    result = await tx.conn.execute(
        READ_FALLBACK_FORMATION, {"user_id": user_id, "formation_id": formation_id}
    )
    found = result.mappings().all()
    fallback = None if not found else str(row_of(found[0])["id"])
    await tx.conn.execute(
        FALLBACK_CURRENT_FORMATION,
        {"user_id": user_id, "formation_id": formation_id, "fallback": fallback},
    )


async def read_active_formation_ids(tx: Tx, user_id: str, formation_id: str) -> list[str]:
    """The other active formations of the owner, the ones the limit counts."""
    result = await tx.conn.execute(
        READ_ACTIVE_FORMATION_IDS, {"user_id": user_id, "formation_id": formation_id}
    )
    return [str(row_of(item)["id"]) for item in result.mappings().all()]


async def read_formation_status(tx: Tx, user_id: str, formation_id: str) -> str | None:
    """The status of an owner-scoped formation, or `None` when it is missing."""
    result = await tx.conn.execute(SELECT_CURRENT_STATUS, {"user_id": user_id, "formation_id": formation_id})
    found = result.mappings().all()
    return None if not found else str(row_of(found[0])["status"])


async def set_current_formation(tx: Tx, user_id: str, formation_id: str) -> None:
    """ADR-0075 - the current formation is stored server-side, never in the browser."""
    await tx.conn.execute(SET_CURRENT_FORMATION, {"user_id": user_id, "formation_id": formation_id})


async def set_current_formation_if_null(tx: Tx, user_id: str, formation_id: str) -> None:
    """A resume fills the current formation only when the learner has none (SPEC-618 EF-2)."""
    await tx.conn.execute(SET_CURRENT_FORMATION_IF_NULL, {"user_id": user_id, "formation_id": formation_id})


# --------------------------------------------------------------------------------------------------
# programme: proposal state, generation, adjustment, import and validation (programme/*.ts)
# --------------------------------------------------------------------------------------------------

READ_PROGRAMME_FORMATION_OWNER = text(
    """
    select id::text as id,
           title,
           description,
           status::text as status,
           objectives::text[] as objectives,
           cadrage_profile,
           volume_hours,
           start_date::text as start_date,
           end_date::text as end_date,
           default_threshold,
           course_language::text as course_language,
           creation_mode::text as creation_mode
      from public.formations
     where id = cast(:formation_id as uuid)
       and owner_id = cast(:user_id as uuid)
     limit 1
    """
)

READ_PROGRAMME_FORMATION_MEMBER = text(
    """
    select id::text as id,
           title,
           description,
           status::text as status,
           objectives::text[] as objectives,
           cadrage_profile,
           volume_hours,
           start_date::text as start_date,
           end_date::text as end_date,
           default_threshold,
           course_language::text as course_language,
           creation_mode::text as creation_mode
      from public.formations
     where id = cast(:formation_id as uuid)
     limit 1
    """
)

READ_PROGRAMME_PROFILE = text(
    """
    select tutor_tone::text as tutor_tone, course_language::text as course_language, timezone
      from public.profiles
     where id = cast(:user_id as uuid)
     limit 1
    """
)

LIST_PROPOSALS = text(
    """
    select id::text as id,
           version,
           source::text as source,
           description,
           volume_hours,
           summary,
           payload,
           created_at,
           import_id::text as import_id,
           change_request_id::text as change_request_id
      from public.programme_proposals
     where formation_id = cast(:formation_id as uuid)
     order by version desc
    """
)

READ_PROPOSAL = text(
    """
    select id::text as id,
           version,
           source::text as source,
           description,
           volume_hours,
           summary,
           payload,
           created_at,
           import_id::text as import_id,
           change_request_id::text as change_request_id
      from public.programme_proposals
     where formation_id = cast(:formation_id as uuid)
       and version = :version
     limit 1
    """
)

CURRENT_PROPOSAL_VERSION = text(
    """
    select coalesce(max(version), 0) as version
      from public.programme_proposals
     where formation_id = cast(:formation_id as uuid)
    """
)

COUNT_ACTIVE_FORMATIONS = text(
    """
    select count(distinct f.id)::int as count
      from public.formations f
      left join public.groups g on g.formation_id = f.id
      left join public.group_members gm
        on gm.group_id = g.id
       and gm.user_id = cast(:user_id as uuid)
       and gm.member_status = 'active'
       and gm.left_at is null
     where f.status = 'active'
       and f.id <> cast(:formation_id as uuid)
       and (f.owner_id = cast(:user_id as uuid) or gm.user_id is not null)
    """
)

READ_ACTIVE_MODULES = text(
    """
    select id::text as id,
           position,
           title,
           objectives::text[] as objectives,
           planned_start::text as planned_start,
           planned_end::text as planned_end,
           threshold,
           status::text as status
      from public.modules
     where formation_id = cast(:formation_id as uuid)
     order by position asc
    """
)

READ_ACTIVE_CHAPTERS = text(
    """
    select c.id::text as id, c.module_id::text as module_id, c.position, c.title
      from public.chapters c
      join public.modules m on m.id = c.module_id
     where m.formation_id = cast(:formation_id as uuid)
     order by c.position asc
    """
)

READ_ACTIVE_NOTIONS = text(
    """
    select n.id::text as id,
           n.chapter_id::text as chapter_id,
           n.label,
           n.short_definition
      from public.notions n
     where n.formation_id = cast(:formation_id as uuid)
     order by n.position asc
    """
)

PROGRAMME_LOCK = text(
    """
    select pg_advisory_xact_lock(hashtextextended('programme:' || cast(:formation_id as text), 0))
    """
)

INSERT_PROPOSAL = text(
    """
    insert into public.programme_proposals (
      formation_id, user_id, version, source, description, volume_hours, summary, payload,
      import_id, change_request_id, created_at
    )
    values (
      cast(:formation_id as uuid),
      cast(:user_id as uuid),
      :version,
      cast(:source as public.programme_source),
      :description,
      :volume_hours,
      :summary,
      cast(:payload as jsonb),
      cast(:import_id as uuid),
      cast(:change_request_id as uuid),
      cast(:now as timestamptz)
    )
    """
)

UPDATE_FORMATION_FROM_PROPOSAL = text(
    """
    update public.formations
       set status = cast(:status as public.formation_status),
           description = coalesce(description, :description),
           volume_hours = coalesce(:volume_hours, volume_hours),
           start_date = cast(:start_date as date),
           end_date = cast(:end_date as date),
           default_threshold = :threshold,
           updated_at = cast(:now as timestamptz)
     where id = cast(:formation_id as uuid)
       and owner_id = cast(:user_id as uuid)
    """
)

INSERT_CHANGE_REQUEST = text(
    """
    insert into public.programme_change_requests (
      formation_id, user_id, message, status, created_at, updated_at
    )
    values (
      cast(:formation_id as uuid),
      cast(:user_id as uuid),
      :message,
      'queued',
      cast(:now as timestamptz),
      cast(:now as timestamptz)
    )
    returning id::text as id
    """
)

COMPLETE_CHANGE_REQUEST = text(
    """
    update public.programme_change_requests
       set status = 'done',
           result_summary = :summary,
           updated_at = cast(:now as timestamptz)
     where id = cast(:change_request_id as uuid)
       and formation_id = cast(:formation_id as uuid)
    """
)

FAIL_CHANGE_REQUEST = text(
    """
    update public.programme_change_requests
       set status = :status,
           result_summary = :summary,
           updated_at = cast(:now as timestamptz)
     where id = cast(:change_request_id as uuid)
       and user_id = cast(:user_id as uuid)
    """
)

INSERT_IMPORT = text(
    """
    insert into public.programme_imports (
      formation_id, user_id, source_kind, raw_text, original_filename, original_size,
      original_content, status, created_at, updated_at
    )
    values (
      cast(:formation_id as uuid),
      cast(:user_id as uuid),
      cast(:kind as public.import_kind),
      :raw_text,
      :filename,
      :original_size,
      :original_content,
      'running',
      cast(:now as timestamptz),
      cast(:now as timestamptz)
    )
    returning id::text as id
    """
)

COMPLETE_IMPORT = text(
    """
    update public.programme_imports
       set status = 'done',
           parsed = cast(:payload as jsonb),
           error = null,
           updated_at = cast(:now as timestamptz)
     where id = cast(:import_id as uuid)
       and formation_id = cast(:formation_id as uuid)
    """
)

FAIL_IMPORT = text(
    """
    update public.programme_imports
       set status = 'failed',
           error = :error,
           updated_at = cast(:now as timestamptz)
     where id = cast(:import_id as uuid)
       and user_id = cast(:user_id as uuid)
    """
)

INSERT_MODULE = text(
    """
    insert into public.modules (
      formation_id, position, title, objectives, planned_start, planned_end, threshold,
      status, opened_at, created_at, updated_at
    )
    values (
      cast(:formation_id as uuid),
      :position,
      :title,
      cast(:objectives as text[]),
      cast(:planned_start as date),
      cast(:planned_end as date),
      :threshold,
      cast(:status as public.module_status),
      cast(:opened_at as timestamptz),
      cast(:now as timestamptz),
      cast(:now as timestamptz)
    )
    returning id::text as id
    """
)

INSERT_MODULE_PROGRESS = text(
    """
    insert into public.module_progress (user_id, module_id, status, opened_at, updated_at)
    values (
      cast(:user_id as uuid),
      cast(:module_id as uuid),
      cast(:status as public.module_status),
      cast(:opened_at as timestamptz),
      cast(:now as timestamptz)
    )
    """
)

INSERT_CHAPTER = text(
    """
    insert into public.chapters (module_id, formation_id, position, title, created_at, updated_at)
    values (
      cast(:module_id as uuid),
      cast(:formation_id as uuid),
      :position,
      :title,
      cast(:now as timestamptz),
      cast(:now as timestamptz)
    )
    returning id::text as id
    """
)

INSERT_NOTION = text(
    """
    insert into public.notions (
      formation_id, module_id, chapter_id, label, short_definition, position,
      created_by, created_at, updated_at
    )
    values (
      cast(:formation_id as uuid),
      cast(:module_id as uuid),
      cast(:chapter_id as uuid),
      :label,
      :definition,
      :position,
      cast(:created_by as public.actor),
      cast(:now as timestamptz),
      cast(:now as timestamptz)
    )
    """
)

READ_STUDY_PREFERENCE = text(
    """
    select hours_per_day,
           coalesce(array_length(study_days, 1), 5)::int as study_days
      from public.study_preferences
     where user_id = cast(:user_id as uuid)
     limit 1
    """
)

READ_ACTIVE_PROGRAMME_MODULES = text(
    """
    select m.id::text as id,
           m.position,
           m.title,
           m.objectives::text[] as objectives,
           m.planned_start::text as planned_start,
           m.planned_end::text as planned_end,
           m.threshold,
           coalesce(mp.status, m.status)::text as status,
           mp.best_score
      from public.modules m
      left join public.module_progress mp
        on mp.module_id = m.id and mp.user_id = cast(:user_id as uuid)
     where m.formation_id = cast(:formation_id as uuid)
     order by m.position asc
    """
)

READ_ACTIVE_PROGRAMME_CHAPTERS = text(
    """
    select c.id::text as id,
           c.module_id::text as module_id,
           c.position,
           c.title,
           cp.contributions_status::text as contributions_status
      from public.chapters c
      join public.modules m on m.id = c.module_id
      left join public.chapter_progress cp
        on cp.chapter_id = c.id and cp.user_id = cast(:user_id as uuid)
     where m.formation_id = cast(:formation_id as uuid)
     order by m.position asc, c.position asc
    """
)


async def read_programme_formation(
    tx: Tx, user_id: str, formation_id: str, *, access: str = "owner"
) -> Mapping[str, Any] | None:
    """`readFormation` of the programme state: `owner` for writes, `member` for shared reads."""
    statement = READ_PROGRAMME_FORMATION_OWNER if access == "owner" else READ_PROGRAMME_FORMATION_MEMBER
    result = await tx.conn.execute(statement, {"user_id": user_id, "formation_id": formation_id})
    found = result.mappings().all()
    return None if not found else row_of(found[0])


async def read_programme_profile(tx: Tx, user_id: str) -> Mapping[str, Any]:
    """`readProfile`: tone, course language and time zone, with the documented defaults."""
    result = await tx.conn.execute(READ_PROGRAMME_PROFILE, {"user_id": user_id})
    found = result.mappings().all()
    row = None if not found else row_of(found[0])
    return {
        "tone": (row or {}).get("tutor_tone") or "vous",
        "courseLanguage": (row or {}).get("course_language") or "fr",
        "timezone": (row or {}).get("timezone") or "Europe/Paris",
    }


async def list_proposals(tx: Tx, formation_id: str) -> list[Mapping[str, Any]]:
    """`listProposals`: newest version first."""
    result = await tx.conn.execute(LIST_PROPOSALS, {"formation_id": formation_id})
    return [row_of(item) for item in result.mappings().all()]


async def read_proposal(tx: Tx, formation_id: str, version: int) -> Mapping[str, Any] | None:
    """`readProposal`: one version of the proposal stream."""
    result = await tx.conn.execute(READ_PROPOSAL, {"formation_id": formation_id, "version": version})
    found = result.mappings().all()
    return None if not found else row_of(found[0])


async def current_version(tx: Tx, formation_id: str) -> int:
    """`currentVersion`: `max(version)`, or 0 when nothing is proposed yet."""
    result = await tx.conn.execute(CURRENT_PROPOSAL_VERSION, {"formation_id": formation_id})
    found = result.mappings().all()
    return 0 if not found else int(row_of(found[0])["version"])


async def count_active_formations(tx: Tx, user_id: str, formation_id: str) -> int:
    """`activeFormationCount`: owned active formations plus open active memberships."""
    result = await tx.conn.execute(
        COUNT_ACTIVE_FORMATIONS, {"user_id": user_id, "formation_id": formation_id}
    )
    found = result.mappings().all()
    return 0 if not found else int(row_of(found[0])["count"])


async def lock_programme(tx: Tx, formation_id: str) -> None:
    """`programmeLock`: one proposal stream per formation."""
    await tx.conn.execute(PROGRAMME_LOCK, {"formation_id": formation_id})


async def read_active_structure(
    tx: Tx, formation_id: str
) -> tuple[list[Mapping[str, Any]], list[Mapping[str, Any]], list[Mapping[str, Any]]]:
    """`readActiveProgramme`: modules, chapters and notions of the validated structure."""
    modules = await tx.conn.execute(READ_ACTIVE_MODULES, {"formation_id": formation_id})
    chapters = await tx.conn.execute(READ_ACTIVE_CHAPTERS, {"formation_id": formation_id})
    notions = await tx.conn.execute(READ_ACTIVE_NOTIONS, {"formation_id": formation_id})
    return (
        [row_of(item) for item in modules.mappings().all()],
        [row_of(item) for item in chapters.mappings().all()],
        [row_of(item) for item in notions.mappings().all()],
    )


async def insert_proposal(
    tx: Tx,
    user_id: str,
    formation_id: str,
    *,
    version: int,
    source: str,
    payload: Mapping[str, Any],
    import_id: str | None,
    change_request_id: str | None,
    now: datetime,
) -> None:
    """One immutable proposal version, generated or imported."""
    await tx.conn.execute(
        INSERT_PROPOSAL,
        {
            "formation_id": formation_id,
            "user_id": user_id,
            "version": version,
            "source": source,
            "description": payload.get("description"),
            "volume_hours": payload.get("volumeHours"),
            "summary": payload.get("summary"),
            "payload": json.dumps(payload, ensure_ascii=False),
            "import_id": import_id,
            "change_request_id": change_request_id,
            "now": now,
        },
    )


async def update_formation_from_proposal(
    tx: Tx,
    user_id: str,
    formation_id: str,
    *,
    status: str,
    payload: Mapping[str, Any],
    now: datetime,
) -> None:
    """The formation takes the dates, the volume and the threshold of the proposal."""
    modules = payload["modules"]
    first = modules[0]
    last = modules[-1]
    await tx.conn.execute(
        UPDATE_FORMATION_FROM_PROPOSAL,
        {
            "formation_id": formation_id,
            "user_id": user_id,
            "status": status,
            "description": payload.get("description"),
            "volume_hours": payload.get("volumeHours"),
            "start_date": first.get("plannedStart"),
            "end_date": last.get("plannedEnd"),
            "threshold": first.get("threshold") or 80,
            "now": now,
        },
    )


async def insert_change_request(tx: Tx, user_id: str, formation_id: str, message: str, now: datetime) -> str:
    """The adjustment request is stored before the tutor answers (SPEC-605 EF-3)."""
    result = await tx.conn.execute(
        INSERT_CHANGE_REQUEST,
        {"formation_id": formation_id, "user_id": user_id, "message": message, "now": now},
    )
    return str(row_of(result.mappings().all()[0])["id"])


async def complete_change_request(
    tx: Tx, formation_id: str, change_request_id: str, summary: str | None, now: datetime
) -> None:
    """The request ends `done` once the new version is stored."""
    await tx.conn.execute(
        COMPLETE_CHANGE_REQUEST,
        {
            "formation_id": formation_id,
            "change_request_id": change_request_id,
            "summary": summary,
            "now": now,
        },
    )


async def fail_change_request(
    tx: Tx,
    user_id: str,
    change_request_id: str,
    status: str,
    summary: str | None,
    now: datetime,
) -> None:
    """`markChangeRequest`: a failed adjustment keeps the reason, bounded to 4000 characters."""
    await tx.conn.execute(
        FAIL_CHANGE_REQUEST,
        {
            "change_request_id": change_request_id,
            "user_id": user_id,
            "status": status,
            "summary": None if summary is None else summary[:4000],
            "now": now,
        },
    )


async def insert_import(
    tx: Tx,
    user_id: str,
    formation_id: str,
    *,
    kind: str,
    raw_text: str | None,
    filename: str | None,
    original_size: int | None,
    original_content: str | None,
    now: datetime,
) -> str:
    """The original file stays private even when the tutor is unavailable (SPEC-605 CL-5)."""
    result = await tx.conn.execute(
        INSERT_IMPORT,
        {
            "formation_id": formation_id,
            "user_id": user_id,
            "kind": kind,
            "raw_text": raw_text,
            "filename": filename,
            "original_size": original_size,
            "original_content": original_content,
            "now": now,
        },
    )
    return str(row_of(result.mappings().all()[0])["id"])


async def complete_import(
    tx: Tx, formation_id: str, import_id: str, payload: Mapping[str, Any], now: datetime
) -> None:
    """The import ends `done` with its parsed structure."""
    await tx.conn.execute(
        COMPLETE_IMPORT,
        {
            "formation_id": formation_id,
            "import_id": import_id,
            "payload": json.dumps(payload, ensure_ascii=False),
            "now": now,
        },
    )


async def fail_import(tx: Tx, user_id: str, import_id: str, error: str, now: datetime) -> None:
    """`markImportFailed`: the reason is bounded to 2000 characters."""
    await tx.conn.execute(
        FAIL_IMPORT,
        {"import_id": import_id, "user_id": user_id, "error": error[:2000], "now": now},
    )


async def insert_module(
    tx: Tx,
    formation_id: str,
    module: Mapping[str, Any],
    *,
    index: int,
    now: datetime,
) -> str:
    """`validateProposal`: the first module opens, the others stay locked."""
    opened = now if index == 0 else None
    result = await tx.conn.execute(
        INSERT_MODULE,
        {
            "formation_id": formation_id,
            "position": module["position"],
            "title": module["title"],
            "objectives": list(module["objectives"]),
            "planned_start": module["plannedStart"],
            "planned_end": module["plannedEnd"],
            "threshold": module["threshold"],
            "status": "open" if index == 0 else "locked",
            "opened_at": opened,
            "now": now,
        },
    )
    return str(row_of(result.mappings().all()[0])["id"])


async def insert_module_progress(tx: Tx, user_id: str, module_id: str, *, index: int, now: datetime) -> None:
    """The learner's own progression starts with the first module open."""
    await tx.conn.execute(
        INSERT_MODULE_PROGRESS,
        {
            "user_id": user_id,
            "module_id": module_id,
            "status": "open" if index == 0 else "locked",
            "opened_at": now if index == 0 else None,
            "now": now,
        },
    )


async def insert_chapter(
    tx: Tx, formation_id: str, module_id: str, chapter: Mapping[str, Any], now: datetime
) -> str:
    """One chapter of the validated structure."""
    result = await tx.conn.execute(
        INSERT_CHAPTER,
        {
            "module_id": module_id,
            "formation_id": formation_id,
            "position": chapter["position"],
            "title": chapter["title"],
            "now": now,
        },
    )
    return str(row_of(result.mappings().all()[0])["id"])


async def insert_notion(
    tx: Tx,
    formation_id: str,
    module_id: str,
    chapter_id: str,
    notion: Mapping[str, Any],
    *,
    position: int,
    created_by: str,
    now: datetime,
) -> None:
    """One notion of the validated structure."""
    await tx.conn.execute(
        INSERT_NOTION,
        {
            "formation_id": formation_id,
            "module_id": module_id,
            "chapter_id": chapter_id,
            "label": notion["label"],
            "definition": notion["definition"],
            "position": position,
            "created_by": created_by,
            "now": now,
        },
    )


async def read_study_preference(tx: Tx, user_id: str) -> Mapping[str, int]:
    """`readPreference`: hours per day and number of study days, with their defaults."""
    result = await tx.conn.execute(READ_STUDY_PREFERENCE, {"user_id": user_id})
    found = result.mappings().all()
    row = None if not found else row_of(found[0])
    return {
        "hoursPerDay": 2 if row is None else int(row["hours_per_day"]),
        "studyDaysPerWeek": 5 if row is None else int(row["study_days"]),
    }


async def read_active_programme_modules(tx: Tx, user_id: str, formation_id: str) -> list[Mapping[str, Any]]:
    """The modules of an active programme, with the learner's status and best score."""
    result = await tx.conn.execute(
        READ_ACTIVE_PROGRAMME_MODULES, {"user_id": user_id, "formation_id": formation_id}
    )
    return [row_of(item) for item in result.mappings().all()]


async def read_active_programme_chapters(tx: Tx, user_id: str, formation_id: str) -> list[Mapping[str, Any]]:
    """The chapters of an active programme, with the contributions status of the learner."""
    result = await tx.conn.execute(
        READ_ACTIVE_PROGRAMME_CHAPTERS, {"user_id": user_id, "formation_id": formation_id}
    )
    return [row_of(item) for item in result.mappings().all()]


# --------------------------------------------------------------------------------------------------
# shared formations: groups, memberships and invitations (formations-a-plusieurs.ts, db/groups.ts)
# --------------------------------------------------------------------------------------------------

READ_FORMATION_ACCESS = text(
    """
    select f.id::text as id,
           f.title,
           f.status::text as status,
           f.owner_id::text as owner_id,
           f.group_id::text as group_id,
           g.owner_id::text as group_owner_id
      from public.formations f
      left join public.groups g on g.id = f.group_id
     where f.id = cast(:formation_id as uuid)
       and (
         f.owner_id = cast(:user_id as uuid)
         or exists (
           select 1
             from public.group_members gm
            where gm.group_id = f.group_id
              and gm.user_id = cast(:user_id as uuid)
              and gm.left_at is null
         )
       )
     limit 1
    """
)

READ_GROUP_FORMATION = text(
    """
    select f.id::text as id,
           f.title,
           f.status::text as status,
           f.owner_id::text as owner_id,
           f.group_id::text as group_id,
           g.owner_id::text as group_owner_id
      from public.formations f
      join public.groups g on g.id = f.group_id
     where g.id = cast(:group_id as uuid)
     limit 1
    """
)

GET_GROUP = text(
    """
    select id::text as id,
           formation_id::text as formation_id,
           owner_id::text as owner_id,
           invite_code,
           max_members,
           created_at,
           code_rotated_at
      from public.groups
     where id = cast(:group_id as uuid)
    """
)

FIND_GROUP_BY_CODE = text(
    """
    select id::text as id,
           formation_id::text as formation_id,
           owner_id::text as owner_id,
           invite_code,
           max_members,
           created_at,
           code_rotated_at
      from public.groups
     where invite_code = :invite_code
    """
)

GET_MEMBERSHIP = text(
    """
    select group_id::text as group_id,
           user_id::text as user_id,
           role::text as role,
           member_status::text as member_status,
           joined_at,
           left_at
      from public.group_members
     where group_id = cast(:group_id as uuid)
       and user_id = cast(:user_id as uuid)
    """
)

LIST_GROUP_MEMBERS = text(
    """
    select group_id::text as group_id,
           user_id::text as user_id,
           role::text as role,
           member_status::text as member_status,
           joined_at,
           left_at
      from public.group_members
     where group_id = cast(:group_id as uuid)
       and left_at is null
     order by joined_at asc, user_id asc
    """
)

COUNT_GROUP_MEMBERS = text(
    """
    select count(*)::int as count
      from public.group_members
     where group_id = cast(:group_id as uuid) and left_at is null
    """
)

COUNT_GROUP_MEMBERS_SAFE = COUNT_GROUP_MEMBERS

LOCK_GROUP_BY_FORMATION = text(
    """
    select id::text as id, owner_id::text as owner_id, status::text as status
      from public.formations
     where id = cast(:formation_id as uuid)
     for update
    """
)

INSERT_GROUP = text(
    """
    insert into public.groups (formation_id, owner_id, invite_code, max_members, created_at, code_rotated_at)
    values (
      cast(:formation_id as uuid),
      cast(:owner_id as uuid),
      :invite_code,
      :max_members,
      cast(:now as timestamptz),
      cast(:now as timestamptz)
    )
    returning id::text as id,
              formation_id::text as formation_id,
              owner_id::text as owner_id,
              invite_code,
              max_members
    """
)

INSERT_OWNER_MEMBERSHIP = text(
    """
    insert into public.group_members (group_id, user_id, role, member_status, joined_at)
    values (
      cast(:group_id as uuid), cast(:user_id as uuid), 'owner', 'active',
      cast(:now as timestamptz)
    )
    """
)

BACK_REFERENCE_GROUP = text(
    """
    update public.formations set group_id = cast(:group_id as uuid)
     where id = cast(:formation_id as uuid)
    """
)

LOCK_GROUP_BY_CODE = text(
    """
    select id::text as id
      from public.groups
     where invite_code = :invite_code
     for update
    """
)

LOCK_GROUP = text(
    """
    select id::text as id
      from public.groups
     where id = cast(:group_id as uuid)
     for update
    """
)

INSERT_MEMBER = text(
    """
    insert into public.group_members (group_id, user_id, role, member_status, joined_at)
    values (
      cast(:group_id as uuid), cast(:user_id as uuid), 'member', 'active',
      cast(:now as timestamptz)
    )
    returning role::text as role, member_status::text as member_status
    """
)

REACTIVATE_MEMBER = text(
    """
    update public.group_members
       set member_status = 'active',
           left_at = null,
           joined_at = cast(:now as timestamptz)
     where group_id = cast(:group_id as uuid)
       and user_id = cast(:user_id as uuid)
    returning role::text as role, member_status::text as member_status
    """
)

LOCK_GROUP_OWNER = text(
    """
    select owner_id::text as owner_id
      from public.groups
     where id = cast(:group_id as uuid)
     for update
    """
)

UPDATE_INVITE_CODE = text(
    """
    update public.groups
       set invite_code = :invite_code,
           code_rotated_at = cast(:now as timestamptz)
     where id = cast(:group_id as uuid)
    returning id::text as id,
              formation_id::text as formation_id,
              owner_id::text as owner_id,
              invite_code,
              max_members
    """
)

COMPLETE_MEMBER = text(
    """
    update public.group_members
       set member_status = 'completed',
           left_at = cast(:now as timestamptz)
     where group_id = cast(:group_id as uuid)
       and user_id = cast(:user_id as uuid)
       and left_at is null
    returning role::text as role, member_status::text as member_status
    """
)

LIST_GROUP_PROGRESS = text(
    """
    select group_id, user_id, first_name, current_module_position, validated_modules, streak_days
      from public.group_member_progress
     where group_id = cast(:group_id as uuid)
     order by first_name nulls last, user_id
    """
)

COUNT_ACTIVE_FORMATIONS_FUNCTION = text(
    """
    select public.count_active_formations(cast(:user_id as uuid)) as count
    """
)

READ_FORMATION_TITLE = text(
    """
    select title from public.formations where id = cast(:formation_id as uuid)
    """
)

ACCEPTED_FIRST_NAMES = text(
    """
    select p.first_name
      from public.group_members gm
      join public.profiles p on p.id = gm.user_id
     where gm.group_id = cast(:group_id as uuid)
       and gm.left_at is null
       and gm.user_id <> cast(:user_id as uuid)
     order by p.first_name nulls last, gm.user_id
    """
)

INITIALIZE_MEMBER_PROGRESS = text(
    """
    insert into public.module_progress (user_id, module_id, status, opened_at, updated_at)
    select cast(:user_id as uuid),
           m.id,
           case when m.position = 1 then 'open'::public.module_status
                else 'locked'::public.module_status end,
           case when m.position = 1 then cast(:now as timestamptz) else null end,
           cast(:now as timestamptz)
      from public.modules m
     where m.formation_id = cast(:formation_id as uuid)
       and not exists (
         select 1 from public.module_progress mp
          where mp.user_id = cast(:user_id as uuid) and mp.module_id = m.id
       )
    """
)

SET_MEMBER_CURRENT_FORMATION = text(
    """
    update public.profiles
       set current_formation_id = cast(:formation_id as uuid)
     where id = cast(:user_id as uuid)
    """
)

MOVE_CURRENT_FORMATION_IF_GROUP = text(
    """
    update public.profiles
       set current_formation_id = cast(:copy_id as uuid)
     where id = cast(:user_id as uuid)
       and current_formation_id = cast(:group_formation_id as uuid)
    """
)


async def read_formation_access(tx: Tx, user_id: str, formation_id: str) -> Mapping[str, Any] | None:
    """CL-1, ET-1 - the formation is readable only by its owner or an active member."""
    result = await tx.conn.execute(READ_FORMATION_ACCESS, {"user_id": user_id, "formation_id": formation_id})
    found = result.mappings().all()
    return None if not found else row_of(found[0])


async def read_group_formation(tx: Tx, group_id: str) -> Mapping[str, Any] | None:
    """The formation a group shares, with the owner of both rows."""
    result = await tx.conn.execute(READ_GROUP_FORMATION, {"group_id": group_id})
    found = result.mappings().all()
    return None if not found else row_of(found[0])


async def get_group(tx: Tx, group_id: str) -> Mapping[str, Any] | None:
    """`getGroup`: reads a group under the caller's RLS (owner or member only)."""
    result = await tx.conn.execute(GET_GROUP, {"group_id": group_id})
    found = result.mappings().all()
    return None if not found else row_of(found[0])


async def find_group_by_code(tx: Tx, invite_code: str) -> Mapping[str, Any] | None:
    """`findGroupByInviteCode`: the service transaction resolves a code before any membership."""
    result = await tx.conn.execute(FIND_GROUP_BY_CODE, {"invite_code": invite_code})
    found = result.mappings().all()
    return None if not found else row_of(found[0])


async def get_membership(tx: Tx, group_id: str, user_id: str) -> Mapping[str, Any] | None:
    """`getGroupMembership`: one membership, including a past one (`left_at` may be set)."""
    result = await tx.conn.execute(GET_MEMBERSHIP, {"group_id": group_id, "user_id": user_id})
    found = result.mappings().all()
    return None if not found else row_of(found[0])


async def list_group_members(tx: Tx, group_id: str) -> list[Mapping[str, Any]]:
    """`listGroupMembers`: the current members, oldest entry first."""
    result = await tx.conn.execute(LIST_GROUP_MEMBERS, {"group_id": group_id})
    return [row_of(item) for item in result.mappings().all()]


async def count_group_members(tx: Tx, group_id: str) -> int:
    """EF-3, CL-1 - active seats (the owner is a member and counts)."""
    result = await tx.conn.execute(COUNT_GROUP_MEMBERS, {"group_id": group_id})
    found = result.mappings().all()
    return 0 if not found else int(row_of(found[0])["count"])


async def lock_formation_for_group(tx: Tx, formation_id: str) -> Mapping[str, Any] | None:
    """`createGroup`: the formation row is locked before its ownership is checked."""
    result = await tx.conn.execute(LOCK_GROUP_BY_FORMATION, {"formation_id": formation_id})
    found = result.mappings().all()
    return None if not found else row_of(found[0])


async def insert_group(
    tx: Tx,
    formation_id: str,
    owner_id: str,
    *,
    invite_code: str,
    max_members: int,
    now: datetime,
) -> Mapping[str, Any]:
    """One group row; the unique constraint on the code is retried by the caller."""
    result = await tx.conn.execute(
        INSERT_GROUP,
        {
            "formation_id": formation_id,
            "owner_id": owner_id,
            "invite_code": invite_code,
            "max_members": max_members,
            "now": now,
        },
    )
    return row_of(result.mappings().all()[0])


async def insert_owner_membership(tx: Tx, group_id: str, user_id: str, now: datetime) -> None:
    """The owner is a member and counts against the ten seats."""
    await tx.conn.execute(INSERT_OWNER_MEMBERSHIP, {"group_id": group_id, "user_id": user_id, "now": now})


async def back_reference_group(tx: Tx, formation_id: str, group_id: str) -> None:
    """`formations.group_id` is the back reference the group page reads."""
    await tx.conn.execute(BACK_REFERENCE_GROUP, {"formation_id": formation_id, "group_id": group_id})


async def lock_group_by_code(tx: Tx, invite_code: str) -> str | None:
    """`joinGroup`: the group row is locked before the seat count."""
    result = await tx.conn.execute(LOCK_GROUP_BY_CODE, {"invite_code": invite_code})
    found = result.mappings().all()
    return None if not found else str(row_of(found[0])["id"])


async def lock_group(tx: Tx, group_id: str) -> bool:
    """`leaveGroup`: the group row is locked for the whole exit."""
    result = await tx.conn.execute(LOCK_GROUP, {"group_id": group_id})
    return len(result.mappings().all()) > 0


async def insert_member(tx: Tx, group_id: str, user_id: str, now: datetime) -> Mapping[str, Any]:
    """A new membership consumes a seat."""
    result = await tx.conn.execute(INSERT_MEMBER, {"group_id": group_id, "user_id": user_id, "now": now})
    return row_of(result.mappings().all()[0])


async def reactivate_member(tx: Tx, group_id: str, user_id: str, now: datetime) -> Mapping[str, Any] | None:
    """A former member who rejoins consumes a seat again."""
    result = await tx.conn.execute(REACTIVATE_MEMBER, {"group_id": group_id, "user_id": user_id, "now": now})
    found = result.mappings().all()
    return None if not found else row_of(found[0])


async def lock_group_owner(tx: Tx, group_id: str) -> str | None:
    """`rotateInviteCode`: the owner is checked under the row lock."""
    result = await tx.conn.execute(LOCK_GROUP_OWNER, {"group_id": group_id})
    found = result.mappings().all()
    return None if not found else str(row_of(found[0])["owner_id"])


async def update_invite_code(tx: Tx, group_id: str, invite_code: str, now: datetime) -> Mapping[str, Any]:
    """The previous code stops working immediately."""
    result = await tx.conn.execute(
        UPDATE_INVITE_CODE, {"group_id": group_id, "invite_code": invite_code, "now": now}
    )
    return row_of(result.mappings().all()[0])


async def complete_member(tx: Tx, group_id: str, user_id: str, now: datetime) -> Mapping[str, Any] | None:
    """`removeGroupMember` and `leaveGroup` close the membership the same way."""
    result = await tx.conn.execute(COMPLETE_MEMBER, {"group_id": group_id, "user_id": user_id, "now": now})
    found = result.mappings().all()
    return None if not found else row_of(found[0])


async def list_group_progress(tx: Tx, group_id: str) -> list[Mapping[str, Any]]:
    """EF-4, ET-3 - the security-definer view restricts rows to the caller's groups."""
    result = await tx.conn.execute(LIST_GROUP_PROGRESS, {"group_id": group_id})
    return [row_of(item) for item in result.mappings().all()]


async def count_active_formations_function(tx: Tx, user_id: str) -> int:
    """`countActiveFormations`: the SQL function counts owned and shared formations once."""
    result = await tx.conn.execute(COUNT_ACTIVE_FORMATIONS_FUNCTION, {"user_id": user_id})
    found = result.mappings().all()
    return 0 if not found else int(row_of(found[0])["count"])


async def read_formation_title(tx: Tx, formation_id: str) -> str | None:
    """The title a group page or an invitation preview shows."""
    result = await tx.conn.execute(READ_FORMATION_TITLE, {"formation_id": formation_id})
    found = result.mappings().all()
    return None if not found else str(row_of(found[0])["title"])


async def accepted_first_names(tx: Tx, group_id: str, user_id: str) -> list[str]:
    """`acceptedDto`: the first names of the other members, never an address."""
    result = await tx.conn.execute(ACCEPTED_FIRST_NAMES, {"group_id": group_id, "user_id": user_id})
    names = []
    for item in result.mappings().all():
        first_name = row_of(item)["first_name"]
        if isinstance(first_name, str) and first_name.strip() != "":
            names.append(first_name.strip())
    return names


async def initialize_member_progress(tx: Tx, formation_id: str, user_id: str, now: datetime) -> None:
    """EF-2 - a new member gets their own module progression; the programme stays shared."""
    await tx.conn.execute(
        INITIALIZE_MEMBER_PROGRESS,
        {"formation_id": formation_id, "user_id": user_id, "now": now},
    )


async def set_member_current_formation(tx: Tx, user_id: str, formation_id: str) -> None:
    """Joining a group makes its formation the current one."""
    await tx.conn.execute(SET_MEMBER_CURRENT_FORMATION, {"user_id": user_id, "formation_id": formation_id})


async def move_current_formation_if_group(
    tx: Tx, user_id: str, group_formation_id: str, copy_id: str
) -> None:
    """Leaving moves the current formation to the individual copy when it was the shared one."""
    await tx.conn.execute(
        MOVE_CURRENT_FORMATION_IF_GROUP,
        {"user_id": user_id, "group_formation_id": group_formation_id, "copy_id": copy_id},
    )


# --------------------------------------------------------------------------------------------------
# notion map and global search (notion-graph/get-graph.ts, search/index.ts)
# --------------------------------------------------------------------------------------------------

READ_GRAPH_FORMATION = text(
    """
    select f.id::text as id,
           f.title,
           p.timezone
      from public.formations f
      join public.profiles p on p.id = cast(:user_id as uuid)
     where f.id = cast(:formation_id as uuid)
    """
)

READ_GRAPH_MODULES = text(
    """
    select m.id::text as id,
           m.position::int as position,
           m.title,
           m.threshold::int as threshold
      from public.modules m
     where m.formation_id = cast(:formation_id as uuid)
     order by m.position, m.id
    """
)

READ_GRAPH_NOTIONS = text(
    """
    select n.id::text as id,
           n.label,
           n.short_definition as definition,
           n.module_id::text as module_id,
           n.chapter_id::text as chapter_id,
           c.position::int as chapter_position,
           n.position::int as notion_position,
           m.position::int as module_position,
           m.title as module_title,
           m.threshold::int as threshold,
           ns.mastery::float8 as mastery,
           ns.gap_nature::text as gap_nature,
           ns.gap_cleared_at,
           section.id::text as section_id,
           section.anchor as section_anchor
      from public.notions n
      join public.modules m on m.id = n.module_id
      join public.chapters c on c.id = n.chapter_id
      left join public.notion_states ns
        on ns.notion_id = n.id and ns.user_id = cast(:user_id as uuid)
      left join lateral (
        select cs.id, cs.anchor
          from public.courses course
          join public.course_sections cs on cs.course_id = course.id
         where course.owner_id = cast(:user_id as uuid)
           and course.module_id = n.module_id
           and course.is_current
           and course.status = 'ready'
           and n.id = any(cs.notion_ids)
         order by cs.position
         limit 1
      ) section on true
     where n.formation_id = cast(:formation_id as uuid)
     order by m.position, c.position, n.position, n.label, n.id
    """
)

READ_GRAPH_LINKS = text(
    """
    select nl.id::text as id,
           nl.from_notion_id::text as from_notion_id,
           nl.to_notion_id::text as to_notion_id,
           nl.kind::text as kind
      from public.notion_links nl
     where nl.formation_id = cast(:formation_id as uuid)
     order by nl.kind, nl.from_notion_id, nl.to_notion_id, nl.id
    """
)

READ_GRAPH_RESOURCES = text(
    """
    select r.id::text as id,
           r.title,
           r.chapter_id::text as chapter_id,
           r.created_at
      from public.resources r
     where r.formation_id = cast(:formation_id as uuid)
       and r.owner_id = cast(:user_id as uuid)
       and r.status = 'ready'
       and r.deleted_at is null
       and r.chapter_id is not null
     order by r.created_at, r.title, r.id
    """
)

SEARCH_USER_CONTENT = text(
    """
    select kind::text as kind, id::text as id, title, snippet, href, rank
      from public.search_user_content(:q, :limit)
    """
)

SEARCH_BODY_NOTIONS = text(
    """
    select id::text as id, short_definition as body
      from public.notions
     where id = any(cast(:ids as uuid[]))
    """
)

SEARCH_BODY_SECTIONS = text(
    """
    select id::text as id, content_md as body
      from public.course_sections
     where id = any(cast(:ids as uuid[]))
    """
)

SEARCH_BODY_FORMATIONS = text(
    """
    select id::text as id, description as body
      from public.formations
     where id = any(cast(:ids as uuid[]))
    """
)


async def read_graph_formation(tx: Tx, user_id: str, formation_id: str) -> Mapping[str, Any] | None:
    """The graph is a 404 for a formation the caller cannot read, never an empty graph."""
    result = await tx.conn.execute(READ_GRAPH_FORMATION, {"user_id": user_id, "formation_id": formation_id})
    found = result.mappings().all()
    return None if not found else row_of(found[0])


async def read_graph_rows(
    tx: Tx, user_id: str, formation_id: str
) -> tuple[
    list[Mapping[str, Any]], list[Mapping[str, Any]], list[Mapping[str, Any]], list[Mapping[str, Any]]
]:
    """The four reads of `readModel`: modules, notions, links and the learner's own sources."""
    modules = await tx.conn.execute(READ_GRAPH_MODULES, {"formation_id": formation_id})
    notions = await tx.conn.execute(READ_GRAPH_NOTIONS, {"user_id": user_id, "formation_id": formation_id})
    links = await tx.conn.execute(READ_GRAPH_LINKS, {"formation_id": formation_id})
    resources = await tx.conn.execute(
        READ_GRAPH_RESOURCES, {"user_id": user_id, "formation_id": formation_id}
    )
    return (
        [row_of(item) for item in modules.mappings().all()],
        [row_of(item) for item in notions.mappings().all()],
        [row_of(item) for item in links.mappings().all()],
        [row_of(item) for item in resources.mappings().all()],
    )


async def search_user_content(tx: Tx, query: str, limit: int) -> list[Mapping[str, Any]]:
    """ET-2 - the private SQL function runs under the caller's JWT; never re-implemented here."""
    result = await tx.conn.execute(SEARCH_USER_CONTENT, {"q": query, "limit": limit})
    return [row_of(item) for item in result.mappings().all()]


async def read_search_bodies(tx: Tx, identities: Mapping[str, list[str]]) -> dict[str, str]:
    """CL-7 - the full text of the shown rows, read again under the same JWT."""
    bodies: dict[str, str] = {}
    for kind, statement in (
        ("notion", SEARCH_BODY_NOTIONS),
        ("chapter", SEARCH_BODY_SECTIONS),
        ("formation", SEARCH_BODY_FORMATIONS),
    ):
        ids = identities.get(kind) or []
        if not ids:
            continue
        result = await tx.conn.execute(statement, {"ids": ids})
        for item in result.mappings().all():
            row = row_of(item)
            body = row["body"]
            if isinstance(body, str):
                bodies[str(row["id"])] = body
    return bodies


# --------------------------------------------------------------------------------------------------
# validation of a proposal: the formation becomes active (programme/validate.ts)
# --------------------------------------------------------------------------------------------------

ACTIVATE_FORMATION = text(
    """
    update public.formations
       set status = 'active',
           description = coalesce(description, :proposal_description),
           volume_hours = coalesce(:proposal_volume_hours, volume_hours),
           start_date = cast(:start_date as date),
           end_date = cast(:end_date as date),
           default_threshold = :threshold,
           paused_at = null,
           updated_at = cast(:now as timestamptz)
     where id = cast(:formation_id as uuid)
       and owner_id = cast(:user_id as uuid)
    """
)


async def activate_formation(
    tx: Tx,
    user_id: str,
    formation_id: str,
    payload: Mapping[str, Any],
    proposal: Mapping[str, Any],
    now: datetime,
) -> None:
    """`validateProposal`: the formation takes the dates of the validated structure."""
    modules = payload["modules"]
    first = modules[0]
    last = modules[-1]
    await tx.conn.execute(
        ACTIVATE_FORMATION,
        {
            "formation_id": formation_id,
            "user_id": user_id,
            "proposal_description": proposal["description"],
            "proposal_volume_hours": proposal["volume_hours"],
            "start_date": first.get("plannedStart"),
            "end_date": last.get("plannedEnd"),
            "threshold": first.get("threshold") or 80,
            "now": now,
        },
    )


# --------------------------------------------------------------------------------------------------
# Simple mode (SPEC-4001): creation, sources, analysis state, generation (EF-1 to EF-12).
# --------------------------------------------------------------------------------------------------

READ_SIMPLE_FORMATION = text(
    """
    select f.id::text as id,
           f.owner_id::text as owner_id,
           f.title,
           f.status::text as status,
           f.creation_mode::text as creation_mode,
           f.simple_motivation,
           f.objectives::text[] as objectives,
           f.volume_hours,
           f.start_date,
           f.end_date,
           sa.status::text as analysis_status,
           sa.steps,
           sa.chapters_found,
           sa.section_summaries,
           sa.error_code,
           sa.error_message,
           sa.diagnostic_status
      from public.formations f
      left join public.simple_analyses sa on sa.formation_id = f.id
     where f.id = cast(:formation_id as uuid)
       and f.owner_id = cast(:user_id as uuid)
     limit 1
    """
)

READ_SIMPLE_ANALYSIS = text(
    """
    select sa.formation_id::text as formation_id,
           sa.owner_id::text as owner_id,
           sa.status::text as status,
           sa.steps,
           sa.chapters_found,
           sa.section_summaries,
           sa.error_code,
           sa.error_message,
           sa.diagnostic_status
      from public.simple_analyses sa
     where sa.formation_id = cast(:formation_id as uuid)
     limit 1
    """
)

LIST_SIMPLE_SOURCES = text(
    """
    select r.id::text as id,
           r.title,
           r.kind::text as kind,
           r.status::text as status,
           r.mime,
           r.size_bytes,
           r.metadata
      from public.resources r
     where r.formation_id = cast(:formation_id as uuid)
       and r.chapter_id is null
       and r.deleted_at is null
     order by r.created_at asc, r.title asc
    """
)

COUNT_SIMPLE_SOURCES = text(
    """
    select count(*)::int as total
      from public.resources r
     where r.formation_id = cast(:formation_id as uuid)
       and r.chapter_id is null
       and r.deleted_at is null
    """
)

INSERT_SIMPLE_FORMATION = text(
    """
    insert into public.formations (
      owner_id, title, objectives, status, creation_mode, simple_motivation,
      course_language, monogram, accent_color
    )
    values (
      cast(:owner as uuid), :title, '{}'::public.formation_objective[],
      'cadrage', 'simple', :motivation, cast(:language as public.course_language),
      :monogram, cast(:accent as public.formation_accent)
    )
    returning id::text as id
    """
)

INSERT_SIMPLE_ANALYSIS = text(
    """
    insert into public.simple_analyses (formation_id, owner_id, status, steps)
    values (cast(:formation as uuid), cast(:owner as uuid), 'collecting', cast(:steps as jsonb))
    on conflict (formation_id) do nothing
    """
)

INSERT_SIMPLE_RESOURCE = text(
    """
    insert into public.resources (
      id, owner_id, formation_id, chapter_id, kind, title, storage_path, url, mime,
      size_bytes, metadata
    )
    values (
      cast(:resource as uuid), cast(:owner as uuid), cast(:formation as uuid), null,
      cast(:kind as public.resource_kind), :title, :path, :url, :mime,
      -- SPEC-4001: a file has no size before its finalization, which measures the received
      -- bytes; a link keeps the declared size.
      case when cast(:path as text) is null then cast(:size as bigint) else null end,
      cast(:metadata as jsonb)
    )
    returning id::text as id
    """
)

UPDATE_ANALYSIS_STATUS = text(
    """
    update public.simple_analyses
       set status = cast(:status as public.simple_status),
           steps = coalesce(cast(:steps as jsonb), steps),
           chapters_found = coalesce(cast(:chapters as jsonb), chapters_found),
           section_summaries = coalesce(cast(:summaries as jsonb), section_summaries),
           error_code = :error_code,
           error_message = :error_message,
           updated_at = cast(:now as timestamptz)
     where formation_id = cast(:formation as uuid)
    """
)

UPDATE_DIAGNOSTIC_STATUS = text(
    """
    update public.simple_analyses
       set diagnostic_status = :status,
           updated_at = cast(:now as timestamptz)
     where formation_id = cast(:formation as uuid)
    """
)

UPDATE_RESOURCE_ROLE = text(
    """
    update public.resources r
       set metadata = jsonb_set(r.metadata, '{role}', to_jsonb(cast(:role as text)), true),
           updated_at = cast(:now as timestamptz)
     where r.id = cast(:resource as uuid)
       and r.owner_id = cast(:user_id as uuid)
       and r.deleted_at is null
    returning r.id::text as id
    """
)

READ_RESOURCE_SCOPE = text(
    """
    select r.id::text as id,
           r.formation_id::text as formation_id,
           r.owner_id::text as owner_id,
           r.kind::text as kind,
           r.metadata,
           f.creation_mode::text as creation_mode,
           sa.status::text as analysis_status,
           sa.diagnostic_status
      from public.resources r
      join public.formations f on f.id = r.formation_id
      left join public.simple_analyses sa on sa.formation_id = r.formation_id
     where r.id = cast(:resource as uuid)
       and r.owner_id = cast(:user_id as uuid)
       and r.deleted_at is null
     limit 1
    """
)

READ_LATEST_PROPOSAL_VERSION = text(
    """
    select coalesce(max(version), 0)::int as version
      from public.programme_proposals
     where formation_id = cast(:formation as uuid)
    """
)

READ_GENERATION_MODULES = text(
    """
    select m.id::text as id,
           m.position,
           m.title,
           m.status::text as status,
           (select c.status::text
              from public.courses c
             where c.module_id = m.id
               and c.is_current
             order by c.version desc
             limit 1) as course_status
      from public.modules m
     where m.formation_id = cast(:formation as uuid)
     order by m.position asc
    """
)

READ_SIMPLE_MODULES = text(
    """
    select m.id::text as id,
           m.position,
           m.title,
           m.status::text as status,
           m.validated_at,
           m.planned_start::text as planned_start,
           m.planned_end::text as planned_end
      from public.modules m
     where m.formation_id = cast(:formation as uuid)
     order by m.position asc
    """
)

READ_FORMATION_OBJECTIVES = text(
    """
    update public.formations
       set objectives = cast(:objectives as public.formation_objective[]),
           end_date = cast(:end_date as date),
           updated_at = cast(:now as timestamptz)
     where id = cast(:formation as uuid)
       and owner_id = cast(:user_id as uuid)
    returning id::text as id, title, status::text as status,
              objectives::text[] as objectives, end_date
    """
)

COUNT_IN_PROGRESS_DIAGNOSTIC = text(
    """
    select at.id::text as id
      from public.attempts at
      join public.activities act on act.id = at.activity_id
     where act.formation_id = cast(:formation as uuid)
       and act.kind = 'diagnostic'
       and at.user_id = cast(:user as uuid)
       and at.status = 'in_progress'
     order by at.started_at desc
     limit 1
    """
)

ABANDON_DIAGNOSTIC = text(
    """
    update public.attempts at
       set status = 'abandoned'
      from public.activities act
     where act.id = at.activity_id
       and act.formation_id = cast(:formation as uuid)
       and act.kind = 'diagnostic'
       and at.user_id = cast(:user as uuid)
       and at.status = 'in_progress'
    """
)


async def read_simple_formation(tx: Tx, user_id: str, formation_id: str) -> Mapping[str, Any] | None:
    """The formation and its analysis row, only for the owner (404 otherwise)."""
    result = await tx.conn.execute(READ_SIMPLE_FORMATION, {"user_id": user_id, "formation_id": formation_id})
    found = result.mappings().all()
    return None if not found else row_of(found[0])


async def read_simple_analysis(tx: Tx, formation_id: str) -> Mapping[str, Any] | None:
    """The analysis row of a formation, read with the service role by the worker."""
    result = await tx.conn.execute(READ_SIMPLE_ANALYSIS, {"formation_id": formation_id})
    found = result.mappings().all()
    return None if not found else row_of(found[0])


async def list_simple_sources(tx: Tx, formation_id: str) -> list[Mapping[str, Any]]:
    """The formation-level documents, oldest first."""
    result = await tx.conn.execute(LIST_SIMPLE_SOURCES, {"formation_id": formation_id})
    return [row_of(row) for row in result.mappings().all()]


async def count_simple_sources(tx: Tx, formation_id: str) -> int:
    """EF-2 - the number of deposited documents of the formation."""
    result = await tx.conn.execute(COUNT_SIMPLE_SOURCES, {"formation_id": formation_id})
    return int(result.mappings().all()[0]["total"])


async def insert_simple_formation(
    tx: Tx,
    user_id: str,
    *,
    title: str,
    motivation: str | None,
    language: str,
    monogram: str,
    accent: str,
) -> str | None:
    """EF-1 - the formation row, `creation_mode = 'simple'` and `status = 'cadrage'`."""
    result = await tx.conn.execute(
        INSERT_SIMPLE_FORMATION,
        {
            "owner": user_id,
            "title": title,
            "motivation": motivation,
            "language": language,
            "monogram": monogram,
            "accent": accent,
        },
    )
    found = result.mappings().all()
    return None if not found else str(found[0]["id"])


async def insert_simple_analysis(tx: Tx, formation_id: str, user_id: str, steps: str) -> None:
    """EF-1 - the single analysis row of the formation, at `collecting`."""
    await tx.conn.execute(
        INSERT_SIMPLE_ANALYSIS,
        {"formation": formation_id, "owner": user_id, "steps": steps},
    )


async def insert_simple_resource(
    tx: Tx,
    *,
    resource_id: str,
    user_id: str,
    formation_id: str,
    kind: str,
    title: str,
    path: str | None,
    url: str | None,
    mime: str,
    # `None` until `resources.finalize`, which measures the object actually received (SPEC-206 ET-5).
    size_bytes: int | None,
    metadata: str,
) -> str | None:
    """EF-2, EF-3 - a formation-level source (`chapter_id` null) with its role in `metadata`."""
    result = await tx.conn.execute(
        INSERT_SIMPLE_RESOURCE,
        {
            "resource": resource_id,
            "owner": user_id,
            "formation": formation_id,
            "kind": kind,
            "title": title,
            "path": path,
            "url": url,
            "mime": mime,
            "size": size_bytes,
            "metadata": metadata,
        },
    )
    found = result.mappings().all()
    return None if not found else str(found[0]["id"])


async def update_analysis_status(
    tx: Tx,
    formation_id: str,
    *,
    status: str,
    steps: str | None,
    chapters: str | None,
    summaries: str | None,
    error_code: str | None,
    error_message: str | None,
    now: str,
) -> None:
    """EF-7, CL-3 - one step of the analysis is persisted before the next one runs."""
    await tx.conn.execute(
        UPDATE_ANALYSIS_STATUS,
        {
            "formation": formation_id,
            "status": status,
            "steps": steps,
            "chapters": chapters,
            "summaries": summaries,
            "error_code": error_code,
            "error_message": error_message,
            "now": now,
        },
    )


async def update_diagnostic_status(tx: Tx, formation_id: str, status: str, now: str) -> None:
    """EF-11 - the diagnostic is proposed only once: done or skipped."""
    await tx.conn.execute(
        UPDATE_DIAGNOSTIC_STATUS,
        {"formation": formation_id, "status": status, "now": now},
    )


async def update_resource_role(tx: Tx, user_id: str, resource_id: str, role: str, now: str) -> bool:
    """EF-4 - the learner corrects the guessed role of one document."""
    result = await tx.conn.execute(
        UPDATE_RESOURCE_ROLE,
        {"user_id": user_id, "resource": resource_id, "role": role, "now": now},
    )
    return len(result.mappings().all()) > 0


async def read_resource_scope(tx: Tx, user_id: str, resource_id: str) -> Mapping[str, Any] | None:
    """The formation, mode and analysis status of one resource of the caller."""
    result = await tx.conn.execute(READ_RESOURCE_SCOPE, {"user_id": user_id, "resource": resource_id})
    found = result.mappings().all()
    return None if not found else row_of(found[0])


async def latest_proposal_version(tx: Tx, formation_id: str) -> int:
    """The version of the proposal the analysis stored, or zero."""
    result = await tx.conn.execute(READ_LATEST_PROPOSAL_VERSION, {"formation": formation_id})
    return int(result.mappings().all()[0]["version"])


async def read_generation_modules(tx: Tx, formation_id: str) -> list[Mapping[str, Any]]:
    """EF-12 - the modules and the current course status of each, in position order."""
    result = await tx.conn.execute(READ_GENERATION_MODULES, {"formation": formation_id})
    return [row_of(row) for row in result.mappings().all()]


async def read_simple_modules(tx: Tx, formation_id: str) -> list[Mapping[str, Any]]:
    """The modules of the active structure, in position order."""
    result = await tx.conn.execute(READ_SIMPLE_MODULES, {"formation": formation_id})
    return [row_of(row) for row in result.mappings().all()]


async def update_formation_deadline(
    tx: Tx,
    user_id: str,
    formation_id: str,
    *,
    objectives: Sequence[str],
    end_date: str | None,
    now: str,
) -> Mapping[str, Any] | None:
    """EF-8 - the objective list and the end of the plan follow the deadline."""
    result = await tx.conn.execute(
        READ_FORMATION_OBJECTIVES,
        {
            "user_id": user_id,
            "formation": formation_id,
            "objectives": list(objectives),
            "end_date": end_date,
            "now": now,
        },
    )
    found = result.mappings().all()
    return None if not found else row_of(found[0])


async def find_in_progress_diagnostic(tx: Tx, user_id: str, formation_id: str) -> str | None:
    """EF-11 - an interrupted diagnostic is resumed instead of duplicated."""
    result = await tx.conn.execute(COUNT_IN_PROGRESS_DIAGNOSTIC, {"user": user_id, "formation": formation_id})
    found = result.mappings().all()
    return None if not found else str(found[0]["id"])


async def abandon_diagnostics(tx: Tx, user_id: str, formation_id: str) -> None:
    """EF-11 - `skip` abandons the in-progress diagnostic attempt."""
    await tx.conn.execute(ABANDON_DIAGNOSTIC, {"user": user_id, "formation": formation_id})


UPDATE_SIMPLE_PROPOSAL_FORMATION = text(
    """
    update public.formations
       set status = cast(:status as public.formation_status),
           title = coalesce(:title, title),
           objectives = cast(:objectives as public.formation_objective[]),
           cadrage_profile = cast(:profile as jsonb),
           description = coalesce(description, :description),
           volume_hours = coalesce(:volume_hours, volume_hours),
           start_date = cast(:start_date as date),
           end_date = cast(:end_date as date),
           default_threshold = :threshold,
           updated_at = cast(:now as timestamptz)
     where id = cast(:formation_id as uuid)
       and owner_id = cast(:user_id as uuid)
    """
)


async def update_simple_proposal_formation(
    tx: Tx,
    user_id: str,
    formation_id: str,
    *,
    status: str,
    payload: Mapping[str, Any],
    profile: Mapping[str, Any],
    title: str | None,
    objectives: Sequence[str],
    now: datetime,
) -> None:
    """EF-7 - the simple-mode proposal fills the deduced scoping profile and the title."""
    modules = payload["modules"]
    await tx.conn.execute(
        UPDATE_SIMPLE_PROPOSAL_FORMATION,
        {
            "formation_id": formation_id,
            "user_id": user_id,
            "status": status,
            "title": title,
            "objectives": list(objectives),
            "profile": json.dumps(profile, ensure_ascii=False),
            "description": payload.get("description"),
            "volume_hours": payload.get("volumeHours"),
            "start_date": modules[0].get("plannedStart"),
            "end_date": modules[-1].get("plannedEnd"),
            "threshold": modules[0].get("threshold") or 80,
            "now": now,
        },
    )


INSERT_CHAPTER_SOURCE = text(
    """
    insert into public.chapter_sources (chapter_id, resource_id, formation_id, page_from, page_to)
    values (
      cast(:chapter as uuid), cast(:resource as uuid), cast(:formation as uuid),
      :page_from, :page_to
    )
    on conflict (chapter_id, resource_id) do nothing
    """
)

INSERT_CHAPTER_PROGRESS_DONE = text(
    """
    insert into public.chapter_progress (
      user_id, chapter_id, contributions_status, done_at, updated_at
    )
    values (
      cast(:user as uuid), cast(:chapter as uuid), 'done',
      cast(:now as timestamptz), cast(:now as timestamptz)
    )
    on conflict (user_id, chapter_id) do update
       set contributions_status = 'done',
           done_at = coalesce(public.chapter_progress.done_at, cast(:now as timestamptz)),
           updated_at = cast(:now as timestamptz)
    """
)


async def insert_chapter_source(
    tx: Tx,
    *,
    chapter_id: str,
    resource_id: str,
    formation_id: str,
    page_from: int | None,
    page_to: int | None,
) -> None:
    """EF-9 - the page range of the document each chapter comes from."""
    await tx.conn.execute(
        INSERT_CHAPTER_SOURCE,
        {
            "chapter": chapter_id,
            "resource": resource_id,
            "formation": formation_id,
            "page_from": page_from,
            "page_to": page_to,
        },
    )


async def mark_chapter_contributions_done(tx: Tx, user_id: str, chapter_id: str, now: str) -> None:
    """EF-9, BR-APP-04 - in simple mode no chapter waits for a declared completion."""
    await tx.conn.execute(INSERT_CHAPTER_PROGRESS_DONE, {"user": user_id, "chapter": chapter_id, "now": now})


async def list_generation_modules(tx: Tx, formation_id: str) -> list[Mapping[str, Any]]:
    """EF-12 - the modules and their current course state, read by the generation job."""
    return await read_generation_modules(tx, formation_id)
