"""SQL of the tutor context (SPEC-2204).

Every statement is copied from the TypeScript service it replaces
(`packages/services/src/tutor-chat/{conversations,context,stream,self-test}.ts`) and from the
repository functions they call (`createActivity`, `createAttempt`, `recordAnswer`, `writeBrick`):
same tables, same columns in the same order, same `order by`, same `for update`, same advisory
locks. `${x}` placeholders become bound `:x` parameters; nothing here reads the clock.
"""

from collections.abc import Mapping
from typing import Any

from sqlalchemy import text

from learny.shared.db.uow import Tx

CONVERSATION_REF = text(
    """
    select conv.id::text as id, conv.course_id::text as course_id,
      coalesce(
        (select m.context->>'chapterId' from public.tutor_messages m
         where m.conversation_id = conv.id and m.context ? 'chapterId'
         order by m.created_at asc limit 1),
        ch.id::text
      ) as chapter_id
    from public.tutor_conversations conv
    join public.courses c on c.id = conv.course_id
    left join public.chapters ch on ch.module_id = c.module_id
    where conv.id = cast(:id as uuid) and conv.user_id = cast(:user_id as uuid)
    order by ch.position
    limit 1
    """
)
CONVERSATION_BY_COURSE = text(
    """
    select conv.id::text as id, conv.course_id::text as course_id,
      coalesce(
        (select m.context->>'chapterId' from public.tutor_messages m
         where m.conversation_id = conv.id and m.context ? 'chapterId'
         order by m.created_at asc limit 1),
        ch.id::text
      ) as chapter_id
    from public.tutor_conversations conv
    join public.courses c on c.id = conv.course_id
    left join public.chapters ch on ch.id = cast(:chapter_id as uuid) and ch.module_id = c.module_id
    where conv.user_id = cast(:user_id as uuid) and conv.course_id = cast(:course_id as uuid)
    order by conv.updated_at desc, conv.id
    limit 1
    """
)
INSERT_CONVERSATION = text(
    """
    insert into public.tutor_conversations (user_id, course_id, title)
    select cast(:user_id as uuid), c.id, null
    from public.courses c
    join public.chapters ch on ch.id = cast(:chapter_id as uuid) and ch.module_id = c.module_id
    where c.id = cast(:course_id as uuid) and c.owner_id = cast(:user_id as uuid)
    returning id::text as id
    """
)
INSERT_GREETING_MESSAGE = text(
    """
    insert into public.tutor_messages (
      conversation_id, user_id, role, content, context, sources, follow_ups
    ) values (
      cast(:conversation_id as uuid), cast(:user_id as uuid), 'tutor', :content,
      cast(:context as jsonb), '[]'::jsonb, cast(:follow_ups as text[])
    )
    """
)
LIST_CONVERSATIONS = text(
    """
    select conv.id::text as id, conv.title, conv.created_at,
      coalesce(max(m.created_at), conv.created_at) as last_message_at
    from public.tutor_conversations conv
    left join public.tutor_messages m on m.conversation_id = conv.id
    where conv.user_id = cast(:user_id as uuid) and conv.course_id = cast(:course_id as uuid)
    group by conv.id, conv.title, conv.created_at
    order by last_message_at desc, conv.id
    limit 200
    """
)
MESSAGES_OF_CONVERSATION = text(
    """
    select id::text as id, role::text as role, content, sources, follow_ups, self_test, context,
      created_at
    from public.tutor_messages
    where conversation_id = cast(:conversation_id as uuid) and user_id = cast(:user_id as uuid)
    order by created_at, id
    limit 500
    """
)
CONVERSATION_ROW = text(
    """
    select id::text as id, course_id::text as course_id, title, created_at
    from public.tutor_conversations
    where id = cast(:id as uuid) and user_id = cast(:user_id as uuid)
    """
)

CONTEXT_META = text(
    """
    select
      f.id::text as formation_id,
      f.title as formation_title,
      coalesce(f.objectives, '{}'::public.formation_objective[])::text[] as objectives,
      f.cadrage_profile,
      m.id::text as module_id,
      m.position as module_position,
      m.title as module_title,
      ch.id::text as chapter_id,
      ch.position as chapter_position,
      ch.title as chapter_title,
      c.id::text as course_id,
      c.version as course_version,
      coalesce(rp.percent, 0)::int as percent,
      p.tutor_tone::text as tutor_tone,
      p.course_language::text as course_language
    from public.tutor_conversations conv
    join public.courses c on c.id = conv.course_id
    join public.formations f on f.id = c.formation_id
    join public.modules m on m.id = c.module_id
    join public.chapters ch on ch.id = cast(:chapter_id as uuid) and ch.module_id = m.id
    join public.profiles p on p.id = conv.user_id
    left join public.reading_progress rp
      on rp.course_id = c.id and rp.chapter_id = ch.id and rp.user_id = p.id
    where conv.id = cast(:conversation_id as uuid)
      and conv.user_id = cast(:user_id as uuid)
    limit 1
    """
)
CONTEXT_RESOURCES = text(
    """
    select r.id::text as id, r.title, r.kind::text as kind
    from public.resources r
    where r.owner_id = cast(:user_id as uuid) and r.formation_id = cast(:formation_id as uuid)
      and r.deleted_at is null and r.status = 'ready'
      and exists (
        select 1 from public.chapters ch
        where ch.id = r.chapter_id and ch.module_id = cast(:module_id as uuid)
      )
    order by r.created_at, r.id
    """
)
CONTEXT_GAP = text(
    """
    select ns.notion_id::text as notion_id, n.label, ns.gap_nature::text as nature,
      ns.mastery::text as mastery, other.label as confused_with
    from public.notion_states ns
    join public.notions n on n.id = ns.notion_id
    left join public.notions other on other.id = ns.gap_confused_with
    where ns.user_id = cast(:user_id as uuid) and ns.gap_nature is not null
      and ns.gap_cleared_at is null
      and n.chapter_id = cast(:chapter_id as uuid)
    order by ns.mastery asc, ns.notion_id
    limit 1
    """
)
CONTEXT_SECTIONS = text(
    """
    select s.id::text as id, s.kind::text as kind, s.anchor, s.title, s.content_md, s.data,
      s.notion_ids
    from public.course_sections s
    where s.course_id = cast(:course_id as uuid) and s.chapter_id = cast(:chapter_id as uuid)
    order by s.position, s.id
    """
)
CONTEXT_NOTIONS = text(
    """
    select distinct n.id::text as id, n.label
    from public.notions n
    where n.module_id = cast(:module_id as uuid)
    order by n.label
    """
)
CONTEXT_CHUNKS = text(
    """
    select c.id::text as chunk_id, c.resource_id::text as resource_id, r.title,
      r.kind::text as kind, c.text, c.location
    from public.resource_chunks c
    join public.resources r on r.id = c.resource_id
    where r.owner_id = cast(:user_id as uuid) and r.formation_id = cast(:formation_id as uuid)
      and r.deleted_at is null and r.status = 'ready'
      and exists (
        select 1 from public.chapters ch
        where ch.id = r.chapter_id and ch.module_id = cast(:module_id as uuid)
      )
    order by c.position, c.id
    limit 24
    """
)

INSERT_LEARNER_MESSAGE = text(
    """
    insert into public.tutor_messages (conversation_id, user_id, role, content, context)
    values (
      cast(:conversation_id as uuid), cast(:user_id as uuid), 'learner', :content,
      cast(:context as jsonb)
    )
    returning id::text as id
    """
)
UPDATE_CONVERSATION_TITLE = text(
    """
    update public.tutor_conversations
    set title = coalesce(title, :title), updated_at = cast(:now as timestamptz)
    where id = cast(:id as uuid) and user_id = cast(:user_id as uuid)
    """
)
INSERT_TUTOR_MESSAGE = text(
    """
    insert into public.tutor_messages (
      conversation_id, user_id, role, content, context, sources, follow_ups, self_test
    ) values (
      cast(:conversation_id as uuid), cast(:user_id as uuid), 'tutor', :content,
      cast(:context as jsonb), cast(:sources as jsonb), cast(:follow_ups as text[]),
      cast(:self_test as jsonb)
    )
    returning id::text as id
    """
)
MARK_MESSAGE_ERROR = text(
    """
    update public.tutor_messages
    set context = coalesce(context, '{}'::jsonb) || cast(:payload as jsonb)
    where id = cast(:id as uuid) and user_id = cast(:user_id as uuid)
    """
)
COURSE_MODULE = text(
    """
    select module_id::text as module_id from public.courses
    where id = cast(:course_id as uuid) and owner_id = cast(:user_id as uuid)
    """
)

COUNT_SELF_TESTS = text(
    """
    select count(*)::int as total from public.tutor_messages m
    join public.tutor_conversations conv on conv.id = m.conversation_id
    where conv.id = cast(:conversation_id as uuid) and m.self_test is not null
    """
)
NOTIONS_OF_FORMATION = text(
    """
    select id::text as id from public.notions
    where formation_id = cast(:formation_id as uuid)
      and id = any(cast(:ids as uuid[]))
    """
)
CHUNKS_OF_OWNER = text(
    """
    select c.id::text as id, c.resource_id::text as resource_id
    from public.resource_chunks c
    join public.resources r on r.id = c.resource_id
    where r.owner_id = cast(:user_id as uuid)
      and c.id = any(cast(:ids as uuid[]))
    """
)
RESOURCES_OF_OWNER = text(
    """
    select
      id::text as id,
      kind::text as kind,
      (metadata->>'pages')::int as pages,
      (metadata->>'durationSec')::int as duration_sec,
      deleted_at
    from public.resources
    where owner_id = cast(:user_id as uuid)
      and id = any(cast(:ids as uuid[]))
    """
)
BRICKS_OF_OWNER = text(
    """
    select id::text as id from public.bricks
    where owner_id = cast(:user_id as uuid)
      and formation_id = cast(:formation_id as uuid)
      and id = any(cast(:ids as uuid[]))
    """
)
INSERT_BRICK = text(
    """
    insert into public.bricks (
      owner_id, formation_id, type, notion_ids, purpose, status, current_version
    ) values (
      cast(:user_id as uuid),
      cast(:formation_id as uuid),
      cast(:type as public.brick_type),
      cast(:notion_ids as uuid[]),
      cast(:purpose as public.brick_purpose),
      'active',
      1
    )
    returning id::text as id
    """
)
INSERT_BRICK_VERSION = text(
    """
    insert into public.brick_versions (
      brick_id, version, payload, fingerprint, origin, created_by
    ) values (
      cast(:brick_id as uuid),
      1,
      cast(:payload as jsonb),
      :fingerprint,
      cast(:origin as public.content_origin),
      'tutor'
    )
    """
)
SELECT_BRICK_VERSION = text(
    """
    select id::text as id from public.brick_versions
    where brick_id = cast(:brick_id as uuid) and version = :version
    limit 1
    """
)
ASSERT_ACTIVITY_ITEMS_OWNED = text(
    """
    select public.assert_activity_items_owned(
      cast(:owner_id as uuid),
      cast(:formation_id as uuid),
      cast(:items as jsonb)
    )
    """
)
INSERT_ACTIVITY = text(
    """
    insert into public.activities (
      owner_id, formation_id, module_id, kind, config, items, status
    ) values (
      cast(:owner_id as uuid), cast(:formation_id as uuid), cast(:module_id as uuid),
      cast(:kind as public.activity_kind), '{}'::jsonb, cast(:items as jsonb), 'ready'
    )
    returning id::text as id
    """
)
LOCK_ATTEMPT_NUMBER = text("select pg_advisory_xact_lock(hashtextextended(cast(:activity_id as text), 0))")
READ_ACTIVITY_FOR_ATTEMPT = text(
    """
    select id::text as id, status::text as status from public.activities
    where id = cast(:activity_id as uuid) and owner_id = cast(:user_id as uuid)
    for update
    """
)
NEXT_ATTEMPT_NO = text(
    """
    select coalesce(max(attempt_no), 0) + 1 as attempt_no
    from public.attempts
    where activity_id = cast(:activity_id as uuid) and user_id = cast(:user_id as uuid)
    """
)
INSERT_ATTEMPT = text(
    """
    insert into public.attempts (user_id, activity_id, attempt_no)
    values (cast(:user_id as uuid), cast(:activity_id as uuid), :attempt_no)
    on conflict (activity_id, user_id, attempt_no) do nothing
    returning id::text as id
    """
)

CONVERSATION_META = text(
    """
    select c.formation_id::text as formation_id, c.module_id::text as module_id,
      p.timezone, conv.course_id::text as course_id
    from public.tutor_conversations conv
    join public.courses c on c.id = conv.course_id
    join public.profiles p on p.id = conv.user_id
    where conv.id = cast(:conversation_id as uuid) and conv.user_id = cast(:user_id as uuid)
    """
)
PROFILE_TONE = text(
    """
    select tutor_tone::text as tutor_tone, course_language::text as course_language
    from public.profiles where id = cast(:user_id as uuid)
    """
)
RECORD_ANSWER = text(
    """
    insert into public.answers (
      attempt_id, brick_version_id, position, response, is_correct, score, max_score, graded_by,
      feedback
    ) values (
      cast(:attempt_id as uuid), cast(:brick_version_id as uuid), :position,
      cast(:response as jsonb), :is_correct, :score, :max_score,
      cast(:graded_by as public.grader), cast(:feedback as jsonb)
    )
    """
)
UPDATE_ATTEMPT_GRADED = text(
    """
    update public.attempts
    set status = 'graded', submitted_at = cast(:now as timestamptz),
        duration_ms = 0, score = :score,
        passed = :passed
    where id = cast(:attempt_id as uuid) and user_id = cast(:user_id as uuid)
    """
)
FLAG_NOTION_IN_REVIEW = text(
    """
    update public.notion_states
    set in_review = true,
        due_at = least(coalesce(due_at, cast(:end as timestamptz)), cast(:end as timestamptz)),
        updated_at = cast(:now as timestamptz)
    where user_id = cast(:user_id as uuid) and notion_id = cast(:notion_id as uuid)
    """
)
GLOBAL_QUIZ_SLOT = text(
    """
    select s.starts_at, p.timezone
    from public.schedule_slots s
    join public.profiles p on p.id = s.user_id
    where s.user_id = cast(:user_id as uuid) and s.formation_id = cast(:formation_id as uuid)
      and s.kind = 'global_quiz'
      and s.starts_at >= cast(:now as timestamptz)
    order by s.starts_at asc
    limit 1
    """
)
INSERT_SELF_TEST_ANSWER = text(
    """
    insert into public.tutor_messages (
      conversation_id, user_id, role, content, context, sources, follow_ups
    ) values (
      cast(:conversation_id as uuid), cast(:user_id as uuid), 'learner', :content,
      cast(:context as jsonb), '[]'::jsonb, '{}'::text[]
    )
    """
)
UPDATE_MESSAGE_SELF_TEST = text(
    """
    update public.tutor_messages
    set self_test = cast(:self_test as jsonb)
    where id = cast(:id as uuid) and user_id = cast(:user_id as uuid)
    """
)
INSERT_CORRECTION_MESSAGE = text(
    """
    insert into public.tutor_messages (
      conversation_id, user_id, role, content, context, sources, follow_ups, self_test
    ) values (
      cast(:conversation_id as uuid), cast(:user_id as uuid), 'tutor', :content,
      cast(:context as jsonb), '[]'::jsonb, cast(:follow_ups as text[]),
      cast(:self_test as jsonb)
    )
    returning id::text as id, role::text as role, content, sources, follow_ups, self_test, context,
      created_at
    """
)


async def rows(tx: Tx, statement: Any, params: Mapping[str, Any]) -> list[dict[str, Any]]:
    """Every row of a statement, as mappings."""
    result = await tx.conn.execute(statement, dict(params))
    return [dict(row) for row in result.mappings().all()]


async def one(tx: Tx, statement: Any, params: Mapping[str, Any]) -> dict[str, Any] | None:
    """The first row of a statement, or None."""
    result = await tx.conn.execute(statement, dict(params))
    found = result.mappings().all()
    return None if not found else dict(found[0])


async def execute(tx: Tx, statement: Any, params: Mapping[str, Any]) -> None:
    """Runs a statement whose result is not read."""
    await tx.conn.execute(statement, dict(params))
