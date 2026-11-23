"""[SPEC-2202] Result of a corrected validation attempt (SPEC-612, EF-1 to EF-5).

The screen shows the persisted verdict, the gap cards of the failed notions with their evidence and
proposal, the mastered notions, the history and the retry gate. The gate comes from the frozen
payload of the remediation action or, without one, from the settings row and the latest failed
attempt.
"""

import json
from typing import Any

import pytest
from factories.assessments_deps import assessment_deps
from factories.db_support import rolled_back
from factories.identity_support import (
    actor_for,
    create_chapter,
    create_formation,
    create_module,
    create_notion_state,
    create_user,
    identifier,
    one,
)
from learny.assessments.application import quiz_result as service
from learny.shared.db.uow import Database
from learny.shared.errors import AppError
from learny_api.generated.models import QuizAttemptsResultOutput
from sqlalchemy import text

pytestmark = pytest.mark.spec("SPEC-2202")


async def seed_graded_attempt(
    conn: Any,
    *,
    status: str = "graded",
    score: float | None = 70,
    passed: bool | None = False,
    correct: tuple[bool | None, ...] = (False, True),
    per_notion: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """One learner, one formation with two modules, two notions and one graded attempt."""
    user_id = await create_user(conn, "Alice", timezone="Europe/Paris")
    formation_id = await create_formation(conn, user_id, title="Accounting")
    module_id = await create_module(conn, formation_id, 1, title="Double entry", status="open")
    await create_module(conn, formation_id, 2, title="Closing", status="locked")
    chapter_id = await create_chapter(conn, formation_id, module_id)
    notion_ids: list[str] = []
    for position in (1, 2):
        notion_id = await identifier(
            conn,
            """
            insert into public.notions (
              formation_id, module_id, chapter_id, label, short_definition, position
            )
            values (
              cast(:formation as uuid), cast(:module as uuid), cast(:chapter as uuid),
              :label, 'Definition courte', :position
            )
            returning id::text as id
            """,
            formation=formation_id,
            module=module_id,
            chapter=chapter_id,
            label=f"Notion {position}",
            position=position,
        )
        notion_ids.append(notion_id)
    items = []
    for index, notion_id in enumerate(notion_ids):
        brick_id = await identifier(
            conn,
            """
            insert into public.bricks (owner_id, formation_id, type, notion_ids, purpose, status)
            values (
              cast(:owner as uuid), cast(:formation as uuid), 'choice_question',
              array[cast(:notion as uuid)], 'validation', 'active'
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
            insert into public.brick_versions (brick_id, version, payload, origin, created_by)
            values (cast(:brick as uuid), 1, '{}'::jsonb, 'tutor', 'tutor')
            returning id::text as id
            """,
            brick=brick_id,
        )
        items.append(
            {
                "brickId": brick_id,
                "brickVersionId": version_id,
                "points": 50,
                "notionId": notion_id,
                "notionLabel": f"Notion {index + 1}",
                "type": "choice_question",
                "payload": {},
            }
        )
    activity_id = await identifier(
        conn,
        """
        insert into public.activities (owner_id, formation_id, module_id, kind, config, items, status)
        values (
          cast(:user as uuid), cast(:formation as uuid), cast(:module as uuid),
          'validation_quiz', cast(:config as jsonb), cast(:items as jsonb), 'ready'
        )
        returning id::text as id
        """,
        user=user_id,
        formation=formation_id,
        module=module_id,
        config=json.dumps({"threshold": 80}),
        items=json.dumps(items),
    )
    attempt_id = await identifier(
        conn,
        """
        insert into public.attempts (
          user_id, activity_id, attempt_no, status, started_at, submitted_at,
          score, passed, per_notion, duration_ms
        ) values (
          cast(:user as uuid), cast(:activity as uuid), 1,
          cast(:status as public.attempt_status),
          cast('2026-11-11T12:00:00Z' as timestamptz),
          cast('2026-11-11T12:10:00Z' as timestamptz),
          :score, :passed, cast(:per_notion as jsonb), 600000
        )
        returning id::text as id
        """,
        user=user_id,
        activity=activity_id,
        status=status,
        score=score,
        passed=passed,
        per_notion=json.dumps(per_notion or {}),
    )
    version_ids = [item["brickVersionId"] for item in items]
    for index, is_correct in enumerate(correct):
        await conn.execute(
            text(
                """
                insert into public.answers (
                  attempt_id, brick_version_id, position, response, is_correct,
                  score, max_score, graded_by, feedback
                ) values (
                  cast(:attempt as uuid), cast(:version as uuid), :position,
                  cast(:response as jsonb), :correct, :score, 50, 'code', '{}'::jsonb
                )
                """
            ),
            {
                "attempt": attempt_id,
                "version": version_ids[index],
                "position": index + 1,
                "response": json.dumps({"optionIds": ["a"]}),
                "correct": is_correct,
                "score": 50 if is_correct else 0,
            },
        )
    return {
        "userId": user_id,
        "formationId": formation_id,
        "moduleId": module_id,
        "attemptId": attempt_id,
        "notionIds": notion_ids,
    }


async def test_a_running_attempt_shows_a_provisional_score(database: Database) -> None:
    async def run(tx: Any) -> dict[str, Any]:
        seed = await seed_graded_attempt(
            tx.conn, status="in_progress", score=None, passed=None, correct=(True, None)
        )
        return await service.get_quiz_result(
            assessment_deps(tx), actor_for(seed["userId"]), seed["attemptId"]
        )

    dto = await rolled_back(database, run)
    parsed = QuizAttemptsResultOutput.model_validate(dto)
    assert parsed.status == "in_progress"
    assert parsed.score is None
    assert parsed.passed is None
    assert float(parsed.provisionalScore or 0) == 100
    assert parsed.history == []
    assert parsed.pendingOpenCount == 1
    assert parsed.retry.allowed is True
    assert parsed.isLastModule is False
    assert parsed.nextModule is not None
    assert parsed.nextModule.position == 2


async def test_a_failed_attempt_lists_the_gaps_and_the_missing_points(database: Database) -> None:
    async def run(tx: Any) -> dict[str, Any]:
        seed = await seed_graded_attempt(tx.conn, score=79.17, passed=False)
        for position, notion_id in enumerate(seed["notionIds"], start=1):
            await create_notion_state(
                tx.conn,
                seed["userId"],
                notion_id,
                gap_nature="confusion" if position == 1 else None,
                in_review=False,
            )
            await tx.conn.execute(
                text(
                    "update public.notion_states set mastery = :mastery "
                    "where user_id = cast(:user as uuid) and notion_id = cast(:notion as uuid)"
                ),
                {"mastery": 40 if position == 1 else 90, "user": seed["userId"], "notion": notion_id},
            )
        await tx.conn.execute(
            text(
                "update public.notion_states set gap_evidence = 'Confondue avec le compte de capital.' "
                "where notion_id = cast(:notion as uuid)"
            ),
            {"notion": seed["notionIds"][0]},
        )
        return await service.get_quiz_result(
            assessment_deps(tx), actor_for(seed["userId"]), seed["attemptId"]
        )

    dto = await rolled_back(database, run)
    parsed = QuizAttemptsResultOutput.model_validate(dto)
    assert parsed.status == "graded"
    assert parsed.passed is False
    assert float(parsed.score or 0) == 79.17
    # CL-11: the gap to the threshold is rounded up on the unrounded score.
    assert parsed.pointsMissing == 1
    assert len(parsed.gaps) == 1
    gap = parsed.gaps[0]
    assert gap.nature == "confusion"
    assert gap.natureLabel == "Confusion"
    assert gap.evidence == "Confondue avec le compte de capital."
    assert gap.proposal == "une question qui oppose les deux notions."
    assert gap.mastery == 40
    assert gap.trainHref.startswith("/formations/")
    assert [notion.label for notion in parsed.mastered] == ["Notion 2"]
    assert parsed.remediation.status == "none"
    assert parsed.remediation.href is None


async def test_a_passed_attempt_shows_every_gap_and_the_history(database: Database) -> None:
    async def run(tx: Any) -> dict[str, Any]:
        seed = await seed_graded_attempt(
            tx.conn,
            score=100,
            passed=True,
            per_notion={
                seed_notion: {"correct": 1, "total": 1, "score": 100}
                for seed_notion in ["00000000-0000-0000-0000-000000000000"]
            },
        )
        for notion_id in seed["notionIds"]:
            await create_notion_state(tx.conn, seed["userId"], notion_id, in_review=False)
            await tx.conn.execute(
                text(
                    "update public.notion_states set mastery = 90 "
                    "where user_id = cast(:user as uuid) and notion_id = cast(:notion as uuid)"
                ),
                {"user": seed["userId"], "notion": notion_id},
            )
        return await service.get_quiz_result(
            assessment_deps(tx), actor_for(seed["userId"]), seed["attemptId"]
        )

    dto = await rolled_back(database, run)
    parsed = QuizAttemptsResultOutput.model_validate(dto)
    assert parsed.passed is True
    assert parsed.pointsMissing is None
    assert [(entry.attemptNo, entry.score, entry.passed) for entry in parsed.history] == [(1, 100.0, True)]
    assert [notion.label for notion in parsed.mastered] == ["Notion 1", "Notion 2"]


async def test_the_retry_gate_reads_the_frozen_action(database: Database) -> None:
    async def run(tx: Any) -> tuple[dict[str, Any], dict[str, Any]]:
        seed = await seed_graded_attempt(tx.conn, score=60, passed=False)
        await one(
            tx.conn,
            """
            insert into public.automation_actions (
              user_id, formation_id, automation, kind, status, summary, payload
            ) values (
              cast(:user as uuid), cast(:formation as uuid), 'remediation',
              'remediation_ready', 'applied', 'Remediation prete', cast(:payload as jsonb)
            )
            returning id::text as id
            """,
            user=seed["userId"],
            formation=seed["formationId"],
            payload=json.dumps(
                {
                    "moduleId": seed["moduleId"],
                    "attemptId": seed["attemptId"],
                    "mode": "mandatory",
                    "retryAvailableAt": "2026-11-12T12:20:00Z",
                    "remediationActivityId": "00000000-0000-0000-0000-000000000001",
                }
            ),
        )
        deps = assessment_deps(tx)
        actor = actor_for(seed["userId"])
        first = await service.get_quiz_result(deps, actor, seed["attemptId"])
        return first, first["retry"]

    dto, gate = await rolled_back(database, run)
    parsed = QuizAttemptsResultOutput.model_validate(dto)
    assert gate["allowed"] is False
    assert gate["reason"] == "delay"
    assert gate["remediationRequired"] is True
    assert gate["remediationDone"] is False
    assert parsed.retry.availableAt == "2026-11-12T12:20:00.000Z"


async def test_the_retry_guard_renders_the_delay_in_the_learner_zone(database: Database) -> None:
    async def run(tx: Any) -> AppError:
        seed = await seed_graded_attempt(tx.conn, score=60, passed=False)
        await tx.conn.execute(
            text(
                "update public.attempts set submitted_at = cast('2026-11-11T10:20:00Z' as timestamptz) "
                "where id = cast(:attempt as uuid)"
            ),
            {"attempt": seed["attemptId"]},
        )
        from learny.assessments.application import retry_gate as gate_service

        with pytest.raises(AppError) as error:
            await gate_service.check_retry_allowed(
                assessment_deps(tx), actor_for(seed["userId"]), seed["moduleId"]
            )
        return error.value

    error = await rolled_back(database, run)
    assert error.code == "RETRY_NOT_YET_ALLOWED"
    assert error.status == 422
    assert error.extra["reason"] == "delay"
    # Submitted at 10:20 UTC, the default 24 h delay ends at 11:20 in Paris the next day.
    assert error.detail == "Nouvelle tentative possible jeudi 12 nov., 11:20."


async def test_another_learner_sees_no_result(database: Database) -> None:
    async def run(tx: Any) -> str:
        seed = await seed_graded_attempt(tx.conn, score=60, passed=False)
        bob = await create_user(tx.conn, "Bob", timezone="Europe/Paris")
        with pytest.raises(AppError) as error:
            await service.get_quiz_result(assessment_deps(tx), actor_for(bob), seed["attemptId"])
        return error.value.code

    assert await rolled_back(database, run) == "NOT_FOUND"
