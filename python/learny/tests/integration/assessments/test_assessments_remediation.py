"""[SPEC-2202] Targeted remediation of a failed validation attempt (SPEC-612 EF-6, ADR-0173).

The plan, the excerpts and two questions per notion come from the tutor fixture and the bank, are
persisted with the activity, and a replay returns the same activity. The completion refuses an
unchecked question, grades the attempt, applies its mastery and archives the remediation.
"""

import json
from typing import Any

import pytest
from factories.assessments_deps import assessment_deps
from factories.db_support import rolled_back
from factories.identity_support import (
    FIXED,
    actor_for,
    count,
    create_chapter,
    create_formation,
    create_module,
    create_notion,
    create_notion_state,
    create_user,
    event_by_id,
    identifier,
    one,
)
from learny.assessments.application import remediation as service
from learny.assessments.domain.bricks.fingerprint import brick_fingerprint
from learny.shared.db.uow import Database
from learny.shared.errors import AppError
from learny_api.generated.models import (
    RemediationCompleteOutput,
    RemediationGetOutput,
    RemediationPrepareOutput,
)
from sqlalchemy import text

pytestmark = pytest.mark.spec("SPEC-2202")


def choice_document(index: int, notion_id: str) -> dict[str, Any]:
    """One valid single-choice question of the bank."""
    return {
        "stem": f"Which account increases on debit ({index})?",
        "mode": "single",
        "options": [
            {"id": "a", "text": "The bank account", "correct": True, "notionId": notion_id},
            {"id": "b", "text": "The capital account", "correct": False, "notionId": None},
        ],
        "explanation": "The receipt increases the bank account on the debit side.",
        "objective": "Tell an asset account from a liability account",
        "sources": [],
    }


async def seed_bank(
    conn: Any, user_id: str, formation_id: str, notion_id: str, count_questions: int
) -> tuple[str, str]:
    """`count_questions` choice questions of the bank, returning the first brick and version."""
    first_brick = ""
    first_version = ""
    for index in range(count_questions):
        document = choice_document(index, notion_id)
        brick_id = await identifier(
            conn,
            """
            insert into public.bricks (owner_id, formation_id, type, notion_ids, purpose, status)
            values (
              cast(:owner as uuid), cast(:formation as uuid), 'choice_question',
              array[cast(:notion as uuid)], 'bank', 'active'
            )
            returning id::text as id
            """,
            owner=user_id,
            formation=formation_id,
            notion=notion_id,
        )
        version_id = await identifier(
            conn,
            """
            insert into public.brick_versions (brick_id, version, payload, fingerprint, origin, created_by)
            values (
              cast(:brick as uuid), 1, cast(:payload as jsonb), :fingerprint, 'tutor', 'tutor'
            )
            returning id::text as id
            """,
            brick=brick_id,
            payload=json.dumps(document),
            fingerprint=brick_fingerprint("choice_question", document),
        )
        first_version = first_version or version_id
        first_brick = first_brick or brick_id
    return first_brick, first_version


async def seed_failed_module(conn: Any, *, questions: int = 2) -> dict[str, Any]:
    """One learner, one module with an open gap and a failed validation attempt."""
    user_id = await create_user(conn, "Alice", timezone="Europe/Paris")
    formation_id = await create_formation(conn, user_id, title="Accounting")
    module_id = await create_module(conn, formation_id, 1, title="Double entry", status="validated")
    chapter_id = await create_chapter(conn, formation_id, module_id)
    notion_id = await create_notion(conn, formation_id, module_id, chapter_id)
    brick_id, version_id = await seed_bank(conn, user_id, formation_id, notion_id, questions)
    await create_notion_state(conn, user_id, notion_id, due_at=FIXED, in_review=True, gap_nature="confusion")
    await conn.execute(
        text(
            """
            update public.notion_states
               set mastery = 20, gap_evidence = 'Confused with the piece type.'
             where user_id = cast(:user as uuid) and notion_id = cast(:notion as uuid)
            """
        ),
        {"user": user_id, "notion": notion_id},
    )
    activity_id = await identifier(
        conn,
        """
        insert into public.activities (
          owner_id, formation_id, module_id, kind, config, items, status
        ) values (
          cast(:owner as uuid), cast(:formation as uuid), cast(:module as uuid),
          'validation_quiz', cast('{"threshold": 80}' as jsonb),
          cast(:items as jsonb), 'ready'
        )
        returning id::text as id
        """,
        owner=user_id,
        formation=formation_id,
        module=module_id,
        items=json.dumps([{"brickId": brick_id, "brickVersionId": version_id}]),
    )
    attempt_id = await identifier(
        conn,
        """
        insert into public.attempts (
          user_id, activity_id, attempt_no, status, score, passed, submitted_at
        ) values (
          cast(:owner as uuid), cast(:activity as uuid), 1, 'graded', 40, false,
          cast(:submitted as timestamptz)
        )
        returning id::text as id
        """,
        owner=user_id,
        activity=activity_id,
        submitted=FIXED,
    )
    return {
        "userId": user_id,
        "formationId": formation_id,
        "moduleId": module_id,
        "notionId": notion_id,
        "attemptId": attempt_id,
        "activityId": activity_id,
    }


async def test_get_returns_none_without_remediation(database: Database) -> None:
    async def run(tx: Any) -> Any:
        seed = await seed_failed_module(tx.conn)
        return await service.get_remediation(assessment_deps(tx), actor_for(seed["userId"]), seed["moduleId"])

    result = await rolled_back(database, run)
    parsed = RemediationGetOutput.model_validate(result)
    assert parsed.status == "none"
    assert parsed.activityId is None
    assert parsed.gaps == []


async def test_request_preparation_persists_a_draft_and_emits_the_event(database: Database) -> None:
    async def run(tx: Any) -> Any:
        seed = await seed_failed_module(tx.conn)
        first = await service.request_remediation_preparation(
            assessment_deps(tx), actor_for(seed["userId"]), seed["moduleId"]
        )
        replay = await service.request_remediation_preparation(
            assessment_deps(tx), actor_for(seed["userId"]), seed["moduleId"]
        )
        activity = await one(
            tx.conn,
            """
            select id::text as id, status::text as status, config
              from public.activities
             where module_id = cast(:module as uuid) and kind = 'remediation'
            """,
            module=seed["moduleId"],
        )
        event = await event_by_id(tx.conn, f"remediation-requested:{seed['attemptId']}")
        return first, replay, activity, event

    first, replay, activity, event = await rolled_back(database, run)
    assert RemediationPrepareOutput.model_validate(first).status == "preparing"
    assert replay == {"status": "preparing"}
    assert activity["status"] == "draft"
    assert activity["config"]["preparing"] is True
    assert activity["config"]["sourceAttemptId"] is not None
    assert event is not None
    assert event["name"] == "remediation/requested"
    assert event["data"]["attemptId"] is not None


async def test_prepare_builds_the_plan_questions_and_attempt(database: Database) -> None:
    async def run(tx: Any) -> Any:
        seed = await seed_failed_module(tx.conn)
        prepared = await service.prepare_remediation(
            assessment_deps(tx), actor_for(seed["userId"]), seed["moduleId"]
        )
        read = await service.get_remediation(assessment_deps(tx), actor_for(seed["userId"]), seed["moduleId"])
        activity = await one(
            tx.conn,
            """
            select status::text as status, config, items
              from public.activities
             where id = cast(:activity as uuid)
            """,
            activity=prepared["activityId"],
        )
        answers = await count(
            tx.conn,
            "select count(*)::int as count from public.answers where attempt_id = cast(:a as uuid)",
            a=read["attemptId"],
        )
        return prepared, read, activity, answers

    prepared, read, activity, answers = await rolled_back(database, run)
    parsed = RemediationGetOutput.model_validate(read)
    assert prepared["status"] == "ready"
    assert prepared["prepared"] is True
    assert parsed.status == "ready"
    assert parsed.activityId == prepared["activityId"]
    assert parsed.attemptId is not None
    assert len(parsed.gaps) == 1
    gap = parsed.gaps[0]
    assert gap.textMd != ""
    assert len(gap.questions) == 2
    assert gap.questions[0].type == "choice_question"
    assert gap.questions[0].notionId is not None
    assert activity["status"] == "ready"
    assert activity["config"]["questionCount"] == 2
    assert activity["config"]["durationMin"] == 15
    assert len(activity["items"]) == 2
    assert answers == 2


async def test_prepare_replays_the_existing_remediation(database: Database) -> None:
    async def run(tx: Any) -> Any:
        seed = await seed_failed_module(tx.conn)
        first = await service.prepare_remediation(
            assessment_deps(tx), actor_for(seed["userId"]), seed["moduleId"]
        )
        second = await service.prepare_remediation(
            assessment_deps(tx), actor_for(seed["userId"]), seed["moduleId"]
        )
        # Scoped to the learner and module of this test: the shared local database also carries
        # the demonstration dataset, whose remediation must not be counted here.
        activities = await count(
            tx.conn,
            """
            select count(*)::int as count from public.activities
             where kind = 'remediation'
               and owner_id = cast(:user as uuid)
               and module_id = cast(:module as uuid)
            """,
            user=seed["userId"],
            module=seed["moduleId"],
        )
        return first, second, activities

    first, second, activities = await rolled_back(database, run)
    assert second["activityId"] == first["activityId"]
    assert second["prepared"] is False
    assert activities == 1


async def test_prepare_requires_a_failed_attempt(database: Database) -> None:
    async def run(tx: Any) -> str:
        user_id = await create_user(tx.conn, "Alice", timezone="Europe/Paris")
        formation_id = await create_formation(tx.conn, user_id, title="Accounting")
        module_id = await create_module(tx.conn, formation_id, 1, title="Double entry")
        with pytest.raises(AppError) as refused:
            await service.prepare_remediation(assessment_deps(tx), actor_for(user_id), module_id)
        return refused.value.code

    assert await rolled_back(database, run) == "NO_FAILED_ATTEMPT"


async def test_complete_refuses_an_unchecked_question(database: Database) -> None:
    async def run(tx: Any) -> AppError:
        seed = await seed_failed_module(tx.conn)
        await service.prepare_remediation(assessment_deps(tx), actor_for(seed["userId"]), seed["moduleId"])
        with pytest.raises(AppError) as refused:
            await service.complete_remediation(
                assessment_deps(tx), actor_for(seed["userId"]), seed["moduleId"]
            )
        return refused.value

    error = await rolled_back(database, run)
    assert error.code == "CONFLICT"
    assert error.status == 409
    assert error.extra["errors"][0]["code"] == "QUESTION_UNCHECKED"


async def test_complete_grades_applies_mastery_and_archives(database: Database) -> None:
    async def run(tx: Any) -> Any:
        seed = await seed_failed_module(tx.conn)
        prepared = await service.prepare_remediation(
            assessment_deps(tx), actor_for(seed["userId"]), seed["moduleId"]
        )
        read = await service.get_remediation(assessment_deps(tx), actor_for(seed["userId"]), seed["moduleId"])
        await tx.conn.execute(
            text(
                """
                update public.answers
                   set graded_by = 'code', is_correct = true, score = max_score
                 where attempt_id = cast(:attempt as uuid)
                """
            ),
            {"attempt": read["attemptId"]},
        )
        completed = await service.complete_remediation(
            assessment_deps(tx), actor_for(seed["userId"]), seed["moduleId"]
        )
        attempt = await one(
            tx.conn,
            """
            select status::text as status, score::text as score, passed
              from public.attempts where id = cast(:a as uuid)
            """,
            a=read["attemptId"],
        )
        activity = await one(
            tx.conn,
            "select status::text as status from public.activities where id = cast(:a as uuid)",
            a=prepared["activityId"],
        )
        logs = await count(
            tx.conn,
            "select count(*)::int as count from public.review_logs where user_id = cast(:u as uuid)",
            u=seed["userId"],
        )
        after = await service.get_remediation(
            assessment_deps(tx), actor_for(seed["userId"]), seed["moduleId"]
        )
        return completed, attempt, activity, logs, after

    completed, attempt, activity, logs, after = await rolled_back(database, run)
    parsed = RemediationCompleteOutput.model_validate(completed)
    assert parsed.retryAvailableAt is None or isinstance(parsed.retryAvailableAt, str)
    assert attempt["status"] == "graded"
    assert float(attempt["score"]) == 100
    assert attempt["passed"] is True
    assert activity["status"] == "archived"
    assert logs >= 1
    assert RemediationGetOutput.model_validate(after).status == "completed"
