"""[SPEC-2202] Format and introduction of the mock exam (SPEC-614, EF-1, EF-5, ET-3).

Port of the useful cases of `packages/services/src/mock-exams/format.ts`: the normative default
without a guide, a format extracted from a guide that stays proposed until the learner confirms it,
the studied and diagnostic modules with the diagnostic share, and the two planned exams of a
formation whose objectives contain `exam` (BR-PRA-05).
"""

import json
from typing import Any

import pytest
from factories.assessments_deps import assessment_deps
from factories.db_support import rolled_back
from factories.identity_support import (
    actor_for,
    count,
    create_chapter,
    create_formation,
    create_module,
    create_notion,
    create_user,
    identifier,
    one,
)
from learny.assessments.application import exam_format as service
from learny.shared.db.uow import Database
from learny.shared.errors import AppError
from learny_api.generated.models import ExamFormatConfirmOutput, ExamIntroOutput
from sqlalchemy import text

pytestmark = pytest.mark.spec("SPEC-2202")


async def seed_formation(conn: Any, *, objectives: str = "{operational}") -> dict[str, Any]:
    """One learner, one active formation with two modules and a notion in the first one."""
    user_id = await create_user(conn, "Alice", timezone="Europe/Paris")
    formation_id = await create_formation(conn, user_id, title="Accounting")
    await conn.execute(
        text(
            "update public.formations set objectives = cast(:objectives as "
            "public.formation_objective[]) where id = cast(:formation as uuid)"
        ),
        {"objectives": objectives, "formation": formation_id},
    )
    first = await create_module(conn, formation_id, 1, title="Double entry", status="open")
    second = await create_module(conn, formation_id, 2, title="Closing", status="locked")
    first_chapter = await create_chapter(conn, formation_id, first)
    notion_id = await create_notion(conn, formation_id, first, first_chapter, position=1)
    await create_notion(conn, formation_id, first, first_chapter, position=2)
    second_chapter = await create_chapter(conn, formation_id, second)
    await create_notion(conn, formation_id, second, second_chapter, position=1)
    return {
        "userId": user_id,
        "formationId": formation_id,
        "firstModule": first,
        "secondModule": second,
        "notionId": notion_id,
    }


async def add_guide(conn: Any, seed: dict[str, Any], metadata: dict[str, Any]) -> str:
    """One readable exam guide whose metadata carries the extracted format."""
    return await identifier(
        conn,
        """
        insert into public.resources (
          owner_id, formation_id, kind, title, status, metadata, storage_path
        ) values (
          cast(:owner as uuid), cast(:formation as uuid), 'exam_guide', 'Guide',
          'ready', cast(:metadata as jsonb), :storage
        )
        returning id::text as id
        """,
        owner=seed["userId"],
        formation=seed["formationId"],
        metadata=json.dumps(metadata),
        storage=f"{seed['userId']}/{seed['formationId']}/guide.pdf",
    )


async def test_the_default_format_applies_without_a_guide(database: Database) -> None:
    async def run(tx: Any) -> dict[str, Any]:
        seed = await seed_formation(tx.conn)
        return await service.get_exam_intro(
            assessment_deps(tx), actor_for(seed["userId"]), seed["formationId"]
        )

    dto = await rolled_back(database, run)
    parsed = ExamIntroOutput.model_validate(dto)
    assert parsed.title == "Accounting"
    assert parsed.hasGuide is False
    assert parsed.format.source == "default"
    assert parsed.format.confirmed is True
    assert parsed.format.questionCount == 20
    assert parsed.format.durationMin == 40
    assert parsed.format.secondsPerQuestion == 120
    assert parsed.format.threshold == 70
    assert [module.label for module in parsed.studiedModules] == ["Double entry"]
    assert [module.label for module in parsed.diagnosticModules] == ["Closing"]
    # 20 questions over 3 notions: 13 for the studied module, 7 for the diagnostic one.
    assert parsed.diagnosticQuestionCount == 7
    assert parsed.lastAttempt is None


async def test_a_guide_format_is_only_proposed(database: Database) -> None:
    async def run(tx: Any) -> tuple[dict[str, Any], str]:
        seed = await seed_formation(tx.conn)
        guide_id = await add_guide(
            tx.conn,
            seed,
            {"examFormat": {"questions": 12, "durationMin": 90, "threshold": 75}},
        )
        dto = await service.get_exam_intro(
            assessment_deps(tx), actor_for(seed["userId"]), seed["formationId"]
        )
        return dto, guide_id

    dto, guide_id = await rolled_back(database, run)
    parsed = ExamIntroOutput.model_validate(dto)
    assert parsed.hasGuide is True
    assert parsed.format.source == "guide"
    assert parsed.format.confirmed is False
    assert parsed.format.sourceResourceId == guide_id
    assert parsed.format.questionCount == 12
    assert parsed.format.durationMin == 90
    assert parsed.format.secondsPerQuestion == 450
    assert parsed.format.threshold == 75


async def test_confirming_the_format_stores_it_and_is_idempotent(database: Database) -> None:
    async def run(tx: Any) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any], Any]:
        seed = await seed_formation(tx.conn)
        guide_id = await add_guide(
            tx.conn,
            seed,
            {"examFormat": {"questions": 15, "durationMin": 60, "threshold": 80}},
        )
        deps = assessment_deps(tx)
        actor = actor_for(seed["userId"])
        first = await service.confirm_exam_format(deps, actor, seed["formationId"])
        second = await service.confirm_exam_format(deps, actor, seed["formationId"])
        stored = await one(
            tx.conn,
            "select exam_format from public.formations where id = cast(:formation as uuid)",
            formation=seed["formationId"],
        )
        return first, second, stored, guide_id

    first, second, stored, guide_id = await rolled_back(database, run)
    parsed = ExamFormatConfirmOutput.model_validate(first)
    assert parsed.confirmed is True
    assert parsed.source == "guide"
    assert parsed.sourceResourceId == guide_id
    assert parsed.questionCount == 15
    assert parsed.durationMin == 60
    assert ExamFormatConfirmOutput.model_validate(second) == parsed
    assert stored["exam_format"] == {
        "questions": 15,
        "durationMin": 60,
        "threshold": 80,
        "confirmed": True,
        "sourceResourceId": guide_id,
    }


async def test_a_confirmed_stored_format_wins_over_the_guide(database: Database) -> None:
    async def run(tx: Any) -> dict[str, Any]:
        seed = await seed_formation(tx.conn)
        await add_guide(tx.conn, seed, {"examFormat": {"questions": 12, "threshold": 75}})
        await tx.conn.execute(
            text(
                "update public.formations set exam_format = cast(:format as jsonb) "
                "where id = cast(:formation as uuid)"
            ),
            {
                "format": json.dumps(
                    {"questions": 30, "durationMin": 120, "threshold": 65, "confirmed": True}
                ),
                "formation": seed["formationId"],
            },
        )
        return await service.get_exam_intro(
            assessment_deps(tx), actor_for(seed["userId"]), seed["formationId"]
        )

    dto = await rolled_back(database, run)
    parsed = ExamIntroOutput.model_validate(dto)
    assert parsed.format.questionCount == 30
    assert parsed.format.durationMin == 120
    assert parsed.format.threshold == 65
    assert parsed.format.source == "default"
    assert parsed.format.confirmed is True
    assert parsed.format.secondsPerQuestion == 240


async def test_an_exam_objective_carries_two_planned_exams(database: Database) -> None:
    async def run(tx: Any) -> tuple[list[Any], list[Any], int]:
        seed = await seed_formation(tx.conn, objectives="{exam}")
        await tx.conn.execute(
            text(
                "update public.formations set end_date = cast('2026-12-11' as date) "
                "where id = cast(:formation as uuid)"
            ),
            {"formation": seed["formationId"]},
        )
        await tx.conn.execute(
            text(
                "update public.modules set planned_end = cast('2026-11-20' as date) "
                "where id = cast(:module as uuid)"
            ),
            {"module": seed["firstModule"]},
        )
        deps = assessment_deps(tx)
        actor = actor_for(seed["userId"])
        first = await service.ensure_mock_exam_slots(deps, actor, seed["formationId"])
        second = await service.ensure_mock_exam_slots(deps, actor, seed["formationId"])
        stored = await count(
            tx.conn,
            "select count(*)::int as count from public.schedule_slots "
            "where formation_id = cast(:formation as uuid) and kind = 'mock_exam'",
            formation=seed["formationId"],
        )
        return first, second, stored

    first, second, stored = await rolled_back(database, run)
    assert [slot["position"] for slot in first] == [1, 2]
    assert first[0]["date"] == "2026-11-20"
    assert first[1]["date"] == "2026-12-11"
    # Nine in the morning in Paris is eight in UTC, and the default exam lasts forty minutes.
    assert first[0]["startsAt"] == "2026-11-20T08:00:00.000Z"
    assert first[0]["endsAt"] == "2026-11-20T08:40:00.000Z"
    assert first[0]["durationMin"] == 40
    assert len(second) == 2
    assert stored == 2


async def test_the_introduction_lists_the_two_planned_exams(database: Database) -> None:
    async def run(tx: Any) -> dict[str, Any]:
        seed = await seed_formation(tx.conn, objectives="{exam}")
        await tx.conn.execute(
            text(
                "update public.formations set end_date = cast('2026-12-11' as date) "
                "where id = cast(:formation as uuid)"
            ),
            {"formation": seed["formationId"]},
        )
        return await service.get_exam_intro(
            assessment_deps(tx), actor_for(seed["userId"]), seed["formationId"]
        )

    dto = await rolled_back(database, run)
    parsed = ExamIntroOutput.model_validate(dto)
    assert len(parsed.nextExams) == 2
    assert parsed.nextExams[0].startsAt < parsed.nextExams[1].startsAt
    assert parsed.nextExams[0].label.startswith("Examen blanc 1")


async def create_brick(conn: Any, seed: dict[str, Any]) -> dict[str, str]:
    """One exam brick and its current version, owned by the learner."""
    brick_id = await identifier(
        conn,
        """
        insert into public.bricks (owner_id, formation_id, type, notion_ids, purpose, status)
        values (
          cast(:owner as uuid), cast(:formation as uuid), 'choice_question',
          array[cast(:notion as uuid)], 'exam', 'active'
        )
        returning id::text as id
        """,
        owner=seed["userId"],
        formation=seed["formationId"],
        notion=seed["notionId"],
    )
    version_id = await identifier(
        conn,
        """
        insert into public.brick_versions (brick_id, version, payload, origin, created_by)
        values (cast(:brick as uuid), 1, cast(:payload as jsonb), 'tutor', 'tutor')
        returning id::text as id
        """,
        brick=brick_id,
        payload=json.dumps(
            {
                "stem": "Which account increases on debit?",
                "mode": "single",
                "options": [
                    {"id": "a", "text": "The bank account", "correct": True},
                    {"id": "b", "text": "The capital account", "correct": False},
                ],
                "explanation": "The receipt increases the bank account.",
                "objective": "Tell an asset account from a liability account",
                "sources": [],
            }
        ),
    )
    return {"brickId": brick_id, "versionId": version_id}


async def test_the_last_attempt_is_reported(database: Database) -> None:
    async def run(tx: Any) -> dict[str, Any]:
        seed = await seed_formation(tx.conn)
        brick = await create_brick(tx.conn, seed)
        activity_id = await one(
            tx.conn,
            """
            insert into public.activities (owner_id, formation_id, module_id, kind, config, items, status)
            values (
              cast(:user as uuid), cast(:formation as uuid), null, 'mock_exam',
              '{}'::jsonb, cast(:items as jsonb), 'ready'
            )
            returning id::text as id
            """,
            user=seed["userId"],
            formation=seed["formationId"],
            items=json.dumps(
                [{"brickId": brick["brickId"], "brickVersionId": brick["versionId"], "points": 100}]
            ),
        )
        await one(
            tx.conn,
            """
            insert into public.attempts (
              user_id, activity_id, attempt_no, status, started_at, score, passed
            ) values (
              cast(:user as uuid), cast(:activity as uuid), 1, 'graded',
              cast('2026-11-10T08:00:00Z' as timestamptz), 72.5, true
            )
            returning id::text as id
            """,
            user=seed["userId"],
            activity=str(activity_id["id"]),
        )
        return await service.get_exam_intro(
            assessment_deps(tx), actor_for(seed["userId"]), seed["formationId"]
        )

    dto = await rolled_back(database, run)
    parsed = ExamIntroOutput.model_validate(dto)
    assert parsed.lastAttempt is not None
    assert parsed.lastAttempt.status == "graded"
    assert float(parsed.lastAttempt.score or 0) == 72.5


async def test_a_foreign_formation_is_not_found(database: Database) -> None:
    async def run(tx: Any) -> tuple[str, str]:
        seed = await seed_formation(tx.conn)
        bob = await create_user(tx.conn, "Bob", timezone="Europe/Paris")
        deps = assessment_deps(tx)
        with pytest.raises(AppError) as intro_error:
            await service.get_exam_intro(deps, actor_for(bob), seed["formationId"])
        with pytest.raises(AppError) as confirm_error:
            await service.confirm_exam_format(deps, actor_for(bob), seed["formationId"])
        return intro_error.value.code, confirm_error.value.code

    intro_code, confirm_code = await rolled_back(database, run)
    assert intro_code == "NOT_FOUND"
    assert confirm_code == "NOT_FOUND"
