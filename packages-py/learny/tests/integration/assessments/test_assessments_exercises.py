"""[SPEC-2202] Read model, attempts, hints and draft of a practice exercise (SPEC-613).

Port of the useful cases of `packages/services/src/exercises/{get-practice-exercise,attempt-service}.ts`:
the exercise of another learner or of another module is absent, the single in-progress attempt is
resumed, the two hints are revealed one by one and the draft is stored without correction.
"""

from typing import Any

import pytest
from factories.assessments_deps import assessment_deps
from factories.db_support import rolled_back
from factories.exercise_support import seed_exercise, valid_submission
from factories.identity_support import actor_for, count, create_user, one
from learny.assessments.application import exercises as service
from learny.shared.db.uow import Database
from learny.shared.errors import AppError
from learny_api.generated.models import (
    ExercisesDetailOutput,
    ExercisesHintOutput,
    ExercisesSaveDraftOutput,
    ExercisesStartOutput,
)

pytestmark = pytest.mark.spec("SPEC-2202")


async def test_detail_reads_the_instruction_and_an_empty_attempt(database: Database) -> None:
    async def run(tx: Any) -> Any:
        alice = await create_user(tx.conn, "Alice", timezone="Europe/Paris")
        seed = await seed_exercise(tx.conn, alice)
        return seed, await service.get_practice_exercise(
            assessment_deps(tx),
            actor_for(alice),
            seed["formationId"],
            seed["moduleId"],
            seed["activityId"],
        )

    seed, result = await rolled_back(database, run)
    parsed = ExercisesDetailOutput.model_validate(result)
    assert parsed.exerciseId == seed["activityId"]
    assert parsed.instruction.title == "Balance a simple entry"
    assert parsed.attempt is None
    assert parsed.mastery == 0
    assert parsed.hintsUsed == 0
    assert parsed.hintsLeft == 2
    assert parsed.maxScore == 10
    assert parsed.revealedHints == []
    assert parsed.gapNature is None
    assert len(parsed.instruction.hints) == 2


async def test_detail_hides_another_learner_or_another_module(database: Database) -> None:
    async def run(tx: Any) -> tuple[str, str]:
        alice = await create_user(tx.conn, "Alice", timezone="Europe/Paris")
        bob = await create_user(tx.conn, "Bob", timezone="Europe/Paris")
        seed = await seed_exercise(tx.conn, bob)
        cases = (
            (alice, seed["moduleId"]),
            (bob, "00000000-0000-4000-8000-000000000000"),
        )
        codes: list[str] = []
        for actor, module_id in cases:
            with pytest.raises(AppError) as refused:
                await service.get_practice_exercise(
                    assessment_deps(tx),
                    actor_for(actor),
                    seed["formationId"],
                    module_id,
                    seed["activityId"],
                )
            codes.append(refused.value.code)
        return codes[0], codes[1]

    foreign_code, module_code = await rolled_back(database, run)
    assert foreign_code == "NOT_FOUND"
    assert module_code == "NOT_FOUND"


async def test_start_creates_then_resumes_the_single_attempt(database: Database) -> None:
    async def run(tx: Any) -> Any:
        alice = await create_user(tx.conn, "Alice", timezone="Europe/Paris")
        seed = await seed_exercise(tx.conn, alice)
        first = await service.start_exercise_attempt(
            assessment_deps(tx), actor_for(alice), seed["activityId"], seed["moduleId"]
        )
        second = await service.start_exercise_attempt(
            assessment_deps(tx), actor_for(alice), seed["activityId"], seed["moduleId"]
        )
        attempts = await count(
            tx.conn,
            "select count(*)::int as count from public.attempts where activity_id = cast(:a as uuid)",
            a=seed["activityId"],
        )
        return first, second, attempts

    first, second, attempts = await rolled_back(database, run)
    parsed = ExercisesStartOutput.model_validate(first)
    assert parsed.status == "in_progress"
    assert parsed.hintsUsed == 0
    assert parsed.maxScore == 10
    assert second["attemptId"] == first["attemptId"]
    assert attempts == 1


async def test_hint_reveals_two_hints_and_refuses_the_third(database: Database) -> None:
    async def run(tx: Any) -> Any:
        alice = await create_user(tx.conn, "Alice", timezone="Europe/Paris")
        seed = await seed_exercise(tx.conn, alice)
        first = await service.request_exercise_hint(
            assessment_deps(tx), actor_for(alice), seed["activityId"], seed["moduleId"]
        )
        second = await service.request_exercise_hint(
            assessment_deps(tx), actor_for(alice), seed["activityId"], seed["moduleId"]
        )
        with pytest.raises(AppError) as refused:
            await service.request_exercise_hint(
                assessment_deps(tx), actor_for(alice), seed["activityId"], seed["moduleId"]
            )
        stored = await one(
            tx.conn,
            "select hints_used from public.attempts where id = cast(:a as uuid)",
            a=first["attemptId"],
        )
        return first, second, refused.value, stored

    first, second, refused, stored = await rolled_back(database, run)
    assert ExercisesHintOutput.model_validate(first).hintText == (
        "Which account increases when supplies are bought?"
    )
    assert first["hintIndex"] == 1
    assert first["hintsLeft"] == 1
    assert first["maxScore"] == 9
    assert ExercisesHintOutput.model_validate(second).hintsUsed == 2
    assert second["maxScore"] == 8
    assert refused.code == "RESPONSE_INVALID"
    assert refused.status == 422
    assert stored["hints_used"] == 2


async def test_draft_is_stored_without_correction_and_replays(database: Database) -> None:
    async def run(tx: Any) -> Any:
        alice = await create_user(tx.conn, "Alice", timezone="Europe/Paris")
        seed = await seed_exercise(tx.conn, alice)
        first = await service.save_exercise_draft(
            assessment_deps(tx), actor_for(alice), seed["activityId"], valid_submission()
        )
        second = await service.save_exercise_draft(
            assessment_deps(tx),
            actor_for(alice),
            seed["activityId"],
            {**valid_submission(), "explanation": "A second draft explanation, still long enough."},
        )
        answer = await one(
            tx.conn,
            """
            select count(*)::int as total,
                   bool_and(is_correct is null) as uncorrected,
                   (select response from public.answers
                     where attempt_id = cast(:a as uuid) limit 1) as response
              from public.answers
             where attempt_id = cast(:a as uuid)
            """,
            a=first["attemptId"],
        )
        return first, second, answer

    first, second, answer = await rolled_back(database, run)
    assert ExercisesSaveDraftOutput.model_validate(first).attemptId == first["attemptId"]
    assert second["attemptId"] == first["attemptId"]
    assert answer["total"] == 1
    assert answer["uncorrected"] is True
    assert answer["response"]["kind"] == "text"


async def test_draft_refuses_a_production_of_another_kind(database: Database) -> None:
    async def run(tx: Any) -> str:
        alice = await create_user(tx.conn, "Alice", timezone="Europe/Paris")
        seed = await seed_exercise(tx.conn, alice)
        with pytest.raises(AppError) as refused:
            await service.save_exercise_draft(
                assessment_deps(tx),
                actor_for(alice),
                seed["activityId"],
                {"kind": "link", "url": "https://example.test/rendu"},
            )
        return refused.value.code

    assert await rolled_back(database, run) == "VALIDATION_FAILED"


async def test_draft_keeps_the_stored_production_readable(database: Database) -> None:
    async def run(tx: Any) -> Any:
        alice = await create_user(tx.conn, "Alice", timezone="Europe/Paris")
        seed = await seed_exercise(tx.conn, alice)
        await service.save_exercise_draft(
            assessment_deps(tx), actor_for(alice), seed["activityId"], valid_submission()
        )
        detail = await service.get_practice_exercise(
            assessment_deps(tx),
            actor_for(alice),
            seed["formationId"],
            seed["moduleId"],
            seed["activityId"],
        )
        stored = await one(
            tx.conn,
            "select response from public.answers where attempt_id = cast(:a as uuid)",
            a=detail["attempt"]["attemptId"],
        )
        return detail, stored

    detail, stored = await rolled_back(database, run)
    parsed = ExercisesDetailOutput.model_validate(detail)
    assert parsed.attempt is not None
    assert parsed.attempt.submission is not None
    assert parsed.attempt.submission.kind == "text"
    assert parsed.attempt.correction is None
    assert stored["response"]["kind"] == "text"
