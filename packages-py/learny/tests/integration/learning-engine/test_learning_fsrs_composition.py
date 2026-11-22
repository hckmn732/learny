"""[SPEC-2202] Composition of the FSRS scheduler and the automatic grade (SPEC-402, CA-2 to CA-4).

Ported from `packages/learning-engine/test/integration/fsrs.test.ts`: the personal median, the grade
decision, the card update and the preview are chained with the `ENGINE.fsrs` bounds.
"""

from typing import Any

import pytest
from factories.learning_support import REFERENCE_NOW, at_days_before, build_answer, build_card
from learny.learning.domain.fsrs import (
    GradeSettings,
    TimedResponse,
    apply_review,
    create_notion_card,
    grade_review,
    preview_grades,
)
from learny.learning.domain.params import ENGINE
from learny.learning.domain.types import FSRS_RATINGS

pytestmark = pytest.mark.spec("SPEC-2202")

RETENTIONS = (0.85, 0.9, 0.95)


def settings() -> GradeSettings:
    """`ENGINE.fsrs` as the typed bounds of the grading."""
    values = ENGINE["fsrs"]
    return GradeSettings(
        median_window=values["medianWindow"],
        median_min_samples=values["medianMinSamples"],
        default_median_ms=values["defaultMedianMs"],
        hard_factor=values["hardFactor"],
        easy_factor=values["easyFactor"],
    )


def typed(answers: list[dict[str, Any]]) -> list[TimedResponse]:
    """The stored answers as the personal median reads them."""
    return [
        TimedResponse(
            answered_at=str(answer["answeredAt"]),
            format=str(answer["format"]),
            time_ms=float(answer["timeMs"]),
            answer_id=str(answer["answerId"]),
        )
        for answer in answers
    ]


def history(size: int = 6) -> list[TimedResponse]:
    return typed(
        [
            build_answer(
                answerId=f"answer-{index}",
                timeMs=20_000,
                answeredAt=at_days_before(REFERENCE_NOW, size - index),
            )
            for index in range(size)
        ]
    )


def deployment_answers() -> list[TimedResponse]:
    """Answers of the reference learner, oldest first, built with the shared fixtures."""
    return typed(
        [
            build_answer(answerId="a-1", timeMs=18_000, answeredAt=at_days_before(REFERENCE_NOW, 5)),
            build_answer(answerId="a-2", timeMs=20_000, answeredAt=at_days_before(REFERENCE_NOW, 4)),
            build_answer(answerId="a-3", timeMs=22_000, answeredAt=at_days_before(REFERENCE_NOW, 3)),
            build_answer(answerId="a-4", timeMs=20_000, answeredAt=at_days_before(REFERENCE_NOW, 2)),
            build_answer(answerId="a-5", timeMs=20_000, answeredAt=at_days_before(REFERENCE_NOW, 1)),
        ]
    )


def test_the_history_the_grade_the_update_and_the_preview_are_chained() -> None:
    decisions = deployment_answers()
    decision = grade_review(
        correct=True,
        time_ms=9_000,
        format_name="choice_question",
        history=decisions,
        settings=settings(),
    )
    assert decision.median_ms == 20_000
    assert decision.rating == "easy"

    card = create_notion_card(REFERENCE_NOW, ENGINE["fsrs"]["requestRetention"])
    preview = preview_grades(card, REFERENCE_NOW, ENGINE["fsrs"]["requestRetention"])
    assert list(preview) == ["again", "hard", "good", "easy"]

    rating = decision.rating or "good"
    applied, due_at = apply_review(card, rating, REFERENCE_NOW, ENGINE["fsrs"]["requestRetention"])
    assert due_at == preview[rating]
    assert applied.due == preview[rating]
    assert card.to_dict() == build_card(due=REFERENCE_NOW)


def test_a_recall_card_uses_the_rating_chosen_by_the_learner() -> None:
    answer = build_answer(format="recall_card", correct=None, timeMs=0, selfRating="hard")
    decided = grade_review(
        correct=None,
        time_ms=0,
        format_name="recall_card",
        history=history(),
        self_rating=str(answer["selfRating"]),
        settings=settings(),
    )
    assert decided.rating == "hard"

    incomplete = grade_review(
        correct=None,
        time_ms=0,
        format_name="recall_card",
        history=history(),
        settings=settings(),
    )
    assert incomplete.rating is None
    assert incomplete.reason == "incomplete"


def test_every_retention_and_every_rating_keep_the_same_due_dates() -> None:
    card = create_notion_card(REFERENCE_NOW, ENGINE["fsrs"]["requestRetention"])
    before = card.to_dict()
    for retention in RETENTIONS:
        preview = preview_grades(card, REFERENCE_NOW, retention)
        for rating in FSRS_RATINGS:
            _updated, due_at = apply_review(card, rating, REFERENCE_NOW, retention)
            assert due_at == preview[rating]
        assert preview_grades(card, REFERENCE_NOW, retention) == preview
    assert card.to_dict() == before


def test_repetition_is_invariant_and_factory_cards_are_accepted() -> None:
    card = build_card()
    first_preview = preview_grades(card, REFERENCE_NOW, 0.9)
    first_applied = apply_review(card, "good", REFERENCE_NOW, 0.9)
    for _index in range(5):
        assert preview_grades(card, REFERENCE_NOW, 0.9) == first_preview
        assert apply_review(card, "good", REFERENCE_NOW, 0.9) == first_applied
    assert card == build_card()


def test_invalid_answers_and_other_formats_are_ignored_by_the_median() -> None:
    answers = [
        *history(5),
        *typed(
            [
                build_answer(answerId="zero", timeMs=0, answeredAt=at_days_before(REFERENCE_NOW, 7)),
                build_answer(answerId="negative", timeMs=-1_000, answeredAt=at_days_before(REFERENCE_NOW, 8)),
                build_answer(
                    answerId="cloze",
                    format="cloze",
                    timeMs=90_000,
                    answeredAt=at_days_before(REFERENCE_NOW, 9),
                ),
            ]
        ),
    ]
    decision = grade_review(
        correct=True,
        time_ms=20_000,
        format_name="choice_question",
        history=answers,
        settings=settings(),
    )
    assert decision.median_ms == 20_000
    assert decision.rating == "good"
