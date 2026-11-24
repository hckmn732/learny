"""SQL of the assessments context (SPEC-2202).

`${x}` placeholders become bound `:x` parameters and nothing here reads the clock.
"""

from collections.abc import Mapping, Sequence
from typing import Any

from sqlalchemy import text

from learny.shared.db.uow import Tx


def row_of(found: Any) -> dict[str, Any]:
    """A plain mapping: SQLAlchemy returns `RowMapping`, which cannot be indexed cheaply."""
    return dict(found)


def _uuid_list(statement: Any) -> Any:
    """One `uuid[]` parameter for the `in (...)` list of the statement."""
    return statement


# --------------------------------------------------------------------------------------------------
# bricks.correct / bricks.report
# --------------------------------------------------------------------------------------------------

READ_FORMATION_OWNER = text(
    """
    select id::text as id
      from public.formations
     where id = cast(:formation_id as uuid) and owner_id = cast(:user_id as uuid)
    """
)

LOCK_BRICK = text(
    """
    select b.id::text as id,
           b.type::text as type,
           b.notion_ids::text[] as notion_ids,
           b.purpose::text as purpose,
           b.status::text as status,
           b.current_version as current_version,
           b.formation_id::text as formation_id,
           v.origin::text as origin
      from public.bricks b
      join public.brick_versions v
        on v.brick_id = b.id and v.version = b.current_version
     where b.id = cast(:brick_id as uuid)
     for update of b
    """
)

INSERT_BRICK = text(
    """
    insert into public.bricks (
      owner_id, formation_id, type, notion_ids, purpose, status, current_version
    ) values (
      cast(:owner_id as uuid),
      cast(:formation_id as uuid),
      :type,
      cast(:notion_ids as uuid[]),
      :purpose,
      'active',
      1
    )
    returning id::text as id
    """
)

READ_PUBLIC_BRICK = text(
    """
    select b.id::text as brick_id,
           v.id::text as version_id,
           b.type::text as type,
           b.notion_ids::text[] as notion_ids,
           v.payload as payload
      from public.brick_versions v
      join public.bricks b on b.id = v.brick_id
     where v.id = cast(:version_id as uuid) and b.owner_id = cast(:user_id as uuid)
    """
)

INSERT_BRICK_VERSION = text(
    """
    insert into public.brick_versions (
      brick_id, version, payload, fingerprint, origin, created_by
    ) values (
      cast(:brick_id as uuid),
      :version,
      cast(:payload as jsonb),
      :fingerprint,
      :origin,
      :created_by
    )
    returning id::text as id
    """
)

UPDATE_BRICK_CURRENT_VERSION = text(
    """
    update public.bricks
       set current_version = :next_version, status = 'active'
     where id = cast(:brick_id as uuid) and current_version = :expected_version
    returning id::text as id
    """
)

RESOLVE_OPEN_REPORTS = text(
    """
    update public.brick_reports
       set status = 'corrected',
           resolution = cast(:resolution as jsonb),
           resolved_at = cast(:now as timestamptz)
     where brick_id = cast(:brick_id as uuid) and status = 'open'
    """
)

READ_OPEN_REPORT = text(
    """
    select id::text as id
      from public.brick_reports
     where user_id = cast(:user_id as uuid)
       and brick_id = cast(:brick_id as uuid)
       and status = 'open'
     order by created_at asc
     limit 1
     for update
    """
)

READ_BRICK_VERSION_ID = text(
    """
    select id::text as id
      from public.brick_versions
     where brick_id = cast(:brick_id as uuid) and version = :version
    """
)

INSERT_BRICK_REPORT = text(
    """
    insert into public.brick_reports (
      user_id, brick_id, brick_version_id, reason, status
    ) values (
      cast(:user_id as uuid),
      cast(:brick_id as uuid),
      cast(:version_id as uuid),
      :reason,
      'open'
    )
    returning id::text as id
    """
)

MARK_BRICK_REPORTED = text(
    """
    update public.bricks set status = 'reported' where id = cast(:brick_id as uuid)
    """
)

# --- reference resolver ----------------------

RESOLVE_EXISTING_NOTION_IDS = _uuid_list(
    text(
        """
        select n.id::text as id
          from public.notions n
          join public.formations f on f.id = n.formation_id
         where n.formation_id = cast(:formation_id as uuid)
           and f.owner_id = cast(:user_id as uuid)
           and n.id = any(cast(:ids as uuid[]))
        """
    )
)

RESOLVE_CHUNKS = _uuid_list(
    text(
        """
        select c.id::text as id, c.resource_id::text as resource_id
          from public.resource_chunks c
          join public.resources r on r.id = c.resource_id
         where c.id = any(cast(:ids as uuid[]))
           and c.owner_id = cast(:user_id as uuid)
           and c.formation_id = cast(:formation_id as uuid)
           and r.deleted_at is null
        """
    )
)

RESOLVE_RESOURCES = _uuid_list(
    text(
        """
        select id::text as id,
               kind::text as kind,
               case when metadata->>'pages' is null then null
                    else (metadata->>'pages')::int end as pages,
               case when metadata->>'durationSec' is null then null
                    else (metadata->>'durationSec')::double precision end as duration_sec,
               deleted_at is not null as deleted
          from public.resources
         where id = any(cast(:ids as uuid[]))
           and owner_id = cast(:user_id as uuid)
           and formation_id = cast(:formation_id as uuid)
        """
    )
)

RESOLVE_EXISTING_BRICK_IDS = _uuid_list(
    text(
        """
        select id::text as id
          from public.bricks
         where id = any(cast(:ids as uuid[]))
           and formation_id = cast(:formation_id as uuid)
           and owner_id = cast(:user_id as uuid)
        """
    )
)


async def read_formation_owner(tx: Tx, user_id: str, formation_id: str) -> Mapping[str, Any] | None:
    """EF-1 - the formation of the learner, or nothing (a foreign formation is a 404)."""
    result = await tx.conn.execute(READ_FORMATION_OWNER, {"formation_id": formation_id, "user_id": user_id})
    found = result.mappings().first()
    return None if found is None else row_of(found)


async def lock_brick(tx: Tx, brick_id: str) -> Mapping[str, Any] | None:
    """The brick and its current version, locked `for update of b`."""
    result = await tx.conn.execute(LOCK_BRICK, {"brick_id": brick_id})
    found = result.mappings().first()
    return None if found is None else row_of(found)


async def insert_brick_version(
    tx: Tx,
    *,
    brick_id: str,
    version: int,
    payload: str,
    fingerprint: str | None,
    origin: str,
    created_by: str,
) -> str | None:
    """One immutable version; `None` when the insert returned no row."""
    result = await tx.conn.execute(
        INSERT_BRICK_VERSION,
        {
            "brick_id": brick_id,
            "version": version,
            "payload": payload,
            "fingerprint": fingerprint,
            "origin": origin,
            "created_by": created_by,
        },
    )
    found = result.mappings().first()
    return None if found is None else str(found["id"])


async def insert_brick(
    tx: Tx,
    *,
    owner_id: str,
    formation_id: str,
    type_name: str,
    notion_ids: Sequence[str],
    purpose: str,
) -> str | None:
    """EF-1 - the brick envelope, version 1 being inserted in the same transaction."""
    result = await tx.conn.execute(
        INSERT_BRICK,
        {
            "owner_id": owner_id,
            "formation_id": formation_id,
            "type": type_name,
            "notion_ids": "{" + ",".join(notion_ids) + "}",
            "purpose": purpose,
        },
    )
    found = result.mappings().first()
    return None if found is None else str(found["id"])


async def read_public_brick(tx: Tx, *, user_id: str, version_id: str) -> Mapping[str, Any] | None:
    """EF-6 - one owned version and the envelope of its brick."""
    result = await tx.conn.execute(READ_PUBLIC_BRICK, {"user_id": user_id, "version_id": version_id})
    found = result.mappings().first()
    return None if found is None else row_of(found)


async def update_brick_current_version(
    tx: Tx, *, brick_id: str, next_version: int, expected_version: int
) -> str | None:
    """The conditional update of EF-2: `None` when the version moved in between (409)."""
    result = await tx.conn.execute(
        UPDATE_BRICK_CURRENT_VERSION,
        {"brick_id": brick_id, "next_version": next_version, "expected_version": expected_version},
    )
    found = result.mappings().first()
    return None if found is None else str(found["id"])


async def resolve_open_reports(tx: Tx, *, brick_id: str, resolution: str, now: str) -> None:
    """EF-5 - every open report of the brick becomes `corrected`."""
    await tx.conn.execute(RESOLVE_OPEN_REPORTS, {"brick_id": brick_id, "resolution": resolution, "now": now})


async def read_open_report(tx: Tx, user_id: str, brick_id: str) -> Mapping[str, Any] | None:
    """EF-3 - the open report of this learner on this brick, locked."""
    result = await tx.conn.execute(READ_OPEN_REPORT, {"user_id": user_id, "brick_id": brick_id})
    found = result.mappings().first()
    return None if found is None else row_of(found)


async def read_brick_version_id(tx: Tx, brick_id: str, version: int) -> str | None:
    """The identifier of one stored version of the brick."""
    result = await tx.conn.execute(READ_BRICK_VERSION_ID, {"brick_id": brick_id, "version": version})
    found = result.mappings().first()
    return None if found is None else str(found["id"])


async def insert_brick_report(
    tx: Tx, *, user_id: str, brick_id: str, version_id: str, reason: str
) -> str | None:
    """EF-3 - the open report; `None` when the insert returned no row."""
    result = await tx.conn.execute(
        INSERT_BRICK_REPORT,
        {"user_id": user_id, "brick_id": brick_id, "version_id": version_id, "reason": reason},
    )
    found = result.mappings().first()
    return None if found is None else str(found["id"])


async def mark_brick_reported(tx: Tx, brick_id: str) -> None:
    """EF-3 - a reported brick leaves every draw until its correction."""
    await tx.conn.execute(MARK_BRICK_REPORTED, {"brick_id": brick_id})


async def resolve_existing_notion_ids(
    tx: Tx, user_id: str, formation_id: str, ids: Sequence[str]
) -> set[str]:
    """BR-BRI-05 - the notions of this learner and formation only."""
    if not ids:
        return set()
    result = await tx.conn.execute(
        RESOLVE_EXISTING_NOTION_IDS,
        {"user_id": user_id, "formation_id": formation_id, "ids": list(ids)},
    )
    return {str(row["id"]) for row in result.mappings().all()}


async def resolve_chunks(
    tx: Tx, user_id: str, formation_id: str, ids: Sequence[str]
) -> dict[str, dict[str, str]]:
    """BR-BRI-05 - the readable resource chunks of this learner and formation."""
    if not ids:
        return {}
    result = await tx.conn.execute(
        RESOLVE_CHUNKS, {"user_id": user_id, "formation_id": formation_id, "ids": list(ids)}
    )
    return {str(row["id"]): {"resourceId": str(row["resource_id"])} for row in result.mappings().all()}


async def resolve_resources(
    tx: Tx, user_id: str, formation_id: str, ids: Sequence[str]
) -> dict[str, dict[str, Any]]:
    """BR-BRI-05 - the resources of this learner and formation, deleted ones included."""
    if not ids:
        return {}
    result = await tx.conn.execute(
        RESOLVE_RESOURCES, {"user_id": user_id, "formation_id": formation_id, "ids": list(ids)}
    )
    rows = result.mappings().all()
    resolved: dict[str, dict[str, Any]] = {}
    for row in rows:
        resolved[str(row["id"])] = {
            "kind": str(row["kind"]),
            "pages": row["pages"],
            "durationSec": row["duration_sec"],
            "deleted": row["deleted"] is True,
        }
    return resolved


async def resolve_existing_brick_ids(tx: Tx, user_id: str, formation_id: str, ids: Sequence[str]) -> set[str]:
    """BR-BRI-05 - the bricks of this learner and formation only."""
    if not ids:
        return set()
    result = await tx.conn.execute(
        RESOLVE_EXISTING_BRICK_IDS,
        {"user_id": user_id, "formation_id": formation_id, "ids": list(ids)},
    )
    return {str(row["id"]) for row in result.mappings().all()}


# --------------------------------------------------------------------------------------------------
# offline.pack
# --------------------------------------------------------------------------------------------------

READ_OFFLINE_PROFILE = text(
    """
    select timezone from public.profiles where id = cast(:user_id as uuid)
    """
)

READ_OFFLINE_FORMATIONS = text(
    """
    select f.id::text as id, f.title
      from public.formations f
     where f.status = 'active'
       and (
         f.owner_id = cast(:user_id as uuid)
         or exists (
           select 1
             from public.groups g
             join public.group_members gm on gm.group_id = g.id
            where g.formation_id = f.id
              and gm.user_id = cast(:user_id as uuid)
              and gm.member_status = 'active'
              and gm.left_at is null
         )
       )
     order by f.created_at asc
     limit 3
    """
)

READ_BRICK_PAYLOADS = text(
    """
    select id::text as id, payload
      from public.brick_versions
     where id = any(cast(:ids as uuid[]))
    """
)

READ_OFFLINE_EXTRA_CARDS = text(
    """
    select distinct on (ns.notion_id)
           ns.notion_id::text as notion_id,
           n.label,
           bv.id::text as version_id,
           bv.payload
      from public.notion_states ns
      join public.notions n on n.id = ns.notion_id
      join public.bricks b on b.formation_id = n.formation_id
        and ns.notion_id = any(b.notion_ids)
        and b.type = 'recall_card'
        and b.status = 'active'
        and b.owner_id = cast(:user_id as uuid)
      join public.brick_versions bv on bv.brick_id = b.id and bv.version = b.current_version
     where ns.user_id = cast(:user_id as uuid)
       and n.formation_id = cast(:formation_id as uuid)
       and not ns.suspended
       and ns.due_at >= cast(:start as timestamptz)
       and ns.due_at <= cast(:end as timestamptz)
     order by ns.notion_id, b.created_at desc
    """
)


async def read_offline_profile(tx: Tx, user_id: str) -> Mapping[str, Any] | None:
    """The learner profile row the pack reads its time zone from."""
    result = await tx.conn.execute(READ_OFFLINE_PROFILE, {"user_id": user_id})
    found = result.mappings().first()
    return None if found is None else row_of(found)


async def read_offline_formations(tx: Tx, user_id: str) -> list[Mapping[str, Any]]:
    """EF-4 - the learner active formations, three at most."""
    result = await tx.conn.execute(READ_OFFLINE_FORMATIONS, {"user_id": user_id})
    return [row_of(row) for row in result.mappings().all()]


async def read_brick_payloads(tx: Tx, version_ids: Sequence[str]) -> dict[str, Any]:
    """ET-5 - the full payload of every version of the session, correct answers included."""
    if not version_ids:
        return {}
    result = await tx.conn.execute(READ_BRICK_PAYLOADS, {"ids": list(dict.fromkeys(version_ids))})
    return {str(row["id"]): row["payload"] for row in result.mappings().all()}


async def read_offline_extra_cards(
    tx: Tx, user_id: str, formation_id: str, start: str, end: str
) -> list[Mapping[str, Any]]:
    """EF-4 - the recall cards of the notions due tomorrow, one per notion."""
    result = await tx.conn.execute(
        READ_OFFLINE_EXTRA_CARDS,
        {"user_id": user_id, "formation_id": formation_id, "start": start, "end": end},
    )
    return [row_of(row) for row in result.mappings().all()]


# --------------------------------------------------------------------------------------------------
# quiz.attempts.get / quiz.answers.save / quiz.answers.check
#
# --------------------------------------------------------------------------------------------------

READ_QUIZ_ATTEMPT = text(
    """
    select at.id::text as id,
           at.activity_id::text as activity_id,
           at.attempt_no,
           at.status::text as status,
           at.started_at,
           at.submitted_at,
           at.score::text as score,
           at.passed,
           at.per_notion,
           act.module_id::text as module_id,
           act.formation_id::text as formation_id,
           act.config,
           act.items,
           act.kind::text as kind
      from public.attempts at
      join public.activities act on act.id = at.activity_id
     where at.id = cast(:attempt_id as uuid)
       and at.user_id = cast(:user_id as uuid)
       and act.kind in ('validation_quiz', 'remediation', 'diagnostic')
     limit 1
    """
)

READ_QUIZ_ANSWERS = text(
    """
    select id::text as id,
           position,
           brick_version_id::text as brick_version_id,
           response,
           is_correct,
           score::text as score,
           max_score::text as max_score,
           time_ms,
           graded_by::text as graded_by,
           feedback,
           chosen_distractor_notion_id::text as chosen_distractor_notion_id
      from public.answers
     where attempt_id = cast(:attempt_id as uuid)
     order by position asc
    """
)

READ_QUIZ_ANSWER = text(
    """
    select id::text as id,
           position,
           brick_version_id::text as brick_version_id,
           response,
           is_correct,
           score::text as score,
           max_score::text as max_score,
           time_ms,
           graded_by::text as graded_by,
           feedback,
           chosen_distractor_notion_id::text as chosen_distractor_notion_id
      from public.answers
     where attempt_id = cast(:attempt_id as uuid) and position = :position
     limit 1
    """
)

LOCK_QUIZ_ANSWER = text("select pg_advisory_xact_lock(hashtextextended(cast(:key as text), 0))")

UPDATE_QUIZ_ANSWER_DRAFT = text(
    """
    update public.answers
       set response = cast(:response as jsonb),
           time_ms = :time_ms,
           answered_at = cast(:now as timestamptz)
     where id = cast(:answer_id as uuid)
    """
)

UPDATE_QUIZ_ANSWER_OPEN_CHECKED = text(
    """
    update public.answers
       set response = cast(:response as jsonb),
           time_ms = :time_ms,
           answered_at = cast(:now as timestamptz),
           max_score = :max_score,
           feedback = '{"checked": true}'::jsonb
     where id = cast(:answer_id as uuid)
    """
)

UPDATE_QUIZ_ANSWER_CHECKED = text(
    """
    update public.answers
       set response = cast(:response as jsonb),
           is_correct = :is_correct,
           score = :score,
           max_score = :max_score,
           time_ms = :time_ms,
           graded_by = 'code',
           feedback = cast(:feedback as jsonb),
           chosen_distractor_notion_id = cast(:chosen_distractor_notion_id as uuid),
           answered_at = cast(:now as timestamptz)
     where id = cast(:answer_id as uuid)
    """
)


async def read_quiz_attempt(tx: Tx, user_id: str, attempt_id: str) -> Mapping[str, Any] | None:
    """`readAttemptRow`: the attempt of this learner and its activity, or nothing (404)."""
    result = await tx.conn.execute(READ_QUIZ_ATTEMPT, {"user_id": user_id, "attempt_id": attempt_id})
    found = result.mappings().first()
    return None if found is None else row_of(found)


async def read_quiz_answers(tx: Tx, attempt_id: str) -> list[Mapping[str, Any]]:
    """`readAnswers`: every answer of the attempt, in position order."""
    result = await tx.conn.execute(READ_QUIZ_ANSWERS, {"attempt_id": attempt_id})
    return [row_of(row) for row in result.mappings().all()]


async def read_quiz_answer(tx: Tx, attempt_id: str, position: int) -> Mapping[str, Any] | None:
    """`readAnswer`: the answer stored at one position of the attempt."""
    result = await tx.conn.execute(READ_QUIZ_ANSWER, {"attempt_id": attempt_id, "position": position})
    found = result.mappings().first()
    return None if found is None else row_of(found)


async def lock_quiz_answer(tx: Tx, attempt_id: str, position: int) -> None:
    """`pg_advisory_xact_lock(hashtextextended('quiz-answer:<id>:<pos>', 0))` of the service."""
    await tx.conn.execute(LOCK_QUIZ_ANSWER, {"key": f"quiz-answer:{attempt_id}:{position}"})


async def update_quiz_answer_draft(tx: Tx, *, answer_id: str, response: str, time_ms: int, now: str) -> None:
    """`saveDraft`: stores the draft response and its elapsed time."""
    await tx.conn.execute(
        UPDATE_QUIZ_ANSWER_DRAFT,
        {"answer_id": answer_id, "response": response, "time_ms": time_ms, "now": now},
    )


async def update_quiz_answer_open_checked(
    tx: Tx, *, answer_id: str, response: str, time_ms: int, max_score: float, now: str
) -> None:
    """`checkAnswer` on an open question: recorded, waiting for the tutor."""
    await tx.conn.execute(
        UPDATE_QUIZ_ANSWER_OPEN_CHECKED,
        {
            "answer_id": answer_id,
            "response": response,
            "time_ms": time_ms,
            "max_score": max_score,
            "now": now,
        },
    )


async def update_quiz_answer_checked(
    tx: Tx,
    *,
    answer_id: str,
    response: str,
    is_correct: bool,
    score: float,
    max_score: float,
    time_ms: int,
    feedback: str,
    chosen_distractor_notion_id: str | None,
    now: str,
) -> None:
    """`checkAnswer` on a closed question: code correction and its feedback."""
    await tx.conn.execute(
        UPDATE_QUIZ_ANSWER_CHECKED,
        {
            "answer_id": answer_id,
            "response": response,
            "is_correct": is_correct,
            "score": score,
            "max_score": max_score,
            "time_ms": time_ms,
            "feedback": feedback,
            "chosen_distractor_notion_id": chosen_distractor_notion_id,
            "now": now,
        },
    )


# --------------------------------------------------------------------------------------------------
# exam.answers.save / exam.questions.mark
#
# --------------------------------------------------------------------------------------------------

READ_EXAM_ATTEMPT = text(
    """
    select at.id::text as id,
           at.activity_id::text as activity_id,
           at.attempt_no,
           at.status::text as status,
           at.started_at,
           at.deadline_at,
           at.submitted_at,
           at.duration_ms,
           at.score::text as score,
           at.passed,
           at.review_feedback,
           act.formation_id::text as formation_id,
           act.config,
           act.items
      from public.attempts at
      join public.activities act on act.id = at.activity_id
     where at.id = cast(:attempt_id as uuid)
       and at.user_id = cast(:user_id as uuid)
       and act.kind = 'mock_exam'
     limit 1
    """
)

LOCK_EXAM_ATTEMPT = text(
    """
    select at.id::text as id,
           at.activity_id::text as activity_id,
           at.attempt_no,
           at.status::text as status,
           at.started_at,
           at.deadline_at,
           at.submitted_at,
           at.duration_ms,
           at.score::text as score,
           at.passed,
           at.review_feedback,
           act.formation_id::text as formation_id,
           act.config,
           act.items
      from public.attempts at
      join public.activities act on act.id = at.activity_id
     where at.id = cast(:attempt_id as uuid)
       and at.user_id = cast(:user_id as uuid)
       and act.kind = 'mock_exam'
     limit 1
     for update of at
    """
)

UPDATE_EXAM_ANSWER = text(
    """
    update public.answers
       set response = cast(:response as jsonb),
           time_ms = :time_ms,
           answered_at = cast(:now as timestamptz)
     where attempt_id = cast(:attempt_id as uuid) and position = :position
    """
)

UPDATE_EXAM_MARKED_POSITIONS = text(
    """
    update public.attempts
       set review_feedback = jsonb_set(
             coalesce(review_feedback, '{}'::jsonb),
             '{markedPositions}',
             cast(:positions as jsonb),
             true
           )
     where id = cast(:attempt_id as uuid)
    """
)


async def read_exam_attempt(
    tx: Tx, user_id: str, attempt_id: str, *, lock: bool = False
) -> Mapping[str, Any] | None:
    """`readAttempt`: the exam attempt of this learner, locked `for update of at` on demand."""
    statement = LOCK_EXAM_ATTEMPT if lock else READ_EXAM_ATTEMPT
    result = await tx.conn.execute(statement, {"user_id": user_id, "attempt_id": attempt_id})
    found = result.mappings().first()
    return None if found is None else row_of(found)


async def update_exam_answer(
    tx: Tx, *, attempt_id: str, position: int, response: str, time_ms: int, now: str
) -> None:
    """EF-2 - writes the answer of one position before the deadline."""
    await tx.conn.execute(
        UPDATE_EXAM_ANSWER,
        {
            "attempt_id": attempt_id,
            "position": position,
            "response": response,
            "time_ms": time_ms,
            "now": now,
        },
    )


async def update_exam_marked_positions(tx: Tx, attempt_id: str, positions: str) -> None:
    """BR-PRA-03 - the marked positions survive a reload."""
    await tx.conn.execute(UPDATE_EXAM_MARKED_POSITIONS, {"attempt_id": attempt_id, "positions": positions})


# --------------------------------------------------------------------------------------------------
# exam.intro / exam.format.confirm
#
# --------------------------------------------------------------------------------------------------

READ_EXAM_FORMATION = text(
    """
    select f.id::text as id,
           f.title,
           f.objectives::text[] as objectives,
           f.exam_format
      from public.formations f
     where f.id = cast(:formation_id as uuid)
       and (
         f.owner_id = cast(:user_id as uuid)
         or exists (
           select 1
             from public.groups g
             join public.group_members gm on gm.group_id = g.id
            where g.formation_id = f.id
              and gm.user_id = cast(:user_id as uuid)
              and gm.member_status = 'active'
         )
       )
     limit 1
    """
)

READ_EXAM_GUIDE = text(
    """
    select id::text as id, metadata, content_text
      from public.resources
     where formation_id = cast(:formation_id as uuid)
       and kind = 'exam_guide'
       and deleted_at is null
       and status in ('ready', 'processing')
     order by created_at asc, id asc
     limit 1
    """
)

READ_EXAM_MODULES = text(
    """
    select m.id::text as module_id,
           m.position,
           m.title as label,
           coalesce(mp.status, m.status)::text as status,
           count(distinct n.id)::int as notion_count,
           count(distinct ns.notion_id) filter (where ns.first_seen_at is not null)::int as seen_count
      from public.modules m
      left join public.module_progress mp
        on mp.module_id = m.id and mp.user_id = cast(:user_id as uuid)
      left join public.chapters c on c.module_id = m.id
      left join public.notions n on n.chapter_id = c.id
      left join public.notion_states ns
        on ns.notion_id = n.id and ns.user_id = cast(:user_id as uuid)
     where m.formation_id = cast(:formation_id as uuid)
     group by m.id, m.position, m.title, m.status, mp.status
     order by m.position asc
    """
)

READ_EXAM_NEXT_SLOTS = text(
    """
    select starts_at, title
      from public.schedule_slots
     where user_id = cast(:user_id as uuid)
       and formation_id = cast(:formation_id as uuid)
       and kind = 'mock_exam'
       and status = 'planned'
       and starts_at >= cast(:now as timestamptz)
     order by starts_at asc
     limit 2
    """
)

READ_EXAM_LAST_ATTEMPT = text(
    """
    select at.id::text as id, at.status::text as status, at.score::text as score
      from public.attempts at
      join public.activities act on act.id = at.activity_id
     where at.user_id = cast(:user_id as uuid)
       and act.formation_id = cast(:formation_id as uuid)
       and act.kind = 'mock_exam'
     order by at.created_at desc, at.id desc
     limit 1
    """
)

UPDATE_EXAM_FORMAT = text(
    """
    update public.formations
       set exam_format = cast(:format as jsonb),
           updated_at = cast(:now as timestamptz)
     where id = cast(:formation_id as uuid)
    """
)

LOCK_MOCK_EXAM_SLOTS = text("select pg_advisory_xact_lock(hashtextextended(:key, 0))")

READ_MOCK_EXAM_FORMATION = text(
    """
    select f.id::text as id,
           f.title,
           f.status::text as status,
           f.end_date::text as end_date,
           f.objectives::text[] as objectives,
           f.exam_format,
           p.timezone
      from public.formations f
      join public.profiles p on p.id = f.owner_id
     where f.id = cast(:formation_id as uuid)
       and (
         f.owner_id = cast(:user_id as uuid)
         or exists (
           select 1
             from public.groups g
             join public.group_members gm on gm.group_id = g.id
            where g.formation_id = f.id
              and gm.user_id = cast(:user_id as uuid)
              and gm.member_status = 'active'
         )
       )
     limit 1
    """
)

READ_MOCK_EXAM_MODULES = text(
    """
    select id::text as id, position, title, planned_end::text as planned_end
      from public.modules
     where formation_id = cast(:formation_id as uuid)
     order by position asc
    """
)

READ_MOCK_EXAM_SLOT = text(
    """
    select id::text as id
      from public.schedule_slots
     where user_id = cast(:user_id as uuid)
       and planner_key = :planner_key
       and status = 'planned'
     limit 1
    """
)

INSERT_MOCK_EXAM_SLOT = text(
    """
    insert into public.schedule_slots (
      user_id, formation_id, module_id, kind, title, starts_at, ends_at,
      status, created_by, planner_key
    ) values (
      cast(:user_id as uuid), cast(:formation_id as uuid), null, 'mock_exam', :title,
      cast(:starts_at as timestamptz), cast(:ends_at as timestamptz),
      'planned', 'planner', :planner_key
    )
    returning id::text as id
    """
)

UPDATE_MOCK_EXAM_SLOT = text(
    """
    update public.schedule_slots
       set title = :title,
           starts_at = cast(:starts_at as timestamptz),
           ends_at = cast(:ends_at as timestamptz),
           updated_at = cast(:now as timestamptz)
     where id = cast(:slot_id as uuid)
       and status = 'planned'
       and created_by <> 'learner'
    """
)

READ_SLOT_TIMES = text(
    """
    select starts_at, ends_at from public.schedule_slots where id = cast(:slot_id as uuid)
    """
)


async def read_exam_formation(tx: Tx, user_id: str, formation_id: str) -> Mapping[str, Any] | None:
    """The formation of the learner (owner or active member), or nothing (404)."""
    result = await tx.conn.execute(READ_EXAM_FORMATION, {"formation_id": formation_id, "user_id": user_id})
    found = result.mappings().first()
    return None if found is None else row_of(found)


async def read_exam_guide(tx: Tx, formation_id: str) -> Mapping[str, Any] | None:
    """EF-5 - the exam guide the format is extracted from, when one exists."""
    result = await tx.conn.execute(READ_EXAM_GUIDE, {"formation_id": formation_id})
    found = result.mappings().first()
    return None if found is None else row_of(found)


async def read_exam_modules(tx: Tx, user_id: str, formation_id: str) -> list[Mapping[str, Any]]:
    """ET-3 - the modules with their notion and seen counts, in programme order."""
    result = await tx.conn.execute(READ_EXAM_MODULES, {"user_id": user_id, "formation_id": formation_id})
    return [row_of(row) for row in result.mappings().all()]


async def read_exam_next_slots(tx: Tx, user_id: str, formation_id: str, now: str) -> list[Mapping[str, Any]]:
    """BR-PRA-05 - the two planned mock exams still to come."""
    result = await tx.conn.execute(
        READ_EXAM_NEXT_SLOTS, {"user_id": user_id, "formation_id": formation_id, "now": now}
    )
    return [row_of(row) for row in result.mappings().all()]


async def read_exam_last_attempt(tx: Tx, user_id: str, formation_id: str) -> Mapping[str, Any] | None:
    """The last mock-exam attempt of the formation, whatever its status."""
    result = await tx.conn.execute(READ_EXAM_LAST_ATTEMPT, {"user_id": user_id, "formation_id": formation_id})
    found = result.mappings().first()
    return None if found is None else row_of(found)


async def update_exam_format(tx: Tx, formation_id: str, format_value: str, now: str) -> None:
    """ET-3 - records the learner confirmation of the proposed format."""
    await tx.conn.execute(
        UPDATE_EXAM_FORMAT, {"formation_id": formation_id, "format": format_value, "now": now}
    )


async def lock_mock_exam_slots(tx: Tx, user_id: str, formation_id: str) -> None:
    """BR-PRA-05 - serialises the reconciliation of the two mock exams of one formation."""
    await tx.conn.execute(LOCK_MOCK_EXAM_SLOTS, {"key": f"mock-exams:{user_id}:{formation_id}"})


async def read_mock_exam_formation(tx: Tx, user_id: str, formation_id: str) -> Mapping[str, Any] | None:
    """The formation, its objectives, its stored format and the zone of its owner."""
    result = await tx.conn.execute(
        READ_MOCK_EXAM_FORMATION, {"user_id": user_id, "formation_id": formation_id}
    )
    found = result.mappings().first()
    return None if found is None else row_of(found)


async def read_mock_exam_modules(tx: Tx, formation_id: str) -> list[Mapping[str, Any]]:
    """BR-PRA-05 - the modules and their planned end, in programme order."""
    result = await tx.conn.execute(READ_MOCK_EXAM_MODULES, {"formation_id": formation_id})
    return [row_of(row) for row in result.mappings().all()]


async def read_mock_exam_slot(tx: Tx, user_id: str, planner_key: str) -> str | None:
    """The planned slot of one stable planner key, when the reconciliation created it."""
    result = await tx.conn.execute(READ_MOCK_EXAM_SLOT, {"user_id": user_id, "planner_key": planner_key})
    found = result.mappings().first()
    return None if found is None else str(found["id"])


async def insert_mock_exam_slot(
    tx: Tx,
    *,
    user_id: str,
    formation_id: str,
    title: str,
    starts_at: str,
    ends_at: str,
    planner_key: str,
) -> str | None:
    """BR-PRA-05 - one planned mock exam, `None` when the insert returned no row."""
    result = await tx.conn.execute(
        INSERT_MOCK_EXAM_SLOT,
        {
            "user_id": user_id,
            "formation_id": formation_id,
            "title": title,
            "starts_at": starts_at,
            "ends_at": ends_at,
            "planner_key": planner_key,
        },
    )
    found = result.mappings().first()
    return None if found is None else str(found["id"])


async def update_mock_exam_slot(
    tx: Tx, *, slot_id: str, title: str, starts_at: str, ends_at: str, now: str
) -> None:
    """Re-dates a planned slot the planner owns; a learner move is never overwritten."""
    await tx.conn.execute(
        UPDATE_MOCK_EXAM_SLOT,
        {"slot_id": slot_id, "title": title, "starts_at": starts_at, "ends_at": ends_at, "now": now},
    )


async def read_slot_times(tx: Tx, slot_id: str) -> Mapping[str, Any] | None:
    """The stored instants of a slot, after the insert or the update."""
    result = await tx.conn.execute(READ_SLOT_TIMES, {"slot_id": slot_id})
    found = result.mappings().first()
    return None if found is None else row_of(found)


# --------------------------------------------------------------------------------------------------
# exam.attempts.create / get / submit / result
#
# --------------------------------------------------------------------------------------------------

LOCK_EXAM_START = text("select pg_advisory_xact_lock(hashtextextended(:key, 0))")

LOCK_EXAM_SUBMIT = text("select pg_advisory_xact_lock(hashtextextended(:key, 0))")

READ_EXAM_BANK = text(
    """
    select b.id::text as brick_id,
           bv.id::text as version_id,
           b.type::text as type,
           b.notion_ids::text[] as notion_ids,
           b.purpose::text as purpose,
           bv.payload,
           n.id::text as notion_id,
           n.label as notion_label,
           m.id::text as module_id,
           m.position as module_position,
           m.title as module_label
      from public.bricks b
      join public.brick_versions bv
        on bv.brick_id = b.id and bv.version = b.current_version
      join public.notions n on n.id = b.notion_ids[1]
      join public.modules m on m.id = n.module_id
     where b.owner_id = cast(:user_id as uuid)
       and b.formation_id = cast(:formation_id as uuid)
       and b.purpose in ('exam', 'bank')
       and b.status = 'active'
     order by m.position asc, b.id asc
    """
)

IN_PROGRESS_EXAM_ATTEMPT = text(
    """
    select at.id::text as id
      from public.attempts at
      join public.activities act on act.id = at.activity_id
     where at.user_id = cast(:user_id as uuid)
       and act.formation_id = cast(:formation_id as uuid)
       and act.kind = 'mock_exam'
       and at.status = 'in_progress'
     order by at.created_at desc, at.id desc
     limit 1
    """
)

NEXT_EXAM_ATTEMPT_NO = text(
    """
    select count(*)::int as count
      from public.attempts at
      join public.activities act on act.id = at.activity_id
     where at.user_id = cast(:user_id as uuid)
       and act.formation_id = cast(:formation_id as uuid)
       and act.kind = 'mock_exam'
    """
)

INSERT_EXAM_ACTIVITY = text(
    """
    insert into public.activities (
      owner_id, formation_id, module_id, kind, config, items, status
    ) values (
      cast(:user_id as uuid), cast(:formation_id as uuid), null, 'mock_exam',
      cast(:config as jsonb), cast(:items as jsonb), 'ready'
    )
    returning id::text as id
    """
)

INSERT_EXAM_ATTEMPT = text(
    """
    insert into public.attempts (
      user_id, activity_id, attempt_no, status, started_at, deadline_at
    ) values (
      cast(:user_id as uuid), cast(:activity_id as uuid), :attempt_no, 'in_progress',
      cast(:started_at as timestamptz), cast(:deadline_at as timestamptz)
    )
    returning id::text as id
    """
)

INSERT_EXAM_ANSWER = text(
    """
    insert into public.answers (
      attempt_id, brick_version_id, position, response, max_score, answered_at
    ) values (
      cast(:attempt_id as uuid), cast(:version_id as uuid), :position,
      '{}'::jsonb, :max_score, cast(:answered_at as timestamptz)
    )
    """
)

READ_EXAM_ANSWERS = text(
    """
    select id::text as id,
           position,
           brick_version_id::text as brick_version_id,
           response,
           is_correct,
           score::text as score,
           max_score::text as max_score,
           graded_by::text as graded_by,
           feedback,
           time_ms
      from public.answers
     where attempt_id = cast(:attempt_id as uuid)
     order by position asc
    """
)

UPDATE_EXAM_GRADED_ANSWER = text(
    """
    update public.answers
       set is_correct = :is_correct,
           score = :score,
           max_score = :max_score,
           graded_by = 'code',
           feedback = cast(:feedback as jsonb),
           answered_at = coalesce(answered_at, cast(:now as timestamptz))
     where id = cast(:answer_id as uuid)
    """
)

UPDATE_EXAM_GRADED_ATTEMPT = text(
    """
    update public.attempts
       set status = 'graded',
           score = :score,
           passed = :passed,
           per_notion = cast(:per_notion as jsonb),
           submitted_at = cast(:now as timestamptz),
           duration_ms = :duration_ms,
           review_feedback = cast(:review_feedback as jsonb)
     where id = cast(:attempt_id as uuid)
    """
)


async def lock_exam_start(tx: Tx, user_id: str, formation_id: str) -> None:
    """`exam-start:<user>:<formation>`: one exam started at a time per learner and formation."""
    await tx.conn.execute(LOCK_EXAM_START, {"key": f"exam-start:{user_id}:{formation_id}"})


async def lock_exam_submit(tx: Tx, attempt_id: str) -> None:
    """`exam-submit:<attempt>`: the button and the deadline job converge on a single grade."""
    await tx.conn.execute(LOCK_EXAM_SUBMIT, {"key": f"exam-submit:{attempt_id}"})


async def read_exam_bank(tx: Tx, user_id: str, formation_id: str) -> list[Mapping[str, Any]]:
    """EF-2 - the active bricks of the formation, exam purpose first, in programme order."""
    result = await tx.conn.execute(READ_EXAM_BANK, {"user_id": user_id, "formation_id": formation_id})
    return [row_of(row) for row in result.mappings().all()]


async def read_in_progress_exam_attempt(tx: Tx, user_id: str, formation_id: str) -> str | None:
    """EF-1 - the single running exam of the formation, resumed instead of duplicated."""
    result = await tx.conn.execute(
        IN_PROGRESS_EXAM_ATTEMPT, {"user_id": user_id, "formation_id": formation_id}
    )
    found = result.mappings().first()
    return None if found is None else str(found["id"])


async def read_next_exam_attempt_no(tx: Tx, user_id: str, formation_id: str) -> int:
    """The number of the next attempt of the formation, one-based."""
    result = await tx.conn.execute(NEXT_EXAM_ATTEMPT_NO, {"user_id": user_id, "formation_id": formation_id})
    found = result.mappings().first()
    return (0 if found is None else int(found["count"])) + 1


async def insert_exam_activity(
    tx: Tx, *, user_id: str, formation_id: str, config: str, items: str
) -> str | None:
    """EF-2 - the activity holding every materialised item of the exam."""
    result = await tx.conn.execute(
        INSERT_EXAM_ACTIVITY,
        {"user_id": user_id, "formation_id": formation_id, "config": config, "items": items},
    )
    found = result.mappings().first()
    return None if found is None else str(found["id"])


async def insert_exam_attempt(
    tx: Tx, *, user_id: str, activity_id: str, attempt_no: int, started_at: str, deadline_at: str
) -> str | None:
    """EF-2 - the attempt, with its absolute deadline computed once (ADR-0172 section 1)."""
    result = await tx.conn.execute(
        INSERT_EXAM_ATTEMPT,
        {
            "user_id": user_id,
            "activity_id": activity_id,
            "attempt_no": attempt_no,
            "started_at": started_at,
            "deadline_at": deadline_at,
        },
    )
    found = result.mappings().first()
    return None if found is None else str(found["id"])


async def insert_exam_answer(
    tx: Tx, *, attempt_id: str, version_id: str, position: int, max_score: float, answered_at: str
) -> None:
    """EF-2 - one empty answer per question, at its position."""
    await tx.conn.execute(
        INSERT_EXAM_ANSWER,
        {
            "attempt_id": attempt_id,
            "version_id": version_id,
            "position": position,
            "max_score": max_score,
            "answered_at": answered_at,
        },
    )


async def read_exam_answers(tx: Tx, attempt_id: str) -> list[Mapping[str, Any]]:
    """`readAnswers`: every answer of the exam, in position order."""
    result = await tx.conn.execute(READ_EXAM_ANSWERS, {"attempt_id": attempt_id})
    return [row_of(row) for row in result.mappings().all()]


async def update_exam_graded_answer(
    tx: Tx,
    *,
    answer_id: str,
    is_correct: bool,
    score: float,
    max_score: float,
    feedback: str,
    now: str,
) -> None:
    """EF-3 - the code correction of one exam answer and its feedback."""
    await tx.conn.execute(
        UPDATE_EXAM_GRADED_ANSWER,
        {
            "answer_id": answer_id,
            "is_correct": is_correct,
            "score": score,
            "max_score": max_score,
            "feedback": feedback,
            "now": now,
        },
    )


async def update_exam_graded_attempt(
    tx: Tx,
    *,
    attempt_id: str,
    score: float,
    passed: bool,
    per_notion: str,
    now: str,
    duration_ms: int,
    review_feedback: str,
) -> None:
    """EF-3 - the graded attempt: score, verdict, per-notion detail and review payload."""
    await tx.conn.execute(
        UPDATE_EXAM_GRADED_ATTEMPT,
        {
            "attempt_id": attempt_id,
            "score": score,
            "passed": passed,
            "per_notion": per_notion,
            "now": now,
            "duration_ms": duration_ms,
            "review_feedback": review_feedback,
        },
    )


# --------------------------------------------------------------------------------------------------
# Retry gate of a new validation attempt
#
# --------------------------------------------------------------------------------------------------

READ_RETRY_IN_PROGRESS = text(
    """
    select at.id::text as id
      from public.attempts at
      join public.activities act on act.id = at.activity_id
     where at.user_id = cast(:user_id as uuid)
       and act.module_id = cast(:module_id as uuid)
       and act.kind = 'validation_quiz'
       and at.status = 'in_progress'
     limit 1
    """
)

READ_RETRY_LATEST_GRADED = text(
    """
    select at.id::text as attempt_id, at.passed, at.submitted_at
      from public.attempts at
      join public.activities act on act.id = at.activity_id
     where at.user_id = cast(:user_id as uuid)
       and act.module_id = cast(:module_id as uuid)
       and act.kind = 'validation_quiz'
       and at.status = 'graded'
     order by at.attempt_no desc, at.created_at desc
     limit 1
    """
)

READ_RETRY_ACTION = text(
    """
    select status::text as status, payload
      from public.automation_actions
     where user_id = cast(:user_id as uuid)
       and automation = 'remediation'
       and (payload ->> 'moduleId') = :module_id
       and (payload ->> 'attemptId') = :attempt_id
     order by created_at desc, id desc
     limit 1
    """
)

READ_RETRY_REMEDIATION_DONE = text(
    """
    select act.id::text as id
      from public.activities act
      join public.attempts at on at.activity_id = act.id and at.user_id = cast(:user_id as uuid)
     where act.owner_id = cast(:user_id as uuid)
       and act.module_id = cast(:module_id as uuid)
       and act.kind = 'remediation'
       and (act.config ->> 'sourceAttemptId') = :attempt_id
       and at.status = 'graded'
     limit 1
    """
)

READ_RETRY_SETTINGS = text(
    """
    select enabled, params
      from public.automation_settings
     where user_id = cast(:user_id as uuid) and key = 'remediation'
     limit 1
    """
)

READ_RETRY_TIMEZONE = text("select timezone from public.profiles where id = cast(:user_id as uuid) limit 1")


async def read_retry_in_progress(tx: Tx, user_id: str, module_id: str) -> str | None:
    """A running attempt of the module opens a new one without any delay (ET-5)."""
    result = await tx.conn.execute(READ_RETRY_IN_PROGRESS, {"user_id": user_id, "module_id": module_id})
    found = result.mappings().first()
    return None if found is None else str(found["id"])


async def read_retry_latest_graded(tx: Tx, user_id: str, module_id: str) -> Mapping[str, Any] | None:
    """The latest graded attempt of the module, the only one that gates a retry."""
    result = await tx.conn.execute(READ_RETRY_LATEST_GRADED, {"user_id": user_id, "module_id": module_id})
    found = result.mappings().first()
    return None if found is None else row_of(found)


async def read_retry_action(
    tx: Tx, user_id: str, module_id: str, attempt_id: str
) -> Mapping[str, Any] | None:
    """The latest `remediation` action freezing the delay and the mode of the failed attempt."""
    result = await tx.conn.execute(
        READ_RETRY_ACTION, {"user_id": user_id, "module_id": module_id, "attempt_id": attempt_id}
    )
    found = result.mappings().first()
    return None if found is None else row_of(found)


async def read_retry_remediation_done(tx: Tx, user_id: str, module_id: str, attempt_id: str) -> bool:
    """True once the targeted remediation of the failed attempt is graded."""
    result = await tx.conn.execute(
        READ_RETRY_REMEDIATION_DONE,
        {"user_id": user_id, "module_id": module_id, "attempt_id": attempt_id},
    )
    return result.mappings().first() is not None


async def read_retry_settings(tx: Tx, user_id: str) -> Mapping[str, Any] | None:
    """Automation 4 of the learner; a missing row uses the documented default."""
    result = await tx.conn.execute(READ_RETRY_SETTINGS, {"user_id": user_id})
    found = result.mappings().first()
    return None if found is None else row_of(found)


async def read_retry_timezone(tx: Tx, user_id: str) -> str | None:
    """The zone the refusal message is rendered in (ET-3)."""
    result = await tx.conn.execute(READ_RETRY_TIMEZONE, {"user_id": user_id})
    found = result.mappings().first()
    return None if found is None else str(found["timezone"])


# --------------------------------------------------------------------------------------------------
# quiz.attempts.create
# --------------------------------------------------------------------------------------------------

LOCK_QUIZ_START = text("select pg_advisory_xact_lock(hashtextextended(:key, 0))")

READ_QUIZ_MODULE = text(
    """
    select m.id::text as id,
           m.formation_id::text as formation_id,
           m.position,
           m.threshold,
           coalesce(mp.status, m.status)::text as status
      from public.modules m
      join public.formations f on f.id = m.formation_id
      left join public.module_progress mp
        on mp.module_id = m.id and mp.user_id = cast(:user_id as uuid)
     where m.id = cast(:module_id as uuid)
       and (
         f.owner_id = cast(:user_id as uuid)
         or exists (
           select 1
             from public.groups g
             join public.group_members gm on gm.group_id = g.id
            where g.formation_id = f.id
              and gm.user_id = cast(:user_id as uuid)
              and gm.member_status = 'active'
         )
       )
     limit 1
    """
)

READ_QUIZ_NOTIONS = text(
    """
    select n.id::text as id,
           n.label,
           n.chapter_id::text as chapter_id,
           ch.position as chapter_position,
           n.position,
           ns.mastery::text as mastery,
           ns.gap_nature::text as gap_nature
      from public.notions n
      join public.chapters ch on ch.id = n.chapter_id
      left join public.notion_states ns
        on ns.notion_id = n.id and ns.user_id = cast(:user_id as uuid)
     where n.module_id = cast(:module_id as uuid)
     order by ch.position asc, n.position asc, n.id asc
    """
)

READ_QUIZ_BANK = text(
    """
    select b.id::text as brick_id,
           bv.id::text as version_id,
           b.type::text as type,
           b.notion_ids::text[] as notion_ids,
           b.status::text as status,
           bv.fingerprint,
           bv.payload
      from public.bricks b
      join public.brick_versions bv
        on bv.brick_id = b.id and bv.version = b.current_version
     where b.owner_id = cast(:user_id as uuid)
       and b.formation_id = cast(:formation_id as uuid)
       and b.purpose = 'bank'
       and b.status = 'active'
     order by b.id asc
    """
)

READ_QUIZ_SEEN_FINGERPRINTS = text(
    """
    select distinct bv.fingerprint
      from public.answers a
      join public.attempts at on at.id = a.attempt_id
      join public.brick_versions bv on bv.id = a.brick_version_id
     where at.user_id = cast(:user_id as uuid)
       and bv.fingerprint is not null
    """
)

IN_PROGRESS_QUIZ_ATTEMPT = text(
    """
    select at.id::text as id
      from public.attempts at
      join public.activities act on act.id = at.activity_id
     where at.user_id = cast(:user_id as uuid)
       and act.module_id = cast(:module_id as uuid)
       and act.kind = 'validation_quiz'
       and at.status = 'in_progress'
     order by at.created_at desc, at.id desc
     limit 1
    """
)

NEXT_QUIZ_ATTEMPT_NO = text(
    """
    select count(*)::int as count
      from public.attempts at
      join public.activities act on act.id = at.activity_id
     where at.user_id = cast(:user_id as uuid)
       and act.module_id = cast(:module_id as uuid)
       and act.kind = 'validation_quiz'
    """
)

INSERT_QUIZ_ACTIVITY = text(
    """
    insert into public.activities (
      owner_id, formation_id, module_id, kind, config, items, status
    ) values (
      cast(:user_id as uuid), cast(:formation_id as uuid), cast(:module_id as uuid),
      'validation_quiz', cast(:config as jsonb), cast(:items as jsonb), 'ready'
    )
    returning id::text as id
    """
)

UPDATE_QUIZ_ACTIVITY_ITEMS = text(
    """
    update public.activities
       set items = cast(:items as jsonb)
     where id = cast(:activity_id as uuid)
    """
)

INSERT_QUIZ_ATTEMPT = text(
    """
    insert into public.attempts (
      user_id, activity_id, attempt_no, status, started_at
    ) values (
      cast(:user_id as uuid), cast(:activity_id as uuid), :attempt_no, 'in_progress',
      cast(:started_at as timestamptz)
    )
    returning id::text as id
    """
)

INSERT_QUIZ_ANSWER = text(
    """
    insert into public.answers (
      attempt_id, brick_version_id, position, response, max_score, answered_at
    ) values (
      cast(:attempt_id as uuid), cast(:version_id as uuid), :position,
      '{}'::jsonb, :max_score, cast(:answered_at as timestamptz)
    )
    """
)

READ_APPLIED_REMEDIATION_ACTION = text(
    """
    select id::text as id
      from public.automation_actions
     where user_id = cast(:user_id as uuid)
       and automation = 'remediation'
       and status = 'applied'
       and (payload ->> 'moduleId') = :module_id
     order by created_at desc, id desc
     limit 1
    """
)


async def lock_quiz_start(tx: Tx, user_id: str, module_id: str) -> None:
    """`quiz-start:<user>:<module>`: one creation at a time, the replay creates nothing."""
    await tx.conn.execute(LOCK_QUIZ_START, {"key": f"quiz-start:{user_id}:{module_id}"})


async def read_quiz_module(tx: Tx, user_id: str, module_id: str) -> Mapping[str, Any] | None:
    """EF-1 - the module of the learner (owner or active member), or nothing (404)."""
    result = await tx.conn.execute(READ_QUIZ_MODULE, {"user_id": user_id, "module_id": module_id})
    found = result.mappings().first()
    return None if found is None else row_of(found)


async def read_quiz_notions(tx: Tx, user_id: str, module_id: str) -> list[Mapping[str, Any]]:
    """ET-3 - the notions of the module with their mastery and gap nature."""
    result = await tx.conn.execute(READ_QUIZ_NOTIONS, {"user_id": user_id, "module_id": module_id})
    return [row_of(row) for row in result.mappings().all()]


async def read_quiz_bank(tx: Tx, user_id: str, formation_id: str) -> list[Mapping[str, Any]]:
    """EF-8 - the active bank bricks of the formation, in identifier order."""
    result = await tx.conn.execute(READ_QUIZ_BANK, {"user_id": user_id, "formation_id": formation_id})
    return [row_of(row) for row in result.mappings().all()]


async def read_quiz_seen_fingerprints(tx: Tx, user_id: str) -> list[str]:
    """BR-QUI-03 - the fingerprints already played by the learner, never drawn again."""
    result = await tx.conn.execute(READ_QUIZ_SEEN_FINGERPRINTS, {"user_id": user_id})
    return [str(row["fingerprint"]) for row in result.mappings().all()]


async def read_in_progress_quiz_attempt(tx: Tx, user_id: str, module_id: str) -> str | None:
    """ET-2 - the attempt in progress of the module, resumed instead of duplicated."""
    result = await tx.conn.execute(IN_PROGRESS_QUIZ_ATTEMPT, {"user_id": user_id, "module_id": module_id})
    found = result.mappings().first()
    return None if found is None else str(found["id"])


async def read_next_quiz_attempt_no(tx: Tx, user_id: str, module_id: str) -> int:
    """The number of the next attempt of the module, one-based."""
    result = await tx.conn.execute(NEXT_QUIZ_ATTEMPT_NO, {"user_id": user_id, "module_id": module_id})
    found = result.mappings().first()
    return (0 if found is None else int(found["count"])) + 1


async def insert_quiz_activity(
    tx: Tx, *, user_id: str, formation_id: str, module_id: str, config: str, items: str
) -> str | None:
    """EF-1 - the activity of the validation quiz, materialising the drawn questions."""
    result = await tx.conn.execute(
        INSERT_QUIZ_ACTIVITY,
        {
            "user_id": user_id,
            "formation_id": formation_id,
            "module_id": module_id,
            "config": config,
            "items": items,
        },
    )
    found = result.mappings().first()
    return None if found is None else str(found["id"])


async def update_quiz_activity_items(tx: Tx, activity_id: str, items: str) -> None:
    """CL-9 - the full item (public payload and notion label) is kept on the activity."""
    await tx.conn.execute(UPDATE_QUIZ_ACTIVITY_ITEMS, {"activity_id": activity_id, "items": items})


async def insert_quiz_attempt(
    tx: Tx, *, user_id: str, activity_id: str, attempt_no: int, started_at: str
) -> str | None:
    """ET-2 - the attempt itself, in progress from its start instant."""
    result = await tx.conn.execute(
        INSERT_QUIZ_ATTEMPT,
        {
            "user_id": user_id,
            "activity_id": activity_id,
            "attempt_no": attempt_no,
            "started_at": started_at,
        },
    )
    found = result.mappings().first()
    return None if found is None else str(found["id"])


async def insert_quiz_answer(
    tx: Tx, *, attempt_id: str, version_id: str, position: int, max_score: float, answered_at: str
) -> None:
    """One empty answer per drawn question, at its position."""
    await tx.conn.execute(
        INSERT_QUIZ_ANSWER,
        {
            "attempt_id": attempt_id,
            "version_id": version_id,
            "position": position,
            "max_score": max_score,
            "answered_at": answered_at,
        },
    )


async def read_applied_remediation_action(tx: Tx, user_id: str, module_id: str) -> str | None:
    """SPEC-715 EF-7 - the applied remediation action the next attempt consumes."""
    result = await tx.conn.execute(
        READ_APPLIED_REMEDIATION_ACTION, {"user_id": user_id, "module_id": module_id}
    )
    found = result.mappings().first()
    return None if found is None else str(found["id"])


# --------------------------------------------------------------------------------------------------
# quiz.attempts.submit and finalize
#
# --------------------------------------------------------------------------------------------------

READ_SUBMIT_ATTEMPT = text(
    """
    select at.id::text as id,
           at.activity_id::text as activity_id,
           at.attempt_no,
           at.status::text as status,
           at.started_at,
           at.submitted_at,
           act.module_id::text as module_id,
           act.formation_id::text as formation_id,
           (act.config ->> 'threshold')::int as threshold,
           act.items,
           act.kind::text as kind
      from public.attempts at
      join public.activities act on act.id = at.activity_id
     where at.id = cast(:attempt_id as uuid)
       and at.user_id = cast(:user_id as uuid)
       and act.kind in ('validation_quiz', 'diagnostic')
     limit 1
    """
)

READ_SUBMIT_ANSWERS = text(
    """
    select id::text as id,
           position,
           brick_version_id::text as brick_version_id,
           response,
           is_correct,
           score::text as score,
           max_score::text as max_score,
           graded_by::text as graded_by,
           feedback
      from public.answers
     where attempt_id = cast(:attempt_id as uuid)
     order by position asc
    """
)

UPDATE_QUIZ_SUBMITTED = text(
    """
    update public.attempts
       set status = 'submitted',
           submitted_at = cast(:now as timestamptz),
           duration_ms = :duration_ms
     where id = cast(:attempt_id as uuid)
    """
)

UPDATE_QUIZ_GRADED = text(
    """
    update public.attempts
       set status = 'graded',
           score = :score,
           passed = :passed,
           per_notion = cast(:per_notion as jsonb),
           submitted_at = coalesce(submitted_at, cast(:now as timestamptz)),
           duration_ms = :duration_ms
     where id = cast(:attempt_id as uuid)
    """
)


async def read_submit_attempt(tx: Tx, user_id: str, attempt_id: str) -> Mapping[str, Any] | None:
    """`readAttempt`: the validation attempt of this learner with its threshold (404 otherwise)."""
    result = await tx.conn.execute(READ_SUBMIT_ATTEMPT, {"user_id": user_id, "attempt_id": attempt_id})
    found = result.mappings().first()
    return None if found is None else row_of(found)


async def read_submit_answers(tx: Tx, attempt_id: str) -> list[Mapping[str, Any]]:
    """`readAnswers`: every answer of the attempt, in position order."""
    result = await tx.conn.execute(READ_SUBMIT_ANSWERS, {"attempt_id": attempt_id})
    return [row_of(row) for row in result.mappings().all()]


async def update_quiz_submitted(tx: Tx, *, attempt_id: str, now: str, duration_ms: int) -> None:
    """EF-7 - the attempt becomes `submitted` with its submitted instant and duration."""
    await tx.conn.execute(
        UPDATE_QUIZ_SUBMITTED,
        {"attempt_id": attempt_id, "now": now, "duration_ms": duration_ms},
    )


async def update_quiz_graded(
    tx: Tx,
    *,
    attempt_id: str,
    score: float,
    passed: bool,
    per_notion: str,
    now: str,
    duration_ms: int,
) -> None:
    """ET-8 - the score, `per_notion` and the verdict, without any client-supplied value."""
    await tx.conn.execute(
        UPDATE_QUIZ_GRADED,
        {
            "attempt_id": attempt_id,
            "score": score,
            "passed": passed,
            "per_notion": per_notion,
            "now": now,
            "duration_ms": duration_ms,
        },
    )


# --------------------------------------------------------------------------------------------------
# quiz.attempts.result
# --------------------------------------------------------------------------------------------------

READ_RESULT_ATTEMPT = text(
    """
    select at.id::text as id,
           at.attempt_no,
           at.status::text as status,
           at.started_at,
           at.submitted_at,
           at.score::text as score,
           at.passed,
           at.per_notion,
           act.items,
           act.config,
           act.kind::text as kind,
           act.module_id::text as module_id,
           act.formation_id::text as formation_id,
           m.position::int as position,
           m.title as module_title,
           m.threshold::int as threshold
      from public.attempts at
      join public.activities act on act.id = at.activity_id
      join public.modules m on m.id = act.module_id
     where at.id = cast(:attempt_id as uuid)
       and at.user_id = cast(:user_id as uuid)
       and act.kind in ('validation_quiz', 'diagnostic')
     limit 1
    """
)

READ_RESULT_ANSWERS = text(
    """
    select position,
           brick_version_id::text as brick_version_id,
           is_correct,
           score::text as score,
           max_score::text as max_score,
           feedback
      from public.answers
     where attempt_id = cast(:attempt_id as uuid)
     order by position asc
    """
)

READ_RESULT_HISTORY = text(
    """
    select at.attempt_no, at.score::text as score, at.passed
      from public.attempts at
      join public.activities act on act.id = at.activity_id
     where at.user_id = cast(:user_id as uuid)
       and act.module_id = cast(:module_id as uuid)
       and act.kind = 'validation_quiz'
       and at.status = 'graded'
     order by at.attempt_no asc
    """
)

READ_RESULT_NOTIONS = text(
    """
    select n.id::text as id,
           n.label,
           n.position::int as position,
           ns.mastery::text as mastery,
           ns.gap_nature::text as gap_nature,
           ns.gap_evidence,
           ns.gap_confused_with::text as gap_confused_with
      from public.notions n
      left join public.notion_states ns
        on ns.notion_id = n.id and ns.user_id = cast(:user_id as uuid)
     where n.module_id = cast(:module_id as uuid)
     order by n.position asc, n.id asc
    """
)

READ_RESULT_NEXT_MODULE = text(
    """
    select id::text as id, position::int as position, title
      from public.modules
     where formation_id = cast(:formation_id as uuid) and position > :position
     order by position asc
     limit 1
    """
)

READ_RESULT_LATEST_FAILED = text(
    """
    select at.id::text as attempt_id
      from public.attempts at
      join public.activities act on act.id = at.activity_id
     where at.user_id = cast(:user_id as uuid)
       and act.module_id = cast(:module_id as uuid)
       and act.kind = 'validation_quiz'
       and at.status = 'graded'
       and at.passed = false
     order by at.attempt_no desc, at.created_at desc
     limit 1
    """
)

READ_RESULT_REMEDIATION = text(
    """
    select act.id::text as id,
           act.status::text as status,
           at.id::text as attempt_id,
           at.status::text as attempt_status,
           (
             select count(*)::int
               from public.answers a
              where a.attempt_id = at.id and a.graded_by is not null
           ) as checked,
           coalesce((act.config ->> 'preparing')::boolean, false) as preparing
      from public.activities act
      left join public.attempts at
        on at.activity_id = act.id and at.user_id = cast(:user_id as uuid)
     where act.owner_id = cast(:user_id as uuid)
       and act.module_id = cast(:module_id as uuid)
       and act.kind = 'remediation'
       and (act.config ->> 'sourceAttemptId') = :source_attempt_id
     order by act.created_at desc, act.id desc
     limit 1
    """
)


async def read_result_attempt(tx: Tx, user_id: str, attempt_id: str) -> Mapping[str, Any] | None:
    """`readAttempt`: the attempt, its module, its position and its threshold (404 otherwise)."""
    result = await tx.conn.execute(READ_RESULT_ATTEMPT, {"user_id": user_id, "attempt_id": attempt_id})
    found = result.mappings().first()
    return None if found is None else row_of(found)


async def read_result_answers(tx: Tx, attempt_id: str) -> list[Mapping[str, Any]]:
    """`readAnswers`: the verdicts of the attempt, in position order."""
    result = await tx.conn.execute(READ_RESULT_ANSWERS, {"attempt_id": attempt_id})
    return [row_of(row) for row in result.mappings().all()]


async def read_result_history(tx: Tx, user_id: str, module_id: str) -> list[Mapping[str, Any]]:
    """ET-2 - the graded attempts of the module, oldest first."""
    result = await tx.conn.execute(READ_RESULT_HISTORY, {"user_id": user_id, "module_id": module_id})
    return [row_of(row) for row in result.mappings().all()]


async def read_result_notions(tx: Tx, user_id: str, module_id: str) -> list[Mapping[str, Any]]:
    """BR-LAC-04 - the notions of the module with the state of the learner."""
    result = await tx.conn.execute(READ_RESULT_NOTIONS, {"user_id": user_id, "module_id": module_id})
    return [row_of(row) for row in result.mappings().all()]


async def read_result_next_module(tx: Tx, formation_id: str, position: int) -> Mapping[str, Any] | None:
    """ET-2 - the module that follows in the programme, `None` for the last one."""
    result = await tx.conn.execute(
        READ_RESULT_NEXT_MODULE, {"formation_id": formation_id, "position": position}
    )
    found = result.mappings().first()
    return None if found is None else row_of(found)


async def read_result_latest_failed(tx: Tx, user_id: str, module_id: str) -> str | None:
    """BR-QUI-06 - the latest failed attempt, source of the targeted remediation."""
    result = await tx.conn.execute(READ_RESULT_LATEST_FAILED, {"user_id": user_id, "module_id": module_id})
    found = result.mappings().first()
    return None if found is None else str(found["attempt_id"])


async def read_result_remediation(
    tx: Tx, user_id: str, module_id: str, source_attempt_id: str
) -> Mapping[str, Any] | None:
    """BR-QUI-06 - the remediation activity derived from the failed attempt, if any."""
    result = await tx.conn.execute(
        READ_RESULT_REMEDIATION,
        {
            "user_id": user_id,
            "module_id": module_id,
            "source_attempt_id": source_attempt_id,
        },
    )
    found = result.mappings().first()
    return None if found is None else row_of(found)


# --------------------------------------------------------------------------------------------------
# exercises
# --------------------------------------------------------------------------------------------------

READ_EXERCISE = text(
    """
    select act.id::text as exercise_id,
           act.formation_id::text as formation_id,
           f.title as formation_title,
           act.module_id::text as module_id,
           m.title as module_title,
           m.position as module_position,
           (b.notion_ids)[1]::text as notion_id,
           n.label as notion_label,
           v.payload as payload
      from public.activities act
      join public.formations f on f.id = act.formation_id
      join public.modules m on m.id = act.module_id
      join public.brick_versions v
        on v.id = (act.items -> 0 ->> 'brickVersionId')::uuid
      join public.bricks b on b.id = v.brick_id
      join public.notions n on n.id = (b.notion_ids)[1]
     where act.id = cast(:exercise_id as uuid)
       and act.owner_id = cast(:user_id as uuid)
       and act.kind = 'exercise'
       and act.status = 'ready'
    """
)

READ_EXERCISE_NOTION_STATE = text(
    """
    select mastery::text as mastery, gap_nature::text as gap_nature
      from public.notion_states
     where user_id = cast(:user_id as uuid)
       and notion_id = cast(:notion_id as uuid)
    """
)

READ_EXERCISE_LATEST_ATTEMPT = text(
    """
    select a.id::text as id,
           a.status::text as status,
           a.hints_used,
           a.started_at,
           a.submitted_at,
           a.duration_ms,
           a.review_feedback,
           ans.response,
           ans.feedback,
           ans.score,
           ans.max_score,
           ans.is_correct
      from public.attempts a
      left join public.answers ans
        on ans.attempt_id = a.id and ans.position = 1
     where a.user_id = cast(:user_id as uuid)
       and a.activity_id = cast(:exercise_id as uuid)
     order by a.attempt_no desc
     limit 1
    """
)

LOCK_EXERCISE_LATEST_ATTEMPT = text(
    """
    select a.id::text as id,
           a.status::text as status,
           a.hints_used,
           a.started_at,
           a.submitted_at,
           a.duration_ms,
           a.review_feedback,
           null as response,
           null as feedback,
           null as score,
           null as max_score,
           null as is_correct
      from public.attempts a
     where a.user_id = cast(:user_id as uuid)
       and a.activity_id = cast(:exercise_id as uuid)
     order by a.attempt_no desc
     limit 1
     for update
    """
)

LOCK_EXERCISE_ACTIVITY = text(
    """
    select id::text as id, status::text as status
      from public.activities
     where id = cast(:exercise_id as uuid) and owner_id = cast(:user_id as uuid)
     for update
    """
)

NEXT_EXERCISE_ATTEMPT_NO = text(
    """
    select coalesce(max(attempt_no), 0) + 1 as attempt_no
      from public.attempts
     where activity_id = cast(:exercise_id as uuid) and user_id = cast(:user_id as uuid)
    """
)

INSERT_EXERCISE_ATTEMPT = text(
    """
    insert into public.attempts (user_id, activity_id, attempt_no)
    values (cast(:user_id as uuid), cast(:exercise_id as uuid), :attempt_no)
    on conflict (activity_id, user_id, attempt_no) do nothing
    returning id::text as id, status::text as status, hints_used, started_at
    """
)

UPSERT_EXERCISE_ANSWER = text(
    """
    insert into public.answers (
      attempt_id, brick_version_id, position, response, is_correct, score, max_score,
      graded_by, feedback, answered_at
    ) values (
      cast(:attempt_id as uuid),
      cast(:version_id as uuid),
      1,
      cast(:response as jsonb),
      :is_correct,
      :score,
      :max_score,
      cast(:graded_by as public.grader),
      cast(:feedback as jsonb),
      cast(:answered_at as timestamptz)
    )
    on conflict (attempt_id, position) do update set
      response = excluded.response,
      is_correct = excluded.is_correct,
      score = excluded.score,
      max_score = excluded.max_score,
      graded_by = excluded.graded_by,
      feedback = excluded.feedback,
      answered_at = excluded.answered_at
    """
)

READ_EXERCISE_BRICK_VERSION_ID = text(
    """
    select (items -> 0 ->> 'brickVersionId') as version_id
      from public.activities
     where id = cast(:exercise_id as uuid) and owner_id is not null
    """
)

READ_OWNED_RESOURCE_FILE = text(
    """
    select id::text as id, mime, size_bytes
      from public.resources
     where id = cast(:resource_id as uuid)
       and owner_id = cast(:user_id as uuid)
       and deleted_at is null
    """
)

UPDATE_EXERCISE_GRADED_ATTEMPT = text(
    """
    update public.attempts
       set status = 'graded',
           submitted_at = cast(:now as timestamptz),
           duration_ms = greatest(
             0,
             floor(extract(epoch from (cast(:now as timestamptz) - started_at)) * 1000)::int
           ),
           score = :score,
           passed = :passed,
           per_notion = cast(:per_notion as jsonb),
           hints_used = :hints_used,
           review_feedback = cast(:review_feedback as jsonb)
     where id = cast(:attempt_id as uuid)
       and user_id = cast(:user_id as uuid)
       and status = 'in_progress'
    """
)

UPDATE_EXERCISE_MASTERY_AFTER = text(
    """
    update public.attempts
       set review_feedback = jsonb_set(
             coalesce(review_feedback, '{}'::jsonb),
             '{masteryAfter}',
             to_jsonb(cast(:mastery_after as numeric))
           )
     where id = cast(:attempt_id as uuid)
    """
)

LOCK_EXERCISE_ATTEMPT = text("select pg_advisory_xact_lock(hashtextextended(:lock_key, 0))")


async def read_exercise(tx: Tx, user_id: str, exercise_id: str) -> Mapping[str, Any] | None:
    """`readExercise`: one exercise of the learner, with its immutable instruction payload."""
    result = await tx.conn.execute(READ_EXERCISE, {"user_id": user_id, "exercise_id": exercise_id})
    found = result.mappings().first()
    return None if found is None else row_of(found)


async def read_exercise_notion_state(tx: Tx, user_id: str, notion_id: str) -> Mapping[str, Any] | None:
    """`readNotionState`: the stored mastery and gap nature of the exercise notion."""
    result = await tx.conn.execute(READ_EXERCISE_NOTION_STATE, {"user_id": user_id, "notion_id": notion_id})
    found = result.mappings().first()
    return None if found is None else row_of(found)


async def read_exercise_latest_attempt(tx: Tx, user_id: str, exercise_id: str) -> Mapping[str, Any] | None:
    """`readLatestAttempt`: the latest attempt and the answer stored at position one."""
    result = await tx.conn.execute(
        READ_EXERCISE_LATEST_ATTEMPT, {"user_id": user_id, "exercise_id": exercise_id}
    )
    found = result.mappings().first()
    return None if found is None else row_of(found)


async def lock_exercise_latest_attempt(tx: Tx, user_id: str, exercise_id: str) -> Mapping[str, Any] | None:
    """`lockLatestAttempt`: the latest attempt row locked for the transition."""
    result = await tx.conn.execute(
        LOCK_EXERCISE_LATEST_ATTEMPT, {"user_id": user_id, "exercise_id": exercise_id}
    )
    found = result.mappings().first()
    return None if found is None else row_of(found)


async def lock_exercise_activity(tx: Tx, user_id: str, exercise_id: str) -> Mapping[str, Any] | None:
    """`createAttempt`: the activity row locked before the attempt numbering."""
    result = await tx.conn.execute(LOCK_EXERCISE_ACTIVITY, {"user_id": user_id, "exercise_id": exercise_id})
    found = result.mappings().first()
    return None if found is None else row_of(found)


async def lock_exercise_attempt(tx: Tx, user_id: str, exercise_id: str) -> None:
    """`exercise-attempt:<learner>:<exercise>`: one transition at a time."""
    await tx.conn.execute(LOCK_EXERCISE_ATTEMPT, {"lock_key": f"exercise-attempt:{user_id}:{exercise_id}"})


async def read_next_exercise_attempt_no(tx: Tx, user_id: str, exercise_id: str) -> int:
    """`coalesce(max(attempt_no), 0) + 1` of `createAttempt`."""
    result = await tx.conn.execute(NEXT_EXERCISE_ATTEMPT_NO, {"user_id": user_id, "exercise_id": exercise_id})
    found = result.mappings().first()
    return 1 if found is None else int(found["attempt_no"])


async def insert_exercise_attempt(
    tx: Tx, *, user_id: str, exercise_id: str, attempt_no: int
) -> Mapping[str, Any] | None:
    """`createAttempt`: one attempt, `None` when a concurrent transaction won the number."""
    result = await tx.conn.execute(
        INSERT_EXERCISE_ATTEMPT,
        {"user_id": user_id, "exercise_id": exercise_id, "attempt_no": attempt_no},
    )
    found = result.mappings().first()
    return None if found is None else row_of(found)


async def upsert_exercise_answer(
    tx: Tx,
    *,
    attempt_id: str,
    version_id: str,
    response: str,
    is_correct: bool | None = None,
    score: float | int | None = None,
    max_score: float | int | None = None,
    graded_by: str | None = None,
    feedback: str | None = None,
    answered_at: str,
) -> None:
    """`upsertAnswer`: rewrites the answer at position one without touching the rest."""
    await tx.conn.execute(
        UPSERT_EXERCISE_ANSWER,
        {
            "attempt_id": attempt_id,
            "version_id": version_id,
            "response": response,
            "is_correct": is_correct,
            "score": score,
            "max_score": max_score,
            "graded_by": graded_by,
            "feedback": feedback,
            "answered_at": answered_at,
        },
    )


async def read_exercise_brick_version_id(tx: Tx, exercise_id: str) -> str | None:
    """`readBrickVersionId`: the brick version recorded by the exercise items."""
    result = await tx.conn.execute(READ_EXERCISE_BRICK_VERSION_ID, {"exercise_id": exercise_id})
    found = result.mappings().first()
    return None if found is None else found["version_id"]


async def read_owned_resource_file(tx: Tx, user_id: str, resource_id: str) -> Mapping[str, Any] | None:
    """`assertFileOwned`: an owned, not deleted resource, with its mime and size."""
    result = await tx.conn.execute(READ_OWNED_RESOURCE_FILE, {"user_id": user_id, "resource_id": resource_id})
    found = result.mappings().first()
    return None if found is None else row_of(found)


async def update_exercise_graded_attempt(
    tx: Tx,
    *,
    attempt_id: str,
    user_id: str,
    now: str,
    score: float,
    passed: bool,
    per_notion: str,
    hints_used: int,
    review_feedback: str,
) -> None:
    """`persistSubmission`: the graded attempt, its score, its verdict and its feedback."""
    await tx.conn.execute(
        UPDATE_EXERCISE_GRADED_ATTEMPT,
        {
            "attempt_id": attempt_id,
            "user_id": user_id,
            "now": now,
            "score": score,
            "passed": passed,
            "per_notion": per_notion,
            "hints_used": hints_used,
            "review_feedback": review_feedback,
        },
    )


async def update_exercise_mastery_after(tx: Tx, *, attempt_id: str, mastery_after: float) -> None:
    """`submitExercise`: the mastery after the application, kept on the attempt feedback."""
    await tx.conn.execute(
        UPDATE_EXERCISE_MASTERY_AFTER,
        {"attempt_id": attempt_id, "mastery_after": mastery_after},
    )


INCREMENT_EXERCISE_HINTS = text(
    """
    update public.attempts
       set hints_used = hints_used + 1
     where id = cast(:attempt_id as uuid)
       and user_id = cast(:user_id as uuid)
       and status = 'in_progress'
       and hints_used < 2
    returning hints_used
    """
)


async def increment_exercise_hints(tx: Tx, *, attempt_id: str, user_id: str) -> int | None:
    """`requestExerciseHint`: one hint at a time, never more than two; `None` at the cap."""
    result = await tx.conn.execute(INCREMENT_EXERCISE_HINTS, {"attempt_id": attempt_id, "user_id": user_id})
    found = result.mappings().first()
    return None if found is None else int(found["hints_used"])


# --------------------------------------------------------------------------------------------------
# remediation
# --------------------------------------------------------------------------------------------------

READ_REMEDIATION_MODULE = text(
    """
    select m.id::text as id,
           m.formation_id::text as formation_id,
           m.position::int as position,
           m.title
      from public.modules m
      join public.formations f on f.id = m.formation_id
     where m.id = cast(:module_id as uuid)
       and (f.owner_id = cast(:user_id as uuid) or exists (
         select 1
           from public.groups g
           join public.group_members gm on gm.group_id = g.id
          where g.formation_id = f.id
            and gm.user_id = cast(:user_id as uuid)
            and gm.member_status = 'active'
       ))
     limit 1
    """
)

READ_REMEDIATION_FAILED_ATTEMPT = text(
    """
    select at.id::text as id, act.formation_id::text as formation_id
      from public.attempts at
      join public.activities act on act.id = at.activity_id
     where at.user_id = cast(:user_id as uuid)
       and act.module_id = cast(:module_id as uuid)
       and act.kind = 'validation_quiz'
       and at.status = 'graded'
       and at.passed = false
     order by at.attempt_no desc, at.created_at desc
     limit 1
    """
)

READ_REMEDIATION_GAPS = text(
    """
    select n.id::text as notion_id,
           n.label,
           ns.gap_nature::text as nature,
           ns.gap_evidence as evidence,
           ns.mastery::text as mastery,
           ns.gap_confused_with::text as confused_with
      from public.notions n
      join public.notion_states ns
        on ns.notion_id = n.id and ns.user_id = cast(:user_id as uuid)
     where n.module_id = cast(:module_id as uuid)
       and ns.gap_nature is not null
       and ns.gap_cleared_at is null
     order by ns.mastery asc, n.position asc
     limit :max_gaps
    """
)

READ_REMEDIATION_BANK = text(
    """
    select b.id::text as brick_id,
           bv.id::text as version_id,
           b.type::text as type,
           b.notion_ids::text[] as notion_ids,
           bv.payload,
           bv.fingerprint
      from public.bricks b
      join public.brick_versions bv on bv.brick_id = b.id and bv.version = b.current_version
     where b.owner_id = cast(:user_id as uuid)
       and b.formation_id = cast(:formation_id as uuid)
       and b.purpose = 'bank'
       and b.status = 'active'
     order by b.id asc
    """
)

READ_REMEDIATION_EXCERPTS = text(
    """
    select ci.id::text as citation_id,
           ci.label,
           cs.id::text as section_id,
           cs.anchor,
           ch.id::text as chapter_id,
           cs.course_id::text as course_id
      from public.citations ci
      join public.course_sections cs on cs.id = ci.section_id
      join public.chapters ch on ch.id = cs.chapter_id
      join public.courses co on co.id = cs.course_id
     where ci.owner_id = cast(:user_id as uuid)
       and cs.owner_id = cast(:user_id as uuid)
       and co.owner_id = cast(:user_id as uuid)
       and co.formation_id = cast(:formation_id as uuid)
       and co.is_current
       and co.status = 'ready'
       and cs.notion_ids @> array[cast(:notion_id as uuid)]
     order by
       case when ci.id::text = any(
         array(select jsonb_array_elements_text(cast(:citation_ids as jsonb)))
       ) then 0 else 1 end,
       cs.position asc,
       ci.created_at asc
     limit 2
    """
)

READ_EXISTING_REMEDIATION = text(
    """
    select act.id::text as id,
           act.status::text as status,
           at.id::text as attempt_id,
           at.status::text as attempt_status,
           (select count(*)::int
              from public.answers a
             where a.attempt_id = at.id and a.graded_by is not null) as checked,
           coalesce((act.config ->> 'preparing')::boolean, false) as preparing
      from public.activities act
      left join public.attempts at
        on at.activity_id = act.id and at.user_id = cast(:user_id as uuid)
     where act.owner_id = cast(:user_id as uuid)
       and act.module_id = cast(:module_id as uuid)
       and act.kind = 'remediation'
       and (act.config ->> 'sourceAttemptId') = cast(:source_attempt_id as text)
     order by act.created_at desc, act.id desc
     limit 1
    """
)

READ_AUTOMATION_ENABLED = text(
    """
    select enabled
      from public.automation_settings
     where user_id = cast(:user_id as uuid) and key = 'remediation'
     limit 1
    """
)

INSERT_REMEDIATION_ACTIVITY = text(
    """
    insert into public.activities (
      owner_id, formation_id, module_id, kind, config, items, status
    ) values (
      cast(:user_id as uuid),
      cast(:formation_id as uuid),
      cast(:module_id as uuid),
      'remediation',
      cast(:config as jsonb),
      cast(:items as jsonb),
      cast(:status as public.activity_status)
    )
    returning id::text as id
    """
)

ARCHIVE_OTHER_REMEDIATIONS = text(
    """
    update public.activities
       set status = 'archived'
     where owner_id = cast(:user_id as uuid)
       and module_id = cast(:module_id as uuid)
       and kind = 'remediation'
       and id <> cast(:activity_id as uuid)
       and status <> 'archived'
    """
)

INSERT_REMEDIATION_ATTEMPT = text(
    """
    insert into public.attempts (user_id, activity_id, attempt_no, status, started_at)
    values (
      cast(:user_id as uuid),
      cast(:activity_id as uuid),
      1,
      'in_progress',
      cast(:started_at as timestamptz)
    )
    returning id::text as id
    """
)

INSERT_REMEDIATION_ANSWER = text(
    """
    insert into public.answers (
      attempt_id, brick_version_id, position, response, max_score, answered_at
    ) values (
      cast(:attempt_id as uuid),
      cast(:version_id as uuid),
      :position,
      '{}'::jsonb,
      :max_score,
      cast(:answered_at as timestamptz)
    )
    """
)

READ_LATEST_REMEDIATION = text(
    """
    select act.id::text as id,
           act.status::text as status,
           act.config,
           at.id::text as attempt_id,
           at.status::text as attempt_status,
           (select count(*)::int
              from public.answers a
             where a.attempt_id = at.id and a.graded_by is not null) as checked,
           coalesce((act.config ->> 'preparing')::boolean, false) as preparing
      from public.activities act
      left join public.attempts at
        on at.activity_id = act.id and at.user_id = cast(:user_id as uuid)
     where act.owner_id = cast(:user_id as uuid)
       and act.module_id = cast(:module_id as uuid)
       and act.kind = 'remediation'
     order by act.created_at desc, act.id desc
     limit 1
    """
)

READ_UNCHECKED_REMEDIATION_ANSWERS = text(
    """
    select position
      from public.answers
     where attempt_id = cast(:attempt_id as uuid) and graded_by is null
     order by position asc
    """
)

READ_REMEDIATION_ANSWER_SCORES = text(
    """
    select max_score::text as max_score, score::text as score
      from public.answers
     where attempt_id = cast(:attempt_id as uuid)
    """
)

UPDATE_REMEDIATION_GRADED_ATTEMPT = text(
    """
    update public.attempts
       set status = 'graded',
           score = :score,
           passed = :passed,
           submitted_at = cast(:now as timestamptz),
           duration_ms = greatest(
             0,
             floor(extract(epoch from (cast(:now as timestamptz) - started_at)) * 1000)::int
           )
     where id = cast(:attempt_id as uuid)
    """
)

ARCHIVE_REMEDIATION_ACTIVITY = text(
    """
    update public.activities
       set status = 'archived'
     where id = cast(:activity_id as uuid)
    """
)


async def read_remediation_module(tx: Tx, user_id: str, module_id: str) -> Mapping[str, Any] | None:
    """`readModule`: the module of the learner (owner or active member), or nothing (404)."""
    result = await tx.conn.execute(READ_REMEDIATION_MODULE, {"user_id": user_id, "module_id": module_id})
    found = result.mappings().first()
    return None if found is None else row_of(found)


async def read_remediation_failed_attempt(tx: Tx, user_id: str, module_id: str) -> Mapping[str, Any] | None:
    """`latestFailedAttempt`: the latest failed validation attempt of the module."""
    result = await tx.conn.execute(
        READ_REMEDIATION_FAILED_ATTEMPT, {"user_id": user_id, "module_id": module_id}
    )
    found = result.mappings().first()
    return None if found is None else row_of(found)


async def read_remediation_gaps(
    tx: Tx, user_id: str, module_id: str, max_gaps: int
) -> list[Mapping[str, Any]]:
    """`readGaps`: the open gaps of the module, the weakest mastery first."""
    result = await tx.conn.execute(
        READ_REMEDIATION_GAPS,
        {"user_id": user_id, "module_id": module_id, "max_gaps": max_gaps},
    )
    return [row_of(row) for row in result.mappings().all()]


async def read_remediation_bank(tx: Tx, user_id: str, formation_id: str) -> list[Mapping[str, Any]]:
    """`readBank`: the active bank bricks of the formation, in identifier order."""
    result = await tx.conn.execute(READ_REMEDIATION_BANK, {"user_id": user_id, "formation_id": formation_id})
    return [row_of(row) for row in result.mappings().all()]


async def read_remediation_excerpts(
    tx: Tx, user_id: str, formation_id: str, notion_id: str, citation_ids: list[str]
) -> list[Mapping[str, Any]]:
    """`readExcerpts`: at most two current course excerpts of the notion."""
    import json

    result = await tx.conn.execute(
        READ_REMEDIATION_EXCERPTS,
        {
            "user_id": user_id,
            "formation_id": formation_id,
            "notion_id": notion_id,
            "citation_ids": json.dumps(citation_ids),
        },
    )
    return [row_of(row) for row in result.mappings().all()]


async def read_existing_remediation(
    tx: Tx, user_id: str, module_id: str, source_attempt_id: str
) -> Mapping[str, Any] | None:
    """`existingRemediation`: the remediation of the same failed attempt, if any."""
    result = await tx.conn.execute(
        READ_EXISTING_REMEDIATION,
        {
            "user_id": user_id,
            "module_id": module_id,
            "source_attempt_id": source_attempt_id,
        },
    )
    found = result.mappings().first()
    return None if found is None else row_of(found)


async def read_automation_enabled(tx: Tx, user_id: str) -> bool | None:
    """`isAutomationEnabled`: the stored switch, `None` when the learner never changed it."""
    result = await tx.conn.execute(READ_AUTOMATION_ENABLED, {"user_id": user_id})
    found = result.mappings().first()
    return None if found is None else found["enabled"] is True


async def insert_remediation_activity(
    tx: Tx,
    *,
    user_id: str,
    formation_id: str,
    module_id: str,
    config: str,
    items: str,
    status: str,
) -> str | None:
    """`prepareRemediation` and `requestRemediationPreparation`: the remediation activity."""
    result = await tx.conn.execute(
        INSERT_REMEDIATION_ACTIVITY,
        {
            "user_id": user_id,
            "formation_id": formation_id,
            "module_id": module_id,
            "config": config,
            "items": items,
            "status": status,
        },
    )
    found = result.mappings().first()
    return None if found is None else str(found["id"])


async def archive_other_remediations(tx: Tx, user_id: str, module_id: str, activity_id: str) -> None:
    """One current remediation per module: the previous ones are archived."""
    await tx.conn.execute(
        ARCHIVE_OTHER_REMEDIATIONS,
        {"user_id": user_id, "module_id": module_id, "activity_id": activity_id},
    )


async def insert_remediation_attempt(
    tx: Tx, *, user_id: str, activity_id: str, started_at: str
) -> str | None:
    """One attempt of the remediation, in progress from its start instant."""
    result = await tx.conn.execute(
        INSERT_REMEDIATION_ATTEMPT,
        {"user_id": user_id, "activity_id": activity_id, "started_at": started_at},
    )
    found = result.mappings().first()
    return None if found is None else str(found["id"])


async def insert_remediation_answer(
    tx: Tx, *, attempt_id: str, version_id: str, position: int, max_score: float, answered_at: str
) -> None:
    """One empty answer per remediation question, at its position."""
    await tx.conn.execute(
        INSERT_REMEDIATION_ANSWER,
        {
            "attempt_id": attempt_id,
            "version_id": version_id,
            "position": position,
            "max_score": max_score,
            "answered_at": answered_at,
        },
    )


async def read_latest_remediation(tx: Tx, user_id: str, module_id: str) -> Mapping[str, Any] | None:
    """`readLatestActivity`: the current remediation of the module."""
    result = await tx.conn.execute(READ_LATEST_REMEDIATION, {"user_id": user_id, "module_id": module_id})
    found = result.mappings().first()
    return None if found is None else row_of(found)


async def read_unchecked_remediation_answers(tx: Tx, attempt_id: str) -> list[int]:
    """`completeRemediation`: the positions still waiting for their check (409)."""
    result = await tx.conn.execute(READ_UNCHECKED_REMEDIATION_ANSWERS, {"attempt_id": attempt_id})
    return [int(row["position"]) for row in result.mappings().all()]


async def read_remediation_answer_scores(tx: Tx, attempt_id: str) -> list[Mapping[str, Any]]:
    """`completeRemediation`: the earned and possible points of the attempt."""
    result = await tx.conn.execute(READ_REMEDIATION_ANSWER_SCORES, {"attempt_id": attempt_id})
    return [row_of(row) for row in result.mappings().all()]


async def update_remediation_graded_attempt(
    tx: Tx, *, attempt_id: str, score: float, passed: bool, now: str
) -> None:
    """`completeRemediation`: the attempt is graded with its ratio and its verdict."""
    await tx.conn.execute(
        UPDATE_REMEDIATION_GRADED_ATTEMPT,
        {"attempt_id": attempt_id, "score": score, "passed": passed, "now": now},
    )


async def archive_remediation_activity(tx: Tx, activity_id: str) -> None:
    """`completeRemediation`: the terminated remediation leaves the current slot."""
    await tx.conn.execute(ARCHIVE_REMEDIATION_ACTIVITY, {"activity_id": activity_id})


# --------------------------------------------------------------------------------------------------
# offline.sync
# --------------------------------------------------------------------------------------------------

READ_SYNC_RECEIPT = text(
    """
    select client_id::text as client_id
      from public.offline_sync_receipts
     where user_id = cast(:user_id as uuid) and client_id = cast(:client_id as uuid)
    """
)

INSERT_SYNC_RECEIPT = text(
    """
    insert into public.offline_sync_receipts (user_id, client_id, status, answer_id)
    values (
      cast(:user_id as uuid),
      cast(:client_id as uuid),
      :status,
      cast(:answer_id as uuid)
    )
    on conflict (user_id, client_id) do nothing
    returning client_id::text as client_id
    """
)

READ_SYNC_SESSION = text(
    """
    select a.id::text as id,
           a.owner_id::text as owner_id,
           a.formation_id::text as formation_id,
           a.for_date::text as for_date,
           a.items,
           at.id::text as attempt_id,
           at.status::text as attempt_status
      from public.activities a
      join public.attempts at on at.activity_id = a.id
     where a.id = cast(:session_id as uuid)
     order by at.attempt_no desc
     limit 1
    """
)

READ_SYNC_ACTIVITY_OWNER = text(
    """
    select owner_id::text as owner_id
      from public.activities
     where id = cast(:session_id as uuid)
     limit 1
    """
)

READ_SYNC_BRICK = text(
    """
    select b.type::text as type,
           b.notion_ids::text[] as notion_ids,
           b.status::text as status,
           bv.payload
      from public.brick_versions bv
      join public.bricks b on b.id = bv.brick_id
     where bv.id = cast(:version_id as uuid)
    """
)

READ_SYNC_ANSWER_POSITION = text(
    """
    select id::text as id
      from public.answers
     where attempt_id = cast(:attempt_id as uuid)
       and position = :position
     limit 1
    """
)

INSERT_SYNC_ANSWER = text(
    """
    insert into public.answers
      (id, attempt_id, brick_version_id, position, response, is_correct, score, max_score,
       time_ms, graded_by, feedback, answered_at)
    values (
      cast(:answer_id as uuid),
      cast(:attempt_id as uuid),
      cast(:version_id as uuid),
      :position,
      cast(:response as jsonb),
      :is_correct,
      :score,
      :max_score,
      :time_ms,
      'code',
      cast(:feedback as jsonb),
      cast(:answered_at as timestamptz)
    )
    """
)

READ_SYNC_PROFILE_TIMEZONE = text(
    """
    select timezone
      from public.profiles
     where id = cast(:user_id as uuid)
    """
)


async def sync_receipt_exists(tx: Tx, user_id: str, client_id: str) -> bool:
    """`receiptStatus`: a replayed entry is a `duplicate` with no effect."""
    result = await tx.conn.execute(READ_SYNC_RECEIPT, {"user_id": user_id, "client_id": client_id})
    return result.mappings().first() is not None


async def insert_sync_receipt(
    tx: Tx, *, user_id: str, client_id: str, status: str, answer_id: str | None
) -> bool:
    """`insertReceipt`: the receipt of one processed entry, idempotent by `(user, clientId)`."""
    result = await tx.conn.execute(
        INSERT_SYNC_RECEIPT,
        {
            "user_id": user_id,
            "client_id": client_id,
            "status": status,
            "answer_id": answer_id,
        },
    )
    return result.mappings().first() is not None


async def read_sync_session(tx: Tx, session_id: str) -> Mapping[str, Any] | None:
    """`loadSession`: the session activity and its latest attempt."""
    result = await tx.conn.execute(READ_SYNC_SESSION, {"session_id": session_id})
    found = result.mappings().first()
    return None if found is None else row_of(found)


async def read_sync_activity_owner(tx: Tx, session_id: str) -> str | None:
    """`sessionOf`: the owner read with the service role, to answer `FORBIDDEN` (ET-7)."""
    result = await tx.conn.execute(READ_SYNC_ACTIVITY_OWNER, {"session_id": session_id})
    found = result.mappings().first()
    return None if found is None else str(found["owner_id"])


async def read_sync_brick(tx: Tx, version_id: str) -> Mapping[str, Any] | None:
    """`loadBrick`: the type, the notions and the payload of the answered version."""
    result = await tx.conn.execute(READ_SYNC_BRICK, {"version_id": version_id})
    found = result.mappings().first()
    return None if found is None else row_of(found)


async def read_sync_answer_position(tx: Tx, attempt_id: str, position: int) -> str | None:
    """`applyAnswer`: an answer already stored at this position is a `conflict`."""
    result = await tx.conn.execute(
        READ_SYNC_ANSWER_POSITION, {"attempt_id": attempt_id, "position": position}
    )
    found = result.mappings().first()
    return None if found is None else str(found["id"])


async def insert_sync_answer(
    tx: Tx,
    *,
    answer_id: str,
    attempt_id: str,
    version_id: str,
    position: int,
    response: str,
    is_correct: bool | None,
    score: float | None,
    max_score: float | None,
    time_ms: int,
    feedback: str,
    answered_at: str,
) -> None:
    """`applyAnswer`: the answer recomputed by the server, never the client verdict."""
    await tx.conn.execute(
        INSERT_SYNC_ANSWER,
        {
            "answer_id": answer_id,
            "attempt_id": attempt_id,
            "version_id": version_id,
            "position": position,
            "response": response,
            "is_correct": is_correct,
            "score": score,
            "max_score": max_score,
            "time_ms": time_ms,
            "feedback": feedback,
            "answered_at": answered_at,
        },
    )


async def read_sync_profile_timezone(tx: Tx, user_id: str) -> str | None:
    """`timeZoneOf`: the learner zone, `Europe/Paris` when the profile row is unreadable."""
    result = await tx.conn.execute(READ_SYNC_PROFILE_TIMEZONE, {"user_id": user_id})
    found = result.mappings().first()
    return None if found is None else str(found["timezone"])


# --------------------------------------------------------------------------------------------------
# Diagnostic attempt of simple mode (SPEC-4001 EF-10, EF-11).
# --------------------------------------------------------------------------------------------------

INSERT_DIAGNOSTIC_ACTIVITY = text(
    """
    insert into public.activities (
      owner_id, formation_id, module_id, kind, config, items, status
    ) values (
      cast(:user_id as uuid), cast(:formation_id as uuid), cast(:module_id as uuid),
      'diagnostic', cast(:config as jsonb), cast(:items as jsonb), 'ready'
    )
    returning id::text as id
    """
)

UPDATE_ACTIVITY_CONFIG = text(
    """
    update public.activities
       set config = config || cast(:patch as jsonb)
     where id = cast(:activity_id as uuid)
    """
)

READ_DIAGNOSTIC_ATTEMPT = text(
    """
    select at.id::text as id,
           at.activity_id::text as activity_id,
           at.attempt_no,
           at.status::text as status,
           at.started_at,
           act.module_id::text as module_id,
           act.formation_id::text as formation_id,
           act.config,
           act.items,
           act.kind::text as kind
      from public.attempts at
      join public.activities act on act.id = at.activity_id
     where at.id = cast(:attempt_id as uuid)
       and at.user_id = cast(:user_id as uuid)
       and act.kind = 'diagnostic'
     limit 1
    """
)


async def insert_diagnostic_activity(
    tx: Tx,
    *,
    user_id: str,
    formation_id: str,
    module_id: str,
    config: str,
    items: str,
) -> str | None:
    """EF-10 - the diagnostic activity, `ready` with its questions."""
    result = await tx.conn.execute(
        INSERT_DIAGNOSTIC_ACTIVITY,
        {
            "user_id": user_id,
            "formation_id": formation_id,
            "module_id": module_id,
            "config": config,
            "items": items,
        },
    )
    found = result.mappings().first()
    return None if found is None else str(found["id"])


async def update_activity_config(tx: Tx, activity_id: str, patch: str) -> None:
    """EF-10 - the outcome of the diagnostic is kept on the activity for `/result`."""
    await tx.conn.execute(UPDATE_ACTIVITY_CONFIG, {"activity_id": activity_id, "patch": patch})


async def read_diagnostic_attempt(tx: Tx, user_id: str, attempt_id: str) -> Mapping[str, Any] | None:
    """The diagnostic attempt of this learner, whatever its status."""
    result = await tx.conn.execute(READ_DIAGNOSTIC_ATTEMPT, {"user_id": user_id, "attempt_id": attempt_id})
    found = result.mappings().all()
    return None if not found else row_of(found[0])
