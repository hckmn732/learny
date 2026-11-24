"""Fixtures of the RLS matrix replay.

Every row is written by the owner role; the probes then act as `authenticated`. The seed mirrors the
reference fixture one table at a time so a missing or renamed column fails loudly here too.
"""

import json
from collections.abc import Awaitable, Callable, Mapping
from dataclasses import dataclass, field
from typing import Any

from sqlalchemy import text

FIXED = "2026-11-11T12:20:00.000Z"
INVITE_CODE = "LRN-RS34"


@dataclass(frozen=True, slots=True)
class TestProgramme:
    formation_id: str
    module_ids: list[str]
    chapter_ids: list[str]
    notion_ids: list[str]


@dataclass(frozen=True, slots=True)
class Seed:
    a: str
    b: str
    c: str
    programme: TestProgramme
    group_id: str
    course_id: str
    section_id: str
    resource_id: str
    brick_id: str
    brick_version_id: str
    activity_id: str
    attempt_id: str
    conversation_id: str
    notification_id: str
    rows: Mapping[str, str] = field(default_factory=dict)


def fsrs_card() -> str:
    return json.dumps(
        {
            "due": "2026-11-12T12:20:00.000Z",
            "stability": 1.5,
            "difficulty": 4.2,
            "elapsed_days": 0,
            "scheduled_days": 1,
            "reps": 1,
            "lapses": 0,
            "state": 2,
            "last_review": FIXED,
        }
    )


async def rows(conn: Any, statement: str, **parameters: Any) -> list[Mapping[str, Any]]:
    result = await conn.execute(text(statement), parameters)
    return list(result.mappings().all())


async def one(conn: Any, statement: str, **parameters: Any) -> Mapping[str, Any]:
    found = await rows(conn, statement, **parameters)
    if not found:
        raise AssertionError(f"no row returned by: {statement.strip()[:80]}")
    return found[0]


async def identifier(conn: Any, statement: str, **parameters: Any) -> str:
    return str((await one(conn, statement, **parameters))["id"])


async def create_test_user(conn: Any, first_name: str) -> str:
    """Inserts the Auth user; the profile row is created by the database trigger."""
    email = f"rls-{first_name.lower()}@test.learny.test"
    row = await one(
        conn,
        """
        insert into auth.users (
          id, instance_id, aud, role, email, raw_user_meta_data, raw_app_meta_data,
          created_at, updated_at
        )
        values (
          gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated',
          'authenticated', :email, cast(:metadata as jsonb), cast(:app_metadata as jsonb),
          now(), now()
        )
        returning id::text as id
        """,
        email=email,
        metadata=json.dumps({"first_name": first_name, "last_name": None, "timezone": None}),
        app_metadata=json.dumps({"provider": "email", "providers": ["email"]}),
    )
    return str(row["id"])


async def create_test_programme(conn: Any, owner_id: str) -> TestProgramme:
    formation_id = await identifier(
        conn,
        """
        insert into public.formations (owner_id, title, objectives, status)
        values (cast(:owner as uuid), 'Programme partage RLS',
                '{operational}'::public.formation_objective[], 'active')
        returning id::text as id
        """,
        owner=owner_id,
    )
    module_ids: list[str] = []
    chapter_ids: list[str] = []
    notion_ids: list[str] = []
    for module_position in (1, 2):
        module_id = await identifier(
            conn,
            """
            insert into public.modules (formation_id, position, title)
            values (cast(:formation as uuid), :position, :title)
            returning id::text as id
            """,
            formation=formation_id,
            position=module_position,
            title=f"Partie {module_position}",
        )
        module_ids.append(module_id)
        for chapter_position in (1, 2):
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
                title=f"Chapitre {module_position}.{chapter_position}",
            )
            chapter_ids.append(chapter_id)
            for notion_position in (1, 2):
                notion_id = await identifier(
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
                    label=f"Notion {module_position}.{chapter_position}.{notion_position}",
                    definition=f"Definition courte {notion_position}",
                    position=notion_position,
                )
                notion_ids.append(notion_id)
    return TestProgramme(
        formation_id=formation_id,
        module_ids=module_ids,
        chapter_ids=chapter_ids,
        notion_ids=notion_ids,
    )


async def create_test_course(conn: Any, owner_id: str, module_id: str) -> tuple[str, list[str]]:
    """A ready course on `module_id` with two sections per chapter; returns (course, sections)."""
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
    section_ids: list[str] = []
    for chapter_index, chapter in enumerate(chapters):
        for position in (1, 2):
            section_ids.append(
                await identifier(
                    conn,
                    """
                    insert into public.course_sections (
                      course_id, owner_id, chapter_id, position, kind, anchor, title, content_md, origin
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
                    anchor=f"section-{chapter_index + 1}-{position}",
                    title=f"Section {position}",
                    content=f"Section content {position}.",
                )
            )
    return course_id, section_ids


async def create_group(conn: Any, formation_id: str, owner_id: str) -> str:
    """Creates the group and binds it to the formation: `is_formation_member` reads that link."""
    group_id = await identifier(
        conn,
        """
        insert into public.groups (formation_id, owner_id, invite_code)
        values (cast(:formation as uuid), cast(:owner as uuid), :code)
        returning id::text as id
        """,
        formation=formation_id,
        owner=owner_id,
        code=INVITE_CODE,
    )
    await conn.execute(
        text(
            "update public.formations set group_id = cast(:group as uuid) where id = cast(:formation as uuid)"
        ),
        {"group": group_id, "formation": formation_id},
    )
    return group_id


async def join_group(conn: Any, group_id: str, user_id: str) -> None:
    await conn.execute(
        text(
            """
            insert into public.group_members (group_id, user_id, role, joined_at)
            values (cast(:group as uuid), cast(:user as uuid), 'member', cast(:joined as timestamptz))
            """
        ),
        {"group": group_id, "user": user_id, "joined": FIXED},
    )


async def create_seed(conn: Any) -> Seed:
    """Builds the three learners, the shared programme and one owned row per table of the matrix."""
    a = await create_test_user(conn, "Alice")
    b = await create_test_user(conn, "Bob")
    c = await create_test_user(conn, "Carol")
    programme = await create_test_programme(conn, a)
    group_id = await create_group(conn, programme.formation_id, a)
    await join_group(conn, group_id, b)
    course_id, section_ids = await create_test_course(conn, a, programme.module_ids[0])
    section_id = section_ids[0]
    formation = programme.formation_id
    module1 = programme.module_ids[0]
    chapter1 = programme.chapter_ids[0]
    notion1, notion2, notion3, notion4 = programme.notion_ids[:4]
    owned: dict[str, str] = {
        "profiles": a,
        "study_preferences": a,
        "notification_settings": a,
        "offline_sync_receipts": a,
        "automation_settings": a,
        "chapter_progress": a,
        "module_progress": a,
        "daily_activity": a,
        "notion_states": a,
        "reading_progress": a,
        "subscriptions": a,
        "ai_task_models": a,
        "group_members": b,
    }
    owned["push_subscriptions"] = await identifier(
        conn,
        """
        insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
        values (cast(:user as uuid), 'https://push.test.learny.test/rls-a', 'p256dh', 'auth')
        returning id::text as id
        """,
        user=a,
    )
    owned["pauses"] = await identifier(
        conn,
        """
        insert into public.pauses (user_id, starts_on, ends_on)
        values (cast(:user as uuid), '2026-11-12', '2026-11-20')
        returning id::text as id
        """,
        user=a,
    )
    await conn.execute(
        text(
            "insert into public.offline_sync_receipts (user_id, client_id, status) "
            "values (cast(:user as uuid), '5eed0000-0000-4000-8000-000000000001'::uuid, 'applied')"
        ),
        {"user": a},
    )
    await conn.execute(
        text(
            "insert into public.chapter_progress (user_id, chapter_id) "
            "values (cast(:user as uuid), cast(:chapter as uuid))"
        ),
        {"user": a, "chapter": chapter1},
    )
    await conn.execute(
        text(
            "insert into public.module_progress (user_id, module_id, status) "
            "values (cast(:user as uuid), cast(:module as uuid), 'open')"
        ),
        {"user": a, "module": module1},
    )
    resource_id = await identifier(
        conn,
        """
        insert into public.resources (owner_id, formation_id, chapter_id, kind, title, content_text)
        values (cast(:owner as uuid), cast(:formation as uuid), cast(:chapter as uuid),
                'note', 'Note privee', 'secret')
        returning id::text as id
        """,
        owner=a,
        formation=formation,
        chapter=chapter1,
    )
    owned["resources"] = resource_id
    owned["resource_chunks"] = await identifier(
        conn,
        """
        insert into public.resource_chunks (
          resource_id, owner_id, formation_id, chapter_id, position, text, location
        )
        values (cast(:resource as uuid), cast(:owner as uuid), cast(:formation as uuid),
                cast(:chapter as uuid), 1, 'Passage prive', cast(:location as jsonb))
        returning id::text as id
        """,
        resource=resource_id,
        owner=a,
        formation=formation,
        chapter=chapter1,
        location=json.dumps({"charStart": 0, "charEnd": 13}),
    )
    owned["courses"] = course_id
    owned["question_bank_jobs"] = await identifier(
        conn,
        """
        insert into public.question_bank_jobs
          (user_id, formation_id, notion_id, course_id, format, reason)
        values (cast(:user as uuid), cast(:formation as uuid), cast(:notion as uuid),
                cast(:course as uuid), 'choice_question', 'manual')
        returning id::text as id
        """,
        user=a,
        formation=formation,
        notion=notion1,
        course=course_id,
    )
    owned["course_sections"] = section_id
    owned["course_section_revisions"] = await identifier(
        conn,
        """
        insert into public.course_section_revisions
          (section_id, owner_id, version, title, content_md, edited_by)
        values (cast(:section as uuid), cast(:owner as uuid), 1, 'Ancienne section',
                'Ancien contenu', 'learner')
        returning id::text as id
        """,
        section=section_id,
        owner=a,
    )
    owned["course_section_reports"] = await identifier(
        conn,
        """
        insert into public.course_section_reports (owner_id, section_id, reason)
        values (cast(:owner as uuid), cast(:section as uuid), 'Signalement de test')
        returning id::text as id
        """,
        owner=a,
        section=section_id,
    )
    owned["citations"] = await identifier(
        conn,
        """
        insert into public.citations (section_id, owner_id, label, media_kind, quote)
        values (cast(:section as uuid), cast(:owner as uuid), 'Guide p 1', 'pdf', 'citation privee')
        returning id::text as id
        """,
        section=section_id,
        owner=a,
    )
    await conn.execute(
        text(
            "insert into public.reading_progress (user_id, course_id, chapter_id, percent) "
            "values (cast(:user as uuid), cast(:course as uuid), cast(:chapter as uuid), 10)"
        ),
        {"user": a, "course": course_id, "chapter": chapter1},
    )
    owned["chapter_summaries"] = await identifier(
        conn,
        """
        insert into public.chapter_summaries (user_id, chapter_id, course_id, text)
        values (cast(:user as uuid), cast(:chapter as uuid), cast(:course as uuid), 'Resume prive')
        returning id::text as id
        """,
        user=a,
        chapter=chapter1,
        course=course_id,
    )
    conversation_id = await identifier(
        conn,
        """
        insert into public.tutor_conversations (user_id, course_id, title)
        values (cast(:user as uuid), cast(:course as uuid), 'Discussion privee')
        returning id::text as id
        """,
        user=a,
        course=course_id,
    )
    owned["tutor_conversations"] = conversation_id
    owned["tutor_messages"] = await identifier(
        conn,
        """
        insert into public.tutor_messages (conversation_id, user_id, role, content)
        values (cast(:conversation as uuid), cast(:user as uuid), 'learner', 'question privee')
        returning id::text as id
        """,
        conversation=conversation_id,
        user=a,
    )
    brick_id = await identifier(
        conn,
        """
        insert into public.bricks (owner_id, formation_id, type, purpose)
        values (cast(:owner as uuid), cast(:formation as uuid), 'text', 'course')
        returning id::text as id
        """,
        owner=a,
        formation=formation,
    )
    owned["bricks"] = brick_id
    brick_version_id = await identifier(
        conn,
        """
        insert into public.brick_versions (brick_id, version, payload, origin, created_by)
        values (cast(:brick as uuid), 1, '{}'::jsonb, 'tutor', 'tutor')
        returning id::text as id
        """,
        brick=brick_id,
    )
    owned["brick_versions"] = brick_version_id
    owned["brick_reports"] = await identifier(
        conn,
        """
        insert into public.brick_reports (user_id, brick_id, brick_version_id, reason)
        values (cast(:user as uuid), cast(:brick as uuid), cast(:version as uuid), 'signalement prive')
        returning id::text as id
        """,
        user=a,
        brick=brick_id,
        version=brick_version_id,
    )
    activity_id = await identifier(
        conn,
        """
        insert into public.activities (owner_id, formation_id, kind, items)
        values (cast(:owner as uuid), cast(:formation as uuid), 'exercise', '[]'::jsonb)
        returning id::text as id
        """,
        owner=a,
        formation=formation,
    )
    owned["activities"] = activity_id
    attempt_id = await identifier(
        conn,
        """
        insert into public.attempts (user_id, activity_id, attempt_no)
        values (cast(:user as uuid), cast(:activity as uuid), 1)
        returning id::text as id
        """,
        user=a,
        activity=activity_id,
    )
    owned["attempts"] = attempt_id
    owned["answers"] = await identifier(
        conn,
        """
        insert into public.answers (attempt_id, brick_version_id, position, response)
        values (cast(:attempt as uuid), cast(:version as uuid), 1, '{}'::jsonb)
        returning id::text as id
        """,
        attempt=attempt_id,
        version=brick_version_id,
    )
    await conn.execute(
        text(
            "insert into public.notion_states (user_id, notion_id, fsrs) "
            "values (cast(:user as uuid), cast(:notion as uuid), cast(:fsrs as jsonb))"
        ),
        {"user": a, "notion": notion1, "fsrs": fsrs_card()},
    )
    owned["review_logs"] = await identifier(
        conn,
        """
        insert into public.review_logs (user_id, notion_id, source, grade, reviewed_at)
        values (cast(:user as uuid), cast(:notion as uuid), 'validation', 'good',
                cast(:reviewed as timestamptz))
        returning id::text as id
        """,
        user=a,
        notion=notion1,
        reviewed=FIXED,
    )
    owned["gap_events"] = await identifier(
        conn,
        """
        insert into public.gap_events (user_id, notion_id, kind, nature)
        values (cast(:user as uuid), cast(:notion as uuid), 'detected', 'forgetting')
        returning id::text as id
        """,
        user=a,
        notion=notion1,
    )
    owned["schedule_slots"] = await identifier(
        conn,
        """
        insert into public.schedule_slots
          (user_id, formation_id, kind, title, starts_at, ends_at, created_by)
        values (cast(:user as uuid), cast(:formation as uuid), 'course', 'Seance privee',
                '2026-11-11T17:00:00Z'::timestamptz, '2026-11-11T18:00:00Z'::timestamptz,
                'planner')
        returning id::text as id
        """,
        user=a,
        formation=formation,
    )
    owned["automation_actions"] = await identifier(
        conn,
        """
        insert into public.automation_actions
          (user_id, formation_id, automation, kind, summary, status, requires_consent)
        values (cast(:user as uuid), cast(:formation as uuid), 'reprise', 'reprise_proposed',
                'Reprendre la seance', 'pending_consent', true)
        returning id::text as id
        """,
        user=a,
        formation=formation,
    )
    await conn.execute(
        text(
            "insert into public.daily_activity (user_id, day, minutes, qualifying) "
            "values (cast(:user as uuid), '2026-11-11', 20, true)"
        ),
        {"user": a},
    )
    owned["milestones"] = await identifier(
        conn,
        """
        insert into public.milestones (user_id, formation_id, key, ref_id, achieved_at)
        values (cast(:user as uuid), cast(:formation as uuid), 'module_validated',
                cast(:module as uuid), cast(:achieved as timestamptz))
        returning id::text as id
        """,
        user=a,
        formation=formation,
        module=module1,
        achieved=FIXED,
    )
    notification_id = await identifier(
        conn,
        """
        insert into public.notifications (user_id, formation_id, type, title, body, href, icon)
        values (cast(:user as uuid), cast(:formation as uuid), 'course_ready', 'Cours pret',
                'Course ready.', '/formations', 'book')
        returning id::text as id
        """,
        user=a,
        formation=formation,
    )
    owned["notifications"] = notification_id
    owned["notification_deliveries"] = await identifier(
        conn,
        """
        insert into public.notification_deliveries
          (notification_id, channel, status, scheduled_for)
        values (cast(:notification as uuid), 'email', 'scheduled', cast(:scheduled as timestamptz))
        returning id::text as id
        """,
        notification=notification_id,
        scheduled=FIXED,
    )
    owned["ai_credentials"] = await identifier(
        conn,
        """
        insert into public.ai_credentials
          (user_id, provider, label, model_ids, encrypted_key, key_last4)
        values (cast(:user as uuid), 'anthropic', 'Cle privee', '{claude-sonnet}',
                decode(repeat('00', 32), 'hex'), 'abcd')
        returning id::text as id
        """,
        user=a,
    )
    await conn.execute(
        text(
            "insert into public.ai_task_models (user_id, task, model_id) "
            "values (cast(:user as uuid), 'light', 'claude-haiku')"
        ),
        {"user": a},
    )
    owned["ai_calls"] = await identifier(
        conn,
        """
        insert into public.ai_calls (user_id, task, provider, model, status)
        values (cast(:user as uuid), 'light', 'anthropic', 'claude-haiku', 'ok')
        returning id::text as id
        """,
        user=a,
    )
    await conn.execute(
        text("insert into public.subscriptions (user_id, status) values (cast(:user as uuid), 'none')"),
        {"user": a},
    )
    owned["data_exports"] = await identifier(
        conn,
        """
        insert into public.data_exports (user_id, status)
        values (cast(:user as uuid), 'queued')
        returning id::text as id
        """,
        user=a,
    )
    owned["legal_acceptances"] = await identifier(
        conn,
        """
        insert into public.legal_acceptances (user_id, document, version)
        values (cast(:user as uuid), 'cgu', '1.0')
        returning id::text as id
        """,
        user=a,
    )
    owned["cadrage_messages"] = await identifier(
        conn,
        """
        insert into public.cadrage_messages (formation_id, user_id, role, content, position)
        values (cast(:formation as uuid), cast(:user as uuid), 'tutor', 'Message de cadrage', 1)
        returning id::text as id
        """,
        formation=formation,
        user=a,
    )
    owned["programme_imports"] = await identifier(
        conn,
        """
        insert into public.programme_imports (formation_id, user_id, source_kind, raw_text)
        values (cast(:formation as uuid), cast(:user as uuid), 'text', 'programme importe')
        returning id::text as id
        """,
        formation=formation,
        user=a,
    )
    owned["programme_proposals"] = await identifier(
        conn,
        """
        insert into public.programme_proposals (formation_id, user_id, version, source, payload)
        values (cast(:formation as uuid), cast(:user as uuid), 1, 'generated', '{}'::jsonb)
        returning id::text as id
        """,
        formation=formation,
        user=a,
    )
    owned["programme_change_requests"] = await identifier(
        conn,
        """
        insert into public.programme_change_requests (formation_id, user_id, message)
        values (cast(:formation as uuid), cast(:user as uuid), 'Ajuster le programme')
        returning id::text as id
        """,
        formation=formation,
        user=a,
    )
    owned["notion_links"] = await identifier(
        conn,
        """
        insert into public.notion_links (formation_id, from_notion_id, to_notion_id, kind, owner_id)
        values (cast(:formation as uuid), cast(:from_notion as uuid), cast(:to_notion as uuid),
                'prerequisite', null)
        returning id::text as id
        """,
        formation=formation,
        from_notion=notion1,
        to_notion=notion2,
    )
    await conn.execute(
        text(
            "insert into public.notion_links "
            "(formation_id, from_notion_id, to_notion_id, kind, owner_id) "
            "values (cast(:formation as uuid), cast(:from_notion as uuid), "
            "cast(:to_notion as uuid), 'tutor', cast(:owner as uuid))"
        ),
        {"formation": formation, "from_notion": notion3, "to_notion": notion4, "owner": a},
    )
    return Seed(
        a=a,
        b=b,
        c=c,
        programme=programme,
        group_id=group_id,
        course_id=course_id,
        section_id=section_id,
        resource_id=resource_id,
        brick_id=brick_id,
        brick_version_id=brick_version_id,
        activity_id=activity_id,
        attempt_id=attempt_id,
        conversation_id=conversation_id,
        notification_id=notification_id,
        rows=owned,
    )


ForeignInserter = Callable[[Any, "Seed"], Awaitable[None]]

FOREIGN_INSERTS: dict[str, ForeignInserter] = {}


def foreign(table: str) -> Callable[[ForeignInserter], ForeignInserter]:
    """Registers the forged insert of one table: it keeps Alice as the owner, Bob sends it."""

    def register(run: ForeignInserter) -> ForeignInserter:
        FOREIGN_INSERTS[table] = run
        return run

    return register


@foreign("profiles")
async def _profiles(conn: Any, s: Seed) -> None:
    await conn.execute(
        text("insert into public.profiles (id, email) values (cast(:id as uuid), :email)"),
        {"id": s.a, "email": "forged@test.learny.test"},
    )


@foreign("study_preferences")
async def _study_preferences(conn: Any, s: Seed) -> None:
    await conn.execute(
        text("insert into public.study_preferences (user_id) values (cast(:user as uuid))"),
        {"user": s.a},
    )


@foreign("notification_settings")
async def _notification_settings(conn: Any, s: Seed) -> None:
    await conn.execute(
        text("insert into public.notification_settings (user_id) values (cast(:user as uuid))"),
        {"user": s.a},
    )


@foreign("push_subscriptions")
async def _push_subscriptions(conn: Any, s: Seed) -> None:
    await conn.execute(
        text(
            "insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) "
            "values (cast(:user as uuid), 'https://push.test.learny.test/forged', 'p256dh', 'auth')"
        ),
        {"user": s.a},
    )


@foreign("offline_sync_receipts")
async def _offline_sync_receipts(conn: Any, s: Seed) -> None:
    await conn.execute(
        text(
            "insert into public.offline_sync_receipts (user_id, client_id, status) "
            "values (cast(:user as uuid), '5eed0000-0000-4000-8000-0000000000ff'::uuid, 'applied')"
        ),
        {"user": s.a},
    )


@foreign("automation_settings")
async def _automation_settings(conn: Any, s: Seed) -> None:
    await conn.execute(
        text(
            "insert into public.automation_settings (user_id, key, params) "
            "values (cast(:user as uuid), 'reprise', '{}'::jsonb)"
        ),
        {"user": s.a},
    )


@foreign("pauses")
async def _pauses(conn: Any, s: Seed) -> None:
    await conn.execute(
        text(
            "insert into public.pauses (user_id, starts_on, ends_on, status) "
            "values (cast(:user as uuid), '2026-12-01', '2026-12-02', 'cancelled')"
        ),
        {"user": s.a},
    )


@foreign("cadrage_messages")
async def _cadrage_messages(conn: Any, s: Seed) -> None:
    await conn.execute(
        text(
            "insert into public.cadrage_messages (formation_id, user_id, role, content, position) "
            "values (cast(:formation as uuid), cast(:user as uuid), 'learner', 'forge', 99)"
        ),
        {"formation": s.programme.formation_id, "user": s.a},
    )


@foreign("programme_imports")
async def _programme_imports(conn: Any, s: Seed) -> None:
    await conn.execute(
        text(
            "insert into public.programme_imports (formation_id, user_id, source_kind, raw_text) "
            "values (cast(:formation as uuid), cast(:user as uuid), 'text', 'forge')"
        ),
        {"formation": s.programme.formation_id, "user": s.a},
    )


@foreign("programme_proposals")
async def _programme_proposals(conn: Any, s: Seed) -> None:
    await conn.execute(
        text(
            "insert into public.programme_proposals "
            "(formation_id, user_id, version, source, payload) "
            "values (cast(:formation as uuid), cast(:user as uuid), 2, 'generated', '{}'::jsonb)"
        ),
        {"formation": s.programme.formation_id, "user": s.a},
    )


@foreign("programme_change_requests")
async def _programme_change_requests(conn: Any, s: Seed) -> None:
    await conn.execute(
        text(
            "insert into public.programme_change_requests (formation_id, user_id, message) "
            "values (cast(:formation as uuid), cast(:user as uuid), 'forge')"
        ),
        {"formation": s.programme.formation_id, "user": s.a},
    )


@foreign("chapter_progress")
async def _chapter_progress(conn: Any, s: Seed) -> None:
    await conn.execute(
        text(
            "insert into public.chapter_progress (user_id, chapter_id) "
            "values (cast(:user as uuid), cast(:chapter as uuid))"
        ),
        {"user": s.a, "chapter": s.programme.chapter_ids[1]},
    )


@foreign("module_progress")
async def _module_progress(conn: Any, s: Seed) -> None:
    await conn.execute(
        text(
            "insert into public.module_progress (user_id, module_id, status) "
            "values (cast(:user as uuid), cast(:module as uuid), 'open')"
        ),
        {"user": s.a, "module": s.programme.module_ids[1]},
    )


@foreign("resources")
async def _resources(conn: Any, s: Seed) -> None:
    await conn.execute(
        text(
            "insert into public.resources (owner_id, formation_id, kind, title) "
            "values (cast(:owner as uuid), cast(:formation as uuid), 'note', 'Ressource forgee')"
        ),
        {"owner": s.a, "formation": s.programme.formation_id},
    )


@foreign("resource_chunks")
async def _resource_chunks(conn: Any, s: Seed) -> None:
    await conn.execute(
        text(
            "insert into public.resource_chunks "
            "(resource_id, owner_id, formation_id, position, text, location) "
            "values (cast(:resource as uuid), cast(:owner as uuid), cast(:formation as uuid), 99, "
            "'forge', cast(:location as jsonb))"
        ),
        {
            "resource": s.resource_id,
            "owner": s.a,
            "formation": s.programme.formation_id,
            "location": json.dumps({"charStart": 0, "charEnd": 1}),
        },
    )


@foreign("question_bank_jobs")
async def _question_bank_jobs(conn: Any, s: Seed) -> None:
    await conn.execute(
        text(
            "insert into public.question_bank_jobs "
            "(user_id, formation_id, notion_id, course_id, format, reason) "
            "values (cast(:user as uuid), cast(:formation as uuid), cast(:notion as uuid), "
            "cast(:course as uuid), 'choice_question', 'manual')"
        ),
        {
            "user": s.a,
            "formation": s.programme.formation_id,
            "notion": s.programme.notion_ids[0],
            "course": s.course_id,
        },
    )


@foreign("courses")
async def _courses(conn: Any, s: Seed) -> None:
    await conn.execute(
        text(
            "insert into public.courses (owner_id, formation_id, module_id, version, is_current, status) "
            "values (cast(:owner as uuid), cast(:formation as uuid), cast(:module as uuid), "
            "99, false, 'generating')"
        ),
        {
            "owner": s.a,
            "formation": s.programme.formation_id,
            "module": s.programme.module_ids[1],
        },
    )


@foreign("course_sections")
async def _course_sections(conn: Any, s: Seed) -> None:
    await conn.execute(
        text(
            "insert into public.course_sections "
            "(course_id, owner_id, chapter_id, position, kind, anchor, title, origin) "
            "values (cast(:course as uuid), cast(:owner as uuid), cast(:chapter as uuid), 99, "
            "'text', 'forged', 'Section forgee', 'tutor')"
        ),
        {
            "course": s.course_id,
            "owner": s.a,
            "chapter": s.programme.chapter_ids[0],
        },
    )


@foreign("course_section_revisions")
async def _course_section_revisions(conn: Any, s: Seed) -> None:
    await conn.execute(
        text(
            "insert into public.course_section_revisions "
            "(section_id, owner_id, version, title, edited_by) "
            "values (cast(:section as uuid), cast(:owner as uuid), 99, 'forgee', 'learner')"
        ),
        {"section": s.section_id, "owner": s.a},
    )


@foreign("course_section_reports")
async def _course_section_reports(conn: Any, s: Seed) -> None:
    await conn.execute(
        text(
            "insert into public.course_section_reports (owner_id, section_id, reason) "
            "values (cast(:owner as uuid), cast(:section as uuid), 'Signalement forge')"
        ),
        {"owner": s.a, "section": s.section_id},
    )


@foreign("citations")
async def _citations(conn: Any, s: Seed) -> None:
    await conn.execute(
        text(
            "insert into public.citations (section_id, owner_id, label, media_kind) "
            "values (cast(:section as uuid), cast(:owner as uuid), 'forgee', 'pdf')"
        ),
        {"section": s.section_id, "owner": s.a},
    )


@foreign("reading_progress")
async def _reading_progress(conn: Any, s: Seed) -> None:
    await conn.execute(
        text(
            "insert into public.reading_progress (user_id, course_id, chapter_id, percent) "
            "values (cast(:user as uuid), cast(:course as uuid), cast(:chapter as uuid), 5)"
        ),
        {
            "user": s.a,
            "course": s.course_id,
            "chapter": s.programme.chapter_ids[1],
        },
    )


@foreign("chapter_summaries")
async def _chapter_summaries(conn: Any, s: Seed) -> None:
    await conn.execute(
        text(
            "insert into public.chapter_summaries (user_id, chapter_id, course_id, text) "
            "values (cast(:user as uuid), cast(:chapter as uuid), cast(:course as uuid), 'forge')"
        ),
        {
            "user": s.a,
            "chapter": s.programme.chapter_ids[1],
            "course": s.course_id,
        },
    )


@foreign("tutor_conversations")
async def _tutor_conversations(conn: Any, s: Seed) -> None:
    await conn.execute(
        text(
            "insert into public.tutor_conversations (user_id, course_id, title) "
            "values (cast(:user as uuid), cast(:course as uuid), 'Discussion forgee')"
        ),
        {"user": s.a, "course": s.course_id},
    )


@foreign("tutor_messages")
async def _tutor_messages(conn: Any, s: Seed) -> None:
    await conn.execute(
        text(
            "insert into public.tutor_messages (conversation_id, user_id, role, content) "
            "values (cast(:conversation as uuid), cast(:user as uuid), 'learner', 'forge')"
        ),
        {"conversation": s.conversation_id, "user": s.a},
    )


@foreign("bricks")
async def _bricks(conn: Any, s: Seed) -> None:
    await conn.execute(
        text(
            "insert into public.bricks (owner_id, formation_id, type, purpose) "
            "values (cast(:owner as uuid), cast(:formation as uuid), 'text', 'course')"
        ),
        {"owner": s.a, "formation": s.programme.formation_id},
    )


@foreign("brick_versions")
async def _brick_versions(conn: Any, s: Seed) -> None:
    await conn.execute(
        text(
            "insert into public.brick_versions (brick_id, version, payload, origin, created_by) "
            "values (cast(:brick as uuid), 99, '{}'::jsonb, 'tutor', 'tutor')"
        ),
        {"brick": s.brick_id},
    )


@foreign("brick_reports")
async def _brick_reports(conn: Any, s: Seed) -> None:
    await conn.execute(
        text(
            "insert into public.brick_reports (user_id, brick_id, brick_version_id, reason) "
            "values (cast(:user as uuid), cast(:brick as uuid), cast(:version as uuid), 'forge')"
        ),
        {"user": s.a, "brick": s.brick_id, "version": s.brick_version_id},
    )


@foreign("activities")
async def _activities(conn: Any, s: Seed) -> None:
    await conn.execute(
        text(
            "insert into public.activities (owner_id, formation_id, kind, items) "
            "values (cast(:owner as uuid), cast(:formation as uuid), 'exercise', '[]'::jsonb)"
        ),
        {"owner": s.a, "formation": s.programme.formation_id},
    )


@foreign("attempts")
async def _attempts(conn: Any, s: Seed) -> None:
    await conn.execute(
        text(
            "insert into public.attempts (user_id, activity_id, attempt_no) "
            "values (cast(:user as uuid), cast(:activity as uuid), 99)"
        ),
        {"user": s.a, "activity": s.activity_id},
    )


@foreign("answers")
async def _answers(conn: Any, s: Seed) -> None:
    await conn.execute(
        text(
            "insert into public.answers (attempt_id, brick_version_id, position, response) "
            "values (cast(:attempt as uuid), cast(:version as uuid), 99, '{}'::jsonb)"
        ),
        {"attempt": s.attempt_id, "version": s.brick_version_id},
    )


@foreign("notion_states")
async def _notion_states(conn: Any, s: Seed) -> None:
    await conn.execute(
        text(
            "insert into public.notion_states (user_id, notion_id, fsrs) "
            "values (cast(:user as uuid), cast(:notion as uuid), cast(:fsrs as jsonb))"
        ),
        {"user": s.a, "notion": s.programme.notion_ids[1], "fsrs": fsrs_card()},
    )


@foreign("review_logs")
async def _review_logs(conn: Any, s: Seed) -> None:
    await conn.execute(
        text(
            "insert into public.review_logs (user_id, notion_id, source, grade, reviewed_at) "
            "values (cast(:user as uuid), cast(:notion as uuid), 'validation', 'good', "
            "cast(:reviewed as timestamptz))"
        ),
        {"user": s.a, "notion": s.programme.notion_ids[1], "reviewed": FIXED},
    )


@foreign("gap_events")
async def _gap_events(conn: Any, s: Seed) -> None:
    await conn.execute(
        text(
            "insert into public.gap_events (user_id, notion_id, kind, nature) "
            "values (cast(:user as uuid), cast(:notion as uuid), 'detected', 'forgetting')"
        ),
        {"user": s.a, "notion": s.programme.notion_ids[1]},
    )


@foreign("schedule_slots")
async def _schedule_slots(conn: Any, s: Seed) -> None:
    await conn.execute(
        text(
            "insert into public.schedule_slots "
            "(user_id, formation_id, kind, title, starts_at, ends_at, created_by) "
            "values (cast(:user as uuid), cast(:formation as uuid), 'course', 'Creneau forge', "
            "'2026-11-11T18:00:00Z'::timestamptz, '2026-11-11T19:00:00Z'::timestamptz, 'planner')"
        ),
        {"user": s.a, "formation": s.programme.formation_id},
    )


@foreign("automation_actions")
async def _automation_actions(conn: Any, s: Seed) -> None:
    await conn.execute(
        text(
            "insert into public.automation_actions "
            "(user_id, formation_id, automation, kind, summary, status, requires_consent) "
            "values (cast(:user as uuid), cast(:formation as uuid), 'reprise', 'forged', "
            "'Action forgee', 'pending_consent', true)"
        ),
        {"user": s.a, "formation": s.programme.formation_id},
    )


@foreign("daily_activity")
async def _daily_activity(conn: Any, s: Seed) -> None:
    await conn.execute(
        text(
            "insert into public.daily_activity (user_id, day, minutes) "
            "values (cast(:user as uuid), '2026-11-12', 10)"
        ),
        {"user": s.a},
    )


@foreign("milestones")
async def _milestones(conn: Any, s: Seed) -> None:
    await conn.execute(
        text(
            "insert into public.milestones (user_id, formation_id, key, ref_id, achieved_at) "
            "values (cast(:user as uuid), cast(:formation as uuid), 'notions_100', "
            "cast(:notion as uuid), cast(:achieved as timestamptz))"
        ),
        {
            "user": s.a,
            "formation": s.programme.formation_id,
            "notion": s.programme.notion_ids[0],
            "achieved": FIXED,
        },
    )


@foreign("notifications")
async def _notifications(conn: Any, s: Seed) -> None:
    await conn.execute(
        text(
            "insert into public.notifications (user_id, formation_id, type, title, body, href, icon) "
            "values (cast(:user as uuid), cast(:formation as uuid), 'relaunch', 'Relance forgee', "
            "'Corps', '/formations', 'bell')"
        ),
        {"user": s.a, "formation": s.programme.formation_id},
    )


@foreign("notification_deliveries")
async def _notification_deliveries(conn: Any, s: Seed) -> None:
    await conn.execute(
        text(
            "insert into public.notification_deliveries (notification_id, channel, status) "
            "values (cast(:notification as uuid), 'email', 'scheduled')"
        ),
        {"notification": s.notification_id},
    )


@foreign("ai_credentials")
async def _ai_credentials(conn: Any, s: Seed) -> None:
    await conn.execute(
        text(
            "insert into public.ai_credentials "
            "(user_id, provider, label, encrypted_key, key_last4) "
            "values (cast(:user as uuid), 'anthropic', 'Cle forgee', "
            "decode(repeat('00', 32), 'hex'), 'abcd')"
        ),
        {"user": s.a},
    )


@foreign("ai_task_models")
async def _ai_task_models(conn: Any, s: Seed) -> None:
    await conn.execute(
        text(
            "insert into public.ai_task_models (user_id, task, model_id) "
            "values (cast(:user as uuid), 'course', 'claude-sonnet')"
        ),
        {"user": s.a},
    )


@foreign("ai_calls")
async def _ai_calls(conn: Any, s: Seed) -> None:
    await conn.execute(
        text(
            "insert into public.ai_calls (user_id, task, provider, model, status) "
            "values (cast(:user as uuid), 'light', 'anthropic', 'claude-haiku', 'ok')"
        ),
        {"user": s.a},
    )


@foreign("subscriptions")
async def _subscriptions(conn: Any, s: Seed) -> None:
    await conn.execute(
        text("insert into public.subscriptions (user_id, status) values (cast(:user as uuid), 'none')"),
        {"user": s.a},
    )


@foreign("data_exports")
async def _data_exports(conn: Any, s: Seed) -> None:
    await conn.execute(
        text("insert into public.data_exports (user_id, status) values (cast(:user as uuid), 'queued')"),
        {"user": s.a},
    )


@foreign("legal_acceptances")
async def _legal_acceptances(conn: Any, s: Seed) -> None:
    await conn.execute(
        text(
            "insert into public.legal_acceptances (user_id, document, version) "
            "values (cast(:user as uuid), 'privacy', '9.0')"
        ),
        {"user": s.a},
    )
