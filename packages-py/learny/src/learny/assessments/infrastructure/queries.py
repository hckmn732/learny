"""SQL of the assessments context (SPEC-2202).

Every statement is copied from the TypeScript service it replaces (`bricks/brick-service.ts`,
`quiz/*.ts`, ...): same tables, same columns, same `order by`, same `for update` and same advisory
locks. `${x}` placeholders become bound `:x` parameters and nothing here reads the clock.

The aliases are snake_case because Python reads them as mappings; the TypeScript `sql` template
quotes camelCase aliases for the same reason.
"""

from collections.abc import Mapping, Sequence
from typing import Any

from sqlalchemy import text

from learny.shared.db.uow import Tx


def row_of(found: Any) -> dict[str, Any]:
    """A plain mapping: SQLAlchemy returns `RowMapping`, which cannot be indexed cheaply."""
    return dict(found)


def _uuid_list(statement: Any) -> Any:
    """`in (${uuidList(ids)})` of the TypeScript template: one `uuid[]` parameter, same semantics."""
    return statement


# --------------------------------------------------------------------------------------------------
# bricks.correct / bricks.report (packages/services/src/bricks/brick-service.ts, SPEC-501 ET-8)
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

# --- reference resolver (packages/services/src/bricks/reference-resolver.ts) ----------------------

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
# offline.pack (packages/services/src/offline/pack.ts, SPEC-801 ET-5, EF-4)
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
# (packages/services/src/quiz/check.ts, SPEC-611 EF-1 to EF-7)
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
           act.items
      from public.attempts at
      join public.activities act on act.id = at.activity_id
     where at.id = cast(:attempt_id as uuid)
       and at.user_id = cast(:user_id as uuid)
       and act.kind in ('validation_quiz', 'remediation')
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
# (packages/services/src/mock-exams/attempt.ts, SPEC-614 EF-2, ET-4, BR-PRA-03)
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
