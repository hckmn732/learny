"""[SPEC-2202] Composition of the weighted mastery (SPEC-403, CA-1 to CA-4).

The engine is composed with the `ENGINE.mastery` bounds of the configuration package, and the stored
answer is projected onto the narrow mastery contract exactly like the service does.
"""

import math
from typing import Any

import pytest
from factories.learning_support import REFERENCE_NOW, at_days_before, build_answer, mastery_answer
from learny.learning.domain.errors import EngineError
from learny.learning.domain.mastery import (
    DEFAULT_MASTERY_HALF_LIFE_DAYS,
    DEFAULT_MASTERY_THRESHOLD,
    calculate_mastery,
)
from learny.learning.domain.params import ENGINE

pytestmark = pytest.mark.spec("SPEC-2202")

FOURTEEN_DAYS_AGO = "2026-10-28T12:20:00.000Z"


def recorded(
    answer_id: str, attempt_id: str, score: float, max_score: float, answered_at: str
) -> dict[str, Any]:
    """A stored answer, built by the shared factory."""
    return build_answer(
        answerId=answer_id,
        attemptId=attempt_id,
        score=score,
        maxScore=max_score,
        answeredAt=answered_at,
    )


def compute(answers: list[dict[str, Any]]) -> Any:
    return calculate_mastery(
        answers,
        REFERENCE_NOW,
        ENGINE["mastery"]["threshold"],
        ENGINE["mastery"]["halfLifeDays"],
    )


def test_the_engine_and_the_configuration_bounds_are_composed() -> None:
    assert ENGINE["mastery"]["threshold"] == DEFAULT_MASTERY_THRESHOLD
    assert ENGINE["mastery"]["halfLifeDays"] == DEFAULT_MASTERY_HALF_LIFE_DAYS

    answers = [
        mastery_answer(recorded("a-old", "t-old", 1, 1, FOURTEEN_DAYS_AGO)),
        mastery_answer(recorded("a-recent", "t-recent", 0, 1, REFERENCE_NOW)),
    ]
    result = compute(answers)
    assert result.threshold == 80
    assert math.isclose(result.mastery, 100 / 3, rel_tol=0, abs_tol=5e-11)
    assert result.mastered is False

    # 20/25 = 0.8 exactly reaches the configured 80 % threshold.
    at_threshold = compute([mastery_answer(recorded("a-20", "t-20", 20, 25, REFERENCE_NOW))])
    assert math.isclose(at_threshold.mastery, 80, rel_tol=0, abs_tol=5e-13)
    assert at_threshold.mastered is True

    below = compute([mastery_answer(recorded("a-19", "t-19", 19.999, 25, REFERENCE_NOW))])
    assert below.mastery < 80
    assert below.mastered is False


def test_repetition_and_composition_order_change_nothing() -> None:
    answers = [
        mastery_answer(recorded("a-old", "t-old", 1, 1, FOURTEEN_DAYS_AGO)),
        mastery_answer(recorded("a-mid", "t-mid", 2, 4, "2026-11-10T12:20:00.000Z")),
        mastery_answer(recorded("a-recent", "t-recent", 3, 4, REFERENCE_NOW)),
    ]
    first = compute(answers)
    frozen = [dict(answer) for answer in answers]
    assert compute(answers).to_dict() == first.to_dict()
    assert compute(list(reversed(answers))).to_dict() == first.to_dict()
    assert answers == frozen
    assert 0 <= first.mastery <= 100


def test_an_empty_history_and_a_future_answer_follow_the_contracts() -> None:
    empty = compute([])
    assert empty.mastery == 0
    assert empty.mastered is False
    assert empty.answer_count == 0
    assert empty.weight_sum == 0
    assert empty.weighted_score == 0
    assert empty.weights == ()

    future = mastery_answer(recorded("a-future", "t-future", 1, 1, "2026-11-11T12:20:00.001Z"))
    with pytest.raises(EngineError) as refused:
        compute([future])
    assert refused.value.code == "INVALID_INPUT"
    assert refused.value.path == "answers.0.answeredAt"


def test_the_factory_instant_helper_stays_deterministic() -> None:
    assert at_days_before(REFERENCE_NOW, 14) == FOURTEEN_DAYS_AGO.replace("12:20", "09:00")
