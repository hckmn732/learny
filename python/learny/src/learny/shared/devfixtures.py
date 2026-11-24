"""Development fixtures of the SDD demonstration pages (SPEC-2302).

The module is reached only through the demonstration handlers, themselves behind the
`ENABLE_SDD_PAGES` guard, and the callers allowed to open a service transaction are listed in
`learny.shared.db.privileged`.
"""

import json
from collections.abc import AsyncIterator, Mapping
from contextlib import asynccontextmanager
from dataclasses import dataclass
from typing import Any

from sqlalchemy import text

from learny.shared.db.uow import Tx
from learny.shared.locale_fr import dev_sdd_fixtures as texts

INSERT_USER = text(
    "insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, "
    "raw_app_meta_data, created_at, updated_at) values (gen_random_uuid(), "
    "'00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', :email, "
    "cast(:metadata as jsonb), cast(:app_metadata as jsonb), now(), now()) "
    "returning id::text as id"
)
APP_METADATA = json.dumps({"provider": "email", "providers": ["email"]})


@dataclass(frozen=True, slots=True)
class DevUser:
    """The account a factory created; the sign-up trigger builds every dependent row (EF-1)."""

    id: str
    email: str


@dataclass(frozen=True, slots=True)
class TestProgramme:
    formation_id: str
    module_ids: list[str]
    chapter_ids: list[str]
    notion_ids: list[str]


@dataclass(frozen=True, slots=True)
class TestCourse:
    course_id: str
    formation_id: str
    module_id: str
    chapter_ids: list[str]
    section_ids: list[str]


async def rows(conn: Any, statement: str, **parameters: Any) -> list[Mapping[str, Any]]:
    result = await conn.execute(text(statement), parameters)
    return list(result.mappings().all())


async def one(conn: Any, statement: str, **parameters: Any) -> Mapping[str, Any]:
    found = await rows(conn, statement, **parameters)
    if not found:
        raise LookupError(f"no row returned by: {statement.strip()[:80]}")
    return found[0]


async def identifier(conn: Any, statement: str, **parameters: Any) -> str:
    return str((await one(conn, statement, **parameters))["id"])


def _non_negative(value: int, name: str) -> int:
    """`positive`: a factory refuses a count that is not a non-negative integer."""
    if isinstance(value, bool) or not isinstance(value, int) or value < 0:
        raise ValueError(f"devfixtures: {name} must be a non-negative integer.")
    return value


@asynccontextmanager
async def dev_service_tx(deps: Any) -> AsyncIterator[Tx]:
    """Owner-role transaction of a demonstration that must commit its own fixture or cleanup."""
    async with deps.db.service_tx() as tx:
        yield tx


async def create_user(
    conn: Any,
    *,
    email: str,
    first_name: str | None = None,
    last_name: str | None = None,
    timezone: str | None = None,
    meta: Mapping[str, Any] | None = None,
) -> DevUser:
    """Inserts the Auth user; the profile row is created by the database trigger."""
    metadata: dict[str, Any] = {
        "first_name": first_name,
        "last_name": last_name,
        "timezone": timezone,
        **(dict(meta) if meta is not None else {}),
    }
    row = await one(
        conn,
        INSERT_USER.text,
        email=email,
        metadata=json.dumps(metadata, ensure_ascii=False),
        app_metadata=APP_METADATA,
    )
    return DevUser(id=str(row["id"]), email=email)


async def create_programme(
    conn: Any,
    owner_id: str,
    *,
    modules: int = 2,
    chapters_per_module: int = 2,
    notions_per_chapter: int = 2,
    title: str | None = None,
) -> TestProgramme:
    """An active formation with an ordered programme: positions start at 1 (SPEC-103 section 9)."""
    module_count = _non_negative(modules, "modules")
    chapter_count = _non_negative(chapters_per_module, "chaptersPerModule")
    notion_count = _non_negative(notions_per_chapter, "notionsPerChapter")
    formation_id = await identifier(
        conn,
        """
        insert into public.formations (owner_id, title, objectives, status)
        values (cast(:owner as uuid), :title,
                '{operational}'::public.formation_objective[], 'active')
        returning id::text as id
        """,
        owner=owner_id,
        title=title if title is not None else texts.PROGRAMME_TITLE,
    )
    module_ids: list[str] = []
    chapter_ids: list[str] = []
    notion_ids: list[str] = []
    for module_position in range(1, module_count + 1):
        module_id = await identifier(
            conn,
            """
            insert into public.modules (formation_id, position, title)
            values (cast(:formation as uuid), :position, :title)
            returning id::text as id
            """,
            formation=formation_id,
            position=module_position,
            title=texts.MODULE_TITLE.format(position=module_position),
        )
        module_ids.append(module_id)
        for chapter_position in range(1, chapter_count + 1):
            chapter_id = await identifier(
                conn,
                """
                insert into public.chapters (module_id, formation_id, position, title)
                values (cast(:module as uuid), cast(:formation as uuid), :position, :title)
                returning id::text as id
                """,
                module=module_id,
                formation=formation_id,
                position=chapter_position,
                title=texts.CHAPTER_TITLE.format(module=module_position, chapter=chapter_position),
            )
            chapter_ids.append(chapter_id)
            for notion_position in range(1, notion_count + 1):
                notion_ids.append(
                    await identifier(
                        conn,
                        """
                        insert into public.notions (
                          formation_id, module_id, chapter_id, label, short_definition, position
                        )
                        values (
                          cast(:formation as uuid), cast(:module as uuid), cast(:chapter as uuid),
                          :label, :definition, :position
                        )
                        returning id::text as id
                        """,
                        formation=formation_id,
                        module=module_id,
                        chapter=chapter_id,
                        label=texts.NOTION_LABEL.format(
                            module=module_position,
                            chapter=chapter_position,
                            notion=notion_position,
                        ),
                        definition=texts.NOTION_DEFINITION.format(position=notion_position),
                        position=notion_position,
                    )
                )
    return TestProgramme(
        formation_id=formation_id,
        module_ids=module_ids,
        chapter_ids=chapter_ids,
        notion_ids=notion_ids,
    )


async def create_course(
    conn: Any,
    *,
    owner_id: str,
    module_id: str,
    sections_per_chapter: int = 1,
) -> TestCourse:
    """A ready course version on a module of the programme, one section per chapter by default."""
    count = _non_negative(sections_per_chapter, "sectionsPerChapter")
    module = await one(
        conn,
        "select formation_id::text as formation_id from public.modules where id = cast(:id as uuid)",
        id=module_id,
    )
    chapters = await rows(
        conn,
        "select id::text as id from public.chapters where module_id = cast(:id as uuid) order by position",
        id=module_id,
    )
    course_id = await identifier(
        conn,
        """
        insert into public.courses (owner_id, formation_id, module_id, version, status)
        values (cast(:owner as uuid), cast(:formation as uuid), cast(:module as uuid), 1, 'ready')
        returning id::text as id
        """,
        owner=owner_id,
        formation=module["formation_id"],
        module=module_id,
    )
    chapter_ids: list[str] = []
    section_ids: list[str] = []
    for chapter_index, chapter in enumerate(chapters):
        chapter_ids.append(str(chapter["id"]))
        for position in range(1, count + 1):
            section_ids.append(
                await identifier(
                    conn,
                    """
                    insert into public.course_sections (
                      course_id, owner_id, chapter_id, position, kind, anchor, title, content_md,
                      origin
                    )
                    values (
                      cast(:course as uuid), cast(:owner as uuid), cast(:chapter as uuid),
                      :position, 'text', :anchor, :title, :content, 'tutor'
                    )
                    returning id::text as id
                    """,
                    course=course_id,
                    owner=owner_id,
                    chapter=chapter["id"],
                    position=position,
                    anchor=texts.COURSE_SECTION_ANCHOR.format(chapter=chapter_index + 1, position=position),
                    title=texts.COURSE_SECTION_TITLE.format(position=position),
                    content=texts.COURSE_SECTION_CONTENT.format(position=position),
                )
            )
    return TestCourse(
        course_id=course_id,
        formation_id=str(module["formation_id"]),
        module_id=module_id,
        chapter_ids=chapter_ids,
        section_ids=section_ids,
    )


async def create_group(
    conn: Any,
    *,
    formation_id: str,
    owner_id: str,
    invite_code: str,
    joined_at: str | None = None,
) -> str:
    """Creates the group, its owner membership and the formation link (SPEC-111 EF-1)."""
    group_id = await identifier(
        conn,
        """
        insert into public.groups (formation_id, owner_id, invite_code)
        values (cast(:formation as uuid), cast(:owner as uuid), :code)
        returning id::text as id
        """,
        formation=formation_id,
        owner=owner_id,
        code=invite_code,
    )
    await conn.execute(
        text(
            """
            insert into public.group_members (group_id, user_id, role, member_status, joined_at)
            values (cast(:group as uuid), cast(:owner as uuid), 'owner', 'active',
                    coalesce(cast(:joined as timestamptz), now()))
            """
        ),
        {"group": group_id, "owner": owner_id, "joined": joined_at},
    )
    await conn.execute(
        text(
            "update public.formations set group_id = cast(:group as uuid) where id = cast(:formation as uuid)"
        ),
        {"group": group_id, "formation": formation_id},
    )
    return group_id


async def join_group(conn: Any, group_id: str, user_id: str, *, joined_at: str) -> None:
    """Adds a member without emitting the member event: the demonstration counts rows only."""
    await conn.execute(
        text(
            """
            insert into public.group_members (group_id, user_id, role, joined_at)
            values (cast(:group as uuid), cast(:user as uuid), 'member',
                    cast(:joined as timestamptz))
            """
        ),
        {"group": group_id, "user": user_id, "joined": joined_at},
    )


def json_value(value: Any) -> Any:
    """A `jsonb` column decoded the way the driver returns it."""
    if isinstance(value, str):
        return json.loads(value)
    return value


async def add_brick_version(
    conn: Any,
    *,
    brick_id: str,
    version: int,
    payload: Mapping[str, Any],
    origin: str,
    created_by: str,
) -> str:
    """Appends an immutable version and raises `bricks.current_version` (SPEC-106 EF-2)."""
    version_id = await identifier(
        conn,
        """
        insert into public.brick_versions (brick_id, version, payload, origin, created_by)
        values (cast(:brick as uuid), :version, cast(:payload as jsonb),
                cast(:origin as public.content_origin), cast(:created_by as public.actor))
        returning id::text as id
        """,
        brick=brick_id,
        version=version,
        payload=json.dumps(dict(payload), ensure_ascii=False),
        origin=origin,
        created_by=created_by,
    )
    await conn.execute(
        text(
            "update public.bricks set current_version = greatest(current_version, :version) "
            "where id = cast(:brick as uuid)"
        ),
        {"version": version, "brick": brick_id},
    )
    return version_id


async def create_activity(
    conn: Any,
    *,
    owner_id: str,
    formation_id: str,
    module_id: str | None,
    kind: str,
    config: Mapping[str, Any],
    items: list[Mapping[str, Any]],
    status: str,
    for_date: str | None,
) -> str:
    """Creates an activity; a `ready` one is checked by the transactional assembly guard."""
    encoded = json.dumps([dict(item) for item in items], ensure_ascii=False)
    if status == "ready":
        await conn.execute(
            text(
                "select public.assert_activity_items_owned("
                "cast(:owner as uuid), cast(:formation as uuid), cast(:items as jsonb))"
            ),
            {"owner": owner_id, "formation": formation_id, "items": encoded},
        )
    return await identifier(
        conn,
        """
        insert into public.activities (
          owner_id, formation_id, module_id, kind, config, items, status, for_date
        )
        values (
          cast(:owner as uuid), cast(:formation as uuid), cast(:module as uuid),
          cast(:kind as public.activity_kind), cast(:config as jsonb), cast(:items as jsonb),
          cast(:status as public.activity_status), cast(:for_date as date)
        )
        returning id::text as id
        """,
        owner=owner_id,
        formation=formation_id,
        module=module_id,
        kind=kind,
        config=json.dumps(dict(config), ensure_ascii=False),
        items=encoded,
        status=status,
        for_date=for_date,
    )


async def create_attempt(conn: Any, *, user_id: str, activity_id: str) -> str:
    """The next attempt of an activity, serialised on the activity row (SPEC-106 EF-4, CL-4)."""
    await conn.execute(
        text("select pg_advisory_xact_lock(hashtextextended(cast(:activity as text), 0))"),
        {"activity": activity_id},
    )
    row = await one(
        conn,
        "select id::text as id, status::text as status from public.activities "
        "where id = cast(:id as uuid) and owner_id = cast(:owner as uuid) for update",
        id=activity_id,
        owner=user_id,
    )
    if str(row["status"]) != "ready":
        raise ValueError("an attempt requires a ready activity")
    return await identifier(
        conn,
        """
        insert into public.attempts (user_id, activity_id, attempt_no)
        select cast(:user as uuid), cast(:activity as uuid), coalesce(max(attempt_no), 0) + 1
        from public.attempts
        where activity_id = cast(:activity as uuid) and user_id = cast(:user as uuid)
        returning id::text as id
        """,
        user=user_id,
        activity=activity_id,
    )


async def record_answer(
    conn: Any,
    *,
    attempt_id: str,
    brick_version_id: str,
    position: int,
    response: Mapping[str, Any],
    is_correct: bool | None = None,
    score: float | None = None,
    max_score: float | None = None,
    time_ms: int | None = None,
    graded_by: str | None = None,
    feedback: Mapping[str, Any] | None = None,
    chosen_distractor_notion_id: str | None = None,
    marked_for_review: bool = False,
) -> str:
    """Records one answer at its position; the version shown is kept (SPEC-106 EF-5)."""
    if not isinstance(position, int) or position < 1:
        raise ValueError("position must be an integer greater than or equal to 1")
    if score is not None and max_score is not None and score > max_score:
        raise ValueError("score cannot exceed maxScore")
    return await identifier(
        conn,
        """
        insert into public.answers (
          attempt_id, brick_version_id, position, response, is_correct, score, max_score,
          time_ms, graded_by, feedback, chosen_distractor_notion_id, marked_for_review
        )
        values (
          cast(:attempt as uuid), cast(:version as uuid), :position, cast(:response as jsonb),
          :is_correct, cast(:score as numeric), cast(:max_score as numeric), :time_ms,
          cast(:graded_by as public.grader), cast(:feedback as jsonb),
          cast(:distractor as uuid), :marked
        )
        returning id::text as id
        """,
        attempt=attempt_id,
        version=brick_version_id,
        position=position,
        response=json.dumps(dict(response), ensure_ascii=False),
        is_correct=is_correct,
        score=None if score is None else str(score),
        max_score=None if max_score is None else str(max_score),
        time_ms=time_ms,
        graded_by=graded_by,
        feedback=None if feedback is None else json.dumps(dict(feedback), ensure_ascii=False),
        distractor=chosen_distractor_notion_id,
        marked=marked_for_review,
    )


async def create_notion_state(
    conn: Any,
    *,
    user_id: str,
    notion_id: str,
    fsrs: Mapping[str, Any],
    due_at: str | None,
    in_review: bool,
    mastery: float = 0,
    success_count: int = 0,
) -> None:
    """The initial state of a notion; an existing row is left untouched (SPEC-107 EF-1)."""
    await conn.execute(
        text(
            """
            insert into public.notion_states (
              user_id, notion_id, fsrs, due_at, mastery, success_count, in_review
            )
            values (
              cast(:user as uuid), cast(:notion as uuid), cast(:fsrs as jsonb),
              cast(:due_at as timestamptz), cast(:mastery as numeric), :success_count, :in_review
            )
            on conflict (user_id, notion_id) do nothing
            """
        ),
        {
            "user": user_id,
            "notion": notion_id,
            "fsrs": json.dumps(dict(fsrs), ensure_ascii=False),
            "due_at": due_at,
            "mastery": str(mastery),
            "success_count": success_count,
            "in_review": in_review,
        },
    )


async def apply_review(
    conn: Any,
    *,
    user_id: str,
    notion_id: str,
    expected_revision: int,
    fsrs_before: Mapping[str, Any],
    fsrs_after: Mapping[str, Any],
    mastery: float,
    success_count: int,
    in_review: bool,
    reviewed_at: str,
    source: str,
    grade: str,
    correct: bool | None = None,
    time_ms: int | None = None,
) -> int:
    """Applies one revision and appends its log; returns the new revision (SPEC-107 EF-3)."""
    row = await one(
        conn,
        "select revision from public.notion_states "
        "where user_id = cast(:user as uuid) and notion_id = cast(:notion as uuid) for update",
        user=user_id,
        notion=notion_id,
    )
    current = int(row["revision"])
    if current != expected_revision:
        raise ValueError("the notion was revised in the meantime")
    await conn.execute(
        text(
            """
            update public.notion_states
            set fsrs = cast(:fsrs as jsonb), due_at = cast(:due_at as timestamptz),
                mastery = cast(:mastery as numeric), success_count = :success_count,
                in_review = :in_review, last_seen_at = cast(:reviewed_at as timestamptz),
                revision = revision + 1
            where user_id = cast(:user as uuid) and notion_id = cast(:notion as uuid)
            """
        ),
        {
            "user": user_id,
            "notion": notion_id,
            "fsrs": json.dumps(dict(fsrs_after), ensure_ascii=False),
            "due_at": str(fsrs_after["due"]),
            "mastery": str(mastery),
            "success_count": success_count,
            "in_review": in_review,
            "reviewed_at": reviewed_at,
        },
    )
    await conn.execute(
        text(
            """
            insert into public.review_logs (
              user_id, notion_id, source, grade, correct, time_ms, reviewed_at, fsrs_before,
              fsrs_after
            )
            values (
              cast(:user as uuid), cast(:notion as uuid), cast(:source as public.review_source),
              cast(:grade as public.fsrs_grade), :correct, :time_ms,
              cast(:reviewed_at as timestamptz), cast(:before as jsonb), cast(:after as jsonb)
            )
            """
        ),
        {
            "user": user_id,
            "notion": notion_id,
            "source": source,
            "grade": grade,
            "correct": correct,
            "time_ms": time_ms,
            "reviewed_at": reviewed_at,
            "before": json.dumps(dict(fsrs_before), ensure_ascii=False),
            "after": json.dumps(dict(fsrs_after), ensure_ascii=False),
        },
    )
    return current + 1


async def detect_gap(
    conn: Any,
    *,
    user_id: str,
    notion_id: str,
    expected_revision: int,
    nature: str,
    confused_with: str | None,
    evidence: Mapping[str, Any] | None,
    detected_at: str,
) -> None:
    """Records the active gap and its event in the same transaction (SPEC-107 EF-2, EF-4)."""
    row = await one(
        conn,
        "select revision from public.notion_states "
        "where user_id = cast(:user as uuid) and notion_id = cast(:notion as uuid) for update",
        user=user_id,
        notion=notion_id,
    )
    if int(row["revision"]) != expected_revision:
        raise ValueError("the notion was revised in the meantime")
    await conn.execute(
        text(
            """
            update public.notion_states
            set gap_nature = cast(:nature as public.gap_nature),
                gap_confused_with = cast(:confused as uuid),
                gap_detected_at = cast(:detected_at as timestamptz),
                gap_evidence = :evidence, gap_cleared_at = null, revision = revision + 1
            where user_id = cast(:user as uuid) and notion_id = cast(:notion as uuid)
            """
        ),
        {
            "user": user_id,
            "notion": notion_id,
            "nature": nature,
            "confused": confused_with,
            "detected_at": detected_at,
            "evidence": None if evidence is None else json.dumps(dict(evidence), ensure_ascii=False),
        },
    )
    await conn.execute(
        text(
            """
            insert into public.gap_events (user_id, notion_id, kind, nature, evidence, created_at)
            values (cast(:user as uuid), cast(:notion as uuid), 'detected',
                    cast(:nature as public.gap_nature), cast(:evidence as jsonb),
                    cast(:created_at as timestamptz))
            """
        ),
        {
            "user": user_id,
            "notion": notion_id,
            "nature": nature,
            "evidence": None if evidence is None else json.dumps(dict(evidence), ensure_ascii=False),
            "created_at": detected_at,
        },
    )


async def get_due_notion_states(conn: Any, *, user_id: str, now: str) -> list[Mapping[str, Any]]:
    """Due notions of one learner, in due order (SPEC-107 EF-5, CL-7)."""
    return await rows(
        conn,
        """
        select notion_id::text as notion_id, due_at, in_review, suspended, revision,
               gap_nature::text as gap_nature, gap_confused_with::text as gap_confused_with,
               gap_detected_at, gap_evidence, gap_cleared_at
        from public.notion_states
        where user_id = cast(:user as uuid) and in_review = true and suspended = false
          and due_at <= cast(:now as timestamptz)
        order by due_at, notion_id
        """,
        user=user_id,
        now=now,
    )


async def get_review_history(
    conn: Any, *, user_id: str, notion_id: str, limit: int = 50
) -> list[Mapping[str, Any]]:
    """One notion's revision log, oldest first (SPEC-107 EF-3, CA-4)."""
    return await rows(
        conn,
        """
        select reviewed_at, source::text as source, grade::text as grade, correct, time_ms,
               fsrs_before, fsrs_after
        from public.review_logs
        where user_id = cast(:user as uuid) and notion_id = cast(:notion as uuid)
        order by reviewed_at, id
        limit :limit
        """,
        user=user_id,
        notion=notion_id,
        limit=limit,
    )
